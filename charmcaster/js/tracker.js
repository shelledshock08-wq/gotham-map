// Face + body tracking with MediaPipe Tasks (runs fully in the browser).
// - FaceLandmarker: 478 landmarks + 52 blendshapes (expressions).
// - PoseLandmarker: 33 body landmarks (arms, legs, which way you face).
// - ImageSegmenter (selfie multiclass): background / hair / body-skin / face-skin / clothes / others.
// When you stand back for a full-body shot the face gets too small for the face
// detector, so the body landmarks are used to zoom in on the head (and, if even
// that fails, to pose a neutral face).

import { OneEuroArray, fitSimilarity } from './geom.js';
import { CANON } from './canonical.js';

const MP_VERSION = '1.0.1';
const MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const POSE_MODEL = MOBILE ? 'pose_landmarker_lite' : 'pose_landmarker_full';
const SOURCES = {
  cdn: {
    // runtime mirrors, tried in order (both serve the npm package as-is)
    libs: [
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`,
      `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}`,
    ],
    face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    seg: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
    pose: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/${POSE_MODEL}/float16/1/${POSE_MODEL}.task`,
  },
  // `?local` (and the desktop app) loads copies from ./vendor
  local: {
    libs: ['./vendor/tasks-vision'],
    face: './vendor/models/face_landmarker.task',
    seg: './vendor/models/selfie_multiclass_256x256.tflite',
    pose: `./vendor/models/${POSE_MODEL}.task`,
  },
};
// Fallback sizes for the progress bar when a server sends no Content-Length.
const APPROX_BYTES = { face: 3758596, seg: 16371837, pose: MOBILE ? 5777746 : 9398198 };

export const CLASS = { BG: 0, HAIR: 1, BODY_SKIN: 2, FACE_SKIN: 3, CLOTHES: 4, OTHERS: 5 };
export const POSE = {
  NOSE: 0, L_EYE: 2, R_EYE: 5, L_EAR: 7, R_EAR: 8, L_MOUTH: 9, R_MOUTH: 10,
  L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16,
  L_PINKY: 17, R_PINKY: 18, L_INDEX: 19, R_INDEX: 20, L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28, L_HEEL: 29, R_HEEL: 30, L_FOOT: 31, R_FOOT: 32,
};
const N_LM = 478;
const N_POSE = 33;
const MAX_FACES = 2;
const STALE_MS = 350;

