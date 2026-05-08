"""Helena rest pose を QM rest pose に合わせる v2: Rigify CTRL (FK) bone 直接 pose 方式。

v1 (DEF + Copy Rotation) が効かなかった理由:
  Rigify の DEF bone は tweak/ORG bone から COPY_TRANSFORMS で駆動されるため、
  DEF を直接 pose しても上流が支配して結果が反映されない。
  正しくは CTRL (FK) bone を pose し、armature_apply で rest に焼き込む。

v2 戦略:
  1. FK/IK switch を FK 側に倒す (custom property "IK_FK" = 1.0)
  2. Helena の各 FK CTRL bone を hierarchy 順に処理:
     a. 現在の world Y 方向を取得
     b. QM 対応 bone の world Y 方向を取得
     c. cur_y.rotation_difference(target_y) で最小回転を計算
     d. pose_bone.matrix を更新 (Blender が local rotation を逆算)
     e. view_layer.update() で子に反映
  3. armature_apply で rest pose に焼き込み (skinned mesh 自動追従)
  4. 別 .blend に保存

Usage:
  blender --background <helena.blend> --python apply_qm_rest_pose_to_helena_v2.py -- \
    <qm.blend> <qm_armature_name> <out.blend>
"""
import bpy
import sys
import os
import math
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 3:
    print(__doc__); sys.exit(1)

QM_BLEND, QM_ARM_NAME, OUT_BLEND = args[:3]
# --keep-pose: rest pose に焼き込まず、pose のまま保存 (視覚的に変化が見える)
KEEP_POSE = '--keep-pose' in args[3:]

# CTRL (FK) → QM bone mapping
# spine_fk (root) は QM c_root_bend.x と方向が逆 (rig 規約差) なのでスキップ
HELENA_CTRL_TO_QM = {
    'spine_fk.001':   'c_spine_01_bend.x',
    'spine_fk.002':   'c_spine_02_bend.x',
    'spine_fk.003':   'c_spine_03_bend.x',
    'shoulder.L':     'shoulder.l',
    'shoulder.R':     'shoulder.r',
    'upper_arm_fk.L': 'c_arm_stretch.l',
    'upper_arm_fk.R': 'c_arm_stretch.r',
    'forearm_fk.L':   'c_forearm_stretch.l',
    'forearm_fk.R':   'c_forearm_stretch.r',
    'hand_fk.L':      'hand.l',
    'hand_fk.R':      'hand.r',
    'thigh_fk.L':     'c_thigh_stretch.l',
    'thigh_fk.R':     'c_thigh_stretch.r',
    'shin_fk.L':      'c_leg_stretch.l',
    'shin_fk.R':      'c_leg_stretch.r',
    'foot_fk.L':      'foot.l',
    'foot_fk.R':      'foot.r',
}

# IK FK switch を FK にするため設定する custom property を持つ bones
IK_SWITCH_BONES = ['hand_ik.L', 'hand_ik.R', 'foot_ik.L', 'foot_ik.R',
                   'upper_arm_parent.L', 'upper_arm_parent.R',
                   'thigh_parent.L', 'thigh_parent.R']

print(f"\n=== apply_qm_rest_pose_to_helena_v2 ===")

# [1] Find Helena armature
helena_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        c = sum(1 for b in o.data.bones if b.use_deform)
        if helena_arm is None or c > sum(1 for b in helena_arm.data.bones if b.use_deform):
            helena_arm = o
print(f"[1] Helena: {helena_arm.name} ({len(helena_arm.data.bones)} bones)")

# [2] Append QM
print(f"[2] Append QM armature")
with bpy.data.libraries.load(QM_BLEND, link=False) as (data_from, data_to):
    if QM_ARM_NAME not in data_from.objects:
        print(f"ERROR: {QM_ARM_NAME} not in {QM_BLEND}"); sys.exit(1)
    data_to.objects = [QM_ARM_NAME]
qm_arm = bpy.data.objects.get(QM_ARM_NAME)
if qm_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(qm_arm)
print(f"  QM: {qm_arm.name} ({len(qm_arm.data.bones)} bones)")

# [3] Compute QM bone world Y directions (rest pose)
print(f"[3] Extract QM bone directions")
qm_dirs = {}
qm_world = qm_arm.matrix_world
for b in qm_arm.data.bones:
    head_w = qm_world @ b.head_local
    tail_w = qm_world @ b.tail_local
    d = tail_w - head_w
    if d.length < 1e-6: continue
    qm_dirs[b.name] = d.normalized()

# [4] Verify mappings
print(f"[4] Verify mappings")
helena_bones = {b.name for b in helena_arm.data.bones}
valid = {}
for h, q in HELENA_CTRL_TO_QM.items():
    if h not in helena_bones: print(f"  SKIP {h}: not in Helena"); continue
    if q not in qm_dirs: print(f"  SKIP {h}->{q}: not in QM"); continue
    valid[h] = q
print(f"  Valid: {len(valid)}/{len(HELENA_CTRL_TO_QM)}")

