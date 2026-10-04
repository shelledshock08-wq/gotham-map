// Sound effects (Kenney CC0 samples) + original chiptune music synthesized live
// with the Web Audio API.
'use strict';

const SFX_NAMES = ['jump', 'spring', 'hurt', 'death', 'charge', 'release', 'pop', 'boom', 'monitor',
  'checkpoint', 'skid', 'shield', 'select', 'bosshit', 'roll', 'ringloss', 'actclear', 'gameover',
  'oneup', 'start'];

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(n) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) return null;
  let v = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return v + 12 * (parseInt(m[3], 10) + 1);
}
const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Chord symbol -> [root midi (octave 2), third, fifth]
function chordTones(sym) {
  const m = /^([A-G][#b]?)(m?)$/.exec(sym);
  const root = noteToMidi(m[1] + '2');
  return [root, root + (m[2] ? 3 : 4), root + 7];
}

const SONGS = {
  meadow: {
    bpm: 150, drums: 'pop', bass: 'bounce', duty: 0.25,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
    lead: [
      'E5 - G5 - C6 - - B5 A5 - G5 - E5 - D5 -',
      'C5 - E5 - A5 - - G5 E5 - C5 - D5 - E5 -',
      'F5 - A5 - C6 - A5 - G5 - F5 - E5 - F5 -',
      'G5 - - - D5 - G5 - B5 - - - A5 - B5 -',
      'C6 - - B5 C6 - G5 - E5 - G5 - C6 - D6 -',
      'E6 - D6 - C6 - A5 - - - E5 - A5 - B5 -',
      'C6 - A5 - F5 - A5 - C6 - D6 - C6 - A5 -',
      'B5 - - - - - G5 - A5 - B5 - D6 - - -',
    ],
  },
  dunes: {
    bpm: 138, drums: 'shuffle', bass: 'walk', duty: 0.125,
    chords: ['Am', 'G', 'F', 'E', 'Am', 'G', 'F', 'E'],
    lead: [
      'A4 - C5 - E5 - A5 - G5 - E5 - D5 - C5 -',
      'B4 - D5 - G5 - - - F#5 - D5 - B4 - D5 -',
      'C5 - F5 - A5 - - - G5 - F5 - E5 - C5 -',
      'B4 - E5 - G#5 - - - B5 - - - G#5 - E5 -',
      'A5 - - - E5 - A5 - C6 - B5 - A5 - G5 -',
      'G5 - - - D5 - G5 - B5 - A5 - G5 - F#5 -',
      'F5 - - - C5 - F5 - A5 - G5 - F5 - E5 -',
      'E5 - - - - - - - G#5 - - - B5 - - -',
    ],
  },
  fortress: {
    bpm: 132, drums: 'pop', bass: 'drive', duty: 0.25,
    chords: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'C', 'A'],
    lead: [
      'D5 - - - A4 - D5 - F5 - E5 - D5 - C5 -',
      'D5 - - - F5 - - - Bb4 - - - - - - -',
      'C5 - - - G4 - C5 - E5 - D5 - C5 - Bb4 -',
      'A4 - - - C#5 - - - E5 - - - A5 - - -',
      'D6 - - - A5 - - - F5 - - - D5 - - -',
      'F5 - E5 - D5 - F5 - Bb5 - - - A5 - G5 -',
      'G5 - - - E5 - C5 - G5 - - - E5 - C5 -',
      'A5 - G5 - F5 - E5 - C#5 - - - A4 - - -',
    ],
  },
  boss: {
    bpm: 168, drums: 'boss', bass: 'drive', duty: 0.5,
    chords: ['Em', 'C', 'D', 'B', 'Em', 'C', 'D', 'B'],
    lead: [
      'E5 E5 . E5 G5 . E5 . F#5 . G5 . A5 . G5 F#5',
      'E5 - - - C5 - - - G5 - - - E5 - C5 -',
      'F#5 F#5 . F#5 A5 . F#5 . G5 . A5 . B5 . A5 G5',
      'F#5 - - - D#5 - - - B4 - D#5 - F#5 - B5 -',
      'B5 - - - G5 - E5 - B5 - - - C6 - B5 -',
      'A5 - - - G5 - E5 - C5 - - - E5 - G5 -',
      'A5 - - - F#5 - D5 - A5 - - - B5 - A5 -',
      'F#5 - - - - - - - D#5 - - - B4 - - -',
    ],
  },
  final: {
    bpm: 184, drums: 'boss', bass: 'drive', duty: 0.25,
    chords: ['Em', 'C', 'D', 'B', 'Em', 'C', 'D', 'B'],
    lead: [
      'B5 - - - G5 - E5 - B5 - - - C6 - B5 -',
      'A5 - - - G5 - E5 - C5 - - - E5 - G5 -',
      'A5 - - - F#5 - D5 - A5 - - - B5 - A5 -',
      'F#5 - - - - - - - D#5 - - - B4 - - -',
      'E5 E5 . E5 G5 . E5 . F#5 . G5 . A5 . G5 F#5',
      'E5 - - - C5 - - - G5 - - - E5 - C5 -',
      'F#5 F#5 . F#5 A5 . F#5 . G5 . A5 . B5 . A5 G5',
      'B5 - - - A5 - - - G5 - - - F#5 - - -',
    ],
  },
  escape: {
    bpm: 200, drums: 'boss', bass: 'drive', duty: 0.25,
    chords: ['Am', 'F', 'G', 'E', 'Am', 'F', 'G', 'E'],
    lead: [
      'A5 - - A5 C6 - A5 - E6 - D6 - C6 - B5 -',
      'A5 - - - F5 - A5 - C6 - - - A5 - C6 -',
      'D6 - - D6 B5 - G5 - D6 - E6 - D6 - B5 -',
      'G#5 - - - E5 - G#5 - B5 - - - E6 - - -',
      'A5 A5 . A5 C6 . E6 . A6 - - - G6 - E6 -',
      'F6 - - - C6 - A5 - F5 - A5 - C6 - F6 -',
      'G6 - - - D6 - B5 - G5 - B5 - D6 - G6 -',
      'G#6 - - - E6 - - - B5 - - - G#5 - - -',
    ],
  },
  ruins: {
    bpm: 112, drums: 'shuffle', bass: 'walk', duty: 0.125,
    chords: ['Em', 'C', 'D', 'Em', 'Am', 'C', 'B', 'B'],
    lead: [
      'E5 - - G5 - - B5 - A5 - G5 - F#5 - E5 -',
      'E5 - - - C5 - E5 - G5 - - - E5 - - -',
      'D5 - - F#5 - - A5 - G5 - F#5 - E5 - D5 -',
      'E5 - - - - - B4 - E5 - - - G5 - - -',
      'A5 - - - E5 - A5 - C6 - B5 - A5 - G5 -',
      'G5 - - - E5 - C5 - E5 - - - G5 - - -',
      'F#5 - - - D#5 - B4 - D#5 - F#5 - B5 - - -',
      'B5 - - - A5 - - - G5 - - - F#5 - - -',
    ],
  },
  special: {
    bpm: 176, drums: 'pop', bass: 'bounce', duty: 0.25,
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
    lead: [
      'E5 G5 C6 . G5 . E5 . G5 . C6 . E6 - D6 -',
      'D5 G5 B5 . G5 . D5 . G5 . B5 . D6 - C6 -',
      'C5 E5 A5 . E5 . C5 . E5 . A5 . C6 - B5 -',
      'A4 C5 F5 . C5 . A4 . F5 - A5 - C6 - - -',
      'E6 - D6 - C6 - G5 - E6 - D6 - C6 - D6 -',
      'D6 - B5 - G5 - D5 - G5 - B5 - D6 - - -',
      'C6 - A5 - F5 - C5 - F5 - A5 - C6 - D6 -',
      'D6 - - - B5 - - - G5 - - - D6 - - -',
    ],
  },
  skychase: {
    // minor and slow: the sky is wrong tonight
    bpm: 132, drums: 'shuffle', bass: 'walk', duty: 0.125,
    chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'],
    lead: [
      'D5 - - - F5 - - - A5 - - G#5 A5 - - -',
      'Bb5 - - - A5 - F5 - D5 - - - - - - -',
      'G5 - - - Bb5 - - - D6 - - C#6 D6 - - -',
      'C#6 - - - A5 - E5 - C#5 - - - - - - -',
      'D6 - - - C6 - - - A5 - - - F5 - - -',
      'F5 - - - E5 - D5 - Bb4 - - - - - - -',
      'G5 - - - F5 - - - E5 - - - D5 - - -',
      'C#5 - - - - - - - A4 - - - - - - -',
    ],
  },
  crisis: {
    bpm: 184, drums: 'boss', bass: 'drive', duty: 0.125,
    chords: ['Em', 'C', 'D', 'B', 'Em', 'C', 'Am', 'B'],
    lead: [
      'E5 E5 . G5 . B5 . E6 - D6 - B5 - G5 -',
      'E5 - - - C6 - B5 - G5 - E5 - G5 - - -',
      'F#5 F#5 . A5 . D6 . F#6 - E6 - D6 - A5 -',
      'D#6 - - - B5 - F#5 - D#5 - F#5 - B5 - - -',
      'E6 - - - B5 - G5 - E5 - G5 - B5 - E6 -',
      'G6 - - - E6 - C6 - G5 - C6 - E6 - G6 -',
      'A6 - - - E6 - C6 - A5 - C6 - E6 - A6 -',
      'B6 - - - A6 - - - F#6 - - - D#6 - - -',
    ],
  },
  invincible: {
    bpm: 190, drums: 'boss', bass: 'drive', duty: 0.25, arpLead: true,
    chords: ['C', 'F', 'G', 'C', 'Am', 'F', 'G', 'G'],
  },
};

const Sound = {
  ctx: null,
  master: null, sfxGain: null, musicGain: null,
  buffers: {}, fallback: {},
  muted: false,
  song: null, songName: null, step: 0, nextTime: 0, timer: null,
  pulseWaves: {},
  noiseBuf: null,
  ringPan: 1,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.7; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.55; this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loadSamples();
    if (this.pendingSong) { const s = this.pendingSong; this.pendingSong = null; this.playMusic(s); }
  },

  loadSamples() {
    for (const name of SFX_NAMES) {
      const path = `assets/sfx/${name}.mp3`;
      const embedded = window.EMBEDDED_ASSETS && window.EMBEDDED_ASSETS[path];
      const url = embedded || path;
      const getData = embedded
        ? Promise.resolve().then(() => {   // standalone build: decode the data: URI directly
          const bin = atob(embedded.slice(embedded.indexOf(',') + 1));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes.buffer;
        })
        : fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
      getData
        .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
        .then((buf) => { this.buffers[name] = buf; })
        .catch(() => {
          // file:// pages can't fetch(); fall back to <audio> elements.
          const a = new window.Audio(url); a.preload = 'auto';
          this.fallback[name] = a;
        });
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    if (this.trackEl) this.trackEl.muted = this.muted;
    try { localStorage.setItem('sonic_muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
  },

  play(name, opts = {}) {
    if (!this.ctx || this.muted) return;
    const buf = this.buffers[name];
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate || 1;
      const g = this.ctx.createGain(); g.gain.value = opts.vol == null ? 1 : opts.vol;
      src.connect(g); g.connect(opts.music ? this.musicGain : this.sfxGain);
      src.start();
      return;
    }
    const fb = this.fallback[name];
    if (fb) {
      const a = fb.cloneNode();
      a.volume = Math.min(1, (opts.vol == null ? 1 : opts.vol) * 0.7);
      a.play().catch(() => {});
    }
  },

  // Classic two-tone ring chime, alternating left/right.
  ring() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    let out = this.sfxGain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      this.ringPan = -this.ringPan; p.pan.value = this.ringPan * 0.6;
      p.connect(this.sfxGain); out = p;
    }
    const tones = [[1318.5, 0, 0.07], [1975.5, 0.06, 0.32]];
    for (const [f, dt, dur] of tones) {
      const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.09, t + dt + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + dur);
      o.connect(g); o2.connect(g); g.connect(out);
      o.start(t + dt); o.stop(t + dt + dur + 0.02);
      o2.start(t + dt); o2.stop(t + dt + dur + 0.02);
    }
  },

  // The boost: a sonic-boom blast when it kicks in...
  boostBurst() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const out = c.createGain(); out.gain.value = 1; out.connect(this.sfxGain);
    // sub-bass thump that drops away
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.45);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.6);
    // the blast: noise swept through a band-pass, low to high
    if (this.noiseBuf) {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(5200, t + 0.35);
      const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.75, t + 0.03); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      n.connect(f); f.connect(ng); ng.connect(out); n.start(t); n.stop(t + 0.75);
    }
    // a rising jet whine on top
    const w = c.createOscillator(); w.type = 'sawtooth';
    w.frequency.setValueAtTime(220, t); w.frequency.exponentialRampToValueAtTime(1400, t + 0.4);
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 2400;
    const wg = c.createGain(); wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.12, t + 0.05); wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    w.connect(wf); wf.connect(wg); wg.connect(out); w.start(t); w.stop(t + 0.55);
  },

  // ...and a jet-engine roar held while boosting (0 = off).
  boostHold(level) {
    if (!this.ctx || !this.noiseBuf) return;
    const c = this.ctx, t = c.currentTime;
    if (!this.boostNode && level > 0 && !this.muted) {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.9;
      const lo = c.createBiquadFilter(); lo.type = 'lowpass'; lo.frequency.value = 220;
      const g = c.createGain(); g.gain.value = 0.0001;
      const rum = c.createOscillator(); rum.type = 'sawtooth'; rum.frequency.value = 46;
      const rg = c.createGain(); rg.gain.value = 0.18;
      n.connect(f); f.connect(g); rum.connect(lo); lo.connect(rg); rg.connect(g); g.connect(this.sfxGain);
      n.start(); rum.start();
      this.boostNode = { n, f, g, rum };
    }
    const B = this.boostNode;
    if (!B) return;
    const v = this.muted ? 0 : level;
    B.g.gain.setTargetAtTime(Math.max(0.0001, 0.42 * v), t, 0.05);
    B.f.frequency.setTargetAtTime(700 + 900 * v + Math.random() * 200, t, 0.1);
    if (level <= 0) {
      const node = B; this.boostNode = null;
      node.g.gain.setTargetAtTime(0.0001, t, 0.08);
      setTimeout(() => { try { node.n.stop(); node.rum.stop(); } catch (e) { /* already stopped */ } }, 400);
    }
  },

  // ---------- music ----------
  pulse(duty) {
    if (this.pulseWaves[duty]) return this.pulseWaves[duty];
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) im[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    return (this.pulseWaves[duty] = this.ctx.createPeriodicWave(re, im));
  },

  // Streamed song (used for the final battle). Falls back to a synth song if the file is missing.
  playTrack(path, fallbackSong) {
    if (this.trackPath === path) return;
    this.stopMusic(); this.stopTrack();
    this.trackPath = path;
    const src = (window.EMBEDDED_ASSETS && window.EMBEDDED_ASSETS[path]) || path;
    const a = new window.Audio(src);
    a.loop = true; a.volume = 0.85; a.muted = this.muted;
    a.onerror = () => { if (this.trackEl === a) { this.trackEl = null; this.playMusic(fallbackSong, true); } };
    this.trackEl = a;
    const p = a.play(); if (p && p.catch) p.catch(() => {});
  },
  stopTrack() {
    if (this.trackEl) { this.trackEl.pause(); this.trackEl = null; }
    this.trackPath = null;
  },
  pauseTrack(paused) {
    if (!this.trackEl) return;
    if (paused) this.trackEl.pause(); else { const p = this.trackEl.play(); if (p && p.catch) p.catch(() => {}); }
  },

  playMusic(name, keepTrackPath) {
    if (!keepTrackPath && this.trackEl) this.stopTrack();
    if (!this.ctx) { this.pendingSong = name; return; }
    if (this.songName === name) return;
    this.stopMusic();
    const song = SONGS[name];
    if (!song) return;
    this.song = this.compile(song);
    this.songName = name;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  },

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.song = null; this.songName = null;
  },

  compile(song) {
    const stepDur = 60 / song.bpm / 4;
    const bars = song.chords.length;
    const lead = [];
    if (song.arpLead) {
      for (const ch of song.chords) {
        const [r, t3, t5] = chordTones(ch);
        const seq = [r + 36, t3 + 36, t5 + 36, r + 48];
        for (let i = 0; i < 16; i++) lead.push({ midi: seq[i % 4] + (i >= 8 ? 12 : 0), len: 1 });
      }
    } else {
      const toks = song.lead.join(' ').split(/\s+/);
      for (let i = 0; i < toks.length; i++) {
        const tk = toks[i];
        if (tk === '-' || tk === '.') { lead.push(null); continue; }
        let len = 1;
        while (toks[i + len] === '-') len++;
        lead.push({ midi: noteToMidi(tk), len });
      }
    }
    return { ...song, stepDur, total: bars * 16, leadSteps: lead };
  },

  schedule() {
    if (!this.song) return;
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextTime < ahead) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.song.stepDur;
      this.step = (this.step + 1) % this.song.total;
    }
  },

  tone(type, freq, t, dur, vol, dest) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(t, dur, vol, filterType, freq) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.musicGain);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },

  // Body-blow impact: sharp slap transient + low thump (+ crunch for big hits)
  punch(power = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, out = this.sfxGain;
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 500; bp.Q.value = 0.8;
    const g1 = this.ctx.createGain();
    g1.gain.setValueAtTime(0.9 * power, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.07 + 0.05 * power);
    n.connect(bp); bp.connect(g1); g1.connect(out); n.start(t, Math.random() * 0.5); n.stop(t + 0.2);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120 + 30 * power, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16 + 0.08 * power);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.9 * Math.min(1.4, power), t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22 + 0.1 * power);
    o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 0.4);
    if (power > 1.2) {
      const c = this.ctx.createBufferSource(); c.buffer = this.noiseBuf;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const g3 = this.ctx.createGain(); g3.gain.setValueAtTime(0.35, t + 0.01); g3.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      c.connect(hp); hp.connect(g3); g3.connect(out); c.start(t + 0.01, Math.random()); c.stop(t + 0.12);
    }
  },

  // Tornado machine gun: a short filtered crack
  gun() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, out = this.sfxGain;
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 600; f.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.5); n.stop(t + 0.08);
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.05);
    const g2 = this.ctx.createGain(); g2.gain.setValueAtTime(0.08, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 0.08);
  },
  // Sky Chase dread: a low detuned drone that breathes, set by level 0..1
  drone(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.droneNodes) {
      if (level <= 0) return;
      const g = this.ctx.createGain(); g.gain.value = 0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 6;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
      const lg = this.ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      const oscs = [[55, 'sawtooth'], [55.6, 'sawtooth'], [82.2, 'sine'], [116.3, 'triangle']].map(([fr, ty]) => {
        const o = this.ctx.createOscillator(); o.type = ty; o.frequency.value = fr; o.connect(f); o.start(); return o;
      });
      f.connect(g); g.connect(this.sfxGain);
      this.droneNodes = { g, oscs, lfo };
    }
    this.droneNodes.g.gain.setTargetAtTime(this.muted ? 0 : level * 0.16, t, 0.6);
  },
  // a breathy, wordless whisper panned to one side
  whisper() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, dur = 0.9 + Math.random() * 0.6;
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 900; f.Q.value = 3;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 6; i++) g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.09, t + dur * (i + 0.5) / 6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (this.ctx.createStereoPanner) { const pn = this.ctx.createStereoPanner(); pn.pan.value = Math.random() < 0.5 ? -0.8 : 0.8; g.connect(pn); out = pn; }
    n.connect(f); f.connect(g); out.connect(this.sfxGain); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  },

  // Zombot energy bolt: a falling sci-fi zap
  zap(vol = 0.25) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, out = this.sfxGain;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1400 + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.22);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.26);
  },

  kick(t) {
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.18);
  },

  playStep(step, t) {
    const s = this.song, sd = s.stepDur;
    const bar = Math.floor(step / 16), pos = step % 16;
    const [root, third, fifth] = chordTones(s.chords[bar]);

    // lead
    const n = s.leadSteps[step];
    if (n && n.midi != null) this.tone(this.pulse(s.duty), midiToFreq(n.midi), t, n.len * sd * 0.92, 0.075);

    // arpeggio pad (quiet)
    if (!s.arpLead && pos % 2 === 0) {
      const arp = [root, third, fifth, third][(pos / 2) % 4] + 24;
      this.tone(this.pulse(0.125), midiToFreq(arp), t, sd * 0.9, 0.022);
    }

    // bass
    const bassVol = 0.2;
    if (s.bass === 'bounce' && pos % 2 === 0) {
      this.tone('triangle', midiToFreq(root + ((pos / 2) % 2 ? 12 : 0)), t, sd * 1.8, bassVol);
    } else if (s.bass === 'walk' && pos % 4 === 0) {
      const walk = [root, root + 7, root + 12, fifth][pos / 4];
      this.tone('triangle', midiToFreq(walk), t, sd * 3.6, bassVol);
    } else if (s.bass === 'drive' && pos % 2 === 0) {
      this.tone('triangle', midiToFreq(root + (pos % 8 === 6 ? 12 : 0)), t, sd * 1.6, bassVol);
    }

    // drums
    if (s.drums === 'pop') {
      if (pos === 0 || pos === 8 || pos === 10) this.kick(t);
      if (pos === 4 || pos === 12) this.noise(t, 0.14, 0.32, 'bandpass', 1800);
      if (pos % 2 === 0) this.noise(t, 0.035, 0.12, 'highpass', 7000);
    } else if (s.drums === 'shuffle') {
      if (pos === 0 || pos === 7 || pos === 8) this.kick(t);
      if (pos === 4 || pos === 12) this.noise(t, 0.12, 0.28, 'bandpass', 1600);
      if (pos % 4 !== 1) this.noise(t, 0.03, 0.1, 'highpass', 8000);
    } else if (s.drums === 'boss') {
      if (pos % 4 === 0 || pos === 14) this.kick(t);
      if (pos === 4 || pos === 12) this.noise(t, 0.16, 0.34, 'bandpass', 1500);
      this.noise(t, 0.025, 0.08, 'highpass', 9000);
    }
  },
};
