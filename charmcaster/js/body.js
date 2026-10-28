// Charmcaster's outfit on the whole body, driven by the 33 pose landmarks:
// shader regions (sleeves, fingerless gloves, leggings, boots), the pointed
// jacket flaps at the hips, heart emblems on the arms and hips, and the view
// from behind (her long hair down your back) when you turn around.

import { projectEllipsoid, clamp, smoothstep } from './geom.js';
import { PAL, Strand } from './charm.js';
import { POSE as P } from './tracker.js';

const TAU = Math.PI * 2;
const FAR = [-1e5, -1e5, -1e5, -1e5];

const norm = (x, y) => {
  const d = Math.hypot(x, y) || 1;
  return [x / d, y / d];
};

// Persistent smoothing for the body frame: hysteresis on whether the shoulders/hips
// count as "in view" (so the costume doesn't blink at the threshold) and an EMA on the
// overall scale/hem (so the capsule radii don't pulse frame to frame).
const BF = { present: false, hipsOn: false, scale: 0, hemLen: 0 };

// Pose landmarks in screen pixels plus a body frame (up axis, size). Null when the
// shoulders aren't in view.
export function bodyFrame(pose, W, H, mirror) {
  if (!pose) { BF.present = false; BF.scale = 0; return null; }
  const lm = pose.lm, V = pose.vis;
  const shoVis = Math.min(V[P.L_SHOULDER], V[P.R_SHOULDER]);
  BF.present = BF.present ? shoVis > 0.3 : shoVis > 0.45;
  if (!BF.present) { BF.scale = 0; return null; }
  const X = new Float32Array(33), Y = new Float32Array(33);
  for (let i = 0; i < 33; i++) {
    X[i] = (mirror ? 1 - lm[i * 3] : lm[i * 3]) * W;
    Y[i] = lm[i * 3 + 1] * H;
  }
  const mid = (a, b) => [(X[a] + X[b]) / 2, (Y[a] + Y[b]) / 2];
  const dist = (a, b) => Math.hypot(X[a] - X[b], Y[a] - Y[b]);
  const sm = mid(P.L_SHOULDER, P.R_SHOULDER), hm = mid(P.L_HIP, P.R_HIP);
  const shoulderW = dist(P.L_SHOULDER, P.R_SHOULDER);
  const hipVis = Math.min(V[P.L_HIP], V[P.R_HIP]);
  BF.hipsOn = BF.hipsOn ? hipVis > 0.3 : hipVis > 0.5;
  const hipsOk = BF.hipsOn;
  let up;
  if (hipsOk) {
    up = norm(sm[0] - hm[0], sm[1] - hm[1]);
  } else {
    // perpendicular to the shoulders, on the side the head is on
    const d = norm(X[P.R_SHOULDER] - X[P.L_SHOULDER], Y[P.R_SHOULDER] - Y[P.L_SHOULDER]);
    up = [d[1], -d[0]];
    if (up[0] * (X[P.NOSE] - sm[0]) + up[1] * (Y[P.NOSE] - sm[1]) < 0) up = [-up[0], -up[1]];
  }
  const torso = hipsOk ? Math.hypot(sm[0] - hm[0], sm[1] - hm[1]) : shoulderW * 1.45;
  const scale = Math.max(shoulderW, torso * 0.62);
  let thigh = 0, nT = 0;
  if (hipsOk && V[P.L_KNEE] > 0.4) { thigh += dist(P.L_HIP, P.L_KNEE); nT++; }
  if (hipsOk && V[P.R_KNEE] > 0.4) { thigh += dist(P.R_HIP, P.R_KNEE); nT++; }
  const hemLen = nT ? (thigh / nT) * 0.42 : torso * 0.3;
  if (BF.scale === 0) { BF.scale = scale; BF.hemLen = hemLen; }
  else { BF.scale += (scale - BF.scale) * 0.3; BF.hemLen += (hemLen - BF.hemLen) * 0.3; }
  return {
    X, Y, V, sm, hm, hipsOk, up, down: [-up[0], -up[1]], shoulderW, torso, scale: BF.scale, hemLen: BF.hemLen,
    front: pose.front, W, H,
    neck: [sm[0] + up[0] * scale * 0.15, sm[1] + up[1] * scale * 0.15],
    roll: clamp(Math.atan2(up[0], -up[1]), -0.6, 0.6),
  };
}

