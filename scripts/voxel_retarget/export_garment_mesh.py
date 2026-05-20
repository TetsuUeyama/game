"""Export garment mesh + vertex bone weights to JSON (rest pose, world coords).

Usage:
  blender --background <blend> --python export_garment_mesh.py -- <mesh_name> <output.json>
"""
import bpy
import sys
import json

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
MESH_NAME = args[0]
OUT_PATH = args[1]

mesh_obj = bpy.data.objects.get(MESH_NAME)
if mesh_obj is None:
    print(f"[ERROR] Mesh '{MESH_NAME}' not found")
    sys.exit(1)
if mesh_obj.type != 'MESH':
    print(f"[ERROR] '{MESH_NAME}' is type {mesh_obj.type}, not MESH")
    sys.exit(1)

# Find linked armature (modifier ARMATURE) and reset to rest pose for accurate export
arm_obj = None
for mod in mesh_obj.modifiers:
    if mod.type == 'ARMATURE' and mod.object is not None:
        arm_obj = mod.object
        break

if arm_obj is not None:
    print(f"  Linked armature: {arm_obj.name}")
    # Save current pose-mode flag then force rest position
    arm_obj.data.pose_position = 'REST'
    bpy.context.view_layer.update()

mesh = mesh_obj.data
wmat = mesh_obj.matrix_world

vertices = []
for v in mesh.vertices:
    co = wmat @ v.co
    vertices.append([co.x, co.y, co.z])

# Triangulate faces
faces = []
for poly in mesh.polygons:
    vs = poly.vertices
    if len(vs) == 3:
        faces.append([vs[0], vs[1], vs[2]])
    elif len(vs) == 4:
        faces.append([vs[0], vs[1], vs[2]])
        faces.append([vs[0], vs[2], vs[3]])
    else:
        for i in range(1, len(vs) - 1):
            faces.append([vs[0], vs[i], vs[i + 1]])

vg_names = [vg.name for vg in mesh_obj.vertex_groups]
weights = []
for v in mesh.vertices:
    d = {}
    for g in v.groups:
        w = float(g.weight)
        if w < 1e-4:
            continue
        d[vg_names[g.group]] = w
    weights.append(d)

out = {
    "mesh": MESH_NAME,
    "armature": arm_obj.name if arm_obj else None,
    "vertex_count": len(vertices),
    "face_count": len(faces),
    "vertices": vertices,
    "faces": faces,
    "vertex_groups": vg_names,
    "weights": weights,
}
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(out, f)

print(f"  Exported {len(vertices)} verts, {len(faces)} tris, {len(vg_names)} vgroups -> {OUT_PATH}")

if arm_obj is not None:
    arm_obj.data.pose_position = 'POSE'