// Body landmark -> point on the canonical face, for posing a face from body tracking.
const eyeCentre = (ids) => {
  const c = [0, 0, 0];
  for (const i of ids) for (let k = 0; k < 3; k++) c[k] += CANON[i * 3 + k] / ids.length;
  return c;
};
const canon = (i) => [CANON[i * 3], CANON[i * 3 + 1], CANON[i * 3 + 2]];
const HEAD_FIT = [
  [POSE.NOSE, canon(4), 1.5],
  [POSE.L_EYE, eyeCentre([263, 362, 386, 374]), 2],
  [POSE.R_EYE, eyeCentre([33, 133, 159, 145]), 2],
  [1, canon(362), 1], [3, canon(263), 1], [4, canon(133), 1], [6, canon(33), 1],
  [POSE.L_EAR, [7.6, 0.8, -4.2], 1],
  [POSE.R_EAR, [-7.6, 0.8, -4.2], 1],
  [POSE.L_MOUTH, canon(291), 1],
  [POSE.R_MOUTH, canon(61), 1],
];
const HEAD_P = new Float64Array(HEAD_FIT.length * 3);
const HEAD_W = Float64Array.from(HEAD_FIT.map((h) => h[2]));
HEAD_FIT.forEach(([, c], k) => HEAD_P.set([c[0], -c[1], -c[2]], k * 3));

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
    this.lastFrame = 0;
    this.synthetic = false;
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
    this.progress = { face: [0, APPROX_BYTES.face], seg: [0, APPROX_BYTES.seg], pose: [0, APPROX_BYTES.pose] };
    this.face = null;
    this.seg = null;
    this.segState = 'idle'; // idle | loading | ready | failed
    this.poseTask = null;
    this.cropFace = null;
    this.lastTs = 0;
    this.frameNo = 0;

    // tracked faces
    this.slots = [];
    this.nextId = 1;
    this.bsIndex = null;
    this.poseFaceId = null;

    // body
    this.pose = null; // { lm, vis, world, front, ts }
    this.poseFilter = new OneEuroArray(N_POSE * 3, 1.1, 10, 1.0);
    this.poseRaw = new Float32Array(N_POSE * 3);
    this.poseVis = new Float32Array(N_POSE);
    this.poseWorld = new Float32Array(N_POSE * 3);
    this.poseEvery = 1;
    this.poseFrame = 0;
    this.poseMs = 0;
    this.cropCanvas = document.createElement('canvas');
    this.cropCanvas.width = this.cropCanvas.height = 256;
    this.cropCtx = this.cropCanvas.getContext('2d');

    // segmentation state
    this.segCanvas = document.createElement('canvas');
    this.segCtx = this.segCanvas.getContext('2d', { willReadFrequently: false });
    this.mask = null; // { w, h, roi, cat, soft, rgba, cut, cutCanvas, version }
    this.segRoi = { x: 0, y: 0, w: 1, h: 1 };
    this.segEvery = 1;
    this.segFrame = 0;
    this.segMs = 0;
  }

  report() {
    const f = this.progress.face, s = this.progress.seg, p = this.progress.pose;
    const extra = (s[0] + p[0]) / (s[1] + p[1]);
    this.onProgress({ face: f[0] / f[1], seg: extra, segState: this.segState });
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
        this.face = await this.createTask(lib.FaceLandmarker, this.faceOptions(MAX_FACES), 'face', fileset);
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

  faceOptions(numFaces) {
    return {
      baseOptions: { modelAssetBuffer: this.faceBytes },
      runningMode: 'VIDEO',
      numFaces,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    };
  }

  // Body models load after the face so the lens starts sooner.
  async loadBody() {
    if (this.segState !== 'idle') return;
    this.segState = 'loading';
    this.report();
    await Promise.all([this.loadSegmenter(), this.loadPose()]);
    this.segState = this.seg ? 'ready' : 'failed';
    this.report();
  }

  async loadSegmenter() {
    try {
      const bytes = await fetchBytes(this.src.seg, (g, t) => { this.progress.seg = [g, t]; this.report(); }, APPROX_BYTES.seg);
      this.segBytes = bytes;
      this.seg = await this.createTask(this.lib.ImageSegmenter, {
        baseOptions: { modelAssetBuffer: bytes },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }, 'seg');
    } catch (e) {
      console.warn('Body segmentation unavailable:', e);
    }
  }

  async loadPose() {
    try {
      const bytes = await fetchBytes(this.src.pose, (g, t) => { this.progress.pose = [g, t]; this.report(); }, APPROX_BYTES.pose);
      this.poseBytes = bytes;
      this.poseTask = await this.createTask(this.lib.PoseLandmarker, {
        baseOptions: { modelAssetBuffer: bytes },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      }, 'pose');
      // a second face tracker that only ever sees a zoomed-in crop of the head
      this.cropFace = await this.createTask(this.lib.FaceLandmarker, this.faceOptions(1), 'cropFace');
    } catch (e) {
      console.warn('Body tracking unavailable:', e);
    }
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
        task.__options = options;
        task.__cls = Cls;
        return task;
      } catch (e) {
        lastErr = e;
        console.warn(`${kind}: ${delegate} delegate failed`, e);
      }
    }
    throw lastErr;
  }

  // If the GPU path dies at runtime (lost context, driver bug), rebuild the task on CPU.
  async fallbackToCpu(field) {
    const old = this[field];
    if (!old || this[`${field}Rebuilding`]) return;
    this[`${field}Rebuilding`] = true;
    this[field] = null;
    try { old.close(); } catch (_) { /* already gone */ }
    try {
      const task = await old.__cls.createFromOptions(this.fileset, {
        ...old.__options,
        baseOptions: { ...old.__options.baseOptions, delegate: 'CPU' },
      });
      Object.assign(task, { __delegate: 'CPU', __kind: old.__kind, __options: old.__options, __cls: old.__cls });
      this[field] = task;
    } catch (e) {
      console.error(`${field}: CPU rebuild failed`, e);
      if (field === 'seg') this.segState = 'failed';
    }
    this[`${field}Rebuilding`] = false;
  }

  safe(field, fn) {
    try {
      return fn(this[field]);
    } catch (e) {
      console.warn(`${field} error`, e);
      if (this[field] && this[field].__delegate === 'GPU') this.fallbackToCpu(field);
      return null;
    }
  }

  nextTs(now) {
    const ts = Math.max(this.lastTs + 1, Math.round(now));
    this.lastTs = ts;
    return ts;
  }

  resetSmoothing() {
    this.slots = [];
    this.pose = null;
    this.poseFilter.reset();
    if (this.mask) this.mask.fresh = true;
  }

  // Faces seen in the last frame or two, each with smoothed landmarks (normalized xyz).
  get faces() {
    return this.slots.filter((f) => f.lm && (this.frameNo - f.lastFrame <= 1 || this.lastTs - f.lastTs < 200));
  }

  // Data goes stale after a few frames *and* a few hundred ms, so slow devices
  // (where the body model only runs every other frame) don't drop it in between.
  stale(lastFrame, lastTs, frames) {
    return this.frameNo - lastFrame > frames && this.lastTs - lastTs > STALE_MS;
  }

  // Runs the models on one frame. `source` is a <video>, <img> or <canvas>.
  process(source, now, srcW, srcH) {
    const ts = this.nextTs(now);
    this.frameNo++;

    if (this.poseTask) {
      this.poseFrame++;
      if (this.poseFrame >= this.poseEvery) {
        this.poseFrame = 0;
        const t0 = performance.now();
        const r = this.safe('poseTask', (t) => t.detectForVideo(source, ts));
        this.ingestPose(r, ts);
        const ms = performance.now() - t0;
        this.poseMs = this.poseMs ? this.poseMs * 0.9 + ms * 0.1 : ms;
        this.poseEvery = this.poseMs > 25 ? 2 : 1;
      }
    }
    if (this.pose && this.stale(this.pose.frame, this.pose.ts, this.poseEvery + 2)) { this.pose = null; this.poseFilter.reset(); }

    const dets = [];
    if (this.face) {
      const r = this.safe('face', (t) => t.detectForVideo(source, ts));
      if (r) {
        this.learnBlendNames(r);
        r.faceLandmarks.forEach((p, i) => dets.push({ p, cats: r.faceBlendshapes && r.faceBlendshapes[i], synthetic: false }));
      }
    }
    // full-body shot: the face is too small for the detector, so find it through the body
    const p = this.pose;
    const cropSize = p ? this.headSize(p, srcW, srcH) * 2.7 : 0;
    if (p && p.front > -0.3 && this.headVisible(p) && cropSize < 0.7 * Math.min(srcW, srcH)
      && !dets.some((d) => this.nearPoseHead(d.p, p, srcW, srcH))) {
      const crop = this.cropFace ? this.detectFaceInCrop(source, ts, p, cropSize, srcW, srcH) : null;
      dets.push(crop || { p: this.poseFace(p, srcW, srcH), cats: null, synthetic: true });
    }
    this.ingestFaces(dets, ts);
    this.slots = this.slots.filter((f) => !this.stale(f.lastFrame, f.lastTs, 3));
    this.poseFaceId = null;
    if (p) {
      let best = Infinity;
      for (const f of this.faces) {
        const d = this.headDistance(f.lm[3], f.lm[4], p, srcW, srcH);
        if (d < 1.2 && d < best) { best = d; this.poseFaceId = f.id; }
      }
    }

    let maskUpdated = false;
    if (this.seg) {
      this.segFrame++;
      if (this.segFrame >= this.segEvery) {
        this.segFrame = 0;
        const t0 = performance.now();
        maskUpdated = !!this.safe('seg', () => this.runSegmenter(source, ts, srcW, srcH));
        const ms = performance.now() - t0;
        this.segMs = this.segMs ? this.segMs * 0.9 + ms * 0.1 : ms;
        // On slow devices segment every other frame; the mask is smoothed anyway.
        this.segEvery = this.segMs > 28 ? 2 : 1;
      }
    }
    return { maskUpdated };
  }

  learnBlendNames(r) {
    const cats = r.faceBlendshapes;
    if (this.bsIndex || !cats || !cats[0] || !cats[0].categories) return;
    this.bsIndex = {};
    cats[0].categories.forEach((c, i) => { this.bsIndex[c.categoryName] = i; });
  }

  ingestPose(r, ts) {
    const lms = r && r.landmarks && r.landmarks[0];
    if (!lms || lms.length < N_POSE) return;
    const world = r.worldLandmarks && r.worldLandmarks[0];
    const raw = this.poseRaw;
    for (let i = 0; i < N_POSE; i++) {
      raw[i * 3] = lms[i].x;
      raw[i * 3 + 1] = lms[i].y;
      raw[i * 3 + 2] = lms[i].z;
      const v = lms[i].visibility ?? 1;
      this.poseVis[i] = this.pose ? this.poseVis[i] * 0.7 + v * 0.3 : v;
      if (world) {
        const w = world[i], k = this.pose ? 0.4 : 1, o = this.poseWorld;
        o[i * 3] += (w.x - o[i * 3]) * k;
        o[i * 3 + 1] += (w.y - o[i * 3 + 1]) * k;
        o[i * 3 + 2] += (w.z - o[i * 3 + 2]) * k;
      }
    }
    const dt = this.pose ? Math.min(0.2, Math.max(0.001, (ts - this.pose.ts) / 1000)) : 0;
    const lm = this.poseFilter.apply(raw, dt);
    // facing: the left shoulder is on the image's right when you face the camera
    let sx, sz;
    if (world) {
      sx = this.poseWorld[33] - this.poseWorld[36];
      sz = this.poseWorld[35] - this.poseWorld[38];
    } else {
      sx = lm[33] - lm[36];
      sz = lm[35] - lm[38];
    }
    const f = sx / (Math.hypot(sx, sz) || 1);
    const front = this.pose ? this.pose.front * 0.75 + f * 0.25 : f;
    this.pose = { lm, vis: this.poseVis, world: this.poseWorld, front, ts, frame: this.frameNo };
  }

  headVisible(p) {
    return p.vis[POSE.NOSE] > 0.5 && (p.vis[POSE.L_EYE] > 0.5 || p.vis[POSE.R_EYE] > 0.5);
  }

  // Ear-to-ear distance in pixels, a stable head size from the body landmarks.
  headSize(p, W, H) {
    const lm = p.lm;
    const ears = Math.hypot((lm[21] - lm[24]) * W, (lm[22] - lm[25]) * H);
    const shoulders = Math.hypot((lm[33] - lm[36]) * W, (lm[34] - lm[37]) * H);
    return Math.max(ears, shoulders * 0.38, 12);
  }

  headDistance(x, y, p, W, H) {
    const lm = p.lm;
    return Math.hypot((x - lm[0]) * W, (y - lm[1]) * H) / this.headSize(p, W, H);
  }

  nearPoseHead(pts, p, W, H) {
    return this.headDistance(pts[1].x, pts[1].y, p, W, H) < 1.2;
  }

  // Run the second face tracker on a zoomed crop around the head (W, H: source pixels).
  detectFaceInCrop(source, ts, p, size, W, H) {
    const lm = p.lm;
    const cx = lm[0] * W, cy = lm[1] * H;
    const sx = cx - size / 2, sy = cy - size * 0.55;
    const ctx = this.cropCtx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(source, sx, sy, size, size, 0, 0, 256, 256);
    const r = this.safe('cropFace', (t) => t.detectForVideo(this.cropCanvas, ts));
    const pts = r && r.faceLandmarks && r.faceLandmarks[0];
    if (!pts || pts.length < N_LM) return null;
    this.learnBlendNames(r);
    const out = pts.map((q) => ({ x: (sx + q.x * size) / W, y: (sy + q.y * size) / H, z: (q.z * size) / W }));
    return { p: out, cats: r.faceBlendshapes && r.faceBlendshapes[0], synthetic: false };
  }

  // Neutral face posed from the body landmarks (nose, eyes, ears, mouth).
  poseFace(p, W, H) {
    const lm = p.lm;
    const Q = new Float64Array(HEAD_FIT.length * 3);
    HEAD_FIT.forEach(([i], k) => Q.set([lm[i * 3] * W, lm[i * 3 + 1] * H, lm[i * 3 + 2] * W], k * 3));
    const w = Float64Array.from(HEAD_FIT, ([i], k) => HEAD_W[k] * Math.max(0.05, p.vis[i]));
    const { s, R, t } = fitSimilarity(HEAD_P, Q, w);
    const out = new Array(N_LM);
    for (let i = 0; i < N_LM; i++) {
      const x = CANON[i * 3], y = -CANON[i * 3 + 1], z = -CANON[i * 3 + 2];
      out[i] = {
        x: (s * (R[0] * x + R[1] * y + R[2] * z) + t[0]) / W,
        y: (s * (R[3] * x + R[4] * y + R[5] * z) + t[1]) / H,
        z: (s * (R[6] * x + R[7] * y + R[8] * z) + t[2]) / W,
      };
    }
    return out;
  }

  ingestFaces(dets, ts) {
    // match detections to tracked slots by nose position so smoothing/physics stay with the right person
    const used = new Set();
    const assigned = new Array(dets.length).fill(null);
    const pairs = [];
    dets.forEach(({ p }, d) => {
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
    dets.forEach(({ p, cats, synthetic }, d) => {
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
      slot.lastFrame = this.frameNo;
      slot.synthetic = synthetic;
      slot.lm = slot.lmFilter.apply(raw, dt);
      const c = cats && cats.categories;
      if (c && c.length) {
        for (let i = 0; i < Math.min(52, c.length); i++) slot.rawBs[i] = c[i].score;
      } else {
        slot.rawBs.fill(0); // no expression data: relax to neutral
      }
      slot.bs = slot.bsFilter.apply(slot.rawBs, dt);
    });
    return dets.length > 0;
  }

  blend(face, name) {
    if (!face || !face.bs || !this.bsIndex) return 0;
    const i = this.bsIndex[name];
    return i === undefined ? 0 : face.bs[i];
  }

  // Segment a crop around the body (when we know where it is) for a sharper mask.
  // The crop only moves when you leave it or shrink a lot, so the smoothed mask stays aligned.
  updateSegRoi() {
    const p = this.pose;
    let want = { x: 0, y: 0, w: 1, h: 1 };
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0;
    const add = (ax, ay, bx, by) => {
      x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); n++;
    };
    if (p) {
      let c = 0, bx0 = 1, by0 = 1, bx1 = 0, by1 = 0;
      for (let i = 0; i < N_POSE; i++) {
        if (p.vis[i] < 0.35) continue;
        const x = p.lm[i * 3], y = p.lm[i * 3 + 1];
        bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
        c++;
      }
      if (c >= 6) {
        const bw = bx1 - bx0, bh = by1 - by0;
        const head = Math.abs(p.lm[1] - p.lm[34]) * 0.9 + 0.05; // nose to shoulders, for hair room
        add(bx0 - bw * 0.22 - 0.06, by0 - head - bh * 0.06, bx1 + bw * 0.22 + 0.06, by1 + bh * 0.1 + 0.04);
      }
    }
    // everyone with a tracked face, so a second person's body gets the cartoon pass too
    for (const f of this.faces) {
      const lm = f.lm;
      const fw = Math.abs(lm[454 * 3] - lm[234 * 3]), fh = Math.abs(lm[152 * 3 + 1] - lm[10 * 3 + 1]);
      const cx = (lm[454 * 3] + lm[234 * 3]) / 2;
      add(cx - fw * 1.8, lm[10 * 3 + 1] - fh * 0.7, cx + fw * 1.8, lm[152 * 3 + 1] + fh * 4);
    }
    if (n) {
      const minW = 0.45, minH = 0.45;
      if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
      if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
      const snap = (v) => Math.round(v * 32) / 32;
      want = { x: snap(x0), y: snap(y0), w: snap(x1) - snap(x0), h: snap(y1) - snap(y0) };
      if (want.w <= 0 || want.h <= 0) want = { x: 0, y: 0, w: 1, h: 1 };
    }
    const cur = this.segRoi;
    const inside = want.x >= cur.x - 1e-6 && want.y >= cur.y - 1e-6
      && want.x + want.w <= cur.x + cur.w + 1e-6 && want.y + want.h <= cur.y + cur.h + 1e-6;
    if (!inside || want.w * want.h < cur.w * cur.h * 0.55) {
      this.segRoi = want;
      if (this.mask) this.mask.fresh = true;
    }
    return this.segRoi;
  }

  runSegmenter(source, ts, srcW, srcH) {
    // Feed a 256px-long-side copy: the model is 256x256 anyway, and the output mask
    // comes back at input size, so this keeps the CPU readback tiny.
    const roi = this.updateSegRoi();
    const pw = roi.w * srcW, ph = roi.h * srcH;
    const scale = 256 / Math.max(pw, ph);
    const w = Math.max(16, Math.round(pw * scale));
    const h = Math.max(16, Math.round(ph * scale));
    const c = this.segCanvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.segCtx.drawImage(source, roi.x * srcW, roi.y * srcH, pw, ph, 0, 0, w, h);
    let got = false;
    this.seg.segmentForVideo(c, ts, (res) => {
      const m = res.categoryMask;
      if (!m) return;
      const cat = m.getAsUint8Array();
      this.ensureMask(m.width, m.height);
      this.mask.cat.set(cat.subarray(0, this.mask.cat.length));
      got = true;
    });
    if (got) {
      this.mask.roi = { ...roi };
      this.blendMask();
    }
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
      roi: { x: 0, y: 0, w: 1, h: 1 },
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
    const k = m.fresh ? 1 : 0.5; // lower = steadier edges, higher = less trailing when you move
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

  // Mask class at a normalized source point (outside the mask's crop = background).
  maskIndex(x, y) {
    const m = this.mask;
    if (!m) return -1;
    const u = (x - m.roi.x) / m.roi.w, v = (y - m.roi.y) / m.roi.h;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return -1;
    return Math.floor(v * m.h) * m.w + Math.floor(u * m.w);
  }

  // Where the clothes start below the chin (normalized source coords), or null.
  findNeckline(lm) {
    const m = this.mask;
    if (!m || !lm) return null;
    const cx = lm[152 * 3], cy = lm[152 * 3 + 1];
    const fw = Math.abs(lm[454 * 3] - lm[234 * 3]);
    const fh = Math.abs(lm[152 * 3 + 1] - lm[10 * 3 + 1]);
    const steps = 40;
    for (let s = 0; s <= steps; s++) {
      const y = cy + fh * (0.08 + (1.02 * s) / steps);
      let hits = 0, tot = 0;
      for (let k = -8; k <= 8; k++) {
        const i = this.maskIndex(cx + (k / 8) * 0.32 * fw, y);
        if (i < 0) continue;
        tot++;
        if (m.cat[i] === CLASS.CLOTHES) hits++;
      }
      if (tot && hits / tot > 0.45) return { x: cx, y };
    }
    return null;
  }

  get delegates() {
    const d = (t) => t && t.__delegate;
    return { face: d(this.face), seg: d(this.seg), pose: d(this.poseTask) };
  }
}
