// Genera demo/dist/gestion-abonos-demo.html: un solo archivo que abres con doble clic, sin servidor, Azure ni SharePoint.
import * as esbuild from 'esbuild';
import * as sass from 'sass';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
let css = '';

const stubs = {
  name: 'stubs',
  setup(build) {
    build.onResolve({ filter: /^@microsoft\/sp-/ }, a => ({ path: a.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const AadHttpClient = { configurations: { v1: {} } }; export const SPHttpClient = { configurations: { v1: {} } };',
      loader: 'js'
    }));
    build.onLoad({ filter: /\.module\.scss$/ }, a => {
      const out = sass.compile(a.path, { style: 'compressed' }).css;
      css += out.replace(/:global\(([^)]+)\)/g, '$1').replace(/:global\s*/g, '');
      return { contents: 'export default { root: "root" };', loader: 'js' };
    });
  }
};

const result = await esbuild.build({
  entryPoints: [join(here, 'main.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'safari15', 'firefox100'],
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  external: ['fs', 'http', 'https', 'url', 'zlib', 'canvas', 'path2d-polyfill', 'stream'],
  plugins: [stubs],
  logLevel: 'warning'
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gestión de Abonos · Demo local</title>
<style>
html,body{margin:0;background:#E6ECEE;font-family:'Segoe UI',system-ui,sans-serif}
.demo-bar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 16px;background:#0A1C22;color:#B9C8CD;font-size:13px}
.demo-bar b{color:#6FD3DC;letter-spacing:.04em;text-transform:uppercase;font-size:12px}
.demo-bar label{display:flex;align-items:center;gap:8px;margin-left:auto;color:#fff}
.demo-bar select,.demo-bar button{height:32px;border-radius:7px;border:1px solid #2A3539;background:#16262c;color:#fff;padding:0 10px;font:inherit;cursor:pointer}
.demo-bar button:hover{background:#1f343b}
.demo-bar button.on{border-color:#2E9A57;color:#B6F0CB}
.demo-bar label{margin-left:auto}
.di-back{position:fixed;inset:0;z-index:1000;background:rgba(10,28,34,.55);display:flex;align-items:center;justify-content:center;padding:16px}
.di-dlg{background:#fff;color:#13191C;border-radius:14px;max-width:520px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:22px 22px 18px;box-shadow:0 24px 60px rgba(0,0,0,.3);font-size:14px;line-height:1.45}
.di-dlg h2{margin:0 0 6px;font-size:19px}.di-dlg p{margin:0 0 14px;color:#56626A}
.di-dlg label{display:flex;flex-direction:column;gap:5px;font-weight:600;font-size:13px;margin-bottom:12px}
.di-dlg input{height:42px;border:1px solid #E0E6E8;border-radius:8px;padding:0 12px;font:inherit;font-weight:400}
.di-dlg input:focus{outline:2px solid #6FD3DC;outline-offset:1px}
.di-dlg ul{margin:4px 0 16px;padding-left:18px;color:#56626A;font-size:12.5px}.di-dlg li{margin-bottom:4px}
.di-err{background:#FBE6E4;color:#94201A;border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:13px}
.di-ok{background:#E2F3E8;color:#185C33;border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:13px}
.di-acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.di-gap{flex:1}
.di-acts button{height:40px;border-radius:8px;padding:0 14px;font:inherit;font-weight:600;cursor:pointer}
.di-pri{background:#0F5E6E;color:#fff;border:0}.di-pri:disabled{opacity:.6;cursor:default}
.di-sec{background:#fff;color:#0B4B58;border:1px solid #E0E6E8}
@media (max-width:600px){.di-acts{flex-direction:column-reverse;align-items:stretch}.di-gap{display:none}}
@media (max-width:600px){.demo-bar{gap:8px;padding:8px 12px}.demo-bar>span{display:none}.demo-bar label{margin-left:auto}.demo-bar select{max-width:190px}}
#app{min-height:100vh;display:flex;flex-direction:column}.demo-frame{flex:1;display:flex;flex-direction:column;margin:0;padding:0}.demo-frame .root{flex:1;display:flex;flex-direction:column;border-radius:0}.demo-frame .ga{flex:1}
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>`;

mkdirSync(join(here, 'dist'), { recursive: true });
const out = join(here, 'dist', 'gestion-abonos-demo.html');
writeFileSync(out, html);
console.log('Demo lista:', out, `(${Math.round(html.length / 1024)} KB)`);
