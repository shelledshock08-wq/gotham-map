// Procedural PBR textures for the test arena, drawn into canvases at load
// (no downloads). Each maker returns { map, normalMap, roughnessMap }.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// tileable value noise, sum of octaves, 0..1
function noise(n, scale, octaves, seed) {
  const r = rng(seed);
  const out = new Float32Array(n * n);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const g = Math.max(2, Math.round(scale * 2 ** o));
    const grid = new Float32Array(g * g).map(() => r());
    for (let y = 0; y < n; y++) {
      const fy = (y / n) * g, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * g, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const a = grid[iy * g + ix], b = grid[iy * g + ((ix + 1) % g)];
        const c = grid[((iy + 1) % g) * g + ix], d = grid[((iy + 1) % g) * g + ((ix + 1) % g)];
        out[y * n + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function toTexture(n, fill, srgb, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const [r, g, b] = fill(i);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

function normalFrom(h, n, strength, repeat) {
  return toTexture(n, (i) => {
    const x = i % n, y = (i / n) | 0;
    const l = h[y * n + ((x - 1 + n) % n)], r = h[y * n + ((x + 1) % n)];
    const u = h[((y - 1 + n) % n) * n + x], d = h[((y + 1) % n) * n + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  }, false, repeat);
}

const clamp = (v) => Math.max(0, Math.min(255, v));

export function concrete(repeat = 6, seed = 11) {
  // one tile = one floor slab: saw-cut joint on the border, sparse hairline
  // cracks, speckle, oil stains; wet areas are glossy
  const n = 512;
  const big = noise(n, 3, 5, seed), fine = noise(n, 64, 2, seed + 1), stain = noise(n, 2, 4, seed + 2);
  const crackN = noise(n, 6, 4, seed + 3), crackMask = noise(n, 2, 2, seed + 4), speck = noise(n, 160, 1, seed + 5);
  const crackAt = (i) => (crackMask[i] > 0.62 ? Math.max(0, 1 - Math.abs(crackN[i] - 0.5) * 140) : 0);
  const joint = (i) => {
    const x = i % n, y = (i / n) | 0;
    return (x < 2 || y < 2) ? 1 : 0;
  };
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = fine[i] * 0.35 + big[i] * 0.2 + speck[i] * 0.25 - crackAt(i) * 0.6 - joint(i) * 1.2;
  return {
    map: toTexture(n, (i) => {
      const v = 62 + big[i] * 26 + fine[i] * 10 + (speck[i] > 0.8 ? 10 : 0) - Math.max(0, stain[i] - 0.6) * 90
        - crackAt(i) * 25 - joint(i) * 30;
      return [clamp(v), clamp(v * 0.99), clamp(v * 0.97)];
    }, true, repeat),
    normalMap: normalFrom(h, n, 2.2, repeat),
    roughnessMap: toTexture(n, (i) => {
      const wet = Math.max(0, 0.4 - stain[i]) * 6;
      const v = clamp((0.86 - Math.min(0.72, wet) + fine[i] * 0.08) * 255);
      return [v, v, v];
    }, false, repeat),
  };
}

export function corrugated(repeat = 1, seed = 21, tint = [58, 64, 70]) {
  // corrugated steel sheet: vertical ribs, rust running down from the top
  // edge and from fixings, light grime
  const n = 512;
  const fine = noise(n, 48, 2, seed + 1), grime = noise(n, 3, 4, seed + 3);
  const colNoise = noise(n, 24, 2, seed + 2); // used per column for streaks
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const x = i % n;
    h[i] = 0.5 + 0.5 * Math.sin((x / n) * Math.PI * 2 * 16) + fine[i] * 0.05;
  }
  const rustAt = (i) => {
    const x = i % n, y = (i / n) | 0;
    const col = colNoise[x]; // first row: 1D noise across x
    const len = 0.15 + col * 0.6;
    const fall = Math.max(0, 1 - (y / n) / len);
    const streak = col > 0.55 ? fall * (col - 0.55) * 3 : 0;
    const fixing = ((y % 128) < 6 && (x % 64) < 6) ? 0.8 : 0;
    return Math.min(1, streak + fixing + Math.max(0, fine[i] - 0.8) * 0.5);
  };
  return {
    map: toTexture(n, (i) => {
      const r = rustAt(i), g = 1 - Math.max(0, grime[i] - 0.5) * 0.5;
      return [clamp((tint[0] * (1 - r) + 96 * r) * g + fine[i] * 8), clamp((tint[1] * (1 - r) + 52 * r) * g + fine[i] * 8),
        clamp((tint[2] * (1 - r) + 32 * r) * g + fine[i] * 8)];
    }, true, repeat),
    normalMap: normalFrom(h, n, 4, repeat),
    roughnessMap: toTexture(n, (i) => {
      const v = clamp((0.5 + rustAt(i) * 0.4 + fine[i] * 0.1) * 255);
      return [v, v, v];
    }, false, repeat),
  };
}

export function wood(repeat = 1, seed = 31) {
  const n = 512;
  const grain = noise(n, 6, 3, seed), fine = noise(n, 64, 2, seed + 1), dirt = noise(n, 3, 4, seed + 2);
  const h = new Float32Array(n * n);
  const planks = 5;
  for (let i = 0; i < n * n; i++) {
    const x = i % n, y = (i / n) | 0;
    const pv = (y / n) * planks, gap = Math.abs(pv - Math.round(pv)) < 0.025 ? 1 : 0;
    h[i] = Math.sin((x / n) * 40 + grain[i] * 12) * 0.25 + fine[i] * 0.3 - gap;
  }
  return {
    map: toTexture(n, (i) => {
      const x = i % n, y = (i / n) | 0;
      const pv = (y / n) * planks, gap = Math.abs(pv - Math.round(pv)) < 0.025 ? 1 : 0;
      const g = 0.5 + 0.5 * Math.sin((x / n) * 40 + grain[i] * 12);
      const d = 1 - Math.max(0, dirt[i] - 0.5) * 0.9 - gap * 0.6;
      return [clamp((120 + g * 40) * d), clamp((88 + g * 28) * d), clamp((58 + g * 16) * d)];
    }, true, repeat),
    normalMap: normalFrom(h, n, 2.5, repeat),
    roughnessMap: toTexture(n, () => [215, 215, 215], false, repeat),
  };
}

export function paintedSteel(color, repeat = 1, seed = 41) {
  const n = 512;
  const chip = noise(n, 28, 3, seed), fine = noise(n, 40, 2, seed + 1), grime = noise(n, 2, 4, seed + 2);
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const x = i % n;
    const rib = Math.abs(((x / n) * 10) % 1 - 0.5) < 0.18 ? 1 : 0;
    h[i] = rib * 0.8 + fine[i] * 0.15 - (chip[i] > 0.74 ? 0.2 : 0);
  }
  return {
    map: toTexture(n, (i) => {
      const chipped = chip[i] > 0.74;
      const g = 1 - Math.max(0, grime[i] - 0.45) * 1.2;
      const c = chipped ? [95, 60, 40] : color;
      return [clamp(c[0] * g + fine[i] * 10), clamp(c[1] * g + fine[i] * 10), clamp(c[2] * g + fine[i] * 10)];
    }, true, repeat),
    normalMap: normalFrom(h, n, 3, repeat),
    roughnessMap: toTexture(n, (i) => {
      const v = clamp((chip[i] > 0.74 ? 0.85 : 0.55 + fine[i] * 0.15) * 255);
      return [v, v, v];
    }, false, repeat),
  };
}
