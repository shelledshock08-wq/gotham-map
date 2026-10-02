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
      const url = `assets/sfx/${name}.mp3`;
      fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
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

  // ---------- music ----------
  pulse(duty) {
    if (this.pulseWaves[duty]) return this.pulseWaves[duty];
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) im[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    return (this.pulseWaves[duty] = this.ctx.createPeriodicWave(re, im));
  },

  playMusic(name) {
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
