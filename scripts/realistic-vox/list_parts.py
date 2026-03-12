"""List all mesh objects in a Blender file with hierarchy info.

Usage:
  blender --background --python list_parts.py -- <input.blend>

Output: prints each mesh name, parent, vertex count, and material list.
"""
import bpy
import sys
import json

argv = sys.argv
sep = argv.index("--") if "--" in argv else len(argv)
script_args = argv[sep + 1:]

INPUT_PATH = script_args[0]

# Load file
ext = INPUT_PATH.lower().rsplit('.', 1)[-1]
if ext == 'fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext in ('glb', 'gltf'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# Disable MASK modifiers
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    for mod in obj.modifiers:
        if mod.type == 'MASK' and mod.show_viewport:
            mod.show_viewport = False

bpy.context.view_layer.update()

print("\n" + "=" * 70)
print("MESH OBJECTS IN FILE")
print("=" * 70)

parts = []
for obj in sorted(bpy.context.scene.objects, key=lambda o: o.name):
    if obj.type != 'MESH':
        continue
    visible = obj.visible_get()
    verts = len(obj.data.vertices)
    mats = [m.name for m in obj.data.materials if m]
    parent = obj.parent.name if obj.parent else None

    parts.append({
        'name': obj.name,
        'visible': visible,
        'vertices': verts,
        'materials': mats,
        'parent': parent,
    })

    status = "VISIBLE" if visible else "hidden"
    print(f"  [{status:7s}] {obj.name}")
    print(f"           verts={verts}  parent={parent}")
    if mats:
        print(f"           materials: {', '.join(mats)}")

print(f"\nTotal: {len(parts)} mesh objects")
print("=" * 70)

# Also output as JSON for easy parsing
json_str = json.dumps(parts, indent=2, ensure_ascii=False)
print(f"\n__JSON_START__\n{json_str}\n__JSON_END__")
