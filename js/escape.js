// Egg Base Escape: a behind-the-back 3D boost stage (Sonic Generations style)
// rendered with three.js. Sonic is a low-poly model built from primitives.
// Everything lives in "track space": s = distance along the course,
// x = sideways offset, y = height above the floor.
'use strict';

const ESC_W = 14;            // track width
const ESC_HALF = ESC_W / 2;
const ESC_WALL_H = 8;
const ESC_DT = 1 / 60;
const ESC_RUN = 38, ESC_BOOST = 64, ESC_SLIDE = 34;
const ESC_GRAV = 34, ESC_JUMP = 12.5;

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
  T.floor = escCanvasTex(128, 128, (g, w, h) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#3a3f4c' : '#262a33'; g.fillRect(i * 64, j * 64, 64, 64);
    }
    g.strokeStyle = '#ff8a1c'; g.lineWidth = 2; g.globalAlpha = 0.55;
    g.strokeRect(1, 1, 126, 126);
    g.globalAlpha = 1; g.fillStyle = '#596173';
    for (const [x, y] of [[6, 6], [58, 6], [6, 58], [58, 58], [70, 70], [122, 70], [70, 122], [122, 122]]) g.fillRect(x, y, 3, 3);
  });
  T.wall = escCanvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#30343e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3c414d'; g.fillRect(8, 8, 116, 150); g.fillRect(132, 8, 116, 150);
    g.fillStyle = '#23262e'; g.fillRect(0, 170, w, 30);
    g.fillStyle = '#8a1218'; g.fillRect(0, 176, w, 6);
    g.fillStyle = '#4a505e'; for (let x = 0; x < w; x += 32) g.fillRect(x + 4, 214, 24, 36);
    g.fillStyle = '#1b1d23'; for (let x = 0; x < w; x += 32) g.fillRect(x + 8, 220, 16, 4);
  });
  T.hazard = escCanvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16161a';
    for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  });
  T.crate = escCanvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5b606c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    g.fillStyle = '#16161a';
    for (let i = -2; i < 12; i++) { g.save(); g.translate(i * 14, 0); g.fillRect(0, 0, 6, 14); g.fillRect(0, h - 14, 6, 14); g.restore(); }
    g.fillStyle = '#c91a24'; g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe9c9'; g.beginPath(); g.ellipse(64, 70, 22, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a3a12'; g.beginPath(); g.ellipse(64, 74, 26, 6, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#2a2e36'; g.fillRect(48, 50, 12, 8); g.fillRect(68, 50, 12, 8);
  });
  T.dash = escCanvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#1a1c22'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd23f';
    for (let y = 0; y < h; y += 42) { g.beginPath(); g.moveTo(8, y + 34); g.lineTo(32, y + 8); g.lineTo(56, y + 34); g.lineTo(46, y + 34); g.lineTo(32, y + 20); g.lineTo(18, y + 34); g.fill(); }
  });
  T.glow = escCanvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.25, 'rgba(255,220,120,.95)');
    r.addColorStop(0.55, 'rgba(255,110,30,.6)'); r.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, false);
  T.smoke = escCanvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(40,36,40,.9)'); r.addColorStop(1, 'rgba(20,16,20,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, false);
  T.sky = escCanvasTex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a1a4a'); gr.addColorStop(0.45, '#c2507a'); gr.addColorStop(0.75, '#f2a35a'); gr.addColorStop(1, '#ffd890');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  T.ground = escCanvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a6a3c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? '#86592f' : '#ad7a47'; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 2 + Math.random() * 4); }
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

// -------------------------------------------------------------- Sonic model
function escSonicModel() {
  const mat = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
  const blue = mat(0x1d4fe0, 0x061030), skin = mat(0xf0ac78, 0x200c00), white = mat(0xffffff, 0x202020);
  const red = mat(0xe3152a, 0x200000), black = mat(0x111111), gold = mat(0xffc23a, 0x332200), green = mat(0x22c060);
  const S = (r, m, seg = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), m);
  const cone = (r, len, m, base, dir) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, len, 9), m);
    const d = new THREE.Vector3(...dir).normalize();
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    c.position.set(base[0] + d.x * len / 2, base[1] + d.y * len / 2, base[2] + d.z * len / 2);
    return c;
  };
  const root = new THREE.Group();            // feet at y = 0, faces +z
  const body = new THREE.Group(); body.position.y = 0.78; root.add(body);   // hip pivot

  const torso = S(0.34, blue); torso.scale.set(1, 1.15, 0.9); torso.position.y = 0.3; body.add(torso);
  const belly = S(0.26, skin); belly.scale.set(1, 1.2, 0.6); belly.position.set(0, 0.26, 0.16); body.add(belly);
  for (const sx of [-1, 1]) body.add(cone(0.11, 0.38, blue, [sx * 0.08, 0.36, -0.24], [sx * 0.2, -0.45, -1]));

  const head = new THREE.Group(); head.position.y = 0.98; body.add(head);
  head.add(S(0.5, blue, 18));
  const muzzle = S(0.25, skin); muzzle.scale.set(1.25, 0.8, 0.8); muzzle.position.set(0, -0.14, 0.36); head.add(muzzle);
  const nose = S(0.07, black, 8); nose.position.set(0, -0.04, 0.58); head.add(nose);
  const eyes = S(0.2, white); eyes.scale.set(1.7, 1.15, 0.6); eyes.position.set(0, 0.12, 0.38); head.add(eyes);
  for (const sx of [-1, 1]) { const p = S(0.06, green, 8); p.position.set(sx * 0.11, 0.12, 0.5); head.add(p); }
  for (const sx of [-1, 1]) {
    head.add(cone(0.13, 0.32, blue, [sx * 0.26, 0.36, -0.02], [sx * 0.6, 1, -0.15]));
    head.add(cone(0.07, 0.2, skin, [sx * 0.26, 0.38, 0.02], [sx * 0.6, 1, -0.15]));
  }
  // the quills: what you mostly see from behind
  const quills = [
    [[0, 0.32, -0.2], [0, 0.2, -1], 0.26, 1.15],
    [[0.24, 0.14, -0.26], [0.5, -0.05, -1], 0.22, 1.0], [[-0.24, 0.14, -0.26], [-0.5, -0.05, -1], 0.22, 1.0],
    [[0, -0.02, -0.32], [0, -0.45, -1], 0.24, 1.05],
    [[0.22, -0.16, -0.26], [0.45, -0.75, -1], 0.17, 0.8], [[-0.22, -0.16, -0.26], [-0.45, -0.75, -1], 0.17, 0.8],
  ];
  for (const [b, d, r, l] of quills) head.add(cone(r, l, blue, b, d));

  const limb = (r, len, m) => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m); c.position.y = -len / 2; g.add(c); return g; };
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = limb(0.065, 0.5, skin); a.position.set(sx * 0.36, 0.48, 0);
    const glove = S(0.14, white, 10); glove.position.y = -0.55; a.add(glove);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 6, 12), white); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.44; a.add(cuff);
    a.rotation.z = sx * 0.25;
    body.add(a); arms.push(a);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = limb(0.075, 0.58, blue); l.position.set(sx * 0.15, 0.02, 0);
    const shoe = new THREE.Group(); shoe.position.y = -0.66; l.add(shoe);
    const main = S(0.2, red, 12); main.scale.set(0.85, 0.65, 1.6); main.position.z = 0.12; shoe.add(main);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.12), white); strap.position.set(0, 0.06, 0.06); shoe.add(strap);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), gold); buckle.position.set(sx * 0.17, 0.06, 0.06); shoe.add(buckle);
    const sole = S(0.19, white, 10); sole.scale.set(0.85, 0.25, 1.6); sole.position.set(0, -0.1, 0.12); shoe.add(sole);
    body.add(l); legs.push(l);
  }

  // spin-ball form for jumps
  const ball = new THREE.Group(); ball.position.y = 0.7; root.add(ball);
  ball.add(S(0.6, blue, 16));
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    ball.add(cone(0.2, 0.55, blue, [0, Math.cos(a) * 0.45, Math.sin(a) * 0.45], [0, Math.cos(a), Math.sin(a)]));
  }
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  ball.add(shell);
  ball.visible = false;

  // boost aura and sonic-boom cone
  const auraMat = new THREE.MeshBasicMaterial({ color: 0x59b8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), auraMat);
  aura.scale.set(1.25, 1.3, 2.2); aura.position.set(0, 0.95, 0.2); root.add(aura);
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const boom = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 20, 1, true), boomMat);
  boom.rotation.x = -Math.PI / 2; boom.position.set(0, 0.95, 1.5); root.add(boom);

  return { root, body, head, arms, legs, ball, aura, auraMat, boom, boomMat };
}

