// The hedgehog. Physics follow the classic Mega Drive model (ground speed,
// slope factor, rolling, spin dash), scaled up by K for 64px tiles.
'use strict';

const K = 1.5;
const PHYS = {
  acc: 0.046875 * K, dec: 0.5 * K, frc: 0.046875 * K, top: 6 * K,
  air: 0.09375 * K, grav: 0.21875 * K, jump: 6.5 * K, jumpCut: 4 * K,
  slp: 0.125 * K, slpRollUp: 0.078125 * K, slpRollDown: 0.3125 * K,
  rollFrc: 0.0234375 * K, rollDec: 0.125 * K, maxSpeed: 16 * K, maxFall: 16 * K,
  hurtGrav: 0.1875 * K,
};
const STAND_H = 29, BALL_H = 21, STAND_W = 14, BALL_W = 11, WALL_R = 15;

class Player {
  constructor(game) { this.game = game; this.reset(0, 0); }

  reset(x, y) {
    this.x = x; this.y = y - STAND_H;
    this.xsp = 0; this.ysp = 0; this.gsp = 0;
    this.ground = false; this.angle = 0; this.facing = 1;
    this.rolling = false; this.jumping = false; this.springing = false;
    this.spindash = false; this.rev = 0;
    this.crouch = false; this.lookUp = false;
    this.state = 'normal';       // normal | hurt | dead | loop
    this.invuln = 0; this.invinc = 0; this.shoes = 0; this.shield = false;
    this.controlLock = 0;
    this.anim = 0; this.ballRot = 0; this.idleTime = 0; this.drawAngle = 0;
    this.platform = null; this.loop = null; this.pushing = false;
    this.deadTimer = 0; this.frozen = false; this.skidDust = 0;
  }

  get ball() { return this.rolling || this.jumping || this.spindash; }
  get hR() { return this.ball ? BALL_H : STAND_H; }
  get wR() { return this.ball ? BALL_W : STAND_W; }
  get feet() { return this.y + this.hR; }
  get attacking() { return this.ball || this.invinc > 0; }
  get top() { return this.shoes > 0 ? PHYS.top * 2 : PHYS.top; }
  get accel() { return this.shoes > 0 ? PHYS.acc * 2 : PHYS.acc; }
  bounds() { return { x: this.x - this.wR, y: this.y - this.hR, w: this.wR * 2, h: this.hR * 2 }; }

  setBall(on) {
    // keep feet planted when the hitbox height changes
    const was = this.hR;
    if (on) { if (!this.ball) this.rolling = true; } else { this.rolling = false; this.jumping = false; this.spindash = false; }
    this.y += was - this.hR;
  }

  update(input) {
    const inp = (this.frozen || this.controlLock > 0 || this.state === 'hurt') ? { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false } : input;
    if (this.controlLock > 0 && this.ground) this.controlLock--;
    if (this.invuln > 0) this.invuln--;
    if (this.invinc > 0) this.invinc--;
    if (this.shoes > 0) this.shoes--;

    if (this.state === 'dead') { this.updateDead(); return; }
    if (this.state === 'loop') { this.updateLoop(); this.animate(); return; }

    if (this.ground) this.updateGround(inp, input); else this.updateAir(inp);

    // keep inside level horizontally
    const w = this.game.world;
    if (this.x < 16) { this.x = 16; if (this.gsp < 0) this.gsp = 0; if (this.xsp < 0) this.xsp = 0; }
    if (this.x > w.width - 16) { this.x = w.width - 16; this.gsp = Math.min(this.gsp, 0); this.xsp = Math.min(this.xsp, 0); }
    // camera lock walls (boss arena)
    const lock = this.game.camLock;
    if (lock) {
      if (this.x < lock.x0 + 20) { this.x = lock.x0 + 20; if (this.gsp < 0) this.gsp = 0; if (this.xsp < 0) this.xsp = 0; }
      if (this.x > lock.x1 - 20) { this.x = lock.x1 - 20; if (this.gsp > 0) this.gsp = 0; if (this.xsp > 0) this.xsp = 0; }
    }
    if (this.y > w.height + 80) this.die(true);
    this.animate();
  }

