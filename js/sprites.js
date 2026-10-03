// Procedurally drawn sprites: the hedgehog hero, rings, monitors, signpost,
// boss craft, freed animals and effects. Everything is drawn facing right
// around a local origin; callers translate/scale.
'use strict';

const C = {
  blue: '#2b6cf0', blueD: '#1a48b8', blueL: '#5b94ff',
  out: '#0c1640', peach: '#f7c48e', peachD: '#d99a63',
  red: '#e3262e', redD: '#a3141b', white: '#ffffff', eye: '#1f7a3a',
  gold: '#ffd23f', goldD: '#c98b00', goldL: '#fff4b0',
};

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}
function fillStroke(ctx, fill, stroke = C.out, lw = 2) {
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function limb(ctx, x1, y1, x2, y2, w, color) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.out; ctx.lineWidth = w + 3;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function glove(ctx, x, y, r = 5) { ell(ctx, x, y, r, r); fillStroke(ctx, C.white); }
function shoe(ctx, x, y, rot = 0, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-8, 3); ctx.quadraticCurveTo(-9, -6, 0, -6); ctx.quadraticCurveTo(10, -6, 13, 0);
  ctx.quadraticCurveTo(14, 4, 8, 5); ctx.lineTo(-6, 5); ctx.closePath();
  fillStroke(ctx, C.red);
  ctx.fillStyle = C.white; ctx.fillRect(-2, -6, 4, 11);
  ctx.strokeStyle = C.out; ctx.lineWidth = 1.2; ctx.strokeRect(-2, -6, 4, 11);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ell(ctx, 6, -3, 4, 1.6); ctx.fill();
  ctx.restore();
}

function drawQuills(ctx) {
  const q = [
    [[-3, -27], [-31, -27], [-11, -17]],
    [[-9, -22], [-35, -11], [-12, -8]],
    [[-10, -12], [-29, 3], [-5, -3]],
  ];
  for (const [a, tip, b] of q) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo((a[0] + tip[0]) / 2, (a[1] + tip[1]) / 2 - 3, tip[0], tip[1]);
    ctx.quadraticCurveTo((b[0] + tip[0]) / 2, (b[1] + tip[1]) / 2 + 2, b[0], b[1]);
    ctx.closePath(); fillStroke(ctx, C.blue);
  }
}

function drawHead(ctx, opts = {}) {
  const lookUp = opts.lookUp || 0;
  ctx.save();
  ctx.translate(0, -14); ctx.rotate(-lookUp * 0.35); ctx.translate(0, 14);
  drawQuills(ctx);
  // ear
  ctx.beginPath(); ctx.moveTo(-9, -24); ctx.lineTo(-7, -39); ctx.lineTo(2, -28); ctx.closePath();
  fillStroke(ctx, C.blue);
  ctx.beginPath(); ctx.moveTo(-6, -27); ctx.lineTo(-5.5, -35); ctx.lineTo(-1, -29); ctx.closePath();
  ctx.fillStyle = C.peach; ctx.fill();
  // head
  ell(ctx, 0, -14, 16, 15.5); fillStroke(ctx, C.blue);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ell(ctx, -4, -22, 7, 4, -0.4); ctx.fill();
  // muzzle
  ell(ctx, 11, -6.5, 9.5, 6.8); fillStroke(ctx, C.peach);
  // eyes
  if (opts.dead) {
    ctx.strokeStyle = C.out; ctx.lineWidth = 2.4;
    for (const ex of [7, 14]) {
      ctx.beginPath(); ctx.moveTo(ex - 3, -21); ctx.lineTo(ex + 3, -14); ctx.moveTo(ex + 3, -21); ctx.lineTo(ex - 3, -14); ctx.stroke();
    }
  } else {
    ell(ctx, 7.5, -17.5, 6.5, 8.3); fillStroke(ctx, C.white, C.out, 1.6);
    ell(ctx, 14.5, -17.5, 4.3, 7.4); fillStroke(ctx, C.white, C.out, 1.6);
    const py = opts.eyeUp ? -21 : opts.hurt ? -15 : -17;
    const px = opts.hurt ? -1.5 : 0;
    ell(ctx, 10.6 + px, py, 2.4, 4); ctx.fillStyle = C.eye; ctx.fill();
    ell(ctx, 16.2 + px, py, 1.8, 3.5); ctx.fill();
    ctx.fillStyle = '#000'; ell(ctx, 11 + px, py, 1.3, 2.5); ctx.fill(); ell(ctx, 16.4 + px, py, 1, 2.2); ctx.fill();
    ctx.fillStyle = C.white; ell(ctx, 11.6 + px, py - 1.8, 0.8, 1); ctx.fill();
    // brow over both eyes
    ctx.strokeStyle = C.out; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(2, -25); ctx.quadraticCurveTo(11, -28, 18, -23); ctx.stroke();
  }
  // nose
  ell(ctx, 20, -10.5, 3.3, 2.8); ctx.fillStyle = '#111'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ell(ctx, 19.3, -11.5, 1.1, 0.8); ctx.fill();
  // mouth
  ctx.strokeStyle = C.out; ctx.lineWidth = 1.6; ctx.beginPath();
  if (opts.hurt || opts.dead) { ell(ctx, 13, -3, 2.5, 2); ctx.fillStyle = '#5a0b14'; ctx.fill(); ctx.stroke(); }
  else { ctx.moveTo(8, -4); ctx.quadraticCurveTo(13, -0.5, 17, -4.5); ctx.stroke(); }
  ctx.restore();
}

