"""
Blender Python: Extract body metrics (bone lengths + cross-section dimensions) from a rigged model.
Outputs a JSON with per-bone length and per-region width/depth measurements.

Usage:
  blender --background --python blender_extract_body_metrics.py -- <input.blend> <output.json>
"""
import bpy
import bmesh
import sys
import os
import json
import math
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""
OUT_PATH = args[1] if len(args) > 1 else ""

if not INPUT_PATH or not OUT_PATH:
    print("Usage: blender --background --python blender_extract_body_metrics.py -- <input.blend> <output.json>")
    sys.exit(1)

print(f"\n=== Body Metrics Extractor ===")
print(f"  Input: {INPUT_PATH}")

ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# Find body mesh and armature
BODY_EXCLUDE = ['hair', 'eye', 'collision', 'modular', 'penis', 'pubes',
                'eyelash', 'mouth', 'armor', 'weapon', 'extras', 'beard',
                'helmet', 'cape', 'cs_']
body_obj = None
armature = None

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        name_lower = obj.name.lower()
        if 'body' in name_lower and not any(kw in name_lower for kw in BODY_EXCLUDE):
            if body_obj is None or len(obj.data.vertices) > len(body_obj.data.vertices):
                body_obj = obj

if not body_obj:
    meshes = [o for o in bpy.context.scene.objects
              if o.type == 'MESH' and len(o.vertex_groups) > 10
              and not any(kw in o.name.lower() for kw in BODY_EXCLUDE)]
    body_obj = max(meshes, key=lambda o: len(o.data.vertices)) if meshes else None

if body_obj and body_obj.parent and body_obj.parent.type == 'ARMATURE':
    armature = body_obj.parent
if not armature:
    for mod in (body_obj.modifiers if body_obj else []):
        if mod.type == 'ARMATURE' and mod.object:
            armature = mod.object
            break

if not body_obj or not armature:
    print("ERROR: Body mesh or armature not found!")
    sys.exit(1)

if not body_obj.visible_get():
    body_obj.hide_set(False)
    body_obj.hide_viewport = False

for mod in body_obj.modifiers:
    if mod.type == 'MASK' and mod.show_viewport:
        mod.show_viewport = False

print(f"  Body: {body_obj.name}")
print(f"  Armature: {armature.name}")

# ARP name normalization
ARP_NORMALIZE = {
    'thigh_stretch': 'c_thigh_stretch', 'thigh_twist': 'c_thigh_twist',
    'thigh_twist_2': 'c_thigh_twist_2', 'leg_stretch': 'c_leg_stretch',
    'leg_twist': 'c_leg_twist', 'leg_twist_2': 'c_leg_twist_2',
    'arm_stretch': 'c_arm_stretch', 'arm_twist_2': 'c_arm_twist_2',
    'c_arm_twist_offset': 'c_arm_twist', 'forearm_stretch': 'c_forearm_stretch',
    'forearm_twist': 'c_forearm_twist', 'forearm_twist_2': 'c_forearm_twist_2',
    'spine_01': 'c_spine_01_bend', 'spine_02': 'c_spine_02_bend',
    'spine_03': 'c_spine_03_bend', 'root': 'c_root_bend', 'cc_balls': 'c_root_bend',
}

def normalize_name(name):
    suffix = ''
    for s in ['.l', '.r', '.x']:
        if name.endswith(s):
            base = name[:-len(s)]
            suffix = s
            break
    else:
        base = name
    return ARP_NORMALIZE.get(base, base) + suffix

# Get evaluated mesh vertices in world space
depsgraph = bpy.context.evaluated_depsgraph_get()
body_eval = body_obj.evaluated_get(depsgraph)
mesh_eval = body_eval.to_mesh()

# Build vertex -> normalized bone name map
vertex_groups = body_obj.vertex_groups
vg_name_map = {vg.index: vg.name for vg in vertex_groups}

