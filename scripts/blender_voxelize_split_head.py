"""
Blender Python: Voxelize body mesh split into head and body at neck bone position.
Each part gets its own bounding box and grid, both fitting within 256 voxel limit.

Usage:
  blender --background --python blender_voxelize_split_head.py -- <input.blend> <output_dir> [voxel_size]
"""
import bpy
import bmesh
import sys
import os
import struct
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""
OUT_DIR = args[1] if len(args) > 1 else ""
VOXEL_SIZE = float(args[2]) if len(args) > 2 else 0.007
NECK_CUT_Z = float(args[3]) if len(args) > 3 else None  # world Z for neck cut

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python blender_voxelize_split_head.py -- <input.blend> <output_dir> [voxel_size]")
    sys.exit(1)

print(f"\n=== Split Head/Body Voxelizer ===")
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

os.makedirs(OUT_DIR, exist_ok=True)

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

print(f"  Body: {body_obj.name} ({len(body_obj.data.vertices)} verts)")
print(f"  Armature: {armature.name}")

# Disable MASK modifiers
for mod in body_obj.modifiers:
    if mod.type == 'MASK' and mod.show_viewport:
        mod.show_viewport = False

# Find neck bone Z position in world space
neck_bone = armature.data.bones.get('neck.x') or armature.data.bones.get('c_neck.x')
if not neck_bone:
    print("ERROR: neck.x bone not found!")
    sys.exit(1)

if NECK_CUT_Z is not None:
    neck_z = NECK_CUT_Z
    print(f"  Neck Z (from segment data): {neck_z:.4f}")
else:
    neck_world = armature.matrix_world @ neck_bone.head_local
    neck_z = neck_world.z
    print(f"  Neck Z (from bone): {neck_z:.4f}")

# Build evaluated mesh
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

# Texture sampling
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

# Compute bounding boxes for body and head separately
world_verts = [body_obj.matrix_world @ v.co for v in mesh_eval.vertices]
full_min = Vector((min(v.x for v in world_verts), min(v.y for v in world_verts), min(v.z for v in world_verts)))
full_max = Vector((max(v.x for v in world_verts), max(v.y for v in world_verts), max(v.z for v in world_verts)))

pad = VOXEL_SIZE * 2

# Body: from feet to neck
body_min = Vector((full_min.x - pad, full_min.y - pad, full_min.z - pad))
body_max = Vector((full_max.x + pad, full_max.y + pad, neck_z + pad))

# Head: from neck to top
head_min = Vector((full_min.x - pad, full_min.y - pad, neck_z - pad))
head_max = Vector((full_max.x + pad, full_max.y + pad, full_max.z + pad))

body_gx = min(256, int(math.ceil((body_max.x - body_min.x) / VOXEL_SIZE)) + 1)
body_gy = min(256, int(math.ceil((body_max.y - body_min.y) / VOXEL_SIZE)) + 1)
body_gz = min(256, int(math.ceil((body_max.z - body_min.z) / VOXEL_SIZE)) + 1)

head_gx = min(256, int(math.ceil((head_max.x - head_min.x) / VOXEL_SIZE)) + 1)
head_gy = min(256, int(math.ceil((head_max.y - head_min.y) / VOXEL_SIZE)) + 1)
head_gz = min(256, int(math.ceil((head_max.z - head_min.z) / VOXEL_SIZE)) + 1)

print(f"  Body grid: {body_gx}x{body_gy}x{body_gz} (Z: {body_min.z:.3f} to {body_max.z:.3f})")
print(f"  Head grid: {head_gx}x{head_gy}x{head_gz} (Z: {head_min.z:.3f} to {head_max.z:.3f})")

# Voxelize function
def voxelize(bb_min, gx, gy, gz, label):
    thr = VOXEL_SIZE * 1.2
    voxels = {}
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

    for vz in range(gz):
        if vz % 10 == 0:
            print(f"    {label} z={vz}/{gz} voxels={len(voxels)}", flush=True)
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
                voxels[(vx, vy, vz)] = ci
    return voxels, palette_list

# Write VOX
def write_vox(filepath, sx, sy, sz, voxel_dict, pal):
    vlist = [(x, y, z, c) for (x, y, z), c in voxel_dict.items()]
    n = len(vlist)
    chunks = bytearray()
    chunks += b'SIZE' + struct.pack('<II', 12, 0) + struct.pack('<III', sx, sy, sz)
    chunks += b'XYZI' + struct.pack('<II', 4+n*4, 0) + struct.pack('<I', n)
    for x, y, z, c in vlist:
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

