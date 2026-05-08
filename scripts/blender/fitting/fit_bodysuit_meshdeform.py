"""Helena_Final_Public.blend の GCC DOA Bodysuit を QM body へ Mesh Deform でフィッティング。

fit_helena_to_qm.py のロジック流用、Helena_Final_Public 用に bone mapping 調整。

手順:
  1. QM blend を開く (base)
  2. Helena_Final_Public から Helena_Base + Bodysuit + 必要 armature を append
  3. Helena_Base を QM origin に位置合わせ
  4. Helena_Base に Shrinkwrap (target=QM body, 無効状態)
  5. Bodysuit に Mesh Deform (cage=Helena_Base) → bind
  6. Shrinkwrap 有効化 → Helena_Base が QM 形状に変形 → Bodysuit も追従
  7. Mesh Deform を apply
  8. Bodysuit の Armature modifier を QM rig に差し替え + vertex group rename

Usage:
  blender --background <qm.blend> --python fit_bodysuit_meshdeform.py -- \
    <helena.blend> <helena_body> <helena_suit> <qm_body> <qm_armature> <out_blend>

例:
  blender --background "E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend" \
    --python scripts/blender/fitting/fit_bodysuit_meshdeform.py -- \
    "E:/Helena_Final_Public.blend" "Helena_Base" "GCC DOA Outfit Bodysuit Mesh" \
    "Queen Marika Body" "QueenMarika_rig" "F:/Helena_Bodysuit_to_QM_meshdeform.blend"
"""
import bpy
import sys
import os
import mathutils

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

# Helena_Final_Public.blend の Bodysuit vertex groups → QM ARP rig bones マッピング
# 確認済みの 18 vertex groups に対応
SRC_TO_TGT_BONE = {
    # spine / chest
    'DEF-spine':       'c_spine_01_bend.x',
    'DEF-spine-1':     'c_spine_02_bend.x',
    'DEF-chest':       'c_spine_03_bend.x',
    'DEF-chest-1':     'c_spine_03_bend.x',  # 統合
    # pelvis
    'pelvis':          'c_root_bend.x',
    'hip':             'c_root_bend.x',  # 統合
    # neck / shoulder
    'neck':            'neck.x',
    'clavicle.L':      'shoulder.l',
    'clavicle.R':      'shoulder.r',
    # breast
    'pectoral.L':      'breast_l',
    'pectoral.R':      'breast_r',
    # arms
    'upper_arm.bend.L':  'c_arm_stretch.l',
    'upper_arm.bend.R':  'c_arm_stretch.r',
    'upper_arm.twist.L': 'c_arm_twist.l',
    'upper_arm.twist.R': 'c_arm_twist.r',
    # thighs
    'thigh.bend.L':   'c_thigh_stretch.l',
    'thigh.bend.R':   'c_thigh_stretch.r',
    'thigh.twist.L':  'c_thigh_twist.l',
    'thigh.twist.R':  'c_thigh_twist.r',
}

print(f"\n=== fit_bodysuit_meshdeform ===")
print(f"  Helena blend : {HELENA_BLEND}")
print(f"  Helena body  : {HELENA_BODY}")
print(f"  Helena suit  : {HELENA_SUIT}")
print(f"  QM body      : {QM_BODY}")
print(f"  QM armature  : {QM_ARMATURE}")
print(f"  output       : {OUT_BLEND}")

# ========================================================================
# 0. QM scene check
# ========================================================================
qm_body_obj = bpy.data.objects.get(QM_BODY)
qm_arm_obj  = bpy.data.objects.get(QM_ARMATURE)
if qm_body_obj is None or qm_arm_obj is None:
    print(f"  ERROR: QM body or armature not found")
    sys.exit(1)
print(f"\n[0] QM body OK ({len(qm_body_obj.data.vertices)} verts), armature OK")

# ========================================================================
# 1. Helena_Final_Public から append
# ========================================================================
print(f"\n[1] Append from {HELENA_BLEND}")
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
    print(f"  ERROR: failed to append Helena objects")
    sys.exit(1)
print(f"  body verts: {len(helena_body.data.vertices)}")
print(f"  suit verts: {len(helena_suit.data.vertices)}")

# Helena armature reference (via modifier)
helena_arm = None
for m in list(helena_body.modifiers) + list(helena_suit.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        helena_arm = m.object
        break
if helena_arm:
    if helena_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
        bpy.context.scene.collection.objects.link(helena_arm)
        helena_arm.hide_viewport = False; helena_arm.hide_set(False)
    print(f"  Helena armature: {helena_arm.name}")

# ========================================================================
# 2. Align Helena to QM origin (bbox center match)
# ========================================================================
print(f"\n[2] Align Helena to QM")
def world_bbox_center(obj):
    mw = obj.matrix_world
    coords = [mw @ v.co for v in obj.data.vertices]
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    return mathutils.Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))

qm_center = world_bbox_center(qm_body_obj)
helena_center = world_bbox_center(helena_body)
delta = qm_center - helena_center
print(f"  QM body center: {tuple(round(c,3) for c in qm_center)}")
print(f"  Helena body center: {tuple(round(c,3) for c in helena_center)}")
print(f"  Delta: {tuple(round(c,3) for c in delta)}")

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
print(f"  Helena body center after: {tuple(round(c,3) for c in world_bbox_center(helena_body))}")

