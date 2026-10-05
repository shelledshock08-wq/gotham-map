// Jason: third-person controller, animation state machine, knife and pistol.
import * as THREE from 'three';
import { extractRootMotion, sampleMotion, splitClip, stripScale } from './anim.js';
import { makeKnife, makePistol } from './weapons.js';
import { collide, groundAt } from './arena.js';
import { sfx } from './sfx.js';

const FADE = 0.18;
const LIFT = 0.022; // boot soles sit below the body's feet
const UP = new THREE.Vector3(0, 1, 0);

// which clips loop
const LOOPS = new Set(['Idle_A', 'Idle_Sword', 'Walk', 'Jog', 'Sprint', 'Walk_Backwards', 'Strafe_left', 'Strafe_right',
  'Crouch_Idle', 'Crouch_Walk', 'Walk_Stealth', 'Run_Stealth', 'Jump_air', 'Fighting Idle', 'Pistol_Idle',
  'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down', 'Idle_FoldArms', 'Idle_Talking']);

// travel added to in-place clips: [x (his left), z (forward)] metres, eased
// over the given part of the clip
const TRAVEL = {
  Roll: [[0, 3.0], 0.05, 0.8], Dodge_back: [[0, -1.9], 0.05, 0.7], Dodge_left: [[1.8, 0], 0.05, 0.7],
  Dodge_right: [[-1.8, 0], 0.05, 0.7], Sword_Regular_A: [[0, 0.25], 0.1, 0.5], Sword_Regular_B: [[0, 0.25], 0.1, 0.5],
  Sword_Regular_C: [[0, 0.9], 0.1, 0.55], Kick_Breach: [[0, 0.35], 0.15, 0.45], Hit_Knockback: [[0, -0.8], 0, 0.6],
};
const ease = (t) => t * t * (3 - 2 * t);

// knife combo: clip, impact time (fraction), damage, reach
const COMBO = [
  { clip: 'Sword_Regular_A', hit: 0.5, dmg: 1, reach: 1.7 },
  { clip: 'Sword_Regular_B', hit: 0.5, dmg: 1, reach: 1.7 },
  { clip: 'Sword_Regular_C', hit: 0.42, dmg: 2, reach: 2.1, heavy: true },
];

export class Player {
  constructor(gltf, scene, ctx) {
    this.ctx = ctx; // { input, cam, arena, effects, dummies, hud }
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.model.position.y = LIFT;
    this.root.add(this.model);
    scene.add(this.root);
    this.model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.holsterGrip = this.model.getObjectByName('Pistol_Grip');

    // ---- clips
    this.mixer = new THREE.AnimationMixer(this.model);
    this.motion = {};
    this.clips = {};
    const rootBone = this.bones.root;
    for (let c of gltf.animations) {
      c = stripScale(c);
      const turn = c.name.startsWith('Turn_');
      const r = extractRootMotion(c, rootBone, turn ? 0.05 : 0.18);
      this.clips[c.name] = r.clip;
      if (r.motion) this.motion[c.name] = r.motion;
      if (turn) this.motion[c.name] = { ...(r.motion || {}), yaw: this.extractYaw(r, rootBone) };
    }
    this.actions = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const a = this.mixer.clipAction(clip);
      if (!LOOPS.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[name] = a;
    }
    // upper-body pistol layer and lower-body legs for moving while aiming
    this.upper = {};
    for (const n of ['Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down', 'Pistol_Reload', 'Pistol_Idle']) {
      const a = this.mixer.clipAction(splitClip(this.clips[n], 'upper'));
      if (n === 'Pistol_Reload') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.upper[n] = a;
    }
    this.lower = {};
    for (const n of ['Idle_A', 'Walk', 'Walk_Backwards', 'Strafe_left', 'Strafe_right', 'Crouch_Idle', 'Crouch_Walk']) {
      this.lower[n] = this.mixer.clipAction(splitClip(this.clips[n], 'lower'));
    }

    this.attachWeapons(); // needs the bind pose, so before anything poses the skeleton
    this.measureSpeeds();

    // ---- state
    this.pos = this.root.position;
    this.pos.copy(ctx.arena.spawn);
    this.yaw = Math.PI; // face into the warehouse
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.onGround = true;
    this.state = 'loco';
    this.locoClip = null;
    this.crouch = false;
    this.walkMode = false;
    this.aiming = false;
    this.ammo = 12;
    this.comboStep = -1;
    this.queued = false;
    this.knifeTimer = 0;
    this.recoil = 0;
    this.invuln = 0;
    this.stepPhase = 0;
    this.curSpeed = 0;
    this.base = null; // current full-body action
    this.play('Idle_A');
  }

