"""
Blender Python: Voxelize ONLY hair meshes from a 3D model.
Uses the same grid parameters as the hires body for perfect alignment.

Usage:
  blender --background --python scripts/blender_voxelize_hair.py -- <input.blend> <output.vox>
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
    print("Usage: blender --background --python blender_voxelize_hair.py -- <input.blend> <output.vox>")
    sys.exit(1)

# Grid parameters from hires body (must match exactly for alignment)
GRID_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         '..', 'public', 'box2', 'cyberpunk_elf_body_base_hires_grid.json')
with open(GRID_JSON) as f:
    grid_info = json.load(f)

body_gx = grid_info['gx']
body_gy = grid_info['gy']
body_gz = grid_info['gz']
voxel_size = grid_info['voxel_size']
body_def_min = Vector(grid_info['def_min'])
body_def_max = Vector(grid_info['def_max'])

# Grid will be expanded after computing hair bounding box
# def_min is kept the same as body so coordinates align
def_min = Vector(body_def_min)

print(f"\n=== Hair Voxelizer (Expanded Grid) ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output: {OUTPUT_PATH}")
print(f"  Body grid: {body_gx}x{body_gy}x{body_gz}, voxel_size: {voxel_size:.6f}")

# Load model
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# Disable MASK modifiers
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

# Find hair meshes
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
hair_objects = [o for o in mesh_objects if 'hair' in o.name.lower()]

if not hair_objects:
    print("  ERROR: No hair meshes found!")
    print(f"  Available meshes: {[o.name for o in mesh_objects]}")
    sys.exit(1)

print(f"  Hair meshes: {[o.name for o in hair_objects]}")

# Body bbox for chibi deformation (same as hires body)
body_objects = [o for o in mesh_objects if 'body' in o.name.lower()
                and 'hair' not in o.name.lower()
                and 'eye' not in o.name.lower()]
if not body_objects:
    body_objects = mesh_objects
print(f"  Body objects for bbox: {[o.name for o in body_objects]}")

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
print(f"  Body bbox: {max_co.x - min_co.x:.3f} x {max_co.y - min_co.y:.3f} x {model_h:.3f}")
print(f"  Center: ({center.x:.4f}, {center.y:.4f}, {center.z:.4f})")

# ── Chibi deformation (same as main script) ──
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

def inv_deform(co, head_scale_override=None):
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = min(1, (t - 0.85) / 0.15)
        if head_scale_override is not None:
            s = head_scale_override
        else:
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
        spread2 = 0.06 * (1.0 - leg_t)
        x -= sign * spread2
        z = min_co.z + r * 0.50 * model_h
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    return Vector((x, y, z))

# ── Texture handling ──
texture_cache = {}

def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    print(f"    Cache: {image.name} ({w}x{h})")
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
    for img in bpy.data.images:
        n = img.name.lower()
        key = mat.name.lower().replace(' ', '_')
        if key in n:
            s = score_image(n)
            if s > best_score:
                best_score = s; best = img
    return best if best_score >= 0 else None

# Build material info for hair
mat_info = {}
for obj in hair_objects:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or mat.name in mat_info:
            continue
        info = {'image': None, 'color': (80, 60, 40)}  # default dark brown for hair
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
        tag = info['image'] or f"flat{info['color']}"
        print(f"    Mat '{mat.name}' -> {tag}")

# ── Build BVH for hair meshes ──
print("\n  Building BVH for hair...")

class MeshData:
    __slots__ = ['bvh', 'bm', 'uv_layer', 'face_mat', 'face_tex', 'obj_name']

hair_mesh_data = []
for obj in hair_objects:
    md = MeshData()
    md.obj_name = obj.name
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

# ── Color sampling ──
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
                w = 1 - u - v
                u = max(0, min(1, u))
                v = max(0, min(1, v))
                w = max(0, min(1, w))
                uvu = w * uv0.x + u * uv1.x + v * uv2.x
                uvv = w * uv0.y + u * uv1.y + v * uv2.y
                c = sample_texture(tex, uvu, uvv)
                if c:
                    return c
    mn = md.face_mat.get(fi)
    if mn and mn in mat_info:
        return mat_info[mn]['color']
    return (80, 60, 40)

# ── Compute expanded grid to fit hair ──
# Deform all hair vertices to find the full deformed bounding box
hair_def_min = Vector((1e9, 1e9, 1e9))
hair_def_max = Vector((-1e9, -1e9, -1e9))
for obj in hair_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        dc = deform_point(v.co)
        for i in range(3):
            hair_def_min[i] = min(hair_def_min[i], dc[i])
            hair_def_max[i] = max(hair_def_max[i], dc[i])
    eo.to_mesh_clear()

# Expand grid: keep def_min same as body (for coordinate alignment),
# but extend max to fit hair with margin
margin = voxel_size * 5
def_max = Vector((
    max(body_def_max.x, hair_def_max.x + margin),
    max(body_def_max.y, hair_def_max.y + margin),
    max(body_def_max.z, hair_def_max.z + margin),
))
# Also extend min if hair goes below body
def_min = Vector((
    min(body_def_min.x, hair_def_min.x - margin),
    min(body_def_min.y, hair_def_min.y - margin),
    min(body_def_min.z, hair_def_min.z - margin),
))

gx = min(256, int(math.ceil((def_max.x - def_min.x) / voxel_size)) + 2)
gy = min(256, int(math.ceil((def_max.y - def_min.y) / voxel_size)) + 2)
gz = min(256, int(math.ceil((def_max.z - def_min.z) / voxel_size)) + 2)
print(f"  Expanded grid: {gx}x{gy}x{gz}")
print(f"  def_min: ({def_min.x:.4f}, {def_min.y:.4f}, {def_min.z:.4f})")
print(f"  def_max: ({def_max.x:.4f}, {def_max.y:.4f}, {def_max.z:.4f})")

# Compute offset so body voxel coordinates still align
# Body voxel (bvx, bvy, bvz) in body grid → position body_def_min + (bvx+0.5)*vs
# Same position in new grid → (pos - def_min) / vs - 0.5
# offset = (body_def_min - def_min) / voxel_size
body_offset_x = round((body_def_min.x - def_min.x) / voxel_size)
body_offset_y = round((body_def_min.y - def_min.y) / voxel_size)
body_offset_z = round((body_def_min.z - def_min.z) / voxel_size)
print(f"  Body offset in new grid: ({body_offset_x}, {body_offset_y}, {body_offset_z})")

# ── Voxelize hair ──
print("\n  Voxelizing hair...")
# Hair uses head_scale_override=1.0 (no chibi enlargement for hair)
# and higher threshold to catch flowing strands
THRESHOLD = voxel_size * 3.0
HEAD_SCALE = 1.0

result = {}
for vz in range(gz):
    if vz % 20 == 0:
        print(f"    z={vz}/{gz} hits={len(result)}")
    for vx in range(gx):
        for vy in range(gy):
            dp = Vector((
                def_min.x + (vx + 0.5) * voxel_size,
                def_min.y + (vy + 0.5) * voxel_size,
                def_min.z + (vz + 0.5) * voxel_size,
            ))
            op = inv_deform(dp, head_scale_override=HEAD_SCALE)
            best_dist = THRESHOLD
            best_color = None
            for md in hair_mesh_data:
                loc, norm, fi, dist = md.bvh.find_nearest(op)
                if loc is not None and dist < best_dist:
                    best_dist = dist
                    best_color = get_color_at(md, fi, loc)
            if best_color:
                result[(vx, vy, vz)] = best_color

print(f"  Hair voxels: {len(result)}")

# Save grid info for post-processing alignment
import json as _json
grid_out = {
    'gx': gx, 'gy': gy, 'gz': gz,
    'voxel_size': voxel_size,
    'def_min': [def_min.x, def_min.y, def_min.z],
    'def_max': [def_max.x, def_max.y, def_max.z],
    'body_offset': [body_offset_x, body_offset_y, body_offset_z],
}
grid_path = OUTPUT_PATH.replace('.vox', '_grid.json')
with open(grid_path, 'w') as gf:
    _json.dump(grid_out, gf, indent=2)
print(f"  Grid info: {grid_path}")

# ── Write .vox ──
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
                    d = (pr-qr)**2+(pg-qg)**2+(pb-qb)**2
                    if d < best_d:
                        best_d = d; best_i = i
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
        f.write(b'VOX '); f.write(struct.pack('<I', 150))
        f.write(b'MAIN'); f.write(struct.pack('<II', 0, children))
        f.write(b'SIZE'); f.write(struct.pack('<II', 12, 0))
        f.write(struct.pack('<III', sx, sy, sz))
        f.write(b'XYZI'); f.write(struct.pack('<II', xyzi, 0))
        f.write(struct.pack('<I', len(voxels)))
        for vx, vy, vz, ci in voxels:
            f.write(struct.pack('BBBB', vx, vy, vz, ci))
        f.write(b'RGBA'); f.write(struct.pack('<II', 1024, 0))
        for i in range(256):
            if i < len(pal):
                f.write(struct.pack('BBBB', pal[i][0], pal[i][1], pal[i][2], 255))
            else:
                f.write(struct.pack('BBBB', 0, 0, 0, 0))
    print(f"  -> {fp}: {sx}x{sy}x{sz}, {len(voxels)} voxels, {len(pal)} colors")

vlist, pal = build_palette_and_voxels(result)
write_vox(OUTPUT_PATH, gx, gy, gz, vlist, pal)

# Cleanup
for md in hair_mesh_data:
    md.bm.free()

print("\n=== Done ===\n")
