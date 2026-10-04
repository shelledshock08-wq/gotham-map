// Speech bubbles for Sonic and Eggman, with button prompts that match the
// player's current input device. Text tokens like {grab} become key caps.
'use strict';

const KEY_LABELS = {
  kb:    { punch: 'Z', jump: 'Z', laser: 'X', clones: 'C', grab: 'V', down: '↓', up: '↑', swap: 'Q', roles: 'E', bite: 'B' },
  pad:   { punch: 'A', jump: 'A', laser: 'X', clones: 'Y', grab: 'B', down: '↓', up: '↑', swap: 'LB', roles: 'RB', bite: 'LT' },
  mouse: { punch: 'LMB', jump: 'Z', laser: 'RMB', clones: 'C', grab: 'V', down: '↓', up: '↑', swap: 'Q', roles: 'E', bite: 'B' },
  touch: { punch: 'A', jump: 'A', laser: 'B', clones: 'X', grab: 'Y', down: '▼', up: '▲', swap: '⇄', roles: '⟲', bite: '☠' },
};
function keyLabel(action) {
  const dev = (window.Input && Input.lastDevice) || 'kb';
  return (KEY_LABELS[dev] || KEY_LABELS.kb)[action] || action.toUpperCase();
}

function drawKeyCap(ctx, x, y, label, size = 14) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  const w = Math.max(size + 10, ctx.measureText(label).width + 12), h = size + 10;
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#1a1406'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y - h + 4, w, h, 5); else ctx.rect(x, y - h + 4, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a1406'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x + w / 2, y);
  ctx.restore();
  return w;
}

// "[V] RIP!" style prompt drawn in world space over an object.
function drawPrompt(ctx, x, y, action, text, t, s = 1) {
  if (Math.floor(t / 12) % 4 === 3) return;
  ctx.save();
  if (s !== 1) { ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y); }   // keep on-screen size under camera zoom
  ctx.font = `14px ${FONT}`;
  const label = keyLabel(action);
  const tw = ctx.measureText(text).width;
  const kw = Math.max(24, ctx.measureText(label).width + 12);
  const w = kw + 8 + tw, x0 = x - w / 2;
  ctx.fillStyle = 'rgba(0,0,20,.75)'; ctx.fillRect(x0 - 8, y - 24, w + 16, 32);
  drawKeyCap(ctx, x0, y, label);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(text, x0 + kw + 8, y);
  ctx.restore();
}

class SpeechSystem {
  constructor(game) { this.g = game; this.list = []; this.once = new Set(); this.cool = {}; }

  // who: 'sonic' | 'tails' | 'eggman'. opts: { dur, once: key, cool: frames, big, prio }
  say(who, text, opts = {}) {
    if (opts.once) { if (this.once.has(opts.once)) return false; this.once.add(opts.once); }
    if (opts.cool) {
      const k = opts.coolKey || text;
      if (this.cool[k] && this.g.t - this.cool[k] < opts.cool) return false;
      this.cool[k] = this.g.t;
    }
    // don't let a low-priority quip stomp on an important hint
    const cur = this.list.find((b) => b.who === who);
    if (cur && (cur.prio || 0) > (opts.prio || 0) && cur.t < cur.dur * 0.6) return false;
    this.list = this.list.filter((b) => b.who !== who);
    const dur = opts.dur || 170;
    if (who === 'sonic' || who === 'tails') Sound.play('select', { vol: 0.25, rate: who === 'tails' ? 1.9 : 1.6 });
    this.list.push({ who, text, t: 0, dur, big: !!opts.big, prio: opts.prio || 0 });
    return true;
  }

  clear() { this.list = []; }
  reset() { this.list = []; this.once.clear(); this.cool = {}; }

  update() {
    for (const b of this.list) b.t++;
    this.list = this.list.filter((b) => b.t < b.dur);
  }

  speakerPos(who) {
    const g = this.g, F = g.final;
    if (g.tornado) return g.tornado.speakerPos(who);
    if (g.escape) return g.escape.speakerPos(who);
    if (g.ruins || g.special) return (g.ruins || g.special).speakerPos(who);
    if (who === 'eggman') {
      if (F) {
        if (F.phase === 'rise') {
          const R = F.robot, k = Math.max(0, Math.min(1, (F.t - 40) / 170));
          const hp = R.headPos();
          return { x: F.egg.x + (hp.x - F.egg.x) * k, y: F.egg.y + (hp.y - F.egg.y) * k - 70 };
        }
        if (F.egg2) { const e = F.egg2.headPos(); return { x: e.x, y: e.y - 40 }; }   // on foot
        const hp = F.robot.headPos(); return { x: hp.x, y: hp.y - 70 };
      }
      if (g.boss) return { x: g.boss.x, y: g.boss.y - 80 };
      return null;
    }
    if (F && F.hero.active) return { x: F.hero.x, y: F.hero.y - 50 };
    const p = g.player; return p ? { x: p.x, y: p.y - 50 } : null;
  }

  draw(ctx, cam) {
    for (const b of this.list) {
      const pos = this.speakerPos(b.who);
      if (!pos) continue;
      const F = this.g.final;
      const sp = this.g.tornado || this.g.escape || this.g.ruins || this.g.special ? pos : F && F.toScreen ? F.toScreen(pos.x, pos.y) : { x: pos.x - cam.x, y: pos.y - cam.y };
      this.drawBubble(ctx, b, sp.x, sp.y);
    }
  }

