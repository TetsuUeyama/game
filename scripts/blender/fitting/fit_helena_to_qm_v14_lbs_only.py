"""Helena → QM 衣装フィッティング V14 (LBS Retarget Only, 診断用)。

LBS retarget だけ実行して fit ステップを完全にスキップする。「LBS が dress を
QM body 上の正しい相対位置に置けているか」を視覚的に確認するための診断バージョン。

これで dress が:
  - QM body に綺麗にフィットしている → LBS は OK、後段の fit が逆効果
  - QM body と全然違う場所/形状 → LBS or 設定に根本問題あり

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v14_lbs_only.py -- \
    <helena.blend> <helena_body> <helena_dress> <qm_body> <qm_arm> <out.blend>
"""
import bpy
import sys
import os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import bmesh

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

HELENA_BLEND, HELENA_BODY, HELENA_DRESS, QM_BODY, QM_ARMATURE, OUT_BLEND = args[:6]

print(f"\n=== V14 (LBS Only, Diagnostic) ===")

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

# Print body bbox comparison
def world_bbox(obj):
    mw = obj.matrix_world; cs = [mw @ v.co for v in obj.data.vertices]
    xs=[c.x for c in cs]; ys=[c.y for c in cs]; zs=[c.z for c in cs]
    return (min(xs),min(ys),min(zs)), (max(xs),max(ys),max(zs))
qb_min, qb_max = world_bbox(qm_body_obj)
hb_min, hb_max = world_bbox(helena_body)
hd_min, hd_max = world_bbox(helena_dress)
print(f"  QM body:    bbox {tuple(round(c,3) for c in qb_min)} .. {tuple(round(c,3) for c in qb_max)} "
      f"size ({qb_max[0]-qb_min[0]:.2f}, {qb_max[1]-qb_min[1]:.2f}, {qb_max[2]-qb_min[2]:.2f})")
print(f"  Helena body: bbox {tuple(round(c,3) for c in hb_min)} .. {tuple(round(c,3) for c in hb_max)} "
      f"size ({hb_max[0]-hb_min[0]:.2f}, {hb_max[1]-hb_min[1]:.2f}, {hb_max[2]-hb_min[2]:.2f})")
print(f"  Helena dress: bbox {tuple(round(c,3) for c in hd_min)} .. {tuple(round(c,3) for c in hd_max)} "
      f"size ({hd_max[0]-hd_min[0]:.2f}, {hd_max[1]-hd_min[1]:.2f}, {hd_max[2]-hd_min[2]:.2f})")

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

# Remove armature modifiers
for m in list(helena_body.modifiers):
    if m.type == 'ARMATURE': helena_body.modifiers.remove(m)
for m in list(helena_dress.modifiers):
    if m.type == 'ARMATURE': helena_dress.modifiers.remove(m)

# Print POST-LBS bbox
hd_min, hd_max = world_bbox(helena_dress)
print(f"\n[4] POST-LBS dress bbox: {tuple(round(c,3) for c in hd_min)} .. {tuple(round(c,3) for c in hd_max)} "
      f"size ({hd_max[0]-hd_min[0]:.2f}, {hd_max[1]-hd_min[1]:.2f}, {hd_max[2]-hd_min[2]:.2f})")

# Diagnostic: where does dress sit relative to QM body?
qm_bm = bmesh.new(); qm_bm.from_mesh(qm_body_obj.data); qm_bm.transform(qm_body_obj.matrix_world)
qm_bvh = BVHTree.FromBMesh(qm_bm)
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
qm_bm.free()
if dists:
    print(f"  dress vs QM: inside={inside} outside={outside} "
          f"signed-dist min={min(dists)*100:.1f}cm max={max(dists)*100:.1f}cm "
          f"avg={sum(dists)/len(dists)*100:.1f}cm median={sorted(dists)[len(dists)//2]*100:.1f}cm")

# [5] VG rename + save
print(f"\n[5] VG rename + save")
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
helena_dress.name = f"{HELENA_DRESS} (fit QM v14 LBS-only)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
