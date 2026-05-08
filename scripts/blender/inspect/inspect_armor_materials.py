"""キャラクター系 mesh のマテリアル名を列挙 (汎用版)."""
import bpy

EXCLUDE_PREFIXES = ('cs_', 'cage-', 'Camera', 'Light', 'SimpleBackground', 'Body_FullCollision', 'Background_')

print("=" * 70)
print("Character mesh materials (excluding cs_*, cage-*, lights, helpers):")
print("=" * 70)
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    if any(o.name.startswith(p) for p in EXCLUDE_PREFIXES):
        continue
    print(f"\n[{o.name!r}]")
    for slot in o.material_slots:
        if slot.material:
            print(f"  - {slot.material.name!r}")
