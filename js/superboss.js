// Final battle: the Egg Mobile docks as the head of the giant Egg Colossus,
// the Chaos Emeralds turn Sonic super, and the fight becomes a free-flight
// brawl with Frontiers-style moves: light fists, a charged laser beam, light
// clones and ripping the robot's parts off to throw them back at it.
'use strict';

const EMERALD_COLORS = ['#3cf06e', '#ff4040', '#3d8bff', '#ffe23d', '#e4ecff', '#ff5ae0', '#43f1ff'];
const COLOSSUS_HP = 320;

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
// distance from point to a ray segment
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ---------------------------------------------------------------- drawing
function drawSuperAura(ctx, x, y, t, s = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = (46 + Math.sin(t * 0.2) * 4) * s;
  const g = ctx.createRadialGradient(x, y, 4, x, y, r);
  g.addColorStop(0, 'rgba(255,250,200,.55)'); g.addColorStop(0.5, 'rgba(255,200,40,.28)'); g.addColorStop(1, 'rgba(255,170,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  // flickering flame spikes
  ctx.fillStyle = 'rgba(255,220,90,.35)';
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + t * 0.05;
    const l = (r * 0.9) + Math.sin(t * 0.5 + i * 2.3) * 10 * s;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a - 0.18) * r * 0.5, y + Math.sin(a - 0.18) * r * 0.5);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.lineTo(x + Math.cos(a + 0.18) * r * 0.5, y + Math.sin(a + 0.18) * r * 0.5);
    ctx.fill();
  }
  ctx.restore();
}

