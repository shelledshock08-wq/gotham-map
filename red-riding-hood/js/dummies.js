// PLACEHOLDER enemies: training dummies (the CC0 Mesh2Motion mannequin) that
// spar, take hits, go down and get back up. Not story characters.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { extractRootMotion } from './anim.js';

const LOOP = new Set(['Idle_A', 'Fighting Idle', 'Walk', 'Jog', 'Dizzy', 'Idle Hurt']);

class Dummy {
  constructor(gltf, scene, pos, idx) {
    this.root = new THREE.Group();
    this.model = skClone(gltf.scene);
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
    this.root.add(this.model);
    this.root.position.copy(pos);
    this.home = pos.clone();
    this.root.rotation.y = Math.PI * (idx % 2 ? 0.2 : -0.1);
    scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.motion = {};
    let rootBone = null;
    this.model.traverse((o) => { if (o.isBone && o.name === 'root') rootBone = o; });
    for (const c0 of gltf.animations) {
      const r = extractRootMotion(c0, rootBone, 0.18);
      const a = this.mixer.clipAction(r.clip);
      if (!LOOP.has(c0.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[c0.name] = a;
      if (r.motion) this.motion[c0.name] = r.motion;
    }
    this.hp = 4;
    this.dead = false;
    this.cool = 1.5 + Math.random() * 2;
    this.sparring = idx < 2; // two of them fight back
    this.busy = 0;
    this.play('Idle_A');
    this.mixer.update(Math.random() * 2);
  }

  play(name, fade = 0.2) {
    const a = this.actions[name];
    if (!a || this.cur === a) return a;
    a.reset().setEffectiveWeight(1).play();
    if (this.cur) a.crossFadeFrom(this.cur, fade, false);
    this.cur = a;
    this.curName = name;
    return a;
  }

  damage(n, from, reaction) {
    if (this.dead) return;
    this.hp -= n;
    this.root.rotation.y = Math.atan2(from.x - this.root.position.x, from.z - this.root.position.z);
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.dead = true;
      this.play(Math.random() < 0.5 ? 'Death_A' : 'Death_B', 0.08);
      this.reviveAt = 5;
      return;
    }
    this.play(reaction || 'Hit_Chest', 0.06).reset();
    this.busy = this.cur.getClip().duration * 0.9;
    // knock back a little
    const away = this.root.position.clone().sub(from); away.y = 0; away.normalize();
    this.push = away.multiplyScalar(reaction === 'Hit_Knockback' ? 2.5 : 0.8);
  }

  update(dt, player) {
    this.mixer.update(dt);
    if (this.push) {
      this.root.position.addScaledVector(this.push, dt);
      this.push.multiplyScalar(Math.max(0, 1 - 6 * dt));
      if (this.push.lengthSq() < 1e-4) this.push = null;
    }
    if (this.dead) {
      this.reviveAt -= dt;
      if (this.reviveAt <= 0 && this.curName !== 'Zombie_Rise') {
        this.play('Zombie_Rise', 0.3);
        this.busy = this.cur.getClip().duration;
      }
      if (this.curName === 'Zombie_Rise') {
        this.busy -= dt;
        if (this.busy <= 0) { this.dead = false; this.hp = 4; this.play('Idle_A', 0.3); }
      }
      return;
    }
    this.busy -= dt;
    if (this.busy > 0) {
      if (this.punch && !this.punch.done && this.cur.time >= this.punch.t) {
        this.punch.done = true;
        const to = player.pos.clone().sub(this.root.position); to.y = 0;
        const f = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
        if (to.length() < 1.45 && to.normalize().dot(f) > 0.5) player.takeHit(this.root.position);
      }
      return;
    }
    const to = player.pos.clone().sub(this.root.position); to.y = 0;
    const dist = to.length();
    if (dist < 6) {
      // turn to face him, square up
      const target = Math.atan2(to.x, to.z);
      let d = target - this.root.rotation.y;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.root.rotation.y += THREE.MathUtils.clamp(d, -3 * dt, 3 * dt);
      if (this.sparring && dist > 1.2 && dist < 4.5) {
        this.play('Walk');
        this.root.position.addScaledVector(to.normalize(), 1.2 * dt);
      } else {
        this.play('Fighting Idle');
      }
      this.cool -= dt;
      if (this.sparring && dist < 1.35 && this.cool <= 0 && Math.abs(d) < 0.5) {
        const n = Math.random() < 0.5 ? 'Punch_Jab' : 'Punch_Cross';
        const a = this.play(n, 0.1);
        a.reset();
        this.busy = a.getClip().duration * 0.95;
        this.punch = { t: a.getClip().duration * 0.38, done: false };
        this.cool = 1.6 + Math.random() * 1.6;
      }
    } else {
      this.play('Idle_A');
    }
  }
}

export class Dummies {
  constructor(gltf, scene, spawns) {
    this.list = spawns.map((p, i) => new Dummy(gltf, scene, p, i));
  }

  update(dt, player, colliders, collide) {
    for (const d of this.list) {
      d.update(dt, player);
      collide(colliders, d.root.position, 0.3);
    }
  }

  nearest(pos, range, yaw) {
    let best = null, bd = range;
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    for (const d of this.list) {
      if (d.dead) continue;
      const to = d.root.position.clone().sub(pos); to.y = 0;
      const dist = to.length();
      if (dist < bd && to.normalize().dot(f) > -0.2) { bd = dist; best = d; }
    }
    return best;
  }

  // bullet test against simple body/head spheres
  raycast(ray, maxDist) {
    let best = null;
    const s = new THREE.Sphere(), p = new THREE.Vector3();
    for (const d of this.list) {
      if (d.dead) continue;
      for (const [part, y, r] of [['head', 1.58, 0.13], ['body', 1.2, 0.24], ['body', 0.85, 0.22], ['body', 0.45, 0.2]]) {
        s.center.set(d.root.position.x, d.root.position.y + y, d.root.position.z);
        s.radius = r;
        if (ray.intersectSphere(s, p)) {
          const dist = p.distanceTo(ray.origin);
          if (dist < maxDist && (!best || dist < best.dist)) best = { dist, dummy: d, part };
        }
      }
    }
    return best;
  }
}
