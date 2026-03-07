"""Voxelize BODY ONLY from a model - for naked body comparison.
Usage: blender --background --python voxelize_body_only.py -- <input> <output.vox> [resolution]
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
INPUT_PATH = args[0]
OUT_PATH = args[1]
RESOLUTION = int(args[2]) if len(args) > 2 else 100

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

# Find body mesh
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
body_objs = [o for o in mesh_objects if 'body' in o.name.lower() and
             not any(x in o.name.lower() for x in ['teeth', 'tongue', 'toungue'])]
print(f"  Body objects: {[o.name for o in body_objs]}")

if not body_objs:
    print("ERROR: No body mesh found")
    sys.exit(1)

# Bounding box from BODY ONLY
min_co = Vector((1e9, 1e9, 1e9))
max_co = Vector((-1e9, -1e9, -1e9))
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            min_co[i] = min(min_co[i], v.co[i])
            max_co[i] = max(max_co[i], v.co[i])
    eo.to_mesh_clear()

size = max_co - min_co
center = (min_co + max_co) / 2
model_h = size.z
print(f"  Body BBox: {size.x:.3f} x {size.y:.3f} x {size.z:.3f}, h={model_h:.4f}")
print(f"  Center: ({center.x:.4f}, {center.y:.4f}, {center.z:.4f})")

# Chibi deformation (identical to main script)
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

# Deformed bounding box
def_min = Vector((1e9, 1e9, 1e9))
def_max = Vector((-1e9, -1e9, -1e9))
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        dc = deform_point(v.co)
        for i in range(3):
            def_min[i] = min(def_min[i], dc[i])
            def_max[i] = max(def_max[i], dc[i])
    eo.to_mesh_clear()

def_size = def_max - def_min
voxel_size = max(def_size) / RESOLUTION
gx = min(256, int(math.ceil(def_size.x / voxel_size)) + 2)
gy = min(256, int(math.ceil(def_size.y / voxel_size)) + 2)
gz = min(256, int(math.ceil(def_size.z / voxel_size)) + 2)
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.4f}")

# Build BVH + texture data
texture_cache = {}
def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    pixels = list(image.pixels)
    texture_cache[image.name] = {'w': w, 'h': h, 'px': pixels}

mat_info = {}
for obj in body_objs:
    for mat in obj.data.materials:
        if mat is None or mat.name in mat_info:
            continue
        info = {'image': None, 'color': (180, 180, 180)}
        if mat.use_nodes:
            for nd in mat.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image:
                    cache_texture(nd.image)
                    info['image'] = nd.image.name
                    break
            if not info['image']:
                for nd in mat.node_tree.nodes:
                    if nd.type == 'BSDF_PRINCIPLED':
                        inp = nd.inputs.get('Base Color')
                        if inp and not inp.is_linked:
                            c = inp.default_value
                            info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                        break
        mat_info[mat.name] = info

class MeshData:
    pass

all_mesh_data = []
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me_eval = eo.to_mesh()
    bm_local = bmesh.new()
    bm_local.from_mesh(me_eval)
    bmesh.ops.transform(bm_local, matrix=obj.matrix_world, verts=bm_local.verts)
    bmesh.ops.triangulate(bm_local, faces=bm_local.faces)
    bm_local.verts.ensure_lookup_table()
    bm_local.faces.ensure_lookup_table()
    uv_layer = bm_local.loops.layers.uv.active
    verts_list = [v.co.copy() for v in bm_local.verts]
    faces_list = [[v.index for v in f.verts] for f in bm_local.faces]
    bvh = BVHTree.FromPolygons(verts_list, faces_list)
    md = MeshData()
    md.bm = bm_local
    md.bvh = bvh
    md.uv = uv_layer
    md.mat_info = mat_info
    md.mesh_obj = obj
    all_mesh_data.append(md)
    eo.to_mesh_clear()

def get_color_at(md, face_idx, loc):
    face = md.bm.faces[face_idx]
    mat_slot = face.material_index
    mats = md.mesh_obj.data.materials
    mat_name = mats[mat_slot].name if mat_slot < len(mats) and mats[mat_slot] else None
    mi = md.mat_info.get(mat_name)
    if mi and mi['image'] and md.uv:
        tc = texture_cache.get(mi['image'])
        if tc:
            loops = face.loops
            v0, v1, v2 = [l.vert.co for l in loops]
            uv0 = loops[0][md.uv].uv
            uv1 = loops[1][md.uv].uv
            uv2 = loops[2][md.uv].uv
            d0 = v1 - v0; d1 = v2 - v0; d2 = loc - v0
            dot00 = d0.dot(d0); dot01 = d0.dot(d1); dot02 = d0.dot(d2)
            dot11 = d1.dot(d1); dot12 = d1.dot(d2)
            inv = dot00 * dot11 - dot01 * dot01
            if abs(inv) < 1e-12:
                return mi.get('color', (180,180,180))
            inv = 1.0 / inv
            u_b = (dot11 * dot02 - dot01 * dot12) * inv
            v_b = (dot00 * dot12 - dot01 * dot02) * inv
            w_b = 1.0 - u_b - v_b
            uv_x = w_b * uv0.x + u_b * uv1.x + v_b * uv2.x
            uv_y = w_b * uv0.y + u_b * uv1.y + v_b * uv2.y
            px_x = int(uv_x * tc['w']) % tc['w']
            px_y = int(uv_y * tc['h']) % tc['h']
            pidx = (px_y * tc['w'] + px_x) * 4
            r = int(tc['px'][pidx] * 255)
            g = int(tc['px'][pidx+1] * 255)
            b = int(tc['px'][pidx+2] * 255)
            return (r, g, b)
    if mi:
        return mi.get('color', (180,180,180))
    return (180, 180, 180)

# Voxelize
print("  Voxelizing body...")
body_voxels = {}
thr = voxel_size * 1.2
for vz in range(gz):
    if vz % 20 == 0:
        print(f"    z={vz}/{gz} hits={len(body_voxels)}")
    for vx in range(gx):
        for vy in range(gy):
            dp = Vector((
                def_min.x + (vx + 0.5) * voxel_size,
                def_min.y + (vy + 0.5) * voxel_size,
                def_min.z + (vz + 0.5) * voxel_size,
            ))
            op = inv_deform(dp)
            best_dist = thr
            best_color = None
            for md in all_mesh_data:
                loc, norm, fi, dist = md.bvh.find_nearest(op)
                if loc is not None and dist < best_dist:
                    best_dist = dist
                    best_color = get_color_at(md, fi, loc)
            if best_color:
                body_voxels[(vx, vy, vz)] = best_color

print(f"  Body: {len(body_voxels)} voxels")

# Build palette
colors = list(set(body_voxels.values()))
if len(colors) > 255:
    from collections import Counter
    freq = Counter(body_voxels.values())
    colors = [c for c, _ in freq.most_common(255)]
color_idx = {c: i+1 for i, c in enumerate(colors)}
vlist = []
for pos, col in body_voxels.items():
    ci = color_idx.get(col, 1)
    vlist.append((pos[0], pos[1], pos[2], ci))

# Write .vox
def write_vox(path, sx, sy, sz, voxels, palette_colors):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    size_data = struct.pack('<III', sx, sy, sz)
    xyzi_data = struct.pack('<I', len(voxels))
    for v in voxels:
        xyzi_data += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
    rgba_data = b''
    for i in range(256):
        if i < len(palette_colors):
            c = palette_colors[i]
            rgba_data += struct.pack('<BBBB', c[0], c[1], c[2], 255)
        else:
            rgba_data += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', size_data) + chunk('XYZI', xyzi_data) + chunk('RGBA', rgba_data)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
write_vox(OUT_PATH, gx, gy, gz, vlist, colors)
print(f"  -> {OUT_PATH}: {gx}x{gy}x{gz}, {len(vlist)} voxels, {len(colors)} colors")

# Save grid info
import json
grid_info = {
    'gx': gx, 'gy': gy, 'gz': gz,
    'voxel_size': voxel_size,
    'def_min': [def_min.x, def_min.y, def_min.z],
    'def_max': [def_max.x, def_max.y, def_max.z],
    'raw_min': [min_co.x, min_co.y, min_co.z],
    'raw_max': [max_co.x, max_co.y, max_co.z],
    'raw_center': [center.x, center.y, center.z],
    'model_h': model_h,
}
grid_path = OUT_PATH.replace('.vox', '_grid.json')
with open(grid_path, 'w') as f:
    json.dump(grid_info, f, indent=2)
print(f"  -> {grid_path}")

# Cleanup
for md in all_mesh_data:
    md.bm.free()

print("\n=== Done ===")
