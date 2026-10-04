// Egg Base Escape: a behind-the-back 3D boost stage (Sonic Generations style)
// rendered with three.js. Sonic is the Generations model with Generations
// animations (js/models3d.js). Everything lives in "track space":
// s = distance along the course, x = sideways offset, y = height above the
// floor, so loops, corkscrews, banked turns and the building run just work.
'use strict';

const ESC_DT = 1 / 60;
const ESC_RUN = 38, ESC_BOOST = 70, ESC_SLIDE = 34, ESC_ROLL = 50;   // spin dash: faster than running, slower than boost
const ESC_GRAV = 34, ESC_JUMP = 12.5;
const ESC_WATER_MIN = 41;        // slower than this on water and you sink
const ESC_SONIC_SCALE = 1.9;     // model is ~1 m tall; the course is built for a ~1.9 unit Sonic

// ------------------------------------------------------------------ textures
function escCanvasTex(w, h, paint, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

function escTextures() {
  const T = {};
  T.floor = escCanvasTex(128, 128, (g) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#3a3f4c' : '#262a33'; g.fillRect(i * 64, j * 64, 64, 64); }
    g.strokeStyle = '#ff8a1c'; g.lineWidth = 2; g.globalAlpha = 0.55; g.strokeRect(1, 1, 126, 126); g.globalAlpha = 1;
  });
  T.road = escCanvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#34363c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = Math.random() < 0.5 ? '#2c2e33' : '#3d3f46'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#e8e8e8'; for (const x of [w / 4, w / 2, w * 3 / 4]) for (let y = 0; y < h; y += 64) g.fillRect(x - 2, y, 4, 34);
    g.fillStyle = '#ffc21a'; g.fillRect(4, 0, 5, h); g.fillRect(w - 9, 0, 5, h);
  });
  T.hangar = escCanvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2b3140'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d4558'; g.fillRect(4, 4, 56, 120); g.fillRect(68, 4, 56, 120);
    g.fillStyle = '#4fd0ff'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
  });
  T.glass = escCanvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#1c2a3c'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) {
      const gr = g.createLinearGradient(x, y, x + 32, y + 32); gr.addColorStop(0, '#5b86b0'); gr.addColorStop(1, '#22384f');
      g.fillStyle = gr; g.fillRect(x + 2, y + 2, 28, 28);
      if (Math.random() < 0.18) { g.fillStyle = 'rgba(255,220,140,.8)'; g.fillRect(x + 2, y + 2, 28, 28); }
    }
  });
  T.concrete = escCanvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#6b6a68'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? '#5d5c5a' : '#787673'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.strokeStyle = '#4d4c4a'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  });
  T.wall = escCanvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#30343e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3c414d'; g.fillRect(8, 8, 116, 150); g.fillRect(132, 8, 116, 150);
    g.fillStyle = '#23262e'; g.fillRect(0, 170, w, 30);
    g.fillStyle = '#8a1218'; g.fillRect(0, 176, w, 6);
    g.fillStyle = '#4a505e'; for (let x = 0; x < w; x += 32) g.fillRect(x + 4, 214, 24, 36);
  });
  T.rail = escCanvasTex(64, 32, (g, w, h) => {
    g.fillStyle = '#9aa3ad'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8d0d8'; g.fillRect(0, 6, w, 6); g.fillRect(0, 20, w, 6);
    g.fillStyle = '#4b525a'; g.fillRect(0, 0, 4, h);
  });
  T.hazard = escCanvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, h); g.fillStyle = '#16161a';
    for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  });
  T.crate = escCanvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5b606c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    g.fillStyle = '#c91a24'; g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe9c9'; g.beginPath(); g.ellipse(64, 70, 22, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a3a12'; g.beginPath(); g.ellipse(64, 74, 26, 6, 0, 0, Math.PI); g.fill();
  });
  T.dash = escCanvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#1a1c22'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd23f';
    for (let y = 0; y < h; y += 42) { g.beginPath(); g.moveTo(8, y + 34); g.lineTo(32, y + 8); g.lineTo(56, y + 34); g.lineTo(46, y + 34); g.lineTo(32, y + 20); g.lineTo(18, y + 34); g.fill(); }
  });
  T.windows = escCanvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#141a26'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) for (let y = 0; y < h; y += 8) {
      const r = Math.random();
      g.fillStyle = r < 0.22 ? '#ffd27a' : r < 0.3 ? '#ff8a3a' : r < 0.45 ? '#2c3a52' : '#1d2536';
      g.fillRect(x + 1, y + 2, 6, 5);
    }
  });
  T.water = escCanvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1b5f86'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = `rgba(${150 + Math.random() * 100},${210 + Math.random() * 40},255,${0.15 + Math.random() * 0.3})`; g.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * w, y = Math.random() * h, l = 6 + Math.random() * 20;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
    }
  });
  T.glow = escCanvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.25, 'rgba(255,220,120,.95)'); r.addColorStop(0.55, 'rgba(255,110,30,.6)'); r.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, false);
  T.blueGlow = escCanvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(140,220,255,.9)'); r.addColorStop(0.7, 'rgba(30,110,255,.35)'); r.addColorStop(1, 'rgba(0,40,200,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, false);
  T.smoke = escCanvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(40,36,40,.9)'); r.addColorStop(1, 'rgba(20,16,20,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, false);
  T.spray = escCanvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(0.5, 'rgba(200,240,255,.5)'); r.addColorStop(1, 'rgba(200,240,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, false);
  T.trail = escCanvasTex(16, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(160,230,255,.9)'); gr.addColorStop(0.6, 'rgba(40,120,255,.5)'); gr.addColorStop(1, 'rgba(0,40,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  T.sky = escCanvasTex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1a1040'); gr.addColorStop(0.45, '#7a2a6a'); gr.addColorStop(0.72, '#e0603a'); gr.addColorStop(1, '#ffc070');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  T.ground = escCanvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a6a3c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? '#86592f' : '#ad7a47'; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 2 + Math.random() * 4); }
  });
  T.street = escCanvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#23252b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3d45'; for (let i = 0; i < w; i += 64) { g.fillRect(i, 0, 18, h); g.fillRect(0, i, w, 18); }
  });
  T.dome = escCanvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#4b505c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2c3038'; g.lineWidth = 3;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#e0242c'; for (let x = 8; x < w; x += 64) g.fillRect(x, 60, 14, 6);
  });
  return T;
}

// --------------------------------------------------- imported models (js/models3d.js)
function escDecode(a) {
  const bin = atob(a.d), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new window[a.t](u.buffer);
}

const ESC_TEX_CACHE = {};
function escModelTex(name) {
  if (!ESC_TEX_CACHE[name]) {
    // same orientation as three's ColladaLoader (default flipY), which the UVs were authored for
    const src = (typeof ESC_MODELS !== 'undefined' && ESC_MODELS.tex[name]) || (typeof TOR_MODELS !== 'undefined' && TOR_MODELS.tex[name]);
    const t = new THREE.TextureLoader().load(src);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;   // Generations UVs run outside 0..1
    t.name = name;
    ESC_TEX_CACHE[name] = t;
  }
  return ESC_TEX_CACHE[name];
}

// Rebuild a skinned model + animation clips from the packed data.
function escBuildModel(M) {
  const objs = M.nodes.map((n) => {
    const o = n.b ? new THREE.Bone() : new THREE.Object3D();
    o.name = n.n; o.position.fromArray(n.t); o.quaternion.fromArray(n.q); o.scale.fromArray(n.s);
    return o;
  });
  M.nodes.forEach((n, i) => { if (n.p >= 0) objs[n.p].add(objs[i]); });
  const root = objs[0], byName = {};
  objs.forEach((o) => { byName[o.name] = o; });
  const meshes = {};
  for (const me of M.meshes) {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(me.attrs)) g.setAttribute(k, new THREE.BufferAttribute(escDecode(a), a.n, k === 'skinWeight'));
    g.setIndex(new THREE.BufferAttribute(escDecode(me.index), 1));
    for (const [st, ct, mi] of me.groups) g.addGroup(st, ct, mi);
    const mats = me.mats.map((m) => new THREE.MeshPhongMaterial({ map: m.map ? escModelTex(m.map) : null, color: 0xffffff, specular: 0x2a2a2a, shininess: 28 }));
    const mesh = me.skinned ? new THREE.SkinnedMesh(g, mats) : new THREE.Mesh(g, mats);
    mesh.name = me.name; mesh.frustumCulled = false;
    new THREE.Matrix4().fromArray(me.local).decompose(mesh.position, mesh.quaternion, mesh.scale);
    objs[me.parent].add(mesh);
    if (me.skinned) {
      const inv = escDecode({ d: me.inverses, t: 'Float32Array' });
      const bones = me.bones.map((n) => byName[n]);
      const inverses = bones.map((b, i) => new THREE.Matrix4().fromArray(inv, i * 16));
      mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4().fromArray(me.bindMatrix));
    }
    meshes[me.name] = mesh;
  }
  const clips = {};
  for (const [key, c] of Object.entries(M.clips || {})) {
    clips[key] = new THREE.AnimationClip(key, c.d, c.tracks.map(([name, times, values]) => name.endsWith('quaternion')
      ? new THREE.QuaternionKeyframeTrack(name, times, values) : new THREE.VectorKeyframeTrack(name, times, values)));
  }
  return { root, meshes, clips };
}

