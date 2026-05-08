"""Torso-only cage 版 Bodysuit fit。

fit_bodysuit_meshdeform.py の改良版:
  Helena_Base から「Bodysuit から RADIUS 以内」の vertex のみ残した torso-only cage を作成し、
  それを Mesh Deform の cage に使う。

利点:
  - 腕・頭・脚の cage がないので、Shrinkwrap で arm 領域が QM torso に潰れる artifact が消える
  - cage 変形が clean → Mesh Deform で suit に伝播する deformation も clean
  - T-pose vs A-pose 差が torso 範囲のみに limited

手順:
  1. QM blend を base に開く
  2. Helena_Final_Public から Helena_Base + Bodysuit を append
  3. Helena_Base を QM origin に位置合わせ
  4. **Helena_Base から bodysuit より RADIUS 以遠の vertex/face を削除 (torso-only cage 化)**
  5. cage に Shrinkwrap (target=QM body, 無効状態)
  6. Bodysuit に Mesh Deform (cage=trimmed Helena_Base) → bind
  7. Shrinkwrap 有効化 → cage が QM 形状に変形 → Bodysuit も追従
  8. Mesh Deform apply
  9. Bodysuit の Armature を QM rig に差し替え + vertex group rename

Usage:
  blender --background <qm.blend> --python fit_bodysuit_torso_cage.py -- \
    <helena.blend> <helena_body> <helena_suit> <qm_body> <qm_armature> <out_blend> [<radius_m>]

  default radius: 0.15 (15cm)
"""
import bpy
import bmesh
import sys
import os
import mathutils
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

HELENA_BLEND   = args[0]
HELENA_BODY    = args[1]
HELENA_SUIT    = args[2]
QM_BODY        = args[3]
QM_ARMATURE    = args[4]
OUT_BLEND      = args[5]
KEEP_RADIUS    = float(args[6]) if len(args) > 6 else 0.15

SRC_TO_TGT_BONE = {
    'DEF-spine':       'c_spine_01_bend.x',
    'DEF-spine-1':     'c_spine_02_bend.x',
    'DEF-chest':       'c_spine_03_bend.x',
    'DEF-chest-1':     'c_spine_03_bend.x',
    'pelvis':          'c_root_bend.x',
    'hip':             'c_root_bend.x',
    'neck':            'neck.x',
    'clavicle.L':      'shoulder.l',
    'clavicle.R':      'shoulder.r',
    'pectoral.L':      'breast_l',
    'pectoral.R':      'breast_r',
    'upper_arm.bend.L':  'c_arm_stretch.l',
    'upper_arm.bend.R':  'c_arm_stretch.r',
    'upper_arm.twist.L': 'c_arm_twist.l',
    'upper_arm.twist.R': 'c_arm_twist.r',
    'thigh.bend.L':   'c_thigh_stretch.l',
    'thigh.bend.R':   'c_thigh_stretch.r',
    'thigh.twist.L':  'c_thigh_twist.l',
    'thigh.twist.R':  'c_thigh_twist.r',
}

print(f"\n=== fit_bodysuit_torso_cage ===")
print(f"  Helena blend : {HELENA_BLEND}")
print(f"  Helena body  : {HELENA_BODY}")
print(f"  Helena suit  : {HELENA_SUIT}")
print(f"  QM body      : {QM_BODY}")
print(f"  QM armature  : {QM_ARMATURE}")
print(f"  output       : {OUT_BLEND}")
print(f"  keep radius  : {KEEP_RADIUS*100:.1f}cm")

# ==== 0. QM scene check ====
qm_body_obj = bpy.data.objects.get(QM_BODY)
qm_arm_obj  = bpy.data.objects.get(QM_ARMATURE)
if qm_body_obj is None or qm_arm_obj is None:
    print(f"  ERROR: QM body or armature not found"); sys.exit(1)

