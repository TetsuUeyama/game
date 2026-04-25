"""V10: per-region bone-anchor offset + 3D scale + Laplacian smoothing。

retarget_clothing_voxel.py のコンセプト (bone-anchor offset) を mesh 段階に持ち込み、
さらに region ごとの 3D bbox scale でプロポーション差を吸収する。

アルゴリズム:
  1. Append Helena body + dress, origin align
  2. LBS retarget body + dress → QM rest pose
  3. Body を「骨 region ごと」に分割し、Helena / QM 各 region の bbox を計算
     region_scale[region] = (QM_bbox_size / Helena_bbox_size) per axis
  4. 各 dress 頂点:
     a. primary region を weight で判定
     b. Helena weighted bone anchor を weight 加重平均で計算
     c. offset_h = vert_world - anchor_h
     d. scaled_offset = offset_h * region_scale[region]
     e. QM weighted bone anchor を計算
     f. new_pos = anchor_q + scaled_offset
  5. Laplacian smoothing (30 iter, alpha=0.3) で面の折り畳み解消
  6. QM body 内部に残った頂点を外側に push
  7. VG rename + re-parent + save

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v10.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend>
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
SMOOTH_ITER = int(args[7]) if len(args) > 7 else 30
SMOOTH_ALPHA = float(args[8]) if len(args) > 8 else 0.3

print(f"\n=== V10 (bone-anchor + region 3D scale + Laplacian) ===")

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

# [3] LBS retarget body + dress
print(f"\n[3] LBS retarget")
qm_bone_world = {b.name: qm_arm_obj.matrix_world @ b.matrix_local for b in qm_arm_obj.data.bones}
helena_bone_world = {b.name: helena_arm.matrix_world @ b.matrix_local for b in helena_arm.data.bones}
# bone HEAD world position
qm_bone_head = {n: m.translation for n, m in qm_bone_world.items()}
helena_bone_head = {n: m.translation for n, m in helena_bone_world.items()}

def find_qm_name(h):
    q = SRC_TO_TGT_BONE.get(h)
    if q and q in qm_bone_world: return q
    if h in qm_bone_world: return h
    if h.startswith('DEF-') and h[4:] in qm_bone_world: return h[4:]
    hb = helena_arm.data.bones.get(h)
    if hb and hb.parent: return find_qm_name(hb.parent.name)
    return None

bt = {}
for h in helena_bone_world:
    q = find_qm_name(h)
    if q: bt[h] = qm_bone_world[q] @ helena_bone_world[h].inverted()

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

# [4] Compute per-region bbox and scale ratios
# For each bone region, find body verts primarily weighted to mapped QM bone
# bbox → scale = QM_size / Helena_size per axis
print(f"\n[4] Compute per-region bbox scales")

mappable_helena = set(bt.keys())

def build_primary_bone_per_vert(obj, allowed=None):
    vgn = {v.index: v.name for v in obj.vertex_groups}
    out = {}
    for v in obj.data.vertices:
        best_w = 0; best_n = None
        for g in v.groups:
            n = vgn.get(g.group)
            if allowed and n not in allowed: continue
            if g.weight > best_w: best_w = g.weight; best_n = n
        if best_n: out[v.index] = best_n
    return out

qm_vp = build_primary_bone_per_vert(qm_body_obj, set(qm_bone_world.keys()))
helena_vp = build_primary_bone_per_vert(helena_body, mappable_helena)

def bbox_per_region(obj, vert_primary, qm_name_resolver=None):
    """region_name → (min_vec, max_vec) world. qm_name_resolver で QM name に正規化できる"""
    regions = {}
    mw = obj.matrix_world
    for vi, bn in vert_primary.items():
        key = qm_name_resolver(bn) if qm_name_resolver else bn
        if not key: continue
        wp = mw @ obj.data.vertices[vi].co
        if key in regions:
            mn, mx = regions[key]
            mn.x = min(mn.x, wp.x); mn.y = min(mn.y, wp.y); mn.z = min(mn.z, wp.z)
            mx.x = max(mx.x, wp.x); mx.y = max(mx.y, wp.y); mx.z = max(mx.z, wp.z)
        else:
            regions[key] = [wp.copy(), wp.copy()]
    return {k: (v[0], v[1]) for k, v in regions.items()}

helena_region_bbox = bbox_per_region(helena_body, helena_vp, find_qm_name)
qm_region_bbox = bbox_per_region(qm_body_obj, qm_vp)

# region_scale
region_scale = {}
region_helena_anchor = {}
region_qm_anchor = {}
for qname, (q_mn, q_mx) in qm_region_bbox.items():
    if qname not in helena_region_bbox: continue
    h_mn, h_mx = helena_region_bbox[qname]
    h_size = Vector((max(1e-4, h_mx[i] - h_mn[i]) for i in range(3)))
    q_size = Vector((max(1e-4, q_mx[i] - q_mn[i]) for i in range(3)))
    sx = q_size.x / h_size.x
    sy = q_size.y / h_size.y
    sz = q_size.z / h_size.z
    # clamp 0.3 - 3.0 で暴走防止
    sx = max(0.3, min(3.0, sx))
    sy = max(0.3, min(3.0, sy))
    sz = max(0.3, min(3.0, sz))
    region_scale[qname] = Vector((sx, sy, sz))
    # centroid を anchor とする (weighted avg よりシンプルで region 代表点として安定)
    region_helena_anchor[qname] = (h_mn + h_mx) * 0.5
    region_qm_anchor[qname] = (q_mn + q_mx) * 0.5

print(f"  scale ratios for {len(region_scale)} regions:")
for qn in sorted(region_scale.keys()):
    s = region_scale[qn]
    print(f"    {qn:30s} scale=({s.x:.2f}, {s.y:.2f}, {s.z:.2f})")

# [5] Per-vertex transfer: offset from Helena region anchor → scale → add to QM region anchor
print(f"\n[5] Per-vertex anchor-offset + region scale")
dress_vgn = {v.index: v.name for v in helena_dress.vertex_groups}

def get_primary_region(v_groups, vgn_map):
    """dress vert の weight から最大 QM region を決める"""
    region_weights = {}
    for g in v_groups:
        hn = vgn_map.get(g.group)
        if hn not in mappable_helena: continue
        qn = find_qm_name(hn)
        if qn: region_weights[qn] = region_weights.get(qn, 0) + g.weight
    if not region_weights: return None
    return max(region_weights.items(), key=lambda x: x[1])[0]

mw = helena_dress.matrix_world; mwi = mw.inverted()
stat = {'ok': 0, 'no_region': 0, 'clamped_offset': 0}

for v in helena_dress.data.vertices:
    primary_region = get_primary_region(v.groups, dress_vgn)
    if not primary_region or primary_region not in region_scale:
        stat['no_region'] += 1; continue
    scale = region_scale[primary_region]
    anchor_h = region_helena_anchor[primary_region]
    anchor_q = region_qm_anchor[primary_region]

    wp = mw @ v.co
    offset = wp - anchor_h
    # component-wise scale (per-axis)
    scaled = Vector((offset.x * scale.x, offset.y * scale.y, offset.z * scale.z))
    new_wp = anchor_q + scaled
    v.co = mwi @ new_wp
    stat['ok'] += 1
helena_dress.data.update()
print(f"  ok: {stat['ok']}, no_region: {stat['no_region']}")

# [6] Laplacian smoothing
print(f"\n[6] Laplacian smoothing ({SMOOTH_ITER} iter alpha={SMOOTH_ALPHA})")
n_verts = len(helena_dress.data.vertices)
neighbors = [[] for _ in range(n_verts)]
for e in helena_dress.data.edges:
    a, b = e.vertices
    neighbors[a].append(b); neighbors[b].append(a)

for it in range(SMOOTH_ITER):
    new_cos = [None] * n_verts
    for i, v in enumerate(helena_dress.data.vertices):
        nbs = neighbors[i]
        if not nbs: new_cos[i] = v.co.copy(); continue
        avg = Vector((0, 0, 0))
        for ni in nbs:
            avg = avg + helena_dress.data.vertices[ni].co
        avg = avg / len(nbs)
        new_cos[i] = v.co * (1 - SMOOTH_ALPHA) + avg * SMOOTH_ALPHA
    for i, co in enumerate(new_cos):
        helena_dress.data.vertices[i].co = co
helena_dress.data.update()
print(f"  smoothing done")

# [7] Safety push
print(f"\n[7] Safety push for embedded verts")
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

# [8] VG rename + re-parent + save
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
helena_dress.name = f"{HELENA_DRESS} (fit QM v10)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
