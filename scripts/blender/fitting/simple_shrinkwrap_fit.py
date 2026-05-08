"""Simple shrinkwrap-based fit for tight clothing.

Per-vertex projection onto QM outer body surface, with per-vertex outward offset
preserved from Helena cloth's distance to Helena body.

This guarantees:
  - No body penetration (MIN_OFFSET enforced)
  - Helena cloth volume preserved per vertex (d_helena → d_qm)
  - Direct, deterministic, no iterative solvers

Usage:
  blender --background <qm.blend> --python simple_shrinkwrap_fit.py -- \
      <config.json> <src.blend> <src_body> <src_cloth> \
      <tgt_body> <tgt_armature> <out.blend> \
      [--tgt-outer-bvh <blend>:<obj>] [--min-offset 0.005]
"""
import bpy
import bmesh
import sys
import os
import json
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index('--') if '--' in argv else len(argv)
args = argv[idx+1:]

if len(args) < 7:
    print(__doc__); sys.exit(1)

CONFIG_JSON = args[0]
SRC_BLEND = args[1]
SRC_BODY = args[2]
SRC_CLOTH = args[3]
TGT_BODY = args[4]
TGT_ARMATURE = args[5]
OUT_BLEND = args[6]

TGT_OUTER_BVH = None
TGT_OUTER_OBJ = None
MIN_OFFSET = 0.005

i = 7
while i < len(args):
    a = args[i]
    if a == '--tgt-outer-bvh' and i + 1 < len(args):
        spec = args[i+1]
        parts = spec.rsplit(':', 1)
        if len(parts) == 2:
            TGT_OUTER_BVH, TGT_OUTER_OBJ = parts[0], parts[1]
        i += 2
    elif a == '--min-offset' and i + 1 < len(args):
        MIN_OFFSET = float(args[i+1]); i += 2
    else:
        i += 1

print(f"\n=== simple_shrinkwrap_fit ===")
print(f"  src: {SRC_BLEND}  body={SRC_BODY}  cloth={SRC_CLOTH}")
print(f"  tgt: body={TGT_BODY}  arm={TGT_ARMATURE}")
print(f"  out: {OUT_BLEND}")
print(f"  min-offset: {MIN_OFFSET*1000:.1f}mm")

INTERNAL_VG_KEYWORDS = ('genital', 'vagina', 'ovary', 'uterus', 'anus', 'intestine',
                        'tongue', 'teeth', 'eye_')
def is_internal_vg(name):
    n = name.lower()
    return any(k in n for k in INTERNAL_VG_KEYWORDS)


