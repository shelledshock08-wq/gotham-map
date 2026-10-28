// Charmcaster Lens: camera -> tracking -> cartoon pass -> drawn head -> screen.

import { Tracker } from './tracker.js';
import { ToonRenderer, MODES } from './toon.js';
import { Charm } from './charm.js';
import { Body, bodyFrame } from './body.js';
import { fitSimilarity } from './geom.js';
import { RIGID } from './canonical.js';
import { Capture } from './capture.js';

const params = new URLSearchParams(location.search);
const OPT = {
  local: params.has('local'),
  cpu: params.has('cpu'),
  src: params.get('src'), // test input (image/video URL) instead of the camera
  mirror: params.get('mirror'),
  debug: params.has('debug'),
  spell: params.has('spell'), // preview the spell effect without raising your brows
  back: params.has('back'), // preview the view from behind on a front-facing test image
  figure: params.has('figure'), // preview the drawn, pose-rigged feminine body (WIP)
  desktop: params.has('desktop'), // running inside the Windows app
};
if (OPT.desktop) OPT.local = true;

const $ = (id) => document.getElementById(id);
const TOUCH = matchMedia('(pointer: coarse)').matches;
const ui = {
  start: $('start'), go: $('go'), loader: $('loader'), bar: $('bar'), loadText: $('load-text'),
  err: $('err'), errText: $('err-text'), retry: $('retry'),
  stage: $('stage'), video: $('cam'), out: $('out'),
  hud: $('hud'), flip: $('flip'), modeBtn: $('mode'), modeLabel: $('mode-label'), compare: $('compare'),
  shutter: $('shutter'), ring: $('ring-progress'), toast: $('toast'), status: $('status'), stats: $('stats'), hint: $('hint'),
  flash: $('flash'),
};

// ---------- pose fit setup ----------
const N_LM = 478;
const RIGID_IDX = RIGID.map((r) => r[0]);
const RIGID_W = Float64Array.from(RIGID.map((r) => r[4]));
const P_PLAIN = new Float64Array(RIGID.length * 3), P_MIRROR = new Float64Array(RIGID.length * 3);
RIGID.forEach(([, x, y, z], k) => {
  P_PLAIN.set([x, -y, -z], k * 3);
  P_MIRROR.set([-x, -y, -z], k * 3);
});
const Q = new Float64Array(RIGID.length * 3);

// Landmarks -> screen pixels (mirrored for selfies) and the head pose that fits them.
function fitPose(lm, W, H, mirror, X, Y, Z) {
  for (let i = 0; i < N_LM; i++) {
    const x = lm[i * 3];
    X[i] = (mirror ? 1 - x : x) * W;
    Y[i] = lm[i * 3 + 1] * H;
    Z[i] = lm[i * 3 + 2] * W;
  }
  for (let k = 0; k < RIGID_IDX.length; k++) {
    const i = RIGID_IDX[k];
    Q[k * 3] = X[i]; Q[k * 3 + 1] = Y[i]; Q[k * 3 + 2] = Z[i];
  }
  const P = mirror ? P_MIRROR : P_PLAIN;
  const fit = fitSimilarity(P, Q, RIGID_W);
  // At steep head angles the landmarks go bad and the fitted scale can spike, ballooning the
  // hair across the screen. Cap it to the face's real on-screen height (forehead 10 -> nose base 2)
  // and rebuild the translation for the capped scale so the head stays anchored.
  const faceH = Math.hypot(X[10] - X[2], Y[10] - Y[2]);
  if (faceH > 1) {
    const refS = faceH / 10.35; // |10 - 2| in the canonical model, frontal
    const s = Math.min(Math.max(fit.s, refS * 0.5), refS * 1.45);
    if (s !== fit.s) {
      let sw = 0, pcx = 0, pcy = 0, pcz = 0, qcx = 0, qcy = 0, qcz = 0;
      for (let k = 0; k < RIGID_W.length; k++) {
        const w = RIGID_W[k];
        sw += w;
        pcx += w * P[k * 3]; pcy += w * P[k * 3 + 1]; pcz += w * P[k * 3 + 2];
        qcx += w * Q[k * 3]; qcy += w * Q[k * 3 + 1]; qcz += w * Q[k * 3 + 2];
      }
      pcx /= sw; pcy /= sw; pcz /= sw; qcx /= sw; qcy /= sw; qcz /= sw;
      const R = fit.R;
      fit.t = [
        qcx - s * (R[0] * pcx + R[1] * pcy + R[2] * pcz),
        qcy - s * (R[3] * pcx + R[4] * pcy + R[5] * pcz),
        qcz - s * (R[6] * pcx + R[7] * pcy + R[8] * pcz),
      ];
      fit.s = s;
    }
  }
  return fit;
}

