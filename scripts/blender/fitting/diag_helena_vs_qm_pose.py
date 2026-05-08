"""Helena と QM の各 mapped bone の rest pose 角度差を計測。

Usage:
  blender --background <helena.blend> --python diag_helena_vs_qm_pose.py -- \
    <qm.blend> <qm_armature_name>
"""
import bpy
import sys
import math
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

QM_BLEND, QM_ARM_NAME = args[:2]

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

# Find Helena
helena_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        c = sum(1 for b in o.data.bones if b.use_deform)
        if helena_arm is None or c > sum(1 for b in helena_arm.data.bones if b.use_deform):
            helena_arm = o
print(f"Helena: {helena_arm.name}")

# Load QM
with bpy.data.libraries.load(QM_BLEND, link=False) as (data_from, data_to):
    data_to.objects = [QM_ARM_NAME]
qm_arm = bpy.data.objects[QM_ARM_NAME]
bpy.context.scene.collection.objects.link(qm_arm)
print(f"QM:     {qm_arm.name}\n")

print(f"{'Helena bone':<22} {'QM bone':<24} {'angle':>7} {'h_dir (world)':<28} {'q_dir (world)':<28}")
print("-" * 110)

big_diffs = 0
for h_name, q_name in HELENA_TO_QM.items():
    if h_name not in helena_arm.data.bones:
        print(f"  SKIP: {h_name} not in Helena"); continue
    if q_name not in qm_arm.data.bones:
        print(f"  SKIP: {q_name} not in QM"); continue

    h = helena_arm.data.bones[h_name]
    q = qm_arm.data.bones[q_name]
    h_dir = (helena_arm.matrix_world @ h.tail_local - helena_arm.matrix_world @ h.head_local)
    q_dir = (qm_arm.matrix_world @ q.tail_local - qm_arm.matrix_world @ q.head_local)
    if h_dir.length < 1e-6 or q_dir.length < 1e-6:
        continue
    h_dir.normalize(); q_dir.normalize()
    angle = math.degrees(h_dir.angle(q_dir))
    if angle > 5: big_diffs += 1
    h_str = f"({h_dir.x:+.2f}, {h_dir.y:+.2f}, {h_dir.z:+.2f})"
    q_str = f"({q_dir.x:+.2f}, {q_dir.y:+.2f}, {q_dir.z:+.2f})"
    marker = " ← BIG" if angle > 5 else ""
    print(f"  {h_name:<22} {q_name:<24} {angle:>6.1f}° {h_str:<28} {q_str:<28}{marker}")

print(f"\nBones with >5° pose difference: {big_diffs}")