  extractYaw(r, rootBone) {
    // yaw of the pelvis over time in model space, removed from the clip so
    // the controller can turn the whole character instead
    const clip = r.clip;
    const tr = clip.tracks.find((t) => t.name === 'pelvis.quaternion');
    if (!tr) return null;
    rootBone.updateWorldMatrix(true, false);
    const rq = new THREE.Quaternion();
    rootBone.getWorldQuaternion(rq);
    const rqi = rq.clone().invert();
    const q = new THREE.Quaternion(), f = new THREE.Vector3();
    const n = tr.times.length, yaws = new Float32Array(n);
    let y0 = 0;
    const vals = tr.values.slice();
    for (let i = 0; i < n; i++) {
      q.fromArray(tr.values, i * 4).premultiply(rq);
      f.set(0, 0, 1).applyQuaternion(q);
      // pelvis "forward" in model space: use the projected z axis of the bone frame
      const y = Math.atan2(f.x, f.z);
      if (i === 0) y0 = y;
      let d = y - y0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (i > 0) { // unwrap
        let prev = yaws[i - 1];
        while (d - prev > Math.PI) d -= 2 * Math.PI;
        while (d - prev < -Math.PI) d += 2 * Math.PI;
      }
      yaws[i] = d;
      const unYaw = new THREE.Quaternion().setFromAxisAngle(UP, -d);
      q.premultiply(unYaw).premultiply(rqi);
      q.toArray(vals, i * 4);
    }
    const fixed = new THREE.QuaternionKeyframeTrack(tr.name, tr.times, vals);
    clip.tracks = clip.tracks.map((t) => (t === tr ? fixed : t));
    return { times: tr.times, yaw: yaws };
  }

  // ground speed of each in-place locomotion clip: while a foot is planted
  // it slides backward (against the travel direction) at the ground speed
  measureSpeeds() {
    this.speeds = {};
    const travel = {
      Walk: [0, 1], Jog: [0, 1], Sprint: [0, 1], Crouch_Walk: [0, 1], Run_Stealth: [0, 1], Walk_Stealth: [0, 1],
      Walk_Backwards: [0, -1], Strafe_left: [1, 0], Strafe_right: [-1, 0],
    };
    const feet = [this.bones.foot_l, this.bones.foot_r];
    const p = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    for (const [name, [tx, tz]] of Object.entries(travel)) {
      const a = this.actions[name];
      if (!a) continue;
      a.reset().play();
      a.setEffectiveWeight(1);
      const dur = a.getClip().duration, N = 90, dt = dur / N;
      const pos = [[], []];
      for (let i = 0; i <= N; i++) {
        this.mixer.setTime(i * dt);
        this.model.updateMatrixWorld(true);
        inv.copy(this.model.matrixWorld).invert();
        feet.forEach((f, k) => { f.getWorldPosition(p).applyMatrix4(inv); pos[k].push(p.clone()); });
      }
      a.stop();
      const v = [];
      for (const fp of pos) {
        const ys = fp.map((q) => q.y), lo = Math.min(...ys), hi = Math.max(...ys);
        for (let i = 1; i <= N; i++) {
          if (fp[i].y > lo + (hi - lo) * 0.35) continue; // only the planted part of the cycle
          const back = -((fp[i].x - fp[i - 1].x) * tx + (fp[i].z - fp[i - 1].z) * tz) / dt;
          if (back > 0) v.push(back);
        }
      }
      v.sort((x, y) => x - y);
      this.speeds[name] = v.length ? v[Math.floor(v.length * 0.6)] : 1.5;
    }
    this.mixer.setTime(0);
  }

