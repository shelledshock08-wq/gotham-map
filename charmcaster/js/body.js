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

// A smooth tapered limb through a joint chain (wide -> narrow), filled + inked, with an
// optional rounded hand at the last joint. No balloon end-caps.
function taperedLimb(ctx, pts, radii, col, lw, cap) {
  const n = pts.length;
  const perp = [];
  for (let i = 0; i < n; i++) {
    let dx = 0, dy = 0;
    if (i > 0) { dx += pts[i][0] - pts[i - 1][0]; dy += pts[i][1] - pts[i - 1][1]; }
    if (i < n - 1) { dx += pts[i + 1][0] - pts[i][0]; dy += pts[i + 1][1] - pts[i][1]; }
    const d = Math.hypot(dx, dy) || 1;
    perp.push([-dy / d, dx / d]);
  }
  const outline = [];
  for (let i = 0; i < n; i++) outline.push([pts[i][0] + perp[i][0] * radii[i], pts[i][1] + perp[i][1] * radii[i]]);
  for (let i = n - 1; i >= 0; i--) outline.push([pts[i][0] - perp[i][0] * radii[i], pts[i][1] - perp[i][1] * radii[i]]);
  smoothClosed(ctx, outline);
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = lw; ctx.stroke();
  if (cap) {
    ctx.beginPath();
    ctx.arc(pts[n - 1][0], pts[n - 1][1], radii[n - 1] * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = lw; ctx.stroke();
  }
}

// Closed curve through control points (quadratic through edge midpoints).
function smoothClosed(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  const m0 = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const cur = pts[i], nxt = pts[(i + 1) % n];
    ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2);
  }
  ctx.closePath();
}

// Persistent smoothing for the body frame: hysteresis on whether the shoulders/hips
// count as "in view" (so the costume doesn't blink at the threshold) and an EMA on the
// overall scale/hem (so the capsule radii don't pulse frame to frame).
const BF = { present: false, hipsOn: false, scale: 0, hemLen: 0 };

