"""1 つの blend ファイルから複数の bone region を一括抽出する。

入力: bone 名のリストと出力 directory
出力: 各 bone について <out_dir>/<bone_name>.json

Usage:
  blender --background <blend> --python extract_multiple_regions.py -- \\
    <body_mesh_name> <weight_threshold> <out_dir> \\
    <primary_bone[:extra1,extra2][=out_name] | ...> [... more bones ...]

extra bone は ":" で区切ってカンマ区切り。指定すると weights_extra に追加。
"=out_name" で出力ファイル名を指定 (省略時は primary_bone)。例えば Helena から
"DEF-breast.L=breast_l" を抽出すると breast_l.json として保存される。

例:
  blender --background "E:/MOdel/QueenMarika_Rigged_MustardUI.blend" \\
    --python scripts/build/extract_multiple_regions.py -- \\
    "Queen Marika Body" 0.3 "public/box5/build/qm_bone_regions" \\
    breast_l:nipple_l breast_r:nipple_r c_arm_stretch.l c_forearm_stretch.l \\
    c_thigh_stretch.l c_leg_stretch.l shoulder.l hand.l foot.l \\
    c_spine_01_bend.x c_spine_03_bend.x neck.x head.x
"""
import bpy
import sys
import os
import json


argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
if len(args) < 4:
    print(__doc__); sys.exit(1)

BODY_MESH = args[0]
THRESHOLD = float(args[1])
OUT_DIR = args[2]
BONE_SPECS = args[3:]  # ["breast_l:nipple_l", "c_arm_stretch.l", ...]

print(f"\n=== extract_multiple_regions ===")
print(f"  body mesh = {BODY_MESH!r}")
print(f"  threshold = {THRESHOLD}")
print(f"  out dir   = {OUT_DIR}")
print(f"  bones ({len(BONE_SPECS)}): {BONE_SPECS}")

body = bpy.data.objects.get(BODY_MESH)
if body is None or body.type != 'MESH':
    print(f"ERROR: body mesh {BODY_MESH!r} not found"); sys.exit(1)
mesh = body.data
os.makedirs(os.path.abspath(OUT_DIR), exist_ok=True)


def extract_region(primary_bone: str, extra_bones: list):
    """1 bone region を抽出。primary_bone が存在しない場合 None を返す。"""
    vg = body.vertex_groups.get(primary_bone)
    if vg is None:
        return None, f"vgroup {primary_bone!r} not on body mesh"
    vg_idx = vg.index

    selected_verts = set()
    for v in mesh.vertices:
        for g in v.groups:
            if g.group == vg_idx and g.weight >= THRESHOLD:
                selected_verts.add(v.index)
                break
    if not selected_verts:
        return None, f"no verts ≥ {THRESHOLD}"

    extra_vg_indices = {}
    for eb in extra_bones:
        evg = body.vertex_groups.get(eb)
        if evg is None:
            print(f"    warning: extra {eb!r} not on body — skipping")
            continue
        extra_vg_indices[eb] = evg.index

    old_to_new = {}
    positions = []
    weights = []
    extra_weights = {eb: [] for eb in extra_vg_indices}
    for old_idx in sorted(selected_verts):
        v = mesh.vertices[old_idx]
        old_to_new[old_idx] = len(positions) // 3
        w = body.matrix_world @ v.co
        positions.extend([w.x, w.y, w.z])
        vert_w = {g.group: g.weight for g in v.groups}
        weights.append(vert_w.get(vg_idx, 0.0))
        for eb, eidx in extra_vg_indices.items():
            extra_weights[eb].append(vert_w.get(eidx, 0.0))

    indices = []
    for poly in mesh.polygons:
        loop_verts = [mesh.loops[li].vertex_index for li in poly.loop_indices]
        if not all(v in selected_verts for v in loop_verts):
            continue
        new_verts = [old_to_new[v] for v in loop_verts]
        for k in range(1, len(new_verts) - 1):
            indices.extend([new_verts[0], new_verts[k], new_verts[k + 1]])

    return {
        "bone": primary_bone,
        "weight_threshold": THRESHOLD,
        "vertex_count": len(positions) // 3,
        "triangle_count": len(indices) // 3,
        "positions_zup": positions,
        "indices": indices,
        "weights": weights,
        "weights_extra": extra_weights,
    }, None


count_ok = 0
count_fail = 0
for spec in BONE_SPECS:
    # Parse "primary[:extras][=out_name]"
    out_name = None
    if "=" in spec:
        spec, out_name = spec.split("=", 1)
    parts = spec.split(":")
    primary = parts[0]
    extras = parts[1].split(",") if len(parts) > 1 and parts[1] else []
    if out_name is None:
        out_name = primary
    print(f"\n  -- {primary!r}{' + ' + str(extras) if extras else ''} → {out_name!r}")
    region, err = extract_region(primary, extras)
    if region is None:
        print(f"    skip: {err}")
        count_fail += 1
        continue
    fname = out_name.replace("/", "_") + ".json"
    out_path = os.path.join(os.path.abspath(OUT_DIR), fname)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(region, f)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"    verts={region['vertex_count']}, tris={region['triangle_count']}, saved {size_kb:.1f} KB")
    count_ok += 1

print(f"\n=== DONE: {count_ok} OK / {count_fail} fail ===")
