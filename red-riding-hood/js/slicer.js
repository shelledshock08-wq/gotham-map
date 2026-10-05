// Blade Mode cutting: bakes an animated (skinned) enemy into a static mesh,
// splits triangles by a plane, caps the cut and turns the halves into
// physics pieces that can be cut again.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3();

// world-space triangles of every skinned/static mesh under `root`
export function bakeObject(root) {
  root.updateMatrixWorld(true);
  const pos = [];
  root.traverse((m) => {
    if (!m.isMesh || !m.visible) return;
    const g = m.geometry;
    const p = g.attributes.position;
    const idx = g.index ? g.index.array : null;
    const n = idx ? idx.length : p.count;
    const cache = new Float32Array(p.count * 3);
    const done = new Uint8Array(p.count);
    for (let k = 0; k < n; k++) {
      const i = idx ? idx[k] : k;
      if (!done[i]) {
        if (m.isSkinnedMesh) m.getVertexPosition(i, _v); else _v.fromBufferAttribute(p, i);
        _v.applyMatrix4(m.matrixWorld);
        cache[i * 3] = _v.x; cache[i * 3 + 1] = _v.y; cache[i * 3 + 2] = _v.z;
        done[i] = 1;
      }
      pos.push(cache[i * 3], cache[i * 3 + 1], cache[i * 3 + 2]);
    }
  });
  const tris = new Float32Array(pos);
  return { tris, mats: new Uint8Array(tris.length / 9) };
}

// split triangles (world space) by plane; returns two sides and cap triangles
export function slice({ tris, mats }, plane) {
  const A = [], Am = [], B = [], Bm = [], segs = [];
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const d = [0, 0, 0];
  const lerp = (a, b, da, db) => a.clone().lerp(b, da / (da - db));
  const push = (arr, marr, m, ...pts) => { for (const q of pts) arr.push(q.x, q.y, q.z); marr.push(m); };
  for (let t = 0; t < tris.length / 9; t++) {
    for (let k = 0; k < 3; k++) {
      p[k].fromArray(tris, t * 9 + k * 3);
      d[k] = plane.distanceToPoint(p[k]);
    }
    const pos = d.map((x) => x >= 0);
    const m = mats[t];
    if (pos[0] && pos[1] && pos[2]) { push(A, Am, m, p[0], p[1], p[2]); continue; }
    if (!pos[0] && !pos[1] && !pos[2]) { push(B, Bm, m, p[0], p[1], p[2]); continue; }
    // the vertex alone on its side
    let k = 0;
    if (pos[0] === pos[1]) k = 2; else if (pos[0] === pos[2]) k = 1; else k = 0;
    const i = (k + 1) % 3, j = (k + 2) % 3;
    const qi = lerp(p[k], p[i], d[k], d[i]);
    const qj = lerp(p[k], p[j], d[k], d[j]);
    const [lone, loneM, rest, restM] = pos[k] ? [A, Am, B, Bm] : [B, Bm, A, Am];
    push(lone, loneM, m, p[k], qi, qj);
    push(rest, restM, m, qi, p[i], p[j]);
    push(rest, restM, m, qi, p[j], qj);
    segs.push(qi, qj);
  }
  // cap: chain the cut segments into loops and fan-fill them
  const capA = [], capB = [];
  const key = (q) => `${Math.round(q.x * 2e3)},${Math.round(q.y * 2e3)},${Math.round(q.z * 2e3)}`;
  const adj = new Map();
  for (let s = 0; s < segs.length; s += 2) {
    const a = segs[s], b = segs[s + 1];
    const ka = key(a), kb = key(b);
    if (ka === kb) continue;
    if (!adj.has(ka)) adj.set(ka, { p: a, n: [] });
    if (!adj.has(kb)) adj.set(kb, { p: b, n: [] });
    adj.get(ka).n.push(kb); adj.get(kb).n.push(ka);
  }
  const used = new Set();
  for (const [start] of adj) {
    if (used.has(start)) continue;
    const loop = [];
    let cur = start, prev = null;
    while (cur && !used.has(cur)) {
      used.add(cur);
      const node = adj.get(cur);
      loop.push(node.p);
      const nxt = node.n.find((x) => x !== prev && !used.has(x));
      prev = cur; cur = nxt;
    }
    if (loop.length < 3) continue;
    const c = new THREE.Vector3();
    loop.forEach((q) => c.add(q));
    c.divideScalar(loop.length);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const nrm = new THREE.Vector3().subVectors(a, c).cross(new THREE.Vector3().subVectors(b, c));
      // piece A's cap faces -normal, piece B's faces +normal
      if (nrm.dot(plane.normal) > 0) { push(capA, [], 1, c, b, a); push(capB, [], 1, c, a, b); } else { push(capA, [], 1, c, a, b); push(capB, [], 1, c, b, a); }
    }
  }
  const pack = (arr, marr, cap) => {
    const tris2 = new Float32Array(arr.length + cap.length);
    tris2.set(arr); tris2.set(cap, arr.length);
    const mats2 = new Uint8Array(tris2.length / 9);
    mats2.set(marr);
    mats2.fill(1, marr.length);
    return { tris: tris2, mats: mats2 };
  };
  return {
    a: pack(A, Am, capA), b: pack(B, Bm, capB),
    cutCenter: segs.length ? segs.reduce((s, q) => s.add(q), new THREE.Vector3()).divideScalar(segs.length) : null,
  };
}

