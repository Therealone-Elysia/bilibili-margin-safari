// Run with node --test; these checks do not access Keychain or installed apps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planRenewal, replaceBundle } from '../scripts/safari-renew-local.mjs';

const now = Date.UTC(2026, 10, 14);
const day = 86_400_000;
const cert = (days, extra = {}) => ({ from: now - day, until: now + days * day, team: 'TEAM1', fingerprint: 'AAA', ...extra });
test('healthy installation stays untouched even when a newer certificate exists', () => {
  assert.equal(planRenewal(cert(365), [cert(400)], now).action, 'healthy');
});
test('re-signing the same expiring certificate is not treated as renewal', () => {
  assert.equal(planRenewal(cert(20), [cert(20)], now).action, 'needs-certificate');
});
test('reject wrong-team, not-yet-valid, and insufficiently valid certificates', () => {
  assert.equal(planRenewal(cert(0), [cert(365, { team: 'OTHER' }), cert(366, { from: now + day }), cert(29)], now).action, 'needs-certificate');
});
test('can renew an expired installation with the newest same-team identity', () => {
  const newer = cert(365, { fingerprint: 'BBB' });
  assert.deepEqual(planRenewal(cert(-1), [cert(100), newer], now), { action: 'renew', certificate: newer });
});
test('explicit fingerprint cannot select an unrelated identity', () => {
  assert.equal(planRenewal(cert(20), [cert(365, { fingerprint: 'BBB' })], now, 30, 'AAA').action, 'needs-certificate');
});

async function bundles(t) {
  const dir = await mkdtemp(join(tmpdir(), 'margin-renew-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const target = join(dir, 'installed.app');
  const candidate = join(dir, 'candidate.app');
  const previous = join(dir, 'previous.app');
  for (const [path, contents] of [[target, 'original'], [candidate, 'renewed']]) {
    await mkdir(path); await writeFile(join(path, 'payload'), contents);
  }
  return { target, candidate, previous };
}
test('failed post-install validation restores the complete original app', async t => {
  const { target, candidate, previous } = await bundles(t);
  await assert.rejects(replaceBundle(target, candidate, previous, async () => { throw new Error('invalid signature'); }), /invalid signature/);
  assert.equal(await readFile(join(target, 'payload'), 'utf8'), 'original');
});
test('failed candidate rename also restores the original app', async t => {
  const { target, candidate, previous } = await bundles(t);
  await rm(candidate, { recursive: true });
  await assert.rejects(replaceBundle(target, candidate, previous, async () => {}));
  assert.equal(await readFile(join(target, 'payload'), 'utf8'), 'original');
});
test('successful validation retains the original until caller cleanup', async t => {
  const { target, candidate, previous } = await bundles(t);
  await replaceBundle(target, candidate, previous, async app => {
    assert.equal(await readFile(join(app, 'payload'), 'utf8'), 'renewed');
  });
  assert.equal(await readFile(join(previous, 'payload'), 'utf8'), 'original');
});
