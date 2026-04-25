"""Helena → QM 衣装フィッティング V7 (bone-region restricted signed-distance transfer)。

V5 を改良: QM body 最近点探索を bone region ごとに制限することで、
腕の dress が胴体にマッピングされる等のズレを防ぐ。

アルゴリズム:
  1. LBS retarget Helena body + dress を QM pose へ
  2. 各 dress 頂点の primary bone (最大 weight) を判定 → QM bone へマッピング
  3. 各 dress 頂点に対し、LBS済 Helena body (**同じ bone region**) の最近点を探し signed distance 記録
  4. QM body (**同じ bone region**) の最近点を探し、QM 表面 + signed_d * normal へ配置
  5. 埋没は MIN_OFFSET にクランプ

これにより:
  - 腕の dress は QM の腕表面に乗る (胴体に跳ばない)
  - 胸の dress は QM の胸 region で最近点を探す (腕に跳ばない)
  - プロポーション差 (胸/腰サイズ) は bone region 内の表面位置差としてそのまま吸収

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v7.py -- \
    <helena.blend> <helena_body_name> <helena_dress_name> \
    <qm_body_name> <qm_armature_name> <out_blend_path> [<min_offset_m>]
"""
import bpy
import bmesh
import sys
import os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

HELENA_BLEND, HELENA_BODY, HELENA_DRESS, QM_BODY, QM_ARMATURE, OUT_BLEND = args[:6]
MIN_OFFSET = float(args[6]) if len(args) > 6 else 0.003

print(f"\n=== fit_helena_to_qm V7 (bone-region restricted) ===")
print(f"  min offset: {MIN_OFFSET*1000:.1f}mm")

SRC_TO_TGT_BONE = {
    'DEF-spine': 'c_root_bend.x', 'DEF-spine.001': 'c_spine_01_bend.x',
    'DEF-spine.002': 'c_spine_02_bend.x', 'DEF-spine.003': 'c_spine_03_bend.x',
    'DEF-spine.004': 'neck.x', 'DEF-spine.005': 'neck.x', 'DEF-spine.006': 'head.x',
    'DEF-neck': 'neck.x', 'DEF-head': 'head.x',
    'DEF-breast.L': 'breast_l', 'DEF-breast.R': 'breast_r',
    'DEF-shoulder.L': 'shoulder.l', 'DEF-shoulder.R': 'shoulder.r',
    'DEF-upper_arm.L': 'c_arm_stretch.l', 'DEF-upper_arm.L.001': 'c_arm_stretch.l',
    'DEF-upper_arm.R': 'c_arm_stretch.r', 'DEF-upper_arm.R.001': 'c_arm_stretch.r',
    'DEF-forearm.L': 'c_forearm_stretch.l', 'DEF-forearm.L.001': 'c_forearm_stretch.l',
    'DEF-forearm.R': 'c_forearm_stretch.r', 'DEF-forearm.R.001': 'c_forearm_stretch.r',
    'DEF-hand.L': 'hand.l', 'DEF-hand.R': 'hand.r',
    'DEF-thigh.L': 'c_thigh_stretch.l', 'DEF-thigh.L.001': 'c_thigh_stretch.l',
    'DEF-thigh.R': 'c_thigh_stretch.r', 'DEF-thigh.R.001': 'c_thigh_stretch.r',
    'DEF-shin.L': 'c_leg_stretch.l', 'DEF-shin.L.001': 'c_leg_stretch.l',
    'DEF-shin.R': 'c_leg_stretch.r', 'DEF-shin.R.001': 'c_leg_stretch.r',
    'DEF-foot.L': 'foot.l', 'DEF-foot.R': 'foot.r',
    'DEF-toe.L': 'c_toes_middle1.l', 'DEF-toe.R': 'c_toes_middle1.r',
    'DEF-pelvis.L': 'c_root_bend.x', 'DEF-pelvis.R': 'c_root_bend.x',
}

