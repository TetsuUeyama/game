"""指定 armature の全 bone について name → parent_name を JSON 出力。
deform 以外の controller/IK/offset 系も含めるので、Phase 2 の parent chain
解決に使える。

Usage:
  blender --background <blend> --python dump_full_parent_map.py -- <arm_name> <out.json>
"""
import bpy
import json
import os
import sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
if len(args) < 2:
    print(__doc__); sys.exit(1)
arm_name, out_path = args[0], args[1]

arm = bpy.data.objects.get(arm_name)
if arm is None or arm.type != "ARMATURE":
    print(f"ERROR: armature {arm_name!r} not found")
    sys.exit(1)

bones = []
for b in arm.data.bones:
    bones.append({
        "name": b.name,
        "parent": b.parent.name if b.parent else None,
        "use_deform": b.use_deform,
        "head_rest": list(b.head_local),
        "tail_rest": list(b.tail_local),
    })

out_dir = os.path.dirname(out_path)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump({"armature": arm.name, "bone_count": len(bones), "bones": bones}, f, indent=1)
print(f"  wrote {len(bones)} bones → {out_path}")