// ------------------------------------------------------- limb pose layer
// The Generations clips from the Unity project only rotate the shoulders, so
// the arms would hang in bind pose (a T-pose). This layer aims the limb bones
// (their +x runs along the limb in both rigs) at directions given in the
// character's own space (+z forward, +y up, +x the character's left).
const _lq = new THREE.Quaternion(), _lq2 = new THREE.Quaternion(), _lv = new THREE.Vector3(), _lw = new THREE.Vector3();
function escAimBone(bone, dir, k) {
  if (!bone || k <= 0) return;
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_lq);
  _lv.set(1, 0, 0).applyQuaternion(_lq);
  _lq2.setFromUnitVectors(_lv, dir).multiply(_lq);
  _lq.slerp(_lq2, k);
  bone.parent.getWorldQuaternion(_lq2).invert();
  bone.quaternion.copy(_lq2.multiply(_lq));
}
const ESC_LIMBS = ['UpperArm_L', 'ForeArm_L', 'UpperArm_R', 'ForeArm_R', 'Thigh_L', 'Calf_L', 'Thigh_R', 'Calf_R'];
function escLimbBones(M) {
  if (M.limbs) return M.limbs;
  const b = {};
  if (M.model) for (const n of ESC_LIMBS.concat(['Spine1', 'Head'])) b[n] = M.model.root.getObjectByName(n);
  return (M.limbs = b);
}
// Curl the fingers into fists (the rigs' finger bones bend about their local Y)
function escFists(M, on) {
  if (!M.fingers) {
    M.fingers = [];
    if (M.model) M.model.root.traverse((o) => { if (/^(Index|Middle|Ring|Pinky)[123]_[LR]$|^Thumb[23]_[LR]$/.test(o.name)) M.fingers.push([o, o.quaternion.clone(), /^Thumb/.test(o.name) ? -0.6 : -1.25]); });
  }
  if (M.fist === on) return;
  M.fist = on;
  for (const [o, q0, a] of M.fingers) { o.quaternion.copy(q0); if (on) o.rotateY(a); }
}
// name: relax | guard | run | sprint | air | pilot | hurt | jab | cross | kick | flykick | grab | wide
// opts: { t, k (blend per frame), side ('L'|'R' for the striking limb), aim (world dir for grab) }
function escLimbPose(M, name, opts = {}) {
  const B = escLimbBones(M);
  if (!B.UpperArm_L) return;
  const t = opts.t || 0, k = opts.k == null ? 0.35 : opts.k;
  M.body.updateWorldMatrix(true, false);
  const q = M.body.getWorldQuaternion(new THREE.Quaternion());
  const set = (bone, x, y, z, kk = k) => { if (B[bone]) escAimBone(B[bone], _lw.set(x, y, z).normalize().applyQuaternion(q), kk); };
  const arms = (fn) => { for (const [sd, s] of [['L', 1], ['R', -1]]) fn(sd, s); };
  const sw = Math.sin(t * 0.35);
  escFists(M, ['guard', 'jab', 'cross', 'kick', 'flykick', 'pilot', 'sprint'].includes(name));
  switch (name) {
    case 'relax': arms((sd, s) => { set('UpperArm_' + sd, s * 0.3, -0.94, 0.05); set('ForeArm_' + sd, s * 0.15, -0.85, 0.4); }); break;
    case 'guard':   // Sonic Battle stance: fists up at the chin, elbows in, a little bounce
      arms((sd, s) => { set('UpperArm_' + sd, s * 0.55, -0.75 + Math.sin(t * 0.15) * 0.05, 0.3); set('ForeArm_' + sd, s * 0.12, 0.5, 0.85); }); break;
    case 'run': arms((sd, s) => { set('UpperArm_' + sd, s * 0.32, -0.5, -0.75 + sw * s * 0.25); set('ForeArm_' + sd, s * 0.15, -0.05, -0.95); }); break;
    case 'sprint': arms((sd, s) => { set('UpperArm_' + sd, s * 0.25, -0.25, -1); set('ForeArm_' + sd, s * 0.1, 0.05, -1); }); break;
    case 'air': arms((sd, s) => { set('UpperArm_' + sd, s * 0.45, -0.55, -0.5); set('ForeArm_' + sd, s * 0.3, -0.2, -0.9); }); break;
    case 'wide': arms((sd, s) => { set('UpperArm_' + sd, s, 0.15, -0.1); set('ForeArm_' + sd, s, 0.25, 0); }); break;
    case 'pilot': arms((sd, s) => { set('UpperArm_' + sd, s * 0.22, -0.5, 0.82); set('ForeArm_' + sd, -s * 0.12, -0.3, 0.95); }); break;
    case 'hurt': arms((sd, s) => { set('UpperArm_' + sd, s * 0.35, 0.2, 0.6); set('ForeArm_' + sd, -s * 0.1, 0.6, 0.7); }); break;
    case 'jab': case 'cross': {
      // one fist drives straight out, the other stays up in guard
      const hit = opts.side || (name === 'jab' ? 'L' : 'R');
      arms((sd, s) => {
        if (sd === hit) { set('UpperArm_' + sd, -s * 0.05, 0.08, 1, opts.k || 0.75); set('ForeArm_' + sd, -s * 0.05, 0.05, 1, opts.k || 0.75); }
        else { set('UpperArm_' + sd, s * 0.55, -0.75, 0.3); set('ForeArm_' + sd, s * 0.12, 0.5, 0.85); }
      });
      break;
    }
    case 'kick':   // roundhouse: leg snaps out level, arms thrown wide for balance
      arms((sd, s) => { set('UpperArm_' + sd, s * 0.9, 0.2, -0.3); set('ForeArm_' + sd, s * 0.8, 0.4, -0.2); });
      set('Thigh_R', -0.1, 0.05, 1, opts.k || 0.7); set('Calf_R', -0.1, 0.1, 1, opts.k || 0.7);
      break;
    case 'flykick':
      arms((sd, s) => { set('UpperArm_' + sd, s * 0.35, -0.2, -0.95); set('ForeArm_' + sd, s * 0.2, 0, -1); });
      set('Thigh_R', 0, -0.25, 1, 0.7); set('Calf_R', 0, -0.2, 1, 0.7);
      set('Thigh_L', 0, -0.7, -0.6, 0.6); set('Calf_L', 0, -0.1, -1, 0.6);
      break;
    case 'zombie': {   // arms out, reaching, a little out of sync
      arms((sd, s) => { const w = Math.sin(t * 0.07 + s) * 0.12; set('UpperArm_' + sd, s * 0.22, -0.1 + w, 1); set('ForeArm_' + sd, s * 0.05, -0.15 - w, 1); });
      break;
    }
    case 'claw':   // both arms raised to rake down
      arms((sd, s) => { set('UpperArm_' + sd, s * 0.45, 0.8, 0.35); set('ForeArm_' + sd, s * 0.15, 0.85, 0.5); });
      break;
    case 'rake':
      arms((sd, s) => { set('UpperArm_' + sd, s * 0.15, -0.5, 0.85, 0.8); set('ForeArm_' + sd, s * 0.05, -0.75, 0.6, 0.8); });
      break;
    case 'grab': if (opts.aim) arms((sd) => { escAimBone(B['UpperArm_' + sd], opts.aim, 0.6); escAimBone(B['ForeArm_' + sd], opts.aim, 0.6); }); break;
  }
}

// -------------------------------------------------------------- Sonic
function escSonicModel() {
  const holder = new THREE.Group();                       // feet at y = 0, faces +z
  const body = new THREE.Group(); holder.add(body);       // the animated model (tilted for slides)
  let mixer = null, model = null;
  const actions = {};
  if (typeof ESC_MODELS !== 'undefined') {
    model = escBuildModel(ESC_MODELS.sonic);
    model.root.scale.multiplyScalar(ESC_SONIC_SCALE);
    if (model.meshes.MouthR) model.meshes.MouthR.visible = false;   // one mouth at a time
    // the rip's bind pose has the eyelids shut; open them (the clips never touch them)
    for (const n of ['EyeLidUp1_L', 'EyeLidUp2_L', 'EyeLidUp_C', 'EyeLidUp1_R', 'EyeLidUp2_R']) {
      const b = model.root.getObjectByName(n); if (b) b.rotateY(-0.8);
    }
    body.add(model.root);
    mixer = new THREE.AnimationMixer(model.root);
    for (const [k, c] of Object.entries(model.clips)) {
      const a = mixer.clipAction(c);
      if (k === 'hit' || k === 'win') { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
      actions[k] = a;
    }
  }
  const S = (r, m, seg = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), m);
  const blue = new THREE.MeshPhongMaterial({ color: 0x1d4fe0, emissive: 0x061030, shininess: 40 });
  // spin-ball form for jumps
  const ball = new THREE.Group(); ball.position.y = 0.75; holder.add(ball);
  ball.add(S(0.62, blue, 16));
  const coneGeo = new THREE.ConeGeometry(0.22, 0.6, 9);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, c = new THREE.Mesh(coneGeo, blue);
    const d = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); c.position.copy(d).multiplyScalar(0.7); ball.add(c);
  }
  const shellMat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), shellMat));
  ball.visible = false;

  // boost: layered aura, a blue jet trail behind, and the sonic-boom shockwave
  const add = (geo, color, side) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: side || THREE.FrontSide }));
  const aura = add(new THREE.SphereGeometry(1, 20, 14), 0x4aa8ff); aura.scale.set(1.35, 1.35, 2.4); aura.position.set(0, 1.0, 0.1); holder.add(aura);
  const core = add(new THREE.SphereGeometry(1, 16, 12), 0xe6f6ff); core.scale.set(0.8, 1.05, 1.3); core.position.set(0, 1.0, 0.2); holder.add(core);
  const trailMat = new THREE.MeshBasicMaterial({ map: EscapeStage._tex.trail, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.15, 1, 18, 1, true), trailMat);
  trail.rotation.x = -Math.PI / 2; trail.position.set(0, 1.0, -3); holder.add(trail);
  const boom = add(new THREE.ConeGeometry(2.2, 3.4, 24, 1, true), 0xcfeeff, THREE.DoubleSide);
  boom.rotation.x = -Math.PI / 2; boom.position.set(0, 1.0, 1.7); holder.add(boom);
  const wave = add(new THREE.TorusGeometry(1.6, 0.18, 8, 40), 0xdff4ff); wave.position.set(0, 1.0, 1.0); holder.add(wave);
  return { root: holder, body, model, mixer, actions, ball, shellMat, aura, core, trail, trailMat, boom, wave, cur: null };
}

// The Egg Pawn has no animations, so bake its bind pose into a plain mesh
// (cloned skinned meshes would all share one skeleton).
function escPawnModel() {
  if (typeof ESC_MODELS === 'undefined') return null;
  const m = escBuildModel(ESC_MODELS.pawn);
  m.root.updateMatrixWorld(true);
  const g = new THREE.Group();
  for (const mesh of Object.values(m.meshes)) {
    const geo = mesh.geometry.clone(), pos = geo.attributes.position, v = new THREE.Vector3();
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (mesh.isSkinnedMesh) mesh.boneTransform(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight');
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mesh.material));
  }
  const box = new THREE.Box3().setFromObject(g);
  const k = 2.6 / ((box.max.y - box.min.y) || 1);
  g.scale.setScalar(k); g.position.y = -box.min.y * k;
  const holder = new THREE.Group(); holder.add(g);
  return holder;
}

// --------------------------------------------------------------- the course
// Segment options: yaw (total turn), pitch (target slope), bank (roll at the
// middle of a turn), loop {shift}, cork {r}, env, w (track width).
class EscapeCourse {
  constructor() {
    this.segs = []; this.objs = []; this.holes = []; this.hints = [];
    this.layout();
    this.sample();
    this.objs.sort((a, b) => a.s - b.s);
  }

  seg(len, o = {}) { this.segs.push({ len, yaw: 0, pitch: 0, bank: 0, env: 'base', w: 14, ...o }); return this; }
  get at0() { return this.segs.reduce((a, s) => a + s.len, 0); }   // where the next segment starts
  add(type, s, x = 0, o = {}) { const ob = { type, s, x, y: 0, ...o }; this.objs.push(ob); return ob; }
  rings(s, n, x, gap = 4, y = 1) { for (let i = 0; i < n; i++) this.add('ring', s + i * gap, x, { y }); }
  arc(s, n, x, gap, h) { for (let i = 0; i < n; i++) this.add('ring', s + i * gap, x, { y: 1 + Math.sin(i / (n - 1) * Math.PI) * h }); }
  hole(s0, s1, x0 = -99, x1 = 99) { this.holes.push({ s0, s1, x0, x1 }); }
  hint(s, text) { this.hints.push({ s, text }); }