# 隣接許容: 腕まわりの dress は breast/shoulder 周辺にも跨がることがある
# bone region 探索時に、primary bone に加えてこれら親近 bone も許容する
BONE_NEIGHBORHOOD = {
    'c_arm_stretch.l': ['shoulder.l', 'c_forearm_stretch.l', 'breast_l', 'c_spine_03_bend.x'],
    'c_arm_stretch.r': ['shoulder.r', 'c_forearm_stretch.r', 'breast_r', 'c_spine_03_bend.x'],
    'c_forearm_stretch.l': ['c_arm_stretch.l', 'hand.l'],
    'c_forearm_stretch.r': ['c_arm_stretch.r', 'hand.r'],
    'shoulder.l': ['c_arm_stretch.l', 'c_spine_03_bend.x', 'breast_l'],
    'shoulder.r': ['c_arm_stretch.r', 'c_spine_03_bend.x', 'breast_r'],
    'breast_l': ['c_spine_03_bend.x', 'c_spine_02_bend.x', 'shoulder.l'],
    'breast_r': ['c_spine_03_bend.x', 'c_spine_02_bend.x', 'shoulder.r'],
    'c_spine_03_bend.x': ['c_spine_02_bend.x', 'breast_l', 'breast_r', 'shoulder.l', 'shoulder.r'],
    'c_spine_02_bend.x': ['c_spine_03_bend.x', 'c_spine_01_bend.x'],
    'c_spine_01_bend.x': ['c_spine_02_bend.x', 'c_root_bend.x'],
    'c_root_bend.x': ['c_spine_01_bend.x', 'c_thigh_stretch.l', 'c_thigh_stretch.r'],
    'c_thigh_stretch.l': ['c_root_bend.x', 'c_leg_stretch.l'],
    'c_thigh_stretch.r': ['c_root_bend.x', 'c_leg_stretch.r'],
    'c_leg_stretch.l': ['c_thigh_stretch.l', 'foot.l'],
    'c_leg_stretch.r': ['c_thigh_stretch.r', 'foot.r'],
    'foot.l': ['c_leg_stretch.l'],
    'foot.r': ['c_leg_stretch.r'],
    'hand.l': ['c_forearm_stretch.l'],
    'hand.r': ['c_forearm_stretch.r'],
    'neck.x': ['c_spine_03_bend.x', 'head.x'],
    'head.x': ['neck.x'],
}

qm_body_obj = bpy.data.objects.get(QM_BODY)
qm_arm_obj  = bpy.data.objects.get(QM_ARMATURE)
if qm_body_obj is None or qm_arm_obj is None:
    print("ERROR: QM not found"); sys.exit(1)

# [1] Append
print(f"\n[1] Append Helena")
with bpy.data.libraries.load(HELENA_BLEND, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in {HELENA_BODY, HELENA_DRESS}]
helena_body = None; helena_dress = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    if o.name == HELENA_BODY: helena_body = o
    if o.name == HELENA_DRESS: helena_dress = o
helena_arm = None
for m in list(helena_body.modifiers) + list(helena_dress.modifiers):
    if m.type == 'ARMATURE' and m.object: helena_arm = m.object; break

# [2] origin align
def wbbox_center(o):
    mw = o.matrix_world; cs = [mw @ v.co for v in o.data.vertices]
    return Vector(((min(c.x for c in cs)+max(c.x for c in cs))/2,
                   (min(c.y for c in cs)+max(c.y for c in cs))/2,
                   (min(c.z for c in cs)+max(c.z for c in cs))/2))
def is_desc(o, a):
    c = o.parent
    while c:
        if c == a: return True
        c = c.parent
    return False

delta = wbbox_center(qm_body_obj) - wbbox_center(helena_body)
print(f"\n[2] Origin align delta: {tuple(round(c,3) for c in delta)}")
if helena_arm:
    helena_arm.location = helena_arm.location + delta
    for o in [helena_body, helena_dress]:
        if not is_desc(o, helena_arm): o.location = o.location + delta
else:
    for o in [helena_body, helena_dress]: o.location = o.location + delta
bpy.context.view_layer.update()

# [3] LBS retarget
print(f"\n[3] LBS retarget body + dress")
qm_bw = {b.name: qm_arm_obj.matrix_world @ b.matrix_local for b in qm_arm_obj.data.bones}
hb_w  = {b.name: helena_arm.matrix_world @ b.matrix_local for b in helena_arm.data.bones}

def find_qm_name(h):
    q = SRC_TO_TGT_BONE.get(h)
    if q and q in qm_bw: return q
    if h in qm_bw: return h
    if h.startswith('DEF-') and h[4:] in qm_bw: return h[4:]
    hb = helena_arm.data.bones.get(h)
    if hb and hb.parent: return find_qm_name(hb.parent.name)
    return None

bt = {}
for h in hb_w:
    q = find_qm_name(h)
    if q: bt[h] = qm_bw[q] @ hb_w[h].inverted()
print(f"  bone transforms: {len(bt)}/{len(hb_w)}")

def lbs(obj):
    vgn = {v.index: v.name for v in obj.vertex_groups}
    mw = obj.matrix_world; mwi = mw.inverted()
    zw = 0
    for v in obj.data.vertices:
        tw = 0.0
        M = Matrix(((0,0,0,0),(0,0,0,0),(0,0,0,0),(0,0,0,0)))
        for g in v.groups:
            n = vgn.get(g.group)
            if n in bt and g.weight > 1e-6:
                for r in range(4):
                    for c in range(4): M[r][c] += bt[n][r][c] * g.weight
                tw += g.weight
        if tw < 1e-6: zw += 1; continue
        s = 1.0 / tw
        for r in range(4):
            for c in range(4): M[r][c] *= s
        v.co = mwi @ (M @ (mw @ v.co))
    obj.data.update()
    return zw