// How much of the user's own hair is at a screen point (0..1), from the smoothed mask.
function hairAt(x, y, W, H, mirror) {
  const m = tracker && tracker.mask;
  if (!m || state.maskOn <= 0) return 0;
  const i = tracker.maskIndex(mirror ? 1 - x / W : x / W, y / H);
  return i < 0 ? 0 : m.soft[i * 4];
}

const body = new Body();

// One drawn Charmcaster per tracked face.
const puppets = new Map();
function puppetFor(id) {
  let p = puppets.get(id);
  if (!p) {
    p = { charm: new Charm(), X: new Float32Array(N_LM), Y: new Float32Array(N_LM), Z: new Float32Array(N_LM) };
    puppets.set(id, p);
  }
  return p;
}

// ---------- state ----------
const state = {
  running: false,
  facing: 'user',
  mirror: true,
  stream: null,
  source: null,
  mode: Math.max(0, MODES.indexOf(params.get('mode') || 'comic')),
  comparing: false,
  maskOn: 0,
  W: 0, H: 0,
  lastNow: 0,
  lastFrameAt: 0,
  frames: 0,
  noFaceSince: 0,
  fps: 0,
  timings: { track: 0, draw: 0 },
};

let tracker, toon, capture, trackerReady = null;
const glCanvas = document.createElement('canvas');
const back = document.createElement('canvas');
const backCtx = back.getContext('2d');
const outCtx = ui.out.getContext('2d', { alpha: false });

window.__lens = { state, get tracker() { return tracker; }, frames: 0, face: false };

// ---------- boot ----------
// Desktop app: the native title bar shows progress, so a stuck start is never a silent black window.
function desktopTitle(text) {
  if (OPT.desktop) document.title = text ? `Charmcaster Lens — ${text}` : 'Charmcaster Lens';
}

function showError(msg) {
  console.error(msg);
  desktopTitle('error (see window)');
  ui.loader.hidden = true;
  ui.err.hidden = false;
  ui.errText.textContent = msg;
  window.__lens.error = msg;
}

function setProgress(p, text) {
  ui.bar.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
  if (text) {
    ui.loadText.textContent = text;
    desktopTitle(text);
  }
}

const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
nextPaint().then(() => console.info('[charmcaster] painted'));

async function boot() {
  ui.start.hidden = true;
  ui.err.hidden = true;
  ui.loader.hidden = false;
  setProgress(0.03, 'Opening your camera…');
  await nextPaint(); // let the loading screen show before the GPU work starts
  try {
    if (!toon) {
      toon = new ToonRenderer(glCanvas);
      const gpu = toon.rendererInfo();
      console.info('[charmcaster] webgl renderer:', gpu);
      if (/swiftshader|llvmpipe|basic render/i.test(gpu)) state.softwareGl = true;
    }
  } catch (e) {
    showError(OPT.desktop
      ? 'Your graphics card did not give the lens WebGL2. Press F9 to restart in safe graphics mode.'
      : 'This browser has no WebGL2, which the lens needs. Try Chrome, Safari 15+ or Firefox.');
    return;
  }
  tracker = tracker || new Tracker({
    local: OPT.local, cpu: OPT.cpu,
    onProgress: (p) => {
      if (!state.running) setProgress(0.1 + 0.85 * p.face, `Summoning Charmcaster… ${Math.round(p.face * 100)}%`);
      else if (p.segState === 'loading') setStatus(`Loading outfit magic… ${Math.round(p.seg * 100)}%`);
      else if (p.segState === 'ready') setStatus('');
      else if (p.segState === 'failed') setStatus('Outfit magic unavailable on this device');
    },
  });
  // one shared load, so "Try again" during a slow download doesn't start a second one
  if (!trackerReady) trackerReady = tracker.init().catch((e) => { trackerReady = null; throw e; });
  try {
    await Promise.all([OPT.src ? useTestSource(OPT.src) : startCamera(state.facing), trackerReady]);
  } catch (e) {
    showError(explain(e));
    return;
  }
  ui.loader.hidden = true;
  ui.hud.hidden = false;
  state.running = true;
  capture = capture || new Capture(ui.out, () => state.stream);
  updateModeLabel();
  toast('Raise your eyebrows to cast a spell ✦', 3500);
  if (params.has('safe')) toast('Safe graphics mode: drawing in software, so it is slower. Press F9 to try the GPU again.', 6000);
  else if (state.softwareGl) toast('No GPU acceleration here, so expect a low frame rate.', 5000);
  desktopTitle('');
  console.info('[charmcaster] ready', JSON.stringify(tracker.delegates));
  requestWakeLock();
  loop();
  tracker.loadBody();
}

