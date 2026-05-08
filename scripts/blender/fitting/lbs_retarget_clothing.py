"""LBS-based clothing retargeting (v4: direction-only LBS + volume scale).

設計書: scripts/blender/fitting/CLOTHING_TRANSFER_DESIGN.md (v4 改訂)

「衣装は骨で動き、見た目は補正で作る」

v4 改善点 (v3 から):
  - Direction-only LBS: bone roll 差を無視、direction のみ適用 → 脛/foot 角度差問題解消
  - Volume scale: bone-to-body radius 比で perp 補正 → breast/hip 体型差吸収
  - Cup offset 保存: |perp| - src_radius を新 |perp| - tgt_radius と等しくなるよう加算式

Pipeline:
  [1] Append source body + cloth + armature into target scene
  [2] Build BVH for both src_body and tgt_body
  [3] Per-bone: compute src_radius and tgt_radius (avg dist from bone axis to body surface)
  [4] LBS retarget per cloth vertex (direction-only + volume scale):
      - bone direction で proj/perp 分解 (world space)
      - proj は bone length 比で scale
      - perp magnitude は (R_tgt + cup_offset) で再計算 (cup_offset = |perp| - R_src)
      - perp 方向は rotation_difference(src_dir, tgt_dir) で回転 (roll 無視)
      - 多 bone weight で blend
      - base offset + outward-only collision guard
  [5] Re-target armature → Weight Transfer
  [6] Save

Usage:
  blender --background <target.blend> --python lbs_retarget_clothing.py -- \
    <config.json> <src.blend> <src_body> <src_cloth> \
    <tgt_body> <tgt_armature> <out.blend> \
    [--tgt-outer-bvh <blend>:<obj>] [--base-offset <m>] [--min-collision <m>]
    [--no-direction-lbs] [--no-volume-scale]
"""
import bpy
import bmesh
import sys
import os
import json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 7:
    print(__doc__); sys.exit(1)

CONFIG_JSON  = args[0]
SRC_BLEND    = args[1]
SRC_BODY     = args[2]
SRC_CLOTH    = args[3]
TGT_BODY     = args[4]
TGT_ARMATURE = args[5]
OUT_BLEND    = args[6]

# Optional flags
TGT_OUTER_BVH = None
TGT_OUTER_OBJ = None
BASE_OFFSET = 0.002    # m, 法線方向の base 食い込み防止
MIN_COLLISION = 0.002  # m, 強制 outward push の最小距離
USE_DIR_LBS = True     # v4: direction-only LBS (no bone roll)
USE_VOL_SCALE = True   # v4: volume scale via bone-body radius
USE_REGION_CORR = True # v5: spatial region-aware bidirectional surface correction
EXTRA_Z_SHIFT = -0.04  # v5b: -2cm → -4cm (Body 周りの「まだ高い」感覚解消)
DEBUG_Z_OFFSET = 0.0   # debug: force shift all cloth verts by this Z amount (verify display pipeline)

i = 7
while i < len(args):
    a = args[i]
    if a == '--tgt-outer-bvh' and i + 1 < len(args):
        spec = args[i + 1]
        parts = spec.rsplit(':', 1)
        if len(parts) == 2:
            TGT_OUTER_BVH, TGT_OUTER_OBJ = parts[0], parts[1]
        i += 2
    elif a == '--base-offset' and i + 1 < len(args):
        BASE_OFFSET = float(args[i + 1]); i += 2
    elif a == '--min-collision' and i + 1 < len(args):
        MIN_COLLISION = float(args[i + 1]); i += 2
    elif a == '--no-direction-lbs':
        USE_DIR_LBS = False; i += 1
    elif a == '--no-volume-scale':
        USE_VOL_SCALE = False; i += 1
    elif a == '--debug-z-offset' and i + 1 < len(args):
        DEBUG_Z_OFFSET = float(args[i + 1]); i += 2
    elif a == '--no-region-correction':
        USE_REGION_CORR = False; i += 1
    elif a == '--extra-z-shift' and i + 1 < len(args):
        EXTRA_Z_SHIFT = float(args[i + 1]); i += 2
    else:
        i += 1

