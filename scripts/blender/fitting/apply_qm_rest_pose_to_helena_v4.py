"""Apply QM rest pose orientations to Helena_Final_Public armature (v4).

Helena_Final_Public.blend は Rigify ではなく DAZ G8F 系 rig。
v2 (Rigify CTRL) ではなく、DEF-bone 系を直接 pose する。

目的:
  Helena armature の各 bone の世界空間 Y 方向を QM 対応 bone の Y 方向に揃える。
  → cloth mesh が QM rest pose 空間で焼き直され、LBS retarget 時の rest pose 差ゼロに。

Pipeline:
  1. Helena blend を base に開く
  2. QM blend から QM armature を append
  3. config の vg_rename から bone 対応辞書を構築
  4. Helena bone を parent → leaf 順序で処理:
     a. 現在の world Y 方向を取得
     b. 対応 QM bone の world Y 方向を取得
     c. rotation_difference で最小回転を計算
     d. pose_bone.matrix を更新
  5. 各 skinned mesh の Armature modifier を apply (posed visual を mesh data に焼く)
  6. armature_apply で rest pose 化
  7. 別 .blend に保存

Usage:
  blender --background <helena.blend> --python apply_qm_rest_pose_to_helena_v4.py -- \
    <qm.blend> <qm_armature_name> <config.json> <out.blend>

例:
  blender --background "E:/Helena_Final_Public.blend" \
    --python scripts/blender/fitting/apply_qm_rest_pose_to_helena_v4.py -- \
    "E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend" "QueenMarika_rig" \
    "config/clothing_retarget_helena_to_qm.json" \
    "E:/Helena_Final_Public_QMRest.blend"
"""
import bpy
import sys
import os
import json
import math
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 4:
    print(__doc__); sys.exit(1)

QM_BLEND     = args[0]
QM_ARM_NAME  = args[1]
CONFIG_JSON  = args[2]
OUT_BLEND    = args[3]

print(f"\n=== apply_qm_rest_pose_to_helena_v4 ===")
print(f"  qm: {QM_BLEND}:{QM_ARM_NAME}")
print(f"  config: {CONFIG_JSON}")
print(f"  out: {OUT_BLEND}")

with open(CONFIG_JSON, encoding='utf-8') as f:
    config = json.load(f)
VG_RENAME = config['vg_rename']  # helena_bone → qm_bone

# Limit to deformation-relevant bones (skip eyelid micro-bones)
SKIP_PATTERNS = ('eyelid', 'Ponytail', 'SideHair', 'lowerJaw',
                 'thumb.', 'f_index', 'f_middle', 'f_ring',
                 'palm_', 'big_toe.0', 'small_toe', 'tarsal')
HELENA_TO_QM = {h: q for h, q in VG_RENAME.items()
                if not any(p in h for p in SKIP_PATTERNS)}

# ============================================================
# [1] Find Helena armature
# ============================================================
helena_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        if helena_arm is None or len(o.data.bones) > len(helena_arm.data.bones):
            helena_arm = o
print(f"\n[1] Helena armature: {helena_arm.name} ({len(helena_arm.data.bones)} bones)")

# ============================================================
# [2] Append QM armature
# ============================================================
print(f"\n[2] Append QM armature")
QM_BLEND_ABS = os.path.abspath(QM_BLEND)
existing_names = set(o.name for o in bpy.data.objects)
with bpy.data.libraries.load(QM_BLEND_ABS, link=False) as (data_from, data_to):
    if QM_ARM_NAME not in data_from.objects:
        print(f"  ERROR: {QM_ARM_NAME} not in {QM_BLEND}"); sys.exit(1)
    data_to.objects = [QM_ARM_NAME]
qm_arm = None
for o in bpy.data.objects:
    if o.name in existing_names: continue
    if o.name == QM_ARM_NAME or o.name.startswith(QM_ARM_NAME + '.'):
        qm_arm = o; break
if qm_arm is None:
    print(f"  ERROR: QM armature not loaded"); sys.exit(1)
if qm_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(qm_arm)
print(f"  QM armature: {qm_arm.name} ({len(qm_arm.data.bones)} bones)")

