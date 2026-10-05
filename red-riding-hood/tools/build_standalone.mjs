// Bundles the game into one self-contained HTML file, red-riding-hood.html,
// that works when opened straight from disk (double-click, no server):
// all code (three.js included) in one plain script, both models inline.
//   node tools/build_standalone.mjs
import fs from 'fs';
import path from 'path';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const vendor = path.join(root, 'vendor/three');

const result = await esbuild.build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2020',
  plugins: [{
    name: 'vendored-three',
    setup(b) {
      b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(vendor, 'three.module.js') }));
      b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(vendor, 'addons', a.path.slice('three/addons/'.length)) }));
    },
  }],
});
const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const assets = {};
for (const f of ['assets/models/jason.glb', 'assets/models/dummy.glb', ...fs.readdirSync(path.join(root, 'assets/models/enemies')).map((n) => `assets/models/enemies/${n}`)]) {
  assets[f] = fs.readFileSync(path.join(root, f)).toString('base64');
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
html = html.replace(/<script type="module" src="js\/main.js"><\/script>\n?/, '');
const tail = Object.entries(assets)
  .map(([k, v]) => `<script>(window.EMBEDDED_ASSETS = window.EMBEDDED_ASSETS || {})[${JSON.stringify(k)}] = "${v}";</script>\n`)
  .join('') + `<script>\n${code}\n</script>\n`;
html = html.replace('</body>', () => tail + '</body>'); // function form: the code contains $' and $& sequences
const out = path.join(root, 'red-riding-hood.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
