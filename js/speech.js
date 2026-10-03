// Speech bubbles for Sonic and Eggman, with button prompts that match the
// player's current input device. Text tokens like {grab} become key caps.
'use strict';

const KEY_LABELS = {
  kb:    { punch: 'Z', jump: 'Z', laser: 'X', clones: 'C', grab: 'V', down: '↓' },
  pad:   { punch: 'A', jump: 'A', laser: 'X', clones: 'Y', grab: 'B', down: '↓' },
  touch: { punch: 'A', jump: 'A', laser: 'B', clones: 'X', grab: 'Y', down: '▼' },
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

  // who: 'sonic' | 'eggman'. opts: { dur, once: key, cool: frames, big, prio }
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
    if (who === 'sonic') Sound.play('select', { vol: 0.25, rate: 1.6 });
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
    if (g.escape) return g.escape.speakerPos(who);
    if (who === 'eggman') {
      if (F) {
        if (F.phase === 'rise') {
          const R = F.robot, k = Math.max(0, Math.min(1, (F.t - 40) / 170));
          const hp = R.headPos();
          return { x: F.egg.x + (hp.x - F.egg.x) * k, y: F.egg.y + (hp.y - F.egg.y) * k - 70 };
        }
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
      const sp = this.g.escape ? pos : F && F.toScreen ? F.toScreen(pos.x, pos.y) : { x: pos.x - cam.x, y: pos.y - cam.y };
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

  drawBubble(ctx, b, sx, sy) {
    const size = b.big ? 30 : 14, lh = size + 12;
    const { lines, w } = this.layout(ctx, b.text, size, b.big ? 600 : 380);
    const pad = 12, bw = w + pad * 2, bh = lines.length * lh + pad * 2 - 6;
    const pop = Math.min(1, b.t / 8), fade = Math.min(1, (b.dur - b.t) / 12);
    let bx = sx - bw / 2, by = sy - bh - 26;
    bx = Math.max(10, Math.min(VIEW_W - bw - 10, bx));
    by = Math.max(10, by);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(sx, sy); ctx.scale(pop, pop); ctx.translate(-sx, -sy);
    const egg = b.who === 'eggman';
    ctx.fillStyle = egg ? '#ffe9e4' : '#ffffff';
    ctx.strokeStyle = egg ? '#b3121a' : '#0b1440'; ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 10); else ctx.rect(bx, by, bw, bh);
    ctx.fill(); ctx.stroke();
    // tail
    const tx = Math.max(bx + 16, Math.min(bx + bw - 16, sx));
    ctx.beginPath(); ctx.moveTo(tx - 10, by + bh - 2); ctx.lineTo(sx, sy - 6); ctx.lineTo(tx + 10, by + bh - 2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillRect(tx - 9, by + bh - 4, 18, 5);
    // text
    ctx.font = `${size}px ${FONT}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      let x = bx + pad; const y = by + pad + (i + 1) * lh - 10;
      for (const tk of line) {
        if (tk.key) { drawKeyCap(ctx, x, y + 2, tk.key, size); }
        else { ctx.fillStyle = b.big ? '#d4141e' : egg ? '#7a0a10' : '#0b1440'; ctx.fillText(tk.s, x, y); }
        x += tk.w;
      }
    });
    ctx.restore();
  }
}
