"""Helena → QM 衣装フィッティング V21 (Snap to QM outer body + Helena offset)。

V20 の問題:
  - bone-local LBS は Helena dress 形状を保つだけ → QM 体型に morph しない
  - 結果: Helena dress を QM bone 位置に置いただけ (= 体型に fit してない)

V21 の改善:
  各 dress vert を **QM body の最寄り outer 表面に snap + helena_depth × qm_normal で外側へ**。
  これで dress mesh が QM 体型 (breast, waist 等の凹凸) に conform する。

  処理順:
    1. 各 dress vert の helena_depth pre-compute (V20 と同じ)
    2. QM body BVH を **outer face のみ**にフィルタ (per-Z body XY 重心方向に
       face normal が向いている face のみ → 内側 shell 排除)
    3. Bone-local LBS retarget (粗位置決め)
    4. Snap to nearest QM outer body + qm_normal × helena_depth

  効果:
    corset → QM の breast カーブに沿った body-hugging
    skirt → 別問題 (cloth physics bone, 自由な geometry なので別途対応)

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v21.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend> \
    [<min_offset>]
"""
import bpy
import bmesh
import sys
import os
import math
from collections import defaultdict
from mathutils import Matrix, Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

HELENA_BLEND, HELENA_BODY, HELENA_DRESS, QM_BODY, QM_ARMATURE, OUT_BLEND = args[:6]
MIN_OFFSET = float(args[6]) if len(args) > 6 else 0.005

print(f"\n=== V21 (Snap to QM outer body + Helena offset) ===")
print(f"  min_offset={MIN_OFFSET*1000:.1f}mm (Helena body 内側 vert 用 fallback)")

# Manual bone mappings (Rigify → ARP, primary deform bones)
SRC_TO_TGT_BONE = {
    'DEF-spine':       'c_root_bend.x',
    'DEF-spine.001':   'c_spine_01_bend.x',
    'DEF-spine.002':   'c_spine_02_bend.x',
    'DEF-spine.003':   'c_spine_03_bend.x',
    'DEF-spine.004':   'neck.x',
    'DEF-spine.006':   'head.x',
    'DEF-breast.L':    'breast_l',
    'DEF-breast.R':    'breast_r',
    'DEF-shoulder.L':  'shoulder.l',
    'DEF-shoulder.R':  'shoulder.r',
    'DEF-upper_arm.L': 'c_arm_stretch.l',
    'DEF-upper_arm.R': 'c_arm_stretch.r',
    'DEF-forearm.L':   'c_forearm_stretch.l',
    'DEF-forearm.R':   'c_forearm_stretch.r',
    'DEF-hand.L':      'hand.l',
    'DEF-hand.R':      'hand.r',
    'DEF-thigh.L':     'c_thigh_stretch.l',
    'DEF-thigh.R':     'c_thigh_stretch.r',
    'DEF-shin.L':      'c_leg_stretch.l',
    'DEF-shin.R':      'c_leg_stretch.r',
    'DEF-foot.L':      'foot.l',
    'DEF-foot.R':      'foot.r',
    'DEF-toe.L':       'toes_01.l',
    'DEF-toe.R':       'toes_01.r',
}

# [1] Append Helena
print(f"\n[1] Append Helena dress + body")
with bpy.data.libraries.load(HELENA_BLEND, link=False) as (data_from, data_to):
    data_to.objects = [HELENA_DRESS, HELENA_BODY]
helena_dress = bpy.data.objects.get(HELENA_DRESS)
helena_body = bpy.data.objects.get(HELENA_BODY)
if not helena_dress or not helena_body:
    print(f"ERROR: missing dress/body in {HELENA_BLEND}"); sys.exit(1)

bpy.context.scene.collection.objects.link(helena_dress)
bpy.context.scene.collection.objects.link(helena_body)
helena_arm = helena_dress.find_armature() or helena_body.find_armature()
if helena_arm and helena_arm.name not in bpy.data.objects:
    bpy.context.scene.collection.objects.link(helena_arm)
print(f"  dress: {helena_dress.name} ({len(helena_dress.data.vertices)} verts)")
print(f"  body:  {helena_body.name} ({len(helena_body.data.vertices)} verts)")
print(f"  arm:   {helena_arm.name if helena_arm else 'none'}")

