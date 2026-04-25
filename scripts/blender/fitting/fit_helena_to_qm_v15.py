"""Helena → QM 衣装フィッティング V15 (Translation-Only Retarget + Offset Preservation)。

V14 診断で判明: LBS retarget が dress の depth (前後) 0.65m → 0.29m に圧縮している。
原因は Rigify (Helena) と ARP (QM) の bone roll 差で、dress の前方向が回転されて
潰れる。

V15 のアプローチ:
  LBS の full matrix (rotation + scale + translation) ではなく **translation のみ**
  を使う。各 dress 頂点は「自分の重み付きボーン群の head 位置の差分」だけ平行移動
  する。bone roll 差の影響を受けず、dress の元の世界座標形状を保存する。

アルゴリズム:
  1-2. Append + origin align
  3. Translation-only retarget:
       各 dress 頂点 v について:
         displacement = sum(w_i * (QM_bone[i].head - Helena_bone[i].head)) / sum(w_i)
         v.world += displacement
  4. closest-point + offset preservation (v12 と同じ) で QM body 表面に密着
  5. VG rename + save

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v15.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend> \
    [<min_offset>]
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
MIN_OFFSET = float(args[6]) if len(args) > 6 else 0.005

print(f"\n=== V15 (Translation-Only Retarget + Offset Preservation) ===")
print(f"  min_offset={MIN_OFFSET*1000:.1f}mm")

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
if not qm_body_obj or not qm_arm_obj:
    print("ERROR: QM body or armature not found"); sys.exit(1)

# [1] Append Helena
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

# [2] Origin align
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

# [3] Translation-only retarget
print(f"\n[3] Translation-only retarget (preserves dress shape, no roll/scale issues)")
qm_bone_heads = {b.name: (qm_arm_obj.matrix_world @ b.matrix_local).translation
                 for b in qm_arm_obj.data.bones}
hb_bone_heads = {b.name: (helena_arm.matrix_world @ b.matrix_local).translation
                 for b in helena_arm.data.bones}

def find_qm_name(h):
    q = SRC_TO_TGT_BONE.get(h)
    if q and q in qm_bone_heads: return q
    if h in qm_bone_heads: return h
    if h.startswith('DEF-') and h[4:] in qm_bone_heads: return h[4:]
    hb = helena_arm.data.bones.get(h)
    if hb and hb.parent: return find_qm_name(hb.parent.name)
    return None

# Per-bone displacement: QM bone head - Helena bone head
bone_disp = {}
for h in hb_bone_heads:
    q = find_qm_name(h)
    if q: bone_disp[h] = qm_bone_heads[q] - hb_bone_heads[h]

def translate_only(obj):
    """For each vertex, translate by weighted average of mapped bone displacements."""
    vgn = {v.index: v.name for v in obj.vertex_groups}
    mw = obj.matrix_world; mwi = mw.inverted(); zw = 0
    for v in obj.data.vertices:
        tw = 0.0
        disp = Vector((0, 0, 0))
        for g in v.groups:
            n = vgn.get(g.group)
            if n in bone_disp and g.weight > 1e-6:
                disp = disp + bone_disp[n] * g.weight
                tw += g.weight
        if tw < 1e-6:
            zw += 1
            continue
        disp = disp / tw
        v.co = mwi @ ((mw @ v.co) + disp)
    obj.data.update()
    return zw

print(f"  body zw: {translate_only(helena_body)}, dress zw: {translate_only(helena_dress)}")
if helena_dress.data.shape_keys: helena_dress.shape_key_clear()

# Print POST-retarget bbox
def world_bbox(obj):
    mw = obj.matrix_world; cs = [mw @ v.co for v in obj.data.vertices]
    xs=[c.x for c in cs]; ys=[c.y for c in cs]; zs=[c.z for c in cs]
    return (min(xs),min(ys),min(zs)), (max(xs),max(ys),max(zs))
hd_min, hd_max = world_bbox(helena_dress)
print(f"  POST-retarget dress bbox: size "
      f"({hd_max[0]-hd_min[0]:.2f}, {hd_max[1]-hd_min[1]:.2f}, {hd_max[2]-hd_min[2]:.2f})")

# Remove armature modifiers
for m in list(helena_body.modifiers):
    if m.type == 'ARMATURE': helena_body.modifiers.remove(m)
for m in list(helena_dress.modifiers):
    if m.type == 'ARMATURE': helena_dress.modifiers.remove(m)

# [4] Build BVHs (outer skin only) for closest-point fit
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
    return [len(i) for i in islands[:5]], len(islands)

def prep_body_bm(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.transform(obj.matrix_world)
    sizes, n_islands = keep_largest_island(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm, sizes, n_islands

print(f"\n[4] Build body BVHs (outer skin)")
hb_bm, _, _ = prep_body_bm(helena_body)
helena_bvh = BVHTree.FromBMesh(hb_bm)
qm_bm, _, _ = prep_body_bm(qm_body_obj)
qm_bvh = BVHTree.FromBMesh(qm_bm)

# Diagnostic: pre-fit dress vs QM body
def signed_dist_stats(label):
    mw = helena_dress.matrix_world
    inside=0; outside=0; dists=[]
    for v in helena_dress.data.vertices:
        wp = mw @ v.co
        loc, n, _, _ = qm_bvh.find_nearest(wp)
        if loc is None or n is None: continue
        signed = (wp - loc).dot(n)
        dists.append(signed)
        if signed < 0: inside += 1
        else: outside += 1
    if dists:
        print(f"  {label}: inside={inside} outside={outside} "
              f"min={min(dists)*100:.1f}cm max={max(dists)*100:.1f}cm "
              f"avg={sum(dists)/len(dists)*100:.1f}cm")

signed_dist_stats("pre-fit")

# [5] Closest-point + offset preservation
print(f"\n[5] Closest-point fit ({len(helena_dress.data.vertices)} verts)")

def rotate_vec(v, axis, angle):
    if axis.length < 1e-9 or abs(angle) < 1e-9: return v.copy()
    return Quaternion(axis.normalized(), angle) @ v

mw_d = helena_dress.matrix_world; mwi_d = mw_d.inverted()
n_ok=0; n_flipped_q=0; n_clamped=0
depths=[]
for v in helena_dress.data.vertices:
    wp = mw_d @ v.co
    p_h, n_h, _, _ = helena_bvh.find_nearest(wp)
    if p_h is None or n_h is None: continue
    delta = wp - p_h
    depth = delta.dot(n_h)
    tangent_h = delta - depth * n_h

    p_q, n_q, _, _ = qm_bvh.find_nearest(p_h)
    if p_q is None or n_q is None: continue

    if n_h.dot(n_q) < 0:
        n_q = -n_q
        n_flipped_q += 1

    # Min-offset clamp ensure dress is outside QM body
    if depth < MIN_OFFSET:
        depth = MIN_OFFSET
        n_clamped += 1

    # Rotate tangent from Helena frame to QM frame
    cos_a = max(-1.0, min(1.0, n_h.dot(n_q)))
    if cos_a > 0.9999:
        tangent_q = tangent_h
    else:
        axis = n_h.cross(n_q)
        tangent_q = rotate_vec(tangent_h, axis, math.acos(cos_a))

    new_wp = p_q + depth * n_q + tangent_q
    v.co = mwi_d @ new_wp
    n_ok += 1
    depths.append(depth)

helena_dress.data.update()
hb_bm.free()
print(f"  ok: {n_ok}, n_flipped: {n_flipped_q}, min-offset-clamped: {n_clamped}")
if depths:
    print(f"  depth (after clamp): min={min(depths)*100:.1f}cm max={max(depths)*100:.1f}cm "
          f"avg={sum(depths)/len(depths)*100:.1f}cm")

signed_dist_stats("post-fit")

# [6] Safety push for any remaining inside verts
print(f"\n[6] Safety push")

def is_inside(p, bvh):
    hits = 0; org = p.copy(); d = Vector((0,0,1))
    for _ in range(100):
        loc, _, _, _ = bvh.ray_cast(org, d)
        if loc is None: break
        hits += 1; org = loc + d * 1e-4
    return hits % 2 == 1

mw = helena_dress.matrix_world; mwi = mw.inverted()
inside=0; pushed=0
for v in helena_dress.data.vertices:
    wp = mw @ v.co
    if is_inside(wp, qm_bvh):
        inside += 1
        loc, n, _, _ = qm_bvh.find_nearest(wp)
        if loc and n:
            v.co = mwi @ (loc + n * MIN_OFFSET); pushed += 1
helena_dress.data.update()
qm_bm.free()
pct = (inside / max(1, len(helena_dress.data.vertices))) * 100.0
print(f"  inside: {inside} ({pct:.1f}%), pushed: {pushed}")

# [7] VG rename + save
print(f"\n[7] VG rename + save")
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
helena_dress.name = f"{HELENA_DRESS} (fit QM v15)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
