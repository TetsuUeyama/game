"""Helena → QM 衣装フィッティング V13 (Blender 標準 Shrinkwrap)。

LOG.md の推奨パイプライン (Shrinkwrap → 必要なら微調整) を採用。

V11 (Displacement Field), V12 (Closest-Point + Offset 自前実装) では front の
カバーが不十分だった。V13 は Blender 純正 Shrinkwrap を使い、テスト済み実装に
切り替える。

アルゴリズム:
  1-3. Append + origin align + LBS retarget (v11/v12 と同じ)
  4. Helena body を削除 (もう不要)
  5. Dress に Shrinkwrap (NEAREST_SURFACEPOINT, target=QM body, offset) を追加
  6. Apply Shrinkwrap → dress 各頂点が QM body 表面 + offset に snap
  7. 軽い safety push (Shrinkwrap が漏らした verts 用)
  8. VG rename + save

Trade-off:
  Shrinkwrap NEAREST はドレスの volumetric な特徴 (ブラカップ膨らみ等) を失い
  「QM 体に密着した第二の皮膚」になる。代わりに **確実に QM body をカバー**できる。
  voxel ベースの用途では密着の方が望ましいケースが多い。

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v13.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend> \
    [<offset>] [<wrap_method>]

  offset: 体表からの離隔距離 (m, default 0.005 = 5mm)
  wrap_method: NEAREST / PROJECT / TARGET_PROJECT (default NEAREST)
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
OFFSET      = float(args[6]) if len(args) > 6 else 0.005
WRAP_METHOD = args[7] if len(args) > 7 else 'NEAREST'

WRAP_MAP = {
    'NEAREST': 'NEAREST_SURFACEPOINT',
    'PROJECT': 'PROJECT',
    'TARGET_PROJECT': 'TARGET_PROJECT',
}
SHRINKWRAP_METHOD = WRAP_MAP.get(WRAP_METHOD.upper(), 'NEAREST_SURFACEPOINT')

print(f"\n=== V13 (Blender Shrinkwrap) ===")
print(f"  offset={OFFSET*1000:.1f}mm method={SHRINKWRAP_METHOD}")

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

# Apply transforms on QM body so Shrinkwrap operates on world coords directly
# (LOG.md: 「Apply してない → 計算狂う」)
def apply_transforms(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.view_layer.objects: o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

apply_transforms(qm_body_obj)

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

# Remove armature modifiers from dress (verts are already in QM T-pose space).
for m in list(helena_dress.modifiers):
    if m.type == 'ARMATURE': helena_dress.modifiers.remove(m)

# Apply transforms on dress so Shrinkwrap operates on world coords cleanly.
apply_transforms(helena_dress)

# [4] Add Shrinkwrap modifier on dress, target = QM body
print(f"\n[4] Add Shrinkwrap (method={SHRINKWRAP_METHOD}, offset={OFFSET*1000:.1f}mm)")
sw = helena_dress.modifiers.new('Shrinkwrap_v13', 'SHRINKWRAP')
sw.target = qm_body_obj
sw.wrap_method = SHRINKWRAP_METHOD
sw.offset = OFFSET
if SHRINKWRAP_METHOD == 'PROJECT':
    sw.use_negative_direction = True
    sw.use_positive_direction = True
    sw.cull_face = 'OFF'

# Pre-Shrinkwrap stats
def dress_distance_to_qm(qm_bvh):
    """Sample dress-to-QM body signed distance distribution."""
    mw = helena_dress.matrix_world
    inside = 0; outside = 0; dists = []
    for v in helena_dress.data.vertices:
        wp = mw @ v.co
        loc, n, idx, dist = qm_bvh.find_nearest(wp)
        if loc is None or n is None: continue
        signed = (wp - loc).dot(n)
        dists.append(signed)
        if signed < 0: inside += 1
        else: outside += 1
    return inside, outside, dists

qm_bm = bmesh.new(); qm_bm.from_mesh(qm_body_obj.data); qm_bm.transform(qm_body_obj.matrix_world)
bmesh.ops.recalc_face_normals(qm_bm, faces=qm_bm.faces)
qm_bvh = BVHTree.FromBMesh(qm_bm)

inside_pre, outside_pre, dists_pre = dress_distance_to_qm(qm_bvh)
if dists_pre:
    print(f"  PRE shrinkwrap: inside={inside_pre} outside={outside_pre} "
          f"signed-dist min={min(dists_pre)*100:.1f}cm max={max(dists_pre)*100:.1f}cm "
          f"avg={sum(dists_pre)/len(dists_pre)*100:.1f}cm")

# [5] Apply Shrinkwrap → bake dress to QM body surface + offset
print(f"\n[5] Apply Shrinkwrap")
for o in bpy.context.view_layer.objects: o.select_set(False)
bpy.context.view_layer.objects.active = helena_dress
helena_dress.select_set(True)
bpy.ops.object.modifier_apply(modifier=sw.name)
print(f"  dress baked")

# Post-Shrinkwrap stats
inside_post, outside_post, dists_post = dress_distance_to_qm(qm_bvh)
if dists_post:
    print(f"  POST shrinkwrap: inside={inside_post} outside={outside_post} "
          f"signed-dist min={min(dists_post)*100:.1f}cm max={max(dists_post)*100:.1f}cm "
          f"avg={sum(dists_post)/len(dists_post)*100:.1f}cm")

# [6] Safety push: any vert still inside QM body (Shrinkwrap should have handled it)
print(f"\n[6] Safety push")

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
            v.co = mwi @ (loc + n * OFFSET); pushed += 1
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

# Cleanup helper objects
if helena_arm: bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)

helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_dress.name = f"{HELENA_DRESS} (fit QM v13)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
