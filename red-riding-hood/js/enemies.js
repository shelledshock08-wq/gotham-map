// PLACEHOLDER enemies for the combat test (Mesh2Motion CC0 mannequin, tinted
// per type). Four types with their own move sets, an attack-token director,
// parry/dodge rules in the Metal Gear Rising style, reactions, deaths, waves.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { extractRootMotion, stripScale, strikeTimes } from './anim.js';
import { attachToHand, makeMachete, makePistol } from './weapons.js';
import { bakeObject } from './slicer.js';
import { collide, groundAt } from './arena.js';
import { sfx } from './sfx.js';

const RED = 0xff2a1a, YELLOW = 0xffd23a;

// attack moves: clip, playback speed, damage, reach, parryable (red glint)
// or not (yellow: dodge it), reaction on Jason, lunge distance
const ATTACKS = {
  jab: { clip: 'Fighting Left Jab', speed: 1.6, dmg: 6, range: 1.7, parry: true },
  cross: { clip: 'Punch_Cross', speed: 1.5, dmg: 8, range: 1.8, parry: true },
  hook: { clip: 'Melee_Hook', speed: 1.5, dmg: 11, range: 2.0, parry: true, lunge: 1.2 },
  kick: { clip: 'Kick_Breach', speed: 1.5, dmg: 12, range: 2.0, parry: true, react: 'knockdown' },
  shove: { clip: 'Push', speed: 1.6, dmg: 5, range: 1.7, parry: true, react: 'knockdown' },
  slashA: { clip: 'Sword_Regular_A', speed: 1.4, dmg: 12, range: 2.3, parry: true },
  slashB: { clip: 'Sword_Regular_B', speed: 1.4, dmg: 12, range: 2.3, parry: true },
  slashC: { clip: 'Sword_Regular_C', speed: 1.3, dmg: 16, range: 2.5, parry: true, lunge: 1.8 },
  overhead: { clip: 'Sword_Attack', speed: 1.25, dmg: 22, range: 2.5, parry: false, react: 'knockdown', hits: 2 },
  lunge: { clip: 'Sword_Dash_RM', speed: 1.4, dmg: 15, range: 2.2, parry: true, lunge: 4.5 },
  shoot: { clip: 'Pistol_Shoot', speed: 1.2, ranged: true, parry: true, dmg: 8 },
  pound: { clip: 'Attack_Ground_Pound', speed: 1.15, dmg: 26, aoe: 3.4, parry: false, react: 'knockdown' },
  charge: { clip: 'Shield_Dash_RM', speed: 1.3, dmg: 22, range: 2.3, parry: false, react: 'knockdown', lunge: 7.5 },
  haymaker: { clip: 'Melee_Hook', speed: 1.1, dmg: 20, range: 2.4, parry: true, react: 'knockdown', lunge: 1.5 },
  scratch: { clip: 'Zombie_Scratch', speed: 1.3, dmg: 14, range: 2.2, parry: true },
};

// models: CC0 characters by elbolilloduro (via Mesh2Motion), already rigged
// to the same skeleton as the animations. pelvis = hip height vs the
// mannequin the clips were made on (Mesh2Motion's pelvisPositionScale).
export const VARIANTS = {
  male_6: 1, male_10: 1, male_15: 1, male_32: 1,
  killer_4: 1.02, killer_5: 1.05, killer_6: 1.05,
  swat_male: 1, monster: 1.37,
};

const TYPES = {
  brawler: { hp: 42, run: 6.8, models: ['male_6', 'male_10', 'male_15', 'male_32'], attacks: ['jab', 'cross', 'hook', 'kick', 'shove'], block: 0.2, dodge: 0.12, guard: 'Defend', bp: 100 },
  blade: { hp: 55, run: 7.0, models: ['killer_4', 'killer_5', 'killer_6'], weapon: 'machete', attacks: ['slashA', 'slashB', 'slashC', 'overhead', 'lunge'], block: 0.3, dodge: 0.18, guard: 'Sword_Block', stance: 'Idle_Sword', bp: 150 },
  gunner: { hp: 34, run: 6.2, models: ['swat_male'], weapon: 'pistol', attacks: ['shoot', 'shove'], ranged: true, block: 0.05, dodge: 0.3, guard: 'Defend', bp: 120 },
  brute: { hp: 170, run: 5.2, models: ['monster'], scale: 1.32, attacks: ['pound', 'charge', 'haymaker', 'scratch'], armor: true, block: 0, dodge: 0, guard: 'Defend', bp: 400 },
};

