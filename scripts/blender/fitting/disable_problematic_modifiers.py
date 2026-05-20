"""Body 等のメッシュから ARMATURE 以外の modifier を無効化して保存し直す。

CORRECTIVE_SMOOTH / MESH_DEFORM / SUBSURF が voxelize 評価時にメッシュ形状を
変えてしまうため、voxelize 直前に無効化する。

Usage:
  blender --background <in.blend> --python disable_problematic_modifiers.py -- <out.blend>
"""
import bpy, sys, os

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
OUT_BLEND = args[0]

# Modifier types to disable for voxelize (keep ARMATURE for skinning)
DISABLE_TYPES = {"SUBSURF", "CORRECTIVE_SMOOTH", "MESH_DEFORM", "MASK"}

n = 0
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    for m in o.modifiers:
        if m.type in DISABLE_TYPES and m.show_viewport:
            m.show_viewport = False
            m.show_render = False
            n += 1
print(f"Disabled {n} modifiers across all meshes")

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT_BLEND))
print(f"Saved: {OUT_BLEND}")
