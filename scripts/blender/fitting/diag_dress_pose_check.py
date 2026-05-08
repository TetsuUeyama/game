"""Helena Default - Dress の頂点位置を 元 Helena vs QMRest Helena で比較。

armature_apply が dress mesh を更新したかどうかを判定する。

Usage:
  blender --background <file_to_check.blend> --python diag_dress_pose_check.py
"""
import bpy
from mathutils import Vector

DRESS_NAME = "Helena Default - Dress"

dress = bpy.data.objects.get(DRESS_NAME)
if not dress:
    print(f"NOT FOUND: {DRESS_NAME}")
    print("Available meshes:")
    for o in bpy.data.objects:
        if o.type == 'MESH' and 'dress' in o.name.lower():
            print(f"  {o.name}")
    import sys; sys.exit(1)

print(f"Dress: {dress.name}")
print(f"  visible: {dress.visible_get()}")
print(f"  hide_viewport: {dress.hide_viewport}")
print(f"  hide_render: {dress.hide_render}")
print(f"  vertex_count: {len(dress.data.vertices)}")

# Sample 10 evenly-spaced vertices and print their data positions (mesh data, not evaluated)
n = len(dress.data.vertices)
indices = [int(i * n / 10) for i in range(10)]
print(f"\n  Sample vertex DATA positions (mesh.vertices.co, not evaluated):")
for i in indices:
    v = dress.data.vertices[i]
    print(f"    v[{i}]: ({v.co.x:+.4f}, {v.co.y:+.4f}, {v.co.z:+.4f})")

# Also print bbox of mesh data
mn = Vector((1e9, 1e9, 1e9))
mx = Vector((-1e9, -1e9, -1e9))
for v in dress.data.vertices:
    for k in range(3):
        mn[k] = min(mn[k], v.co[k])
        mx[k] = max(mx[k], v.co[k])
print(f"\n  Mesh DATA bbox: ({mn.x:.3f}, {mn.y:.3f}, {mn.z:.3f}) .. ({mx.x:.3f}, {mx.y:.3f}, {mx.z:.3f})")

# Check modifiers
print(f"\n  Modifiers:")
for m in dress.modifiers:
    info = ''
    if m.type == 'ARMATURE':
        info = f"object={m.object.name if m.object else 'None'}, viewport={m.show_viewport}"
    print(f"    {m.type}: {m.name} ({info})")
