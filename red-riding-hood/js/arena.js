// PLACEHOLDER test arena: a dockside warehouse at night. Not a story
// location (none is decided yet); it exists to test movement and combat.
import * as THREE from 'three';
import * as T from './textures.js';

export function buildArena(scene, renderer) {
  const colliders = []; // axis-aligned boxes {min, max} in world space
  const group = new THREE.Group();
  scene.add(group);

  scene.background = new THREE.Color(0x0b0e14);
  scene.fog = new THREE.FogExp2(0x0d1118, 0.028);

  const W = 30, D = 26, H = 9; // warehouse interior
  const conc = T.concrete(8);
  const floorMat = new THREE.MeshStandardMaterial({ ...conc, roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, D + 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 8;
  floor.receiveShadow = true;
  conc.map.repeat.set(14, 16); conc.normalMap.repeat.set(14, 16); conc.roughnessMap.repeat.set(14, 16);
  group.add(floor);

  const box = (w, h, d, mat, x, y, z, { collide = true, cast = true, ry = 0 } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    m.castShadow = cast; m.receiveShadow = true;
    group.add(m);
    if (collide) {
      m.updateMatrixWorld();
      colliders.push(new THREE.Box3().setFromObject(m));
    }
    return m;
  };

  // walls: corrugated steel, open bay door on the south (+z) side
  const wallTex = T.corrugated(1, 21);
  const wallMat = (rx, ry) => {
    const t = { map: wallTex.map.clone(), normalMap: wallTex.normalMap.clone(), roughnessMap: wallTex.roughnessMap.clone() };
    for (const k in t) { t[k].repeat.set(rx, ry); t[k].needsUpdate = true; }
    return new THREE.MeshStandardMaterial({ ...t, metalness: 0.6, roughness: 1, side: THREE.DoubleSide });
  };
  box(W, H, 0.2, wallMat(6, 2), 0, 0, -D / 2);
  box(0.2, H, D, wallMat(5, 2), -W / 2, 0, 0);
  box(0.2, H, D, wallMat(5, 2), W / 2, 0, 0);
  box(10, H, 0.2, wallMat(2, 2), -10, 0, D / 2);
  box(10, H, 0.2, wallMat(2, 2), 10, 0, D / 2);
  box(10, 3.2, 0.2, wallMat(2, 0.7), 0, H - 3.2, D / 2, { collide: false });
  // roof with skylight gaps
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9, metalness: 0.4 });
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    box(W, 0.15, D / 5, roofMat, 0, H, i * (D / 5), { collide: false, cast: false });
  }

  // steel columns and roof trusses
  const steel = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.55, metalness: 0.85 });
  for (const x of [-9, 0, 9]) {
    for (const z of [-6, 4]) {
      box(0.35, H, 0.35, steel, x, 0, z);
    }
    box(0.25, 0.5, D, steel, x, H - 0.6, 0, { collide: false });
  }

  // shipping containers
  const containers = [
    { c: [130, 38, 30], x: -10.5, z: -8.5, ry: 0 },
    { c: [34, 70, 110], x: -10.5, z: -8.5, y: 2.6, ry: 0 },
    { c: [44, 92, 64], x: 10, z: -2, ry: Math.PI / 2 },
  ];
  for (const k of containers) {
    const t = T.paintedSteel(k.c, 1, 41 + k.x);
    for (const m of Object.values(t)) m.repeat.set(3, 1);
    const mat = new THREE.MeshStandardMaterial({ ...t, metalness: 0.5, roughness: 1 });
    const len = 6.06, wid = 2.44;
    const b = box(k.ry ? wid : len, 2.6, k.ry ? len : wid, mat, k.x, k.y || 0, k.z);
    b.userData.climb = true;
  }

  // crates and pallets (jumpable)
  const wt = T.wood(1, 31);
  const crateMat = new THREE.MeshStandardMaterial({ ...wt, roughness: 1 });
  const crates = [[-4, 0, -9, 1.1], [-2.8, 0, -9.2, 1.1], [-3.4, 1.1, -9.1, 1.1], [5, 0, 6, 0.9], [6, 0, 6.2, 0.9],
    [3.5, 0, -7, 1.2], [-6, 0, 7, 1.0], [12, 0, 8, 1.2], [12, 1.2, 8, 1.0]];
  for (const [x, y, z, s] of crates) box(s, s, s, crateMat, x, y, z, { ry: 0 });
  const palletMat = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: wt.normalMap, color: 0x9a8a70, roughness: 0.95 });
  for (const [x, z] of [[1, 9], [-1.4, 9.1], [8, -9]]) box(1.2, 0.14, 1.0, palletMat, x, 0, z);

  // oil drums
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.6, metalness: 0.5 });
  for (const [x, z] of [[-12.5, 2], [-12.5, 3], [-13.4, 2.5], [7.5, 9.5]]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 24), drumMat);
    d.position.set(x, 0.45, z); d.castShadow = d.receiveShadow = true; group.add(d);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.3, 0, z - 0.3), new THREE.Vector3(x + 0.3, 0.9, z + 0.3)));
  }

  // outside: quay edge and black water past the bay door
  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 60),
    new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 0.08, metalness: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -1.2, D / 2 + 42); group.add(water);
  const quay = new THREE.Mesh(new THREE.BoxGeometry(200, 1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.9 }));
  quay.position.set(0, -0.6, D / 2 + 12); group.add(quay);
  colliders.push(new THREE.Box3(new THREE.Vector3(-100, -2, D / 2 + 11.7), new THREE.Vector3(100, 3, D / 2 + 12.4)));
  // far shore lights
  const lightsGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 160; i++) pts.push((Math.random() - 0.5) * 220, Math.random() * 6 + 1, D / 2 + 70 + Math.random() * 10);
  lightsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.Points(lightsGeo, new THREE.PointsMaterial({ color: 0xffb46b, size: 0.35, sizeAttenuation: true, fog: false })));

  // lighting: cold moonlight through the door, warm sodium lamps inside
  const hemi = new THREE.HemisphereLight(0x5a6c88, 0x1a1712, 0.35);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9db4ff, 0.9);
  moon.position.set(-8, 14, 22);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
  moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.03;
  scene.add(moon);

  const lampShade = new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd7a0, emissive: 0xffb060, emissiveIntensity: 6 });
  const lamps = [];
  for (const [x, z, shadow] of [[-5, -3, true], [5, 1, true], [0, 8, true], [-9, -9, false], [9, -9, false]]) {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 24, 1, true), lampShade);
    shade.position.set(x, H - 2.2, z); group.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), bulbMat);
    bulb.position.set(x, H - 2.38, z); group.add(bulb);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2, 6), lampShade);
    cable.position.set(x, H - 1.1, z); group.add(cable);
    const s = new THREE.SpotLight(0xffc27a, 140, 22, Math.PI / 3.2, 0.55, 1.6);
    s.position.set(x, H - 2.45, z);
    s.target.position.set(x, 0, z);
    s.castShadow = shadow;
    if (shadow) { s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.03; }
    scene.add(s, s.target);
    lamps.push({ s, bulb, base: 140, flicker: x === 5 });
  }
  // red emergency light over the bay door
  const red = new THREE.PointLight(0xff2a1a, 6, 10, 2);
  red.position.set(0, H - 3.6, D / 2 - 0.4); scene.add(red);
  const redBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshStandardMaterial({ emissive: 0xff2a1a, emissiveIntensity: 8 }));
  redBulb.position.copy(red.position); group.add(redBulb);

  // drifting dust in the lamp light
  const dustN = 900;
  const dustGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dp[i * 3] = (Math.random() - 0.5) * W; dp[i * 3 + 1] = Math.random() * 7; dp[i * 3 + 2] = (Math.random() - 0.5) * D; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe0b0, size: 0.02, transparent: true, opacity: 0.5, depthWrite: false }));
  group.add(dust);

  // rain outside the door
  const rainN = 2500;
  const rainGeo = new THREE.BufferGeometry();
  const rp = new Float32Array(rainN * 6);
  for (let i = 0; i < rainN; i++) {
    const x = (Math.random() - 0.5) * 50, y = Math.random() * 14, z = D / 2 + 0.5 + Math.random() * 14;
    rp.set([x, y, z, x + 0.02, y - 0.5, z], i * 6);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x8fa3c0, transparent: true, opacity: 0.35 }));
  group.add(rain);

  let t = 0;
  function update(dt) {
    t += dt;
    for (const l of lamps) {
      if (l.flicker) {
        const f = Math.sin(t * 23) * Math.sin(t * 7.3) > 0.93 ? 0.15 : 1;
        l.s.intensity = l.base * f;
        l.bulb.material.emissiveIntensity = 6 * f;
      }
    }
    const a = dustGeo.attributes.position.array;
    for (let i = 0; i < dustN; i++) {
      a[i * 3 + 1] += Math.sin(t + i) * 0.0008 + 0.0004;
      a[i * 3] += Math.cos(t * 0.5 + i) * 0.0006;
      if (a[i * 3 + 1] > 7) a[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
    const r = rainGeo.attributes.position.array;
    for (let i = 0; i < rainN; i++) {
      r[i * 6 + 1] -= dt * 16; r[i * 6 + 4] -= dt * 16;
      if (r[i * 6 + 4] < -1) { r[i * 6 + 1] += 14; r[i * 6 + 4] += 14; }
    }
    rainGeo.attributes.position.needsUpdate = true;
    red.intensity = 4 + 3 * Math.max(0, Math.sin(t * 3));
  }

  const bounds = { minX: -W / 2 + 0.5, maxX: W / 2 - 0.5, minZ: -D / 2 + 0.5, maxZ: D / 2 + 11 };
  return {
    colliders, update, bounds,
    spawn: new THREE.Vector3(2.2, 0, 7.5),
    dummySpawns: [new THREE.Vector3(-3, 0, -2), new THREE.Vector3(2.5, 0, -3.5), new THREE.Vector3(6, 0, 2),
      new THREE.Vector3(-6, 0, 2.5)],
  };
}

// ground height under (x, z) given the colliders (top faces you can stand on)
export function groundAt(colliders, x, z, y, r = 0.25) {
  let g = 0;
  for (const b of colliders) {
    if (x > b.min.x - r * 0.5 && x < b.max.x + r * 0.5 && z > b.min.z - r * 0.5 && z < b.max.z + r * 0.5) {
      if (b.max.y <= y + 0.35 && b.max.y > g) g = b.max.y;
    }
  }
  return g;
}

// pushes a circle (x, z, radius) at height y..y+h out of the colliders
export function collide(colliders, pos, r, h = 1.8) {
  for (const b of colliders) {
    if (pos.y >= b.max.y - 0.3 || pos.y + h <= b.min.y) continue;
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest axis
        const px = Math.min(pos.x - b.min.x, b.max.x - pos.x), pz = Math.min(pos.z - b.min.z, b.max.z - pos.z);
        if (px < pz) pos.x = pos.x - b.min.x < b.max.x - pos.x ? b.min.x - r : b.max.x + r;
        else pos.z = pos.z - b.min.z < b.max.z - pos.z ? b.min.z - r : b.max.z + r;
      }
    }
  }
}