  attachWeapons() {
    this.model.updateMatrixWorld(true);
    const wp = (n) => this.bones[n].getWorldPosition(new THREE.Vector3());
    const hand = wp('hand_r'), mid = wp('middle_01_r'), idx = wp('index_01_r'), pinky = wp('pinky_01_r');
    const fingers = mid.clone().sub(hand).normalize();
    const thumbSide = idx.clone().sub(pinky).normalize();
    const palm = new THREE.Vector3().crossVectors(fingers, thumbSide).normalize();
    // palm should point down in the T-pose; flip if the cross product disagrees
    if (palm.y > 0) palm.negate();
    const fist = hand.clone().addScaledVector(fingers, 0.075).addScaledVector(palm, 0.025);
    const attach = (obj, x, y, z, at) => {
      const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(at);
      const inv = this.bones.hand_r.matrixWorld.clone().invert();
      m.premultiply(inv);
      m.decompose(obj.position, obj.quaternion, obj.scale);
      this.bones.hand_r.add(obj);
    };
    // knife: blade out of the thumb side of the fist, edge toward the fingers
    this.knife = makeKnife();
    {
      const y = thumbSide.clone();
      const x = fingers.clone().addScaledVector(y, -fingers.dot(y)).normalize();
      const z = new THREE.Vector3().crossVectors(x, y);
      attach(this.knife, x, y, z, fist);
    }
    // pistol: barrel along the fingers, grip into the palm, top on the thumb side
    this.pistol = makePistol();
    {
      const z = fingers.clone();
      const y = thumbSide.clone().addScaledVector(z, -thumbSide.dot(z)).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      attach(this.pistol, x, y, z, fist.clone().addScaledVector(thumbSide, -0.01));
    }
    this.knife.visible = false;
    this.pistol.visible = false;
  }

  // ---------------------------------------------------------------- anim
  play(name, { fade = FADE, speed = 1, from = 0 } = {}) {
    const a = this.actions[name];
    if (!a) return null;
    if (this.base === a) { a.timeScale = speed; return a; }
    a.reset();
    a.time = from * a.getClip().duration;
    a.timeScale = speed;
    a.setEffectiveWeight(1);
    a.play();
    if (this.base) a.crossFadeFrom(this.base, fade, false);
    else a.fadeIn(fade);
    this.base = a;
    this.baseName = name;
    this.motionPrev = null;
    return a;
  }

  setLayer(layer, name, weight, fade = 0.15) {
    // layer: dict of actions; makes `name` the active one at `weight`
    for (const [n, a] of Object.entries(layer)) {
      const target = n === name ? weight : 0;
      if (target > 0 && !a.isRunning()) { a.reset().play(); a.setEffectiveWeight(0); }
      const w = a.getEffectiveWeight();
      a.setEffectiveWeight(w + (target - w) * Math.min(1, (1 / fade) * this.dt));
      if (target === 0 && a.getEffectiveWeight() < 0.01 && a.isRunning()) a.stop();
    }
  }

  stopLayer(layer) {
    for (const a of Object.values(layer)) if (a.isRunning()) { a.stop(); a.setEffectiveWeight(0); }
  }

