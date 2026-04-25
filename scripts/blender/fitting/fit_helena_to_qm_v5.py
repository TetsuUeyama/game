"""Helena → QM 衣装フィッティング V5 (thickness-preserving body-to-body retarget)。

コンセプト:
  各 dress 頂点の「body 表面からの符号付き距離」を Helena で記録し、
  QM body 表面から同じ距離外側に配置する。
  これにより胸・腰・ヒップのプロポーション差が自然に吸収される。

手順:
  [1] Helena blend から body / dress / armature を append
  [2] 原点揃え
  [3] LBS retarget: Helena body + dress を QM rest pose に変形
  [4] LBS済 Helena body の BVH を作成、各 dress 頂点の signed distance を記録
  [5] QM body の BVH を作成、各 dress 頂点を QM 表面 + 記録した distance へ移動
  [6] 埋没 (signed_d < MIN_OFFSET) は MIN_OFFSET にクランプ
  [7] VG rename + re-parent + save

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v5.py -- \
    <helena.blend> <helena_body_name> <helena_dress_name> \
    <qm_body_name> <qm_armature_name> <out_blend_path> [<min_offset_m>]

  min_offset_m: body 表面からの最小外向きオフセット (デフォルト 0.003m)
                Helena で体内にあった頂点も最低このオフセットで QM 外側に配置
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

print(f"\n=== fit_helena_to_qm V5 (thickness-preserving) ===")
print(f"  min offset: {MIN_OFFSET*1000:.1f}mm")
print(f"  out: {OUT_BLEND}")

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

qm_body_obj = bpy.data.objects.get(QM_BODY)
qm_arm_obj  = bpy.data.objects.get(QM_ARMATURE)
if qm_body_obj is None or qm_arm_obj is None:
    print("ERROR: QM not found"); sys.exit(1)

# [1]
print(f"\n[1] Append Helena")
with bpy.data.libraries.load(HELENA_BLEND, link=False) as (src, dst):
    want = {HELENA_BODY, HELENA_DRESS}
    dst.objects = [n for n in src.objects if n in want]
helena_body = None; helena_dress = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    if o.name == HELENA_BODY: helena_body = o
    if o.name == HELENA_DRESS: helena_dress = o
helena_arm = None
for m in list(helena_body.modifiers) + list(helena_dress.modifiers):
    if m.type == 'ARMATURE' and m.object:
        helena_arm = m.object; break

# [2] origin align
print(f"\n[2] Origin align")
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
print(f"  delta: {tuple(round(c,3) for c in delta)}")
if helena_arm:
    helena_arm.location = helena_arm.location + delta
    for o in [helena_body, helena_dress]:
        if not is_desc(o, helena_arm): o.location = o.location + delta
else:
    for o in [helena_body, helena_dress]: o.location = o.location + delta
bpy.context.view_layer.update()

# [3] LBS retarget body + dress
print(f"\n[3] LBS retarget body + dress to QM pose")
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
    vg = {v.index: v.name for v in obj.vertex_groups}
    mw = obj.matrix_world; mwi = mw.inverted()
    zw = 0
    for v in obj.data.vertices:
        tw = 0.0
        M = Matrix(((0,0,0,0),(0,0,0,0),(0,0,0,0),(0,0,0,0)))
        for g in v.groups:
            n = vg.get(g.group)
            if n in bt and g.weight > 1e-6:
                for r in range(4):
                    for c in range(4):
                        M[r][c] += bt[n][r][c] * g.weight
                tw += g.weight
        if tw < 1e-6:
            zw += 1; continue
        s = 1.0 / tw
        for r in range(4):
            for c in range(4): M[r][c] *= s
        v.co = mwi @ (M @ (mw @ v.co))
    obj.data.update()
    return zw

zw_body = lbs(helena_body)
zw_dress = lbs(helena_dress)
print(f"  body zero-weight: {zw_body}, dress zero-weight: {zw_dress}")

# [4] dress の shape key を削除 (後段 modifier apply 用)
if helena_dress.data.shape_keys:
    n = len(helena_dress.data.shape_keys.key_blocks)
    helena_dress.shape_key_clear()
    print(f"  cleared {n} shape keys")

# [5] Helena body (LBS済) の BVH + 各 dress 頂点の signed distance 計算
print(f"\n[5] Record Helena-body signed distances")
def build_bvh(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    bvh = BVHTree.FromBMesh(bm)
    return bvh, bm

helena_bvh, helena_bm = build_bvh(helena_body)
mw_dress = helena_dress.matrix_world

signed_dists = []
dist_stats = {'neg': 0, 'pos_small': 0, 'pos_mid': 0, 'pos_large': 0}
for v in helena_dress.data.vertices:
    wp = mw_dress @ v.co
    loc, n, idx, dist = helena_bvh.find_nearest(wp)
    if loc is None or n is None:
        signed_dists.append(MIN_OFFSET); continue
    # signed distance: positive = outside body along normal
    ofs = wp - loc
    sd = ofs.dot(n)
    signed_dists.append(sd)
    if sd < 0: dist_stats['neg'] += 1
    elif sd < 0.01: dist_stats['pos_small'] += 1
    elif sd < 0.05: dist_stats['pos_mid'] += 1
    else: dist_stats['pos_large'] += 1
helena_bm.free()
print(f"  signed distance dist: inside={dist_stats['neg']}, "
      f"0-10mm={dist_stats['pos_small']}, 10-50mm={dist_stats['pos_mid']}, "
      f">50mm={dist_stats['pos_large']}")

# [6] QM body BVH で各 dress 頂点を QM 表面 + signed_d へ移動
print(f"\n[6] Transfer to QM body surface with preserved distance")
qm_bvh, qm_bm = build_bvh(qm_body_obj)
mwi_dress = mw_dress.inverted()

moved = 0; clamped_inside = 0; far_from_qm = 0
for v, sd in zip(helena_dress.data.vertices, signed_dists):
    wp = mw_dress @ v.co
    loc, n, idx, dist = qm_bvh.find_nearest(wp)
    if loc is None or n is None:
        far_from_qm += 1; continue
    # clamp: Helena で body 内部にあった頂点 (sd < 0) や
    # 極小オフセット (sd < MIN_OFFSET) は MIN_OFFSET に持ち上げる
    effective_d = max(sd, MIN_OFFSET)
    if sd < MIN_OFFSET: clamped_inside += 1
    new_wp = loc + n * effective_d
    v.co = mwi_dress @ new_wp
    moved += 1
helena_dress.data.update()
qm_bm.free()
print(f"  moved: {moved}, clamped-to-min-offset: {clamped_inside}, no-qm-hit: {far_from_qm}")

# [7] VG rename + re-parent
print(f"\n[7] VG rename + re-parent to QM armature")
# 既存の Armature modifier (Helena) を QM に差し替え
dress_arm = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE': dress_arm = m
if dress_arm:
    dress_arm.object = qm_arm_obj
else:
    am = helena_dress.modifiers.new('Armature_QM', 'ARMATURE')
    am.object = qm_arm_obj; am.use_vertex_groups = True

qm_bn = set(b.name for b in qm_arm_obj.data.bones)
kept=renamed=merged=removed=0
for v in list(helena_dress.vertex_groups):
    s = v.name
    if s in qm_bn: kept += 1; continue
    t = SRC_TO_TGT_BONE.get(s)
    if t and t in qm_bn:
        if t in helena_dress.vertex_groups:
            tv = helena_dress.vertex_groups[t]; si = v.index
            for vv in helena_dress.data.vertices:
                for g in vv.groups:
                    if g.group == si: tv.add([vv.index], g.weight, 'ADD')
            helena_dress.vertex_groups.remove(v); merged += 1
        else:
            v.name = t; renamed += 1
    else:
        helena_dress.vertex_groups.remove(v); removed += 1
print(f"  VG: kept={kept} renamed={renamed} merged={merged} removed={removed}")

# [8] cleanup + save
print(f"\n[8] Cleanup + save")
if helena_arm: bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_dress.name = f"{HELENA_DRESS} (fit QM v5)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
