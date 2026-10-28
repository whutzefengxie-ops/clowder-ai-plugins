import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 只读消费宿主源码与既有预览工具。不链接 node_modules，不修改宿主、配置或用户数据。
const here = path.dirname(fileURLToPath(import.meta.url));
const host = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const dependencyRoot = path.resolve(process.argv[4] ?? host);
const web = path.join(host, 'packages/web');
const fixtures = path.join(web, 'test/browser/fixtures');
const requireHost = createRequire(path.join(dependencyRoot, 'package.json'));
const { build } = await import(pathToFileURL(requireHost.resolve('vite')).href);
const entry = path.join(here, 'FeedbackEntry.tsx').replaceAll('\\', '/');
const sourceFiles = ['WorldRail.tsx', 'ActivityBar.tsx'];
const touched = new Set();
const railPreviewInjection = {
  name: 'feedback-preview-rail-injection', enforce: 'pre',
  transform(code, id) {
    if (!sourceFiles.some(file => id.replaceAll('\\', '/').endsWith('/' + file))) return;
    const marker = '<div className="mt-auto flex flex-col items-center gap-1.5">';
    assert.equal(code.split(marker).length, 2, '真实侧栏挂载位置已变化，应重新核对');
    touched.add(path.basename(id));
    return { code: `import { FeedbackEntry } from ${JSON.stringify(entry)};\n` + code.replace(marker, marker + '\n<FeedbackEntry />'), map: null };
  },
};
const resolvePreviewDependencies = {
  name: 'feedback-preview-dependencies', enforce: 'pre',
  async resolveId(source, importer) {
    if (!importer || source.startsWith('.') || source.startsWith('/') || source.startsWith('\0') ||
      /^[A-Za-z]:/.test(source) || source.startsWith('@cat-cafe/') || source.startsWith('@/') || source === 'next/navigation') return;
    if (!importer.replaceAll('\\', '/').startsWith(host.replaceAll('\\', '/')) &&
      !importer.replaceAll('\\', '/').startsWith(here.replaceAll('\\', '/'))) return;
    try { const resolved = requireHost.resolve(source); return resolved === source ? null : resolved; }
    catch { return null; }
  },
};
const startedAt = process.cwd();
let result;
try {
  process.chdir(web);
  result = await build({
    root: web, configFile: false, logLevel: 'warn',
    cacheDir: path.join(output, '.vite-cache'),
    esbuild: { jsx: 'automatic' },
    plugins: [resolvePreviewDependencies, railPreviewInjection],
    css: { postcss: { plugins: [requireHost('tailwindcss')({config: path.join(web, 'tailwind.config.js')}), requireHost('autoprefixer')()] } },
    resolve: {
      alias: [
        { find: 'next/navigation', replacement: path.join(fixtures, 'f322-shell-navigation.ts') },
        { find: /^\.\/(?:ThreadSidebar|DesktopUpdatePrompt|listen-mode\/ListenModePlayer|story-player\/TheaterReplayHost|thread-chat|workspace\/FloatingPresentationSurfaceHost|workspace\/ResizeHandle|concierge\/ConciergeHost)$/, replacement: path.join(fixtures, 'f322-shell-boundaries.tsx') },
        { find: /^@\/(?:stores\/callbackAuthStore|services\/playbackRuntime|hooks\/useWorkspaceNavigate)$/, replacement: path.join(fixtures, 'f322-shell-boundaries.tsx') },
        { find: /^\.\.\/dev\/OklchTuner$/, replacement: path.join(fixtures, 'f322-settings-content.tsx') },
        { find: '@cat-cafe/ui/styles.css', replacement: path.join(host, 'packages/ui/src/styles.css') },
        { find: /^@cat-cafe\/ui$/, replacement: path.join(host, 'packages/ui/src/index.ts') },
        { find: /^@cat-cafe\/shared$/, replacement: path.join(host, 'packages/shared/src/index.ts') },
        { find: 'react-dom', replacement: path.join(dependencyRoot, 'node_modules/react-dom') },
        { find: 'react', replacement: path.join(dependencyRoot, 'node_modules/react') },
        { find: '@', replacement: path.join(web, 'src') },
      ],
    },
    define: { 'process.env.NEXT_PUBLIC_API_URL': JSON.stringify('https://feedback-preview.invalid') },
    build: { write: false, minify: false, rollupOptions: {
      input: path.join(here, 'fixture.tsx'), output: { format: 'es', inlineDynamicImports: true },
      onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE' && warning.code !== 'SOURCEMAP_ERROR') warn(warning); },
    } },
  });
} finally { process.chdir(startedAt); }
const outputs = Array.isArray(result) ? result.flatMap(item => item.output) : result.output;
const script = outputs.find(item => item.type === 'chunk' && item.isEntry);
assert.ok(script);
assert.equal(touched.size, 2, '两套真实侧栏都必须参与体验稿');
const css = outputs.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>问题反馈 · 体验稿</title><style>${css}</style></head><body><div id="root"></div><script type="module">${script.code.replaceAll('</script', '<\\/script')}</script></body></html>`, 'utf8');
await writeFile(path.join(output, 'build-receipt.json'), JSON.stringify({ kind: 'isolated-experience-prototype', hostSourceRoot: host, dependencyRoot, realShells: [...touched], productionIntegration: false, realDiagnostics: false, remoteWrites: false }, null, 2));
console.log(JSON.stringify({ output: path.join(output, 'index.html'), realShells: [...touched] }));
