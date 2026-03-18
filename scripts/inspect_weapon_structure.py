"""
Inspect weapon GLB files to check if handle/blade parts can be identified.
Checks: mesh names, material assignments per face, vertex groups, bounding boxes per material.
"""
import bpy
import bmesh
import sys
import os
import json
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""

if not INPUT_PATH:
    print("Usage: blender --background --python inspect_weapon_structure.py -- <input.glb>")
    sys.exit(1)

# Clear and load
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)

print(f"\n{'='*60}")
print(f"FILE: {os.path.basename(INPUT_PATH)}")
print(f"{'='*60}")

all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print(f"\nMesh count: {len(all_meshes)}")

for obj in all_meshes:
    print(f"\n--- Mesh: '{obj.name}' ---")
    mat_world = obj.matrix_world

    # Materials
    print(f"  Materials ({len(obj.material_slots)}):")
    for mi, ms in enumerate(obj.material_slots):
        mat = ms.material
        mat_name = mat.name if mat else "(none)"
        # Get color
        color = "(unknown)"
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    bc = node.inputs.get('Base Color')
                    if bc and not bc.is_linked:
                        c = bc.default_value
                        color = f"RGB({c[0]:.2f}, {c[1]:.2f}, {c[2]:.2f})"
                    met = node.inputs.get('Metallic')
                    met_val = met.default_value if met and not met.is_linked else "?"
                    print(f"    [{mi}] {mat_name}: {color}, metallic={met_val}")
                    break

    # Vertex groups
    if obj.vertex_groups:
        print(f"  Vertex Groups ({len(obj.vertex_groups)}):")
        for vg in obj.vertex_groups:
            print(f"    - {vg.name}")

    # Analyze per-material bounding box
    depsgraph = bpy.context.evaluated_depsgraph_get()
    obj_eval = obj.evaluated_get(depsgraph)
    mesh = obj_eval.to_mesh()

    # Triangulate
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()

    mat_verts = {}  # mat_index -> list of world verts
    for poly in mesh.polygons:
        mi = poly.material_index
        if mi not in mat_verts:
            mat_verts[mi] = []
        for vi in poly.vertices:
            wv = mat_world @ Vector(mesh.vertices[vi].co)
            mat_verts[mi].append(wv)

    print(f"  Per-material bounding boxes:")
    for mi in sorted(mat_verts.keys()):
        verts = mat_verts[mi]
        bb_min = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
        bb_max = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
        mat_name = obj.material_slots[mi].material.name if mi < len(obj.material_slots) and obj.material_slots[mi].material else "?"
        z_range = f"Z: {bb_min.z:.3f} ~ {bb_max.z:.3f}"
        height = bb_max.z - bb_min.z
        print(f"    [{mi}] {mat_name}: {z_range} (height: {height:.3f}m) | faces: {sum(1 for p in mesh.polygons if p.material_index == mi)}")

    # Overall bbox
    all_v = [mat_world @ Vector(v.co) for v in mesh.vertices]
    total_min_z = min(v.z for v in all_v)
    total_max_z = max(v.z for v in all_v)
    total_h = total_max_z - total_min_z
    print(f"  Total height: {total_h:.3f}m (Z: {total_min_z:.3f} ~ {total_max_z:.3f})")

    obj_eval.to_mesh_clear()
