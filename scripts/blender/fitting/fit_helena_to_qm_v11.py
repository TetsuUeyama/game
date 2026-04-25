"""Helena → QM 衣装フィッティング V11 (Displacement Field 方式)。

deform_clothing_to_body.py のアルゴリズムを mesh 段階に適用。
Body → Body の変形量 (displacement field) を衣装に滑らかに伝達する。

アルゴリズム:
  1. Append + LBS retarget (body と dress を QM pose へ)
  2. Helena body の各頂点について:
     displacement[i] = QM_nearest_surface_point - helena_vert_pos
  3. Dress の各頂点について:
     a. 近傍 Helena body 頂点 K 個を検索
     b. 逆距離加重で平均 displacement を計算
     c. Dress 頂点に平均 displacement を加算
  4. 隣接 dress 頂点は類似 displacement を受ける → 滑らかな変形、topology 保持
  5. 残り埋没に safety push

この方式は topology 保持に優れ、Laplacian 平滑化が不要 (displacement field が本質的に滑らか)。

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v11.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend> \
    [<min_offset>] [<k>]
"""
import bpy
import bmesh
import sys
import os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

HELENA_BLEND, HELENA_BODY, HELENA_DRESS, QM_BODY, QM_ARMATURE, OUT_BLEND = args[:6]
MIN_OFFSET = float(args[6]) if len(args) > 6 else 0.003
K = int(args[7]) if len(args) > 7 else 8

print(f"\n=== V11 (Displacement Field) ===")
print(f"  K={K} min_offset={MIN_OFFSET*1000:.1f}mm")

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
if not qm_body_obj or not qm_arm_obj: print("ERROR"); sys.exit(1)

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
print(f"\n[2] origin delta: {tuple(round(c,3) for c in delta)}")
if helena_arm:
    helena_arm.location = helena_arm.location + delta
    for o in [helena_body, helena_dress]:
        if not is_desc(o, helena_arm): o.location = o.location + delta
else:
    for o in [helena_body, helena_dress]: o.location = o.location + delta
bpy.context.view_layer.update()

# [3] LBS retarget
print(f"\n[3] LBS retarget")
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

def lbs(obj):
    vgn = {v.index: v.name for v in obj.vertex_groups}
    mw = obj.matrix_world; mwi = mw.inverted(); zw = 0
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

print(f"  body zw: {lbs(helena_body)}, dress zw: {lbs(helena_dress)}")
if helena_dress.data.shape_keys: helena_dress.shape_key_clear()

# [4] Compute displacement field: Helena body vert → nearest QM body surface point
print(f"\n[4] Compute displacement field (Helena body → QM body)")
qm_bm = bmesh.new(); qm_bm.from_mesh(qm_body_obj.data); qm_bm.transform(qm_body_obj.matrix_world)
qm_bvh = BVHTree.FromBMesh(qm_bm)

mw_hbody = helena_body.matrix_world
helena_body_world = []
displacements = []
for v in helena_body.data.vertices:
    wp = mw_hbody @ v.co
    helena_body_world.append(wp)
    loc_q, _, _, _ = qm_bvh.find_nearest(wp)
    displacements.append((loc_q - wp) if loc_q else Vector((0, 0, 0)))
qm_bm.free()

ds = [d.length for d in displacements]
print(f"  {len(displacements)} displacements; mag min={min(ds)*100:.1f}cm max={max(ds)*100:.1f}cm avg={sum(ds)/len(ds)*100:.1f}cm")

# [5] Helena body KD-tree for nearest-K search
print(f"\n[5] Build Helena body KD-tree")
n_helena = len(helena_body_world)
kd = KDTree(n_helena)
for i, p in enumerate(helena_body_world):
    kd.insert(p, i)
kd.balance()

# [6] Apply interpolated displacement to dress verts
print(f"\n[6] Apply displacement to dress ({len(helena_dress.data.vertices)} verts)")
mw = helena_dress.matrix_world; mwi = mw.inverted()
applied = 0
for v in helena_dress.data.vertices:
    wp = mw @ v.co
    hits = kd.find_n(wp, K)
    if not hits: continue
    total_w = 0.0
    blend = Vector((0, 0, 0))
    for (co, idx, dist) in hits:
        d = max(dist, 1e-4)
        w = 1.0 / (d * d)
        blend = blend + displacements[idx] * w
        total_w += w
    if total_w > 0:
        blend = blend / total_w
        v.co = mwi @ (wp + blend); applied += 1
helena_dress.data.update()
print(f"  applied: {applied}")

# [7] Safety push
print(f"\n[7] Safety push")
depsgraph = bpy.context.evaluated_depsgraph_get()
qm_eval = qm_body_obj.evaluated_get(depsgraph); qm_mesh = qm_eval.to_mesh()
bm = bmesh.new(); bm.from_mesh(qm_mesh); bm.transform(qm_body_obj.matrix_world)
bvh = BVHTree.FromBMesh(bm)

def is_inside(p, bvh):
    hits = 0; org = p.copy(); d = Vector((0,0,1))
    for _ in range(100):
        loc, nn, i, dist = bvh.ray_cast(org, d)
        if loc is None: break
        hits += 1; org = loc + d * 1e-4
    return hits % 2 == 1

inside = 0; pushed = 0
for v in helena_dress.data.vertices:
    wp = mw @ v.co
    if is_inside(wp, bvh):
        inside += 1
        loc, n, idx, dist = bvh.find_nearest(wp)
        if loc and n:
            v.co = mwi @ (loc + n * MIN_OFFSET); pushed += 1
helena_dress.data.update()
bm.free(); qm_eval.to_mesh_clear()
print(f"  inside: {inside}, pushed: {pushed}")

# [8] VG rename + save
print(f"\n[8] VG rename + save")
dress_arm = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE': dress_arm = m
if dress_arm: dress_arm.object = qm_arm_obj
else:
    am = helena_dress.modifiers.new('Armature_QM', 'ARMATURE')
    am.object = qm_arm_obj; am.use_vertex_groups = True

qm_bone_names = set(b.name for b in qm_arm_obj.data.bones)
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

if helena_arm: bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_dress.name = f"{HELENA_DRESS} (fit QM v11)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
