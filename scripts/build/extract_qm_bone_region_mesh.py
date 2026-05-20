"""QM Body から指定 bone に紐づく vertex region を抽出して JSON 出力する。

ある QM bone を選び、その bone に weight が乗っている頂点と、その頂点だけで構成される
face を集めて単一メッシュデータ (positions + indices) を JSON に書き出す。
ブラウザ側で /build の QM canonical panel に該当領域メッシュを描画するため。

第 5 引数以降で extra_bones を指定すると、各頂点の "weights_extra" として
追加 bone への weight も書き出す (例: breast_l 領域に nipple_l weight も格納)。
これにより region 内の sub-bone 分布を browser 側で参照できる。

Usage:
  blender --background <qm.blend> --python extract_qm_bone_region_mesh.py -- \\
    <body_mesh_name> <primary_bone> <weight_threshold> <out_json> \\
    [<extra_bone_1> <extra_bone_2> ...]

例:
  blender --background "E:/MOdel/QueenMarika_Rigged_MustardUI.blend" \\
    --python scripts/build/extract_qm_bone_region_mesh.py -- \\
    "Queen Marika Body" breast_l 0.3 \\
    public/box5/build/qm_bone_regions/breast_l.json \\
    nipple_l
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
BONE_NAME = args[1]
THRESHOLD = float(args[2])
OUT_JSON  = args[3]
EXTRA_BONES = args[4:]  # additional bones to record weights for

print(f"\n=== extract_qm_bone_region_mesh ===")
print(f"  body mesh    = {BODY_MESH!r}")
print(f"  primary bone = {BONE_NAME!r}")
print(f"  weight ≥     {THRESHOLD}")
print(f"  extra bones  = {EXTRA_BONES}")
print(f"  out json     = {OUT_JSON}")

body = bpy.data.objects.get(BODY_MESH)
if body is None or body.type != 'MESH':
    print(f"ERROR: body mesh {BODY_MESH!r} not found"); sys.exit(1)

vg = body.vertex_groups.get(BONE_NAME)
if vg is None:
    print(f"ERROR: vertex group {BONE_NAME!r} not on body mesh"); sys.exit(1)

mesh = body.data
vg_idx = vg.index

# Find vertices with weight ≥ threshold
selected_verts = set()
for v in mesh.vertices:
    for g in v.groups:
        if g.group == vg_idx and g.weight >= THRESHOLD:
            selected_verts.add(v.index)
            break
print(f"  selected verts: {len(selected_verts)} / {len(mesh.vertices)}")

if not selected_verts:
    print(f"ERROR: no vertices with weight ≥ {THRESHOLD} for bone {BONE_NAME!r}"); sys.exit(1)

# Look up vgroup indices for extra bones
extra_vg_indices = {}
for eb in EXTRA_BONES:
    evg = body.vertex_groups.get(eb)
    if evg is None:
        print(f"  warning: extra bone vgroup {eb!r} not on body mesh — skipping")
        continue
    extra_vg_indices[eb] = evg.index

# Build a new local-vertex index for the selected verts
old_to_new = {}
positions = []
weights = []
extra_weights = {eb: [] for eb in extra_vg_indices}
for old_idx in sorted(selected_verts):
    v = mesh.vertices[old_idx]
    old_to_new[old_idx] = len(positions) // 3
    w = body.matrix_world @ v.co
    positions.extend([w.x, w.y, w.z])
    # Collect weight to primary bone and each extra bone
    vert_weights_by_idx = {g.group: g.weight for g in v.groups}
    weights.append(vert_weights_by_idx.get(vg_idx, 0.0))
    for eb, eidx in extra_vg_indices.items():
        extra_weights[eb].append(vert_weights_by_idx.get(eidx, 0.0))

# Build face indices for faces whose *all* corner verts are selected
indices = []
n_faces_kept = 0
for poly in mesh.polygons:
    loop_verts = [mesh.loops[li].vertex_index for li in poly.loop_indices]
    if not all(v in selected_verts for v in loop_verts):
        continue
    n_faces_kept += 1
    new_verts = [old_to_new[v] for v in loop_verts]
    # Triangulate fan (works for tri/quad/ngon)
    for k in range(1, len(new_verts) - 1):
        indices.extend([new_verts[0], new_verts[k], new_verts[k + 1]])
print(f"  faces kept:  {n_faces_kept} (triangles emitted: {len(indices)//3})")

# Bbox for diagnostics
xs = positions[0::3]; ys = positions[1::3]; zs = positions[2::3]
print(f"  bbox (Blender Z-up): X=[{min(xs):.3f},{max(xs):.3f}] Y=[{min(ys):.3f},{max(ys):.3f}] Z=[{min(zs):.3f},{max(zs):.3f}]")

out = {
    "bone": BONE_NAME,
    "weight_threshold": THRESHOLD,
    "vertex_count": len(positions) // 3,
    "triangle_count": len(indices) // 3,
    # Blender Z-up coords. The viewer must convert to Babylon Y-up:
    # (bx, by, bz) → (bx, bz, -by)
    "positions_zup": positions,
    "indices": indices,
    "weights": weights,
    "weights_extra": extra_weights,  # {bone_name: [weight per vertex]}
}
out_dir = os.path.dirname(os.path.abspath(OUT_JSON))
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(out, f)
size_kb = os.path.getsize(OUT_JSON) / 1024
print(f"  saved: {OUT_JSON} ({size_kb:.1f} KB)")
print(f"\n=== DONE ===")
