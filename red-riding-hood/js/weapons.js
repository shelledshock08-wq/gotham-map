// Jason's hand weapons for the milestone: the wavy UTRH knife (ref 2) and a
// pistol, plus muzzle flash, tracer and impact sparks.
import * as THREE from 'three';

const steel = () => new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.22 });
const black = () => new THREE.MeshStandardMaterial({ color: 0x0d0d0f, metalness: 0.2, roughness: 0.6 });

// Wavy (kris-like) blade, as in the Under the Red Hood knife: built along +Y
// (tip up), edge facing +X, handle below the origin. Origin = grip centre.
export function makeKnife() {
  const g = new THREE.Group();
  const L = 0.22, base = 0.034;
  const shape = new THREE.Shape();
  const N = 48;
  const edge = [], back = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = base * (1 - t * 0.92) * (t > 0.85 ? (1 - (t - 0.85) / 0.15) * 0.9 + 0.1 : 1);
    const wave = Math.sin(t * Math.PI * 6) * 0.007 * (1 - t * 0.6);
    edge.push([w / 2 + wave, t * L]);
    back.push([-w / 2 + wave, t * L]);
  }
  shape.moveTo(back[0][0], back[0][1]);
  for (const p of edge) shape.lineTo(p[0], p[1]);
  for (let i = back.length - 1; i >= 0; i--) shape.lineTo(back[i][0], back[i][1]);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: 0.002, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016, bevelSegments: 2, curveSegments: 4,
  }), steel());
  blade.geometry.translate(0, 0.055, -0.001);
  blade.castShadow = true;
  g.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.018), steel());
  guard.position.y = 0.05; g.add(guard);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.1, 12), black());
  handle.position.y = 0.0; g.add(handle);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), steel());
  pommel.position.y = -0.053; g.add(pommel);
  for (const m of g.children) m.castShadow = true;
  return g;
}

// Pistol: barrel along +Z, grip down -Y, origin at the grip centre.
export function makePistol() {
  const g = new THREE.Group();
  const body = black();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.034, 0.19), new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.7, roughness: 0.35 }));
  slide.position.set(0, 0.075, 0.055); g.add(slide);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.02, 0.15), body);
  frame.position.set(0, 0.05, 0.04); g.add(frame);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.05), body);
  grip.position.set(0, 0.0, -0.005); grip.rotation.x = -0.25; g.add(grip);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), body);
  guard.position.set(0, 0.035, 0.035); guard.rotation.set(0, Math.PI / 2, Math.PI); g.add(guard);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.075, 0.155); g.add(muzzle);
  g.userData.muzzle = muzzle;
  for (const m of g.children) if (m.isMesh) m.castShadow = true;
  return g;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.flashLight = new THREE.PointLight(0xffb060, 0, 6, 2);
    scene.add(this.flashLight);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,170,60,0.8)'); gr.addColorStop(1, 'rgba(255,100,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.flashTex = new THREE.CanvasTexture(c);
  }

  muzzle(pos) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(pos); s.scale.setScalar(0.16);
    this.scene.add(s);
    this.items.push({ obj: s, life: 0.05 });
    this.flashLight.position.copy(pos); this.flashLight.intensity = 8;
    this.flashT = 0.06;
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8 }));
    this.scene.add(l);
    this.items.push({ obj: l, life: 0.06, fade: true });
  }

  sparks(pos, normal, color = 0xffc070, count = 14) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), v = [];
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      const d = new THREE.Vector3().randomDirection().multiplyScalar(0.6).add(normal).normalize().multiplyScalar(2 + Math.random() * 3);
      v.push(d);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.03, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.items.push({ obj: pts, life: 0.35, vel: v, fade: true });
  }

  update(dt) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
    for (const it of this.items) {
      it.life -= dt;
      if (it.vel) {
        const a = it.obj.geometry.attributes.position.array;
        it.vel.forEach((v, i) => { v.y -= 9.8 * dt; a[i * 3] += v.x * dt; a[i * 3 + 1] += v.y * dt; a[i * 3 + 2] += v.z * dt; });
        it.obj.geometry.attributes.position.needsUpdate = true;
      }
      if (it.fade) it.obj.material.opacity = Math.max(0, it.life * 4);
      if (it.life <= 0) { this.scene.remove(it.obj); it.obj.geometry?.dispose(); it.obj.material?.dispose(); }
    }
    this.items = this.items.filter((it) => it.life > 0);
  }
}