function explain(e) {
  const name = e && e.name;
  if ((name === 'NotAllowedError' || name === 'SecurityError') && OPT.desktop) {
    return 'Windows blocked the camera. Open Settings → Privacy & security → Camera, turn on "Let desktop apps access your camera", then click Try again.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow the camera for this site in your browser settings, then tap Try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it and tap Try again.';
  if (!window.isSecureContext) return 'The camera only works over https:// (or on localhost).';
  return `Something went wrong: ${e && e.message ? e.message : e}`;
}

async function startCamera(facing, deviceId = null) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('Camera API unavailable'), { name: window.isSecureContext ? 'NotFoundError' : 'SecurityError' });
  }
  stopCamera();
  // ask for frames in the screen's orientation (portrait on phones) so nothing gets cropped
  const portrait = window.innerHeight > window.innerWidth;
  const video = {
    frameRate: { ideal: 30 },
    width: { ideal: portrait ? 720 : 1280 }, height: { ideal: portrait ? 1280 : 720 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: facing }),
  };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch (e) {
    // no mic (or mic denied): carry on without sound
    if (e.name === 'NotAllowedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError' || e.name === 'OverconstrainedError') {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } else throw e;
  }
  state.stream = stream;
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings ? track.getSettings() : {};
  state.facing = settings.facingMode || facing || 'user';
  state.deviceId = settings.deviceId || deviceId;
  state.mirror = OPT.mirror !== null ? OPT.mirror !== '0' : state.facing !== 'environment';
  // the OS took the camera away (call, another app): get it back when we're visible
  track.addEventListener('ended', () => {
    if (!document.hidden && state.stream === stream) startCamera(state.facing).catch((e) => showError(explain(e)));
  });
  const v = ui.video;
  v.srcObject = stream;
  v.muted = true;
  v.playsInline = true;
  await v.play();
  if (!v.videoWidth) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
  state.source = v;
  tracker && tracker.resetSmoothing();
  puppets.clear();
  body.reset();
  refreshFlip();
  if (state.running) loop();
  return true;
}

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

async function useTestSource(url) {
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
  const el = isVideo ? document.createElement('video') : new Image();
  el.crossOrigin = 'anonymous';
  if (isVideo) {
    el.muted = true; el.loop = true; el.playsInline = true; el.src = url;
    await el.play();
  } else {
    el.src = url;
    await el.decode();
  }
  state.source = el;
  state.mirror = OPT.mirror !== null ? OPT.mirror !== '0' : true;
  ui.flip.hidden = true;
  return true;
}

async function refreshFlip() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    ui.flip.hidden = devs.filter((d) => d.kind === 'videoinput').length < 2;
  } catch (_) { /* keep visible */ }
}

// Phones: front <-> back. Computers: step through the connected webcams.
async function flipCamera() {
  if (OPT.src) return;
  try {
    if (TOUCH) {
      await startCamera(state.facing === 'user' ? 'environment' : 'user');
    } else {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      if (cams.length < 2) return;
      const i = cams.findIndex((d) => d.deviceId === state.deviceId);
      const next = cams[(i + 1) % cams.length];
      await startCamera(null, next.deviceId);
      toast(next.label || 'Camera switched', 1200);
    }
  } catch (e) {
    toast('Could not switch camera');
    try { await startCamera(state.facing, state.deviceId); } catch (_) { /* leave it */ }
  }
}

