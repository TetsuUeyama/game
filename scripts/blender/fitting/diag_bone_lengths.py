"""Helena (QMRest) と QM の骨長を比較。
Usage:
  blender --background <helena_qmrest.blend> --python diag_bone_lengths.py -- <qm.blend> <qm_arm_name>
"""
import bpy, sys
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
QM_BLEND, QM_ARM = args[:2]

helena_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        c = sum(1 for b in o.data.bones if b.use_deform)
        if helena_arm is None or c > sum(1 for b in helena_arm.data.bones if b.use_deform):
            helena_arm = o
print(f"Helena: {helena_arm.name}")

with bpy.data.libraries.load(QM_BLEND, link=False) as (s, d): d.objects = [QM_ARM]
qm_arm = bpy.data.objects[QM_ARM]
print(f"QM: {qm_arm.name}\n")

CTRL_TO_QM = {
    'spine_fk.001': 'c_spine_01_bend.x',
    'spine_fk.002': 'c_spine_02_bend.x',
    'spine_fk.003': 'c_spine_03_bend.x',
    'shoulder.L': 'shoulder.l', 'shoulder.R': 'shoulder.r',
    'upper_arm_fk.L': 'c_arm_stretch.l', 'upper_arm_fk.R': 'c_arm_stretch.r',
    'forearm_fk.L': 'c_forearm_stretch.l', 'forearm_fk.R': 'c_forearm_stretch.r',
    'hand_fk.L': 'hand.l', 'hand_fk.R': 'hand.r',
    'thigh_fk.L': 'c_thigh_stretch.l', 'thigh_fk.R': 'c_thigh_stretch.r',
    'shin_fk.L': 'c_leg_stretch.l', 'shin_fk.R': 'c_leg_stretch.r',
    'foot_fk.L': 'foot.l', 'foot_fk.R': 'foot.r',
}

# Also check the DEF bones (which actually deform the mesh)
DEF_TO_QM = {
    'DEF-shoulder.L': 'shoulder.l', 'DEF-upper_arm.L': 'c_arm_stretch.l',
    'DEF-forearm.L': 'c_forearm_stretch.l', 'DEF-hand.L': 'hand.l',
    'DEF-thigh.L': 'c_thigh_stretch.l', 'DEF-shin.L': 'c_leg_stretch.l',
    'DEF-foot.L': 'foot.l',
}

def length(arm, bn):
    b = arm.data.bones.get(bn)
    if not b: return None
    h = arm.matrix_world @ b.head_local
    t = arm.matrix_world @ b.tail_local
    return (t - h).length

print(f"{'Helena bone':<24} {'QM bone':<24} {'Helena':>10} {'QM':>10} {'ratio':>8}")
print("-" * 80)

print("=== FK CTRL bones (set by script) ===")
for h, q in CTRL_TO_QM.items():
    hl = length(helena_arm, h); ql = length(qm_arm, q)
    if hl and ql:
        print(f"  {h:<22} {q:<24} {hl*100:>8.2f}cm {ql*100:>8.2f}cm {hl/ql:>7.3f}")

print("\n=== DEF bones (actually deform mesh) ===")
for h, q in DEF_TO_QM.items():
    hl = length(helena_arm, h); ql = length(qm_arm, q)
    if hl and ql:
        print(f"  {h:<22} {q:<24} {hl*100:>8.2f}cm {ql*100:>8.2f}cm {hl/ql:>7.3f}")
