// Jason: Metal Gear Rising style controller. Light/heavy strings with
// cancels, parry (light attack toward the attacker), perfect parry counters,
// Ninja Run, Blade Mode with free cutting and Zandatsu, air and crouch
// attacks, dodge, lock-on, the pistol as a sub-weapon.
import * as THREE from 'three';
import { extractRootMotion, splitClip, stripScale, strikeTimes } from './anim.js';
import { attachToHand, makeKnife, makePistol } from './weapons.js';
import { collide, groundAt } from './arena.js';
import { sfx } from './sfx.js';

const LIFT = 0.022; // boot soles sit below the body's feet
const GRAV = 27;

const LOOPS = new Set(['Idle_A', 'Idle_Sword', 'Fighting Idle', 'Walk', 'Jog', 'Sprint', 'Run_Anime', 'Walk_Backwards',
  'Strafe_left', 'Strafe_right', 'Crouch_Idle', 'Crouch_Walk', 'Run_Stealth', 'Jump_air', 'NinjaJump_Idle',
  'Pistol_Idle', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down']);

// Move list. speed = playback rate; from/to = part of the clip used;
// hits = strikes in it; cancel = when the next input takes over; end = when
// it hands back to movement; travel = forward slide (m); layer = upper-body
// clip over crouch/air legs.
const MOVES = {
  L1: { clip: 'Sword_Regular_A', speed: 1.35, dmg: 9, react: 'light', next: { L: 'L2', H: 'LH' }, cancel: 0.42, end: 0.78, travel: 0.4 },
  L2: { clip: 'Sword_Regular_B', speed: 1.35, dmg: 9, react: 'light', next: { L: 'L3', H: 'LLH' }, cancel: 0.42, end: 0.78, travel: 0.4 },
  L3: { clip: 'Sword_Regular_Combo', speed: 1.8, from: 0, to: 0.48, hits: 2, dmg: 8, react: 'light', next: { L: 'L4', H: 'LLH' }, cancel: 0.72, end: 1, travel: 0.6 },
  L4: { clip: 'Sword_Regular_C', speed: 1.8, dmg: 16, react: 'knockback', heavy: true, next: { L: 'L1', H: 'H1' }, cancel: 0.62, end: 0.82, travel: 1.4 },
  H1: { clip: 'Kick_Breach', speed: 1.75, dmg: 13, react: 'stagger', heavy: true, next: { H: 'H2', L: 'L2' }, cancel: 0.5, end: 0.72, travel: 0.5 },
  H2: { clip: 'Chop_Tree', speed: 1.7, dmg: 16, react: 'stagger', heavy: true, next: { H: 'H3', L: 'L3' }, cancel: 0.58, end: 0.8 },
  H3: { clip: 'Attack_Ground_Pound', speed: 1.55, dmg: 20, react: 'knockdown', heavy: true, aoe: 3.4, end: 0.86 },
  LH: { clip: 'Melee_Hook', speed: 1.3, dmg: 13, react: 'stagger', heavy: true, next: { L: 'L3', H: 'H2' }, cancel: 0.55, end: 0.78, travel: 0.8 },
  LLH: { clip: 'Sword_Attack', speed: 1.8, from: 0.05, to: 0.7, hits: 2, dmg: 11, react: 'launch', heavy: true, end: 0.9, launcher: true },
  DASH_L: { clip: 'Sword_Dash_RM', speed: 1.7, dmg: 16, react: 'knockback', heavy: true, travel: 4.5, end: 0.72 },
  DASH_H: { clip: 'Shield_Dash_RM', speed: 1.7, dmg: 12, react: 'knockdown', heavy: true, travel: 5.5, end: 0.7, multi: true },
  CL1: { layer: 'crouch', clip: 'Sword_Regular_A', speed: 1.5, dmg: 8, react: 'light', next: { L: 'CL2', H: 'CH' }, cancel: 0.45, end: 0.78 },
  CL2: { layer: 'crouch', clip: 'Sword_Regular_B', speed: 1.5, dmg: 8, react: 'light', next: { L: 'CL3', H: 'CH' }, cancel: 0.45, end: 0.78 },
  CL3: { layer: 'crouch', clip: 'Sword_Regular_C', speed: 2.0, dmg: 12, react: 'stagger', heavy: true, next: { L: 'CL1', H: 'CH' }, cancel: 0.6, end: 0.8 },
  CH: { clip: 'Slide', speed: 1.5, dmg: 12, react: 'knockdown', heavy: true, travel: 5, end: 0.8, multi: true },
  AL1: { layer: 'air', clip: 'Sword_Regular_A', speed: 1.6, dmg: 8, react: 'air', next: { L: 'AL2' }, cancel: 0.42, end: 0.8 },
  AL2: { layer: 'air', clip: 'Sword_Regular_B', speed: 1.6, dmg: 8, react: 'air', next: { L: 'AL3' }, cancel: 0.42, end: 0.8 },
  AL3: { layer: 'air', clip: 'Sword_Regular_A', speed: 1.6, dmg: 8, react: 'air', next: { L: 'AL4' }, cancel: 0.42, end: 0.8 },
  AL4: { layer: 'air', clip: 'Sword_Regular_C', speed: 2.0, dmg: 14, react: 'knockdown', heavy: true, end: 0.8 },
  COUNTER: { clip: 'Sword_Regular_C', speed: 2.4, dmg: 18, react: 'none', heavy: true, end: 0.75, travel: 0.6 },
};

const v3 = () => new THREE.Vector3();

export class Player {
  constructor(gltf, scene, ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.model.position.y = LIFT;
    this.root.add(this.model);
    scene.add(this.root);
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.holsterGrip = this.model.getObjectByName('Pistol_Grip');

    // weapons go on in the bind pose, before anything animates the skeleton
    this.knife = attachToHand(this.model, makeKnife(), 'blade');
    this.pistol = attachToHand(this.model, makePistol(), 'gun');
    this.pistol.visible = false;

    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (let c of gltf.animations) this.clips[c.name] = extractRootMotion(stripScale(c), this.bones.root, 0.3).clip;
    this.actions = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const a = this.mixer.clipAction(clip);
      if (!LOOPS.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[name] = a;
    }
    // layers: upper-body strikes over crouched / airborne legs, pistol aim
    this.upperClips = {};
    for (const n of ['Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down', 'Pistol_Reload']) {
      const a = this.mixer.clipAction(splitClip(this.clips[n], 'upper'));
      if (!n.startsWith('Pistol_Aim')) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.upperClips[n] = a;
    }
    this.lowerClips = {};
    for (const n of ['Idle_A', 'Walk', 'Walk_Backwards', 'Strafe_left', 'Strafe_right', 'Crouch_Idle', 'Crouch_Walk', 'Jump_air']) {
      this.lowerClips[n] = this.mixer.clipAction(splitClip(this.clips[n], 'lower'));
    }
    // strike frames for every move, from the animation itself
    this.strikes = {};
    for (const [id, M] of Object.entries(MOVES)) {
      this.strikes[id] = strikeTimes(this.model, this.mixer, this.clips[M.clip], { from: (M.from || 0) + 0.08, to: (M.to || 1) - 0.08, count: M.hits || 1, gap: 0.12 });
    }
    this.measureSpeeds();

    this.pos = this.root.position;
    this.pos.copy(ctx.arena.spawn);
    this.yaw = Math.PI;
    this.vel = v3();
    this.vy = 0;
    this.onGround = true;
    this.state = 'move';
    this.hp = 100;
    this.focus = 100;
    this.combo = 0;
    this.comboT = 0;
    this.bp = 0;
    this.crouch = false;
    this.walkMode = false;
    this.ammo = 12;
    this.invuln = 0;
    this.parryBullet = 0;
    this.curSpeed = 0;
    this.cutAngle = 0;
    this.base = null;
    this.play('Idle_A');
  }

  chest() { return this.pos.clone().add(new THREE.Vector3(0, 1.25, 0)); }
  get dead() { return this.state === 'dead'; }
  get airAttacking() { return this.state === 'attack' && this.move?.M.layer === 'air'; }
  fwd() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  measureSpeeds() {
    this.speeds = {};
    const travel = { Walk: 1, Jog: 1, Sprint: 1, Run_Anime: 1, Crouch_Walk: 1, Run_Stealth: 1, Walk_Backwards: -1 };
    const feet = [this.bones.foot_l, this.bones.foot_r];
    const p = v3(), inv = new THREE.Matrix4();
    for (const [name, dirz] of Object.entries(travel)) {
      const a = this.actions[name];
      if (!a) continue;
      a.reset().play();
      const dur = a.getClip().duration, N = 90, dt = dur / N;
      const pos = [[], []];
      for (let i = 0; i <= N; i++) {
        this.mixer.setTime(i * dt);
        this.model.updateMatrixWorld(true);
        inv.copy(this.model.matrixWorld).invert();
        feet.forEach((f, k) => pos[k].push(f.getWorldPosition(p).applyMatrix4(inv).clone()));
      }
      a.stop();
      const v = [];
      for (const fp of pos) {
        const ys = fp.map((q) => q.y), lo = Math.min(...ys), hi = Math.max(...ys);
        for (let i = 1; i <= N; i++) {
          if (fp[i].y > lo + (hi - lo) * 0.35) continue;
          const back = -((fp[i].z - fp[i - 1].z) * dirz) / dt;
          if (back > 0) v.push(back);
        }
      }
      v.sort((x, y) => x - y);
      this.speeds[name] = v.length ? v[Math.floor(v.length * 0.6)] : 2;
    }
    this.mixer.setTime(0);
  }

  // ------------------------------------------------------------ animation
  play(name, { fade = 0.12, speed = 1, from = 0, restart = false } = {}) {
    const a = this.actions[name];
    if (!a) return null;
    this.clearLayers();
    if (this.base === a && !restart) { a.timeScale = speed; return a; }
    a.reset();
    a.time = from * a.getClip().duration;
    a.timeScale = speed;
    a.setEffectiveWeight(1).play();
    if (this.base && this.base !== a) a.crossFadeFrom(this.base, fade, false);
    else if (!this.base) a.fadeIn(fade);
    this.base = a;
    this.baseName = name;
    return a;
  }

  // legs from one clip, arms from another (crouch/air strikes, pistol)
  playLayered(lower, upper, { speed = 1, from = 0 } = {}) {
    if (this.base) { this.base.fadeOut(0.08); this.base = null; this.baseName = null; }
    for (const [n, a] of Object.entries(this.lowerClips)) {
      if (n === lower) { if (!a.isRunning()) { a.reset().play(); } a.setEffectiveWeight(1); } else if (a.isRunning()) a.stop();
    }
    let up = null;
    for (const [n, a] of Object.entries(this.upperClips)) {
      if (n === upper) { a.reset(); a.time = from * a.getClip().duration; a.timeScale = speed; a.setEffectiveWeight(1).play(); up = a; } else if (a.isRunning() && !n.startsWith('Pistol')) a.stop();
    }
    this.layered = true;
    return up;
  }

  clearLayers() {
    if (!this.layered) return;
    for (const a of [...Object.values(this.lowerClips), ...Object.values(this.upperClips)]) if (a.isRunning()) a.stop();
    this.layered = false;
  }

  // ------------------------------------------------------------ main update
  update(dt) {
    this.dt = dt;
    const { input, cam } = this.ctx;
    const mv = input.move();
    const moving = Math.hypot(mv.x, mv.y) > 0.1;
    const cf = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    const cr = new THREE.Vector3(-cf.z, 0, cf.x);
    const dir = v3().addScaledVector(cr, mv.x).addScaledVector(cf, mv.y);
    if (dir.lengthSq() > 1e-4) dir.normalize();
    this.inputDir = moving ? dir.clone() : null;
    this.invuln = Math.max(0, this.invuln - dt);
    this.parryBullet = Math.max(0, this.parryBullet - dt);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.followT > 0) {
      this.followT -= dt;
      const want = this.ctx.input.mouse.right || this.ctx.input.padNow?.heavy || this.ctx.input.hit('Space', 'pad:jump');
      if (want && this.followE?.alive && (this.state === 'attack' || this.state === 'move') && this.followT < 0.42) this.followUp();
    }
    if (this.lockT?.alive === false) this.lockT = this.ctx.enemies.pick(this.pos, this.fwd(), 15);

    if (input.hit('KeyC', 'pad:crouch')) this.crouch = !this.crouch;
    if (input.hit('Mouse1', 'pad:lock')) {
      this.lockT = this.lockT ? null : this.ctx.enemies.pick(this.pos, cf, 18);
    }
    const L = input.hit('Mouse0', 'pad:attack');
    // heavy: a tap is a heavy attack (on release), holding it launches;
    // in the air a press slams down straight away
    const heavyDown = input.mouse.right || !!input.padNow?.heavy;
    let H = false;
    this.launchNow = false;
    if (!this.onGround && input.hit('Mouse2', 'pad:heavy')) { H = true; this.hUsed = true; }
    if (this.onGround && input.hit('Mouse2', 'pad:heavy') && !heavyDown) H = true; // tapped within one frame
    else if (heavyDown) {
      this.hT = this.hT >= 0 ? this.hT + dt : 0;
      if (this.hT >= 0.26 && !this.hUsed && this.onGround) { this.launchNow = true; this.hUsed = true; }
    } else {
      if (this.hT >= 0 && !this.hUsed) H = true;
      this.hT = -1; this.hUsed = false;
    }
    // pistol: tap Q = quick auto-aimed shot, hold Q = aim
    if (input.held('KeyQ') || input.padNow?.aim) this.qT = (this.qT || 0) + dt; else {
      if (this.qT > 0 && this.qT < 0.25 && this.state !== 'aim') this.quickShot();
      this.qT = 0;
    }
    if (this.ammo <= 0 && !this.reloadT) { this.reloadT = 1.1; sfx.click(); }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this.ammo = 12; sfx.click(); } }
    if (this.gunOutT > 0) { this.gunOutT -= dt; if (this.gunOutT <= 0 && this.state !== 'aim') this.holsterGun(); }
    if (input.hit('pad:fire') && this.state !== 'aim') this.quickShot();
    if (this.launchNow && (this.state === 'move' || this.state === 'attack') && !this.crouch) { this.chain = null; this.doMove('LLH'); }

    switch (this.state) {
      case 'move': this.updateMove(dt, input, dir, moving, mv, L, H); break;
      case 'attack': this.updateAttack(dt, input, dir, moving, L, H); break;
      case 'air': this.updateAir(dt, input, dir, moving, L, H); break;
      case 'plunge': this.updatePlunge(dt); break;
      case 'dodge': this.updateTimed(dt, true); break;
      case 'parry': this.updateTimed(dt); if (this.state === 'parry' && L) this.tryParry(); break;
      case 'hurt': case 'down': case 'land': case 'zandatsu': this.updateTimed(dt, this.state === 'land' && moving); break;
      case 'blade': this.updateBlade(dt, input, dir, moving); break;
      case 'aim': this.updateAim(dt, input, dir, moving, mv); break;
      case 'dead': break;
      default: break;
    }

    // gravity and ground
    const g = groundAt(this.ctx.arena.colliders, this.pos.x, this.pos.z, this.pos.y);
    if (!this.onGround) {
      const hang = this.airAttacking ? 5 : GRAV;
      this.vy -= hang * dt;
      if (this.airAttacking) this.vy = Math.max(this.vy, -2.5);
      this.pos.y += this.vy * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y <= g && this.vy <= 0) this.land(g);
    } else if (this.pos.y > g + 0.08 && this.state !== 'dead') {
      this.onGround = false; this.vy = 0;
      if (this.state === 'move') { this.state = 'air'; this.play('Jump_air', { fade: 0.2 }); }
    } else this.pos.y = g;

    collide(this.ctx.arena.colliders, this.pos, 0.32);
    const b = this.ctx.arena.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
    for (const e of this.ctx.enemies.alive) {
      if (e.air || this.state === 'dodge') continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, d = Math.hypot(dx, dz), min = 0.65 * (e.T.scale || 1);
      if (d < min && d > 1e-4 && Math.abs(this.pos.y - e.pos.y) < 1) { this.pos.x += (dx / d) * (min - d); this.pos.z += (dz / d) * (min - d); }
    }

    this.root.rotation.y = this.yaw;
    this.mixer.update(dt);
    this.postPose(dt);
    // blade trail
    const swinging = this.state === 'attack' || this.state === 'blade' && this.bladeSwing > 0 || this.state === 'parry';
    this.ctx.fx.trailPush(this.knife.userData.base.getWorldPosition(v3()), this.knife.userData.tip.getWorldPosition(v3()), swinging);
  }

  // ------------------------------------------------------------ movement
  updateMove(dt, input, dir, moving, mv, L, H) {
    if (L && this.tryParry()) return;
    // a press shortly after a move ends still continues the string
    if (this.chain && (L || H)) {
      const nid = MOVES[this.chain.id].next?.[L ? 'L' : 'H'];
      this.chainT = 0;
      if (nid && !MOVES[nid].layer || nid && MOVES[nid].layer === 'crouch' && this.crouch) { this.chain = null; return this.doMove(nid); }
    }
    if (this.chain) { this.chainT -= dt; if (this.chainT <= 0) this.chain = null; }
    const ninja = input.sprint && !this.crouch;
    if (L || H) {
      if (this.crouch) return this.doMove(L ? 'CL1' : 'CH');
      if (ninja && this.curSpeed > 8) return this.doMove(L ? 'DASH_L' : 'DASH_H');
      const back = mv.y < -0.5 && (this.lockT || this.ctx.enemies.pick(this.pos, this.fwd(), 4));
      if (H && back) return this.doMove('LLH');
      return this.doMove(L ? 'L1' : 'H1');
    }
    if (input.hit('KeyE', 'KeyZ', 'pad:roll')) return this.dodge(dir, moving);
    if (input.hit('Space', 'pad:jump')) return this.jump(dir, moving, ninja);
    if ((input.held('KeyF') || input.padNow?.blade) && this.focus > 5) return this.enterBlade();
    if (this.qT >= 0.25) return this.enterAim();

    const near = this.ctx.enemies.alive.some((e) => e.pos.distanceTo(this.pos) < 12);
    let clip, speed;
    if (!moving) { clip = this.crouch ? 'Crouch_Idle' : (near ? 'Idle_Sword' : 'Idle_A'); speed = 0; }
    else if (this.crouch) { clip = input.sprint ? 'Run_Stealth' : 'Crouch_Walk'; speed = input.sprint ? 6.5 : 3.2; }
    else if (ninja) { clip = 'Run_Anime'; speed = 13; }
    else if (this.walkMode) { clip = 'Walk'; speed = 1.7; }
    else { clip = 'Sprint'; speed = 7.5; }
    if (moving) {
      const target = Math.atan2(dir.x, dir.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const rate = ninja ? 9 : 20;
      this.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    }
    this.curSpeed = THREE.MathUtils.damp(this.curSpeed, speed, speed > this.curSpeed ? 9 : 14, dt);
    this.pos.addScaledVector(this.fwd(), this.curSpeed * dt);
    // Ninja Run vaults over anything up to chest height
    if (ninja && moving && this.curSpeed > 8) {
      const ahead = this.pos.clone().addScaledVector(this.fwd(), 0.75); ahead.y += 0.4;
      const box = this.ctx.arena.colliders.find((b) => b.containsPoint(ahead));
      if (box && box.max.y - this.pos.y < 1.6) { this.vault(box); return; }
    }
    const rate = speed > 0 && this.speeds[clip] ? this.curSpeed / this.speeds[clip] : 1;
    if (this.gunOutT > 0) { this.playLayered(moving ? 'Walk' : 'Idle_A', 'Pistol_Aim_Neutral'); return; }
    this.play(clip, { speed: THREE.MathUtils.clamp(rate, 0.7, 2.2), fade: 0.16 });
    this.footsteps(clip);
  }

  footsteps(clip) {
    if (this.curSpeed < 0.5 || !this.base) return;
    const ph = (this.base.time / this.base.getClip().duration) * 2 % 1;
    if (this.stepPhase > ph) sfx.step(this.crouch || clip === 'Walk');
    this.stepPhase = ph;
  }

  vault(box) {
    this.onGround = false;
    this.vy = Math.sqrt(2 * GRAV * Math.max(0.5, box.max.y - this.pos.y + 0.35));
    this.vel.copy(this.fwd()).multiplyScalar(Math.max(8, this.curSpeed * 0.85));
    this.state = 'air';
    this.play('Run Jump', { fade: 0.06, speed: 1.6, restart: true });
    sfx.whoosh();
  }

  jump(dir, moving, ninja) {
    this.onGround = false;
    this.vy = ninja ? 9.5 : 10.5;
    this.vel.copy(moving ? dir : this.fwd()).multiplyScalar(moving ? Math.max(3, this.curSpeed) : 0);
    if (moving) this.yaw = Math.atan2(dir.x, dir.z);
    this.state = 'air';
    this.airMoves = 0;
    this.play(ninja && moving ? 'Run Jump' : 'Jump_air', { fade: 0.06, speed: ninja ? 1.5 : 1, from: ninja ? 0 : 0.1, restart: true });
    sfx.whoosh();
  }

  land(g) {
    this.pos.y = g;
    this.onGround = true;
    this.vy = 0;
    this.vel.set(0, 0, 0);
    sfx.land();
    if (this.state === 'plunge') return this.plungeImpact();
    if (this.state === 'dead' || this.state === 'down' || this.state === 'hurt') return;
    if (this.state === 'attack') { this.move = null; }
    this.state = 'land';
    this.timer = 0.22;
    this.play('Jump_Land', { fade: 0.05, speed: 2, restart: true });
  }

  updateAir(dt, input, dir, moving, L, H) {
    if (moving) {
      this.vel.addScaledVector(dir, 16 * dt);
      const h = Math.hypot(this.vel.x, this.vel.z), max = Math.max(7.5, this.ninjaCarry || 0);
      if (h > max) { this.vel.x *= max / h; this.vel.z *= max / h; }
      const target = Math.atan2(dir.x, dir.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.yaw += THREE.MathUtils.clamp(d, -10 * dt, 10 * dt);
    }
    if (L && this.tryParry()) return;
    if (L) return this.doMove('AL1');
    if (H) return this.startPlunge();
    if (input.hit('KeyE', 'KeyZ', 'pad:roll')) this.dodge(dir, moving);
  }

  // ------------------------------------------------------------ attacks
  doMove(id, target) {
    const M = MOVES[id];
    const E = this.ctx.enemies;
    target = target || this.lockT || E.pick(this.pos, this.inputDir || this.fwd(), M.layer === 'air' ? 5 : 7.5);
    if (target && target.alive) {
      this.yaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      target.onThreat?.();
    }
    const from = M.from || 0, to = M.to || 1;
    let a;
    if (M.layer) a = this.playLayered(M.layer === 'crouch' ? 'Crouch_Idle' : 'Jump_air', M.clip, { speed: M.speed, from });
    else a = this.play(M.clip, { fade: 0.06, speed: M.speed, from, restart: true });
    const clipDur = a.getClip().duration;
    this.state = 'attack';
    this.move = {
      id, M, a, target, t: 0,
      dur: (to - from) * clipDur / M.speed,
      hits: this.strikes[id].map((f) => ({ t: (f - from) * clipDur / M.speed, done: false })),
      queued: null, travelled: 0,
      lunge: target ? Math.max(0, Math.min(4, target.pos.distanceTo(this.pos) - 1.25)) : 0,
    };
    if (M.layer === 'air') { this.vy = Math.max(this.vy, 1.5); this.vel.multiplyScalar(0.2); }
    this.curSpeed = 0;
    sfx.swish(M.heavy);
  }

  updateAttack(dt, input, dir, moving, L, H) {
    const m = this.move;
    const M = m.M;
    m.t += dt;
    const k = m.t / m.dur;
    // buffer the next input (light also parries if something is incoming)
    if (L && this.tryParry()) return;
    if (H && M.layer === 'air') return this.startPlunge();
    if ((this.ctx.input.held('KeyF') || this.ctx.input.padNow?.blade) && this.focus > 5 && k > 0.2) { this.move = null; return this.enterBlade(); }
    if ((L || H) && k > 0.12) m.queued = L ? 'L' : 'H';
    if (input.hit('KeyE', 'KeyZ', 'pad:roll') && k > 0.25) return this.dodge(dir, moving);
    // slide toward the target (magnetism) and the move's own travel
    const firstHit = m.hits[0]?.t || m.dur * 0.4;
    if (m.target?.alive && m.t < firstHit) {
      const to = m.target.pos.clone().sub(this.pos); to.y = 0;
      const d = to.length();
      this.yaw = Math.atan2(to.x, to.z);
      if (d > 1.3) this.pos.addScaledVector(to.normalize(), Math.min(d - 1.3, Math.max(m.lunge / firstHit, 6) * dt));
    }
    if (M.travel) {
      const f = THREE.MathUtils.clamp(k / 0.6, 0, 1);
      const want = M.travel * (f * f * (3 - 2 * f));
      const blocked = !M.multi && m.target?.alive && m.target.pos.distanceTo(this.pos) < 1.2;
      if (!blocked) this.pos.addScaledVector(this.fwd(), want - m.travelled);
      m.travelled = want;
    }
    for (const h of m.hits) {
      if (!h.done && m.t >= h.t) { h.done = true; this.strike(M, h === m.hits[m.hits.length - 1]); }
    }
    if (M.layer === 'crouch') { this.crouch = true; }
    if (m.queued && M.next?.[m.queued] && k >= M.cancel) {
      const nid = M.next[m.queued];
      if (MOVES[nid].layer === 'air' && this.onGround) return;
      return this.doMove(nid);
    }
    if (k >= M.end) {
      this.move = null;
      if (M.next) { this.chain = { id: m.id }; this.chainT = 0.35; }
      if (M.layer === 'air') { this.state = 'air'; this.play('Jump_air', { fade: 0.15, from: 0.4 }); return; }
      this.state = 'move';
    }
  }

  strike(M, last) {
    const E = this.ctx.enemies;
    const fwd = this.fwd();
    let landed = 0;
    for (const e of E.alive) {
      const to = e.pos.clone().sub(this.pos);
      const dy = Math.abs(to.y);
      to.y = 0;
      const d = to.length();
      const reach = (M.aoe || 2.4) * (e.T.scale || 1) ** 0.5;
      const ok = M.aoe ? d < M.aoe : d < reach && to.normalize().dot(fwd) > 0.2;
      if (!ok || dy > (M.layer === 'air' ? 2 : 1.3)) continue;
      const res = e.takeHit({ dmg: M.dmg, react: M.react, from: this.pos.clone(), heavy: !!M.heavy });
      if (res === 'blocked' || res === 'miss') continue;
      landed++;
      if (res === 'armor') continue;
      this.addHit(M.heavy ? 30 : 15);
      if (M.launcher && res === 'hit' && e.air) this.launchFollow = e;
    }
    if (M.aoe) { this.ctx.fx.ring(this.pos.clone(), M.aoe, 0xbfe8ff); this.ctx.cam.shake(0.25); }
    if (landed) {
      sfx.slash(M.heavy);
      this.ctx.cam.shake(M.heavy ? 0.16 : 0.07);
      this.ctx.time.hitstop(M.heavy ? 0.085 : 0.045);
      this.focus = Math.min(100, this.focus + (M.heavy ? 5 : 3));
    }
    // launcher: holding heavy (or pressing jump) right after sends Jason up after him
    if (this.launchFollow) { this.followE = this.launchFollow; this.followT = 0.6; this.launchFollow = null; }
  }

  followUp() {
    const e = this.followE;
    this.followE = null; this.followT = 0;
    this.move = null;
    this.onGround = false; this.vy = 11.5; this.vel.set(0, 0, 0);
    this.state = 'air';
    this.yaw = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    this.play('NinjaJump_Start', { fade: 0.05, speed: 1.6, from: 0.15, restart: true });
    sfx.whoosh();
  }

  addHit(bp) {
    this.combo++;
    this.comboT = 2.5;
    this.bp += bp + this.combo * 2;
  }

  startPlunge() {
    this.state = 'plunge';
    this.vy = -32;
    this.vel.set(0, 0, 0);
    this.play('Attack_Ground_Pound', { fade: 0.05, speed: 1.2, from: 0.38, restart: true });
    this.base.timeScale = 0;
    sfx.whoosh();
  }

  updatePlunge() { /* falls under gravity in update(); impact in land() */ }

  plungeImpact() {
    this.state = 'land';
    this.timer = 0.45;
    this.play('Land_Three_Point', { fade: 0.03, speed: 1.6, from: 0.45, restart: true });
    this.strike({ dmg: 18, react: 'knockdown', heavy: true, aoe: 3.6 }, true);
    this.ctx.cam.shake(0.3);
  }

  // ------------------------------------------------------------ defence
  // Light attack while pushing toward an enemy about to hit you = parry.
  tryParry() {
    const E = this.ctx.enemies;
    let ok = false;
    for (const e of E.threats(0.34)) {
      if (e.attack.parried) continue;
      const to = e.pos.clone().sub(this.pos).setY(0).normalize();
      // simplified: any enemy close by whose red-glint attack is landing
      if (e.pos.distanceTo(this.pos) > 4) continue;
      if (!e.attack.A.parry) continue; // yellow glint: can't be parried
      e.attack.parried = true;
      e.attack.perfect = e.nextImpact() <= 0.13;
      this.yaw = Math.atan2(to.x, to.z);
      ok = true;
    }
    // bullets coming in: deflect them
    if (E.bullets.some((b) => !b.deflected && b.mesh.position.distanceTo(this.chest()) < 6)) { this.parryBullet = 0.3; ok = true; }
    if (!ok) return false;
    this.state = 'parry';
    this.timer = 0.38;
    this.move = null;
    this.play('Sword_Block', { fade: 0.04, speed: 2.4, restart: true });
    return true;
  }

  onParry(e, perfect) {
    this.ctx.hud.msg(perfect ? 'PERFECT PARRY' : 'PARRY', perfect ? 'gold' : 'white');
    this.ctx.time.slow(perfect ? 0.12 : 0.35, perfect ? 0.55 : 0.18);
    this.focus = Math.min(100, this.focus + (perfect ? 25 : 10));
    this.bp += perfect ? 200 : 60;
    this.ctx.cam.shake(perfect ? 0.2 : 0.1);
    if (perfect) { this.state = 'move'; this.doMove('COUNTER', e); }
  }

  dodge(dir, moving) {
    let clip = 'Dodge_back', d = this.fwd().negate();
    if (moving) {
      const f = this.fwd();
      const side = new THREE.Vector3(f.z, 0, -f.x); // his right
      const df = dir.dot(f), ds = dir.dot(side);
      if (Math.abs(ds) > Math.abs(df)) { clip = ds > 0 ? 'Dodge_right' : 'Dodge_left'; d = dir.clone(); }
      else if (df > 0) { clip = 'Roll'; d = dir.clone(); }
      else d = dir.clone();
    }
    this.move = null;
    this.state = 'dodge';
    this.timer = clip === 'Roll' ? 0.5 : 0.36;
    this.dodgeV = d.multiplyScalar((clip === 'Roll' ? 5.5 : 4.2) / this.timer);
    this.invuln = 0.4;
    this.play(clip, { fade: 0.04, speed: clip === 'Roll' ? 2.4 : 2.2, restart: true });
    sfx.whoosh();
  }

  // timed states (dodge, parry, hurt, landing...) hand back to movement
  updateTimed(dt, cancelable) {
    this.timer -= dt;
    if (this.state === 'dodge') this.pos.addScaledVector(this.dodgeV, dt);
    if (this.state === 'hurt' || this.state === 'down') {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - 6 * dt));
    }
    if (this.timer <= 0 || cancelable && this.timer < 0.12) {
      if (this.state === 'down') this.invuln = 0.6;
      this.state = this.onGround ? 'move' : 'air';
      if (this.state === 'air') this.play('Jump_air', { fade: 0.15 });
    }
  }

  receiveHit({ dmg, react, from }) {
    if (this.dead || this.invuln > 0 || this.state === 'dodge' || this.state === 'zandatsu') return false;
    if (this.state === 'blade') this.exitBlade();
    if (this.state === 'aim') this.exitAim();
    this.hp -= dmg;
    this.combo = 0;
    this.move = null;
    const to = from.clone().sub(this.pos).setY(0).normalize();
    this.yaw = Math.atan2(to.x, to.z);
    this.ctx.fx.bloodBurst(this.chest().addScaledVector(to, 0.2), to, 10);
    this.ctx.hud.damage();
    this.ctx.cam.shake(0.2);
    sfx.hit(react === 'knockdown');
    if (this.hp <= 0) return this.die();
    this.knock = to.clone().multiplyScalar(react === 'knockdown' ? -6 : -2);
    if (react === 'knockdown') {
      this.state = 'down'; this.timer = 1.2;
      this.play('Hit_Knockback', { fade: 0.04, speed: 1.1, restart: true });
    } else {
      this.state = 'hurt'; this.timer = 0.32;
      this.play(Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head', { fade: 0.04, speed: 1.6, restart: true });
    }
    this.invuln = 0.25;
    return true;
  }

  receiveBullet(b) {
    if (this.dead || this.state === 'dodge') return 'miss';
    const from = b.vel.clone().negate().setY(0).normalize();
    const ninja = this.state === 'move' && this.curSpeed > 9 && this.fwd().dot(from) > 0.2;
    if (this.parryBullet > 0 || ninja || this.state === 'parry' || this.state === 'blade') {
      this.bp += 40;
      return 'deflect';
    }
    this.receiveHit({ dmg: b.owner.attack?.A.dmg || 8, react: 'light', from: b.mesh.position.clone().sub(b.vel) });
    return 'hit';
  }

  die() {
    this.state = 'dead';
    this.hp = 0;
    this.exitBlade();
    this.play('Death_A', { fade: 0.08, restart: true });
    this.ctx.hud.dead(true);
    return true;
  }

  respawn() {
    this.hp = 100; this.focus = 100; this.combo = 0;
    this.state = 'move';
    this.invuln = 2;
    this.play('Idle_A', { fade: 0.3 });
    this.ctx.hud.dead(false);
  }

  onKill(e, sliced) {
    this.bp += e.T.bp * (sliced ? 2 : 1);
    if (this.lockT === e) this.lockT = this.ctx.enemies.alive.find((x) => x !== e && x.pos.distanceTo(this.pos) < 15) || null;
    if (!this.ctx.enemies.alive.some((x) => x !== e)) this.ctx.time.slow(0.25, 0.6); // last kill of the wave
  }

  // ------------------------------------------------------------ blade mode
  enterBlade() {
    this.state = 'blade';
    this.move = null;
    this.bladeSwing = 0;
    this.ctx.time.blade = true;
    this.play('Idle_Sword', { fade: 0.1 });
    this.ctx.hud.blade(true);
    sfx.bladeIn();
  }

  exitBlade() {
    if (this.state === 'blade') this.state = this.onGround ? 'move' : 'air';
    this.ctx.time.blade = false;
    this.ctx.hud.blade(false);
  }

  updateBlade(dt, input, dir, moving) {
    this.focus -= dt * 9;
    if (!(input.held('KeyF') || input.padNow?.blade) || this.focus <= 0) { this.focus = Math.max(0, this.focus); sfx.bladeOut(); return this.exitBlade(); }
    // the cut angle follows the mouse swipe (or the right stick)
    const md = this.ctx.input.bladeSwipe;
    if (md && Math.hypot(md.x, md.y) > 3) this.cutAngle = Math.atan2(-md.y, md.x);
    this.ctx.hud.cutAngle(this.cutAngle);
    // face where the camera looks, shuffle slowly
    this.yaw = this.ctx.cam.yaw;
    if (moving) this.pos.addScaledVector(dir, 2 * dt);
    this.bladeSwing -= dt;
    if (this.bladeSwing <= 0 && !this.layered) this.play('Idle_Sword', { fade: 0.1 });
    const L = input.hit('Mouse0', 'pad:attack');
    const H = input.hit('Mouse2', 'pad:heavy');
    const swipeHeld = input.mouse.left && md && Math.hypot(md.x, md.y) > 14;
    if (L || H || (swipeHeld && this.bladeSwing <= -0.04)) this.cut(H ? this.cutAngle + Math.PI / 2 : this.cutAngle);
  }

  // the cut plane passes through this point, in front of Jason's chest
  bladeAnchor() { return this.chest().addScaledVector(this.fwd(), 1.3); }

  cut(angle) {
    const cam = this.ctx.cam.camera;
    const f = cam.getWorldDirection(v3());
    const right = v3().crossVectors(f, cam.up).normalize();
    const up = v3().crossVectors(right, f).normalize();
    const sdir = right.multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
    const normal = v3().crossVectors(f, sdir).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.bladeAnchor());
    this.focus = Math.max(0, this.focus - 3);
    this.bladeSwing = 0.12;
    this.slashFlip = !this.slashFlip;
    this.playLayered('Idle_A', this.slashFlip ? 'Sword_Regular_A' : 'Sword_Regular_B', { speed: 4.5, from: 0.25 });
    sfx.swish(true);
    this.ctx.hud.slash(angle);
    const reachC = this.chest();
    let any = false;
    // enemies (alive or dead) the plane passes through
    for (const e of this.ctx.enemies.list) {
      if (e.state === 'gone' || e.pos.distanceTo(this.pos) > 3.8) continue;
      const pts = ['head', 'pelvis', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'spine_03'].map((n) => e.model.getObjectByName(n).getWorldPosition(v3()));
      const sides = pts.map((p) => Math.sign(plane.distanceToPoint(p)));
      if (sides.every((s) => s === sides[0])) continue;
      if (e.T.armor && e.state !== 'stunned' && e.alive) {
        this.ctx.fx.sparks(e.chest(), normal, 0xffffff, 18, 5); sfx.clang(); any = true; continue;
      }
      const zan = e.state === 'stunned' && e.core && Math.abs(plane.distanceToPoint(e.chest())) < 0.22;
      const pieces = e.slice(plane, zan);
      any = true;
      this.bp += 80;
      if (zan) this.zandatsu(pieces);
    }
    // pieces already on the ground can be cut again
    for (const p of this.ctx.pieces.near(reachC, 3.5)) if (this.ctx.pieces.cutPiece(p, plane)) any = true;
    // bullets in the air
    for (const b of this.ctx.enemies.bullets) {
      if (b.mesh.position.distanceTo(reachC) < 4 && Math.abs(plane.distanceToPoint(b.mesh.position)) < 0.4) { b.life = 0; this.ctx.fx.sparks(b.mesh.position.clone(), normal, 0xffd6a0, 10); }
    }
    if (any) { sfx.slice(); this.ctx.cam.shake(0.06); this.addHit(20); }
  }

  zandatsu(pieces) {
    this.hp = Math.min(100, this.hp + 50);
    this.focus = 100;
    this.bp += 500;
    this.ctx.hud.msg('ZANDATSU', 'blue big');
    sfx.zandatsu();
    // a few extra cuts through the halves for the finish
    for (let i = 0; i < 3; i++) {
      const list = this.ctx.pieces.near(this.chest(), 4).slice(-4);
      for (const p of list) {
        const n = new THREE.Vector3().randomDirection();
        this.ctx.pieces.cutPiece(p, new THREE.Plane().setFromNormalAndCoplanarPoint(n, p.mesh.position));
      }
    }
    this.exitBlade();
    this.state = 'zandatsu';
    this.timer = 0.7;
    this.invuln = 1;
    this.play('Power Up', { fade: 0.05, speed: 2.2, restart: true });
    this.ctx.time.slow(0.2, 0.9);
    void pieces;
  }

  // ------------------------------------------------------------ pistol
  // tap Q: draw, snap to the nearest enemy in view and fire
  quickShot() {
    if (!['move', 'attack', 'air', 'land'].includes(this.state) || this.ammo <= 0 || this.reloadT > 0) { if (this.ammo <= 0) sfx.click(); return; }
    const cam = this.ctx.cam;
    const cf = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    const e = this.lockT?.alive ? this.lockT : this.ctx.enemies.pick(this.pos, cf, 30);
    this.pistol.visible = true; this.knife.visible = false;
    if (this.holsterGrip) this.holsterGrip.visible = false;
    this.gunOutT = 0.6;
    this.recoil = 1;
    this.ammo--;
    sfx.shot();
    const muzzle = this.pistol.userData.muzzle.getWorldPosition(v3());
    this.ctx.fx.muzzle(muzzle);
    cam.shake(0.08);
    if (e) {
      this.yaw = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      const to = e.chest();
      this.ctx.fx.tracer(muzzle, to);
      const r = e.takeHit({ dmg: 9, react: 'light', from: this.pos.clone() });
      if (r !== 'blocked' && r !== 'miss') this.addHit(25);
    } else {
      this.ctx.fx.tracer(muzzle, muzzle.clone().addScaledVector(cf, 30));
    }
    if (this.state === 'move') this.playLayered(this.curSpeed > 0.5 ? 'Walk' : 'Idle_A', 'Pistol_Aim_Neutral');
  }

  holsterGun() {
    this.pistol.visible = false; this.knife.visible = true;
    if (this.holsterGrip) this.holsterGrip.visible = true;
    if (this.state === 'move') this.clearLayers();
  }

  enterAim() {
    this.state = 'aim';
    this.pistol.visible = true;
    this.knife.visible = false;
    if (this.holsterGrip) this.holsterGrip.visible = false;
    sfx.draw();
  }

  exitAim() {
    this.state = 'move';
    this.pistol.visible = false;
    this.knife.visible = true;
    if (this.holsterGrip) this.holsterGrip.visible = true;
    this.clearLayers();
    this.base = null;
    this.play('Idle_A', { fade: 0.15 });
    sfx.draw();
  }

  get aiming() { return this.state === 'aim'; }

  updateAim(dt, input, dir, moving, mv) {
    if (!(input.held('KeyQ') || input.padNow?.aim)) return this.exitAim();
    if (input.hit('KeyE', 'KeyZ', 'pad:roll')) { this.exitAim(); return this.dodge(dir, moving); }
    const cam = this.ctx.cam;
    this.yaw = cam.yaw;
    let leg = 'Idle_A';
    if (moving) {
      if (Math.abs(mv.x) > Math.abs(mv.y)) leg = mv.x > 0 ? 'Strafe_right' : 'Strafe_left';
      else leg = mv.y > 0 ? 'Walk' : 'Walk_Backwards';
    }
    this.pos.addScaledVector(dir, (moving ? 3.6 : 0) * dt);
    if (this.base) { this.base.fadeOut(0.1); this.base = null; }
    for (const [n, a] of Object.entries(this.lowerClips)) {
      if (n === leg) { if (!a.isRunning()) a.reset().play(); a.setEffectiveWeight(1); a.timeScale = moving ? 2 : 1; } else if (a.isRunning()) a.stop();
    }
    this.layered = true;
    const reload = this.upperClips.Pistol_Reload;
    const reloading = reload.isRunning() && reload.time < reload.getClip().duration - 0.05;
    const up = Math.max(0, -cam.pitch / 0.7), down = Math.max(0, cam.pitch / 0.7);
    for (const [n, w] of [['Pistol_Aim_Up', Math.min(1, up)], ['Pistol_Aim_Down', Math.min(1, down)], ['Pistol_Aim_Neutral', 1 - Math.min(1, up + down)]]) {
      const a = this.upperClips[n];
      if (!a.isRunning()) a.reset().play();
      a.setEffectiveWeight(reloading ? 0 : w);
    }
    if (!reloading && reload.isRunning()) reload.stop();
    if (input.hit('Mouse0', 'pad:fire') && !reloading) this.fire();
    if (false) {
      reload.reset().play(); reload.setEffectiveWeight(1); reload.timeScale = 1.6;
      sfx.click(); setTimeout(() => { this.ammo = 12; sfx.click(); }, 1100);
    }
  }

  fire() {
    if (this.ammo <= 0 || this.reloadT > 0) { sfx.click(); return; }
    this.ammo--;
    this.recoil = 1;
    sfx.shot();
    const { cam, fx } = this.ctx;
    const muzzle = this.pistol.userData.muzzle.getWorldPosition(v3());
    fx.muzzle(muzzle);
    cam.shake(0.1);
    const ray = new THREE.Ray(cam.camera.position.clone(), cam.camera.getWorldDirection(v3()));
    let best = 60, hitN = new THREE.Vector3(0, 1, 0), hitE = null, part = null;
    const p = v3();
    for (const b of this.ctx.arena.colliders) {
      if (ray.intersectBox(b, p)) { const d = p.distanceTo(ray.origin); if (d < best && d > 0.5) { best = d; hitN = ray.direction.clone().negate(); } }
    }
    const floorT = ray.direction.y < 0 ? -ray.origin.y / ray.direction.y : Infinity;
    if (floorT < best) { best = floorT; hitN = new THREE.Vector3(0, 1, 0); }
    const eh = this.ctx.enemies.raycast(ray, best);
    if (eh) { best = eh.dist; hitE = eh.enemy; part = eh.part; }
    const hit = ray.at(best, v3());
    fx.tracer(muzzle, hit);
    if (hitE) {
      const r = hitE.takeHit({ dmg: part === 'head' ? 30 : 9, react: part === 'head' ? 'stagger' : 'light', from: this.pos.clone() });
      if (r !== 'blocked') this.addHit(25);
    } else fx.sparks(hit, hitN, 0xffc070, 12);
  }

  postPose(dt) {
    if (this.recoil > 0 && this.pistol.visible) {
      this.bones.lowerarm_r.rotateX(-0.25 * this.recoil);
      this.bones.hand_r.rotateX(-0.35 * this.recoil);
      this.recoil = Math.max(0, this.recoil - dt * 9);
    }
  }
}
