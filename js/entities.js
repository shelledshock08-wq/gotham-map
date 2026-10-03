// Game objects. Each has update(game) and draw(ctx, cam, t); `dead` removes it.
'use strict';

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function onScreen(cam, x, y, m = 160) {
  return x > cam.x - m && x < cam.x + VIEW_W + m && y > cam.y - m && y < cam.y + VIEW_H + m;
}

// ------------------------------------------------------------------- rings
class Ring {
  constructor(x, y) { this.x = x; this.y = y; }
  update(g) {
    const p = g.player;
    if (p.state === 'dead' || p.state === 'hurt' && p.invuln > 100) return;
    if (Math.abs(p.x - this.x) < p.wR + 14 && Math.abs(p.y - this.y) < p.hR + 14) {
      this.dead = true; g.collectRing(this.x, this.y);
    }
  }
  draw(ctx, cam, t) {
    if (!onScreen(cam, this.x, this.y, 40)) return;
    drawRing(ctx, this.x - cam.x, this.y - cam.y, t * 0.09);
  }
}

class ScatterRing {
  constructor(x, y, xsp, ysp) { this.x = x; this.y = y; this.xsp = xsp; this.ysp = ysp; this.life = 256; this.age = 0; }
  update(g) {
    const w = g.world;
    this.age++; if (--this.life <= 0) { this.dead = true; return; }
    this.ysp += 0.09 * K;
    this.x += this.xsp; this.y += this.ysp;
    if (this.ysp > 0 && w.solidAt(this.x, this.y + 10)) { this.y -= this.ysp; this.ysp = -this.ysp * 0.75; }
    if (w.wallAt(this.x + Math.sign(this.xsp) * 10, this.y)) this.xsp = -this.xsp;
    const p = g.player;
    if (this.age > 64 && p.state === 'normal' && Math.abs(p.x - this.x) < p.wR + 14 && Math.abs(p.y - this.y) < p.hR + 14) {
      this.dead = true; g.collectRing(this.x, this.y);
    }
  }
  draw(ctx, cam, t) {
    if (this.life < 64 && Math.floor(this.life / 3) % 2) return;
    drawRing(ctx, this.x - cam.x, this.y - cam.y, t * 0.25);
  }
}

// ----------------------------------------------------------------- effects
class Effect {
  constructor(kind, x, y, opts = {}) { Object.assign(this, { kind, x, y, t: 0 }, opts); this.dur = opts.dur || ({ sparkle: 18, explode: 26, dust: 18, score: 50, icon: 50 })[kind] || 30; }
  update() { this.t++; if (this.kind === 'score' || this.kind === 'icon') this.y -= this.t < 25 ? 1.6 : 0; if (this.t >= this.dur) this.dead = true; }
  draw(ctx, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y, f = this.t / this.dur;
    if (this.kind === 'sparkle') drawSparkle(ctx, x, y, f, this.color || '#fff');
    else if (this.kind === 'explode') drawExplosion(ctx, x, y, f);
    else if (this.kind === 'dust') drawDust(ctx, x, y - f * 8, f);
    else if (this.kind === 'score') {
      ctx.save(); ctx.font = '16px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText(this.text, x + 2, y + 2);
      ctx.fillStyle = '#fff'; ctx.fillText(this.text, x, y); ctx.restore();
    } else if (this.kind === 'icon') {
      ctx.save(); ctx.translate(x, y); drawMonitorIcon(ctx, this.icon, t); ctx.restore();
    }
  }
}