// --------------------------------------------------------------- the course
class EscapeCourse {
  constructor() {
    this.segs = []; this.objs = []; this.holes = []; this.hints = [];
    this.layout();
    this.sample();
    this.objs.sort((a, b) => a.s - b.s);
  }

  seg(len, turn, pitch) { this.segs.push({ len, turn, pitch }); }
  add(type, s, x = 0, o = {}) { const ob = { type, s, x, y: 0, ...o }; this.objs.push(ob); return ob; }
  rings(s, n, x, gap = 4, y = 1) { for (let i = 0; i < n; i++) this.add('ring', s + i * gap, x, { y }); }
  arc(s, n, x, gap, h) { for (let i = 0; i < n; i++) this.add('ring', s + i * gap, x, { y: 1 + Math.sin(i / (n - 1) * Math.PI) * h }); }
  hole(s0, s1, x0 = -ESC_HALF - 1, x1 = ESC_HALF + 1) { this.holes.push({ s0, s1, x0, x1 }); }
  hint(s, text) { this.hints.push({ s, text }); }

  layout() {
    // track shape: [length, turn per unit (rad), target pitch (rad)]
    this.seg(140, 0, 0); this.seg(160, 0.004, 0); this.seg(100, 0, 0);
    this.seg(160, -0.005, -0.07); this.seg(120, 0, 0); this.seg(140, 0.0045, 0.06);
    this.seg(140, -0.004, 0); this.seg(200, 0, -0.05); this.seg(160, 0.005, 0);
    this.seg(160, -0.005, 0.05); this.seg(240, 0, 0);
    this.END = this.segs.reduce((a, s) => a + s.len, 0);   // the exit door
    this.seg(320, 0, 0);                                     // outside
    this.LEN = this.END + 320;

    // --- opening: learn to boost
    this.hint(8, 'The whole base is coming down! Hold {laser} to BOOST!');
    this.rings(30, 8, 0); this.rings(80, 8, -4); this.rings(110, 6, 4);
    this.hint(150, 'Crates! BOOST {laser} straight through them!');
    for (const x of [-4, 0, 4]) this.add('crate', 172, x);
    this.hint(196, 'Boost or jump {punch} into those bots!');
    this.add('pawn', 210, -3); this.add('pawn', 224, 2); this.add('pawn', 238, -1);
    this.arc(255, 7, 0, 3, 2.5);
    // lasers you jump
    this.hint(285, 'Laser trip-wires! JUMP {punch}!');
    this.add('laserLow', 305); this.rings(312, 5, 0); this.add('laserLow', 340);
    // the ceiling caves in
    this.hint(368, 'Watch the ceiling!');
    for (const [s, x] of [[392, -3], [408, 3], [424, 0], [440, -4], [452, 4]]) this.add('debris', s, x);
    this.rings(462, 6, 0);
    this.add('dash', 486, 0);
    // first pit
    this.hint(500, 'Jump the pit!');
    this.hole(520, 542); this.arc(512, 9, 0, 4, 4);
    // lasers you slide under
    this.hint(565, 'Slide under! Hold {down}!');
    this.add('laserHigh', 590); this.rings(596, 5, 0); this.add('laserHigh', 622); this.add('laserLow', 652);
    for (const [s, x] of [[690, -4], [690, 4], [710, 0]]) this.add('crate', s, x);
    this.add('pawn', 725, 4); this.add('pawn', 735, -4);
    // homing chain over a big pit (or take the narrow bridge)
    this.add('dash', 752, -2);
    this.hint(764, 'Jump, then tap {punch} in the air to home in on them!');
    this.add('ramp', 782, -2.5, { w: 7 });
    this.hole(792, 852, -ESC_HALF - 1, 3);
    for (const [s, y, x] of [[804, 3.2, -2], [818, 4, -1], [832, 4.4, 0], [846, 3.6, -1]]) this.add('drone', s, x, { y });
    this.rings(794, 14, 5, 4);
    // S-bends with crate rows
    for (const x of [-5, -1, 3]) this.add('crate', 920, x);
    for (const x of [-3, 1, 5]) this.add('crate', 958, x);
    this.add('pawn', 990, -2); this.add('pawn', 1000, 2); this.add('pawn', 1010, 0);
    this.add('debris', 1032, 2); this.add('debris', 1044, -3);
    this.rings(1050, 8, 0);
    // laser gauntlet
    this.hint(1066, 'Jump... slide... JUMP!');
    this.add('laserLow', 1084); this.add('laserHigh', 1106); this.add('laserLow', 1128);
    // the floor gives way
    this.hint(1146, "The floor's giving way!");
    this.hole(1162, 1182, -ESC_HALF - 1, 0); this.rings(1162, 5, 4);
    this.hole(1198, 1218, 0, ESC_HALF + 1); this.rings(1198, 5, -4);
    this.hole(1234, 1254, -ESC_HALF - 1, 0); this.rings(1234, 5, 4);
    // big pit: boost off the ramp, or chain the drones
    this.hint(1290, 'BOOST off the ramp, or home in on the drones!');
    this.add('dash', 1296, 0);
    this.add('ramp', 1312, 0, { w: ESC_W });
    this.hole(1324, 1366);
    for (const [s, y, x] of [[1330, 4.2, 0], [1344, 4.8, 0], [1358, 4.2, 0]]) this.add('drone', s, x, { y });
    // last stretch inside
    this.add('pawn', 1410, -3); this.add('pawn', 1418, 3);
    for (const [s, x] of [[1440, 0], [1452, -4], [1462, 4], [1476, -1], [1490, 3], [1504, -3]]) this.add('debris', s, x);
    for (const x of [-4, 0, 4]) this.add('crate', 1530, x);
    this.add('laserHigh', 1556); this.add('laserLow', 1578);
    this.hint(1592, "There's the exit! BOOST!!");
    this.add('dash', 1610, 0); this.add('dash', 1650, 0); this.rings(1615, 20, 0, 4);
    this.add('ramp', this.END - 22, 0, { w: ESC_W, big: true });
  }

