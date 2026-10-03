// Final part of the showdown: Super Sonic rips Eggman out of the Egg Colossus
// and beats him around the arena. Eggman fights back but gets more scared with
// every hit. At the last second Metal Sonic snatches him away. To be continued.
'use strict';

const EGG_SCALE = 2.5;
const POW_WORDS = ['POW!', 'WHAM!', 'SMACK!', 'BAM!', 'CRACK!', 'THWACK!', 'BONK!', 'KAPOW!', 'WHUMP!'];
const EGG_FEAR_LINES = [
  [0.12, 'You\'ll pay for that, you blue rodent!'],
  [0.3, 'Ow! OW! Not the mustache!'],
  [0.48, 'Okay, okay! I\'m sorry! I\'ll stop!'],
  [0.66, 'SOMEBODY HELP ME!!!'],
  [0.82, 'M-mommy...'],
];
const SONIC_BRAWL_QUIPS = ["That's for the animals!", 'Not so tough without your robot!', 'Yeah, run!', "I'm just getting started!", 'Too slow!', 'Get back here!'];

function eggFrame(name) { return EGG_FRAME_NAMES.indexOf(name); }

// Draw an Eggman frame with feet at (x, y). Sprites face left; flip = face right.
function drawEggFrame(ctx, idx, x, y, opts = {}) {
  const img = Assets.img[opts.white ? 'eggman_white' : 'eggman'], f = EGG_FRAMES[idx];
  if (!img || !f) return;
  const s = opts.scale || EGG_SCALE, w = f[2] * s, h = f[3] * s;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y - (opts.center ? 0 : 0));
  if (opts.rot) { ctx.translate(0, -h / 2); ctx.rotate(opts.rot); ctx.translate(0, h / 2); }
  if (opts.flip) ctx.scale(-1, 1);
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  ctx.drawImage(img, f[0], f[1], f[2], f[3], Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
  ctx.restore();
}