# ==== 1. Append from Helena_Final_Public ====
print(f"\n[1] Append")
with bpy.data.libraries.load(HELENA_BLEND, link=False) as (src, dst):
    want = {HELENA_BODY, HELENA_SUIT}
    dst.objects = [n for n in src.objects if n in want]

helena_body = None
helena_suit = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
    if o.name == HELENA_BODY: helena_body = o
    if o.name == HELENA_SUIT: helena_suit = o

if helena_body is None or helena_suit is None:
    print(f"  ERROR: append failed"); sys.exit(1)

helena_arm = None
for m in list(helena_body.modifiers) + list(helena_suit.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        helena_arm = m.object; break
if helena_arm:
    if helena_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
        bpy.context.scene.collection.objects.link(helena_arm)
        helena_arm.hide_viewport = False; helena_arm.hide_set(False)
print(f"  body verts: {len(helena_body.data.vertices)}, suit verts: {len(helena_suit.data.vertices)}")

# ==== 2. Align Helena to QM origin ====
print(f"\n[2] Align Helena to QM")
def world_bbox_center(obj):
    mw = obj.matrix_world
    coords = [mw @ v.co for v in obj.data.vertices]
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    return mathutils.Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))

qm_center = world_bbox_center(qm_body_obj)
helena_center = world_bbox_center(helena_body)
delta = qm_center - helena_center
print(f"  delta: {tuple(round(c,3) for c in delta)}")

def is_descendant_of(obj, ancestor):
    cur = obj.parent
    while cur:
        if cur == ancestor: return True
        cur = cur.parent
    return False

if helena_arm:
    helena_arm.location = helena_arm.location + delta
    for obj in [helena_body, helena_suit]:
        if not is_descendant_of(obj, helena_arm):
            obj.location = obj.location + delta
else:
    for obj in [helena_body, helena_suit]:
        obj.location = obj.location + delta
bpy.context.view_layer.update()

# ==== 3. Clear shape keys ====
print(f"\n[3] Clear shape keys")
for obj, label in [(helena_body, 'body'), (helena_suit, 'suit')]:
    if obj.data.shape_keys:
        n = len(obj.data.shape_keys.key_blocks)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True); bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shape_key_remove(all=True)
        print(f"  cleared {n} sk from {label}")

# ==== 4. Trim Helena_Base to torso-only cage (within RADIUS of suit) ====
print(f"\n[4] Trim Helena_Base → torso-only cage (within {KEEP_RADIUS*100:.1f}cm of suit)")

# Build BVH from suit (current Helena state, no armature)
suit_mw = helena_suit.matrix_world
suit_bm = bmesh.new()
suit_bm.from_mesh(helena_suit.data)
suit_bm.transform(suit_mw)
suit_bvh = BVHTree.FromBMesh(suit_bm)

n_before = len(helena_body.data.vertices)
body_mw = helena_body.matrix_world

# Identify keep verts (within RADIUS of suit surface)
keep_verts = set()
for i, v in enumerate(helena_body.data.vertices):
    wp = body_mw @ v.co
    nearest, _, _, _ = suit_bvh.find_nearest(wp, KEEP_RADIUS)
    if nearest is not None:
        keep_verts.add(i)
suit_bm.free()
print(f"  keep verts: {len(keep_verts)}/{n_before} ({100*len(keep_verts)/n_before:.1f}%)")

if len(keep_verts) < 100:
    print(f"  ERROR: too few keep verts, RADIUS may be too small"); sys.exit(1)

# Delete non-keep verts via bmesh
body_bm = bmesh.new()
body_bm.from_mesh(helena_body.data)
body_bm.verts.ensure_lookup_table()
to_delete = [v for v in body_bm.verts if v.index not in keep_verts]
bmesh.ops.delete(body_bm, geom=to_delete, context='VERTS')
body_bm.to_mesh(helena_body.data)
body_bm.free()
helena_body.data.update()
n_after = len(helena_body.data.vertices)
print(f"  body verts after trim: {n_after} ({n_before - n_after} removed)")

