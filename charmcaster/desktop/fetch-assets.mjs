// Downloads the MediaPipe runtime and models into ../vendor so the desktop app
// works offline. Skips files that are already there. No dependencies.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const VENDOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor');
const MP_VERSION = '1.0.1';
const GCS = 'https://storage.googleapis.com/mediapipe-models';
const MODELS = {
  'face_landmarker.task': `${GCS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  'selfie_multiclass_256x256.tflite': `${GCS}/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite`,
  'pose_landmarker_full.task': `${GCS}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
  'pose_landmarker_lite.task': `${GCS}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
};
const RUNTIME = ['vision_bundle.mjs', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm'];

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function save(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`  ${path.relative(VENDOR, file)} (${(data.length / 1e6).toFixed(1)} MB)`);
}

// Minimal reader for the npm tarball (ustar entries).
function untar(buf, want) {
  const out = {};
  for (let off = 0; off + 512 <= buf.length;) {
    const field = (a, b) => buf.toString('utf8', off + a, off + b).replace(/\0[\s\S]*$/, '');
    const name = field(0, 100);
    if (!name) break;
    const size = parseInt(field(124, 136).trim(), 8) || 0;
    const prefix = field(345, 500);
    const rel = (prefix ? `${prefix}/${name}` : name).replace(/^package\//, '');
    if (want.includes(rel)) out[rel] = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

const runtimeDir = path.join(VENDOR, 'tasks-vision');
if (RUNTIME.every((f) => existsSync(path.join(runtimeDir, f)))) {
  console.log('MediaPipe runtime: already there');
} else {
  console.log(`MediaPipe runtime ${MP_VERSION}:`);
  const tgz = await get(`https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-${MP_VERSION}.tgz`);
  const files = untar(gunzipSync(tgz), RUNTIME);
  for (const f of RUNTIME) {
    if (!files[f]) throw new Error(`${f} missing from the npm package`);
    save(path.join(runtimeDir, f), files[f]);
  }
}
for (const [name, url] of Object.entries(MODELS)) {
  const file = path.join(VENDOR, 'models', name);
  if (existsSync(file)) { console.log(`${name}: already there`); continue; }
  save(file, await get(url));
}
console.log('Assets ready.');