  layout() {
    let s;
    // ===== A. the Egg Base =====
    this.seg(140).seg(160, { yaw: 0.6, bank: 0.12 }).seg(100).seg(140, { yaw: -0.7, pitch: -0.06, bank: -0.12 }).seg(70);
    this.hint(8, 'The whole base is coming down! Hold {laser} to BOOST!');
    this.rings(30, 8, 0); this.rings(80, 8, -4); this.rings(110, 6, 4);
    this.hint(100, 'Hold {clones}, let go: SPIN DASH! Faster than running, and it busts bots!');
    this.hint(150, 'Crates! BOOST {laser} straight through them!');
    for (const x of [-4, 0, 4]) this.add('crate', 172, x);
    this.hint(196, 'Boost or jump {punch} into those bots!');
    this.add('pawn', 210, -3); this.add('pawn', 224, 2); this.add('pawn', 238, -1);
    this.hint(285, 'Laser trip-wires! JUMP {punch}!');
    this.add('laserLow', 305); this.rings(312, 5, 0); this.add('laserHigh', 345);
    this.hint(328, 'Under this one! Hold {down} to slide!');
    for (const [ss, x] of [[392, -3], [408, 3], [424, 0], [440, -4]]) this.add('debris', ss, x);
    this.hint(372, 'Watch the ceiling!');
    this.add('dash', 455, 0); this.hole(470, 490); this.arc(462, 9, 0, 4, 4);
    s = this.at0;
    this.seg(30, { env: 'hangar', w: 16 });
    this.add('dash', s + 8, 0);
    s = this.at0;
    this.seg(120, { env: 'hangar', w: 16, loop: { shift: 18 } });     // a loop through the hangar
    for (let i = 0; i < 11; i++) this.add('ring', s + 6 + i * 10, 0, { y: 1 });
    this.seg(80, { env: 'hangar', w: 16 });
    this.BASE_END = this.at0;
    this.hint(this.BASE_END - 50, "There's the door! BOOST!");

    // ===== B. the highway through the city =====
    s = this.at0;
    this.seg(140, { env: 'road', w: 16, pitch: -0.04 });
    this.hint(s + 15, "We're out! And the blast is right behind me!");
    this.hint(s + 62, "Egg trucks! Too heavy to bust, so steer round them!");
    this.rings(s + 20, 10, 0, 5); this.add('pawn', s + 55, 0); this.add('car', s + 80, -4); this.add('car', s + 105, 4); this.add('laserLow', s + 128);
    s = this.at0;
    this.seg(220, { env: 'road', w: 16, yaw: 1.1, bank: 0.45 });
    this.rings(s + 20, 12, -5, 6); for (const x of [-5, 0, 5]) this.add('crate', s + 70, x);
    this.add('pawn', s + 120, 0); this.add('pawn', s + 132, 4); this.add('car', s + 165, -2); this.add('car', s + 165, 5); this.add('laserHigh', s + 200);
    s = this.at0;
    this.seg(150, { env: 'road', w: 16 });
    this.hint(s + 2, 'The bridge is out! Jump, then home in {punch}!');
    this.add('dash', s + 18, 0); this.add('ramp', s + 34, 0, { w: 16 });
    this.hole(s + 46, s + 104);
    for (const [ds, y, x] of [[58, 4.5, 0], [72, 5.5, 2], [86, 5.5, -2], [100, 4.5, 0]]) this.add('drone', s + ds, x, { y });
    s = this.at0;
    this.seg(220, { env: 'road', w: 16, yaw: -1.2, bank: -0.5 });
    this.rings(s + 20, 12, 5, 6); this.add('pawn', s + 40, -3); this.add('pawn', s + 50, 3); this.add('laserLow', s + 70);
    this.add('car', s + 95, 0); this.add('car', s + 115, -5); this.add('car', s + 115, 5); for (const x of [-4, 0, 4]) this.add('crate', s + 150, x); this.add('laserHigh', s + 190);
    s = this.at0;
    this.seg(40, { env: 'road', w: 16 }); this.add('dash', s + 10, 0);
    s = this.at0;
    this.seg(130, { env: 'road', w: 16, loop: { shift: 20 } });
    for (let i = 0; i < 12; i++) this.add('ring', s + 8 + i * 10, 0, { y: 1 });
    s = this.at0;
    this.seg(110, { env: 'road', w: 16 });
    this.add('laserLow', s + 30); this.add('car', s + 60, 3); this.add('car', s + 60, -3); this.add('pawn', s + 78, 0); this.add('laserHigh', s + 98);
    s = this.at0;
    this.hint(s - 12, 'Corkscrew! Hang on!');
    this.seg(170, { env: 'road', w: 16, cork: { r: 10 } });
    for (let i = 0; i < 14; i++) this.add('ring', s + 10 + i * 11, 0, { y: 1 });
    s = this.at0;
    this.seg(120, { env: 'road', w: 16 });
    for (const x of [-4, 4]) this.add('crate', s + 14, x);
    this.add('pawn', s + 30, -4); this.add('pawn', s + 38, 0); this.add('pawn', s + 46, 4); this.add('laserLow', s + 66); this.add('laserHigh', s + 92);
    this.HIGHWAY_END = this.at0;

    // ===== C. straight down a skyscraper =====
    s = this.at0;
    this.seg(60, { env: 'roof', w: 14 });
    this.hint(s + 4, "End of the road... so I'll take the BUILDING!");
    this.rings(s + 10, 4, 0, 5); this.add('laserLow', s + 34);
    s = this.at0;
    this.seg(240, { env: 'glass', w: 14, pitch: -1.5 });
    this.rings(s + 30, 28, 0, 6);
    for (const [ds, x] of [[70, 3], [92, -3], [114, 0], [134, 4], [152, -4], [172, 1], [190, -2]]) this.add('debris', s + ds, x, { glass: true });
    this.add('drone', s + 205, 0, { y: 1.5 });
    this.FACADE = [s, this.at0];
    s = this.at0;
    this.seg(90, { env: 'road', w: 16, pitch: 0 });
    for (const x of [-5, 0, 5]) this.add('crate', s + 40, x); this.add('dash', s + 70, 0);

    // ===== D. across the bay =====
    s = this.at0;
    this.seg(60, { env: 'road', w: 16 });
    this.hint(s - 120, "Water up ahead. Save some boost: if I stop boosting out there, I sink!");
    this.hint(s, "HOLD {laser}! Don't let go till we're across!");
    s = this.at0;
    this.WATER = [s];
    this.seg(220, { env: 'water', w: 24, yaw: 0.5, bank: 0.1 });
    this.rings(s + 10, 30, -3, 6); this.add('rock', s + 45, -8); this.add('dash', s + 60, 3); this.add('rock', s + 85, 0); this.add('rock', s + 100, 7);
    this.add('rock', s + 125, -5); this.add('rock', s + 140, 3); this.add('dash', s + 165, -2); this.add('rock', s + 195, 6); this.add('rock', s + 195, -6);
    s = this.at0;
    this.seg(240, { env: 'water', w: 24, yaw: -0.6, bank: -0.1 });
    this.rings(s + 5, 30, 3, 7); this.add('rock', s + 30, -3); this.add('rock', s + 55, 4); this.add('dash', s + 80, 0); this.add('rock', s + 105, -6);
    this.add('rock', s + 120, 0); this.add('rock', s + 135, 7);
    for (const [ds, y, x] of [[160, 3.5, 0], [175, 4.5, 3], [190, 4.5, -3]]) this.add('drone', s + ds, x, { y });
    this.add('dash', s + 212, 0);
    this.WATER.push(this.at0);

    // ===== E. the coast road and the final loop =====
    s = this.at0;
    this.seg(100, { env: 'road', w: 16, pitch: 0.05 });
    this.hint(s + 5, 'Almost clear!');
    this.add('car', s + 30, -4); for (const x of [-5, 0, 5]) this.add('crate', s + 55, x);
    this.add('dash', s + 82, 0);
    s = this.at0;
    this.seg(130, { env: 'road', w: 16, loop: { shift: -20 } });
    for (let i = 0; i < 12; i++) this.add('ring', s + 8 + i * 10, 0, { y: 1 });
    s = this.at0;
    this.seg(150, { env: 'road', w: 16 });
    this.add('laserLow', s + 25); this.add('pawn', s + 48, -3); this.add('pawn', s + 56, 3); this.add('laserHigh', s + 76); this.add('car', s + 92, 4); this.add('car', s + 92, -4); this.add('dash', s + 112, 0);
    this.hint(s + 90, 'BOOST!!');
    this.END = this.at0;
    this.add('ramp', this.END - 22, 0, { w: 16, big: true });
    this.seg(360, { env: 'outside', w: 40 });
    this.LEN = this.at0;
  }

  sample() {
    const pts = [];
    const up = new THREE.Vector3(0, 1, 0);
    const dirOf = (yaw, pitch) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let pos = new THREE.Vector3(), yaw = 0, pitch = 0, prevEnv = null;
    for (const sg of this.segs) {
      const start = pos.clone();
      const pk = sg.env === 'glass' || prevEnv === 'glass' ? 0.07 : 0.035;
      for (let i = 0; i < sg.len; i++) {
        const k = i / sg.len;
        yaw += sg.yaw / sg.len;
        pitch += (sg.pitch - pitch) * pk;
        const bank = sg.bank * Math.sin(Math.PI * k);
        const f0 = dirOf(yaw, pitch);
        const r0 = new THREE.Vector3().crossVectors(f0, up).normalize();
        const n0 = new THREE.Vector3().crossVectors(r0, f0).normalize();
        let p, f, r, n;
        if (sg.loop) {
          // a vertical circle with a sideways shift so the exit runs beside the entrance
          const R = sg.len / (Math.PI * 2), th = k * Math.PI * 2, sh = sg.loop.shift;
          p = start.clone().addScaledVector(f0, R * Math.sin(th)).addScaledVector(n0, R * (1 - Math.cos(th))).addScaledVector(r0, sh * (k - Math.sin(th) / (Math.PI * 2)));
          f = f0.clone().multiplyScalar(Math.cos(th)).addScaledVector(n0, Math.sin(th)).addScaledVector(r0, sh * (1 - Math.cos(th)) / sg.len).normalize();
          n = n0.clone().multiplyScalar(Math.cos(th)).addScaledVector(f0, -Math.sin(th)).normalize();
          r = new THREE.Vector3().crossVectors(f, n).normalize();
          n = new THREE.Vector3().crossVectors(r, f).normalize();
        } else if (sg.cork) {
          // a helix around the direction of travel; the floor faces the axis
          const R = sg.cork.r;
          const off = (a) => n0.clone().multiplyScalar(-Math.cos(a) * R).addScaledVector(r0, Math.sin(a) * R);
          const at = (j) => start.clone().addScaledVector(f0, j).add(off(j / sg.len * Math.PI * 2)).sub(off(0));
          p = at(i);
          f = at(i + 0.5).sub(p).normalize();
          n = off(k * Math.PI * 2).multiplyScalar(-1 / R);
          r = new THREE.Vector3().crossVectors(f, n).normalize();
          n = new THREE.Vector3().crossVectors(r, f).normalize();
        } else {
          p = pos.clone();
          r = r0.clone().multiplyScalar(Math.cos(bank)).addScaledVector(n0, -Math.sin(bank)).normalize();
          n = n0.clone().multiplyScalar(Math.cos(bank)).addScaledVector(r0, Math.sin(bank)).normalize();
          f = f0;
          pos.addScaledVector(f0, 1);
        }
        pts.push({ p, f, r, n, env: sg.env, hw: sg.w / 2 });
      }
      const fEnd = dirOf(yaw, pitch);
      if (sg.loop) pos = start.clone().addScaledVector(new THREE.Vector3().crossVectors(fEnd, up).normalize(), sg.loop.shift);
      if (sg.cork) pos = start.clone().addScaledVector(fEnd, sg.len);
      prevEnv = sg.env;
    }
    this.pts = pts;
  }

  frame(s) { return this.pts[Math.max(0, Math.min(this.pts.length - 1, Math.floor(s)))]; }
  env(s) { return this.frame(s).env; }
  hw(s) { return this.frame(s).hw; }

  // world position of a track-space point
  at(s, x, y, out = new THREE.Vector3()) {
    const n = this.pts.length;
    const i = Math.max(0, Math.min(n - 2, Math.floor(s))), k = Math.max(0, Math.min(1, s - i));
    const a = this.pts[i], b = this.pts[i + 1];
    out.copy(a.p).lerp(b.p, k);
    if (s > n - 1) out.addScaledVector(a.f, s - (n - 1));
    if (s < 0) out.addScaledVector(a.f, s);
    const r = a.r.clone().lerp(b.r, k), nn = a.n.clone().lerp(b.n, k);
    return out.addScaledVector(r, x).addScaledVector(nn, y);
  }
  // rotation matrix for a model standing on the track at s (faces +z along the track)
  basis(s, m4 = new THREE.Matrix4()) {
    const n = this.pts.length, i = Math.max(0, Math.min(n - 2, Math.floor(s))), k = Math.max(0, Math.min(1, s - i));
    const a = this.pts[i], b = this.pts[i + 1];
    const f = a.f.clone().lerp(b.f, k).normalize(), nn = a.n.clone().lerp(b.n, k).normalize();
    const r = new THREE.Vector3().crossVectors(f, nn).normalize();
    nn.crossVectors(r, f).normalize();
    return m4.makeBasis(r.negate(), nn, f);
  }

  floorAt(s, x) {
    if (s >= this.END) return true;            // the ground outside
    if (Math.abs(x) > this.hw(s) + 0.01) return false;
    for (const h of this.holes) if (s >= h.s0 && s < h.s1 && x >= h.x0 && x < h.x1) return false;
    return true;
  }
}

// --------------------------------------------------------------- the stage
class EscapeStage {
  constructor(game) {
    this.g = game;
    this.t = 0; this.phase = 'intro';
    this.s = 4; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.speed = 0;
    this.ground = true; this.jumped = false; this.slide = false; this.boosting = false; this.boostT = 0;
    this.gauge = 100; this.invuln = 0; this.homing = null; this.chain = 0; this.airDash = false;
    this.lean = 0; this.dead = null; this.trick = 0; this.sink = 0; this.hitT = 0; this.dashT = 0; this.dashAir = 0;
    this.rev = 0; this.rolling = false;
    this.collapse = -70; this.shake = 0; this.flash = 0; this.boostFlash = 0; this.fovKick = 0;
    this.hintIdx = 0; this.objIdx = 0;
    this.fx = []; this.lostRings = []; this.chunks = [];
    game.time = 0;
    try { this.course = new EscapeCourse(); this.init3D(); } catch (e) { console.warn('3D escape unavailable', e); this.failed = true; this.phase = 'tbc'; }
  }

  // one renderer for the whole session (WebGL contexts are limited)
  static renderer() {
    if (!EscapeStage._r) {
      const c = document.createElement('canvas'); c.width = VIEW_W; c.height = VIEW_H;
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(1); r.setSize(VIEW_W, VIEW_H, false);
      EscapeStage._r = r; EscapeStage._tex = escTextures();
    }
    return EscapeStage._r;
  }

  init3D() {
    this.renderer = EscapeStage.renderer();
    const T = this.tex = EscapeStage._tex;
    const C = this.course;
    const scene = this.scene = new THREE.Scene();
    this.fogIn = new THREE.Color(0x2a0806); this.fogOut = new THREE.Color(0xb8587a);
    scene.background = this.fogIn.clone();
    scene.fog = new THREE.Fog(this.fogIn.clone(), 30, 190);
    this.camera = new THREE.PerspectiveCamera(66, VIEW_W / VIEW_H, 0.1, 5000);
    this.hemi = new THREE.HemisphereLight(0xffd6b8, 0x3a0c08, 0.95); scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0e0, 0.8); sun.position.set(0.4, 1, -0.3); scene.add(sun);
    this.alarmLight = new THREE.PointLight(0xff2010, 1.2, 40); scene.add(this.alarmLight);
    this.m4 = new THREE.Matrix4();
    this.tunnel = []; this.outdoor = [];