export class Body {
  constructor() {
    // her hair seen from behind, down to the small of the back
    this.backHair = new Strand(
      [[0, 1, 2], [0.6, -9, 2], [1.0, -19, 2], [1.2, -29, 2], [1.2, -38, 2], [1.0, -46, 2]],
      [8.5, 9.5, 10, 9.5, 8.5, 6.5], { stiff: 0.14, tips: 5, purpleAt: 0.7 });
  }

  reset() {
    this.backHair.reset();
  }

  // Limb capsules + hem line for the toon shader (screen px).
  uniforms(B) {
    if (!B) return null;
    const { X, Y, V, scale: s } = B;
    const ok = (...ids) => ids.every((i) => V[i] > 0.3);
    const seg = (a, b) => (ok(a, b) ? [X[a], Y[a], X[b], Y[b]] : FAR);
    const hand = (w, i, p) => {
      if (!ok(w, i)) return FAR;
      const tx = (X[i] + X[p]) / 2, ty = (Y[i] + Y[p]) / 2;
      return [X[w], Y[w], X[w] + (tx - X[w]) * 1.15, Y[w] + (ty - Y[w]) * 1.15];
    };
    const arms = [
      seg(P.L_SHOULDER, P.L_ELBOW), seg(P.L_ELBOW, P.L_WRIST), hand(P.L_WRIST, P.L_INDEX, P.L_PINKY),
      seg(P.R_SHOULDER, P.R_ELBOW), seg(P.R_ELBOW, P.R_WRIST), hand(P.R_WRIST, P.R_INDEX, P.R_PINKY),
    ].flat();
    const legs = (B.hipsOk ? [
      seg(P.L_HIP, P.L_KNEE), seg(P.L_KNEE, P.L_ANKLE), seg(P.L_ANKLE, P.L_FOOT),
      seg(P.R_HIP, P.R_KNEE), seg(P.R_KNEE, P.R_ANKLE), seg(P.R_ANKLE, P.R_FOOT),
    ] : [FAR, FAR, FAR, FAR, FAR, FAR]).flat();
    const hem = B.hipsOk
      ? [B.hm[0] + B.down[0] * B.hemLen * 0.3, B.hm[1] + B.down[1] * B.hemLen * 0.3, B.down[0], B.down[1]]
      : [0, 1e6, 0, 1];
    return {
      arms, legs, hem,
      armR: [s * 0.17, s * 0.14, s * 0.12],
      legR: [s * 0.21, s * 0.15, s * 0.11],
    };
  }

  // Black centre panel down the front of the jacket (shader quad), fading out as you turn away.
  panel(B) {
    const top = [B.sm[0] + B.up[0] * B.scale * 0.06, B.sm[1] + B.up[1] * B.scale * 0.06];
    const L = B.hipsOk ? B.torso + B.hemLen * 0.9 : B.torso * 1.2;
    const bot = [B.sm[0] + B.down[0] * L, B.sm[1] + B.down[1] * L];
    return [top[0], top[1], bot[0], bot[1], B.scale * 0.1, B.scale * 0.2, smoothstep(0.15, 0.45, B.front)];
  }

  // The body is now a cartoon of your own clothes; only the bare-torso abs are drawn on top.
  drawCostume(ctx, B, lw, bare) {
    if (bare) this.drawAbs(ctx, B, lw);
  }

