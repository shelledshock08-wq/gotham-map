// Charmcaster's head, drawn as a vector puppet every frame.
// Facial features follow the tracked landmarks directly (so blinks, smiles,
// talking and brow raises are yours); hair, ears and earrings live in head
// space (cm, see geom.js) and are projected with the fitted head pose, so they
// turn with you. Loose hair has spring physics.

import { project, rotate, projectEllipsoid, clamp, lerp, smoothstep } from './geom.js';

const TAU = Math.PI * 2;

// Sampled from the show's frames.
export const PAL = {
  ink: '#000000',
  skin: '#d59797', skinShade: '#b7737c', skinDeep: '#8a4f5e',
  hair: '#fbfdfe', hairShade: '#c6d6e1', hairDeep: '#93a6bb',
  purple: '#a16bc8', purpleShade: '#653d8a',
  iris: '#5229a0', irisDeep: '#2e1366', pupil: '#3a1a7c', sclera: '#e0e2e0',
  lips: '#060308', lipHi: '#8028ac', mouth: '#3b0d1c', teeth: '#dbddda', tongue: '#a8455c',
  magenta: '#760057', magentaShade: '#41002b', magentaLight: '#a3237d',
  black: '#1f0a1d', blackHi: '#3d1a3a',
  gold: '#d8b353', goldShade: '#8f6a1f', goldHi: '#f6e3a1',
  gem: '#af0499', gemHi: '#ff7ae0', gemDeep: '#5e0052',
  magic: '#e07bff', magicHot: '#ff5ce1',
};

const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYES = [
  { // subject's right eye
    upper: [33, 246, 161, 160, 159, 158, 157, 173, 133],
    lower: [33, 7, 163, 144, 145, 153, 154, 155, 133],
    iris: 468, ring: [469, 470, 471, 472], outer: 33, inner: 133, lowMid: 145,
    brow: [70, 63, 105, 66, 107], blink: 'eyeBlinkRight', wide: 'eyeWideRight',
  },
  { // subject's left eye
    upper: [263, 466, 388, 387, 386, 385, 384, 398, 362],
    lower: [263, 249, 390, 373, 374, 380, 381, 382, 362],
    iris: 473, ring: [474, 475, 476, 477], outer: 263, inner: 362, lowMid: 374,
    brow: [300, 293, 334, 296, 336], blink: 'eyeBlinkLeft', wide: 'eyeWideLeft',
  },
];
const LIP_OUT_U = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const LIP_OUT_L = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];
const LIP_IN_U = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
const LIP_IN_L = [308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];

// Approximate skull surface: z of the forehead/temples for a head-space (x, y).
function headZ(x, y) {
  const u = x / 8.4, v = (y - 1.0) / 11.5;
  const k = Math.max(0.02, 1 - u * u - v * v);
  return -3.6 + 9.6 * Math.sqrt(k);
}
const H = (x, y, dz = 0.75) => [x, y, headZ(x, y) + dz];

// ---------- path helpers ----------

// Smooth curve through points (quadratic segments via midpoints). pts = [[x,y],...]
function smooth(ctx, pts, closed, moveTo = true) {
  const n = pts.length;
  if (n < 2) return;
  if (closed) {
    const a = pts[n - 1], b = pts[0];
    ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
    return;
  }
  if (moveTo) ctx.moveTo(pts[0][0], pts[0][1]);
  else ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
}

// Filled shape from a centerline with per-point half widths (tapered brush stroke).
function taper(ctx, pts, widths) {
  const n = pts.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const d = Math.hypot(tx, ty) || 1;
    tx /= d; ty /= d;
    const w = widths[i];
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
    R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  ctx.beginPath();
  smooth(ctx, L, false);
  smooth(ctx, R.reverse(), false, false);
  ctx.closePath();
}

const mix2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function quadPoint(p0, c, p1, t) {
  const a = mix2(p0, c, t), b = mix2(c, p1, t);
  return mix2(a, b, t);
}

// Catmull-Rom resample of a polyline: returns [[x,y,w],...]
function catmull(nodes, widths, per = 5) {
  const out = [];
  const n = nodes.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = nodes[Math.max(0, i - 1)], p1 = nodes[i], p2 = nodes[i + 1], p3 = nodes[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), lerp(widths[i], widths[i + 1], t)]);
    }
  }
  out.push([nodes[n - 1][0], nodes[n - 1][1], widths[n - 1]]);
  return out;
}

// ---------- hair strands with spring physics ----------