print(f"  body zero-weight: {lbs(helena_body)}")
print(f"  dress zero-weight: {lbs(helena_dress)}")

# [4] Precompute per-bone primary vertex sets for Helena body and QM body
print(f"\n[4] Build per-bone regions")

def build_primary_bone_per_vert(obj, bone_name_filter=None):
    """vertex index -> primary bone name (highest weight)"""
    vgn = {v.index: v.name for v in obj.vertex_groups}
    out = {}
    for v in obj.data.vertices:
        best_w = 0; best_n = None
        for g in v.groups:
            n = vgn.get(g.group)
            if bone_name_filter and n not in bone_name_filter: continue
            if g.weight > best_w: best_w = g.weight; best_n = n
        out[v.index] = best_n
    return out

qm_bone_names = set(b.name for b in qm_arm_obj.data.bones)
qm_vert_primary = build_primary_bone_per_vert(qm_body_obj, qm_bone_names)

# face primary bone: vote by vertex primary bones
def build_face_primary_bone(obj, vert_primary):
    out = {}
    for p in obj.data.polygons:
        counts = {}
        for vi in p.vertices:
            n = vert_primary.get(vi)
            if n: counts[n] = counts.get(n, 0) + 1
        if counts:
            out[p.index] = max(counts.items(), key=lambda x: x[1])[0]
    return out

qm_face_primary = build_face_primary_bone(qm_body_obj, qm_vert_primary)

# Build BVH per QM bone region (with neighborhood expansion)
print(f"  Building per-bone BVH for QM body...")
# Group all faces by primary bone
qm_faces_by_bone = {}
for fi, bn in qm_face_primary.items():
    qm_faces_by_bone.setdefault(bn, []).append(fi)
print(f"  QM bones with faces: {len(qm_faces_by_bone)}")

def build_bvh_for_bones(obj, face_indices):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    bm.faces.ensure_lookup_table()
    face_set = set(face_indices)
    to_del = [f for f in bm.faces if f.index not in face_set]
    if to_del:
        bmesh.ops.delete(bm, geom=to_del, context='FACES')
    if len(bm.faces) == 0:
        bm.free(); return None, None
    bvh = BVHTree.FromBMesh(bm)
    return bvh, bm

# Same for Helena body (LBS'd)
helena_bone_names = set(b.name for b in helena_arm.data.bones)
helena_vert_primary = build_primary_bone_per_vert(helena_body, helena_bone_names)
helena_face_primary = build_face_primary_bone(helena_body, helena_vert_primary)
helena_faces_by_bone = {}
for fi, bn in helena_face_primary.items():
    helena_faces_by_bone.setdefault(bn, []).append(fi)

