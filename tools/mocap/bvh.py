"""Minimal BVH reader + forward kinematics (CMU / cgspeed conversion: ZYX channels)."""
import numpy as np, re

class Joint:
    def __init__(self, name, parent):
        self.name, self.parent, self.offset, self.channels, self.children = name, parent, np.zeros(3), [], []

def load(path):
    txt = open(path).read()
    head, motion = txt.split('MOTION')
    tokens = re.findall(r'\S+', head)
    joints, stack, i, cur = [], [], 0, None
    while i < len(tokens):
        t = tokens[i]
        if t in ('ROOT', 'JOINT'):
            cur = Joint(tokens[i + 1], stack[-1] if stack else None); joints.append(cur)
            if cur.parent: cur.parent.children.append(cur)
            i += 2; continue
        if t == 'End':
            cur = Joint(stack[-1].name + '_end', stack[-1]); cur.end = True; stack[-1].children.append(cur); joints.append(cur)
            i += 2; continue
        if t == '{': stack.append(cur); i += 1; continue
        if t == '}': stack.pop(); i += 1; continue
        if t == 'OFFSET': cur.offset = np.array([float(x) for x in tokens[i + 1:i + 4]]); i += 4; continue
        if t == 'CHANNELS':
            n = int(tokens[i + 1]); cur.channels = tokens[i + 2:i + 2 + n]; i += 2 + n; continue
        i += 1
    lines = motion.strip().split('\n')
    nf = int(lines[0].split(':')[1]); ft = float(lines[1].split(':')[1])
    data = np.array([[float(x) for x in l.split()] for l in lines[2:2 + nf]])
    return joints, data, ft

def rot(axis, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    if axis == 'X': return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 'Y': return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def fk(joints, data, step=1):
    """World positions [frames][joint] for every `step`-th frame."""
    out = []
    for f in range(0, len(data), step):
        row = data[f]; col = 0; world = {}
        for j in joints:
            R = np.eye(3); pos = j.offset.copy()
            for ch in j.channels:
                v = row[col]; col += 1
                if ch.endswith('position'): pos['XYZ'.index(ch[0])] = v if j.parent is None else pos['XYZ'.index(ch[0])]
                else: R = R @ rot(ch[0], v)
            if j.parent is None: world[j.name] = (R, pos)
            else:
                PR, PP = world[j.parent.name]
                world[j.name] = (PR @ R, PP + PR @ j.offset)
        out.append({k: v[1] for k, v in world.items()})
    return out
