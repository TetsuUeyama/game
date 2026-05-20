"""argmax 方式で QM bone 単位の mesh region を抽出する。

各頂点を「最も強く支配する QM bone」へ排他的に割当てるため、bone 同士の重なりが無く、
geometric な領域がクリアに切り分けられる。

- QM Body の場合: argmax を QM の deform bone に対して直接計算
- Source Body (Helena 等) の場合: vg_rename を介して Helena bone → QM bone に累積、
  累積 weight に対して argmax を計算

breast_l + nipple_l のような親子 bone は「カテゴリ」としてまとめ、breast_l region に
nipple_l weight も weights_extra として格納する。

Usage:
  blender --background <blend> --python extract_regions_argmax.py -- \\
    <body_mesh> <out_dir> [--vg-rename <config.json>] [--bone-pair <primary>:<sub>] \\
    <qm_bone1> <qm_bone2> ...

例 (QM Body):
  blender --background "E:/MOdel/QueenMarika_Rigged_MustardUI.blend" \\
    --python scripts/build/extract_regions_argmax.py -- \\
    "Queen Marika Body" "public/box5/build/qm_bone_regions" \\
    --bone-pair breast_l:nipple_l --bone-pair breast_r:nipple_r \\
    breast_l breast_r shoulder.l shoulder.r c_arm_stretch.l ...

例 (Helena Body via vg_rename):
  blender --background "E:/MOdel/Helena_Douglas_1.10.blend" \\
    --python scripts/build/extract_regions_argmax.py -- \\
    "Body" "public/box5/build/helena_douglas/source_bone_regions" \\
    --vg-rename "config/clothing_retarget_helena_douglas_to_qm.json" \\
    --bone-pair breast_l:nipple_l --bone-pair breast_r:nipple_r \\
    breast_l breast_r shoulder.l ...
"""
import bpy
import sys
import os
import json


argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
if len(args) < 3:
    print(__doc__); sys.exit(1)

BODY_MESH = args[0]
OUT_DIR = args[1]

# Parse flags + bone list
vg_rename_path = None
bone_pairs = {}  # primary_qm_bone → sub_qm_bone (for storing extra weights)
qm_bones = []
i = 2
while i < len(args):
    if args[i] == "--vg-rename" and i + 1 < len(args):
        vg_rename_path = args[i + 1]; i += 2; continue
    if args[i] == "--bone-pair" and i + 1 < len(args):
        a, b = args[i + 1].split(":", 1)
        bone_pairs[a] = b; i += 2; continue
    qm_bones.append(args[i]); i += 1

print(f"\n=== extract_regions_argmax ===")
print(f"  body mesh   = {BODY_MESH!r}")
print(f"  out dir     = {OUT_DIR}")
print(f"  vg_rename   = {vg_rename_path}")
print(f"  bone pairs  = {bone_pairs}")
print(f"  qm_bones    = {qm_bones}")

vg_rename = {}
if vg_rename_path:
    with open(vg_rename_path, encoding="utf-8") as f:
        cfg = json.load(f)
    vg_rename = cfg.get("vg_rename", {})
    print(f"  loaded {len(vg_rename)} vg_rename entries")

body = bpy.data.objects.get(BODY_MESH)
if body is None or body.type != 'MESH':
    print(f"ERROR: body mesh {BODY_MESH!r} not found"); sys.exit(1)
mesh = body.data

# Map vgroup index → QM bone name. If vg_rename is set, walk Helena names through it.
# Otherwise (QM Body) the vgroup name IS the QM bone name.
vg_idx_to_qm_bone = {}
for vg in body.vertex_groups:
    if vg_rename:
        qm_bone = vg_rename.get(vg.name)
        if qm_bone is not None:
            vg_idx_to_qm_bone[vg.index] = qm_bone
    else:
        vg_idx_to_qm_bone[vg.index] = vg.name

# Sub-bone vgroup indices (for storing extra weights on breast → nipple etc.)
sub_bone_vg_idx = {}  # qm sub bone name → vg index on this body
for primary, sub in bone_pairs.items():
    # Find vg whose mapped qm name == sub
    for vg in body.vertex_groups:
        if vg_idx_to_qm_bone.get(vg.index) == sub:
            sub_bone_vg_idx[sub] = vg.index
            break

