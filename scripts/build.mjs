import { build } from 'vite';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { transformRadii } from './radius.mjs';

const safari = process.argv.includes('--safari');
const outDir = safari ? 'dist-safari' : 'dist';
const target = safari ? 'safari18' : 'chrome110';
// Safari's isolated content world cannot reliably import extension URL modules.
// Bundle literal imports into its classic content script; keep Chromium/Firefox split.
const safariModules = {
  name: 'margin-safari-modules',
  enforce: 'pre',
  transform(code, id) {
    if (!safari) return null;
    if (id.endsWith('/src/content/main.ts')) {
      const loader = 'import(/* @vite-ignore */ chrome.runtime.getURL(`pages/${name}.js`))';
      if (!code.includes(loader)) throw new Error('Safari page loader needs updating');
      return code.replace(loader, `({${PAGES.map(p => `${JSON.stringify(p)}: () => import('./pages/${p}')`).join(',')}}[name]() as Promise<Pages[K]>)`);
    }
    if (id.endsWith('/src/content/bg/background.ts')) {
      return code.replace("import(/* @vite-ignore */ chrome.runtime.getURL('flux.js'))", "import('./flux/index')");
    }
    return null;
  },
};

// 圆角强度（v0.50，设置 → 布局与细节 → 圆角）：把 CSS 里所有 px / em 圆角改成乘 --margin-rk（html 上设置，默认 1）。
// 普通圆角使用浏览器原生 squircle；圆形和胶囊保留 round。不支持新属性的浏览器沿用 border-radius。
const radiusPlugin = {
  name: 'margin-radius',
  enforce: 'post',
  transform(code, id) {
    if (!/\.(css|ts)(\?|$)/.test(id) || !code.includes('radius')) return null;
    const out = transformRadii(code);
    return out === code ? null : { code: out, map: null };
  },
};

// 经典脚本（IIFE）：内容脚本入口、弹窗、后台 service worker
const entries = [
  { name: 'content', entry: 'src/content/main.ts' },
  { name: 'popup', entry: 'src/popup/popup.ts' },
  { name: 'background', entry: 'src/background/sw.ts' },
];
// 按路由动态 import 的页面模块（ES，共享代码自动拆成 pages/chunk-*.js）
const PAGES = ['home', 'watch', 'space', 'message', 'history', 'feed', 'detail', 'space-hooks', 'danmaku-jump', 'danmaku-airborne', 'channel-carousel', 'search-exact'];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const { name, entry } of entries) {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    plugins: [safariModules, wgslVitePlugin({ minify: { whitespace: true } }), radiusPlugin],
    build: {
      outDir,
      emptyOutDir: false,
      target,
      // WebKit's extension loader rejects the minified background on Safari 27.3,
      // even though JavaScriptCore accepts it. Keep this small script readable.
      minify: !(safari && name === 'background') && !process.env.NOMIN,
      lib: { entry, name: `margin_${name}`, formats: ['iife'], fileName: () => `${name}.js` },
    },
  });
}

if (!safari) await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  plugins: [wgslVitePlugin({ minify: { whitespace: true } }), radiusPlugin],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome110',
    minify: !process.env.NOMIN,
    lib: {
      entry: Object.fromEntries(PAGES.map((p) => [p, `src/content/pages/${p}.ts`])),
      formats: ['es'],
      fileName: (_f, name) => `pages/${name}.js`,
    },
    rolldownOptions: { output: { minify: !process.env.NOMIN, chunkFileNames: 'pages/chunk-[hash].js' } },
  },
});

// 流光（WebGPU / vgpu，约 200KB）单独打包，只有用户选到这款背景时才由内容脚本动态 import
if (!safari) await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  plugins: [wgslVitePlugin({ minify: { whitespace: true } }), radiusPlugin],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome113',
    minify: !process.env.NOMIN,
    lib: { entry: 'src/content/bg/flux/index.ts', formats: ['es'], fileName: () => 'flux.js' },
    rolldownOptions: { output: { minify: !process.env.NOMIN } },
  },
});

await cp('public', outDir, { recursive: true });
if (safari) {
  const manifest = JSON.parse(await readFile(`${outDir}/manifest.json`, 'utf8'));
  // A distinct version also invalidates Safari's cached extension resources.
  manifest.version += '.1';
  delete manifest.minimum_chrome_version;
  // Safari event pages reliably resume for messages after being suspended.
  manifest.background = { scripts: ['background.js'], persistent: false };
  manifest.browser_specific_settings = { safari: { strict_min_version: '18.0' } };
  // Safari has a smaller default quota; local background images can exceed it.
  manifest.permissions.push('unlimitedStorage');
  manifest.web_accessible_resources = [{ resources: ['fonts/*'], matches: ['https://*.bilibili.com/*'] }];
  await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
}
const popup = await readFile(`${outDir}/popup.html`, 'utf8');
await writeFile(`${outDir}/popup.html`, popup.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
  (_match, open, css, close) => open + transformRadii(css) + close));
console.log(`built → ${outDir}/`);