  sample() {
    const pts = [];
    let pos = new THREE.Vector3(0, 0, 0), yaw = 0, pitch = 0;
    const up = new THREE.Vector3(0, 1, 0);
    for (let si = 0; si < this.segs.length; si++) {
      const sg = this.segs[si];
      for (let i = 0; i < sg.len; i++) {
        yaw += sg.turn;
        const outside = si === this.segs.length - 1 || si === this.segs.length - 2;
        pitch += ((outside ? 0 : sg.pitch) - pitch) * (outside ? 0.08 : 0.035);
        const f = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        const r = new THREE.Vector3().crossVectors(f, up).normalize();
        const n = new THREE.Vector3().crossVectors(r, f).normalize();
        pts.push({ p: pos.clone(), f, r, n });
        pos.addScaledVector(f, 1);
      }
    }
    this.pts = pts;
  }

  frame(s) { return this.pts[Math.max(0, Math.min(this.pts.length - 1, Math.floor(s)))]; }

  // world position of a track-space point
  at(s, x, y, out = new THREE.Vector3()) {
    const n = this.pts.length;
    const i = Math.max(0, Math.min(n - 2, Math.floor(s))), k = s - i;
    const a = this.pts[i], b = this.pts[i + 1];
    out.copy(a.p).lerp(b.p, Math.max(0, Math.min(1, k)));
    if (s > n - 1) out.addScaledVector(a.f, s - (n - 1));
    if (s < 0) out.addScaledVector(a.f, s);
    const f = this.frame(s);
    return out.addScaledVector(f.r, x).addScaledVector(f.n, y);
  }

  floorAt(s, x) {
    if (s >= this.END) return true;            // the ground outside
    if (Math.abs(x) > ESC_HALF) return false;
    for (const h of this.holes) if (s >= h.s0 && s < h.s1 && x >= h.x0 && x < h.x1) return false;
    return true;
  }
}

// --------------------------------------------------------------- the stage
class EscapeStage {
  constructor(game) {
    this.g = game;
    this.t = 0; this.phase = 'intro';
    this.course = new EscapeCourse();
    // Sonic
    this.s = 4; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.speed = 0;
    this.ground = true; this.jumped = false; this.slide = false; this.boosting = false; this.boostT = 0;
    this.gauge = 100; this.invuln = 0; this.homing = null; this.chain = 0; this.airDash = false;
    this.anim = 0; this.lean = 0; this.dead = null; this.trick = 0;
    this.collapse = -70; this.rumble = 0; this.shake = 0; this.flash = 0; this.redPulse = 0;
    this.hintIdx = 0; this.objIdx = 0;
    this.fx = []; this.lostRings = [];
    this.cam = null;
    game.time = 0;
    try { this.init3D(); } catch (e) { console.warn('3D escape unavailable', e); this.failed = true; this.phase = 'tbc'; }
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
    this.fogIn = new THREE.Color(0x2a0806); this.skyCol = new THREE.Color(0xf2a35a);
    scene.background = this.fogIn.clone();
    scene.fog = new THREE.Fog(this.fogIn.clone(), 30, 190);
    this.camera = new THREE.PerspectiveCamera(66, VIEW_W / VIEW_H, 0.1, 1400);
    scene.add(new THREE.HemisphereLight(0xffd6b8, 0x3a0c08, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(0.3, 1, 0.2); scene.add(sun);
    this.alarmLight = new THREE.PointLight(0xff2010, 1.2, 40); scene.add(this.alarmLight);

    // --- geometry built along the course
    this.tunnel = [];
    const floorPos = [], floorUV = [], lavaPos = [], wallPos = [], wallUV = [], stripPos = [], stripUV = [], hazPos = [], hazUV = [];
    const v = new THREE.Vector3();
    const quad = (P, U, a, b, c, d, ua, ub, uc, ud) => {
      for (const [p, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { P.push(p.x, p.y, p.z); if (U) U.push(u[0], u[1]); }
    };
    const W = (s, x, y) => C.at(s, x, y, new THREE.Vector3());
    const step = 2, cell = 2;
    for (let s = 0; s < C.END; s += step) {
      for (let x = -ESC_HALF; x < ESC_HALF; x += cell) {
        const solid = C.floorAt(s + step / 2, x + cell / 2);
        const y = solid ? 0 : -14;
        const P = solid ? floorPos : lavaPos, U = solid ? floorUV : null;
        quad(P, U, W(s, x, y), W(s, x + cell, y), W(s + step, x + cell, y), W(s + step, x, y),
          [(x + 7) / 4, s / 4], [(x + 7 + cell) / 4, s / 4], [(x + 7 + cell) / 4, (s + step) / 4], [(x + 7) / 4, (s + step) / 4]);
      }
      for (const side of [-1, 1]) {
        const x = side * ESC_HALF;
        // walls go down into the pits too
        quad(wallPos, wallUV, W(s, x, -16), W(s + step, x, -16), W(s + step, x, ESC_WALL_H), W(s, x, ESC_WALL_H),
          [s / 8, -2], [(s + step) / 8, -2], [(s + step) / 8, 1], [s / 8, 1]);
        const xi = x - side * 0.05;
        quad(stripPos, stripUV, W(s, xi, 5.6), W(s + step, xi, 5.6), W(s + step, xi, 5.9), W(s, xi, 5.9), [0, 0], [1, 0], [1, 1], [0, 1]);
        quad(hazPos, hazUV, W(s, xi, 0), W(s + step, xi, 0), W(s + step, xi, 0.5), W(s, xi, 0.5), [s / 4, 0], [(s + step) / 4, 0], [(s + step) / 4, 1], [s / 4, 1]);
      }
    }
    const mesh = (P, U, m) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      if (U) geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.computeVertexNormals();
      const me = new THREE.Mesh(geo, m); scene.add(me); this.tunnel.push(me); return me;
    };
    // glowing warning lips on every pit edge
    const lipPos = [];
    for (const h of C.holes) {
      const x0 = Math.max(-ESC_HALF, h.x0), x1 = Math.min(ESC_HALF, h.x1);
      for (const [a, b] of [[h.s0 - 0.7, h.s0], [h.s1, h.s1 + 0.7]]) quad(lipPos, null, W(a, x0, 0.03), W(a, x1, 0.03), W(b, x1, 0.03), W(b, x0, 0.03));
      for (const x of [h.x0 > -ESC_HALF ? h.x0 : null, h.x1 < ESC_HALF ? h.x1 : null]) {
        if (x == null) continue;
        quad(lipPos, null, W(h.s0, x - 0.35, 0.03), W(h.s0, x + 0.35, 0.03), W(h.s1, x + 0.35, 0.03), W(h.s1, x - 0.35, 0.03));
      }
    }
    mesh(lipPos, null, new THREE.MeshBasicMaterial({ color: 0xffa020, side: THREE.DoubleSide }));
    mesh(floorPos, floorUV, new THREE.MeshLambertMaterial({ map: T.floor, side: THREE.DoubleSide }));
    mesh(lavaPos, null, new THREE.MeshBasicMaterial({ color: 0xff5a10, side: THREE.DoubleSide, fog: false }));
    mesh(wallPos, wallUV, new THREE.MeshLambertMaterial({ map: T.wall, side: THREE.DoubleSide }));
    this.stripMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, side: THREE.DoubleSide });
    mesh(stripPos, stripUV, this.stripMat);
    mesh(hazPos, hazUV, new THREE.MeshLambertMaterial({ map: T.hazard, side: THREE.DoubleSide }));

    // ceiling girders and pipes
    const girderGeo = new THREE.BoxGeometry(ESC_W + 1, 0.7, 0.9), girderMat = new THREE.MeshLambertMaterial({ color: 0x3a3e48 });
    const lampGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5), lampMat = new THREE.MeshBasicMaterial({ color: 0xff3a1a });
    this.lampMat = lampMat;
    const m4 = new THREE.Matrix4();
    for (let s = 6; s < C.END; s += 12) {
      const f = C.frame(s);
      const g = new THREE.Mesh(girderGeo, girderMat);
      g.position.copy(C.at(s, 0, ESC_WALL_H + 0.3)); this.tunnel.push(g);
      m4.makeBasis(f.r.clone().negate(), f.n, f.f); g.quaternion.setFromRotationMatrix(m4);
      scene.add(g);
      if ((s / 12 | 0) % 2 === 0) for (const side of [-1, 1]) {
        const l = new THREE.Mesh(lampGeo, lampMat); l.position.copy(C.at(s, side * (ESC_HALF - 0.4), 6.6)); l.quaternion.copy(g.quaternion); scene.add(l); this.tunnel.push(l);
      }
    }
    // the exit: a blinding doorway
    const fE = C.frame(C.END);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(ESC_W, ESC_WALL_H), new THREE.MeshBasicMaterial({ color: 0xfff3d6, fog: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    door.position.copy(C.at(C.END, 0, ESC_WALL_H / 2)); m4.makeBasis(fE.r.clone().negate(), fE.n, fE.f); door.quaternion.setFromRotationMatrix(m4);
    scene.add(door); this.door = door;

    // outside: the ground, the base's dome around the tunnel, the sky
    const endP = C.at(C.END, 0, 0);
    T.ground.repeat.set(60, 60);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ map: T.ground }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(endP.x, endP.y - 0.02, endP.z);
    ground.visible = false; scene.add(ground); this.groundMesh = ground;
    T.dome.repeat.set(8, 3);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(120, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: T.dome }));
    dome.position.copy(C.at(C.END - 120, 0, -40));
    dome.visible = false; scene.add(dome); this.dome = dome;