# ============================================================
# [3] Compute QM bone world Y directions (rest pose)
# ============================================================
print(f"\n[3] Extract QM bone directions")
qm_dirs = {}
qm_world = qm_arm.matrix_world
for b in qm_arm.data.bones:
    head_w = qm_world @ b.head_local
    tail_w = qm_world @ b.tail_local
    d = tail_w - head_w
    if d.length < 1e-6: continue
    qm_dirs[b.name] = d.normalized()

# ============================================================
# [4] Verify mappings
# ============================================================
helena_bones = {b.name for b in helena_arm.data.bones}
valid = {}
n_skip_h = 0; n_skip_q = 0
for h, q in HELENA_TO_QM.items():
    if h not in helena_bones: n_skip_h += 1; continue
    if q not in qm_dirs: n_skip_q += 1; continue
    valid[h] = q
print(f"\n[4] Valid mappings: {len(valid)}/{len(HELENA_TO_QM)} (skip helena-missing={n_skip_h}, qm-missing={n_skip_q})")

# ============================================================
# [5] Sort helena bones in parent → child order
# ============================================================
def bone_depth(bone):
    d = 0
    cur = bone.parent
    while cur is not None:
        d += 1
        cur = cur.parent
    return d

ordered = sorted(valid.keys(), key=lambda n: bone_depth(helena_arm.data.bones[n]))
print(f"\n[5] Process order ({len(ordered)} bones, parent → child):")
for n in ordered[:20]:
    print(f"  d={bone_depth(helena_arm.data.bones[n]):2d}  {n} -> {valid[n]}")
if len(ordered) > 20:
    print(f"  ... and {len(ordered) - 20} more")

# ============================================================
# [6] Pose mode: rotate each Helena bone to align Y with QM bone Y
# ============================================================
print(f"\n[6] Apply rotations in pose mode")
bpy.ops.object.select_all(action='DESELECT')
helena_arm.select_set(True)
bpy.context.view_layer.objects.active = helena_arm
bpy.ops.object.mode_set(mode='POSE')
helena_world = helena_arm.matrix_world

n_rotated = 0
n_skipped_align = 0
for h_name in ordered:
    q_name = valid[h_name]
    pb = helena_arm.pose.bones[h_name]
    target_y = qm_dirs[q_name]

    bpy.context.view_layer.update()
    cur_world_mat = pb.matrix.copy()
    cur_y_world = (helena_world.to_3x3() @ cur_world_mat.to_3x3() @ Vector((0, 1, 0))).normalized()

    rot_q = cur_y_world.rotation_difference(target_y)
    angle_deg = math.degrees(rot_q.angle)

    if angle_deg < 0.5:
        n_skipped_align += 1
        continue

    # Rotation in helena local space
    helena_rot_3x3 = helena_world.to_3x3()
    helena_rot_inv = helena_rot_3x3.inverted()
    rot_local = helena_rot_inv @ rot_q.to_matrix() @ helena_rot_3x3

    head = cur_world_mat.translation.copy()
    cur_basis = cur_world_mat.to_3x3()
    new_basis = rot_local @ cur_basis
    new_world = new_basis.to_4x4()
    new_world.translation = head

    pb.matrix = new_world
    n_rotated += 1

bpy.context.view_layer.update()
print(f"  rotated: {n_rotated}, already-aligned (skipped): {n_skipped_align}")

# ============================================================
# [7] Bake posed visual into all skinned meshes
# ============================================================
print(f"\n[7] Bake posed visual into mesh data")
bpy.ops.object.mode_set(mode='OBJECT')

def enable_layer_collection(lc):
    lc.exclude = False
    lc.hide_viewport = False
    lc.collection.hide_viewport = False
    lc.collection.hide_render = False
    for child in lc.children:
        enable_layer_collection(child)
for lc in bpy.context.view_layer.layer_collection.children:
    enable_layer_collection(lc)

skinned_meshes = []
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    arm_mods = [m for m in o.modifiers if m.type == 'ARMATURE' and m.object == helena_arm]
    if not arm_mods: continue
    skinned_meshes.append((o, arm_mods))