function buildMesh(part, materials) {
  // centre on the centroid so the piece spins about itself
  const { tris, mats } = part;
  const c = new THREE.Vector3();
  const n = tris.length / 3;
  for (let i = 0; i < n; i++) c.x += tris[i * 3], c.y += tris[i * 3 + 1], c.z += tris[i * 3 + 2];
  c.divideScalar(n);
  const local = new Float32Array(tris.length);
  for (let i = 0; i < n; i++) {
    local[i * 3] = tris[i * 3] - c.x; local[i * 3 + 1] = tris[i * 3 + 1] - c.y; local[i * 3 + 2] = tris[i * 3 + 2] - c.z;
  }
  // skin triangles first (smooth normals), cap triangles after (flat)
  const skinIdx = [], capIdx = [];
  for (let t = 0; t < mats.length; t++) (mats[t] ? capIdx : skinIdx).push(t);
  const take = (list) => {
    const a = new Float32Array(list.length * 9);
    list.forEach((t, i) => a.set(local.subarray(t * 9, t * 9 + 9), i * 9));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return g;
  };
  let skin = mergeVertices(take(skinIdx), 1e-4);
  skin.computeVertexNormals();
  skin = skin.toNonIndexed();
  const cap = take(capIdx);
  cap.computeVertexNormals();
  const g = new THREE.BufferGeometry();
  const sp = skin.attributes.position.array, cp = cap.attributes.position.array;
  const P = new Float32Array(sp.length + cp.length); P.set(sp); P.set(cp, sp.length);
  const N = new Float32Array(sp.length + cp.length); N.set(skin.attributes.normal.array); N.set(cap.attributes.normal.array, sp.length);
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.addGroup(0, sp.length / 3, 0);
  g.addGroup(sp.length / 3, cp.length / 3, 1);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, materials);
  mesh.position.copy(c);
  mesh.castShadow = true; mesh.receiveShadow = true;
  // keep the local triangle soup + per-triangle material for re-cutting
  const order = new Uint8Array(skinIdx.length + capIdx.length);
  order.fill(1, skinIdx.length);
  mesh.userData.local = { tris: P, mats: order };
  return mesh;
}

export class Pieces {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.list = [];
    this.capMat = new THREE.MeshStandardMaterial({ color: 0x6e0b0b, roughness: 0.35, metalness: 0.0, emissive: 0x200000 });
  }

  // cut a baked object with a plane; impulse pushes the halves apart
  spawnFromCut(baked, plane, material, { vel = new THREE.Vector3(), power = 3 } = {}) {
    const r = slice(baked, plane);
    const out = [];
    for (const [part, sign] of [[r.a, 1], [r.b, -1]]) {
      if (part.tris.length < 27) continue;
      const mesh = buildMesh(part, [material, this.capMat]);
      this.scene.add(mesh);
      const v = vel.clone().addScaledVector(plane.normal, sign * power * (0.6 + Math.random() * 0.6));
      v.y += 1.5 + Math.random() * 2;
      const piece = {
        mesh, material, vel: v,
        ang: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
        age: 0, sleep: false, bleed: 1.2,
      };
      this.list.push(piece);
      out.push(piece);
    }
    if (r.cutCenter) this.fx.bloodBurst(r.cutCenter, plane.normal, 40);
    // cap the number of pieces lying around
    while (this.list.length > 90) this.remove(this.list[0]);
    return out;
  }

  // world-space triangles of an existing piece
  bake(piece) {
    const { tris, mats } = piece.mesh.userData.local;
    piece.mesh.updateMatrixWorld(true);
    const w = new Float32Array(tris.length);
    for (let i = 0; i < tris.length / 3; i++) {
      _v.fromArray(tris, i * 3).applyMatrix4(piece.mesh.matrixWorld).toArray(w, i * 3);
    }
    return { tris: w, mats };
  }

  cutPiece(piece, plane) {
    piece.mesh.updateMatrixWorld(true);
    const sphere = piece.mesh.geometry.boundingSphere.clone().applyMatrix4(piece.mesh.matrixWorld);
    if (Math.abs(plane.distanceToPoint(sphere.center)) > sphere.radius || sphere.radius < 0.06) return false;
    const baked = this.bake(piece);
    this.remove(piece);
    this.spawnFromCut(baked, plane, piece.material, { vel: piece.vel.clone().multiplyScalar(0.3), power: 2 });
    return true;
  }

  remove(piece) {
    this.scene.remove(piece.mesh);
    piece.mesh.geometry.dispose();
    this.list = this.list.filter((p) => p !== piece);
  }

  update(dt, groundAt) {
    const box = new THREE.Box3();
    for (const p of this.list) {
      p.age += dt;
      if (p.bleed > 0 && !p.sleep) {
        p.bleed -= dt;
        if (Math.random() < 0.4) this.fx.drip(p.mesh.position);
      }
      if (p.sleep) continue;
      p.vel.y -= 20 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.ang.x * dt; p.mesh.rotation.y += p.ang.y * dt; p.mesh.rotation.z += p.ang.z * dt;
      box.setFromObject(p.mesh);
      const floor = groundAt(p.mesh.position.x, p.mesh.position.z, box.min.y + 0.3);
      if (box.min.y < floor) {
        p.mesh.position.y += floor - box.min.y;
        if (p.vel.y < -2) this.fx.splat(p.mesh.position.clone().setY(floor), 0.25 + Math.random() * 0.3);
        p.vel.y = Math.abs(p.vel.y) * 0.22;
        p.vel.x *= 0.55; p.vel.z *= 0.55;
        p.ang.multiplyScalar(0.5);
        if (p.vel.lengthSq() < 0.3 && p.ang.lengthSq() < 0.5) { p.sleep = true; this.fx.pool(p.mesh.position.clone().setY(floor + 0.003), 0.35); }
      }
    }
  }

  near(pos, r) {
    return this.list.filter((p) => p.mesh.position.distanceTo(pos) < r);
  }
}
