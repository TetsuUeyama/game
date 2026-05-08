"""QM body から内殻 face を削除した「外殻のみ body」を別 blend に保存。

検出方法:
  6 方向（±X, ±Y, ±Z）から ray を投げ、その face が「最初の hit」であれば外殻。
  どの方向からも見えない face = 別の face に隠れている = 内殻。

Usage:
  blender --background <qm.blend> --python create_qm_outer_body.py -- \
    <qm_body_name> <out_blend>
"""
import bpy
import sys
import os
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 2:
    print(__doc__); sys.exit(1)

QM_BODY_NAME, OUT_BLEND = args[:2]

print(f"\n=== create_qm_outer_body ===")
print(f"  body: {QM_BODY_NAME}")
print(f"  out:  {OUT_BLEND}")

qm_body = bpy.data.objects.get(QM_BODY_NAME)
if not qm_body:
    print(f"ERROR: {QM_BODY_NAME} not found"); sys.exit(1)

# Build BMesh in world space
bm = bmesh.new()
bm.from_mesh(qm_body.data)
bm.transform(qm_body.matrix_world)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.faces.ensure_lookup_table()
print(f"  loaded: {len(bm.verts)} verts, {len(bm.faces)} faces")

# Compute bbox to determine "external" distance
mn = Vector((1e9, 1e9, 1e9))
mx = Vector((-1e9, -1e9, -1e9))
for v in bm.verts:
    for k in range(3):
        mn[k] = min(mn[k], v.co[k])
        mx[k] = max(mx[k], v.co[k])
bbox_size = max((mx - mn).x, (mx - mn).y, (mx - mn).z) + 1.0
print(f"  bbox size: {bbox_size:.2f}m")

bvh = BVHTree.FromBMesh(bm)

# Detect outer faces via 6-direction ray cast
# A face is "outer" if it's the FIRST hit from any external cardinal direction.
external_directions = [
    Vector((1.0, 0.0, 0.0)),
    Vector((-1.0, 0.0, 0.0)),
    Vector((0.0, 1.0, 0.0)),
    Vector((0.0, -1.0, 0.0)),
    Vector((0.0, 0.0, 1.0)),
    Vector((0.0, 0.0, -1.0)),
]

outer_indices = set()
for fi, f in enumerate(bm.faces):
    fc = f.calc_center_median()
    for direction in external_directions:
        far_pt = fc + direction * bbox_size
        ray_dir = -direction
        hit_loc, _, hit_idx, _ = bvh.ray_cast(far_pt, ray_dir, bbox_size * 2.0)
        if hit_idx == fi:
            outer_indices.add(fi)
            break

n_outer = len(outer_indices)
n_inner = len(bm.faces) - n_outer
print(f"  outer faces: {n_outer}")
print(f"  inner-removed: {n_inner} ({n_inner * 100 / len(bm.faces):.1f}%)")
bm.free()

# CRITICAL: Don't replace mesh data (loses vertex groups).
# Instead, edit the EXISTING mesh in-place via bmesh.from_edit_mesh.
# This preserves all vertex groups, materials, UVs, shape keys.
print(f"  editing existing mesh in-place (preserves vertex groups)...")
bpy.ops.object.select_all(action='DESELECT')
qm_body.select_set(True)
bpy.context.view_layer.objects.active = qm_body
bpy.ops.object.mode_set(mode='EDIT')
bm_edit = bmesh.from_edit_mesh(qm_body.data)
bm_edit.faces.ensure_lookup_table()

# Re-determine outer/inner on the edit mesh (same logic, world-space)
# Need to apply matrix_world to vertex coords for ray casting
import mathutils
mw = qm_body.matrix_world
edit_bvh_bm = bm_edit.copy()
edit_bvh_bm.transform(mw)
bmesh.ops.recalc_face_normals(edit_bvh_bm, faces=edit_bvh_bm.faces)
edit_bvh = BVHTree.FromBMesh(edit_bvh_bm)

faces_to_delete = []
for fi, f in enumerate(bm_edit.faces):
    fc_local = f.calc_center_median()
    fc_world = mw @ fc_local
    # Use face normal in world space
    nl_world = (mw.to_3x3() @ f.normal).normalized()
    is_outer = False
    for direction in external_directions:
        far_pt = fc_world + direction * bbox_size
        ray_dir = -direction
        _, _, hit_idx, _ = edit_bvh.ray_cast(far_pt, ray_dir, bbox_size * 2.0)
        if hit_idx == fi:
            is_outer = True
            break
    if not is_outer:
        faces_to_delete.append(f)

edit_bvh_bm.free()
if faces_to_delete:
    bmesh.ops.delete(bm_edit, geom=faces_to_delete, context='FACES')
# Remove orphan verts
verts_to_delete = [v for v in bm_edit.verts if not v.link_faces]
if verts_to_delete:
    bmesh.ops.delete(bm_edit, geom=verts_to_delete, context='VERTS')
bmesh.update_edit_mesh(qm_body.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"  removed {len(faces_to_delete)} inner faces, {len(verts_to_delete)} orphan verts")
print(f"  vertex groups preserved: {len(qm_body.vertex_groups)}")

# Remove extra body objects we don't need
# (keep qm_body and its armature only, prune Helena meshes etc)

# Save
print(f"\nSave to {OUT_BLEND}")
out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved")
print(f"\n=== DONE ===")
