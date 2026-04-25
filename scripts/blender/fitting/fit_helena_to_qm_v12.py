"""Helena → QM 衣装フィッティング V12 (Closest-Point Offset Preservation)。

V11 の問題:
  Displacement field を直接 dress 頂点に適用すると、体から離れた dress 頂点 (胸前
  5cm 等) も最寄り body 頂点の displacement (= 体表面まで縮める) を借りるため
  dress が体表面に潰れる。K-nearest 平均だと隣接部位 (胸 vs 腰) が混ざって誤動作。

V12 のアイデア (Surface Deform を自前で実装):
  各 dress 頂点を「Helena body 表面に投影した点 + 法線方向の depth + 接線方向の
  tangent」で記録し、Helena→QM の表面ポイント対応で再構成する。dress と body の
  「相対オフセット」を完全に保存する。

アルゴリズム:
  1-3. Append + origin align + LBS retarget (v11 と同じ)
  4. Helena body BVH (T-pose 化済み) と QM body BVH を構築
  5. 各 dress 頂点 d について:
       a. Helena 表面の最寄り点 p_h と法線 n_h を取得
       b. depth = (d - p_h) · n_h, tangent = (d - p_h) - depth * n_h
       c. p_h を QM 表面に投影 → (p_q, n_q)
       d. n_h → n_q の回転 R を計算 (軸 = cross, 角 = acos(dot))
       e. 新位置 = p_q + depth * n_q + R(tangent)
  6. 軽い safety push (offset 保存で大半は body 外側にあるはず)
  7. VG rename + save

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v12.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend> \
    [<min_offset>] [<max_depth>]

  max_depth: dress が body からこれ以上離れている場合は depth をクリップ (m)
             デフォルト 0.20m (極端に浮く tail 装飾の暴走防止)
"""
import bpy
import bmesh
import sys
import os
import math
from mathutils import Matrix, Vector, Quaternion
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

HELENA_BLEND, HELENA_BODY, HELENA_DRESS, QM_BODY, QM_ARMATURE, OUT_BLEND = args[:6]
MIN_OFFSET = float(args[6]) if len(args) > 6 else 0.002
MAX_DEPTH  = float(args[7]) if len(args) > 7 else 0.20

print(f"\n=== V12 (Closest-Point Offset Preservation) ===")
print(f"  min_offset={MIN_OFFSET*1000:.1f}mm max_depth={MAX_DEPTH*100:.0f}cm")

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
if not qm_body_obj or not qm_arm_obj: print("ERROR: QM body or armature not found"); sys.exit(1)

# [1] Append Helena body + dress
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

# [2] origin align (bbox center)
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

# [3] LBS retarget (Helena rest pose → QM rest pose)
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

# Remove armature modifiers from both (vertices are already in QM T-pose space).
# Leaving them attached would double-deform when modifiers evaluate.
for m in list(helena_body.modifiers):
    if m.type == 'ARMATURE': helena_body.modifiers.remove(m)
for m in list(helena_dress.modifiers):
    if m.type == 'ARMATURE': helena_dress.modifiers.remove(m)

def keep_largest_island(bm):
    """Delete all vertices except the largest connected island (= outer skin).
    Drops internal geometry (teeth, tongue, eyes, internal layers) that confuse
    closest-point projection.
    """
    visited = set()
    islands = []
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
    sizes = [len(i) for i in islands[:5]]
    largest = set(islands[0])
    to_del = [v for v in bm.verts if v not in largest]
    bmesh.ops.delete(bm, geom=to_del, context='VERTS')
    return sizes, len(islands)

