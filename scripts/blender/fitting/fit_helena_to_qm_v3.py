"""Helena → QM 衣装フィッティング V3。

V2 との違い:
  - Mesh Deform 精度を 5 → 7 に上げて細かいプロポーション差を拾う
  - Shrinkwrap を TARGET_PROJECT (target normal 方向) に変更 → 腕付近の崩壊防止
  - Mesh Deform apply 後の post-process で dress 埋没頂点を QM 表面外側に強制

手順:
  [0] QM base
  [1] Helena append
  [2] 原点揃え
  [3] LBS retarget (body + dress)
  [4] Shrinkwrap on body (TARGET_PROJECT, offset=0.003)
  [5] Mesh Deform on dress (precision=7), bind
  [6] Shrinkwrap enable
  [7] Mesh Deform apply
  [8] Post-process: 埋没頂点を QM 表面 + 外向きオフセットへ push
  [9] Dress を QM armature に再 parent + VG rename
  [10] cleanup + save

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v3.py -- \
    <helena.blend> <helena_body_name> <helena_dress_name> \
    <qm_body_name> <qm_armature_name> <out_blend_path>
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

print(f"\n=== fit_helena_to_qm V3 ===")
for k, v in [('helena', HELENA_BLEND), ('h_body', HELENA_BODY), ('h_dress', HELENA_DRESS),
             ('qm_body', QM_BODY), ('qm_arm', QM_ARMATURE), ('out', OUT_BLEND)]:
    print(f"  {k}: {v}")

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

# [0]
print(f"\n[0] QM scene check")
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
print(f"  body={helena_body.name} dress={helena_dress.name} arm={helena_arm.name if helena_arm else None}")

# [2] origin align
print(f"\n[2] Origin align")
def wbbox_center(o):
    mw = o.matrix_world; cs = [mw @ v.co for v in o.data.vertices]
    xs=[c.x for c in cs]; ys=[c.y for c in cs]; zs=[c.z for c in cs]
    return Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))

def is_descendant_of(obj, anc):
    c = obj.parent
    while c:
        if c == anc: return True
        c = c.parent
    return False

delta = wbbox_center(qm_body_obj) - wbbox_center(helena_body)
print(f"  delta: {tuple(round(c,3) for c in delta)}")
if helena_arm:
    helena_arm.location = helena_arm.location + delta
    for o in [helena_body, helena_dress]:
        if not is_descendant_of(o, helena_arm): o.location = o.location + delta
else:
    for o in [helena_body, helena_dress]: o.location = o.location + delta
bpy.context.view_layer.update()

# [3] LBS retarget
print(f"\n[3] LBS retarget")
if helena_arm:
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
        print(f"    {obj.name}: zero-weight {zw}")

    lbs(helena_body); lbs(helena_dress)

# [4] body shrinkwrap (disabled initially)
print(f"\n[4] Shrinkwrap on body (disabled)")
for m in helena_body.modifiers: m.show_viewport = False
sw = helena_body.modifiers.new('SW_QM', 'SHRINKWRAP')
sw.target = qm_body_obj
sw.wrap_method = 'TARGET_PROJECT'  # QM normal 方向に project (NEAREST より安定)
sw.offset = 0.003  # body を QM 表面より 3mm 外側に
sw.show_viewport = False
print(f"  SW added: TARGET_PROJECT offset=0.003")

# [5] dress mesh deform bind
print(f"\n[5] Mesh Deform on dress")
if helena_dress.data.shape_keys:
    n = len(helena_dress.data.shape_keys.key_blocks)
    helena_dress.shape_key_clear()
    print(f"  cleared {n} shape keys")

dress_arm = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE':
        dress_arm = m; m.show_viewport = False

md = helena_dress.modifiers.new('MD', 'MESH_DEFORM')
md.object = helena_body
md.precision = 7  # 上げて細かい cage 追従
print(f"  binding MD (precision={md.precision})...")

bpy.context.view_layer.objects.active = helena_dress
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
try:
    bpy.ops.object.meshdeform_bind(modifier=md.name)
except Exception as e:
    print(f"  ERROR bind: {e}"); sys.exit(1)
if not md.is_bound:
    print(f"  ERROR not bound"); sys.exit(1)
print(f"  bound OK")

# [6] SW enable
print(f"\n[6] Enable SW")
sw.show_viewport = True
bpy.context.view_layer.update()

# [7] MD apply
print(f"\n[7] Apply MD")
bpy.context.view_layer.objects.active = helena_dress
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
while helena_dress.modifiers[0].name != md.name:
    bpy.ops.object.modifier_move_up(modifier=md.name)
bpy.ops.object.modifier_apply(modifier=md.name)
if dress_arm: dress_arm.show_viewport = True
print(f"  applied")

# [8] post-process: push embedded dress verts outside QM body
print(f"\n[8] Post-process: push embedded dress verts outside QM body")
# QM body の評価後 mesh を BVH に (modifier 適用済み状態で)
depsgraph = bpy.context.evaluated_depsgraph_get()
qm_eval = qm_body_obj.evaluated_get(depsgraph)
qm_mesh = qm_eval.to_mesh()

# world 座標に transform した BVH を作成
bm = bmesh.new()
bm.from_mesh(qm_mesh)
bm.transform(qm_body_obj.matrix_world)
bm.verts.ensure_lookup_table()
bvh = BVHTree.FromBMesh(bm)

OFFSET_OUT = 0.005  # 5mm outside QM surface
RAY_DIR = Vector((0, 0, 1))
RAY_EPS = 0.0001

def is_inside(point, bvh):
    """ray cast +Z 方向で交差数を数える。奇数=内部"""
    hits = 0
    origin = point.copy()
    for _ in range(100):
        loc, normal, idx, dist = bvh.ray_cast(origin, RAY_DIR)
        if loc is None: break
        hits += 1
        origin = loc + RAY_DIR * RAY_EPS
    return hits % 2 == 1

mw = helena_dress.matrix_world
mwi = mw.inverted()
pushed = 0; already_outside = 0
for v in helena_dress.data.vertices:
    wp = mw @ v.co
    if is_inside(wp, bvh):
        # nearest surface + normal offset
        loc, normal, idx, dist = bvh.find_nearest(wp)
        if loc is not None and normal is not None:
            new_wp = loc + normal * OFFSET_OUT
            v.co = mwi @ new_wp
            pushed += 1
    else:
        already_outside += 1
helena_dress.data.update()
bm.free()
qm_eval.to_mesh_clear()
print(f"  already outside: {already_outside}")
print(f"  pushed to surface + {OFFSET_OUT*1000:.0f}mm: {pushed}")

# [9] re-parent dress to QM armature
print(f"\n[9] Re-parent dress to QM armature + VG rename")
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
            for v in helena_dress.data.vertices:
                for g in v.groups:
                    if g.group == si: tv.add([v.index], g.weight, 'ADD')
            helena_dress.vertex_groups.remove(vg); merged += 1
        else:
            vg.name = t; renamed += 1
    else:
        helena_dress.vertex_groups.remove(vg); removed += 1
print(f"  VG: kept={kept} renamed={renamed} merged={merged} removed={removed}")

# [10] cleanup + save
print(f"\n[10] Cleanup + save")
if helena_arm: bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_dress.name = f"{HELENA_DRESS} (fit QM v3)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
