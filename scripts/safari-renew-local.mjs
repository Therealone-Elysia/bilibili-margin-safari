// Renew the already-installed personal Safari build; no account login or uploads.
import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const extensionOf = app => join(app, 'Contents/PlugIns/MARGIN Extension.appex');
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${basename(command)} 失败：${result.stderr.trim() || result.stdout.trim()}`);
  return { stdout: result.stdout, stderr: result.stderr };
};
const signature = app => {
  const result = run('/usr/bin/codesign', ['-d', '--verbose=4', app]);
  const text = result.stdout + result.stderr;
  const team = text.match(/^TeamIdentifier=(\w+)$/m)?.[1];
  if (!/^Authority=Apple Development:/m.test(text) || !team || team === 'not') {
    throw new Error('仅支持已使用 Apple Development 证书签名的本机版，请先完成首次签名。');
  }
  return { team, hash: text.match(/^CDHash=(\w+)$/m)?.[1] };
};
const certificateInfo = bytes => {
  const cert = new X509Certificate(bytes);
  return {
    fingerprint: cert.fingerprint.replaceAll(':', '').toUpperCase(),
    team: cert.subject.match(/(?:^|\n)OU=([^\n]+)/)?.[1],
    from: Date.parse(cert.validFrom), until: Date.parse(cert.validTo),
  };
};

// A signature made again with the same certificate does not extend its expiry.
export function planRenewal(current, candidates, now = Date.now(), days = 30, requested) {
  if (current.until - now > days * DAY) return { action: 'healthy' };
  const eligible = candidates.filter(cert => cert.team === current.team && cert.from <= now
    && cert.until - now > days * DAY && cert.until > current.until
    && (!requested || cert.fingerprint === requested.toUpperCase()));
  eligible.sort((a, b) => b.until - a.until || a.fingerprint.localeCompare(b.fingerprint));
  return eligible.length ? { action: 'renew', certificate: eligible[0] } : { action: 'needs-certificate' };
}

// Keep the previous app until the replacement passes validation; restore on error.
export async function replaceBundle(target, candidate, previous, validate) {
  await rename(target, previous);
  let replaced = false;
  try {
    await rename(candidate, target);
    replaced = true;
    await validate(target);
  } catch (error) {
    try {
      if (replaced) await rm(target, { recursive: true, force: true });
      await rename(previous, target);
    } catch (rollbackError) {
      error.rollbackFailed = true;
      error.message += `\n恢复旧版失败，保留旧版于 ${previous}：${rollbackError.message}`;
    }
    throw error;
  }
}

function options(argv) {
  const config = { mode: 'check', app: '/Applications/MARGIN Safari.app', days: 30,
    backups: join(homedir(), 'Library/Application Support/MARGIN Safari/Backups') };
  let modeSet = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (arg === '--check' || arg === '--renew') {
      if (modeSet) throw new Error('只能指定一种操作：--check 或 --renew');
      config.mode = arg.slice(2); modeSet = true;
    } else if (['--app', '--backups', '--days'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少参数`);
      config[arg.slice(2)] = arg === '--days' ? Number(value) : resolve(value);
    } else throw new Error(`未知参数：${arg}`);
  }
  if (!Number.isInteger(config.days) || config.days < 1 || config.days > 180) {
    throw new Error('--days 必须是 1–180 之间的整数');
  }
  return config;
}

async function inspect(app, scratch) {
  const stat = await lstat(app);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !app.endsWith('.app')) throw new Error('安装路径必须为实际的 .app 文件夹，不能是符号链接');
  const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')]).stdout);
  const ext = extensionOf(app);
  const extInfo = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(ext, 'Contents/Info.plist')]).stdout);
  const manifest = JSON.parse(await readFile(join(ext, 'Contents/Resources/manifest.json'), 'utf8'));
  if (info.CFBundleName !== 'MARGIN Safari' || extInfo.CFBundleIdentifier !== `${info.CFBundleIdentifier}.Extension`
      || manifest.short_name !== 'MARGIN' || !manifest.browser_specific_settings?.safari) throw new Error('目标不是预期的 MARGIN Safari 应用');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', '=anchor apple generic', app]);
  const hostSignature = signature(app);
  const extSignature = signature(ext);
  if (hostSignature.team !== extSignature.team) throw new Error('宿主与扩展签名团队不一致');
  const certificates = [];
  for (const [index, bundle] of [app, ext].entries()) {
    const prefix = join(scratch, `certificate-${index}-`);
    run('/usr/bin/codesign', ['-d', `--extract-certificates=${prefix}`, bundle]);
    certificates.push(certificateInfo(await readFile(`${prefix}0`)));
  }
  if (certificates[0].fingerprint !== certificates[1].fingerprint
      || certificates[0].team !== hostSignature.team) throw new Error('宿主与扩展开发证书不一致');
  return { ...certificates[0], ...hostSignature };
}

