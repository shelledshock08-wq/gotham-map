"""Builds assets/models/jason.glb in headless Blender (pip install bpy==4.5.4).

    python3 tools/build_jason.py [--body-only] [--all-clips]

Body: MakeHuman hm08 (CC0) via mh_body.py. Skeleton + animations:
Mesh2Motion human rig and clips (CC0). Suit: suit.py.
"""
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh_body  # noqa: E402
import rig_body  # noqa: E402

ROOT = mh_body.ROOT
OUT = os.path.join(ROOT, "assets", "models")

# Clips the test arena uses (Mesh2Motion names). Kept short to keep the file small.
CLIPS = [
    # locomotion
    "Idle_A", "Idle_Sword", "Fighting Idle", "Walk", "Jog", "Sprint", "Run_Anime", "Walk_Backwards",
    "Strafe_left", "Strafe_right", "Crouch_Idle", "Crouch_Walk", "Run_Stealth",
    "Turn_Left_90", "Turn_Right_90", "Turn_Left_180", "Turn_Right_180",
    # air
    "Jump_Start", "Jump_air", "Jump_Land", "Run Jump", "NinjaJump_Start", "NinjaJump_Idle", "NinjaJump_Land",
    "Land_Three_Point", "Backflip",
    # attacks
    "Sword_Regular_A", "Sword_Regular_B", "Sword_Regular_C", "Sword_Regular_Combo", "Sword_Attack",
    "Sword_Attack_Air_Vertical", "Sword_Dash_RM", "Chop_Tree", "Melee_Hook", "Kick_Breach", "Attack_Ground_Pound",
    "Punch_Jab", "Punch_Cross", "Shield_Dash_RM", "Slide", "Slide_Start", "Slide_Exit", "Push",
    # defence / reactions
    "Sword_Block", "Roll", "Dodge_back", "Dodge_left", "Dodge_right", "Hit_Chest", "Hit_Head", "Hit_Knockback",
    "Idle_Shield_Break", "LayToIdle", "Death_A", "Death_B", "Power Up", "Victory",
    # pistol
    "Pistol_Idle", "Pistol_Aim_Neutral", "Pistol_Aim_Up", "Pistol_Aim_Down", "Pistol_Shoot", "Pistol_Reload",
]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_m2m():
    """Imports the three Mesh2Motion GLBs; keeps one armature with every action."""
    arm = None
    for name in ("human-base-animations.glb", "human-addon-animations.glb", "human-mocap-animations.glb"):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(rig_body.M2M, name))
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.type == "ARMATURE" and arm is None:
                arm = o
        for o in new:
            if o is not arm:
                bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.objects):
        if o is not arm:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.armatures):
        if a.users == 0:
            bpy.data.armatures.remove(a)
    arm.name = "Jason_Rig"
    arm.data.name = "Jason_Rig"
    return arm


def world_joints(arm):
    mw = arm.matrix_world
    return {b.name: np.array(mw @ b.head_local) for b in arm.data.bones}


def make_body_mesh(body, posed_verts):
    nb = 13380
    verts = posed_verts[:nb]
    me = bpy.data.meshes.new("Jason_Body")
    me.from_pydata(verts.tolist(), [], body["faces"])
    uv = me.uv_layers.new(name="UVMap")
    loop_uv = []
    for f in body["face_uvs"]:
        for i in f:
            loop_uv.append(body["uvs"][i])
    uv.data.foreach_set("uv", np.array(loop_uv).ravel())
    me.validate()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("Jason_Body", me)
    bpy.context.scene.collection.objects.link(ob)
    for bone, lst in body["weights"].items():
        if not lst:
            continue
        g = ob.vertex_groups.new(name="root" if bone == "Root" else bone)
        for vi, w in lst:
            if vi < nb:
                g.add([vi], w, "REPLACE")
    return ob


def fit_armature(arm, posed, scale):
    """Moves joints to Jason's while keeping each bone's rest orientation."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    inv = arm.matrix_world.inverted()
    eb = arm.data.edit_bones
    saved = {b.name: (b.head.copy(), b.tail.copy(), b.roll) for b in eb}
    for b in eb:
        b.use_connect = False
    for b in eb:
        h, t, roll = saved[b.name]
        if b.name == "root":
            new_h = Vector((0, 0, 0))
        elif b.name in posed:
            new_h = inv @ Vector(posed[b.name])
        else:
            print("no joint for", b.name)
            new_h = h * scale
        d = (t - h)
        b.head = new_h
        b.tail = new_h + d * scale
        b.roll = roll
    bpy.ops.object.mode_set(mode="OBJECT")


def scale_translations(arm, scale, keep):
    for act in list(bpy.data.actions):
        if act.name not in keep:
            bpy.data.actions.remove(act)
            continue
        for fc in iter_fcurves(act):
            if fc.data_path.endswith(".location") or fc.data_path == "location":
                for kp in fc.keyframe_points:
                    kp.co[1] *= scale
                    kp.handle_left[1] *= scale
                    kp.handle_right[1] *= scale


def iter_fcurves(act):
    if hasattr(act, "layers") and len(getattr(act, "layers", [])):
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves
    else:
        yield from act.fcurves


def build(body_only=False, all_clips=False, out_name="jason.glb"):
    reset()
    arm = import_m2m()
    target = world_joints(arm)
    body = mh_body.build()
    posed_v, posed_j, _ = rig_body.pose_to_tpose(body, target)
    m2m_h = target["head_leaf"][2]
    jason_h = posed_j["head_leaf"][2]
    scale = jason_h / m2m_h
    print("height scale", round(scale, 4))
    fit_armature(arm, posed_j, scale)
    body_ob = make_body_mesh(body, posed_v)
    parts = [body_ob]
    if not body_only:
        import suit
        body["eyes"] = {s: posed_v[mh_body._ranges(body["vgroups"][f"joint-{s}-eye"])].mean(axis=0)
                        for s in ("l", "r")}
        parts = suit.build(body_ob, arm, body, posed_v, posed_j)
        # the suit covers him completely; the bare body stays in the .blend for
        # the unmasked/civilian work but is not exported
        body_ob.hide_render = True
    for ob in parts:
        ob.parent = arm
        mod = ob.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
    names = {a.name for a in bpy.data.actions}
    keep = names if all_clips else {c for c in CLIPS if c in names}
    missing = [c for c in CLIPS if c not in names]
    if missing:
        print("missing clips:", missing)
    scale_translations(arm, scale, keep)
    # Every kept action goes on its own NLA track so the exporter writes them all
    arm.animation_data_create()
    arm.animation_data.action = None
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)
    for act in sorted(bpy.data.actions, key=lambda a: a.name):
        tr = arm.animation_data.nla_tracks.new()
        tr.name = act.name
        st = tr.strips.new(act.name, int(act.frame_range[0]), act)
        if hasattr(st, "action_slot") and act.slots:
            st.action_slot = act.slots[0]
        tr.mute = True
    out_dir = os.path.join(ROOT, "build") if body_only else OUT  # body-only is a debug build
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, out_name)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [arm] + parts:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS",
        export_anim_single_armature=True, export_force_sampling=True,
        export_frame_step=1, export_def_bones=False,
        export_image_format="AUTO", export_apply=False,
        export_yup=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "build", out_name.replace(".glb", ".blend")))
    print("wrote", path, os.path.getsize(path) // 1024, "KB")
    return arm, parts


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    build(body_only="--body-only" in sys.argv, all_clips="--all-clips" in sys.argv,
          out_name="jason_body.glb" if "--body-only" in sys.argv else "jason.glb")