// ---------- frame loop ----------
// One callback chain at a time; starting a new one retires the old.
let loopId = 0;
function loop() {
  const id = ++loopId;
  const v = state.source;
  const perFrame = v && v.requestVideoFrameCallback && v === ui.video;
  const next = () => (perFrame ? v.requestVideoFrameCallback(cb) : requestAnimationFrame(cb));
  const cb = (now) => {
    if (id !== loopId) return;
    frame(now);
    next();
  };
  next();
}
// a camera switch can leave a frame callback hanging; restart the chain if frames stop
setInterval(() => {
  if (state.running && !document.hidden && performance.now() - state.lastFrameAt > 2000) loop();
}, 1000);

function ensureSize(vw, vh) {
  const k = Math.min(1, 1280 / Math.max(vw, vh));
  const W = Math.round(vw * k), H = Math.round(vh * k);
  if (W === state.W && H === state.H) return;
  state.W = W; state.H = H;
  ui.out.width = W; ui.out.height = H;
  back.width = W; back.height = H;
  toon.resize(W, H);
  puppets.clear();
}

function frame(now) {
  if (!state.running || document.hidden) return;
  const src = state.source;
  const vw = src.videoWidth || src.naturalWidth || src.width;
  const vh = src.videoHeight || src.naturalHeight || src.height;
  if (!vw || !vh) return;
  ensureSize(vw, vh);
  const { W, H, mirror } = state;
  const dt = state.lastNow ? Math.min(0.1, Math.max(0.001, (now - state.lastNow) / 1000)) : 1 / 30;
  state.lastNow = now;
  state.lastFrameAt = performance.now();

  const t0 = performance.now();
  tracker.process(src, now, vw, vh);
  const t1 = performance.now();

  const lensOn = !state.comparing && MODES[state.mode] !== 'off';
  if (tracker.segState === 'ready' && tracker.mask) state.maskOn = Math.min(1, state.maskOn + dt * 2);

  // whole body (shoulders in view): costume pieces + the view from behind
  const B = lensOn ? bodyFrame(tracker.pose, W, H, mirror) : null;
  if (B && OPT.back) B.front = -1;
  const frames = [];
  const faces = lensOn && !(B && OPT.back) ? tracker.faces : [];
  for (const face of faces) {
    const pup = puppetFor(face.id);
    const pose = fitPose(face.lm, W, H, mirror, pup.X, pup.Y, pup.Z);
    const withBody = B && face.id === tracker.poseFaceId ? B : null;
    let neckline = null;
    if (!withBody) {
      const nl = tracker.findNeckline(face.lm);
      if (nl) neckline = [(mirror ? 1 - nl.x : nl.x) * W, nl.y * H];
    }
    const F = {
      W, H, mirror, X: pup.X, Y: pup.Y, pose, s: pose.s, body: withBody,
      bs: (n) => tracker.blend(face, n), time: now / 1000, dt, neckline,
      hairAt: (x, y) => hairAt(x, y, W, H, mirror), forceSpell: OPT.spell,
    };
    pup.charm.update(F);
    frames.push({ F, charm: pup.charm });
  }
  for (const id of puppets.keys()) if (!faces.some((f) => f.id === id)) puppets.delete(id);
  frames.sort((a, b) => a.F.s - b.F.s); // farther faces first
  window.__lens.face = faces.length > 0;
  window.__lens.faces = faces.length;
  window.__lens.body = B ? { front: +B.front.toFixed(2), hips: B.hipsOk, poseFace: tracker.poseFaceId } : null;
  window.__lens.slots = faces.map((f) => ({ id: f.id, synthetic: f.synthetic }));
  const backView = B && !frames.some((f) => f.F.body) && B.front < -0.12;

  const panels = frames.map((f) => (f.F.body ? body.panel(f.F.body) : f.charm.panel()));
  if (B && !frames.some((f) => f.F.body)) panels.push(body.panel(B));
  toon.uploadMask(tracker.mask);
  toon.render(src, {
    mirror, maskOn: state.maskOn, maskRoi: tracker.mask && tracker.mask.roi,
    maskTexel: tracker.mask ? [tracker.mask.roi.w / tracker.mask.w, tracker.mask.roi.h / tracker.mask.h] : [0, 0],
    mode: lensOn ? state.mode : 3, time: now / 1000, ink: Math.max(1.5, H / 400),
    panels: panels.slice(-2), body: body.uniforms(B),
  });
  outCtx.drawImage(glCanvas, 0, 0);

  if (frames.length || B) {
    backCtx.clearRect(0, 0, W, H);
    for (const { F, charm } of frames) charm.drawBack(backCtx, F);
    const m = tracker.mask;
    if (m && state.maskOn > 0) {
      const r = m.roi;
      backCtx.save();
      backCtx.globalCompositeOperation = 'destination-out';
      backCtx.globalAlpha = state.maskOn;
      if (mirror) { backCtx.translate(W, 0); backCtx.scale(-1, 1); }
      backCtx.drawImage(m.cutCanvas, r.x * W, r.y * H, r.w * W, r.h * H);
      backCtx.restore();
    }
    outCtx.drawImage(back, 0, 0);
    const lw = B ? Math.max(1.6, (B.scale / 34) * 0.11) : 2;
    if (backView) body.drawBackView(outCtx, B, dt, lw);
    if (OPT.figure && B && !backView) {
      const sampleCol = (x, y) => {
        const d = outCtx.getImageData(Math.max(0, Math.min(W - 1, x | 0)), Math.max(0, Math.min(H - 1, y | 0)), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      body.drawFigure(outCtx, B, sampleCol, lw);
    }
    for (const { F, charm } of frames) charm.drawFront(outCtx, F);
  }
  const t2 = performance.now();

  // hints
  if (!faces.length && !B && lensOn) {
    if (!state.noFaceSince) state.noFaceSince = now;
    else if (now - state.noFaceSince > 1500) setStatus('Show me your face 👀', true);
  } else if (state.noFaceSince) {
    state.noFaceSince = 0;
    setStatus('', true);
  }

  state.frames++;
  window.__lens.frames = state.frames;
  state.fps = state.fps ? state.fps * 0.95 + (1 / dt) * 0.05 : 1 / dt;
  state.timings.track = state.timings.track * 0.9 + (t1 - t0) * 0.1;
  state.timings.draw = state.timings.draw * 0.9 + (t2 - t1) * 0.1;
  if (OPT.debug && state.frames % 10 === 0) {
    const d = tracker.delegates;
    ui.stats.hidden = false;
    ui.stats.textContent = `${W}x${H} ${state.fps.toFixed(0)} fps | track ${state.timings.track.toFixed(1)} ms | draw ${state.timings.draw.toFixed(1)} ms | face ${d.face} pose ${d.pose || '-'} seg ${d.seg || tracker.segState} x${tracker.segEvery}${B ? ` | facing ${B.front.toFixed(2)}` : ''}`;
  }
}

// ---------- UI ----------
let toastTimer = 0;
function toast(msg, ms = 2200) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('on'), ms);
}

