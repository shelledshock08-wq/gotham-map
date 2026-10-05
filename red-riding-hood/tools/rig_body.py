"""Puts the MakeHuman body on the Mesh2Motion skeleton.

1. Pose the MakeHuman body (A-pose, game_engine rig) into the Mesh2Motion
   T-pose by aligning every bone direction (linear blend skinning in numpy).
2. Import the Mesh2Motion animation GLB, keep its armature and actions, move
   its joints to Jason's posed joints while keeping every bone's orientation,
   so all clips play on Jason unchanged (root/pelvis translation is scaled).
"""
import os

import numpy as np

import mh_body

ROOT = mh_body.ROOT
M2M = os.path.join(ROOT, ".sources", "mesh2motion-app", "static", "animations")

# bone -> (end joint used for its direction, optional (a, b) lateral hint)
FINGERS = ["thumb", "index", "middle", "ring", "pinky"]


def chain_ends(side):
    s = "_" + side
    ends = {
        "upperarm" + s: "lowerarm" + s,
        "lowerarm" + s: "hand" + s,
        "hand" + s: "middle_01" + s,
        "thigh" + s: "calf" + s,
        "calf" + s: "foot" + s,
        "foot" + s: "ball" + s,
        "ball" + s: "ball_leaf" + s,
    }
    for f in FINGERS:
        ends[f"{f}_01{s}"] = f"{f}_02{s}"
        ends[f"{f}_02{s}"] = f"{f}_03{s}"
        ends[f"{f}_03{s}"] = f"{f}_04_leaf{s}"
    return ends


# Only limbs are re-aimed: they differ by pose (A vs T). Spine, neck, head
# and clavicle joints sit at different depths in the two skeletons, so
# aiming those would bend Jason's posture; they keep MakeHuman's layout.
ENDS = {}
ENDS.update(chain_ends("l"))
ENDS.update(chain_ends("r"))

# second axis to fix the twist of these bones: (from, to) joints
HINTS = {
    "hand_l": ("pinky_01_l", "index_01_l"),
    "hand_r": ("pinky_01_r", "index_01_r"),
    "foot_l": ("X-", "X+"),
    "foot_r": ("X-", "X+"),
}


def mh_joint(joints, name):
    """Joint position in the MakeHuman rig, by Mesh2Motion name."""
    if "_leaf" in name:
        parent = name.replace("_04_leaf", "_03").replace("_leaf", "")
        return joints[parent]["tail"]
    return joints[name]["head"]


def rot_between(a, b):
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if c < -0.999999:
        axis = np.cross(a, [1, 0, 0])
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, [0, 1, 0])
        axis /= np.linalg.norm(axis)
        return 2 * np.outer(axis, axis) - np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + c)


def frame(primary, hint):
    x = primary / np.linalg.norm(primary)
    y = hint - np.dot(hint, x) * x
    y /= np.linalg.norm(y)
    return np.stack([x, y, np.cross(x, y)], axis=1)


def pose_to_tpose(body, target):
    """Rotate the MakeHuman joints so each bone points like `target`
    (dict joint -> position, Mesh2Motion rest pose). Returns posed verts and
    posed joint positions (Mesh2Motion names)."""
    joints = body["joints"]
    parents = {b: j["parent"] for b, j in joints.items()}
    order = []

    def visit(b):
        if b in order:
            return
        if parents.get(b) and parents[b] != "Root":
            visit(parents[b])
        order.append(b)

    for b in joints:
        if b != "Root":
            visit(b)

    rest_head = {b: joints[b]["head"] for b in order}
    R = {}
    new_head = {}
    for b in order:
        p = parents[b]
        if p in R:
            new_head[b] = R[p] @ (rest_head[b] - rest_head[p]) + new_head[p]
            Rp = R[p]
        else:
            new_head[b] = rest_head[b].copy()
            Rp = np.eye(3)
        if b not in ENDS:
            R[b] = Rp
            continue
        end = ENDS[b]
        d_rest = Rp @ (mh_joint(joints, end) - rest_head[b])
        d_tgt = target[end] - target[b]
        if b in HINTS:
            ha, hb = HINTS[b]
            if ha == "X-":
                h_rest = Rp @ np.array([1.0, 0, 0])
                h_tgt = np.array([1.0, 0, 0])
            else:
                h_rest = Rp @ (mh_joint(joints, hb) - mh_joint(joints, ha))
                h_tgt = target[hb] - target[ha]
            Rd = frame(d_tgt, h_tgt) @ frame(d_rest, h_rest).T
        else:
            Rd = rot_between(d_rest, d_tgt)
        R[b] = Rd @ Rp

    # linear blend skinning of the body verts
    v = body["verts"]
    out = np.zeros_like(v)
    wsum = np.zeros(len(v))
    for b, lst in body["weights"].items():
        if b not in R or not lst:
            continue
        idx = np.array([i for i, _ in lst])
        w = np.array([x for _, x in lst])
        moved = (v[idx] - rest_head[b]) @ R[b].T + new_head[b]
        out[idx] += moved * w[:, None]
        wsum[idx] += w
    ok = wsum > 1e-6
    out[ok] /= wsum[ok][:, None]
    out[~ok] = v[~ok]

    posed = {}
    for b in order:
        posed[b] = new_head[b]
    # leaf joints
    for b, end in ENDS.items():
        if end not in posed:
            src_parent = b
            posed[end] = R[src_parent] @ (mh_joint(joints, end) - rest_head[src_parent]) + new_head[src_parent]
    posed["head_leaf"] = R["head"] @ (joints["head"]["tail"] - rest_head["head"]) + new_head["head"]
    return out, posed, R