function drawBody(ctx) {
  ell(ctx, -1, 6, 10.5, 11); fillStroke(ctx, C.blue);
  ell(ctx, 3, 7, 6.5, 8.5); fillStroke(ctx, C.peach, null);
}

// pose: idle, walk, run, dash, ball, spring, hurt, skid, crouch, lookup, dead, push, tap
function drawHero(ctx, pose, t = 0, opts = {}) {
  ctx.save();
  ctx.lineJoin = 'round';
  if (pose === 'ball') { drawHeroBall(ctx, t, opts); ctx.restore(); return; }

  if (pose === 'crouch') { ctx.translate(0, 9); ctx.scale(1.06, 0.72); ctx.translate(0, 0); }
  let lean = 0;
  if (pose === 'run') lean = 0.12;
  if (pose === 'dash') lean = 0.2;
  if (pose === 'skid') lean = -0.25;
  if (pose === 'hurt') lean = -0.35;
  if (pose === 'push') lean = 0.3;
  ctx.translate(0, 26); ctx.rotate(lean); ctx.translate(0, -26);

  // legs & feet
  if (pose === 'walk' || pose === 'run' || pose === 'push') {
    const p = t;
    const stride = pose === 'run' ? 12 : pose === 'push' ? 6 : 9;
    const f1x = Math.sin(p) * stride, f1y = 25 - Math.max(0, Math.cos(p)) * 6;
    const f2x = -Math.sin(p) * stride, f2y = 25 - Math.max(0, -Math.cos(p)) * 6;
    limb(ctx, -2, 13, f2x - 2, f2y - 3, 4, C.blue); shoe(ctx, f2x, f2y, Math.sin(p) * 0.3);
    drawBackArm(ctx, -Math.sin(p) * 8 - 3, 9);
    drawBody(ctx);
    limb(ctx, 1, 13, f1x - 2, f1y - 3, 4, C.blue); shoe(ctx, f1x, f1y, -Math.sin(p) * 0.3);
    drawHead(ctx, opts);
    drawFrontArm(ctx, Math.sin(p) * 9 + 5, 9);
  } else if (pose === 'dash') {
    // figure-eight blur
    ctx.save();
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.55 - i * 0.12;
      ell(ctx, 0, 22, 15 - i * 2, 6 + i * 2, (t + i * 2.1) % Math.PI);
      ctx.fillStyle = i === 1 ? C.white : C.red; ctx.fill();
    }
    ctx.restore();
    drawBackArm(ctx, -14, 2);
    drawBody(ctx);
    drawHead(ctx, opts);
    drawFrontArm(ctx, -8, 8);
  } else if (pose === 'spring') {
    limb(ctx, -3, 13, -5, 23, 4, C.blue); shoe(ctx, -4, 27, 0.6, 0.95);
    limb(ctx, 1, 13, 3, 23, 4, C.blue); shoe(ctx, 4, 27, 0.5);
    drawBackArm(ctx, -6, -30);
    drawBody(ctx);
    drawHead(ctx, { ...opts, eyeUp: true });
    drawFrontArm(ctx, 7, -32);
  } else if (pose === 'hurt' || pose === 'dead') {
    limb(ctx, -3, 13, 10, 20, 4, C.blue); shoe(ctx, 14, 21, -0.8);
    limb(ctx, 1, 13, 14, 12, 4, C.blue); shoe(ctx, 18, 12, -1.1);
    drawBackArm(ctx, -16, -18);
    drawBody(ctx);
    drawHead(ctx, { ...opts, hurt: true, dead: pose === 'dead' });
    drawFrontArm(ctx, 12, -20);
  } else if (pose === 'skid') {
    limb(ctx, -2, 13, -8, 24, 4, C.blue); shoe(ctx, -7, 27, 0.15);
    limb(ctx, 2, 13, 14, 22, 4, C.blue); shoe(ctx, 17, 25, -0.5);
    drawBackArm(ctx, -14, 4);
    drawBody(ctx);
    drawHead(ctx, opts);
    drawFrontArm(ctx, -4, 10);
  } else {
    // idle / tap / lookup / crouch
    const tap = pose === 'tap' ? Math.max(0, Math.sin(t)) * 0.35 : 0;
    limb(ctx, -3, 13, -6, 23, 4, C.blue); shoe(ctx, -6, 26, 0);
    drawBackArm(ctx, -9, 11);
    drawBody(ctx);
    limb(ctx, 2, 13, 5, 23, 4, C.blue); shoe(ctx, 7, 26, -tap);
    drawHead(ctx, { ...opts, lookUp: pose === 'lookup' ? 1 : 0, eyeUp: pose === 'lookup' });
    if (pose === 'tap') drawFrontArm(ctx, 12, 4); else drawFrontArm(ctx, 9, 11);
  }
  ctx.restore();
}