export class Strand {
  // nodes: head-space rest positions; widths: half widths in cm
  constructor(nodes, widths, opts = {}) {
    this.rest = nodes;
    this.widths = widths;
    this.n = nodes.length;
    this.p = new Float32Array(this.n * 2);
    this.q = new Float32Array(this.n * 2);
    this.t = new Float32Array(this.n * 2);
    this.ready = false;
    this.stiff = opts.stiff || 0.18;
    this.tips = opts.tips || 3;
    this.purpleAt = opts.purpleAt ?? 0.6;
  }
  reset() { this.ready = false; }
  step(F) {
    const { n, p, q, t } = this;
    for (let i = 0; i < n; i++) {
      const r = this.rest[i];
      const s = project(F.pose, r[0], r[1], r[2]);
      t[i * 2] = s[0];
      t[i * 2 + 1] = s[1];
    }
    if (!this.ready) {
      p.set(t); q.set(t);
      this.ready = true;
      return;
    }
    const dt = clamp(F.dt, 1 / 120, 1 / 15);
    const g = 420 * F.s * dt * dt;
    for (let i = 1; i < n; i++) {
      const j = i * 2;
      const vx = (p[j] - q[j]) * 0.84, vy = (p[j + 1] - q[j + 1]) * 0.84;
      q[j] = p[j]; q[j + 1] = p[j + 1];
      p[j] += vx; p[j + 1] += vy + g;
      const k = this.stiff * (1 - 0.45 * (i / (n - 1)));
      p[j] += (t[j] - p[j]) * k;
      p[j + 1] += (t[j + 1] - p[j + 1]) * k;
    }
    p[0] = q[0] = t[0];
    p[1] = q[1] = t[1];
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < n - 1; i++) {
        const a = i * 2, b = a + 2;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1];
        const d = Math.hypot(dx, dy) || 1e-6;
        const L = Math.hypot(t[b] - t[a], t[b + 1] - t[a + 1]);
        const diff = (d - L) / d;
        if (i === 0) {
          p[b] -= dx * diff; p[b + 1] -= dy * diff;
        } else {
          p[a] += dx * diff * 0.5; p[a + 1] += dy * diff * 0.5;
          p[b] -= dx * diff * 0.5; p[b + 1] -= dy * diff * 0.5;
        }
      }
    }
  }
  draw(ctx, F) {
    const nodes = [], widths = [];
    for (let i = 0; i < this.n; i++) {
      nodes.push([this.p[i * 2], this.p[i * 2 + 1]]);
      widths.push(this.widths[i] * F.s);
    }
    drawRibbon(ctx, F, catmull(nodes, widths, 5), this);
  }
}