const LOOP = new Set(['Idle_A', 'Fighting Idle', 'Idle_Sword', 'Walk', 'Jog', 'Sprint', 'Strafe_left', 'Strafe_right',
  'Walk_Backwards', 'Dizzy', 'Pistol_Idle', 'Pistol_Aim_Neutral', 'Jump_air', 'Defend']);

const WAVES = [
  ['brawler', 'brawler', 'brawler'],
  ['brawler', 'blade', 'blade', 'brawler'],
  ['blade', 'gunner', 'brawler', 'gunner', 'blade'],
  ['brute', 'blade', 'gunner', 'brawler'],
  ['brute', 'blade', 'blade', 'gunner', 'gunner', 'brawler'],
];

class Enemy {
  constructor(mgr, kind, pos) {
    this.mgr = mgr;
    this.ctx = mgr.ctx;
    this.kind = kind;
    this.T = TYPES[kind];
    this.root = new THREE.Group();
    this.variant = this.T.models[Math.floor(Math.random() * this.T.models.length)];
    this.model = skClone(mgr.models[this.variant].scene);
    this.mat = null;
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone(); // own copy for the hit flash
        o.material.roughness = Math.max(o.material.roughness, 0.6);
        o.material.metalness = 0;
        this.mat = o.material;
      }
    });
    this.root.add(this.model);
    this.root.position.copy(pos);
    this.pos = this.root.position;
    this.ctx.scene.add(this.root);
    // weapon in hand (bind pose, before any animation)
    if (this.T.weapon === 'machete') this.weapon = attachToHand(this.model, makeMachete(), 'blade');
    if (this.T.weapon === 'pistol') this.weapon = attachToHand(this.model, makePistol(), 'gun');
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [name, clip] of Object.entries(mgr.clipsFor(this.variant))) {
      const a = this.mixer.clipAction(clip);
      if (!LOOP.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[name] = a;
    }
    this.hp = this.T.hp;
    this.maxHp = this.T.hp;
    this.poise = 100;
    this.state = 'enter';
    this.cool = 0.8 + Math.random() * 1.2;
    this.vy = 0;
    this.air = false;
    this.push = new THREE.Vector3();
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.stunUsed = false;
    this.play('Sprint');
    this.mixer.update(Math.random());
  }

  get alive() { return this.state !== 'dead' && this.state !== 'gone'; }
  get height() { return 1.7 * (this.T.scale || 1); }

  chest() { return this.pos.clone().add(new THREE.Vector3(0, this.height * 0.7, 0)); }

  play(name, { fade = 0.15, speed = 1, from = 0, restart = false } = {}) {
    const a = this.actions[name];
    if (!a) return null;
    if (this.cur === a && !restart) { a.timeScale = speed; return a; }
    a.reset();
    a.time = from * a.getClip().duration;
    a.timeScale = speed;
    a.setEffectiveWeight(1).play();
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    this.cur = a;
    this.curName = name;
    return a;
  }

  face(target, rate, dt) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let d = want - this.root.rotation.y;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    this.root.rotation.y += rate === Infinity ? d : THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    return Math.abs(d);
  }

  fwd() { return new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)); }

  // ------------------------------------------------------------ being hit
  takeHit({ dmg, react = 'light', from, heavy = false }) {
    if (!this.alive || this.state === 'enter' && this.pos.distanceTo(from) > 30) return 'miss';
    const toPlayer = from.clone().sub(this.pos); toPlayer.y = 0; toPlayer.normalize();
    const facing = this.fwd().dot(toPlayer) > 0.3;
    // guard: blocks light hits it sees coming; heavy hits break the guard,
    // and steady light pressure gets through
    const guarding = this.state === 'guard' && Math.random() < 0.45;
    const raise = ['idle', 'circle'].includes(this.state) && facing && !(this.guardCool > 0) && Math.random() < this.T.block;
    if (guarding || raise) {
      if (heavy) {
        this.flinch('stagger', toPlayer);
        this.mgr.fx.sparks(this.chest(), toPlayer, 0xffe0a0, 20, 5);
        this.ctx.hud.msg('GUARD BREAK', 'gold');
        return 'guardbreak';
      }
      if (this.state !== 'guard') { this.state = 'guard'; this.guardT = 0.55; }
      this.play(this.T.guard, { fade: 0.06, speed: 1.5 });
      this.face(from, Infinity, 0);
      this.mgr.fx.sparks(this.chest().addScaledVector(toPlayer, 0.3), toPlayer, 0xffe0a0, 12, 4);
      sfx.clang();
      return 'blocked';
    }
    this.hp -= dmg;
    this.flashT = 0.08;
    const bloodAt = this.chest().addScaledVector(toPlayer, 0.2);
    this.mgr.fx.bloodBurst(bloodAt, toPlayer.clone().negate(), heavy ? 26 : 12);
    if (this.hp <= 0) { this.die(react, toPlayer, heavy); return 'dead'; }
    // juggle: hits in the air keep him up
    if (this.air) {
      this.vy = Math.max(this.vy, react === 'launch' ? 9 : 2.6);
      this.push.copy(toPlayer).multiplyScalar(-0.4);
      return 'hit';
    }
    // armour: the brute only reacts once his poise breaks
    if (this.T.armor && this.state !== 'stunned') {
      this.poise -= heavy ? 30 : 6;
      if (this.poise <= 0) { this.stun(); return 'hit'; }
      this.mgr.fx.sparks(bloodAt, toPlayer, 0xffffff, 6, 3);
      return 'armor';
    }
    if (!this.stunUsed && this.hp < this.maxHp * 0.3 && this.state !== 'stunned') { this.stun(); return 'hit'; }
    if (this.state === 'stunned') return 'hit';
    this.flinch(react, toPlayer);
    return 'hit';
  }

  flinch(react, toPlayer) {
    this.endAttack();
    this.face(this.pos.clone().add(toPlayer), Infinity, 0);
    if (react === 'launch') {
      this.state = 'air'; this.air = true; this.vy = 10.5; this.launched = true;
      this.play('Hit_Knockback', { fade: 0.05, speed: 0 , from: 0.2 });
      this.cur.timeScale = 0;
      return;
    }
    if (react === 'knockback' || react === 'knockdown') {
      this.state = 'down';
      this.downT = 0;
      this.play('Hit_Knockback', { fade: 0.05, speed: 0.55, restart: true });
      this.push.copy(toPlayer).multiplyScalar(react === 'knockback' ? -7 : -4);
      return;
    }
    this.state = 'hurt';
    const clip = react === 'stagger' ? 'Idle_Shield_Break' : (Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head');
    const a = this.play(clip, { fade: 0.05, speed: react === 'stagger' ? 1.1 : 1.2, restart: true });
    // hitstun long enough to be comboed
    this.hurtT = Math.max(react === 'stagger' ? 0.75 : 0.5, a.getClip().duration / a.timeScale * 0.85);
    this.push.copy(toPlayer).multiplyScalar(react === 'stagger' ? -3 : -1.4);
  }

  stun() {
    this.endAttack();
    this.stunUsed = true;
    this.state = 'stunned';
    this.stunT = 5;
    this.poise = 100;
    this.play('Dizzy', { fade: 0.1, speed: 1.2 });
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.mgr.fx.star, color: 0x9fe0ff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.core.scale.setScalar(0.4);
    this.ctx.scene.add(this.core);
    this.ctx.hud.msg('ZANDATSU READY', 'blue');
  }

  clearCore() { if (this.core) { this.ctx.scene.remove(this.core); this.core = null; } }

  die(react, toPlayer, heavy) {
    this.endAttack();
    this.clearCore();
    this.state = 'dead';
    this.deadT = 0;
    this.mgr.onKill(this);
    sfx.hit(true);
    let clip;
    if (this.air) clip = 'Death_C';
    else if (react === 'knockback' || react === 'launch' || heavy) clip = Math.random() < 0.6 ? 'Death_C' : 'Death_B';
    else clip = ['Death_A', 'Death_B', 'Death_D'][Math.floor(Math.random() * 3)];
    this.play(clip, { fade: 0.08, speed: 1.15, restart: true });
    this.face(this.pos.clone().add(toPlayer), Infinity, 0);
    this.push.copy(toPlayer).multiplyScalar(clip === 'Death_C' ? -5.5 : -2);
    if (this.weapon) this.dropWeapon();
  }

  dropWeapon() {
    const w = this.weapon;
    this.weapon = null;
    const p = w.getWorldPosition(new THREE.Vector3());
    const q = w.getWorldQuaternion(new THREE.Quaternion());
    w.parent.remove(w);
    w.position.copy(p); w.quaternion.copy(q);
    this.ctx.scene.add(w);
    this.mgr.loose.push({ obj: w, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3), spin: 10, t: 0 });
  }

  // Blade Mode: cut the posed body in two along the plane
  slice(plane, zandatsu = false) {
    if (!this.alive && this.state !== 'dead') return false;
    if (this.weapon) this.dropWeapon();
    this.endAttack();
    this.clearCore();
    this.mat.emissive.setHex(0x000000); // no hit flash frozen into the pieces
    const baked = bakeObject(this.model);
    const vel = this.push.clone().add(new THREE.Vector3(0, Math.max(this.vy, 0), 0));
    const pieces = this.mgr.pieces.spawnFromCut(baked, plane, this.mat, { vel, power: zandatsu ? 4 : 3 });
    if (this.state !== 'dead') this.mgr.onKill(this, true);
    this.state = 'gone';
    this.ctx.scene.remove(this.root);
    this.mgr.fx.pool(this.pos.clone().setY(groundAt(this.mgr.arena.colliders, this.pos.x, this.pos.z, this.pos.y + 0.5) + 0.003), 0.5);
    return pieces;
  }

  // ------------------------------------------------------------ attacking
  startAttack(name) {
    const A = ATTACKS[name];
    const a = this.play(A.clip, { fade: 0.08, speed: A.speed, restart: true });
    const dur = a.getClip().duration / A.speed;
    const strikes = this.mgr.strikes[A.clip];
    this.attack = {
      name, A, t: 0, dur,
      impacts: strikes.slice(0, A.hits || 1).map((f) => ({ t: f * dur, done: false })),
      parried: false, perfect: false, glinted: false,
    };
    this.state = 'attack';
    this.face(this.ctx.player.pos, Infinity, 0);
  }

  endAttack() {
    if (this.attack) { this.mgr.release(this); this.attack = null; }
  }

  // time until the next unresolved impact (seconds, world time)
  nextImpact() {
    if (!this.attack) return null;
    const imp = this.attack.impacts.find((i) => !i.done);
    return imp ? imp.t - this.attack.t : null;
  }

  updateAttack(dt) {
    const at = this.attack;
    const P = this.ctx.player;
    at.t += dt;
    const first = at.impacts[0].t;
    // glint ~0.42 s before the first impact: red = parry, yellow = dodge
    if (!at.glinted && at.t >= first - 0.42) {
      at.glinted = true;
      this.mgr.fx.glint(this.model.getObjectByName('head'), new THREE.Vector3(0, 0.15, 0), at.A.parry ? RED : YELLOW);
      sfx.glint(at.A.parry);
    }
    // lunge toward Jason during the wind-up
    if (at.A.lunge && at.t < first) {
      const to = P.pos.clone().sub(this.pos); to.y = 0;
      const dist = to.length();
      if (dist > 1.1) this.pos.addScaledVector(to.normalize(), Math.min(dist - 1.1, (at.A.lunge / first) * dt));
      if (at.A.name !== 'charge') this.face(P.pos, 10, dt);
    } else if (at.t < first - 0.15) {
      this.face(P.pos, 8, dt);
    }
    for (const imp of at.impacts) {
      if (imp.done || at.t < imp.t) continue;
      imp.done = true;
      if (at.A.ranged) { this.mgr.fire(this); continue; }
      if (at.parried) { this.clash(at.perfect); return; }
      const to = P.pos.clone().sub(this.pos); to.y = 0;
      const dist = to.length();
      const reach = at.A.aoe || at.A.range * (this.T.scale || 1);
      const inArc = at.A.aoe || to.normalize().dot(this.fwd()) > 0.35;
      if (at.A.aoe) {
        this.mgr.fx.ring(this.pos.clone(), at.A.aoe, 0xffd23a);
        this.ctx.cam.shake(0.25);
        sfx.hit(true);
      }
      if (dist < reach && inArc && Math.abs(P.pos.y - this.pos.y) < 1.2) {
        P.receiveHit({ dmg: at.A.dmg, react: at.A.react || 'light', from: this.pos.clone() });
      }
    }
    if (at.t >= at.dur * 0.92) {
      this.endAttack();
      this.state = 'idle';
      this.cool = this.T.ranged ? 1.6 + Math.random() * 1.4 : 0.9 + Math.random() * 1.4;
    }
  }

  // Jason parried: sparks at contact, stagger (perfect = stunned + counter)
  clash(perfect) {
    const P = this.ctx.player;
    const mid = this.chest().lerp(P.chest(), 0.5);
    this.mgr.fx.sparks(mid, new THREE.Vector3(0, 1, 0), 0xfff0c0, perfect ? 40 : 24, perfect ? 7 : 5);
    sfx.clang(true);
    this.endAttack();
    if (this.T.armor) {
      this.poise -= perfect ? 60 : 35;
      if (this.poise <= 0) this.stun(); else { this.state = 'idle'; this.cool = 0.9; }
    } else if (perfect && !this.stunUsed) {
      this.stun();
    } else {
      this.flinch('stagger', P.pos.clone().sub(this.pos).setY(0).normalize());
    }
    P.onParry(this, perfect);
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.mixer.update(dt);
    const P = this.ctx.player;
    const colliders = this.mgr.arena.colliders;
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.mat.emissive.setHex(this.flashT > 0 ? 0x2a0606 : 0x000000);
    }
    // momentum from hits
    if (this.push.lengthSq() > 1e-4) {
      this.pos.addScaledVector(this.push, dt);
      this.push.multiplyScalar(Math.max(0, 1 - (this.air ? 1 : 7) * dt));
    }
    // airborne (launched)
    const g = groundAt(colliders, this.pos.x, this.pos.z, this.pos.y + 0.3);
    if (this.air) {
      const juggled = P.airAttacking && P.pos.distanceTo(this.pos) < 3;
      this.vy -= (juggled ? 7 : 24) * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g && this.vy < 0) {
        this.pos.y = g; this.air = false;
        sfx.land();
        this.mgr.fx.ring(this.pos.clone(), 1.2, 0x886655);
        if (this.state === 'dead') { this.play('Death_B', { speed: 1.4, from: 0.45, restart: true }); } else if (this.launched) {
          this.launched = false;
          this.state = 'down'; this.downT = 0;
          this.play('Hit_Knockback', { fade: 0.05, speed: 0.55, from: 0.4, restart: true });
        }
      }
    } else if (this.pos.y > g + 0.05) {
      this.air = true; this.vy = 0;
    } else {
      this.pos.y = g;
    }
    if (this.core) {
      this.core.position.copy(this.chest());
      this.core.material.opacity = 0.6 + 0.4 * Math.sin(performance.now() / 90);
    }

    switch (this.state) {
      case 'enter': {
        // sprint in from the spawn point
        this.face(P.pos, 8, dt);
        this.pos.addScaledVector(this.fwd(), this.T.run * dt);
        this.play('Sprint', { speed: this.T.run / 6.5 });
        if (this.pos.distanceTo(P.pos) < 9 || this.enterT > 6) this.state = 'idle';
        this.enterT = (this.enterT || 0) + dt;
        break;
      }
      case 'idle':
      case 'circle':
        this.think(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'guard':
        this.guardT -= dt;
        if (this.guardT <= 0) { this.state = 'idle'; this.guardCool = 1.6; }
        break;
      case 'hurt':
        this.hurtT -= dt;
        if (this.hurtT <= 0) { this.state = 'idle'; this.cool = Math.min(this.cool, 0.5); }
        break;
      case 'dodge':
        this.dodgeT -= dt;
        this.pos.addScaledVector(this.dodgeV, dt);
        if (this.dodgeT <= 0) this.state = 'idle';
        break;
      case 'down': {
        if (this.air) break;
        this.downT += dt;
        const a = this.cur;
        // lie on the floor a moment, then get up
        if (this.curName === 'Hit_Knockback' && a.time > a.getClip().duration * 0.62 && this.downT < 1.3) a.timeScale = 0;
        else if (this.curName === 'Hit_Knockback') a.timeScale = 0.75;
        if (this.downT > 1.9) { this.state = 'idle'; this.cool = 0.4; }
        break;
      }
      case 'stunned':
        this.stunT -= dt;
        if (this.stunT <= 0) { this.clearCore(); this.state = 'idle'; }
        break;
      case 'dead':
        this.deadT += dt;
        if (this.deadT > 1.4 && !this.pooled) {
          this.pooled = true;
          this.mgr.fx.pool(this.pos.clone().setY(this.pos.y + 0.003), 0.55);
        }
        if (this.deadT > 14) { // sink away
          this.pos.y -= dt * 0.25;
          if (this.deadT > 17) { this.state = 'gone'; this.ctx.scene.remove(this.root); }
        }
        break;
      default:
        break;
    }
    if (this.alive && !this.air) collide(colliders, this.pos, 0.3 * (this.T.scale || 1));
  }

  think(dt) {
    const P = this.ctx.player;
    this.guardCool = (this.guardCool || 0) - dt;
    if (P.state === 'attack' && P.pos.distanceTo(this.pos) < 3 && P.move?.target === this) this.braceT = Math.max(this.braceT || 0, 0.25);
    if (this.braceT > 0) { // Jason is swinging at him: stand and take it
      this.braceT -= dt;
      this.face(P.pos, 8, dt);
      this.play(this.T.stance || 'Fighting Idle');
      return;
    }
    const to = P.pos.clone().sub(this.pos); to.y = 0;
    const dist = to.length();
    to.normalize();
    this.cool -= dt;
    const stance = this.T.stance || 'Fighting Idle';
    if (P.dead) { this.face(P.pos, 4, dt); this.play('Idle_A'); return; }
    if (this.T.ranged) {
      // keep 7-11 m away and shoot
      this.face(P.pos, 8, dt);
      if (dist < 2.6 && this.cool <= 0 && this.mgr.take(this)) return this.startAttack('shove');
      if (dist < 6.5) { this.pos.addScaledVector(to, -this.T.run * 0.7 * dt); this.play('Walk_Backwards', { speed: 1.6 }); }
      else if (dist > 12) { this.pos.addScaledVector(to, this.T.run * dt); this.play('Sprint', { speed: 1 }); }
      else {
        const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.strafeDir);
        this.pos.addScaledVector(side, 2.6 * dt);
        this.play(this.strafeDir > 0 ? 'Strafe_left' : 'Strafe_right', { speed: 1.5 });
        if (Math.random() < dt * 0.4) this.strafeDir *= -1;
      }
      if (this.cool <= 0 && dist >= 2.6 && dist < 16) { this.startAttack('shoot'); this.cool = 2; }
      return;
    }
    this.face(P.pos, 9, dt);
    const reach = 2.0 * (this.T.scale || 1);
    if (dist > 4.5) {
      // close the distance fast
      this.pos.addScaledVector(to, this.T.run * dt);
      this.play(dist > 7 ? 'Sprint' : 'Jog', { speed: dist > 7 ? this.T.run / 6.5 : 1.5 });
      this.state = 'idle';
      return;
    }
    if (this.cool <= 0) {
      const list = this.T.attacks;
      let pick = list[Math.floor(Math.random() * list.length)];
      if (pick === 'charge' && dist < 3) pick = 'haymaker';
      if (pick === 'pound' && dist > 3) pick = 'charge';
      const A = ATTACKS[pick];
      const canHit = dist <= reach + (A.lunge || 0) * 0.8 + (A.aoe ? 1 : 0);
      if (canHit && this.mgr.take(this)) return this.startAttack(pick);
      if (!canHit) {
        // step in to striking distance
        this.pos.addScaledVector(to, this.T.run * 0.8 * dt);
        this.play('Jog', { speed: 1.6 });
        return;
      }
    }
    // circle at a short distance while waiting for a turn
    this.state = 'circle';
    const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.strafeDir);
    const keep = dist < 2.6 ? -1 : dist > 3.6 ? 1 : 0;
    this.pos.addScaledVector(side, 2.4 * dt).addScaledVector(to, keep * 2.5 * dt);
    this.play(keep < 0 ? 'Walk_Backwards' : (this.strafeDir > 0 ? 'Strafe_left' : 'Strafe_right'), { speed: 1.6 });
    if (Math.random() < dt * 0.5) this.strafeDir *= -1;
  }

  // Jason starts an attack on this enemy: some dodge it
  onThreat() {
    if (!['idle', 'circle'].includes(this.state)) return;
    if (Math.random() > this.T.dodge) { this.braceT = 0.6; return; }
    const P = this.ctx.player;
    const away = this.pos.clone().sub(P.pos).setY(0).normalize();
    const sideways = Math.random() < 0.5;
    const clip = sideways ? (Math.random() < 0.5 ? 'Dodge_left' : 'Dodge_right') : 'Dodge_back';
    const a = this.play(clip, { fade: 0.05, speed: 1.6, restart: true });
    this.state = 'dodge';
    this.dodgeT = a.getClip().duration / 1.6 * 0.8;
    const lat = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(clip === 'Dodge_left' ? 1 : -1);
    this.dodgeV = (sideways ? lat : away).multiplyScalar(3.2 / this.dodgeT);
  }
}