class Animal {
  constructor(x, y) { this.x = x; this.y = y; this.kind = Math.random() < 0.5 ? 0 : 1; this.ysp = -4 * K; this.xsp = 0; this.dir = Math.random() < 0.5 ? -1 : 1; this.t = 0; }
  update(g) {
    this.t++;
    this.ysp += 0.21 * K; this.x += this.xsp; this.y += this.ysp;
    const f = g.world.floorAt(this.x, this.y + 9, 4);
    if (f && this.ysp > 0) {
      this.y = f.y - 9;
      this.xsp = this.dir * (this.kind === 0 ? 2.5 : 1.8) * K;
      this.ysp = this.kind === 0 ? -4 * K : -3.5 * K;
    }
    if (this.t > 400 || !onScreen(g.cam, this.x, this.y, 300)) this.dead = this.t > 30;
  }
  draw(ctx, cam, t) { drawAnimal(ctx, this.x - cam.x, this.y - cam.y, this.kind, t, this.dir); }
}

// ----------------------------------------------------------------- enemies
const ENEMY_DEF = {
  slime:   { w: 44, h: 32, speed: 0.9, frames: ['slime_normal_walk_a', 'slime_normal_walk_b'] },
  ladybug: { w: 44, h: 34, speed: 1.6, frames: ['ladybug_walk_a', 'ladybug_walk_b'] },
  mouse:   { w: 44, h: 34, speed: 2.4, frames: ['mouse_walk_a', 'mouse_walk_b'] },
  frog:    { w: 44, h: 40, speed: 0, frames: ['frog_idle'] },
  fly:     { w: 40, h: 36, speed: 0, frames: ['fly_a', 'fly_b'] },
  bee:     { w: 44, h: 40, speed: 1.4, frames: ['bee_a', 'bee_b'] },
  saw:     { w: 50, h: 50, speed: 2.2, frames: ['saw_a', 'saw_b'], hazard: true },
};

