"""Helena_Douglas_1.10.blend の構造を調査。

armature, mesh, vertex group, shape keys を一覧化して、
transplant + shrinkwrap パイプラインに必要な情報を集める。
"""
import bpy

print("\n=== inspect_helena_douglas ===")

# ARMATURES
print("\nArmatures:")
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        n_def = sum(1 for b in o.data.bones if b.use_deform)
        print(f"  {o.name}: {len(o.data.bones)} bones ({n_def} deform)")
        # Show some sample bones
        sample_names = [b.name for b in o.data.bones[:30]]
        print(f"    sample bones: {sample_names[:15]}")

# MESHES
print("\nMeshes (with armature modifier):")
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    arm_mods = [m for m in o.modifiers if m.type == 'ARMATURE']
    if not arm_mods:
        continue
    arm_name = arm_mods[0].object.name if arm_mods[0].object else None
    n_v = len(o.data.vertices)
    n_vg = len(o.vertex_groups)
    n_keys = len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0
    print(f"  {o.name}: verts={n_v} vgroups={n_vg} shape_keys={n_keys} arm={arm_name}")

# All meshes (no armature)
print("\nMeshes (NO armature, candidates for hair/eyelashes):")
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    arm_mods = [m for m in o.modifiers if m.type == 'ARMATURE']
    if arm_mods:
        continue
    n_v = len(o.data.vertices)
    print(f"  {o.name}: verts={n_v}")

# Bone naming convention check
print("\nBone naming patterns in main armature:")
main_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        if main_arm is None or sum(1 for b in o.data.bones if b.use_deform) > sum(1 for b in main_arm.data.bones if b.use_deform):
            main_arm = o
if main_arm:
    bones = [b.name for b in main_arm.data.bones]
    patterns = {}
    for n in bones:
        prefix = n.split('-')[0] if '-' in n else n.split('.')[0] if '.' in n else n[:5]
        patterns[prefix] = patterns.get(prefix, 0) + 1
    sorted_patterns = sorted(patterns.items(), key=lambda x: -x[1])
    for p, c in sorted_patterns[:20]:
        print(f"  '{p}': {c} bones")
