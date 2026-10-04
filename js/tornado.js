// Sky Chase over the coast: Tails flies the Tornado, Sonic rides the wing.
// A 2D pickup scene, then a third-person 3D shooter where infected birds and
// Zombots board the plane and you split your attention between the pilot
// and the fighter.
'use strict';

const TOR_SCALE = 0.2;           // SADX plane units -> world units (wingspan ~8.8)
const TOR_CHAR = 1.0;            // character height on the plane

// ------------------------------------------------------------------ models
function torPlaneModel() {
  const holder = new THREE.Group();
  const body = new THREE.Group(); holder.add(body);
  let prop = null;
  if (typeof TOR_MODELS !== 'undefined') {
    const T = TOR_MODELS.tornado;
    const build = (parts, into) => {
      for (const p of parts) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(escDecode(p.pos), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(escDecode(p.nor), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(escDecode(p.uv), 2));
        const tex = escModelTex(p.map);
        const m = new THREE.MeshPhongMaterial({ map: tex, side: THREE.DoubleSide, shininess: 30, specular: 0x333333, transparent: p.mat === 's_t1_pera', alphaTest: 0.1 });
        const mesh = new THREE.Mesh(g, m); mesh.name = p.mat; into.add(mesh);
      }
    };
    build(T.body, body);
    prop = new THREE.Group(); prop.position.set(-0.1, 7.7, 8.9); body.add(prop);
    const inner = new THREE.Group(); inner.position.set(0.1, -7.7, -8.9); prop.add(inner);
    build(T.prop, inner);
    body.scale.setScalar(TOR_SCALE);
    body.position.y = -5 * TOR_SCALE;
  } else {
    const red = new THREE.MeshPhongMaterial({ color: 0xc81e1e });
    const f = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3.4), red); f.position.y = 0.6; body.add(f);
    for (const y of [0.3, 1.1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 1), red); w.position.set(0, y, 0.2); body.add(w); }
  }
  return { root: holder, body, prop };
}

function torTailsModel() {
  const holder = new THREE.Group();
  const body = new THREE.Group(); holder.add(body);
  let mixer = null, model = null; const actions = {};
  if (typeof TOR_MODELS !== 'undefined') {
    model = escBuildModel(TOR_MODELS.tails);
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    const k = TOR_CHAR * 0.88 / ((box.max.y - box.min.y) || 1);
    model.root.scale.multiplyScalar(k);
    // the rip's bind pose has the eyelids shut; open them (the clips never touch them)
    model.root.traverse((o) => { if (/^EyelidUp/.test(o.name)) o.rotateZ(/_R$/.test(o.name) ? 1.2 : -1.2); });
    body.add(model.root);
    mixer = new THREE.AnimationMixer(model.root);
    for (const [n, c] of Object.entries(model.clips)) actions[n] = mixer.clipAction(c);
  }
  return { root: holder, body, model, mixer, actions, cur: null };
}

// The Zombots: infected mobians, built like fan OCs on the Sonic (hedgehog)
// and Tails (fox) rigs. The Metal Virus leaves them dull metal in some muted
// colour, with black sclera and red eyes, spikes pushing out of them, and the
// reaching, hunched pose of something that isn't really alive anymore.
const TOR_INFECTED = { skin: 0x5d6b5a, dark: 0x2c332b, glow: 0x7dff4a, purple: 0x8a3cff };
const TOR_ZOMBIE_COLORS = [0x4a5f7a, 0x4f6a52, 0x7a4646, 0x63587a, 0x6f6a52, 0x56676e, 0x7a5a44];
const TOR_ZBASE = {};
const TOR_ZTEX = new Map();

// three's SkinnedMesh.clone() keeps the old skeleton; rebind to the cloned bones
function torCloneRig(root) {
  const c = root.clone(true), bones = {};
  c.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  c.traverse((o) => { if (o.isSkinnedMesh) o.bind(new THREE.Skeleton(o.skeleton.bones.map((b) => (b ? bones[b.name] : undefined)), o.skeleton.boneInverses), o.bindMatrix); });
  return c;
}

function torZombieTex(src, color, eye) {
  const key = (src.name || src.uuid) + ':' + color + ':' + eye;
  if (TOR_ZTEX.has(key)) return TOR_ZTEX.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.flipY = src.flipY;
  const cr = (color >> 16) & 255, cg = (color >> 8) & 255, cb = color & 255;
  const paint = () => {
    const img = src.image; if (!img || !img.width) return false;
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i], gg = a[i + 1], b = a[i + 2];
      const l = (r * 0.3 + gg * 0.55 + b * 0.15) / 255, sat = Math.max(r, gg, b) - Math.min(r, gg, b);
      const n = (Math.random() - 0.5) * 14;
      if (eye) {
        if (l > 0.62 && sat < 70) { a[i] = a[i + 1] = a[i + 2] = 10; }               // the whites go black
        else if (sat > 45) { a[i] = 150 + l * 105; a[i + 1] = 10; a[i + 2] = 14; }   // the iris burns red
        else { a[i] = 30; a[i + 1] = 0; a[i + 2] = 0; }
        continue;
      }
      if (l > 0.78 && sat < 45) { a[i] = cr * 0.45 + 70 + n; a[i + 1] = cg * 0.45 + 70 + n; a[i + 2] = cb * 0.45 + 74 + n; continue; }   // gloves, muzzle
      const k = 0.3 + l * 0.75;
      a[i] = cr * k + n; a[i + 1] = cg * k + n; a[i + 2] = cb * k + n;
    }
    g.putImageData(d, 0, 0); tex.needsUpdate = true; return true;
  };
  let tries = 0;
  const poll = () => { if (!paint() && tries++ < 100) setTimeout(poll, 50); };
  poll();
  TOR_ZTEX.set(key, tex);
  return tex;
}

function torZombieBase(species) {
  if (TOR_ZBASE[species]) return TOR_ZBASE[species];
  let m = null;
  if (species === 'hedgehog' && typeof ESC_MODELS !== 'undefined') {
    m = escBuildModel(ESC_MODELS.sonic);
    if (m.meshes.MouthR) m.meshes.MouthR.visible = false;
    for (const n of ['EyeLidUp1_L', 'EyeLidUp2_L', 'EyeLidUp_C', 'EyeLidUp1_R', 'EyeLidUp2_R']) { const b = m.root.getObjectByName(n); if (b) b.rotateY(-0.55); }   // heavy, half-shut lids
  } else if (typeof TOR_MODELS !== 'undefined') {
    m = escBuildModel(TOR_MODELS.tails);
    m.root.traverse((o) => { if (/^EyelidUp/.test(o.name)) o.rotateZ(/_R$/.test(o.name) ? 0.85 : -0.85); });
  }
  if (!m) return null;
  m.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m.root);
  m.h = (box.max.y - box.min.y) || 1;
  return (TOR_ZBASE[species] = m);
}

function torZombotModel(opts = {}) {
  const holder = new THREE.Group(), body = new THREE.Group(); holder.add(body);
  const species = opts.species || (Math.random() < 0.55 ? 'hedgehog' : 'fox');
  const color = opts.color || TOR_ZOMBIE_COLORS[(Math.random() * TOR_ZOMBIE_COLORS.length) | 0];
  const base = torZombieBase(species);
  const M = { root: holder, body, model: null, species, color };
  if (!base) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshLambertMaterial({ color })); b.position.y = 0.6; body.add(b);
    holder.userData.zombie = M; return holder;
  }
  const root = torCloneRig(base.root);
  const H = opts.height || (species === 'hedgehog' ? 1.05 : 0.95);
  root.scale.multiplyScalar(H / base.h);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material).map((mt) => new THREE.MeshPhongMaterial({
      map: mt.map ? torZombieTex(mt.map, color, /eye/.test(mt.map.name || '')) : null, color: mt.map ? 0xffffff : color,
      shininess: 18, specular: 0x2a2a2a,   // dull, not chrome
    }));
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  body.add(root);
  M.model = { root };
  // spikes forced out through the head, shoulders and back
  holder.updateMatrixWorld(true);
  const spikeMat = new THREE.MeshPhongMaterial({ color: 0x24262a, shininess: 40, specular: 0x555555 });
  const spikeGeo = torZombotModel.spikeGeo || (torZombotModel.spikeGeo = new THREE.ConeGeometry(0.05, 0.26, 6));
  const spike = (boneName, x, y, z, dx, dy, dz, s = 1) => {
    const bone = root.getObjectByName(boneName); if (!bone) return;
    const sp = new THREE.Mesh(spikeGeo, spikeMat);
    sp.position.set(x * H, y * H, z * H); sp.scale.setScalar(s);
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    holder.add(sp); sp.updateMatrixWorld(true); bone.attach(sp);
  };
  spike('Head', 0.06, 0.92, -0.1, 0.3, 0.7, -0.6); spike('Head', -0.07, 0.95, -0.08, -0.4, 0.8, -0.5, 0.8);
  spike('Spine1', 0, 0.62, -0.14, 0, 0.3, -1, 1.2); spike('Spine1', 0.05, 0.54, -0.13, 0.2, 0.1, -1); spike('Spine1', -0.05, 0.7, -0.12, -0.2, 0.4, -1, 0.9);
  spike('Shoulder_L', 0.17, 0.66, -0.03, 1, 0.7, -0.3, 0.8); spike('Shoulder_R', -0.17, 0.66, -0.03, -1, 0.7, -0.3, 0.8);
  holder.userData.zombie = M;
  escLimbPose(M, 'zombie', { k: 1 });
  return holder;
}

function torBirdModel() {
  const holder = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x4a7a8c, emissive: 0x0a140a });
  const metal = new THREE.MeshPhongMaterial({ color: TOR_INFECTED.skin, shininess: 60 });
  const glow = new THREE.MeshBasicMaterial({ color: TOR_INFECTED.glow });
  const beakM = new THREE.MeshLambertMaterial({ color: 0xd9a020 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin); body.scale.set(1, 1.1, 1.2); body.position.y = 0.45; holder.add(body);
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8, 0, Math.PI), metal); plate.position.y = 0.47; plate.rotation.y = -Math.PI / 2; plate.scale.set(1, 1.1, 1.2); holder.add(plate);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin); head.position.set(0, 0.82, 0.12); holder.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 8), beakM); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.8, 0.38); holder.add(beak);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow); e.position.set(s * 0.1, 0.88, 0.3); holder.add(e);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), s < 0 ? skin : metal); w.position.set(s * 0.42, 0.55, -0.02); w.name = s < 0 ? 'wingL' : 'wingR'; holder.add(w);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 5), beakM); leg.position.set(s * 0.1, 0.11, 0); holder.add(leg);
  }
  return holder;
}

// Infected fighter jets: Eggman's interceptors, overgrown with the virus
function torJetModel() {
  const g = new THREE.Group();
  const hull = new THREE.MeshPhongMaterial({ color: 0x59605a, shininess: 50, specular: 0x445544 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23281f });
  const glow = new THREE.MeshBasicMaterial({ color: TOR_INFECTED.glow });
  const red = new THREE.MeshLambertMaterial({ color: 0xa01818 });
  const f = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 4.2, 10), hull); f.rotation.x = Math.PI / 2; g.add(f);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 10), red); nose.rotation.x = Math.PI / 2; nose.position.z = 2.8; g.add(nose);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), glow); cab.scale.set(0.8, 0.6, 1.4); cab.position.set(0, 0.35, 1.0); g.add(cab);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 1.5), hull); wing.position.z = -0.4; g.add(wing);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.9), dark); fin.position.set(s * 0.45, 0.5, -1.7); fin.rotation.z = s * 0.3; g.add(fin);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow); tip.position.set(s * 2.6, 0, -0.4); g.add(tip);
  }
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.4, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x8aff5a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  jet.rotation.x = Math.PI / 2; jet.position.z = -2.8; g.add(jet);
  return g;
}

