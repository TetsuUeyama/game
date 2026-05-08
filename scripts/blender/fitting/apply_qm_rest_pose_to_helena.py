"""Helena armature の rest pose を QM armature の rest pose に合わせる。

Surface Deform fit 前処理: Helena と QM のポーズ差を解消することで、
v22 fit が「形状差だけ」を解決すればよくなり、内股などの破綻を抑える。

処理:
  1. Helena .blend を開く
  2. QM .blend から QM armature を append
  3. Helena の各 DEF bone に Copy Rotation constraint 追加 (target = QM 対応 bone, WORLD/REPLACE)
  4. visual_transform_apply でポーズを焼き込み
  5. constraints 削除
  6. pose as rest 適用 (skinned mesh も自動追従)
  7. QM armature 削除
  8. 別 .blend に保存

Usage:
  blender --background <helena.blend> --python apply_qm_rest_pose_to_helena.py -- \
    <qm.blend> <qm_armature_name> <out.blend>
"""
import bpy
import sys
import os

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 3:
    print(__doc__)
    sys.exit(1)

QM_BLEND, QM_ARM_NAME, OUT_BLEND = args[:3]

# Bone mapping (v22 SRC_TO_TGT_BONE と同じ)
HELENA_TO_QM = {
    'DEF-spine':       'c_root_bend.x',
    'DEF-spine.001':   'c_spine_01_bend.x',
    'DEF-spine.002':   'c_spine_02_bend.x',
    'DEF-spine.003':   'c_spine_03_bend.x',
    'DEF-spine.004':   'neck.x',
    'DEF-spine.006':   'head.x',
    'DEF-shoulder.L':  'shoulder.l',
    'DEF-shoulder.R':  'shoulder.r',
    'DEF-upper_arm.L': 'c_arm_stretch.l',
    'DEF-upper_arm.R': 'c_arm_stretch.r',
    'DEF-forearm.L':   'c_forearm_stretch.l',
    'DEF-forearm.R':   'c_forearm_stretch.r',
    'DEF-hand.L':      'hand.l',
    'DEF-hand.R':      'hand.r',
    'DEF-thigh.L':     'c_thigh_stretch.l',
    'DEF-thigh.R':     'c_thigh_stretch.r',
    'DEF-shin.L':      'c_leg_stretch.l',
    'DEF-shin.R':      'c_leg_stretch.r',
    'DEF-foot.L':      'foot.l',
    'DEF-foot.R':      'foot.r',
    'DEF-toe.L':       'toes_01.l',
    'DEF-toe.R':       'toes_01.r',
}

print(f"\n=== apply_qm_rest_pose_to_helena ===")
print(f"  qm_blend: {QM_BLEND}")
print(f"  qm_arm:   {QM_ARM_NAME}")
print(f"  out:      {OUT_BLEND}")

# [1] Find Helena armature (most deform bones)
print(f"\n[1] Find Helena armature")
helena_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        c = sum(1 for b in o.data.bones if b.use_deform)
        if helena_arm is None or c > sum(1 for b in helena_arm.data.bones if b.use_deform):
            helena_arm = o
if not helena_arm:
    print("ERROR: No armature found in current blend")
    sys.exit(1)
print(f"  Helena: {helena_arm.name} ({len(helena_arm.data.bones)} bones, "
      f"{sum(1 for b in helena_arm.data.bones if b.use_deform)} deform)")

# [2] Append QM armature from QM blend
print(f"\n[2] Append QM armature")
with bpy.data.libraries.load(QM_BLEND, link=False) as (data_from, data_to):
    available_arms = [n for n in data_from.objects
                      if 'rig' in n.lower() or 'armature' in n.lower() or n == QM_ARM_NAME]
    if QM_ARM_NAME not in data_from.objects:
        print(f"ERROR: '{QM_ARM_NAME}' not in {QM_BLEND}")
        print(f"  Candidates: {available_arms[:10]}")
        sys.exit(1)
    data_to.objects = [QM_ARM_NAME]

qm_arm = bpy.data.objects.get(QM_ARM_NAME)
if not qm_arm:
    print(f"ERROR: failed to load {QM_ARM_NAME}")
    sys.exit(1)
# Link to scene if not already
if qm_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(qm_arm)
print(f"  QM: {qm_arm.name} ({len(qm_arm.data.bones)} bones)")

# [3] Verify mappings
print(f"\n[3] Verify bone mappings")
helena_bone_names = {b.name for b in helena_arm.data.bones}
qm_bone_names = {b.name for b in qm_arm.data.bones}
valid_mappings = {}
for h, q in HELENA_TO_QM.items():
    if h not in helena_bone_names:
        print(f"  SKIP {h}: not in Helena")
        continue
    if q not in qm_bone_names:
        print(f"  SKIP {h} -> {q}: not in QM")
        continue
    valid_mappings[h] = q
print(f"  Valid: {len(valid_mappings)}/{len(HELENA_TO_QM)}")

if not valid_mappings:
    print("ERROR: No valid bone mappings")
    sys.exit(1)

# [4] Enter pose mode on Helena, add Copy Rotation constraints
print(f"\n[4] Add Copy Rotation constraints (WORLD/REPLACE)")
bpy.ops.object.select_all(action='DESELECT')
helena_arm.select_set(True)
bpy.context.view_layer.objects.active = helena_arm
bpy.ops.object.mode_set(mode='POSE')

added_constraints = []
for h_name, q_name in valid_mappings.items():
    pb = helena_arm.pose.bones.get(h_name)
    if not pb:
        continue
    c = pb.constraints.new('COPY_ROTATION')
    c.name = '_TMP_RetargetRest'
    c.target = qm_arm
    c.subtarget = q_name
    c.target_space = 'WORLD'
    c.owner_space = 'WORLD'
    c.mix_mode = 'REPLACE'
    c.influence = 1.0
    added_constraints.append((h_name, c.name))
print(f"  Added {len(added_constraints)} constraints")

# Force constraint evaluation
bpy.context.view_layer.update()

# [5] Bake visual transform into pose
print(f"\n[5] Bake visual transform")
bpy.ops.pose.select_all(action='SELECT')
bpy.ops.pose.visual_transform_apply()

# [6] Remove temporary constraints
print(f"\n[6] Remove temporary constraints")
for h_name, c_name in added_constraints:
    pb = helena_arm.pose.bones.get(h_name)
    if not pb:
        continue
    c = pb.constraints.get(c_name)
    if c:
        pb.constraints.remove(c)

# [7] Apply pose as rest pose (also updates skinned meshes)
print(f"\n[7] Apply pose as rest pose")
bpy.ops.pose.armature_apply()

# [8] Return to object mode, remove QM armature
bpy.ops.object.mode_set(mode='OBJECT')
print(f"\n[8] Remove QM armature from scene")
bpy.data.objects.remove(qm_arm, do_unlink=True)

# [9] Save as new blend file
print(f"\n[9] Save to {OUT_BLEND}")
out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)

# Try save_as_mainfile (v22 ノートでは壊れることがあるが、まず試す)
try:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, copy=False)
    print(f"  saved via save_as_mainfile")
except Exception as e:
    print(f"  save_as_mainfile failed: {e}")
    print(f"  fallback: libraries.write")
    # Save all objects via libraries.write
    data_to_write = set(bpy.data.objects) | set(bpy.data.meshes) | set(bpy.data.armatures) | set(bpy.data.materials)
    bpy.data.libraries.write(OUT_BLEND, data_to_write, fake_user=True)
    print(f"  saved via libraries.write")

print(f"\n=== DONE ===")
