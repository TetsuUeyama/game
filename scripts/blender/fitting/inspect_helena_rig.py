"""Helena Rigify rig の構造を調査:
- bone 一覧 (CTRL / MCH / ORG / DEF プレフィックス別)
- 各 DEF bone の constraint チェーン (どの ORG が driver か)
- thigh / arm / spine / foot の CTRL bone 候補

Usage:
  blender --background <helena.blend> --python inspect_helena_rig.py
"""
import bpy

helena_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        c = sum(1 for b in o.data.bones if b.use_deform)
        if helena_arm is None or c > sum(1 for b in helena_arm.data.bones if b.use_deform):
            helena_arm = o

print(f"\n=== Armature: {helena_arm.name} ({len(helena_arm.data.bones)} bones) ===\n")

# Categorize by prefix
categories = {'DEF': [], 'ORG': [], 'MCH': [], 'CTRL/other': []}
for b in helena_arm.data.bones:
    if b.name.startswith('DEF-'): categories['DEF'].append(b.name)
    elif b.name.startswith('ORG-'): categories['ORG'].append(b.name)
    elif b.name.startswith('MCH-'): categories['MCH'].append(b.name)
    else: categories['CTRL/other'].append(b.name)

for cat, names in categories.items():
    print(f"  {cat}: {len(names)} bones")

# Look at constraints on key DEF bones to find drivers
print(f"\n=== Constraint chain for key DEF bones ===\n")
key_defs = ['DEF-spine', 'DEF-spine.003', 'DEF-shoulder.L', 'DEF-upper_arm.L',
            'DEF-forearm.L', 'DEF-thigh.L', 'DEF-shin.L', 'DEF-foot.L']
for dn in key_defs:
    pb = helena_arm.pose.bones.get(dn)
    if not pb:
        print(f"  {dn}: NOT FOUND"); continue
    parent_name = pb.parent.name if pb.parent else 'None'
    print(f"  {dn} (parent: {parent_name})")
    if not pb.constraints:
        print(f"    no constraints")
    for c in pb.constraints:
        target_str = ''
        if hasattr(c, 'target') and c.target:
            target_str = f"target={c.target.name}"
            if hasattr(c, 'subtarget') and c.subtarget:
                target_str += f", subtarget={c.subtarget}"
        print(f"    {c.type}: {target_str} (mute={c.mute})")

# List bones with FK/IK in name (likely CTRL)
print(f"\n=== Bones containing 'fk', 'ik', 'tweak' (likely CTRL) ===\n")
for b in helena_arm.data.bones:
    nl = b.name.lower()
    if any(k in nl for k in ['_fk', '_ik', 'tweak']):
        print(f"  {b.name}")

# Check ORG bone parents and hierarchy for key bones
print(f"\n=== ORG hierarchy (key bones) ===\n")
key_orgs = ['ORG-spine', 'ORG-spine.003', 'ORG-shoulder.L', 'ORG-upper_arm.L',
            'ORG-forearm.L', 'ORG-thigh.L', 'ORG-shin.L', 'ORG-foot.L']
for on in key_orgs:
    pb = helena_arm.pose.bones.get(on)
    if not pb:
        print(f"  {on}: NOT FOUND"); continue
    parent_name = pb.parent.name if pb.parent else 'None'
    print(f"  {on} (parent: {parent_name})")
    if not pb.constraints:
        print(f"    no constraints")
    for c in pb.constraints:
        target_str = ''
        if hasattr(c, 'target') and c.target:
            target_str = f"target={c.target.name}"
            if hasattr(c, 'subtarget') and c.subtarget:
                target_str += f", subtarget={c.subtarget}"
        print(f"    {c.type}: {target_str} (mute={c.mute})")

print("\n=== DONE ===")
