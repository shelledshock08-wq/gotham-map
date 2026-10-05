// Synthesised sound effects (Web Audio), so no audio files are needed.
let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.6;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function noise(t0, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.5, attack = 0.002 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

function tone(t0, dur, f0, f1, gain = 0.4, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export const sfx = {
  step(soft) {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.09, { type: 'lowpass', f0: soft ? 500 : 900, f1: 200, gain: soft ? 0.08 : 0.16 });
    noise(t, 0.03, { type: 'highpass', f0: 3000, gain: soft ? 0.02 : 0.05 });
  },
  swish(heavy) {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, heavy ? 0.3 : 0.18, { type: 'bandpass', f0: heavy ? 500 : 900, f1: heavy ? 3000 : 5000, q: 2, gain: heavy ? 0.45 : 0.32, attack: 0.04 });
  },
  slash(heavy) { // blade meets body
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.12, { type: 'highpass', f0: 2500, gain: 0.35 });
    noise(t, heavy ? 0.3 : 0.18, { type: 'lowpass', f0: 1200, f1: 200, gain: heavy ? 0.6 : 0.4 });
    tone(t, 0.18, heavy ? 110 : 150, 50, heavy ? 0.6 : 0.35);
  },
  slice() { // Blade Mode cut through
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.08, { type: 'highpass', f0: 5000, gain: 0.4 });
    noise(t + 0.03, 0.35, { type: 'bandpass', f0: 700, f1: 250, q: 1, gain: 0.45 });
  },
  clang(big) { // parry / block: steel on steel
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [f, g] of [[1450, 0.35], [2230, 0.22], [3390, 0.15], [870, 0.25]]) tone(t, big ? 0.9 : 0.45, f, f * 0.97, g * (big ? 1 : 0.6), 'triangle');
    noise(t, 0.06, { type: 'highpass', f0: 4000, gain: 0.5 });
  },
  glint(red) { // incoming attack tell
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(t, 0.25, red ? 2600 : 1700, red ? 3200 : 1500, 0.12, 'sine');
  },
  bladeIn() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.6, 300, 90, 0.3); noise(t, 0.5, { type: 'bandpass', f0: 2000, f1: 400, q: 1, gain: 0.2, attack: 0.1 }); },
  bladeOut() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.3, 90, 300, 0.2); },
  zandatsu() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(t, 1.2, 220, 220, 0.3, 'sawtooth'); tone(t, 1.2, 330, 330, 0.2, 'sawtooth'); tone(t + 0.1, 1.1, 440, 445, 0.25, 'triangle');
    noise(t, 0.4, { type: 'lowpass', f0: 800, f1: 100, gain: 0.5 });
  },
  hit(heavy) {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(t, heavy ? 0.25 : 0.15, heavy ? 120 : 160, 45, heavy ? 0.7 : 0.5);
    noise(t, 0.12, { type: 'lowpass', f0: 1800, f1: 300, gain: 0.5 });
  },
  shot(vol = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.35, { type: 'lowpass', f0: 6000, f1: 300, gain: 0.9 * vol, attack: 0.001 });
    tone(t, 0.3, 140, 40, 0.8 * vol);
    noise(t + 0.05, 0.8, { type: 'bandpass', f0: 600, f1: 150, q: 0.6, gain: 0.12, attack: 0.05 }); // room tail
  },
  click() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.03, { type: 'highpass', f0: 2500, gain: 0.25 });
    tone(t, 0.04, 1800, 900, 0.08, 'square');
  },
  draw() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.12, { type: 'bandpass', f0: 1500, f1: 600, q: 1.5, gain: 0.15, attack: 0.02 });
    noise(t + 0.12, 0.04, { type: 'highpass', f0: 3000, gain: 0.2 });
  },
  land() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.18, { type: 'lowpass', f0: 600, f1: 120, gain: 0.35 });
  },
  whoosh() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.45, { type: 'bandpass', f0: 300, f1: 1200, q: 0.8, gain: 0.2, attack: 0.15 });
  },
};
