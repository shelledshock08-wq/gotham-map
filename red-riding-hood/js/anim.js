// Animation helpers for the Mesh2Motion clips: root-motion extraction,
// upper/lower body splits, impact-frame detection.
import * as THREE from 'three';

const UPPER = new Set([
  'spine_02', 'spine_03', 'neck_01', 'head', 'head_leaf',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
]);
const isUpper = (bone) => UPPER.has(bone) || /^(thumb|index|middle|ring|pinky)_/.test(bone);

// Moves a clip's net horizontal travel (pelvis, or the root bone for the
// *_RM clips) out of the animation and into a curve the controller applies
// to the character. In-place clips (pelvis goes out and comes back) are left
// alone. Returns { clip, motion: {times, x, z} | null }, x/z in model space.
export function extractRootMotion(clip, rootBone, threshold = 0.3) {
  for (const bone of ['root', 'pelvis']) {
    const track = clip.tracks.find((t) => t.name === `${bone}.position`);
    if (!track) continue;
    const space = bone === 'root' ? rootBone.parent : rootBone;
    space.updateWorldMatrix(true, false);
    const toModel = space.matrixWorld.clone();
    const toLocal = toModel.clone().invert();
    const v = new THREE.Vector3();
    const n = track.times.length;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(v.fromArray(track.values, i * 3).applyMatrix4(toModel).clone());
    const net = Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].z - pts[0].z);
    if (net < threshold) continue;
    const x = new Float32Array(n), z = new Float32Array(n);
    const values = track.values.slice();
    for (let i = 0; i < n; i++) {
      x[i] = pts[i].x - pts[0].x;
      z[i] = pts[i].z - pts[0].z;
      v.set(pts[0].x, pts[i].y, pts[0].z).applyMatrix4(toLocal).toArray(values, i * 3);
    }
    const fixed = new THREE.VectorKeyframeTrack(track.name, track.times, values);
    const tracks = clip.tracks.map((t) => (t === track ? fixed : t));
    return { clip: new THREE.AnimationClip(clip.name, clip.duration, tracks), motion: { times: track.times, x, z } };
  }
  return { clip, motion: null };
}

export function sampleMotion(m, t) {
  const { times, x, z } = m;
  if (t <= times[0]) return [x[0], z[0]];
  const last = times.length - 1;
  if (t >= times[last]) return [x[last], z[last]];
  let i = 1;
  while (times[i] < t) i++;
  const f = (t - times[i - 1]) / (times[i] - times[i - 1]);
  return [x[i - 1] + (x[i] - x[i - 1]) * f, z[i - 1] + (z[i] - z[i - 1]) * f];
}

export function splitClip(clip, part) {
  const keep = (t) => {
    const bone = t.name.split('.')[0];
    return part === 'upper' ? isUpper(bone) : !isUpper(bone);
  };
  return new THREE.AnimationClip(`${clip.name}__${part}`, clip.duration, clip.tracks.filter(keep));
}

export function stripScale(clip) {
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  return clip;
}

// Fractions of the clip where a hand or foot moves fastest (the strike),
// searched inside [from, to]. Returns the best peak, or `count` peaks
// separated by at least `gap` (fraction) for multi-hit clips.
export function strikeTimes(model, mixer, clip, { from = 0, to = 1, count = 1, gap = 0.15 } = {}) {
  const ends = ['hand_r', 'hand_l', 'foot_r', 'foot_l'].map((n) => model.getObjectByName(n)).filter(Boolean);
  const a = mixer.clipAction(clip);
  a.reset().play();
  a.setEffectiveWeight(1);
  const N = 80, dur = clip.duration;
  const inv = new THREE.Matrix4();
  const prev = ends.map(() => new THREE.Vector3());
  const p = new THREE.Vector3();
  const speed = [];
  for (let i = 0; i <= N; i++) {
    const f = from + (to - from) * (i / N);
    mixer.setTime(f * dur);
    model.updateMatrixWorld(true);
    inv.copy(model.matrixWorld).invert();
    let best = 0;
    ends.forEach((e, k) => {
      e.getWorldPosition(p).applyMatrix4(inv);
      if (i > 0) best = Math.max(best, p.distanceTo(prev[k]));
      prev[k].copy(p);
    });
    speed.push([f, best]);
  }
  a.stop();
  mixer.uncacheAction(clip);
  const out = [];
  const sorted = speed.slice(1).sort((x, y) => y[1] - x[1]);
  for (const [f] of sorted) {
    if (out.every((o) => Math.abs(o - f) > gap)) out.push(f);
    if (out.length >= count) break;
  }
  return out.sort((x, y) => x - y);
}