# [2] Get QM target objects
qm_body_obj = bpy.data.objects.get(QM_BODY)
qm_arm_obj = bpy.data.objects.get(QM_ARMATURE)
if not qm_body_obj or not qm_arm_obj:
    print(f"ERROR: missing QM body/armature"); sys.exit(1)

# [3] Compute bone matrices in world space (rest pose)
print(f"\n[3] Compute bone matrices")
helena_bone_matrices = {}
helena_bone_heads = {}
for b in helena_arm.data.bones:
    mat = helena_arm.matrix_world @ b.matrix_local
    helena_bone_matrices[b.name] = mat
    helena_bone_heads[b.name] = mat.translation.copy()

qm_bone_matrices = {}
qm_bone_heads = {}
for b in qm_arm_obj.data.bones:
    mat = qm_arm_obj.matrix_world @ b.matrix_local
    qm_bone_matrices[b.name] = mat
    qm_bone_heads[b.name] = mat.translation.copy()

# Build bone_map: include manual mapping + physics bone fallback
bone_map = dict(SRC_TO_TGT_BONE)

# Physics bone fallback: any deform bone in Helena not in SRC_TO_TGT_BONE,
# map to nearest QM deform bone by world head position.
qm_deform_heads = {n: h for n, h in qm_bone_heads.items()
                   if qm_arm_obj.data.bones[n].use_deform}
n_fallback = 0
for b in helena_arm.data.bones:
    if b.name in bone_map: continue
    if not b.use_deform: continue
    h_head = helena_bone_heads[b.name]
    nearest = min(qm_deform_heads.items(),
                  key=lambda kv: (kv[1] - h_head).length)
    bone_map[b.name] = nearest[0]
    n_fallback += 1
print(f"  manual mappings: {len(SRC_TO_TGT_BONE)}, physics fallback: {n_fallback}")
print(f"  total bone_map: {len(bone_map)}")

# [4] Build BVHs for body ray cast (depth preservation)
print(f"\n[4] Build body BVHs")

def keep_largest_island(bm):
    visited = set(); islands = []
    for v in bm.verts:
        if v in visited: continue
        stack = [v]; island = []
        while stack:
            cur = stack.pop()
            if cur in visited: continue
            visited.add(cur); island.append(cur)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other not in visited: stack.append(other)
        islands.append(island)
    islands.sort(key=len, reverse=True)
    largest = set(islands[0])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v not in largest], context='VERTS')

