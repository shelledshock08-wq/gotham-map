"""Training dummy for the test arena: the Mesh2Motion mannequin (CC0) with
the hit/death/fight clips, in a plain matte material. A placeholder enemy."""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_jason  # noqa: E402
import rig_body  # noqa: E402

CLIPS = ["Idle_A", "Fighting Idle", "Hit_Chest", "Hit_Head", "Hit_Knockback", "Death_A", "Death_B", "Death_C",
         "Punch_Jab", "Punch_Cross", "Walk", "Jog", "Dizzy", "Idle Hurt", "Zombie_Rise"]

build_jason.reset()
arm = None
mesh = None
for name in ("human-base-animations.glb", "human-addon-animations.glb"):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(rig_body.M2M, name))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if arm is None and o.type == "ARMATURE":
            arm = o
        elif mesh is None and o.type == "MESH" and o.parent is not None and o.parent.type == "ARMATURE":
            mesh = o  # the skinned mannequin (the file also has a loose Icosphere)
    for o in new:
        if o not in (arm, mesh):
            bpy.data.objects.remove(o, do_unlink=True)
arm.name = "Dummy_Rig"
mat = bpy.data.materials.new("dummy")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.32, 0.29, 0.25, 1)
bsdf.inputs["Roughness"].default_value = 0.8
mesh.data.materials.clear()
mesh.data.materials.append(mat)
for a in list(bpy.data.actions):
    if a.name not in CLIPS:
        bpy.data.actions.remove(a)
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
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
mesh.select_set(True)
out = os.path.join(build_jason.OUT, "dummy.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_animations=True,
                          export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_def_bones=False)
print("wrote", out, os.path.getsize(out) // 1024, "KB")
