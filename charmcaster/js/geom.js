// Small math kit: One Euro smoothing, a similarity fit (Horn's quaternion method)
// that tracks the head pose, and helpers to project head-space points to the screen.

const TAU = Math.PI * 2;

function alpha(dt, cutoff) {
  const tau = 1 / (TAU * cutoff);
  return 1 / (1 + tau / dt);
}

// One Euro filter over a flat array of values (Casiez et al. 2012).
// Removes jitter when still, follows fast moves with little lag.
export class OneEuroArray {
  constructor(n, minCutoff = 2.5, beta = 30, dCutoff = 1.0) {
    this.n = n;
    this.x = new Float32Array(n);
    this.dx = new Float32Array(n);
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.ready = false;
  }
  reset() { this.ready = false; }
  apply(src, dt) {
    const { x, dx, n } = this;
    if (!this.ready || !(dt > 0)) {
      x.set(src.subarray ? src.subarray(0, n) : src);
      dx.fill(0);
      this.ready = true;
      return x;
    }
    const ad = alpha(dt, this.dCutoff);
    for (let i = 0; i < n; i++) {
      const d = (src[i] - x[i]) / dt;
      const e = dx[i] + ad * (d - dx[i]);
      dx[i] = e;
      const a = alpha(dt, this.minCutoff + this.beta * Math.abs(e));
      x[i] += a * (src[i] - x[i]);
    }
    return x;
  }
}