# Also prepare whole-body BVH as fallback
def build_full_bvh(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    bvh = BVHTree.FromBMesh(bm)
    return bvh, bm

qm_full_bvh, qm_full_bm = build_full_bvh(qm_body_obj)
helena_full_bvh, helena_full_bm = build_full_bvh(helena_body)

# [5] For each dress vert: primary bone → signed distance (Helena region) → transfer (QM region)
print(f"\n[5] Transfer dress verts (bone-region restricted)")
dress_vgn = {v.index: v.name for v in helena_dress.vertex_groups}

def get_primary_bone(v_groups, vg_name_map, allowed_names=None):
    """best-weight primary bone. allowed_names が与えられたら、その集合内でのみ選ぶ"""
    best_w = 0; best_n = None
    for g in v_groups:
        n = vg_name_map.get(g.group)
        if allowed_names is not None and n not in allowed_names: continue
        if g.weight > best_w: best_w = g.weight; best_n = n
    return best_n

# SRC_TO_TGT_BONE でマッピング可能な Helena bone 集合 (dress primary 判定用)
mappable_helena_bones = set()
for h_name in helena_arm.data.bones.keys():
    q = find_qm_name(h_name)
    if q: mappable_helena_bones.add(h_name)
# QM と同名 DEF-* もカバー
for h_name in helena_arm.data.bones.keys():
    if h_name in qm_bone_names: mappable_helena_bones.add(h_name)
print(f"  mappable Helena bones for primary detection: {len(mappable_helena_bones)}")

# shape key 削除 (bpy.ops 不要; 頂点直接操作の前提)
if helena_dress.data.shape_keys:
    n = len(helena_dress.data.shape_keys.key_blocks)
    helena_dress.shape_key_clear()
    print(f"  cleared {n} dress shape keys")

mw = helena_dress.matrix_world; mwi = mw.inverted()

# 各 bone region の BVH を lazy build
qm_region_bvhs = {}  # qm_bone -> (bvh, bm) or None
helena_region_bvhs = {}

def expand_bone_region(bone_name, faces_by_bone):
    """bone と neighborhood の faces を全部集めた set"""
    collected = []
    collected.extend(faces_by_bone.get(bone_name, []))
    for nb in BONE_NEIGHBORHOOD.get(bone_name, []):
        collected.extend(faces_by_bone.get(nb, []))
    return collected

def get_qm_bvh(qm_bone):
    if qm_bone in qm_region_bvhs: return qm_region_bvhs[qm_bone]
    faces = expand_bone_region(qm_bone, qm_faces_by_bone)
    if not faces:
        qm_region_bvhs[qm_bone] = (None, None); return None, None
    bvh, bm = build_bvh_for_bones(qm_body_obj, faces)
    qm_region_bvhs[qm_bone] = (bvh, bm)
    return bvh, bm

def get_helena_bvh(helena_primary_bone):
    # Helena body region: use Helena primary bone or its QM mapped equivalent? Use Helena name.
    if helena_primary_bone in helena_region_bvhs: return helena_region_bvhs[helena_primary_bone]
    # Helena face primary uses Helena bone names, so expand Helena faces directly
    # Helena neighborhood: use QM-mapped names and map back? Simpler: use all Helena bones that map to same QM bone as primary
    faces = []
    faces.extend(helena_faces_by_bone.get(helena_primary_bone, []))
    # Add Helena bones that share QM mapping
    primary_q = SRC_TO_TGT_BONE.get(helena_primary_bone, helena_primary_bone)
    for hb in helena_faces_by_bone:
        if hb == helena_primary_bone: continue
        q = SRC_TO_TGT_BONE.get(hb, hb)
        if q == primary_q or q in BONE_NEIGHBORHOOD.get(primary_q, []):
            faces.extend(helena_faces_by_bone.get(hb, []))
    if not faces:
        helena_region_bvhs[helena_primary_bone] = (None, None); return None, None
    bvh, bm = build_bvh_for_bones(helena_body, faces)
    helena_region_bvhs[helena_primary_bone] = (bvh, bm)
    return bvh, bm

stats = {'matched_region': 0, 'fallback_full': 0, 'clamped': 0, 'no_hit': 0}
for v in helena_dress.data.vertices:
    primary_h = get_primary_bone(v.groups, dress_vgn, allowed_names=mappable_helena_bones)
    primary_q = find_qm_name(primary_h) if primary_h else None

    wp = mw @ v.co

    # Helena side: nearest in region
    if primary_h:
        h_bvh, _ = get_helena_bvh(primary_h)
    else:
        h_bvh = None
    if h_bvh is None: h_bvh = helena_full_bvh
    loc_h, n_h, _, _ = h_bvh.find_nearest(wp)
    if loc_h is None or n_h is None:
        stats['no_hit'] += 1
        continue
    signed_d = (wp - loc_h).dot(n_h)

    # QM side: nearest in region
    if primary_q:
        q_bvh, _ = get_qm_bvh(primary_q)
        used_region = q_bvh is not None
    else:
        q_bvh = None; used_region = False
    if q_bvh is None:
        q_bvh = qm_full_bvh
    if used_region: stats['matched_region'] += 1
    else: stats['fallback_full'] += 1

    loc_q, n_q, _, _ = q_bvh.find_nearest(wp)
    if loc_q is None or n_q is None:
        stats['no_hit'] += 1
        continue

    effective_d = max(signed_d, MIN_OFFSET)
    if signed_d < MIN_OFFSET: stats['clamped'] += 1
    new_wp = loc_q + n_q * effective_d
    v.co = mwi @ new_wp

helena_dress.data.update()
print(f"  matched region: {stats['matched_region']}, fallback full: {stats['fallback_full']}")
print(f"  clamped to min offset: {stats['clamped']}, no hit: {stats['no_hit']}")

# cleanup bmesh
for bvh, bm in list(qm_region_bvhs.values()):
    if bm: bm.free()
for bvh, bm in list(helena_region_bvhs.values()):
    if bm: bm.free()
if qm_full_bm: qm_full_bm.free()
if helena_full_bm: helena_full_bm.free()

# [6] VG rename + re-parent
print(f"\n[6] VG rename + re-parent")
dress_arm = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE': dress_arm = m
if dress_arm: dress_arm.object = qm_arm_obj
else:
    am = helena_dress.modifiers.new('Armature_QM', 'ARMATURE')
    am.object = qm_arm_obj; am.use_vertex_groups = True

kept=renamed=merged=removed=0
for vg in list(helena_dress.vertex_groups):
    s = vg.name
    if s in qm_bone_names: kept += 1; continue
    t = SRC_TO_TGT_BONE.get(s)
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

# [7] cleanup + save
if helena_arm: bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_dress.name = f"{HELENA_DRESS} (fit QM v7)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
