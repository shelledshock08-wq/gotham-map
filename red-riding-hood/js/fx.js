// Combat effects: blood, splats and pools, sparks, muzzle flash, tracers,
// shockwave rings, attack glints and the blade trail.
import * as THREE from 'three';

function radialTex(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function splatTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(90,6,6,1)';
  const blob = (cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  blob(64, 64, 26);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 38;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 9 * (1 - d / 70));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 40);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.beginPath(); x.moveTo(0, 64); x.lineTo(64, 60); x.lineTo(128, 64); x.lineTo(64, 68); x.fill();
  x.beginPath(); x.moveTo(64, 0); x.lineTo(60, 64); x.lineTo(64, 128); x.lineTo(68, 64); x.fill();
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.decals = [];
    this.flashTex = radialTex([[0, 'rgba(255,240,200,1)'], [0.3, 'rgba(255,170,60,0.8)'], [1, 'rgba(255,100,0,0)']]);
    this.splatT = splatTex();
    this.star = starTex();
    this.flashLight = new THREE.PointLight(0xffb060, 0, 6, 2);
    scene.add(this.flashLight);
    this.decalMat = new THREE.MeshStandardMaterial({ map: this.splatT, transparent: true, roughness: 0.15, metalness: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // blade trail
    this.trailN = 14;
    this.trailPts = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 2 * 3), 3));
    tg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(this.trailN * 2), 1));
    const idx = [];
    for (let i = 0; i < this.trailN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(0.75,0.88,1.0) * vA * 1.6, vA); }',
    }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
  }

  add(obj, life, extra = {}) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, ...extra });
  }

  particles(pos, dir, count, { color, size, speed, spread, gravity = 14, life = 0.6, splat = false, additive = false }) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), v = [];
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      v.push(new THREE.Vector3().randomDirection().multiplyScalar(spread).add(dir).normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.add(new THREE.Points(geo, mat), life, { vel: v, gravity, fade: true, splat });
  }

  bloodBurst(pos, dir, count = 24) {
    this.particles(pos, dir.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.5, 0)), count,
      { color: 0x7a0606, size: 0.045, speed: 5, spread: 0.9, life: 0.9, splat: true });
    this.particles(pos, dir, Math.round(count / 2), { color: 0xa01010, size: 0.02, speed: 8, spread: 0.6, life: 0.4 });
  }

  drip(pos) {
    this.particles(pos, new THREE.Vector3(0, -1, 0), 2, { color: 0x6a0505, size: 0.03, speed: 1, spread: 0.3, life: 0.6, splat: true });
  }

  sparks(pos, normal, color = 0xffc070, count = 14, speed = 4) {
    this.particles(pos, normal, count, { color, size: 0.035, speed, spread: 0.7, life: 0.35, additive: true, gravity: 9 });
  }

  splat(pos, size = 0.4) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat);
    m.position.copy(pos); m.position.y += 0.004 + Math.random() * 0.002;
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(size);
    m.receiveShadow = true;
    this.scene.add(m);
    this.decals.push({ m, grow: 0, target: size });
    if (this.decals.length > 80) { const d = this.decals.shift(); this.scene.remove(d.m); }
  }

  pool(pos, size) { // spreading pool under a body
    this.splat(pos, 0.05);
    const d = this.decals[this.decals.length - 1];
    d.grow = 0.25; d.target = size * 2.4;
  }

  muzzle(pos) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(pos); s.scale.setScalar(0.16);
    this.add(s, 0.05);
    this.flashLight.position.copy(pos); this.flashLight.intensity = 8;
    this.flashT = 0.06;
  }

  tracer(from, to, color = 0xffd9a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    this.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true })), 0.06, { fade: true });
  }

  ring(pos, radius, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(pos); m.position.y += 0.05;
    this.add(m, 0.35, { grow: radius, fade: true });
  }

  // flare on an enemy about to strike: red = parry it, yellow = dodge it
  glint(obj, offset, color) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    s.scale.setScalar(0.1);
    this.add(s, 0.38, { follow: obj, offset, pulse: 0.9 });
  }

  // feed the blade trail with the blade's base and tip each frame
  trailPush(a, b, on) {
    this.trailPts.unshift([a.clone(), b.clone(), on ? 1 : 0]);
    if (this.trailPts.length > this.trailN) this.trailPts.pop();
  }

  update(dt) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
    for (const it of this.items) {
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      if (it.vel) {
        const a = it.obj.geometry.attributes.position.array;
        it.vel.forEach((v, i) => {
          if (!v) return;
          v.y -= it.gravity * dt;
          a[i * 3] += v.x * dt; a[i * 3 + 1] += v.y * dt; a[i * 3 + 2] += v.z * dt;
          if (a[i * 3 + 1] < 0.01) {
            a[i * 3 + 1] = 0.01;
            if (it.splat && Math.random() < 0.25) this.splat(new THREE.Vector3(a[i * 3], 0, a[i * 3 + 2]), 0.06 + Math.random() * 0.12);
            it.vel[i] = null;
          }
        });
        it.obj.geometry.attributes.position.needsUpdate = true;
      }
      if (it.grow) it.obj.scale.setScalar(0.2 + it.grow * (1 - k));
      if (it.follow) {
        it.obj.position.copy(it.follow.getWorldPosition(new THREE.Vector3())).add(it.offset);
        it.obj.scale.setScalar(0.15 + Math.sin((1 - k) * Math.PI) * it.pulse);
      }
      if (it.fade) it.obj.material.opacity = k;
      if (it.life <= 0) { this.scene.remove(it.obj); it.obj.geometry?.dispose(); it.obj.material?.dispose(); }
    }
    this.items = this.items.filter((it) => it.life > 0);
    for (const d of this.decals) {
      if (d.grow && d.m.scale.x < d.target) d.m.scale.setScalar(Math.min(d.target, d.m.scale.x + d.grow * dt));
    }
    // trail mesh
    const pa = this.trail.geometry.attributes.position.array, al = this.trail.geometry.attributes.alpha.array;
    for (let i = 0; i < this.trailN; i++) {
      const s = this.trailPts[Math.min(i, this.trailPts.length - 1)];
      if (!s) continue;
      s[0].toArray(pa, i * 6); s[1].toArray(pa, i * 6 + 3);
      const f = s[2] * (1 - i / this.trailN);
      al[i * 2] = f * 0.15; al[i * 2 + 1] = f;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.alpha.needsUpdate = true;
  }
}
