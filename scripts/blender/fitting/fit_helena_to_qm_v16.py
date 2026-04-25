"""Helena → QM 衣装フィッティング V16 (Bone-Centric Spherical Mapping)。

V15 の問題:
  - Translation-only retarget は bone head 位置だけ使うため、Helena/QM の bone が
    body 表面に対して異なる深さにあると、dress 全体が body 表面に対してズレる
  - 胸前面のように QM body が Helena より大きく膨らむ部位では、dress が body 内側
    に埋没し、closest-point fit で誤って背面に snap される

V16 のアイデア:
  各 dress 頂点について「ボーン中心から見た方向」を保存し、その方向で QM body 表面を
  ray-cast で直接探す。closest-point ではなく **方向ベース** の射影。

アルゴリズム:
  各 dress 頂点 v について:
    1. 主ボーン B = mapped bones 中最大重み
    2. d = (v_world - Helena_B_head).normalized()  (世界座標方向、roll 影響なし)
    3. r_h = |v_world - Helena_B_head|             (ボーンからの距離)
    4. Helena BVH に Helena_B_head から d 方向で ray cast → R_h (体表までの距離)
    5. excess = r_h - R_h                           (体表からのはみ出し)
    6. QM BVH に QM_B_head から d 方向で ray cast → R_q
    7. new_v_world = QM_B_head + d × (R_q + max(excess, MIN_OFFSET))

利点:
  - 方向はワールド座標 (T-pose 同士なので一致) → bone roll 差の影響なし
  - 体型差は R_h, R_q の差で吸収 → 胸が大きくなっても dress は前面に
  - excess 保存で dress の元の volume (cup 膨らみ等) を維持

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v16.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend> \
    [<min_offset>]
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
MIN_OFFSET = float(args[6]) if len(args) > 6 else 0.005

print(f"\n=== V16 (Bone-Centric Spherical Mapping) ===")
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

# [3] Bone head positions (world) for both rigs
print(f"\n[3] Resolve bone heads (world)")
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

bone_map = {}  # helena_bone -> qm_bone
for h in hb_bone_heads:
    q = find_qm_name(h)
    if q: bone_map[h] = q
print(f"  mapped bones: {len(bone_map)} / {len(hb_bone_heads)}")

# [4] Build body BVHs (outer skin only, recalc normals)
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

hb_bm = prep_body_bm(helena_body)
helena_bvh = BVHTree.FromBMesh(hb_bm)
qm_bm = prep_body_bm(qm_body_obj)
qm_bvh = BVHTree.FromBMesh(qm_bm)
print(f"  helena: {len(hb_bm.verts)} verts, qm: {len(qm_bm.verts)} verts")

# [5] Bone-centric spherical mapping
print(f"\n[5] Bone-centric spherical mapping ({len(helena_dress.data.vertices)} verts)")

# Pre-fit stats: where is dress vs QM body?
mw_d = helena_dress.matrix_world; mwi_d = mw_d.inverted()
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
              f"signed-dist min={min(dists)*100:.1f}cm max={max(dists)*100:.1f}cm "
              f"avg={sum(dists)/len(dists)*100:.1f}cm")
signed_dist_stats("PRE-fit (Helena rest pose, Helena body BVH not yet used)")

# Vertex groups → primary mapped bone per vertex
vgn = {v.index: v.name for v in helena_dress.vertex_groups}

n_ok=0; n_no_bone=0; n_h_miss=0; n_q_miss=0; n_clamped=0
excesses=[]
for v in helena_dress.data.vertices:
    wp = mw_d @ v.co
    # Find primary mapped bone (highest weight on a mapped bone)
    primary = None; primary_w = 0.0
    for g in v.groups:
        bn = vgn.get(g.group)
        if bn in bone_map and g.weight > primary_w:
            primary = bn; primary_w = g.weight
    if primary is None:
        n_no_bone += 1
        continue
    qm_bone = bone_map[primary]
    h_head = hb_bone_heads[primary]
    q_head = qm_bone_heads[qm_bone]

    d_world = wp - h_head
    r_h = d_world.length
    if r_h < 1e-6:
        # vertex coincides with bone head — just place at qm head + min_offset along (0,1,0)
        v.co = mwi_d @ (q_head + Vector((0, 0, MIN_OFFSET)))
        n_ok += 1; continue
    d = d_world / r_h

    # Ray cast Helena BVH from h_head in direction d
    hit_h = helena_bvh.ray_cast(h_head, d)
    if hit_h[0] is None:
        n_h_miss += 1
        # Fallback: assume Helena skin at r_h (no excess)
        R_h = r_h
    else:
        R_h = (hit_h[0] - h_head).length
    excess = r_h - R_h

    # Ray cast QM BVH from q_head in direction d
    hit_q = qm_bvh.ray_cast(q_head, d)
    if hit_q[0] is None:
        n_q_miss += 1
        # Fallback: place at q_head + d * r_h (no QM body found)
        new_wp = q_head + d * r_h
    else:
        R_q = (hit_q[0] - q_head).length
        eff = max(excess, MIN_OFFSET)
        if excess < MIN_OFFSET:
            n_clamped += 1
        new_wp = q_head + d * (R_q + eff)
        excesses.append(eff)

    v.co = mwi_d @ new_wp
    n_ok += 1

helena_dress.data.update()
hb_bm.free()
print(f"  ok: {n_ok}, no-bone: {n_no_bone}, h_miss: {n_h_miss}, q_miss: {n_q_miss}, clamped: {n_clamped}")
if excesses:
    print(f"  excess (effective depth): min={min(excesses)*100:.1f}cm max={max(excesses)*100:.1f}cm "
          f"avg={sum(excesses)/len(excesses)*100:.1f}cm")

signed_dist_stats("POST-fit")

# [6] Safety push (catch outliers)
print(f"\n[6] Safety push (light)")

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
helena_dress.name = f"{HELENA_DRESS} (fit QM v16)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
