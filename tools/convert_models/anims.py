import yaml, json, glob, os, re, math
A = "/tmp/Sonic-The-Hedgehog-Controller-Unity/Sonic The Hedgehog Unity/Assets/Animations/"
FPS = 30
def load(p):
    txt = open(p).read()
    txt = re.sub(r'^--- !u!\d+ &\d+.*$', '---', txt, flags=re.M)
    txt = re.sub(r'^%TAG.*$', '', txt, flags=re.M)
    return yaml.safe_load(txt.split('---', 1)[1])['AnimationClip']

def herm(keys, t, comp):
    if t <= keys[0]['time']: return keys[0]['value'][comp] if isinstance(keys[0]['value'], dict) else keys[0]['value']
    for a, b in zip(keys, keys[1:]):
        if a['time'] <= t <= b['time']:
            dt = b['time'] - a['time']
            if dt <= 0: return b['value'][comp]
            s = (t - a['time']) / dt
            p0, p1 = a['value'][comp], b['value'][comp]
            m0, m1 = a['outSlope'][comp] * dt, b['inSlope'][comp] * dt
            if any(abs(v) == float('inf') for v in (m0, m1)) or any(isinstance(v, str) for v in (m0, m1)): return p0  # stepped
            s2, s3 = s * s, s * s * s
            return (2*s3 - 3*s2 + 1) * p0 + (s3 - 2*s2 + s) * m0 + (-2*s3 + 3*s2) * p1 + (s3 - s2) * m1
    return keys[-1]['value'][comp]

out = {}
for p in sorted(glob.glob(A + 'sonic_*.anim')):
    c = load(p); name = c['m_Name']
    st = c.get('m_AnimationClipSettings', {}).get('m_StopTime')
    tracks = []
    comps = {'w': 4}
    for kind, key in [('euler', 'm_EulerCurves'), ('pos', 'm_PositionCurves'), ('quat', 'm_RotationCurves'), ('scale', 'm_ScaleCurves')]:
        for cv in c.get(key) or []:
            if not cv.get('path'): continue
            keys = cv['curve']['m_Curve']
            if not keys: continue
            for k in keys:
                for f in ('inSlope', 'outSlope'):
                    for q in list(k[f].keys()):
                        v = k[f][q]
                        if isinstance(v, str): k[f][q] = float('inf')
            end = keys[-1]['time']
            st2 = st if st else end
            n = max(2, int(round(st2 * FPS)) + 1)
            times = [min(st2, i / FPS) for i in range(n)]
            cs = ['x', 'y', 'z', 'w'] if kind == 'quat' else ['x', 'y', 'z']
            vals = []
            for t in times:
                for q in cs: vals.append(round(herm(keys, t, q), 5))
            tracks.append({'bone': cv['path'].split('/')[-1], 'path': cv['path'], 'kind': kind, 'order': cv['curve'].get('m_RotationOrder', 4), 'times': [round(t, 4) for t in times], 'values': vals})
    out[name] = {'duration': st, 'tracks': tracks}
    print(name, st, len(tracks), sorted(set(t['kind'] for t in tracks)), c.get('m_AnimationClipSettings', {}).get('m_LoopTime'))
json.dump(out, open('anims.json', 'w'))
print(os.path.getsize('anims.json'))
