// Third-person camera: orbit behind Jason, over the right shoulder when
// aiming, pulled in by walls, with a little shake.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // camera looks along +z rotated by yaw
    this.pitch = 0.12;
    this.aimT = 0;
    this.shakeAmt = 0;
    this.pos = new THREE.Vector3();
    this.first = true;
  }

  shake(a) { this.shakeAmt = Math.min(0.3, this.shakeAmt + a); }

  update(dt, look, player, colliders, aiming) {
    this.yaw -= look.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy, -1.0, 0.85);
    this.aimT = THREE.MathUtils.damp(this.aimT, aiming ? 1 : 0, 10, dt);
    const a = this.aimT;
    const dist = THREE.MathUtils.lerp(3.6, 2.0, a);
    const side = THREE.MathUtils.lerp(0.35, 0.68, a);
    const height = THREE.MathUtils.lerp(1.55, 1.7, a) + (player.crouch ? -0.45 : 0);
    const target = player.pos.clone();
    target.y += height;
    // smooth vertical follow so jumps don't jerk the view
    if (this.first) { this.ty = target.y; }
    this.ty = THREE.MathUtils.damp(this.ty, target.y, 8, dt);
    target.y = this.ty;
    const fwd = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pivot = target.clone().addScaledVector(right, side);
    let want = pivot.clone().addScaledVector(fwd, -dist);
    // keep the camera out of walls and containers
    const ray = new THREE.Ray(pivot, want.clone().sub(pivot).normalize());
    let maxD = dist;
    const p = new THREE.Vector3();
    for (const b of colliders) {
      const e = b.clone().expandByScalar(0.2);
      if (e.containsPoint(pivot)) continue;
      if (ray.intersectBox(e, p)) maxD = Math.min(maxD, p.distanceTo(pivot));
    }
    want = pivot.clone().addScaledVector(ray.direction, Math.max(0.4, maxD));
    if (this.first) { this.pos.copy(want); this.first = false; }
    this.pos.lerp(want, 1 - Math.exp(-(maxD < dist ? 30 : 18) * dt));
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.pos.clone().addScaledVector(fwd, 10));
    if (this.shakeAmt > 0) {
      this.camera.rotation.x += (Math.random() - 0.5) * this.shakeAmt * 0.12;
      this.camera.rotation.y += (Math.random() - 0.5) * this.shakeAmt * 0.12;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
    }
    this.camera.fov = THREE.MathUtils.lerp(62, 48, a);
    this.camera.updateProjectionMatrix();
  }
}