def build_bvh_world(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(obj.matrix_world)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    eo.to_mesh_clear()
    centroid = Vector((0, 0, 0))
    n = 0
    for v in bm.verts:
        centroid += v.co; n += 1
    if n > 0: centroid /= n
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    return bvh, centroid


def normal_outward(nearest, normal, centroid):
    out_dir = nearest - centroid
    if out_dir.length > 1e-6:
        if normal.dot(out_dir.normalized()) < 0:
            return -normal
    return normal


# ====== Load target ======
tgt_body_obj = bpy.data.objects.get(TGT_BODY)
tgt_arm_obj = bpy.data.objects.get(TGT_ARMATURE)
if tgt_body_obj is None or tgt_arm_obj is None:
    print("ERROR: target body/arm missing"); sys.exit(1)
tgt_arm_obj.data.pose_position = 'REST'
bpy.context.view_layer.update()

# ====== Append source body+cloth ======
print(f"\n[1] Append source")
with bpy.data.libraries.load(SRC_BLEND, link=False) as (src, dst):
    want = {SRC_BODY, SRC_CLOTH}
    dst.objects = [n for n in src.objects if n in want]

src_body = None
src_cloth = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
    if o.name == SRC_BODY: src_body = o
    if o.name == SRC_CLOTH: src_cloth = o

if src_body is None or src_cloth is None:
    print("ERROR: append failed"); sys.exit(1)

src_arm = None
for m in list(src_body.modifiers) + list(src_cloth.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        src_arm = m.object; break
if src_arm and src_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(src_arm)
    src_arm.hide_viewport = False; src_arm.hide_set(False)
if src_arm:
    src_arm.data.pose_position = 'REST'
bpy.context.view_layer.update()

# Clear cloth shape keys
if src_cloth.data.shape_keys:
    bpy.ops.object.select_all(action='DESELECT')
    src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth
    bpy.ops.object.shape_key_remove(all=True)

print(f"  src body: {len(src_body.data.vertices)} verts, cloth: {len(src_cloth.data.vertices)} verts")

# ====== Load QM outer body if specified ======
print(f"\n[2] Build BVHs")
bvh_obj = tgt_body_obj
loaded_outer = None
if TGT_OUTER_BVH:
    BVH_BLEND_ABS = os.path.abspath(TGT_OUTER_BVH)
    existing = set(o.name for o in bpy.data.objects)
    with bpy.data.libraries.load(BVH_BLEND_ABS, link=False) as (src, dst):
        dst.objects = [TGT_OUTER_OBJ]
    new_objs = [o for o in bpy.data.objects if o.name not in existing]
    for o in new_objs:
        if o.name == TGT_OUTER_OBJ or o.name.startswith(TGT_OUTER_OBJ + '.'):
            bvh_obj = o
            loaded_outer = o
            bpy.context.scene.collection.objects.link(o)
            o.hide_viewport = False; o.hide_set(False)
            break

src_bvh, src_centroid = build_bvh_world(src_body)
tgt_bvh, tgt_centroid = build_bvh_world(bvh_obj)
print(f"  src ({SRC_BODY}) centroid: {tuple(round(c,3) for c in src_centroid)}")
print(f"  tgt ({bvh_obj.name}) centroid: {tuple(round(c,3) for c in tgt_centroid)}")

# ====== Per-vert shrinkwrap fit ======
print(f"\n[3] Per-vert fit (Helena distance preservation)")
cloth_mw = src_cloth.matrix_world.copy()
cloth_mw_inv = cloth_mw.inverted()
n_verts = len(src_cloth.data.vertices)
d_helena_stats = []
n_pushed_min = 0
for v in src_cloth.data.vertices:
    wp = cloth_mw @ v.co
    # Helena distance
    h_near, h_norm, _, _ = src_bvh.find_nearest(wp)
    if h_near is None:
        d_h = MIN_OFFSET
    else:
        h_norm = normal_outward(h_near, h_norm, src_centroid)
        signed_h = (wp - h_near).dot(h_norm)
        d_h = max(signed_h, 0.0)  # clamp negative (cloth inside Helena body) to 0
    d_helena_stats.append(d_h)

    # QM nearest + outward
    q_near, q_norm, _, _ = tgt_bvh.find_nearest(wp)
    if q_near is None:
        continue
    q_norm = normal_outward(q_near, q_norm, tgt_centroid)
    offset = max(d_h, MIN_OFFSET)
    if d_h < MIN_OFFSET:
        n_pushed_min += 1
    new_pos = q_near + q_norm * offset
    v.co = cloth_mw_inv @ new_pos
src_cloth.data.update()

import statistics
mean_d = statistics.mean(d_helena_stats) * 1000
median_d = statistics.median(d_helena_stats) * 1000
max_d = max(d_helena_stats) * 1000
print(f"  Helena distance per vert (mm): mean={mean_d:.1f}, median={median_d:.1f}, max={max_d:.1f}")
print(f"  forced to MIN_OFFSET ({MIN_OFFSET*1000:.1f}mm): {n_pushed_min}/{n_verts} ({100*n_pushed_min/n_verts:.1f}%)")

# ====== Re-target armature + weight transfer (P3-A) ======
print(f"\n[4] Re-target armature + Weight Transfer (outer body source)")
for m in list(src_cloth.modifiers):
    if m.type in ('ARMATURE', 'SUBSURF'):
        src_cloth.modifiers.remove(m)
for vg in list(src_cloth.vertex_groups):
    src_cloth.vertex_groups.remove(vg)

arm_mod = src_cloth.modifiers.new(name='Armature_TGT', type='ARMATURE')
arm_mod.object = tgt_arm_obj
arm_mod.use_vertex_groups = True

bpy.ops.object.select_all(action='DESELECT')
src_cloth.select_set(True)
bpy.context.view_layer.objects.active = src_cloth

weight_src = bvh_obj
print(f"  weight transfer source: {weight_src.name}")

try:
    dt_mod = src_cloth.modifiers.new(name='WeightTransfer', type='DATA_TRANSFER')
    dt_mod.object = weight_src
    dt_mod.use_vert_data = True
    dt_mod.data_types_verts = {'VGROUP_WEIGHTS'}
    dt_mod.vert_mapping = 'POLYINTERP_NEAREST'
    dt_mod.layers_vgroup_select_src = 'ALL'
    dt_mod.layers_vgroup_select_dst = 'NAME'
    dt_mod.mix_mode = 'REPLACE'
    bpy.ops.object.datalayout_transfer(modifier=dt_mod.name)
    while src_cloth.modifiers[0].name != dt_mod.name:
        bpy.ops.object.modifier_move_up(modifier=dt_mod.name)
    bpy.ops.object.modifier_apply(modifier=dt_mod.name)
    print(f"  weight transferred: {len(src_cloth.vertex_groups)} vgroups (pre-cleanup)")

    removed = []
    for vg in list(src_cloth.vertex_groups):
        if is_internal_vg(vg.name):
            removed.append(vg.name)
            src_cloth.vertex_groups.remove(vg)
    print(f"  internal cleanup: removed {len(removed)} groups")
    if len(src_cloth.vertex_groups) > 0:
        bpy.ops.object.vertex_group_normalize_all()
    print(f"  final vgroups: {len(src_cloth.vertex_groups)}")
except Exception as e:
    print(f"  WARN: weight transfer failed: {e}")

# ====== Cleanup + save ======
print(f"\n[5] Cleanup + save")
if src_arm: bpy.data.objects.remove(src_arm, do_unlink=True)
bpy.data.objects.remove(src_body, do_unlink=True)
if loaded_outer is not None: bpy.data.objects.remove(loaded_outer, do_unlink=True)

src_cloth.parent = tgt_arm_obj
src_cloth.matrix_parent_inverse = tgt_arm_obj.matrix_world.inverted()
src_cloth.name = f"{src_cloth.name} (shrinkwrap fit)"

OUT_ABS = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(OUT_ABS)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_ABS)
print(f"  saved: {OUT_ABS}")
print("\n=== DONE ===")