  // ------------------------------------------------------------------ ground
  updateGround(inp, rawInput) {
    const P = PHYS;
    const sin = Math.sin(this.angle), cos = Math.cos(this.angle);

    // spin dash
    if (this.spindash) {
      if (!inp.down) {
        this.spindash = false; this.rolling = true;
        this.gsp = this.facing * (8 + Math.floor(this.rev) / 2) * K;
        this.game.camLag = 16;
        Sound.play('release');
      } else {
        this.rev -= this.rev / 32;
        if (inp.jumpPressed) { this.rev = Math.min(this.rev + 2, 8); Sound.play('charge', { rate: 1 + this.rev * 0.06 }); }
        if (this.game.frame % 3 === 0) this.game.addDust(this.x - this.facing * 16, this.feet - 4);
        this.gsp = 0;
        this.groundStick();
        return;
      }
    }

    // slope factor
    if (this.rolling) {
      const uphill = Math.sign(this.gsp) === -Math.sign(sin) || this.gsp === 0;
      this.gsp += (uphill ? P.slpRollUp : P.slpRollDown) * sin;
    } else if (Math.abs(this.gsp) > 0.05 || Math.abs(sin) > 0.3) {
      this.gsp += P.slp * sin;
    }

    // jump
    if (inp.jumpPressed && !this.crouch) {
      this.xsp = this.gsp * cos + P.jump * sin;
      this.ysp = this.gsp * sin - P.jump * cos;
      this.ground = false; this.platform = null;
      if (!this.rolling) this.y += STAND_H - BALL_H;   // keep feet planted
      this.rolling = false; this.jumping = true;
      this.angle = 0;
      Sound.play('jump');
      return;
    }

    // crouch, look up, start spin dash
    const still = Math.abs(this.gsp) < 0.01;
    this.crouch = still && !this.rolling && inp.down;
    this.lookUp = still && !this.rolling && inp.up && !inp.down;
    if (this.crouch && inp.jumpPressed) {
      this.crouch = false; this.spindash = true; this.rev = 0;
      this.y += STAND_H - BALL_H;
      Sound.play('charge');
      return;
    }

    // running input
    this.pushing = false;
    if (!this.rolling) {
      if (inp.left && !inp.right) {
        if (this.gsp > 0) { this.gsp -= P.dec; if (this.gsp <= 0) this.gsp = -0.5 * K; this.skidCheck(); }
        else if (this.gsp > -this.top) { this.gsp = Math.max(this.gsp - this.accel, -this.top); }
        this.facing = this.gsp <= 0 ? -1 : this.facing;
      } else if (inp.right && !inp.left) {
        if (this.gsp < 0) { this.gsp += P.dec; if (this.gsp >= 0) this.gsp = 0.5 * K; this.skidCheck(); }
        else if (this.gsp < this.top) { this.gsp = Math.min(this.gsp + this.accel, this.top); }
        this.facing = this.gsp >= 0 ? 1 : this.facing;
      } else {
        this.gsp -= Math.min(Math.abs(this.gsp), P.frc) * Math.sign(this.gsp);
      }
      // start roll
      if (inp.down && Math.abs(this.gsp) >= 1.03 * K) { this.setBall(true); Sound.play('roll'); }
    } else {
      if (inp.left && this.gsp > 0) this.gsp -= P.rollDec;
      if (inp.right && this.gsp < 0) this.gsp += P.rollDec;
      this.gsp -= Math.min(Math.abs(this.gsp), P.rollFrc) * Math.sign(this.gsp);
      if (Math.abs(this.gsp) < 0.5 * K) { this.gsp = 0; this.setBall(false); }
    }
    this.gsp = Math.max(-P.maxSpeed, Math.min(P.maxSpeed, this.gsp));

    // move along the surface
    this.xsp = this.gsp * Math.cos(this.angle);
    this.ysp = this.gsp * Math.sin(this.angle);
    const prevX = this.x;
    this.x += this.xsp; this.y += this.ysp;

    // walls
    if (this.wallCollide([this.y + (Math.abs(this.angle) < 0.1 ? 8 : 0)])) {
      if ((inp.right && this.facing > 0) || (inp.left && this.facing < 0)) this.pushing = true;
    }

    // loops
    for (const lp of this.game.loops) {
      if (prevX < lp.cx && this.x >= lp.cx && this.gsp >= 7.2 && Math.abs(this.feet - lp.groundY) < 6) {
        this.enterLoop(lp); return;
      }
    }

    this.groundStick();
  }