  layout(ctx, text, size, maxW) {
    // split into words and {key} caps, then wrap
    const parts = text.split(/(\{\w+\})/).filter(Boolean);
    const toks = [];
    for (const p of parts) {
      const m = /^\{(\w+)\}$/.exec(p);
      if (m) toks.push({ key: keyLabel(m[1]) });
      else for (const w of p.split(/(\s+)/)) if (w) toks.push({ s: w });
    }
    ctx.font = `${size}px ${FONT}`;
    const lines = [[]]; let lw = 0, maxLine = 0;
    for (const tk of toks) {
      const w = tk.key ? Math.max(size + 10, ctx.measureText(tk.key).width + 12) + 4 : ctx.measureText(tk.s).width;
      if (tk.s && /^\s+$/.test(tk.s) && lw === 0) continue;
      if (lw + w > maxW && lw > 0 && !(tk.s && /^\s+$/.test(tk.s))) { lines.push([]); lw = 0; }
      if (tk.s && /^\s+$/.test(tk.s) && lw === 0) continue;
      lines[lines.length - 1].push({ ...tk, w }); lw += w; maxLine = Math.max(maxLine, lw);
    }
    return { lines, w: maxLine };
  }

  // Persona 5-style dialogue: a slanted black panel with a white rim and a red
  // offset shadow, a tilted name tag in the speaker's colour and a sharp tail.
  drawBubble(ctx, b, sx, sy) {
    const size = b.big ? 28 : 14, lh = size + 12;
    const { lines, w } = this.layout(ctx, b.text, size, b.big ? 600 : 400);
    const pad = 18, bw = w + pad * 2 + 10, bh = lines.length * lh + pad * 2 - 2;
    const pop = Math.min(1, b.t / 7), fade = Math.min(1, (b.dur - b.t) / 12);
    let bx = sx - bw / 2, by = sy - bh - 40;
    bx = Math.max(16, Math.min(VIEW_W - bw - 16, bx));
    by = Math.max(30, by);
    const P5 = { sonic: ['SONIC', '#1d4fe0'], tails: ['TAILS', '#ff9a1a'], eggman: ['EGGMAN', '#d4141e'] }[b.who] || [b.who.toUpperCase(), '#d4141e'];
    // stable jitter per line of dialogue, so the panel doesn't wobble every frame
    let seed = 0; for (let i = 0; i < b.text.length; i++) seed = (seed * 31 + b.text.charCodeAt(i)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const j = () => (rnd() - 0.5) * 22;
    const quad = [[bx + j(), by + j()], [bx + bw + j(), by + 6 + j()], [bx + bw - 8 + j(), by + bh + j()], [bx - 6 + j(), by + bh - 6 + j()]];
    const tailX = Math.max(bx + 30, Math.min(bx + bw - 30, sx));
    const path = (dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(quad[0][0] + dx, quad[0][1] + dy);
      ctx.lineTo(quad[1][0] + dx, quad[1][1] + dy);
      ctx.lineTo(quad[2][0] + dx, quad[2][1] + dy);
      ctx.lineTo(tailX + 18 + dx, by + bh - 3 + dy);
      ctx.lineTo(sx + 6 + dx, sy - 8 + dy);              // the tail stabs toward the speaker
      ctx.lineTo(tailX - 6 + dx, by + bh - 1 + dy);
      ctx.lineTo(quad[3][0] + dx, quad[3][1] + dy);
      ctx.closePath();
    };
    ctx.save();
    ctx.globalAlpha = fade;
    const cx = bx + bw / 2, cy = by + bh / 2;
    ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.rotate((1 - pop) * -0.25 + (rnd() - 0.5) * 0.03); ctx.translate(-cx, -cy);
    path(11, 9); ctx.fillStyle = '#d4141e'; ctx.fill();
    path(0, 0); ctx.fillStyle = '#0a0a0a'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.lineJoin = 'miter'; ctx.stroke();
    // halftone flecks in the corner, like the game's UI
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let y = by + 8; y < by + bh - 6; y += 7) for (let x = bx + bw - 60 + (y % 14 ? 3 : 0); x < bx + bw - 10; x += 7) ctx.fillRect(x, y, 2, 2);
    // name tag
    ctx.save();
    ctx.translate(bx + 6, by - 4); ctx.rotate(-0.09);
    ctx.font = `${b.big ? 14 : 12}px ${FONT}`;
    const nw = ctx.measureText(P5[0]).width + 26;
    ctx.fillStyle = P5[1]; ctx.beginPath(); ctx.moveTo(-4, -22); ctx.lineTo(nw + 10, -26); ctx.lineTo(nw + 2, 6); ctx.lineTo(-10, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(nw, -21); ctx.lineTo(nw - 6, 1); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a0a0a'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(P5[0], 10, -4);
    ctx.restore();
    // text
    ctx.font = `${size}px ${FONT}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      let x = bx + pad + 4; const y = by + pad + (i + 1) * lh - 8;
      for (const tk of line) {
        if (tk.key) { drawKeyCap(ctx, x, y + 2, tk.key, size); }
        else { ctx.fillStyle = b.big ? '#ff3b3b' : '#ffffff'; ctx.fillText(tk.s, x, y); }
        x += tk.w;
      }
    });
    ctx.restore();
  }

}
