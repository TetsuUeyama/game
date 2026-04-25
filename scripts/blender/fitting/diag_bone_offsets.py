"""Helena (Rigify) と QM (ARP) の対応ボーン head 位置の Y 差分を計測する診断。

Usage:
  blender --background <qm.blend> --python diag_bone_offsets.py -- \
    <helena.blend> <helena_armature> <qm_armature>
"""
import bpy, sys
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
HELENA_BLEND, HELENA_ARM, QM_ARM = args[:3]

SRC_TO_TGT_BONE = {
    'DEF-spine': 'c_root_bend.x', 'DEF-spine.001': 'c_spine_01_bend.x',
    'DEF-spine.002': 'c_spine_02_bend.x', 'DEF-spine.003': 'c_spine_03_bend.x',
    'DEF-spine.004': 'neck.x', 'DEF-spine.006': 'head.x',
    'DEF-breast.L': 'breast_l', 'DEF-breast.R': 'breast_r',
    'DEF-shoulder.L': 'shoulder.l', 'DEF-shoulder.R': 'shoulder.r',
    'DEF-upper_arm.L': 'c_arm_stretch.l', 'DEF-upper_arm.R': 'c_arm_stretch.r',
    'DEF-thigh.L': 'c_thigh_stretch.l', 'DEF-thigh.R': 'c_thigh_stretch.r',
}

qm_arm = bpy.data.objects.get(QM_ARM)
qm_body = bpy.data.objects.get('Queen Marika Body')
helena_body = None
helena_arm = None

with bpy.data.libraries.load(HELENA_BLEND, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in {HELENA_ARM, 'Body'}]
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    if o.name == HELENA_ARM: helena_arm = o
    if o.name == 'Body': helena_body = o

# Origin align (bbox-center)
def wbbox_center(o):
    mw = o.matrix_world; cs = [mw @ v.co for v in o.data.vertices]
    return Vector(((min(c.x for c in cs)+max(c.x for c in cs))/2,
                   (min(c.y for c in cs)+max(c.y for c in cs))/2,
                   (min(c.z for c in cs)+max(c.z for c in cs))/2))
delta = wbbox_center(qm_body) - wbbox_center(helena_body)
helena_arm.location = helena_arm.location + delta
helena_body.location = helena_body.location + delta
bpy.context.view_layer.update()

print(f"\n=== Bone Head Y Diff (after bbox-center alignment) ===\n")
print(f"  delta applied: {tuple(round(c,4) for c in delta)}")
print(f"  {'Helena bone':<25} {'QM bone':<25} {'H_Y':>8} {'Q_Y':>8} {'Δ(Q-H)':>10}")
print(f"  {'-'*25:<25} {'-'*25:<25} {'-'*8:>8} {'-'*8:>8} {'-'*10:>10}")

diffs = []
for hbone, qbone in SRC_TO_TGT_BONE.items():
    h = helena_arm.data.bones.get(hbone)
    q = qm_arm.data.bones.get(qbone)
    if not h or not q: continue
    h_head = (helena_arm.matrix_world @ h.matrix_local).translation
    q_head = (qm_arm.matrix_world @ q.matrix_local).translation
    dy = q_head.y - h_head.y
    diffs.append(dy)
    print(f"  {hbone:<25} {qbone:<25} {h_head.y:>+8.4f} {q_head.y:>+8.4f} {dy:>+10.4f}")

if diffs:
    avg = sum(diffs) / len(diffs)
    print(f"\n  avg ΔY: {avg:+.4f} m ({avg*1000:+.1f} mm)")
    print(f"  voxel_size = 7.05 mm → avg shift = {avg*1000/7.05:+.1f} voxels")