def prep_body_bm(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.transform(obj.matrix_world)
    keep_largest_island(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

from mathutils.bvhtree import BVHTree
hb_bm = prep_body_bm(helena_body)
helena_bvh = BVHTree.FromBMesh(hb_bm)
qm_bm = prep_body_bm(qm_body_obj)
qm_bvh = BVHTree.FromBMesh(qm_bm)
print(f"  helena: {len(hb_bm.verts)} verts, qm: {len(qm_bm.verts)} verts")

# QM body per-Z XY centroid (for outer face filter and radial fallback)
QM_Z_BUCKET = 0.01  # 1cm
qm_z_xys = defaultdict(list)
for vert in qm_bm.verts:
    zb = round(vert.co.z / QM_Z_BUCKET)
    qm_z_xys[zb].append((vert.co.x, vert.co.y))
qm_centroid_per_z = {}
for zb, xys in qm_z_xys.items():
    cx = sum(p[0] for p in xys) / len(xys)
    cy = sum(p[1] for p in xys) / len(xys)
    qm_centroid_per_z[zb] = (cx, cy)
qm_z_keys_sorted = sorted(qm_centroid_per_z.keys())
print(f"  QM body Z buckets: {len(qm_centroid_per_z)} (Z range: "
      f"{min(qm_z_keys_sorted)*QM_Z_BUCKET:.2f}m〜{max(qm_z_keys_sorted)*QM_Z_BUCKET:.2f}m)")

def find_centroid_for_z(z):
    zb = round(z / QM_Z_BUCKET)
    if zb in qm_centroid_per_z: return qm_centroid_per_z[zb]
    for off in range(1, 30):
        if (zb-off) in qm_centroid_per_z: return qm_centroid_per_z[zb-off]
        if (zb+off) in qm_centroid_per_z: return qm_centroid_per_z[zb+off]
    return None

# QM outer-face only BVH (二重 shell 構造の内側 face を排除)。
# 各 face について face center と per-Z body XY 重心の outward 方向を比べ、
# face normal が outward 寄り (dot >= 0) のものだけ残す。
print(f"  filtering QM outer-faces for snap target BVH...")
qm_outer_bm = bmesh.new()
qm_outer_bm.from_mesh(qm_body_obj.data)
qm_outer_bm.transform(qm_body_obj.matrix_world)
keep_largest_island(qm_outer_bm)
bmesh.ops.recalc_face_normals(qm_outer_bm, faces=qm_outer_bm.faces)

faces_to_delete = []
n_inner = 0; n_outer = 0; n_no_centroid = 0
for f in qm_outer_bm.faces:
    fc = f.calc_center_median()
    centroid = find_centroid_for_z(fc.z)
    if centroid is None:
        n_no_centroid += 1
        continue
    cx, cy = centroid
    outward = Vector((fc.x - cx, fc.y - cy, 0.0))
    if outward.length < 0.001: continue
    outward.normalize()
    if f.normal.dot(outward) < 0:
        faces_to_delete.append(f)
        n_inner += 1
    else:
        n_outer += 1
if faces_to_delete:
    bmesh.ops.delete(qm_outer_bm, geom=faces_to_delete, context='FACES')
print(f"  QM outer-face BVH: outer={n_outer} inner-removed={n_inner} no-centroid={n_no_centroid}")
qm_outer_bvh = BVHTree.FromBMesh(qm_outer_bm)

def depth_aware_radial_push(wp, target_depth):
    """vert wp を per-Z 重心からの radial 方向で QM outer shell + target_depth 以上に push。
    target_depth = Helena 上での body 距離 (= dress 設計上の body との離隔)
    既に target_depth 以上外側にあれば preserve。"""
    centroid = find_centroid_for_z(wp.z)
    if centroid is None: return wp, False
    cx, cy = centroid
    dx = wp.x - cx; dy = wp.y - cy
    length = math.sqrt(dx*dx + dy*dy)
    if length < 0.001: return wp, False
    ux = dx / length; uy = dy / length
    FAR_DIST = 1.5
    far_origin = Vector((cx + ux * FAR_DIST, cy + uy * FAR_DIST, wp.z))
    direction = Vector((-ux, -uy, 0.0))
    hit_loc, hit_n, _, _ = qm_bvh.ray_cast(far_origin, direction, FAR_DIST + 0.5)
    if hit_loc is None: return wp, False
    hit_dx = hit_loc.x - cx; hit_dy = hit_loc.y - cy
    shell_radius = math.sqrt(hit_dx*hit_dx + hit_dy*hit_dy)
    vert_radius = length
    depth = vert_radius - shell_radius
    if depth >= target_depth:
        return wp, False  # 既に target_depth 以上外側
    new_radius = shell_radius + target_depth
    new_wp = Vector((cx + ux * new_radius, cy + uy * new_radius, wp.z))
    return new_wp, True

# [5] Bone-local LBS retarget per dress vertex
print(f"\n[5] Bone-local LBS retarget ({len(helena_dress.data.vertices)} verts)")

mw_d = helena_dress.matrix_world; mwi_d = mw_d.inverted()
vgn = {v.index: v.name for v in helena_dress.vertex_groups}

def signed_dist_stats(label):
    inside=0; outside=0; dists=[]
    for v in helena_dress.data.vertices:
        wp = mw_d @ v.co
        loc, n, _, _ = qm_bvh.find_nearest(wp)
        if loc is None or n is None: continue
        signed = (wp - loc).dot(n)
        dists.append(signed)
        if signed < 0: inside += 1
        else: outside += 1
    if dists:
        print(f"  {label}: inside={inside} outside={outside} "
              f"avg={sum(dists)/len(dists)*100:.1f}cm")

signed_dist_stats("PRE-fit")

# [5a] Pre-compute Helena reference depth for each dress vert.
# helena_depth[v.index] = signed dist from Helena body (Helena 元位置基準, 常に >= MIN_OFFSET)
print(f"\n[5a] Pre-compute Helena reference depths")
helena_depth = {}
n_inside_helena = 0
depths_for_stats = []
for v in helena_dress.data.vertices:
    wp = mw_d @ v.co
    loc_h, n_h, _, _ = helena_bvh.find_nearest(wp)
    if loc_h is None or n_h is None:
        helena_depth[v.index] = MIN_OFFSET
        continue
    signed = (wp - loc_h).dot(n_h)
    if signed < 0:
        n_inside_helena += 1
    d = max(signed, MIN_OFFSET)
    helena_depth[v.index] = d
    depths_for_stats.append(d)
if depths_for_stats:
    depths_sorted = sorted(depths_for_stats)
    print(f"  helena_depth stats: min={depths_sorted[0]*1000:.1f}mm "
          f"median={depths_sorted[len(depths_sorted)//2]*1000:.1f}mm "
          f"max={depths_sorted[-1]*1000:.1f}mm "
          f"(inside Helena body: {n_inside_helena} → fallback to {MIN_OFFSET*1000:.1f}mm)")

n_ok = 0; n_no_bone = 0
n_snapped = 0; n_radial_fallback = 0; n_kept = 0
for v in helena_dress.data.vertices:
    wp = mw_d @ v.co

    # Multi-bone LBS: weighted average of (helena bone-local → qm bone-local) mappings (粗位置決め)
    total_w = 0.0
    blended_world = Vector((0, 0, 0))
    for g in v.groups:
        bn = vgn.get(g.group)
        if bn not in bone_map: continue
        w = g.weight
        if w < 1e-6: continue
        h_mat = helena_bone_matrices[bn]
        q_mat = qm_bone_matrices[bone_map[bn]]
        local_pos = h_mat.inverted() @ wp
        qm_pos = q_mat @ local_pos
        blended_world += qm_pos * w
        total_w += w

    if total_w < 1e-6:
        n_no_bone += 1
        continue

    new_wp = blended_world / total_w
    target_depth = helena_depth.get(v.index, MIN_OFFSET)

    # V21: snap to QM outer body + qm_normal × helena_depth (= QM 体型に morph)
    loc_q, n_q, _, _ = qm_outer_bvh.find_nearest(new_wp)
    if loc_q is not None and n_q is not None:
        # 配置: outer body 表面 + 法線方向に helena_depth
        new_wp = loc_q + n_q * target_depth
        n_snapped += 1
    else:
        # outer body BVH に見つからない場合は radial fallback
        pushed_wp, was_pushed = depth_aware_radial_push(new_wp, target_depth)
        if was_pushed:
            new_wp = pushed_wp
            n_radial_fallback += 1
        else:
            n_kept += 1

    v.co = mwi_d @ new_wp
    n_ok += 1

helena_dress.data.update()
hb_bm.free(); qm_bm.free(); qm_outer_bm.free()

print(f"  ok: {n_ok}, no-mapped-bone: {n_no_bone}")
print(f"  snap: shell-normal={n_snapped} radial-fallback={n_radial_fallback} kept={n_kept}")
signed_dist_stats("POST-fit")

# [6] VG rename (Rigify DEF-* → ARP). bone_map (manual + physics fallback) を流用。
print(f"\n[6] VG rename + armature modifier")
am = helena_dress.modifiers.new('Armature_QM', 'ARMATURE')
am.object = qm_arm_obj; am.use_vertex_groups = True

qm_bone_names = set(b.name for b in qm_arm_obj.data.bones)
kept = renamed = merged = removed = 0
for vg in list(helena_dress.vertex_groups):
    s = vg.name
    if s in qm_bone_names:
        kept += 1; continue
    t = bone_map.get(s)
    if t and t in qm_bone_names:
        if t in helena_dress.vertex_groups:
            tv = helena_dress.vertex_groups[t]; si = vg.index
            for vv in helena_dress.data.vertices:
                for g in vv.groups:
                    if g.group == si: tv.add([vv.index], g.weight, 'ADD')
            helena_dress.vertex_groups.remove(vg); merged += 1
        else:
            vg.name = t; renamed += 1
    else:
        helena_dress.vertex_groups.remove(vg); removed += 1
print(f"  VG: kept={kept} renamed={renamed} merged={merged} removed={removed}")

# [7] Rename mesh and save
print(f"\n[7] Save")
new_name = f"{HELENA_DRESS} (fit QM v21)"
helena_dress.name = new_name
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_body.hide_render = True
helena_body.hide_viewport = True
if helena_arm:
    helena_arm.hide_render = True
    helena_arm.hide_viewport = True

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, copy=True, compress=True)
print(f"  saved: {OUT_BLEND}")
print(f"  mesh name: {new_name}")
print(f"\n=== DONE: V21 ===")