function availableCertificates() {
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']).stdout;
  const hashes = new Set([...identities.matchAll(/\b([A-Fa-f0-9]{40})\s+"Apple Development:[^"]+"/g)].map(m => m[1].toUpperCase()));
  if (!hashes.size) return [];
  // Only public certificates are read. Private keys remain in Keychain.
  const pem = run('/usr/bin/security', ['find-certificate', '-a', '-p']).stdout;
  return [...pem.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)]
    .map(m => certificateInfo(m[0])).filter(cert => hashes.has(cert.fingerprint));
}

function assertStopped() {
  for (const name of ['Safari', 'MARGIN Safari']) {
    const result = spawnSync('/usr/bin/pgrep', ['-x', name], { encoding: 'utf8' });
    if (result.error || ![0, 1].includes(result.status)) throw new Error('无法确认应用是否退出，未修改安装版');
    if (result.status === 0) throw new Error(`请先完全退出 ${name}（⌘Q），再重新运行续签；脚本不会强制关闭应用。`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const config = options(argv);
  if (config.help) {
    console.log('MARGIN 本机续签：\n  --check  只检查（默认）\n  --renew  剩余 30 天内且有同团队新证书时，备份、续签并替换安装版\n  --app PATH  安装位置\n  --days N  提前检查天数，默认 30\n  --backups PATH  备份目录\n可选 SIGN_IDENTITY=新证书的 SHA-1 指纹。不创建证书、不上传文件、不修改 Safari 设置。');
    return;
  }
  if (process.platform !== 'darwin') throw new Error('此脚本仅适用于 macOS');
  const scratch = await mkdtemp(join(tmpdir(), 'margin-sign-check-'));
  try {
    const current = await inspect(config.app, scratch);
    console.log(`安装版证书到期：${new Date(current.until).toISOString().slice(0, 10)}；剩余 ${Math.ceil((current.until - Date.now()) / DAY)} 天。`);
    const plan = planRenewal(current, availableCertificates(), Date.now(), config.days, process.env.SIGN_IDENTITY);
    if (plan.action === 'healthy') { console.log(`暂不需要续签，安装版未改动。请在到期前 ${config.days} 天内重新运行。`); return; }
    if (plan.action === 'needs-certificate') {
      console.error('尚无同一团队、有效期更长且超过检查期限的新开发证书，安装版未改动。\n请在 Xcode → Settings → Apple Accounts/Accounts → Personal Team → Manage Certificates 创建 Apple Development 证书，再运行此脚本。若菜单不可用，可用 Personal Team 自动签名构建一个 macOS 项目。重新签原证书不能延长有效期。');
      process.exitCode = 2; return;
    }
    if (config.mode === 'check') {
      console.log(`可续签到 ${new Date(plan.certificate.until).toISOString().slice(0, 10)}。退出 Safari 和 MARGIN Safari 后，用 --renew 执行。安装版未改动。`); return;
    }
    assertStopped();
    const lock = join(dirname(config.app), '.margin-safari-renew.lock');
    try { await mkdir(lock, { mode: 0o700 }); } catch (error) {
      if (error.code === 'EEXIST') throw new Error(`已有续签任务或上次运行中断。请检查 ${lock}，勿同时运行。`);
      throw error;
    }
    let work;
    let preserve = false;
    try {
      work = await mkdtemp(join(dirname(config.app), '.margin-safari-renew-'));
      const candidate = join(work, basename(config.app));
      run('/usr/bin/ditto', ['--noextattr', '--norsrc', config.app, candidate]);
      const entitlements = [];
      for (const [index, bundle] of [config.app, extensionOf(config.app)].entries()) {
        const xml = run('/usr/bin/codesign', ['-d', '--entitlements', ':-', bundle]).stdout;
        const file = join(work, `entitlements-${index}.plist`);
        await writeFile(file, xml, { mode: 0o600 });
        run('/usr/bin/plutil', ['-lint', file]); entitlements.push(file);
      }
      console.log('开始签名；macOS 可能要求您在本机确认钥匙串访问，无需在聊天中提供密码。');
      for (const [bundle, file] of [[extensionOf(candidate), entitlements[1]], [candidate, entitlements[0]]]) {
        run('/usr/bin/xattr', ['-cr', bundle]);
        run('/usr/bin/codesign', ['--force', '--sign', plan.certificate.fingerprint, '--options', 'runtime', '--timestamp=none', '--entitlements', file, bundle]);
      }
      run('/usr/bin/xattr', ['-cr', candidate]);
      const validation = async app => {
        const signed = await inspect(app, scratch);
        if (signed.fingerprint !== plan.certificate.fingerprint || signed.team !== current.team) throw new Error('签名身份验证失败');
      };
      await validation(candidate);
      assertStopped();
      const unchanged = await inspect(config.app, scratch);
      if (unchanged.hash !== current.hash || unchanged.fingerprint !== current.fingerprint) throw new Error('安装版在续签期间发生变化，未替换');
      await mkdir(config.backups, { recursive: true, mode: 0o700 });
      const backup = join(config.backups, `MARGIN-Safari-${basename(work)}.zip`);
      run('/usr/bin/ditto', ['-c', '-k', '--keepParent', '--noextattr', '--norsrc', config.app, backup]);
      await chmod(backup, 0o600);
      await replaceBundle(config.app, candidate, join(work, 'previous.app'), validation);
      console.log(`续签并安装成功，到期日：${new Date(plan.certificate.until).toISOString().slice(0, 10)}。\n旧版备份：${backup}\n请重开 Safari 验证扩展。未改动扩展 ID、团队、网站授权或浏览器数据；Safari 可能仍要求系统确认。`);
    } catch (error) {
      preserve = !!error.rollbackFailed;
      throw error;
    } finally {
      if (work && !preserve) await rm(work, { recursive: true, force: true });
      await rm(lock, { recursive: true, force: true });
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`续签未完成：${error.message}`); process.exitCode = 1; });
}