# [5] Enter pose mode
bpy.ops.object.select_all(action='DESELECT')
helena_arm.select_set(True)
bpy.context.view_layer.objects.active = helena_arm
bpy.ops.object.mode_set(mode='POSE')

# [6] Switch to FK mode (so CTRL FK bones drive the rig, not IK)
print(f"[6] Switch FK/IK to FK")
n_switch = 0
for bn in IK_SWITCH_BONES:
    pb = helena_arm.pose.bones.get(bn)
    if not pb: continue
    for prop_name in ('IK_FK', 'IK_Stretch', 'fk_to_ik', 'IK/FK'):
        if prop_name in pb:
            try:
                pb[prop_name] = 1.0
                n_switch += 1
                print(f"  {bn}.{prop_name} = 1.0")
            except Exception as e:
                print(f"  {bn}.{prop_name} failed: {e}")
print(f"  switched {n_switch} properties")

bpy.context.view_layer.update()

# [7] Explicit FK chain order (parents before children).
# Rigify の bone.parent チェーンは MCH 経由で FK chain と一致しないため、
# 明示的に root → leaf の順序を指定する必要がある。
EXPLICIT_ORDER = [
    'spine_fk.001', 'spine_fk.002', 'spine_fk.003',
    'shoulder.L', 'upper_arm_fk.L', 'forearm_fk.L', 'hand_fk.L',
    'shoulder.R', 'upper_arm_fk.R', 'forearm_fk.R', 'hand_fk.R',
    'thigh_fk.L', 'shin_fk.L', 'foot_fk.L',
    'thigh_fk.R', 'shin_fk.R', 'foot_fk.R',
]
ordered_ctrl = [n for n in EXPLICIT_ORDER if n in valid]
print(f"[7] Process order ({len(ordered_ctrl)} bones): {ordered_ctrl}")

# [8] For each CTRL bone, rotate so its world Y aligns with QM bone's world Y
print(f"[8] Apply rotations to CTRL bones")
helena_world = helena_arm.matrix_world

