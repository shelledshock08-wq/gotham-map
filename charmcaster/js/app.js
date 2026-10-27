// Charmcaster Lens: camera -> tracking -> cartoon pass -> drawn head -> screen.

import { Tracker } from './tracker.js';
import { ToonRenderer, MODES } from './toon.js';
import { Charm } from './charm.js';
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
};

const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start'), go: $('go'), loader: $('loader'), bar: $('bar'), loadText: $('load-text'),
  err: $('err'), errText: $('err-text'), retry: $('retry'),
  stage: $('stage'), video: $('cam'), out: $('out'),
  hud: $('hud'), flip: $('flip'), modeBtn: $('mode'), modeLabel: $('mode-label'), compare: $('compare'),
  shutter: $('shutter'), ring: $('ring-progress'), toast: $('toast'), status: $('status'), stats: $('stats'),
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
  return fitSimilarity(mirror ? P_MIRROR : P_PLAIN, Q, RIGID_W);
}

// How much of the user's own hair is at a screen point (0..1), from the smoothed mask.
function hairAt(x, y, W, H, mirror) {
  const m = tracker && tracker.mask;
  if (!m || state.maskOn <= 0) return 0;
  const u = mirror ? 1 - x / W : x / W, v = y / H;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
  return m.soft[(Math.floor(v * m.h) * m.w + Math.floor(u * m.w)) * 4];
}

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
function showError(msg) {
  console.error(msg);
  ui.loader.hidden = true;
  ui.err.hidden = false;
  ui.errText.textContent = msg;
  window.__lens.error = msg;
}

function setProgress(p, text) {
  ui.bar.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
  if (text) ui.loadText.textContent = text;
}

async function boot() {
  ui.start.hidden = true;
  ui.err.hidden = true;
  ui.loader.hidden = false;
  setProgress(0.03, 'Opening your camera…');
  try {
    toon = toon || new ToonRenderer(glCanvas);
  } catch (e) {
    showError('This browser has no WebGL2, which the lens needs. Try Chrome, Safari 15+ or Firefox.');
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
  requestWakeLock();
  loop();
  tracker.loadSegmenter();
}

function explain(e) {
  const name = e && e.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow the camera for this site in your browser settings, then tap Try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it and tap Try again.';
  if (!window.isSecureContext) return 'The camera only works over https:// (or on localhost).';
  return `Something went wrong: ${e && e.message ? e.message : e}`;
}

async function startCamera(facing) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('Camera API unavailable'), { name: window.isSecureContext ? 'NotFoundError' : 'SecurityError' });
  }
  stopCamera();
  // ask for frames in the screen's orientation (portrait on phones) so nothing gets cropped
  const portrait = window.innerHeight > window.innerWidth;
  const video = {
    facingMode: facing, frameRate: { ideal: 30 },
    width: { ideal: portrait ? 720 : 1280 }, height: { ideal: portrait ? 1280 : 720 },
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
  state.facing = settings.facingMode || facing;
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

async function flipCamera() {
  if (OPT.src) return;
  const next = state.facing === 'user' ? 'environment' : 'user';
  try {
    await startCamera(next);
  } catch (e) {
    toast('Could not switch camera');
    try { await startCamera(state.facing); } catch (_) { /* leave it */ }
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

  const frames = [];
  const faces = lensOn ? tracker.faces : [];
  for (const face of faces) {
    const pup = puppetFor(face.id);
    const pose = fitPose(face.lm, W, H, mirror, pup.X, pup.Y, pup.Z);
    let neckline = null;
    const nl = tracker.findNeckline(face.lm);
    if (nl) neckline = [(mirror ? 1 - nl.x : nl.x) * W, nl.y * H];
    const F = {
      W, H, mirror, X: pup.X, Y: pup.Y, pose, s: pose.s,
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

  toon.uploadMask(tracker.mask);
  toon.render(src, {
    mirror, maskOn: state.maskOn, mode: lensOn ? state.mode : 3, time: now / 1000,
    panels: frames.slice(-2).map((f) => f.charm.panel(f.F)), panelGrow: 0.1, ink: Math.max(1.5, H / 400),
  });
  outCtx.drawImage(glCanvas, 0, 0);

  if (frames.length) {
    backCtx.clearRect(0, 0, W, H);
    for (const { F, charm } of frames) charm.drawBack(backCtx, F);
    const m = tracker.mask;
    if (m && state.maskOn > 0) {
      backCtx.save();
      backCtx.globalCompositeOperation = 'destination-out';
      backCtx.globalAlpha = state.maskOn;
      if (mirror) { backCtx.translate(W, 0); backCtx.scale(-1, 1); }
      backCtx.drawImage(m.cutCanvas, 0, 0, W, H);
      backCtx.restore();
    }
    outCtx.drawImage(back, 0, 0);
    for (const { F, charm } of frames) charm.drawFront(outCtx, F);
  }
  const t2 = performance.now();

  // hints
  if (!faces.length && lensOn) {
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
    ui.stats.textContent = `${W}x${H} ${state.fps.toFixed(0)} fps | track ${state.timings.track.toFixed(1)} ms | draw ${state.timings.draw.toFixed(1)} ms | face ${d.face} seg ${d.seg || tracker.segState} x${tracker.segEvery}`;
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

// shutter: tap = photo, hold = video (like Snapchat)
{
  let holdTimer = 0, recording = false, downAt = 0;
  const MAX_MS = 60000;
  const start = (e) => {
    e.preventDefault();
    if (!state.running || !capture) return;
    downAt = performance.now();
    ui.shutter.classList.add('down');
    holdTimer = setTimeout(async () => {
      holdTimer = 0;
      recording = await capture.startVideo((p) => {
        ui.ring.style.strokeDashoffset = `${(1 - p) * 289}`;
      }, MAX_MS, () => { recording = false; finishUi(); });
      if (recording) ui.shutter.classList.add('rec');
    }, 280);
  };
  const finishUi = () => {
    ui.shutter.classList.remove('down', 'rec');
    ui.ring.style.strokeDashoffset = '289';
  };
  const end = () => {
    if (!downAt) return;
    downAt = 0;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = 0;
      finishUi();
      ui.flash.classList.remove('on');
      void ui.flash.offsetWidth;
      ui.flash.classList.add('on');
      capture.photo();
      return;
    }
    if (recording) { recording = false; capture.stopVideo(); }
    finishUi();
  };
  ui.shutter.addEventListener('pointerdown', start);
  ui.shutter.addEventListener('pointerup', end);
  ui.shutter.addEventListener('pointercancel', end);
  ui.shutter.addEventListener('pointerleave', end);
  ui.shutter.addEventListener('contextmenu', (e) => e.preventDefault());
}

document.addEventListener('keydown', (e) => {
  if (!state.running) return;
  if (e.key === ' ' || e.key === 'Enter') { capture && capture.photo(); }
  if (e.key === 'ArrowRight') cycleMode(1);
  if (e.key === 'ArrowLeft') cycleMode(-1);
});

if ('serviceWorker' in navigator && !params.has('nosw') && !OPT.local && !OPT.src && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

if (params.has('autostart') || OPT.src) boot();
