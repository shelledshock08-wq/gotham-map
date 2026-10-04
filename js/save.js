// Save files, Sonic 3 & Knuckles style: three slots on a data select screen.
// A save remembers how far you got and what you did to Eggman. You can't pick
// stages until the slot is cleared, so the choice you made sticks.
'use strict';

const SAVE_KEY = 'sonic_anthology_saves';
const STAGES = [
  { id: 'act1', name: 'ACT 1' }, { id: 'act2', name: 'ACT 2' },
  { id: 'ruins', name: 'EMERALD RUINS' }, { id: 'special', name: 'SPECIAL STAGE' },
  { id: 'act3', name: 'ACT 3' }, { id: 'final', name: 'EGGMAN' },
  { id: 'escape', name: 'EGG BASE ESCAPE' }, { id: 'tornado', name: 'SKY CHASE' },
];
const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);

const Saves = {
  load() {
    try { const a = JSON.parse(localStorage.getItem(SAVE_KEY)); if (Array.isArray(a) && a.length === 3) return a; } catch (e) { /* ignore */ }
    return [null, null, null];
  },
  store(all) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } },
  get(i) { return this.load()[i]; },
  put(i, data) { const a = this.load(); a[i] = data; this.store(a); },
  erase(i) { this.put(i, null); },
};

// ---------------------------------------------------------- data select
class DataSelect {
  constructor(game) {
    this.g = game; this.sel = 0; this.t = 0; this.erase = -1; this.pick = null; this.msg = null;
    this.slots = Saves.load();
  }

  update(inp) {
    const g = this.g;
    this.t++;
    if (this.msg) { if (--this.msg.t <= 0) this.msg = null; }
    if (this.pick) return this.updatePick(inp);
    if (inp.leftPressed) { this.sel = (this.sel + 2) % 3; this.erase = -1; Sound.play('select', { vol: 0.5 }); }
    if (inp.rightPressed) { this.sel = (this.sel + 1) % 3; this.erase = -1; Sound.play('select', { vol: 0.5 }); }
    if ((inp.punchPressed || inp.startPressed || inp.tapped) && this.t > 10) {
      const s = this.slots[this.sel];
      if (!s) {
        // a new save is made the moment you start
        const data = { stage: 'act1', emeralds: [], emeraldCount: 0, eggChoice: null, done: false, score: 0, created: Date.now() };
        Saves.put(this.sel, data);
        Sound.play('checkpoint');
        g.startSave(this.sel, data);
      } else if (s.done) { this.pick = { i: stageIndex(s.stage) < 0 ? 0 : stageIndex(s.stage) }; Sound.play('select'); }
      else { Sound.play('start', { vol: 0.8 }); g.startSave(this.sel, s); }
      return;
    }
    // erase: press the grab button twice on a used slot
    if (inp.grabPressed && this.slots[this.sel]) {
      if (this.erase === this.sel) { Saves.erase(this.sel); this.slots = Saves.load(); this.erase = -1; Sound.play('boom', { vol: 0.5 }); this.msg = { text: 'SAVE ERASED', t: 90 }; }
      else { this.erase = this.sel; Sound.play('select', { rate: 0.6 }); }
    }
    if (inp.laserPressed) { Sound.play('select', { rate: 0.7 }); g.toTitle(); }
  }

  updatePick(inp) {
    const P = this.pick;
    if (inp.upPressed || inp.leftPressed) { P.i = (P.i + STAGES.length - 1) % STAGES.length; Sound.play('select', { vol: 0.5 }); }
    if (inp.downPressed || inp.rightPressed) { P.i = (P.i + 1) % STAGES.length; Sound.play('select', { vol: 0.5 }); }
    if (inp.laserPressed) { this.pick = null; return; }
    if (inp.punchPressed || inp.startPressed || inp.tapped) {
      const s = this.slots[this.sel];
      Sound.play('start', { vol: 0.8 });
      this.g.startSave(this.sel, Object.assign({}, s, { stage: STAGES[P.i].id }), true);
    }
  }