print(f"\n=== lbs_retarget_clothing (v3) ===")
print(f"  config       : {CONFIG_JSON}")
print(f"  source       : {SRC_BLEND}  body={SRC_BODY}  cloth={SRC_CLOTH}")
print(f"  target       : body={TGT_BODY}  armature={TGT_ARMATURE}")
print(f"  output       : {OUT_BLEND}")
print(f"  base-offset  : {BASE_OFFSET*1000:.1f}mm")
print(f"  min-collision: {MIN_COLLISION*1000:.1f}mm")
print(f"  direction-LBS: {USE_DIR_LBS} (no bone roll)")
print(f"  volume-scale : {USE_VOL_SCALE} (bone-body radius based)")
print(f"  region-corr  : {USE_REGION_CORR} (spatial bidirectional surface)")
if TGT_OUTER_BVH:
    print(f"  outer BVH    : {TGT_OUTER_BVH}:{TGT_OUTER_OBJ}")

# ============================================================
# Region-aware bidirectional surface correction (v5)
# 空間ベース判定 (bone weight ではなく world coords で region 決定)
# 各 region に異なる push/pull パラメータ
# ============================================================
# QM body bbox Z range: -0.013..1.689 (測定値)
REGION_THRESHOLDS = {
    'breast_z_min': 1.25,   # breast: Z > 1.25
    'breast_x_max': 0.15,
    'breast_y_max': -0.05,
    'torso_z_min': 0.95,    # torso: Z > 0.95
    'hip_z_min':   0.80,    # hip: Z > 0.80
    # crotch: Z 0.7..0.95 AND |X| < 0.15 AND |Y| < 0.12 (内蔵 mesh 引き寄せ防止のため別扱い)
    'crotch_z_min': 0.70,
    'crotch_z_max': 0.95,
    'crotch_x_max': 0.15,
    'crotch_y_max': 0.12,
}

REGION_PARAMS = {
    # min_offset を voxel size (7mm) 以上にして cloth voxel が body voxel cell と分離されるように
    'breast': {
        'min_offset': 0.010,  # 3mm → 10mm (1.5 voxel 外側、cup ボリューム表現)
        'max_offset': None,
        'in_push':    1.0,
        'out_pull':   0.0,
    },
    'torso': {
        'min_offset': 0.008,  # 2mm → 8mm (1 voxel 外側)
        'max_offset': 0.060,
        'in_push':    1.0,
        'out_pull':   0.3,
    },
    'hip': {
        'min_offset': 0.008,  # 2mm → 8mm
        'max_offset': 0.060,
        'in_push':    1.0,    # 0.7 → 1.0 (crotch 周辺は別 region で対応)
        'out_pull':   0.2,
    },
    'leg': {
        'min_offset': 0.005,  # 2mm → 5mm
        'max_offset': 0.030,
        'in_push':    0.7,
        'out_pull':   0.0,
    },
    'crotch': {
        'min_offset': 0.000,
        'max_offset': None,
        'in_push':    0.0,
        'out_pull':   0.0,
    },
}

def classify_region(wp):
    """world coordinates で region 判定 (spatial-based)."""
    z = wp.z
    x = abs(wp.x)
    y = wp.y
    # crotch 優先判定 (Y 方向は abs)
    if (REGION_THRESHOLDS['crotch_z_min'] < z < REGION_THRESHOLDS['crotch_z_max']
            and x < REGION_THRESHOLDS['crotch_x_max']
            and abs(y) < REGION_THRESHOLDS['crotch_y_max']):
        return 'crotch'
    if (z > REGION_THRESHOLDS['breast_z_min']
            and x < REGION_THRESHOLDS['breast_x_max']
            and y < REGION_THRESHOLDS['breast_y_max']):
        return 'breast'
    if z > REGION_THRESHOLDS['torso_z_min']:
        return 'torso'
    if z > REGION_THRESHOLDS['hip_z_min']:
        return 'hip'
    return 'leg'

with open(CONFIG_JSON, 'r', encoding='utf-8') as f:
    config = json.load(f)
