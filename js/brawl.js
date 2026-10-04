// Final part of the showdown: Super Sonic rips Eggman out of the Egg Colossus
// and beats him around the arena. Eggman fights back but gets more scared with
// every hit. At the last second Metal Sonic snatches him away. To be continued.
'use strict';

const EGG_SCALE = 2.5;
const POW_WORDS = ['POW!', 'WHAM!', 'SMACK!', 'BAM!', 'CRACK!', 'THWACK!', 'BONK!', 'KAPOW!', 'WHUMP!'];
const EGG_FEAR_LINES = [
  [0.06, 'You\'ll pay for that, you blue rodent!'],
  [0.15, 'I have an IQ of 300! You can\'t--'],
  [0.24, 'Ow! OW! Not the mustache!'],
  [0.33, 'My teeth! You knocked out my TEETH!'],
  [0.42, 'Okay, okay! I\'m sorry! I\'ll stop!'],
  [0.51, 'I\'ll free them! I\'ll free ALL of them!'],
  [0.6, 'SOMEBODY HELP ME!!!'],
  [0.69, 'Orbot... Cubot... anyone...'],
  [0.78, 'Please... I can\'t feel my face...'],
  [0.87, 'M-mommy...'],
  [0.95, 'Metal... where are you...'],
];
const SONIC_BRAWL_QUIPS = ['Get UP.', 'You hurt my friends.', 'Look at me!', "I'm not done with you.", 'How many did you cage, huh?!', 'This is what you earned.', 'Stand up. Fight back.'];

function eggFrame(name) { return EGG_FRAME_NAMES.indexOf(name); }

