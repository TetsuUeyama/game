"""Anna_rig (ARP-style rig in ANNA blend) のレストポーズ判定。

主要 arm bone のワールド方向を測り、QM と比較できる形で出力。
"""
import bpy
import sys
import os
import json
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
extra = argv[idx + 1:]
OUT_JSON = extra[0] if extra else os.path.abspath("output/anna_rig_pose.json")
TARGET = extra[1] if len(extra) > 1 else "Anna_rig"

arm = bpy.data.objects.get(TARGET)
if arm is None or arm.type != "ARMATURE":
    print(f"ERROR: {TARGET} not found or not armature")
    sys.exit(1)
print(f"target: {arm.name} ({len(arm.data.bones)} bones)")

w = arm.matrix_world
key_bones = [
    "c_arm_fk.l", "c_arm_fk.r",
    "c_arm_stretch.l", "c_arm_stretch.r",
    "c_forearm_stretch.l", "c_forearm_stretch.r",
    "shoulder.l", "shoulder.r",
    "c_thigh_fk.l", "c_thigh_fk.r",
    "c_leg_fk.l", "c_leg_fk.r",
    "head.x", "neck.x",
    "c_spine_01.x", "c_spine_02.x", "c_spine_03.x",
]
report = {"armature": arm.name, "world_matrix": [list(r) for r in w],
          "bones": [], "verdict": None}
arm_aligned_x = 0
arm_total = 0
for nm in key_bones:
    b = arm.data.bones.get(nm)
    if b is None:
        report["bones"].append({"name": nm, "found": False})
        continue
    head = w @ Vector(b.head_local)
    tail = w @ Vector(b.tail_local)
    v = tail - head
    L = v.length
    if L < 1e-6:
        report["bones"].append({"name": nm, "found": True, "length": 0})
        continue
    n = (v / L)
    axis = max(range(3), key=lambda i: abs(n[i]))
    sign = '+' if n[axis] >= 0 else '-'
    print(f"  {nm:30s} dir={sign}{'XYZ'[axis]} len={L:.3f} "
          f"vec=({n.x:+.2f}, {n.y:+.2f}, {n.z:+.2f}) "
          f"head=({head.x:+.2f},{head.y:+.2f},{head.z:+.2f})")
    report["bones"].append({
        "name": nm, "found": True, "length": L,
        "vec": [n.x, n.y, n.z],
        "head": [head.x, head.y, head.z],
        "tail": [tail.x, tail.y, tail.z],
        "dominant_axis": "XYZ"[axis], "sign": sign,
    })
    if "arm" in nm and "thigh" not in nm:
        arm_total += 1
        if axis == 0:
            arm_aligned_x += 1

if arm_total > 0:
    ratio = arm_aligned_x / arm_total
    if ratio > 0.6:
        verdict = f"T-pose ({arm_aligned_x}/{arm_total} arm bones X-aligned)"
    else:
        verdict = f"NOT T-pose ({arm_aligned_x}/{arm_total} arm bones X-aligned)"
    report["verdict"] = verdict
    print(f"\nverdict: {verdict}")

out_dir = os.path.dirname(OUT_JSON)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print(f"\nwrote {OUT_JSON}")
