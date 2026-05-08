"""LBS + selective Shrinkwrap fit.

Pipeline:
  1. Append Helena cloth + body, force REST pose
  2. Compute d_helena[i] per vert (Helena cloth ↔ Helena body distance)
  3. LBS reposition each vert: Helena world → QM world (bone-driven)
  4. Create 'tight' vertex group: weight = (1 if d_helena < TIGHT_THRESHOLD else 0)
  5. Apply Shrinkwrap modifier (NEAREST_SURFACEPOINT, vertex_group='tight'):
     - tight verts → projected to QM outer body + offset
     - loose verts (strap, cup) → stay at LBS position
  6. DataTransfer weights from QM outer body, strip internal vgroups
  7. Save

Usage:
  blender --background <qm.blend> --python lbs_shrinkwrap_fit.py -- \
    <config.json> <src.blend> <src_body> <src_cloth> \
    <tgt_body> <tgt_armature> <out.blend> \
    [--tgt-outer-bvh <blend>:<obj>] [--offset 0.005] [--tight-threshold 0.020]
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

TGT_OUTER_BVH = None; TGT_OUTER_OBJ = None
OFFSET = 0.005
TIGHT_THRESHOLD = 0.020   # 20mm: verts within this of Helena body are "tight"

i = 7
while i < len(args):
    a = args[i]
    if a == '--tgt-outer-bvh' and i+1 < len(args):
        spec = args[i+1]; parts = spec.rsplit(':', 1)
        if len(parts) == 2: TGT_OUTER_BVH, TGT_OUTER_OBJ = parts[0], parts[1]
        i += 2
    elif a == '--offset' and i+1 < len(args):
        OFFSET = float(args[i+1]); i += 2
    elif a == '--tight-threshold' and i+1 < len(args):
        TIGHT_THRESHOLD = float(args[i+1]); i += 2
    else:
        i += 1

print(f"\n=== lbs_shrinkwrap_fit ===")
print(f"  src: {SRC_CLOTH}, body={SRC_BODY}")
print(f"  offset: {OFFSET*1000:.1f}mm, tight_threshold: {TIGHT_THRESHOLD*1000:.1f}mm")

with open(CONFIG_JSON, 'r', encoding='utf-8') as f:
    config = json.load(f)
VG_RENAME = config['vg_rename']

INTERNAL_VG_KEYWORDS = ('genital','vagina','ovary','uterus','anus','intestine','tongue','teeth','eye_')
def is_internal_vg(name):
    n = name.lower()
    return any(k in n for k in INTERNAL_VG_KEYWORDS)


def build_bvh(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(obj.matrix_world)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    eo.to_mesh_clear()
    centroid = Vector((0,0,0)); n = 0
    for v in bm.verts:
        centroid += v.co; n += 1
    if n: centroid /= n
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    return bvh, centroid

def normal_outward(nearest, normal, centroid):
    out_dir = nearest - centroid
    if out_dir.length > 1e-6:
        if normal.dot(out_dir.normalized()) < 0:
            return -normal
    return normal


# ===== Verify target =====
tgt_body_obj = bpy.data.objects.get(TGT_BODY)
tgt_arm_obj = bpy.data.objects.get(TGT_ARMATURE)
if tgt_body_obj is None or tgt_arm_obj is None:
    print("ERROR: target missing"); sys.exit(1)
tgt_arm_obj.data.pose_position = 'REST'

# ===== Append source =====
print(f"\n[1] Append source")
with bpy.data.libraries.load(SRC_BLEND, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in {SRC_BODY, SRC_CLOTH}]

src_body = None; src_cloth = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
    if o.name == SRC_BODY: src_body = o
    if o.name == SRC_CLOTH: src_cloth = o
if src_cloth is None or src_body is None:
    print("ERROR: append failed"); sys.exit(1)

src_arm = None
for m in list(src_cloth.modifiers) + list(src_body.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        src_arm = m.object; break
if src_arm and src_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(src_arm)
if src_arm:
    src_arm.data.pose_position = 'REST'
bpy.context.view_layer.update()

if src_cloth.data.shape_keys:
    bpy.ops.object.select_all(action='DESELECT')
    src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth
    bpy.ops.object.shape_key_remove(all=True)

n_verts = len(src_cloth.data.vertices)
print(f"  cloth verts: {n_verts}")

# ===== Load outer body if specified =====
print(f"\n[2] Load outer body")
target_obj = tgt_body_obj
loaded_outer = None
if TGT_OUTER_BVH:
    BVH_BLEND_ABS = os.path.abspath(TGT_OUTER_BVH)
    existing = set(o.name for o in bpy.data.objects)
    with bpy.data.libraries.load(BVH_BLEND_ABS, link=False) as (src, dst):
        dst.objects = [TGT_OUTER_OBJ]
    new_objs = [o for o in bpy.data.objects if o.name not in existing]
    for o in new_objs:
        if o.name == TGT_OUTER_OBJ or o.name.startswith(TGT_OUTER_OBJ + '.'):
            target_obj = o
            loaded_outer = o
            bpy.context.scene.collection.objects.link(o)
            o.hide_viewport = False; o.hide_set(False)
            for mm in list(o.modifiers):
                if mm.type == 'CORRECTIVE_SMOOTH':
                    o.modifiers.remove(mm)
            break
print(f"  shrinkwrap target: {target_obj.name}")

# ===== Compute d_helena per vert =====
print(f"\n[3] Compute d_helena per vert")
src_bvh, src_centroid = build_bvh(src_body)
cloth_mw = src_cloth.matrix_world.copy()
cloth_mw_inv = cloth_mw.inverted()

import statistics
d_helena = [0.0] * n_verts
for v in src_cloth.data.vertices:
    wp = cloth_mw @ v.co
    nearest, normal, _, _ = src_bvh.find_nearest(wp)
    if nearest is None: continue
    n = normal_outward(nearest, normal, src_centroid)
    sd = (wp - nearest).dot(n)
    d_helena[v.index] = max(sd, 0.0)
print(f"  d_helena: mean={statistics.mean(d_helena)*1000:.1f}mm "
      f"median={statistics.median(d_helena)*1000:.1f}mm "
      f"max={max(d_helena)*1000:.1f}mm")
n_tight = sum(1 for d in d_helena if d < TIGHT_THRESHOLD)
print(f"  tight verts (< {TIGHT_THRESHOLD*1000:.1f}mm): {n_tight}/{n_verts} ({100.0*n_tight/n_verts:.1f}%)")

# ===== LBS each cloth vert: Helena world → QM world =====
print(f"\n[4] LBS reposition (Helena world → QM world)")
src_arm_world = src_arm.matrix_world.copy()
tgt_arm_world = tgt_arm_obj.matrix_world.copy()
cloth_vg_names = [vg.name for vg in src_cloth.vertex_groups]
src_pose = {n: src_arm.pose.bones.get(n) for n in cloth_vg_names}
tgt_pose = {n: (tgt_arm_obj.pose.bones.get(VG_RENAME[n]) if n in VG_RENAME else None)
            for n in cloth_vg_names}

n_no_weight = 0
for vi, v in enumerate(src_cloth.data.vertices):
    wp = cloth_mw @ v.co
    valid = []
    total_w = 0.0
    for g in v.groups:
        s_name = cloth_vg_names[g.group]
        s_pb = src_pose.get(s_name); t_pb = tgt_pose.get(s_name)
        if s_pb is None or t_pb is None: continue
        if g.weight < 1e-4: continue
        valid.append((s_pb, t_pb, g.weight))
        total_w += g.weight
    if total_w < 1e-6:
        n_no_weight += 1; continue

    blended = Vector((0,0,0))
    for s_pb, t_pb, w in valid:
        # bone rest matrix: bone_matrix in armature local, then arm.matrix_world to world
        src_bone_world = src_arm_world @ s_pb.matrix
        tgt_bone_world = tgt_arm_world @ t_pb.matrix
        local_pos = src_bone_world.inverted() @ wp
        tgt_world = tgt_bone_world @ local_pos
        blended += (w / total_w) * tgt_world
    v.co = cloth_mw_inv @ blended
src_cloth.data.update()
print(f"  no-weight verts (kept Helena pos): {n_no_weight}")

# ===== Create 'tight' vertex group =====
print(f"\n[5] Create 'tight' vertex group")
tight_vg = src_cloth.vertex_groups.new(name='__tight__')
for vi in range(n_verts):
    if d_helena[vi] < TIGHT_THRESHOLD:
        tight_vg.add([vi], 1.0, 'REPLACE')
    else:
        tight_vg.add([vi], 0.0, 'REPLACE')
print(f"  tight vgroup: {n_tight} verts with weight 1.0")

# ===== Remove old armature, add Shrinkwrap with vgroup =====
print(f"\n[6] Apply Shrinkwrap (tight verts only)")
for m in list(src_cloth.modifiers):
    if m.type in ('ARMATURE', 'SUBSURF', 'CORRECTIVE_SMOOTH'):
        src_cloth.modifiers.remove(m)

bpy.ops.object.select_all(action='DESELECT')
src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth

sw = src_cloth.modifiers.new(name='Shrinkwrap', type='SHRINKWRAP')
sw.target = target_obj
# PROJECT mode: ray-cast along cloth's own normal direction → handles concave regions correctly
sw.wrap_method = 'PROJECT'
try:
    sw.use_negative_direction = True
    sw.use_positive_direction = True
except AttributeError:
    pass
try:
    sw.cull_face = 'OFF'
except AttributeError:
    pass
sw.offset = OFFSET
sw.vertex_group = '__tight__'
bpy.ops.object.modifier_apply(modifier=sw.name)
print(f"  shrinkwrap (PROJECT mode) applied")

# Fallback: NEAREST_SURFACEPOINT for verts where PROJECT had no hit
sw2 = src_cloth.modifiers.new(name='ShrinkwrapNearest', type='SHRINKWRAP')
sw2.target = target_obj
sw2.wrap_method = 'NEAREST_SURFACEPOINT'
sw2.offset = OFFSET
sw2.vertex_group = '__tight__'
bpy.ops.object.modifier_apply(modifier=sw2.name)
print(f"  fallback shrinkwrap (NEAREST) applied")

# Remove __tight__ vgroup
src_cloth.vertex_groups.remove(src_cloth.vertex_groups['__tight__'])

# ===== Add new armature modifier + DataTransfer =====
print(f"\n[7] Armature + DataTransfer")
arm_mod = src_cloth.modifiers.new(name='Armature_TGT', type='ARMATURE')
arm_mod.object = tgt_arm_obj
arm_mod.use_vertex_groups = True

for vg in list(src_cloth.vertex_groups):
    src_cloth.vertex_groups.remove(vg)

try:
    dt = src_cloth.modifiers.new(name='WeightTransfer', type='DATA_TRANSFER')
    dt.object = target_obj
    dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'
    dt.layers_vgroup_select_dst = 'NAME'
    dt.mix_mode = 'REPLACE'
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    while src_cloth.modifiers[0].name != dt.name:
        bpy.ops.object.modifier_move_up(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)

    removed = []
    for vg in list(src_cloth.vertex_groups):
        if is_internal_vg(vg.name):
            removed.append(vg.name); src_cloth.vertex_groups.remove(vg)
    print(f"  weight transfer: {len(src_cloth.vertex_groups)} vgroups, removed {len(removed)} internal")
    if len(src_cloth.vertex_groups) > 0:
        bpy.ops.object.vertex_group_normalize_all()
except Exception as e:
    print(f"  WARN: {e}")

# ===== Cleanup + save =====
print(f"\n[8] Save")
if src_arm: bpy.data.objects.remove(src_arm, do_unlink=True)
bpy.data.objects.remove(src_body, do_unlink=True)
if loaded_outer: bpy.data.objects.remove(loaded_outer, do_unlink=True)

src_cloth.parent = tgt_arm_obj
src_cloth.matrix_parent_inverse = tgt_arm_obj.matrix_world.inverted()
src_cloth.name = f"{src_cloth.name} (lbs+sw)"

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT_BLEND))
print(f"  saved: {OUT_BLEND}")
print("=== DONE ===")
