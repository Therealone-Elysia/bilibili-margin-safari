// Build a real containing macOS app + Safari Web Extension using the macOS SDK.
// Xcode Command Line Tools suffice. Set SIGN_IDENTITY for a Developer ID build.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('Safari app packaging requires macOS. build:safari works on other platforms.');
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} failed (${result.status})`);
  return result;
};
const manifest = JSON.parse(await readFile('dist-safari/manifest.json', 'utf8'));
if (!manifest.browser_specific_settings?.safari) throw new Error('Run npm run build:safari first');
const bundleID = process.env.BUNDLE_ID || 'org.bilibili-margin.safari';
if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleID)) throw new Error('BUNDLE_ID must be a reverse-DNS identifier');
const build = resolve('safari/build');
const app = join(build, 'MARGIN Safari.app');
const ext = join(app, 'Contents/PlugIns/MARGIN Extension.appex');
await rm(app, { recursive: true, force: true });
for (const bundle of [app, ext]) {
  for (const dir of ['MacOS', 'Resources']) await mkdir(join(bundle, 'Contents', dir), { recursive: true });
}
await cp('dist-safari', join(ext, 'Contents/Resources'), { recursive: true });
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const plist = entries => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${Object.entries(entries).map(([key, value]) => `<key>${xml(key)}</key>${typeof value === 'object' ? value.raw : `<string>${xml(value)}</string>`}`).join('\n')}</dict></plist>\n`;
const common = {
  CFBundleDevelopmentRegion: 'en', CFBundleInfoDictionaryVersion: '6.0',
  CFBundleShortVersionString: manifest.version_name || manifest.version,
  CFBundleVersion: manifest.version.split('.')[3], LSMinimumSystemVersion: '14.0',
  NSHumanReadableCopyright: 'MARGIN © 2026 jiuyang5354. Safari port contributors. MIT license; see bundled notices.',
};
await writeFile(join(app, 'Contents/Info.plist'), plist({ ...common,
  CFBundleIdentifier: bundleID, CFBundleName: 'MARGIN Safari', CFBundleDisplayName: '映间 MARGIN · Safari',
  CFBundleExecutable: 'MARGIN Safari', CFBundlePackageType: 'APPL',
  CFBundleIconFile: 'AppIcon', NSPrincipalClass: 'NSApplication',
  NSHighResolutionCapable: { raw: '<true/>' },
}));
await writeFile(join(ext, 'Contents/Info.plist'), plist({ ...common,
  CFBundleIdentifier: `${bundleID}.Extension`, CFBundleName: 'MARGIN Extension',
  CFBundleDisplayName: '映间 MARGIN', CFBundleExecutable: 'MARGIN Extension', CFBundlePackageType: 'XPC!',
  NSExtension: { raw: '<dict><key>NSExtensionPointIdentifier</key><string>com.apple.Safari.web-extension</string><key>NSExtensionPrincipalClass</key><string>MarginWebExtensionHandler</string></dict>' },
}));
// Reuse the upstream icon; create a standard .icns with native tools.
const iconset = join(build, 'AppIcon.iconset');
await mkdir(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
    run('sips', ['-z', String(size * scale), String(size * scale), 'public/icons/128.png', '--out', join(iconset, name)], { stdio: 'ignore' });
  }
}
run('iconutil', ['-c', 'icns', iconset, '-o', join(app, 'Contents/Resources/AppIcon.icns')]);
for (const name of ['LICENSE', 'PRIVACY.md']) await cp(name, join(app, 'Contents/Resources', name));
await cp('docs', join(app, 'Contents/Resources/docs'), { recursive: true });
const archs = (process.env.SAFARI_ARCHS || 'arm64,x86_64').split(',');
if (archs.some(arch => !['arm64', 'x86_64'].includes(arch))) throw new Error('SAFARI_ARCHS accepts arm64,x86_64');
for (const [source, bundle, executable, extra] of [
  ['App.m', app, 'MARGIN Safari', ['-framework', 'Cocoa', '-framework', 'SafariServices']],
  ['Extension.m', ext, 'MARGIN Extension', ['-framework', 'Foundation', '-fapplication-extension', '-Wl,-e,_NSExtensionMain']],
]) {
  const slices = [];
  for (const arch of archs) {
    const output = join(build, `${source}.${arch}`);
    run('xcrun', ['clang', '-arch', arch, '-mmacosx-version-min=14.0', '-fobjc-arc', '-O2', '-Wall', '-Wextra', '-Wno-unused-parameter', `safari/native/${source}`, ...extra, '-o', output]);
    slices.push(output);
  }
  run('lipo', ['-create', ...slices, '-output', join(bundle, 'Contents/MacOS', executable)]);
}
const identity = process.env.SIGN_IDENTITY || '-';
// Copies from Finder/iCloud-backed folders can carry metadata rejected by codesign.
run('xattr', ['-cr', app]);
for (const [bundle, name] of [[ext, 'Extension'], [app, 'App']]) {
  run('xattr', ['-cr', bundle]);
  run('codesign', ['--force', '--sign', identity, '--options', 'runtime', ...(identity === '-' ? [] : ['--timestamp']), '--entitlements', `safari/native/${name}.entitlements`, bundle]);
}
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
const zip = resolve('margin-safari-macos.zip');
await rm(zip, { force: true });
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
console.log(`Built → ${app}\nArchive → ${zip}\nSigning: ${identity === '-' ? 'ad hoc (local development; allow unsigned extensions in Safari)' : identity}`);