for h_name in ordered_ctrl:
    q_name = valid[h_name]
    pb = helena_arm.pose.bones[h_name]
    target_y = qm_dirs[q_name]

    # Refresh after parent's update
    bpy.context.view_layer.update()

    cur_world = pb.matrix.copy()  # bone's current world matrix (incl. pose so far)
    cur_y_world = (helena_world.to_3x3() @ cur_world.to_3x3() @ Vector((0, 1, 0))).normalized()

    # Compute rotation in WORLD space (helena_world space) to align cur_y to target_y
    rot_q = cur_y_world.rotation_difference(target_y)  # Quaternion
    angle_deg = math.degrees(rot_q.angle)

    if angle_deg < 0.5:
        print(f"  {h_name}: skip (already aligned, {angle_deg:.2f}°)")
        continue

    # Build new world matrix: rotate around bone head in helena_world space
    # pb.matrix is in helena_arm local space, so we need rotation in that space
    # World rotation in helena local = helena_world.inverted() @ rot_world @ helena_world
    helena_rot = helena_world.to_3x3()
    helena_rot_inv = helena_rot.inverted()
    rot_local = helena_rot_inv @ rot_q.to_matrix() @ helena_rot

    head = cur_world.translation.copy()
    cur_basis_3x3 = cur_world.to_3x3()
    new_basis_3x3 = rot_local @ cur_basis_3x3
    new_world = new_basis_3x3.to_4x4()
    new_world.translation = head

    pb.matrix = new_world

    # Verify
    bpy.context.view_layer.update()
    new_y_world = (helena_world.to_3x3() @ pb.matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
    err_deg = math.degrees(new_y_world.angle(target_y))
    print(f"  {h_name} -> {q_name}: rotated {angle_deg:.1f}° (residual {err_deg:.2f}°)")

# [8.4] Bone length scaling: REMOVED - caused DEF bones to be over-scaled (0.5x)
# due to Rigify constraint chain interaction with armature_apply.
# Need a different approach (Edit Mode direct bone modification) for length matching.

# [8.5] CRITICAL: armature_apply の auto-update は MustardUI 等の hidden mesh では
# 効かないため、各 skinned mesh の Armature Modifier を明示的に Apply して
# posed visual を mesh data に焼き込む。その後新しい Armature Modifier を再追加。
print(f"\n[8.5] Bake posed visual into mesh data (explicit Armature Modifier apply)")
bpy.ops.object.mode_set(mode='OBJECT')

# Recursively enable all layer collections (collection exclude/hide blocks select_set)
def enable_layer_collection(lc):
    lc.exclude = False
    lc.hide_viewport = False
    lc.collection.hide_viewport = False
    lc.collection.hide_render = False
    for child in lc.children:
        enable_layer_collection(child)
for lc in bpy.context.view_layer.layer_collection.children:
    enable_layer_collection(lc)
print(f"  enabled all layer collections")

skinned_meshes = []
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    arm_mods = [m for m in o.modifiers if m.type == 'ARMATURE' and m.object == helena_arm]
    if not arm_mods: continue
    skinned_meshes.append((o, arm_mods))
print(f"  found {len(skinned_meshes)} skinned meshes to bake")

n_baked = 0
n_failed = 0
for o, arm_mods in skinned_meshes:
    # Make visible (required for context operations)
    o.hide_viewport = False
    o.hide_render = False
    o.hide_set(False)
    # Clear shape keys (interfere with Apply Modifier)
    if o.data.shape_keys:
        try:
            old_active = bpy.context.view_layer.objects.active
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.shape_key_remove(all=True)
            bpy.context.view_layer.objects.active = old_active
        except Exception as e:
            print(f"  WARN {o.name}: shape_key_remove failed: {e}")
    # Apply each Armature Modifier (bakes posed visual into mesh data)
    bpy.ops.object.select_all(action='DESELECT')
    try:
        o.select_set(True)
    except RuntimeError as e:
        print(f"  SKIP {o.name}: cannot select ({e})")
        n_failed += 1
        continue
    bpy.context.view_layer.objects.active = o
    baked_one = False
    for m in list(arm_mods):
        m.show_viewport = True
        m.show_render = True
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
            baked_one = True
        except Exception as e:
            print(f"  WARN {o.name}.{m.name}: modifier_apply failed: {e}")
            n_failed += 1
    # Re-add Armature Modifier so skinning still works at runtime
    if baked_one:
        new_am = o.modifiers.new(name='Armature', type='ARMATURE')
        new_am.object = helena_arm
        new_am.use_vertex_groups = True
        n_baked += 1
print(f"  baked {n_baked} meshes ({n_failed} failures)")

# Re-select Helena armature for armature_apply
bpy.ops.object.select_all(action='DESELECT')
helena_arm.select_set(True)
bpy.context.view_layer.objects.active = helena_arm
bpy.ops.object.mode_set(mode='POSE')

# [9] Apply pose as rest pose (skip if --keep-pose, to leave pose visible)
if KEEP_POSE:
    print(f"[9] SKIP armature_apply (--keep-pose): pose kept for visual verification")
else:
    print(f"[9] Apply pose as rest")
    bpy.ops.pose.armature_apply()

# [9.5] Floor alignment: shift Helena Z so lowest body vertex matches QM lowest body vertex.
# QM is high-heel pose (toe pointing down) and Helena is flat-foot. After QMRest's foot-angle
# match, Helena toe rotates to QM's heel angle but Helena's leg length differs → ground sinks.
# Compensate by translating armature in Z so floor-contact (= min Z of body) matches QM.
print(f"\n[9.5] Floor alignment (match lowest Z to QM)")
bpy.ops.object.mode_set(mode='OBJECT')

# Load QM body if not already in scene
qm_body_obj = bpy.data.objects.get("Queen Marika Body")
if not qm_body_obj:
    print(f"  loading QM body for floor reference...")
    with bpy.data.libraries.load(QM_BLEND, link=False) as (data_from, data_to):
        if "Queen Marika Body" in data_from.objects:
            data_to.objects = ["Queen Marika Body"]
    qm_body_obj = bpy.data.objects.get("Queen Marika Body")
    if qm_body_obj:
        bpy.context.scene.collection.objects.link(qm_body_obj)

helena_body_obj = bpy.data.objects.get("Body")  # Helena body

if qm_body_obj and helena_body_obj:
    bpy.context.view_layer.update()
    qm_min_z = min((qm_body_obj.matrix_world @ v.co).z for v in qm_body_obj.data.vertices)
    helena_min_z = min((helena_body_obj.matrix_world @ v.co).z for v in helena_body_obj.data.vertices)
    offset_z = qm_min_z - helena_min_z
    print(f"  QM     lowest Z: {qm_min_z:.4f}m")
    print(f"  Helena lowest Z: {helena_min_z:.4f}m")
    print(f"  applying Z offset: {offset_z:+.4f}m to Helena armature.location")
    helena_arm.location.z += offset_z
    bpy.context.view_layer.update()
    # Verify
    helena_min_z_after = min((helena_body_obj.matrix_world @ v.co).z for v in helena_body_obj.data.vertices)
    print(f"  Helena lowest Z after: {helena_min_z_after:.4f}m (residual: {helena_min_z_after - qm_min_z:+.4f}m)")

    # Cleanup: remove QM body from scene (don't include in saved file)
    if qm_body_obj.name in {o.name for o in bpy.context.scene.collection.objects}:
        bpy.data.objects.remove(qm_body_obj, do_unlink=True)
else:
    print(f"  WARN: missing QM body or Helena body, skipping floor alignment")

# [10] Object mode, remove QM
bpy.ops.object.mode_set(mode='OBJECT')
bpy.data.objects.remove(qm_arm, do_unlink=True)
print(f"[10] QM removed")

# [11] Save
print(f"[11] Save to {OUT_BLEND}")
out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)

try:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, copy=False)
    print(f"  saved")
except Exception as e:
    print(f"  save_as_mainfile failed: {e}")
    sys.exit(1)

print(f"\n=== DONE ===")
