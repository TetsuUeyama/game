"""Helena → QM 衣装フィッティング V4 (body-coincident surface)。

コンセプト:
  dress の全頂点を QM body 表面 + 微小オフセットに直接投影。
  隙間・陥没ゼロ、体表面と完全一致 (body-paint のような見た目)。

手順:
  [1] Helena blend から dress + armature を append
  [2] 原点を QM に揃える
  [3] LBS retarget: dress 頂点を QM rest pose へ (ポーズずれ吸収)
  [4] Shrinkwrap on dress: NEAREST_SURFACEPOINT, target=QM body, offset=0.003m
  [5] apply
  [6] post-process: 念のため QM 表面との距離を再確認、埋没があれば再 push
  [7] VG rename → QM armature へ再 parent
  [8] cleanup + save

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v4.py -- \
    <helena.blend> <helena_body_name> <helena_dress_name> \
    <qm_body_name> <qm_armature_name> <out_blend_path> [<offset_m>]

  offset_m: QM 表面からの外向きオフセット (デフォルト 0.003m = 3mm)
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
OFFSET_M = float(args[6]) if len(args) > 6 else 0.003

print(f"\n=== fit_helena_to_qm V4 (body-coincident) ===")
print(f"  offset: {OFFSET_M*1000:.1f}mm outside QM surface")
print(f"  out: {OUT_BLEND}")

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

# [1] Append Helena body (for LBS retarget weight ref) + dress
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
print(f"  dress={helena_dress.name} arm={helena_arm.name if helena_arm else None}")

# [2] Origin align
print(f"\n[2] Origin align")
def wbbox_center(o):
    mw = o.matrix_world; cs = [mw @ v.co for v in o.data.vertices]
    xs=[c.x for c in cs]; ys=[c.y for c in cs]; zs=[c.z for c in cs]
    return Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))

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

# [3] LBS retarget dress
print(f"\n[3] LBS retarget dress")
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
    print(f"  bone transforms: {len(bt)}")

    vg = {v.index: v.name for v in helena_dress.vertex_groups}
    mw = helena_dress.matrix_world; mwi = mw.inverted()
    zw = 0
    for v in helena_dress.data.vertices:
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
    helena_dress.data.update()
    print(f"  zero-weight: {zw}")

# [4] Shrinkwrap dress to QM body
print(f"\n[4] Shrinkwrap dress to QM body")
# shape key 削除 (apply の障害)
if helena_dress.data.shape_keys:
    n = len(helena_dress.data.shape_keys.key_blocks)
    helena_dress.shape_key_clear()
    print(f"  cleared {n} shape keys")

# 既存 modifier を全 disable
dress_arm = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE':
        dress_arm = m
    m.show_viewport = False

sw = helena_dress.modifiers.new('SW_QM', 'SHRINKWRAP')
sw.target = qm_body_obj
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.offset = OFFSET_M
sw.show_viewport = True
print(f"  SW: NEAREST_SURFACEPOINT offset={OFFSET_M}")

# [5] Apply SW (top of stack)
print(f"\n[5] Apply Shrinkwrap")
bpy.context.view_layer.objects.active = helena_dress
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
while helena_dress.modifiers[0].name != sw.name:
    bpy.ops.object.modifier_move_up(modifier=sw.name)
bpy.ops.object.modifier_apply(modifier=sw.name)
print(f"  applied")

# armature modifier を再 enable
if dress_arm: dress_arm.show_viewport = True

# [6] Post-process: ray-cast check で埋没頂点ゼロ確認 + safety push
print(f"\n[6] Safety check: count any still-inside verts")
depsgraph = bpy.context.evaluated_depsgraph_get()
qm_eval = qm_body_obj.evaluated_get(depsgraph)
qm_mesh = qm_eval.to_mesh()
bm = bmesh.new(); bm.from_mesh(qm_mesh); bm.transform(qm_body_obj.matrix_world)
bvh = BVHTree.FromBMesh(bm)

def is_inside(p, bvh):
    hits = 0; org = p.copy(); d = Vector((0,0,1))
    for _ in range(100):
        loc, n, i, dist = bvh.ray_cast(org, d)
        if loc is None: break
        hits += 1; org = loc + d * 1e-4
    return hits % 2 == 1

mw = helena_dress.matrix_world; mwi = mw.inverted()
still_inside = 0; pushed = 0
for v in helena_dress.data.vertices:
    wp = mw @ v.co
    if is_inside(wp, bvh):
        still_inside += 1
        loc, n, idx, dist = bvh.find_nearest(wp)
        if loc is not None and n is not None:
            v.co = mwi @ (loc + n * OFFSET_M)
            pushed += 1
helena_dress.data.update()
bm.free(); qm_eval.to_mesh_clear()
print(f"  still inside after SW: {still_inside} (pushed {pushed})")

# [7] Re-parent dress to QM armature + VG rename
print(f"\n[7] Re-parent + VG rename")
if dress_arm:
    dress_arm.object = qm_arm_obj
else:
    am = helena_dress.modifiers.new('Armature_QM', 'ARMATURE')
    am.object = qm_arm_obj; am.use_vertex_groups = True

qm_bn = set(b.name for b in qm_arm_obj.data.bones)
kept=renamed=merged=removed=0
for v in list(helena_dress.vertex_groups):
    s = v.name
    if s in qm_bn: kept += 1; continue
    t = SRC_TO_TGT_BONE.get(s)
    if t and t in qm_bn:
        if t in helena_dress.vertex_groups:
            tv = helena_dress.vertex_groups[t]; si = v.index
            for vv in helena_dress.data.vertices:
                for g in vv.groups:
                    if g.group == si: tv.add([vv.index], g.weight, 'ADD')
            helena_dress.vertex_groups.remove(v); merged += 1
        else:
            v.name = t; renamed += 1
    else:
        helena_dress.vertex_groups.remove(v); removed += 1
print(f"  VG: kept={kept} renamed={renamed} merged={merged} removed={removed}")

# [8] cleanup + save
print(f"\n[8] Cleanup + save")
if helena_arm: bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_dress.name = f"{HELENA_DRESS} (fit QM v4)"
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE: {OUT_BLEND} ===")