print(f"  found {len(skinned_meshes)} skinned meshes")

n_baked = 0; n_failed = 0
for o, arm_mods in skinned_meshes:
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
    if o.data.shape_keys:
        try:
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.shape_key_remove(all=True)
        except Exception as e:
            print(f"  WARN {o.name}: shape_key_remove failed: {e}")
    bpy.ops.object.select_all(action='DESELECT')
    try:
        o.select_set(True)
    except RuntimeError as e:
        print(f"  SKIP {o.name}: {e}"); n_failed += 1; continue
    bpy.context.view_layer.objects.active = o
    baked = False
    for m in list(arm_mods):
        m.show_viewport = True; m.show_render = True
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
            baked = True
        except Exception as e:
            print(f"  WARN {o.name}.{m.name}: {e}"); n_failed += 1
    if baked:
        new_am = o.modifiers.new(name='Armature', type='ARMATURE')
        new_am.object = helena_arm
        new_am.use_vertex_groups = True
        n_baked += 1
print(f"  baked {n_baked} meshes ({n_failed} failures)")

# ============================================================
# [8] Apply pose as rest pose
# ============================================================
print(f"\n[8] Apply pose as rest")
bpy.ops.object.select_all(action='DESELECT')
helena_arm.select_set(True)
bpy.context.view_layer.objects.active = helena_arm
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.armature_apply()
bpy.ops.object.mode_set(mode='OBJECT')

# ============================================================
# [9] Pelvis Z alignment: align Helena pelvis to QM root bone
# (Cloth is hip-based, so hip height match > floor match)
# ============================================================
print(f"\n[9] Pelvis Z alignment")
# Re-add QM armature for reference
QM_ARM_REF = bpy.data.objects.get(QM_ARM_NAME)
if QM_ARM_REF is None:
    with bpy.data.libraries.load(QM_BLEND_ABS, link=False) as (df, dt):
        if QM_ARM_NAME in df.objects:
            dt.objects = [QM_ARM_NAME]
    QM_ARM_REF = bpy.data.objects.get(QM_ARM_NAME)
    if QM_ARM_REF and QM_ARM_REF.name not in {o.name for o in bpy.context.scene.collection.objects}:
        bpy.context.scene.collection.objects.link(QM_ARM_REF)

if QM_ARM_REF:
    # Find a hip-anchor bone in both rigs
    qm_hip_bone = QM_ARM_REF.data.bones.get('c_root_bend.x')
    helena_hip_bone = helena_arm.data.bones.get('pelvis') or helena_arm.data.bones.get('hip')
    if qm_hip_bone and helena_hip_bone:
        bpy.context.view_layer.update()
        qm_hip_z = (QM_ARM_REF.matrix_world @ qm_hip_bone.head_local).z
        helena_hip_z = (helena_arm.matrix_world @ helena_hip_bone.head_local).z
        # Hip alignment のみ (extra shift は LBS retarget 後に適用、armature.location 経由では伝播しない)
        offset_z = qm_hip_z - helena_hip_z
        print(f"  QM     hip Z (c_root_bend.x): {qm_hip_z:.4f}m")
        print(f"  Helena hip Z ({helena_hip_bone.name}): {helena_hip_z:.4f}m")
        print(f"  offset Z: {offset_z:+.4f}m → applying to helena_arm")
        helena_arm.location.z += offset_z
        bpy.context.view_layer.update()
        h_after = (helena_arm.matrix_world @ helena_hip_bone.head_local).z
        print(f"  Helena hip Z after: {h_after:.4f}m (residual {h_after - qm_hip_z:+.4f}m)")
    # Cleanup QM ref armature (if newly loaded)
    bpy.data.objects.remove(QM_ARM_REF, do_unlink=True)
else:
    print(f"  WARN: QM armature not available for hip alignment")

# ============================================================
# [10] Cleanup QM armature + save
# ============================================================
bpy.data.objects.remove(qm_arm, do_unlink=True)
print(f"\n[10] Save")
OUT_BLEND_ABS = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(OUT_BLEND_ABS)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND_ABS)
print(f"  saved: {OUT_BLEND_ABS}")
print(f"\n=== DONE ===")