  // Cartoon chest + ab definition for a bare torso (drawn only when the shirt is off,
  // so the toon body still reads as drawn rather than photographed). Bounded between
  // the collar and the navel, never lower.
  drawAbs(ctx, B, lw) {
    const down = B.down;
    let across = [-down[1], down[0]];
    if (across[0] < 0) across = [-across[0], -across[1]];
    const L = B.hipsOk ? B.torso : B.scale * 1.25;
    const hw = B.scale * 0.34;
    const pt = (u, t) => [
      B.sm[0] + across[0] * u * hw + down[0] * t * L,
      B.sm[1] + across[1] * u * hw + down[1] * t * L,
    ];
    const curve = (a, b, c, w) => {
      const A = pt(a[0], a[1]), M = pt(b[0], b[1]), C = pt(c[0], c[1]);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]);
      ctx.quadraticCurveTo(M[0], M[1], C[0], C[1]);
      ctx.stroke();
    };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = PAL.ink;
    curve([-0.34, 0.33], [-0.20, 0.44], [-0.03, 0.43], lw);  // left pec
    curve([0.34, 0.33], [0.20, 0.44], [0.03, 0.43], lw);     // right pec
    curve([0, 0.34], [0, 0.53], [0, 0.72], lw * 1.1);        // centre line to the navel
    for (const t of [0.50, 0.59, 0.68]) {                    // three rows of abs
      curve([-0.22, t - 0.01], [-0.12, t + 0.02], [-0.03, t], lw * 0.9);
      curve([0.22, t - 0.01], [0.12, t + 0.02], [0.03, t], lw * 0.9);
    }
    ctx.restore();
  }

  // Seen from behind: her long hair over your back.
  drawBackView(ctx, B, dt, lw) {
    const a = smoothstep(-0.12, -0.42, B.front);
    if (a < 0.02) return;
    const { X, Y, V } = B;
    let hx, hy, earD;
    if (V[P.L_EAR] > 0.3 && V[P.R_EAR] > 0.3) {
      hx = (X[P.L_EAR] + X[P.R_EAR]) / 2;
      hy = (Y[P.L_EAR] + Y[P.R_EAR]) / 2;
      earD = Math.max(Math.hypot(X[P.L_EAR] - X[P.R_EAR], Y[P.L_EAR] - Y[P.R_EAR]), B.scale * 0.3);
    } else {
      hx = B.sm[0] + B.up[0] * B.scale * 0.62;
      hy = B.sm[1] + B.up[1] * B.scale * 0.62;
      earD = B.scale * 0.38;
    }
    const phi = Math.atan2(B.up[0], -B.up[1]);
    const co = Math.cos(phi), si = Math.sin(phi);
    const pose = { s: earD / 14.5, R: [co, -si, 0, si, co, 0, 0, 0, 1], t: [hx, hy, 0] };
    const F = { pose, s: pose.s, dt, lw };
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineJoin = 'round';
    // the back of her head: same hair volume as the front view
    const e = projectEllipsoid(pose, 0, 3.3, -3.5, 9.8, 11.0, 10.2);
    this.backHair.step(F);
    this.backHair.draw(ctx, F);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.rx, e.ry, e.angle, 0, TAU);
    ctx.fillStyle = PAL.hairShade;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(e.x - e.rx * 0.08, e.y - e.ry * 0.06, e.rx * 0.94, e.ry * 0.95, e.angle, 0, TAU);
    ctx.fillStyle = PAL.hair;
    ctx.fill();
    ctx.strokeStyle = PAL.hairDeep;
    ctx.lineWidth = lw * 0.6;
    for (const k of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(e.x + e.rx * k * 0.3, e.y - e.ry * 0.9);
      ctx.quadraticCurveTo(e.x + e.rx * k * 0.9, e.y, e.x + e.rx * k * 0.7, e.y + e.ry);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.rx, e.ry, e.angle, Math.PI * 0.92, Math.PI * 2.08);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();
  }
}
