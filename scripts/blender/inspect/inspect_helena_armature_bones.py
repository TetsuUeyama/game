"""Helena armature bone 名を確認 (Rigify CTRL bone があるか)。"""
import bpy

ARM_NAME = "Helena"
arm = bpy.data.objects.get(ARM_NAME)
if not arm:
    print(f"ERROR: {ARM_NAME} not found"); raise SystemExit(1)

print(f"=== {ARM_NAME} ({len(arm.data.bones)} bones, {sum(1 for b in arm.data.bones if b.use_deform)} deform) ===")

# Search for Rigify CTRL bones
ctrl_patterns = [
    'spine_fk', 'upper_arm_fk', 'forearm_fk', 'hand_fk',
    'thigh_fk', 'shin_fk', 'foot_fk', 'shoulder',
    'spine.001', 'spine.002',
    'DEF-spine', 'DEF-upper_arm', 'DEF-forearm',
    'CTRL', 'IK', 'MCH-',
]

found = {p: [] for p in ctrl_patterns}
for b in arm.data.bones:
    for p in ctrl_patterns:
        if p in b.name:
            found[p].append(b.name)
            break

for p, names in found.items():
    if names:
        print(f"  pattern '{p}': {len(names)} bones, e.g. {names[:5]}")

# Custom property check (FK/IK switch)
print(f"\n=== Pose bone custom properties (first 5 with 'IK' or 'FK') ===")
n = 0
for pb in arm.pose.bones:
    keys = [k for k in pb.keys() if 'IK' in k or 'FK' in k or 'fk_ik' in k.lower()]
    if keys:
        print(f"  {pb.name}: {keys}")
        n += 1
        if n >= 5: break