// Draw an Eggman frame with feet at (x, y). Sprites face left; flip = face right.
function drawEggFrame(ctx, idx, x, y, opts = {}) {
  // opts.dmg 1-4 picks a beaten-up sheet (2x resolution, same layout)
  const dimg = !opts.white && opts.dmg && Assets.img['eggman_d' + opts.dmg];
  const img = dimg || Assets.img[opts.white ? 'eggman_white' : 'eggman'], f = EGG_FRAMES[idx];
  if (!img || !f) return;
  const k = dimg ? EGG_DMG_SCALE : 1;
  const s = opts.scale || EGG_SCALE, w = f[2] * s, h = f[3] * s;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y - (opts.center ? 0 : 0));
  if (opts.rot) { ctx.translate(0, -h / 2); ctx.rotate(opts.rot); ctx.translate(0, h / 2); }
  if (opts.flip) ctx.scale(-1, 1);
  if (opts.sx || opts.sy) ctx.scale(opts.sx || 1, opts.sy || 1);   // impact squash
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.hole) {
    // draw him on a scratch canvas, punch the hole out, then rim it with blood
    const c = drawEggFrame.scratch || (drawEggFrame.scratch = document.createElement('canvas'));
    c.width = Math.ceil(w) + 2; c.height = Math.ceil(h) + 2;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, f[0] * k, f[1] * k, f[2] * k, f[3] * k, 0, 0, Math.round(w), Math.round(h));
    const hx = w * 0.5, hy = h * 0.52, rx = w * 0.15, ry = h * 0.16;
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.lineWidth = 7; g.strokeStyle = '#4a0008'; g.beginPath(); g.ellipse(hx, hy, rx + 3, ry + 3, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.strokeStyle = '#b3121c'; g.beginPath(); g.ellipse(hx, hy, rx + 1, ry + 1, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#7a0a10'; for (let i = 0; i < 5; i++) g.fillRect(hx - rx + i * rx * 0.45, hy + ry, 3, 8 + (i * 7) % 15);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(c, Math.round(-w / 2), Math.round(-h));
  } else ctx.drawImage(img, f[0] * k, f[1] * k, f[2] * k, f[3] * k, Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
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

// Blood droplets and knocked-out teeth. They fall, hit the floor and leave stains.
class Gore {
  constructor(fb, x, y, vx, vy, kind) { this.fb = fb; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.kind = kind; this.t = 0; this.r = kind === 'blood' ? 2 + Math.random() * 3.5 : 0; this.rot = Math.random() * 6; this.life = kind === 'organ' || kind === 'gut' ? 2400 : 600; this.sz = 0.8 + Math.random() * 0.6; }
  update() {
    this.t++; this.vy += 0.45; this.x += this.vx; this.y += this.vy; this.rot += this.vx * 0.1;
    const fb = this.fb;
    if (this.x < fb.ax + 30 || this.x > fb.ax + fb.aw - 30) { this.vx = -this.vx * 0.2; if (this.kind === 'blood') fb.stain(this.x, this.y, this.r * 1.4, true); }
    if (this.y >= fb.gy - 2) {
      this.y = fb.gy - 2;
      if (this.kind === 'blood') { fb.stain(this.x, fb.gy, this.r * (1.6 + Math.random()), false); this.dead = true; }
      else if (Math.abs(this.vy) > 3) { this.vy = -this.vy * 0.35; this.vx *= 0.6; }
      else { this.vy = 0; this.vx *= 0.8; }
    }
    if ((this.kind === 'organ' || this.kind === 'gut') && this.t % 7 === 0 && this.t < 200) this.fb.stain(this.x, this.fb.gy, 3 + Math.random() * 3, false);
    if (this.t > this.life) this.dead = true;
  }
  draw(ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    if (this.kind === 'organ') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.rot); ctx.scale(this.sz, this.sz);
      ctx.fillStyle = '#5e0a12'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8e1a24'; ctx.beginPath(); ctx.ellipse(-2, -1, 6, 4, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,190,190,.5)'; ctx.fillRect(-4, -3, 3, 2);
      ctx.restore();
    } else if (this.kind === 'gut') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.rot); ctx.scale(this.sz, this.sz);
      for (let i = 0; i < 5; i++) {
        const px = (i - 2) * 6, py = Math.sin(i * 1.4 + this.x * 0.05) * 4;
        ctx.fillStyle = i % 2 ? '#c8606a' : '#b04652'; ctx.beginPath(); ctx.arc(px, py, 4.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,220,220,.4)'; ctx.fillRect(-10, -3, 16, 1.5);
      ctx.restore();
    } else if (this.kind === 'blood') {
      ctx.fillStyle = '#9b0d12';
      ctx.beginPath(); ctx.ellipse(x, y, this.r, this.r * (1 + Math.min(1.5, Math.abs(this.vy) * 0.08)), Math.atan2(this.vy, this.vx) + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.rot);
      ctx.fillStyle = '#f4f1e4'; ctx.fillRect(-3, -4, 6, 8); ctx.strokeStyle = '#6b6252'; ctx.lineWidth = 1; ctx.strokeRect(-3, -4, 6, 8);
      ctx.restore();
    }
  }
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
    this.hp = 420; this.max = 420;   // a long, drawn-out beating
    this.t = 0; this.stun = 0; this.flash = 0; this.rot = 0; this.idx = 0;
    this.act = null; this.cool = 70; this.facing = -1; this.thrown = false; this.saidFear = 0;
    this.state = 'air';
    this.wounds = 0; this.snap = 0; this.snapDir = 1; this.recent = 0; this.squash = 0;
  }
  get fear() { return 1 - this.hp / this.max; }
  center() { return { x: this.x, y: this.y - 60 }; }

  update() {
    const fb = this.fb, h = fb.hero;
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.recent > 0) this.recent--;
    if (this.snap > 0) this.snap *= 0.8;
    if (this.squash > 0.01) this.squash *= 0.72; else this.squash = 0;
    if (this.state === 'grabbed' || this.state === 'carried' || this.state === 'pinned') return;
    const L = fb.ax + 60, R = fb.ax + fb.aw - 60;
    if (!this.ground) {
      this.vy += 0.6; this.x += this.vx; this.y += this.vy; this.rot += this.vx * 0.018;
      if (this.y < fb.camY + 150) { this.y = fb.camY + 150; this.vy = Math.abs(this.vy) * 0.3; }
      if (this.x < L || this.x > R) {
        this.x = this.x < L ? L : R;
        if (Math.abs(this.vx) > 8) {
          this.damage(5 + Math.abs(this.vx) * 0.35, true);
          fb.shake = Math.max(fb.shake, 16); fb.hitStop = Math.max(fb.hitStop, 6);
          for (let i = 0; i < 5; i++) fb.add(new FBEffect('dust', this.x, this.y - 30 - i * 22, { dur: 28 }));
          fb.stain(this.x < fb.ax + fb.aw / 2 ? fb.ax + 34 : fb.ax + fb.aw - 34, this.y - 70, 16, true);
          this.bleed(this.x, this.y - 90, -Math.sign(this.vx), 10, 0.3);
          Sound.punch(1.6); Sound.play('boom', { vol: 0.5, rate: 0.6 });
        }
        this.vx = -this.vx * 0.35;
      }
      if (this.y >= fb.gy) {
        this.y = fb.gy;
        if (this.vy > 10) {
          const slam = this.thrown || this.vy > 16;
          this.damage(slam ? 6 + this.vy * 0.4 : this.vy * 0.25, slam);
          fb.shake = Math.max(fb.shake, this.vy);
          if (slam) { fb.hitStop = Math.max(fb.hitStop, 7); this.bleed(this.x, this.y - 40, 0, 8, 0.2); Sound.punch(1.7); }
          for (let i = 0; i < 4; i++) fb.add(new FBEffect('dust', this.x + (i - 1.5) * 30, this.y - 6, { dur: 26 }));
          Sound.play('boom', { vol: 0.4, rate: 0.6 });
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
    if (type === 'cower' && this.fb.say('eggman', ['P-please, no more!', "I'll be good, I swear!", 'Not the face! Not the face!'][Math.floor(Math.random() * 3)], { cool: 300, coolKey: 'cower', dur: 110 })) {
      this.fb.g.later(70, () => this.fb.say('sonic', ['Don\'t you DARE beg.', 'They begged too.', 'Get up.'][Math.floor(Math.random() * 3)], { dur: 100, prio: 2 }));
    }
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
        fb.add(new FBEffect('dust', this.x, this.y - 6, { dur: 26 })); Sound.play('skid'); Sound.punch(0.6);
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
    if (this.hp <= 1) { this.hp = 1; this.fb.startChoice(); }
  }

  // Spray blood from (x, y) in direction dir (-1/1, 0 = upward); teeth with probability toothP
  bleed(x, y, dir, n, toothP) {
    for (let k = 0; k < n; k++) {
      const vx = (dir ? dir * (2 + Math.random() * 6) : (Math.random() - 0.5) * 6), vy = -2 - Math.random() * 6;
      this.fb.add(new Gore(this.fb, x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, vx, vy, 'blood'));
    }
    if (Math.random() < toothP) this.fb.add(new Gore(this.fb, x, y, (dir || (Math.random() - 0.5)) * 5, -7, 'tooth'));
  }

  // How beaten up he looks: 0 = fresh, 4 = wrecked
  get dmgLevel() {
    const f = this.fear;
    return f > 0.8 ? 4 : f > 0.58 ? 3 : f > 0.34 ? 2 : f > 0.12 ? 1 : 0;
  }

  // Where his nose is on the current frame (falls back to a standing estimate)
  headPos() {
    const f = EGG_FRAMES[this.idx] || EGG_FRAMES[0], a = EGG_FACE[this.idx] || EGG_FACE[0];
    const flip = this.facing > 0 ? -1 : 1, lx = (a.nose[0] - f[2] / 2) * EGG_SCALE * flip, ly = -(f[3] - a.nose[1]) * EGG_SCALE;
    if (!this.drawRot) return { x: this.x + lx, y: this.y + ly };
    // follow the sprite's rotation (about its middle)
    const h = f[3] * EGG_SCALE, c = Math.cos(this.drawRot), sn = Math.sin(this.drawRot), py = ly + h / 2;
    return { x: this.x + lx * c - py * sn, y: this.y - h / 2 + lx * sn + py * c };
  }

  checkFear() {
    const fb = this.fb;
    while (this.saidFear < EGG_FEAR_LINES.length && this.fear >= EGG_FEAR_LINES[this.saidFear][0]) {
      fb.say('eggman', EGG_FEAR_LINES[this.saidFear][1], { dur: 150, prio: 2 });
      this.saidFear++;
    }
  }

  // A body blow. kx/ky = knockback. Shows Sonic's real glove landing, blood, a head snap.
  takeHit(dmg, kx, ky, big) {
    const fb = this.fb;
    if (fb.phase !== 'brawl' || this.state === 'grabbed' || this.state === 'pinned') return false;
    this.damage(dmg, big);
    if (fb.phase !== 'brawl') return true;
    const dir = Math.sign(kx) || (fb.hero.x < this.x ? 1 : -1);
    this.vx = kx; this.vy = ky;
    this.recent += big ? 3 : 1;
    if (ky < 0 || !this.ground) { this.ground = false; this.state = 'air'; }
    else if (big || this.recent >= 4) { this.state = 'down'; this.recent = 0; }
    else this.state = 'hurt';
    this.stun = Math.round((big ? 50 : 26) * (1 + this.fear * 0.8));   // gets up slower as he breaks
    this.act = null; this.cool = 25;
    this.snap = big ? 1 : 0.6; this.snapDir = dir;
    this.wounds += dmg; this.squash = big ? 1 : 0.6;
    fb.impact(dir, big);
    fb.hitStop = Math.max(fb.hitStop, big ? 10 : 5);
    fb.shake = Math.max(fb.shake, big ? 16 : 7);
    fb.zoom = Math.max(fb.zoom, big ? 1.06 : 1.02);
    const hp = this.headPos();
    fb.add(new FBEffect('impact', hp.x - dir * 10, hp.y + 10, { dur: big ? 10 : 7, big }));
    this.bleed(hp.x, hp.y + 8, dir, big ? 12 : 5, big ? 0.35 : 0.08);
    Sound.punch(big ? 1.6 : 1);
    fb.brawlCombo = { n: (fb.brawlCombo && fb.brawlCombo.t > 0 ? fb.brawlCombo.n : 0) + 1, t: 100 };
    fb.g.addScore(big ? 300 : 100);
    if (fb.brawlCombo.n % 5 === 0) fb.add(new FloatRing(fb, hp.x, hp.y, (Math.random() - 0.5) * 6, -5));
    this.checkFear();
    if (big) fb.say('sonic', SONIC_BRAWL_QUIPS[Math.floor(Math.random() * SONIC_BRAWL_QUIPS.length)], { cool: 360, coolKey: 'bq', dur: 100 });
    return true;
  }

  // Ground-and-pound blow while pinned: no knockback, just damage.
  poundHit(side) {
    const fb = this.fb;
    this.damage(4, false);
    this.wounds += 4; this.flash = 4; this.snap = 0.8; this.snapDir = side; this.squash = 0.8;
    fb.impact(side * 0.4, false); fb.kick.y += 10;
    const hp = { x: this.x + side * 6, y: this.y - 28 };
    fb.add(new FBEffect('impact', hp.x, hp.y, { dur: 7 }));
    this.bleed(hp.x, hp.y, 0, 6, 0.15);
    fb.hitStop = Math.max(fb.hitStop, 5); fb.shake = Math.max(fb.shake, 9);
    Sound.punch(1.3);
    fb.brawlCombo = { n: (fb.brawlCombo && fb.brawlCombo.t > 0 ? fb.brawlCombo.n : 0) + 1, t: 100 };
    fb.g.addScore(150);
    this.checkFear();
  }

  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    let idx, rot = 0, flip = this.facing > 0;
    const lose = (spd) => eggFrame('lose' + (Math.floor(t * spd) % 8));
    if (this.state === 'run') idx = eggFrame('run' + (Math.floor(t * 0.25) % 4));
    else if (this.state === 'idle' || this.state === 'throw') idx = eggFrame('stand');
    else if (this.state === 'cower') idx = lose(0.15);
    else if (this.state === 'down' || this.state === 'pinned') { idx = eggFrame('lose2'); rot = this.state === 'pinned' ? -Math.PI / 2 * (flip ? -1 : 1) * 0.9 : 0; }
    else if (this.state === 'hurt') idx = eggFrame('lose0');
    else if (this.state === 'impaled') idx = eggFrame('lose1');
    else if (this.state === 'corpse') { idx = eggFrame('lose2'); rot = (flip ? 1 : -1) * Math.PI / 2 * 0.95; }
    else if (this.state === 'carried' && this.corpse) { idx = eggFrame('lose2'); rot = Math.PI / 2 * 0.85; }
    else { idx = lose(0.3); rot = this.ground ? 0 : this.rot; }
    rot += this.snap * this.snapDir * 0.35;   // head snaps back on impact
    let dx = 0;
    if (this.state === 'cower' || this.fear > 0.6) dx = (Math.random() - 0.5) * (this.state === 'cower' ? 6 : 2);
    if (this.state === 'impaled') dx = (Math.random() - 0.5) * 3;
    if (this.state === 'corpse' || this.corpse) dx = 0;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, this.fb.gy - cam.y - 2, 44, 10, 0, 0, Math.PI * 2); ctx.fill();
    const sq = { sx: 1 + 0.28 * this.squash, sy: 1 - 0.2 * this.squash };
    this.idx = idx; this.drawRot = rot;
    drawEggFrame(ctx, idx, x + dx, y, { flip, rot, dmg: this.dmgLevel, hole: this.hole, ...sq });
    if (this.smile) {   // a knowing little smile under the mustache
      const hp = this.headPos(), sx = hp.x - cam.x + dx, sy = hp.y - cam.y;
      ctx.save(); ctx.strokeStyle = '#2a0a04'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy + 3, 9, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(sx - 6, sy + 8, 12, 3); ctx.restore();
    }
    if (this.flash > 0 && this.flash % 4 < 2) drawEggFrame(ctx, idx, x + dx, y, { flip, rot, white: true, alpha: 0.85, ...sq });
    // sweat drops when scared
    if (this.fear > 0.35 && t % 30 < 20 && !this.hole && !this.corpse && !this.smile) {
      ctx.fillStyle = '#9fe3ff';
      for (let i = 0; i < 1 + Math.floor(this.fear * 3); i++) {
        const sx = x + (i % 2 ? 40 : -40) + i * 4, sy = y - 120 + ((t + i * 9) % 30);
        ctx.beginPath(); ctx.moveTo(sx, sy - 8); ctx.quadraticCurveTo(sx + 6, sy + 2, sx, sy + 4); ctx.quadraticCurveTo(sx - 6, sy + 2, sx, sy - 8); ctx.fill();
      }
    }
    // spin-dash gashes across his coat
    if (this.gashes && (this.state === 'idle' || this.state === 'run' || this.state === 'throw' || this.state === 'hurt')) {
      ctx.save(); ctx.strokeStyle = '#7d0a0e'; ctx.lineWidth = 3;
      for (let i = 0; i < Math.min(4, this.gashes); i++) {
        const gy = y - 70 + i * 14 + dx;
        ctx.beginPath(); ctx.moveTo(x - 26 + dx, gy - 10); ctx.lineTo(x + 24 + dx, gy + 8); ctx.stroke();
      }
      ctx.restore();
    }
    // fresh blood running off his face once he's badly hurt
    if (this.dmgLevel >= 3 && t % (this.dmgLevel === 4 ? 9 : 16) === 0 && this.fb.phase === 'brawl') {
      const hp = this.headPos();
      this.fb.add(new Gore(this.fb, hp.x + (Math.random() - 0.5) * 6, hp.y + 4, (Math.random() - 0.5) * 1.2, 0.5, 'blood'));
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
      drawMetalFrame(ctx, 'boost', this.t / 4, p.x - cam.x, p.y - cam.y + 34, { alpha: 0.25 - i * 0.025, flip: this.state !== 'out' });
    }
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    // jet flame
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(80,170,255,.7)';
    ctx.beginPath(); ctx.arc(x + (this.state === 'out' ? -20 : 20), y + 6, 10 + Math.random() * 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    drawMetalFrame(ctx, this.state === 'hover' ? 'hover' : this.state === 'grab' ? 'dive' : 'boost', this.t / 6, x, y + 34, { flip: this.state !== 'out' });
    // glowing red eye
    if (this.state === 'hover' && this.t % 60 < 20) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x - 8, y - 22, 1, x - 8, y - 22, 26);
      g.addColorStop(0, 'rgba(255,60,60,1)'); g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x - 8, y - 22, 26, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
}