qm_bones_set = set(qm_bones)
# Group primary+sub bones into "categories" for argmax — verts dominated by a
# sub bone are still part of the primary's region (e.g. nipple-dominant verts
# go into the breast region with nipple weight in extras).
def category_of(qm_bone):
    for p, s in bone_pairs.items():
        if qm_bone == s: return p
    return qm_bone

# Compute argmax per vertex over ALL vgroups (with weights mapped to QM-named
# categories where vg_rename applies). The dominant category is the vertex's
# primary owner. If it's not in qm_bones target list, the vertex is skipped —
# this prevents non-target bones (e.g. butt_l, eyelid.B.L) from leaking their
# verts into adjacent target regions.
vert_to_category = {}
vert_to_sub_weights = {}
n_skipped_no_qm = 0
n_skipped_not_target = 0
for v in mesh.vertices:
    accum = {}     # category → accumulated weight (both QM and non-QM categories)
    sub_w_here = {}
    for g in v.groups:
        qm = vg_idx_to_qm_bone.get(g.group)
        if qm is None:
            # Use original Helena vgroup name as its own "category" so it can
            # win argmax and the vert gets skipped (not flushed into a target).
            qm = "__UNMAPPED__:" + body.vertex_groups[g.group].name
        cat = category_of(qm)
        accum[cat] = accum.get(cat, 0.0) + g.weight
        if qm != cat:
            sub_w_here[qm] = sub_w_here.get(qm, 0.0) + g.weight
    if not accum:
        continue
    primary = max(accum, key=accum.get)
    if accum[primary] < 1e-6:
        continue
    if primary not in qm_bones_set:
        # Vertex dominated by a non-target bone (e.g. butt_l, jaw, etc.) — skip
        if primary.startswith("__UNMAPPED__"):
            n_skipped_no_qm += 1
        else:
            n_skipped_not_target += 1
        continue
    vert_to_category[v.index] = primary
    vert_to_sub_weights[v.index] = sub_w_here
print(f"  argmax: assigned {len(vert_to_category)}, skipped {n_skipped_no_qm} (no QM mapping), {n_skipped_not_target} (non-target dominant)")

# Group vertices by category
verts_per_bone = {b: [] for b in qm_bones}
for vi, cat in vert_to_category.items():
    verts_per_bone[cat].append(vi)

os.makedirs(os.path.abspath(OUT_DIR), exist_ok=True)
count_ok = 0
count_empty = 0
for qm_bone in qm_bones:
    sel = verts_per_bone[qm_bone]
    if not sel:
        print(f"  -- {qm_bone}: empty (no verts assigned)")
        count_empty += 1
        continue
    sub_bone = bone_pairs.get(qm_bone)
    old_to_new = {}
    positions = []
    weights = []
    extra = {sub_bone: []} if sub_bone else {}
    for old_idx in sorted(sel):
        v = mesh.vertices[old_idx]
        old_to_new[old_idx] = len(positions) // 3
        w = body.matrix_world @ v.co
        positions.extend([w.x, w.y, w.z])
        # weight to primary bone: walk vgroups and find one mapping to qm_bone
        primary_w = 0.0
        for g in v.groups:
            if vg_idx_to_qm_bone.get(g.group) == qm_bone:
                primary_w = max(primary_w, g.weight)
        weights.append(primary_w)
        if sub_bone:
            extra[sub_bone].append(vert_to_sub_weights.get(old_idx, {}).get(sub_bone, 0.0))

    sel_set = set(sel)
    indices = []
    for poly in mesh.polygons:
        loop_verts = [mesh.loops[li].vertex_index for li in poly.loop_indices]
        if not all(v in sel_set for v in loop_verts): continue
        new_verts = [old_to_new[v] for v in loop_verts]
        for k in range(1, len(new_verts) - 1):
            indices.extend([new_verts[0], new_verts[k], new_verts[k + 1]])

    region = {
        "bone": qm_bone,
        "extraction": "argmax",
        "vertex_count": len(positions) // 3,
        "triangle_count": len(indices) // 3,
        "positions_zup": positions,
        "indices": indices,
        "weights": weights,
        "weights_extra": extra,
    }
    out_path = os.path.join(os.path.abspath(OUT_DIR), qm_bone.replace("/", "_") + ".json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(region, f)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"  -- {qm_bone}: verts={region['vertex_count']}, tris={region['triangle_count']}, {size_kb:.1f} KB")
    count_ok += 1

print(f"\n=== DONE: {count_ok} OK / {count_empty} empty ===")