// Pose landmarks in screen pixels plus a body frame (up axis, size). Null when the
// shoulders aren't in view.
export function bodyFrame(pose, W, H, mirror) {
  if (!pose) { BF.present = false; BF.scale = 0; BF.sinit = false; return null; }
  const lm = pose.lm, V = pose.vis;
  const shoVis = Math.min(V[P.L_SHOULDER], V[P.R_SHOULDER]);
  BF.present = BF.present ? shoVis > 0.3 : shoVis > 0.45;
  if (!BF.present) { BF.scale = 0; BF.sinit = false; return null; }
  const X = new Float32Array(33), Y = new Float32Array(33);
  for (let i = 0; i < 33; i++) {
    X[i] = (mirror ? 1 - lm[i * 3] : lm[i * 3]) * W;
    Y[i] = lm[i * 3 + 1] * H;
  }
  // Per-frame smoothing of every joint for a fluid body that never jitters, and HOLDS its last
  // good position through a brief tracking wobble instead of popping or vanishing.
  if (!BF.sx) { BF.sx = new Float32Array(33); BF.sy = new Float32Array(33); }
  for (let i = 0; i < 33; i++) {
    if (!BF.sinit) { BF.sx[i] = X[i]; BF.sy[i] = Y[i]; continue; }
    const vis = V[i];
    const k = vis > 0.5 ? 0.45 : vis > 0.2 ? 0.18 : 0.0; // follow when confident, hold when not
    BF.sx[i] += (X[i] - BF.sx[i]) * k;
    BF.sy[i] += (Y[i] - BF.sy[i]) * k;
  }
  BF.sinit = true;
  for (let i = 0; i < 33; i++) { X[i] = BF.sx[i]; Y[i] = BF.sy[i]; }
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

  // A drawn, feminine body rigged to the 33 pose joints: hourglass torso with an implied
  // bust, slim arms and hands. The SHAPE comes from the skeleton (robust to lighting); the
  // colour is sampled from the already-cartoonised frame via sample(x,y) -> [r,g,b], so it
  // keeps your own clothes. Legs are left to the camera (your own), per request.
  drawFigure(ctx, B, sample, lw) {
    const { X, Y, V, sm, hm, shoulderW } = B;
    const down = B.down;
    let across = [-down[1], down[0]];
    if (across[0] * (X[P.L_SHOULDER] - X[P.R_SHOULDER]) + across[1] * (Y[P.L_SHOULDER] - Y[P.R_SHOULDER]) < 0) {
      across = [-across[0], -across[1]];
    }
    const L = Math.max(Math.hypot(sm[0] - hm[0], sm[1] - hm[1]), shoulderW * 0.9);
    const hipW = Math.max(Math.hypot(X[P.L_HIP] - X[P.R_HIP], Y[P.L_HIP] - Y[P.R_HIP]), shoulderW * 0.55);
    const back = B.front < -0.1; // facing away from the camera
    const Wsh = shoulderW * 0.43;   // shoulders (narrow = feminine)
    const Wb = shoulderW * 0.51;    // bust (bulges past the shoulders)
    const Wbust = back ? Wsh * 1.04 : Wb; // no bust bulge in the outline from behind
    const Ww = shoulderW * 0.22;    // waist (strong hourglass pinch)
    const Wh = Math.max(hipW * 0.64, shoulderW * 0.53); // hips
    const pt = (u, t) => [sm[0] + across[0] * u + down[0] * t * L, sm[1] + across[1] * u + down[1] * t * L];
    const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    const mul = (c, k) => css([Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]);

    const torsoCol = sample(...pt(0, 0.45));
    const armCss = PAL.skin; // arms/hands are bare skin -> her tone, so they match the head

    // hourglass torso outline, shoulders (t=0) down past the hips (t~1.12)
    const torso = [
      pt(Wsh * 0.78, -0.05), pt(Wsh, 0.04), pt(Wbust, 0.2), pt(Wbust * 0.95, 0.31), pt(Ww * 1.12, 0.45), pt(Ww, 0.57), pt(Wh * 0.82, 0.82), pt(Wh, 0.96), pt(Wh * 0.78, 1.12),
      pt(-Wh * 0.78, 1.12), pt(-Wh, 0.96), pt(-Wh * 0.82, 0.82), pt(-Ww, 0.57), pt(-Ww * 1.12, 0.45), pt(-Wbust * 0.95, 0.31), pt(-Wbust, 0.2), pt(-Wsh, 0.04), pt(-Wsh * 0.78, -0.05),
    ];
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    smoothClosed(ctx, torso);
    ctx.fillStyle = css(torsoCol);
    ctx.fill();
    ctx.save();
    smoothClosed(ctx, torso);
    ctx.clip();
    // soft side shade + two curves under the chest (implied bust)
    const sgnShade = across[0] < 0 ? -1 : 1;
    ctx.fillStyle = mul(torsoCol, 0.82);
    ctx.beginPath();
    const a0 = pt(sgnShade * Wsh * 0.4, -0.1), a1 = pt(sgnShade * Wsh * 1.3, -0.1), a2 = pt(sgnShade * Wh * 1.3, 1.2), a3 = pt(sgnShade * Ww * 0.5, 1.2);
    [a0, a1, a2, a3].forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = 'round';
    if (!back) {
      // implied bust: a darker under-curve + a soft top highlight on each side, plus a faint centre line
      for (const sgn of [-1, 1]) {
        const u0 = pt(sgn * Wb * 0.06, 0.17), u1 = pt(sgn * Wb * 0.82, 0.26), u2 = pt(sgn * Wb * 0.44, 0.41);
        ctx.strokeStyle = mul(torsoCol, 0.58);
        ctx.lineWidth = lw * 1.9;
        ctx.beginPath(); ctx.moveTo(u0[0], u0[1]); ctx.quadraticCurveTo(u1[0], u1[1], u2[0], u2[1]); ctx.stroke();
        const h0 = pt(sgn * Wb * 0.22, 0.15), h1 = pt(sgn * Wb * 0.62, 0.17), h2 = pt(sgn * Wb * 0.52, 0.23);
        ctx.strokeStyle = mul(torsoCol, 1.2);
        ctx.lineWidth = lw * 1.1;
        ctx.beginPath(); ctx.moveTo(h0[0], h0[1]); ctx.quadraticCurveTo(h1[0], h1[1], h2[0], h2[1]); ctx.stroke();
      }
      const c0 = pt(0, 0.15), c1 = pt(0, 0.33);
      ctx.strokeStyle = mul(torsoCol, 0.66);
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.stroke();
    } else {
      // from behind: spine line + shoulder-blade hints
      const sp0 = pt(0, 0.08), sp1 = pt(0, 0.56);
      ctx.strokeStyle = mul(torsoCol, 0.6);
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath(); ctx.moveTo(sp0[0], sp0[1]); ctx.lineTo(sp1[0], sp1[1]); ctx.stroke();
      for (const sgn of [-1, 1]) {
        const k0 = pt(sgn * Wsh * 0.22, 0.12), k1 = pt(sgn * Wsh * 0.72, 0.2), k2 = pt(sgn * Wsh * 0.5, 0.33);
        ctx.strokeStyle = mul(torsoCol, 0.72);
        ctx.lineWidth = lw * 1.4;
        ctx.beginPath(); ctx.moveTo(k0[0], k0[1]); ctx.quadraticCurveTo(k1[0], k1[1], k2[0], k2[1]); ctx.stroke();
      }
    }
    ctx.restore();
    smoothClosed(ctx, torso);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = lw;
    ctx.stroke();

    // slim tapered arms (shoulder -> elbow -> wrist), connected into the torso
    const s = B.scale;
    for (const [sh, el, wr] of [[P.L_SHOULDER, P.L_ELBOW, P.L_WRIST], [P.R_SHOULDER, P.R_ELBOW, P.R_WRIST]]) {
      if (V[sh] < 0.3 || V[el] < 0.3) continue;
      // root the arm a little inside the torso so it joins cleanly
      const root = [X[sh] + (sm[0] - X[sh]) * 0.22, Y[sh] + (sm[1] - Y[sh]) * 0.22];
      const chain = [root, [X[sh], Y[sh]], [X[el], Y[el]]];
      const radii = [s * 0.12, s * 0.11, s * 0.085];
      if (V[wr] > 0.3) { chain.push([X[wr], Y[wr]]); radii.push(s * 0.058); }
      taperedLimb(ctx, chain, radii, armCss, lw, V[wr] > 0.3);
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