// Largest eigenvector of a symmetric 4x4 matrix (row-major), cyclic Jacobi.
function maxEigenvector4(m) {
  const a = Float64Array.from(m);
  const v = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 4; q++) off += a[p * 4 + q] * a[p * 4 + q];
    if (off < 1e-20) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 4; q++) {
        const apq = a[p * 4 + q];
        if (Math.abs(apq) < 1e-30) continue;
        const theta = (a[q * 4 + q] - a[p * 4 + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k * 4 + p], akq = a[k * 4 + q];
          a[k * 4 + p] = c * akp - s * akq;
          a[k * 4 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p * 4 + k], aqk = a[q * 4 + k];
          a[p * 4 + k] = c * apk - s * aqk;
          a[q * 4 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = v[k * 4 + p], vkq = v[k * 4 + q];
          v[k * 4 + p] = c * vkp - s * vkq;
          v[k * 4 + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i * 5] > a[best * 5]) best = i;
  return [v[best], v[4 + best], v[8 + best], v[12 + best]];
}

// Finds s, R, t with Q ≈ s·R·P + t (least squares, weighted).
// P, Q: Float64Array of xyz triples; W: weights. R is row-major 3x3.
export function fitSimilarity(P, Q, W) {
  const n = W.length;
  let sw = 0, px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
  for (let i = 0; i < n; i++) {
    const w = W[i];
    sw += w;
    px += w * P[i * 3]; py += w * P[i * 3 + 1]; pz += w * P[i * 3 + 2];
    qx += w * Q[i * 3]; qy += w * Q[i * 3 + 1]; qz += w * Q[i * 3 + 2];
  }
  px /= sw; py /= sw; pz /= sw; qx /= sw; qy /= sw; qz /= sw;
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0, pp = 0;
  for (let i = 0; i < n; i++) {
    const w = W[i];
    const ax = P[i * 3] - px, ay = P[i * 3 + 1] - py, az = P[i * 3 + 2] - pz;
    const bx = Q[i * 3] - qx, by = Q[i * 3 + 1] - qy, bz = Q[i * 3 + 2] - qz;
    Sxx += w * ax * bx; Sxy += w * ax * by; Sxz += w * ax * bz;
    Syx += w * ay * bx; Syy += w * ay * by; Syz += w * ay * bz;
    Szx += w * az * bx; Szy += w * az * by; Szz += w * az * bz;
    pp += w * (ax * ax + ay * ay + az * az);
  }
  const q = maxEigenvector4([
    Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx,
    Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz,
    Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy,
    Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz,
  ]);
  const [w0, x0, y0, z0] = q;
  const R = new Float64Array([
    w0 * w0 + x0 * x0 - y0 * y0 - z0 * z0, 2 * (x0 * y0 - w0 * z0), 2 * (x0 * z0 + w0 * y0),
    2 * (x0 * y0 + w0 * z0), w0 * w0 - x0 * x0 + y0 * y0 - z0 * z0, 2 * (y0 * z0 - w0 * x0),
    2 * (x0 * z0 - w0 * y0), 2 * (y0 * z0 + w0 * x0), w0 * w0 - x0 * x0 - y0 * y0 + z0 * z0,
  ]);
  // scale = Σ w·(Q'·R P') / Σ w·|P'|²
  let num = 0;
  for (let i = 0; i < n; i++) {
    const w = W[i];
    const ax = P[i * 3] - px, ay = P[i * 3 + 1] - py, az = P[i * 3 + 2] - pz;
    const rx = R[0] * ax + R[1] * ay + R[2] * az;
    const ry = R[3] * ax + R[4] * ay + R[5] * az;
    const rz = R[6] * ax + R[7] * ay + R[8] * az;
    num += w * ((Q[i * 3] - qx) * rx + (Q[i * 3 + 1] - qy) * ry + (Q[i * 3 + 2] - qz) * rz);
  }
  const s = num / pp;
  const t = [
    qx - s * (R[0] * px + R[1] * py + R[2] * pz),
    qy - s * (R[3] * px + R[4] * py + R[5] * pz),
    qz - s * (R[6] * px + R[7] * py + R[8] * pz),
  ];
  return { s, R, t };
}

// Head space ("D-space"): centimetres, +x = viewer's right, +y = up, +z = toward the viewer.
// Screen space: pixels, +x right, +y down, +z away from the camera.
export function project(pose, dx, dy, dz, out = [0, 0, 0]) {
  const { s, R, t } = pose;
  const px = dx, py = -dy, pz = -dz;
  out[0] = s * (R[0] * px + R[1] * py + R[2] * pz) + t[0];
  out[1] = s * (R[3] * px + R[4] * py + R[5] * pz) + t[1];
  out[2] = s * (R[6] * px + R[7] * py + R[8] * pz) + t[2];
  return out;
}

// Direction of a head-space vector on screen (no translation).
export function rotate(pose, dx, dy, dz) {
  const { R } = pose;
  const px = dx, py = -dy, pz = -dz;
  return [
    R[0] * px + R[1] * py + R[2] * pz,
    R[3] * px + R[4] * py + R[5] * pz,
    R[6] * px + R[7] * py + R[8] * pz,
  ];
}

// Screen ellipse of an axis-aligned head-space ellipsoid (orthographic view).
export function projectEllipsoid(pose, cx, cy, cz, ra, rb, rc) {
  const c = project(pose, cx, cy, cz);
  const { s, R } = pose;
  // columns of s·R·diag(ra, -rb, -rc), first two rows only
  const m00 = s * R[0] * ra, m01 = -s * R[1] * rb, m02 = -s * R[2] * rc;
  const m10 = s * R[3] * ra, m11 = -s * R[4] * rb, m12 = -s * R[5] * rc;
  const A = m00 * m00 + m01 * m01 + m02 * m02;
  const B = m00 * m10 + m01 * m11 + m02 * m12;
  const D = m10 * m10 + m11 * m11 + m12 * m12;
  const mid = (A + D) / 2;
  const dif = Math.sqrt(((A - D) / 2) ** 2 + B * B);
  return {
    x: c[0], y: c[1],
    rx: Math.sqrt(Math.max(mid + dif, 1e-6)),
    ry: Math.sqrt(Math.max(mid - dif, 1e-6)),
    angle: 0.5 * Math.atan2(2 * B, A - D),
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
