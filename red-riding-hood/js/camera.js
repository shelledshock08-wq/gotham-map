// Third-person camera: close and quick, over the shoulder for the pistol and
// Blade Mode, swings toward a locked-on enemy, pulled in by walls, shakes.
import * as THREE from 'three';

const MODES = {
  free: { dist: 4.3, side: 0.3, height: 1.6, fov: 64 },
  aim: { dist: 2.0, side: 0.68, height: 1.7, fov: 48 },
  blade: { dist: 2.1, side: 0.55, height: 1.72, fov: 52 },
};

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.14;
    this.shakeAmt = 0;
    this.pos = new THREE.Vector3();
    this.cur = { ...MODES.free };
    this.first = true;
  }

  shake(a) { this.shakeAmt = Math.min(0.35, this.shakeAmt + a); }

  update(dt, look, player, colliders) {
    const mode = player.state === 'aim' ? 'aim' : player.state === 'blade' ? 'blade' : 'free';
    const M = MODES[mode];
    for (const k of Object.keys(M)) this.cur[k] = THREE.MathUtils.damp(this.cur[k], M[k], 12, dt);
    if (mode !== 'blade') {
      this.yaw -= look.dx;
      this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy, -1.0, 0.85);
    }
    // lock-on: keep the target in view
    const t = player.lockT;
    if (t && t.alive && mode === 'free') {
      const to = t.pos.clone().sub(player.pos);
      const want = Math.atan2(to.x, to.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.yaw += d * Math.min(1, 6 * dt);
      this.pitch = THREE.MathUtils.damp(this.pitch, 0.2, 4, dt);
    }
    const target = player.pos.clone();
    target.y += this.cur.height + (player.crouch && player.state === 'move' ? -0.45 : 0);
    if (this.first) this.ty = target.y;
    this.ty = THREE.MathUtils.damp(this.ty, target.y, 10, dt);
    target.y = this.ty;
    const fwd = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pivot = target.clone().addScaledVector(right, this.cur.side);
    const ray = new THREE.Ray(pivot, fwd.clone().negate());
    let maxD = this.cur.dist;
    const p = new THREE.Vector3();
    for (const b of colliders) {
      const e = b.clone().expandByScalar(0.2);
      if (e.containsPoint(pivot)) continue;
      if (ray.intersectBox(e, p)) maxD = Math.min(maxD, p.distanceTo(pivot));
    }
    const want = pivot.clone().addScaledVector(ray.direction, Math.max(0.5, maxD));
    if (this.first) { this.pos.copy(want); this.first = false; }
    this.pos.lerp(want, 1 - Math.exp(-28 * dt));
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.pos.clone().addScaledVector(fwd, 10));
    if (this.shakeAmt > 0) {
      this.camera.rotation.x += (Math.random() - 0.5) * this.shakeAmt * 0.12;
      this.camera.rotation.y += (Math.random() - 0.5) * this.shakeAmt * 0.12;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.6);
    }
    this.camera.fov = this.cur.fov;
    this.camera.updateProjectionMatrix();
  }
}