class Enemy {
  constructor(kind, x, y, props) {
    this.kind = kind; this.def = ENEMY_DEF[kind];
    this.x = x; this.y = y;      // x = center, y = bottom (feet)
    this.homeX = x; this.homeY = y;
    this.dir = -1; this.t = Math.random() * 100 | 0;
    this.range = props.range || 0;
    this.ysp = 0; this.cool = 60; this.grounded = true;
  }
  box() { const d = this.def; return { x: this.x - d.w / 2, y: this.y - d.h, w: d.w, h: d.h }; }
  update(g) {
    this.t++;
    const w = g.world, d = this.def;
    if (!onScreen(g.cam, this.x, this.y, 400)) return;
    if (this.kind === 'slime' || this.kind === 'ladybug' || this.kind === 'mouse' || this.kind === 'saw') {
      const nx = this.x + this.dir * d.speed * K;
      const ahead = w.floorAt(nx + this.dir * 20, this.y, 20, this.y - 30);
      const blocked = w.wallAt(nx + this.dir * 24, this.y - 20);
      const outOfRange = this.range && Math.abs(nx - this.homeX) > this.range;
      if (!ahead || blocked || outOfRange) this.dir = -this.dir;
      else {
        this.x = nx;
        const f = w.floorAt(this.x, this.y, 20, this.y - 30);
        if (f) this.y = f.y;
      }
    } else if (this.kind === 'fly') {
      this.y = this.homeY + Math.sin(this.t * 0.04) * 60;
      this.dir = g.player.x < this.x ? -1 : 1;
    } else if (this.kind === 'bee') {
      const p = g.player;
      const near = Math.abs(p.x - this.x) < 360 && p.y > this.y;
      if (near && this.cool <= 0) {
        this.cool = 110;
        const dx = p.x - this.x, dy = p.y - (this.y - 10), len = Math.hypot(dx, dy) || 1;
        g.addEnemy(new Projectile(this.x, this.y - 14, dx / len * 3.2 * K, dy / len * 3.2 * K));
      }
      this.cool--;
      if (!near || this.cool < 70) {
        this.x += this.dir * d.speed * K;
        if (Math.abs(this.x - this.homeX) > 220) this.dir = Math.sign(this.homeX - this.x);
      } else this.dir = Math.sign(p.x - this.x) || this.dir;
      this.y = this.homeY + Math.sin(this.t * 0.06) * 8;
    } else if (this.kind === 'frog') {
      if (this.grounded) {
        if (--this.cool <= 0 && Math.abs(g.player.x - this.x) < 600) {
          this.dir = g.player.x < this.x ? -1 : 1;
          this.ysp = -7 * K; this.xsp = this.dir * 2 * K; this.grounded = false; this.cool = 80;
        }
      } else {
        this.ysp += 0.21875 * K; this.y += this.ysp;
        const nx = this.x + this.xsp;
        if (!w.wallAt(nx + this.dir * 22, this.y - 20)) this.x = nx;
        if (this.ysp > 0) {
          const f = w.floorAt(this.x, this.y, 2 + this.ysp, this.y - this.ysp - 4);
          if (f) { this.y = f.y; this.grounded = true; this.ysp = 0; }
        }
        if (this.y > w.height + 100) this.dead = true;
      }
    }
    // player interaction
    const p = g.player;
    if (p.state === 'dead') return;
    if (overlap(p.bounds(), this.box())) {
      if ((p.attacking && !d.hazard) || p.invinc > 0) this.destroy(g, p);
      else p.hurt(this.x);
    }
  }
  destroy(g, p) {
    this.dead = true;
    g.addEffect(new Effect('explode', this.x, this.y - this.def.h / 2));
    g.addEnemy(new Animal(this.x, this.y - 20));
    Sound.play('pop');
    g.awardChain(this.x, this.y - 40);
    g.hitStop = Math.max(g.hitStop || 0, 4); g.shake = Math.max(g.shake, 5);
    for (let i = 0; i < 5; i++) g.addEffect(new Effect('sparkle', this.x + (Math.random() - 0.5) * 50, this.y - 20 - Math.random() * 40, { color: '#ffe680' }));
    if (!p.ground) {
      if (p.homing || (p.y < this.y - this.def.h / 2 && p.ysp > 0)) p.homingBounce();
      else if (p.ysp < 0) p.ysp += 1;
    }
  }
  draw(ctx, cam, t) {
    if (!onScreen(cam, this.x, this.y)) return;
    const d = this.def;
    let key = d.frames[Math.floor(this.t / 10) % d.frames.length];
    if (this.kind === 'frog') key = this.grounded ? (this.cool < 15 ? 'frog_rest' : 'frog_idle') : 'frog_jump';
    const img = Assets.img[key];
    if (!img) return;
    ctx.save();
    ctx.translate(Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    if (this.dir > 0) ctx.scale(-1, 1);
    if (this.kind === 'saw') ctx.rotate(this.t * 0.25 * -this.dir);
    const oy = this.kind === 'saw' ? -32 : -64;
    if (this.kind === 'saw') ctx.drawImage(img, -32, -32, 64, 64);
    else ctx.drawImage(img, -32, oy, 64, 64);
    ctx.restore();
  }
}

class Projectile {
  constructor(x, y, xsp, ysp) { this.x = x; this.y = y; this.xsp = xsp; this.ysp = ysp; this.t = 0; }
  update(g) {
    this.t++; this.x += this.xsp; this.y += this.ysp;
    if (this.t > 240 || g.world.solidAt(this.x, this.y)) { this.dead = true; return; }
    const p = g.player;
    if (p.state !== 'dead' && overlap(p.bounds(), { x: this.x - 9, y: this.y - 9, w: 18, h: 18 })) {
      if (p.shield) { this.xsp = -this.xsp; this.ysp = -this.ysp; return; }
      p.hurt(this.x);
    }
  }
  draw(ctx, cam) {
    const img = Assets.img.fireball;
    ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(this.t * 0.3);
    if (img) ctx.drawImage(img, -16, -16, 32, 32);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- monitors
class Monitor {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind; this.broken = false; this.t = 0;
    this.plat = { x: x - 26, y: y - 58, w: 52, h: 58, solidSides: true, breakable: true, obj: this };
  }
  register(world) { world.platforms.push(this.plat); }
  update(g) {
    this.t++;
    if (this.broken) return;
    const p = g.player;
    if (p.state === 'dead') return;
    const pb = p.bounds();
    const box = { x: this.plat.x - 2, y: this.plat.y - 2, w: this.plat.w + 4, h: this.plat.h + 2 };
    if (p.attacking && overlap(pb, box)) {
      if (!p.ground && p.ysp < 0 && p.y > this.y - 20) { p.ysp = -p.ysp * 0.3; return; } // bonk from below
      this.break(g, p);
    }
  }
  break(g, p) {
    this.broken = true;
    const i = g.world.platforms.indexOf(this.plat);
    if (i >= 0) g.world.platforms.splice(i, 1);
    g.addEffect(new Effect('explode', this.x, this.y - 30));
    g.addEffect(new Effect('icon', this.x, this.y - 40, { icon: this.kind, dur: 60 }));
    Sound.play('pop');
    g.addScore(10);
    if (!p.ground && (p.ysp > 0 || p.homing)) p.homingBounce();
    g.hitStop = Math.max(g.hitStop || 0, 3);
    g.later(30, () => g.applyMonitor(this.kind, this.x, this.y - 80));
  }
  draw(ctx, cam, t) {
    if (!onScreen(cam, this.x, this.y)) return;
    drawMonitor(ctx, Math.round(this.x - cam.x), Math.round(this.y - cam.y), this.kind, t, this.broken);
  }
}

// ----------------------------------------------------------------- springs
class Spring {
  constructor(x, y, dir, strong) { this.x = x; this.y = y; this.dir = dir; this.strong = strong; this.out = 0; }
  box() {
    if (this.dir === 'up') return { x: this.x - 26, y: this.y - 30, w: 52, h: 30 };
    return { x: this.x - 24, y: this.y - 52, w: 48, h: 52 };
  }
  update(g) {
    if (this.out > 0) this.out--;
    const p = g.player;
    if (p.state !== 'normal' && p.state !== 'hurt') return;
    if (!overlap(p.bounds(), this.box())) return;
    const power = (this.strong ? 16 : 10) * K;
    if (this.dir === 'up') {
      if (p.ysp < 0 && !p.ground) return;
      p.y = this.y - 30 - p.hR;
      p.launch(null, -power);
      if (p.state === 'hurt') p.state = 'normal';
    } else {
      const s = this.dir === 'right' ? 1 : -1;
      if (p.ground) p.pushGround(s * power); else { p.xsp = s * power; p.facing = s; }
      p.x = this.x + s * 40;
    }
    this.out = 12;
    Sound.play('spring');
  }
  draw(ctx, cam) {
    if (!onScreen(cam, this.x, this.y)) return;
    const key = (this.out > 0 ? 'spring_out' : 'spring') + (this.strong ? '_red' : '');
    const img = Assets.img[key];
    if (!img) return;
    ctx.save(); ctx.translate(Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    if (this.dir === 'up') ctx.drawImage(img, -32, -64, 64, 64);
    else {
      ctx.translate(0, -32); ctx.rotate(this.dir === 'right' ? Math.PI / 2 : -Math.PI / 2);
      ctx.drawImage(img, -32, -32 - 8, 64, 64);
    }
    ctx.restore();
  }
}

class Spikes {
  constructor(x, y) { this.x = x; this.y = y; }
  update(g) {
    const p = g.player;
    if (p.state !== 'normal') return;
    if (overlap(p.bounds(), { x: this.x - 26, y: this.y - 30, w: 52, h: 30 })) {
      p.hurt(p.x + (p.xsp === 0 ? -p.facing : -Math.sign(p.xsp)));
      if (p.state === 'hurt') p.ysp = -5 * K;
    }
  }
  draw(ctx, cam) {
    if (!onScreen(cam, this.x, this.y)) return;
    const img = Assets.img.spikes; if (img) ctx.drawImage(img, Math.round(this.x - 32 - cam.x), Math.round(this.y - 64 - cam.y));
  }
}

class Checkpoint {
  constructor(x, y) { this.x = x; this.y = y; this.active = false; this.t = 0; }
  update(g) {
    this.t++;
    if (this.active) return;
    const p = g.player;
    if (p.state === 'normal' && Math.abs(p.x - this.x) < 30 && Math.abs(p.y - (this.y - 40)) < 80) {
      this.active = true;
      g.checkpoint = { x: this.x, y: this.y, time: g.time };
      Sound.play('checkpoint');
      for (let i = 0; i < 6; i++) g.addEffect(new Effect('sparkle', this.x + (Math.random() - 0.5) * 40, this.y - 60 - Math.random() * 40, { color: '#7de7ff' }));
    }
  }
  draw(ctx, cam) {
    if (!onScreen(cam, this.x, this.y)) return;
    const key = this.active ? (Math.floor(this.t / 12) % 2 ? 'flag_blue_a' : 'flag_blue_b') : 'flag_off';
    const img = Assets.img[key]; if (img) ctx.drawImage(img, Math.round(this.x - 32 - cam.x), Math.round(this.y - 64 - cam.y));
  }
}

// A Chaos Emerald hidden in the act. Collected ones stay collected through deaths.
class ChaosEmerald {
  constructor(x, y, key, color) { this.x = x; this.y = y; this.key = key; this.color = color; this.t = Math.random() * 100; }
  update(g) {
    this.t++;
    const p = g.player;
    if (p.state === 'dead') return;
    if (Math.abs(p.x - this.x) < p.wR + 22 && Math.abs(p.y - (this.y - 10)) < p.hR + 24) {
      this.dead = true; g.collectEmerald(this);
    }
  }
  draw(ctx, cam) {
    if (!onScreen(cam, this.x, this.y, 60)) return;
    const x = this.x - cam.x, y = this.y - cam.y + Math.sin(this.t * 0.06) * 6;
    const gl = ctx.createRadialGradient(x, y - 10, 2, x, y - 10, 46);
    gl.addColorStop(0, 'rgba(255,255,255,.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y - 10, 46, 0, Math.PI * 2); ctx.fill();
    drawEmerald(ctx, x, y - 10, this.color, 1.6);
    if (this.t % 40 < 20) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 10, y - 34 + (this.t % 40) * 0.3, 3, 3); }
  }
}

class Goal {
  constructor(x, y) { this.x = x; this.y = y; this.spin = 0; this.state = 'idle'; this.t = 0; }
  update(g) {
    const p = g.player;
    // the post won't turn until you've found this act's emeralds
    if (this.state === 'idle' && p.x >= this.x && p.state !== 'dead' && g.missingEmeralds() > 0) {
      const n = g.missingEmeralds();
      g.speech.say('sonic', `Not yet! There ${n > 1 ? 'are' : 'is'} still ${n} Chaos Emerald${n > 1 ? 's' : ''} in this zone!`, { cool: 240, coolKey: 'needem', dur: 200, prio: 3 });
      return;
    }
    if (this.state === 'idle' && p.x >= this.x && p.state !== 'dead') {
      this.state = 'spin'; this.spinSpeed = 0.5; g.onGoal(this);
      Sound.play('checkpoint');
    }
    if (this.state === 'spin') {
      this.t++;
      this.spin += this.spinSpeed;
      if (this.t > 50) this.spinSpeed = Math.max(0.08, this.spinSpeed * 0.96);
      if (this.t > 100) {
        // settle on the hero face
        const target = Math.ceil(this.spin / (Math.PI * 2)) * Math.PI * 2;
        this.spin = Math.min(this.spin + this.spinSpeed, target);
        if (this.spin >= target) { this.state = 'done'; g.onGoalDone(); }
      }
    }
  }
  draw(ctx, cam) {
    if (!onScreen(cam, this.x, this.y, 200)) return;
    drawSignpost(ctx, Math.round(this.x - cam.x), Math.round(this.y - cam.y), this.spin, this.state === 'idle' ? 'boss' : this.state === 'done' ? 'hero' : 'spin');
  }
}

class Deco {
  constructor(x, y, img) { this.x = x; this.y = y; this.img = img; }
  update() {}
  draw(ctx, cam) {
    if (!onScreen(cam, this.x, this.y)) return;
    const img = Assets.img[this.img]; if (img) ctx.drawImage(img, Math.round(this.x - 32 - cam.x), Math.round(this.y - 64 - cam.y));
  }
}

class LoopObj {
  constructor(cx, groundY, R, theme) { this.cx = cx; this.groundY = groundY; this.R = R; this.theme = theme; }
  update() {}
  draw(ctx, cam) {
    if (!onScreen(cam, this.cx, this.groundY - this.R, this.R + 80)) return;
    drawLoop(ctx, this.cx - cam.x, this.groundY - this.R - cam.y, this.R, this.theme);
  }
}

class Mover {
  constructor(x, y, axis, range, len, phase, theme) {
    this.x0 = x; this.y0 = y; this.axis = axis; this.range = range; this.len = len; this.t = phase ? phase / 0.02 : 0;
    this.theme = theme;
    this.plat = { x, y, w: len * TILE, h: 20, obj: this };
    this.x = x; this.y = y;
  }
  register(world) { world.platforms.push(this.plat); }
  update(g) {
    this.t++;
    const off = (1 - Math.cos(this.t * 0.02)) / 2 * this.range;
    const nx = this.axis === 'x' ? this.x0 + off : this.x0;
    const ny = this.axis === 'y' ? this.y0 - off : this.y0;
    const dx = nx - this.x, dy = ny - this.y;
    this.x = nx; this.y = ny; this.plat.x = nx; this.plat.y = ny;
    const p = g.player;
    if (p.ground && p.platform === this.plat && p.state === 'normal') { p.x += dx; p.y += dy; }
  }
  draw(ctx, cam) {
    const I = Assets.img, th = this.theme;
    for (let i = 0; i < this.len; i++) {
      const part = this.len === 1 ? 'cloud' : i === 0 ? 'cloud_left' : i === this.len - 1 ? 'cloud_right' : 'cloud_middle';
      const img = I[`${th}_${part}`];
      if (img) ctx.drawImage(img, Math.round(this.x + i * TILE - cam.x), Math.round(this.y - cam.y));
    }
  }
}

// -------------------------------------------------------------------- boss
class Bomb {
  constructor(x, y) { this.x = x; this.y = y; this.ysp = 0; this.t = 0; }
  update(g) {
    this.t++;
    this.ysp = Math.min(this.ysp + 0.15 * K, 9 * K); this.y += this.ysp;
    const f = g.world.floorAt(this.x, this.y + 20, 4);
    if (f) {
      this.dead = true; Sound.play('boom', { vol: 0.6 });
      g.addEffect(new Effect('explode', this.x, f.y - 20));
      g.addEnemy(new Fire(this.x, f.y, -1)); g.addEnemy(new Fire(this.x, f.y, 1));
      g.shake = 8;
      return;
    }
    const p = g.player;
    if (p.state !== 'dead' && overlap(p.bounds(), { x: this.x - 18, y: this.y - 18, w: 36, h: 36 })) {
      this.dead = true; g.addEffect(new Effect('explode', this.x, this.y)); p.hurt(this.x);
    }
  }
  draw(ctx, cam) {
    const img = Assets.img[this.t % 10 < 5 ? 'bomb' : 'bomb_active'];
    if (img) ctx.drawImage(img, Math.round(this.x - 32 - cam.x), Math.round(this.y - 40 - cam.y));
  }
}
class Fire {
  constructor(x, groundY, dir) { this.x = x; this.y = groundY - 16; this.dir = dir; this.t = 0; }
  update(g) {
    this.t++; this.x += this.dir * 3.2 * K;
    if (this.t > 70 || g.world.wallAt(this.x, this.y)) { this.dead = true; return; }
    const p = g.player;
    if (p.state !== 'dead' && overlap(p.bounds(), { x: this.x - 14, y: this.y - 14, w: 28, h: 28 })) p.hurt(this.x);
  }
  draw(ctx, cam) {
    const img = Assets.img.fireball;
    ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.globalAlpha = Math.min(1, (70 - this.t) / 15);
    ctx.scale(-this.dir, 1);
    if (img) ctx.drawImage(img, -24, -24, 48, 48); ctx.restore();
  }
}

class Boss {
  constructor(arenaX, groundY, w) {
    this.ax = arenaX; this.aw = w; this.groundY = groundY;
    this.x = arenaX + w + 160; this.y = groundY - 420;
    this.state = 'enter'; this.t = 0; this.hits = 0; this.flash = 0; this.dir = -1; this.bombT = 90; this.swoop = 0;
    this.maxHits = 8;
  }
  update(g) {
    this.t++;
    if (this.flash > 0) this.flash--;
    const left = this.ax + 180, right = this.ax + this.aw - 180, hoverY = this.groundY - 236;
    if (this.state === 'enter') {
      this.x -= 3; this.y += (hoverY - this.y) * 0.05;
      if (this.x <= right) this.state = 'fight';
    } else if (this.state === 'fight') {
      const speed = (this.hits >= 4 ? 3.4 : 2.4) * K * (this.swoop ? 0.6 : 1);
      this.x += this.dir * speed;
      if (this.x < left) { this.x = left; this.dir = 1; }
      if (this.x > right) { this.x = right; this.dir = -1; }
      // phase 2: swoop down at the player
      if (this.hits >= 4 && this.swoop === 0 && this.t % 300 === 150) this.swoop = 1;
      if (this.swoop) {
        this.swoop++;
        const s = Math.sin(Math.min(1, this.swoop / 120) * Math.PI);
        this.y = hoverY + s * 118;
        if (this.swoop >= 120) this.swoop = 0;
      } else this.y = hoverY + Math.sin(this.t * 0.05) * 18;
      if (--this.bombT <= 0) {
        this.bombT = this.hits >= 4 ? 70 : 110;
        g.addEnemy(new Bomb(this.x, this.y + 40));
      }
      // collision with player
      const p = g.player;
      if (p.state === 'normal' || p.state === 'hurt') {
        const dx = p.x - this.x, dy = p.y - (this.y + 4);
        if (dx * dx + dy * dy < 70 * 70) {
          if (p.attacking && this.flash === 0) {
            this.hits++; this.flash = 40; Sound.play('bosshit'); g.shake = 6;
            p.homing = 0; p.homeTarget = null; p.airDashUsed = false; p.xsp = Math.sign(dx || 1) * 4 * K; p.ysp = -5 * K; p.ground = false; p.platform = null; g.hitStop = 6;
            g.addScore(100);
            if (this.hits >= this.maxHits) { this.state = 'explode'; this.t = 0; g.onBossDefeated(); }
          } else if (!p.attacking) p.hurt(this.x);
        }
      }
    } else if (this.state === 'explode') {
      if (this.t % 7 === 0) {
        g.addEffect(new Effect('explode', this.x + (Math.random() - 0.5) * 120, this.y + (Math.random() - 0.5) * 80));
        Sound.play('boom', { vol: 0.5 });
      }
      this.flash = this.t % 6 < 3 ? 1 : 0;
      if (this.t > 100) { this.dead = true; g.startFinal(this); }
    } else if (this.state === 'flee') {
      this.x += 6; this.y -= 2.5;
      if (this.t % 10 === 0) g.addEffect(new Effect('dust', this.x - 70, this.y + 10));
      if (this.t > 140) { this.dead = true; g.onBossGone(); }
    }
  }
  draw(ctx, cam, t) {
    drawBoss(ctx, Math.round(this.x - cam.x), Math.round(this.y - cam.y), t, this.flash > 0 && (this.flash % 4 < 2), this.dir);
  }
}