# ==== 5. Disable body modifiers, add Shrinkwrap (disabled) ====
print(f"\n[5] Setup Shrinkwrap on cage")
for m in helena_body.modifiers:
    m.show_viewport = False
sw = helena_body.modifiers.new(name='SW_QM', type='SHRINKWRAP')
sw.target = qm_body_obj
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.show_viewport = False

# ==== 6. Add Mesh Deform on suit, bind ====
print(f"\n[6] Add MeshDeform and bind")
for m in helena_suit.modifiers:
    if m.type in ('ARMATURE', 'SUBSURF'):
        m.show_viewport = False; m.show_render = False

md = helena_suit.modifiers.new(name='MD_HelenaBody', type='MESH_DEFORM')
md.object = helena_body
md.precision = 5
md.use_dynamic_bind = False
print(f"  precision={md.precision}, cage verts={n_after}")

bpy.ops.object.select_all(action='DESELECT')
helena_suit.select_set(True); bpy.context.view_layer.objects.active = helena_suit
print(f"  binding...")
bpy.ops.object.meshdeform_bind(modifier=md.name)
if not md.is_bound:
    print(f"  ERROR: bind failed"); sys.exit(1)
print(f"  bind OK")

# ==== 7. Enable Shrinkwrap → cage morphs to QM ====
print(f"\n[7] Enable Shrinkwrap")
sw.show_viewport = True
bpy.context.view_layer.update()

# ==== 8. Apply Mesh Deform ====
print(f"\n[8] Apply MeshDeform")
bpy.ops.object.select_all(action='DESELECT')
helena_suit.select_set(True); bpy.context.view_layer.objects.active = helena_suit
while helena_suit.modifiers[0].name != md.name:
    bpy.ops.object.modifier_move_up(modifier=md.name)
bpy.ops.object.modifier_apply(modifier=md.name)
print(f"  applied")

# Re-enable suit modifiers
for m in helena_suit.modifiers:
    if m.type in ('ARMATURE', 'SUBSURF'):
        m.show_viewport = True; m.show_render = True

# ==== 9. Re-target armature + rename VG ====
print(f"\n[9] Re-target armature")
suit_arm_mod = next((m for m in helena_suit.modifiers if m.type == 'ARMATURE'), None)
if suit_arm_mod:
    suit_arm_mod.object = qm_arm_obj
else:
    am = helena_suit.modifiers.new(name='Armature_QM', type='ARMATURE')
    am.object = qm_arm_obj; am.use_vertex_groups = True

qm_bone_names = set(b.name for b in qm_arm_obj.data.bones)
renamed = 0; removed = 0; kept = 0
for vg in list(helena_suit.vertex_groups):
    src = vg.name
    if src in qm_bone_names: kept += 1; continue
    tgt = SRC_TO_TGT_BONE.get(src)
    if tgt and tgt in qm_bone_names:
        if tgt in helena_suit.vertex_groups:
            src_idx = vg.index; tgt_vg = helena_suit.vertex_groups[tgt]
            for v in helena_suit.data.vertices:
                for g in v.groups:
                    if g.group == src_idx:
                        tgt_vg.add([v.index], g.weight, 'ADD')
            helena_suit.vertex_groups.remove(vg)
        else:
            vg.name = tgt
        renamed += 1
    else:
        helena_suit.vertex_groups.remove(vg); removed += 1
print(f"  VG: kept={kept}, renamed={renamed}, removed={removed}")

# ==== 10. Cleanup + save ====
print(f"\n[10] Cleanup and save")
if helena_arm: bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)
helena_suit.parent = qm_arm_obj
helena_suit.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_suit.name = f"{helena_suit.name} (fit QM TC)"

out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved: {OUT_BLEND}")
print(f"\n=== DONE ===")