  skidCheck() {
    if (Math.abs(this.gsp) > 4 * K && !this.rolling && this.skidDust <= 0) { Sound.play('skid', { vol: 0.6 }); this.skidDust = 20; }
  }

  groundStick() {
    const w = this.game.world, P = PHYS;
    const feet = this.feet;
    const maxD = Math.min(Math.abs(this.xsp) + 6, 22);
    const minTop = feet - 24;
    const a = w.floorAt(this.x - this.wR, feet, maxD, minTop, this.ball);
    const b = w.floorAt(this.x + this.wR, feet, maxD, minTop, this.ball);
    const lim = feet - (Math.abs(this.xsp) + 16);
    const va = a && a.y >= lim ? a : null, vb = b && b.y >= lim ? b : null;
    if (!va && !vb) {
      this.ground = false; this.platform = null; this.angle = 0;
      return;
    }
    const best = !vb || (va && va.y <= vb.y) ? va : vb;
    this.y = best.y - this.hR;
    this.platform = best.obj || null;
    if (va && vb && !va.obj && !vb.obj && Math.abs(vb.y - va.y) <= this.wR * 2 + 2) this.angle = Math.atan2(vb.y - va.y, this.wR * 2);
    else this.angle = 0;
    if (best.obj && best.obj.onStand) best.obj.onStand(this);
  }

  wallCollide(ys) {
    const w = this.game.world;
    let hit = false;
    for (const sy of ys) {
      if (this.xsp >= 0 || this.gsp > 0) {
        const sx = this.x + WALL_R;
        if (w.wallAt(sx, sy)) { this.x = Math.floor(sx / TILE) * TILE - WALL_R; hit = true; }
      }
      if (this.xsp <= 0 || this.gsp < 0) {
        const sx = this.x - WALL_R;
        if (w.wallAt(sx, sy)) { this.x = (Math.floor(sx / TILE) + 1) * TILE + WALL_R; hit = true; }
      }
    }
    // solid sides of dynamic objects (monitors)
    for (const p of w.platforms) {
      if (!p.solidSides || (p.breakable && this.ball)) continue;
      const top = this.y - this.hR + 4, bot = this.y + this.hR - 4;
      if (bot <= p.y + 2 || top >= p.y + p.h) continue;
      if (this.x + WALL_R > p.x && this.x - WALL_R < p.x + p.w) {
        if (this.x < p.x + p.w / 2) this.x = p.x - WALL_R; else this.x = p.x + p.w + WALL_R;
        hit = true;
      }
    }
    if (hit) { if (this.ground) this.gsp = 0; this.xsp = 0; }
    return hit;
  }