def prep_body_bm(obj):
    """Build a bmesh of the outer skin of a body mesh, with consistent outward normals."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    sizes, n_islands = keep_largest_island(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm, sizes, n_islands

# [4] Build BVH for Helena body (T-pose, outer skin only, recalc normals)
print(f"\n[4] Build Helena body BVH")
hb_bm, sizes, n_islands = prep_body_bm(helena_body)
print(f"  islands: {n_islands} (top sizes: {sizes}); kept {len(hb_bm.verts)} verts")
helena_bvh = BVHTree.FromBMesh(hb_bm)

# [5] Build BVH for QM body
print(f"\n[5] Build QM body BVH")
qm_bm, sizes, n_islands = prep_body_bm(qm_body_obj)
print(f"  islands: {n_islands} (top sizes: {sizes}); kept {len(qm_bm.verts)} verts")
qm_bvh = BVHTree.FromBMesh(qm_bm)

# [6] Closest-Point Offset Preservation
print(f"\n[6] Apply offset-preserving deformation to dress ({len(helena_dress.data.vertices)} verts)")

def rotate_vec(v, axis, angle):
    """Rotate vector v around axis by angle (Rodrigues)."""
    if axis.length < 1e-9 or abs(angle) < 1e-9:
        return v.copy()
    q = Quaternion(axis.normalized(), angle)
    return q @ v

mw_d = helena_dress.matrix_world; mwi_d = mw_d.inverted()
n_ok = 0; n_miss = 0; n_clipped = 0; n_flipped_q = 0; n_min_offset_clamped = 0
depths = []; tangents = []
for v in helena_dress.data.vertices:
    wp = mw_d @ v.co
    p_h, n_h, _, _ = helena_bvh.find_nearest(wp)
    if p_h is None or n_h is None:
        n_miss += 1; continue
    delta = wp - p_h
    depth = delta.dot(n_h)
    tangent_h = delta - depth * n_h

    # Clip extreme depth (e.g., tail decoration far from body)
    if abs(depth) > MAX_DEPTH:
        depth = math.copysign(MAX_DEPTH, depth)
        n_clipped += 1

    # Project p_h to QM surface
    p_q, n_q, _, _ = qm_bvh.find_nearest(p_h)
    if p_q is None or n_q is None:
        n_miss += 1; continue

    # Normal sign safeguard: ensure QM normal points the same hemisphere as Helena's
    # (otherwise depth would push dress in the opposite direction).
    if n_h.dot(n_q) < 0:
        n_q = -n_q
        n_flipped_q += 1

    # Ensure dress sits at least MIN_OFFSET outside QM body (no z-fighting / hide).
    # Negative depth means dress was inside Helena body → still keep it outside QM.
    if depth < MIN_OFFSET:
        depth = MIN_OFFSET
        n_min_offset_clamped += 1

    # Rotate tangent from Helena frame (n_h) to QM frame (n_q)
    cos_a = max(-1.0, min(1.0, n_h.dot(n_q)))
    if cos_a > 0.9999:
        tangent_q = tangent_h
    else:
        axis = n_h.cross(n_q)
        angle = math.acos(cos_a)
        tangent_q = rotate_vec(tangent_h, axis, angle)

    new_wp = p_q + depth * n_q + tangent_q
    v.co = mwi_d @ new_wp
    n_ok += 1
    depths.append(depth)
    tangents.append(tangent_h.length)

helena_dress.data.update()
hb_bm.free()
# qm_bvh is reused below for safety push
if depths:
    print(f"  ok: {n_ok}, miss: {n_miss}, depth-clipped: {n_clipped}, "
          f"n_flipped: {n_flipped_q}, min-offset-clamped: {n_min_offset_clamped}")
    print(f"  depth (after clamp): min={min(depths)*100:.1f}cm max={max(depths)*100:.1f}cm "
          f"avg={sum(depths)/len(depths)*100:.1f}cm")
    print(f"  tangent: max={max(tangents)*100:.1f}cm avg={sum(tangents)/len(tangents)*100:.1f}cm")

# [7] Safety push (light): only push verts strictly inside QM body
print(f"\n[7] Safety push (light)")

def is_inside(p, bvh):
    hits = 0; org = p.copy(); d = Vector((0,0,1))
    for _ in range(100):
        loc, nn, i, dist = bvh.ray_cast(org, d)
        if loc is None: break
        hits += 1; org = loc + d * 1e-4
    return hits % 2 == 1

mw = helena_dress.matrix_world; mwi = mw.inverted()
inside = 0; pushed = 0
for v in helena_dress.data.vertices:
    wp = mw @ v.co
    if is_inside(wp, qm_bvh):
        inside += 1
        loc, n, idx, dist = qm_bvh.find_nearest(wp)
        if loc and n:
            v.co = mwi @ (loc + n * MIN_OFFSET); pushed += 1
helena_dress.data.update()
qm_bm.free()
pct = (inside / max(1, len(helena_dress.data.vertices))) * 100.0
print(f"  inside: {inside} ({pct:.1f}%), pushed: {pushed}")

# [8] VG rename + save
print(f"\n[8] VG rename + save")
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

# Cleanup helper objects
if helena_arm: bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)

helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_dress.name = f"{HELENA_DRESS} (fit QM v12)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