function drawBackArm(ctx, hx, hy) { limb(ctx, -3, 1, hx, hy, 3.5, C.peach); glove(ctx, hx, hy, 4.5); }
function drawFrontArm(ctx, hx, hy) { limb(ctx, 2, 2, hx, hy, 3.5, C.peach); glove(ctx, hx, hy, 5.2); }

function drawHeroBall(ctx, rot, opts = {}) {
  const r = 21;
  ctx.save();
  if (opts.squash) ctx.scale(1 + opts.squash * 0.15, 1 - opts.squash * 0.15);
  ell(ctx, 0, 0, r, r); fillStroke(ctx, C.blue, C.out, 2.5);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2); ctx.clip();
  ctx.rotate(rot);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(-r, -4);
    ctx.quadraticCurveTo(-4, -r * 0.5, r * 0.7, -r * 0.95);
    ctx.quadraticCurveTo(0, -r * 0.2, -r, 6);
    ctx.closePath(); ctx.fillStyle = C.blueD; ctx.fill();
  }
  ell(ctx, r * 0.35, r * 0.25, 7, 5, 0.5); ctx.fillStyle = C.peach; ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ell(ctx, -6, -9, 8, 5, -0.6); ctx.fill();
  ctx.restore();
}

function drawHeroHead(ctx, s = 1, sheet = 'sonic') {
  // top half of the idle frame, centred on (0, 0)
  const img = Assets.img[sheet], f = SONIC_FRAMES[1];
  if (!img || !f) return;
  const k = 2.6 * s, hh = 15;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, f[0], f[1], f[2], hh, Math.round(-f[2] * k / 2), Math.round(-hh * k / 2), Math.round(f[2] * k), Math.round(hh * k));
  ctx.restore();
}

// ---------------- rings ----------------
function drawRing(ctx, x, y, phase, alpha = 1) {
  const w = Math.abs(Math.cos(phase));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  const rx = Math.max(2.2, 13 * w), ry = 13;
  ctx.lineWidth = 6.5; ctx.strokeStyle = C.goldD;
  ell(ctx, 0, 0, rx, ry); ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = C.gold;
  ell(ctx, 0, 0, rx, ry); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.strokeStyle = C.goldL;
  ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.5, rx - 1), ry - 1, 0, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  ctx.restore();
}

function drawSparkle(ctx, x, y, t, color = '#fff') {
  const s = 1 - t;
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2); ctx.fillStyle = color; ctx.globalAlpha = Math.min(1, s * 1.5);
  const r = 4 + t * 14;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.25 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