let statusOwner = null;
function setStatus(msg, face = false) {
  // face hints take priority over loading text
  if (!face && statusOwner === 'face' && ui.status.textContent) return;
  statusOwner = face ? 'face' : 'load';
  ui.status.textContent = msg;
  ui.status.classList.toggle('on', !!msg);
}

const MODE_NAMES = { lair: 'Lair', glass: 'Stained glass', comic: 'Comic', off: 'Lens off' };
function updateModeLabel() {
  ui.modeLabel.textContent = MODE_NAMES[MODES[state.mode]];
}
function cycleMode(step = 1) {
  state.mode = (state.mode + step + MODES.length) % MODES.length;
  updateModeLabel();
  toast(MODE_NAMES[MODES[state.mode]], 900);
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) state.wake = await navigator.wakeLock.request('screen');
  } catch (_) { /* optional */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !state.running) return;
  requestWakeLock();
  const t = state.stream && state.stream.getVideoTracks()[0];
  if (!OPT.src && (!t || t.readyState === 'ended')) startCamera(state.facing).catch((e) => showError(explain(e)));
});

ui.go.addEventListener('click', boot);
ui.retry.addEventListener('click', boot);
ui.flip.addEventListener('click', flipCamera);
ui.modeBtn.addEventListener('click', () => cycleMode(1));
const setCompare = (on) => { state.comparing = on; ui.compare.classList.toggle('down', on); };
ui.compare.addEventListener('pointerdown', (e) => { e.preventDefault(); setCompare(true); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) ui.compare.addEventListener(ev, () => setCompare(false));

// stage gestures: swipe = change background, double tap = flip camera
{
  // event timestamps, not handler time: a busy frame must not turn a swipe into a drag
  let sx = 0, sy = 0, st = 0, lastTap = -1e9;
  ui.stage.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; st = e.timeStamp; });
  ui.stage.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy, dtm = e.timeStamp - st;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dtm < 700) { cycleMode(dx < 0 ? 1 : -1); return; }
    if (Math.hypot(dx, dy) < 12 && dtm < 300) {
      if (e.timeStamp - lastTap < 320) { lastTap = -1e9; flipCamera(); } else lastTap = e.timeStamp;
    }
  });
}

