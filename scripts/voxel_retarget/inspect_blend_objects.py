"""List all mesh + armature objects in a blend file."""
import bpy
print("=== Mesh objects ===")
for o in bpy.data.objects:
    if o.type == 'MESH':
        m = o.data
        nv = len(m.vertices)
        nf = len(m.polygons)
        ng = len(o.vertex_groups)
        print(f"  {o.name}: {nv} verts, {nf} faces, {ng} vgroups")
print()
print("=== Armature objects ===")
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        a = o.data
        print(f"  {o.name}: {len(a.bones)} bones")
