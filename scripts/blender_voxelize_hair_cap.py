"""
Blender Python: Voxelize hair relative to head surface, then remap onto cap surface.

For each hair point:
  1. Find nearest point on head (body) surface → compute offset vector
  2. Find corresponding cap surface point (same direction from head center)
  3. Place hair at cap_surface + offset

This ensures hair wraps around the cap just like it wraps around the head
in the original 3D model, regardless of chibi deformation.

Usage:
  blender --background --python scripts/blender_voxelize_hair_cap.py \
    -- <input.blend> <output.vox>
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
OUTPUT_PATH = args[1] if len(args) > 1 else ""

if not INPUT_PATH or not OUTPUT_PATH:
    print("Usage: blender --background --python blender_voxelize_hair_cap.py -- <input.blend> <output.vox>")
    sys.exit(1)

# Grid parameters from hires body
GRID_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         '..', 'public', 'box2', 'cyberpunk_elf_body_base_hires_grid.json')
with open(GRID_JSON) as f:
    grid_info = json.load(f)

gx = grid_info['gx']
gy = grid_info['gy']
gz = grid_info['gz']
voxel_size = grid_info['voxel_size']
def_min = Vector(grid_info['def_min'])
def_max = Vector(grid_info['def_max'])

print(f"\n=== Hair-on-Cap Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output: {OUTPUT_PATH}")
print(f"  Grid: {gx}x{gy}x{gz}, voxel_size: {voxel_size:.6f}")

# Load model
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
hair_objects = [o for o in mesh_objects if 'hair' in o.name.lower()]
body_objects = [o for o in mesh_objects if 'body' in o.name.lower()
                and 'hair' not in o.name.lower()
                and 'eye' not in o.name.lower()]

if not hair_objects:
    print(f"  ERROR: No hair meshes found! Available: {[o.name for o in mesh_objects]}")
    sys.exit(1)
if not body_objects:
    print(f"  ERROR: No body meshes found!")
    sys.exit(1)

print(f"  Hair: {[o.name for o in hair_objects]}")
print(f"  Body: {[o.name for o in body_objects]}")

# ── Body bbox (for chibi params, same as hires body creation) ──
min_co = Vector((1e9, 1e9, 1e9))
max_co = Vector((-1e9, -1e9, -1e9))
for obj in body_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            min_co[i] = min(min_co[i], v.co[i])
            max_co[i] = max(max_co[i], v.co[i])
    eo.to_mesh_clear()

center = (min_co + max_co) / 2
model_h = max_co.z - min_co.z
print(f"  Body center: ({center.x:.4f}, {center.y:.4f}, {center.z:.4f}), h={model_h:.4f}")

# Head region: t > 0.85 → z > min_co.z + 0.85 * model_h
head_z_threshold = min_co.z + 0.85 * model_h
print(f"  Head starts at Z={head_z_threshold:.4f} (t=0.85)")

# ── Build body BVH (for finding nearest head surface) ──
print("  Building body BVH...")
body_bvh_list = []
for obj in body_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)
    body_bvh_list.append((bvh, bm))
    eo.to_mesh_clear()

def find_nearest_body(point, max_dist=1.0):
    """Find nearest point on body surface."""
    best_loc = None
    best_dist = max_dist
    for bvh, _ in body_bvh_list:
        loc, norm, fi, dist = bvh.find_nearest(point)
        if loc is not None and dist < best_dist:
            best_dist = dist
            best_loc = loc
    return best_loc, best_dist

# ── Build hair BVH + texture ──
print("  Building hair BVH...")

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
        rgb[i * 3]     = max(0, min(255, int(raw[si]     * 255)))
        rgb[i * 3 + 1] = max(0, min(255, int(raw[si + 1] * 255)))
        rgb[i * 3 + 2] = max(0, min(255, int(raw[si + 2] * 255)))
    texture_cache[image.name] = (w, h, bytes(rgb))
    del raw

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

def score_image(name):
    n = name.lower()
    if 'basecolor' in n or 'base_color' in n or 'diffuse' in n:
        s = 10
        if any(v in n for v in ['dark', 'white', 'blue', 'red', 'turquoise', 'wet', 'blush']):
            s -= 8
        return s
    if 'albedo' in n:
        return 8
    if any(k in n for k in ['normal', 'roughness', 'metallic', 'specular', 'height',
                             'opacity', 'alpha', 'sss', 'ao', 'ambient', 'direction',
                             'gradient', 'id', 'emissive', 'emission']):
        return -10
    return 0

def find_texture_for_mat(mat):
    if not mat:
        return None
    best = None
    best_score = -999
    if hasattr(mat, 'node_tree') and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                s = score_image(node.image.name)
                if s > best_score:
                    best_score = s; best = node.image
            if node.type == 'GROUP' and node.node_tree:
                for inner in node.node_tree.nodes:
                    if inner.type == 'TEX_IMAGE' and inner.image:
                        s = score_image(inner.image.name)
                        if s > best_score:
                            best_score = s; best = inner.image
    return best if best_score >= 0 else None

mat_info = {}
for obj in hair_objects:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or mat.name in mat_info:
            continue
        info = {'image': None, 'color': (80, 60, 40)}
        img = find_texture_for_mat(mat)
        if img:
            cache_texture(img)
            info['image'] = img.name
        else:
            if hasattr(mat, 'node_tree') and mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED':
                        inp = node.inputs.get('Base Color')
                        if inp and not inp.is_linked:
                            c = inp.default_value
                            info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                        break
        mat_info[mat.name] = info
        tag = info['image'] or ('flat' + str(info['color']))
        print(f"    Mat '{mat.name}' -> {tag}")

class MeshData:
    __slots__ = ['bvh', 'bm', 'uv_layer', 'face_mat', 'face_tex']

hair_mesh_data = []
for obj in hair_objects:
    md = MeshData()
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    md.bvh = BVHTree.FromBMesh(bm)
    md.bm = bm
    md.uv_layer = bm.loops.layers.uv.active
    md.face_mat = {}
    md.face_tex = {}
    for face in bm.faces:
        mi = face.material_index
        mat_name = None
        if mi < len(obj.material_slots) and obj.material_slots[mi].material:
            mat_name = obj.material_slots[mi].material.name
        md.face_mat[face.index] = mat_name
        md.face_tex[face.index] = mat_info.get(mat_name, {}).get('image')
    hair_mesh_data.append(md)
    eo.to_mesh_clear()

def get_color_at(md, fi, hit):
    tex = md.face_tex.get(fi)
    if tex and md.uv_layer and fi < len(md.bm.faces):
        face = md.bm.faces[fi]
        loops = face.loops
        if len(loops) == 3:
            v0, v1, v2 = [l.vert.co for l in loops]
            uv0, uv1, uv2 = [l[md.uv_layer].uv for l in loops]
            e0, e1 = v1 - v0, v2 - v0
            ep = hit - v0
            d00, d01, d11 = e0.dot(e0), e0.dot(e1), e1.dot(e1)
            dp0, dp1 = ep.dot(e0), ep.dot(e1)
            denom = d00 * d11 - d01 * d01
            if abs(denom) > 1e-12:
                u = (d11 * dp0 - d01 * dp1) / denom
                v = (d00 * dp1 - d01 * dp0) / denom
                w2 = 1 - u - v
                u = max(0, min(1, u))
                v = max(0, min(1, v))
                w2 = max(0, min(1, w2))
                uvu = w2 * uv0.x + u * uv1.x + v * uv2.x
                uvv = w2 * uv0.y + u * uv1.y + v * uv2.y
                c = sample_texture(tex, uvu, uvv)
                if c:
                    return c
    mn = md.face_mat.get(fi)
    if mn and mn in mat_info:
        return mat_info[mn]['color']
    return (80, 60, 40)

# ══════════════════════════════════════════════════════════════════════
# Step 1: Sample hair points in 3D model space (NO chibi deform yet)
# For each hair sample, record:
#   - position in model space
#   - color
#   - offset from nearest body surface point
# ══════════════════════════════════════════════════════════════════════
print("\n  Step 1: Sampling hair in model space...")

# Sample on a fine grid in model space (matching the voxel resolution)
# We scan the model-space bounding box of hair
hair_min = Vector((1e9, 1e9, 1e9))
hair_max = Vector((-1e9, -1e9, -1e9))
for obj in hair_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            hair_min[i] = min(hair_min[i], v.co[i])
            hair_max[i] = max(hair_max[i], v.co[i])
    eo.to_mesh_clear()

print(f"  Hair bbox: ({hair_min.x:.3f},{hair_min.y:.3f},{hair_min.z:.3f}) to ({hair_max.x:.3f},{hair_max.y:.3f},{hair_max.z:.3f})")

# Use same voxel_size for sampling
THRESHOLD = voxel_size * 3.0
hair_samples = []  # list of (model_pos, color, offset_from_body)

# Head center in model space (approximate, for direction calculation)
# The head is roughly centered at (center.x, center.y, head_z_threshold + 0.5*(max_co.z - head_z_threshold))
head_center_model = Vector((
    center.x,
    center.y,
    head_z_threshold + 0.5 * (max_co.z - head_z_threshold)
))
print(f"  Head center (model): ({head_center_model.x:.4f}, {head_center_model.y:.4f}, {head_center_model.z:.4f})")

# Scan model space
scan_min = hair_min - Vector((voxel_size, voxel_size, voxel_size))
scan_max = hair_max + Vector((voxel_size, voxel_size, voxel_size))
nx = int(math.ceil((scan_max.x - scan_min.x) / voxel_size))
ny = int(math.ceil((scan_max.y - scan_min.y) / voxel_size))
nz = int(math.ceil((scan_max.z - scan_min.z) / voxel_size))
print(f"  Scan grid: {nx}x{ny}x{nz} = {nx*ny*nz} points")

count = 0
for iz in range(nz):
    if iz % 20 == 0:
        print(f"    z={iz}/{nz} samples={len(hair_samples)}")
    for ix in range(nx):
        for iy in range(ny):
            p = Vector((
                scan_min.x + (ix + 0.5) * voxel_size,
                scan_min.y + (iy + 0.5) * voxel_size,
                scan_min.z + (iz + 0.5) * voxel_size,
            ))

            # Check if near hair surface
            best_dist = THRESHOLD
            best_color = None
            best_loc = None
            for md in hair_mesh_data:
                loc, norm, fi, dist = md.bvh.find_nearest(p)
                if loc is not None and dist < best_dist:
                    best_dist = dist
                    best_color = get_color_at(md, fi, loc)
                    best_loc = loc
            if best_color is None:
                continue

            # Find nearest body surface point
            body_loc, body_dist = find_nearest_body(p, max_dist=0.5)
            if body_loc is None:
                # Hair far from body: compute offset from head center direction
                dir_from_center = p - head_center_model
                dir_len = dir_from_center.length
                if dir_len > 0.001:
                    dir_norm = dir_from_center.normalized()
                else:
                    dir_norm = Vector((0, 0, 1))
                # Use the distance from head center as a rough surface offset
                offset_vec = dir_from_center
            else:
                # Offset = hair_pos - body_surface
                offset_vec = p - body_loc

            hair_samples.append((p, best_color, offset_vec, body_loc))

print(f"  Total hair samples: {len(hair_samples)}")

# ══════════════════════════════════════════════════════════════════════
# Step 2: Load cap voxels and build cap surface lookup
# ══════════════════════════════════════════════════════════════════════
print("\n  Step 2: Loading cap surface...")

# Read cap and body vox files to get cap surface in voxel space
# Then convert cap surface positions to model space for mapping
import struct as _struct

def read_vox_raw(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()
    view = memoryview(data)
    off = [0]
    def r32():
        v = _struct.unpack_from('<I', data, off[0])[0]; off[0] += 4; return v
    def r8():
        v = data[off[0]]; off[0] += 1; return v
    def rStr(n):
        s = data[off[0]:off[0]+n].decode('ascii'); off[0] += n; return s

    rStr(4); r32()
    sx = sy = sz = 0
    voxels = []
    palette = []
    def readChunks(end):
        nonlocal sx, sy, sz
        while off[0] < end:
            cid = rStr(4); cs = r32(); ccs = r32(); ce = off[0] + cs
            if cid == 'SIZE':
                sx = r32(); sy = r32(); sz = r32()
            elif cid == 'XYZI':
                n = r32()
                for _ in range(n):
                    voxels.append((r8(), r8(), r8(), r8()))
            elif cid == 'RGBA':
                for _ in range(256):
                    palette.append((r8(), r8(), r8())); r8()
            off[0] = ce
            if ccs > 0:
                readChunks(off[0] + ccs)

    rStr(4); mc = r32(); mcc = r32(); off[0] += mc
    readChunks(off[0] + mcc)
    return sx, sy, sz, voxels, palette

cap_sx, cap_sy, cap_sz, cap_voxels_raw, cap_palette = read_vox_raw(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'box2', 'knit_cap.vox'))
body_sx, body_sy, body_sz, body_voxels_raw, body_palette = read_vox_raw(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'box2', 'cyberpunk_elf_body_base_hires_sym.vox'))

print(f"  Cap: {len(cap_voxels_raw)} voxels")
print(f"  Body: {len(body_voxels_raw)} voxels")

# Build body set in voxel space
body_voxel_set = set()
for x, y, z, ci in body_voxels_raw:
    body_voxel_set.add((x, y, z))

# Build cap set
cap_voxel_set = set()
for x, y, z, ci in cap_voxels_raw:
    cap_voxel_set.add((x, y, z))

# Cap surface: cap voxels with at least one empty neighbor (not body, not cap)
DIRS = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
cap_surface_voxels = []
for x, y, z, ci in cap_voxels_raw:
    for dx, dy, dz in DIRS:
        nb = (x+dx, y+dy, z+dz)
        if nb not in body_voxel_set and nb not in cap_voxel_set:
            cap_surface_voxels.append((x, y, z))
            break

print(f"  Cap surface voxels: {len(cap_surface_voxels)}")

# Convert cap surface voxels to deformed (viewer) space positions
# voxel (vx, vy, vz) → deformed position
def voxel_to_deformed(vx, vy, vz):
    return Vector((
        def_min.x + (vx + 0.5) * voxel_size,
        def_min.y + (vy + 0.5) * voxel_size,
        def_min.z + (vz + 0.5) * voxel_size,
    ))

# Chibi deformation inverse: deformed → model space
def inv_deform(co):
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = min(1, (t - 0.85) / 0.15)
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) / s
        y = center.y + (y - center.y) / s
        z = z - ht * model_h * 0.06
    elif t > 0.50:
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    else:
        u = (z - min_co.z) / (0.50 * model_h) if model_h > 0 else 0
        u = max(0, min(1, u))
        disc = 0.49 + 1.20 * u
        r = (-0.70 + math.sqrt(disc)) / 0.60 if disc >= 0 else 0
        r = max(0, min(1, r))
        leg_t = r
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x -= sign * spread
        z = min_co.z + r * 0.50 * model_h
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    return Vector((x, y, z))

def deform_point(co):
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = (t - 0.85) / 0.15
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        z = z + ht * model_h * 0.06
    elif t > 0.50:
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
    else:
        leg_t = t / 0.50
        f = 0.70 * leg_t + 0.30 * leg_t * leg_t
        z = min_co.z + f * 0.50 * model_h
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x += sign * spread
    return Vector((x, y, z))

# Cap surface in model space (inverse deform from voxel/deformed space)
cap_surface_model = []
for vx, vy, vz in cap_surface_voxels:
    dp = voxel_to_deformed(vx, vy, vz)
    mp = inv_deform(dp)
    cap_surface_model.append((mp, (vx, vy, vz)))

# Also compute head center in deformed space (for direction mapping)
head_center_deformed = deform_point(head_center_model)
print(f"  Head center (deformed): ({head_center_deformed.x:.4f}, {head_center_deformed.y:.4f}, {head_center_deformed.z:.4f})")

# Body surface in model space: body voxels in head region with empty neighbor
body_head_voxels = [(x,y,z) for x,y,z in body_voxel_set
                    if voxel_to_deformed(x,y,z).z > def_min.z + 0.7 * (def_max.z - def_min.z)]
body_head_surface = []
for x, y, z in body_head_voxels:
    for dx, dy, dz in DIRS:
        nb = (x+dx, y+dy, z+dz)
        if nb not in body_voxel_set:
            dp = voxel_to_deformed(x, y, z)
            mp = inv_deform(dp)
            body_head_surface.append((mp, (x, y, z)))
            break

print(f"  Body head surface voxels: {len(body_head_surface)}")

# ══════════════════════════════════════════════════════════════════════
# Step 3: For each hair sample, remap onto cap surface
# ══════════════════════════════════════════════════════════════════════
print("\n  Step 3: Remapping hair onto cap surface...")

# Strategy: for each hair sample point in model space,
# find the nearest body surface point (in model space),
# then find the corresponding cap surface point
# (the cap surface point that is closest to that body surface point in model space),
# then place hair at cap_surface_deformed + deformed(offset)

# Build KD-tree-like lookup: for body surface → cap surface mapping
# For each body head surface voxel, find nearest cap surface voxel
# (they should be close since cap wraps the head)

# Pre-compute: for each direction from head center, find cap surface point
# Use spherical mapping for efficiency
from collections import defaultdict

def direction_key(dx, dy, dz):
    """Quantize direction into a grid for lookup."""
    length = math.sqrt(dx*dx + dy*dy + dz*dz)
    if length < 0.001:
        return (0, 0, 0)
    nx, ny, nz = dx/length, dy/length, dz/length
    # Quantize to ~5 degree resolution
    return (round(nx * 20), round(ny * 20), round(nz * 20))

# Build cap surface direction map (in model space)
cap_dir_map = defaultdict(list)  # direction_key -> list of (model_pos, voxel_pos)
for mp, vp in cap_surface_model:
    d = mp - head_center_model
    dk = direction_key(d.x, d.y, d.z)
    cap_dir_map[dk].append((mp, vp))

# Also build a flat list for fallback nearest search
cap_model_positions = [(mp, vp) for mp, vp in cap_surface_model]

def find_nearest_cap_surface(model_pos):
    """Find the nearest cap surface point for a given model-space position."""
    d = model_pos - head_center_model
    dk = direction_key(d.x, d.y, d.z)

    # Search in same direction bucket and neighbors
    candidates = []
    for ddx in range(-2, 3):
        for ddy in range(-2, 3):
            for ddz in range(-2, 3):
                nk = (dk[0]+ddx, dk[1]+ddy, dk[2]+ddz)
                candidates.extend(cap_dir_map.get(nk, []))

    if not candidates:
        # Fallback: search all
        candidates = cap_model_positions

    best_mp = None
    best_vp = None
    best_d = 1e9
    for cmp, cvp in candidates:
        d2 = (cmp - model_pos).length_squared
        if d2 < best_d:
            best_d = d2
            best_mp = cmp
            best_vp = cvp

    return best_mp, best_vp

# Remap each hair sample
result = {}  # (vx, vy, vz) -> (r, g, b)
mapped = 0
skipped = 0

for sample_pos, color, offset_vec, body_surf_pos in hair_samples:
    # Find nearest cap surface point (in model space)
    if body_surf_pos is not None:
        cap_model_pos, cap_voxel_pos = find_nearest_cap_surface(body_surf_pos)
    else:
        cap_model_pos, cap_voxel_pos = find_nearest_cap_surface(sample_pos)

    if cap_model_pos is None:
        skipped += 1
        continue

    # New hair position in model space: cap surface + offset
    new_model_pos = cap_model_pos + offset_vec

    # Apply chibi deformation to get deformed position
    new_deformed_pos = deform_point(new_model_pos)

    # Convert deformed position to voxel coordinates
    vx = int((new_deformed_pos.x - def_min.x) / voxel_size)
    vy = int((new_deformed_pos.y - def_min.y) / voxel_size)
    vz = int((new_deformed_pos.z - def_min.z) / voxel_size)

    # Bounds check
    if vx < 0 or vx >= gx or vy < 0 or vy >= gy or vz < 0 or vz >= gz:
        skipped += 1
        continue

    # Skip if overlaps body or cap
    if (vx, vy, vz) in body_voxel_set or (vx, vy, vz) in cap_voxel_set:
        skipped += 1
        continue

    key = (vx, vy, vz)
    if key not in result:
        result[key] = color
        mapped += 1

print(f"  Mapped: {mapped}, Skipped: {skipped}")
print(f"  Output voxels: {len(result)}")

# ══════════════════════════════════════════════════════════════════════
# Step 4: Write output
# ══════════════════════════════════════════════════════════════════════
print("\n  Step 4: Writing output...")

def build_palette_and_voxels(voxel_dict):
    color_map = {}
    pal = []
    out = []
    for (vx, vy, vz), (r, g, b) in voxel_dict.items():
        qr = (r // 8) * 8
        qg = (g // 8) * 8
        qb = (b // 8) * 8
        key = (qr, qg, qb)
        if key not in color_map:
            if len(pal) >= 255:
                best_i, best_d = 0, 1e9
                for i, (pr, pg, pb) in enumerate(pal):
                    d2 = (pr-qr)**2+(pg-qg)**2+(pb-qb)**2
                    if d2 < best_d:
                        best_d = d2; best_i = i
                color_map[key] = best_i + 1
            else:
                pal.append(key)
                color_map[key] = len(pal)
        out.append((vx, vy, vz, color_map[key]))
    return out, pal

def write_vox(fp, sx, sy, sz, voxels, pal):
    xyzi = 4 + len(voxels) * 4
    children = (12+12) + (12+xyzi) + (12+1024)
    os.makedirs(os.path.dirname(os.path.abspath(fp)), exist_ok=True)
    with open(fp, 'wb') as f:
        f.write(b'VOX '); f.write(_struct.pack('<I', 150))
        f.write(b'MAIN'); f.write(_struct.pack('<II', 0, children))
        f.write(b'SIZE'); f.write(_struct.pack('<II', 12, 0))
        f.write(_struct.pack('<III', sx, sy, sz))
        f.write(b'XYZI'); f.write(_struct.pack('<II', xyzi, 0))
        f.write(_struct.pack('<I', len(voxels)))
        for vx, vy, vz, ci in voxels:
            f.write(_struct.pack('BBBB', vx, vy, vz, ci))
        f.write(b'RGBA'); f.write(_struct.pack('<II', 1024, 0))
        for i in range(256):
            if i < len(pal):
                f.write(_struct.pack('BBBB', pal[i][0], pal[i][1], pal[i][2], 255))
            else:
                f.write(_struct.pack('BBBB', 0, 0, 0, 0))
    print(f"  -> {fp}: {sx}x{sy}x{sz}, {len(voxels)} voxels, {len(pal)} colors")

vlist, pal = build_palette_and_voxels(result)
write_vox(OUTPUT_PATH, gx, gy, gz, vlist, pal)

# Cleanup
for md in hair_mesh_data:
    md.bm.free()
for bvh, bm in body_bvh_list:
    bm.free()

print("\n=== Done ===\n")