function drawRibbon(ctx, F, S, opt) {
  const n = S.length;
  const Lp = [], Rp = [], Tn = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const d = Math.hypot(tx, ty) || 1;
    tx /= d; ty /= d;
    Tn.push([tx, ty]);
    const w = S[i][2];
    Lp.push([S[i][0] - ty * w, S[i][1] + tx * w]);
    Rp.push([S[i][0] + ty * w, S[i][1] - tx * w]);
  }
  // jagged end: a few spikes of uneven length
  const e = S[n - 1], te = Tn[n - 1], we = Math.max(e[2], F.s * 0.5);
  const nx = -te[1], ny = te[0];
  const tips = [];
  const k = opt.tips;
  for (let j = 0; j <= 2 * k; j++) {
    const off = lerp(we, -we, j / (2 * k));
    if (j % 2 === 1) {
      const len = we * (1.2 + 0.7 * Math.abs(Math.sin(j * 1.7 + 0.6)));
      tips.push([e[0] + nx * off + te[0] * len + nx * we * 0.3, e[1] + ny * off + te[1] * len + ny * we * 0.3]);
    } else if (j > 0 && j < 2 * k) {
      tips.push([e[0] + nx * off - te[0] * we * 0.1, e[1] + ny * off - te[1] * we * 0.1]);
    }
  }
  const far = (dist, side) => [e[0] + te[0] * we * dist + nx * we * side, e[1] + te[1] * we * dist + ny * we * side];
  const outlinePath = () => {
    ctx.beginPath();
    smooth(ctx, Lp, false);
    for (const p of tips) ctx.lineTo(p[0], p[1]);
    smooth(ctx, Rp.slice().reverse(), false, false);
  };
  // shaded side: a band along the right edge, carried on past the tips
  const shadePath = () => {
    const inner = [];
    for (let i = 0; i < n; i++) inner.push([S[i][0] + Tn[i][1] * S[i][2] * 0.3, S[i][1] - Tn[i][0] * S[i][2] * 0.3]);
    ctx.beginPath();
    smooth(ctx, inner, false);
    const f0 = far(4, 0.3), f1 = far(4, -3);
    ctx.lineTo(f0[0], f0[1]);
    ctx.lineTo(f1[0], f1[1]);
    smooth(ctx, Rp.slice().reverse(), false, false);
    ctx.closePath();
  };

  ctx.save();
  outlinePath();
  ctx.closePath();
  ctx.fillStyle = PAL.hair;
  ctx.fill();
  ctx.clip();
  shadePath();
  ctx.fillStyle = PAL.hairShade;
  ctx.fill();
  // purple tips below a zigzag
  const i0 = Math.floor((n - 1) * opt.purpleAt);
  const c0 = S[i0], t0 = Tn[i0], w0 = c0[2] * 1.4;
  ctx.save();
  ctx.beginPath();
  for (let j = 0; j <= 4; j++) {
    const off = lerp(w0, -w0, j / 4);
    const up = j % 2 === 1 ? -c0[2] * 0.9 : c0[2] * 0.15;
    const x = c0[0] - t0[1] * off + t0[0] * up, y = c0[1] + t0[0] * off + t0[1] * up;
    if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  const f0 = far(6, -4), f1 = far(6, 4);
  ctx.lineTo(f0[0], f0[1]);
  ctx.lineTo(f1[0], f1[1]);
  ctx.closePath();
  ctx.fillStyle = PAL.purple;
  ctx.fill();
  ctx.clip();
  shadePath();
  ctx.fillStyle = PAL.purpleShade;
  ctx.fill();
  ctx.restore();
  // one strand line in the white part
  const pts = [];
  for (let i = 1; i < i0; i++) pts.push([S[i][0] - Tn[i][1] * S[i][2] * 0.2, S[i][1] + Tn[i][0] * S[i][2] * 0.2]);
  if (pts.length > 1) {
    ctx.beginPath();
    smooth(ctx, pts, false);
    ctx.strokeStyle = PAL.hairDeep;
    ctx.lineWidth = F.lw * 0.55;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
  // ink, open at the root where it grows out of the scalp
  outlinePath();
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = F.lw;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// ---------- the bangs ----------

const BANG_TOP = [[7.6, 6.6], [6.9, 9.7], [2.6, 12.0], [-3.6, 11.3], [-8.3, 8.7]];
// lower jagged edge, far left -> right: tips (t) and notches (n)
const BANG_EDGE = [
  ['t', -11.6, 3.2], ['n', -7.0, 7.4], ['t', -6.4, 3.0], ['n', -4.2, 7.6], ['t', -2.7, 4.0],
  ['n', -1.2, 7.9], ['t', 0.15, 2.1], ['n', 1.8, 8.2], ['t', 3.6, 4.5], ['n', 5.0, 8.4], ['t', 7.0, 4.7],
];
const PART = [2.6, 12.0];

// ---------- the Charmcaster puppet ----------

export class Charm {
  constructor() {
    this.strands = {
      left: new Strand(
        [[-7.1, 6.2, 0.2], [-7.8, 2.0, -0.2], [-8.1, -2.6, -0.4], [-8.2, -6.6, -0.6], [-8.0, -10.2, -0.8]],
        [1.9, 1.85, 1.7, 1.45, 1.1], { stiff: 0.22, tips: 3, purpleAt: 0.6 }),
      right: new Strand(
        [[7.9, 3.2, -5.2], [8.3, -1.4, -5.0], [8.6, -6.0, -4.6], [8.7, -10.6, -4.2], [8.6, -14.2, -4.0]],
        [1.6, 1.6, 1.5, 1.25, 0.9], { stiff: 0.18, tips: 3, purpleAt: 0.62 }),
      back: new Strand(
        [[2.5, 3.5, -9.0], [8.5, -0.5, -9.0], [14.5, -6.5, -8.5], [19.0, -13.5, -8.0], [22.0, -21.0, -7.5], [23.0, -28.0, -7.5]],
        [6.2, 6.4, 6.0, 5.2, 4.0, 2.4], { stiff: 0.12, tips: 4, purpleAt: 0.7 }),
    };
    this.spell = 0;
    this.particles = [];
    this.noseSide = -1;
    this.neck = null;
    this.bodyScale = 0;
    this.bodyRoll = 0;
  }

  reset() {
    for (const k in this.strands) this.strands[k].reset();
    this.neck = null;
    this.bodyScale = 0;
    this.particles.length = 0;
  }

  // Shared per-frame values (pose angles, line width, expressions, body anchor).
  update(F) {
    const R = F.pose.R;
    F.yaw = Math.atan2(-R[2], R[8]);
    F.pitch = Math.atan2(-R[5], R[8]);
    F.roll = Math.atan2(R[3], R[0]);
    F.lw = Math.max(1.6, F.s * 0.11);
    for (const k in this.strands) this.strands[k].step(F);

    // spell: raise both eyebrows
    const brow = (F.bs('browInnerUp') + 0.5 * (F.bs('browOuterUpLeft') + F.bs('browOuterUpRight'))) / 2;
    const target = brow > 0.42 || F.forceSpell ? 1 : 0;
    this.spell += (target - this.spell) * Math.min(1, F.dt * (target ? 5 : 2.5));

    // body anchor (neck base): body tracking, else where the clothes start, else below the chin
    let nx, ny, s0, roll;
    if (F.body) {
      [nx, ny] = F.body.neck;
      s0 = F.body.scale / 34; // shoulder joints are ~34 cm apart
      roll = F.body.roll;
    } else {
      s0 = F.s;
      roll = clamp(F.roll * 0.3, -0.25, 0.25);
      if (F.neckline) {
        [nx, ny] = F.neckline;
      } else {
        const c = project(F.pose, 0, -16.0, -3.0);
        nx = c[0]; ny = c[1];
      }
    }
    this.bodyScale = this.bodyScale ? lerp(this.bodyScale, s0, F.body ? 0.3 : 0.08) : s0;
    if (!this.neck) this.neck = [nx, ny];
    else { this.neck[0] = lerp(this.neck[0], nx, 0.3); this.neck[1] = lerp(this.neck[1], ny, 0.3); }
    this.bodyRoll = lerp(this.bodyRoll, roll, F.body ? 0.3 : 0.1);
  }

  // Black centre panel of the outfit for the toon shader: [top xy, bottom xy, half widths, on] in px.
  panel() {
    if (!this.neck) return [0, 0, 0, 0, 0, 0, 0];
    const s = this.bodyScale, [x, y] = this.neck;
    return [x, y - 0.5 * s, x, y + 2000, 2.1 * s, 2.1 * s + 200, 1];
  }

  // ---- layer behind the body (long hair, spell circle) ----
  drawBack(ctx, F) {
    if (this.spell > 0.02) this.drawRunes(ctx, F);
    this.strands.back.draw(ctx, F);
  }

  // ---- everything in front ----
  drawFront(ctx, F) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // ears face outward and a bit forward; hide the one turned away behind the hair
    const facing = (sgn) => -rotate(F.pose, sgn * 0.8, 0.1, 0.6)[2];
    const earBack = [facing(-1) < -0.15, facing(1) < -0.15];
    if (earBack[0]) this.drawEar(ctx, F, -1);
    if (earBack[1]) this.drawEar(ctx, F, 1);
    this.drawCap(ctx, F);
    this.strands.right.draw(ctx, F);
    this.drawCollar(ctx, F);
    if (!earBack[0]) this.drawEar(ctx, F, -1);
    if (!earBack[1]) this.drawEar(ctx, F, 1);

    const oval = this.faceOval(F);
    this.drawFace(ctx, F, oval);
    this.drawNose(ctx, F);
    this.drawMouth(ctx, F);
    for (const E of EYES) this.drawEye(ctx, F, E);
    this.drawBangShadow(ctx, F, oval);
    this.strands.left.draw(ctx, F);
    this.drawBangs(ctx, F);
    if (this.spell > 0.02) this.drawSpellFx(ctx, F);
  }

  faceOval(F) {
    const { X, Y } = F;
    let cx = 0, cy = 0;
    for (const i of OVAL) { cx += X[i]; cy += Y[i]; }
    cx /= OVAL.length; cy /= OVAL.length;
    const grow = F.s * 0.22;
    return OVAL.map((i) => {
      const dx = X[i] - cx, dy = Y[i] - cy;
      const d = Math.hypot(dx, dy) || 1;
      return [X[i] + (dx / d) * grow, Y[i] + (dy / d) * grow];
    });
  }

  drawFace(ctx, F, oval) {
    ctx.save();
    ctx.beginPath();
    smooth(ctx, oval, true);
    ctx.fillStyle = PAL.skinShade;
    ctx.fill();
    ctx.clip();
    const lit = rotate(F.pose, -0.32, 0.22, 0);
    ctx.translate(lit[0] * F.s, lit[1] * F.s);
    ctx.beginPath();
    smooth(ctx, oval, true);
    ctx.fillStyle = PAL.skin;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    smooth(ctx, oval, true);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = F.lw;
    ctx.stroke();
  }

  drawEye(ctx, F, E) {
    const { X, Y, s } = F;
    const ox = X[E.outer], oy = Y[E.outer], ix = X[E.inner], iy = Y[E.inner];
    const cx = (ox + ix) / 2, cy = (oy + iy) / 2;
    let ux = ox - ix, uy = oy - iy;
    const len = Math.hypot(ux, uy) || 1;
    ux /= len; uy /= len;
    let vx = uy, vy = -ux; // perpendicular; make it point toward the brow
    const bx = X[E.brow[2]] - cx, by = Y[E.brow[2]] - cy;
    if (vx * bx + vy * by < 0) { vx = -vx; vy = -vy; }

    const blink = F.bs(E.blink), wide = F.bs(E.wide);
    const open = (1 - smoothstep(0.42, 0.72, blink)) * (1 + 0.25 * wide);
    const SX = 1.15, SY = 1.5;
    const tf = (x, y, ku) => {
      const dx = x - cx, dy = y - cy;
      const a = dx * ux + dy * uy, b = (dx * vx + dy * vy) * ku;
      return [cx + ux * a * SX + vx * b * SY, cy + uy * a * SX + vy * b * SY];
    };
    const up = E.upper.map((i) => tf(X[i], Y[i], open));
    const lo = E.lower.map((i) => tf(X[i], Y[i], 0.55 + 0.45 * open));
    const sclera = up.concat(lo.slice(1, -1).reverse());

    // iris
    let ir = 0;
    for (const k of E.ring) ir += Math.hypot(X[k] - X[E.iris], Y[k] - Y[E.iris]);
    ir = (ir / 4) * 1.3;
    const ic = tf(X[E.iris], Y[E.iris], 1);

    ctx.save();
    ctx.beginPath();
    smooth(ctx, sclera, true);
    ctx.fillStyle = PAL.sclera;
    ctx.fill();
    ctx.clip();
    const glow = this.spell;
    ctx.beginPath();
    ctx.arc(ic[0], ic[1], ir, 0, TAU);
    ctx.fillStyle = glow > 0.05 ? mixColor(PAL.iris, PAL.magicHot, glow) : PAL.iris;
    ctx.fill();
    ctx.lineWidth = ir * 0.22;
    ctx.strokeStyle = glow > 0.05 ? mixColor(PAL.irisDeep, '#ffffff', glow * 0.6) : PAL.irisDeep;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ic[0], ic[1], ir * 0.42, 0, TAU);
    ctx.fillStyle = glow > 0.05 ? mixColor(PAL.pupil, '#ffffff', glow) : PAL.pupil;
    ctx.fill();
    // lid shadow
    ctx.beginPath();
    smooth(ctx, up, false);
    ctx.strokeStyle = 'rgba(46, 19, 102, 0.32)';
    ctx.lineWidth = s * 0.55;
    ctx.stroke();
    ctx.restore();

    // upper lash line, thickening toward a winged tip
    const n = up.length; // outer -> inner
    const band = [];
    for (let i = n - 1; i >= 0; i--) {
      const t = 1 - i / (n - 1); // 0 inner .. 1 outer
      const th = s * (0.07 + 0.2 * t * t);
      band.push([up[i][0] + vx * th, up[i][1] + vy * th]);
    }
    const tip = [up[0][0] + ux * s * 0.75 + vx * s * 0.42, up[0][1] + uy * s * 0.75 + vy * s * 0.42];
    ctx.beginPath();
    smooth(ctx, up.slice().reverse(), false);
    ctx.lineTo(tip[0], tip[1]);
    smooth(ctx, band.slice().reverse(), false, false);
    ctx.closePath();
    ctx.fillStyle = PAL.ink;
    ctx.fill();
    ctx.beginPath();
    smooth(ctx, up, false);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = F.lw;
    ctx.stroke();
    // lower lid line (outer 80%)
    ctx.beginPath();
    smooth(ctx, lo.slice(0, 8), false);
    ctx.lineWidth = F.lw * 0.9;
    ctx.stroke();
    // crease
    if (open > 0.3) {
      const crease = [];
      for (let i = 2; i < n - 1; i++) {
        const t = 1 - i / (n - 1);
        const off = s * (0.42 + 0.12 * t) * clamp(open, 0.6, 1.1);
        crease.push([up[i][0] + vx * off, up[i][1] + vy * off]);
      }
      ctx.beginPath();
      smooth(ctx, crease, false);
      ctx.lineWidth = F.lw * 0.55;
      ctx.stroke();
    }
    // brow: thin arch, thicker toward the nose
    const brow = E.brow.map((i) => [X[i] + vx * s * 0.12, Y[i] + vy * s * 0.12]);
    taper(ctx, brow, [0.03, 0.07, 0.09, 0.1, 0.09].map((w) => w * s));
    ctx.fillStyle = PAL.ink;
    ctx.fill();
    // her swirl mark under the eye
    const base = tf(X[E.lowMid], Y[E.lowMid], 0.55 + 0.45 * open);
    const m = (a, b) => [base[0] + ux * a * s - vx * b * s, base[1] + uy * a * s - vy * b * s];
    const curl = [m(0.18, 0.06), m(0.25, 0.5), m(0.33, 0.98), m(0.56, 1.38), m(0.88, 1.42), m(1.02, 1.16)];
    taper(ctx, curl, [0.15, 0.19, 0.19, 0.15, 0.1, 0.025].map((w) => w * s));
    ctx.fill();
    const spur = [m(0.27, 0.4), m(0.52, 0.47), m(0.72, 0.4)];
    taper(ctx, spur, [0.11, 0.07, 0.015].map((w) => w * s));
    ctx.fill();
  }

  drawNose(ctx, F) {
    const { X, Y, s } = F;
    // put the bridge line on the side turned away from the viewer
    if (F.yaw < -0.2) this.noseSide = 1;
    else if (F.yaw > 0.05) this.noseSide = -1;
    const a = [X[98], Y[98]], b = [X[327], Y[327]];
    const leftAla = a[0] < b[0] ? a : b, rightAla = a[0] < b[0] ? b : a;
    const far = this.noseSide < 0 ? leftAla : rightAla, near = this.noseSide < 0 ? rightAla : leftAla;
    const bridge = [X[6], Y[6]], tipP = [X[4], Y[4]], sub = [X[2], Y[2]];
    const p0 = mix2(bridge, far, 0.22);
    const c = mix2(tipP, far, 0.55);
    const p1 = mix2(sub, far, 0.3);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.quadraticCurveTo(c[0], c[1], p1[0], p1[1]);
    const hook = mix2(sub, near, 0.12);
    ctx.quadraticCurveTo(lerp(p1[0], hook[0], 0.5), lerp(p1[1], hook[1], 0.5) + s * 0.12, hook[0], hook[1]);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = F.lw * 0.75;
    ctx.stroke();
    const n0 = mix2(sub, near, 0.42), n1 = mix2(sub, near, 0.85);
    ctx.beginPath();
    ctx.moveTo(n0[0], n0[1]);
    ctx.quadraticCurveTo(lerp(n0[0], n1[0], 0.5), lerp(n0[1], n1[1], 0.5) + s * 0.1, n1[0], n1[1] - s * 0.08);
    ctx.stroke();
  }

  drawMouth(ctx, F) {
    const { X, Y, s } = F;
    const cx = (X[61] + X[291]) / 2, cy = (Y[61] + Y[291]) / 2;
    let ux = X[291] - X[61], uy = Y[291] - Y[61];
    const w = Math.hypot(ux, uy) || 1;
    ux /= w; uy /= w;
    const right = rotate(F.pose, 1, 0, 0);
    if (ux * right[0] + uy * right[1] < 0) { ux = -ux; uy = -uy; } // u: viewer's right
    let vx = -uy, vy = ux;
    if (vx * (X[152] - cx) + vy * (Y[152] - cy) < 0) { vx = -vx; vy = -vy; } // v: toward the chin
    const tf = (i) => {
      const dx = X[i] - cx, dy = Y[i] - cy;
      const a = (dx * ux + dy * uy) * 0.94, b = (dx * vx + dy * vy) * 1.1;
      return [cx + ux * a + vx * b, cy + uy * a + vy * b];
    };
    const outer = LIP_OUT_U.map(tf).concat(LIP_OUT_L.slice(1, -1).map(tf));
    const inner = LIP_IN_U.map(tf).concat(LIP_IN_L.slice(1, -1).map(tf));
    const gap = Math.hypot(X[14] - X[13], Y[14] - Y[13]) / s;

    if (gap > 0.12) {
      ctx.save();
      ctx.beginPath();
      smooth(ctx, inner, true);
      ctx.fillStyle = PAL.mouth;
      ctx.fill();
      ctx.clip();
      const iu = LIP_IN_U.map(tf);
      const drop = Math.min(gap * 0.5, 0.34) * s;
      ctx.beginPath();
      smooth(ctx, iu, false);
      smooth(ctx, iu.slice().reverse().map((p) => [p[0] + vx * drop, p[1] + vy * drop]), false, false);
      ctx.closePath();
      ctx.fillStyle = PAL.teeth;
      ctx.fill();
      if (gap > 0.33) {
        const il = LIP_IN_L.map(tf);
        const rise = 0.16 * s;
        ctx.beginPath();
        smooth(ctx, il, false);
        smooth(ctx, il.slice().reverse().map((p) => [p[0] - vx * rise, p[1] - vy * rise]), false, false);
        ctx.closePath();
        ctx.fill();
        const tb = tf(14);
        ctx.beginPath();
        ctx.ellipse(tb[0] - vx * s * 0.2, tb[1] - vy * s * 0.2, s * 1.02, s * 0.46, Math.atan2(uy, ux), 0, TAU);
        ctx.fillStyle = PAL.tongue;
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.beginPath();
    smooth(ctx, outer, true);
    if (gap > 0.12) smooth(ctx, inner, true);
    ctx.fillStyle = PAL.lips;
    ctx.fill('evenodd');
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = F.lw * 0.8;
    ctx.stroke();
    // the little purple shine on her lower lip
    const lo = tf(17), li = tf(14);
    const hx = lerp(lo[0], li[0], 0.5) - ux * s * 0.55, hy = lerp(lo[1], li[1], 0.5) - uy * s * 0.55;
    ctx.beginPath();
    ctx.ellipse(hx, hy, s * 0.17, s * 0.1, Math.atan2(uy, ux), 0, TAU);
    ctx.fillStyle = PAL.lipHi;
    ctx.fill();
  }

  drawCap(ctx, F) {
    const e = projectEllipsoid(F.pose, 0, 3.3, -3.5, 9.8, 11.0, 10.2);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.rx, e.ry, e.angle, 0, TAU);
    ctx.fillStyle = PAL.hairShade;
    ctx.fill();
    ctx.clip();
    const lit = rotate(F.pose, -1.1, 0.7, 0);
    ctx.beginPath();
    ctx.ellipse(e.x + lit[0] * F.s, e.y + lit[1] * F.s, e.rx * 0.97, e.ry * 0.97, e.angle, 0, TAU);
    ctx.fillStyle = PAL.hair;
    ctx.fill();
    // strands sweeping out of the part
    ctx.strokeStyle = PAL.hairDeep;
    ctx.lineWidth = F.lw * 0.6;
    const strands = [
      [[2.6, 13.4, -1.2], [-3.5, 12.6, 1.0], [-8.6, 8.0, -0.8]],
      [[2.6, 13.4, -1.2], [-1.0, 13.6, -3.0], [-8.8, 10.4, -4.0]],
      [[2.6, 13.4, -1.2], [6.6, 11.8, -1.0], [9.2, 6.2, -3.4]],
      [[2.6, 13.4, -1.2], [5.8, 12.8, -4.0], [9.4, 8.6, -6.0]],
    ];
    for (const st of strands) {
      const a = project(F.pose, ...st[0]), m = project(F.pose, ...st[1]), b = project(F.pose, ...st[2]);
      const c = [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
    const N = 48;
    const ca = Math.cos(e.angle), sa = Math.sin(e.angle);
    const pt = (k, grow = 0) => {
      const t = (k / N) * TAU;
      const x = Math.cos(t) * (e.rx + grow), y = Math.sin(t) * (e.ry + grow);
      return [e.x + x * ca - y * sa, e.y + x * sa + y * ca];
    };
    const soft = new Path2D(), hard = new Path2D();
    for (let k = 0; k < N; k++) {
      const out = pt(k + 0.5, F.lw * 2.5);
      const path = F.hairAt && F.hairAt(out[0], out[1]) > 0.5 ? soft : hard;
      const a = pt(k), b = pt(k + 1);
      path.moveTo(a[0], a[1]);
      path.lineTo(b[0], b[1]);
    }
    ctx.lineWidth = F.lw;
    ctx.strokeStyle = PAL.hairShade;
    ctx.stroke(soft);
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(hard);
  }

  bangPath(F, dx = 0, dy = 0) {
    const P = (x, y) => {
      const p = project(F.pose, ...H(x, y, 0.8));
      return [p[0] + dx, p[1] + dy];
    };
    const top = BANG_TOP.map(([x, y]) => P(x, y));
    const edge = BANG_EDGE.map(([k, x, y]) => ({ k, p: P(x, y) }));
    return { top, edge };
  }

  traceBang(ctx, F, path, withTop = true) {
    const { top, edge } = path;
    const bow = 0.14;
    const seg = (a, b, sign) => {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const ex = b[0] - a[0], ey = b[1] - a[1];
      ctx.quadraticCurveTo(mx - ey * bow * sign, my + ex * bow * sign, b[0], b[1]);
    };
    if (withTop) {
      smooth(ctx, top, false);
      seg(top[top.length - 1], edge[0].p, 1);
    } else {
      ctx.moveTo(top[top.length - 1][0], top[top.length - 1][1]);
      seg(top[top.length - 1], edge[0].p, 1);
    }
    for (let i = 1; i < edge.length; i++) seg(edge[i - 1].p, edge[i].p, edge[i].k === 't' ? 1 : -1);
    seg(edge[edge.length - 1].p, top[0], -1);
  }

  drawBangShadow(ctx, F, oval) {
    const off = rotate(F.pose, 0.25, -0.4, 0);
    const path = this.bangPath(F, off[0] * F.s, off[1] * F.s);
    ctx.save();
    ctx.beginPath();
    smooth(ctx, oval, true);
    ctx.clip();
    ctx.beginPath();
    this.traceBang(ctx, F, path);
    ctx.closePath();
    ctx.fillStyle = PAL.skinShade;
    ctx.fill();
    ctx.restore();
  }

  drawBangs(ctx, F) {
    const path = this.bangPath(F);
    const { edge, top } = path;
    const down = rotate(F.pose, 0, -1, 0);
    const right = rotate(F.pose, 1, 0, 0);
    const far = (p, k, side = 0) => [p[0] + (down[0] * k + right[0] * side) * F.s, p[1] + (down[1] * k + right[1] * side) * F.s];
    const notches = [top[top.length - 1]];
    for (const e of edge) if (e.k === 'n') notches.push(e.p);
    notches.push(top[0]);
    const spikes = [];
    let ni = 0;
    for (const e of edge) {
      if (e.k !== 't') continue;
      spikes.push({ a: notches[ni], t: e.p, b: notches[ni + 1] });
      ni++;
    }
    // the right side of each lock is in shadow (light comes from her right)
    const shadeHalves = () => {
      ctx.beginPath();
      for (const sp of spikes) {
        const m = mix2(mix2(sp.a, sp.b, 0.62), sp.t, 0.12);
        ctx.moveTo(m[0], m[1]);
        ctx.lineTo(sp.t[0], sp.t[1]);
        ctx.lineTo(sp.b[0], sp.b[1]);
        ctx.closePath();
      }
    };

    ctx.save();
    ctx.beginPath();
    this.traceBang(ctx, F, path);
    ctx.closePath();
    ctx.fillStyle = PAL.hair;
    ctx.fill();
    ctx.clip();
    shadeHalves();
    ctx.fillStyle = PAL.hairShade;
    ctx.fill();
    // purple below a zigzag that crosses every lock
    ctx.save();
    ctx.beginPath();
    spikes.forEach((sp, i) => {
      const q1 = mix2(sp.a, sp.t, 0.2);
      const q2 = mix2(mix2(sp.a, sp.b, 0.5), sp.t, 0.08);
      const q3 = mix2(sp.b, sp.t, 0.22);
      if (i) ctx.lineTo(q1[0], q1[1]); else ctx.moveTo(q1[0], q1[1]);
      ctx.lineTo(q2[0], q2[1]);
      ctx.lineTo(q3[0], q3[1]);
    });
    const r = far(spikes[spikes.length - 1].b, 9, 4), l = far(spikes[0].a, 9, -9);
    ctx.lineTo(r[0], r[1]);
    ctx.lineTo(l[0], l[1]);
    ctx.closePath();
    ctx.fillStyle = PAL.purple;
    ctx.fill();
    ctx.clip();
    shadeHalves();
    ctx.fillStyle = PAL.purpleShade;
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // ink: the jagged edge and the gaps between locks (no line where it joins the cap)
    ctx.beginPath();
    this.traceBang(ctx, F, path, false);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = F.lw;
    ctx.stroke();
    const part = project(F.pose, ...H(PART[0], PART[1], 0.8));
    ctx.lineWidth = F.lw * 0.7;
    for (let i = 1; i < notches.length - 1; i++) {
      const nP = notches[i];
      const end = mix2(nP, part, 0.45);
      const c = mix2(nP, part, 0.2);
      ctx.beginPath();
      ctx.moveTo(nP[0], nP[1]);
      ctx.quadraticCurveTo(c[0] + right[0] * F.s * 0.5, c[1] + right[1] * F.s * 0.5, end[0], end[1]);
      ctx.stroke();
    }
  }

  drawEar(ctx, F, sgn) {
    const P = (x, y, z) => project(F.pose, x * sgn, y, z);
    const top = P(7.45, 3.6, -2.4);
    const tip = P(9.9, 7.4, -5.4);
    const rim = P(9.55, 3.2, -5.0);
    const lobe = P(7.9, -1.2, -3.6);
    const bot = P(7.35, -0.4, -2.7);
    const c1 = P(8.3, 5.9, -3.4), c2 = P(10.1, 5.0, -5.4), c3 = P(9.3, 0.6, -4.8), c4 = P(7.4, -1.3, -3.1);
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1]);
    ctx.quadraticCurveTo(c2[0], c2[1], rim[0], rim[1]);
    ctx.quadraticCurveTo(c3[0], c3[1], lobe[0], lobe[1]);
    ctx.quadraticCurveTo(c4[0], c4[1], bot[0], bot[1]);
    ctx.closePath();
    ctx.fillStyle = PAL.skin;
    ctx.fill();
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = F.lw;
    ctx.stroke();
    // inner fold
    const i0 = P(7.9, 3.1, -2.9), i1 = P(9.15, 6.1, -4.7), i2 = P(8.5, 0.5, -3.7), ic = P(8.9, 3.4, -4.2);
    ctx.beginPath();
    ctx.moveTo(i0[0], i0[1]);
    ctx.quadraticCurveTo(lerp(i0[0], i1[0], 0.5), lerp(i0[1], i1[1], 0.5), i1[0], i1[1]);
    ctx.quadraticCurveTo(ic[0], ic[1], i2[0], i2[1]);
    ctx.closePath();
    ctx.fillStyle = PAL.skinShade;
    ctx.fill();
    ctx.lineWidth = F.lw * 0.6;
    ctx.stroke();
    // two gold rings on the rim of the exposed ear
    for (const [x, y, z] of sgn > 0 ? [[9.85, 4.9, -5.35], [9.45, 2.4, -4.9]] : []) {
      const c = P(x, y, z);
      const t = rotate(F.pose, 0.15 * sgn, 1, 0);
      const ang = Math.atan2(t[1], t[0]) + Math.PI / 2;
      const ra = F.s * 0.5, rb = F.s * 0.22;
      ctx.beginPath();
      ctx.ellipse(c[0], c[1], ra, rb, ang, 0, TAU);
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = F.s * 0.3 + F.lw;
      ctx.stroke();
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = F.s * 0.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(c[0], c[1], ra, rb, ang, Math.PI * 1.1, Math.PI * 1.6);
      ctx.strokeStyle = PAL.goldHi;
      ctx.lineWidth = F.s * 0.1;
      ctx.stroke();
    }
  }

  // Collar, black under-layer and brooch. Body frame: origin at the neck base, cm, y up.
  drawCollar(ctx, F) {
    if (!this.neck) return;
    const s = this.bodyScale, th = this.bodyRoll;
    const ex = [Math.cos(th), Math.sin(th)], ey = [Math.sin(th), -Math.cos(th)];
    const B = (x, y) => [this.neck[0] + s * (x * ex[0] + y * ey[0]), this.neck[1] + s * (x * ex[1] + y * ey[1])];
    const poly = (pts, fill) => {
      ctx.beginPath();
      pts.forEach((p, i) => { const q = B(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = F.lw;
      ctx.stroke();
    };
    // black high neck
    poly([[-3.4, -0.6], [-3.3, 2.4], [0, 2.9], [3.3, 2.4], [3.4, -0.6], [0, -4.2]], PAL.black);
    ctx.beginPath();
    const h0 = B(-2.6, 2.0), h1 = B(-2.4, -0.8);
    ctx.moveTo(h0[0], h0[1]);
    ctx.lineTo(h1[0], h1[1]);
    ctx.strokeStyle = PAL.blackHi;
    ctx.lineWidth = F.lw * 1.4;
    ctx.stroke();
    // collar flaps
    for (const sg of [-1, 1]) {
      const m = (pts) => pts.map(([x, y]) => [x * sg, y]);
      poly(m([[1.3, -4.8], [3.6, 0.6], [4.3, 5.6], [8.9, 9.8], [7.7, 3.6], [11.4, -1.8], [6.4, -4.4]]), PAL.magenta);
      poly(m([[3.6, 0.6], [4.3, 5.6], [8.9, 9.8], [6.4, 3.2], [4.9, 0.2]]), PAL.magentaShade);
      ctx.beginPath();
      const a = B(8.2 * sg, 2.6), b = B(10.2 * sg, -1.4);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = PAL.magentaLight;
      ctx.lineWidth = F.lw * 1.2;
      ctx.stroke();
    }
    // brooch: gold shield with a magenta gem
    const shield = (k) => [[0, 1.2 * k], [1.05 * k, 0.8 * k], [1.2 * k, -0.15 * k], [0, -1.65 * k], [-1.2 * k, -0.15 * k], [-1.05 * k, 0.8 * k]]
      .map(([x, y]) => [x, y - 3.0]);
    poly(shield(1), PAL.gold);
    poly(shield(0.66), PAL.gem);
    const g0 = B(-0.35, -2.55);
    ctx.beginPath();
    ctx.ellipse(g0[0], g0[1], s * 0.28, s * 0.16, th - 0.6, 0, TAU);
    ctx.fillStyle = PAL.gemHi;
    ctx.fill();
    ctx.beginPath();
    const d0 = B(0.75, -2.7), d1 = B(0, -3.95);
    ctx.moveTo(d0[0], d0[1]);
    ctx.lineTo(d1[0], d1[1]);
    ctx.strokeStyle = PAL.gemDeep;
    ctx.lineWidth = F.lw;
    ctx.stroke();
  }

  drawRunes(ctx, F) {
    const a = this.spell;
    const c = project(F.pose, 0, 2.5, -8);
    const r = F.s * 13.5;
    const t = F.time;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    for (const [rr, w, al] of [[r, F.s * 1.6, 0.18], [r, F.s * 0.35, 0.9], [r * 0.82, F.s * 0.25, 0.75]]) {
      ctx.beginPath();
      ctx.arc(c[0], c[1], rr, 0, TAU);
      ctx.strokeStyle = `rgba(224, 123, 255, ${al})`;
      ctx.lineWidth = w;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 140, 240, 0.9)';
    ctx.lineWidth = F.s * 0.22;
    const N = 14;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * TAU + t * 0.6;
      const gx = c[0] + Math.cos(ang) * r * 0.91, gy = c[1] + Math.sin(ang) * r * 0.91;
      const k = F.s * 0.6;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(ang + Math.PI / 2);
      ctx.beginPath();
      const g = i % 4;
      if (g === 0) { ctx.moveTo(0, -k); ctx.lineTo(0, k); ctx.moveTo(0, -k * 0.2); ctx.lineTo(k * 0.7, -k); }
      else if (g === 1) { ctx.moveTo(-k * 0.6, k); ctx.lineTo(0, -k); ctx.lineTo(k * 0.6, k); ctx.moveTo(-k * 0.4, 0); ctx.lineTo(k * 0.4, 0); }
      else if (g === 2) { ctx.moveTo(0, -k); ctx.lineTo(0, k); ctx.moveTo(-k * 0.7, -k * 0.4); ctx.lineTo(0, 0); ctx.lineTo(k * 0.7, -k * 0.4); }
      else { ctx.arc(0, 0, k * 0.6, 0, TAU); ctx.moveTo(0, -k); ctx.lineTo(0, k); }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  drawSpellFx(ctx, F) {
    const a = this.spell;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const E of EYES) {
      const x = F.X[E.iris], y = F.Y[E.iris];
      const r = F.s * 2.2 * a;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 120, 240, ${0.75 * a})`);
      g.addColorStop(0.35, `rgba(200, 80, 255, ${0.35 * a})`);
      g.addColorStop(1, 'rgba(120, 40, 200, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // sparkles around the head
    const dt = F.dt;
    const head = project(F.pose, 0, 2, 0);
    if (a > 0.3) {
      const spawn = 60 * dt * a;
      for (let i = 0; i < spawn + Math.random() - 0.5; i++) {
        const ang = Math.random() * TAU, rr = F.s * (8 + Math.random() * 9);
        this.particles.push({
          x: head[0] + Math.cos(ang) * rr, y: head[1] + Math.sin(ang) * rr,
          vx: (Math.random() - 0.5) * F.s * 2, vy: -F.s * (2 + Math.random() * 4),
          life: 0, max: 0.8 + Math.random() * 0.8, size: F.s * (0.25 + Math.random() * 0.45),
        });
      }
    }
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life > p.max) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.sin((p.life / p.max) * Math.PI);
      const sz = p.size * k;
      ctx.fillStyle = `rgba(255, ${160 + (i % 3) * 30}, 255, ${0.9 * k})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - sz * 2);
      ctx.quadraticCurveTo(p.x, p.y, p.x + sz * 2, p.y);
      ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + sz * 2);
      ctx.quadraticCurveTo(p.x, p.y, p.x - sz * 2, p.y);
      ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - sz * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function hexToRgb(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))}, ${Math.round(lerp(A[1], B[1], t))}, ${Math.round(lerp(A[2], B[2], t))})`;
}