EXCLUDE_PREFIXES = ('hair_', 'Gloves_', 'Leggings_', 'Breasts_Simpl', 'Butts_Simpl',
                    'tie.', 'hologram', 'hipplate', 'spline_', 'dress_', 'belt_',
                    'braid_', 'cc_Cape_', 'cc_skirt_', 'cc_Armor_', 'SwordHolder',
                    'c_fist', 'c_tail_')
valid_bones = set()
for bone in armature.data.bones:
    if bone.use_deform and not any(bone.name.startswith(p) for p in EXCLUDE_PREFIXES):
        valid_bones.add(bone.name)

vertex_bone = {}
for vert in mesh_eval.vertices:
    best_bone, best_w = None, 0.0
    for g in vert.groups:
        vg_name = vg_name_map.get(g.group)
        if vg_name and vg_name in valid_bones and g.weight > best_w:
            best_w = g.weight
            best_bone = vg_name
    if best_bone:
        vertex_bone[vert.index] = normalize_name(best_bone)

# Collect world-space vertices per normalized bone
bone_vertices = {}
for vert in mesh_eval.vertices:
    bone = vertex_bone.get(vert.index)
    if not bone:
        continue
    world_pos = body_obj.matrix_world @ vert.co
    if bone not in bone_vertices:
        bone_vertices[bone] = []
    bone_vertices[bone].append(world_pos)

# Extract bone rest positions in world space
bone_positions = {}
for bone in armature.data.bones:
    norm = normalize_name(bone.name)
    if norm in bone_vertices and norm not in bone_positions:
        head = armature.matrix_world @ bone.head_local
        tail = armature.matrix_world @ bone.tail_local
        bone_positions[norm] = {
            'head': [head.x, head.y, head.z],
            'tail': [tail.x, tail.y, tail.z],
            'length': (tail - head).length,
        }

# Compute per-bone metrics
metrics = {}
for bone_name, verts in bone_vertices.items():
    if len(verts) < 3:
        continue

    bp = bone_positions.get(bone_name)
    if not bp:
        continue

    head = Vector(bp['head'])
    tail = Vector(bp['tail'])
    bone_axis = (tail - head).normalized()
    bone_length = bp['length']

    # Compute cross-section: project vertices onto plane perpendicular to bone axis
    # at the midpoint of the bone
    mid = (head + tail) / 2

    # Find two perpendicular axes
    if abs(bone_axis.z) < 0.9:
        perp1 = bone_axis.cross(Vector((0, 0, 1))).normalized()
    else:
        perp1 = bone_axis.cross(Vector((1, 0, 0))).normalized()
    perp2 = bone_axis.cross(perp1).normalized()

    # Project vertices
    widths = []  # along perp1 (roughly left-right)
    depths = []  # along perp2 (roughly front-back)
    for v in verts:
        d = v - mid
        widths.append(d.dot(perp1))
        depths.append(d.dot(perp2))

    width = max(widths) - min(widths) if widths else 0
    depth = max(depths) - min(depths) if depths else 0

    metrics[bone_name] = {
        'bone_length': round(bone_length, 6),
        'width': round(width, 6),
        'depth': round(depth, 6),
        'vertex_count': len(verts),
        'head': bp['head'],
        'tail': bp['tail'],
    }

# Also compute overall body height
all_z = [v.z for verts in bone_vertices.values() for v in verts]
body_height = max(all_z) - min(all_z) if all_z else 0

result = {
    'model': os.path.basename(INPUT_PATH),
    'body_height': round(body_height, 6),
    'metrics': metrics,
}

os.makedirs(os.path.dirname(OUT_PATH) if os.path.dirname(OUT_PATH) else '.', exist_ok=True)
with open(OUT_PATH, 'w') as f:
    json.dump(result, f, indent=2)

print(f"\n  Body height: {body_height:.4f}")
print(f"  Bones measured: {len(metrics)}")
for name in sorted(metrics.keys()):
    m = metrics[name]
    print(f"    {name}: length={m['bone_length']:.4f} width={m['width']:.4f} depth={m['depth']:.4f}")

body_eval.to_mesh_clear()
print(f"\n  Output: {OUT_PATH}")
print("Done")
