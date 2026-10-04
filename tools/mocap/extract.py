#!/usr/bin/env python3
"""Retarget CMU mocap (BVH) onto the game's Generations rigs by limb direction.

For every frame we build the character's own frame from the hips (+x = the
character's left, +y up, +z forward) and store, in that frame, the direction of
each limb segment plus the torso and the hip height. At runtime the game aims
the matching bones of Sonic, Tails and the Zombots along those directions
(escMocap in js/escape.js). Clips are cut automatically around punch/kick peaks.
Writes js/mocap.js."""
import json, os, sys, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import bvh
SRC = os.environ.get('CMU', '/tmp/cmu/repo/data')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'js', 'mocap.js')
FPS = 30
SEGS = [('UpperArm_L', 'LeftArm', 'LeftForeArm'), ('ForeArm_L', 'LeftForeArm', 'LeftHand'),
        ('UpperArm_R', 'RightArm', 'RightForeArm'), ('ForeArm_R', 'RightForeArm', 'RightHand'),
        ('Thigh_L', 'LeftUpLeg', 'LeftLeg'), ('Calf_L', 'LeftLeg', 'LeftFoot'),
        ('Thigh_R', 'RightUpLeg', 'RightLeg'), ('Calf_R', 'RightLeg', 'RightFoot'),
        ('Spine', 'Hips', 'Neck'), ('Neck', 'Neck1', 'Head')]

def path(take):
    s = take.split('_')[0]; return os.path.join(SRC, '%03d' % int(s), take + '.bvh')

cache = {}
def frames(take):
    if take in cache: return cache[take]
    joints, data, ft = bvh.load(path(take))
    step = max(1, round(1 / (ft * FPS)))
    P = bvh.fk(joints, data, step)
    cache[take] = P
    return P

def frame_basis(p):
    left = p['LeftUpLeg'] - p['RightUpLeg']; left[1] = 0; left /= np.linalg.norm(left) + 1e-9
    up = np.array([0.0, 1.0, 0.0]); fwd = np.cross(left, up)
    return left, up, fwd

def encode(P, a, b, mirror=False):
    out = []
    leg = np.linalg.norm(P[a]['LeftUpLeg'] - P[a]['LeftLeg']) + np.linalg.norm(P[a]['LeftLeg'] - P[a]['LeftFoot'])
    hip0 = None
    for p in P[a:b]:
        L, U, F = frame_basis(p)
        row = []
        for name, j0, j1 in SEGS:
            if mirror: j0, j1 = swap(j0), swap(j1)
            d = p[j1] - p[j0]; d /= np.linalg.norm(d) + 1e-9
            x, y, z = float(d @ L), float(d @ U), float(d @ F)
            if mirror: x = -x
            row += [round(x, 2), round(y, 2), round(z, 2)]
        foot = min(p['LeftFoot'][1], p['RightFoot'][1])
        h = (p['Hips'][1] - foot) / leg
        row.append(round(float(h), 3))
        out.append(row)
    return out

def swap(n):
    return n.replace('Left', '#').replace('Right', 'Left').replace('#', 'Right')

def peaks(sig, thr, gap):
    idx = [i for i in range(1, len(sig) - 1) if sig[i] > thr and sig[i] >= sig[i - 1] and sig[i] >= sig[i + 1]]
    keep = []
    for i in sorted(idx, key=lambda i: -sig[i]):
        if all(abs(i - k) > gap for k in keep): keep.append(i)
    return sorted(keep)

def ext(P, side):
    s = 'Left' if side == 'L' else 'Right'
    out = []
    for p in P:
        L, U, F = frame_basis(p)
        arm = np.linalg.norm(p[s + 'Arm'] - p[s + 'ForeArm']) + np.linalg.norm(p[s + 'ForeArm'] - p[s + 'Hand'])
        out.append(float((p[s + 'Hand'] - p[s + 'Arm']) @ F) / arm)
    return np.array(out)

def rise(P, side):
    s = 'Left' if side == 'L' else 'Right'
    return np.array([float(p[s + 'Hand'][1] - p['Head'][1]) for p in P])

