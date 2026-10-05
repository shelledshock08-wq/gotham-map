// Animation helpers: root-motion extraction and upper/lower body splits for
// the Mesh2Motion clips baked onto Jason (tools/build_jason.py).
import * as THREE from 'three';

const UPPER = new Set([
  'spine_02', 'spine_03', 'neck_01', 'head', 'head_leaf',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
]);
const isUpper = (bone) => UPPER.has(bone) || /^(thumb|index|middle|ring|pinky)_/.test(bone);

// Moves a clip's horizontal pelvis travel out of the animation and into a
// curve the controller applies to the character (real root motion). Returns
// { clip, motion: {times, x, z} | null } with x/z in model space (metres).
export function extractRootMotion(clip, rootBone, threshold = 0.3) {
  const track = clip.tracks.find((t) => t.name === 'pelvis.position');
  if (!track) return { clip, motion: null };
  rootBone.updateWorldMatrix(true, false);
  const toModel = rootBone.matrixWorld.clone();
  const toLocal = toModel.clone().invert();
  const v = new THREE.Vector3();
  const n = track.times.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    v.fromArray(track.values, i * 3).applyMatrix4(toModel);
    pts.push(v.clone());
  }
  // in-place clips (pelvis goes out and comes back) are left alone; only
  // clips that really travel get their travel moved to the controller
  const net = Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].z - pts[0].z);
  if (net < threshold) return { clip, motion: null };
  const x = new Float32Array(n), z = new Float32Array(n);
  const values = track.values.slice();
  for (let i = 0; i < n; i++) {
    x[i] = pts[i].x - pts[0].x;
    z[i] = pts[i].z - pts[0].z;
    v.set(pts[0].x, pts[i].y, pts[0].z).applyMatrix4(toLocal);
    v.toArray(values, i * 3);
  }
  const fixed = new THREE.VectorKeyframeTrack(track.name, track.times, values);
  const tracks = clip.tracks.map((t) => (t === track ? fixed : t));
  return { clip: new THREE.AnimationClip(clip.name, clip.duration, tracks), motion: { times: track.times, x, z } };
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

// Scale tracks are constant 1 in these clips; dropping them saves work.
export function stripScale(clip) {
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  return clip;
}