  // --------------------------------------------------------------------- air
  updateAir(inp) {
    const P = PHYS, w = this.game.world;
    const hurt = this.state === 'hurt';
    if (!hurt) {
      if (this.jumping && !inp.jump && this.ysp < -P.jumpCut) this.ysp = -P.jumpCut;
      if (inp.left) { if (this.xsp > -this.top) this.xsp = Math.max(this.xsp - P.air, -this.top); this.facing = -1; }
      if (inp.right) { if (this.xsp < this.top) this.xsp = Math.min(this.xsp + P.air, this.top); this.facing = 1; }
      if (this.ysp < 0 && this.ysp > -4 * K) this.xsp -= (this.xsp / 0.125) / 256;
    }
    const prevFeet = this.feet;
    this.x += this.xsp;
    this.wallCollide([this.y - 10, this.y + 10]);
    this.y += this.ysp;
    this.ysp = Math.min(this.ysp + (hurt ? P.hurtGrav : P.grav), P.maxFall);
    if (this.springing && this.ysp > 0) this.springing = false;

    // ceiling
    if (this.ysp < 0) {
      for (const dx of [-this.wR + 2, this.wR - 2]) {
        const sx = this.x + dx, sy = this.y - this.hR;
        if (w.wallAt(sx, sy)) {
          this.y = (Math.floor(sy / TILE) + 1) * TILE + this.hR;
          this.ysp = 0;
          break;
        }
      }
    }
    // landing
    if (this.ysp >= 0) {
      const feet = this.feet;
      const minTop = prevFeet - 2;
      let best = null;
      for (const dx of [-this.wR, this.wR]) {
        const f = w.floorAt(this.x + dx, feet, 0, minTop, this.ball);
        if (f && f.y >= feet - Math.max(24, this.ysp + 16) && (!best || f.y < best.y)) best = f;
      }
      if (best) this.land(best);
    }
  }

  land(f) {
    const w = this.game.world;
    // compute surface angle under both sensors
    this.y = f.y - this.hR;
    const feet = this.feet;
    const a = w.floorAt(this.x - this.wR, feet, 12, feet - 24, this.ball);
    const b = w.floorAt(this.x + this.wR, feet, 12, feet - 24, this.ball);
    this.angle = a && b && !a.obj && !b.obj ? Math.atan2(b.y - a.y, this.wR * 2) : 0;
    if (Math.abs(this.angle) > 0.9) this.angle = 0;
    this.gsp = this.xsp * Math.cos(this.angle) + this.ysp * Math.sin(this.angle);
    this.ground = true; this.platform = f.obj || null;
    this.springing = false;
    if (this.state === 'hurt') { this.state = 'normal'; this.gsp = 0; this.xsp = 0; this.invuln = 120; }
    if (this.jumping) { this.jumping = false; this.y -= STAND_H - BALL_H; }
    // rolling continues on landing only if pressing down
    if (this.rolling && !this.game.input.down) { this.rolling = false; this.y -= STAND_H - BALL_H; }
    this.y = f.y - this.hR;
    this.ysp = 0;
    if (f.obj && f.obj.onStand) f.obj.onStand(this);
  }

  // -------------------------------------------------------------------- loop
  enterLoop(lp) {
    this.state = 'loop';
    this.loop = { lp, phi: 0, v0: this.gsp, rr: lp.R - this.hR };
  }
  updateLoop() {
    const L = this.loop, lp = L.lp;
    const dh = L.rr * (1 - Math.cos(L.phi));
    const v = Math.sqrt(Math.max(30, L.v0 * L.v0 - 2 * PHYS.grav * 0.25 * dh));
    L.phi += v / L.rr;
    if (L.phi >= Math.PI * 2) {
      this.state = 'normal';
      this.x = lp.cx + 1; this.y = lp.groundY - this.hR;
      this.gsp = L.v0; this.angle = 0; this.loop = null;
      this.groundStick();
      return;
    }
    const cy = lp.groundY - lp.R;
    this.x = lp.cx + Math.sin(L.phi) * L.rr;
    this.y = cy + Math.cos(L.phi) * L.rr;
    this.angle = -L.phi;
    this.gsp = v;
    this.xsp = Math.cos(L.phi) * v; this.ysp = -Math.sin(L.phi) * v;
  }

  // ------------------------------------------------------------ damage/death
  hurt(srcX) {
    if (this.state !== 'normal' || this.invuln > 0 || this.invinc > 0) return;
    const g = this.game;
    if (this.shield) { this.shield = false; Sound.play('hurt'); }
    else if (g.rings > 0) { g.scatterRings(); }
    else { this.die(); return; }
    this.state = 'hurt';
    this.setBall(false); this.springing = false; this.crouch = false;
    this.ground = false; this.platform = null; this.angle = 0;
    this.ysp = -4 * K;
    const dir = Math.sign(this.x - srcX) || -this.facing;
    this.xsp = 2 * K * dir;
    this.invuln = 120;
  }

