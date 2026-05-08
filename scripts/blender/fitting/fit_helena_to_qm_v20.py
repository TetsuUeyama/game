"""Helena → QM 衣装フィッティング V20 (V18 + Helena-depth-preserving radial push)。

V19 の問題:
  - 固定 PUSH_OFFSET を使う → corset (body 密着) も skirt (body から離れる) も
    同じ offset で押されて、本来の dress 設計意図 (= Helena 上での body との距離) が
    失われる。

V20 の改善:
  各 dress vert について **Helena 上での body 距離** を pre-compute (helena_depth) し、
  QM 上で radial outward push する際に「shell + helena_depth」までだけ押す。

  処理順:
    1. 各 dress vert の Helena 元位置から helena_depth = signed dist from Helena body
       を pre-compute (常に >0 = 外側、内側は MIN_OFFSET にクランプ)
    2. Bone-local LBS retarget (V18 と同じ)
    3. Depth-aware radial push:
       per-Z body XY 重心 → vert 方向に外側から ray cast → outer shell hit
       vert を「shell + helena_depth[v]」以上の半径に push
       既にそれ以上なら preserved

  効果:
    corset (helena_depth=5-15mm) → QM 上でも body 密着
    skirt (helena_depth=50-150mm) → QM 上でも同じ離隔 = ふんわり
    余計な inflate しないので「body 表面+距離」関係が dress 設計通り保たれる

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v20.py -- \
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

print(f"\n=== V20 (Bone-Local LBS + Helena-depth-preserving Push) ===")
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

# QM body per-Z XY centroid (for radial outward push の中心点)
# Z を 1cm bucket でグループ化、各 bucket で XY 平均を計算
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
    """Find centroid for given Z. Falls back to nearest Z bucket if not exact."""
    zb = round(z / QM_Z_BUCKET)
    if zb in qm_centroid_per_z: return qm_centroid_per_z[zb]
    # Search nearby buckets
    for off in range(1, 30):
        if (zb-off) in qm_centroid_per_z: return qm_centroid_per_z[zb-off]
        if (zb+off) in qm_centroid_per_z: return qm_centroid_per_z[zb+off]
    return None

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
n_pushed = 0; n_kept = 0; n_push_skipped = 0
for v in helena_dress.data.vertices:
    wp = mw_d @ v.co

    # Multi-bone LBS: weighted average of (helena bone-local → qm bone-local) mappings
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

    # V20: depth-aware radial push (Helena reference depth)
    target_depth = helena_depth.get(v.index, MIN_OFFSET)
    pushed_wp, was_pushed = depth_aware_radial_push(new_wp, target_depth)
    if was_pushed:
        new_wp = pushed_wp
        n_pushed += 1
    else:
        n_kept += 1

    v.co = mwi_d @ new_wp
    n_ok += 1

helena_dress.data.update()
hb_bm.free(); qm_bm.free()

print(f"  ok: {n_ok}, no-mapped-bone: {n_no_bone}")
print(f"  radial push: pushed={n_pushed} kept={n_kept}")
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
new_name = f"{HELENA_DRESS} (fit QM v20)"
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
print(f"\n=== DONE: V20 ===")
