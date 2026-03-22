"""
Blender Python: Extract bone segments with DETAILED finger/toe bones (not merged into hand/foot).

Usage:
  blender --background --python blender_extract_bone_segments_detailed.py -- <input.blend> <output_dir> [voxel_size]

This is a variant of blender_extract_bone_segments.py that keeps individual finger
and toe bones as separate segments instead of merging them into hand/foot.
"""

import bpy
import bmesh
import sys
import os
import struct
import math
import json
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ========================================================================
# Args
# ========================================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""
OUT_DIR = args[1] if len(args) > 1 else ""
VOXEL_SIZE = float(args[2]) if len(args) > 2 else 0.007

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python blender_extract_bone_segments_detailed.py -- <input.blend> <output_dir> [voxel_size]")
    sys.exit(1)

print(f"\n=== Bone Segment Voxelizer (Detailed Fingers) ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output: {OUT_DIR}")
print(f"  Voxel size: {VOXEL_SIZE}")

# ========================================================================
# Load model
# ========================================================================
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext in ('.glb', '.gltf'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

os.makedirs(OUT_DIR, exist_ok=True)
seg_dir = os.path.join(OUT_DIR, "segments")
os.makedirs(seg_dir, exist_ok=True)
os.makedirs(os.path.join(OUT_DIR, "body"), exist_ok=True)

# ========================================================================
# Find armature and body mesh
# ========================================================================
armature = None
body_obj = None

BODY_EXCLUDE_KEYWORDS = ['hair', 'eye', 'collision', 'modular', 'penis', 'pubes',
                         'eyelash', 'mouth', 'armor', 'weapon', 'extras', 'beard',
                         'helmet', 'cape', 'cs_']
for obj in bpy.context.scene.objects:
    if obj.type == 'ARMATURE':
        # Prefer QueenMarika rig
        if 'queenmarika' in obj.name.lower().replace('_', '').replace(' ', ''):
            armature = obj
        elif armature is None and len(obj.data.bones) > 100:
            armature = obj
    if obj.type == 'MESH':
        name_lower = obj.name.lower()
        if 'body' in name_lower and not any(kw in name_lower for kw in BODY_EXCLUDE_KEYWORDS):
            if body_obj is None or len(obj.data.vertices) > len(body_obj.data.vertices):
                body_obj = obj

if not body_obj:
    meshes = [o for o in bpy.context.scene.objects
              if o.type == 'MESH' and o.visible_get() and len(o.vertex_groups) > 10
              and not any(kw in o.name.lower() for kw in BODY_EXCLUDE_KEYWORDS)]
    body_obj = max(meshes, key=lambda o: len(o.data.vertices)) if meshes else None

if not body_obj:
    print("ERROR: No body mesh found!")
    sys.exit(1)

if body_obj.parent and body_obj.parent.type == 'ARMATURE':
    armature = body_obj.parent
else:
    for mod in body_obj.modifiers:
        if mod.type == 'ARMATURE' and mod.object:
            armature = mod.object
            break

if not armature:
    print("ERROR: No armature found!")
    sys.exit(1)

print(f"  Armature: {armature.name}")
print(f"  Body mesh: {body_obj.name} ({len(body_obj.data.vertices)} verts)")

if not body_obj.visible_get():
    body_obj.hide_set(False)
    body_obj.hide_viewport = False

for mod in body_obj.modifiers:
    if mod.type == 'MASK' and mod.show_viewport:
        mod.show_viewport = False
        print(f"  Disabled MASK: {mod.name}")

# ========================================================================
# Extract bone hierarchy and rest positions
# ========================================================================
bone_hierarchy = {}
bone_rest_positions = {}

# Use EVALUATED pose bone positions (matching the evaluated mesh)
# so joint points align with the voxelized mesh geometry.
eval_depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(0)
eval_depsgraph.update()
armature_eval = armature.evaluated_get(eval_depsgraph)

for bone in armature.data.bones:
    # Try evaluated pose bone first (matches mesh at frame 0)
    pb = armature_eval.pose.bones.get(bone.name)
    if pb:
        head_world = armature_eval.matrix_world @ pb.head
        tail_world = armature_eval.matrix_world @ pb.tail
    else:
        # Fallback to rest pose
        head_world = armature.matrix_world @ bone.head_local
        tail_world = armature.matrix_world @ bone.tail_local
    bone_rest_positions[bone.name] = {
        "head": [head_world.x, head_world.y, head_world.z],
        "tail": [tail_world.x, tail_world.y, tail_world.z],
        "length": bone.length,
    }
    bone_hierarchy[bone.name] = {
        "parent": bone.parent.name if bone.parent else None,
        "children": [c.name for c in bone.children],
    }

print(f"  Bones: {len(bone_rest_positions)}")

# ========================================================================
# Build evaluated mesh
# ========================================================================
depsgraph = bpy.context.evaluated_depsgraph_get()
body_eval = body_obj.evaluated_get(depsgraph)
mesh_eval = body_eval.to_mesh()

bm = bmesh.new()
bm.from_mesh(mesh_eval)
bm.transform(body_obj.matrix_world)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.faces.ensure_lookup_table()
bm.verts.ensure_lookup_table()
bvh = BVHTree.FromBMesh(bm)

# ========================================================================
# Vertex bone weight map
# ========================================================================
vertex_groups = body_obj.vertex_groups
vg_name_map = {vg.index: vg.name for vg in vertex_groups}

EXCLUDE_PREFIXES = ('hair_', 'Gloves_', 'Leggings_', 'Breasts_Simpl', 'Butts_Simpl',
                    'tie.', 'hologram', 'hipplate', 'spline_', 'dress_', 'belt_',
                    'braid_', 'cc_Cape_', 'cc_skirt_', 'cc_Armor_', 'SwordHolder',
                    'c_fist', 'c_tail_')
valid_deform_bones = set()
for bone in armature.data.bones:
    if bone.use_deform and not any(bone.name.startswith(p) for p in EXCLUDE_PREFIXES):
        valid_deform_bones.add(bone.name)
print(f"  Valid deform bones: {len(valid_deform_bones)}")

FACE_MERGE_PREFIXES = ('c_lips_', 'c_teeth_', 'c_nose_', 'c_chin_', 'c_cheek_',
                       'c_eyebrow_', 'c_eyelid_', 'c_eye_ref_track', 'c_eye_offset',
                       'tong_')

ARP_NORMALIZE = {
    'thigh_stretch': 'c_thigh_stretch',
    'thigh_twist': 'c_thigh_twist',
    'thigh_twist_2': 'c_thigh_twist_2',
    'leg_stretch': 'c_leg_stretch',
    'leg_twist': 'c_leg_twist',
    'leg_twist_2': 'c_leg_twist_2',
    'arm_stretch': 'c_arm_stretch',
    'arm_twist_2': 'c_arm_twist_2',
    'c_arm_twist_offset': 'c_arm_twist',
    'forearm_stretch': 'c_forearm_stretch',
    'forearm_twist': 'c_forearm_twist',
    'forearm_twist_2': 'c_forearm_twist_2',
    'spine_01': 'c_spine_01_bend',
    'spine_02': 'c_spine_02_bend',
    'spine_03': 'c_spine_03_bend',
    'root': 'c_root_bend',
    'cc_balls': 'c_root_bend',
}

def normalize_arp_name(name):
    suffix = ''
    for s in ['.l', '.r', '.x']:
        if name.endswith(s):
            base = name[:-len(s)]
            suffix = s
            break
    else:
        base = name
    if base in ARP_NORMALIZE:
        return ARP_NORMALIZE[base] + suffix
    return name

def resolve_bone_name(name):
    """Map bones - keep fingers/toes as individual segments."""
    name = normalize_arp_name(name)

    # Face -> head
    if any(name.startswith(p) for p in FACE_MERGE_PREFIXES):
        return 'head.x'
    # Keep individual toe bones (don't merge to foot)
    # c_toes_thumb1_base.l -> c_toes_thumb1_base.l (keep as-is)
    # But merge very fine sub-bones: toes_thumb1_def -> c_toes_thumb1_base
    if name.startswith('toes_') and '_def' in name:
        # toes_thumb1_def.l -> c_toes_thumb1_base.l
        base = name.replace('toes_', 'c_toes_').replace('_def', '_base')
        # toes_index2_def.l -> keep parent bone
        return base if base in valid_deform_bones else name
    # Keep finger bones as individual segments
    # (Don't merge to hand.l/hand.r)
    # Map vagina/genital to lower torso
    if name.startswith('vagina') or name == 'genital':
        return 'c_root_bend.x'
    if name.startswith('butt'):
        return 'c_root_bend.x'
    if name.startswith('nipple'):
        # QM uses underscore: breast_l
        if '_l' in name or '.l' in name: return 'breast_l'
        if '_r' in name or '.r' in name: return 'breast_r'
        return 'breast_l'
    if name.startswith('c_lips_smile'):
        return 'head.x'
    if name.startswith('c_eye.'):
        return 'head.x'
    return name

vertex_bone_map = {}
for vert in mesh_eval.vertices:
    best_bone = None
    best_weight = 0.0
    for g in vert.groups:
        vg_name = vg_name_map.get(g.group, None)
        if vg_name and vg_name in valid_deform_bones and g.weight > best_weight:
            best_weight = g.weight
            best_bone = vg_name
    if best_bone:
        vertex_bone_map[vert.index] = resolve_bone_name(best_bone)

print(f"  Vertices with bone assignments: {len(vertex_bone_map)}/{len(mesh_eval.vertices)}")
resolved_names = sorted(set(vertex_bone_map.values()))
print(f"  Resolved segment names ({len(resolved_names)}): {resolved_names}")

# ========================================================================
# Face-to-bone mapping
# ========================================================================
face_bone_map = {}
for face in bm.faces:
    bone_votes = {}
    for vert in face.verts:
        bone = vertex_bone_map.get(vert.index, None)
        if bone:
            bone_votes[bone] = bone_votes.get(bone, 0) + 1
    if bone_votes:
        face_bone_map[face.index] = max(bone_votes, key=bone_votes.get)

# ========================================================================
# Texture sampling (with barycentric interpolation)
# ========================================================================
texture_cache = {}

def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    raw = image.pixels[:]
    n = w * h
    rgb = bytearray(n * 3)
    for i in range(n):
        si = i * 4
        rgb[i*3]   = max(0, min(255, int(raw[si]   * 255)))
        rgb[i*3+1] = max(0, min(255, int(raw[si+1] * 255)))
        rgb[i*3+2] = max(0, min(255, int(raw[si+2] * 255)))
    texture_cache[image.name] = (w, h, bytes(rgb))

def sample_texture(img_name, u, v):
    if img_name not in texture_cache:
        return None
    w, h, pix = texture_cache[img_name]
    px = int(u * w) % w
    py = int(v * h) % h
    pi = (py * w + px) * 3
    if pi + 2 < len(pix):
        return (pix[pi], pix[pi+1], pix[pi+2])
    return None

def find_base_texture(mat):
    if not mat or not hasattr(mat, 'node_tree') or not mat.node_tree:
        return None
    best = None
    best_score = -999
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            n = node.image.name.lower()
            score = 0
            if 'basecolor' in n or 'base_color' in n or 'diffuse' in n:
                score = 10
            elif 'albedo' in n:
                score = 8
            elif any(k in n for k in ['normal','roughness','metallic','specular','height','opacity','ao','emissive']):
                score = -10
            if score > best_score:
                best_score = score
                best = node.image
    return best

for mat in bpy.data.materials:
    tex = find_base_texture(mat)
    if tex:
        cache_texture(tex)

# ========================================================================
# Bounding box and grid
# ========================================================================
world_verts = [body_obj.matrix_world @ v.co for v in mesh_eval.vertices]
bb_min = Vector((min(v.x for v in world_verts), min(v.y for v in world_verts), min(v.z for v in world_verts)))
bb_max = Vector((max(v.x for v in world_verts), max(v.y for v in world_verts), max(v.z for v in world_verts)))

pad = VOXEL_SIZE * 2
bb_min -= Vector((pad, pad, pad))
bb_max += Vector((pad, pad, pad))

gx = int(math.ceil((bb_max.x - bb_min.x) / VOXEL_SIZE)) + 1
gy = int(math.ceil((bb_max.y - bb_min.y) / VOXEL_SIZE)) + 1
gz = int(math.ceil((bb_max.z - bb_min.z) / VOXEL_SIZE)) + 1

print(f"\n  Grid: {gx}x{gy}x{gz}")

# ========================================================================
# Voxelize
# ========================================================================
print(f"\n  Voxelizing...")
voxels = {}
palette_map = {}
palette_list = []

def get_palette_index(r, g, b):
    key = (r, g, b)
    if key in palette_map:
        return palette_map[key]
    idx = len(palette_list) + 1
    if idx > 255:
        best_idx = 1
        best_dist = 999999
        for i, (pr, pg, pb) in enumerate(palette_list):
            d = (r-pr)**2 + (g-pg)**2 + (b-pb)**2
            if d < best_dist:
                best_dist = d
                best_idx = i + 1
        return best_idx
    palette_map[key] = idx
    palette_list.append((r, g, b))
    return idx

thr = VOXEL_SIZE * 1.2
sz_limit = min(gz, 256)
sx_limit = min(gx, 256)
sy_limit = min(gy, 256)
uv_layer = bm.loops.layers.uv.active

import time
t0 = time.time()

for vz in range(sz_limit):
    if vz % 10 == 0:
        elapsed = time.time() - t0
        print(f"    z={vz}/{sz_limit} voxels={len(voxels)} ({elapsed:.1f}s)", flush=True)
    for vx in range(sx_limit):
        for vy in range(sy_limit):
            center = Vector((
                bb_min.x + (vx + 0.5) * VOXEL_SIZE,
                bb_min.y + (vy + 0.5) * VOXEL_SIZE,
                bb_min.z + (vz + 0.5) * VOXEL_SIZE,
            ))
            nearest, normal, face_idx, dist = bvh.find_nearest(center)
            if nearest is None or dist >= thr:
                continue

            bone_name = face_bone_map.get(face_idx, "unknown") if face_idx is not None else "unknown"
            ci = get_palette_index(200, 180, 160)

            # Texture sampling with barycentric interpolation
            if face_idx is not None and uv_layer:
                face = bm.faces[face_idx]
                if face.material_index < len(body_obj.data.materials):
                    mat = body_obj.data.materials[face.material_index]
                    tex = find_base_texture(mat)
                    if tex and tex.name in texture_cache:
                        # Barycentric interpolation
                        v0 = face.verts[0].co
                        v1 = face.verts[1].co
                        v2 = face.verts[2].co
                        # Compute barycentric coords
                        e0 = v1 - v0
                        e1 = v2 - v0
                        ep = nearest - v0
                        d00 = e0.dot(e0)
                        d01 = e0.dot(e1)
                        d11 = e1.dot(e1)
                        dp0 = ep.dot(e0)
                        dp1 = ep.dot(e1)
                        denom = d00 * d11 - d01 * d01
                        if abs(denom) > 1e-12:
                            u_bary = (d11 * dp0 - d01 * dp1) / denom
                            v_bary = (d00 * dp1 - d01 * dp0) / denom
                            w_bary = 1.0 - u_bary - v_bary
                            uv0 = face.loops[0][uv_layer].uv
                            uv1 = face.loops[1][uv_layer].uv
                            uv2 = face.loops[2][uv_layer].uv
                            uvu = w_bary * uv0.x + u_bary * uv1.x + v_bary * uv2.x
                            uvv = w_bary * uv0.y + u_bary * uv1.y + v_bary * uv2.y
                            sampled = sample_texture(tex.name, uvu, uvv)
                            if sampled:
                                ci = get_palette_index(*sampled)
                        else:
                            uv = face.loops[0][uv_layer].uv
                            sampled = sample_texture(tex.name, uv.x, uv.y)
                            if sampled:
                                ci = get_palette_index(*sampled)

            voxels[(vx, vy, vz)] = {"ci": ci, "bone": bone_name}

print(f"  Total voxels: {len(voxels)}")

# ========================================================================
# Group by bone
# ========================================================================
bone_voxels = {}
for (vx, vy, vz), info in voxels.items():
    bone = info["bone"]
    if bone not in bone_voxels:
        bone_voxels[bone] = []
    bone_voxels[bone].append((vx, vy, vz, info["ci"]))

print(f"\n  Bone segments ({len(bone_voxels)}):")
for bone_name in sorted(bone_voxels.keys()):
    print(f"    {bone_name}: {len(bone_voxels[bone_name])} voxels")

# ========================================================================
# Write VOX
# ========================================================================
def write_vox(filepath, sx, sy, sz, voxel_list, pal):
    num = len(voxel_list)
    xyzi_size = 4 + num * 4
    size_size = 12
    rgba_size = 256 * 4
    chunks = bytearray()
    chunks += b'SIZE'
    chunks += struct.pack('<II', size_size, 0)
    chunks += struct.pack('<III', sx, sy, sz)
    chunks += b'XYZI'
    chunks += struct.pack('<II', xyzi_size, 0)
    chunks += struct.pack('<I', num)
    for x, y, z, c in voxel_list:
        chunks += struct.pack('BBBB', x, y, z, c)
    chunks += b'RGBA'
    chunks += struct.pack('<II', rgba_size, 0)
    for i in range(256):
        if i < len(pal):
            r, g, b = pal[i]
            chunks += struct.pack('BBBB', r, g, b, 255)
        else:
            chunks += struct.pack('BBBB', 0, 0, 0, 255)
    out = bytearray()
    out += b'VOX '
    out += struct.pack('<I', 150)
    out += b'MAIN'
    out += struct.pack('<II', 0, len(chunks))
    out += chunks
    with open(filepath, 'wb') as f:
        f.write(out)

sx = min(gx, 256)
sy = min(gy, 256)
sz = min(gz, 256)

for bone_name, bvoxels in bone_voxels.items():
    safe_name = bone_name.replace(' ', '_').replace(':', '_').lower()
    filepath = os.path.join(seg_dir, f"{safe_name}.vox")
    write_vox(filepath, sx, sy, sz, bvoxels, palette_list)

all_voxels = []
for bvoxels in bone_voxels.values():
    all_voxels.extend(bvoxels)
write_vox(os.path.join(OUT_DIR, "body", "body.vox"), sx, sy, sz, all_voxels, palette_list)

# ========================================================================
# Metadata
# ========================================================================
bone_voxel_positions = {}
for bname, bdata in bone_rest_positions.items():
    hx = int((bdata["head"][0] - bb_min.x) / VOXEL_SIZE)
    hy = int((bdata["head"][1] - bb_min.y) / VOXEL_SIZE)
    hz = int((bdata["head"][2] - bb_min.z) / VOXEL_SIZE)
    tx = int((bdata["tail"][0] - bb_min.x) / VOXEL_SIZE)
    ty = int((bdata["tail"][1] - bb_min.y) / VOXEL_SIZE)
    tz = int((bdata["tail"][2] - bb_min.z) / VOXEL_SIZE)
    bone_voxel_positions[bname] = {
        "head_voxel": [hx, hy, hz],
        "tail_voxel": [tx, ty, tz],
        "head_world": bdata["head"],
        "tail_world": bdata["tail"],
        "length_world": bdata["length"],
    }

segments_meta = {}
for bone_name, bvoxels in bone_voxels.items():
    safe_name = bone_name.replace(' ', '_').replace(':', '_').lower()
    segments_meta[bone_name] = {"file": f"segments/{safe_name}.vox", "voxels": len(bvoxels)}

meta = {
    "model": os.path.basename(INPUT_PATH),
    "voxel_size": VOXEL_SIZE,
    "grid": {"gx": sx, "gy": sy, "gz": sz},
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
    "bone_hierarchy": bone_hierarchy,
    "bone_positions": bone_voxel_positions,
    "segments": segments_meta,
    "total_voxels": len(voxels),
}
with open(os.path.join(OUT_DIR, "segments.json"), 'w') as f:
    json.dump(meta, f, indent=2)

grid_meta = {
    "voxel_size": VOXEL_SIZE,
    "gx": sx, "gy": sy, "gz": sz,
    "grid_origin": [bb_min.x, bb_min.y, bb_min.z],
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
}
with open(os.path.join(OUT_DIR, "grid.json"), 'w') as f:
    json.dump(grid_meta, f, indent=2)

parts = []
for bone_name, info in segments_meta.items():
    safe_name = bone_name.replace(' ', '_').replace(':', '_').lower()
    parts.append({
        "key": bone_name,  # Use original bone name as key (for motion matching)
        "file": f"/{os.path.basename(OUT_DIR)}/{info['file']}",
        "voxels": info["voxels"],
        "default_on": True,
        "meshes": [bone_name],
        "is_body": True,
        "category": "body_segment",
    })
with open(os.path.join(OUT_DIR, "parts.json"), 'w') as f:
    json.dump(parts, f, indent=2)

bm.free()
body_eval.to_mesh_clear()

print(f"\n=== Done ===")
print(f"  Segments: {len(bone_voxels)}")
print(f"  Output: {OUT_DIR}")