# ========================================================================
# 3. Clear shape keys on body and suit (Mesh Deform/Shrinkwrap apply needs no shape keys)
# ========================================================================
print(f"\n[3] Clear shape keys")
for obj, label in [(helena_body, 'body'), (helena_suit, 'suit')]:
    if obj.data.shape_keys:
        n = len(obj.data.shape_keys.key_blocks)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shape_key_remove(all=True)
        print(f"  cleared {n} shape keys from {label}")

# ========================================================================
# 4. Disable existing modifiers on body (we want T-pose mesh for Shrinkwrap target eval)
# ========================================================================
print(f"\n[4] Disable Helena body modifiers (use rest mesh for Shrinkwrap)")
saved_body_states = {}
for m in helena_body.modifiers:
    saved_body_states[m.name] = m.show_viewport
    m.show_viewport = False
print(f"  disabled {len(saved_body_states)} body modifiers")

# Add Shrinkwrap on Helena body (disabled)
sw = helena_body.modifiers.new(name='SW_QM', type='SHRINKWRAP')
sw.target = qm_body_obj
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.show_viewport = False
print(f"  added Shrinkwrap (disabled): target={sw.target.name}")

# ========================================================================
# 5. Disable suit Armature/Subsurf, Add Mesh Deform on suit, bind
# ========================================================================
print(f"\n[5] Add Mesh Deform on suit and bind")
suit_disabled = []
for m in helena_suit.modifiers:
    if m.type in ('ARMATURE', 'SUBSURF'):
        suit_disabled.append((m.name, m.show_viewport, m.show_render))
        m.show_viewport = False
        m.show_render = False

md = helena_suit.modifiers.new(name='MD_HelenaBody', type='MESH_DEFORM')
md.object = helena_body
md.precision = 5
md.use_dynamic_bind = False
print(f"  added MeshDeform: cage={md.object.name}, precision={md.precision}")

bpy.ops.object.select_all(action='DESELECT')
helena_suit.select_set(True)
bpy.context.view_layer.objects.active = helena_suit
print(f"  binding (may take a while)...")
try:
    bpy.ops.object.meshdeform_bind(modifier=md.name)
except Exception as e:
    print(f"  ERROR: meshdeform_bind exception: {e}")
    sys.exit(1)
if not md.is_bound:
    print(f"  ERROR: meshdeform bind failed (suit verts outside cage?)")
    sys.exit(1)
print(f"  bind OK")

# ========================================================================
# 6. Enable Shrinkwrap → body deforms to QM, suit follows
# ========================================================================
print(f"\n[6] Enable Shrinkwrap → body morphs to QM shape")
sw.show_viewport = True
bpy.context.view_layer.update()

# ========================================================================
# 7. Apply Mesh Deform on suit
# ========================================================================
print(f"\n[7] Apply MeshDeform on suit")
bpy.ops.object.select_all(action='DESELECT')
helena_suit.select_set(True)
bpy.context.view_layer.objects.active = helena_suit
while helena_suit.modifiers[0].name != md.name:
    bpy.ops.object.modifier_move_up(modifier=md.name)
try:
    bpy.ops.object.modifier_apply(modifier=md.name)
    print(f"  applied. Suit now QM-shaped.")
except Exception as e:
    print(f"  ERROR: apply failed: {e}")
    sys.exit(1)

# Re-enable suit modifiers
for name, vp, rd in suit_disabled:
    m = helena_suit.modifiers.get(name)
    if m: m.show_viewport = vp; m.show_render = rd

# ========================================================================
# 8. Re-target suit's Armature to QM rig + rename vertex groups
# ========================================================================
print(f"\n[8] Re-target suit armature to QM rig")
suit_arm_mod = next((m for m in helena_suit.modifiers if m.type == 'ARMATURE'), None)
if suit_arm_mod:
    suit_arm_mod.object = qm_arm_obj
    print(f"  armature modifier now targets {qm_arm_obj.name}")
else:
    am = helena_suit.modifiers.new(name='Armature_QM', type='ARMATURE')
    am.object = qm_arm_obj
    am.use_vertex_groups = True
    print(f"  added new armature modifier -> {qm_arm_obj.name}")

# Rename vertex groups
qm_bone_names = set(b.name for b in qm_arm_obj.data.bones)
renamed = 0; removed = 0; kept = 0
for vg in list(helena_suit.vertex_groups):
    src = vg.name
    if src in qm_bone_names:
        kept += 1; continue
    tgt = SRC_TO_TGT_BONE.get(src)
    if tgt and tgt in qm_bone_names:
        if tgt in helena_suit.vertex_groups:
            # merge into existing
            src_idx = vg.index
            tgt_vg = helena_suit.vertex_groups[tgt]
            for v in helena_suit.data.vertices:
                for g in v.groups:
                    if g.group == src_idx:
                        tgt_vg.add([v.index], g.weight, 'ADD')
            helena_suit.vertex_groups.remove(vg)
        else:
            vg.name = tgt
        renamed += 1
    else:
        helena_suit.vertex_groups.remove(vg)
        removed += 1
        print(f"    unmapped (removed): {src}")
print(f"  VG: kept={kept}, renamed={renamed}, removed={removed}")

# ========================================================================
# 9. Cleanup: remove Helena body and armature
# ========================================================================
print(f"\n[9] Cleanup")
if helena_arm:
    bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)
helena_suit.parent = qm_arm_obj
helena_suit.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()

# Rename suit
fitted_name = f"{helena_suit.name} (fit QM MD)"
helena_suit.name = fitted_name
print(f"  suit renamed: {fitted_name}")

# ========================================================================
# 10. Save
# ========================================================================
print(f"\n[10] Save {OUT_BLEND}")
out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved")
print(f"\n=== DONE ===")