  die(fell) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.setBall(false);
    this.ground = false; this.xsp = 0; this.ysp = fell ? -2 * K : -7 * K;
    this.shield = false; this.invinc = 0; this.shoes = 0; this.deadTimer = 0;
    Sound.play('death');
    this.game.onPlayerDeath();
  }
  updateDead() {
    this.y += this.ysp; this.ysp += PHYS.grav;
    this.deadTimer++;
  }

  // ----------------------------------------------------------------- springs
  launch(xs, ys, lock = 0) {
    this.ground = false; this.platform = null; this.angle = 0;
    if (this.jumping || this.rolling) this.setBall(false);
    if (ys !== null) { this.ysp = ys; this.springing = ys < 0; }
    if (xs !== null) { this.xsp = xs; this.facing = Math.sign(xs) || this.facing; }
    this.controlLock = lock;
  }
  pushGround(speed) {
    // horizontal spring
    this.gsp = speed; this.xsp = speed; this.facing = Math.sign(speed);
    this.controlLock = 16;
  }

  // ----------------------------------------------------------------- drawing
  animate() {
    const sp = Math.abs(this.ground ? this.gsp : this.xsp);
    this.anim += this.ground ? Math.max(0.08, sp * 0.06) : 0.2;
    this.ballRot += (this.ground ? this.gsp : this.xsp * 0.6 + 3 * this.facing) * 0.05 + (this.spindash ? 0.6 * this.facing : 0);
    if (this.skidDust > 0) { this.skidDust--; if (this.skidDust % 4 === 0 && this.ground) this.game.addDust(this.x, this.feet - 4); }
    const still = this.ground && sp < 0.01 && !this.ball && this.state === 'normal';
    this.idleTime = still && !this.crouch && !this.lookUp ? this.idleTime + 1 : 0;
    // smooth visual rotation
    let target = this.ground || this.state === 'loop' ? this.angle : 0;
    if (this.ground && Math.abs(target) < 0.25 && sp < 3) target = 0;
    let d = target - this.drawAngle;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.drawAngle += d * (this.state === 'loop' ? 1 : 0.35);
  }

  pose() {
    if (this.state === 'dead') return 'dead';
    if (this.state === 'hurt') return 'hurt';
    if (this.ball) return 'ball';
    if (!this.ground && this.state !== 'loop') return this.springing ? 'spring' : (Math.abs(this.xsp) > 5 ? 'run' : 'walk');
    const sp = Math.abs(this.gsp);
    if (this.crouch) return 'crouch';
    if (this.lookUp) return 'lookup';
    if (this.skidDust > 0 && sp > 1) return 'skid';
    if (this.pushing) return 'push';
    if (sp < 0.01) return this.idleTime > 180 ? 'tap' : 'idle';
    if (sp < this.top * 0.55) return 'walk';
    if (sp < PHYS.top * 1.0) return 'run';
    return 'dash';
  }

  draw(ctx, cam, t) {
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
    if (this.invuln > 0 && this.state !== 'hurt' && Math.floor(this.invuln / 3) % 2 === 0) return;
    const pose = this.pose();
    ctx.save();
    ctx.translate(sx, sy);
    if (pose === 'ball') {
      drawHeroBall(ctx, this.ballRot, { squash: this.spindash ? 0.6 + Math.sin(t * 0.8) * 0.3 : 0 });
    } else {
      // rotate around the feet
      ctx.translate(0, STAND_H); ctx.rotate(this.drawAngle); ctx.translate(0, -STAND_H);
      ctx.scale(this.facing, 1);
      ctx.translate(0, -1);
      drawHero(ctx, pose, pose === 'dash' ? t * 0.9 : pose === 'tap' ? t * 0.25 : this.anim, {});
    }
    ctx.restore();
    if (this.shield) drawShield(ctx, sx, sy, t);
    if (this.invinc > 0) drawInvincibility(ctx, sx, sy, t);
  }
}