// Film grain, a vignette and the odd glitch, laid over the whole frame (k = strength)
let TOR_GRAIN = null;
function torDread(ctx, t, k) {
  if (!TOR_GRAIN) {
    TOR_GRAIN = document.createElement('canvas'); TOR_GRAIN.width = TOR_GRAIN.height = 256;
    const g = TOR_GRAIN.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  ctx.save();
  // a few frames where the picture tears sideways
  if (t % 431 < 3 || t % 977 < 2) {
    for (let i = 0; i < 5; i++) {
      const y = (Math.random() * VIEW_H) | 0, h = 6 + (Math.random() * 30 | 0), dx = (Math.random() - 0.5) * 60;
      ctx.drawImage(ctx.canvas, 0, y, VIEW_W, h, dx, y, VIEW_W, h);
    }
    ctx.fillStyle = 'rgba(125,255,74,.06)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.globalAlpha = 0.07 * k; ctx.globalCompositeOperation = 'overlay';
  const ox = (Math.random() * 256) | 0, oy = (Math.random() * 256) | 0;
  for (let x = -ox; x < VIEW_W; x += 256) for (let y = -oy; y < VIEW_H; y += 256) ctx.drawImage(TOR_GRAIN, x, y);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(6,0,4,${0.75 * k})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}

// Special moves on keys 1-5, paid for in rings (cheapest to most expensive)
const TOR_SPECIALS = [
  { name: 'SONIC MISSILE', cost: 10 }, { name: 'FREEZE RAY', cost: 20 }, { name: 'SHIELD RAM', cost: 30 },
  { name: 'AUTOPILOT COMBO', cost: 40 }, { name: 'SUPER SONIC', cost: 50 },
];

// ------------------------------------------------------------------ layout
const TW = {
  wingY: 6.95 * TOR_SCALE,          // top surface of the upper wing (plane space)
  wingX: 4.15,                      // walkable half-span
  wingZ: 0.26,                      // chord centre
  seat: new THREE.Vector3(0, 0.62, -0.42),   // cockpit (the pilot's feet, sunk into the fuselage)
  boxX: 9, boxY0: -3, boxY1: 5.5,         // where the plane can fly
  SKY: 2400, BOARD: 4200,                    // phase lengths (frames)
};

class TornadoStage {
  // from: 'pickup' (cutscene), 'sky' (shooter) or 'board' (the checkpoint)
  constructor(game, from = 'pickup') {
    this.g = game;
    this.t = 0; this.phase = from === 'pickup' ? 'pickup' : 'load';
    this.from = from;
    this.frame = 100; this.hull = 100;           // the wing's integrity and the plane's
    this.active = 'pilot';                       // which seat the player controls
    this.pilot = 'tails';                        // who sits in the cockpit
    this.roleCool = 0; this.tailsStam = 100; this.sonicPilotT = 0;
    this.boost = 100; this.score0 = game.score;
    this.shake = 0; this.flash = 0; this.fade = 0; this.end = null;
    this.cs = { planeX: -420, planeY: 250, sonicX: 780, sonicY: 600, onPlane: false, jumpT: -1, bolts: [], zoms: [], scroll: 0, booms: [] };
    game.time = 0;
    // decode the plane's textures while the 2D scene plays
    if (typeof TOR_MODELS !== 'undefined') for (const p of TOR_MODELS.tornado.body.concat(TOR_MODELS.tornado.prop)) escModelTex(p.map);
    if (from !== 'pickup') this.begin3D(from);
  }

  // ------------------------------------------------------------- 2D pickup
  updatePickup(inp) {
    const g = this.g, t = this.t, C = this.cs;
    if (t === 1) { Sound.stopTrack(); Sound.stopMusic(); g.speech.clear(); }
    if (t > 30 && inp.startPressed) { this.begin3D('sky'); return; }
    // the plane sweeps in low, Sonic hops on, then it climbs
    if (t < 250) { const k = Math.min(1, t / 250); C.planeX = -420 + (C.sonicX - 210 + 420) * (1 - Math.pow(1 - k, 2)); C.planeY = 250 + 270 * Math.sin(k * Math.PI * 0.5); }
    else { const k = Math.min(1, (t - 250) / 120); C.planeX += (560 - C.planeX) * 0.04; C.planeY += (300 + Math.sin(t * 0.05) * 8 - C.planeY) * (0.03 + k * 0.03); }
    if (t > 250) C.scroll += Math.min(14, (t - 250) * 0.08);
    if (t === 150) Sound.playMusic('skychase');
    if (t === 40) g.speech.say('sonic', '...So. How do I get off this island?', { dur: 110, prio: 4 });
    if (t === 160) g.speech.say('tails', 'Sonic! Need a lift?', { dur: 100, prio: 4 });
    if (t === 232) { C.jumpT = 0; Sound.play('jump'); }
    if (C.jumpT >= 0 && !C.onPlane) {
      C.jumpT++;
      const a = this.wingPos2D(), k = Math.min(1, C.jumpT / 26);
      C.jx = C.sonicX + (a.x - C.sonicX) * k; C.jy = C.sonicY + (a.y - C.sonicY) * k - Math.sin(k * Math.PI) * 140;
      if (k >= 1) { C.onPlane = true; Sound.play('skid', { vol: 0.5 }); }
    }
    if (t === 300) g.speech.say('sonic', 'Tails! Perfect timing, buddy.', { dur: 110, prio: 4 });
    if (t === 420) g.speech.say('tails', 'I saw the blast from the Mystic Ruins! What happened in there?', { dur: 140, prio: 4 });
    if (t === 570) g.speech.say('sonic', g.eggChoice === 'kill' ? "Eggman's gone completely batshit insane, and I... he..." : "Eggman's gone completely batshit insane, and—", { dur: 110, prio: 4 });
    if (t >= 650 && t < 700 && t % 8 === 0) {
      C.bolts.push({ x: VIEW_W + 40, y: C.planeY - 60 + Math.random() * 160, vx: -26 - Math.random() * 8, vy: (Math.random() - 0.5) * 3 });
      Sound.zap(0.2);
    }
    if (t === 650) Sound.drone(0.7);
    if (t === 668) { C.booms.push({ x: C.planeX + 60, y: C.planeY - 30, t: 0 }); Sound.play('boom', { vol: 0.8 }); this.shake = 14; g.speech.clear(); }
    if (t === 690) g.speech.say('tails', 'Whoa! What was THAT?!', { dur: 90, prio: 5 });
    if (t === 720) for (let i = 0; i < 4; i++) C.zoms.push({ x: VIEW_W + 80 + i * 70, y: 140 + i * 90, ty: 120 + i * 95, jet: i % 2 === 1, t: 0 });
    if (t === 780) g.speech.say('sonic', "Zombots?! Tell you later. Punch it, Tails!", { dur: 110, prio: 5 });
    if (t > 735 && t < 880 && t % 20 === 0) { const z = C.zoms[(t / 20) % C.zoms.length | 0]; if (z) { C.bolts.push({ x: z.x - 20, y: z.y, vx: -22, vy: (C.planeY - z.y) / 40 }); Sound.zap(0.15); } }
    for (const z of C.zoms) { z.t++; z.x += ((VIEW_W - 260 + (z.jet ? 120 : 0)) - z.x) * 0.04; z.y += (z.ty + Math.sin((t + z.t * 3) * 0.06) * 14 - z.y) * 0.05; }
    for (const b of C.bolts) { b.x += b.vx; b.y += b.vy; }
    C.bolts = C.bolts.filter((b) => b.x > -60);
    for (const b of C.booms) b.t++;
    C.booms = C.booms.filter((b) => b.t < 40);
    if (t > 880) this.fade = Math.min(1, (t - 880) / 20);
    if (t >= 900) this.begin3D('sky');
  }

  wingPos2D() {
    const C = this.cs, f = TOR_FRAMES.plane0, s = 2.5;
    return { x: C.planeX + (82 - f[2] / 2) * s, y: C.planeY - f[3] * s / 2 + 21 * s };
  }

  drawPickup(ctx) {
    const C = this.cs, t = this.t, g = this.g;
    ctx.save();
    if (this.shake > 0.5) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    // dusk sky, sea and the coast road, with the Egg Base burning far behind
    const sky = ctx.createLinearGradient(0, 0, 0, 470);
    sky.addColorStop(0, '#0d0612'); sky.addColorStop(0.45, '#3a0c1e'); sky.addColorStop(0.8, '#7a1e22'); sky.addColorStop(1, '#b8492e');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, VIEW_W + 40, 520);
    const halo = ctx.createRadialGradient(980, 430, 20, 980, 430, 160); halo.addColorStop(0, 'rgba(230,70,40,.55)'); halo.addColorStop(1, 'rgba(230,70,40,0)');
    ctx.fillStyle = halo; ctx.fillRect(820, 270, 320, 320);
    ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.arc(980, 430, 52, 0, Math.PI * 2); ctx.fill();
    // something watching from the dark clouds
    if (t > 90 && t % 260 < 70) for (const [ex, ey] of [[300, 150], [720, 90], [1120, 200]]) {
      if ((t + ex) % 7 < 1) continue;
      ctx.fillStyle = 'rgba(125,255,74,.75)'; ctx.fillRect(ex, ey, 4, 3); ctx.fillRect(ex + 12, ey, 4, 3);
    }
    const sea = ctx.createLinearGradient(0, 470, 0, VIEW_H);
    sea.addColorStop(0, '#2a1a30'); sea.addColorStop(1, '#0a0810');
    ctx.fillStyle = sea; ctx.fillRect(-20, 470, VIEW_W + 40, VIEW_H);
    ctx.fillStyle = 'rgba(220,80,50,.3)';
    for (let i = 0; i < 14; i++) { const y = 480 + i * 9, w = 120 - i * 6; ctx.fillRect(980 - w / 2 + Math.sin(t * 0.03 + i) * 8, y, w, 2); }
    const bx = 120 - C.scroll * 0.05;
    ctx.fillStyle = '#1a1018'; ctx.beginPath(); ctx.ellipse(bx, 470, 150, 46, 0, Math.PI, 0); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const k = ((t * 0.6 + i * 40) % 240) / 240;
      ctx.fillStyle = `rgba(40,30,40,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(bx - 40 + i * 16 + k * 40, 430 - k * 260, 20 + k * 60, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,120,40,${0.6 + 0.3 * Math.sin(t * 0.3)})`; ctx.beginPath(); ctx.ellipse(bx, 462, 90, 14, 0, 0, Math.PI * 2); ctx.fill();
    // the road
    const ro = -(C.scroll % 160);
    ctx.fillStyle = '#2d2c33'; ctx.fillRect(-20, 600, VIEW_W + 40, 130);
    ctx.fillStyle = '#ffc21a'; ctx.fillRect(-20, 604, VIEW_W + 40, 4);
    ctx.fillStyle = '#e8e8e8'; for (let x = ro; x < VIEW_W; x += 160) ctx.fillRect(x, 660, 80, 6);
    ctx.fillStyle = '#8a929c'; ctx.fillRect(-20, 586, VIEW_W + 40, 6);
    for (let x = ro; x < VIEW_W + 160; x += 80) ctx.fillRect(x, 586, 6, 18);
    // Sonic on the road, then in the air, then on the wing
    const img = Assets.img.tornado, F = TOR_FRAMES;
    const spr = (f, x, y, s, flip) => {
      if (!img) return;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
      ctx.drawImage(img, f[0], f[1], f[2], f[3], Math.round(-f[2] * s / 2), Math.round(-f[3] * s / 2), Math.round(f[2] * s), Math.round(f[3] * s)); ctx.restore();
    };
    if (!C.onPlane) {
      if (C.jumpT < 0) drawSonicFrame(ctx, animFrame(t < 200 ? (Math.floor(t / 40) % 3 === 2 ? 'tap' : 'idle') : 'lookup', t / 8), C.sonicX, C.sonicY, { flip: true });
      else drawSonicFrame(ctx, animFrame('ball', C.jumpT / 2), C.jx, C.jy, { anchor: 'center' });
    }
    // the Tornado (Tails at the stick), propeller blur at the nose
    const pf = Math.floor(t / 3) % 2 ? F.plane1 : F.plane0;
    const tilt = C.jumpT >= 0 && C.jumpT < 40 ? 0.04 : Math.sin(t * 0.05) * 0.03;
    ctx.save(); ctx.translate(C.planeX, C.planeY); ctx.rotate(tilt);
    spr(pf, 0, 0, 2.5);
    ctx.fillStyle = `rgba(230,230,240,${0.35 + 0.15 * Math.sin(t * 1.3)})`;
    ctx.beginPath(); ctx.ellipse(pf[2] * 1.25 - 6, 18, 9, 78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (C.onPlane) { const w = this.wingPos2D(); drawSonicFrame(ctx, animFrame(t > 690 ? 'lookup' : 'idle', t / 8), w.x, w.y, {}); }
    // the Zombots: jetpack troopers and infected jets
    for (const z of C.zoms) {
      if (z.jet) spr(F.jet, z.x, z.y, 1.1, true);
      else {
        ctx.fillStyle = `rgba(140,255,90,${0.5 + 0.4 * Math.random()})`;
        ctx.beginPath(); ctx.ellipse(z.x + 10, z.y + 48, 7, 18 + Math.random() * 8, 0, 0, Math.PI * 2); ctx.fill();
        spr(F.zom, z.x, z.y, 2.5, true);
      }
    }
    for (const b of C.bolts) {
      ctx.fillStyle = 'rgba(125,255,74,.35)'; ctx.beginPath(); ctx.ellipse(b.x + 14, b.y, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaffd8'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const b of C.booms) {
      const k = b.t / 40;
      ctx.fillStyle = `rgba(255,${200 - k * 150},60,${1 - k})`; ctx.beginPath(); ctx.arc(b.x, b.y, 20 + k * 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(160,255,90,${0.8 - k})`; ctx.beginPath(); ctx.arc(b.x, b.y, 10 + k * 40, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    torDread(ctx, t, 0.8);
    if (t < 30) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 30})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.fade > 0) { ctx.fillStyle = `rgba(255,255,255,${this.fade})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (t > 60 && t < 860) g.text(ctx, `${keyLabel('swap') === 'Q' ? 'ENTER' : 'START'}: SKIP`, VIEW_W - 24, VIEW_H - 24, 10, 'rgba(255,255,255,.6)', 'right', null);
  }

  // ------------------------------------------------------------- 3D setup
  begin3D(from) {
    const g = this.g;
    g.speech.clear();
    this.phase = from; this.t = 0; this.fade = 0; this.flash = from === 'sky' && this.from === 'pickup' ? 1 : 0;
    this.frame = 100; this.hull = 100; this.active = 'pilot'; this.pilot = 'tails';
    this.roleCool = 0; this.tailsStam = 100; this.sonicPilotT = 0; this.boost = 100;
    this.wave = 0; this.nextBird = 120; this.nextJets = 200; this.nextZom = 900;
    if (from === 'board') g.score = Math.max(g.score, this.score0);
    if (!this.scene) {
      try { this.init3D(); } catch (e) { console.warn('3D Sky Chase unavailable', e); this.failed = true; this.phase = 'done'; this.t = 0; return; }
    } else this.resetWorld();
    Sound.playMusic(from === 'board' ? 'crisis' : 'skychase');
    Sound.drone(0.55);
    if (from === 'sky') g.speech.say('tails', 'Hang on, Sonic! Guns are hot!', { dur: 120, prio: 4 });
    if (from === 'board') this.boardIntro = 0;
    document.getElementById('touch').classList.add('super', 'sky');
  }

  init3D() {
    this.renderer = EscapeStage.renderer();
    const T = this.tex = EscapeStage._tex;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a1018);
    scene.fog = new THREE.Fog(0x2a1018, 60, 330);
    this.camera = new THREE.PerspectiveCamera(62, VIEW_W / VIEW_H, 0.1, 3000);
    this.hemi = new THREE.HemisphereLight(0xd8b0b8, 0x201020, 1.0); scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xff7a58, 0.7); sun.position.set(-0.5, 0.8, 1); scene.add(sun);
    // sky dome with a dusk gradient
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const cg = c.getContext('2d'), gr = cg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#07040c'); gr.addColorStop(0.38, '#240a1a'); gr.addColorStop(0.48, '#5e1620'); gr.addColorStop(0.53, '#a8402c'); gr.addColorStop(0.58, '#3a1420'); gr.addColorStop(1, '#0a0810');
    cg.fillStyle = gr; cg.fillRect(0, 0, 4, 256);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide, fog: false }));
    scene.add(dome); this.dome = dome;
    const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xd03a20, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunS.scale.setScalar(200); sunS.position.set(-300, 60, 1200); scene.add(sunS); this.sunS = sunS;
    // the sea far below, scrolling
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sg = sc.getContext('2d'); sg.fillStyle = '#16121e'; sg.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 90; i++) { sg.fillStyle = Math.random() < 0.5 ? 'rgba(200,70,50,.25)' : 'rgba(5,5,12,.6)'; sg.fillRect(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 14, 2); }
    this.seaTex = new THREE.CanvasTexture(sc); this.seaTex.wrapS = this.seaTex.wrapT = THREE.RepeatWrapping; this.seaTex.repeat.set(60, 60);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ map: this.seaTex }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -60; scene.add(sea); this.sea = sea;
    // clouds
    const cc = document.createElement('canvas'); cc.width = cc.height = 128;
    const ccg = cc.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = 30 + Math.random() * 68, y = 50 + Math.random() * 30, r = 18 + Math.random() * 22;
      const rg = ccg.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(96,62,78,.95)'); rg.addColorStop(1, 'rgba(70,40,56,0)');
      ccg.fillStyle = rg; ccg.beginPath(); ccg.arc(x, y, r, 0, Math.PI * 2); ccg.fill();
    }
    this.cloudMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cc), transparent: true, depthWrite: false, opacity: 0.85 });
    this.clouds = [];
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      this.placeCloud(s, Math.random() * 420 - 60); scene.add(s); this.clouds.push(s);
    }
    this.glowMat = new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.boltMat = new THREE.SpriteMaterial({ map: T.glow, color: 0x7dff4a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.smokeMat = new THREE.SpriteMaterial({ map: T.smoke, depthWrite: false, transparent: true });
    this.bulletGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5); this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
    this.missileGeo = new THREE.CylinderGeometry(0.13, 0.13, 1.0, 8); this.missileGeo.rotateX(Math.PI / 2);
    this.missileMat = new THREE.MeshPhongMaterial({ color: 0xe8e8e8, shininess: 80 });
    this.missileTipGeo = new THREE.ConeGeometry(0.13, 0.35, 8); this.missileTipGeo.rotateX(Math.PI / 2);
    this.missileTipMat = new THREE.MeshPhongMaterial({ color: 0xd4141e, shininess: 80 });
    this.flameMat = new THREE.SpriteMaterial({ map: T.glow, color: 0xffb040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.laserMat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff });
    this.iceMat = new THREE.SpriteMaterial({ map: T.glow, color: 0x9fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.shieldMesh.scale.set(5.2, 2.4, 3.8); this.shieldMesh.position.y = 0.6; this.shieldMesh.visible = false;
    this.scorchMat = new THREE.MeshBasicMaterial({ map: T.smoke, color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    this.tearMat = new THREE.MeshBasicMaterial({ map: T.smoke, color: 0x2a0806, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    // the Tornado, Sonic and Tails
    this.plane = torPlaneModel(); scene.add(this.plane.root);
    this.plane.root.add(this.shieldMesh);
    this.sonic = escSonicModel(); this.sonic.root.scale.setScalar(0.52);
    this.tails = torTailsModel();
    this.plane.root.add(this.sonic.root); this.plane.root.add(this.tails.root);
    this.wingMeshes = this.plane.body.children.filter((m) => m.name === 's_t1_winga');
    // pairs of infected eyes that open in the far clouds, watching
    this.eyes = [];
    for (let i = 0; i < 7; i++) {
      const pair = new THREE.Group();
      for (const s of [-1, 1]) { const e = new THREE.Sprite(this.boltMat); e.scale.set(1.6, 1.0, 1); e.position.x = s * 1.6; pair.add(e); }
      pair.visible = false; scene.add(pair); this.eyes.push({ m: pair, t: -Math.random() * 600 });
    }
    this.lightning = 0;
    this.fx = []; this.debris = []; this.pops = [];
    this.v3 = new THREE.Vector3(); this.v3b = new THREE.Vector3();
    this.resetWorld();
  }

  placeCloud(s, z) {
    const big = Math.random() < 0.3;
    // keep the band the plane flies in clear, so clouds rush past above and below
    const y = big ? -45 + Math.random() * 25 : Math.random() < 0.6 ? -30 + Math.random() * 22 : 13 + Math.random() * 20;
    s.position.set((Math.random() - 0.5) * (big ? 500 : 160), y, z);
    s.scale.set(big ? 140 : 26 + Math.random() * 30, big ? 50 : 12 + Math.random() * 10, 1);
  }

  resetWorld() {
    const S = this.scene;
    for (const list of [this.foes, this.shots, this.bolts, this.boarders, this.fx, this.debris]) if (list) for (const o of list) if (o.m) S.remove(o.m);
    this.foes = []; this.shots = []; this.bolts = []; this.boarders = []; this.fx = []; this.debris = []; this.pops = [];
    for (const d of this.decals || []) d.parent && d.parent.remove(d);
    this.items = this.items ? (this.items.forEach((i) => this.scene.remove(i.m)), []) : [];
    this.decals = []; this.tears = 0;
    if (this.striker) this.endStrike(true);
    this.away = { sonic: false, tails: false }; this.striker = null; this.finisher = null; this.slowmo = 0; this.banner = null; this.cutin = null;
    this.rings = 10; this.freezeT = 0; this.shieldT = 0; this.autoT = 0; this.superT = 0; this.comboN = 0; this.comboT = 0; this.slashes = [];
    if (this.shieldMesh) this.shieldMesh.visible = false;
    this.ammo = 6; this.ammoT = 0; this.aimP = 0.06; this.hits = 0; this.locks = []; this.painting = false; this.laserT = 0; this.lock = null;
    this.px = 0; this.py = 1.5; this.pvx = 0; this.pvy = 0; this.roll = 0; this.rollCool = 0; this.gunT = 0; this.missileCool = 0;
    this.bank = 0; this.pitch = 0; this.dropY = 0; this.planeSpin = 0; this.rollA = 0;
    for (const m of this.wingMeshes) m.visible = true;
    this.plane.root.rotation.set(0, 0, 0);
    this.fighters = {
      sonic: { id: 'sonic', x: -1.4, y: 0, vy: 0, face: 1, atk: null, stun: 0, inv: 0, combo: 0, comboT: 0, hold: null, off: false },
      tails: { id: 'tails', x: 1.4, y: 0, vy: 0, face: -1, atk: null, stun: 0, inv: 0, combo: 0, comboT: 0, hold: null, off: false },
    };
    this.camPos = new THREE.Vector3(0, 4, -10); this.camLook = new THREE.Vector3(0, 1, 10);
    this.placeChars();
  }

  // who stands where: the pilot sits in the cockpit, the other rides the wing
  get wingChar() { return this.pilot === 'tails' ? 'sonic' : 'tails'; }

  placeChars() {
    for (const id of ['sonic', 'tails']) {
      if (this.away && this.away[id]) continue;
      const M = this[id], F = this.fighters[id];
      if (id === this.pilot) {
        M.root.position.copy(TW.seat); M.root.rotation.set(0, 0, 0);
      } else {
        M.root.position.set(F.x, TW.wingY + F.y, TW.wingZ);
        M.root.rotation.set(0, F.face > 0 ? Math.PI / 2 : -Math.PI / 2, 0);   // face +1 looks down +x (screen left)
      }
    }
  }

  // ------------------------------------------------------------- update
  update(inp) {
    const g = this.g;
    this.t++;
    if (this.shake > 0) this.shake *= 0.88;
    if (this.flash > 0) this.flash -= 0.04;
    if (this.phase === 'pickup') { this.updatePickup(inp); return; }
    if (this.failed) { if (this.t > 30) g.finishTornado(); return; }
    if (this.phase === 'tbc') { if (this.t > 120 && (inp.startPressed || inp.jumpPressed || inp.tapped || this.t > 540)) g.finishTornado(); return; }
    const playing = this.phase === 'sky' || this.phase === 'board';
    if (this.banner && ++this.banner.t > 90) this.banner = null;
    if (this.cutin && ++this.cutin.t > 60) this.cutin = null;
    if (this.comboT > 0) this.comboT--;
    for (const sl of this.slashes) sl.t++;
    this.slashes = this.slashes.filter((sl) => sl.t < 18);
    // a finisher stops the world; slow-motion runs it at a third of the speed
    if (this.finisher) { this.updateFinisher(); this.animate(); this.updateCamera(); return; }
    if (this.slowmo > 0) { this.slowmo--; if (this.slowmo % 3) { this.animate(); this.updateCamera(); return; } }
    if (playing) {
      if (inp.special) this.useSpecial(inp.special);
      this.updateSpecials(inp);
      if (this.phase === 'board') this.updateRoles(inp);
      // with roles swapped, Sonic keeps flying (badly) even while you control Tails
      this.updatePlane(this.autoT > 0 ? 'autoAI' : this.active === 'pilot' ? inp : this.pilot === 'sonic' && this.phase === 'board' ? 'sonicAI' : null);
      this.updateFighters(this.active === 'fighter' ? inp : null);
      this.spawn();
      if (this.phase === 'board') this.drain();
      if (this.frame <= 0) this.fail('torn');
      else if (this.hull <= 0) this.fail('shot');
      if (this.phase === 'sky' && this.t >= TW.SKY) this.startBoard();
      else if (this.phase === 'board' && this.t >= TW.BOARD) this.startFinale();
    } else if (this.phase === 'finale') this.updateFinale();
    else if (this.phase === 'torn' || this.phase === 'shot') this.updateFail();
    else if (this.phase === 'infected') this.updateInfected();
    if (this.phase !== 'tbc') {
      this.updateFoes(); this.updateShots(); this.updateBolts(); this.updateBoarders(); this.updateFX(); this.updateItems(); this.updateDamage();
      this.animate();
      this.updateCamera();
    }
  }

  // -------------------------------------------------- the Tornado itself
  // Classic rail-shooter handling: left/right flies the plane, up/down aims the
  // guns (the enemies come from above), and the reticle rides out in front.
  updatePlane(inp) {
    const g = this.g, t = this.t;
    const ai = inp === 'sonicAI' || inp === 'autoAI';
    if (inp === 'autoAI') {
      // the autopilot flies itself: lines up on the auto-aim lock and fires
      const L = this.lock || this.foes.find((f) => !f.dead && f.hp > 0 && f.z > 10);
      inp = { right: L ? L.x < this.px - 1 : this.px < -2, left: L ? L.x > this.px + 1 : this.px > 2, up: L ? this.aimP < (L.y - this.py) / Math.max(8, L.z) : false, down: false, punch: true };
      if (--this.gunT <= 0) { this.gunT = 5; this.fireGuns(false); }
    } else if (ai) inp = { right: this.px < -2, left: this.px > 2, up: this.aimP < 0.04, down: this.aimP > 0.1 };
    const pilot = inp ? this.pilot : 'auto';
    let hx = inp ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0;
    let hy = inp ? (inp.up ? 1 : 0) - (inp.down ? 1 : 0) : 0;
    if (pilot === 'sonic') {
      // Sonic has no idea: the stick is backwards and the plane wanders
      hy = -hy;
      hx += Math.sin(t * 0.11) * 0.6 + (Math.random() - 0.5) * 0.8;
    }
    if (pilot === 'auto') { hx = Math.max(-0.3, Math.min(0.3, -this.px * 0.04)); hy = 0; }
    this.pvx = (this.pvx - hx * 0.05) * 0.9;
    this.px = Math.max(-TW.boxX, Math.min(TW.boxX, this.px + this.pvx));
    if (this.shieldT > 0) {
      // the shield turns the Tornado into a battering ram: climb into them
      this.pvx *= 1.04;
      this.ramY = Math.max(0, Math.min(9, (this.ramY || 0) + hy * 0.12));
      hy = 0;
    } else this.ramY = Math.max(0, (this.ramY || 0) - 0.1);
    this.pvy = 0; this.py = 1.5 + (this.ramY || 0) + Math.sin(t * 0.03) * 0.25;
    this.aimP = Math.max(-0.04, Math.min(0.26, (this.aimP == null ? 0.06 : this.aimP) + hy * 0.006));
    if (this.rollCool > 0) this.rollCool--;
    if (this.roll > 0) this.roll--;
    if (this.laserT > 0) this.laserT--;
    if (this.ammo < 6 && ++this.ammoT >= 80) { this.ammo++; this.ammoT = 0; }
    this.updateAim(!!inp && !ai);
    if (!inp || ai) { this.painting = false; return; }
    // guns, the lock-on missile salvo and the barrel roll
    if (inp.punch && --this.gunT <= 0) { this.gunT = this.laserT > 0 ? 4 : 5; this.fireGuns(pilot === 'sonic'); }
    if (!inp.punch) this.gunT = 0;
    if (inp.laser) this.paint();
    else if (this.painting) this.fireSalvo();
    if (inp.clonesPressed && this.rollCool <= 0) {
      if (pilot === 'sonic') { g.speech.say('sonic', 'Which one is the barrel roll?!', { dur: 80, cool: 200 }); this.pvx += (Math.random() - 0.5) * 0.8; }
      else { this.roll = 36; this.rollCool = 80; Sound.play('spring', { rate: 1.3, vol: 0.5 }); }
    }
  }

  planePos(v = new THREE.Vector3()) { return v.set(this.px, this.py + this.dropY, 0); }
  nose(v = new THREE.Vector3()) { return this.planePos(v).add(new THREE.Vector3(0, 0.5, 2)); }
  aimDir(v = new THREE.Vector3()) { return v.set(-this.pvx * 1.6, this.aimP, 1).normalize(); }

  // the auto-aim: anything close to the reticle's line gets the guns' lock
  updateAim(live) {
    const o = this.nose(new THREE.Vector3()), d = this.aimDir(new THREE.Vector3());
    let best = null, bd = 0.11;
    for (const f of this.foes) {
      if (f.hp <= 0 || f.dead || f.z < o.z + 6) continue;
      const to = new THREE.Vector3(f.x - o.x, f.y - o.y, f.z - o.z), ang = to.angleTo(d);
      if (ang < bd) { bd = ang; best = f; }
    }
    if (best !== this.lock && best && live) Sound.play('select', { vol: 0.25, rate: 2.4 });
    this.lock = best;
  }

  fireGuns(wild) {
    const P = this.planePos(this.v3), hyper = this.laserT > 0;
    Sound.gun();
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(this.bulletGeo, hyper ? this.laserMat : this.bulletMat);
      if (hyper) m.scale.set(2.2, 2.2, 1.6);
      const o = new THREE.Vector3(P.x + s * 0.9, P.y + 0.45, 1.6);
      const dir = this.aimDir(new THREE.Vector3());
      const L = this.lock;
      if (L) dir.set(L.x, L.y, L.z + (L.vz || 0) * 4).sub(o).normalize();
      if (wild) dir.add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0)).normalize();
      m.position.copy(o); m.lookAt(o.clone().add(dir)); this.scene.add(m);
      this.shots.push({ m, v: dir.multiplyScalar(3.6), t: 0, dmg: hyper ? 2 : 1 });
    }
  }

  // hold the missile button and sweep the reticle across them: up to six locks
  paint() {
    if (!this.painting) { this.painting = true; this.locks = []; this.paintT = 0; Sound.play('charge', { rate: 1.6, vol: 0.3 }); }
    this.paintT++;
    if (this.paintT % 5 || this.locks.length >= Math.min(6, this.ammo)) return;
    const o = this.nose(new THREE.Vector3()), d = this.aimDir(new THREE.Vector3());
    let best = null, bd = 0.3;
    for (const f of this.foes) {
      if (f.hp <= 0 || f.dead || f.z < o.z + 8 || this.locks.includes(f)) continue;
      const ang = new THREE.Vector3(f.x - o.x, f.y - o.y, f.z - o.z).angleTo(d);
      if (ang < bd) { bd = ang; best = f; }
    }
    if (best) { this.locks.push(best); Sound.tone && this.lockBeep(this.locks.length); }
  }

  lockBeep(n) {
    if (!Sound.ctx || Sound.muted) return;
    Sound.tone('square', 660 + n * 110, Sound.ctx.currentTime, 0.07, 0.12, Sound.sfxGain);
  }

  fireSalvo() {
    this.painting = false;
    const locks = this.locks.filter((f) => !f.dead && f.hp > 0);
    const n = Math.max(1, Math.min(this.ammo, locks.length || 1));
    if (this.ammo <= 0) { Sound.play('select', { rate: 0.6, vol: 0.4 }); return; }
    this.ammo -= n;
    for (let i = 0; i < n; i++) this.g.later(i * 4, () => this.launchMissile(locks[i] || null, i));
    this.locks = [];
  }

  launchMissile(target, i) {
    if (!this.scene) return;
    const P = this.planePos(this.v3), side = i % 2 ? 1 : -1;
    const m = new THREE.Group(); m.scale.setScalar(1.6);
    const body = new THREE.Mesh(this.missileGeo, this.missileMat); m.add(body);
    const tip = new THREE.Mesh(this.missileTipGeo, this.missileTipMat); tip.position.z = 0.5; m.add(tip);
    const fl = new THREE.Sprite(this.flameMat); fl.scale.set(0.6, 0.6, 1); fl.position.z = -0.6; m.add(fl);
    m.position.set(P.x + side * (1.6 + (i >> 1) * 0.5), P.y - 0.1, 0.6); this.scene.add(m);
    // drop off the pylon, then the motor lights and it curls toward its lock
    this.shots.push({ m, flame: fl, v: new THREE.Vector3(side * 0.12, -0.06, 0.5), t: 0, dmg: 5, missile: true, target, spin: Math.random() * 6, side });
    Sound.play('release', { vol: 0.7, rate: 0.8 + i * 0.05 });
  }

  // ------------------------------------------------------- spawning
  spawn() {
    const t = this.t;
    if (this.phase === 'sky') {
      const W = [[90, 'line', 3], [330, 'vee', 5], [600, 'drones', 2], [840, 'sides', 4], [1080, 'drones', 3],
        [1300, 'vee', 6], [1560, 'line', 3], [1600, 'drones', 2], [1820, 'vee', 5], [2060, 'drones', 3], [2080, 'sides', 4]];
      for (const [at, kind, n] of W) if (t === at) this.spawnWave(kind, n);
      if (t === 2280) this.g.speech.say('sonic', 'Uh, Tails... are those BIRDS?', { dur: 110, prio: 4 });
      return;
    }
    if (this.phase !== 'board') return;
    const g = this.g;
    if (t === 700) g.speech.say('sonic', '...Is it just me, or did the sky go quiet?', { dur: 120, prio: 2 });
    if (t === 1500) g.speech.say('tails', "Sonic, their eyes... they're not birds anymore. Not really.", { dur: 140, prio: 2 });
    if (t === 2300) g.speech.say('tails', 'The radio keeps picking something up. Like... breathing.', { dur: 140, prio: 2 });
    if (t === 3100) g.speech.say('sonic', "Whatever happens, Tails, don't let them bite you.", { dur: 140, prio: 2 });
    if (--this.nextBird <= 0) {
      this.nextBird = Math.max(62, 150 - t / 35) + Math.random() * 40;
      this.spawnBird(); if (t > 2200 && Math.random() < 0.4) this.spawnBird();
    }
    if (--this.nextJets <= 0) { this.nextJets = 330 + Math.random() * 120; this.spawnWave(Math.random() < 0.5 ? 'line' : 'sides', 2 + (t > 2000 ? 1 : 0)); }
    if (t % 760 === 380) this.spawnWave('drones', t > 2500 ? 2 : 1);
    if (t >= 1400 && --this.nextZom <= 0) { this.nextZom = 640; this.spawnZombot(); }
  }

  spawnWave(kind, n) {
    if (!this.jetTpl) {
      this.jetTpl = torJetModel(); this.birdTpl = torBirdModel();
      // a sickly green halo so they read against the dark sky
      const halo = new THREE.Sprite(this.boltMat); halo.scale.setScalar(5); this.jetTpl.add(halo);
    }
    const P = this.planePos(this.v3), z0 = 190;
    if (kind === 'drones') {
      for (let i = 0; i < n; i++) {
        // a jetpack Zombot, flying in superman-style with its arms out
        const m = torZombotModel(); m.scale.setScalar(1.6); this.scene.add(m);
        const flame = new THREE.Sprite(this.boltMat); flame.scale.set(0.5, 1.0, 1); flame.position.set(0, 0.45, -0.3); m.add(flame);
        const h2 = new THREE.Sprite(this.boltMat); h2.scale.setScalar(1.6); h2.position.y = 0.6; m.add(h2);
        this.foes.push({ kind: 'drone', m, ox: (i - (n - 1) / 2) * 6, oy: 3.5 + (i % 2) * 3, x: P.x, y: P.y + 6, z: 120, vz: -1.2, t: 0, hp: 4, r: 1.5, fireT: 90 + i * 25, ph: Math.random() * 6 });
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      let x = P.x, y = P.y + 4 + Math.random() * 3, z = z0;
      if (kind === 'line') { x += (i - (n - 1) / 2) * 7; z += i * 10; }
      if (kind === 'vee') { const k = i - (n - 1) / 2; x += k * 5; z += Math.abs(k) * 16; y += Math.abs(k) * 0.8; }
      if (kind === 'sides') { x += (i % 2 ? 1 : -1) * (10 + i * 2); z += i * 22; y += (i % 3) * 2.5; }
      const m = this.jetTpl.clone(); m.rotation.y = Math.PI; m.scale.setScalar(1.5); m.position.set(x, y, z); this.scene.add(m);
      this.foes.push({ kind: 'jet', m, x, y, z, bx: x, by: y, vz: -0.85 - Math.random() * 0.25, t: 0, hp: 3, r: 2.8, fireT: 30 + Math.random() * 60, ph: Math.random() * 6, sway: kind === 'sides' ? 0.06 : 0.025 });
    }
  }

  spawnBird() {
    if (!this.birdTpl) this.spawnWave('none', 0);
    const m = this.birdTpl.clone(); m.scale.setScalar(0.85);
    this.plane.root.add(m);
    const side = Math.random() < 0.5 ? -1 : 1;
    const to = new THREE.Vector3((Math.random() * 2 - 1) * (TW.wingX - 0.3), TW.wingY, TW.wingZ);
    const from = new THREE.Vector3(side * (8 + Math.random() * 6), 5 + Math.random() * 4, 30 + Math.random() * 14);
    this.foes.push({ kind: 'bird', m, from, to, local: true, x: 0, y: 0, z: 0, t: 0, dur: 110, hp: 2, r: 1.1 });
  }

  spawnZombot() {
    const m = torZombotModel(); this.plane.root.add(m);
    const x = (Math.random() * 2 - 1) * (TW.wingX - 0.5);
    this.boarders.push({ kind: 'zom', m, Z: m.userData.zombie, x, y: 7, vx: 0, vy: 0, z: 0, hp: 8, state: 'drop', t: 0, face: x > 0 ? -1 : 1, hitBy: null });
    this.g.speech.say(this.wingChar, 'A Zombot just dropped onto the wing!', { dur: 100, cool: 900, coolKey: 'zomdrop' });
  }

  // ------------------------------------------------------- the meters
  drain() {
    let claw = 0;
    for (const b of this.boarders) if (b.state === 'claw') claw += b.kind === 'zom' ? 0.024 : 0.0095;
    if (this.freezeT > 0 || this.superT > 0) claw = 0;
    this.frame -= claw;
    if (this.active !== 'pilot' && this.pilot === 'tails' && this.autoT <= 0 && this.superT <= 0) { this.hull -= 0.008; this.dropY = Math.max(-4, this.dropY - 0.008); }
    else { this.dropY = Math.min(0, this.dropY + 0.03); if (this.pilot === 'sonic') this.hull -= 0.006; }
    this.frame = Math.max(0, this.frame); this.hull = Math.max(0, this.hull);
    const g = this.g;
    if (this.frame < 35) g.speech.say('tails', "The wing's coming apart! Sonic, get them off!", { dur: 110, cool: 600, coolKey: 'frameLow', prio: 3 });
    if (this.hull < 35) g.speech.say('sonic', "Tails, we're dropping! Fly the plane!", { dur: 110, cool: 600, coolKey: 'hullLow', prio: 3 });
  }

  // ------------------------------------------------- switching seats
  updateRoles(inp) {
    const g = this.g;
    if (this.roleCool > 0) this.roleCool--;
    if (inp.swapPressed) {
      this.active = this.active === 'pilot' ? 'fighter' : 'pilot';
      Sound.play('select', { vol: 0.5, rate: this.active === 'pilot' ? 1 : 1.3 });
    }
    if (inp.rolesPressed) {
      if (this.roleCool > 0) g.speech.say('tails', 'Give me a second, I need to catch my breath!', { dur: 90, cool: 120 });
      else this.swapRoles(false);
    }
    // the off-role can't last: Tails runs out of steam, Sonic can't fly
    if (this.pilot === 'sonic') {
      this.tailsStam = Math.max(0, this.tailsStam - 0.3);
      this.sonicPilotT++;
      if (this.sonicPilotT === 140) g.speech.say('sonic', "Uh... which pedal is up?!", { dur: 90, prio: 3 });
      if (this.tailsStam <= 0) { g.speech.say('tails', "I-I'm so tired, Sonic! Swap back!", { dur: 110, prio: 5 }); this.swapRoles(true); }
      else if (this.sonicPilotT >= 330) { g.speech.say('sonic', "I don't know how to fly this thing! Your plane, Tails!", { dur: 120, prio: 5 }); this.swapRoles(true); }
    } else this.tailsStam = Math.min(100, this.tailsStam + 0.4);
  }

  swapRoles(forced) {
    const was = this.pilot;
    this.pilot = was === 'tails' ? 'sonic' : 'tails';
    const F = this.fighters[was];   // the old pilot climbs out onto the wing, where the other one stood
    const O = this.fighters[this.pilot];
    F.x = O.x; F.y = 0; F.vy = 0; F.face = O.face; F.atk = null; F.stun = 0; F.inv = 40;
    if (O.hold) this.dropHeld(O);
    O.atk = null;
    this.sonicPilotT = 0;
    this.roleCool = forced ? 420 : 30;
    this.flash = 0.25; Sound.play('spring', { rate: 0.8, vol: 0.5 });
    if (!forced && this.pilot === 'sonic') this.g.speech.say('tails', 'My turn to fight! Just keep it level!', { dur: 100, prio: 3 });
  }

  // ------------------------------------------------- the wing brawler
  updateFighters(inp) {
    const g = this.g;
    for (const id of ['sonic', 'tails']) {
      const F = this.fighters[id];
      if (id === this.pilot || this.away[id]) continue;
      if (F.stun > 0) F.stun--;
      if (F.inv > 0) F.inv--;
      if (F.comboT > 0) F.comboT--; else F.combo = 0;
      const ctl = inp && !F.stun ? inp : null;
      const hx = ctl ? (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0) : 0;
      // screen right is world -x
      if (!F.atk || F.atk.move) {
        F.vx = F.atk && F.atk.move ? F.vx : -hx * (id === 'sonic' ? 0.085 : 0.075);
        if (hx && !F.atk) F.face = -hx;
      }
      if (F.atk && !F.atk.move) F.vx = 0;
      if (F.stun) F.vx = F.kb || 0;
      F.kb = (F.kb || 0) * 0.85;
      F.x = Math.max(-TW.wingX, Math.min(TW.wingX, F.x + F.vx));
      if (F.y > 0 || F.vy > 0) { F.vy -= F.atk && F.atk.type === 'tailspin' ? 0.002 : 0.013; F.y = Math.max(0, F.y + F.vy); if (F.y === 0) F.vy = 0; }
      if (ctl && ctl.upPressed && F.y === 0 && !F.atk) { F.vy = 0.2; Sound.play('jump', { vol: 0.5 }); }
      if (ctl && (ctl.punchPressed || ctl.laserPressed) && this.tryParry(F)) continue;
      if (ctl && !F.atk) this.startAttack(F, ctl);
      if (F.atk) this.stepAttack(F);
      if (ctl && ctl.bitePressed) this.tryBite(F);
    }
  }

  // Metal Gear Rising parry: strike into an attack just before it lands
  tryParry(F) {
    for (const b of this.boarders) {
      if (b.state !== 'windup' || b.target !== F) continue;
      const dur = b.kind === 'zom' ? 34 : 26;
      if (b.t < dur - 16 || Math.abs(b.x - F.x) > 1.5) continue;
      F.face = Math.sign(b.x - F.x) || F.face;
      F.atk = { type: 'punch', t: 0, dur: 13, side: 1, hit: new Set([b]) };
      b.state = 'stun'; b.t = 0; b.vx = F.face * 0.12; b.hp -= 1;
      this.impact(b, 1.6, false, 'PARRY!');
      Sound.play('bosshit', { rate: 1.7, vol: 0.7 }); Sound.play('shield', { rate: 1.6, vol: 0.5 });
      this.slowmo = 24; this.flash = Math.max(this.flash, 0.2);
      if (b.kind === 'zom' && b.hp <= 2 && b.hp > 0) this.stagger(b);
      return true;
    }
    return false;
  }

  stagger(b) {
    if (b.state === 'stagger') return;
    b.state = 'stagger'; b.t = 0; b.vx = 0;
    Sound.play('bosshit', { rate: 0.6, vol: 0.8 });
    this.banner = { text: 'FINISH HIM!', t: 0, col: '#d4141e' };
  }

  startAttack(F, inp) {
    const sonic = F.id === 'sonic', g = this.g;
    if (inp.grabPressed) {
      // a staggered Zombot can be finished: Sonic's ZANDATSU, Tails' FATALITY
      const st = this.boarders.find((b) => b.state === 'stagger' && Math.abs(b.x - F.x) < 2.4);
      if (st) { this.startFinisher(F, st); return; }
      const b = this.nearest(F, 1.1, true);
      if (b) {
        F.hold = b; b.state = 'held'; b.t = 0;
        F.atk = { type: 'swing', t: 0, dur: 46, hit: new Set([b]) };
        Sound.play('charge', { rate: 1.4, vol: 0.5 });
        g.speech.say(F.id, sonic ? 'Gotcha by the leg!' : "Off you go!", { dur: 60, cool: 300 });
      } else F.atk = { type: 'whiff', t: 0, dur: 14 };
      return;
    }
    if (inp.clonesPressed) {
      if (sonic) {
        if (this.boost >= 50) {
          this.boost -= 50; F.atk = { type: 'boost', t: 0, dur: 24, move: true, hit: new Set() }; F.vx = F.face * 0.3;
          Sound.boostBurst(); Sound.play('boom', { vol: 0.5, rate: 1.3 }); this.shake = 12; this.flash = 0.15;
          this.g.speech.say('sonic', 'Outta my way!', { dur: 50, cool: 400 });
        }
        else g.speech.say('sonic', 'Need more boost. Gotta land some hits!', { dur: 60, cool: 200 });
      } else { F.atk = { type: 'tailspin', t: 0, dur: 54, move: true, hit: new Set() }; F.vy = Math.max(F.vy, 0.06); Sound.play('roll', { rate: 1.5, vol: 0.5 }); }
      return;
    }
    if (inp.laserPressed) {
      if (sonic && inp.down) { F.atk = { type: 'spin', t: 0, dur: 30, move: true, hit: new Set() }; F.vx = F.face * 0.21; Sound.play('release', { vol: 0.5 }); return; }
      if (sonic) { F.atk = { type: 'flykick', t: 0, dur: 24, move: true, hit: new Set() }; F.vx = F.face * 0.17; }
      else { F.atk = { type: 'smack', t: 0, dur: 30, hit: new Set() }; Sound.play('roll', { rate: 0.8, vol: 0.6 }); }
      return;
    }
    if (inp.punchPressed) {
      // Mortal Kombat uppercut: launches them for a juggle
      if (inp.down) { F.atk = { type: 'uppercut', t: 0, dur: 20, hit: new Set() }; Sound.play('jump', { vol: 0.35, rate: 1.4 }); return; }
      const n = F.combo % 3;
      F.combo++; F.comboT = 26;
      F.atk = n < 2 ? { type: 'punch', t: 0, dur: 13, side: n, hit: new Set() } : { type: sonic ? 'kick' : 'tailswipe', t: 0, dur: 20, hit: new Set() };
    }
  }

  // attack table: when it hits, how far, how hard, and whether it reaches behind
  stepAttack(F) {
    const a = F.atk, t = ++a.t, g = this.g;
    const hitWin = (t0, t1, range, dmg, kb, both, power) => {
      if (t >= t0 && t <= t1) this.hitBoarders(F, range, dmg, kb, both, a.hit, power);
    };
    switch (a.type) {
      case 'punch': hitWin(3, 6, 1.2, 1, 0.1, false, 1.0); if (t === 3) Sound.play('jump', { vol: 0.25, rate: 2.2 }); break;
      case 'kick': hitWin(5, 10, 1.45, 2, 0.3, true, 1.5); if (t === 4) Sound.play('roll', { vol: 0.4, rate: 1.6 }); break;
      case 'tailswipe': hitWin(5, 10, 1.5, 2, 0.3, true, 1.4); break;
      case 'flykick': hitWin(3, 16, 1.2, 3, 0.4, false, 1.7); if (t > 14) F.vx *= 0.8; break;
      case 'spin': hitWin(1, 30, 0.95, 2, 0.3, true, 1.3); F.vx *= 0.97; break;
      case 'uppercut': if (t >= 5 && t <= 9) this.hitBoarders(F, 1.2, 2, 0.04, false, a.hit, 1.5, 0.3); break;
      case 'boost': hitWin(1, 24, 1.2, 2, 0.5, true, 1.8); if (t > 18) F.vx *= 0.75; if (t % 3 === 0) this.sparkAt(this.sonic.root, 0x7fe3ff, 2); break;
      case 'smack':
        // Tails' tails: slow wind-up, then a 360° whip that clears the wing
        hitWin(10, 14, 1.9, 3, 0.4, true, 1.9);
        if (t === 10) { this.shake = 9; Sound.punch(1.6); g.hitStop = 4; }
        break;
      case 'tailspin':
        if (t % 9 === 0) a.hit.clear();
        hitWin(1, 54, 1.3, 1, 0.14, true, 0.8);
        break;
      case 'swing': {
        const b = F.hold;
        if (!b || b.state !== 'held') { F.hold = null; a.t = a.dur; break; }
        const ang = (t / a.dur) * Math.PI * 4;
        b.x = F.x + Math.cos(ang) * F.face * 1.0; b.z = Math.sin(ang) * 1.0; b.y = F.y + 0.35;
        // the swung body bowls over anyone it passes
        for (const o of this.boarders) if (o !== b && o.state !== 'dead' && o.state !== 'fall' && !a.hit.has(o) && Math.abs(o.x - b.x) < 0.7 && Math.abs(o.z || 0) < 0.6) { a.hit.add(o); this.damage(o, 2, Math.sign(o.x - F.x) * 0.3, 1.3); }
        if (t === a.dur) {
          b.state = 'thrown'; b.vx = F.face * 0.42; b.vy = 0.14; b.z = 0; F.hold = null;
          Sound.punch(1.4); this.addScore(b, 1.5);
        }
        break;
      }
    }
    if (a.t >= a.dur) F.atk = null;
  }

  nearest(F, range, front) {
    let best = null, bd = range;
    for (const b of this.boarders) {
      if (b.state === 'dead' || b.state === 'fall' || b.state === 'thrown' || b.state === 'held' || b.state === 'drop') continue;
      const dx = b.x - F.x;
      if (front && Math.sign(dx) !== F.face && Math.abs(dx) > 0.25) continue;
      const d = Math.abs(dx) + Math.abs(b.y - F.y) * 0.5;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  hitBoarders(F, range, dmg, kb, both, hitSet, power, launch = 0) {
    for (const b of this.boarders) {
      if (hitSet.has(b) || b.state === 'dead' || b.state === 'fall' || b.state === 'thrown' || b.state === 'held' || b.state === 'drop') continue;
      const dx = b.x - F.x;
      if (!both && Math.sign(dx) !== F.face && Math.abs(dx) > 0.2) continue;
      if (Math.abs(dx) > range || Math.abs(b.y - F.y) > 1.3) continue;
      hitSet.add(b);
      // the combo counter: keep the hits coming for bonus damage
      this.comboN = this.comboT > 0 ? this.comboN + 1 : 1; this.comboT = 80;
      const bonus = this.comboN >= 6 ? 1 : 0;
      if (b.state === 'frozen') { this.damage(b, 99, (Math.sign(dx) || F.face) * 0.6, power + 0.5, 'SHATTER!'); continue; }
      this.damage(b, dmg + bonus, (Math.sign(dx) || F.face) * kb, power);
      this.boost = Math.min(100, this.boost + 4);
      if (launch && b.state === 'hurt') { b.state = 'air'; b.vy = launch; b.t = 0; }
      else if (b.state === 'hurt' && b.y > 0.2) { b.state = 'air'; b.vy = 0.14; }   // juggle: keep them up
      if (b.kind === 'zom' && b.hp > 0 && b.hp <= 2) this.stagger(b);
    }
  }

  damage(b, dmg, kb, power = 1, word) {
    b.hp -= dmg; b.vx = kb; b.vy = 0.07 + power * 0.03; b.t = 0;
    const kill = b.hp <= 0;
    this.impact(b, power * (kill ? 1.3 : 1), kill, word);
    if (kill) { b.state = 'dead'; b.vx = (Math.sign(kb) || 1) * (0.35 + power * 0.15); b.vy = 0.2 + power * 0.05; this.addScore(b, 1); this.boost = Math.min(100, this.boost + 10); this.rings += 1; }
    else if (b.state !== 'stagger') b.state = 'hurt';
  }

  // Every hit should land: a white flash, a ring, sparks, bits of the enemy,
  // hit-stop, a camera kick, a layered thud, and a P5-style word on screen.
  impact(b, power, kill, word) {
    const S = this.scene, g = this.g;
    b.m.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(b.m.matrixWorld); p.y += 0.45;
    const flash = new THREE.Sprite(this.glowMat.clone()); flash.material.color.setHex(0xffffff); flash.position.copy(p); S.add(flash);
    this.fx.push({ m: flash, t: 0, dur: 8, size: 1.4 * power, v: new THREE.Vector3(), own: true });
    const ring = new THREE.Mesh(this.ringGeo || (this.ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 28)), new THREE.MeshBasicMaterial({ color: power > 1.4 ? 0xffd23f : 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.copy(p); ring.quaternion.copy(this.camera.quaternion); S.add(ring);
    this.fx.push({ m: ring, t: 0, dur: 14, size: 0.6 * power, grow: 2.2 * power, v: new THREE.Vector3(), own: true, ring: true });
    for (let i = 0; i < 4 + power * 4; i++) {
      const sp = new THREE.Sprite(this.glowMat.clone()); sp.material.color.setHex(i % 3 ? 0xffe08a : 0xff8a3a); sp.position.copy(p); S.add(sp);
      const a = Math.random() * Math.PI * 2, v = 0.08 + Math.random() * 0.12 * power;
      this.fx.push({ m: sp, t: 0, dur: 12 + Math.random() * 8, size: 0.25, v: new THREE.Vector3(Math.cos(a) * v, Math.sin(a) * v, (Math.random() - 0.5) * v), own: true, shrink: true });
    }
    // feathers off a bird, metal plates off a Zombot
    const bits = b.kind === 'zom' ? 0x6f8a68 : 0x4a7a8c;
    for (let i = 0; i < (kill ? 7 : 3); i++) {
      const c = new THREE.Mesh(this.bitGeo || (this.bitGeo = new THREE.BoxGeometry(0.12, 0.03, 0.2)), new THREE.MeshLambertMaterial({ color: Math.random() < 0.3 ? 0x7dff4a : bits }));
      c.position.copy(p); S.add(c);
      this.debris.push({ m: c, t: 140, v: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.05 + Math.random() * 0.15, -0.05 - Math.random() * 0.2), spin: { x: Math.random() * 0.4, z: Math.random() * 0.4 } });
    }
    this.shake = Math.max(this.shake, 4 + power * 5);
    g.hitStop = Math.max(g.hitStop || 0, kill ? 7 : power > 1.4 ? 5 : 3);
    if (power > 1.4 || kill) this.flash = Math.max(this.flash, 0.12);
    Sound.punch(power * 1.15);
    if (power > 1.3) Sound.play('bosshit', { vol: 0.55, rate: 0.85 + Math.random() * 0.2 });
    if (kill) Sound.play('boom', { vol: 0.35, rate: 1.6 });
    const words = kill ? ['SMASH!', 'KO!', 'GONE!', 'TAKE THAT!'] : power > 1.4 ? ['BAM!', 'WHAM!', 'CRACK!'] : ['POW!', 'HIT!', 'BAP!'];
    this.pops.push({ text: word || words[Math.random() * words.length | 0], p: p.clone(), t: 0, big: kill || power > 1.4 || !!word, rot: (Math.random() - 0.5) * 0.4 });
  }

  addScore(b, mult) { this.g.addScore(Math.round((b.kind === 'zom' ? 300 : 100) * mult)); }

  dropHeld(F) { if (F.hold) { F.hold.state = 'hurt'; F.hold.t = 0; F.hold.z = 0; F.hold = null; } }

  tryBite(F) {
    const b = this.nearest(F, 1.0, false), g = this.g;
    if (!b) {
      Sound.play('pop', { rate: 0.7 });
      g.speech.say(F.id, F.id === 'sonic' ? '...Why did I just try to bite the air?' : 'Uh... I thought I saw a chili dog.', { dur: 90, cool: 300 });
      return;
    }
    this.infect(F, b);
  }

  // ------------------------------------------------- enemies in the air
  updateFoes() {
    const P = this.planePos(this.v3), auto = this.active !== 'pilot' && this.pilot === 'tails' && this.phase === 'board';
    const playing = this.phase === 'sky' || this.phase === 'board';
    for (const f of this.foes) {
      if (this.freezeT > 0) {
        if (!f.ice) { f.ice = new THREE.Sprite(this.iceMat); f.ice.scale.setScalar(f.kind === 'jet' ? 4 : 2); f.m.add(f.ice); }
        continue;
      }
      if (f.ice) { f.m.remove(f.ice); f.ice = null; }
      f.t++;
      if (f.kind === 'bird') {
        // infected birds swoop in to land on the wing (plane space)
        const k = Math.min(1, f.t / f.dur), e = 1 - Math.pow(1 - k, 2);
        f.m.position.lerpVectors(f.from, f.to, e); f.m.position.y += Math.sin(k * Math.PI) * 1.5;
        f.m.rotation.y = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z);
        const wl = f.m.getObjectByName('wingL'), wr = f.m.getObjectByName('wingR'), fl = Math.sin(f.t * 0.6) * 0.8;
        if (wl) wl.rotation.z = fl; if (wr) wr.rotation.z = -fl;
        f.x = P.x + f.m.position.x; f.y = P.y + f.m.position.y; f.z = f.m.position.z;
        if (k >= 1 && f.hp > 0) {
          f.dead = true;
          this.boarders.push({ kind: 'bird', m: f.m, x: f.to.x, y: 0, z: 0, vx: 0, vy: 0, hp: 3, state: 'claw', t: 0, face: f.to.x > 0 ? -1 : 1 });
          this.g.speech.say(this.wingChar === 'sonic' ? 'sonic' : 'tails', 'Another one landed!', { dur: 70, cool: 500, coolKey: 'landed' });
        }
        continue;
      }
      if (f.kind === 'jet') {
        f.z += f.vz;
        f.x = f.bx + Math.sin(f.t * f.sway + f.ph) * 4; f.y = f.by + Math.sin(f.t * 0.03 + f.ph) * 1.2;
        f.m.position.set(f.x, f.y, f.z); f.m.rotation.z = Math.cos(f.t * f.sway + f.ph) * 0.5;
        if (playing && f.z > 20 && f.z < 160 && --f.fireT <= 0) { f.fireT = (auto ? 75 : 105) + Math.random() * 60; this.fireBolt(f, auto); }
        if (f.z < -30) f.dead = true;
      } else if (f.kind === 'drone') {
        const tz = f.t < 560 ? 26 : 140;
        f.z += (tz - f.z) * 0.02;
        const tx = P.x + f.ox + Math.sin(f.t * 0.02 + f.ph) * 3, ty = P.y + f.oy + Math.sin(f.t * 0.035 + f.ph) * 1.5 + (f.t > 560 ? (f.t - 560) * 0.1 : 0);
        f.x += (tx - f.x) * 0.03; f.y += (ty - f.y) * 0.03;
        f.m.position.set(f.x, f.y, f.z); f.m.rotation.set(-0.6, Math.PI + Math.sin(f.t * 0.05) * 0.3, 0);
        if (playing && f.t > 60 && f.t < 560 && --f.fireT <= 0) { f.fireT = (auto ? 65 : 80) + Math.random() * 40; this.fireBolt(f, auto); }
        if (f.t > 760) f.dead = true;
      }
    }
    this.cull(this.foes);
  }

  cull(list) {
    for (const o of list) if (o.dead && o.m) { if (o.m.parent) o.m.parent.remove(o.m); }
    const keep = list.filter((o) => !o.dead);
    list.length = 0; list.push(...keep);
  }

  fireBolt(f, accurate) {
    const P = this.planePos(this.v3b);
    const from = new THREE.Vector3(f.x, f.y, f.z - 1.5);
    const aim = P.clone(); aim.y += 0.5;
    // a plane nobody is flying is an easier target, but they still miss a lot
    const spread = accurate ? 1.6 : 4;
    aim.add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 1.2, 0));
    const v = aim.sub(from).normalize().multiplyScalar(1.05);
    const m = new THREE.Sprite(this.boltMat); m.scale.setScalar(1.6); m.position.copy(from); this.scene.add(m);
    this.bolts.push({ m, v, t: 0 });
    if (f.z < 120) Sound.zap(0.12);
  }

  updateShots() {
    for (const s of this.shots) {
      s.t++;
      if (s.missile) {
        if (s.t === 8) { Sound.play('roll', { rate: 1.8, vol: 0.35 }); Sound.zap(0.08); }
        if (s.t > 8) {
          const tg = s.target && !s.target.dead && s.target.hp > 0 ? s.target : null;
          const want = tg ? new THREE.Vector3(tg.x, tg.y, tg.z).sub(s.m.position).normalize().multiplyScalar(2.1) : new THREE.Vector3(0, 0.02, 2.1);
          // a corkscrew wobble before it straightens out on the target
          const wob = Math.max(0, 1 - (s.t - 8) / 30) * 0.35;
          want.x += Math.cos(s.t * 0.5 + s.spin) * wob; want.y += Math.sin(s.t * 0.5 + s.spin) * wob;
          s.v.lerp(want, s.t < 20 ? 0.08 : 0.2);
          s.flame.scale.setScalar(1.6 + Math.random() * 0.9);
          const sm = new THREE.Sprite(this.smokeMat.clone()); sm.material.color.setHex(0xe8dcd8); sm.position.copy(s.m.position); this.scene.add(sm);
          this.fx.push({ m: sm, t: 0, dur: 55, size: 1.3, vy: 0, smoke: true, v: new THREE.Vector3(0, 0.01, -1.1) });
          if (s.t % 2) { const sp = new THREE.Sprite(this.flameMat); sp.position.copy(s.m.position); this.scene.add(sp); this.fx.push({ m: sp, t: 0, dur: 8, size: 0.9, v: new THREE.Vector3(0, 0, -1.1), shrink: true }); }
        } else s.v.y -= 0.01;
        s.m.lookAt(s.m.position.clone().add(s.v));
      }
      s.m.position.add(s.v);
      if (s.t > (s.missile ? 170 : 70)) s.dead = true;
      for (const f of this.foes) {
        if (f.hp <= 0 || f.dead) continue;
        const dx = f.x - s.m.position.x, dy = f.y - s.m.position.y, dz = f.z - s.m.position.z;
        const r = f.r * (s.missile ? 1.4 : 1);
        if (dx * dx + dy * dy + dz * dz < r * r || (Math.abs(dz) < 2 && dx * dx + dy * dy < r * r)) {
          s.dead = true; f.hp -= s.dmg;
          if (s.missile) this.missileBlast(s.m.position.clone());
          else this.burstAt(s.m.position, 0.4, this.laserT > 0 ? 0x7fd0ff : 0xfff0a0);
          if (f.hp <= 0) this.killFoe(f);
          else f.flash = 6;
          break;
        }
      }
    }
    this.cull(this.shots);
  }

  missileBlast(pos) {
    const S = this.scene;
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(this.glowMat.clone()); sp.material.color.setHex([0xffffff, 0xffd060, 0xff7a20, 0xff4010][i % 4]);
      sp.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)); S.add(sp);
      this.fx.push({ m: sp, t: 0, dur: 24 + i * 4, size: 6 + i * 1.2, v: new THREE.Vector3(0, 0.03, -0.6), own: true });
    }
    const ring = new THREE.Mesh(this.ringGeo || (this.ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 28)), new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.copy(pos); ring.quaternion.copy(this.camera.quaternion); S.add(ring);
    this.fx.push({ m: ring, t: 0, dur: 20, size: 2, grow: 16, v: new THREE.Vector3(0, 0, -0.6), own: true, ring: true });
    for (let i = 0; i < 4; i++) { const sm = new THREE.Sprite(this.smokeMat.clone()); sm.position.copy(pos); S.add(sm); this.fx.push({ m: sm, t: 0, dur: 60, size: 4, vy: 0.02, smoke: true, v: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.04, -0.6) }); }
    this.shake = Math.max(this.shake, 9); this.flash = Math.max(this.flash, 0.08);
    Sound.play('boom', { vol: 0.9, rate: 0.7 + Math.random() * 0.2 });
  }

  killFoe(f) {
    f.dead = true; f.hp = 0;
    const pos = new THREE.Vector3(f.x, f.y, f.z);
    this.burstAt(pos, f.kind === 'jet' ? 2.4 : 1.4);
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(this.bitGeo || (this.bitGeo = new THREE.BoxGeometry(0.12, 0.03, 0.2)), new THREE.MeshLambertMaterial({ color: i % 3 ? 0x59605a : 0x7dff4a }));
      c.scale.setScalar(4); c.position.copy(pos); this.scene.add(c);
      this.debris.push({ m: c, t: 100, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, -0.6 - Math.random() * 0.5), spin: { x: Math.random() * 0.3, z: Math.random() * 0.3 } });
    }
    Sound.play('boom', { vol: 0.6, rate: 0.9 + Math.random() * 0.3 });
    this.g.addScore(f.kind === 'jet' ? 200 : f.kind === 'drone' ? 300 : 100);
    this.hits = (this.hits || 0) + 1;
    this.rings += f.kind === 'bird' ? 1 : 2;
    if (f.kind !== 'bird') this.hull = Math.min(100, this.hull + 1);
    // power-ups: rings patch the plane up, the capsule gives hyper lasers
    if (f.kind !== 'bird') { const r = Math.random(); if (r < 0.22) this.dropItem(pos, 'ring'); else if (r < 0.3) this.dropItem(pos, 'laser'); }
  }

  dropItem(pos, kind) {
    let m;
    if (kind === 'ring') m = new THREE.Mesh(this.itemRingGeo || (this.itemRingGeo = new THREE.TorusGeometry(0.7, 0.16, 8, 20)), this.itemRingMat || (this.itemRingMat = new THREE.MeshPhongMaterial({ color: 0xffd23f, emissive: 0x6a4a00, shininess: 90 })));
    else {
      m = new THREE.Group();
      m.add(new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.45, 0.8, 6, 12) : new THREE.SphereGeometry(0.6, 12, 10), new THREE.MeshPhongMaterial({ color: 0x3a8aff, emissive: 0x0a2a6a, shininess: 90 })));
      const glow = new THREE.Sprite(this.glowMat.clone()); glow.material.color.setHex(0x7fd0ff); glow.scale.setScalar(3); m.add(glow);
    }
    m.position.copy(pos); this.scene.add(m);
    this.items.push({ m, kind, t: 0 });
  }

  updateItems() {
    const P = this.planePos(this.v3b);
    for (const it of this.items) {
      it.t++;
      const p = it.m.position;
      p.z -= 0.45; p.y += (P.y + 0.6 - p.y) * 0.02; p.x += (P.x - p.x) * 0.004;
      it.m.rotation.y += 0.08;
      if (Math.abs(p.x - P.x) < 3 && Math.abs(p.y - P.y - 0.5) < 2.2 && Math.abs(p.z) < 2) {
        it.dead = true;
        if (it.kind === 'ring') { this.hull = Math.min(100, this.hull + 6); this.rings += 10; Sound.ring(); this.pops.push({ text: 'REPAIR!', p: p.clone(), t: 0, big: false, rot: -0.1 }); }
        else { this.laserT = 1200; Sound.play('shield'); this.pops.push({ text: 'HYPER LASER!', p: p.clone(), t: 0, big: true, rot: 0.08 }); this.g.speech.say('tails', 'Hyper lasers online!', { dur: 80 }); }
      }
      if (p.z < -20) it.dead = true;
    }
    this.cull(this.items);
  }

  updateBolts() {
    const P = this.planePos(this.v3);
    for (const b of this.bolts) {
      b.t++; b.m.position.add(b.v);
      b.m.material.rotation = b.t * 0.3;
      const d = b.m.position;
      if (this.phase === 'sky' || this.phase === 'board') {
        const lx = d.x - P.x, ly = d.y - P.y, lz = d.z;
        if (Math.abs(lz) < 1.3 && Math.abs(lx) < 3.9 && ly > -0.6 && ly < 1.9) {
          b.dead = true;
          if (this.roll > 0 || this.shieldT > 0 || this.superT > 0) { if (this.shieldT > 0) this.burstAt(d, 0.6, 0x5fd8ff); continue; }   // rolled or shielded
          this.hull -= 3.5; this.shake = Math.max(this.shake, 7); this.addScorch(false);
          this.burstAt(d, 0.8, 0x9dff6a);
          Sound.play('bosshit', { vol: 0.6 });
        }
      }
      if (b.t > 220 || d.z < -25) b.dead = true;
    }
    this.cull(this.bolts);
  }

  // ------------------------------------------------- boarders on the wing
  updateBoarders() {
    const g = this.g;
    for (const b of this.boarders) {
      b.t++;
      const fighters = ['sonic', 'tails'].filter((id) => id !== this.pilot).map((id) => this.fighters[id]);
      switch (b.state) {
        case 'drop':
          b.vy -= 0.012; b.y += b.vy;
          if (b.y <= 0) { b.y = 0; b.vy = 0; b.state = 'claw'; this.shake = 5; Sound.play('boom', { vol: 0.4, rate: 1.5 }); }
          break;
        case 'stun': b.x += b.vx; b.vx *= 0.85; if (b.t > 60) { b.state = 'claw'; b.t = 0; } break;
        case 'stagger':
          // dizzy and swaying; finish it, or it shakes it off
          if (b.t > 260) { b.state = 'claw'; b.t = 0; b.hp = 3; }
          break;
        case 'frozen': if (this.freezeT <= 0) { b.state = 'claw'; b.t = 0; } break;
        case 'air':
          b.x += b.vx; b.vx *= 0.95; b.vy -= 0.012; b.y += b.vy; b.spin = (b.spin || 0) + 0.25;
          if (b.y <= 0 && b.vy < 0) {
            b.y = 0; b.vy = 0; b.spin = 0; b.state = 'hurt'; b.t = 0;
            this.damage(b, 1, b.vx * 0.5, 1.2, 'SLAM!');
            if (b.kind === 'zom' && b.hp > 0 && b.hp <= 2) this.stagger(b);
          }
          if (Math.abs(b.x) > TW.wingX + 0.2) { b.state = 'fall'; b.t = 0; }
          break;
        case 'claw': case 'walk': {
          if (this.freezeT > 0) { b.state = 'frozen'; b.t = 0; break; }
          // attack whoever is close, otherwise tear at the wing
          const F = fighters.find((f) => !this.away[f.id] && Math.abs(f.x - b.x) < (b.kind === 'zom' ? 1.1 : 0.95) && f.y < 0.8);
          if (F) { b.state = 'windup'; b.t = 0; b.face = Math.sign(F.x - b.x) || 1; b.target = F; break; }
          if (b.kind === 'zom' && fighters[0] && !this.away[fighters[0].id]) {
            const F2 = fighters[0], d = F2.x - b.x;
            if (Math.abs(d) < 3.5) { b.state = 'walk'; b.face = Math.sign(d); b.x += b.face * 0.016; break; }
          }
          b.state = 'claw';
          if (b.t % 24 === 0) { this.sparkAt(b.m, 0xffc060, 1); if (b.t % 72 === 0) Sound.play('skid', { vol: 0.15, rate: 1.6 }); }
          break;
        }
        case 'windup': {
          if (this.freezeT > 0) { b.state = 'frozen'; b.t = 0; break; }
          const dur = b.kind === 'zom' ? 34 : 26;
          if (b.t >= dur) {
            const F = b.target;
            if (F && Math.abs(F.x - b.x) < 1.25 && F.y < 0.9 && !F.inv && this.pilot !== F.id) {
              F.stun = 36; F.kb = b.face * (b.kind === 'zom' ? 0.16 : 0.09); F.inv = 50; F.atk = null; this.dropHeld(F);
              Sound.play('hurt', { vol: 0.6 }); this.shake = 5;
              if (b.kind === 'zom') this.frame -= 2;
            }
            b.state = 'claw'; b.t = 0;
          }
          break;
        }
        case 'hurt':
          b.x += b.vx; b.vx *= 0.88;
          if (b.t > 18) b.state = 'claw';
          if (Math.abs(b.x) > TW.wingX + 0.2) { b.state = 'fall'; b.t = 0; }
          break;
        case 'dead': case 'thrown':
          b.x += b.vx; b.y += b.vy; b.vy -= 0.01; b.spin = (b.spin || 0) + 0.3;
          if (Math.abs(b.x) > TW.wingX + 0.3 || b.y < -0.2) { b.state = 'fall'; b.t = 0; }
          if (b.state === 'thrown') for (const o of this.boarders) {
            if (o !== b && (o.state === 'claw' || o.state === 'windup' || o.state === 'walk' || o.state === 'hurt') && Math.abs(o.x - b.x) < 0.6) this.damage(o, 3, Math.sign(b.vx) * 0.4, 1.3);
          }
          break;
        case 'fall':
          b.vy -= 0.012; b.y += b.vy; b.z = (b.z || 0) - 0.25; b.x += b.vx || 0;
          if (b.t > 80) { b.dead = true; if (b.hp > 0) this.addScore(b, 1); }
          break;
      }
      if (b.state !== 'held') b.x = b.state === 'fall' || b.state === 'dead' || b.state === 'thrown' ? b.x : Math.max(-TW.wingX, Math.min(TW.wingX, b.x));
      // pose it
      b.m.position.set(b.x, TW.wingY + b.y, TW.wingZ + (b.z || 0));
      const ice = b.state === 'frozen';
      if (ice && !b.ice) { b.ice = new THREE.Sprite(this.iceMat); b.ice.scale.setScalar(1.6); b.ice.position.y = 0.5; b.m.add(b.ice); }
      if (!ice && b.ice) { b.m.remove(b.ice); b.ice = null; }
      if (b.Z) {
        // the Zombots lurch, hunch, raise both arms and rake down
        const Z = b.Z;
        b.m.rotation.set(0, b.face > 0 ? Math.PI / 2 : -Math.PI / 2, b.state === 'held' || b.spin ? (b.spin || b.t * 0.4) : 0);
        Z.body.rotation.set(0.32, 0, Math.sin(b.t * 0.09) * 0.12);
        if (!ice) {
          if (b.state === 'windup') escLimbPose(Z, b.t > 26 ? 'rake' : 'claw', { t: b.t, k: 0.4 });
          else if (b.state === 'stagger') { Z.body.rotation.set(-0.25 + Math.sin(b.t * 0.13) * 0.15, Math.sin(b.t * 0.07) * 0.4, Math.sin(b.t * 0.11) * 0.3); escLimbPose(Z, 'hurt', { t: b.t }); }
          else escLimbPose(Z, 'zombie', { t: b.t });
          if (b.state === 'walk') Z.body.position.y = Math.abs(Math.sin(b.t * 0.12)) * 0.06;
        }
      } else {
        const peck = b.state === 'claw' ? Math.max(0, Math.sin(b.t * 0.35)) * 0.5 : b.state === 'windup' ? -0.4 : 0;
        b.m.rotation.set(ice ? 0 : peck, b.face > 0 ? Math.PI / 2 : -Math.PI / 2, b.state === 'held' || b.spin ? (b.spin || b.t * 0.4) : 0);
      }
      if (b.kind === 'bird') {
        const wl = b.m.getObjectByName('wingL'), wr = b.m.getObjectByName('wingR'), fl = b.state === 'windup' ? 0.9 : Math.sin(b.t * 0.2) * 0.2;
        if (wl) wl.rotation.z = fl; if (wr) wr.rotation.z = -fl;
      }
    }
    this.cull(this.boarders);
  }

  // ------------------------------------------------- effects
  sparkAt(obj, color, n) {
    obj.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld); p.y += 0.4;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(this.glowMat.clone()); sp.material.color.setHex(color);
      sp.position.copy(p); this.scene.add(sp);
      this.fx.push({ m: sp, t: 0, dur: 14, size: 0.5, v: new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.15, (Math.random() - 0.5) * 0.2 - 0.1), own: true });
    }
  }

  burstAt(pos, big = 1, color) {
    const n = big > 1 ? 4 : 1;
    for (let i = 0; i < n; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * big, (Math.random() - 0.5) * big, (Math.random() - 0.5) * big));
      const sp = new THREE.Sprite(color ? this.glowMat.clone() : this.glowMat); if (color) sp.material.color.setHex(color);
      sp.position.copy(p); this.scene.add(sp);
      this.fx.push({ m: sp, t: 0, dur: 24 + Math.random() * 10, size: 2.2 * big, vy: 0.02, own: !!color, v: new THREE.Vector3(0, 0, -0.4) });
      if (big > 1) { const sm = new THREE.Sprite(this.smokeMat.clone()); sm.position.copy(p); this.scene.add(sm); this.fx.push({ m: sm, t: 0, dur: 50, size: 2.5 * big, vy: 0.02, smoke: true, v: new THREE.Vector3(0, 0.02, -0.45) }); }
    }
  }

  updateFX() {
    for (const f of this.fx) {
      f.t++;
      const k = f.t / f.dur;
      if (f.ring) f.m.scale.setScalar(f.size + f.grow * k);
      else f.m.scale.setScalar(f.size * (f.smoke ? 0.6 + k : f.shrink ? 1 - k : 0.5 + k * 0.8));
      if (f.v) f.m.position.add(f.v); else f.m.position.y += f.vy;
      if (f.smoke) f.m.material.opacity = Math.min(1, 2.5 * (1 - k));
      else if (f.own) f.m.material.opacity = 1 - k;
      if (f.t >= f.dur) { this.scene.remove(f.m); if (f.smoke || f.own) f.m.material.dispose(); f.dead = true; }
    }
    for (const p of this.pops) p.t++;
    this.pops = this.pops.filter((p) => p.t < 40);
    this.fx = this.fx.filter((f) => !f.dead);
    for (const d of this.debris) {
      d.t++; d.v.y -= 0.012; d.m.position.add(d.v);
      d.m.rotation.x += d.spin.x; d.m.rotation.z += d.spin.z;
      if (d.t > 200) { this.scene.remove(d.m); if (d.m.material && d.m.geometry === this.bitGeo) d.m.material.dispose(); d.dead = true; }
    }
    this.debris = this.debris.filter((d) => !d.dead);
    // world scroll: clouds and the sea rush past
    const spd = this.phase === 'crash' ? this.crashSpeed : 1.1;
    for (const c of this.clouds) { c.position.z -= spd * (c.scale.x > 100 ? 0.5 : 1); if (c.position.z < -60) this.placeCloud(c, 360 + Math.random() * 60); }
    this.seaTex.offset.y += spd * 0.0004;
    this.updateDread();
    if (this.beach) this.beach.position.z -= spd;
  }

  // ------------------------------------------------- finishers
  startFinisher(F, b) {
    F.atk = null; F.face = Math.sign(b.x - F.x) || F.face;
    b.state = 'held'; b.t = 0;
    const sonic = F.id === 'sonic';
    this.finisher = { F, b, t: 0, kind: sonic ? 'zandatsu' : 'fatality', x0: F.x };
    this.banner = { text: sonic ? 'BLADE MODE' : 'FATALITY', t: 0, col: sonic ? '#5fd8ff' : '#d4141e', sub: true };
    Sound.play('charge', { rate: 0.6, vol: 0.7 });
    this.g.speech.say(F.id, sonic ? "You're done." : 'Sorry... you were someone, once.', { dur: 90, prio: 6 });
  }

  updateFinisher() {
    const X = this.finisher, F = X.F, b = X.b, t = ++X.t, M = this[F.id];
    if (X.kind === 'zandatsu') {
      // Sonic cuts through it again and again in slow motion (blade mode)
      if (t >= 20 && t < 80) {
        const pass = Math.floor((t - 20) / 12), k = ((t - 20) % 12) / 12;
        const from = pass % 2 ? 1.3 : -1.3;
        F.x = b.x + from * (1 - 2 * k) * F.face; F.y = 0.3 + Math.sin(k * Math.PI) * 0.4;
        F.atk = { type: 'spin', t: 5, dur: 99, hit: new Set() };
        if ((t - 20) % 12 === 6) {
          this.slashes.push({ x: 0, y: 0, ang: Math.random() * Math.PI, t: 0, at: b });
          Sound.play('release', { rate: 1.8, vol: 0.6 }); Sound.punch(1.2); this.sparkAt(b.m, 0x9fe8ff, 6);
          b.spin = (b.spin || 0) + 0.3;
        }
      }
    } else {
      // Tails lifts it on spinning tails, then whips it apart
      F.atk = { type: 'tailspin', t: t, dur: 999, hit: new Set() };
      if (t >= 15 && t < 70) { b.y = Math.min(1.8, b.y + 0.04); b.spin = (b.spin || 0) + 0.35; F.y = Math.min(0.9, F.y + 0.03); if (t % 8 === 0) { Sound.punch(0.9); this.sparkAt(b.m, 0x7dff4a, 3); } }
      if (t === 70) { F.atk = { type: 'smack', t: 9, dur: 30, hit: new Set() }; }
    }
    if (t === 82) {
      // it comes apart; the core it leaves behind patches the wing
      this.shatter(b.m, b.Z ? b.Z.color : 0x6f8a68, 34);
      b.dead = true; b.m.parent && b.m.parent.remove(b.m);
      this.banner = { text: X.kind === 'zandatsu' ? 'ZANDATSU!' : 'FATALITY', t: 0, col: X.kind === 'zandatsu' ? '#5fd8ff' : '#d4141e' };
      this.frame = Math.min(100, this.frame + 8); this.hull = Math.min(100, this.hull + 3); this.boost = 100;
      this.rings += 3; this.g.addScore(1000); this.hits = (this.hits || 0) + 1;
      this.shake = 20; this.flash = 0.5; Sound.play('boom', { rate: 0.8 }); Sound.play('shield', { rate: 0.8 });
      this.pops.push({ text: '+WING REPAIR', p: new THREE.Vector3().setFromMatrixPosition(M.root.matrixWorld).add(new THREE.Vector3(0, 1.4, 0)), t: 0, big: false, rot: -0.05 });
    }
    if (!b.dead) { b.m.position.set(b.x, TW.wingY + b.y, TW.wingZ); b.m.rotation.z = b.spin || 0; if (b.Z) escLimbPose(b.Z, 'hurt', { t }); }
    if (t >= 82) { F.y = Math.max(0, F.y - 0.05); }
    if (t > 120) { F.atk = null; F.y = 0; F.x = Math.max(-TW.wingX, Math.min(TW.wingX, F.x)); this.finisher = null; this.cull(this.boarders); }
  }

  // blow something into little pieces: metal plates, sparks and green ooze
  shatter(obj, color, n = 24) {
    obj.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld); p.y += 0.5;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(this.bitGeo || (this.bitGeo = new THREE.BoxGeometry(0.12, 0.03, 0.2)), new THREE.MeshLambertMaterial({ color: i % 4 ? color : 0x24262a }));
      c.scale.setScalar(0.8 + Math.random() * 1.6); c.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.5));
      this.scene.add(c);
      this.debris.push({ m: c, t: 80, v: new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.05 + Math.random() * 0.3, (Math.random() - 0.5) * 0.35 - 0.1), spin: { x: Math.random() * 0.5, z: Math.random() * 0.5 } });
    }
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Sprite(this.glowMat.clone()); sp.material.color.setHex(i % 2 ? 0x7dff4a : 0xffffff); sp.position.copy(p); this.scene.add(sp);
      const a = Math.random() * Math.PI * 2;
      this.fx.push({ m: sp, t: 0, dur: 20 + i * 2, size: 0.8 + Math.random(), v: new THREE.Vector3(Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.05), own: true });
    }
  }

  // ------------------------------------------------- special moves (1-5)
  // Paid for with rings from kills. Cheapest to most expensive:
  // 1 Sonic Missile, 2 Freeze Ray, 3 Shield Ram, 4 Autopilot Combo, 5 Super Sonic
  useSpecial(n) {
    const g = this.g, cost = TOR_SPECIALS[n - 1].cost;
    if (this.striker || this.freezeT > 0 || this.shieldT > 0 || this.autoT > 0 || this.superT > 0 || this.finisher) { Sound.play('select', { rate: 0.6, vol: 0.4 }); return; }
    if (this.rings < cost) { Sound.play('select', { rate: 0.5, vol: 0.5 }); g.speech.say('tails', `We need ${cost} rings for that!`, { dur: 70, cool: 120 }); return; }
    this.rings -= cost;
    if ((n === 1 || n === 4 || n === 5) && this.pilot === 'sonic') this.swapRoles(false);
    this.cutin = { text: TOR_SPECIALS[n - 1].name, t: 0, who: n === 2 || n === 3 ? 'tails' : 'sonic' };
    Sound.play('checkpoint', { rate: 1.2 });
    const F = this.fighters.sonic; F.atk = null; if (F.hold) this.dropHeld(F);
    switch (n) {
      case 1: this.startStrike(['sonic'], { max: 6, air: true, speed: 2.6 }); g.speech.say('sonic', 'Fire me at them, Tails!', { dur: 80, prio: 6 }); break;
      case 2: this.freezeT = 420; this.freezeBeam(); g.speech.say('tails', 'Freeze ray! Get them off the wing!', { dur: 90, prio: 6 }); break;
      case 3: this.shieldT = 480; this.shieldMesh.visible = true; Sound.play('shield'); g.speech.say('tails', 'Shield up! Hold on, we\'re ramming them!', { dur: 100, prio: 6 }); break;
      case 4: this.autoT = 480; this.startStrike(['sonic', 'tails'], { max: 99, speed: 1.9, both: true, limit: 450 }); g.speech.say('tails', 'Autopilot on! Together, Sonic!', { dur: 90, prio: 6 }); break;
      case 5: this.superT = 720; this.goSuper(true); this.startStrike(['sonic'], { max: 999, speed: 3.0, both: true, limit: 720, super: true }); g.speech.say('sonic', 'Time to stop playing around.', { dur: 100, prio: 6 }); break;
    }
  }

  updateSpecials() {
    if (this.freezeT > 0 && --this.freezeT === 0) Sound.play('select', { rate: 0.8 });
    if (this.shieldT > 0) {
      this.shieldT--;
      this.shieldMesh.visible = this.shieldT > 60 || this.shieldT % 8 < 4;
      this.shieldMesh.material.opacity = 0.18 + Math.sin(this.t * 0.3) * 0.08;
      if (!this.shieldT) this.shieldMesh.visible = false;
      // ramming: anything the bubble touches is wrecked
      const P = this.planePos(this.v3b);
      for (const f of this.foes) {
        if (f.dead || f.hp <= 0 || f.kind === 'bird') continue;
        if (Math.abs(f.x - P.x) < 5 && Math.abs(f.y - P.y - 0.6) < 3 && Math.abs(f.z) < 4) {
          this.killFoe(f); this.missileBlast(new THREE.Vector3(f.x, f.y, f.z)); this.pops.push({ text: 'RAM!', p: new THREE.Vector3(f.x, f.y, f.z), t: 0, big: true, rot: 0.1 });
        }
      }
      // pulled into the bubble's path
      for (const f of this.foes) if (f.kind === 'jet' && !f.dead) f.by += (P.y - f.by) * 0.01;
    }
    if (this.autoT > 0) this.autoT--;
    if (this.superT > 0) {
      this.superT--;
      if (this.t % 2 === 0) this.sparkAt(this.sonic.root, 0xffe060, 2);
      if (!this.superT) this.goSuper(false);
    }
    if (this.striker) this.updateStrike();
  }

  freezeBeam() {
    const P = this.planePos(new THREE.Vector3());
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.3, 260, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.rotation.x = Math.PI / 2; beam.position.set(P.x, P.y + 0.5, 131); this.scene.add(beam);
    this.fx.push({ m: beam, t: 0, dur: 30, size: 1, v: new THREE.Vector3(), own: true, ring: true, grow: 2 });
    this.flash = 0.6; Sound.zap(0.7); Sound.play('shield', { rate: 0.5 });
  }

  goSuper(on) {
    const S = this.sonic;
    if (S.model) S.model.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m.userData.sc) m.userData.sc = m.color.clone();
        m.color.copy(on ? new THREE.Color(0xffe060) : m.userData.sc);
        if (m.emissive) m.emissive.setHex(on ? 0x6a4a00 : 0x000000);
      }
    });
    S.aura.material.color.setHex(on ? 0xffd040 : 0x4aa8ff);
    S.aura.visible = on; S.aura.material.opacity = on ? 0.4 : 0;
    if (on) { Sound.playMusic('invincible'); this.flash = 1; this.shake = 20; }
    else { Sound.playMusic(this.phase === 'board' ? 'crisis' : 'skychase'); this.flash = 0.4; }
  }

  // Sonic (and Tails) leave the plane and tear through targets one by one
  startStrike(ids, opts) {
    const S = this.scene;
    for (const id of ids) { this.away[id] = true; this[id].root.updateWorldMatrix(true, false); S.attach(this[id].root); }
    this.striker = Object.assign({ ids, t: 0, kills: 0, cur: null, phase: 'go', pos: new THREE.Vector3().setFromMatrixPosition(this.sonic.root.matrixWorld) }, opts);
    Sound.play('release', { vol: 0.8 }); Sound.boostBurst();
  }

  strikeTarget(st) {
    const P = this.planePos(new THREE.Vector3());
    if (!st.air) {
      const b = this.boarders.find((b) => !b.dead && b.state !== 'dead' && b.state !== 'fall' && b.state !== 'thrown');
      if (b) return { b };
    }
    let best = null, bd = Infinity;
    for (const f of this.foes) { if (f.dead || f.hp <= 0) continue; const d = Math.hypot(f.x - st.pos.x, f.y - st.pos.y, f.z - st.pos.z); if (d < bd && f.z < 200) { bd = d; best = f; } }
    return best ? { f: best } : null;
  }

  updateStrike() {
    const st = this.striker, P = this.planePos(new THREE.Vector3());
    st.t++;
    if (st.phase === 'go') {
      if (st.cur && ((st.cur.f && (st.cur.f.dead || st.cur.f.hp <= 0)) || (st.cur.b && (st.cur.b.dead || st.cur.b.state === 'dead')))) st.cur = null;
      if (!st.cur) st.cur = this.strikeTarget(st);
      if (st.kills >= st.max || st.t > (st.limit || 400) || (!st.cur && !st.super)) st.phase = 'return';
    }
    let to;
    if (st.phase === 'return') to = this.plane.root.localToWorld(new THREE.Vector3(this.fighters.sonic.x, TW.wingY + 0.4, TW.wingZ));
    else if (st.cur && st.cur.f) to = new THREE.Vector3(st.cur.f.x, st.cur.f.y, st.cur.f.z);
    else if (st.cur && st.cur.b) to = new THREE.Vector3().setFromMatrixPosition(st.cur.b.m.matrixWorld).add(new THREE.Vector3(0, 0.5, 0));
    else to = P.clone().add(new THREE.Vector3(Math.cos(st.t * 0.05) * 6, 4 + Math.sin(st.t * 0.07) * 2, 8 + Math.sin(st.t * 0.05) * 5));   // Super Sonic circling, waiting
    const prev = st.pos.clone(), d = to.clone().sub(st.pos), dist = d.length();
    st.pos.add(d.multiplyScalar(Math.min(1, st.speed / Math.max(0.001, dist))));
    // a streak behind them
    if (st.t % 2 === 0) { const sp = new THREE.Sprite(this.glowMat.clone()); sp.material.color.setHex(st.super ? 0xffd040 : 0x4aa8ff); sp.position.copy(prev); this.scene.add(sp); this.fx.push({ m: sp, t: 0, dur: 16, size: 1.4, v: new THREE.Vector3(0, 0, -0.5), own: true, shrink: true }); }
    this.sonic.root.position.copy(st.pos); this.sonic.root.lookAt(to);
    if (st.ids.includes('tails')) { this.tails.root.position.copy(st.pos).add(new THREE.Vector3(Math.cos(st.t * 0.3) * 0.9, 0.7, Math.sin(st.t * 0.3) * 0.9)); this.tails.root.lookAt(to); }
    if (st.phase === 'go' && st.cur && dist < 1.4) {
      // shredded: spin-dash slashes leave nothing but shards
      if (st.cur.f) { const f = st.cur.f; this.shatter(f.m, f.kind === 'jet' ? 0x59605a : 0x6f8a68, 20); this.killFoe(f); }
      else { const b = st.cur.b; this.shatter(b.m, b.Z ? b.Z.color : 0x4a7a8c, 18); b.dead = true; if (b.m.parent) b.m.parent.remove(b.m); this.addScore(b, 1.5); this.rings += 1; }
      this.pops.push({ text: st.ids.length > 1 ? 'COMBO!' : st.super ? 'SUPER!' : 'SLASH!', p: st.pos.clone(), t: 0, big: true, rot: (Math.random() - 0.5) * 0.4 });
      this.slashes.push({ t: 0, ang: Math.random() * Math.PI, at: null, p: st.pos.clone() });
      Sound.punch(1.6); Sound.play('release', { rate: 1.6, vol: 0.5 }); this.shake = Math.max(this.shake, 8);
      st.kills++; st.cur = null;
    }
    if (st.phase === 'return' && dist < 0.6) this.endStrike();
  }

  endStrike() {
    const st = this.striker; if (!st) return;
    for (const id of st.ids) { this.away[id] = false; this.plane.root.attach(this[id].root); this[id].root.rotation.set(0, 0, 0); }
    this.sonic.ball.visible = false; this.sonic.body.visible = true;
    this.striker = null; this.autoT = 0;
    this.placeChars();
    this.cull(this.boarders);
  }

  // ------------------------------------------------- the plane falling apart
  addScorch(tear) {
    if (this.decals.length > 40) return;
    const r = Math.random(), m = new THREE.Mesh(this.decalGeo || (this.decalGeo = new THREE.PlaneGeometry(1, 1)), tear ? this.tearMat : this.scorchMat);
    const sz = tear ? 0.5 + Math.random() * 0.5 : 0.35 + Math.random() * 0.45;
    m.scale.set(sz, sz * (0.6 + Math.random() * 0.6), 1); m.rotation.z = Math.random() * 6;
    if (tear || r < 0.45) { m.position.set((Math.random() * 2 - 1) * 4, TW.wingY + 0.02, TW.wingZ + (Math.random() - 0.5) * 0.9); m.rotation.x = -Math.PI / 2; }
    else if (r < 0.75) { const sd = Math.random() < 0.5 ? -1 : 1; m.position.set(sd * (0.9 + Math.random() * 2.6), 0.16, -0.15 + (Math.random() - 0.5) * 0.9); m.rotation.x = -Math.PI / 2; }
    else { const sd = Math.random() < 0.5 ? -1 : 1; m.position.set(sd * 0.66, 0.6 + Math.random() * 0.6, -1.6 + Math.random() * 2.4); m.rotation.y = sd * Math.PI / 2; }
    this.plane.root.add(m); this.decals.push(m);
  }

  updateDamage() {
    const t = this.t, d = 1 - this.hull / 100, R = this.plane.root;
    if (!this.planeMats) { this.planeMats = []; this.plane.body.traverse((o) => { if (o.isMesh) this.planeMats.push(o.material); }); }
    for (const m of this.planeMats) m.color.setRGB(1 - 0.45 * d, 1 - 0.58 * d, 1 - 0.6 * d);   // paint blistering and blackening
    // the boarders' work shows on the wing
    const wantTears = Math.floor((100 - this.frame) / 9);
    while (this.tears < wantTears) { this.tears++; this.addScorch(true); if (this.frame < 50) this.debrisOff(); }
    if (this.phase !== 'sky' && this.phase !== 'board' && this.phase !== 'finale') return;
    const eng = R.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.55, 1.7));
    const every = this.hull < 30 ? 2 : this.hull < 50 ? 4 : this.hull < 75 ? 10 : 0;
    if (every && t % every === 0) {
      const sm = new THREE.Sprite(this.smokeMat.clone()); sm.material.color.setHex(this.hull < 50 ? 0x1a1414 : 0x8a8288); sm.position.copy(eng); this.scene.add(sm);
      this.fx.push({ m: sm, t: 0, dur: 50, size: this.hull < 50 ? 1.6 : 1, vy: 0.02, smoke: true, v: new THREE.Vector3(0, 0.03, -1.0) });
    }
    if (this.hull < 30 && t % 3 === 0) {
      const f = new THREE.Sprite(this.glowMat.clone()); f.material.color.setHex(Math.random() < 0.5 ? 0xff6a10 : 0xffc040); f.position.copy(eng); this.scene.add(f);
      this.fx.push({ m: f, t: 0, dur: 14, size: 1.1, v: new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.04, -0.7), own: true });
    }
    if (this.hull < 45 && Math.random() < 0.06) this.sparkAt(this.decals[(Math.random() * this.decals.length) | 0] || R, 0xffa040, 2);
    // a dying engine coughs and the airframe shudders
    if (this.plane.prop && this.hull < 25 && t % 40 < 6) this.plane.prop.rotation.z -= 0.6;
  }

  debrisOff() {
    const c = new THREE.Mesh(this.bitGeo || (this.bitGeo = new THREE.BoxGeometry(0.12, 0.03, 0.2)), new THREE.MeshLambertMaterial({ color: 0xc81e1e }));
    c.scale.set(3, 1, 2); c.position.copy(this.plane.root.localToWorld(new THREE.Vector3((Math.random() * 2 - 1) * 4, TW.wingY, TW.wingZ))); this.scene.add(c);
    this.debris.push({ m: c, t: 60, v: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.12, -0.6), spin: { x: 0.3, z: 0.2 } });
    Sound.play('skid', { vol: 0.3, rate: 1.4 });
  }

  // ------------------------------------------------- dread
  updateDread() {
    const t = this.t, P = this.planePos(this.v3b);
    for (const e of this.eyes) {
      e.t++;
      if (e.t === 1) e.m.position.set(P.x + (Math.random() - 0.5) * 160, P.y + 6 + Math.random() * 30, 170 + Math.random() * 120);
      const open = e.t > 0 && e.t < 150 && !(e.t > 60 && e.t < 66);   // a slow blink
      e.m.visible = open && this.phase !== 'crash';
      e.m.position.z -= 0.2;
      if (e.t > 150) e.t = -200 - Math.random() * 500;
    }
    // lightning far off, then the thunder a beat later
    if (this.lightning > 0) this.lightning--;
    if (this.phase !== 'crash' && Math.random() < 1 / 520) { this.lightning = 10; this.thunderAt = t + 30 + (Math.random() * 40 | 0); }
    if (t === this.thunderAt) Sound.play('boom', { rate: 0.3, vol: 0.45 });
    if (this.hemi) this.hemi.intensity = 1.0 + (this.lightning > 6 || this.lightning === 3 ? 1.4 : 0);
    if (this.phase === 'board' && Math.random() < 1 / 650) Sound.whisper();
  }

  // ------------------------------------------------- story beats
  startBoard() {
    this.phase = 'board'; this.t = 0; this.nextBird = 40; this.nextJets = 260; this.nextZom = 0;
    this.g.checkpointTornado = 'board';
    Sound.playMusic('crisis');
    this.g.speech.say('tails', "Something's landing on the wing!", { dur: 110, prio: 5 });
    this.g.later(120, () => this.g.speech.say('sonic', "Infected birds! I'll handle the wing, you fly!", { dur: 130, prio: 5 }));
  }

  startFinale() {
    const g = this.g;
    if (this.striker) this.endStrike();
    if (this.superT > 0) { this.superT = 0; this.goSuper(false); }
    this.freezeT = 0; this.shieldT = 0; this.autoT = 0; this.finisher = null; this.shieldMesh.visible = false;
    this.phase = 'finale'; this.t = 0; this.active = 'pilot';
    if (this.pilot !== 'tails') this.swapRoles(true);
    for (const b of this.boarders) if (b.state !== 'fall') { b.state = 'dead'; b.vx = (b.x > 0 ? 1 : -1) * 0.3; b.vy = 0.2; }
    for (const f of this.foes) if (f.kind === 'bird') f.dead = true;
    if (!this.jetTpl) this.spawnWave('none', 0);
    const big = this.jetTpl.clone(); big.scale.setScalar(7); big.rotation.y = Math.PI; big.position.set(0, 14, 320); this.scene.add(big);
    this.mother = big;
    this.charge = new THREE.Sprite(this.boltMat); this.charge.scale.setScalar(0.1); this.scene.add(this.charge);
    Sound.stopMusic(); Sound.drone(1);
    g.speech.say('tails', "Sonic... that's a BIG one!", { dur: 110, prio: 6 });
  }

  updateFinale() {
    const g = this.g, t = this.t, P = this.planePos(this.v3);
    const M = this.mother;
    if (t < 400) {
      M.position.z += (110 - M.position.z) * 0.03; M.position.x += (P.x - M.position.x) * 0.02; M.position.y += (P.y + 12 - M.position.y) * 0.02;
      this.px *= 0.98;
    }
    const nose = M.position.clone().add(new THREE.Vector3(0, -1, -20));
    if (t > 60 && t < 170) { this.charge.position.copy(nose); this.charge.scale.setScalar((t - 60) * 0.12 + Math.random() * 1.5); if (t % 10 === 0) Sound.play('charge', { rate: 0.5 + (t - 60) / 200, vol: 0.5 }); }
    if (t === 170) {
      this.charge.scale.setScalar(0.01);
      const from = nose, to = P.clone().add(new THREE.Vector3(0, 0.4, 1.7)), len = from.distanceTo(to);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, len, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x9dff6a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.copy(from).lerp(to, 0.5); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this.scene.add(beam); this.beam = beam;
      this.flash = 1; this.shake = 30; this.hull = 4; Sound.play('boom', { rate: 0.4 }); Sound.zap(0.6);
      this.burstAt(to, 1.2);
    }
    if (this.beam) { this.beam.material.opacity *= 0.9; if (this.beam.material.opacity < 0.02) { this.scene.remove(this.beam); this.beam = null; } }
    if (t === 200) g.speech.say('tails', "The engine's gone! We're going down!", { dur: 120, prio: 6 });
    if (t === 320) g.speech.say('sonic', 'Aim for the beach!', { dur: 100, prio: 6 });
    if (t > 170) {
      // trailing fire and smoke from the engine
      if (t % 3 === 0) {
        const sm = new THREE.Sprite(this.smokeMat.clone()); sm.position.set(P.x, P.y + 0.6, 1.4); this.scene.add(sm);
        this.fx.push({ m: sm, t: 0, dur: 70, size: 2.2, vy: 0.02, smoke: true, v: new THREE.Vector3(0, 0.03, -0.9) });
        if (t % 6 === 0) { const f = new THREE.Sprite(this.glowMat); f.position.set(P.x, P.y + 0.5, 1.6); this.scene.add(f); this.fx.push({ m: f, t: 0, dur: 18, size: 1.5, v: new THREE.Vector3(0, 0, -0.6) }); }
      }
      M.position.z += 0.8; M.position.y += 0.1;
      if (this.plane.prop) this.plane.prop.rotation.z += Math.max(0, 0.6 - (t - 170) * 0.004);
    }
    if (t === 260) this.buildBeach();
    if (t > 240) {
      // the long glide down to the sand
      const groundY = -59.2;
      this.py += Math.max(-0.22, (groundY - this.py) * 0.012);
      if (this.beach) this.beach.position.z = Math.max(-40, this.beach.position.z);
      if (this.py <= groundY + 0.05 && !this.landed) { this.landed = true; this.phase = 'crash'; this.t = 0; this.crashSpeed = 1.1; this.shake = 35; Sound.play('boom', { rate: 0.6 }); }
    }
  }

  buildBeach() {
    const B = this.beach = new THREE.Group();
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(400, 600), new THREE.MeshLambertMaterial({ color: 0xe9c88f }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, -59.9, 300); B.add(sand);
    const trunk = new THREE.MeshLambertMaterial({ color: 0x8a5a2b }), leaf = new THREE.MeshLambertMaterial({ color: 0x2f8a3a, side: THREE.DoubleSide });
    for (let i = 0; i < 40; i++) {
      const p = new THREE.Group(), side = i % 2 ? 1 : -1;
      p.position.set(side * (14 + Math.random() * 40), -60, 40 + i * 14);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 9, 6), trunk); tr.position.y = 4.5; tr.rotation.z = (Math.random() - 0.5) * 0.3; p.add(tr);
      for (let j = 0; j < 6; j++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5), leaf); l.position.y = 9; l.rotation.set(1.1, j * 1.05, 0); l.translateY(2); p.add(l); }
      B.add(p);
    }
    B.position.z = 160; this.scene.add(B);
  }

  updateCrash() {
    const g = this.g, t = this.t, P = this.planePos(this.v3);
    this.crashSpeed *= 0.975;
    this.py = -59.2 + Math.abs(Math.sin(t * 0.2)) * Math.max(0, 0.6 - t * 0.01);
    this.plane.root.rotation.z = Math.sin(t * 0.3) * 0.08 * Math.max(0, 1 - t / 120);
    if (t % 4 === 0 && this.crashSpeed > 0.15) {
      const sm = new THREE.Sprite(this.smokeMat.clone()); sm.position.set(P.x + (Math.random() - 0.5) * 3, -59.3, 0.5); sm.material.color.setHex(0xe9d0a0); this.scene.add(sm);
      this.fx.push({ m: sm, t: 0, dur: 60, size: 2.5, vy: 0.04, smoke: true, v: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.05, -this.crashSpeed * 0.6) });
      Sound.play('skid', { vol: 0.35, rate: 0.6 });
    }
    if (t === 150) {
      // both climb out alive
      this.pilot = 'none';
      this.fighters.sonic.x = -2.2; this.fighters.tails.x = -3.3;
      g.speech.say('sonic', '...Nice landing, buddy.', { dur: 120, prio: 6 });
    }
    if (t === 290) g.speech.say('tails', 'Any landing you can walk away from!', { dur: 130, prio: 6 });
    if (t === 440) { this.phase = 'tbc'; this.t = 0; Sound.drone(0.25); Sound.play('actclear', { rate: 0.7 }); }
  }

  fail(kind) {
    const g = this.g;
    if (this.striker) this.endStrike();
    if (this.superT > 0) { this.superT = 0; this.goSuper(false); }
    this.phase = kind; this.t = 0; this.shake = 25; this.flash = 0.6;
    g.speech.clear(); Sound.stopMusic();
    Sound.play(kind === 'torn' ? 'ringloss' : 'boom', { rate: 0.6 });
    const who = this.wingChar;
    if (kind === 'torn') {
      // the upper wing rips away and takes the fighter with it
      for (const m of this.wingMeshes) {
        m.visible = false;
        const c = m.clone(); m.updateWorldMatrix(true, false); c.applyMatrix4(m.matrixWorld); this.scene.add(c);
        this.debris.push({ m: c, t: 0, v: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.25, -0.5), spin: { x: 0.05, z: 0.08 } });
      }
      g.speech.say(who, who === 'sonic' ? 'Tails—!' : 'Sonic—!', { dur: 100, prio: 9 });
    } else g.speech.say('tails', "We're hit! I can't hold her!", { dur: 100, prio: 9 });
    const M = this[who]; M.root.updateWorldMatrix(true, false); this.scene.attach(M.root);
    this.faller = { M, v: new THREE.Vector3(0, 0.15, -0.35), spin: 0.12 };
  }

  updateFail() {
    const t = this.t;
    if (this.faller) {
      const f = this.faller; f.v.y -= 0.01; f.M.root.position.add(f.v); f.M.root.rotation.x += f.spin; f.M.root.rotation.z += f.spin * 0.6;
    }
    if (this.phase === 'shot') {
      this.planeSpin += 0.09; this.py -= 0.08 + t * 0.003;
      if (t % 3 === 0) this.burstAt(this.planePos(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 1)), 1);
    } else this.py -= 0.03;
    if (t === 170) this.g.tornadoDeath(this.phase === 'torn' || this.phase === 'shot' ? this.checkpoint() : 'sky');
  }

  checkpoint() { return this.g.checkpointTornado === 'board' ? 'board' : 'sky'; }

  infect(F, b) {
    const g = this.g;
    this.phase = 'infected'; this.t = 0; this.infected = F.id;
    g.speech.clear(); Sound.stopMusic(); Sound.punch(1.2); Sound.play('hurt');
    b.state = 'held'; F.atk = null;
    g.speech.say(F.id, F.id === 'sonic' ? 'CHOMP— ...ugh, it tastes like metal.' : 'CHOMP— ...eww, metal?', { dur: 120, prio: 9 });
  }

  updateInfected() {
    const t = this.t, g = this.g, M = this[this.infected];
    // the Metal Virus spreads from the mouth outward
    if (t > 60 && M.model) {
      const k = Math.min(1, (t - 60) / 120);
      M.model.root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { if (!m.userData.c0) m.userData.c0 = m.color.clone(); m.color.copy(m.userData.c0).lerp(new THREE.Color(0x6f8a68), k); m.emissive = new THREE.Color(0x163a0a).multiplyScalar(k); } });
    }
    if (t === 130) g.speech.say(this.infected === 'sonic' ? 'tails' : 'sonic', this.infected === 'sonic' ? 'S-Sonic? Your arm... it\'s turning to metal!' : 'Tails?! No, no, no...', { dur: 140, prio: 9 });
    if (t === 330) g.tornadoInfected();
  }

  // ------------------------------------------------- animation
  playClip(M, name, fade = 0.15, scale = 1) {
    if (!M.mixer || !M.actions[name]) return;
    const a = M.actions[name];
    a.timeScale = scale;
    if (M.cur === name) return;
    const prev = M.cur && M.actions[M.cur];
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (prev) prev.crossFadeTo(a, fade, false);
    M.cur = name;
  }

  animate() {
    const P = this.planePos(this.v3), t = this.t;
    const R = this.plane.root;
    R.position.copy(P);
    if (this.phase !== 'crash') {
      this.bank += ((-this.pvx * 2.2) - this.bank) * 0.15;
      this.pitch += ((-this.pvy * 1.6) - this.pitch) * 0.15;
    }
    const rollA = this.rollA = this.roll > 0 ? (1 - this.roll / 36) * Math.PI * 2 : 0;
    if (this.phase !== 'crash') R.rotation.set(this.pitch + (this.phase === 'shot' ? 0.3 : 0), 0, this.bank + rollA + this.planeSpin + Math.sin(t * 0.04) * 0.02 + (this.hull < 25 ? Math.sin(t * 1.7) * 0.03 * (1 - this.hull / 25) : 0));
    if (this.plane.prop && this.phase !== 'finale' && this.phase !== 'crash') this.plane.prop.rotation.z += 0.7;
    if (this.phase === 'crash') this.updateCrash();
    this.placeChars();
    for (const id of ['sonic', 'tails']) {
      const M = this[id], F = this.fighters[id];
      if (id === 'sonic') this.sonic.ball.visible = false;
      M.body.rotation.set(0, 0, 0); M.body.position.set(0, 0, 0);
      if (this.away[id]) {
        if (id === 'sonic') {
          const sup = this.superT > 0;
          this.sonic.ball.visible = !sup; this.sonic.body.visible = sup; this.sonic.ball.rotation.x += 0.6;
          if (sup) { this.playClip(M, 'homing'); if (M.mixer) M.mixer.update(1 / 60); escLimbPose(M, 'flykick', { t }); }
        } else { this.playClip(M, 'fly'); if (M.mixer) M.mixer.update(1 / 60); escLimbPose(M, 'wide', { t }); }
        continue;
      }
      if (this.faller && this.faller.M === M) { this.playClip(M, id === 'sonic' ? 'fall' : 'fly'); if (M.mixer) M.mixer.update(1 / 60); escLimbPose(M, 'hurt', { t }); continue; }
      if (id === this.pilot) {
        // sitting in the cockpit, hands on the stick
        this.playClip(M, 'idle');
        if (M.mixer) M.mixer.update(1 / 60);
        escLimbPose(M, 'pilot', { t, k: 0.5 });
        continue;
      }
      if (this.pilot === 'none') {   // standing on the sand after the crash
        M.root.position.set(F.x, -0.6, 2.2); M.root.rotation.set(0, Math.PI, 0);
        this.playClip(M, 'idle'); if (M.mixer) M.mixer.update(1 / 60);
        escLimbPose(M, 'relax', { t }); continue;
      }
      const a = F.atk, sonic = id === 'sonic';
      const air = F.y > 0.05, moving = Math.abs(F.vx) > 0.02;
      let clip = F.stun ? (sonic ? 'hit' : 'idle') : air ? (sonic ? (F.vy > 0 ? 'spring' : 'fall') : 'fly') : moving ? 'run' : 'idle';
      if (a) {
        if (a.type === 'kick' || a.type === 'flykick') clip = sonic ? 'kick' : clip;
        if (a.type === 'boost') clip = 'sprint';
        if (a.type === 'tailspin') clip = 'fly';
      }
      this.playClip(M, clip, 0.1, clip === 'run' ? 1.4 : 1);
      const ball = sonic && a && a.type === 'spin';
      if (sonic) {
        const S = this.sonic;
        S.ball.visible = !!ball; S.body.visible = !ball;
        if (ball) S.ball.rotation.x += 0.55;
        const boosting = a && a.type === 'boost', fl = 0.8 + Math.random() * 0.4;
        S.aura.material.opacity = boosting ? 0.5 * fl : 0; S.core.material.opacity = boosting ? 0.3 * fl : 0;
        S.aura.visible = S.core.visible = boosting;
        S.trailMat.opacity = boosting ? 0.6 : 0; S.trail.visible = boosting;
        const bk = boosting ? Math.max(0, 1 - a.t / 16) : 0;
        S.boom.material.opacity = bk * 0.8; S.boom.visible = bk > 0; S.boom.scale.setScalar(1 + (1 - bk) * 2);
        S.wave.material.opacity = bk; S.wave.visible = bk > 0; S.wave.scale.setScalar(1 + (1 - bk) * 6);
      }
      if (M.mixer) M.mixer.update(1 / 60);
      // body language on top of the clip
      if (F.stun) { M.body.rotation.x = -0.35; escLimbPose(M, 'hurt', { t }); continue; }
      if (!a) {
        escLimbPose(M, air ? 'air' : moving ? 'run' : sonic ? 'guard' : 'guard', { t: t * (moving ? 1.6 : 1) });
        if (!air && !moving) M.body.position.y = Math.abs(Math.sin(t * 0.15)) * 0.03;   // bouncing on the balls of his feet
        continue;
      }
      const ph = a.t / a.dur, snap = Math.min(1, a.t / 4);
      switch (a.type) {
        case 'punch':
          escLimbPose(M, a.side ? 'cross' : 'jab', { t, k: a.t < a.dur * 0.6 ? 0.8 : 0.3 });
          M.body.rotation.y = (a.side ? -0.35 : 0.25) * snap * (1 - ph); M.body.rotation.x = 0.15 * snap;
          break;
        case 'kick':
          M.body.rotation.y = -ph * Math.PI * 1.2; M.body.rotation.z = 0.25 * Math.sin(ph * Math.PI);
          escLimbPose(M, 'kick', { t, k: 0.75 });
          break;
        case 'flykick':
          M.body.rotation.x = 0.35; escLimbPose(M, 'flykick', { t, k: 0.8 });
          break;
        case 'boost':
          M.body.rotation.x = 0.35; escLimbPose(M, 'sprint', { t, k: 0.8 });
          break;
        case 'tailswipe': case 'smack': {
          const wind = a.type === 'smack' ? 9 : 5;
          M.body.rotation.y = a.t < wind ? -a.t * 0.06 : ((a.t - wind) / (a.dur - wind)) * Math.PI * 2 * (a.type === 'smack' ? 2 : 1);
          M.body.rotation.x = 0.2;
          escLimbPose(M, 'wide', { t, k: 0.6 });
          break;
        }
        case 'tailspin':
          M.body.rotation.y = a.t * 0.7; escLimbPose(M, 'wide', { t, k: 0.6 });
          break;
        case 'swing': {
          M.body.rotation.y = -(a.t / a.dur) * Math.PI * 4 * F.face;
          const aim = F.hold ? new THREE.Vector3().setFromMatrixPosition(F.hold.m.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(M.root.matrixWorld).add(new THREE.Vector3(0, 0.55, 0))).normalize() : null;
          if (aim) escLimbPose(M, 'grab', { aim }); else escLimbPose(M, 'jab', { t, side: 'R' });
          break;
        }
        case 'whiff': escLimbPose(M, 'cross', { t, k: 0.6 }); break;
        default: escLimbPose(M, 'guard', { t });
      }
    }
    this.sonic.root.visible = this.tails.root.visible = true;
  }

  // ------------------------------------------------- camera and drawing
  updateCamera() {
    const P = this.planePos(this.v3), t = this.t;
    let pos, look;
    this.camUp = null;
    const fightCam = this.active === 'fighter' && (this.phase === 'board');
    if (this.finisher) {
      // in close for the kill
      const X = this.finisher, R = this.plane.root, mid = (X.F.x + X.b.x) / 2;
      pos = R.localToWorld(new THREE.Vector3(mid + 0.6, TW.wingY + 1.3 + Math.sin(this.t * 0.02) * 0.2, -2.7));
      look = R.localToWorld(new THREE.Vector3(mid, TW.wingY + 0.6, TW.wingZ));
    } else if (this.phase === 'crash' || this.phase === 'tbc') {
      pos = new THREE.Vector3(P.x + 7, P.y + 3.5, 9); look = new THREE.Vector3(P.x - 1, P.y + 0.8, 0);
    } else if (this.phase === 'finale' && this.t > 230) {
      pos = new THREE.Vector3(P.x + 6, P.y + 2.4, -7); look = new THREE.Vector3(P.x, P.y + 0.5, 6);
    } else if (fightCam) {
      // ride along with the wing so the fight stays level; the horizon tilts instead (not through barrel rolls)
      const F = this.fighters[this.wingChar], R = this.plane.root;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R.rotation.x, 0, R.rotation.z - this.rollA));
      pos = new THREE.Vector3(F.x * 0.3, TW.wingY + 3.4, -5.6).applyQuaternion(q).add(P);
      look = new THREE.Vector3(F.x * 0.35, TW.wingY + 0.1, 1.4).applyQuaternion(q).add(P);
      this.camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    } else if (this.phase === 'torn' || this.phase === 'shot') {
      pos = this.camPos.clone(); look = P.clone();
    } else {
      pos = new THREE.Vector3(P.x * 0.9, P.y * 0.85 + 3.2, -13); look = new THREE.Vector3(P.x * 0.92, P.y * 0.9 + 1.4 + (this.aimP || 0) * 16, 14);
    }
    const k = this.phase === 'crash' || this.phase === 'tbc' ? 0.05 : 0.12;
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.3) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake * 0.03, (Math.random() - 0.5) * this.shake * 0.03, 0));
    this.upS = (this.upS || new THREE.Vector3(0, 1, 0)).lerp(this.camUp || new THREE.Vector3(0, 1, 0), k).normalize();
    this.camera.up.copy(this.upS);
    this.camera.lookAt(this.camLook);
    this.dome.position.copy(this.camera.position);
  }

  draw(ctx) {
    if (this.phase === 'pickup') { this.drawPickup(ctx); return; }
    if (this.failed) { ctx.fillStyle = '#e79a74'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); return; }
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, VIEW_W, VIEW_H);
    const t = this.t;
    if (this.phase === 'infected') {
      const k = Math.min(1, t / 200);
      ctx.fillStyle = `rgba(40,140,20,${0.35 * k})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      if (t > 180) { this.g.text(ctx, 'INFECTED', VIEW_W / 2, 580, 56, '#9dff6a', 'center', '#0a2a04'); this.g.text(ctx, 'The Metal Virus spreads by bite. Never bite a Zombot.', VIEW_W / 2, 630, 14, '#fff', 'center', '#0a2a04'); }
    }
    if (this.phase === 'torn' && t > 40) this.g.text(ctx, 'THE TORNADO WAS TORN APART', VIEW_W / 2, 600, 30, '#ffd23f', 'center', '#5a0b14');
    if (this.phase === 'shot' && t > 40) this.g.text(ctx, 'SHOT DOWN', VIEW_W / 2, 600, 44, '#ff5a3a', 'center', '#2a0806');
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    for (const pp of this.pops) {
      const v = pp.p.clone().project(this.camera);
      if (v.z > 1) continue;
      const x = (v.x + 1) / 2 * VIEW_W, y = (1 - v.y) / 2 * VIEW_H - 30 - pp.t * 1.2;
      const sc = Math.min(1, pp.t / 4) * (pp.big ? 1.4 : 1) * (pp.t > 30 ? 1 - (pp.t - 30) / 10 : 1);
      ctx.save(); ctx.translate(x, y); ctx.rotate(pp.rot); ctx.scale(sc, sc);
      ctx.font = `${pp.big ? 30 : 20}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'miter'; ctx.lineWidth = 8; ctx.strokeStyle = '#0a0a0a'; ctx.strokeText(pp.text, 4, 4);
      ctx.fillStyle = '#d4141e'; ctx.fillText(pp.text, 4, 4);
      ctx.lineWidth = 6; ctx.strokeText(pp.text, 0, 0);
      ctx.fillStyle = '#ffffff'; ctx.fillText(pp.text, 0, 0);
      ctx.restore();
    }
    if ((this.phase === 'sky' || this.phase === 'board') && this.active === 'pilot' && !this.finisher) this.drawTargeting(ctx);
    this.drawFight(ctx);
    if (this.lightning > 6 || this.lightning === 3) { ctx.fillStyle = 'rgba(220,210,255,.18)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    torDread(ctx, t, this.phase === 'crash' || this.phase === 'tbc' ? 0.5 : 1);
    if (this.phase === 'tbc') this.drawTBC(ctx);
  }

  // Star Fox-style reticles: a near and a far frame along the guns' line,
  // red brackets on the auto-aim lock, numbered boxes on missile locks.
  drawTargeting(ctx) {
    const t = this.t, scr = (v) => { const q = v.clone().project(this.camera); return q.z > 1 ? null : { x: (q.x + 1) / 2 * VIEW_W, y: (1 - q.y) / 2 * VIEW_H }; };
    const o = this.nose(new THREE.Vector3()), d = this.aimDir(new THREE.Vector3());
    const near = scr(o.clone().addScaledVector(d, 22)), far = scr(o.clone().addScaledVector(d, 60));
    const locked = !!this.lock;
    ctx.save(); ctx.lineWidth = 3;
    const frame = (p, r, col) => {
      if (!p) return;
      ctx.strokeStyle = col; ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(p.x + sx * r, p.y + sy * r * 0.5); ctx.lineTo(p.x + sx * r, p.y + sy * r); ctx.lineTo(p.x + sx * r * 0.5, p.y + sy * r); }
      ctx.stroke();
    };
    frame(near, 30, locked ? '#ff3b3b' : '#7dff9a'); frame(far, 18, locked ? '#ff3b3b' : '#7dff9a');
    if (far) { ctx.fillStyle = locked ? '#ff3b3b' : '#7dff9a'; ctx.fillRect(far.x - 2, far.y - 2, 4, 4); }
    if (this.lock) {
      const p = scr(new THREE.Vector3(this.lock.x, this.lock.y, this.lock.z));
      if (p) { const r = 26 + Math.sin(t * 0.5) * 3; ctx.strokeStyle = '#ff3b3b'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4); ctx.strokeRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4); ctx.restore(); }
    }
    (this.locks || []).forEach((f, i) => {
      if (f.dead) return;
      const p = scr(new THREE.Vector3(f.x, f.y, f.z)); if (!p) return;
      ctx.strokeStyle = '#ffd23f'; ctx.strokeRect(p.x - 22, p.y - 22, 44, 44);
      this.g.text(ctx, String(i + 1), p.x + 26, p.y - 18, 12, '#ffd23f', 'left', '#000');
    });
    ctx.restore();
    // missiles, hits and the hyper laser
    const g = this.g;
    g.text(ctx, `HITS ${String(this.hits || 0).padStart(3, '0')}`, 32, 90, 18, '#7dff9a');
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i < this.ammo ? '#ffd23f' : 'rgba(255,255,255,.15)'; ctx.fillRect(32 + i * 22, 104, 16, 26); }
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(32, 134, 130 * (this.ammoT / 80) * (this.ammo < 6 ? 1 : 0), 3);
    g.text(ctx, 'MISSILES', 170, 126, 10, '#ffd23f');
    if (this.laserT > 0) g.text(ctx, `HYPER LASER ${Math.ceil(this.laserT / 60)}`, 32, 160, 12, Math.floor(t / 8) % 2 ? '#7fd0ff' : '#fff');
    if (this.painting) g.text(ctx, `LOCK ${this.locks.length}`, VIEW_W / 2, VIEW_H - 150, 16, '#ffd23f', 'center');
  }

  // the fighting-game layer: slashes, banners, cut-ins, hit counter, prompts
  drawFight(ctx) {
    const g = this.g, t = this.t, X = this.finisher;
    const scr = (v) => { const q = v.clone().project(this.camera); return q.z > 1 ? null : { x: (q.x + 1) / 2 * VIEW_W, y: (1 - q.y) / 2 * VIEW_H }; };
    if (X) {
      // blade mode turns the world blue; a fatality turns it to blood and shadow
      ctx.fillStyle = X.kind === 'zandatsu' ? 'rgba(40,120,220,.28)' : 'rgba(90,0,0,.35)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, 60); ctx.fillRect(0, VIEW_H - 60, VIEW_W, 60);
    }
    for (const sl of this.slashes) {
      const w = sl.at ? new THREE.Vector3().setFromMatrixPosition(sl.at.m.matrixWorld).add(new THREE.Vector3(0, 0.5, 0)) : sl.p;
      const p = w && scr(w); if (!p) continue;
      const k = 1 - sl.t / 18, L = 420;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(sl.ang); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(120,220,255,${k * 0.6})`; ctx.lineWidth = 14 * k; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 4 * k; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke();
      ctx.restore();
    }
    // FINISH HIM prompts over staggered Zombots
    if (this.phase === 'board' && !X) for (const b of this.boarders) {
      if (b.state !== 'stagger') continue;
      const p = scr(new THREE.Vector3().setFromMatrixPosition(b.m.matrixWorld).add(new THREE.Vector3(0, 1.6, 0)));
      if (p) drawPrompt(ctx, p.x, p.y, 'grab', this.wingChar === 'sonic' ? 'ZANDATSU' : 'FATALITY', t);
    }
    if (this.comboN >= 2 && this.comboT > 0) {
      const k = Math.min(1, (80 - this.comboT) / 6 + 0.6);
      ctx.save(); ctx.translate(VIEW_W - 170, 300); ctx.rotate(-0.08); ctx.scale(k, k);
      g.text(ctx, String(this.comboN), 0, 0, 54, this.comboN >= 6 ? '#ffd23f' : '#fff', 'center', '#d4141e');
      g.text(ctx, 'HITS', 0, 34, 18, '#fff', 'center', '#0a0a0a');
      ctx.restore();
    }
    if (this.banner) {
      // Mortal Kombat-style call-outs
      const B = this.banner, k = Math.min(1, B.t / 6), sh = B.t < 20 ? (Math.random() - 0.5) * 8 : 0;
      ctx.save(); ctx.translate(VIEW_W / 2 + sh, B.sub ? 150 : 250); ctx.scale(2 - k, 2 - k); ctx.globalAlpha = Math.min(1, (90 - B.t) / 15);
      ctx.font = `${B.sub ? 34 : 64}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 12; ctx.strokeStyle = '#000'; ctx.strokeText(B.text, 0, 0);
      ctx.fillStyle = B.col; ctx.fillText(B.text, 0, 0);
      ctx.restore();
    }
    if (this.cutin) {
      // a Persona 5 cut-in band slashing across the screen
      const C = this.cutin, k = Math.min(1, C.t / 8), out = C.t > 48 ? (C.t - 48) / 12 : 0;
      ctx.save(); ctx.translate(VIEW_W / 2 + (1 - k) * -900 + out * 900, 330); ctx.rotate(-0.12);
      ctx.fillStyle = '#d4141e'; ctx.fillRect(-760, -62, 1520, 124);
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-760, -50, 1520, 100);
      ctx.restore();
      ctx.save(); ctx.translate(VIEW_W / 2 + (1 - k) * -900 + out * 900, 330); ctx.rotate(-0.12);
      if (C.who === 'sonic') drawSonicFrame(ctx, animFrame('punch', 0), -420, 50, { scale: 3.6 });
      else if (Assets.img.tornado) { const f = TOR_FRAMES.t_fly0; ctx.imageSmoothingEnabled = false; ctx.drawImage(Assets.img.tornado, f[0], f[1], f[2], f[3], -480, -55, f[2] * 3.6, f[3] * 3.6); }
      ctx.font = `46px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d4141e'; ctx.fillText(C.text, -296, 6); ctx.fillStyle = '#fff'; ctx.fillText(C.text, -300, 2);
      ctx.restore();
    }
    if (this.freezeT > 0) { ctx.fillStyle = `rgba(120,200,255,${0.12 + 0.05 * Math.sin(t * 0.2)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.superT > 0) { ctx.fillStyle = `rgba(255,210,60,${0.08 + 0.04 * Math.sin(t * 0.3)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  }

  drawTBC(ctx) {
    const k = Math.min(1, this.t / 30);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(200,150,90,${0.8 * k})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'source-over';
    this.g.text(ctx, 'BOTH SURVIVED. BARELY.', VIEW_W / 2, 140, 20, '#e9d7a8', 'center', '#1b1006');
    const x = VIEW_W - 60 - 620 * Math.min(1, this.t / 20), y = VIEW_H - 120;
    ctx.translate(x, y);
    ctx.fillStyle = '#1b1006'; ctx.strokeStyle = '#e9d7a8'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(520, -38); ctx.lineTo(520, -60); ctx.lineTo(590, 0); ctx.lineTo(520, 60); ctx.lineTo(520, 38); ctx.lineTo(0, 38); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.font = `28px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e9d7a8'; ctx.fillText('TO BE CONTINUED', 26, 2);
    ctx.restore();
  }

  drawHUD(ctx) {
    const g = this.g, t = this.t;
    if (this.phase === 'pickup' || this.phase === 'tbc' || this.failed || this.phase === 'infected') return;
    g.text(ctx, 'SCORE', 32, 52, 22, '#ffd23f'); g.text(ctx, String(g.score), 330, 52, 22, '#fff', 'right');
    ctx.save(); ctx.translate(52, VIEW_H - 46); drawHeroHead(ctx, 0.9); ctx.restore();
    g.text(ctx, 'SONIC', 86, VIEW_H - 52, 14, '#ffd23f'); g.text(ctx, `x ${g.lives}`, 86, VIEW_H - 28, 16, '#fff');
    if (this.phase !== 'sky' && this.phase !== 'board') return;
    // the two things you're keeping alive
    const bar = (x, y, label, v, c1, c2) => {
      const w = 300, low = v < 35 && Math.floor(t / 10) % 2;
      ctx.fillStyle = 'rgba(0,0,20,.6)'; ctx.fillRect(x - 4, y - 4, w + 8, 26);
      const gr = ctx.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      ctx.fillStyle = low ? '#ff3b3b' : gr; ctx.fillRect(x, y, w * v / 100, 18);
      g.text(ctx, label, x, y - 10, 12, low ? '#ff5a3a' : '#fff');
    };
    bar(VIEW_W - 340, 46, 'TORNADO (ENEMY FIRE)', this.hull, '#ff7a2a', '#ffd23f');
    if (this.phase === 'board') bar(VIEW_W - 340, 100, 'WING (BOARDERS)', this.frame, '#2aa0ff', '#7fe3ff');
    // rings and the special moves they buy
    const sx = VIEW_W - 340, sy = 228;
    g.text(ctx, `RINGS ${this.rings}`, sx, sy, 16, '#ffd23f');
    TOR_SPECIALS.forEach((sp, i) => {
      const x = sx + i * 62, y = sy + 12, ok = this.rings >= sp.cost;
      ctx.fillStyle = ok ? 'rgba(212,20,30,.9)' : 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, 56, 40);
      ctx.strokeStyle = ok ? '#fff' : '#555'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 56, 40);
      g.text(ctx, String(i + 1), x + 6, y + 18, 14, ok ? '#fff' : '#777', 'left', null);
      g.text(ctx, String(sp.cost), x + 50, y + 34, 10, ok ? '#ffd23f' : '#777', 'right', null);
    });
    const act = this.striker ? (this.superT > 0 ? 'SUPER SONIC' : this.autoT > 0 ? 'AUTOPILOT COMBO' : 'SONIC MISSILE') : this.freezeT > 0 ? `FREEZE ${Math.ceil(this.freezeT / 60)}` : this.shieldT > 0 ? `SHIELD ${Math.ceil(this.shieldT / 60)}  ${keyLabel('up')}${keyLabel('down')} CLIMB` : null;
    if (act) g.text(ctx, act, sx, sy + 72, 12, '#7fe3ff');
    const left = this.phase === 'sky' ? TW.SKY - t : TW.BOARD - t;
    if (this.phase === 'board') g.text(ctx, `COAST IN ${Math.max(0, Math.ceil(left / 60))}s`, VIEW_W / 2, 44, 16, '#fff', 'center');
    if (this.phase !== 'board') { g.text(ctx, `${keyLabel('up')}${keyLabel('down')} AIM  [${keyLabel('punch')}] GUNS (AUTO-AIM)  HOLD [${keyLabel('laser')}] LOCK-ON MISSILES  [${keyLabel('clones')}] BARREL ROLL  [1-5] SPECIALS`, VIEW_W / 2, VIEW_H - 24, 11, '#c9d4ff', 'center'); return; }
    // who is where, and who you're controlling
    const seat = (x, role, who, on) => {
      ctx.fillStyle = on ? 'rgba(255,210,63,.85)' : 'rgba(0,0,30,.55)'; ctx.fillRect(x, VIEW_H - 112, 230, 44);
      g.text(ctx, role, x + 10, VIEW_H - 94, 10, on ? '#1b1006' : '#c9d4ff', 'left', null);
      g.text(ctx, who.toUpperCase(), x + 10, VIEW_H - 76, 14, on ? '#1b1006' : '#fff', 'left', null);
    };
    seat(200, 'PILOT', this.pilot, this.active === 'pilot');
    seat(440, 'ON THE WING', this.wingChar, this.active === 'fighter');
    g.text(ctx, `[${keyLabel('swap')}] SWITCH   [${keyLabel('roles')}] SWAP ROLES${this.roleCool > 60 ? ' (WAIT)' : ''}`, 200, VIEW_H - 124, 10, '#fff');
    if (this.pilot === 'sonic') {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(680, VIEW_H - 106, 160, 10); ctx.fillStyle = '#ffa020'; ctx.fillRect(680, VIEW_H - 106, 160 * this.tailsStam / 100, 10);
      g.text(ctx, 'TAILS STAMINA', 680, VIEW_H - 112, 10, '#ffd0a0');
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(680, VIEW_H - 80, 160, 10); ctx.fillStyle = '#4aa8ff'; ctx.fillRect(680, VIEW_H - 80, 160 * (1 - this.sonicPilotT / 330), 10);
      g.text(ctx, 'SONIC PILOTING', 680, VIEW_H - 86, 10, '#c9d4ff');
    }
    if (this.wingChar === 'sonic') {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(VIEW_W - 340, 150, 200, 10); ctx.fillStyle = '#7fe3ff'; ctx.fillRect(VIEW_W - 340, 150, 200 * this.boost / 100, 10);
      g.text(ctx, 'BOOST', VIEW_W - 130, 160, 10, '#7fe3ff');
    }
    const hint = this.active === 'pilot'
      ? `${keyLabel('up')}${keyLabel('down')} AIM  [${keyLabel('punch')}] GUNS  HOLD [${keyLabel('laser')}] LOCK-ON  [${keyLabel('clones')}] ROLL`
      : this.wingChar === 'sonic'
        ? `[${keyLabel('punch')}] PUNCH (TIME IT TO PARRY)  ${keyLabel('down')}+[${keyLabel('punch')}] UPPERCUT  [${keyLabel('laser')}] KICK  ${keyLabel('down')}+[${keyLabel('laser')}] SPIN  [${keyLabel('clones')}] BOOST  [${keyLabel('grab')}] GRAB/FINISH`
        : `[${keyLabel('punch')}] PUNCH (TIME IT TO PARRY)  ${keyLabel('down')}+[${keyLabel('punch')}] UPPERCUT  [${keyLabel('laser')}] TAIL SMACK  [${keyLabel('clones')}] TAIL SPIN  [${keyLabel('grab')}] GRAB/FINISH`;
    g.text(ctx, hint, VIEW_W / 2, VIEW_H - 24, 11, '#c9d4ff', 'center');
    if (t < 420 && !this.banner && !this.finisher) g.text(ctx, `PRESS [${keyLabel('swap')}] TO SWITCH BETWEEN FLYING AND FIGHTING`, VIEW_W / 2, 200, 16, Math.floor(t / 20) % 2 ? '#ffd23f' : '#fff', 'center');
    if (t > 900 && t < 1200 && !this.banner && !this.finisher) g.text(ctx, `[${keyLabel('roles')}] SWAPS ROLES: SONIC FLIES, TAILS FIGHTS (NOT FOR LONG)`, VIEW_W / 2, 200, 14, '#ffd23f', 'center');
  }

  speakerPos(who) {
    if (this.phase === 'pickup') {
      const C = this.cs;
      if (who === 'tails') { const f = TOR_FRAMES.plane0; return { x: C.planeX + (60 - f[2] / 2) * 2.5, y: C.planeY - f[3] * 1.25 + 8 }; }
      if (C.onPlane) { const w = this.wingPos2D(); return { x: w.x, y: w.y - 70 }; }
      return C.jumpT >= 0 ? { x: C.jx, y: C.jy - 50 } : { x: C.sonicX, y: C.sonicY - 80 };
    }
    if (this.failed || !this.camera) return { x: VIEW_W / 2, y: VIEW_H / 2 };
    const M = this[who] || this.sonic;
    M.root.updateWorldMatrix(true, false);
    const v = new THREE.Vector3(0, 1.15, 0).applyMatrix4(M.root.matrixWorld).project(this.camera);
    return { x: Math.max(120, Math.min(VIEW_W - 120, (v.x + 1) / 2 * VIEW_W)), y: Math.max(140, (1 - v.y) / 2 * VIEW_H) };
  }

  dispose() {
    Sound.drone(0);
    document.getElementById('touch').classList.remove('sky');
    if (!this.scene) return;
    this.scene.traverse((o) => { if (o.geometry && o.isMesh && !o.isSkinnedMesh) { /* shared templates live on; let GC take the rest */ } });
    this.scene = null;
  }
}