def kick(P, side):
    s = 'Left' if side == 'L' else 'Right'
    out = []
    for p in P:
        L, U, F = frame_basis(p)
        leg = np.linalg.norm(p[s + 'UpLeg'] - p[s + 'Leg']) + np.linalg.norm(p[s + 'Leg'] - p[s + 'Foot'])
        out.append(float((p[s + 'Foot'] - p[s + 'UpLeg']) @ F + (p[s + 'Foot'][1] - p[s + 'UpLeg'][1]) * 0.6) / leg)
    return np.array(out)

clips, report = {}, []
def add(name, take, a, b, mirror=False):
    P = frames(take); a = max(0, a); b = min(len(P), b)
    clips[name] = encode(P, a, b, mirror)
    report.append(f'{name}: {take} [{a}:{b}] {b - a} frames')

# --- punches from the boxing takes (strongest extensions), uppercuts from rising hands
jabs, crosses, ups = [], [], []
for take in ['14_01', '14_02', '14_03', '13_17']:
    P = frames(take)
    for side in 'LR':
        e = ext(P, side)
        for i in peaks(e, 0.72, 12): (jabs if side == 'L' else crosses).append((e[i], take, i))
        r = rise(P, side)
        for i in peaks(r, 1.5, 15):
            if ext(P, side)[i] > 0.15: ups.append((r[i], take, i, side))
jabs.sort(reverse=True); crosses.sort(reverse=True); ups.sort(reverse=True)
for k, (v, take, i) in enumerate(jabs[:3]): add(f'jab{k}', take, i - 7, i + 8)
for k, (v, take, i) in enumerate(crosses[:3]): add(f'cross{k}', take, i - 7, i + 9)
for k, (v, take, i, side) in enumerate(ups[:2]): add(f'uppercut{k}', take, i - 8, i + 9, mirror=(side == 'L'))
# --- the guard: the calmest stretch of boxing stance with both hands up
P = frames('14_01')
best = None
for a in range(0, len(P) - 60, 10):
    seg = P[a:a + 60]
    up = np.mean([min(p['LeftHand'][1], p['RightHand'][1]) - p['Neck'][1] for p in seg])
    mv = np.mean([np.linalg.norm(seg[i]['LeftHand'] - seg[i - 1]['LeftHand']) + np.linalg.norm(seg[i]['RightHand'] - seg[i - 1]['RightHand']) for i in range(1, len(seg))])
    sc = -abs(up + 1.5) * 2 - mv
    if max(ext(seg, 'L').max(), ext(seg, 'R').max()) < 0.55 and (best is None or sc > best[0]): best = (sc, a)
add('guard', '14_01', best[1], best[1] + 60)
# --- kicks
for k, take in enumerate(['74_03', '74_04']):
    P = frames(take)
    best = max(((kick(P, s).max(), s, int(kick(P, s).argmax())) for s in 'LR'))
    add(f'kick{k}', take, best[2] - 12, best[2] + 12, mirror=(best[1] == 'L'))
for name, take in [('spinkick', '88_06'), ('jumpkick', '90_05')]:
    P = frames(take)
    best = max(((kick(P, s).max(), s, int(kick(P, s).argmax())) for s in 'LR'))
    add(name, take, best[2] - 20, best[2] + 14, mirror=(best[1] == 'L'))
# --- locomotion and the dead: run cycle, zombie march, limp, creep
add('run', '09_01', 0, len(frames('09_01')))
add('zombie', '20_08', 0, len(frames('20_08')))
add('zombie2', '21_08', 0, len(frames('21_08')))
add('limp', '77_19', 0, min(120, len(frames('77_19'))))
add('creep', '77_29', 30, 150)
json.dump(report, sys.stdout, indent=1)
src = ("// Motion capture from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH\n"
       "// conversion by Bruce Hahne (cgspeed). Free for any use. Retargeted by limb direction with\n"
       "// tools/mocap/extract.py: each frame is [dx,dy,dz] per segment (character space) + hip height.\n"
       "'use strict';\nconst MOCAP_SEGS = " + json.dumps([s[0] for s in SEGS]) + ";\nconst MOCAP = " + json.dumps(clips, separators=(',', ':')) + ";\n")
open(OUT, 'w').write(src)
print('\nwrote', OUT, len(src) // 1024, 'KB')
