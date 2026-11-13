// Sign only our generated Safari app, using an existing Apple Development identity.
// The candidate stays separate from both the installed app and public release ZIP.
import { cp, readFile, rm, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

if (process.platform !== 'darwin') throw new Error('Local Safari signing requires macOS');
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const run = (command, args, capture = false) => {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed${capture ? `: ${result.stderr.trim()}` : ''}`);
  return `${result.stdout || ''}${result.stderr || ''}`;
};
const identities = [...run('security', ['find-identity', '-v', '-p', 'codesigning'], true)
  .matchAll(/\b([A-Fa-f0-9]{40})\s+"(Apple Development:[^"]+)"/g)]
  .map(([, hash, name]) => ({ hash, name }));
const requested = process.env.SIGN_IDENTITY;
const eligible = requested ? identities.filter(id => id.hash === requested || id.name === requested) : identities;
if (eligible.length !== 1) {
  throw new Error(eligible.length
    ? 'Multiple Apple Development identities found. Set SIGN_IDENTITY to the intended certificate fingerprint.'
    : 'No valid Apple Development identity. Create one in Xcode > Settings > Accounts > Manage Certificates. Ad hoc signing is not a substitute.');
}
const identity = eligible[0];
const source = resolve('safari/build/MARGIN Safari.app');
const output = resolve('safari/local-build/MARGIN Safari.app');
const extension = join(output, 'Contents/PlugIns/MARGIN Extension.appex');
const manifest = JSON.parse(await readFile(join(source, 'Contents/PlugIns/MARGIN Extension.appex/Contents/Resources/manifest.json'), 'utf8'));
if (manifest.short_name !== 'MARGIN' || !manifest.browser_specific_settings?.safari) {
  throw new Error('Build the MARGIN Safari app first with npm run pack:safari');
}
await mkdir(resolve('safari/local-build'), { recursive: true });
await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });
console.log('macOS may request keychain permission separately for the extension and the app. Approve the signing prompts on your Mac.');
for (const [bundle, entitlements] of [[extension, 'Extension'], [output, 'App']]) {
  run('xattr', ['-cr', bundle]);
  run('codesign', ['--force', '--sign', identity.hash, '--options', 'runtime',
    '--entitlements', `safari/native/${entitlements}.entitlements`, bundle]);
}
// iCloud/Finder may attach bundle metadata while the keychain prompt is open.
// Removing this unsigned metadata preserves the signature's content hashes.
run('xattr', ['-cr', output]);
run('codesign', ['--verify', '--deep', '--strict', output]);
const teams = [extension, output].map(bundle => {
  const signature = run('codesign', ['-d', '--verbose=4', bundle], true);
  if (!/^Authority=Apple Development:/m.test(signature) || /^Signature=adhoc$/m.test(signature)) {
    throw new Error('Expected a certificate-backed Apple Development signature');
  }
  const team = signature.match(/^TeamIdentifier=(\w+)$/m)?.[1];
  if (!team || team === 'not') throw new Error('Missing signing team identifier');
  return team;
});
if (teams[0] !== teams[1]) throw new Error('Host app and extension signing teams differ');
console.log(`Apple Development signature verified for app and extension.\nLocal candidate: ${output}\nThis does not install the app or publish the personal signed build. Test with Allow unsigned extensions OFF, then restart Safari before claiming the issue is resolved.`);
