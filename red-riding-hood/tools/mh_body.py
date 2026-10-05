"""MakeHuman (CC0) base body for Jason, built without the MakeHuman app.

Reads the hm08 base mesh, the macro targets and the game_engine rig/weights
from MPFB's data folder and returns plain numpy data in Blender coordinates
(Z up, character facing -Y, metres).
"""
import gzip
import json
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, ".sources", "mpfb2", "src", "mpfb", "data")

# Provisional body for Jason (brief: ~19, crime lord who fights).
# MakeHuman scale: age 0.1875 = 11 y, 0.5 = 25 y; 0.42 reads as about 21.
JASON = dict(
    gender=1.0,
    age=0.42,
    muscle=0.78,
    weight=0.44,
    height=0.66,
    proportions=0.85,
    race=dict(caucasian=0.8, african=0.05, asian=0.15),
    # extra local targets: name -> weight
    extra={
        "torso/torso-scale-horiz-incr": 0.25,  # a little broader through the chest
        "torso/torso-vshape-incr": 0.45,
        "neck/neck-scale-horiz-incr": 0.2,
        "arms/l-upperarm-muscle-incr": 0.2,
        "arms/r-upperarm-muscle-incr": 0.2,
    },
)

AGE = [("baby", 0.0), ("child", 0.1875), ("young", 0.5), ("old", 1.0)]


def _interp(value, stops):
    """Weights for the two named stops around value (MakeHuman macro style)."""
    out = {name: 0.0 for name, _ in stops}
    for (a, va), (b, vb) in zip(stops, stops[1:]):
        if va <= value <= vb:
            t = (value - va) / (vb - va)
            out[a] += 1 - t
            out[b] += t
            return out
    out[stops[-1][0] if value > stops[-1][1] else stops[0][0]] = 1.0
    return out


def _half(value, low, high):
    """Targets like height: 0..0.5 -> low target, 0.5..1 -> high target."""
    if value < 0.5:
        return {low: (0.5 - value) * 2}
    return {high: (value - 0.5) * 2}


def macro_weights(p):
    g = {"female": 1 - p["gender"], "male": p["gender"]}
    a = _interp(p["age"], AGE)
    m = _interp(p["muscle"], [("minmuscle", 0), ("averagemuscle", 0.5), ("maxmuscle", 1)])
    w = _interp(p["weight"], [("minweight", 0), ("averageweight", 0.5), ("maxweight", 1)])
    h = _half(p["height"], "minheight", "maxheight")
    pr = _half(p["proportions"], "uncommonproportions", "idealproportions")
    out = {}

    def add(path, wt):
        if wt > 1e-4:
            out[path] = out.get(path, 0) + wt

    for gn, gw in g.items():
        for an, aw in a.items():
            for race, rw in p["race"].items():
                add(f"macrodetails/{race}-{gn}-{an}", rw * gw * aw)
            for mn, mw in m.items():
                for wn, ww in w.items():
                    base = gw * aw * mw * ww
                    add(f"macrodetails/universal-{gn}-{an}-{mn}-{wn}", base)
                    for hn, hw in h.items():
                        add(f"macrodetails/height/{gn}-{an}-{mn}-{wn}-{hn}", base * hw)
                    for pn, pw in pr.items():
                        add(f"macrodetails/proportions/{gn}-{an}-{mn}-{wn}-{pn}", base * pw)
    for k, v in p.get("extra", {}).items():
        add(k, v)
    return out


def _load_target(path):
    idx, d = [], []
    with gzip.open(os.path.join(DATA, "targets", path + ".target.gz"), "rt") as f:
        for line in f:
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.split()
            idx.append(int(parts[0]))
            d.append([float(x) for x in parts[1:4]])
    return np.array(idx, dtype=int), np.array(d).reshape(-1, 3)


def _ranges(r):
    out = []
    for a, b in r:
        out.extend(range(a, b + 1))
    return np.array(out)


def load_obj():
    verts, uvs, faces, fuv, groups = [], [], [], [], []
    group = None
    with open(os.path.join(DATA, "3dobjs", "base.obj")) as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("g "):
                group = line.split()[1]
            elif line.startswith("f "):
                ids = [p.split("/") for p in line.split()[1:]]
                faces.append([int(i[0]) - 1 for i in ids])
                fuv.append([int(i[1]) - 1 for i in ids])
                groups.append(group)
    return np.array(verts), np.array(uvs), faces, fuv, groups


def build(params=JASON):
    """Returns dict with verts (all hm08 verts, Blender coords), body faces/uv
    loops, joint positions per rig bone (head/tail) and game_engine weights."""
    v, uvs, faces, fuv, groups = load_obj()
    v = v.copy()
    skipped = []
    for path, wt in macro_weights(params).items():
        try:
            idx, d = _load_target(path)
        except FileNotFoundError:
            skipped.append(path)
            continue
        v[idx] += d * wt
    # MakeHuman: decimetres, Y up, facing +Z  ->  Blender: metres, Z up, facing -Y
    bv = np.stack([v[:, 0], -v[:, 2], v[:, 1]], axis=1) * 0.1

    vgroups = json.load(open(os.path.join(DATA, "mesh_metadata", "basemesh_vertex_groups.json")))
    body = set(_ranges(vgroups["body"]).tolist())
    keep = [i for i, g in enumerate(groups) if g == "body"]
    bfaces = [faces[i] for i in keep]
    bfuv = [fuv[i] for i in keep]
    assert all(all(x in body for x in f) for f in bfaces)

    floor = bv[_ranges(vgroups["body"])][:, 2].min()
    bv[:, 2] -= floor

    def cube(name):
        return bv[_ranges(vgroups[name])].mean(axis=0)

    rig = json.load(open(os.path.join(DATA, "rigs", "standard", "rig.game_engine.json")))
    joints = {}
    for bone, info in rig.items():
        ends = []
        for end in ("head", "tail"):
            e = info[end]
            if e["strategy"] == "CUBE":
                ends.append(cube(e["cube_name"]))
            else:
                ends.append(bv[e["vertex_indices"]].mean(axis=0))
        joints[bone] = dict(head=ends[0], tail=ends[1], roll=info.get("roll", 0.0), parent=info.get("parent"))
    weights = json.load(open(os.path.join(DATA, "rigs", "standard", "weights.game_engine.json")))["weights"]
    return dict(verts=bv, uvs=np.array(uvs), faces=bfaces, face_uvs=bfuv, joints=joints,
                weights=weights, vgroups=vgroups, skipped=skipped)


if __name__ == "__main__":
    b = build()
    print("skipped targets:", b["skipped"][:8], len(b["skipped"]))
    bodyv = b["verts"][_ranges(b["vgroups"]["body"])]
    print("height m:", bodyv[:, 2].max().round(3), "width", np.ptp(bodyv[:, 0]).round(3))
    for k in ("pelvis", "head", "upperarm_l", "hand_l", "thigh_l", "foot_l"):
        print(k, b["joints"][k]["head"].round(3), b["joints"][k]["tail"].round(3))
