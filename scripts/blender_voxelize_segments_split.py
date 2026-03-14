"""
Blender Python: Voxelize body into per-bone segments with separate body/head grids.

Body segments: voxelized in feet-to-neck bounding box (gz <= 256)
Head segments: voxelized in neck-to-top bounding box (gz <= 256)
neck.x is included in head only.

Each segment is a separate VOX file for individual toggle and motion support.

Usage:
  blender --background --python blender_voxelize_segments_split.py -- <input.blend> <output_dir> [voxel_size]
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

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""
OUT_DIR = args[1] if len(args) > 1 else ""
VOXEL_SIZE = float(args[2]) if len(args) > 2 else 0.007

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python blender_voxelize_segments_split.py -- <input.blend> <output_dir> [voxel_size]")
    sys.exit(1)

print(f"\n=== Segment Split Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output: {OUT_DIR}")
print(f"  Voxel size: {VOXEL_SIZE}")

ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# ========================================================================
# Find body mesh and armature
# ========================================================================
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

print(f"  Body: {body_obj.name} ({len(body_obj.data.vertices)} verts)")
print(f"  Armature: {armature.name}")

for mod in body_obj.modifiers:
    if mod.type == 'MASK' and mod.show_viewport:
        mod.show_viewport = False

# ========================================================================
# Find neck bone world Z
# ========================================================================
neck_bone = armature.data.bones.get('neck.x') or armature.data.bones.get('c_neck.x')
if not neck_bone:
    print("ERROR: neck.x bone not found!")
    sys.exit(1)

neck_world = armature.matrix_world @ neck_bone.head_local
neck_z = neck_world.z
print(f"  Neck Z (world): {neck_z:.4f}")

# ========================================================================
# Build BVH and bone weight maps
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

# Vertex groups and bone weights
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

FACE_MERGE_PREFIXES = ('c_lips_', 'c_teeth_', 'c_nose_', 'c_chin_', 'c_cheek_',
                       'c_eyebrow_', 'c_eyelid_', 'c_eye_ref_track', 'c_eye_offset',
                       'tong_')

def normalize_arp_name(name):
    suffix = ''
    for s in ['.l', '.r', '.x']:
        if name.endswith(s):
            base = name[:-len(s)]
            suffix = s
            break
    else:
        base = name
    return ARP_NORMALIZE.get(base, base) + suffix

def resolve_bone_name(name):
    name = normalize_arp_name(name)
    if any(name.startswith(p) for p in FACE_MERGE_PREFIXES):
        return 'head.x'
    if name.startswith('toes_') or name.startswith('c_toes_'):
        return 'foot.l' if '.l' in name else 'foot.r'
    finger_prefixes = ('c_pinky', 'c_ring', 'c_middle', 'c_index', 'c_thumb',
                       'pinky', 'ring1', 'middle1', 'index1', 'thumb1',
                       'c_pinky1_base', 'c_ring1_base', 'c_middle1_base', 'c_index1_base')
    if any(name.startswith(p) for p in finger_prefixes):
        return 'hand.l' if '.l' in name else 'hand.r'
    if name.startswith('vagina') or name == 'genital':
        return 'c_root_bend.x'
    if name.startswith('butt'):
        return 'c_root_bend.x'
    if name.startswith('nipple'):
        return 'breast' + name[-2:]
    if name.startswith('c_lips_smile'):
        return 'head.x'
    return name

# Build vertex -> bone map
vertex_bone_map = {}
for vert in mesh_eval.vertices:
    best_bone, best_weight = None, 0.0
    for g in vert.groups:
        vg_name = vg_name_map.get(g.group)
        if vg_name and vg_name in valid_deform_bones and g.weight > best_weight:
            best_weight = g.weight
            best_bone = vg_name
    if best_bone:
        vertex_bone_map[vert.index] = resolve_bone_name(best_bone)

# Build face -> bone map
face_bone_map = {}
for face in bm.faces:
    bone_votes = {}
    for vert in face.verts:
        bone = vertex_bone_map.get(vert.index)
        if bone:
            bone_votes[bone] = bone_votes.get(bone, 0) + 1
    if bone_votes:
        face_bone_map[face.index] = max(bone_votes, key=bone_votes.get)

resolved_names = sorted(set(vertex_bone_map.values()))
print(f"  Valid deform bones: {len(valid_deform_bones)}")
print(f"  Resolved segments: {len(resolved_names)}")

# Head segments: neck.x and above
HEAD_SEGMENTS = {'neck.x', 'head.x', 'jawbone.x',
                 'c_ear_01.l', 'c_ear_02.l', 'c_ear_01.r', 'c_ear_02.r',
                 'c_eye.l', 'c_eye.r'}

body_segments = [s for s in resolved_names if s not in HEAD_SEGMENTS]
head_segments = [s for s in resolved_names if s in HEAD_SEGMENTS]
print(f"  Body segments: {len(body_segments)}")
print(f"  Head segments: {len(head_segments)}")

# ========================================================================
# Compute separate bounding boxes
# ========================================================================
world_verts = [body_obj.matrix_world @ v.co for v in mesh_eval.vertices]
full_min = Vector((min(v.x for v in world_verts), min(v.y for v in world_verts), min(v.z for v in world_verts)))
full_max = Vector((max(v.x for v in world_verts), max(v.y for v in world_verts), max(v.z for v in world_verts)))

# Find the actual max Z of body segment vertices (shoulder can extend above neck)
body_seg_max_z = neck_z
for vert in mesh_eval.vertices:
    bone = vertex_bone_map.get(vert.index)
    if bone and bone not in HEAD_SEGMENTS:
        world_z = (body_obj.matrix_world @ vert.co).z
        if world_z > body_seg_max_z:
            body_seg_max_z = world_z

print(f"  Body max Z (from vertices): {body_seg_max_z:.4f} (neck_z={neck_z:.4f})")

pad = VOXEL_SIZE * 2
body_bb_min = Vector((full_min.x - pad, full_min.y - pad, full_min.z - pad))
body_bb_max = Vector((full_max.x + pad, full_max.y + pad, body_seg_max_z + pad))
head_bb_min = Vector((full_min.x - pad, full_min.y - pad, neck_z - pad))
head_bb_max = Vector((full_max.x + pad, full_max.y + pad, full_max.z + pad))

body_gx = min(256, int(math.ceil((body_bb_max.x - body_bb_min.x) / VOXEL_SIZE)) + 1)
body_gy = min(256, int(math.ceil((body_bb_max.y - body_bb_min.y) / VOXEL_SIZE)) + 1)
body_gz = min(256, int(math.ceil((body_bb_max.z - body_bb_min.z) / VOXEL_SIZE)) + 1)
head_gx = min(256, int(math.ceil((head_bb_max.x - head_bb_min.x) / VOXEL_SIZE)) + 1)
head_gy = min(256, int(math.ceil((head_bb_max.y - head_bb_min.y) / VOXEL_SIZE)) + 1)
head_gz = min(256, int(math.ceil((head_bb_max.z - head_bb_min.z) / VOXEL_SIZE)) + 1)

print(f"  Body grid: {body_gx}x{body_gy}x{body_gz}")
print(f"  Head grid: {head_gx}x{head_gy}x{head_gz}")

# ========================================================================
# Texture sampling
# ========================================================================
texture_cache = {}
def cache_texture(image):
    if image.name in texture_cache: return
    w, h = image.size
    if w == 0 or h == 0: return
    raw = image.pixels[:]
    n = w * h
    rgb = bytearray(n * 3)
    for i in range(n):
        si = i * 4
        rgb[i*3] = max(0, min(255, int(raw[si]*255)))
        rgb[i*3+1] = max(0, min(255, int(raw[si+1]*255)))
        rgb[i*3+2] = max(0, min(255, int(raw[si+2]*255)))
    texture_cache[image.name] = (w, h, bytes(rgb))

def sample_texture(img_name, u, v):
    if img_name not in texture_cache: return None
    w, h, pix = texture_cache[img_name]
    px, py = int(u*w)%w, int(v*h)%h
    pi = (py*w+px)*3
    return (pix[pi], pix[pi+1], pix[pi+2]) if pi+2 < len(pix) else None

def find_base_texture(mat):
    if not mat or not hasattr(mat, 'node_tree') or not mat.node_tree: return None
    best, best_s = None, -999
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            n = node.image.name.lower()
            s = 10 if ('basecolor' in n or 'base_color' in n or 'diffuse' in n) else (8 if 'albedo' in n else (-10 if any(k in n for k in ['normal','roughness','metallic','specular','height','opacity','ao','emissive']) else 0))
            if s > best_s: best_s, best = s, node.image
    return best

for mat in bpy.data.materials:
    tex = find_base_texture(mat)
    if tex: cache_texture(tex)

uv_layer = bm.loops.layers.uv.active

# ========================================================================
# Voxelize per-segment with separate grids
# ========================================================================
def write_vox(filepath, sx, sy, sz, voxel_list, pal):
    n = len(voxel_list)
    chunks = bytearray()
    chunks += b'SIZE' + struct.pack('<II', 12, 0) + struct.pack('<III', sx, sy, sz)
    chunks += b'XYZI' + struct.pack('<II', 4+n*4, 0) + struct.pack('<I', n)
    for x, y, z, c in voxel_list:
        chunks += struct.pack('BBBB', x, y, z, c)
    chunks += b'RGBA' + struct.pack('<II', 256*4, 0)
    for i in range(256):
        if i < len(pal):
            chunks += struct.pack('BBBB', pal[i][0], pal[i][1], pal[i][2], 255)
        else:
            chunks += struct.pack('BBBB', 0, 0, 0, 255)
    out = bytearray(b'VOX ') + struct.pack('<I', 150) + b'MAIN' + struct.pack('<II', 0, len(chunks)) + chunks
    with open(filepath, 'wb') as f:
        f.write(out)

import time

def voxelize_segments(bb_min, gx, gy, gz, segment_set, label):
    """Voxelize and split into per-segment VOX files."""
    thr = VOXEL_SIZE * 1.2
    segment_voxels = {}  # segment_name -> [(x,y,z,ci)]
    palette_map = {}
    palette_list = []

    def get_ci(r, g, b):
        key = (r, g, b)
        if key in palette_map: return palette_map[key]
        idx = len(palette_list) + 1
        if idx > 255:
            best_idx, best_d = 1, 999999
            for i, (pr,pg,pb) in enumerate(palette_list):
                d = (r-pr)**2+(g-pg)**2+(b-pb)**2
                if d < best_d: best_d, best_idx = d, i+1
            return best_idx
        palette_map[key] = idx
        palette_list.append((r, g, b))
        return idx

    t0 = time.time()
    total = 0
    for vz in range(gz):
        if vz % 10 == 0:
            print(f"    {label} z={vz}/{gz} voxels={total} ({time.time()-t0:.1f}s)", flush=True)
        for vx in range(gx):
            for vy in range(gy):
                center = Vector((
                    bb_min.x + (vx + 0.5) * VOXEL_SIZE,
                    bb_min.y + (vy + 0.5) * VOXEL_SIZE,
                    bb_min.z + (vz + 0.5) * VOXEL_SIZE,
                ))
                nearest, normal, face_idx, dist = bvh.find_nearest(center)
                if nearest is None or dist >= thr:
                    continue

                bone_name = face_bone_map.get(face_idx, 'unknown') if face_idx is not None else 'unknown'

                # Only keep voxels for segments in this set
                if bone_name not in segment_set:
                    continue

                ci = get_ci(200, 180, 160)
                if face_idx is not None and uv_layer:
                    face = bm.faces[face_idx]
                    if face.material_index < len(body_obj.data.materials):
                        mat = body_obj.data.materials[face.material_index]
                        tex = find_base_texture(mat)
                        if tex and tex.name in texture_cache:
                            uv = face.loops[0][uv_layer].uv
                            sampled = sample_texture(tex.name, uv.x, uv.y)
                            if sampled:
                                ci = get_ci(*sampled)

                if bone_name not in segment_voxels:
                    segment_voxels[bone_name] = []
                segment_voxels[bone_name].append((vx, vy, vz, ci))
                total += 1

    return segment_voxels, palette_list

# Output directory
dir_name = os.path.basename(OUT_DIR)
split_dir = os.path.join(OUT_DIR, "segments-split")
body_dir = os.path.join(split_dir, "body")
head_dir = os.path.join(split_dir, "head")
os.makedirs(body_dir, exist_ok=True)
os.makedirs(head_dir, exist_ok=True)

# Voxelize body segments
print(f"\n  Voxelizing body segments...")
body_seg_set = set(body_segments)
body_seg_voxels, body_palette = voxelize_segments(body_bb_min, body_gx, body_gy, body_gz, body_seg_set, "body")

for seg_name, voxels in body_seg_voxels.items():
    safe_name = seg_name.replace(' ', '_').replace(':', '_').lower()
    write_vox(os.path.join(body_dir, f"{safe_name}.vox"), body_gx, body_gy, body_gz, voxels, body_palette)
    print(f"    {seg_name}: {len(voxels)} voxels")

# Voxelize head segments
print(f"\n  Voxelizing head segments...")
head_seg_set = set(head_segments)
head_seg_voxels, head_palette = voxelize_segments(head_bb_min, head_gx, head_gy, head_gz, head_seg_set, "head")

for seg_name, voxels in head_seg_voxels.items():
    safe_name = seg_name.replace(' ', '_').replace(':', '_').lower()
    write_vox(os.path.join(head_dir, f"{safe_name}.vox"), head_gx, head_gy, head_gz, voxels, head_palette)
    print(f"    {seg_name}: {len(voxels)} voxels")

# ========================================================================
# Write metadata
# ========================================================================
# Head offset: how to position head grid relative to body grid in viewer
# Viewer Y = voxel Z * voxel_size
# Body grid Z origin = body_bb_min.z
# Head grid Z origin = head_bb_min.z
# Head Y offset in viewer = (head_bb_min.z - body_bb_min.z)
# But viewer uses buildVoxMesh: viewer_y = vz * scale (no bb_min offset)
# So head mesh starts at viewer_y = 0, needs to be shifted up
head_offset_y = (head_bb_min.z - body_bb_min.z)

# X/Z offset: both grids use same X/Y range, but grid sizes may differ slightly
# Body center: body_bb_min.x + body_gx/2 * vs
# Head center: head_bb_min.x + head_gx/2 * vs
body_center_x = body_bb_min.x + body_gx / 2 * VOXEL_SIZE
head_center_x = head_bb_min.x + head_gx / 2 * VOXEL_SIZE
body_center_y = body_bb_min.y + body_gy / 2 * VOXEL_SIZE
head_center_y = head_bb_min.y + head_gy / 2 * VOXEL_SIZE
head_offset_x = head_center_x - body_center_x
head_offset_z = -(head_center_y - body_center_y)

parts = []
# Body segment entries
for seg_name, voxels in body_seg_voxels.items():
    safe_name = seg_name.replace(' ', '_').replace(':', '_').lower()
    parts.append({
        "key": safe_name,
        "file": f"/{dir_name}/segments-split/body/{safe_name}.vox",
        "voxels": len(voxels),
        "default_on": True,
        "meshes": [seg_name],
        "is_body": True,
        "category": "body_segment",
    })

# Head segment entries (with offset)
for seg_name, voxels in head_seg_voxels.items():
    safe_name = seg_name.replace(' ', '_').replace(':', '_').lower()
    parts.append({
        "key": safe_name,
        "file": f"/{dir_name}/segments-split/head/{safe_name}.vox",
        "voxels": len(voxels),
        "default_on": True,
        "meshes": [seg_name],
        "is_body": True,
        "category": "head_segment",
        "head_offset_x": round(head_offset_x, 6),
        "head_offset_y": round(head_offset_y, 6),
        "head_offset_z": round(head_offset_z, 6),
    })

with open(os.path.join(split_dir, "parts.json"), 'w') as f:
    json.dump(parts, f, indent=2)

# Bone positions (in body grid coordinates for body segments, head grid for head)
bone_positions = {}
for bone in armature.data.bones:
    bname = resolve_bone_name(bone.name)
    if bname in body_seg_set or bname in head_seg_set:
        head_world = armature.matrix_world @ bone.head_local
        tail_world = armature.matrix_world @ bone.tail_local
        if bname in head_seg_set:
            bb = head_bb_min
        else:
            bb = body_bb_min
        bone_positions[bname] = {
            "head_voxel": [
                int((head_world.x - bb.x) / VOXEL_SIZE),
                int((head_world.y - bb.y) / VOXEL_SIZE),
                int((head_world.z - bb.z) / VOXEL_SIZE),
            ],
            "tail_voxel": [
                int((tail_world.x - bb.x) / VOXEL_SIZE),
                int((tail_world.y - bb.y) / VOXEL_SIZE),
                int((tail_world.z - bb.z) / VOXEL_SIZE),
            ],
        }

grid_info = {
    "voxel_size": VOXEL_SIZE,
    "body": {"gx": body_gx, "gy": body_gy, "gz": body_gz,
             "bb_min": [body_bb_min.x, body_bb_min.y, body_bb_min.z]},
    "head": {"gx": head_gx, "gy": head_gy, "gz": head_gz,
             "bb_min": [head_bb_min.x, head_bb_min.y, head_bb_min.z]},
    "head_offset_x": round(head_offset_x, 6),
    "head_offset_y": round(head_offset_y, 6),
    "head_offset_z": round(head_offset_z, 6),
    "neck_z_world": neck_z,
    "bone_positions": bone_positions,
}

with open(os.path.join(split_dir, "grid.json"), 'w') as f:
    json.dump(grid_info, f, indent=2)

# Also write segments.json for motion compatibility
segments_meta = {}
for seg_name in list(body_seg_voxels.keys()) + list(head_seg_voxels.keys()):
    safe_name = seg_name.replace(' ', '_').replace(':', '_').lower()
    is_head = seg_name in head_seg_set
    subdir = "head" if is_head else "body"
    vcount = head_seg_voxels[seg_name] if is_head else body_seg_voxels[seg_name]
    segments_meta[safe_name] = {
        "file": f"segments-split/{subdir}/{safe_name}.vox",
        "voxels": len(vcount) if isinstance(vcount, list) else vcount,
        "grid": "head" if is_head else "body",
    }

full_meta = {
    "model": os.path.basename(INPUT_PATH),
    "voxel_size": VOXEL_SIZE,
    "grid": grid_info,
    "bone_positions": bone_positions,
    "segments": segments_meta,
    "body_segments": body_segments,
    "head_segments": head_segments,
    "bb_min": [body_bb_min.x, body_bb_min.y, body_bb_min.z],
}
with open(os.path.join(split_dir, "segments.json"), 'w') as f:
    json.dump(full_meta, f, indent=2)

bm.free()
body_eval.to_mesh_clear()

total_body = sum(len(v) for v in body_seg_voxels.values())
total_head = sum(len(v) for v in head_seg_voxels.values())
print(f"\n=== Done ===")
print(f"  Body: {len(body_seg_voxels)} segments, {total_body} voxels (gz={body_gz})")
print(f"  Head: {len(head_seg_voxels)} segments, {total_head} voxels (gz={head_gz})")
print(f"  Head offset: x={head_offset_x:.4f} y={head_offset_y:.4f} z={head_offset_z:.4f}")
