"""Voxelize a single CLOTHING part using the BODY's grid parameters.
Ensures clothing aligns perfectly with the body voxels.

Usage:
  blender --background --python voxelize_clothing.py -- <input.blend> <body_grid.json> <part_name> <output.vox> [body.vox]

Args:
  input.blend    : Model file
  body_grid.json : Grid JSON from voxelize_body_only.py (defines grid origin, voxel size, dimensions)
  part_name      : Exact Blender object name (e.g. "PillarWoman Clothes - Bra")
  output.vox     : Output path
  body.vox       : (optional) Body vox file - if provided, clothing voxels inside body are pushed outward
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
NO_DEFORM = '--no-deform' in argv
pos_args = [a for a in args if not a.startswith('--')]
INPUT_PATH = pos_args[0]
GRID_JSON = pos_args[1]
PART_NAME = pos_args[2]
OUT_PATH = pos_args[3]
BODY_VOX = pos_args[4] if len(pos_args) > 4 else None
print(f"  NO_DEFORM: {NO_DEFORM}")

# Load grid parameters from body voxelization
with open(GRID_JSON, 'r') as f:
    grid_info = json.load(f)

gx = grid_info['gx']
gy = grid_info['gy']
gz = grid_info['gz']
voxel_size = grid_info['voxel_size']
grid_origin = Vector(grid_info['grid_origin'])
raw_center = Vector(grid_info['raw_center'])
model_h = grid_info['model_h']
raw_min_z = grid_info['raw_min'][2]

print(f"\n=== Clothing Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Part: {PART_NAME}")
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.4f}")
print(f"  Body center: ({raw_center.x:.4f}, {raw_center.y:.4f}, {raw_center.z:.4f})")
print(f"  Body height: {model_h:.4f}")

# Load file
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

bpy.context.view_layer.update()

# Find the target part
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
part_obj = None
for o in mesh_objects:
    if o.name == PART_NAME:
        part_obj = o
        break

if not part_obj:
    print(f"ERROR: Part '{PART_NAME}' not found. Available meshes:")
    for o in mesh_objects:
        print(f"  - {o.name}")
    sys.exit(1)

print(f"  Found: {part_obj.name} ({len(part_obj.data.vertices)} verts)")

# Use body center/height for chibi deformation (same as body voxelization)
center = raw_center
min_co_z = raw_min_z

# Chibi deformation (identical to voxelize_body_only.py, skipped when --no-deform)
def deform_point(co):
    if NO_DEFORM:
        return co.copy()
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co_z) / model_h)) if model_h > 0 else 0.5
    if t > 0.90:
        ht = (t - 0.90) / 0.10
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        z = z + ht * model_h * 0.06
    elif t > 0.85:
        nt = (t - 0.85) / 0.05
        smooth = nt * nt * (3 - 2 * nt)
        s = 1.1 + (1.5 - 1.1) * smooth
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
    elif t > 0.50:
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
    else:
        leg_t = t / 0.50
        f = 0.70 * leg_t + 0.30 * leg_t * leg_t
        z = min_co_z + f * 0.50 * model_h
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x += sign * spread
    return Vector((x, y, z))

def inv_deform(co):
    if NO_DEFORM:
        return co.copy()
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co_z) / model_h)) if model_h > 0 else 0.5
    if t > 0.90:
        ht = min(1, (t - 0.90) / 0.10)
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) / s
        y = center.y + (y - center.y) / s
        z = z - ht * model_h * 0.06
    elif t > 0.85:
        nt = (t - 0.85) / 0.05
        smooth = nt * nt * (3 - 2 * nt)
        s = 1.1 + (1.5 - 1.1) * smooth
        x = center.x + (x - center.x) / s
        y = center.y + (y - center.y) / s
    elif t > 0.50:
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    else:
        u = (z - min_co_z) / (0.50 * model_h) if model_h > 0 else 0
        u = max(0, min(1, u))
        disc = 0.49 + 1.20 * u
        r = (-0.70 + math.sqrt(disc)) / 0.60 if disc >= 0 else 0
        r = max(0, min(1, r))
        leg_t = r
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x -= sign * spread
        z = min_co_z + r * 0.50 * model_h
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    return Vector((x, y, z))

# Texture helpers
import numpy as np

texture_cache = {}
def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    texture_cache[image.name] = {'w': w, 'h': h, 'px': pixels}
    print(f"  Cached texture: {image.name} ({w}x{h})")

def sample_texture(tex_name, uv_x, uv_y):
    tc = texture_cache.get(tex_name)
    if not tc:
        return (0.7, 0.5, 0.4)
    px_x = int(uv_x * tc['w']) % tc['w']
    px_y = int(uv_y * tc['h']) % tc['h']
    pixel = tc['px'][px_y, px_x]
    return (float(pixel[0]), float(pixel[1]), float(pixel[2]))

# Node tree evaluator (from voxelize_body_only.py)
def find_input_link(node_tree, node, socket_name):
    for link in node_tree.links:
        if link.to_node == node and link.to_socket.name == socket_name:
            return link
    return None

def trace_input(node_tree, node, socket_name):
    inp = node.inputs.get(socket_name)
    if inp is None:
        return ('value', 0.0)
    link = find_input_link(node_tree, node, socket_name)
    if link is None:
        val = inp.default_value
        if hasattr(val, '__len__') and len(val) >= 3:
            return ('color', (float(val[0]), float(val[1]), float(val[2])))
        return ('value', float(val))
    return trace_output(node_tree, link.from_node, link.from_socket)

_group_input_map = {}  # temporary: group_tree_name → { output_index → eval_tree }

def trace_output(node_tree, node, output_socket):
    if node.type == 'GROUP_INPUT':
        # Map back to the outer group node's input
        gt_name = node_tree.name if hasattr(node_tree, 'name') else ''
        inp_map = _group_input_map.get(gt_name, {})
        out_idx = 0
        for i, os in enumerate(node.outputs):
            if os == output_socket:
                out_idx = i
                break
        if out_idx in inp_map:
            return inp_map[out_idx]
        return ('color', (0.7, 0.5, 0.4))
    elif node.type == 'TEX_IMAGE' and node.image:
        cache_texture(node.image)
        return ('texture', node.image.name)
    elif node.type == 'MIX':
        bt = node.blend_type if hasattr(node, 'blend_type') else 'MIX'
        fac = trace_input(node_tree, node, 'Factor')
        a = trace_input(node_tree, node, 'A')
        b = trace_input(node_tree, node, 'B')
        if fac[0] == 'value' and fac[1] <= 0.001: return a
        if fac[0] == 'value' and fac[1] >= 0.999 and bt == 'MIX': return b
        # Skip AO: if MULTIPLY and one input is an AO texture, return the other
        if bt == 'MULTIPLY':
            def is_ao(t): return t[0] == 'texture' and 'ao' in t[1].lower()
            if is_ao(b): return a
            if is_ao(a): return b
        return ('mix', bt, fac, a, b)
    elif node.type == 'MIX_RGB':
        bt = node.blend_type if hasattr(node, 'blend_type') else 'MIX'
        fac = trace_input(node_tree, node, 'Fac')
        a = trace_input(node_tree, node, 'Color1')
        b = trace_input(node_tree, node, 'Color2')
        if fac[0] == 'value' and fac[1] <= 0.001: return a
        if fac[0] == 'value' and fac[1] >= 0.999 and bt == 'MIX': return b
        return ('mix', bt, fac, a, b)
    elif node.type == 'VALUE':
        return ('value', float(node.outputs[0].default_value))
    elif node.type == 'CURVE_RGB':
        return trace_input(node_tree, node, 'Color')
    elif node.type == 'MATH':
        return trace_input(node_tree, node, 'Value')
    elif node.type == 'RGB':
        c = node.outputs[0].default_value
        return ('color', (float(c[0]), float(c[1]), float(c[2])))
    elif node.type == 'GROUP' and node.node_tree:
        # Build input map: trace each linked input on the outer group node
        gt_name = node.node_tree.name if hasattr(node.node_tree, 'name') else ''
        inp_map = {}
        for i, inp in enumerate(node.inputs):
            if inp.is_linked:
                src_link = inp.links[0]
                inp_map[i] = trace_output(node_tree, src_link.from_node, src_link.from_socket)
        _group_input_map[gt_name] = inp_map
        # Find which output socket index we're coming from
        out_idx = 0
        for i, os in enumerate(node.outputs):
            if os == output_socket:
                out_idx = i
                break
        # Find the Group Output node inside the group tree
        for gn in node.node_tree.nodes:
            if gn.type == 'GROUP_OUTPUT':
                if out_idx < len(gn.inputs) and gn.inputs[out_idx].is_linked:
                    glink = gn.inputs[out_idx].links[0]
                    return trace_output(node.node_tree, glink.from_node, glink.from_socket)
        # Fallback: check if any input to the group is a texture
        for inp in node.inputs:
            if inp.is_linked:
                src = inp.links[0].from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    cache_texture(src.image)
                    return ('texture', src.image.name)
        return ('color', (0.7, 0.5, 0.4))
    else:
        return ('color', (0.7, 0.5, 0.4))

def eval_tree(tree, uv_x, uv_y):
    kind = tree[0]
    if kind == 'texture':
        return sample_texture(tree[1], uv_x, uv_y)
    elif kind == 'color':
        return tree[1]
    elif kind == 'value':
        v = tree[1]
        return (v, v, v)
    elif kind == 'mix':
        _, blend_type, fac_tree, a_tree, b_tree = tree
        fac_val = eval_tree(fac_tree, uv_x, uv_y)
        fac = fac_val[0] if isinstance(fac_val, tuple) else fac_val
        fac = max(0.0, min(1.0, fac))
        a = eval_tree(a_tree, uv_x, uv_y)
        b = eval_tree(b_tree, uv_x, uv_y)
        if blend_type == 'MULTIPLY':
            return (a[0]*(1-fac)+a[0]*b[0]*fac, a[1]*(1-fac)+a[1]*b[1]*fac, a[2]*(1-fac)+a[2]*b[2]*fac)
        else:
            return (a[0]*(1-fac)+b[0]*fac, a[1]*(1-fac)+b[1]*fac, a[2]*(1-fac)+b[2]*fac)
    return (0.7, 0.5, 0.4)

# Build material info
mat_info = {}
for mat in part_obj.data.materials:
    if mat is None or mat.name in mat_info:
        continue
    info = {'eval_tree': None, 'color': (180, 180, 180)}
    if mat.use_nodes:
        for nd in mat.node_tree.nodes:
            if nd.type == 'BSDF_PRINCIPLED':
                bc_inp = nd.inputs.get('Base Color')
                if bc_inp:
                    if bc_inp.is_linked:
                        info['eval_tree'] = trace_input(mat.node_tree, nd, 'Base Color')
                        print(f"  Material '{mat.name}': has eval_tree")
                    else:
                        c = bc_inp.default_value
                        info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                        print(f"  Material '{mat.name}': color {info['color']}")
                break
    mat_info[mat.name] = info

# Build BVH
dg = bpy.context.evaluated_depsgraph_get()
eo = part_obj.evaluated_get(dg)
me_eval = eo.to_mesh()
bm_local = bmesh.new()
bm_local.from_mesh(me_eval)
bmesh.ops.transform(bm_local, matrix=part_obj.matrix_world, verts=bm_local.verts)
bmesh.ops.triangulate(bm_local, faces=bm_local.faces)
bm_local.verts.ensure_lookup_table()
bm_local.faces.ensure_lookup_table()
uv_layer = bm_local.loops.layers.uv.active

verts_list = [v.co.copy() for v in bm_local.verts]
faces_list = [[v.index for v in f.verts] for f in bm_local.faces]
bvh = BVHTree.FromPolygons(verts_list, faces_list)

def get_uv_at(face_idx, loc):
    face = bm_local.faces[face_idx]
    if not uv_layer:
        return None
    loops = face.loops
    v0, v1, v2 = [l.vert.co for l in loops]
    uv0 = loops[0][uv_layer].uv
    uv1 = loops[1][uv_layer].uv
    uv2 = loops[2][uv_layer].uv
    d0 = v1 - v0; d1 = v2 - v0; d2 = loc - v0
    dot00 = d0.dot(d0); dot01 = d0.dot(d1); dot02 = d0.dot(d2)
    dot11 = d1.dot(d1); dot12 = d1.dot(d2)
    denom = dot00 * dot11 - dot01 * dot01
    if abs(denom) < 1e-12:
        return None
    inv = 1.0 / denom
    u_b = (dot11 * dot02 - dot01 * dot12) * inv
    v_b = (dot00 * dot12 - dot01 * dot02) * inv
    w_b = 1.0 - u_b - v_b
    return (w_b * uv0.x + u_b * uv1.x + v_b * uv2.x,
            w_b * uv0.y + u_b * uv1.y + v_b * uv2.y)

def get_color(face_idx, loc):
    face = bm_local.faces[face_idx]
    mat_slot = face.material_index
    mats = part_obj.data.materials
    mat_name = mats[mat_slot].name if mat_slot < len(mats) and mats[mat_slot] else None
    mi = mat_info.get(mat_name)
    if mi and mi.get('eval_tree'):
        uv = get_uv_at(face_idx, loc)
        if uv:
            rgb = eval_tree(mi['eval_tree'], uv[0], uv[1])
            return (max(0, min(255, int(rgb[0]*255))),
                    max(0, min(255, int(rgb[1]*255))),
                    max(0, min(255, int(rgb[2]*255))))
    return mi.get('color', (180, 180, 180)) if mi else (180, 180, 180)

# Compute threshold (same logic as body)
base_voxel = max(grid_info['def_max'][0]-grid_info['def_min'][0],
                 grid_info['def_max'][1]-grid_info['def_min'][1],
                 grid_info['def_max'][2]-grid_info['def_min'][2]) / 100
thr = max(voxel_size * 1.2, base_voxel * 1.2)
print(f"  Threshold: {thr:.4f}")

# Voxelize clothing using body's grid
print(f"  Voxelizing {PART_NAME}...")
cloth_voxels = {}
for vz in range(gz):
    if vz % 20 == 0:
        print(f"    z={vz}/{gz} hits={len(cloth_voxels)}")
    for vx in range(gx):
        for vy in range(gy):
            dp = Vector((
                grid_origin.x + (vx + 0.5) * voxel_size,
                grid_origin.y + (vy + 0.5) * voxel_size,
                grid_origin.z + (vz + 0.5) * voxel_size,
            ))
            op = inv_deform(dp)
            loc, norm, fi, dist = bvh.find_nearest(op)
            if loc is not None and dist < thr:
                cloth_voxels[(vx, vy, vz)] = get_color(fi, loc)

print(f"  Total: {len(cloth_voxels)} voxels")

if not cloth_voxels:
    print("ERROR: No voxels generated")
    sys.exit(1)

# Note: body overlap is handled by viewer's zOffset=-2 (clothing renders on top)
# No push-outward needed - keeps clothing at original thickness

# Quantize colors
def quantize_color(c, step=4):
    return (min(255, (c[0]//step)*step + step//2),
            min(255, (c[1]//step)*step + step//2),
            min(255, (c[2]//step)*step + step//2))

step = 4
quantized = {pos: quantize_color(col, step) for pos, col in cloth_voxels.items()}
unique_q = set(quantized.values())
while len(unique_q) > 255:
    step *= 2
    quantized = {pos: quantize_color(col, step) for pos, col in cloth_voxels.items()}
    unique_q = set(quantized.values())

colors = list(unique_q)
color_idx = {c: i+1 for i, c in enumerate(colors)}
vlist = [(pos[0], pos[1], pos[2], color_idx[col]) for pos, col in quantized.items()]

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

# Cleanup
bm_local.free()
eo.to_mesh_clear()
print("\n=== Done ===")