    // --- the track surface, walls and rails, built along the course
    const bufs = {};
    const quad = (key, a, b, c, d, ua, ub, uc, ud) => {
      const B = (bufs[key] = bufs[key] || { p: [], u: [] });
      for (const [p, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { B.p.push(p.x, p.y, p.z); B.u.push(u[0], u[1]); }
    };
    const W = (s, x, y) => C.at(s, x, y, new THREE.Vector3());
    const floorKey = { base: 'floor', hangar: 'hangar', road: 'road', roof: 'concrete', glass: 'glass' };
    const step = 2, U = [0, 0];
    for (let s = 0; s < C.END; s += step) {
      const env = C.env(s + 1), hw = C.hw(s + 1);
      const key = floorKey[env];
      if (key) {
        const cell = 2, sc = env === 'road' ? 2 * hw : 4;
        for (let x = -hw; x < hw - 0.01; x += cell) {
          if (!C.floorAt(s + step / 2, x + cell / 2)) continue;
          quad(key, W(s, x, 0), W(s, x + cell, 0), W(s + step, x + cell, 0), W(s + step, x, 0),
            [(x + hw) / sc, s / sc], [(x + hw + cell) / sc, s / sc], [(x + hw + cell) / sc, (s + step) / sc], [(x + hw) / sc, (s + step) / sc]);
          if (env !== 'base') quad('under', W(s, x, -0.6), W(s, x + cell, -0.6), W(s + step, x + cell, -0.6), W(s + step, x, -0.6), U, U, U, U);
        }
      }
      for (const side of [-1, 1]) {
        const x = side * hw, xi = x - side * 0.05;
        if (env === 'base') {
          quad('wall', W(s, x, -16), W(s + step, x, -16), W(s + step, x, 8), W(s, x, 8), [s / 8, -2], [(s + step) / 8, -2], [(s + step) / 8, 1], [s / 8, 1]);
          quad('strip', W(s, xi, 5.6), W(s + step, xi, 5.6), W(s + step, xi, 5.9), W(s, xi, 5.9), U, U, U, U);
          quad('hazard', W(s, xi, 0), W(s + step, xi, 0), W(s + step, xi, 0.5), W(s, xi, 0.5), [s / 4, 0], [(s + step) / 4, 0], [(s + step) / 4, 1], [s / 4, 1]);
        } else if (env === 'road' || env === 'hangar' || env === 'roof') {
          if (!C.floorAt(s + 1, x - side * 0.5)) continue;
          quad('rail', W(s, x, 0), W(s + step, x, 0), W(s + step, x, 1.1), W(s, x, 1.1), [s / 4, 0], [(s + step) / 4, 0], [(s + step) / 4, 1], [s / 4, 1]);
          quad(env === 'hangar' ? 'cyan' : 'strip', W(s, xi, 1.1), W(s + step, xi, 1.1), W(s + step, xi, 1.25), W(s, xi, 1.25), U, U, U, U);
        }
      }
    }
    for (const h of C.holes) {   // glowing lips on pit edges
      const hw = C.hw(h.s0), x0 = Math.max(-hw, h.x0), x1 = Math.min(hw, h.x1);
      for (const [a, b] of [[h.s0 - 0.7, h.s0], [h.s1, h.s1 + 0.7]]) quad('lip', W(a, x0, 0.03), W(a, x1, 0.03), W(b, x1, 0.03), W(b, x0, 0.03), U, U, U, U);
    }
    this.stripMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, side: THREE.DoubleSide });
    const mats = {
      floor: new THREE.MeshLambertMaterial({ map: T.floor, side: THREE.DoubleSide }),
      hangar: new THREE.MeshLambertMaterial({ map: T.hangar, side: THREE.DoubleSide }),
      road: new THREE.MeshLambertMaterial({ map: T.road, side: THREE.DoubleSide }),
      concrete: new THREE.MeshLambertMaterial({ map: T.concrete, side: THREE.DoubleSide }),
      glass: new THREE.MeshPhongMaterial({ map: T.glass, side: THREE.DoubleSide, shininess: 80, specular: 0x8899aa }),
      under: new THREE.MeshLambertMaterial({ color: 0x3a3d45, side: THREE.DoubleSide }),
      wall: new THREE.MeshLambertMaterial({ map: T.wall, side: THREE.DoubleSide }),
      strip: this.stripMat,
      cyan: new THREE.MeshBasicMaterial({ color: 0x4fd0ff, side: THREE.DoubleSide }),
      hazard: new THREE.MeshLambertMaterial({ map: T.hazard, side: THREE.DoubleSide }),
      rail: new THREE.MeshLambertMaterial({ map: T.rail, side: THREE.DoubleSide }),
      lip: new THREE.MeshBasicMaterial({ color: 0xffa020, side: THREE.DoubleSide }),
    };
    for (const [k, B] of Object.entries(bufs)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
      geo.computeVertexNormals();
      const me = new THREE.Mesh(geo, mats[k]); scene.add(me);
      if (k === 'wall' || k === 'hazard') this.tunnel.push(me);
    }
    // ceiling girders and lamps in the base, lava under its pits
    const girderGeo = new THREE.BoxGeometry(15, 0.7, 0.9), girderMat = new THREE.MeshLambertMaterial({ color: 0x3a3e48 });
    const lampGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5); this.lampMat = new THREE.MeshBasicMaterial({ color: 0xff3a1a });
    for (let s = 6; s < C.BASE_END; s += 12) {
      if (C.env(s) !== 'base') continue;
      const g = new THREE.Mesh(girderGeo, girderMat); g.position.copy(C.at(s, 0, 8.3)); C.basis(s, this.m4); g.quaternion.setFromRotationMatrix(this.m4); scene.add(g); this.tunnel.push(g);
      if ((s / 12 | 0) % 2 === 0) for (const side of [-1, 1]) { const l = new THREE.Mesh(lampGeo, this.lampMat); l.position.copy(C.at(s, side * 6.6, 6.6)); l.quaternion.copy(g.quaternion); scene.add(l); this.tunnel.push(l); }
    }
    for (const h of C.holes) {
      if (C.env(h.s0) !== 'base') continue;
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(14, h.s1 - h.s0), new THREE.MeshBasicMaterial({ color: 0xff5a10, fog: false, side: THREE.DoubleSide }));
      lava.position.copy(C.at((h.s0 + h.s1) / 2, 0, -12)); C.basis(h.s0, this.m4); lava.quaternion.setFromRotationMatrix(this.m4); lava.rotateX(-Math.PI / 2); scene.add(lava);
    }
    // the hangar's end wall, with the exit and two blast doors that slide open as you come
    C.basis(C.BASE_END, this.m4);
    const wq = new THREE.Quaternion().setFromRotationMatrix(this.m4), wallMat = new THREE.MeshLambertMaterial({ map: T.wall, side: THREE.DoubleSide });
    const exit = new THREE.Group(); exit.position.copy(C.at(C.BASE_END, 0, 0)); exit.quaternion.copy(wq); scene.add(exit);
    const slab = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), wallMat); m.position.set(x, y, 0.6); exit.add(m); return m; };
    slab(120, 60, -69, 10); slab(120, 60, 69, 10); slab(18, 40, 0, 30); slab(18, 30, 0, -15.2);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), new THREE.MeshBasicMaterial({ color: 0xfff3d6, fog: false })); light.position.set(0, 5, 1.3); exit.add(light);
    const doorMat = new THREE.MeshLambertMaterial({ map: T.hazard });
    this.doors = [-1, 1].map((side) => { const d = new THREE.Mesh(new THREE.BoxGeometry(9, 10, 0.8), doorMat); d.position.set(side * 4.5, 5, 0.2); exit.add(d); return d; });
    this.door = exit; this.tunnel.push(exit);

    this.buildWorld();
    this.buildObjects();

    this.sonic = escSonicModel(); scene.add(this.sonic.root);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    scene.add(sh); this.shadow = sh;
    this.glowMat = new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.blueMat = new THREE.SpriteMaterial({ map: T.blueGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.sprayMat = new THREE.SpriteMaterial({ map: T.spray, depthWrite: false, transparent: true });
    this.smokeMat = new THREE.SpriteMaterial({ map: T.smoke, depthWrite: false, transparent: true });
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 4, 1), new THREE.MeshBasicMaterial({ color: 0x7ff0ff, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    this.reticle.visible = false; this.reticle.renderOrder = 10; scene.add(this.reticle);
  }

  // City, sea and the Egg Base dome around the course
  buildWorld() {
    const C = this.course, T = this.tex, scene = this.scene;
    const street = C.frame(C.WATER[0]).p.y;           // street and sea level
    this.streetY = street;
    // the sea
    T.water.repeat.set(160, 160);
    const w0 = C.frame(C.WATER[0]).p;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshPhongMaterial({ map: T.water, color: 0xa8dcff, shininess: 90, specular: 0x88aacc }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(w0.x, street - 0.15, w0.z);
    scene.add(sea); this.sea = sea; this.outdoor.push(sea);
    // a city block under the highway and the skyscraper
    const cityPts = [];
    for (let s = C.BASE_END; s < C.FACADE[1]; s += 10) cityPts.push(C.frame(s).p);
    const box = new THREE.Box3().setFromPoints(cityPts).expandByScalar(110);
    T.street.repeat.set((box.max.x - box.min.x) / 40, (box.max.z - box.min.z) / 40);
    const city = new THREE.Mesh(new THREE.PlaneGeometry(box.max.x - box.min.x, box.max.z - box.min.z), new THREE.MeshLambertMaterial({ map: T.street }));
    city.rotation.x = -Math.PI / 2; city.position.set((box.min.x + box.max.x) / 2, street + 0.05, (box.min.z + box.max.z) / 2);
    scene.add(city); this.outdoor.push(city);
    // skyscrapers along the highway (one instanced mesh), kept clear of the track, loops and corkscrew
    const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
    const bMat = new THREE.MeshLambertMaterial({ map: T.windows, emissive: 0xffffff, emissiveMap: T.windows, emissiveIntensity: 0.35 });
    const track = [];
    for (let s = C.BASE_END - 100; s < C.END + 40; s += 4) track.push(C.frame(s).p);
    const clear = (pos, w) => track.every((p) => Math.hypot(p.x - pos.x, p.z - pos.z) > w * 0.75 + 34);
    const spots = [];
    for (let s = C.BASE_END + 20; s < C.FACADE[1] + 60; s += 18) {
      const fr = C.frame(s);
      for (const side of [-1, 1]) {
        if (Math.random() < 0.15) continue;
        const w = 18 + Math.random() * 26, d = 44 + w / 2 + Math.random() * 110, top = fr.p.y + (Math.random() * 140 - 60);
        const pos = fr.p.clone().addScaledVector(new THREE.Vector3(fr.r.x, 0, fr.r.z).normalize(), side * d); pos.y = street;
        if (!clear(pos, w)) continue;
        spots.push({ pos, w, h: Math.max(30, top - street), rot: Math.atan2(fr.f.x, fr.f.z) });
      }
    }
    const inst = new THREE.InstancedMesh(bGeo, bMat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    spots.forEach((b, i) => { q.setFromAxisAngle(Y, b.rot); sc.set(b.w, b.h, b.w); m.compose(b.pos, q, sc); inst.setMatrixAt(i, m); });
    scene.add(inst); this.outdoor.push(inst);
    // the skyscraper Sonic runs down: its face is the track
    const [fa, fb] = C.FACADE, mid = (fa + fb) / 2, mf = C.frame(mid);
    let behind = 0;      // how far behind the middle of the face the curved ends of the run dip
    for (let s = fa; s <= fb; s += 2) behind = Math.max(behind, -C.frame(s).p.clone().sub(mf.p).dot(mf.n));
    const towerMat = new THREE.MeshLambertMaterial({ map: T.windows, emissive: 0xffffff, emissiveMap: T.windows, emissiveIntensity: 0.3 });
    // top stops just under the roof edge (so the rooftop run never clips it), bottom runs past the street
    const tower = new THREE.Mesh(new THREE.BoxGeometry(36, 60, fb - fa + 40), towerMat);
    C.basis(mid, this.m4); tower.quaternion.setFromRotationMatrix(this.m4);
    tower.position.copy(mf.p).addScaledVector(mf.n, -(30 + behind + 0.8)).addScaledVector(mf.f, 30);
    scene.add(tower); this.outdoor.push(tower);
    const roofS = fa - 30, rf = C.frame(roofS);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 70), towerMat);
    C.basis(roofS, this.m4); roof.quaternion.setFromRotationMatrix(this.m4);
    roof.position.copy(rf.p).addScaledVector(rf.n, -4.8); scene.add(roof); this.outdoor.push(roof);
    // highway support pillars
    const pGeo = new THREE.BoxGeometry(2.4, 1, 2.4); pGeo.translate(0, -0.5, 0);
    const pMat = new THREE.MeshLambertMaterial({ color: 0x6b6f78 });
    for (let s = C.BASE_END + 30; s < C.HIGHWAY_END; s += 40) {
      const fr = C.frame(s);
      if (fr.n.y < 0.9) continue;          // not under loops / the corkscrew
      const p = new THREE.Mesh(pGeo, pMat); p.position.copy(fr.p).addScaledVector(fr.n, -0.6); p.scale.y = Math.max(1, p.position.y - street); scene.add(p); this.outdoor.push(p);
    }
    // buoys and rocks in the bay
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x5e5a55 }), buoyMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0x401800 });
    const buoyGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10);
    for (let s = C.WATER[0]; s < C.WATER[1]; s += 24) {
      const fr = C.frame(s);
      for (const side of [-1, 1]) {
        const b = new THREE.Mesh(buoyGeo, buoyMat);
        b.position.copy(fr.p).addScaledVector(fr.r, side * (fr.hw + 0.8)); b.position.y = street + 0.3; scene.add(b); this.outdoor.push(b);
        if (Math.random() < 0.5) {
          const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + Math.random() * 10, 0), rockMat);
          rk.position.copy(fr.p).addScaledVector(fr.r, side * (40 + Math.random() * 80)); rk.position.y = street;
          if (track.every((p) => Math.hypot(p.x - rk.position.x, p.z - rk.position.z) > 34)) { scene.add(rk); this.outdoor.push(rk); }
        }
      }
    }
    // the Egg Base: a dome over the start of the course
    T.dome.repeat.set(8, 3);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(190, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: T.dome }));
    const bc = C.frame(C.BASE_END * 0.45).p;
    dome.position.set(bc.x, bc.y - 40, bc.z); scene.add(dome); this.dome = dome; this.outdoor.push(dome);
    // the coast past the finish
    T.ground.repeat.set(30, 30);
    const fE = C.frame(C.END);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ map: T.ground }));
    ground.rotation.x = -Math.PI / 2; ground.position.copy(fE.p).addScaledVector(fE.f, 430); ground.position.y = fE.p.y - 0.02;
    scene.add(ground); this.outdoor.push(ground);
    for (const o of this.outdoor) o.visible = false;
  }

  buildObjects() {
    const C = this.course, T = this.tex, scene = this.scene, m4 = this.m4;
    this.ringGeo = new THREE.TorusGeometry(0.45, 0.1, 8, 20);
    this.ringMat = new THREE.MeshPhongMaterial({ color: 0xffc41f, emissive: 0x6a4400, shininess: 90, specular: 0xffffff });
    const crateGeo = new THREE.BoxGeometry(2, 2, 2), crateMat = this.crateMat = new THREE.MeshLambertMaterial({ map: T.crate });
    this.chunkGeo = new THREE.BoxGeometry(0.6, 0.45, 0.5);
    this.pawnChunkMat = new THREE.MeshLambertMaterial({ color: 0xb8202a }); this.droneChunkMat = new THREE.MeshLambertMaterial({ color: 0x80869a });
    const debrisGeo = new THREE.DodecahedronGeometry(1.3, 0), debrisMat = new THREE.MeshLambertMaterial({ color: 0x5a5e68, emissive: 0x1a0500 });
    const shardMat = new THREE.MeshPhongMaterial({ color: 0x9cc8ff, transparent: true, opacity: 0.75, shininess: 100 });
    const rockGeo = new THREE.DodecahedronGeometry(1.6, 0), rockMat = new THREE.MeshLambertMaterial({ color: 0x6a645c });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    this.beamGlow = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2d35 });
    const warnGeo = new THREE.RingGeometry(1.4, 1.9, 24), warnMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const pawnProto = escPawnModel();
    for (const o of C.objs) {
      C.basis(o.s, m4);
      const q = new THREE.Quaternion().setFromRotationMatrix(m4);
      const hw = C.hw(o.s);
      let m = null;
      if (o.type === 'ring') { m = new THREE.Mesh(this.ringGeo, this.ringMat); m.position.copy(C.at(o.s, o.x, o.y)); m.quaternion.copy(q); }
      else if (o.type === 'crate') { m = new THREE.Mesh(crateGeo, crateMat); m.position.copy(C.at(o.s, o.x, 1)); m.quaternion.copy(q); }
      else if (o.type === 'rock') { m = new THREE.Mesh(rockGeo, rockMat); m.position.copy(C.at(o.s, o.x, 0.6)); m.scale.set(1.1, 1.5, 1.1); }
      else if (o.type === 'car') { m = this.makeCar(); m.position.copy(C.at(o.s, o.x, 0)); m.quaternion.copy(q); }
      else if (o.type === 'pawn') { m = pawnProto ? pawnProto.clone() : this.makeDrone(); m.position.copy(C.at(o.s, o.x, 0)); m.quaternion.copy(q); m.rotateY(Math.PI); }
      else if (o.type === 'drone') { m = this.makeDrone(); m.position.copy(C.at(o.s, o.x, o.y)); m.quaternion.copy(q); m.rotateY(Math.PI); }
      else if (o.type === 'debris') {
        m = new THREE.Mesh(debrisGeo, o.glass ? shardMat : debrisMat); m.position.copy(C.at(o.s, o.x, 20)); m.visible = false;
        if (o.glass) m.scale.set(1.4, 0.25, 1.4);
        const w = new THREE.Mesh(warnGeo, warnMat.clone()); w.position.copy(C.at(o.s, o.x, 0.06)); w.quaternion.copy(q); w.rotateX(-Math.PI / 2); w.visible = false; scene.add(w); o.warn = w;
        o.fall = -1;
      } else if (o.type === 'laserLow' || o.type === 'laserHigh') {
        m = new THREE.Group(); m.position.copy(C.at(o.s, 0, 0)); m.quaternion.copy(q);
        const ys = o.type === 'laserLow' ? [0.25, 0.6] : [1.3, 2.1, 2.9, 3.7, 4.5];
        for (const y of ys) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, hw * 2, 6), beamMat); b.rotation.z = Math.PI / 2; b.position.y = y; m.add(b);
          const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, hw * 2, 8, 1, true), this.beamGlow); gl.rotation.z = Math.PI / 2; gl.position.y = y; m.add(gl);
        }
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.2, 0.5), postMat); p.position.set(sx * (hw - 0.25), 2.6, 0); m.add(p); }
      } else if (o.type === 'dash') {
        const tex = T.dash.clone(); tex.needsUpdate = true; o.tex = tex;
        m = new THREE.Mesh(new THREE.PlaneGeometry(3, 5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        m.position.copy(C.at(o.s, o.x, C.env(o.s) === 'water' ? 0.15 : 0.05)); m.quaternion.copy(q); m.rotateX(-Math.PI / 2);
      } else if (o.type === 'ramp') {
        const len = o.big ? 10 : 7, h = o.big ? 2.4 : 1.6, w2 = o.w / 2;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([-w2, 0, 0, w2, 0, 0, w2, h, len, -w2, 0, 0, w2, h, len, -w2, h, len, -w2, 0, len, w2, h, len, w2, 0, len, -w2, 0, len, -w2, h, len, w2, h, len], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w2, 0, w2, 1, 0, 0, w2, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1], 2));
        geo.computeVertexNormals();
        m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: T.hazard, side: THREE.DoubleSide }));
        m.position.copy(C.at(o.s, o.x, 0)); m.quaternion.copy(q);
        o.len = len; o.h = h;
      }
      if (m) { scene.add(m); o.mesh = m; }
    }
  }

  makeCar() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 4.6), new THREE.MeshPhongMaterial({ color: 0xb8202a, shininess: 60 }));
    body.position.y = 1.0; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 2.2), new THREE.MeshPhongMaterial({ color: 0x23262e, shininess: 90 }));
    cab.position.set(0, 2.1, -0.4); g.add(cab);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
    for (const sx of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.1), lightMat); l.position.set(sx, 1.1, -2.32); g.add(l); }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.2, 4.62), new THREE.MeshBasicMaterial({ color: 0xffc21a })); stripe.position.y = 1.3; g.add(stripe);
    return g;
  }

  makeDrone() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), new THREE.MeshLambertMaterial({ color: 0x80869a })));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); eye.position.z = 0.5; g.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 6, 20), new THREE.MeshLambertMaterial({ color: 0xffc21a })); ring.rotation.x = Math.PI / 2; g.add(ring);
    g.userData.ring = ring;
    return g;
  }

  // ------------------------------------------------------------ helpers
  get height() { return this.slide ? 0.8 : (this.jumped || this.homing || this.rolling || this.rev > 0) ? 1.2 : 1.9; }
  get onWater() { return this.course.env(this.s) === 'water'; }

  sprite(mat, pos, size, dur, vy = 0.02, v = null) {
    const sp = new THREE.Sprite(mat); sp.position.copy(pos); this.scene.add(sp);
    this.fx.push({ m: sp, t: 0, dur, size, vy, v });
    return sp;
  }

  burst(pos, n = 1, big = 1) {
    for (let i = 0; i < n; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * big, (Math.random() - 0.5) * 2 * big, (Math.random() - 0.5) * 2 * big));
      this.sprite(this.glowMat, p, (2.5 + Math.random() * 2.5) * big, 26 + Math.random() * 14);
      if (Math.random() < 0.6) {
        const sm = new THREE.Sprite(this.smokeMat.clone()); sm.position.copy(p); this.scene.add(sm);
        this.fx.push({ m: sm, t: 0, dur: 50, size: 4 * big, vy: 0.05, smoke: true });
      }
    }
  }

  hurt(why) {
    const g = this.g;
    if (this.invuln > 0 || this.dead) return;
    if (g.rings > 0) {
      const n = Math.min(g.rings, 24);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(this.ringGeo, this.ringMat); m.position.copy(this.course.at(this.s, this.x, this.y + 1)); this.scene.add(m);
        this.lostRings.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5), t: 0 });
      }
      g.rings = 0; this.invuln = 120; this.speed *= 0.35; this.boosting = false;
      this.vy = 6; this.ground = false; this.jumped = false; this.homing = null; this.hitT = 30;
      Sound.play('ringloss'); this.shake = 10;
    } else this.die(why);
  }

  die(why) {
    if (this.dead) return;
    this.dead = { why, t: 0 }; this.boosting = false; this.homing = null;
    Sound.play('death'); Sound.boostHold(0);
    if (why === 'hit') { this.vy = 10; this.ground = false; }
    if (why === 'crushed') { this.shake = 30; Sound.play('boom', { rate: 0.5 }); }
    if (why === 'sank') Sound.play('pop', { rate: 0.5 });
  }

  // ------------------------------------------------------------ update
  update(inp) {
    const g = this.g;
    this.t++;
    if (this.shake > 0) this.shake *= 0.9;
    if (this.flash > 0) this.flash -= 0.04;
    if (this.boostFlash > 0) this.boostFlash -= 0.06;
    this.fovKick *= 0.9;
    if (this.phase === 'tbc') { if (this.t > 120 && (inp.startPressed || inp.jumpPressed || inp.punchPressed || inp.tapped || this.t > 480) && !g.tally) g.startTally(); return; }
    if (this.failed) return;
    this.updateFX();
    if (this.phase === 'intro') {
      if (this.t === 1) Sound.playTrack('assets/music/rise_from_the_ashes.mp3', 'escape');
      if (this.t === 100) { Sound.boostBurst(); this.speed = 30; this.boostFlash = 0.6; }
      if (this.t > 100) { this.phase = 'run'; this.t = 0; }
      this.pose(); return;
    }
    if (this.phase === 'outro') { this.updateOutro(inp); this.pose(); return; }
    if (this.dead) {
      const D = this.dead; D.t++;
      if (D.why === 'hit') { this.vy -= ESC_GRAV * ESC_DT; this.y += this.vy * ESC_DT; this.s -= 0.1; if (this.y < 0 && this.course.floorAt(this.s, this.x)) { this.y = 0; this.vy = 0; } }
      else if (D.why === 'fell') { this.vy -= ESC_GRAV * ESC_DT; this.y += this.vy * ESC_DT; this.s += this.speed * ESC_DT * 0.3; }
      else if (D.why === 'sank') { this.y -= 0.05; this.s += this.speed * ESC_DT * 0.1; this.speed *= 0.95; }
      if (D.t > 120) g.escapeDeath();
      this.pose(); return;
    }
    if (!g.timeStopped) g.time++;
    if (this.invuln > 0) this.invuln--;
    if (this.hitT > 0) this.hitT--;

    // ---- boost
    const wantBoost = inp.laser && this.gauge > 0;
    if (wantBoost && !this.boosting) {
      this.boosting = true; this.boostT = 0;
      Sound.boostBurst(); Sound.play('boom', { vol: 0.5, rate: 1.3 });
      this.speed = Math.max(this.speed, ESC_BOOST * 0.9); this.shake = Math.max(this.shake, 14);
      this.boostFlash = 0.55; this.fovKick = 14;
    }
    if (!wantBoost) this.boosting = false;
    Sound.boostHold(this.boosting ? 1 : 0);
    if (this.boosting) {
      this.boostT++; this.gauge = Math.max(0, this.gauge - (this.onWater ? 0.3 : 0.48));
      if (this.t % 2 === 0) {   // blue sparks streaming off him
        const p = this.course.at(this.s - 1.2, this.x + (Math.random() - 0.5) * 1.4, this.y + 0.4 + Math.random() * 1.4);
        this.sprite(this.blueMat, p, 1.2 + Math.random(), 18, 0, this.course.frame(this.s).f.clone().multiplyScalar(-0.15));
      }
    }

    // ---- spin dash: hold to rev, let go to roll (no gauge; can't skim water)
    if (inp.clones && this.ground && !this.boosting && !this.onWater) {
      if (this.rev === 0) { this.rolling = false; Sound.play('roll', { vol: 0.6 }); }
      this.rev = Math.min(45, this.rev + 1);
      this.speed *= 0.975;
      if (this.rev % 9 === 0) Sound.play('charge', { rate: 1 + this.rev / 50, vol: 0.6 });
    } else if (this.rev > 0) {
      if (this.ground && !this.boosting) {
        this.rolling = true; this.speed = Math.max(this.speed, ESC_ROLL + this.rev * 0.15);
        Sound.play('release'); this.shake = Math.max(this.shake, 5); this.fovKick = 6;
      }
      this.rev = 0;
    }
    if (this.rolling && (this.boosting || !this.ground || this.onWater || inp.down || this.speed < 24)) this.rolling = false;

    // ---- ground controls
    const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    this.vx += (steer * 16 - this.vx) * 0.16;
    this.slide = this.ground && inp.down && this.speed > 12 && !this.boosting && !this.onWater;
    if (this.slide && !this.wasSlide) Sound.play('roll', { vol: 0.6 });
    this.wasSlide = this.slide;
    let target = this.boosting ? ESC_BOOST : this.rev > 0 ? 20 : this.rolling ? ESC_ROLL : this.slide ? ESC_SLIDE : ESC_RUN;
    if (this.dashT > 0) { this.dashT--; target = Math.max(target, 70); }
    this.speed += (target - this.speed) * (this.speed < target ? 0.025 : 0.015);

    if (inp.punchPressed) {
      if (this.ground) { this.vy = ESC_JUMP; this.ground = false; this.jumped = true; this.airDash = false; this.rev = 0; Sound.play('jump'); }
      else if (!this.homing) {
        const tg = this.homingTarget();
        if (tg) { this.homing = { tg, t: 0 }; this.jumped = true; Sound.play('release', { rate: 1.4, vol: 0.7 }); }
        else if (!this.airDash) { this.airDash = true; this.jumped = false; this.dashAir = 24; this.speed += 14; this.vy = Math.max(this.vy, 2); Sound.boostBurst(); }
      }
    }
    if (this.dashAir > 0) this.dashAir--;

    // ---- integrate
    const prevS = this.s;
    if (this.homing) {
      const H = this.homing, tg = H.tg; H.t++;
      const ds = tg.s - this.s, dx = tg.x - this.x, dy = (tg.y || 0) + (tg.type === 'pawn' ? 1 : 0) - this.y;
      const d = Math.hypot(ds, dx, dy), sp = 80 * ESC_DT;
      if (d < 1.2 || H.t > 40 || tg.dead) {
        if (!tg.dead && d < 2) this.smash(tg, true);
        this.homing = null; this.vy = 11; this.airDash = false;
      } else { this.s += ds / d * sp; this.x += dx / d * sp; this.y += dy / d * sp; this.speed = Math.max(this.speed, 30); }
    } else {
      this.s += this.speed * ESC_DT;
      this.x += this.vx * ESC_DT;
      if (!this.ground) { this.vy -= ESC_GRAV * ESC_DT; this.y += this.vy * ESC_DT; }
    }
    const C = this.course;
    const lim = C.hw(this.s) - 0.7;
    if (Math.abs(this.x) > lim) { this.x = Math.sign(this.x) * lim; this.vx = 0; }
    const floor = C.floorAt(this.s, this.x);
    if (this.ground && !floor) { this.ground = false; this.vy = 0; }
    if (!this.ground && !this.homing && this.y <= 0) {
      if (floor && this.y > -0.6) { this.y = 0; this.vy = 0; this.ground = true; this.jumped = false; this.chain = 0; this.airDash = false; this.trick = 0; if (this.onWater) this.splash(6); }
      else if (this.y < -3) this.die('fell');
    }
    if (this.trick > 0) this.trick--;
    // water: you only stay up while you're fast
    // water: only boosting (or a dash panel's kick) keeps you on top. Anything else and you go under.
    if (this.onWater && this.ground) {
      if (!this.boosting && this.dashT <= 0) {
        this.sink = 40; this.splash(10);
        g.speech.say('sonic', this.gauge <= 0 ? 'Out of boost--!' : 'I stopped boosting--!', { dur: 90, prio: 5 });
        this.die('sank');
      } else this.sink = 0;
      if (this.t % 2 === 0) this.splash(this.boosting ? 2 : 1);
    } else this.sink = 0;

    // ---- the collapse / blast wave behind you
    const cv = 34 + Math.min(6, this.s / 300);
    this.collapse += cv * ESC_DT;
    if (this.s - this.collapse > 110) this.collapse = this.s - 110;
    if (this.collapse >= this.s - 1) this.die('crushed');
    if (this.t % 50 === 0) Sound.play('boom', { vol: 0.12 + Math.max(0, 0.3 - (this.s - this.collapse) / 300), rate: 0.45 + Math.random() * 0.2 });
    if (this.t % 23 === 0) {
      const s = this.s + 20 + Math.random() * 90, side = Math.random() < 0.5 ? -1 : 1, env = C.env(s);
      if (env === 'base') this.burst(C.at(s, side * 6.5, 2 + Math.random() * 5), 2, 1);
      else if (env !== 'water') this.burst(C.at(s, side * (30 + Math.random() * 60), 10 + Math.random() * 40), 2, 4);
    }
    this.shake = Math.max(this.shake, 1.2 + Math.max(0, 6 - (this.s - this.collapse) / 8));

    this.onRamp = false;
    this.collide(prevS);
    if (this.ground && !this.onRamp) this.y = this.onWater ? -Math.min(1, this.sink / 40) : 0;

    while (this.hintIdx < C.hints.length && C.hints[this.hintIdx].s <= this.s) {
      g.speech.say('sonic', C.hints[this.hintIdx].text, { dur: 200, prio: 3 }); this.hintIdx++;
    }
    if (this.s >= C.END - 11 && this.phase === 'run') this.startOutro();
    this.pose();
  }

  splash(n) {
    const f = this.course.frame(this.s);
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const p = this.course.at(this.s - 0.5, this.x + side * (0.3 + Math.random() * 0.6), 0.2);
      const v = f.r.clone().multiplyScalar(side * (0.05 + Math.random() * 0.1)).addScaledVector(f.n, 0.12 + Math.random() * 0.12).addScaledVector(f.f, -0.05);
      this.sprite(this.sprayMat, p, 1 + Math.random() * (this.boosting ? 2 : 1), 24, 0, v);
    }
  }

  homingTarget() {
    let best = null, bd = 1e9;
    for (let i = this.objIdx; i < this.course.objs.length; i++) {
      const o = this.course.objs[i];
      if (o.s > this.s + 32) break;
      if (o.dead || (o.type !== 'pawn' && o.type !== 'drone')) continue;
      const ds = o.s - this.s;
      if (ds < 1 || ds > 30) continue;
      const d = ds + Math.abs(o.x - this.x) * 2;
      if (Math.abs(o.x - this.x) < 9 && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ran into something solid: stop dead in front of it
  bonk(o, d) {
    Sound.play('bosshit', { vol: 0.7 }); Sound.punch(1);
    this.shake = Math.max(this.shake, 14); this.boosting = false;
    this.hurt('hit');
    if (!this.dead) { this.s = o.s - d - 0.4; this.speed = 4; this.vx = 0; }
  }

  // broken pieces flying off something you smashed
  shatter(pos, mat, n, size) {
    const f = this.course.frame(this.s);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.chunkGeo, mat);
      m.scale.setScalar(size * (0.5 + Math.random()));
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * size, (Math.random() - 0.5) * size, (Math.random() - 0.5) * size));
      this.scene.add(m);
      const v = f.f.clone().multiplyScalar(0.25 + Math.random() * 0.45).addScaledVector(f.r, (Math.random() - 0.5) * 0.7).addScaledVector(f.n, 0.2 + Math.random() * 0.4);
      this.chunks.push({ m, v, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5), t: 0, g: f.n.clone().multiplyScalar(-0.02) });
    }
  }

  smash(o, homing) {
    const g = this.g, C = this.course;
    o.dead = true; if (o.mesh) o.mesh.visible = false;
    const pos = C.at(o.s, o.x, (o.y || 0) + 1);
    const crate = o.type === 'crate';
    this.burst(pos, crate ? 1 : 2, crate ? 0.7 : 0.9);
    this.shatter(pos, crate ? this.crateMat : o.type === 'pawn' ? this.pawnChunkMat : this.droneChunkMat, crate ? 10 : 8, crate ? 0.7 : 0.5);
    Sound.play(crate ? 'boom' : 'pop', { vol: 0.7 });
    if (this.boosting) Sound.punch(1.2);
    this.chain++;
    g.addScore(crate ? 50 : CHAIN[Math.min(CHAIN.length - 1, this.chain - 1)]);
    this.gauge = Math.min(100, this.gauge + (crate ? 3 : 8));
    if (homing || this.jumped) { this.vy = 11; this.ground = false; }
    this.shake = Math.max(this.shake, 6);
  }

  collide(prevS) {
    const C = this.course, g = this.g, objs = C.objs;
    while (this.objIdx < objs.length && objs[this.objIdx].s < this.s - 20) this.objIdx++;
    const top = this.y + this.height;
    for (let i = this.objIdx; i < objs.length; i++) {
      const o = objs[i];
      if (o.s > this.s + 60) break;
      if (o.dead) continue;
      const ds = o.s - this.s, dx = Math.abs(o.x - this.x);
      const crossed = prevS - 0.8 <= o.s && o.s <= this.s + 0.8;
      switch (o.type) {
        case 'ring': {
          const magnet = this.boosting ? 4 : 1.4;
          if (Math.abs(ds) < magnet && dx < magnet && Math.abs(o.y - (this.y + 1)) < magnet + 0.3) {
            o.dead = true; o.mesh.visible = false; g.rings++; Sound.ring(); g.addScore(10);
            this.gauge = Math.min(100, this.gauge + 2.5);
            if (g.rings % 100 === 0) g.extraLife();
          }
          break;
        }
        case 'crate':
          if (crossed && dx < 1.6 && this.y < 2) {
            if (this.boosting || this.homing || this.rolling) { this.smash(o); this.speed *= 0.85; }
            else { this.bonk(o, 1.6); }
          }
          break;
        case 'car': case 'rock':   // solid: boost or not, you go round (or over) them
          if (crossed && dx < (o.type === 'car' ? 1.9 : 1.9) && this.y < (o.type === 'car' ? 2.6 : 2.2)) this.bonk(o, 2.4);
          break;
        case 'pawn': case 'drone': {
          const oy = o.y || 0, oh = o.type === 'pawn' ? 2.6 : 1.4;
          if (Math.abs(ds) < 1.4 && dx < 1.5 && this.y < oy + oh && top > oy - (o.type === 'drone' ? 0.7 : 0)) {
            if (this.boosting || this.jumped || this.homing || this.rolling || this.dashAir > 0 || this.trick > 0) this.smash(o);
            else this.hurt('hit');
          }
          break;
        }
        case 'laserLow': if (crossed && this.y < 0.7) this.hurt('hit'); break;
        case 'laserHigh': if (crossed && top > 1.15 && this.y < 4.8) this.hurt('hit'); break;
        case 'dash':
          if (crossed && this.ground && dx < 2) {
            this.dashT = 50; this.speed = Math.max(this.speed, 70); this.fovKick = 10;
            Sound.play('spring', { vol: 0.6, rate: 1.3 }); Sound.boostBurst(); this.gauge = Math.min(100, this.gauge + 5);
          }
          break;
        case 'ramp':
          if (this.ground && dx < o.w / 2 + 0.5 && this.s >= o.s && this.s < o.s + o.len) { this.onRamp = true; this.y = o.h * (this.s - o.s) / o.len; }
          if (this.ground && dx < o.w / 2 + 0.5 && prevS < o.s + o.len - 1 && this.s >= o.s + o.len - 1) {
            this.vy = o.big ? 18 : 15; this.y = o.h; this.ground = false; this.jumped = false; this.trick = 60;
            Sound.play('spring');
          }
          break;
        case 'debris':
          // timed to land where you'll be at your current speed
          if (o.fall < 0 && o.s - this.s <= Math.max(12, this.speed * 52 / 60)) { o.fall = 0; o.warn.visible = true; o.mesh.visible = true; }
          if (o.fall >= 0 && o.fall < 52) {
            o.fall++;
            const k = o.fall / 52;
            o.mesh.position.copy(C.at(o.s, o.x, 20 * (1 - k * k) + 1.1));
            o.mesh.rotation.x += 0.08; o.mesh.rotation.z += 0.05;
            o.warn.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(o.fall * 0.4));
            if (o.fall === 52) {
              o.warn.visible = false; o.dead = true; o.mesh.visible = false;
              this.burst(C.at(o.s, o.x, 0.8), 3, 1.3); Sound.play(o.glass ? 'pop' : 'boom', { vol: 0.6 });
              this.shake = Math.max(this.shake, 8);
              if (Math.abs(o.s - this.s) < 2.4 && dx < 2.2 && this.y < 2.5) this.hurt('hit');
            }
          }
          break;
      }
    }
  }

  startOutro() {
    this.phase = 'outro'; this.t = 0; this.boosting = false; Sound.boostHold(0);
    Sound.play('spring');
    // put the Egg Base on the horizon behind you, where the outro camera looks
    const C = this.course, e = C.frame(C.END).p, b = C.frame(C.BASE_END * 0.45).p;
    const dir = new THREE.Vector3(b.x - e.x, 0, b.z - e.z);
    if (dir.lengthSq() < 1) dir.set(0, 0, -1);
    dir.normalize();
    this.dome.position.set(e.x + dir.x * 750, e.y - 60, e.z + dir.z * 750);
    this.scene.fog.far = 3500;
  }

  updateOutro() {
    const C = this.course, t = this.t, g = this.g;
    if (t < 400) {
      if (!this.ground) { this.vy -= ESC_GRAV * ESC_DT; this.y += this.vy * ESC_DT; }
      if (this.ground && this.s < C.END + 52) this.speed += (40 - this.speed) * 0.05;
      else if (this.s >= C.END + 52) this.speed *= 0.93;
      this.s += this.speed * ESC_DT;
      this.x *= 0.95;
      if (!this.ground && this.y <= 0 && this.vy < 0) { this.y = 0; this.vy = 0; this.ground = true; this.jumped = false; Sound.play('skid', { vol: 0.6 }); }
    }
    if (t === 1) g.speech.clear();
    if (t >= 70 && t < 210 && t % 6 === 0) {
      const d = this.dome.position;
      this.burst(new THREE.Vector3(d.x + (Math.random() - 0.5) * 300, d.y + 60 + Math.random() * 140, d.z + (Math.random() - 0.5) * 300), 1, 16 + Math.random() * 12);
      if (t % 18 === 0) Sound.play('boom', { vol: 0.8, rate: 0.4 + Math.random() * 0.3 });
      this.shake = Math.max(this.shake, 8);
    }
    if (t === 160) {
      this.flash = 1.2; Sound.play('boom', { rate: 0.3 }); this.shake = 25;
      this.burst(this.dome.position.clone().add(new THREE.Vector3(0, 90, 0)), 6, 50);
      this.wrecked = true; this.dome.scale.set(1, 0.42, 1); this.dome.material.color.setHex(0x2a2224);
    }
    if (this.wrecked && t % 4 === 0 && t < 470) {   // fires and smoke columns over the wreck
      const d = this.dome.position, a = Math.random() * Math.PI * 2, r = Math.random() * 160;
      const p = new THREE.Vector3(d.x + Math.cos(a) * r, d.y + 60 + Math.random() * 20, d.z + Math.sin(a) * r);
      const sm = new THREE.Sprite(this.smokeMat.clone()); sm.position.copy(p); this.scene.add(sm);
      this.fx.push({ m: sm, t: 0, dur: 160, size: 46, vy: 0.1, smoke: true });
      this.sprite(this.glowMat, p, 24, 50);
    }
    if (t === 220) g.speech.say('sonic', 'Run all you want, Eggman.', { dur: 140, prio: 5 });
    if (t === 340) g.speech.say('sonic', "...I'll be right behind you.", { dur: 120, prio: 5 });
    // on to the Sky Chase: Tails swoops in with the Tornado
    if (t === 470) { this.phase = 'tbc'; this.t = 0; this.handoff = true; g.later(1, () => g.startTornado('pickup')); }
  }

  updateFX() {
    for (const f of this.fx) {
      f.t++;
      const k = f.t / f.dur;
      f.m.scale.setScalar(f.size * (f.smoke ? 0.6 + k : 0.5 + k * 0.8));
      if (f.v) f.m.position.add(f.v); else f.m.position.y += f.vy * (f.smoke ? 6 : 1);
      if (f.smoke) f.m.material.opacity = Math.min(1, 3 * (1 - k));
      if (f.t >= f.dur) { this.scene.remove(f.m); if (f.smoke) f.m.material.dispose(); f.dead = true; }
    }
    this.fx = this.fx.filter((f) => !f.dead);
    for (const r of this.lostRings) {
      r.t++; r.v.y -= 0.02; r.m.position.add(r.v); r.m.rotation.y += 0.3;
      if (r.t > 60) { this.scene.remove(r.m); r.dead = true; }
    }
    this.lostRings = this.lostRings.filter((r) => !r.dead);
    for (const c of this.chunks) {
      c.t++; c.v.add(c.g); c.m.position.add(c.v);
      c.m.rotation.x += c.spin.x; c.m.rotation.y += c.spin.y; c.m.rotation.z += c.spin.z;
      if (c.t > 45) c.m.scale.multiplyScalar(0.9);
      if (c.t > 70) { this.scene.remove(c.m); c.dead = true; }
    }
    this.chunks = this.chunks.filter((c) => !c.dead);
  }

  // ------------------------------------------------------------ posing / camera
  play(name, fade = 0.15, scale = 1) {
    const M = this.sonic;
    if (!M.mixer) return;
    const a = M.actions[name];
    if (!a) return;
    a.timeScale = scale;
    if (M.cur === name) return;
    const prev = M.cur && M.actions[M.cur];
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (prev) prev.crossFadeTo(a, fade, false);
    M.cur = name;
  }

  pose() {
    const C = this.course, M = this.sonic, t = this.t;
    C.basis(this.s, this.m4);
    M.root.position.copy(C.at(this.s, this.x, this.y));
    M.root.quaternion.setFromRotationMatrix(this.m4);
    this.lean += ((this.vx / 16) * 0.35 - this.lean) * 0.2;
    M.root.rotateY(-this.lean * 0.6);
    M.root.rotateZ(-this.lean * 0.5);
    if ((this.phase === 'outro' && this.t > 150) || this.phase === 'tbc') {   // turn around to watch it burn
      const k = this.phase === 'tbc' ? 1 : Math.min(1, (this.t - 150) / 30);
      M.root.rotateY(Math.PI * k);
    }
    const inBall = !!(((this.jumped || this.homing) && !this.ground && !this.dead) || this.rolling || this.rev > 0);
    M.body.visible = !inBall; M.ball.visible = inBall;
    if (inBall) M.ball.rotation.x += this.rev > 0 ? 0.6 + this.rev * 0.02 : 0.5;
    M.ball.position.y = this.rev > 0 || this.rolling ? 0.62 : 0.75;
    M.body.rotation.set(0, 0, 0); M.body.position.set(0, 0, 0);
    const sp = this.speed;
    if (this.phase === 'intro' || this.phase === 'tbc' || (this.phase === 'outro' && this.speed < 3 && this.ground)) this.play('idle', 0.3);
    else if (this.dead) this.play(this.dead.why === 'hit' ? 'hit' : 'fall', 0.1);
    else if (this.hitT > 0) this.play('hit', 0.08);
    else if (this.slide) { this.play('kick', 0.1, 0); M.body.rotation.x = -1.0; M.body.position.y = 0.25; }
    else if (this.dashAir > 0) this.play('homing', 0.08);
    else if (this.trick > 0) this.play('spring', 0.1);
    else if (!this.ground) this.play('fall', 0.2);
    else if (this.boosting || sp > 58) this.play('sprint', 0.12, 0.8 + sp / 120);
    else this.play('run', 0.15, 0.6 + sp / 50);
    if (M.mixer) M.mixer.update(ESC_DT);
    const armPose = this.phase === 'intro' || this.phase === 'tbc' || (this.phase === 'outro' && this.speed < 3 && this.ground) ? 'relax'
      : this.dead || this.hitT > 0 ? 'hurt' : this.slide ? 'run' : !this.ground ? 'air' : this.boosting || sp > 58 ? 'sprint' : 'run';
    if (armPose && !inBall) escLimbPose(M, armPose, { t: t * (0.6 + sp / 50) });
    // boost FX
    const B = this.boosting, fl = 0.85 + Math.random() * 0.3;
    M.aura.material.opacity += ((B ? 0.3 * fl : 0) - M.aura.material.opacity) * 0.35;
    M.core.material.opacity += ((B ? 0.2 * fl : 0) - M.core.material.opacity) * 0.35;
    M.aura.visible = M.core.visible = M.aura.material.opacity > 0.01;
    M.trailMat.opacity += ((B ? 0.6 : 0) - M.trailMat.opacity) * 0.25;
    M.trail.visible = M.trailMat.opacity > 0.01;
    const tl = 3 + sp * 0.05; M.trail.scale.set(0.8 * fl, tl, 0.8 * fl); M.trail.position.z = -(0.6 + tl / 2);
    const bk = B ? Math.max(0, 1 - this.boostT / 22) : 0;
    M.boom.material.opacity = bk * 0.7; M.boom.visible = bk > 0; M.boom.scale.setScalar(1 + (1 - bk) * 2.2);
    M.wave.material.opacity = bk * 0.9; M.wave.visible = bk > 0; M.wave.scale.setScalar(1 + (1 - bk) * 7);
    M.root.visible = !(this.invuln > 0 && t % 6 < 3);
    this.shadow.visible = C.floorAt(this.s, this.x) && !this.onWater && !this.dead;
    this.shadow.position.copy(C.at(this.s, this.x, 0.04));
    this.shadow.quaternion.setFromRotationMatrix(this.m4); this.shadow.rotateX(-Math.PI / 2);
    this.shadow.scale.setScalar(Math.max(0.3, 1 - this.y * 0.12));
  }

  updateCamera() {
    const C = this.course, cam = this.camera, t = this.t;
    let pos, look, fov = 66, up;
    const sx = this.x * 0.7;
    if (this.phase === 'intro') {
      const k = Math.min(1, t / 95), e = k * k * (3 - 2 * k);
      const ang = Math.PI * (1 - e), back = 7 + 3 * (1 - e);
      pos = C.at(this.s - Math.cos(ang) * back, Math.sin(ang) * 4, 2.6 + (1 - e) * 0.6);
      look = C.at(this.s + e * 9, 0, 1.4);
      up = C.frame(this.s).n;
    } else if (this.phase === 'outro' || (this.phase === 'tbc' && !this.failed)) {
      const fixed = C.at(C.END + 78, -4.5, 2.4);
      const k = this.phase === 'tbc' ? 1 : Math.min(1, Math.max(0, (t - 45) / 60));
      const behind = C.at(this.s - 7, sx, this.y * 0.6 + 3.4);
      pos = behind.lerp(fixed, k * k * (3 - 2 * k));
      // look back toward the base as it blows
      const d = this.dome.position, dir = new THREE.Vector3(d.x, d.y + 90, d.z).sub(fixed).normalize();
      const lookB = fixed.clone().addScaledVector(dir, 60), lookA = C.at(this.s + 10, 0, 1.4);
      look = lookA.lerp(lookB, this.phase === 'tbc' ? 1 : Math.min(1, Math.max(0, (t - 20) / 100)));
      up = new THREE.Vector3(0, 1, 0);
    } else {
      const fell = this.dead && this.dead.why === 'fell';
      const camS = this.dead ? (this.camS || this.s - 5.4) : this.s - 5.6 - (this.boosting ? 0.9 : 0);
      if (!this.dead) this.camS = camS;
      const camY = this.dead ? (this.camY || 2.9) : Math.max(1.4, this.y * 0.55) + 2.5 + (this.slide ? 1 : 0);
      if (!this.dead) this.camY = camY;
      pos = C.at(camS, fell ? 0 : sx, camY);
      look = C.at(this.dead ? this.s : this.s + 9, this.x * 0.8, fell ? this.y : 1.5 + this.y * 0.5);
      fov = (this.boosting ? 80 : 66 + (this.speed - ESC_RUN) * 0.25) + this.fovKick;
      up = C.frame(Math.max(0, camS)).n;
    }
    if (!this.camPos) { this.camPos = pos.clone(); this.camLook = look.clone(); this.camUp = up.clone(); }
    // the chase camera follows tightly (no lag at boost speed); cutscene cameras ease
    const kp = this.phase === 'run' ? (this.dead ? 0.2 : 0.75) : 0.2;
    this.camPos.lerp(pos, kp); this.camLook.lerp(look, kp); this.camUp.lerp(up, 0.3).normalize();
    cam.position.copy(this.camPos);
    const sh = this.shake * 0.02;
    cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh;
    cam.up.copy(this.camUp);
    cam.lookAt(this.camLook);
    cam.fov += (fov - cam.fov) * 0.15; cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ draw
  draw(ctx) {
    if (this.failed) { ctx.fillStyle = '#2a0806'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); return; }
    const t = this.g.t, C = this.course;
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.15);
    this.stripMat.color.setRGB(0.6 + 0.4 * pulse, 0.08, 0.05);
    this.lampMat.color.setRGB(1, 0.15 + 0.25 * pulse, 0.05);
    this.beamGlow.opacity = 0.25 + 0.2 * Math.sin(t * 0.6);
    this.alarmLight.position.copy(C.at(this.s + 6, 0, 6));
    // inside the base vs out in the open
    const inside = this.s < C.BASE_END - 2 && this.phase !== 'outro' && this.phase !== 'tbc';
    if (inside !== this.wasInside) {
      const first = this.wasInside === undefined;
      this.wasInside = inside;
      const S = this.scene;
      if (inside) { S.background = this.fogIn.clone(); S.fog.color.copy(this.fogIn); S.fog.near = 30; S.fog.far = 190; this.hemi.intensity = 0.95; }
      else {
        S.background = this.tex.sky; S.fog.color.copy(this.fogOut); S.fog.near = 200; S.fog.far = 2400; this.hemi.intensity = 1.15;
        if (!first) { this.flash = Math.max(this.flash, 0.9); Sound.play('boom', { rate: 0.7 }); }
      }
      for (const o of this.outdoor) o.visible = !inside;
      for (const o of this.tunnel) o.visible = inside;
      this.door.visible = inside;
    }
    this.alarmLight.intensity = inside ? 0.6 + 1.2 * pulse : 0;
    if (this.doors) {   // blast doors slide open as you come
      const k = Math.max(0, Math.min(1, (this.s - (C.BASE_END - 90)) / 40));
      this.doors.forEach((d, i) => { d.position.x = (i ? 1 : -1) * (4.5 + 9.2 * k); });
      if (k > 0 && !this.doorSound) { this.doorSound = true; Sound.play('charge', { rate: 0.5, vol: 0.6 }); }
    }
    this.tex.water.offset.set(t * 0.0006, t * 0.0011);
    for (let i = Math.max(0, this.objIdx - 5); i < C.objs.length; i++) {
      const o = C.objs[i];
      if (!o.mesh || o.dead) continue;
      if (o.s > this.s + 300) { if (o.mesh.visible && o.type !== 'debris') o.mesh.visible = false; continue; }
      const near = o.s > this.s - 10;
      o.mesh.visible = near && !(o.type === 'debris' && o.fall < 0);
      if (!near) continue;
      if (o.type === 'ring') o.mesh.rotation.y = t * 0.08;
      else if (o.type === 'drone') { o.mesh.userData.ring.rotation.z = t * 0.2; o.mesh.position.copy(C.at(o.s, o.x, o.y + Math.sin(t * 0.08 + o.s) * 0.3)); }
      else if (o.type === 'dash') o.tex.offset.y = -t * 0.05;
    }
    const tg = !this.ground && !this.homing && !this.dead && this.phase === 'run' ? this.homingTarget() : null;
    this.reticle.visible = !!tg;
    if (tg) { this.reticle.position.copy(C.at(tg.s, tg.x, (tg.y || 0) + (tg.type === 'pawn' ? 1.4 : 0))); this.reticle.quaternion.copy(this.camera.quaternion); this.reticle.rotateZ(t * 0.1); }
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, VIEW_W, VIEW_H);
    this.draw2D(ctx, t);
  }

  screenAt(s, x, y) {
    const v = this.course.at(s, x, y).project(this.camera);
    return { x: (v.x + 1) / 2 * VIEW_W, y: (1 - v.y) / 2 * VIEW_H };
  }
  speakerPos() { return this.failed ? { x: VIEW_W / 2, y: VIEW_H / 2 } : this.screenAt(this.s, this.x, this.y + 2.3); }

  draw2D(ctx, t) {
    if (this.boosting || this.dashT > 0) {
      // speed lines and a blue rim, like the screen is being pulled forward
      const cx = VIEW_W / 2, cy = VIEW_H * 0.48;
      ctx.save();
      const gr = ctx.createRadialGradient(cx, cy, VIEW_H * 0.3, cx, cy, VIEW_W * 0.68);
      gr.addColorStop(0, 'rgba(40,120,255,0)'); gr.addColorStop(1, `rgba(60,150,255,${this.boosting ? 0.38 : 0.2})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < (this.boosting ? 46 : 24); i++) {
        const a = (i * 2.399 + t * 0.37) % (Math.PI * 2), r0 = 200 + ((t * 53 + i * 97) % 460), len = 140 + (i % 5) * 60;
        ctx.strokeStyle = i % 3 ? 'rgba(200,235,255,.5)' : 'rgba(120,190,255,.6)'; ctx.lineWidth = 1 + (i % 4);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.62); ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.62); ctx.stroke();
      }
      ctx.restore();
    }
    if (this.boostFlash > 0) { ctx.fillStyle = `rgba(200,235,255,${Math.min(0.7, this.boostFlash)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    const gap = this.s - this.collapse;
    if (this.phase === 'run' && gap < 40) {
      const k = 1 - gap / 40, beat = 0.5 + 0.5 * Math.sin(t * 0.4);
      const gr = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
      gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(160,10,0,${0.25 + 0.45 * k * beat})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.sink > 0 && !this.dead) { ctx.fillStyle = `rgba(20,90,160,${Math.min(0.35, this.sink / 100)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.dead && this.dead.why === 'crushed') { ctx.fillStyle = `rgba(20,0,0,${Math.min(1, this.dead.t / 30)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.dead && this.dead.t > 70) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (this.dead.t - 70) / 40)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,250,235,${Math.min(1, this.flash)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.phase === 'intro') {
      const k = Math.min(1, this.t / 20);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * k})`; ctx.fillRect(0, 160, VIEW_W, 120);
      this.g.text(ctx, 'EGG BASE ESCAPE', VIEW_W / 2, 210, 44, '#ffd23f', 'center', '#5a0b14');
      this.g.text(ctx, 'GET OUT BEFORE IT COLLAPSES ON YOU', VIEW_W / 2, 254, 16, '#fff', 'center', '#000');
      if (this.t > 80) this.g.text(ctx, 'GO!', VIEW_W / 2, 340, 56, '#fff', 'center', '#1d3fd1');
    }
    if (this.phase === 'tbc' && !this.handoff) this.drawTBC(ctx, t);
  }

  drawHUD(ctx) {
    if (this.phase === 'tbc' || this.failed) return;
    const g = this.g;
    g.drawHUD(ctx);
    if (this.phase === 'outro') return;
    const w = 360, x = VIEW_W - w - 40, y = VIEW_H - 64;
    ctx.save();
    ctx.translate(x, y); ctx.transform(1, 0, -0.35, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,20,.6)'; ctx.fillRect(-6, -6, w + 12, 34);
    const gr = ctx.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#1d4fe0'); gr.addColorStop(1, '#7fe3ff');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w * this.gauge / 100, 22);
    if (this.boosting) { ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(g.t * 0.6)})`; ctx.fillRect(0, 0, w * this.gauge / 100, 22); }
    ctx.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 1; i < 10; i++) ctx.fillRect(i * w / 10 - 1, 0, 2, 22);
    ctx.restore();
    g.text(ctx, 'BOOST', x - 6, y - 14, 16, '#7fe3ff');
    g.text(ctx, `SPIN DASH [${keyLabel('clones')}]`, x + 170, y - 14, 12, this.rolling || this.rev > 0 ? '#ffd23f' : '#c9d4ff');
    if (this.rev > 0) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + 170, y - 8, 150 * this.rev / 45, 5); }
    g.text(ctx, '[' + keyLabel('laser') + ']', x + 110, y - 14, 12, '#fff');
    const mw = 420, mx = VIEW_W / 2 - mw / 2, my = 36;
    const gap = Math.max(0, Math.min(110, this.s - this.collapse));
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(mx - 6, my - 6, mw + 12, 26);
    const cg = ctx.createLinearGradient(mx, 0, mx + mw, 0); cg.addColorStop(0, '#ff3010'); cg.addColorStop(0.35, '#ff9a1a'); cg.addColorStop(1, '#3a2a20');
    ctx.fillStyle = cg; ctx.fillRect(mx, my, mw, 14);
    const sxp = mx + mw * gap / 110;
    ctx.fillStyle = '#1d4fe0'; ctx.beginPath(); ctx.arc(sxp, my + 7, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    const label = this.s < this.course.BASE_END ? 'COLLAPSE' : 'BLAST WAVE';
    g.text(ctx, gap < 40 && Math.floor(g.t / 10) % 2 ? "IT'S RIGHT BEHIND YOU!" : label, VIEW_W / 2, my + 44, 12, gap < 40 ? '#ff5a3a' : '#ffd0a0', 'center');
    g.text(ctx, `${Math.round(Math.min(1, this.s / this.course.END) * 100)}%`, VIEW_W - 40, 52, 16, '#fff', 'right');
    g.text(ctx, `${Math.round(this.speed * 8)} KM/H`, VIEW_W - 40, 80, 14, this.boosting ? '#7fe3ff' : '#c9d4ff', 'right');
  }

  drawTBC(ctx, t) {
    const k = Math.min(1, this.t / 30);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(200,150,90,${0.8 * k})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(40,20,0,${0.35 * k})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const x = VIEW_W - 60 - 620 * Math.min(1, this.t / 20), y = VIEW_H - 120;
    ctx.translate(x, y);
    ctx.fillStyle = '#1b1006'; ctx.strokeStyle = '#e9d7a8'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(520, -38); ctx.lineTo(520, -60); ctx.lineTo(590, 0); ctx.lineTo(520, 60); ctx.lineTo(520, 38); ctx.lineTo(0, 38); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.font = `28px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e9d7a8'; ctx.fillText('TO BE CONTINUED', 26, 2);
    ctx.restore();
    if (this.t > 120 && Math.floor(t / 30) % 2) this.g.text(ctx, 'PRESS START', VIEW_W / 2, 60, 16, '#e9d7a8', 'center', '#1b1006');
  }

  dispose() {
    Sound.boostHold(0);
    if (!this.scene) return;
    this.scene.traverse((o) => { if (o.geometry && o.geometry !== this.ringGeo) o.geometry.dispose(); });
    if (this.ringGeo) this.ringGeo.dispose();
  }
}