VG_RENAME = config['vg_rename']  # src bone name → tgt bone name

# ========================================================================
# Step 1: Verify target + Append source
# ========================================================================
tgt_body_obj = bpy.data.objects.get(TGT_BODY)
tgt_arm_obj  = bpy.data.objects.get(TGT_ARMATURE)
if tgt_body_obj is None or tgt_arm_obj is None:
    print(f"  ERROR: target body/armature missing"); sys.exit(1)

print(f"\n[1] Append source from {SRC_BLEND}")
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
    print(f"  ERROR: append failed"); sys.exit(1)

src_arm = None
for m in list(src_body.modifiers) + list(src_cloth.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        src_arm = m.object; break
if src_arm and src_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(src_arm)
    src_arm.hide_viewport = False; src_arm.hide_set(False)
print(f"  src body: {len(src_body.data.vertices)} verts, src cloth: {len(src_cloth.data.vertices)} verts, arm: {src_arm.name if src_arm else 'NONE'}")

# Clear cloth shape keys (for vertex modification)
if src_cloth.data.shape_keys:
    n_sk = len(src_cloth.data.shape_keys.key_blocks)
    bpy.ops.object.select_all(action='DESELECT')
    src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth
    bpy.ops.object.shape_key_remove(all=True)
    print(f"  cleared {n_sk} shape keys from cloth")

# ========================================================================
# Step 2: LBS retargeting per cloth vertex
# ========================================================================
print(f"\n[2] LBS retargeting")

# Force armatures into rest pose for clean matrices
src_arm.data.pose_position = 'REST'
tgt_arm_obj.data.pose_position = 'REST'
bpy.context.view_layer.update()

# Build BVH for collision/normal lookup + body centroid for normal sanity check
def build_body_bvh(obj):
    """Build BVHTree + return body centroid (for normal direction sanity check)."""
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(obj.matrix_world)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    eo.to_mesh_clear()
    # Centroid for normal sanity check
    centroid = Vector((0.0, 0.0, 0.0))
    n_v = 0
    for v in bm.verts:
        centroid += v.co
        n_v += 1
    if n_v > 0:
        centroid /= n_v
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    return bvh, centroid

# Optionally use outer-only body for BVH (avoid internal cavities)
bvh_obj = tgt_body_obj
if TGT_OUTER_BVH:
    BVH_BLEND_ABS = os.path.abspath(TGT_OUTER_BVH)
    existing = set(o.name for o in bpy.data.objects)
    with bpy.data.libraries.load(BVH_BLEND_ABS, link=False) as (src, dst):
        dst.objects = [TGT_OUTER_OBJ]
    new_objs = [o for o in bpy.data.objects if o.name not in existing]
    for o in new_objs:
        if o.name == TGT_OUTER_OBJ or o.name.startswith(TGT_OUTER_OBJ + '.'):
            bvh_obj = o
            bpy.context.scene.collection.objects.link(o)
            o.hide_viewport = False; o.hide_set(False)
            print(f"  outer BVH loaded as: {o.name}")
            break

tgt_body_bvh, body_centroid = build_body_bvh(bvh_obj)
print(f"  tgt body centroid: {tuple(round(c,3) for c in body_centroid)}")

# Build src_body BVH (for volume scale: bone-body radius computation)
src_body_bvh, src_body_centroid = build_body_bvh(src_body)
print(f"  src body BVH built (for radius computation)")

# v5: Anisotropic breast X scale (chest width ratio で lateral stretch)
def chest_x_width(obj, z_min=1.20, z_max=1.45):
    """Chest 領域 (Z 1.20-1.45) の body verts の X 幅を計測。"""
    mw = obj.matrix_world
    xs = []
    for v in obj.data.vertices:
        wp = mw @ v.co
        if z_min < wp.z < z_max:
            xs.append(wp.x)
    if not xs: return 0.30
    return max(xs) - min(xs)

src_chest_w = chest_x_width(src_body)
tgt_chest_w = chest_x_width(tgt_body_obj)
BREAST_X_SCALE = tgt_chest_w / src_chest_w if src_chest_w > 1e-6 else 1.0
print(f"  chest X width: src={src_chest_w*1000:.0f}mm, tgt={tgt_chest_w*1000:.0f}mm, ratio={BREAST_X_SCALE:.3f}")

# Cloth vertex group names → cloth's existing weights (Helena bone names)
cloth_vg_names = [vg.name for vg in src_cloth.vertex_groups]

# Pre-fetch pose bones (rest pose matrices)
src_pose = {n: src_arm.pose.bones.get(n) for n in cloth_vg_names}
tgt_pose = {}
for s_name in cloth_vg_names:
    t_name = VG_RENAME.get(s_name)
    if t_name:
        tgt_pose[s_name] = tgt_arm_obj.pose.bones.get(t_name)
    else:
        tgt_pose[s_name] = None

# Pre-compute world matrices once (rest pose is static)
src_arm_world = src_arm.matrix_world.copy()
tgt_arm_world = tgt_arm_obj.matrix_world.copy()

# Per-bone body radius (avg distance from bone axis to body surface, sampled at 3 points)
def compute_bone_radius(arm_world, pb, body_bvh):
    head = arm_world @ pb.head
    tail = arm_world @ pb.tail
    bone_dir = (tail - head)
    if bone_dir.length < 1e-6: return None
    bone_dir.normalize()
    samples = []
    for t in (0.25, 0.5, 0.75):
        p = head.lerp(tail, t)
        nearest, _, _, _ = body_bvh.find_nearest(p)
        if nearest is None: continue
        offset = nearest - p
        proj = offset.dot(bone_dir)
        perp_v = offset - bone_dir * proj
        samples.append(perp_v.length)
    return sum(samples) / len(samples) if samples else None

# Cache bone radii for all relevant bones (used by cloth)
src_radii = {}
tgt_radii = {}
for n in cloth_vg_names:
    s_pb = src_pose.get(n)
    t_pb = tgt_pose.get(n)
    if s_pb is not None and t_pb is not None:
        src_radii[n] = compute_bone_radius(src_arm_world, s_pb, src_body_bvh)
        tgt_radii[n] = compute_bone_radius(tgt_arm_world, t_pb, tgt_body_bvh)

# Print radius stats for debugging
if USE_VOL_SCALE:
    print(f"\n  bone body radii (src → tgt, mm):")
    sample_bones = [n for n in cloth_vg_names if src_radii.get(n) and tgt_radii.get(n)][:8]
    for n in sample_bones:
        sr = src_radii[n]; tr = tgt_radii[n]
        ratio = tr / sr if sr > 1e-6 else 0
        print(f"    {n:>20}: {sr*1000:5.1f}mm → {tr*1000:5.1f}mm  (ratio {ratio:.2f})")

# LBS retargeting loop
cloth_mw = src_cloth.matrix_world.copy()
cloth_mw_inv = cloth_mw.inverted()

n_no_weight = 0
n_pushed = 0
for v in src_cloth.data.vertices:
    v_world = cloth_mw @ v.co

    # Collect weights for bones with valid src+tgt mapping
    valid = []
    total_w = 0.0
    for g in v.groups:
        s_name = cloth_vg_names[g.group]
        s_pb = src_pose.get(s_name)
        t_pb = tgt_pose.get(s_name)
        if s_pb is None or t_pb is None: continue
        if g.weight < 1e-4: continue
        valid.append((s_name, s_pb, t_pb, g.weight))
        total_w += g.weight

    if total_w < 1e-6:
        n_no_weight += 1
        continue

    # Per-bone position contribution
    blended = Vector((0.0, 0.0, 0.0))
    for s_name, s_pb, t_pb, w in valid:
        if USE_DIR_LBS:
            # Direction-only LBS: bone roll を無視、direction のみ使用
            src_head = src_arm_world @ s_pb.head
            src_tail = src_arm_world @ s_pb.tail
            src_vec = src_tail - src_head
            s_len = src_vec.length
            if s_len < 1e-6:
                # degenerate bone, fall back to bone-local LBS
                src_bone_world = src_arm_world @ s_pb.matrix
                tgt_bone_world = tgt_arm_world @ t_pb.matrix
                local_pos = src_bone_world.inverted() @ v_world
                tgt_world_pos = tgt_bone_world @ local_pos
                blended += (w / total_w) * tgt_world_pos
                continue
            src_dir = src_vec / s_len

            tgt_head = tgt_arm_world @ t_pb.head
            tgt_tail = tgt_arm_world @ t_pb.tail
            tgt_vec = tgt_tail - tgt_head
            t_len = tgt_vec.length
            if t_len < 1e-6:
                t_len = s_len
                tgt_dir = src_dir
            else:
                tgt_dir = tgt_vec / t_len

            # Decompose vertex offset (world space)
            offset = v_world - src_head
            proj = offset.dot(src_dir)
            perp = offset - src_dir * proj  # perpendicular vector in world space

            # Scale projection (along bone length)
            scaled_proj = proj * (t_len / s_len)

            # Volume scale perpendicular (additive: preserve cup_offset)
            perp_mag = perp.length
            new_perp_mag = perp_mag
            if USE_VOL_SCALE:
                src_r = src_radii.get(s_name)
                tgt_r = tgt_radii.get(s_name)
                if src_r is not None and tgt_r is not None and src_r > 1e-6:
                    cup_offset = perp_mag - src_r
                    new_perp_mag = max(0.0, tgt_r + cup_offset)

            # Rotate perpendicular by bone direction difference (NOT roll)
            if perp_mag > 1e-9:
                perp_unit = perp / perp_mag
                rot_q = src_dir.rotation_difference(tgt_dir)
                rotated_perp_unit = rot_q @ perp_unit
            else:
                rotated_perp_unit = Vector((0.0, 0.0, 0.0))

            tgt_world_pos = tgt_head + tgt_dir * scaled_proj + rotated_perp_unit * new_perp_mag

        else:
            # v3 fallback: bone-local LBS (includes bone roll)
            src_bone_world = src_arm_world @ s_pb.matrix
            tgt_bone_world = tgt_arm_world @ t_pb.matrix
            local_pos = src_bone_world.inverted() @ v_world
            s_len = s_pb.length
            t_len = t_pb.length
            if s_len > 1e-6:
                local_pos.y *= (t_len / s_len)
            tgt_world_pos = tgt_bone_world @ local_pos

        blended += (w / total_w) * tgt_world_pos

    # v5: Anisotropic breast X scale (lateral stretch around body X axis)
    if USE_REGION_CORR and BREAST_X_SCALE != 1.0:
        if classify_region(blended) == 'breast':
            # Scale around X=0 (body axis): preserve nipple-line X, extend sides
            blended.x *= BREAST_X_SCALE

    # Surface correction: region-aware bidirectional (v5) or simple collision guard (legacy)
    nearest, normal, _, _ = tgt_body_bvh.find_nearest(blended)
    if nearest is not None and normal is not None:
        # Sanity check: normal should point outward from body centroid
        out_dir_from_centroid = (nearest - body_centroid)
        if out_dir_from_centroid.length > 1e-6:
            out_dir_from_centroid.normalize()
            if normal.dot(out_dir_from_centroid) < 0:
                normal = -normal  # flip to outward

        if USE_REGION_CORR:
            # === Region-aware bidirectional correction (v5) ===
            region = classify_region(blended)
            p = REGION_PARAMS[region]
            delta = blended - nearest
            dist = delta.dot(normal)
            if dist < p['min_offset']:
                # Inside or too close → push outward
                push_amount = (p['min_offset'] - dist) * p['in_push']
                blended = blended + normal * push_amount
                n_pushed += 1
            elif p['max_offset'] is not None and dist > p['max_offset']:
                # Too far → pull back
                pull_amount = (dist - p['max_offset']) * p['out_pull']
                blended = blended - normal * pull_amount
        else:
            # === Legacy: simple base offset + outward-only collision (v4) ===
            blended_with_offset = blended + normal * BASE_OFFSET
            delta = blended_with_offset - nearest
            sd = delta.dot(normal)
            if sd < MIN_COLLISION:
                blended_with_offset = nearest + normal * MIN_COLLISION
                n_pushed += 1
            blended = blended_with_offset

    # Final Z shift (cloth 視覚位置の最終調整)
    if EXTRA_Z_SHIFT != 0.0:
        blended.z += EXTRA_Z_SHIFT

    # DEBUG: force Z offset (verify display pipeline)
    if DEBUG_Z_OFFSET != 0.0:
        blended.z += DEBUG_Z_OFFSET

    v.co = cloth_mw_inv @ blended

src_cloth.data.update()
print(f"  retargeted {len(src_cloth.data.vertices) - n_no_weight} verts ({n_no_weight} skipped no-weight)")
print(f"  collision-pushed {n_pushed} verts")
if DEBUG_Z_OFFSET != 0.0:
    print(f"  DEBUG: forced Z offset {DEBUG_Z_OFFSET*1000:+.0f}mm applied")

# Restore pose mode (not necessary but cleaner)
src_arm.data.pose_position = 'POSE'
tgt_arm_obj.data.pose_position = 'POSE'
bpy.context.view_layer.update()

# ========================================================================
# Step 3: Re-target armature + Weight Transfer
# ========================================================================
print(f"\n[3] Re-target armature + Weight Transfer")

# Disable existing cloth modifiers (Armature, Subsurf)
for m in list(src_cloth.modifiers):
    if m.type in ('ARMATURE', 'SUBSURF'):
        src_cloth.modifiers.remove(m)

# Remove old Helena vertex groups
for vg in list(src_cloth.vertex_groups):
    src_cloth.vertex_groups.remove(vg)

# Add target armature modifier
arm_mod = src_cloth.modifiers.new(name='Armature_TGT', type='ARMATURE')
arm_mod.object = tgt_arm_obj
arm_mod.use_vertex_groups = True

# Weight Transfer via DATA_TRANSFER modifier
bpy.ops.object.select_all(action='DESELECT')
src_cloth.select_set(True)
bpy.context.view_layer.objects.active = src_cloth

try:
    dt_mod = src_cloth.modifiers.new(name='WeightTransfer', type='DATA_TRANSFER')
    dt_mod.object = tgt_body_obj
    dt_mod.use_vert_data = True
    dt_mod.data_types_verts = {'VGROUP_WEIGHTS'}
    dt_mod.vert_mapping = 'POLYINTERP_NEAREST'
    dt_mod.layers_vgroup_select_src = 'ALL'
    dt_mod.layers_vgroup_select_dst = 'NAME'
    dt_mod.mix_mode = 'REPLACE'

    bpy.ops.object.datalayout_transfer(modifier=dt_mod.name)
    print(f"  layers created: {len(src_cloth.vertex_groups)} vgroups")

    # Move modifier to top + apply
    while src_cloth.modifiers[0].name != dt_mod.name:
        bpy.ops.object.modifier_move_up(modifier=dt_mod.name)
    bpy.ops.object.modifier_apply(modifier=dt_mod.name)

    if len(src_cloth.vertex_groups) > 0:
        bpy.ops.object.vertex_group_normalize_all()
    print(f"  weight transferred + normalized: {len(src_cloth.vertex_groups)} vgroups")
except Exception as e:
    print(f"  WARN: weight transfer failed: {e}")

# ========================================================================
# Step 4: Cleanup + save
# ========================================================================
print(f"\n[4] Cleanup + save")
if src_arm: bpy.data.objects.remove(src_arm, do_unlink=True)
bpy.data.objects.remove(src_body, do_unlink=True)
if TGT_OUTER_BVH and bvh_obj is not tgt_body_obj:
    bpy.data.objects.remove(bvh_obj, do_unlink=True)
    print(f"  removed temp outer BVH body")

src_cloth.parent = tgt_arm_obj
src_cloth.matrix_parent_inverse = tgt_arm_obj.matrix_world.inverted()
src_cloth.name = f"{src_cloth.name} (LBS v3)"

OUT_BLEND_ABS = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(OUT_BLEND_ABS)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND_ABS)
print(f"  saved: {OUT_BLEND_ABS}")
print(f"\n=== DONE ===")
