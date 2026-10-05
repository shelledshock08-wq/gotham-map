// Hand weapons: the wavy UTRH knife (ref 2), a pistol, a machete, and the
// helper that puts them in a hand.
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
  g.userData.tip = new THREE.Object3D(); g.userData.tip.position.set(0, 0.27, 0); g.add(g.userData.tip);
  g.userData.base = new THREE.Object3D(); g.userData.base.position.set(0, 0.07, 0); g.add(g.userData.base);
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

// Machete for the blade thugs: blade along +Y, edge +X, origin = grip.
export function makeMachete() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.018, 0); shape.lineTo(0.02, 0); shape.lineTo(0.03, 0.36); shape.quadraticCurveTo(0.03, 0.42, 0.0, 0.43);
  shape.lineTo(-0.018, 0.4); shape.lineTo(-0.018, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.9, roughness: 0.45 }));
  blade.geometry.translate(0, 0.06, -0.0015);
  g.add(blade);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.014, 0.12, 10), black());
  g.add(handle);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.tip = new THREE.Object3D(); g.userData.tip.position.set(0.01, 0.48, 0); g.add(g.userData.tip);
  return g;
}

// Puts a weapon in a hand, computed from the hand bones in the bind pose
// (call before any animation has posed the skeleton). mode 'blade': blade
// out of the thumb side; 'gun': barrel along the fingers.
export function attachToHand(model, obj, mode, side = 'r') {
  model.updateMatrixWorld(true);
  const bone = (n) => model.getObjectByName(`${n}_${side}`);
  const wp = (n) => bone(n).getWorldPosition(new THREE.Vector3());
  const hand = wp('hand'), mid = wp('middle_01'), idx = wp('index_01'), pinky = wp('pinky_01');
  const fingers = mid.clone().sub(hand).normalize();
  const thumbSide = idx.clone().sub(pinky).normalize();
  const palm = new THREE.Vector3().crossVectors(fingers, thumbSide).normalize();
  if (palm.y > 0) palm.negate();
  const fist = hand.clone().addScaledVector(fingers, 0.075).addScaledVector(palm, 0.025);
  let x, y, z, at = fist;
  if (mode === 'blade') {
    y = thumbSide.clone();
    x = fingers.clone().addScaledVector(y, -fingers.dot(y)).normalize();
    z = new THREE.Vector3().crossVectors(x, y);
  } else {
    z = fingers.clone();
    y = thumbSide.clone().addScaledVector(z, -thumbSide.dot(z)).normalize();
    x = new THREE.Vector3().crossVectors(y, z);
    at = fist.clone().addScaledVector(thumbSide, -0.01);
  }
  const hb = model.getObjectByName(`hand_${side}`);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(at);
  m.premultiply(hb.matrixWorld.clone().invert());
  m.decompose(obj.position, obj.quaternion, obj.scale);
  hb.add(obj);
  return obj;
}