  // one-shot full body action with optional root motion
  action(name, { fade = 0.12, onEnd = null, hits = null, speed = 1, lock = true } = {}) {
    const a = this.play(name, { fade, speed });
    if (!a) return;
    this.state = 'action';
    this.act = { name, a, onEnd, hits: hits ? hits.map((h) => ({ ...h, done: false })) : [], lock };
    this.motionPrev = null;
    this.travelPrev = 0;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.dt = dt;
    const { input, cam } = this.ctx;
    const mv = input.move();
    const moving = Math.hypot(mv.x, mv.y) > 0.1;
    // camera-relative direction
    const fwd = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dir = new THREE.Vector3().addScaledVector(right, mv.x).addScaledVector(fwd, mv.y);
    if (dir.lengthSq() > 1e-4) dir.normalize();

    if (input.hit('KeyC') || input.hit('pad:crouch')) this.crouch = !this.crouch;
    if (input.hit('KeyX')) this.walkMode = !this.walkMode;
    if (input.hit('KeyG')) this.aimToggle = !this.aimToggle;
    const wantAim = input.aim || this.aimToggle;
    this.invuln = Math.max(0, this.invuln - dt);
    this.knifeTimer = Math.max(0, this.knifeTimer - dt);
    if (this.state !== 'action' || this.act?.name?.startsWith('Sword')) this.knife.visible = this.knifeTimer > 0;

    if (this.state === 'action') {
      this.updateAction(dt, input, dir, moving);
    } else if (!this.onGround) {
      this.updateAir(dt, dir, moving);
    } else if (wantAim) {
      this.updateAim(dt, input, dir, moving, mv);
    } else {
      if (this.aiming) this.holster();
      this.updateLoco(dt, input, dir, moving, mv);
    }

    // gravity / ground
    const g = groundAt(this.ctx.arena.colliders, this.pos.x, this.pos.z, this.pos.y);
    if (!this.onGround) {
      this.vy -= 18 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g && this.vy <= 0) {
        this.pos.y = g; this.onGround = true; this.vy = 0;
        sfx.land();
        if (this.state !== 'action') this.action('Jump_Land', { fade: 0.08, speed: 1.6, lock: false });
        this.landT = 0.35;
      }
    } else if (this.pos.y > g + 0.05) {
      this.onGround = false; this.vy = 0; // walked off an edge
      if (this.state !== 'action') this.play('Jump_air', { fade: 0.25 });
    } else {
      this.pos.y = g;
    }
    // collisions
    collide(this.ctx.arena.colliders, this.pos, 0.32);
    const b = this.ctx.arena.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
    for (const d of this.ctx.dummies.list) {
      if (d.dead) continue;
      const dx = this.pos.x - d.root.position.x, dz = this.pos.z - d.root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.62 && dist > 1e-4) { this.pos.x += (dx / dist) * (0.62 - dist); this.pos.z += (dz / dist) * (0.62 - dist); }
    }

    this.root.rotation.y = this.yaw;
    this.mixer.update(dt);
    this.postProcessPose(dt);
  }

  updateLoco(dt, input, dir, moving, mv) {
    // actions
    if (input.mouse.leftPressed || input.hit('pad:attack')) return this.startCombo();
    if (input.hit('KeyF', 'pad:kick')) return this.kick();
    if (input.hit('KeyE', 'pad:roll')) return this.dodge(dir, moving, mv);
    if (input.hit('Space', 'pad:jump')) return this.jump(dir, moving);
    if ((input.hit('KeyQ', 'pad:turnL') || input.hit('pad:turnR')) && !moving) {
      return this.turn(input.hit('pad:turnR') ? 'Turn_Right_180' : 'Turn_Left_180', Math.PI);
    }
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    let clip, speed;
    if (!moving) {
      clip = this.crouch ? 'Crouch_Idle' : 'Idle_A';
      speed = 0;
    } else if (this.crouch) {
      const run = input.sprint;
      clip = run ? 'Run_Stealth' : 'Crouch_Walk';
      speed = run ? 4.2 : 1.05;
    } else if (input.sprint) {
      clip = 'Sprint'; speed = 6.4;
    } else if (this.walkMode || mag < 0.55) {
      clip = 'Walk'; speed = 1.25;
    } else {
      clip = 'Jog'; speed = 4.0;
    }
    // turn toward the move direction (quick 180 from a standstill)
    if (moving) {
      const target = Math.atan2(dir.x, dir.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) > 2.6 && this.curSpeed < 0.5 && !this.crouch) {
        return this.turn(d > 0 ? 'Turn_Left_180' : 'Turn_Right_180', d);
      }
      const rate = clip === 'Sprint' ? 6 : 11;
      this.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    }
    this.curSpeed = THREE.MathUtils.damp(this.curSpeed || 0, speed, 8, dt);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.addScaledVector(fwd, this.curSpeed * dt);
    const rate = speed > 0 && this.speeds[clip] ? this.curSpeed / this.speeds[clip] : 1;
    this.play(clip, { speed: THREE.MathUtils.clamp(rate, 0.6, 1.7), fade: 0.22 });
    this.footsteps(dt, this.curSpeed, clip);
  }

  footsteps(dt, speed, clip) {
    if (speed < 0.3) return;
    const a = this.base;
    const dur = a.getClip().duration;
    const ph = (a.time / dur) * 2 % 1; // two steps per cycle
    if (this.stepPhase > ph) sfx.step(this.crouch || clip === 'Walk');
    this.stepPhase = ph;
  }

  updateAim(dt, input, dir, moving, mv) {
    if (!this.aiming) this.draw();
    const cam = this.ctx.cam;
    // face the camera direction
    let d = cam.yaw - this.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    this.yaw += THREE.MathUtils.clamp(d, -14 * dt, 14 * dt);
    // legs: strafe / walk / back, upper: aim pose blended by pitch
    let leg = 'Idle_A';
    if (moving) {
      if (Math.abs(mv.x) > Math.abs(mv.y)) leg = mv.x > 0 ? 'Strafe_right' : 'Strafe_left';
      else leg = mv.y > 0 ? 'Walk' : 'Walk_Backwards';
      if (this.crouch && leg === 'Walk') leg = 'Crouch_Walk';
    } else if (this.crouch) leg = 'Crouch_Idle';
    const speed = moving ? (this.crouch ? 0.9 : 1.15) : 0;
    this.pos.addScaledVector(dir, speed * dt);
    if (this.base) { this.base.fadeOut(0.15); this.base = null; }
    this.setLayer(this.lower, leg, 1);
    const L = this.lower[leg];
    if (moving && this.speeds[leg]) L.timeScale = THREE.MathUtils.clamp(speed / this.speeds[leg], 0.6, 1.8);
    const reloading = this.upper.Pistol_Reload.isRunning() && this.upper.Pistol_Reload.time < this.upper.Pistol_Reload.getClip().duration - 0.05;
    const p = cam.pitch; // + looking down
    const up = Math.max(0, -p / 0.7), down = Math.max(0, p / 0.7);
    if (reloading) {
      this.setLayer(this.upper, 'Pistol_Reload', 1);
    } else {
      if (this.upper.Pistol_Reload.isRunning()) this.upper.Pistol_Reload.stop();
      for (const [n, w] of [['Pistol_Aim_Up', Math.min(1, up)], ['Pistol_Aim_Down', Math.min(1, down)],
        ['Pistol_Aim_Neutral', 1 - Math.min(1, up + down)]]) {
        const a = this.upper[n];
        if (!a.isRunning()) a.reset().play();
        a.setEffectiveWeight(w);
      }
      this.upper.Pistol_Idle.stop();
    }
    if ((input.mouse.leftPressed || input.hit('pad:fire')) && !reloading) this.fire();
    if (input.hit('KeyR', 'pad:reload') && !reloading && this.ammo < 12) this.reload();
    if (input.hit('KeyE', 'pad:roll')) { this.holster(); return this.dodge(dir, moving, mv); }
  }

  draw() {
    this.aiming = true;
    this.state = 'aim';
    this.pistol.visible = true;
    if (this.holsterGrip) this.holsterGrip.visible = false;
    this.knife.visible = false; this.knifeTimer = 0;
    sfx.draw();
  }

  holster() {
    this.aiming = false;
    this.state = 'loco';
    this.pistol.visible = false;
    if (this.holsterGrip) this.holsterGrip.visible = true;
    this.stopLayer(this.upper);
    this.stopLayer(this.lower);
    this.base = null;
    this.play('Idle_A', { fade: 0.2 });
    sfx.draw();
  }

  fire() {
    if (this.ammo <= 0) { sfx.click(); return; }
    this.ammo--;
    this.recoil = 1;
    sfx.shot();
    const { cam, effects } = this.ctx;
    const muzzle = this.pistol.userData.muzzle.getWorldPosition(new THREE.Vector3());
    effects.muzzle(muzzle);
    cam.shake(0.12);
    // aim ray from the camera centre; the bullet travels from the muzzle to what it hits
    const ray = new THREE.Ray(cam.camera.position.clone(), cam.camera.getWorldDirection(new THREE.Vector3()));
    let best = 60, hitN = new THREE.Vector3(0, 1, 0), target = null, part = null;
    for (const b of this.ctx.arena.colliders) {
      const p = ray.intersectBox(b, new THREE.Vector3());
      if (p) {
        const d = p.distanceTo(ray.origin);
        if (d < best && d > 0.5) { best = d; hitN = boxNormal(b, p); }
      }
    }
    const floorT = ray.direction.y < 0 ? -ray.origin.y / ray.direction.y : Infinity;
    if (floorT < best) { best = floorT; hitN = new THREE.Vector3(0, 1, 0); }
    const dh = this.ctx.dummies.raycast(ray, best);
    if (dh) { best = dh.dist; target = dh.dummy; part = dh.part; }
    const hit = ray.at(best, new THREE.Vector3());
    effects.tracer(muzzle, hit);
    if (target) {
      target.damage(part === 'head' ? 3 : 1, this.pos, part === 'head' ? 'Hit_Head' : 'Hit_Chest');
      effects.sparks(hit, ray.direction.clone().negate(), 0x8a1010, 10);
    } else {
      effects.sparks(hit, hitN, 0xffc070, 12);
    }
  }

  reload() {
    sfx.click();
    setTimeout(() => sfx.click(), 700);
    setTimeout(() => sfx.click(), 1500);
    this.upper.Pistol_Reload.reset().play();
    this.upper.Pistol_Reload.setEffectiveWeight(1);
    for (const n of ['Pistol_Aim_Up', 'Pistol_Aim_Down', 'Pistol_Aim_Neutral']) this.upper[n].setEffectiveWeight(0);
    this.reloadEnd = setTimeout(() => { this.ammo = 12; }, 1800);
  }

  startCombo() {
    this.comboStep = 0;
    this.queued = false;
    this.knife.visible = true;
    this.knifeTimer = 3;
    this.doComboStep();
  }

  doComboStep() {
    const c = COMBO[this.comboStep];
    this.faceNearest(2.6);
    sfx.swish();
    this.action(c.clip, {
      fade: 0.08,
      speed: 1.15,
      hits: [{ t: c.hit, fn: () => this.meleeHit(c.dmg, c.reach, c.heavy ? 'Hit_Knockback' : (this.comboStep === 1 ? 'Hit_Head' : 'Hit_Chest')) }],
      onEnd: () => {
        if (this.queued && this.comboStep < COMBO.length - 1) {
          this.comboStep++; this.queued = false; this.doComboStep();
        } else {
          this.comboStep = -1;
          this.state = 'loco';
          this.play(this.crouch ? 'Crouch_Idle' : 'Idle_A', { fade: 0.3 });
        }
      },
    });
  }

  kick() {
    this.faceNearest(2.6);
    this.action('Kick_Breach', {
      hits: [{ t: 0.36, fn: () => this.meleeHit(2, 1.9, 'Hit_Knockback') }],
      onEnd: () => { this.state = 'loco'; this.play('Idle_A', { fade: 0.3 }); },
    });
  }

  dodge(dir, moving, mv) {
    let clip = 'Dodge_back';
    if (moving) {
      // roll toward the input direction; sideways input -> side dodge
      const target = Math.atan2(dir.x, dir.z);
      if (Math.abs(mv.x) > Math.abs(mv.y) * 1.3 && !this.crouch) {
        clip = mv.x > 0 ? 'Dodge_right' : 'Dodge_left';
        this.yaw = this.ctx.cam.yaw;
      } else if (mv.y < -0.5) {
        clip = 'Dodge_back';
        this.yaw = this.ctx.cam.yaw;
      } else {
        clip = 'Roll';
        this.yaw = target;
      }
    }
    this.invuln = 0.6;
    sfx.whoosh();
    this.action(clip, { fade: 0.08, speed: clip === 'Roll' ? 1.35 : 1.1, onEnd: () => { this.state = 'loco'; this.play('Idle_A', { fade: 0.25 }); } });
  }

  jump(dir, moving) {
    this.vy = 6.2;
    this.onGround = false;
    this.airDir = moving ? dir.clone().multiplyScalar(Math.max(2.2, this.curSpeed || 0)) : new THREE.Vector3();
    this.play('Jump_air', { fade: 0.1, from: 0.1 });
    sfx.whoosh();
  }

  updateAir(dt, dir, moving) {
    if (moving) {
      this.airDir.lerp(dir.clone().multiplyScalar(Math.max(2.2, this.airDir.length())), 2 * dt);
      const target = Math.atan2(dir.x, dir.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.yaw += THREE.MathUtils.clamp(d, -6 * dt, 6 * dt);
    }
    if (this.airDir) this.pos.addScaledVector(this.airDir, dt);
  }

  turn(clip, delta) {
    this.turnDelta = delta;
    this.action(clip, { fade: 0.12, speed: 1.4, onEnd: () => { this.state = 'loco'; this.play('Idle_A', { fade: 0.2 }); } });
  }

  updateAction(dt, input, dir) {
    const { a, hits, onEnd } = this.act;
    if (this.act.name.startsWith('Sword') && (input.mouse.leftPressed || input.hit('pad:attack')) && a.time > a.getClip().duration * 0.25) this.queued = true;
    const dur = a.getClip().duration;
    const t = Math.min(a.time + dt * a.timeScale, dur); // time after this frame's mixer update
    for (const h of hits) if (!h.done && t >= h.t * dur) { h.done = true; h.fn(); }
    // root motion
    const m = this.motion[this.act.name];
    if (m) {
      if (m.x) {
        const [x, z] = sampleMotion(m, t);
        if (this.motionPrev) {
          const dx = x - this.motionPrev[0], dz = z - this.motionPrev[1];
          const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
          this.pos.x += dx * c + dz * s;
          this.pos.z += -dx * s + dz * c;
        }
        this.motionPrev = [x, z];
      }
      if (m.yaw) {
        const yw = interp(m.yaw.times, m.yaw.yaw, t);
        if (this.yawPrev !== undefined) this.yaw += yw - this.yawPrev;
        this.yawPrev = yw;
      }
    }
    const tv = TRAVEL[this.act.name];
    if (tv) {
      const [[tx, tz], t0, t1] = tv;
      const f = ease(THREE.MathUtils.clamp((t / dur - t0) / (t1 - t0), 0, 1));
      let df = f - (this.travelPrev || 0);
      this.travelPrev = f;
      // attacks stop at the enemy instead of passing through him
      if (tz > 0 && !this.act.name.startsWith('Roll') && this.ctx.dummies.nearest(this.pos, 0.85, this.yaw)) df = 0;
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      this.pos.x += (tx * c + tz * s) * df;
      this.pos.z += (-tx * s + tz * c) * df;
    }
    if (this.act.name === 'Jump_Land' && input.move && Math.hypot(input.move().x, input.move().y) > 0.1 && a.time > 0.15) {
      this.state = 'loco'; this.yawPrev = undefined; return;
    }
    if (t >= dur - 1e-3 || (this.act.name.startsWith('Sword') && this.queued && t > dur * 0.62)) {
      this.yawPrev = undefined;
      this.state = 'loco';
      const fn = onEnd;
      this.act = null;
      if (fn) fn(); else this.play('Idle_A', { fade: 0.25 });
    }
  }

  faceNearest(range) {
    const d = this.ctx.dummies.nearest(this.pos, range, this.yaw);
    if (d) this.yaw = Math.atan2(d.root.position.x - this.pos.x, d.root.position.z - this.pos.z);
  }

  meleeHit(dmg, reach, reaction) {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let any = false;
    for (const d of this.ctx.dummies.list) {
      if (d.dead) continue;
      const to = d.root.position.clone().sub(this.pos); to.y = 0;
      const dist = to.length();
      if (dist < reach && to.normalize().dot(fwd) > 0.35) {
        d.damage(dmg, this.pos, reaction);
        any = true;
        const p = d.root.position.clone(); p.y = 1.25;
        this.ctx.effects.sparks(p, fwd.clone().negate(), 0x8a1010, 12);
      }
    }
    if (any) { sfx.hit(dmg > 1); this.ctx.cam.shake(dmg > 1 ? 0.18 : 0.08); this.ctx.hitstop?.(dmg > 1 ? 0.09 : 0.05); }
  }

  // called by a dummy's punch
  takeHit(from) {
    if (this.invuln > 0 || this.state === 'action' && this.act?.name?.startsWith('Dodge')) return false;
    if (this.aiming) this.holster();
    this.yaw = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
    sfx.hit(false);
    this.ctx.cam.shake(0.15);
    this.action(Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head', { fade: 0.06, onEnd: () => { this.state = 'loco'; this.play('Idle_A', { fade: 0.25 }); } });
    this.invuln = 0.8;
    return true;
  }

  postProcessPose(dt) {
    // pistol recoil: kick the forearm/hand up after each shot
    if (this.recoil > 0 && this.aiming) {
      const k = this.recoil;
      this.bones.lowerarm_r.rotateX(-0.25 * k);
      this.bones.hand_r.rotateX(-0.35 * k);
      this.recoil = Math.max(0, this.recoil - dt * 9);
    }
  }
}

function interp(times, vals, t) {
  if (t <= times[0]) return vals[0];
  const n = times.length - 1;
  if (t >= times[n]) return vals[n];
  let i = 1;
  while (times[i] < t) i++;
  const f = (t - times[i - 1]) / (times[i] - times[i - 1]);
  return vals[i - 1] + (vals[i] - vals[i - 1]) * f;
}

function boxNormal(b, p) {
  const e = 1e-3;
  if (Math.abs(p.x - b.min.x) < e) return new THREE.Vector3(-1, 0, 0);
  if (Math.abs(p.x - b.max.x) < e) return new THREE.Vector3(1, 0, 0);
  if (Math.abs(p.z - b.min.z) < e) return new THREE.Vector3(0, 0, -1);
  if (Math.abs(p.z - b.max.z) < e) return new THREE.Vector3(0, 0, 1);
  if (Math.abs(p.y - b.max.y) < e) return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, -1, 0);
}