// ---------------- monitors ----------------
function drawMonitorIcon(ctx, kind, t) {
  switch (kind) {
    case 'ring': drawRing(ctx, 0, 0, 0.3, 1); break;
    case 'shield':
      ell(ctx, 0, 0, 10, 10); ctx.fillStyle = 'rgba(120,200,255,.6)'; ctx.fill();
      ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ell(ctx, -3, -4, 3, 2); ctx.fill(); break;
    case 'shoes': shoe(ctx, -2, 3, 0, 1); break;
    case 'invinc':
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ['#fff', '#ffe066', '#7de7ff', '#ff8ad8'][(i + Math.floor(t / 4)) % 4];
        ctx.beginPath(); ctx.arc([-6, 6, -6, 6][i], [-5, -5, 5, 5][i], 3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'life': drawHeroHead(ctx, 0.48); break;
  }
}

function drawMonitor(ctx, x, y, kind, t, broken) {
  // x = center, y = bottom
  ctx.save(); ctx.translate(x, y);
  if (broken) {
    ctx.fillStyle = '#5b6070'; ctx.fillRect(-26, -10, 52, 10);
    ctx.strokeStyle = C.out; ctx.lineWidth = 2; ctx.strokeRect(-26, -10, 52, 10);
    ctx.restore(); return;
  }
  const g = ctx.createLinearGradient(-26, 0, 26, 0);
  g.addColorStop(0, '#9aa3b5'); g.addColorStop(0.5, '#e7ecf5'); g.addColorStop(1, '#8b93a6');
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-26, -58, 52, 52, 6) : ctx.rect(-26, -58, 52, 52);
  fillStroke(ctx, g, C.out, 2.5);
  ctx.fillStyle = '#4b5263'; ctx.fillRect(-28, -8, 56, 8); ctx.strokeStyle = C.out; ctx.lineWidth = 2; ctx.strokeRect(-28, -8, 56, 8);
  // screen
  ctx.fillStyle = '#10152b'; ctx.fillRect(-19, -51, 38, 32);
  ctx.save(); ctx.beginPath(); ctx.rect(-19, -51, 38, 32); ctx.clip();
  ctx.translate(0, -35);
  if (Math.floor(t / 3) % 9 !== 0) drawMonitorIcon(ctx, kind, t);
  else { for (let i = 0; i < 18; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.6})`; ctx.fillRect(-19, -16 + i * 2, 38, 1); } }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(-19, -51, 38, 8);
  ctx.restore();
}

// ---------------- signpost ----------------
function drawSignpost(ctx, x, y, spin, face) {
  // x = center, y = ground
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#6c7280'; ctx.fillRect(-4, -78, 8, 78);
  ctx.strokeStyle = C.out; ctx.lineWidth = 2; ctx.strokeRect(-4, -78, 8, 78);
  ctx.translate(0, -112);
  const sx = Math.cos(spin);
  ctx.scale(Math.abs(sx) < 0.06 ? 0.06 : Math.abs(sx), 1);
  ell(ctx, 0, 0, 34, 34);
  fillStroke(ctx, Math.abs(sx) < 0.3 ? '#9aa3b5' : '#f1f4fa', C.out, 3);
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.clip();
  const showHero = face === 'hero' || (face === 'spin' && Math.floor((spin + Math.PI / 2) / Math.PI) % 2 === 0);
  if (showHero) { ctx.translate(-2, 6); drawHeroHead(ctx, 0.95); }
  else { ctx.translate(0, 8); drawBossFace(ctx, 0.7); }
  ctx.restore();
  ctx.restore();
}

function drawBossFace(ctx, s = 1) {
  ctx.save(); ctx.scale(s, s);
  ell(ctx, 0, -6, 26, 28); fillStroke(ctx, '#f6c7a8');
  // goggles
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-22, -22, 44, 7);
  ell(ctx, -9, -18, 7, 7); fillStroke(ctx, '#7fd3ff'); ell(ctx, 9, -18, 7, 7); fillStroke(ctx, '#7fd3ff');
  ctx.fillStyle = '#fff'; ell(ctx, -11, -21, 2, 2); ctx.fill(); ell(ctx, 7, -21, 2, 2); ctx.fill();
  // nose
  ell(ctx, 0, -4, 6, 5); fillStroke(ctx, '#ff9f86');
  // moustache
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-10, -4, -24, -2, -32, 8); ctx.bezierCurveTo(-20, 6, -10, 10, 0, 5);
  ctx.bezierCurveTo(10, 10, 20, 6, 32, 8); ctx.bezierCurveTo(24, -2, 10, -4, 0, 0);
  fillStroke(ctx, '#c4561c');
  ctx.restore();
}

// ---------------- boss craft ----------------
let bossCanvas = null;
function drawBoss(ctx, x, y, t, flash, dir) {
  if (!flash) { drawBossShape(ctx, x, y, t, dir); return; }
  // render to an offscreen canvas so the white flash only covers the craft
  if (!bossCanvas) { bossCanvas = document.createElement('canvas'); bossCanvas.width = 240; bossCanvas.height = 200; }
  const g = bossCanvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, 240, 200);
  drawBossShape(g, 120, 120, t, dir);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(0, 0, 240, 200);
  ctx.drawImage(bossCanvas, x - 120, y - 120);
}
function drawBossShape(ctx, x, y, t, dir) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  // flame
  const fl = 10 + Math.sin(t * 0.8) * 4;
  ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(-56, 6); ctx.lineTo(-56 - fl * 2, 14); ctx.lineTo(-56, 22); ctx.fill();
  ctx.fillStyle = '#fff2a8'; ctx.beginPath(); ctx.moveTo(-56, 10); ctx.lineTo(-56 - fl, 14); ctx.lineTo(-56, 18); ctx.fill();
  // pilot
  ctx.save(); ctx.translate(6, -26);
  ctx.fillStyle = '#d42b2b'; ell(ctx, 0, 18, 30, 20); fillStroke(ctx, '#d42b2b');
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-4, 2, 8, 30);
  ctx.translate(0, -10); drawBossFace(ctx, 0.85);
  ctx.restore();
  // glass dome
  ctx.beginPath(); ctx.ellipse(4, -6, 52, 50, 0, Math.PI, 0); ctx.closePath();
  ctx.fillStyle = 'rgba(160,220,255,.28)'; ctx.fill(); ctx.strokeStyle = 'rgba(220,245,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ell(ctx, -18, -36, 12, 5, -0.5); ctx.fill();
  // hull
  const g = ctx.createLinearGradient(0, -8, 0, 40);
  g.addColorStop(0, '#f2f5fb'); g.addColorStop(0.5, '#b9c0cf'); g.addColorStop(1, '#6e7587');
  ctx.beginPath(); ctx.moveTo(-62, -6); ctx.lineTo(66, -6);
  ctx.quadraticCurveTo(70, 36, 0, 40); ctx.quadraticCurveTo(-66, 36, -62, -6); ctx.closePath();
  fillStroke(ctx, g, C.out, 3);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-50, 4, 100, 6);
  ctx.fillStyle = '#e3262e'; ell(ctx, 36, 20, 5, 5); ctx.fill(); ell(ctx, 20, 24, 4, 4); ctx.fill();
  ctx.restore();
}

// ---------------- animals ----------------
function drawAnimal(ctx, x, y, kind, t, dir) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  if (kind === 0) { // bird
    ell(ctx, 0, 0, 9, 8); fillStroke(ctx, '#3fa9f5');
    ell(ctx, 2, 3, 5, 4); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.moveTo(8, -2); ctx.lineTo(14, 0); ctx.lineTo(8, 2); ctx.fill();
    ctx.fillStyle = '#000'; ell(ctx, 4, -3, 1.6, 1.6); ctx.fill();
    const w = Math.sin(t * 0.6) * 8;
    ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(-12, -6 - w); ctx.lineTo(-6, 3); ctx.closePath(); fillStroke(ctx, '#1f7fd1', C.out, 1.5);
  } else { // rabbit
    ell(ctx, -3, -14, 3, 8, -0.2); fillStroke(ctx, '#fff', C.out, 1.5);
    ell(ctx, 2, -14, 3, 8, 0.2); fillStroke(ctx, '#fff', C.out, 1.5);
    ell(ctx, 0, 0, 9, 9); fillStroke(ctx, '#fff', C.out, 1.5);
    ctx.fillStyle = '#000'; ell(ctx, 4, -2, 1.6, 1.6); ctx.fill();
    ctx.fillStyle = '#ff7aa8'; ell(ctx, 8, 1, 1.6, 1.4); ctx.fill();
  }
  ctx.restore();
}

// ---------------- effects ----------------
function drawExplosion(ctx, x, y, t) {
  // t in 0..1
  ctx.save(); ctx.translate(x, y);
  const r = 8 + t * 28;
  ctx.globalAlpha = 1 - t;
  ctx.fillStyle = t < 0.3 ? '#fff6b0' : '#ff9a2e'; ell(ctx, 0, 0, r, r); ctx.fill();
  ctx.fillStyle = '#ffffff'; ell(ctx, -r * 0.2, -r * 0.2, r * 0.5, r * 0.5); ctx.fill();
  ctx.globalAlpha = (1 - t) * 0.7;
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    ctx.fillStyle = '#ff5a1f'; ell(ctx, Math.cos(a) * r, Math.sin(a) * r, r * 0.3, r * 0.3); ctx.fill();
  }
  ctx.restore();
}

function drawShield(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = 0.45 + Math.sin(t * 0.2) * 0.1;
  const g = ctx.createRadialGradient(-8, -10, 4, 0, 0, 36);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(110,190,255,.35)'); g.addColorStop(1, 'rgba(70,140,255,.75)');
  ell(ctx, 0, 0, 36, 36); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(200,235,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function drawInvincibility(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y);
  for (let i = 0; i < 8; i++) {
    const a = t * 0.18 + i * Math.PI / 4;
    const r = 30 + Math.sin(t * 0.3 + i) * 6;
    drawSparkle(ctx, Math.cos(a) * r, Math.sin(a) * r, ((t + i * 5) % 20) / 30, ['#fff', '#ffe066', '#7de7ff', '#ff8ad8'][i % 4]);
  }
  ctx.restore();
}

function drawDust(ctx, x, y, t) {
  ctx.save(); ctx.globalAlpha = 1 - t; ctx.fillStyle = '#f4f1e6';
  ell(ctx, x, y, 4 + t * 8, 3 + t * 6); ctx.fill(); ctx.restore();
}

// Vertical loop structure drawn in world space.
function drawLoop(ctx, cx, cy, R, theme) {
  const pal = THEME_COLORS[theme];
  ctx.save();
  ctx.lineWidth = 50;
  ctx.strokeStyle = pal.dirtD; ctx.beginPath(); ctx.arc(cx, cy, R + 25, 0, Math.PI * 2); ctx.stroke();
  // checker segments
  ctx.lineWidth = 42;
  for (let i = 0; i < 24; i++) {
    ctx.strokeStyle = i % 2 ? pal.dirt : pal.dirtL;
    const a0 = i / 24 * Math.PI * 2, a1 = (i + 1) / 24 * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx, cy, R + 25, a0, a1 + 0.01); ctx.stroke();
  }
  ctx.lineWidth = 12; ctx.strokeStyle = pal.top;
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#2d2a3e';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R + 50, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

const THEME_COLORS = {
  grass:  { top: '#3ecf72', dirt: '#e8935a', dirtL: '#f0a874', dirtD: '#b8643a', sky1: '#3f8cff', sky2: '#bfe6ff' },
  sand:   { top: '#f8d49b', dirt: '#e9b46a', dirtL: '#f4c98b', dirtD: '#b98244', sky1: '#ff9a5c', sky2: '#ffe2b0' },
  stone:  { top: '#b8c0cc', dirt: '#8f97a6', dirtL: '#a6aebb', dirtD: '#636a78', sky1: '#2b2f6b', sky2: '#8a7fc9' },
  purple: { top: '#c78cf5', dirt: '#8e5bd1', dirtL: '#a274e0', dirtD: '#5f3a99', sky1: '#251b4d', sky2: '#7a5bbf' },
};

// ---------------- fan sprite sheet (8-bit Sonic) ----------------
const SPRITE_SCALE = 2.5;
const SONIC_ANIM = {
  idle: [1], blink: [2], lookup: [3], tap: [4, 5], walk: [17, 18, 19, 20], run: [10, 11, 12, 13],
  dash: [25, 26, 27, 28], ball: [29, 30, 31, 32], spindash: [21, 22, 23, 24], spring: [9], hurt: [8],
  dead: [16], skid: [15], push: [13], crouch: [1], fly: [13], hover: [1], punch: [20], charge: [9],
  rip: [15], dive: [14],
};
// Draws frame `idx`. anchor 'feet' puts the bottom centre at (x, y); 'center' centres it.
function drawSonicFrame(ctx, idx, x, y, opts = {}) {
  const img = Assets.img[opts.sheet || 'sonic'];
  const f = SONIC_FRAMES[idx];
  if (!img || !f) return;
  const s = opts.scale || SPRITE_SCALE;
  const w = f[2] * s, h = f[3] * s;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.flip) ctx.scale(-1, 1);
  if (opts.sy) ctx.scale(1, opts.sy);
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  const oy = opts.anchor === 'center' ? -h / 2 : -h;
  ctx.drawImage(img, f[0], f[1], f[2], f[3], Math.round(-w / 2), Math.round(oy), Math.round(w), Math.round(h));
  ctx.restore();
}
function animFrame(name, t) { const a = SONIC_ANIM[name] || SONIC_ANIM.idle; return a[Math.floor(t) % a.length]; }
