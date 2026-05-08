"""Helena → QM 衣装フィッティング V22 (Surface Deform via Helena body cage)。

V21 までの問題:
  - bone-local LBS や snap-to-surface は dress vert を移動するだけで
    dress **mesh の局所 geometry** (cup の凸み、pleat 等) を Helena 体型基準で残す
  - 結果: 表面位置は QM body 上だが「メッシュの形」は Helena 体型のまま

V22 の改善:
  Blender の **Surface Deform modifier** で dress を Helena body に bind し、
  Helena body verts を QM body 表面に snap して **Helena body 自体を QM 形状に変形**。
  Surface Deform が dress mesh を **morph** して QM 体型 (breast カーブ等) に追従させる。

  処理順:
    1. Helena dress + Helena body を append
    2. Dress に Surface Deform modifier 追加 (target = Helena body), bind
    3. Helena body の各 vert を QM outer body 表面に snap (= Helena body を QM 化)
    4. Surface Deform を apply → dress mesh が QM body 形状に morph される
    5. VG rename + save

  効果:
    dress mesh の局所 geometry が QM body curve (breast 凸等) にも追従して変形

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v22.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend>
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

print(f"\n=== V22 (Surface Deform via Helena body cage) ===")

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
    # Try to append from QM blend (factory-startup case)
    QM_BLEND_PATH = "E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend"
    print(f"  QM not found in current session, appending from {QM_BLEND_PATH}")
    with bpy.data.libraries.load(QM_BLEND_PATH, link=False) as (data_from, data_to):
        data_to.objects = [QM_BODY, QM_ARMATURE]
    qm_body_obj = bpy.data.objects.get(QM_BODY)
    qm_arm_obj = bpy.data.objects.get(QM_ARMATURE)
    if qm_body_obj: bpy.context.scene.collection.objects.link(qm_body_obj)
    if qm_arm_obj: bpy.context.scene.collection.objects.link(qm_arm_obj)
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

# [5b1] Remove shape keys + clear other modifiers from dress (apply 障害排除)
print(f"\n[5b1] Clean dress: remove shape keys & other modifiers")
bpy.context.view_layer.objects.active = helena_dress
if helena_dress.data.shape_keys:
    n_sk = len(helena_dress.data.shape_keys.key_blocks)
    bpy.ops.object.shape_key_remove(all=True)
    print(f"  removed {n_sk} shape keys")
for m in list(helena_dress.modifiers):
    helena_dress.modifiers.remove(m)
print(f"  cleared modifiers")

# Same for helena body (modifiers may interfere with vertex-level position changes)
bpy.context.view_layer.objects.active = helena_body
if helena_body.data.shape_keys:
    bpy.ops.object.shape_key_remove(all=True)
for m in list(helena_body.modifiers):
    helena_body.modifiers.remove(m)

# [5b] Surface Deform binding: dress を Helena body に bind
print(f"\n[5b] Surface Deform bind (dress → Helena body cage)")
bpy.ops.object.select_all(action='DESELECT')
helena_dress.select_set(True)
bpy.context.view_layer.objects.active = helena_dress
sd_mod = helena_dress.modifiers.new(name='SurfaceDeformQM', type='SURFACE_DEFORM')
sd_mod.target = helena_body
bpy.ops.object.surfacedeform_bind(modifier=sd_mod.name)
print(f"  surface deform bound (target={helena_body.name})")

# [5c] Helena body を QM outer body 形状に変形 (snap each vert to nearest QM outer face)
# MAX_SNAP_DIST: 遠距離 snap (内股 vert が反対脚に飛ぶ等) を拒否、Helena 形状を保持
MAX_SNAP_DIST = float(args[7]) if len(args) > 7 else 0.025  # 2.5cm
print(f"\n[5c] Morph Helena body to QM outer surface (max_snap={MAX_SNAP_DIST*1000:.0f}mm)")
mw_b = helena_body.matrix_world; mwi_b = mw_b.inverted()
n_snapped = 0; n_no_hit = 0; n_skipped_far = 0
snap_dists = []
for v in helena_body.data.vertices:
    wp = mw_b @ v.co
    loc_q, n_q, _, _ = qm_outer_bvh.find_nearest(wp)
    if loc_q is None:
        n_no_hit += 1
        continue
    d = (Vector(loc_q) - wp).length
    if d > MAX_SNAP_DIST:
        n_skipped_far += 1
        continue  # Helena 位置を保持 (内股などの凹空間を守る)
    snap_dists.append(d)
    v.co = mwi_b @ Vector(loc_q)
    n_snapped += 1
helena_body.data.update()
if snap_dists:
    snap_dists.sort()
    print(f"  snapped: {n_snapped}, skipped-far(>{MAX_SNAP_DIST*1000:.0f}mm): {n_skipped_far}, no-hit: {n_no_hit}")
    print(f"  snap dist: median={snap_dists[len(snap_dists)//2]*100:.1f}cm "
          f"max={snap_dists[-1]*100:.1f}cm")

# [5d] Apply Surface Deform: dress mesh が deformed Helena body (= QM 形状) に追従
print(f"\n[5d] Apply Surface Deform on dress")
bpy.context.view_layer.objects.active = helena_dress
bpy.ops.object.modifier_apply(modifier=sd_mod.name)

# [5e] Optional: dress vert を helena_depth 分外側に微調整 (体内突き抜け対策)
print(f"\n[5e] Final outward push to ensure Helena depth offset")
n_pushed = 0
for v in helena_dress.data.vertices:
    wp = mw_d @ v.co
    target_depth = helena_depth.get(v.index, MIN_OFFSET)
    loc_q, n_q, _, _ = qm_outer_bvh.find_nearest(wp)
    if loc_q is None or n_q is None: continue
    signed = (wp - Vector(loc_q)).dot(n_q)
    if signed < target_depth:
        new_wp = Vector(loc_q) + Vector(n_q) * target_depth
        v.co = mwi_d @ new_wp
        n_pushed += 1
helena_dress.data.update()
print(f"  pushed (depth correction): {n_pushed}")

hb_bm.free(); qm_bm.free(); qm_outer_bm.free()
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

# [7] Rename mesh and save (libraries.write を使用 — save_as_mainfile が壊れているため)
print(f"\n[7] Save")
new_name = f"{HELENA_DRESS} (fit QM v22)"
helena_dress.name = new_name
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_body.hide_render = True
helena_body.hide_viewport = True
if helena_arm:
    helena_arm.hide_render = True
    helena_arm.hide_viewport = True

print(f"  writing dress + armature to {OUT_BLEND} via libraries.write")
data_to_write = {helena_dress, qm_arm_obj}
bpy.data.libraries.write(OUT_BLEND, data_to_write, fake_user=True)
print(f"  saved")
print(f"  mesh name: {new_name}")
print(f"\n=== DONE: V22 ===")
