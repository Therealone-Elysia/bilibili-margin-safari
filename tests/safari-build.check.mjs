// Run with node --test, separately from the Vitest TypeScript suites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
const manifest = JSON.parse(await readFile(new URL('../dist-safari/manifest.json', import.meta.url), 'utf8'));
test('Safari package has supported isolated scripts and resolves all declared resources', async () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.browser_specific_settings.safari.strict_min_version, '18.0');
  assert.equal(manifest.minimum_chrome_version, undefined);
  for (const name of [...manifest.background.scripts, manifest.action.default_popup, ...manifest.content_scripts.flatMap(s => s.js), ...Object.values(manifest.icons)]) {
    await access(new URL(`../dist-safari/${name}`, import.meta.url));
  }
  assert(manifest.content_scripts.some(s => s.world === 'MAIN'));
  assert(manifest.content_scripts.some(s => s.js.includes('content.js') && !s.world));
});
test('content, background and popup are valid classic scripts without dynamic imports or eval', async () => {
  for (const name of ['content.js', 'background.js', 'popup.js']) {
    const code = await readFile(new URL(`../dist-safari/${name}`, import.meta.url), 'utf8');
    new Script(code, { filename: name });
    assert(!/\bimport\s*\(/.test(code), `${name} unexpectedly imports a module`);
    assert(!/\beval\s*\(/.test(code), `${name} contains eval`);
  }
});
