"""Bodysuit の vertex group 名と Helena armature の bone 名を一覧。"""
import bpy

SUIT_NAME = "GCC DOA Outfit Bodysuit Mesh"
ARM_NAME  = "Helena"

suit = bpy.data.objects.get(SUIT_NAME)
arm  = bpy.data.objects.get(ARM_NAME)

print(f"\n=== {SUIT_NAME} vertex groups ===")
if suit:
    print(f"  total: {len(suit.vertex_groups)}")
    for vg in suit.vertex_groups:
        print(f"    {vg.name}")

print(f"\n=== {ARM_NAME} deform bones (関連しそうなもののみ) ===")
if arm:
    interesting = ['spine', 'chest', 'pelvis', 'pectoral', 'collar', 'breast',
                   'shldr', 'shoulder', 'thigh', 'butt', 'hip', 'belly', 'rib', 'abdomen']
    for b in arm.data.bones:
        if not b.use_deform: continue
        if any(k in b.name.lower() for k in interesting):
            print(f"    {b.name}")