// recording (hold the shutter, or R on a keyboard)
const MAX_REC_MS = 60000;
let recording = false;
function resetShutter() {
  ui.shutter.classList.remove('down', 'rec');
  ui.ring.style.strokeDashoffset = '289';
}
async function startRecording() {
  if (recording || !capture) return;
  recording = await capture.startVideo((p) => {
    ui.ring.style.strokeDashoffset = `${(1 - p) * 289}`;
  }, MAX_REC_MS, () => { recording = false; resetShutter(); });
  if (recording) ui.shutter.classList.add('rec');
}
function stopRecording() {
  if (!recording) return;
  recording = false;
  capture.stopVideo();
  resetShutter();
}
function takePhoto() {
  if (!capture) return;
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('on');
  capture.photo();
}

// shutter: tap = photo, hold = video (like Snapchat)
{
  let holdTimer = 0, downAt = 0;
  const start = (e) => {
    e.preventDefault();
    if (!state.running || !capture) return;
    downAt = performance.now();
    ui.shutter.classList.add('down');
    holdTimer = setTimeout(() => { holdTimer = 0; startRecording(); }, 280);
  };
  const end = () => {
    if (!downAt) return;
    downAt = 0;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = 0;
      resetShutter();
      takePhoto();
      return;
    }
    stopRecording();
    resetShutter();
  };
  ui.shutter.addEventListener('pointerdown', start);
  ui.shutter.addEventListener('pointerup', end);
  ui.shutter.addEventListener('pointercancel', end);
  ui.shutter.addEventListener('pointerleave', end);
  ui.shutter.addEventListener('contextmenu', (e) => e.preventDefault());
}

// keyboard (desktop): Space photo, R record, arrows background, H hide the UI, M mirror, C camera, F fullscreen
document.addEventListener('keydown', (e) => {
  if (!state.running || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'enter') { e.preventDefault(); takePhoto(); }
  else if (k === 'r') { if (recording) stopRecording(); else startRecording(); }
  else if (k === 'arrowright') cycleMode(1);
  else if (k === 'arrowleft') cycleMode(-1);
  else if (k === 'h') {
    const hide = !document.body.classList.contains('clean');
    document.body.classList.toggle('clean', hide);
    if (hide) toast('UI hidden — press H to bring it back', 1500);
  } else if (k === 'm') {
    state.mirror = !state.mirror;
    tracker.resetSmoothing();
    puppets.clear();
    body.reset();
    toast(state.mirror ? 'Mirrored' : 'Not mirrored', 900);
  } else if (k === 'c') flipCamera();
  else if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
});
if (!TOUCH) ui.hint.textContent = 'Space photo · R record · ← → background · H hide UI · F fullscreen';

if ('serviceWorker' in navigator && !params.has('nosw') && !OPT.local && !OPT.src && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

if (params.has('autostart') || OPT.src || OPT.desktop) boot();
