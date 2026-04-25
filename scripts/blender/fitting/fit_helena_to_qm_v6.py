"""Helena → QM 衣装フィッティング V6 (Surface Deform + Body Shrinkwrap chain)。

コンセプト:
  Surface Deform (三角形バリセントリック binding) で dress を Helena body に固定し、
  Helena body を Shrinkwrap で QM body 形状に変形。
  SD が body 形状変化を dress に伝達 → 胸/腰のプロポーション差を自然吸収。

手順:
  [1] Helena blend から body / dress / armature を append
  [2] 原点揃え
  [3] LBS retarget body + dress を QM pose へ変形 (ポーズ差吸収)
  [4] dress shape key 削除
  [5] Surface Deform on dress, target=Helena body, bind
  [6] Shrinkwrap on Helena body, target=QM body, NEAREST_SURFACEPOINT, offset=0
  [7] SW を apply (body が QM 形状に確定) → SD 経由で dress も追従変形
  [8] SD を apply (dress の形状焼き付け)
  [9] Safety post-process: 埋没頂点の最終 push
  [10] VG rename + re-parent + save

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v6.py -- \
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

print(f"\n=== fit_helena_to_qm V6 (SurfaceDeform + body shrinkwrap) ===")
print(f"  min offset for safety push: {MIN_OFFSET*1000:.1f}mm")

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

# [1] Append
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
print(f"  dress={helena_dress.name} body={helena_body.name} arm={helena_arm.name if helena_arm else None}")

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

# [4] dress shape key 削除 + armature modifier disable
print(f"\n[4] Prepare dress for SD")
if helena_dress.data.shape_keys:
    n = len(helena_dress.data.shape_keys.key_blocks)
    helena_dress.shape_key_clear()
    print(f"  cleared {n} shape keys")

dress_arm = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE':
        dress_arm = m; m.show_viewport = False

body_arm = None
for m in helena_body.modifiers:
    if m.type == 'ARMATURE':
        body_arm = m; m.show_viewport = False

# [5a] Clean Helena body mesh for SD bind (shape key 削除 + merge close verts)
print(f"\n[5a] Clean Helena body mesh")
# shape key 削除 (SW apply の障害)
if helena_body.data.shape_keys:
    n = len(helena_body.data.shape_keys.key_blocks)
    helena_body.shape_key_clear()
    print(f"  cleared {n} body shape keys")

bpy.context.view_layer.objects.active = helena_body
for o in bpy.context.selected_objects: o.select_set(False)
helena_body.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
before = len(helena_body.data.vertices)
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.object.mode_set(mode='OBJECT')
after = len(helena_body.data.vertices)
print(f"  remove_doubles: {before} -> {after}")

# [5] Surface Deform on dress
print(f"\n[5] Surface Deform on dress, target = Helena body (LBS'd)")
sd = helena_dress.modifiers.new('SD', 'SURFACE_DEFORM')
sd.target = helena_body
sd.falloff = 4.0  # default

bpy.context.view_layer.objects.active = helena_dress
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
try:
    bpy.ops.object.surfacedeform_bind(modifier=sd.name)
except Exception as e:
    print(f"  ERROR bind: {e}"); sys.exit(1)
if not sd.is_bound:
    print(f"  ERROR: SD not bound"); sys.exit(1)
print(f"  bound OK")

# [6] Shrinkwrap on body (enabled)
print(f"\n[6] Shrinkwrap on body")
sw = helena_body.modifiers.new('SW_QM', 'SHRINKWRAP')
sw.target = qm_body_obj
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.offset = 0.0
sw.show_viewport = True
# body の既存 modifier (armature) は disable 状態
print(f"  SW added")

bpy.context.view_layer.update()

# [7] Apply SW on body (this changes body vertices to QM shape)
print(f"\n[7] Apply SW on Helena body")
bpy.context.view_layer.objects.active = helena_body
for o in bpy.context.selected_objects: o.select_set(False)
helena_body.select_set(True)
# SW を stack top に移動
while helena_body.modifiers[0].name != sw.name:
    bpy.ops.object.modifier_move_up(modifier=sw.name)
try:
    bpy.ops.object.modifier_apply(modifier=sw.name)
    print(f"  applied")
except Exception as e:
    print(f"  ERROR apply SW: {e}"); sys.exit(1)

# [8] Apply SD on dress — at this moment, helena_body has QM shape, SD binding points to it → dress follows
print(f"\n[8] Apply SD on dress (dress follows body shape change via binding)")
bpy.context.view_layer.objects.active = helena_dress
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
while helena_dress.modifiers[0].name != sd.name:
    bpy.ops.object.modifier_move_up(modifier=sd.name)
try:
    bpy.ops.object.modifier_apply(modifier=sd.name)
    print(f"  applied")
except Exception as e:
    print(f"  ERROR apply SD: {e}"); sys.exit(1)

# armature modifier 復旧
if dress_arm: dress_arm.show_viewport = True

# [9] Safety post-process: まだ QM 内部にある dress 頂点を外側に push
print(f"\n[9] Safety check: push still-embedded dress verts")
depsgraph = bpy.context.evaluated_depsgraph_get()
qm_eval = qm_body_obj.evaluated_get(depsgraph)
qm_mesh = qm_eval.to_mesh()
bm = bmesh.new(); bm.from_mesh(qm_mesh); bm.transform(qm_body_obj.matrix_world)
bvh = BVHTree.FromBMesh(bm)

def is_inside(p, bvh):
    hits = 0; org = p.copy(); d = Vector((0,0,1))
    for _ in range(100):
        loc, nn, i, dist = bvh.ray_cast(org, d)
        if loc is None: break
        hits += 1; org = loc + d * 1e-4
    return hits % 2 == 1

mw = helena_dress.matrix_world; mwi = mw.inverted()
inside_count = 0; pushed_count = 0
for v in helena_dress.data.vertices:
    wp = mw @ v.co
    if is_inside(wp, bvh):
        inside_count += 1
        loc, n, idx, dist = bvh.find_nearest(wp)
        if loc and n:
            v.co = mwi @ (loc + n * MIN_OFFSET)
            pushed_count += 1
helena_dress.data.update()
bm.free(); qm_eval.to_mesh_clear()
print(f"  still-inside after SD+SW: {inside_count}, pushed: {pushed_count}")

# [10] VG rename + re-parent + save
print(f"\n[10] VG rename + re-parent + save")
if dress_arm:
    dress_arm.object = qm_arm_obj
else:
    am = helena_dress.modifiers.new('Armature_QM', 'ARMATURE')
    am.object = qm_arm_obj; am.use_vertex_groups = True

qm_bn = set(b.name for b in qm_arm_obj.data.bones)
kept=renamed=merged=removed=0
for vg in list(helena_dress.vertex_groups):
    s = vg.name
    if s in qm_bn: kept += 1; continue
    t = SRC_TO_TGT_BONE.get(s)
    if t and t in qm_bn:
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
helena_dress.name = f"{HELENA_DRESS} (fit QM v6)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