function drawLightFist(ctx, x, y, ang, size, alpha) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang); ctx.scale(size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  // speed streaks
  ctx.strokeStyle = 'rgba(255,230,120,.8)'; ctx.lineWidth = 3;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-70, i * 9); ctx.lineTo(-20 - Math.abs(i) * 8, i * 9); ctx.stroke(); }
  const g = ctx.createRadialGradient(6, 0, 4, 6, 0, 46);
  g.addColorStop(0, 'rgba(255,255,235,1)'); g.addColorStop(0.6, 'rgba(255,214,60,.8)'); g.addColorStop(1, 'rgba(255,170,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(6, 0, 46, 0, Math.PI * 2); ctx.fill();
  // fist shape
  ctx.fillStyle = 'rgba(255,248,200,.95)';
  ctx.beginPath(); ctx.ellipse(4, 0, 22, 19, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(22, -13 + i * 8.7, 6.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillRect(-26, -10, 24, 20);
  ctx.restore();
}

function drawBeam(ctx, x1, y1, x2, y2, w, inner, outer, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const wob = 1 + Math.sin(t * 0.9) * 0.12;
  ctx.strokeStyle = outer; ctx.globalAlpha = 0.35; ctx.lineWidth = w * 2.4 * wob;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.globalAlpha = 0.8; ctx.lineWidth = w * wob;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = inner; ctx.globalAlpha = 1; ctx.lineWidth = w * 0.4;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.fillStyle = inner;
  ctx.beginPath(); ctx.arc(x2, y2, w * 0.9 * wob, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x1, y1, w * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawEmerald(ctx, x, y, color, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(12, -4); ctx.lineTo(7, 12); ctx.lineTo(-7, 12); ctx.lineTo(-12, -4); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#10142e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, -4); ctx.lineTo(0, 0); ctx.lineTo(-7, -4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------ small objects
class FBEffect {
  constructor(kind, x, y, o = {}) { Object.assign(this, { kind, x, y, t: 0, dur: 24 }, o); }
  update() { if (++this.t >= this.dur) this.dead = true; if (this.vx) { this.x += this.vx; this.y += this.vy; } }
  draw(ctx, cam, t) {
    const f = this.t / this.dur, x = this.x - cam.x, y = this.y - cam.y;
    if (this.kind === 'boom') { ctx.save(); ctx.translate(x, y); ctx.scale(this.s || 1, this.s || 1); drawExplosion(ctx, 0, 0, f); ctx.restore(); }
    else if (this.kind === 'fist') drawLightFist(ctx, x, y, this.ang, this.size, 1 - f);
    else if (this.kind === 'spark') drawSparkle(ctx, x, y, f, this.color || '#ffe680');
    else if (this.kind === 'text') {
      ctx.save(); ctx.globalAlpha = Math.min(1, (this.dur - this.t) / 15);
      ctx.font = `${this.size || 24}px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText(this.text, x + 3, y + 3);
      ctx.fillStyle = this.color || '#ffd23f'; ctx.fillText(this.text, x, y - f * 20);
      ctx.restore();
    } else if (this.kind === 'smoke') {
      ctx.save(); ctx.globalAlpha = 0.5 * (1 - f); ctx.fillStyle = '#9aa0b0';
      ctx.beginPath(); ctx.arc(x, y, 6 + f * 14, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
}

class FloatRing {
  constructor(fb, x, y, vx, vy) { this.fb = fb; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.t = 0; }
  update() {
    this.t++; this.vx *= 0.97; this.vy = this.vy * 0.97 + 0.04;
    this.x += this.vx; this.y += this.vy;
    if (this.y > this.fb.gy - 16) { this.y = this.fb.gy - 16; this.vy = -Math.abs(this.vy) * 0.6; }
    if (this.t > 720) this.dead = true;
    const h = this.fb.hero;
    if (this.t > 20 && h.active && dist(h.x, h.y, this.x, this.y) < 46) {
      this.dead = true; this.fb.g.rings++; Sound.ring();
      this.fb.add(new FBEffect('spark', this.x, this.y, { dur: 16, color: '#fff7c2' }));
    }
  }
  draw(ctx, cam, t) { if (this.t > 600 && Math.floor(this.t / 3) % 2) return; drawRing(ctx, this.x - cam.x, this.y - cam.y, t * 0.12); }
}

class Missile {
  constructor(fb, x, y, ang) { this.fb = fb; this.x = x; this.y = y; this.ang = ang; this.sp = 2; this.t = 0; }
  update() {
    const h = this.fb.hero;
    this.t++;
    this.sp = Math.min(7.2, this.sp + 0.15);
    if (this.t > 20 && this.t < 200) this.ang += Math.max(-0.045, Math.min(0.045, angDiff(this.ang, angTo(this.x, this.y, h.x, h.y))));
    this.x += Math.cos(this.ang) * this.sp; this.y += Math.sin(this.ang) * this.sp;
    if (this.t % 3 === 0) this.fb.add(new FBEffect('smoke', this.x - Math.cos(this.ang) * 16, this.y - Math.sin(this.ang) * 16, { dur: 30 }));
    if (this.t > 320 || this.y > this.fb.gy) this.explode();
    if (h.active && dist(h.x, h.y, this.x, this.y) < 34) { h.hit(this.x, this.y, 8); this.explode(); }
  }
  explode() { this.dead = true; this.fb.add(new FBEffect('boom', this.x, this.y, { dur: 22 })); Sound.play('boom', { vol: 0.35, rate: 1.4 }); }
  smash() { this.explode(); this.fb.g.addScore(100); }
  draw(ctx, cam) {
    ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(this.ang);
    ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(-14, -5); ctx.lineTo(-26 - Math.random() * 8, 0); ctx.lineTo(-14, 5); ctx.fill();
    ctx.fillStyle = '#d7dbe4'; ctx.strokeStyle = '#1a1d2b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(8, -6); ctx.lineTo(18, 0); ctx.lineTo(8, 6); ctx.lineTo(-14, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e3262e'; ctx.fillRect(2, -6, 4, 12);
    ctx.restore();
  }
}

class Shockwave {
  constructor(fb, x, dir) { this.fb = fb; this.x = x; this.dir = dir; this.t = 0; }
  update() {
    this.t++; this.x += this.dir * 10;
    const h = this.fb.hero;
    if (h.active && Math.abs(h.x - this.x) < 34 && h.y > this.fb.gy - 110) h.hit(this.x, this.fb.gy, 10);
    if (this.x < this.fb.ax - 60 || this.x > this.fb.ax + this.fb.aw + 60) this.dead = true;
  }
  draw(ctx, cam, t) {
    const x = this.x - cam.x, y = this.fb.gy - cam.y;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(255,${120 + i * 50},40,${0.5 - i * 0.12})`;
      ctx.beginPath(); ctx.moveTo(x - 30 - i * 14, y); ctx.quadraticCurveTo(x, y - 110 + i * 25 + Math.sin(t * 0.6) * 6, x + 30 + i * 14, y); ctx.fill();
    }
    ctx.restore();
  }
}

class Debris {
  constructor(fb, x, ring) { this.fb = fb; this.x = x; this.y = fb.camY - 60; this.vy = 0; this.t = 0; this.rot = Math.random() * 6; this.ring = ring; }
  update() {
    this.t++;
    if (this.t < 45) return;            // warning phase
    this.vy = Math.min(14, this.vy + 0.4); this.y += this.vy; this.rot += 0.08;
    const h = this.fb.hero;
    if (h.active && dist(h.x, h.y, this.x, this.y) < 44) { h.hit(this.x, this.y, 8); this.smash(true); }
    if (this.y > this.fb.gy - 20) this.smash(true);
  }
  smash(silent) {
    this.dead = true;
    this.fb.add(new FBEffect('boom', this.x, this.y, { dur: 20, s: 1.2 }));
    if (!silent) this.fb.g.addScore(100);
    if (this.ring) for (let i = 0; i < 3; i++) this.fb.add(new FloatRing(this.fb, this.x, this.y - 20, (i - 1) * 3, -3));
  }
  draw(ctx, cam, t) {
    const x = this.x - cam.x;
    if (this.t < 45) {
      if (Math.floor(t / 5) % 2) { ctx.fillStyle = 'rgba(255,60,60,.8)'; ctx.font = `20px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('!', x, 40); }
      ctx.fillStyle = 'rgba(255,60,60,.18)'; ctx.fillRect(x - 30, 0, 60, VIEW_H);
      return;
    }
    ctx.save(); ctx.translate(x, this.y - cam.y); ctx.rotate(this.rot);
    ctx.fillStyle = '#6c7280'; ctx.strokeStyle = '#1a1d2b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-34, -10); ctx.lineTo(-12, -32); ctx.lineTo(26, -24); ctx.lineTo(34, 10); ctx.lineTo(8, 32); ctx.lineTo(-26, 24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-14, -6, 28, 8);
    if (this.ring) drawRing(ctx, 0, 0, t * 0.1);
    ctx.restore();
  }
}

class Clone {
  constructor(fb, x, y, i) {
    this.fb = fb; this.x = x; this.y = y; this.i = i; this.t = 0; this.state = 'dash';
    this.ox = Math.cos(i / 4 * Math.PI * 2) * 60; this.oy = Math.sin(i / 4 * Math.PI * 2) * 60;
  }
  update() {
    this.t++;
    const R = this.fb.robot, tg = this.fb.hero.target || R.torsoCenter();
    if (this.state === 'dash') {
      const tx = tg.x + this.ox, ty = tg.y + this.oy;
      const a = angTo(this.x, this.y, tx, ty), d = dist(this.x, this.y, tx, ty);
      this.x += Math.cos(a) * Math.min(d, 20); this.y += Math.sin(a) * Math.min(d, 20);
      this.ang = a;
      if (d < 22 || this.t > 50) { this.state = 'flurry'; this.t = 0; }
    } else if (this.state === 'flurry') {
      if (this.t % 5 === 0) {
        const a = angTo(this.x, this.y, tg.x, tg.y) + (Math.random() - 0.5) * 0.6;
        const px = this.x + Math.cos(a) * 50, py = this.y + Math.sin(a) * 50;
        this.fb.add(new FBEffect('fist', px, py, { ang: a, size: 0.55, dur: 10 }));
        this.fb.hitAt(px, py, 70, 1.3);
      }
      if (this.t > 44) { this.state = 'fade'; this.t = 0; }
    } else if (this.t > 20) this.dead = true;
  }
  draw(ctx, cam, t) {
    const a = this.state === 'fade' ? 0.5 * (1 - this.t / 20) : 0.55;
    const x = this.x - cam.x, y = this.y - cam.y;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    drawSuperAura(ctx, x, y, t + this.i * 7, 0.7);
    drawSonicFrame(ctx, animFrame(this.state === 'flurry' ? 'punch' : 'fly', 0), x, y + 34, { sheet: 'super', alpha: a, flip: Math.cos(this.ang || 0) < 0 });
    ctx.restore();
  }
}

class Thrown {
  constructor(fb, x, y, part) { this.fb = fb; this.x = x; this.y = y; this.part = part; this.sp = 6; this.rot = 0; this.t = 0; this.ang = 0; }
  update() {
    this.t++;
    const R = this.fb.robot, tg = R.coreExposed() ? R.coreCenter() : R.torsoCenter();
    this.sp = Math.min(24, this.sp + 1.4);
    this.ang = angTo(this.x, this.y, tg.x, tg.y);
    this.x += Math.cos(this.ang) * this.sp; this.y += Math.sin(this.ang) * this.sp;
    this.rot += 0.35;
    if (this.t % 2 === 0) this.fb.add(new FBEffect('spark', this.x, this.y, { dur: 14 }));
    if (dist(this.x, this.y, tg.x, tg.y) < 60 || this.t > 120) {
      this.dead = true;
      const dmg = this.part.kind === 'plate' ? 34 : this.part.kind === 'arm' ? 30 : 22;
      R.damage(dmg, tg.x, tg.y, true);
      for (let i = 0; i < 5; i++) this.fb.add(new FBEffect('boom', tg.x + (Math.random() - 0.5) * 90, tg.y + (Math.random() - 0.5) * 90, { dur: 26, s: 1.6 }));
      this.fb.add(new FBEffect('text', tg.x, tg.y - 90, { text: 'CRITICAL!', dur: 60, size: 26 }));
      this.fb.shake = 16; R.stun = Math.max(R.stun, 80);
      this.fb.say('eggman', 'MY BEAUTIFUL ROBOT!', { cool: 500, coolKey: 'egg_hurt', dur: 110 });
      Sound.play('boom'); Sound.play('bosshit');
    }
  }
  draw(ctx, cam) {
    ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(this.rot);
    drawPartIcon(ctx, this.part.kind, 0.8, false);
    ctx.restore();
  }
}

// Stand-alone picture of a robot part (used while carried / thrown).
function drawPartIcon(ctx, kind, s, glow) {
  ctx.save(); ctx.scale(s, s);
  if (glow) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 20; }
  ctx.strokeStyle = '#141824'; ctx.lineWidth = 4;
  if (kind === 'arm') {
    ctx.fillStyle = '#7a8396'; ctx.fillRect(-60, -18, 70, 36); ctx.strokeRect(-60, -18, 70, 36);
    ctx.fillStyle = '#d42b2b'; ctx.beginPath(); ctx.arc(30, 0, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(14, -26, 10, 52);
  } else if (kind === 'pod') {
    ctx.fillStyle = '#5a6275'; ctx.fillRect(-46, -32, 92, 64); ctx.strokeRect(-46, -32, 92, 64);
    ctx.fillStyle = '#111'; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(-26 + i * 26, -12 + j * 24, 8, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.fillStyle = '#9aa3b5'; ctx.beginPath(); ctx.moveTo(-95, -75); ctx.lineTo(95, -75); ctx.lineTo(80, 75); ctx.lineTo(-80, 75); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d42b2b'; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.font = `28px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('E', 0, 2);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ hero
class SuperHero {
  constructor(fb, x, y) {
    this.fb = fb; this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.facing = 1;
    this.active = false; this.invuln = 0; this.hitT = 0; this.anim = 0;
    this.punchT = 0; this.combo = 0; this.comboT = 0; this.lunge = 0; this.punchAng = 0;
    this.charge = 0; this.beam = null; this.laserCD = 0; this.cloneCD = 0;
    this.carry = null; this.rip = null; this.target = null; this.trail = [];
  }

  update(inp) {
    const fb = this.fb, R = fb.robot;
    this.anim += 0.12;
    if (this.invuln > 0) this.invuln--;
    if (this.comboT > 0) this.comboT--; else this.combo = 0;
    if (this.laserCD > 0) this.laserCD--;
    if (this.cloneCD > 0) this.cloneCD--;
    this.trail.unshift({ x: this.x, y: this.y }); if (this.trail.length > 6) this.trail.pop();
    this.target = R.nearestTarget(this.x, this.y);

    // ---- ripping a part off ----
    if (this.rip) {
      const P = this.rip.part, pc = R.partCenter(P.key);
      this.x += (pc.x + (this.x < pc.x ? -70 : 70) - this.x) * 0.3; this.y += (pc.y - this.y) * 0.3;
      if (inp.grab || inp.punch) this.rip.t++; else this.rip.t -= 2;
      if (this.rip.t % 6 === 0) fb.add(new FBEffect('spark', pc.x + (Math.random() - 0.5) * 60, pc.y + (Math.random() - 0.5) * 60, { dur: 14 }));
      fb.shake = Math.max(fb.shake, 3);
      if (this.rip.t < 0) { P.state = 'loose'; this.rip = null; }
      else if (this.rip.t >= 50) {
        P.state = 'gone';
        this.carry = { kind: P.kind };
        this.rip = null;
        fb.shake = 18; R.stun = Math.max(R.stun, 100); R.attack = null; R.fist = null;
        R.damage(12, pc.x, pc.y, false);
        Sound.play('boom'); Sound.play('bosshit', { rate: 0.8 });
        fb.add(new FBEffect('text', pc.x, pc.y - 80, { text: 'RIPPED OFF!', dur: 60 }));
        fb.say('sonic', 'Catch, Egghead! {grab} to throw it!', { prio: 3, dur: 200 });
        for (let i = 0; i < 6; i++) fb.add(new FBEffect('boom', pc.x + (Math.random() - 0.5) * 100, pc.y + (Math.random() - 0.5) * 100, { dur: 24, s: 1.3 }));
        for (let i = 0; i < 8; i++) fb.add(new FloatRing(fb, pc.x, pc.y, Math.cos(i * 0.8) * 5, Math.sin(i * 0.8) * 5 - 2));
      }
      return;
    }

    // ---- movement (free flight) ----
    let ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    if (this.hitT > 0) { this.hitT--; ix = 0; iy = 0; }
    let max = 9;
    if (this.charge > 0 || this.beam) max = 3.5;
    this.vx += ix * 0.95; this.vy += iy * 0.95;
    if (!ix) this.vx *= 0.86;
    if (!iy) this.vy *= 0.86;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > max && this.hitT <= 0) { this.vx *= max / sp; this.vy *= max / sp; }
    if (this.lunge > 0) {
      this.lunge--;
      const tg = this.target;
      if (tg && dist(this.x, this.y, tg.x, tg.y) > 90) { const a = angTo(this.x, this.y, tg.x, tg.y); this.x += Math.cos(a) * 22; this.y += Math.sin(a) * 22; }
    }
    this.x += this.vx; this.y += this.vy;
    this.x = Math.max(fb.ax + 30, Math.min(fb.ax + fb.aw - 30, this.x));
    this.y = Math.max(fb.camY + 50, Math.min(fb.gy - 36, this.y));
    if (ix) this.facing = ix;
    else if (this.target) this.facing = this.target.x >= this.x ? 1 : -1;

    // ---- carrying a ripped part: throw it ----
    if (this.carry) {
      if (inp.grabPressed || inp.punchPressed) {
        fb.add(new Thrown(fb, this.x + this.facing * 30, this.y - 20, this.carry));
        this.carry = null; Sound.play('release');
      }
      return;
    }

    // ---- light fist combo ----
    if (this.punchT > 0) {
      this.punchT--;
      if (this.punchT === 9) {
        const big = this.combo === 3;
        const a = this.punchAng, reach = big ? 80 : 64;
        const px = this.x + Math.cos(a) * reach, py = this.y + Math.sin(a) * reach;
        fb.add(new FBEffect('fist', px, py, { ang: a, size: big ? 1.6 : 1, dur: big ? 18 : 12 }));
        const hit = fb.hitAt(px, py, big ? 92 : 70, big ? 7 : 3.2);
        if (hit) { Sound.play('pop', { rate: big ? 0.7 : 1.1 + Math.random() * 0.2 }); if (big) fb.shake = 8; }
        else Sound.play('roll', { vol: 0.4, rate: 1.6 });
      }
    }
    if (inp.punchPressed && this.punchT <= 3) {
      this.combo = this.comboT > 0 ? (this.combo % 3) + 1 : 1;
      this.comboT = 32; this.punchT = 14;
      const tg = this.target;
      this.punchAng = tg && dist(this.x, this.y, tg.x, tg.y) < 340 ? angTo(this.x, this.y, tg.x, tg.y) : (this.facing > 0 ? 0 : Math.PI);
      if (tg && dist(this.x, this.y, tg.x, tg.y) < 340) this.lunge = 6;
      this.facing = Math.cos(this.punchAng) >= 0 ? 1 : -1;
    }

    // ---- laser beam: hold to charge, release to fire ----
    if (this.beam) {
      const B = this.beam;
      B.t++;
      const tg = this.target;
      if (tg && !fb.clash) B.ang += Math.max(-0.02, Math.min(0.02, angDiff(B.ang, angTo(this.x, this.y, tg.x, tg.y))));
      if (!fb.clash) B.end = fb.beamHit(this.x, this.y, B.ang, B.w, B.dmg);
      if (B.t >= B.dur && !fb.clash) { this.beam = null; this.laserCD = 70; }
    } else if (inp.laser && this.laserCD <= 0) {
      if (this.charge === 0) Sound.play('charge', { vol: 0.6 });
      this.charge = Math.min(90, this.charge + 1);
      if (this.charge % 8 === 0) fb.add(new FBEffect('spark', this.x + (Math.random() - 0.5) * 80, this.y + (Math.random() - 0.5) * 80, { dur: 16 }));
    } else if (this.charge > 0) {
      if (this.charge >= 12) {
        const k = this.charge / 90;
        const tg = this.target;
        const ang = tg ? angTo(this.x, this.y, tg.x, tg.y) : (this.facing > 0 ? 0 : Math.PI);
        this.beam = { ang, t: 0, dur: 36 + k * 40, w: 16 + k * 22, dmg: 0.35 + k * 0.75, end: { x: this.x, y: this.y } };
        Sound.play('release'); Sound.play('bosshit', { vol: 0.5, rate: 1.5 });
        fb.shake = 4 + k * 6;
      }
      this.charge = 0;
    }

    // ---- light clones ----
    if (inp.clonesPressed && this.cloneCD <= 0 && fb.g.rings >= 5) {
      fb.g.rings -= 5; this.cloneCD = 220;
      for (let i = 0; i < 4; i++) fb.add(new Clone(fb, this.x, this.y, i));
      Sound.play('shield', { rate: 1.3 });
      fb.add(new FBEffect('text', this.x, this.y - 70, { text: 'LIGHT CLONES!', dur: 45, size: 18, color: '#fff3a8' }));
    }

    // ---- rip a loose part ----
    if (inp.grabPressed) {
      const P = R.loosePartNear(this.x, this.y, 150);
      if (P) { this.rip = { part: P, t: 0 }; P.state = 'ripping'; this.charge = 0; this.beam = null; Sound.play('skid'); }
    }
  }

  hit(sx, sy, rings) {
    if (!this.active || this.invuln > 0) return;
    const g = this.fb.g;
    const lost = Math.min(g.rings, rings);
    g.rings -= lost;
    for (let i = 0; i < Math.min(lost, 5); i++) this.fb.add(new FloatRing(this.fb, this.x, this.y, (Math.random() - 0.5) * 9, -3 - Math.random() * 3));
    const a = angTo(sx, sy, this.x, this.y);
    this.vx = Math.cos(a) * 11; this.vy = Math.sin(a) * 11;
    this.hitT = 18; this.invuln = 80;
    this.charge = 0; this.beam = null; this.lunge = 0;
    if (this.rip) { this.rip.part.state = 'loose'; this.rip = null; }
    this.fb.shake = Math.max(this.fb.shake, 8);
    Sound.play('hurt');
  }

  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    // afterimage trail
    for (let i = this.trail.length - 1; i >= 2; i -= 2) {
      const p = this.trail[i];
      drawSonicFrame(ctx, animFrame('fly', this.anim), p.x - cam.x, p.y - cam.y + 34, { sheet: 'super', alpha: 0.18, flip: this.facing < 0 });
    }
    if (this.beam) {
      const B = this.beam, e = this.fb.clash ? this.fb.clashPoint() : B.end;
      drawBeam(ctx, x + Math.cos(B.ang) * 20, y + Math.sin(B.ang) * 20, e.x - cam.x, e.y - cam.y, B.w, '#ffffff', '#ffc929', t);
    }
    drawSuperAura(ctx, x, y, t, this.charge > 0 ? 1 + this.charge / 70 : 1);
    if (this.invuln > 0 && Math.floor(this.invuln / 3) % 2 === 0) return;
    let pose = Math.hypot(this.vx, this.vy) > 3 ? 'fly' : 'hover';
    if (this.punchT > 0) pose = 'punch';
    if (this.charge > 0 || this.beam) pose = 'charge';
    if (this.rip) pose = 'rip';
    if (this.hitT > 0) pose = 'hurt';
    const bob = pose === 'hover' ? Math.sin(t * 0.08) * 4 : 0;
    drawSonicFrame(ctx, animFrame(pose, this.anim), x, y + 34 + bob, { sheet: 'super', flip: this.facing < 0, rot: pose === 'fly' ? this.vy * 0.03 * this.facing : 0 });
    if (this.carry) {
      ctx.save(); ctx.translate(x, y - 64); drawPartIcon(ctx, this.carry.kind, 0.6, true); ctx.restore();
      drawPrompt(ctx, x, y - 112, 'grab', 'THROW!', t);
    }
    if (this.rip) {
      const k = this.rip.t / 50;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 40, y - 70, 80, 10);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 40, y - 70, 80 * k, 10);
      drawPrompt(ctx, x, y - 84, 'grab', 'HOLD!', t);
    }
  }
}

// --------------------------------------------------------------- colossus
class Colossus {
  constructor(fb, rise) {
    this.fb = fb; this.x = fb.ax + 960; this.gy = fb.gy; this.rise = rise;
    this.hp = COLOSSUS_HP; this.maxHp = COLOSSUS_HP;
    const mk = (key, kind, hp) => ({ key, kind, hp, max: hp, state: 'on' });
    this.parts = {
      frontArm: mk('frontArm', 'arm', 45), backArm: mk('backArm', 'arm', 45),
      frontPod: mk('frontPod', 'pod', 26), backPod: mk('backPod', 'pod', 26),
      plate: mk('plate', 'plate', 70),
    };
    this.t = 0; this.cool = 90; this.attack = null; this.last = null; this.stun = 0; this.flash = 0;
    this.fist = null; this.eye = null; this.slamY = 0; this.dropAcc = 0; this.dead = false;
  }
  on(key) { const s = this.parts[key].state; return s === 'on'; }
  attached(key) { const s = this.parts[key].state; return s !== 'gone'; }
  coreExposed() { return this.parts.plate.state === 'gone'; }
  baseY() { return this.gy + this.rise; }
  bob() { return Math.sin(this.t * 0.03) * 5; }
  torsoCenter() { return { x: this.x, y: this.baseY() - 390 + this.bob() }; }
  coreCenter() { return { x: this.x, y: this.baseY() - 385 + this.bob() }; }
  headPos() { return { x: this.x - 6, y: this.baseY() - 560 + this.bob() }; }
  fistRest(front) {
    const by = this.baseY() + this.bob();
    if (front) return { x: this.x - 235, y: by - 230 };
    return { x: this.x + 235, y: by - 230 - this.slamY };
  }
  frontFistPos() { return this.fist && this.fist.out ? { x: this.fist.x, y: this.fist.y } : this.fistRest(true); }
  partCenter(key) {
    const by = this.baseY() + this.bob();
    switch (key) {
      case 'frontArm': return this.frontFistPos();
      case 'backArm': return this.fistRest(false);
      case 'frontPod': return { x: this.x - 165, y: by - 545 };
      case 'backPod': return { x: this.x + 165, y: by - 545 };
      case 'plate': return { x: this.x, y: by - 385 };
    }
    return this.torsoCenter();
  }
  // Hit regions in priority order: [key, x, y, radius]
  regions() {
    const out = [];
    for (const key of ['frontArm', 'frontPod', 'backPod', 'backArm']) {
      if (this.attached(key)) { const c = this.partCenter(key); out.push([key, c.x, c.y, this.parts[key].kind === 'arm' ? 62 : 58]); }
    }
    const h = this.headPos(); out.push(['head', h.x, h.y, 70]);
    const pc = this.partCenter('plate');
    out.push([this.attached('plate') ? 'plate' : 'core', pc.x, pc.y, this.attached('plate') ? 100 : 55]);
    out.push(['torso', this.x, this.baseY() - 380, 150]);
    out.push(['legs', this.x, this.baseY() - 130, 130]);
    return out;
  }
  nearestTarget(hx, hy) {
    let best = null, bd = 1e9;
    for (const [key, x, y] of this.regions()) {
      if (key === 'torso' || key === 'legs') continue;
      let d = dist(hx, hy, x, y);
      if (key === 'core') d *= 0.6;
      const P = this.parts[key];
      if (P && P.state === 'loose') d *= 0.7;
      if (d < bd) { bd = d; best = { key, x, y }; }
    }
    return best;
  }
  loosePartNear(hx, hy, r) {
    for (const P of Object.values(this.parts)) {
      if (P.state !== 'loose') continue;
      const c = this.partCenter(P.key);
      if (dist(hx, hy, c.x, c.y) < r) return P;
    }
    return null;
  }
  // Apply a hit at a region; returns true if something was struck.
  hitRegion(key, x, y, dmg) {
    const P = this.parts[key];
    if (P) {
      if (P.state === 'on') {
        P.hp -= dmg;
        this.damage(dmg * 0.35, x, y, false);
        if (P.hp <= 0) {
          P.hp = 0; P.state = 'loose';
          this.fb.onLoose(key);
          if (key === 'frontArm') this.fist = null;
          Sound.play('boom', { vol: 0.7 });
          
          for (let i = 0; i < 5; i++) this.fb.add(new FloatRing(this.fb, x, y, (i - 2) * 2.5, -4));
          if (this.attack && ((this.attack.type === 'punch' && key === 'frontArm') || (this.attack.type === 'slam' && key === 'backArm'))) this.attack = null;
        }
      } else this.damage(dmg * 0.35, x, y, false);
      return true;
    }
    const mult = key === 'core' ? 1.6 : key === 'head' ? 0.6 : 0.3;
    this.damage(dmg * mult * (this.stun > 0 ? 1.3 : 1), x, y, false);
    return true;
  }
  damage(d, x, y, big) {
    if (this.hp <= 0) return;
    this.hp -= d; this.flash = big ? 16 : 6;
    this.dropAcc += d;
    while (this.dropAcc >= 22) {
      this.dropAcc -= 22;
      for (let i = 0; i < 3; i++) this.fb.add(new FloatRing(this.fb, x, y, (Math.random() - 0.5) * 8, -2 - Math.random() * 3));
    }
    if (this.hp <= 0) { this.hp = 0; this.fb.startFinale(); }
  }

  speed() { return 1 + (1 - this.hp / this.maxHp) * 0.8; }

  update() {
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.hp <= 0) return;
    const fb = this.fb, h = fb.hero;
    if (this.stun > 0) { this.stun--; this.updateFist(); this.slamY *= 0.9; return; }
    this.updateFist();
    if (this.eye) this.updateEye();
    if (!this.attack) {
      this.cool -= this.speed();
      if (this.cool <= 0) this.chooseAttack();
      this.slamY *= 0.9;
      return;
    }
    const A = this.attack; A.t++;
    if (A.type === 'punch') {
      if (!this.on('frontArm')) { this.attack = null; return; }
      if (A.t === 1) this.fist = { out: false, glow: 0 };
      if (A.t < 45) { this.fist.glow = A.t / 45; this.fist.aim = { x: h.x, y: h.y }; }
      if (A.t === 45) {
        const r = this.fistRest(true);
        const a = angTo(r.x, r.y, h.x, h.y);
        Object.assign(this.fist, { out: true, x: r.x, y: r.y, vx: Math.cos(a) * 21, vy: Math.sin(a) * 21, back: false, t: 0 });
        Sound.play('release', { rate: 0.7 });
      }
      if (A.t > 45 && !this.fist) this.attack = null;
      if (this.fist && this.fist.done) { this.fist = null; this.endAttack(70); }
    } else if (A.type === 'slam') {
      if (!this.on('backArm')) { this.attack = null; return; }
      if (A.t < 40) this.slamY = Math.min(260, this.slamY + 7);
      else if (A.t < 48) this.slamY = Math.max(-40, this.slamY - 45);
      if (A.t === 48) {
        fb.shake = 18; Sound.play('boom');
        fb.add(new Shockwave(fb, this.x - 120, -1));
        for (let i = 0; i < 4 + Math.floor(this.speed() * 2); i++) fb.add(new Debris(fb, fb.ax + 80 + Math.random() * 780, i === 0));
        for (let i = 0; i < 6; i++) fb.add(new FBEffect('boom', this.x + 235 + (Math.random() - 0.5) * 140, this.gy - 20, { dur: 20 }));
      }
      if (A.t > 48) this.slamY *= 0.85;
      if (A.t > 75) this.endAttack(60);
    } else if (A.type === 'missiles') {
      const pods = ['frontPod', 'backPod'].filter((k) => this.on(k));
      if (!pods.length) { this.attack = null; return; }
      if (A.t % 12 === 0 && A.t <= 36) {
        for (const k of pods) {
          const c = this.partCenter(k);
          fb.add(new Missile(fb, c.x, c.y - 30, -Math.PI / 2 - 0.5 - Math.random() * 0.8));
        }
        Sound.play('roll', { vol: 0.5, rate: 0.7 });
      }
      if (A.t > 60) this.endAttack(80);
    } else if (A.type === 'eye') {
      if (A.t === 1) {
        const hp = this.headPos();
        this.eye = { t: 0, ang: angTo(hp.x, hp.y, h.x, h.y), firing: false };
      }
      if (!this.eye) this.endAttack(80);
    } else if (A.type === 'rain') {
      if (A.t % 14 === 0 && A.t < 100) fb.add(new Debris(fb, fb.ax + 60 + Math.random() * 820, Math.random() < 0.3));
      if (A.t > 130) this.endAttack(60);
    }
  }

  endAttack(cool) { this.last = this.attack.type; this.attack = null; this.cool = cool; }

  chooseAttack() {
    const opts = [];
    if (this.on('frontArm')) opts.push('punch', 'punch');
    if (this.on('backArm')) opts.push('slam', 'slam');
    if (this.on('frontPod') || this.on('backPod')) opts.push('missiles', 'missiles');
    opts.push('eye');
    if (!this.on('frontArm') && !this.on('backArm')) opts.push('rain', 'eye');
    let pick = opts[Math.floor(Math.random() * opts.length)];
    if (pick === this.last && opts.length > 1) pick = opts[Math.floor(Math.random() * opts.length)];
    this.attack = { type: pick, t: 0 };
    this.fb.onAttack(pick);
  }

  updateFist() {
    const F = this.fist;
    if (!F || !F.out) return;
    const h = this.fb.hero;
    F.t++;
    if (!F.back) {
      F.x += F.vx; F.y += F.vy;
      if (F.t > 55 || F.x < this.fb.ax - 40 || F.y > this.gy - 40 || F.y < this.fb.camY) { F.back = true; if (F.y > this.gy - 40) { this.fb.shake = 10; Sound.play('boom', { vol: 0.5 }); } }
    } else {
      const r = this.fistRest(true), a = angTo(F.x, F.y, r.x, r.y);
      F.x += Math.cos(a) * 14; F.y += Math.sin(a) * 14;
      if (dist(F.x, F.y, r.x, r.y) < 16) { F.out = false; F.done = true; }
    }
    if (F.t % 2 === 0) this.fb.add(new FBEffect('smoke', F.x + 40, F.y, { dur: 24 }));
    if (h.active && dist(h.x, h.y, F.x, F.y) < 66) h.hit(F.x, F.y, 12);
  }

  updateEye() {
    const E = this.eye, fb = this.fb, h = fb.hero, hp = this.headPos();
    E.t++;
    if (E.t < 55) { E.ang += Math.max(-0.05, Math.min(0.05, angDiff(E.ang, angTo(hp.x, hp.y, h.x, h.y)))); return; }
    if (E.t === 55) { E.firing = true; Sound.play('bosshit', { rate: 0.6 }); }
    if (fb.clash) return;
    E.ang += Math.max(-0.011 * this.speed(), Math.min(0.011 * this.speed(), angDiff(E.ang, angTo(hp.x, hp.y, h.x, h.y))));
    const ex = hp.x + Math.cos(E.ang) * 1800, ey = hp.y + Math.sin(E.ang) * 1800;
    E.end = { x: ex, y: ey };
    // beam clash: Sonic's beam meets the eye laser
    if (h.beam && segDist(hp.x, hp.y, h.x, h.y, h.x + Math.cos(h.beam.ang) * 1800, h.y + Math.sin(h.beam.ang) * 1800) < 90 &&
        segDist(h.x, h.y, hp.x, hp.y, ex, ey) < 110) { fb.startClash(); return; }
    if (h.active && segDist(h.x, h.y, hp.x, hp.y, ex, ey) < 30) h.hit(h.x - Math.cos(E.ang) * 10, h.y - Math.sin(E.ang) * 10, 10);
    if (E.t % 3 === 0) {
      // scorch the ground where the beam lands
      const k = (this.gy - hp.y) / Math.max(0.01, Math.sin(E.ang));
      if (k > 0 && Math.sin(E.ang) > 0) fb.add(new FBEffect('boom', hp.x + Math.cos(E.ang) * k, this.gy - 10, { dur: 14, s: 0.6 }));
    }
    if (E.t > 55 + 85) this.eye = null;
  }

  // ----------------------------------------------------------- drawing
  draw(ctx, cam, t) {
    const fl = this.flash > 0 && this.flash % 4 < 2;
    const C = (c) => (fl ? '#ffffff' : c);
    const by = this.baseY() + this.bob() - cam.y, x = this.x - cam.x;
    const steel = C('#4a5163'), steelL = C('#7a8396'), dark = C('#262b38'), red = C('#d42b2b'), yel = C('#ffd23f');
    ctx.save();
    ctx.lineJoin = 'round';
    const box = (x0, y0, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x0, y0, w, h); ctx.strokeStyle = '#11141e'; ctx.lineWidth = 4; ctx.strokeRect(x0, y0, w, h); };
    const shake = (P) => (P && P.state !== 'on' ? (Math.random() - 0.5) * 6 : 0);

    // back arm & pod (behind the body)
    this.drawArm(ctx, cam, false, C, t);
    if (this.attached('backPod')) this.drawPod(ctx, x + 165 + shake(this.parts.backPod), by - 545, C, this.parts.backPod, t);

    // legs
    for (const lx of [-120, 40]) {
      box(x + lx, by - 280, 80, 210, steel);
      box(x + lx - 6, by - 200, 92, 30, yel);
      box(x + lx - 20, by - 70, 120, 70, dark);
      ctx.fillStyle = red; ctx.fillRect(x + lx - 14, by - 64, 108, 12);
    }
    // hips + torso
    box(x - 150, by - 300, 300, 50, dark);
    ctx.fillStyle = steelL; ctx.strokeStyle = '#11141e'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x - 175, by - 510); ctx.lineTo(x + 175, by - 510); ctx.lineTo(x + 140, by - 285); ctx.lineTo(x - 140, by - 285); ctx.closePath(); ctx.fill(); ctx.stroke();
    // hazard stripes
    ctx.save(); ctx.beginPath(); ctx.rect(x - 140, by - 300, 280, 16); ctx.clip();
    for (let i = -10; i < 20; i++) { ctx.fillStyle = i % 2 ? yel : '#11141e'; ctx.beginPath(); ctx.moveTo(x - 140 + i * 20, by - 284); ctx.lineTo(x - 130 + i * 20, by - 300); ctx.lineTo(x - 120 + i * 20, by - 300); ctx.lineTo(x - 130 + i * 20, by - 284); ctx.fill(); }
    ctx.restore();
    // visor eyes
    const eyeOn = this.eye || (this.attack && Math.floor(t / 6) % 2);
    ctx.fillStyle = eyeOn ? '#ff3030' : '#8a1010';
    ctx.fillRect(x - 110, by - 495, 70, 16); ctx.fillRect(x + 40, by - 495, 70, 16);
    // chest plate / core
    const P = this.parts.plate;
    const cx = x, cy = by - 385;
    if (P.state !== 'gone') {
      // core glow behind cracks
      ctx.save(); ctx.translate(shake(P), 0); ctx.translate(cx, cy);
      drawPartIcon(ctx, 'plate', 1, false);
      if (fl) { ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff'; ctx.fillRect(-95, -75, 190, 150); }
      const dmg = 1 - P.hp / P.max;
      ctx.strokeStyle = '#11141e'; ctx.lineWidth = 3;
      for (let i = 0; i < Math.floor(dmg * 6); i++) { ctx.beginPath(); ctx.moveTo(-70 + i * 25, -60 + (i % 2) * 20); ctx.lineTo(-50 + i * 22, -20 + (i % 3) * 25); ctx.lineTo(-60 + i * 26, 30); ctx.stroke(); }
      ctx.restore();
    } else {
      ctx.fillStyle = '#11141e'; ctx.fillRect(cx - 90, cy - 70, 180, 140);
      const pulse = 0.6 + Math.sin(t * 0.25) * 0.4;
      const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 70);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, `rgba(255,60,60,${pulse})`); g.addColorStop(1, 'rgba(120,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff9a9a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.stroke();
    }
    // neck socket + Eggman's craft as the head
    const hp = this.headPos();
    box(x - 70, by - 540, 140, 34, dark);
    let hx = hp.x, hy = hp.y;
    if (this.fb.phase === 'rise') {
      // Eggman flies in and docks as the head
      const k = Math.max(0, Math.min(1, (this.fb.t - 40) / 170)), e = k * k * (3 - 2 * k);
      hx = this.fb.egg.x + (hp.x - this.fb.egg.x) * e; hy = this.fb.egg.y + (hp.y - this.fb.egg.y) * e - Math.sin(k * Math.PI) * 120;
    }
    ctx.save(); ctx.translate(hx - cam.x, hy - cam.y); ctx.scale(1.15, 1.15);
    drawBoss(ctx, 0, 0, t, fl, -1);
    ctx.restore();
    // front pod & arm
    if (this.attached('frontPod')) this.drawPod(ctx, x - 165 + shake(this.parts.frontPod), by - 545, C, this.parts.frontPod, t);
    this.drawArm(ctx, cam, true, C, t);
    ctx.restore();

    // prompts over loose parts
    if (this.fb.phase === 'battle' && !this.fb.hero.carry && !this.fb.hero.rip) {
      for (const P of Object.values(this.parts)) {
        if (P.state !== 'loose') continue;
        const c = this.partCenter(P.key);
        drawPrompt(ctx, c.x - cam.x, c.y - cam.y - 78, 'grab', 'RIP IT OFF!', t);
      }
    }
    // eye laser
    if (this.eye) {
      const E = this.eye, sx = hp.x - cam.x, sy = hp.y - cam.y + 10;
      if (!E.firing) {
        ctx.save(); ctx.strokeStyle = `rgba(255,40,40,${0.4 + 0.4 * Math.sin(t * 0.8)})`; ctx.lineWidth = 2; ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(E.ang) * 1800, sy + Math.sin(E.ang) * 1800); ctx.stroke(); ctx.restore();
      } else {
        const e = this.fb.clash ? this.fb.clashPoint() : E.end;
        if (e) drawBeam(ctx, sx, sy, e.x - cam.x, e.y - cam.y, 30, '#ffffff', '#ff2a2a', t);
      }
    }
  }

  drawPod(ctx, px, py, C, P, t) {
    ctx.save(); ctx.translate(px, py);
    if (P.state !== 'on' && Math.floor(t / 4) % 2) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 24; }
    ctx.fillStyle = C('#5a6275'); ctx.strokeStyle = '#11141e'; ctx.lineWidth = 4;
    ctx.fillRect(-48, -34, 96, 68); ctx.strokeRect(-48, -34, 96, 68);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#111';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(-26 + i * 26, -12 + j * 24, 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = C('#ffd23f'); ctx.fillRect(-48, 26, 96, 8);
    if (P.state !== 'on') drawSparkle(ctx, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 50, (t % 12) / 12, '#ffe680');
    ctx.restore();
  }

  drawArm(ctx, cam, front, C, t) {
    const key = front ? 'frontArm' : 'backArm', P = this.parts[key];
    const by = this.baseY() + this.bob();
    const sh = { x: this.x + (front ? -175 : 175) - cam.x, y: by - 470 - cam.y };
    if (P.state === 'gone') {
      ctx.fillStyle = '#11141e'; ctx.beginPath(); ctx.arc(sh.x, sh.y, 30, 0, Math.PI * 2); ctx.fill();
      if (t % 4 === 0) drawSparkle(ctx, sh.x + (Math.random() - 0.5) * 30, sh.y + (Math.random() - 0.5) * 30, 0.3, '#ffb02e');
      return;
    }
    const rest = this.fistRest(front);
    let fx = rest.x - cam.x, fy = rest.y - cam.y;
    const F = front ? this.fist : null;
    const flying = F && F.out;
    const sk = P.state !== 'on' ? (Math.random() - 0.5) * 6 : 0;
    // upper arm + forearm
    const ex = (sh.x + fx) / 2 + (front ? -30 : 30), ey = (sh.y + fy) / 2;
    ctx.lineCap = 'round';
    for (const [w, c] of [[52, '#11141e'], [44, C('#5a6275')]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(ex + sk, ey); ctx.lineTo(flying ? fx : fx + sk, fy); ctx.stroke();
    }
    ctx.fillStyle = C('#ffd23f'); ctx.beginPath(); ctx.arc(ex + sk, ey, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C('#7a8396'); ctx.strokeStyle = '#11141e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (flying) {
      // cable to the rocket fist
      ctx.strokeStyle = '#2a2f3d'; ctx.lineWidth = 6; ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(F.x - cam.x, F.y - cam.y); ctx.stroke(); ctx.setLineDash([]);
      fx = F.x - cam.x; fy = F.y - cam.y;
      ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.arc(fx + (F.back ? -40 : 40) * Math.sign(F.vx || -1) * -1, fy, 16 + Math.random() * 8, 0, Math.PI * 2); ctx.fill();
    }
    // fist
    ctx.save(); ctx.translate(fx + (flying ? 0 : sk), fy);
    const glow = F && !F.out ? F.glow : 0;
    if (glow > 0 || (P.state !== 'on' && Math.floor(t / 4) % 2)) { ctx.shadowColor = P.state !== 'on' ? '#ffd23f' : '#ff3030'; ctx.shadowBlur = 10 + glow * 30; }
    ctx.fillStyle = C('#d42b2b'); ctx.strokeStyle = '#11141e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C('#a3141b');
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc((front ? -36 : 36), -27 + i * 18, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = C('#ffd23f'); ctx.fillRect(front ? 16 : -26, -44, 10, 88);
    if (P.state !== 'on') drawSparkle(ctx, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, (t % 12) / 12, '#ffe680');
    ctx.restore();
    // hp pip bar for parts
    if (P.state === 'on' && P.hp < P.max) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(fx - 40, fy - 70, 80, 8);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(fx - 40, fy - 70, 80 * P.hp / P.max, 8);
    }
  }
}

// ------------------------------------------------------------ the battle
class FinalBattle {
  constructor(game, egg, quick) {
    this.g = game;
    const A = game.arena;
    this.ax = A.x; this.gy = A.groundY; this.aw = A.w;
    this.camY = A.groundY - VIEW_H + 90;
    this.t = 0; this.phase = quick ? 'emeralds' : 'rise';
    this.egg = { x: egg ? egg.x : this.ax + 960, y: egg ? egg.y : this.camY + 120 };
    this.robot = new Colossus(this, quick ? 0 : 760);
    const p = game.player;
    this.hero = new SuperHero(this, p.x, p.y);
    this.objs = []; this.shake = 0; this.flash = 0; this.clash = null; this.hintT = 0;
    this.drain = 0;
    p.frozen = true; this.pStart = p.x;
    if (game.rings < 50) game.rings = 50;
    Sound.stopMusic();
  }

  add(o) { this.objs.push(o); }
  say(who, text, opts) { return this.g.speech.say(who, text, opts); }

  // Sonic reacts to whatever the robot starts doing, so the player knows the answer.
  onAttack(type) {
    const S = (t, o) => this.say('sonic', t, { dur: 200, prio: 2, ...o });
    if (type === 'punch') S('Big fist incoming! Fly out of the way!', { once: 'fist' }) || S('Fist again! Dodge it!', { cool: 1200, coolKey: 'fist2', dur: 120, prio: 1 });
    if (type === 'slam') S("He's gonna slam! Stay up high!", { once: 'slam' });
    if (type === 'missiles') S('Shit, I better smash those rockets! {punch}', { once: 'rockets' }) || S('More rockets! {punch} \'em!', { cool: 900, coolKey: 'rockets2', dur: 130, prio: 1 });
    if (type === 'eye') S('Laser, huh? Two can play that game! Hold {laser}, aim at his face!', { once: 'eye', dur: 260 }) || S('Beam him back! Hold {laser}!', { cool: 1000, coolKey: 'eye2', dur: 140, prio: 1 });
    if (type === 'rain') S('Heads up! Falling debris!', { once: 'rain' });
  }
  onLoose(key) {
    const names = { frontArm: 'arm', backArm: 'arm', frontPod: 'rocket pod', backPod: 'rocket pod', plate: 'chest plate' };
    this.say('sonic', `That ${names[key]}'s loose! Time to rip it off! Fly close + hold {grab}`, { prio: 3, dur: 260 });
  }

  hitAt(px, py, r, dmg) {
    // projectiles first
    let hit = false;
    for (const o of this.objs) {
      if ((o instanceof Missile || (o instanceof Debris && o.t >= 45)) && !o.dead && dist(px, py, o.x, o.y) < r + 24) { o.smash(); hit = true; }
    }
    const R = this.robot;
    if (R.hp <= 0 || this.phase !== 'battle') return hit;
    for (const [key, x, y, rr] of R.regions()) {
      if (dist(px, py, x, y) < r + rr * 0.6) {
        R.hitRegion(key, px, py, dmg);
        this.add(new FBEffect('boom', px + (Math.random() - 0.5) * 30, py + (Math.random() - 0.5) * 30, { dur: 14, s: 0.7 }));
        return true;
      }
    }
    return hit;
  }

  beamHit(ox, oy, ang, w, dmg) {
    const R = this.robot, cos = Math.cos(ang), sin = Math.sin(ang);
    const regions = R.hp > 0 ? R.regions() : [];
    for (let d = 30; d < 1700; d += 24) {
      const px = ox + cos * d, py = oy + sin * d;
      for (const o of this.objs) if ((o instanceof Missile || (o instanceof Debris && o.t >= 45)) && dist(px, py, o.x, o.y) < w + 20) o.smash();
      for (const [key, x, y, rr] of regions) {
        if (dist(px, py, x, y) < rr * 0.75 + w * 0.3) {
          R.hitRegion(key, px, py, dmg);
          if (this.t % 4 === 0) this.add(new FBEffect('boom', px, py, { dur: 14, s: 0.8 }));
          return { x: px, y: py };
        }
      }
      if (py > this.gy || px < this.ax - 50 || px > this.ax + this.aw + 50 || py < this.camY - 50) return { x: px, y: py };
    }
    return { x: ox + cos * 1700, y: oy + sin * 1700 };
  }

  startClash() {
    this.clash = { v: 0.5, t: 0 };
    this.say('sonic', 'MASH {punch}!!!', { prio: 4, dur: 200 });
    this.add(new FBEffect('text', this.hero.x, this.hero.y - 80, { text: 'BEAM CLASH! MASH!', dur: 80, size: 20, color: '#fff' }));
  }
  clashPoint() {
    const h = this.hero, hp = this.robot.headPos(), v = this.clash ? this.clash.v : 0.5;
    return { x: h.x + (hp.x - h.x) * v, y: h.y + (hp.y - h.y) * v };
  }
  updateClash(inp) {
    const C = this.clash, R = this.robot, h = this.hero;
    C.t++;
    if (inp.punchPressed || inp.laserPressed || inp.jumpPressed) C.v += 0.05;
    C.v -= 0.0055 * R.speed();
    if (h.beam) { h.beam.t = 0; h.beam.ang = angTo(h.x, h.y, R.headPos().x, R.headPos().y); }
    this.shake = Math.max(this.shake, 4);
    const p = this.clashPoint();
    if (C.t % 3 === 0) this.add(new FBEffect('spark', p.x + (Math.random() - 0.5) * 60, p.y + (Math.random() - 0.5) * 60, { dur: 14, color: C.t % 2 ? '#fff' : '#ff6060' }));
    if (C.v >= 1 || (C.t > 420 && C.v >= 0.5)) {
      this.clash = null; R.eye = null; R.attack = null; R.cool = 120; R.stun = 160;
      h.beam = null; h.laserCD = 30;
      const hp = R.headPos();
      R.damage(45, hp.x, hp.y, true);
      for (let i = 0; i < 8; i++) this.add(new FBEffect('boom', hp.x + (Math.random() - 0.5) * 140, hp.y + (Math.random() - 0.5) * 100, { dur: 26, s: 1.5 }));
      this.add(new FBEffect('text', hp.x, hp.y - 90, { text: 'OVERPOWERED!', dur: 70, size: 26 }));
      this.say('eggman', 'IMPOSSIBLE!', { dur: 90 });
      this.shake = 20; Sound.play('boom'); Sound.play('bosshit');
    } else if (C.v <= 0 || C.t > 420) {
      this.clash = null; R.eye = null; R.attack = null; R.cool = 90;
      h.beam = null; h.laserCD = 60; h.invuln = 0;
      h.hit(R.headPos().x, R.headPos().y, 20);
      this.say('sonic', 'Ugh! Gotta mash harder!', { prio: 3, dur: 120 });
    }
  }

  startFinale() {
    if (this.phase === 'finale' || this.phase === 'outro') return;
    this.phase = 'finale'; this.t = 0; this.clash = null;
    const R = this.robot; R.eye = null; R.attack = null; R.fist = null;
    this.hero.beam = null; this.hero.charge = 0;
    this.objs = this.objs.filter((o) => o instanceof FloatRing || o instanceof FBEffect);
    this.g.addScore(10000);
  }

  update(inp) {
    const g = this.g, R = this.robot, h = this.hero;
    this.t++;
    if (this.shake > 0) this.shake *= 0.88;
    if (this.shake < 0.5) this.shake = 0;
    if (this.flash > 0) this.flash -= 0.03;
    document.getElementById('touch').classList.toggle('super', this.phase === 'battle');

    if (this.phase === 'rise' || this.phase === 'emeralds') {
      // Sonic walks to the left side of the arena and waits
      const p = g.player, k = Math.min(1, this.t / 90);
      if (this.phase === 'rise') p.x = this.pStart + (this.ax + 320 - this.pStart) * (k * (2 - k));
      Object.assign(p, { y: this.gy - STAND_H, ground: true, state: 'normal', jumping: false, rolling: false, spindash: false, springing: false, facing: 1, angle: 0, drawAngle: 0, xsp: 0, ysp: 0 });
      p.gsp = this.phase === 'rise' && k < 1 ? 3 : 0;
      p.animate();
    }
    if (this.phase === 'rise') {
      // Eggman flies up and docks as the robot's head while the body rises.
      const k = Math.min(1, this.t / 240), e = 1 - Math.pow(1 - k, 3);
      R.rise = 760 * (1 - e);
      R.t++;
      this.shake = Math.max(this.shake, 5 * (1 - k) + 1);
      if (this.t === 1) Sound.play('boom');
      if (this.t === 30) this.say('eggman', 'Ho ho ho! You think THAT was my best?!', { dur: 130 });
      if (this.t === 150) this.say('eggman', 'Behold... the EGG COLOSSUS!!', { dur: 100 });
      if (this.t === 228) this.say('sonic', 'FUCK.', { big: true, dur: 120, prio: 5 });
      if (this.t % 40 === 0 && this.t < 220) Sound.play('boom', { vol: 0.5, rate: 0.6 });
      if (this.t % 6 === 0 && this.t < 230) this.add(new FBEffect('smoke', R.x + (Math.random() - 0.5) * 400, this.gy - 10, { dur: 40 }));
      if (this.t >= 260) { this.phase = 'emeralds'; this.t = 0; }
    } else if (this.phase === 'emeralds') {
      R.t++;
      if (this.t === 1) Sound.play('shield', { rate: 0.7 });
      if (this.t === 1) this.say('eggman', 'Language, hedgehog!', { dur: 90 });
      if (this.t === 60) this.say('sonic', '...Okay. Time to go Super.', { dur: 110, prio: 2 });
      if (this.t === 170) { this.flash = 1; Sound.play('oneup'); }
      if (this.t === 175) {
        const p = g.player;
        h.x = p.x; h.y = p.y - 20; h.active = true; h.invuln = 60;
        Sound.playTrack('assets/music/with_me.mp3', 'final');
        this.add(new FBEffect('text', h.x, h.y - 90, { text: 'SUPER SONIC', dur: 100, size: 30 }));
      }
      if (this.t >= 200) { this.phase = 'battle'; this.t = 0; this.hintT = 420; }
    } else if (this.phase === 'battle') {
      if (this.hintT > 0) this.hintT--;
      if (this.t === 20) this.say('sonic', "Let's do this! Mash {punch} for light fists, hold {laser} for a laser!", { dur: 300, prio: 2 });
      if (this.t === 330) this.say('sonic', 'Beat a part till it sparks, then rip it off and throw it back!', { dur: 260, once: 'plan' });
      if (this.t === 1500 && h.cloneCD <= 0) this.say('sonic', "Let's double up! {clones} Light Clones!", { once: 'clones', dur: 220 });
      if (g.rings < 15 && g.rings > 0) this.say('sonic', 'Burning out... I need rings! Grab the gold ones!', { cool: 900, coolKey: 'rings', prio: 3 });
      if (R.coreExposed()) this.say('sonic', "His core's exposed! Hit it with EVERYTHING!", { once: 'core', prio: 3, dur: 220 });
      if (R.hp < R.maxHp * 0.35) this.say('eggman', 'No! NO! My masterpiece!!', { once: 'lowhp', dur: 140 });
      if (this.clash) this.updateClash(inp);
      else { h.update(inp); R.update(); }
      // Super form burns a ring per second
      if (++this.drain >= 60) {
        this.drain = 0;
        g.rings = Math.max(0, g.rings - 1);
        if (g.rings === 0) { this.phase = 'lost'; this.t = 0; h.active = false; Sound.play('death'); Sound.stopTrack(); Sound.stopMusic(); this.say('sonic', 'No... my power...', { prio: 5, dur: 120 }); }
      }
      // occasional ring top-up so a skilled player can keep going
      if (this.t % 420 === 0) for (let i = 0; i < 4; i++) this.add(new FloatRing(this, this.ax + 100 + Math.random() * 700, this.camY + 40, 0, 1));
    } else if (this.phase === 'finale') {
      R.t++;
      this.shake = Math.max(this.shake, 8);
      if (this.t % 5 === 0) {
        this.add(new FBEffect('boom', R.x + (Math.random() - 0.5) * 380, this.gy - Math.random() * 600, { dur: 26, s: 1 + Math.random() }));
        Sound.play('boom', { vol: 0.5, rate: 0.7 + Math.random() * 0.6 });
      }
      h.vx *= 0.9; h.vy *= 0.9; h.x += h.vx; h.y += h.vy;
      if (this.t === 200) { this.flash = 1.4; Sound.play('boom'); }
      if (this.t > 200) {
        R.rise += 6 + (this.t - 200) * 0.4;       // the wreck sinks into the ground
        this.egg = this.egg || {};
      }
      if (this.t >= 300) { this.phase = 'outro'; this.t = 0; this.escape = { x: R.headPos().x, y: R.headPos().y }; }
    } else if (this.phase === 'outro') {
      this.escape.x += 7; this.escape.y -= 4;
      h.x += (this.ax + 640 - h.x) * 0.03; h.y += (this.gy - 260 - h.y) * 0.03;
      if (this.t === 10) this.say('eggman', "I'll get you next time, Sonic!!!", { dur: 120 });
      if (this.t === 120) this.say('sonic', 'Too slow, Eggman!', { dur: 120 });
      if (this.t === 90) this.add(new FBEffect('text', this.ax + 640, this.gy - 400, { text: 'EGG COLOSSUS DESTROYED!', dur: 160, size: 26 }));
      if (this.t === 200) g.startTally();
    } else if (this.phase === 'lost') {
      h.y += Math.min(14, this.t * 0.5);
      if (this.t > 120) { g.finalDeath(); return; }
    }

    for (const o of this.objs) o.update(this);
    this.objs = this.objs.filter((o) => !o.dead);
  }

  drawSky(ctx, t) {
    // stormy red/purple sky for the showdown
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#12051f'); g.addColorStop(0.55, '#4a0f3a'); g.addColorStop(1, '#c2412b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.03 + i));
      ctx.fillRect((i * 197.3) % VIEW_W, (i * 83.7) % (VIEW_H * 0.55), 2, 2);
    }
    ctx.globalAlpha = 1;
    // giant moon
    ctx.fillStyle = 'rgba(255,220,200,.15)'; ctx.beginPath(); ctx.arc(260, 170, 120, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,210,.35)'; ctx.beginPath(); ctx.arc(260, 170, 90, 0, Math.PI * 2); ctx.fill();
    if (this.flash <= 0 && Math.random() < 0.006) this.flash = 0.35;   // distant lightning
  }

  draw(ctx, cam, t) {
    const c = { x: cam.x, y: cam.y };
    if (this.shake) { c.x += (Math.random() - 0.5) * this.shake * 2; c.y += (Math.random() - 0.5) * this.shake * 2; }
    const g = this.g, R = this.robot, h = this.hero;
    if (this.phase === 'rise' && this.t < 60) g.world.drawBackground(ctx, c, t);
    else this.drawSky(ctx, t);
    if (this.phase === 'rise' && this.t < 60) { ctx.globalAlpha = this.t / 60; this.drawSky(ctx, t); ctx.globalAlpha = 1; }

    if (this.phase !== 'outro' || true) R.draw(ctx, c, t);
    if (this.phase === 'outro') {
      ctx.save(); ctx.translate(this.escape.x - c.x, this.escape.y - c.y); ctx.scale(0.8, 0.8);
      drawBoss(ctx, 0, 0, t, false, 1); ctx.restore();
    }
    g.world.drawTiles(ctx, { x: Math.round(c.x), y: Math.round(c.y) });
    for (const o of this.objs) if (!(o instanceof FBEffect)) o.draw(ctx, c, t);

    // the hero
    if (h.active) h.draw(ctx, c, t);
    else if (this.phase === 'lost') drawSonicFrame(ctx, animFrame('dead', 0), h.x - c.x, h.y - c.y + 34, {});
    else g.player.draw(ctx, c, t);

    if (this.phase === 'emeralds') this.drawEmeralds(ctx, c, t);
    for (const o of this.objs) if (o instanceof FBEffect) o.draw(ctx, c, t);
    if (h.active && h.target && this.phase === 'battle') this.drawReticle(ctx, h.target.x - c.x, h.target.y - c.y, t);

    if (this.phase === 'rise' && Math.floor(this.t / 15) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,0,0,.18)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      g.text(ctx, 'WARNING', VIEW_W / 2, 300, 56, '#ff3030', 'center', '#000');
      g.text(ctx, 'EGG COLOSSUS APPROACHING', VIEW_W / 2, 350, 18, '#fff', 'center', '#000');
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  }

  drawEmeralds(ctx, c, t) {
    const p = this.g.player, k = Math.min(1, this.t / 160);
    const r = 260 * (1 - k) + 30, spin = this.t * (0.03 + k * 0.25);
    for (let i = 0; i < 7; i++) {
      const a = spin + i / 7 * Math.PI * 2;
      drawEmerald(ctx, p.x - c.x + Math.cos(a) * r, p.y - c.y + Math.sin(a) * r * 0.8, EMERALD_COLORS[i], 1.2 + k * 0.4);
    }
    if (this.t > 120) drawSuperAura(ctx, p.x - c.x, p.y - c.y, t, (this.t - 120) / 30);
  }

  drawReticle(ctx, x, y, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.04);
    ctx.strokeStyle = 'rgba(120,240,255,.85)'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, 34, -0.4, 0.4); ctx.stroke(); }
    ctx.restore();
  }

  drawHUD(ctx) {
    const g = this.g, R = this.robot, h = this.hero;
    if (this.phase === 'battle' || this.phase === 'finale') {
      const w = 520, x = VIEW_W / 2 - w / 2, y = 26;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 5, y - 5, w + 10, 26);
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x, y, w * R.hp / R.maxHp, 16);
      g.text(ctx, 'EGG COLOSSUS', VIEW_W / 2, y + 48, 14, '#fff', 'center');
      // cooldowns
      const cd = [['X LASER', h.laserCD > 0 ? 1 - h.laserCD / 70 : 1, h.charge / 90], ['C CLONES', h.cloneCD > 0 ? 1 - h.cloneCD / 220 : 1, 0]];
      cd.forEach(([label, ready, charge], i) => {
        const bx = 30, by = VIEW_H - 180 + i * 34;
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx, by, 190, 22);
        ctx.fillStyle = ready >= 1 ? '#ffd23f' : '#8a7a30'; ctx.fillRect(bx, by, 190 * Math.min(1, ready), 22);
        if (charge) { ctx.fillStyle = '#fff'; ctx.fillRect(bx, by + 16, 190 * charge, 6); }
        g.text(ctx, label, bx + 8, by + 17, 11, '#1a1406', 'left', null);
      });
    }
    if (this.hintT > 0 && this.phase === 'battle') {
      ctx.globalAlpha = Math.min(1, this.hintT / 60);
      ctx.fillStyle = 'rgba(0,0,20,.6)'; ctx.fillRect(140, VIEW_H - 92, VIEW_W - 280, 64);
      const touch = document.getElementById('touch').classList.contains('on');
      const l1 = touch ? 'D-PAD FLY   A LIGHT FISTS   B LASER (HOLD)' : 'ARROWS FLY   Z LIGHT FISTS   X LASER (HOLD, RELEASE)';
      const l2 = touch ? 'X LIGHT CLONES   Y RIP OFF / THROW LOOSE PARTS' : 'C LIGHT CLONES   V/SHIFT RIP OFF + THROW LOOSE PARTS';
      g.text(ctx, l1, VIEW_W / 2, VIEW_H - 64, 13, '#fff', 'center');
      g.text(ctx, l2, VIEW_W / 2, VIEW_H - 38, 13, '#ffd23f', 'center');
      ctx.globalAlpha = 1;
    }
    if (this.clash) {
      const w = 400, x = VIEW_W / 2 - w / 2, y = 120;
      ctx.fillStyle = '#ff2a2a'; ctx.fillRect(x, y, w, 20);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y, w * this.clash.v, 20);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, 20);
      if (Math.floor(this.clash.t / 8) % 2) g.text(ctx, 'MASH Z!', VIEW_W / 2, y + 56, 22, '#fff', 'center');
    }
  }
}
