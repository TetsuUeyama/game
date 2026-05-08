"""Helena Witch - Leggings を以下に前処理:
  1. Z<0.1 (足/sandal 領域) を別オブジェクト "Helena Witch - Sandals" に分離
  2. 残った Leggings 本体の穴閉じ (Fill Holes)
  3. 派生 .blend に保存 → fit 用ソースとして使う

Usage:
  blender --background <helena.blend> --python preprocess_helena_witch_leggings.py -- <out_blend>

Output:
  <out_blend>: Helena.blend に新規 2 オブジェクト追加した派生ファイル
"""
import bpy
import bmesh
import sys, os
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 1:
    print(__doc__); sys.exit(1)

OUT_BLEND = args[0]
SANDAL_Z_MAX = 0.10  # Z<0.10 m を sandal 領域とみなす (Helena 元世界座標、地面 Z=0 想定)

LEGGINGS_NAME = "Helena Witch - Leggings"
LEGGINGS_FIXED_NAME = "Helena Witch - Leggings Fixed"
SANDALS_NAME = "Helena Witch - Sandals"

print(f"\n=== Preprocess Helena Witch Leggings ===")
print(f"  out_blend: {OUT_BLEND}")
print(f"  sandal Z max: {SANDAL_Z_MAX}")

src = bpy.data.objects.get(LEGGINGS_NAME)
if src is None:
    print(f"ERROR: {LEGGINGS_NAME} not found")
    sys.exit(1)
print(f"  source: {src.name} ({len(src.data.vertices)} verts)")

# Step 1: Single-user duplicate as Sandals (will keep Z<0.1)
sandals = src.copy()
sandals.data = src.data.copy()  # ← single-user mesh data (no shared block)
sandals.name = SANDALS_NAME
bpy.context.scene.collection.objects.link(sandals)
print(f"\n[1] Single-user duplicate -> {sandals.name}")

# Delete vertices with Z >= 0.1 (keep only sandal area) via bmesh
bm = bmesh.new()
bm.from_mesh(sandals.data)
bm.verts.ensure_lookup_table()
mat = sandals.matrix_world
to_delete = [v for v in bm.verts if (mat @ v.co).z >= SANDAL_Z_MAX]
print(f"  sandals: {len(to_delete)} verts to delete (Z>={SANDAL_Z_MAX})")
bmesh.ops.delete(bm, geom=to_delete, context='VERTS')
# Subdivide sandals once for higher poly density (helps strap voxelization)
# (do NOT fill_holes — sandals have intentional gaps between straps)
print(f"  sandals: weld close verts and subdivide for higher density")
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(sandals.data)
bm.free()
sandals.data.update()
print(f"  sandals: {len(sandals.data.vertices)} verts after subdivide")

# Step 2: Single-user duplicate as Leggings Fixed (will keep Z>=0.1, then fill holes)
leggings = src.copy()
leggings.data = src.data.copy()
leggings.name = LEGGINGS_FIXED_NAME
bpy.context.scene.collection.objects.link(leggings)
print(f"\n[2] Single-user duplicate -> {leggings.name}")

# Delete vertices with Z < 0.1 (keep only leggings area) via bmesh
bm = bmesh.new()
bm.from_mesh(leggings.data)
bm.verts.ensure_lookup_table()
mat = leggings.matrix_world
to_delete = [v for v in bm.verts if (mat @ v.co).z < SANDAL_Z_MAX]
print(f"  leggings: {len(to_delete)} verts to delete (Z<{SANDAL_Z_MAX})")
bmesh.ops.delete(bm, geom=to_delete, context='VERTS')

# Step 3: Cleanup only (NO hole filling — leggings is strap-style with intentional gaps)
# サンダル側と同じく、紐の隙間は本来開いているのでそのまま voxelize_mustardui に渡す。
# voxelize 側を --no-interior で呼ぶことで、surface voxelize のみ → ストラップだけ残る。
print(f"\n[3a] Weld close verts (merge_by_distance 0.001m)")
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)

# Pass B: tiny-only fill (sides=4) で voxelize を妨げる微小な seam だけ閉じる。
# 紐穴 (大穴) は sides=4 では閉じない。底面 cut (足首) は保護済み。
mat_lg = leggings.matrix_world
BOTTOM_PROTECT_Z = SANDAL_Z_MAX + 0.03
def edge_is_bottom_cut(e):
    z0 = (mat_lg @ e.verts[0].co).z
    z1 = (mat_lg @ e.verts[1].co).z
    return z0 < BOTTOM_PROTECT_Z and z1 < BOTTOM_PROTECT_Z

edges_to_fill = [e for e in bm.edges if e.is_boundary and not edge_is_bottom_cut(e)]
bottom_skipped = sum(1 for e in bm.edges if e.is_boundary and edge_is_bottom_cut(e))
print(f"[3b] tiny-fill (sides=4): {len(edges_to_fill)} candidate edges (skip bottom={bottom_skipped})")
if edges_to_fill:
    bmesh.ops.holes_fill(bm, edges=edges_to_fill, sides=4)

# Pass C: recompute normals
print(f"\n[3c] Recompute normals")
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

# Pass D: subdivide for higher polygon density (helps voxelization sample density)
print(f"\n[3d] Subdivide once for higher poly density")
bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)

bm.to_mesh(leggings.data)
bm.free()
leggings.data.update()
print(f"  leggings: {len(leggings.data.vertices)} verts after all repair")

# Border edges check for both
def count_borders(obj):
    me = obj.data
    edge_face_count = {}
    for poly in me.polygons:
        verts = list(poly.vertices)
        for i in range(len(verts)):
            ek = tuple(sorted([verts[i], verts[(i+1)%len(verts)]]))
            edge_face_count[ek] = edge_face_count.get(ek, 0) + 1
    border = sum(1 for c in edge_face_count.values() if c == 1)
    return border, len(edge_face_count)

l_b, l_e = count_borders(leggings)
s_b, s_e = count_borders(sandals)
print(f"\n  {leggings.name}: edges={l_e}, border (open): {l_b}")
print(f"  {sandals.name}: edges={s_e}, border (open): {s_b}")

# Save
print(f"\n[4] Save derivative blend")
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved: {OUT_BLEND}")
print(f"\n=== DONE ===")