export class Enemies {
  // gltf: the animation library (mannequin); models: { variant: gltf }
  constructor(gltf, models, ctx) {
    this.ctx = ctx;
    this.gltf = gltf;
    this.models = models;
    this.variantClips = {};
    this.fx = ctx.fx;
    this.pieces = ctx.pieces;
    this.arena = ctx.arena;
    this.list = [];
    this.loose = [];
    this.bullets = [];
    this.tokens = 0;
    this.wave = 0;
    this.waveT = 2;
    this.kills = 0;
    // shared clips (root motion of the RM clips flattened in place)
    const tmp = skClone(gltf.scene);
    let rootBone = null;
    tmp.traverse((o) => { if (o.isBone && o.name === 'root') rootBone = o; });
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = extractRootMotion(stripScale(c), rootBone, 0.3).clip;
    const mixer = new THREE.AnimationMixer(tmp);
    this.strikes = {};
    for (const A of Object.values(ATTACKS)) {
      if (this.strikes[A.clip]) continue;
      const clip = this.clips[A.clip];
      this.strikes[A.clip] = A.ranged ? [0.12] : strikeTimes(tmp, mixer, clip, { from: 0.15, to: 0.85, count: A.hits || 1, gap: 0.2 });
    }
  }

  // the library clips fitted to one character: rotations only (each model
  // keeps its own proportions), hips scaled to its height
  clipsFor(variant) {
    if (this.variantClips[variant]) return this.variantClips[variant];
    const k = VARIANTS[variant] || 1;
    const out = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const tracks = [];
      for (const t of clip.tracks) {
        if (t.name.endsWith('.quaternion')) tracks.push(t);
        else if (t.name === 'pelvis.position' || t.name === 'root.position') {
          const v = t.values.slice();
          for (let i = 0; i < v.length; i++) v[i] *= k;
          tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
        }
      }
      out[name] = new THREE.AnimationClip(name, clip.duration, tracks);
    }
    this.variantClips[variant] = out;
    return out;
  }

  // attack tokens: at most two melee attackers at once (the brute counts double)
  take(e) {
    if (e.hasToken) return true;
    const cost = e.T.armor ? 2 : 1;
    if (this.tokens + cost > 2) return false;
    this.tokens += cost; e.hasToken = true;
    return true;
  }

  release(e) {
    if (!e.hasToken) return;
    e.hasToken = false;
    this.tokens -= e.T.armor ? 2 : 1;
  }

  get alive() { return this.list.filter((e) => e.alive); }

  spawnWave() {
    const kinds = WAVES[Math.min(this.wave, WAVES.length - 1)].slice();
    if (this.wave >= WAVES.length) for (let i = 0; i < this.wave - WAVES.length + 1; i++) kinds.push(['brawler', 'blade', 'gunner'][i % 3]);
    this.wave++;
    const P = this.ctx.player;
    const spots = this.arena.enemySpawns.slice().sort((a, b) => b.distanceTo(P.pos) - a.distanceTo(P.pos));
    kinds.forEach((k, i) => {
      const p = spots[i % Math.min(4, spots.length)].clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
      this.list.push(new Enemy(this, k, p));
    });
    this.ctx.hud.banner(`WAVE ${this.wave}`);
  }

  onKill(e, sliced = false) {
    this.release(e);
    this.kills++;
    this.ctx.player.onKill(e, sliced);
  }

  // gunner fires: a fast tracer bullet aimed at Jason's chest
  fire(e) {
    const muzzle = e.weapon?.userData.muzzle?.getWorldPosition(new THREE.Vector3()) || e.chest();
    const P = this.ctx.player;
    const target = P.chest().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3));
    const vel = target.sub(muzzle).normalize().multiplyScalar(42);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd6a0 }));
    mesh.position.copy(muzzle);
    mesh.lookAt(muzzle.clone().add(vel));
    this.ctx.scene.add(mesh);
    this.bullets.push({ mesh, vel, owner: e, life: 1.5, deflected: false });
    this.fx.muzzle(muzzle);
    sfx.shot(0.6);
  }

  updateBullets(dt) {
    const P = this.ctx.player;
    for (const b of this.bullets) {
      b.life -= dt;
      const prev = b.mesh.position.clone();
      b.mesh.position.addScaledVector(b.vel, dt);
      if (!b.deflected) {
        // closest approach to Jason's chest this frame
        const seg = new THREE.Line3(prev, b.mesh.position);
        const c = seg.closestPointToPoint(P.chest(), true, new THREE.Vector3());
        if (c.distanceTo(P.chest()) < 0.45) {
          const res = P.receiveBullet(b);
          if (res === 'deflect') {
            b.deflected = true;
            const back = b.owner.alive ? b.owner.chest().sub(b.mesh.position).normalize() : b.vel.clone().negate().normalize();
            b.vel.copy(back.multiplyScalar(55));
            b.mesh.lookAt(b.mesh.position.clone().add(b.vel));
            b.mesh.material.color.setHex(0x9fe0ff);
            this.fx.sparks(b.mesh.position.clone(), back, 0xbfe8ff, 16, 5);
            sfx.clang();
          } else b.life = 0;
        }
      } else if (b.owner.alive && b.mesh.position.distanceTo(b.owner.chest()) < 0.5) {
        b.owner.takeHit({ dmg: 25, react: 'stagger', from: P.pos.clone(), heavy: true });
        b.life = 0;
      }
      for (const box of this.arena.colliders) if (box.containsPoint(b.mesh.position)) { this.fx.sparks(b.mesh.position.clone(), b.vel.clone().negate().normalize(), 0xffc070, 8); b.life = 0; break; }
      if (b.life <= 0) this.ctx.scene.remove(b.mesh);
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  update(dt) {
    for (const e of this.list) e.update(dt);
    // keep them from stacking on each other
    const al = this.alive;
    for (let i = 0; i < al.length; i++) {
      for (let j = i + 1; j < al.length; j++) {
        const a = al[i].pos, b = al[j].pos;
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = 0.75;
        if (d < min && d > 1e-4) { const k = (min - d) / 2 / d; a.x += dx * k; a.z += dz * k; b.x -= dx * k; b.z -= dz * k; }
      }
    }
    this.updateBullets(dt);
    for (const l of this.loose) {
      if (l.t > 2) continue;
      l.t += dt;
      l.vel.y -= 20 * dt;
      l.obj.position.addScaledVector(l.vel, dt);
      l.obj.rotation.x += l.spin * dt;
      if (l.obj.position.y < 0.03) { l.obj.position.y = 0.03; l.vel.multiplyScalar(0.3); l.vel.y = Math.abs(l.vel.y) * 0.3; l.spin *= 0.5; }
    }
    this.list = this.list.filter((e) => e.state !== 'gone' || e.root.parent);
    if (!al.length) {
      this.waveT -= dt;
      if (this.waveT <= 0) { this.spawnWave(); this.waveT = 3; }
    }
  }

  // best target for Jason's attack: in the input direction, else nearest in front
  pick(pos, dir, range) {
    let best = null, score = -Infinity;
    for (const e of this.alive) {
      const to = e.pos.clone().sub(pos); to.y = 0;
      const d = to.length();
      if (d > range) continue;
      const s = to.normalize().dot(dir) * 2 - d / range;
      if (s > score) { score = s; best = e; }
    }
    return best;
  }

  // enemies whose melee attack lands within `window` s, optionally only those
  // Jason is pushing toward
  threats(within) {
    return this.alive.filter((e) => {
      const t = e.nextImpact();
      return e.attack && !e.attack.A.ranged && t !== null && t <= within && t >= -0.03;
    });
  }

  raycast(ray, maxDist) {
    let best = null;
    const s = new THREE.Sphere(), p = new THREE.Vector3();
    for (const e of this.alive) {
      const k = e.T.scale || 1;
      for (const [part, y, r] of [['head', 1.58, 0.13], ['body', 1.2, 0.24], ['body', 0.85, 0.22], ['body', 0.45, 0.2]]) {
        s.center.set(e.pos.x, e.pos.y + y * k, e.pos.z);
        s.radius = r * k;
        if (ray.intersectSphere(s, p)) {
          const dist = p.distanceTo(ray.origin);
          if (dist < maxDist && (!best || dist < best.dist)) best = { dist, enemy: e, part };
        }
      }
    }
    return best;
  }
}
