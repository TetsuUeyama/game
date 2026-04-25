"""Helena → QM 衣装フィッティング V9 (V7 + Laplacian smoothing)。

V7 の位置補正 (bone-region 制限 signed distance) は正しい位置に置くが、
隣接頂点が異なる bone region に属すと面が折り畳まれる問題があった。

V9 はこれを解決するため V7 後に Laplacian 平滑化を反復適用する。
各頂点の位置を「V7 target 位置」と「隣接頂点の平均位置」でブレンド。

手順:
  1. Append + origin align + LBS retarget (V7 と同じ)
  2. V7 per-vertex target 計算 (bone-region 制限 signed distance)
  3. **V9 追加**: Laplacian 平滑化を N 回反復
       each iter: v.co = (1-alpha) * v.co + alpha * mean(neighbors.co)
       alpha=0.3, N=30 回 → 折り畳みが徐々に平滑化
  4. 埋没 safety push
  5. VG rename + save

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v9.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend> \
    [<min_offset_m>] [<smooth_iterations>] [<smooth_alpha>]
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
SMOOTH_ITERATIONS = int(args[7]) if len(args) > 7 else 30
SMOOTH_ALPHA = float(args[8]) if len(args) > 8 else 0.3

print(f"\n=== V9 (V7 + Laplacian smoothing) ===")
print(f"  min offset: {MIN_OFFSET*1000:.1f}mm")
print(f"  smoothing: {SMOOTH_ITERATIONS} iter, alpha={SMOOTH_ALPHA}")

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
if not qm_body_obj or not qm_arm_obj: print("ERROR"); sys.exit(1)

# [1] append
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

# [4] Build per-bone BVHs (V7)
print(f"\n[4] Build per-bone BVHs")

def build_primary_bone_per_vert(obj, allowed_bones=None):
    vgn = {v.index: v.name for v in obj.vertex_groups}
    out = {}
    for v in obj.data.vertices:
        best_w = 0; best_n = None
        for g in v.groups:
            n = vgn.get(g.group)
            if allowed_bones and n not in allowed_bones: continue
            if g.weight > best_w: best_w = g.weight; best_n = n
        if best_n: out[v.index] = best_n
    return out

def build_face_primary_bone(obj, vert_primary):
    out = {}
    for p in obj.data.polygons:
        counts = {}
        for vi in p.vertices:
            n = vert_primary.get(vi)
            if n: counts[n] = counts.get(n, 0) + 1
        if counts: out[p.index] = max(counts.items(), key=lambda x: x[1])[0]
    return out

qm_bone_names = set(b.name for b in qm_arm_obj.data.bones)
qm_vert_primary = build_primary_bone_per_vert(qm_body_obj, qm_bone_names)
qm_face_primary = build_face_primary_bone(qm_body_obj, qm_vert_primary)

qm_faces_by_bone = {}
for fi, bn in qm_face_primary.items():
    qm_faces_by_bone.setdefault(bn, []).append(fi)

helena_bone_names = set(b.name for b in helena_arm.data.bones)
helena_vert_primary = build_primary_bone_per_vert(helena_body, helena_bone_names)
helena_face_primary = build_face_primary_bone(helena_body, helena_vert_primary)
helena_faces_by_bone = {}
for fi, bn in helena_face_primary.items():
    helena_faces_by_bone.setdefault(bn, []).append(fi)

def build_bvh_for_bones(obj, face_indices):
    bm = bmesh.new()
    bm.from_mesh(obj.data); bm.transform(obj.matrix_world); bm.faces.ensure_lookup_table()
    face_set = set(face_indices)
    to_del = [f for f in bm.faces if f.index not in face_set]
    if to_del: bmesh.ops.delete(bm, geom=to_del, context='FACES')
    if len(bm.faces) == 0: bm.free(); return None, None
    return BVHTree.FromBMesh(bm), bm

def build_full_bvh(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.transform(obj.matrix_world)
    return BVHTree.FromBMesh(bm), bm

qm_full_bvh, qm_full_bm = build_full_bvh(qm_body_obj)
helena_full_bvh, helena_full_bm = build_full_bvh(helena_body)

# [5] V7 target position per dress vert
print(f"\n[5] V7 target transfer (bone-region restricted)")
dress_vgn = {v.index: v.name for v in helena_dress.vertex_groups}

mappable_helena_bones = set(bt.keys())

def primary_bone_mapped(v_groups, vgn_map):
    best_w = 0; best_n = None
    for g in v_groups:
        n = vgn_map.get(g.group)
        if n not in mappable_helena_bones: continue
        if g.weight > best_w: best_w = g.weight; best_n = n
    return best_n

qm_region_bvhs = {}
helena_region_bvhs = {}

def expand_bone_region(bone_name, faces_by_bone):
    coll = []; coll.extend(faces_by_bone.get(bone_name, []))
    for nb in BONE_NEIGHBORHOOD.get(bone_name, []):
        coll.extend(faces_by_bone.get(nb, []))
    return coll

def get_qm_bvh(qm_bone):
    if qm_bone in qm_region_bvhs: return qm_region_bvhs[qm_bone][0]
    faces = expand_bone_region(qm_bone, qm_faces_by_bone)
    if not faces: qm_region_bvhs[qm_bone] = (None, None); return None
    bvh, bm = build_bvh_for_bones(qm_body_obj, faces)
    qm_region_bvhs[qm_bone] = (bvh, bm); return bvh

def get_helena_bvh(h_bone):
    if h_bone in helena_region_bvhs: return helena_region_bvhs[h_bone][0]
    faces = list(helena_faces_by_bone.get(h_bone, []))
    primary_q = SRC_TO_TGT_BONE.get(h_bone, h_bone)
    for hb in helena_faces_by_bone:
        if hb == h_bone: continue
        q = SRC_TO_TGT_BONE.get(hb, hb)
        if q == primary_q or q in BONE_NEIGHBORHOOD.get(primary_q, []):
            faces.extend(helena_faces_by_bone.get(hb, []))
    if not faces: helena_region_bvhs[h_bone] = (None, None); return None
    bvh, bm = build_bvh_for_bones(helena_body, faces)
    helena_region_bvhs[h_bone] = (bvh, bm); return bvh

mw = helena_dress.matrix_world; mwi = mw.inverted()
target_positions = []
stat = {'matched': 0, 'fallback': 0, 'clamped': 0}

for v in helena_dress.data.vertices:
    primary_h = primary_bone_mapped(v.groups, dress_vgn)
    primary_q = find_qm_name(primary_h) if primary_h else None

    wp = mw @ v.co

    h_bvh = get_helena_bvh(primary_h) if primary_h else None
    if h_bvh is None: h_bvh = helena_full_bvh
    loc_h, n_h, _, _ = h_bvh.find_nearest(wp)
    if loc_h is None or n_h is None:
        target_positions.append(v.co.copy()); continue
    signed_d = (wp - loc_h).dot(n_h)

    q_bvh = get_qm_bvh(primary_q) if primary_q else None
    if q_bvh is None:
        q_bvh = qm_full_bvh; stat['fallback'] += 1
    else:
        stat['matched'] += 1
    loc_q, n_q, _, _ = q_bvh.find_nearest(wp)
    if loc_q is None or n_q is None:
        target_positions.append(v.co.copy()); continue

    effective_d = max(signed_d, MIN_OFFSET)
    if signed_d < MIN_OFFSET: stat['clamped'] += 1
    new_wp = loc_q + n_q * effective_d
    target_positions.append(mwi @ new_wp)

# Apply target positions
for v, tp in zip(helena_dress.data.vertices, target_positions):
    v.co = tp
helena_dress.data.update()
print(f"  matched: {stat['matched']}, fallback: {stat['fallback']}, clamped: {stat['clamped']}")

# cleanup bmesh
for _, (bvh, bm) in list(qm_region_bvhs.items()):
    if bm: bm.free()
for _, (bvh, bm) in list(helena_region_bvhs.items()):
    if bm: bm.free()
if qm_full_bm: qm_full_bm.free()
if helena_full_bm: helena_full_bm.free()

# [6] Laplacian smoothing — 折り畳みを解消
print(f"\n[6] Laplacian smoothing ({SMOOTH_ITERATIONS} iterations, alpha={SMOOTH_ALPHA})")
# Build vert-neighbor map via edges
n_verts = len(helena_dress.data.vertices)
neighbors = [[] for _ in range(n_verts)]
for e in helena_dress.data.edges:
    a, b = e.vertices
    neighbors[a].append(b)
    neighbors[b].append(a)

avg_neighbors = sum(len(n) for n in neighbors) / n_verts
print(f"  avg neighbors per vert: {avg_neighbors:.1f}")

# 反復平滑化
for it in range(SMOOTH_ITERATIONS):
    new_cos = [None] * n_verts
    for i, v in enumerate(helena_dress.data.vertices):
        nbs = neighbors[i]
        if not nbs:
            new_cos[i] = v.co.copy()
            continue
        avg = Vector((0, 0, 0))
        for ni in nbs:
            avg = avg + helena_dress.data.vertices[ni].co
        avg = avg / len(nbs)
        new_cos[i] = v.co * (1 - SMOOTH_ALPHA) + avg * SMOOTH_ALPHA
    for i, co in enumerate(new_cos):
        helena_dress.data.vertices[i].co = co
    if (it + 1) % 10 == 0 or it == 0:
        print(f"  iter {it+1}/{SMOOTH_ITERATIONS} done")
helena_dress.data.update()

# [7] Safety push — まだ体内にあれば QM 表面外側に
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
            v.co = mwi @ (loc + n * MIN_OFFSET)
            pushed += 1
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
helena_dress.name = f"{HELENA_DRESS} (fit QM v9)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