import json

# Voxelize body
print("\n  Voxelizing body...")
body_voxels, body_palette = voxelize(body_min, body_gx, body_gy, body_gz, "body")
print(f"  Body: {len(body_voxels)} voxels")

# Voxelize head
print("\n  Voxelizing head...")
head_voxels, head_palette = voxelize(head_min, head_gx, head_gy, head_gz, "head")
print(f"  Head: {len(head_voxels)} voxels")

# Save
split_dir = os.path.join(OUT_DIR, "split")
os.makedirs(split_dir, exist_ok=True)

write_vox(os.path.join(split_dir, "body.vox"), body_gx, body_gy, body_gz, body_voxels, body_palette)
write_vox(os.path.join(split_dir, "head.vox"), head_gx, head_gy, head_gz, head_voxels, head_palette)

# Head offset in viewer coordinates
# Body and head have different bb_min, so head mesh origin differs from body
# In viewer: y = vz * voxel_size, and head's Z origin = head_min.z
# Body's Z origin = body_min.z
# Head needs Y offset = (head_min.z - body_min.z) in viewer
head_offset_y = head_min.z - body_min.z

# Compute sizeX/sizeY centers for buildVoxMesh alignment
# Body center: (body_gx/2, body_gy/2)
# Head center: (head_gx/2, head_gy/2)
# They share the same X/Y bounding box so centers should match
# But if grids differ, X/Z offsets may be needed
body_cx_world = body_min.x + body_gx / 2 * VOXEL_SIZE
head_cx_world = head_min.x + head_gx / 2 * VOXEL_SIZE
body_cy_world = body_min.y + body_gy / 2 * VOXEL_SIZE
head_cy_world = head_min.y + head_gy / 2 * VOXEL_SIZE

# Viewer X offset: (head_cx - body_cx) mapped to viewer X
head_offset_x = head_cx_world - body_cx_world
# Viewer Z offset: -(head_cy - body_cy) mapped to viewer Z (Y is negated)
head_offset_z = -(head_cy_world - body_cy_world)

dir_name = os.path.basename(OUT_DIR)
parts = [
    {
        "key": "body",
        "file": f"/{dir_name}/split/body.vox",
        "voxels": len(body_voxels),
        "default_on": True,
        "meshes": ["body"],
        "is_body": True,
        "category": "body",
    },
    {
        "key": "head",
        "file": f"/{dir_name}/split/head.vox",
        "voxels": len(head_voxels),
        "default_on": True,
        "meshes": ["head"],
        "is_body": True,
        "category": "body",
        "head_offset_x": round(head_offset_x, 6),
        "head_offset_y": round(head_offset_y, 6),
        "head_offset_z": round(head_offset_z, 6),
    },
]

with open(os.path.join(split_dir, "parts.json"), 'w') as f:
    json.dump(parts, f, indent=2)

grid_info = {
    "voxel_size": VOXEL_SIZE,
    "body": {"gx": body_gx, "gy": body_gy, "gz": body_gz,
             "bb_min": [body_min.x, body_min.y, body_min.z],
             "bb_max": [body_max.x, body_max.y, body_max.z]},
    "head": {"gx": head_gx, "gy": head_gy, "gz": head_gz,
             "bb_min": [head_min.x, head_min.y, head_min.z],
             "bb_max": [head_max.x, head_max.y, head_max.z]},
    "neck_z_world": neck_z,
    "head_offset_x": round(head_offset_x, 6),
    "head_offset_y": round(head_offset_y, 6),
    "head_offset_z": round(head_offset_z, 6),
}
with open(os.path.join(split_dir, "grid.json"), 'w') as f:
    json.dump(grid_info, f, indent=2)

bm.free()
body_eval.to_mesh_clear()

print(f"\n=== Done ===")
print(f"  Body: {body_gx}x{body_gy}x{body_gz} ({len(body_voxels)} voxels)")
print(f"  Head: {head_gx}x{head_gy}x{head_gz} ({len(head_voxels)} voxels)")
print(f"  Head offset: x={head_offset_x:.4f} y={head_offset_y:.4f} z={head_offset_z:.4f}")
