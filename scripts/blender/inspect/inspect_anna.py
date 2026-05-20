"""Anna_Williams_(T8)_by_Mokujinh.blend の構造を調査。

armature / mesh / vertex group / shape key / bone 命名規則 / T ポーズ判定を
一覧化し、transplant + shrinkwrap パイプラインに必要な情報を集める。

print 出力に加え、JSON ダンプを out_path (sys.argv の最後 or デフォルト
`output/anna_inspect.json`) に保存する。
"""
import bpy
import sys
import os
import json
from mathutils import Vector

# ---- args ----
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
extra = argv[idx + 1:]
OUT_JSON = extra[0] if extra else os.path.abspath("output/anna_inspect.json")

print("\n=== inspect_anna ===")
print(f"  out_json: {OUT_JSON}")

report = {
    "blend_file": bpy.data.filepath,
    "armatures": [],
    "meshes_with_armature": [],
    "meshes_no_armature": [],
    "bone_name_patterns": {},
    "t_pose_check": None,
}

# ---- armatures ----
print("\nArmatures:")
arm_objs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
for o in arm_objs:
    bones = list(o.data.bones)
    n_def = sum(1 for b in bones if b.use_deform)
    bone_names = [b.name for b in bones]
    print(f"  {o.name}: {len(bones)} bones ({n_def} deform)")
    print(f"    sample bones: {bone_names[:15]}")
    report["armatures"].append({
        "name": o.name,
        "bone_count": len(bones),
        "deform_count": n_def,
        "bone_names": bone_names,
    })

# ---- meshes (with armature modifier) ----
print("\nMeshes (with armature modifier):")
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    arm_mods = [m for m in o.modifiers if m.type == 'ARMATURE']
    if not arm_mods:
        continue
    arm_name = arm_mods[0].object.name if arm_mods[0].object else None
    n_v = len(o.data.vertices)
    n_vg = len(o.vertex_groups)
    n_keys = len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0
    print(f"  {o.name}: verts={n_v} vgroups={n_vg} shape_keys={n_keys} arm={arm_name}")
    report["meshes_with_armature"].append({
        "name": o.name,
        "verts": n_v,
        "vgroups": n_vg,
        "shape_keys": n_keys,
        "armature": arm_name,
        "vgroup_names": [vg.name for vg in o.vertex_groups],
    })

# ---- meshes (no armature) ----
print("\nMeshes (NO armature):")
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    arm_mods = [m for m in o.modifiers if m.type == 'ARMATURE']
    if arm_mods:
        continue
    n_v = len(o.data.vertices)
    print(f"  {o.name}: verts={n_v}")
    report["meshes_no_armature"].append({"name": o.name, "verts": n_v})

# ---- main armature: bone naming patterns ----
main_arm = None
for o in arm_objs:
    if main_arm is None or sum(1 for b in o.data.bones if b.use_deform) > \
            sum(1 for b in main_arm.data.bones if b.use_deform):
        main_arm = o

if main_arm:
    print(f"\nBone naming patterns in main armature ({main_arm.name}):")
    bones = [b.name for b in main_arm.data.bones]
    patterns = {}
    for n in bones:
        if '-' in n:
            prefix = n.split('-')[0]
        elif '.' in n:
            prefix = n.split('.')[0]
        else:
            prefix = n[:5]
        patterns[prefix] = patterns.get(prefix, 0) + 1
    sorted_patterns = sorted(patterns.items(), key=lambda x: -x[1])
    for p, c in sorted_patterns[:20]:
        print(f"  '{p}': {c} bones")
    report["bone_name_patterns"] = dict(sorted_patterns)

    # ---- T-pose check ----
    # In a T-pose, upper arm bones should point along the X axis (+/-).
    # We grab the world-space tail-head vector for likely shoulder/upper-arm
    # bones and report the dominant axis direction so the user can confirm.
    arm_world = main_arm.matrix_world
    candidates = []
    needles = ["arm", "shoulder", "upperarm", "upper_arm"]
    for b in main_arm.data.bones:
        lname = b.name.lower()
        if any(k in lname for k in needles):
            head_w = arm_world @ Vector(b.head_local)
            tail_w = arm_world @ Vector(b.tail_local)
            v = tail_w - head_w
            length = v.length
            if length < 1e-6:
                continue
            n = v.normalized()
            # dominant axis: axis index of max abs component
            axis_idx = max(range(3), key=lambda i: abs(n[i]))
            sign = '+' if n[axis_idx] >= 0 else '-'
            candidates.append({
                "bone": b.name,
                "length": length,
                "vec": [n.x, n.y, n.z],
                "dominant_axis": "XYZ"[axis_idx],
                "sign": sign,
            })
    print(f"\nT-pose check ({len(candidates)} arm-like bones):")
    for c in candidates[:20]:
        print(f"  {c['bone']}: dir={c['sign']}{c['dominant_axis']} "
              f"len={c['length']:.3f} vec=({c['vec'][0]:+.2f}, "
              f"{c['vec'][1]:+.2f}, {c['vec'][2]:+.2f})")
    report["t_pose_check"] = {
        "main_armature": main_arm.name,
        "arm_bones": candidates,
    }
    # Quick verdict
    x_aligned = sum(1 for c in candidates if c["dominant_axis"] == "X")
    if candidates:
        ratio = x_aligned / len(candidates)
        if ratio > 0.6:
            verdict = "T-pose likely (arm bones X-aligned)"
        else:
            verdict = "NOT T-pose (arm bones not X-aligned)"
        print(f"\n  verdict: {verdict} ({x_aligned}/{len(candidates)} X-aligned)")
        report["t_pose_check"]["verdict"] = verdict

# ---- save ----
out_dir = os.path.dirname(OUT_JSON)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print(f"\n  wrote {OUT_JSON}")
print("\n=== DONE ===")