// Comic-book impact burst
function drawPow(ctx, x, y, word, k, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const s = (k < 0.25 ? k / 0.25 * 1.25 : 1.25 - (k - 0.25) * 0.3);
  ctx.scale(s, s);
  ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, r = i % 2 ? 34 : 62 + (i % 4 === 0 ? 10 : 0);
    ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.85);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffe23d'; ctx.fill(); ctx.strokeStyle = '#1a0a00'; ctx.lineWidth = 5; ctx.stroke();
  ctx.font = `22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a0a00'; ctx.fillText(word, 3, 4);
  ctx.fillStyle = '#e3262e'; ctx.fillText(word, 0, 0);
  ctx.restore();
}

class PowFX {
  constructor(x, y, word, big) { this.x = x; this.y = y; this.word = word; this.t = 0; this.dur = big ? 46 : 32; this.rot = (Math.random() - 0.5) * 0.5; this.big = big; }
  update() { if (++this.t >= this.dur) this.dead = true; }
  draw(ctx, cam) { ctx.save(); const s = this.big ? 1.3 : 0.9; ctx.translate(this.x - cam.x, this.y - cam.y); ctx.scale(s, s); drawPow(ctx, 0, 0, this.word, this.t / this.dur, this.rot); ctx.restore(); }
}

class EggBomb {
  constructor(fb, x, y, vx, vy) { this.fb = fb; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.t = 0; }
  update() {
    this.t++; this.vy += 0.35; this.x += this.vx; this.y += this.vy;
    const h = this.fb.hero;
    if (h.active && dist(h.x, h.y, this.x, this.y) < 40) { h.hit(this.x, this.y, 6); this.explode(); }
    if (this.y > this.fb.gy - 10 || this.t > 200) this.explode();
  }
  explode() { this.dead = true; this.fb.add(new FBEffect('boom', this.x, this.y, { dur: 22, s: 1.1 })); Sound.play('boom', { vol: 0.4, rate: 1.3 }); }
  smash() { this.explode(); this.fb.g.addScore(50); }
  draw(ctx, cam) {
    const img = Assets.img[this.t % 8 < 4 ? 'bomb' : 'bomb_active'];
    if (img) ctx.drawImage(img, Math.round(this.x - 24 - cam.x), Math.round(this.y - 30 - cam.y), 48, 48);
  }
}

class BrawlEggman {
  constructor(fb, x, y) {
    this.fb = fb; this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.ground = false;
    this.hp = 160; this.max = 160; this.t = 0; this.stun = 0; this.flash = 0; this.rot = 0;
    this.act = null; this.cool = 70; this.facing = -1; this.thrown = false; this.saidFear = 0;
    this.state = 'air';
  }
  get fear() { return 1 - this.hp / this.max; }
  center() { return { x: this.x, y: this.y - 60 }; }

  update() {
    const fb = this.fb, h = fb.hero;
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.state === 'grabbed' || this.state === 'carried') return;
    const L = fb.ax + 60, R = fb.ax + fb.aw - 60;
    if (!this.ground) {
      this.vy += 0.6; this.x += this.vx; this.y += this.vy; this.rot += this.vx * 0.018;
      if (this.y < fb.camY + 150) { this.y = fb.camY + 150; this.vy = Math.abs(this.vy) * 0.3; }
      if (this.x < L || this.x > R) {
        this.x = this.x < L ? L : R;
        if (Math.abs(this.vx) > 8) {
          this.damage(5 + Math.abs(this.vx) * 0.35, true);
          fb.shake = Math.max(fb.shake, 16); fb.hitStop = Math.max(fb.hitStop, 6);
          fb.add(new PowFX(this.x, this.y - 70, 'SPLAT!', true));
          for (let i = 0; i < 4; i++) fb.add(new FBEffect('boom', this.x, this.y - 40 - i * 25, { dur: 20 }));
          Sound.play('boom', { vol: 0.8 });
        }
        this.vx = -this.vx * 0.35;
      }
      if (this.y >= fb.gy) {
        this.y = fb.gy;
        if (this.vy > 10) {
          const slam = this.thrown || this.vy > 16;
          this.damage(slam ? 6 + this.vy * 0.4 : this.vy * 0.25, slam);
          fb.shake = Math.max(fb.shake, this.vy);
          if (slam) { fb.add(new PowFX(this.x, this.y - 60, 'SLAM!', true)); fb.hitStop = Math.max(fb.hitStop, 6); }
          fb.add(new FBEffect('boom', this.x, this.y - 10, { dur: 22, s: 1.3 }));
          Sound.play('boom', { vol: 0.6, rate: 0.8 });
          this.vy = -this.vy * 0.4; this.vx *= 0.6; this.thrown = false;
        } else {
          this.ground = true; this.vy = 0; this.rot = 0; this.thrown = false;
          this.state = this.stun > 0 ? 'down' : 'idle';
        }
      }
      return;
    }
    this.vx *= 0.82; this.x = Math.max(L, Math.min(R, this.x + this.vx));
    if (this.stun > 0) { this.stun--; if (this.stun === 0) this.state = 'idle'; return; }
    if (!this.act) {
      this.state = 'idle'; this.facing = h.x < this.x ? -1 : 1;
      if (--this.cool <= 0) this.choose();
      return;
    }
    this.runAct(h, L, R);
  }

  choose() {
    const f = this.fear;
    const pool = f < 0.3 ? ['charge', 'bombs', 'leap', 'charge']
      : f < 0.65 ? ['charge', 'bombs', 'flee', 'leap', 'flee', 'cower']
        : ['flee', 'cower', 'flee', 'bombs', 'cower'];
    const type = pool[Math.floor(Math.random() * pool.length)];
    this.act = { type, t: 0, dir: this.fb.hero.x < this.x ? -1 : 1 };
    if (type === 'leap') { this.vy = -14; this.vx = this.act.dir * (7 - f * 3); this.ground = false; this.state = 'leap'; }
    if (type === 'cower') this.fb.say('eggman', ['P-please, no more!', "I'll be good, I swear!", 'Waaah! Not the face!'][Math.floor(Math.random() * 3)], { cool: 300, coolKey: 'cower', dur: 110 });
  }

  runAct(h, L, R) {
    const A = this.act, fb = this.fb, f = this.fear;
    A.t++;
    if (A.type === 'charge') {
      this.state = 'run'; this.facing = A.dir;
      this.x += A.dir * (6.5 - f * 3);
      if (Math.abs(h.x - this.x) < 70 && h.y > this.y - 170 && h.active) h.hit(this.x, this.y - 60, 6);
      if (A.t > 70 || this.x <= L || this.x >= R) this.endAct();
    } else if (A.type === 'flee') {
      this.state = 'run'; this.facing = -A.dir;
      this.x -= A.dir * (5 + f * 2);
      if (f > 0.5 && A.t === 30 && Math.random() < 0.4) { // trips over his own feet
        this.act = null; this.stun = 45; this.state = 'down'; this.cool = 30;
        fb.add(new PowFX(this.x, this.y - 40, 'TRIP!', false)); Sound.play('skid');
        return;
      }
      if (A.t > 60 || this.x <= L || this.x >= R) this.endAct();
    } else if (A.type === 'bombs') {
      this.state = 'throw'; this.facing = h.x < this.x ? -1 : 1;
      const n = f < 0.4 ? 3 : f < 0.7 ? 2 : 1;
      if (A.t % 18 === 10 && A.t < 10 + n * 18) {
        const dx = h.x - this.x, tt = 40;
        fb.add(new EggBomb(fb, this.x + this.facing * 30, this.y - 110, dx / tt, -9));
        Sound.play('roll', { rate: 0.8 });
      }
      if (A.t > 20 + n * 18) this.endAct();
    } else if (A.type === 'cower') {
      this.state = 'cower';
      if (A.t > 80) this.endAct();
    } else if (A.type === 'leap') {
      this.endAct();
    }
  }
  endAct() { this.act = null; this.cool = 30 + this.fear * 40; }

  damage(d, big) {
    this.hp -= d; this.flash = big ? 10 : 6;
    if (this.hp <= 1) { this.hp = 1; this.fb.startRescue(); }
  }

  takeHit(dmg, kx, ky, big, word) {
    const fb = this.fb;
    if (fb.phase !== 'brawl' || this.state === 'grabbed') return false;
    this.damage(dmg, big);
    if (fb.phase !== 'brawl') return true;
    this.vx = kx; this.vy = ky;
    if (ky < 0 || !this.ground) { this.ground = false; this.state = 'air'; }
    this.stun = big ? 50 : 24; this.act = null; this.cool = 25;
    fb.hitStop = Math.max(fb.hitStop, big ? 9 : 4);
    fb.shake = Math.max(fb.shake, big ? 14 : 5);
    fb.zoom = Math.max(fb.zoom, big ? 1.09 : 1.035);
    const c = this.center();
    fb.add(new PowFX(c.x + (Math.random() - 0.5) * 40, c.y - 30 + (Math.random() - 0.5) * 30, word || POW_WORDS[Math.floor(Math.random() * POW_WORDS.length)], big));
    for (let i = 0; i < (big ? 8 : 4); i++) fb.add(new FBEffect('spark', c.x + (Math.random() - 0.5) * 70, c.y + (Math.random() - 0.5) * 70, { dur: 16, color: i % 2 ? '#fff' : '#ffe680' }));
    Sound.play('pop', { rate: big ? 0.6 : 0.9 + Math.random() * 0.3 });
    if (big) Sound.play('bosshit', { rate: 0.9 });
    fb.brawlCombo = { n: (fb.brawlCombo && fb.brawlCombo.t > 0 ? fb.brawlCombo.n : 0) + 1, t: 100 };
    fb.g.addScore(big ? 300 : 100);
    if (fb.brawlCombo.n % 5 === 0) fb.add(new FloatRing(fb, c.x, c.y, (Math.random() - 0.5) * 6, -5));
    // fear dialogue
    while (this.saidFear < EGG_FEAR_LINES.length && this.fear >= EGG_FEAR_LINES[this.saidFear][0]) {
      fb.say('eggman', EGG_FEAR_LINES[this.saidFear][1], { dur: 150, prio: 2 });
      this.saidFear++;
    }
    if (big) fb.say('sonic', SONIC_BRAWL_QUIPS[Math.floor(Math.random() * SONIC_BRAWL_QUIPS.length)], { cool: 360, coolKey: 'bq', dur: 100 });
    return true;
  }

  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    let idx, rot = 0, flip = this.facing > 0;
    const lose = (spd) => eggFrame('lose' + (Math.floor(t * spd) % 8));
    if (this.state === 'run') idx = eggFrame('run' + (Math.floor(t * 0.25) % 4));
    else if (this.state === 'idle' || this.state === 'throw') idx = eggFrame('stand');
    else if (this.state === 'cower') idx = lose(0.15);
    else if (this.state === 'down') idx = eggFrame('lose2');
    else { idx = lose(0.3); rot = this.ground ? 0 : this.rot; }
    let dx = 0;
    if (this.state === 'cower' || this.fear > 0.6) dx = (Math.random() - 0.5) * (this.state === 'cower' ? 6 : 2);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, this.fb.gy - cam.y - 2, 44, 10, 0, 0, Math.PI * 2); ctx.fill();
    drawEggFrame(ctx, idx, x + dx, y, { flip, rot });
    if (this.flash > 0 && this.flash % 4 < 2) drawEggFrame(ctx, idx, x + dx, y, { flip, rot, white: true, alpha: 0.85 });
    // sweat drops when scared
    if (this.fear > 0.35 && t % 30 < 20) {
      ctx.fillStyle = '#9fe3ff';
      for (let i = 0; i < 1 + Math.floor(this.fear * 3); i++) {
        const sx = x + (i % 2 ? 40 : -40) + i * 4, sy = y - 120 + ((t + i * 9) % 30);
        ctx.beginPath(); ctx.moveTo(sx, sy - 8); ctx.quadraticCurveTo(sx + 6, sy + 2, sx, sy + 4); ctx.quadraticCurveTo(sx - 6, sy + 2, sx, sy - 8); ctx.fill();
      }
    }
    if (this.state === 'down' || (this.stun > 0 && this.ground)) {
      for (let i = 0; i < 3; i++) { const a = t * 0.1 + i * 2.1; drawSparkle(ctx, x + Math.cos(a) * 40, y - 100 + Math.sin(a) * 10, 0.3, '#ffe23d'); }
    }
  }
}

class MetalSonic {
  constructor(fb, tx, ty) { this.fb = fb; this.x = fb.ax + fb.aw + 200; this.y = fb.camY + 60; this.tx = tx; this.ty = ty; this.t = 0; this.state = 'in'; this.trail = []; }
  update() {
    this.t++;
    this.trail.unshift({ x: this.x, y: this.y }); if (this.trail.length > 8) this.trail.pop();
    if (this.state === 'in') {
      const a = angTo(this.x, this.y, this.tx, this.ty), d = dist(this.x, this.y, this.tx, this.ty);
      this.x += Math.cos(a) * Math.min(d, 42); this.y += Math.sin(a) * Math.min(d, 42);
      if (d < 4) this.state = 'grab';
    } else if (this.state === 'hover') {
      this.y += (this.fb.gy - 330 - this.y) * 0.06; this.x += Math.sin(this.t * 0.05) * 0.5;
    } else if (this.state === 'out') {
      this.vx = (this.vx || 0) + 1.2; this.vy = (this.vy || 0) - 0.9;
      this.x += this.vx; this.y += this.vy;
    }
  }
  draw(ctx, cam, t) {
    for (let i = this.trail.length - 1; i >= 1; i--) {
      const p = this.trail[i];
      drawSonicFrame(ctx, animFrame('dive', 0), p.x - cam.x, p.y - cam.y + 34, { sheet: 'metal', alpha: 0.25 - i * 0.025, flip: this.state !== 'out' });
    }
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    // jet flame
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(80,170,255,.7)';
    ctx.beginPath(); ctx.arc(x + (this.state === 'out' ? -20 : 20), y + 6, 10 + Math.random() * 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    drawSonicFrame(ctx, animFrame(this.state === 'hover' ? 'hover' : 'dive', 0), x, y + 34, { sheet: 'metal', flip: this.state !== 'out' });
    // glowing red eye
    if (this.state === 'hover' && this.t % 60 < 20) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x - 8, y - 22, 1, x - 8, y - 22, 26);
      g.addColorStop(0, 'rgba(255,60,60,1)'); g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x - 8, y - 22, 26, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
}
