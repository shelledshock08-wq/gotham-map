// Copies three.js and the addons the game imports (plus their own imports)
// from node_modules into vendor/three, so the game runs offline with no CDN.
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'node_modules/three');
const dst = path.join(root, 'vendor/three');
const ADDONS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'loaders/GLTFLoader.js', 'environments/RoomEnvironment.js', 'controls/OrbitControls.js',
  'utils/SkeletonUtils.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js', 'postprocessing/OutputPass.js', 'postprocessing/SMAAPass.js',
  'postprocessing/GTAOPass.js', 'math/SimplexNoise.js',
];
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(src, 'build', f), path.join(dst, f));
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(dst, 'LICENSE'));
const seen = new Set();
function copy(rel) {
  if (seen.has(rel)) return; seen.add(rel);
  const from = path.join(src, 'examples/jsm', rel);
  const code = fs.readFileSync(from, 'utf8');
  const to = path.join(dst, 'addons', rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, code);
  for (const m of code.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    copy(path.normalize(path.join(path.dirname(rel), m[1])));
  }
}
ADDONS.forEach(copy);
console.log('vendored', seen.size, 'addon files');
