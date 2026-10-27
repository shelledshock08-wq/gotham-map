// Face + body tracking with MediaPipe Tasks (runs fully in the browser).
// - FaceLandmarker: 478 landmarks + 52 blendshapes (expressions).
// - ImageSegmenter (selfie multiclass): background / hair / body-skin / face-skin / clothes / others.

import { OneEuroArray } from './geom.js';

const MP_VERSION = '1.0.1';
const SOURCES = {
  cdn: {
    // runtime mirrors, tried in order (both serve the npm package as-is)
    libs: [
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`,
      `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}`,
    ],
    face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    seg: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
  },
  // `?local` loads copies from ./vendor (handy offline; not published)
  local: {
    libs: ['./vendor/tasks-vision'],
    face: './vendor/models/face_landmarker.task',
    seg: './vendor/models/selfie_multiclass_256x256.tflite',
  },
};
// Fallback sizes for the progress bar when a server sends no Content-Length.
const APPROX_BYTES = { face: 3758596, seg: 16371837 };

export const CLASS = { BG: 0, HAIR: 1, BODY_SKIN: 2, FACE_SKIN: 3, CLOTHES: 4, OTHERS: 5 };
const N_LM = 478;
const MAX_FACES = 2;
const STALE_MS = 350;

// One tracked person: smoothed landmarks + expressions, kept stable across frames.
class FaceSlot {
  constructor(id) {
    this.id = id;
    this.lmFilter = new OneEuroArray(N_LM * 3, 2.2, 28, 1.0);
    this.bsFilter = new OneEuroArray(52, 4.0, 4, 1.0);
    this.raw = new Float32Array(N_LM * 3);
    this.rawBs = new Float32Array(52);
    this.lm = null;
    this.bs = null;
    this.lastTs = 0;
  }
}

async function fetchBytes(url, onBytes, approx) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const total = +res.headers.get('content-length') || approx || 0;
  if (!res.body || !res.body.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.length, buf.length);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onBytes(got, Math.max(total, got));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export class Tracker {
  constructor({ local = false, cpu = false, onProgress = () => {} } = {}) {
    this.src = local ? SOURCES.local : SOURCES.cdn;
    this.forceCpu = cpu;
    this.onProgress = onProgress;
    this.progress = { face: [0, APPROX_BYTES.face], seg: [0, APPROX_BYTES.seg] };
    this.face = null;
    this.seg = null;
    this.segState = 'idle'; // idle | loading | ready | failed
    this.lastTs = 0;

    // tracked faces
    this.slots = [];
    this.nextId = 1;
    this.bsIndex = null;

    // segmentation state
    this.segCanvas = document.createElement('canvas');
    this.segCtx = this.segCanvas.getContext('2d', { willReadFrequently: false });
    this.mask = null; // { w, h, cat, soft, rgba, cut, cutCanvas, version }
    this.segEvery = 1;
    this.segFrame = 0;
    this.segMs = 0;
  }

  report() {
    const f = this.progress.face, s = this.progress.seg;
    this.onProgress({ face: f[0] / f[1], seg: s[0] / s[1], segState: this.segState });
  }

  async init() {
    const faceBytes = fetchBytes(this.src.face, (g, t) => { this.progress.face = [g, t]; this.report(); }, APPROX_BYTES.face);
    faceBytes.catch(() => {}); // awaited below; don't report it twice
    let lastErr;
    for (const base of this.src.libs) {
      try {
        // import() resolves against this module, so anchor relative paths to the page
        const root = new URL(base + '/', document.baseURI).href;
        const lib = await import(root + 'vision_bundle.mjs');
        const fileset = await lib.FilesetResolver.forVisionTasks(root + 'wasm');
        this.faceBytes = await faceBytes;
        this.face = await this.createTask(lib.FaceLandmarker, {
          baseOptions: { modelAssetBuffer: this.faceBytes },
          runningMode: 'VIDEO',
          numFaces: MAX_FACES,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        }, 'face', fileset);
        this.lib = lib;
        this.fileset = fileset;
        return;
      } catch (e) {
        lastErr = e;
        console.warn(`MediaPipe failed to load from ${base}`, e);
      }
    }
    throw lastErr;
  }

  // The body segmenter is big (16 MB); it loads after the face so the lens starts sooner.
  async loadSegmenter() {
    if (this.segState !== 'idle') return;
    this.segState = 'loading';
    this.report();
    try {
      const bytes = await fetchBytes(this.src.seg, (g, t) => { this.progress.seg = [g, t]; this.report(); }, APPROX_BYTES.seg);
      this.segBytes = bytes;
      this.seg = await this.createTask(this.lib.ImageSegmenter, {
        baseOptions: { modelAssetBuffer: bytes },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }, 'seg');
      this.segState = 'ready';
    } catch (e) {
      console.warn('Body segmentation unavailable:', e);
      this.segState = 'failed';
    }
    this.report();
  }

  async createTask(Cls, options, kind, fileset = this.fileset) {
    const delegates = this.forceCpu ? ['CPU'] : ['GPU', 'CPU'];
    let lastErr;
    for (const delegate of delegates) {
      try {
        const task = await Cls.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate },
        });
        task.__delegate = delegate;
        task.__kind = kind;
        return task;
      } catch (e) {
        lastErr = e;
        console.warn(`${kind}: ${delegate} delegate failed`, e);
      }
    }
    throw lastErr;
  }

  // If the GPU path dies at runtime (lost context, driver bug), rebuild the task on CPU.
  async fallbackToCpu(kind) {
    if (this[`${kind}Rebuilding`]) return;
    this[`${kind}Rebuilding`] = true;
    const old = this[kind];
    this[kind] = null;
    try { old && old.close(); } catch (_) { /* already gone */ }
    try {
      const Cls = kind === 'face' ? this.lib.FaceLandmarker : this.lib.ImageSegmenter;
      const bytes = kind === 'face' ? this.faceBytes : this.segBytes;
      const opts = kind === 'face'
        ? { baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: MAX_FACES, outputFaceBlendshapes: true }
        : { baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' }, runningMode: 'VIDEO', outputCategoryMask: true, outputConfidenceMasks: false };
      const task = await Cls.createFromOptions(this.fileset, opts);
      task.__delegate = 'CPU';
      this[kind] = task;
    } catch (e) {
      console.error(`${kind}: CPU rebuild failed`, e);
      if (kind === 'seg') this.segState = 'failed';
    }
    this[`${kind}Rebuilding`] = false;
  }

  nextTs(now) {
    const ts = Math.max(this.lastTs + 1, Math.round(now));
    this.lastTs = ts;
    return ts;
  }

  resetSmoothing() {
    this.slots = [];
    if (this.mask) this.mask.fresh = true;
  }

  // Faces seen in the last few frames, each with smoothed landmarks (normalized xyz).
  get faces() {
    return this.slots.filter((f) => f.lm && this.lastTs - f.lastTs < 200);
  }

  // Runs the models on one frame. `source` is a <video>, <img> or <canvas>.
  process(source, now, srcW, srcH) {
    const ts = this.nextTs(now);
    let faceOk = false;
    if (this.face) {
      try {
        const r = this.face.detectForVideo(source, ts);
        faceOk = this.ingestFaces(r, ts);
      } catch (e) {
        console.warn('face detect error', e);
        if (this.face && this.face.__delegate === 'GPU') this.fallbackToCpu('face');
      }
    }
    this.slots = this.slots.filter((f) => ts - f.lastTs < STALE_MS);

    let maskUpdated = false;
    if (this.seg && this.segState === 'ready') {
      this.segFrame++;
      if (this.segFrame >= this.segEvery) {
        this.segFrame = 0;
        const t0 = performance.now();
        try {
          maskUpdated = this.runSegmenter(source, ts, srcW, srcH);
        } catch (e) {
          console.warn('segment error', e);
          if (this.seg && this.seg.__delegate === 'GPU') this.fallbackToCpu('seg');
        }
        const ms = performance.now() - t0;
        this.segMs = this.segMs ? this.segMs * 0.9 + ms * 0.1 : ms;
        // On slow devices segment every other frame; the mask is smoothed anyway.
        this.segEvery = this.segMs > 28 ? 2 : 1;
      }
    }
    return { face: faceOk, maskUpdated };
  }

  ingestFaces(r, ts) {
    const dets = (r && r.faceLandmarks || []).filter((p) => p && p.length >= N_LM);
    const cats = r && r.faceBlendshapes;
    if (!this.bsIndex && cats && cats[0] && cats[0].categories) {
      this.bsIndex = {};
      cats[0].categories.forEach((c, i) => { this.bsIndex[c.categoryName] = i; });
    }
    // match detections to tracked slots by nose position so smoothing/physics stay with the right person
    const used = new Set();
    const assigned = new Array(dets.length).fill(null);
    const pairs = [];
    dets.forEach((p, d) => {
      this.slots.forEach((slot, k) => {
        if (!slot.lm) return;
        const dist = Math.hypot(p[1].x - slot.lm[3], p[1].y - slot.lm[4]);
        if (dist < 0.2) pairs.push([dist, d, k]);
      });
    });
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [, d, k] of pairs) {
      if (assigned[d] || used.has(k)) continue;
      assigned[d] = this.slots[k];
      used.add(k);
    }
    dets.forEach((p, d) => {
      let slot = assigned[d];
      if (!slot) {
        if (this.slots.length >= MAX_FACES) return;
        slot = new FaceSlot(this.nextId++);
        this.slots.push(slot);
      }
      const raw = slot.raw;
      for (let i = 0; i < N_LM; i++) {
        raw[i * 3] = p[i].x;
        raw[i * 3 + 1] = p[i].y;
        raw[i * 3 + 2] = p[i].z;
      }
      const dt = slot.lastTs ? Math.min(0.2, Math.max(0.001, (ts - slot.lastTs) / 1000)) : 0;
      slot.lastTs = ts;
      slot.lm = slot.lmFilter.apply(raw, dt);
      const c = cats && cats[d] && cats[d].categories;
      if (c && c.length) {
        for (let i = 0; i < Math.min(52, c.length); i++) slot.rawBs[i] = c[i].score;
        slot.bs = slot.bsFilter.apply(slot.rawBs, dt);
      }
    });
    return dets.length > 0;
  }

  blend(face, name) {
    if (!face || !face.bs || !this.bsIndex) return 0;
    const i = this.bsIndex[name];
    return i === undefined ? 0 : face.bs[i];
  }

  runSegmenter(source, ts, srcW, srcH) {
    // Feed a 256px-long-side copy: the model is 256x256 anyway, and the output mask
    // comes back at input size, so this keeps the CPU readback tiny.
    const scale = 256 / Math.max(srcW, srcH);
    const w = Math.max(16, Math.round(srcW * scale));
    const h = Math.max(16, Math.round(srcH * scale));
    const c = this.segCanvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.segCtx.drawImage(source, 0, 0, w, h);
    let got = false;
    this.seg.segmentForVideo(c, ts, (res) => {
      const m = res.categoryMask;
      if (!m) return;
      const cat = m.getAsUint8Array();
      this.ensureMask(m.width, m.height);
      this.mask.cat.set(cat.subarray(0, this.mask.cat.length));
      got = true;
    });
    if (got) this.blendMask();
    return got;
  }

  ensureMask(w, h) {
    if (this.mask && this.mask.w === w && this.mask.h === h) return;
    const n = w * h;
    const cutCanvas = document.createElement('canvas');
    cutCanvas.width = w;
    cutCanvas.height = h;
    const cutCtx = cutCanvas.getContext('2d');
    this.mask = {
      w, h,
      cat: new Uint8Array(n),
      soft: new Float32Array(n * 4),
      rgba: new Uint8Array(n * 4),
      cut: cutCtx.createImageData(w, h),
      cutCanvas, cutCtx,
      version: 0,
      fresh: true,
    };
  }

  // Temporal smoothing of the class masks (kills flicker), packed for the GPU as
  // R = hair, G = skin, B = clothes, A = person. Also builds the body cut-out
  // (person minus hair) used to tuck the long hair behind the shoulders.
  blendMask() {
    const m = this.mask;
    const n = m.w * m.h;
    const { cat, soft, rgba } = m;
    const cut = m.cut.data;
    const k = m.fresh ? 1 : 0.65; // lower = steadier edges, higher = less trailing when you move
    m.fresh = false;
    for (let i = 0; i < n; i++) {
      const c = cat[i];
      const j = i * 4;
      const hair = c === 1 ? 1 : 0;
      const skin = c === 2 || c === 3 ? 1 : 0;
      const cloth = c === 4 ? 1 : 0;
      const person = c !== 0 ? 1 : 0;
      const a = soft[j] + (hair - soft[j]) * k;
      const b = soft[j + 1] + (skin - soft[j + 1]) * k;
      const d = soft[j + 2] + (cloth - soft[j + 2]) * k;
      const e = soft[j + 3] + (person - soft[j + 3]) * k;
      soft[j] = a; soft[j + 1] = b; soft[j + 2] = d; soft[j + 3] = e;
      rgba[j] = a * 255;
      rgba[j + 1] = b * 255;
      rgba[j + 2] = d * 255;
      rgba[j + 3] = e * 255;
      const body = e - a;
      cut[j + 3] = body > 0 ? body * 255 : 0;
    }
    m.cutCtx.putImageData(m.cut, 0, 0);
    m.version++;
  }

  // Where the clothes start below the chin (normalized source coords), or null.
  findNeckline(lm) {
    const m = this.mask;
    if (!m || !lm) return null;
    const { w, h, cat } = m;
    const cx = lm[152 * 3] * w, cy = lm[152 * 3 + 1] * h;
    const fw = Math.hypot((lm[454 * 3] - lm[234 * 3]) * w, (lm[454 * 3 + 1] - lm[234 * 3 + 1]) * h);
    const fh = Math.hypot((lm[152 * 3] - lm[10 * 3]) * w, (lm[152 * 3 + 1] - lm[10 * 3 + 1]) * h);
    const x0 = Math.max(0, Math.round(cx - 0.32 * fw));
    const x1 = Math.min(w - 1, Math.round(cx + 0.32 * fw));
    const y0 = Math.max(0, Math.round(cy + 0.08 * fh));
    const y1 = Math.min(h - 1, Math.round(cy + 1.1 * fh));
    if (x1 <= x0) return null;
    for (let y = y0; y <= y1; y++) {
      let hits = 0;
      const row = y * w;
      for (let x = x0; x <= x1; x++) if (cat[row + x] === CLASS.CLOTHES) hits++;
      if (hits / (x1 - x0 + 1) > 0.45) return { x: cx / w, y: y / h };
    }
    return null;
  }

  get delegates() {
    return { face: this.face && this.face.__delegate, seg: this.seg && this.seg.__delegate };
  }
}
