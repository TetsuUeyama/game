"""Blender 内の全 Image datablock を列挙 (size, channels, name 簡易確認用)."""
import bpy

print("=" * 70)
print("All bpy.data.images:")
print("=" * 70)
for img in sorted(bpy.data.images, key=lambda x: x.name):
    name = img.name
    if not name or name == 'Render Result' or name == 'Viewer Node':
        continue
    w, h = img.size
    has_alpha = img.alpha_mode != 'NONE'
    print(f"  {name:60s}  {w}x{h}  alpha={has_alpha}")