  draw(ctx) {
    const g = this.g, t = this.t;
    const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H); bg.addColorStop(0, '#0b1440'); bg.addColorStop(1, '#1d3fd1');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = -2; i < 20; i++) ctx.fillRect(((i * 120 + t) % 1560) - 140, 0, 50, VIEW_H);
    // slanted P5-ish header
    ctx.save(); ctx.translate(VIEW_W / 2, 80); ctx.rotate(-0.03);
    ctx.fillStyle = '#d4141e'; ctx.fillRect(-300, -34, 616, 72); ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-308, -42, 616, 72);
    ctx.restore();
    g.text(ctx, 'DATA SELECT', VIEW_W / 2, 92, 34, '#fff', 'center', '#d4141e');
    for (let i = 0; i < 3; i++) this.drawSlot(ctx, i, 130 + i * 360, 170);
    if (this.pick) this.drawPick(ctx);
    const hint = this.pick ? `${keyLabel('up')}${keyLabel('down')} STAGE   [${keyLabel('punch')}] PLAY   [${keyLabel('laser')}] BACK`
      : `◀ ▶ SLOT   [${keyLabel('punch')}] START   [${keyLabel('grab')}] x2 ERASE   [${keyLabel('laser')}] BACK`;
    g.text(ctx, hint, VIEW_W / 2, VIEW_H - 40, 14, '#ffd23f', 'center');
    if (this.msg) g.text(ctx, this.msg.text, VIEW_W / 2, VIEW_H - 90, 18, '#fff', 'center', '#d4141e');
  }

  drawSlot(ctx, i, x, y) {
    const g = this.g, s = this.slots[i], on = i === this.sel, w = 300, h = 420;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate(on ? -0.02 : 0); ctx.scale(on ? 1.04 : 1, on ? 1.04 : 1); ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = on ? '#d4141e' : 'rgba(0,0,0,.4)'; ctx.fillRect(10, 10, w, h);
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = on ? '#ffffff' : '#3a4a8a'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, w, h);
    g.text(ctx, `FILE ${i + 1}`, 20, 40, 18, on ? '#ffd23f' : '#c9d4ff', 'left', null);
    if (!s) {
      g.text(ctx, 'NEW GAME', w / 2, 210, 22, '#fff', 'center', null);
      g.text(ctx, 'START TO CREATE', w / 2, 250, 11, '#c9d4ff', 'center', null);
      g.text(ctx, 'A SAVE FILE', w / 2, 272, 11, '#c9d4ff', 'center', null);
    } else {
      ctx.save(); ctx.translate(w / 2, 150); drawSonicFrame(ctx, animFrame(s.done ? 'lookup' : 'idle', 0), 0, 30, { scale: 4 }); ctx.restore();
      const st = STAGES[stageIndex(s.stage)];
      g.text(ctx, s.done ? 'CLEAR!' : (st ? st.name : '?'), w / 2, 230, s.done ? 26 : 15, s.done ? '#ffd23f' : '#fff', 'center', null);
      // the emeralds collected
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = k < (s.emeraldCount || 0) ? EMERALD_COLORS[k] : 'rgba(255,255,255,.12)';
        ctx.beginPath(); const ex = 52 + k * 28, ey = 270; ctx.moveTo(ex, ey - 9); ctx.lineTo(ex + 8, ey); ctx.lineTo(ex, ey + 9); ctx.lineTo(ex - 8, ey); ctx.closePath(); ctx.fill();
      }
      const fate = s.eggChoice === 'kill' ? ['EGGMAN: KILLED', '#ff3b3b'] : s.eggChoice === 'spare' ? ['EGGMAN: SPARED', '#7dff9a'] : ['EGGMAN: ?', '#8a93b8'];
      g.text(ctx, fate[0], w / 2, 320, 13, fate[1], 'center', null);
      g.text(ctx, `SCORE ${s.score || 0}`, w / 2, 352, 11, '#c9d4ff', 'center', null);
      if (s.done) g.text(ctx, 'PICK ANY STAGE', w / 2, 390, 11, '#ffd23f', 'center', null);
      if (this.erase === i) { ctx.fillStyle = 'rgba(212,20,30,.85)'; ctx.fillRect(0, h - 70, w, 50); g.text(ctx, `ERASE? [${keyLabel('grab')}] AGAIN`, w / 2, h - 38, 13, '#fff', 'center', null); }
    }
    ctx.restore();
  }

  drawPick(ctx) {
    const g = this.g, P = this.pick, x = VIEW_W / 2 - 260, y = 150;
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#d4141e'; ctx.fillRect(x + 10, y + 10, 520, 440); ctx.fillStyle = '#0a0a0a'; ctx.fillRect(x, y, 520, 440);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(x, y, 520, 440);
    g.text(ctx, 'STAGE SELECT', VIEW_W / 2, y + 44, 20, '#ffd23f', 'center', null);
    STAGES.forEach((s, i) => {
      const on = i === P.i, yy = y + 90 + i * 42;
      if (on) { ctx.fillStyle = '#d4141e'; ctx.fillRect(x + 30, yy - 26, 460, 36); }
      g.text(ctx, s.name, VIEW_W / 2, yy, 16, on ? '#fff' : '#c9d4ff', 'center', null);
    });
  }
}

// ---------------------------------------------------------- dev fate prompt
// Jumping past the brawl from the DEV menu has to settle what happened to Eggman.
class FatePrompt {
  constructor(game, then) { this.g = game; this.then = then; this.sel = 'kill'; this.t = 0; }
  update(inp) {
    this.t++;
    if (inp.leftPressed) { this.sel = 'kill'; Sound.play('select', { rate: 0.7 }); }
    if (inp.rightPressed) { this.sel = 'spare'; Sound.play('select', { rate: 1.2 }); }
    if (this.t > 10 && (inp.punchPressed || inp.startPressed || inp.tapped)) { this.g.eggChoice = this.sel; Sound.play('checkpoint'); this.then(); }
  }
  draw(ctx) {
    const g = this.g;
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    g.text(ctx, 'EGGMAN WAS...', VIEW_W / 2, 230, 30, '#fff', 'center', '#d4141e');
    for (const [k, label, x, col] of [['kill', 'KILLED', VIEW_W / 2 - 200, '#ff3b3b'], ['spare', 'SPARED', VIEW_W / 2 + 200, '#7dff9a']]) {
      const on = this.sel === k;
      ctx.save(); ctx.translate(x, 380); ctx.rotate(on ? -0.05 : 0);
      ctx.fillStyle = on ? col : 'rgba(255,255,255,.1)'; ctx.fillRect(-150, -50, 300, 100);
      ctx.restore();
      g.text(ctx, label, x, 395, 34, on ? '#0a0a0a' : col, 'center', null);
    }
    g.text(ctx, `◀ ▶ CHOOSE   [${keyLabel('punch')}] CONFIRM   (DEV)`, VIEW_W / 2, 560, 14, '#c9d4ff', 'center');
  }
}