    // --- objects
    this.ringGeo = new THREE.TorusGeometry(0.45, 0.1, 8, 20);
    this.ringMat = new THREE.MeshLambertMaterial({ color: 0xffc41f, emissive: 0x6a4400 });
    const crateGeo = new THREE.BoxGeometry(2, 2, 2), crateMat = new THREE.MeshLambertMaterial({ map: T.crate });
    const debrisGeo = new THREE.DodecahedronGeometry(1.3, 0), debrisMat = new THREE.MeshLambertMaterial({ color: 0x5a5e68, emissive: 0x1a0500 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2020 }), glowMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2d35 });
    this.beamGlow = glowMat;
    const warnGeo = new THREE.RingGeometry(1.4, 1.9, 24), warnMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    for (const o of C.objs) {
      const f = C.frame(o.s);
      m4.makeBasis(f.r.clone().negate(), f.n, f.f);
      const q = new THREE.Quaternion().setFromRotationMatrix(m4);
      let m = null;
      if (o.type === 'ring') { m = new THREE.Mesh(this.ringGeo, this.ringMat); m.position.copy(C.at(o.s, o.x, o.y)); }
      else if (o.type === 'crate') { m = new THREE.Mesh(crateGeo, crateMat); m.position.copy(C.at(o.s, o.x, 1)); m.quaternion.copy(q); }
      else if (o.type === 'pawn') { m = this.makePawn(); m.position.copy(C.at(o.s, o.x, 0)); m.quaternion.copy(q); m.rotateY(Math.PI); }
      else if (o.type === 'drone') { m = this.makeDrone(); m.position.copy(C.at(o.s, o.x, o.y)); m.quaternion.copy(q); m.rotateY(Math.PI); }
      else if (o.type === 'debris') {
        m = new THREE.Mesh(debrisGeo, debrisMat); m.position.copy(C.at(o.s, o.x, 20)); m.visible = false;
        const w = new THREE.Mesh(warnGeo, warnMat.clone()); w.position.copy(C.at(o.s, o.x, 0.05)); w.quaternion.copy(q); w.rotateX(-Math.PI / 2); w.visible = false; scene.add(w); o.warn = w;
        o.fall = -1;
      } else if (o.type === 'laserLow' || o.type === 'laserHigh') {
        m = new THREE.Group(); m.position.copy(C.at(o.s, 0, 0)); m.quaternion.copy(q);
        const ys = o.type === 'laserLow' ? [0.25, 0.6] : [1.3, 2.1, 2.9, 3.7, 4.5];
        for (const y of ys) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, ESC_W, 6), beamMat); b.rotation.z = Math.PI / 2; b.position.y = y; m.add(b);
          const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, ESC_W, 8, 1, true), glowMat); gl.rotation.z = Math.PI / 2; gl.position.y = y; m.add(gl);
        }
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.2, 0.5), postMat); p.position.set(sx * (ESC_HALF - 0.25), 2.6, 0); m.add(p); }
      } else if (o.type === 'dash') {
        const tex = T.dash.clone(); tex.needsUpdate = true; tex.repeat.set(1, 1); o.tex = tex;
        m = new THREE.Mesh(new THREE.PlaneGeometry(3, 5), new THREE.MeshBasicMaterial({ map: tex }));
        m.position.copy(C.at(o.s, o.x, 0.04)); m.quaternion.copy(q); m.rotateX(-Math.PI / 2);
      } else if (o.type === 'ramp') {
        const len = o.big ? 10 : 7, h = o.big ? 2.4 : 1.6;
        const geo = new THREE.BufferGeometry();
        const w2 = o.w / 2;
        const P = [-w2, 0, 0, w2, 0, 0, w2, h, len, -w2, 0, 0, w2, h, len, -w2, h, len,
          -w2, 0, len, w2, h, len, w2, 0, len, -w2, 0, len, -w2, h, len, w2, h, len];
        geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, o.w / 2, 0, o.w / 2, 1, 0, 0, o.w / 2, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1], 2));
        geo.computeVertexNormals();
        const tex = T.hazard.clone(); tex.needsUpdate = true;
        m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
        m.position.copy(C.at(o.s, o.x, 0)); m.quaternion.copy(q);
        o.len = len; o.h = h;
      }
      if (m) { scene.add(m); o.mesh = m; }
    }

    // Sonic, his shadow, effects
    this.sonic = escSonicModel(); scene.add(this.sonic.root);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    scene.add(sh); this.shadow = sh;
    this.glowMat = new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.smokeMat = new THREE.SpriteMaterial({ map: T.smoke, depthWrite: false, transparent: true });
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 4, 1), new THREE.MeshBasicMaterial({ color: 0x7ff0ff, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    this.reticle.visible = false; this.reticle.renderOrder = 10; scene.add(this.reticle);
  }

  makePawn() {
    const g = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: 0xc8202a }), grey = new THREE.MeshLambertMaterial({ color: 0x6d7280 }), eye = new THREE.MeshBasicMaterial({ color: 0xffe14a });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), red); body.scale.set(1, 1.1, 0.9); body.position.y = 1.2; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), grey); head.position.y = 2.1; g.add(head);
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.1), eye); e.position.set(0, 2.15, 0.42); g.add(e);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), grey); leg.position.set(sx * 0.3, 0.35, 0); g.add(leg);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8), grey); arm.position.set(sx * 0.8, 1.2, 0.2); arm.rotation.x = -0.8; g.add(arm);
    }
    return g;
  }

  makeDrone() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), new THREE.MeshLambertMaterial({ color: 0x80869a }));
    g.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); eye.position.z = 0.5; g.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 6, 20), new THREE.MeshLambertMaterial({ color: 0xffc21a })); ring.rotation.x = Math.PI / 2; g.add(ring);
    g.userData.ring = ring;
    return g;
  }

  // ------------------------------------------------------------ helpers
  get height() { return this.slide ? 0.8 : (this.jumped || this.homing) ? 1.2 : 1.9; }

  burst(pos, n = 1, big = 1) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(this.glowMat);
      sp.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2 * big, (Math.random() - 0.5) * 2 * big, (Math.random() - 0.5) * 2 * big));
      this.scene.add(sp);
      this.fx.push({ m: sp, t: 0, dur: 26 + Math.random() * 14, size: (2.5 + Math.random() * 2.5) * big, vy: 0.02 });
      if (Math.random() < 0.6) {
        const sm = new THREE.Sprite(this.smokeMat.clone());
        sm.position.copy(sp.position); this.scene.add(sm);
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
      this.vy = 6; this.ground = false; this.jumped = false; this.homing = null;
      Sound.play('ringloss'); this.shake = 10;
    } else this.die(why);
  }

  die(why) {
    if (this.dead) return;
    this.dead = { why, t: 0 }; this.boosting = false; this.homing = null;
    Sound.play('death'); Sound.stopMusic();
    if (why === 'hit') { this.vy = 10; this.ground = false; }
    if (why === 'crushed') { this.shake = 30; Sound.play('boom', { rate: 0.5 }); }
  }

  // ------------------------------------------------------------ update
  update(inp) {
    const g = this.g;
    this.t++;
    if (this.shake > 0) this.shake *= 0.9;
    if (this.flash > 0) this.flash -= 0.04;
    if (this.phase === 'tbc') { if (this.t > 120 && (inp.startPressed || inp.jumpPressed || inp.punchPressed || inp.tapped || this.t > 480) && !g.tally) g.startTally(); return; }
    if (this.failed) return;
    this.updateFX();
    if (this.phase === 'intro') {
      if (this.t === 1) Sound.playMusic('escape');
      if (this.t === 100) { Sound.play('release', { rate: 0.8 }); this.speed = 20; }
      if (this.t > 100) { this.phase = 'run'; this.t = 0; }
      this.pose(); return;
    }
    if (this.phase === 'outro') { this.updateOutro(inp); this.pose(); return; }
    if (this.dead) {
      const D = this.dead; D.t++;
      if (D.why === 'hit') { this.vy -= ESC_GRAV * ESC_DT; this.y += this.vy * ESC_DT; this.s -= 0.1; if (this.y < 0 && this.course.floorAt(this.s, this.x)) { this.y = 0; this.vy = 0; } }
      else if (D.why === 'fell') { this.vy -= ESC_GRAV * ESC_DT; this.y += this.vy * ESC_DT; this.s += this.speed * ESC_DT * 0.3; }
      if (D.t > 120) g.escapeDeath();
      this.pose(); return;
    }
    if (!g.timeStopped) g.time++;
    if (this.invuln > 0) this.invuln--;

    // ---- boost
    const wantBoost = inp.laser && this.gauge > 0;
    if (wantBoost && !this.boosting) {
      this.boosting = true; this.boostT = 0; Sound.play('release', { rate: 0.7, vol: 0.9 }); Sound.play('boom', { vol: 0.3, rate: 1.4 });
      this.speed = Math.max(this.speed, ESC_BOOST * 0.85); this.shake = Math.max(this.shake, 6);
    }
    if (!wantBoost) this.boosting = false;
    if (this.boosting) { this.boostT++; this.gauge = Math.max(0, this.gauge - 0.42); }

    // ---- ground controls
    const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    this.vx += (steer * 15 - this.vx) * 0.16;
    this.slide = this.ground && inp.down && this.speed > 12 && !this.boosting;
    if (this.slide && !this.wasSlide) Sound.play('roll', { vol: 0.6 });
    this.wasSlide = this.slide;
    let target = this.boosting ? ESC_BOOST : this.slide ? ESC_SLIDE : ESC_RUN;
    if (this.dashT > 0) { this.dashT--; target = Math.max(target, 70); }
    this.speed += (target - this.speed) * (this.speed < target ? 0.025 : 0.02);

    if (inp.punchPressed) {
      if (this.ground) { this.vy = ESC_JUMP; this.ground = false; this.jumped = true; this.airDash = false; Sound.play('jump'); }
      else if (!this.homing) {
        const tg = this.homingTarget();
        if (tg) { this.homing = { tg, t: 0 }; this.jumped = true; Sound.play('release', { rate: 1.4, vol: 0.7 }); }
        else if (!this.airDash) { this.airDash = true; this.speed += 12; this.vy = Math.max(this.vy, 2); Sound.play('release', { rate: 1.2, vol: 0.6 }); }
      }
    }

    // ---- integrate
    const prevS = this.s;
    if (this.homing) {
      const H = this.homing, tg = H.tg; H.t++;
      const ds = tg.s - this.s, dx = tg.x - this.x, dy = (tg.y || 0) + (tg.type === 'pawn' ? 1 : 0) - this.y;
      const d = Math.hypot(ds, dx, dy), sp = 75 * ESC_DT;
      if (d < 1.2 || H.t > 40 || tg.dead) {
        if (!tg.dead && d < 2) this.smash(tg, true);
        this.homing = null; this.vy = 11; this.airDash = false;
      } else { this.s += ds / d * sp; this.x += dx / d * sp; this.y += dy / d * sp; this.speed = Math.max(this.speed, 30); }
    } else {
      this.s += this.speed * ESC_DT;
      this.x += this.vx * ESC_DT;
      if (!this.ground) { this.vy -= ESC_GRAV * ESC_DT; this.y += this.vy * ESC_DT; }
    }
    const lim = ESC_HALF - 0.7;
    if (Math.abs(this.x) > lim) { this.x = Math.sign(this.x) * lim; this.vx = 0; }
    const C = this.course;
    const floor = C.floorAt(this.s, this.x);
    if (this.ground && !floor) { this.ground = false; this.vy = 0; }
    if (!this.ground && !this.homing && this.y <= 0) {
      if (floor && this.y > -0.6) { this.y = 0; this.vy = 0; this.ground = true; this.jumped = false; this.chain = 0; this.airDash = false; this.trick = 0; }
      else if (this.y < -3) this.die('fell');
    }
    if (this.trick > 0) this.trick--;

    // ---- the collapse behind you
    const cv = 34 + Math.min(6, this.s / 300);
    this.collapse += cv * ESC_DT;
    if (this.s - this.collapse > 110) this.collapse = this.s - 110;
    if (this.collapse >= this.s - 1) this.die('crushed');
    if (this.t % 50 === 0) Sound.play('boom', { vol: 0.12 + Math.max(0, 0.3 - (this.s - this.collapse) / 300), rate: 0.45 + Math.random() * 0.2 });
    if (this.t % 23 === 0) {   // the base blowing apart around you
      const s = this.s + 20 + Math.random() * 90, side = Math.random() < 0.5 ? -1 : 1;
      this.burst(C.at(s, side * (ESC_HALF - 0.5), 2 + Math.random() * 5), 2, 1);
    }
    this.shake = Math.max(this.shake, 1.2 + Math.max(0, 6 - (this.s - this.collapse) / 8));

    this.onRamp = false;
    this.collide(prevS);
    if (this.ground && !this.onRamp) this.y = 0;

    // hints
    while (this.hintIdx < C.hints.length && C.hints[this.hintIdx].s <= this.s) {
      g.speech.say('sonic', C.hints[this.hintIdx].text, { dur: 200, prio: 3 }); this.hintIdx++;
    }
    if (this.s >= C.END - 11 && this.phase === 'run') this.startOutro();
    this.pose();
  }

  homingTarget() {
    let best = null, bd = 1e9;
    for (const o of this.course.objs) {
      if (o.dead || (o.type !== 'pawn' && o.type !== 'drone')) continue;
      const ds = o.s - this.s;
      if (ds < 1 || ds > 30) continue;
      const d = ds + Math.abs(o.x - this.x) * 2;
      if (Math.abs(o.x - this.x) < 9 && d < bd) { bd = d; best = o; }
      if (o.s > this.s + 31) break;
    }
    return best;
  }

  smash(o, homing) {
    const g = this.g, C = this.course;
    o.dead = true; if (o.mesh) o.mesh.visible = false;
    const pos = C.at(o.s, o.x, (o.y || 0) + 1);
    this.burst(pos, o.type === 'crate' ? 2 : 3, o.type === 'crate' ? 0.8 : 1);
    Sound.play(o.type === 'crate' ? 'boom' : 'pop', { vol: 0.7 });
    this.chain++;
    g.addScore(o.type === 'crate' ? 50 : CHAIN[Math.min(CHAIN.length - 1, this.chain - 1)]);
    this.gauge = Math.min(100, this.gauge + (o.type === 'crate' ? 3 : 8));
    if (homing || this.jumped) { this.vy = 11; this.ground = false; }
    this.shake = Math.max(this.shake, 5);
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
            if (this.boosting || this.homing) this.smash(o);
            else { this.hurt('hit'); if (!this.dead) { this.s = o.s - 1.8; this.speed = 6; } }
          }
          break;
        case 'pawn': case 'drone': {
          const oy = o.y || 0, oh = o.type === 'pawn' ? 2.4 : 1.4;
          if (Math.abs(ds) < 1.4 && dx < 1.5 && this.y < oy + oh && top > oy - (o.type === 'drone' ? 0.7 : 0)) {
            if (this.boosting || this.jumped || this.homing) this.smash(o);
            else this.hurt('hit');
          }
          break;
        }
        case 'laserLow':
          if (crossed && this.y < 0.7) this.hurt('hit');
          break;
        case 'laserHigh':
          if (crossed && top > 1.15 && this.y < 4.8) this.hurt('hit');
          break;
        case 'dash':
          if (crossed && this.ground && dx < 2) { this.dashT = 50; this.speed = Math.max(this.speed, 70); Sound.play('spring', { vol: 0.6, rate: 1.3 }); this.gauge = Math.min(100, this.gauge + 5); }
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
              // it shatters on impact: only being under it hurts
              o.warn.visible = false; o.dead = true; o.mesh.visible = false;
              this.burst(C.at(o.s, o.x, 0.8), 3, 1.3); Sound.play('boom', { vol: 0.6 });
              this.shake = Math.max(this.shake, 8);
              if (Math.abs(o.s - this.s) < 2.4 && dx < 2.2 && this.y < 2.5) this.hurt('hit');
            }
          }
          break;
      }
    }
  }

  startOutro() {
    this.phase = 'outro'; this.t = 0; this.boosting = false;
    this.camFrom = null;
    Sound.play('spring');
  }

  updateOutro() {
    const C = this.course, t = this.t, g = this.g;
    // fly out of the door, land, run on and turn to watch it blow
    if (t < 400) {
      if (!this.ground) { this.vy -= ESC_GRAV * ESC_DT; this.y += this.vy * ESC_DT; }
      if (this.ground && this.s < C.END + 52) this.speed += (40 - this.speed) * 0.05;
      else if (this.s >= C.END + 52) this.speed *= 0.93;
      this.s += this.speed * ESC_DT;
      this.x *= 0.95;
      if (!this.ground && this.y <= 0 && this.vy < 0) { this.y = 0; this.vy = 0; this.ground = true; this.jumped = false; Sound.play('skid', { vol: 0.6 }); }
    }
    if (t === 1) { g.speech.clear(); }
    if (t === 30) { this.outside = true; this.flash = 1; Sound.play('boom', { rate: 0.6 }); }
    if (t >= 70 && t < 210 && t % 6 === 0) {
      const d = this.dome.position;
      this.burst(new THREE.Vector3(d.x + (Math.random() - 0.5) * 200, d.y + 40 + Math.random() * 90, d.z + (Math.random() - 0.5) * 200), 1, 9 + Math.random() * 8);
      if (t % 18 === 0) Sound.play('boom', { vol: 0.8, rate: 0.4 + Math.random() * 0.3 });
      this.shake = Math.max(this.shake, 8);
    }
    if (t === 160) {
      this.flash = 1.2; Sound.play('boom', { rate: 0.3 }); this.shake = 25;
      this.burst(this.dome.position.clone().add(new THREE.Vector3(0, 60, 0)), 6, 30);
      // what's left: a caved-in, scorched shell
      this.wrecked = true; this.dome.scale.set(1, 0.42, 1); this.dome.material.color.setHex(0x2a2224);
      for (const m of this.tunnel) m.visible = false;
    }
    if (this.wrecked && t % 4 === 0 && t < 470) {   // fires and smoke columns over the wreck
      const d = this.dome.position, a = Math.random() * Math.PI * 2, r = Math.random() * 100;
      const p = new THREE.Vector3(d.x + Math.cos(a) * r, d.y + 40 + Math.random() * 20, d.z + Math.sin(a) * r);
      const sm = new THREE.Sprite(this.smokeMat.clone()); sm.position.copy(p); this.scene.add(sm);
      this.fx.push({ m: sm, t: 0, dur: 160, size: 28, vy: 0.06, smoke: true });
      const fi = new THREE.Sprite(this.glowMat); fi.position.copy(p); this.scene.add(fi);
      this.fx.push({ m: fi, t: 0, dur: 50, size: 14, vy: 0.02 });
    }
    if (t === 220) g.speech.say('sonic', 'Run all you want, Eggman.', { dur: 140, prio: 5 });
    if (t === 340) g.speech.say('sonic', "...I'll be right behind you.", { dur: 120, prio: 5 });
    if (t === 470) { this.phase = 'tbc'; this.t = 0; Sound.stopMusic(); Sound.play('actclear', { rate: 0.8 }); }
  }

  updateFX() {
    for (const f of this.fx) {
      f.t++;
      const k = f.t / f.dur;
      f.m.scale.setScalar(f.size * (f.smoke ? 0.6 + k : 0.5 + k * 0.8));
      f.m.position.y += f.vy * (f.smoke ? 6 : 1);
      if (f.smoke) f.m.material.opacity = Math.min(1, 3 * (1 - k));
      if (f.t >= f.dur) { this.scene.remove(f.m); if (f.smoke) f.m.material.dispose(); f.dead = true; }
    }
    this.fx = this.fx.filter((f) => !f.dead);
    for (const r of this.lostRings) {
      r.t++; r.v.y -= 0.02; r.m.position.add(r.v); r.m.rotation.y += 0.3;
      if (r.t > 60) { this.scene.remove(r.m); r.dead = true; }
    }
    this.lostRings = this.lostRings.filter((r) => !r.dead);
  }

  // ------------------------------------------------------------ posing / camera
  pose() {
    const C = this.course, M = this.sonic, t = this.t;
    const f = C.frame(this.s);
    const m4 = new THREE.Matrix4().makeBasis(f.r.clone().negate(), f.n, f.f);
    M.root.position.copy(C.at(this.s, this.x, this.y));
    M.root.quaternion.setFromRotationMatrix(m4);
    this.lean += ((this.vx / 15) * 0.35 - this.lean) * 0.2;
    M.root.rotateY(-this.lean * 0.8);
    M.root.rotateZ(-this.lean * 0.6);
    if ((this.phase === 'outro' && this.t > 150) || this.phase === 'tbc') {   // turn around to watch it burn
      const k = this.phase === 'tbc' ? 1 : Math.min(1, (this.t - 150) / 30);
      M.root.rotateY(Math.PI * k);
    }
    const inBall = !!((this.jumped || this.homing) && !this.ground && !this.dead);
    M.body.visible = !inBall; M.ball.visible = inBall;
    if (inBall) M.ball.rotation.x += 0.45;
    const sp = this.speed / ESC_BOOST;
    this.anim += 0.08 + sp * 0.5;
    const a = this.anim;
    const standing = this.phase === 'intro' || (this.phase === 'outro' && this.speed < 3) || this.phase === 'tbc';
    if (standing) {
      M.body.rotation.x = 0; M.body.position.y = 0.78;
      for (let i = 0; i < 2; i++) { M.legs[i].rotation.x = 0; M.arms[i].rotation.x = 0; M.arms[i].rotation.z = (i ? 1 : -1) * 0.25; }
      if (this.phase === 'intro') { M.arms[1].rotation.x = -0.4 + Math.sin(t * 0.2) * 0.1; }
    } else if (this.slide) {
      M.body.rotation.x = -0.55; M.body.position.y = 0.42;
      M.legs[0].rotation.x = -1.35; M.legs[1].rotation.x = -1.15;
      M.arms[0].rotation.x = 0.9; M.arms[1].rotation.x = 0.9;
    } else if (this.dead) {
      M.body.rotation.x = -0.6; M.body.position.y = 0.78;
      M.legs[0].rotation.x = 0.6; M.legs[1].rotation.x = -0.4; M.arms[0].rotation.z = -1.4; M.arms[1].rotation.z = 1.4;
    } else if (this.trick > 0) {
      M.body.rotation.x = -0.3; M.body.position.y = 0.78;
      M.arms[0].rotation.z = -2.4; M.arms[1].rotation.z = 2.4; M.arms[0].rotation.x = 0; M.arms[1].rotation.x = 0;
      M.legs[0].rotation.x = 0.5; M.legs[1].rotation.x = -0.6;
    } else {
      // running: the faster, the further forward he leans; boosting = arms swept back
      M.body.rotation.x = 0.25 + sp * 0.35; M.body.position.y = 0.78 + Math.abs(Math.sin(a)) * 0.08;
      const amp = 0.8 + sp * 0.5;
      M.legs[0].rotation.x = Math.sin(a) * amp; M.legs[1].rotation.x = -Math.sin(a) * amp;
      if (this.boosting) { M.arms[0].rotation.x = 1.3; M.arms[1].rotation.x = 1.3; M.arms[0].rotation.z = -0.35; M.arms[1].rotation.z = 0.35; }
      else { M.arms[0].rotation.x = -Math.sin(a) * amp; M.arms[1].rotation.x = Math.sin(a) * amp; M.arms[0].rotation.z = -0.25; M.arms[1].rotation.z = 0.25; }
    }
    // boost aura, sonic boom on boost start
    const auraT = this.boosting ? 0.32 + Math.sin(t * 0.8) * 0.08 : 0;
    M.auraMat.opacity += (auraT - M.auraMat.opacity) * 0.3;
    M.aura.visible = M.auraMat.opacity > 0.01;
    const bk = this.boosting ? Math.max(0, 1 - this.boostT / 18) : 0;
    M.boomMat.opacity = bk * 0.6; M.boom.visible = bk > 0; M.boom.scale.setScalar(1 + (1 - bk) * 1.5);
    M.root.visible = !(this.invuln > 0 && t % 6 < 3);
    // shadow on the floor
    const floor = C.floorAt(this.s, this.x);
    this.shadow.visible = floor && !this.dead;
    this.shadow.position.copy(C.at(this.s, this.x, 0.03));
    this.shadow.quaternion.setFromRotationMatrix(m4); this.shadow.rotateX(-Math.PI / 2);
    this.shadow.scale.setScalar(Math.max(0.3, 1 - this.y * 0.12));
  }

  updateCamera() {
    const C = this.course, cam = this.camera, t = this.t;
    let pos, look, fov = 66;
    const sx = this.x * 0.7;
    if (this.phase === 'intro') {
      // swing from in front of Sonic round to behind him
      const k = Math.min(1, t / 95), e = k * k * (3 - 2 * k);
      const ang = Math.PI * (1 - e);
      const back = 7 + 3 * (1 - e);
      pos = C.at(this.s - Math.cos(ang) * back, Math.sin(ang) * 4, 3.2 - e * 0.2);
      look = C.at(this.s + e * 8, 0, 1.3);
    } else if (this.phase === 'outro' || (this.phase === 'tbc' && !this.failed)) {
      const fixed = C.at(C.END + 78, -4.5, 2.4);
      const k = this.phase === 'tbc' ? 1 : Math.min(1, Math.max(0, (t - 45) / 60));
      const behind = C.at(this.s - 7, sx, this.y * 0.6 + 3.4);
      pos = behind.lerp(fixed, k * k * (3 - 2 * k));
      const lookA = C.at(this.s + 10, 0, 1.4), lookB = C.at(C.END - 60, 0, 13);
      look = lookA.lerp(lookB, Math.min(1, Math.max(0, (t - 20) / 100)) * (this.phase === 'tbc' ? 0 : 1));
      if (this.phase === 'tbc') look = C.at(C.END - 60, 0, 13);
    } else {
      const dz = this.dead && this.dead.why === 'fell' ? 0 : 1;
      const camS = this.dead ? (this.camS || this.s - 5.4) : this.s - 5.4 - (this.boosting ? 1.4 : 0);
      if (!this.dead) this.camS = camS;
      const camY = this.dead ? (this.camY || 2.9) : Math.max(1.4, this.y * 0.55) + 2.6 + (this.slide ? 1 : 0);
      if (!this.dead) this.camY = camY;
      pos = C.at(camS, sx * dz, camY);
      look = C.at(this.dead ? this.s : this.s + 9, this.x * 0.8, this.dead && this.dead.why === 'fell' ? this.y : 1.5 + this.y * 0.5);
      fov = this.boosting ? 84 : 66 + (this.speed - ESC_RUN) * 0.25;
    }
    if (!this.camPos) { this.camPos = pos.clone(); this.camLook = look.clone(); }
    const kp = this.phase === 'run' ? 0.35 : 0.2;
    this.camPos.lerp(pos, kp); this.camLook.lerp(look, kp);
    cam.position.copy(this.camPos);
    const sh = this.shake * 0.02;
    cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh;
    cam.up.copy(C.frame(this.s).n);
    if (this.phase === 'outro' || this.phase === 'tbc') cam.up.set(0, 1, 0);
    cam.lookAt(this.camLook);
    cam.fov += (fov - cam.fov) * 0.12; cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ draw
  draw(ctx) {
    if (this.failed) { ctx.fillStyle = '#2a0806'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); return; }
    const t = this.g.t;
    // alarm lighting and outside sky
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.15);
    this.stripMat.color.setRGB(0.6 + 0.4 * pulse, 0.08, 0.05);
    this.lampMat.color.setRGB(1, 0.15 + 0.25 * pulse, 0.05);
    this.beamGlow.opacity = 0.25 + 0.2 * Math.sin(t * 0.6);
    this.alarmLight.position.copy(this.course.at(this.s + 6, 0, 6));
    this.alarmLight.intensity = 0.6 + 1.2 * pulse;
    if (this.outside || this.phase === 'tbc') {
      this.scene.background = this.tex.sky; this.scene.fog.color.copy(this.skyCol); this.scene.fog.near = 120; this.scene.fog.far = 1300;
      this.groundMesh.visible = true;
      this.dome.visible = true;
      this.door.visible = false;
    } else { this.groundMesh.visible = this.s > this.course.END - 60; this.dome.visible = false; }
    for (const o of this.course.objs) {
      if (o.dead || !o.mesh) continue;
      const near = o.s > this.s - 10 && o.s < this.s + 200;
      o.mesh.visible = near && !(o.type === 'debris' && o.fall < 0);
      if (!near) continue;
      if (o.type === 'ring') o.mesh.rotation.y = t * 0.08;
      else if (o.type === 'drone') { o.mesh.userData.ring.rotation.z = t * 0.2; o.mesh.position.copy(this.course.at(o.s, o.x, o.y + Math.sin(t * 0.08 + o.s) * 0.3)); }
      else if (o.type === 'dash') o.tex.offset.y = -t * 0.05;
    }
    // homing reticle
    const tg = !this.ground && !this.homing && !this.dead && this.phase === 'run' ? this.homingTarget() : null;
    this.reticle.visible = !!tg;
    if (tg) { this.reticle.position.copy(this.course.at(tg.s, tg.x, (tg.y || 0) + (tg.type === 'pawn' ? 1.4 : 0))); this.reticle.quaternion.copy(this.camera.quaternion); this.reticle.rotateZ(t * 0.1); }
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, VIEW_W, VIEW_H);
    this.draw2D(ctx, t);
  }

  // screen position of a track-space point (for speech bubbles)
  screenAt(s, x, y) {
    const v = this.course.at(s, x, y).project(this.camera);
    return { x: (v.x + 1) / 2 * VIEW_W, y: (1 - v.y) / 2 * VIEW_H };
  }
  speakerPos() { return this.failed ? { x: VIEW_W / 2, y: VIEW_H / 2 } : this.screenAt(this.s, this.x, this.y + 2.2); }

  draw2D(ctx, t) {
    // speed lines while boosting
    if (this.boosting || this.dashT > 0) {
      ctx.save(); ctx.strokeStyle = 'rgba(220,240,255,.55)'; ctx.lineWidth = 2;
      const cx = VIEW_W / 2, cy = VIEW_H * 0.45;
      for (let i = 0; i < 26; i++) {
        const a = (i * 2.399 + t * 0.37) % (Math.PI * 2), r0 = 260 + ((t * 37 + i * 97) % 400);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6); ctx.lineTo(cx + Math.cos(a) * (r0 + 160), cy + Math.sin(a) * (r0 + 160) * 0.6); ctx.stroke();
      }
      ctx.restore();
    }
    // the collapse closing in: red edges
    const gap = this.s - this.collapse;
    if (this.phase === 'run' && gap < 40) {
      const k = 1 - gap / 40, beat = 0.5 + 0.5 * Math.sin(t * 0.4);
      const gr = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
      gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(160,10,0,${0.25 + 0.45 * k * beat})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.dead && this.dead.why === 'crushed') { ctx.fillStyle = `rgba(20,0,0,${Math.min(1, this.dead.t / 30)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.dead && this.dead.t > 70) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (this.dead.t - 70) / 40)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,250,235,${Math.min(1, this.flash)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    // stage title
    if (this.phase === 'intro') {
      const k = Math.min(1, this.t / 20);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * k})`; ctx.fillRect(0, 160, VIEW_W, 120);
      this.g.text(ctx, 'EGG BASE ESCAPE', VIEW_W / 2, 210, 44, '#ffd23f', 'center', '#5a0b14');
      this.g.text(ctx, 'GET OUT BEFORE IT COLLAPSES ON YOU', VIEW_W / 2, 254, 16, '#fff', 'center', '#000');
      if (this.t > 80) this.g.text(ctx, 'GO!', VIEW_W / 2, 340, 56, '#fff', 'center', '#1d3fd1');
    }
    if (this.phase === 'tbc') this.drawTBC(ctx, t);
  }

  drawHUD(ctx) {
    if (this.phase === 'tbc' || this.failed) return;
    const g = this.g;
    g.drawHUD(ctx);
    if (this.phase === 'outro') return;
    // boost gauge (bottom right)
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
    g.text(ctx, '[' + keyLabel('laser') + ']', x + 110, y - 14, 12, '#fff');
    // collapse meter (top centre): how close the cave-in is
    const mw = 420, mx = VIEW_W / 2 - mw / 2, my = 36;
    const gap = Math.max(0, Math.min(110, this.s - this.collapse));
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(mx - 6, my - 6, mw + 12, 26);
    const cg = ctx.createLinearGradient(mx, 0, mx + mw, 0); cg.addColorStop(0, '#ff3010'); cg.addColorStop(0.35, '#ff9a1a'); cg.addColorStop(1, '#3a2a20');
    ctx.fillStyle = cg; ctx.fillRect(mx, my, mw, 14);
    const sxp = mx + mw * gap / 110;
    ctx.fillStyle = '#1d4fe0'; ctx.beginPath(); ctx.arc(sxp, my + 7, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    g.text(ctx, gap < 40 && Math.floor(g.t / 10) % 2 ? 'IT\'S RIGHT BEHIND YOU!' : 'COLLAPSE', VIEW_W / 2, my + 44, 12, gap < 40 ? '#ff5a3a' : '#ffd0a0', 'center');
    // progress to the exit
    const prog = Math.min(1, this.s / this.course.END);
    g.text(ctx, `EXIT ${Math.round(prog * 100)}%`, VIEW_W - 40, 52, 16, '#fff', 'right');
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
    // free the course's GPU buffers; the renderer itself is reused
    if (!this.scene) return;
    this.scene.traverse((o) => { if (o.geometry && o.geometry !== this.ringGeo) o.geometry.dispose(); });
    this.ringGeo.dispose();
  }
}
