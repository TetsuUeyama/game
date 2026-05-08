"""QueenMarika_rig の主要 pose bone matrix を確認。
rest と pose に差があるなら ARMATURE modifier が変形を加えてしまう。
"""
import bpy
from mathutils import Matrix

arm = bpy.data.objects.get("QueenMarika_rig")
if not arm:
    print("ERROR"); exit()

print(f"QM armature: {arm.name}")
print(f"  pose_position={arm.data.pose_position}")
for bn in ('c_root_bend.x', 'c_spine_03_bend.x', 'shoulder.l',
           'c_thigh_stretch.l', 'foot.l', 'head.x'):
    pb = arm.pose.bones.get(bn)
    b = arm.data.bones.get(bn)
    if not pb or not b:
        continue
    rest_world = arm.matrix_world @ b.matrix_local
    pose_world = arm.matrix_world @ pb.matrix
    diff = (pose_world.inverted() @ rest_world)
    # Frobenius distance from identity
    dist = sum((diff[i][j] - (1.0 if i == j else 0.0)) ** 2 for i in range(4) for j in range(4)) ** 0.5
    print(f"  {bn}: rest_origin={rest_world.translation} pose_origin={pose_world.translation}")
    print(f"      pose==rest? frob_dist_from_identity={dist:.6f}")
