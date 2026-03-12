"""Voxelize all parts of a 3D model individually at original proportions.

Creates a shared grid from the full model bounding box, then voxelizes
each mesh object separately using that grid for perfect alignment.
Also generates a parts manifest JSON for the viewer.

Usage:
  blender --background --python voxelize_all_parts.py -- <input> <output_dir> [options]

Options:
  --resolution N      Max voxel count along longest axis (default: 250)
  --body KEYWORD      Keywords identifying body meshes (repeatable, default: "body")
  --symmetrize        Enable left-right symmetry for body parts only
  --group NAME:KW,KW  Group meshes by keyword into a single part (repeatable)
                      e.g. --group "hair:hair,bangs" --group "boots:boot_l,boot_r"

Examples:
  blender --background --python voxelize_all_parts.py -- model.blend ./output --resolution 250 --symmetrize
  blender --background --python voxelize_all_parts.py -- model.blend ./output --body body --group "hair:hair,bangs,ponytail"
"""
import bpy
import bmesh
import sys
import os
import struct
import json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ========================================================================
# Argument parsing
# ========================================================================
argv = sys.argv
sep = argv.index("--") if "--" in argv else len(argv)
script_args = argv[sep + 1:]

def get_arg(name, default=None):
    flag = f'--{name}'
    if flag in script_args:
        idx = script_args.index(flag)
        if idx + 1 < len(script_args):
            return script_args[idx + 1]
    return default

def get_arg_list(name):
    flag = f'--{name}'
    values = []
    for i, a in enumerate(script_args):
        if a == flag and i + 1 < len(script_args):
            values.append(script_args[i + 1])
    return values

positional = []
skip_next = False
for i, a in enumerate(script_args):
    if skip_next:
        skip_next = False
        continue
    if a.startswith('--'):
        skip_next = True
        continue
    positional.append(a)

INPUT_PATH = positional[0]
OUT_DIR = positional[1]
RESOLUTION = int(get_arg('resolution', '250'))
BODY_KEYWORDS = [kw.lower() for kw in get_arg_list('body')] or ['body']
SYMMETRIZE = '--symmetrize' in script_args

# Parse group definitions
GROUP_DEFS = {}  # group_name -> [keywords]
for g in get_arg_list('group'):
    name, kws = g.split(':', 1)
    GROUP_DEFS[name.strip()] = [k.strip().lower() for k in kws.split(',')]

os.makedirs(OUT_DIR, exist_ok=True)

print(f"\n{'='*60}")
print(f"  Realistic All-Parts Voxelizer")
print(f"{'='*60}")
print(f"  Input:      {INPUT_PATH}")
print(f"  Output dir: {OUT_DIR}")
print(f"  Resolution: {RESOLUTION}")
print(f"  Body KWs:   {BODY_KEYWORDS}")
if SYMMETRIZE:
    print(f"  Symmetrize: body parts only")
if GROUP_DEFS:
    print(f"  Groups:     {GROUP_DEFS}")

# ========================================================================
# Load file
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

# Disable MASK modifiers, remove surface deform
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    for mod in obj.modifiers:
        if mod.type == 'MASK' and mod.show_viewport:
            mod.show_viewport = False
    for mod in list(obj.modifiers):
        if mod.type == 'SURFACE_DEFORM':
            obj.modifiers.remove(mod)

bpy.context.view_layer.update()

# ========================================================================
# Classify meshes into parts
# ========================================================================
all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
print(f"\n  Visible meshes ({len(all_meshes)}):")
for o in all_meshes:
    print(f"    - {o.name} (verts={len(o.data.vertices)})")

# Classify each mesh
# Priority: group > body > individual part
def classify_mesh(obj_name):
    name_lower = obj_name.lower()
    # Check groups first
    for group_name, keywords in GROUP_DEFS.items():
        if any(kw in name_lower for kw in keywords):
            return ('group', group_name)
    # Check body
    if any(kw in name_lower for kw in BODY_KEYWORDS):
        return ('body', 'body')
    # Individual part
    return ('part', obj_name)

# Build part map: part_key -> [mesh_objects]
part_map = {}  # key -> list of mesh objects
for obj in all_meshes:
    kind, key = classify_mesh(obj.name)
    safe_key = key.replace(' ', '_').replace('.', '_').lower()
    if safe_key not in part_map:
        part_map[safe_key] = []
    part_map[safe_key].append(obj)

print(f"\n  Parts ({len(part_map)}):")
for key, objs in part_map.items():
    print(f"    {key}: {[o.name for o in objs]}")

# ========================================================================
# Compute unified bounding box (from ALL meshes)
# ========================================================================
bb_min = Vector((1e9, 1e9, 1e9))
bb_max = Vector((-1e9, -1e9, -1e9))

for obj in all_meshes:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            bb_min[i] = min(bb_min[i], v.co[i])
            bb_max[i] = max(bb_max[i], v.co[i])
    eo.to_mesh_clear()

size = bb_max - bb_min
print(f"\n  Full BBox: {size.x:.4f} x {size.y:.4f} x {size.z:.4f}")

voxel_size = max(size) / RESOLUTION
margin = 2
grid_origin = bb_min - Vector((voxel_size * margin,) * 3)
gx = min(256, int(size.x / voxel_size) + margin * 2 + 2)
gy = min(256, int(size.y / voxel_size) + margin * 2 + 2)
gz = min(256, int(size.z / voxel_size) + margin * 2 + 2)
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.6f}")

# Save grid JSON
grid_data = {
    'grid_origin': list(grid_origin),
    'voxel_size': voxel_size,
    'gx': gx, 'gy': gy, 'gz': gz,
    'bb_min': list(bb_min),
    'bb_max': list(bb_max),
    'resolution': RESOLUTION,
}
grid_path = os.path.join(OUT_DIR, 'grid.json')
with open(grid_path, 'w') as f:
    json.dump(grid_data, f, indent=2)
print(f"  Grid saved: {grid_path}")

thr = voxel_size * 1.2

# ========================================================================
# Texture sampling & node tree evaluation (same as voxelize.py)
# ========================================================================
texture_cache = {}

def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    texture_cache[image.name] = {'w': w, 'h': h, 'px': pixels}
    print(f"    Cached texture: {image.name} ({w}x{h})")

def sample_texture(tex_name, uv_x, uv_y):
    tc = texture_cache.get(tex_name)
    if not tc:
        return (0.7, 0.5, 0.4)
    px_x = int(uv_x * tc['w']) % tc['w']
    px_y = int(uv_y * tc['h']) % tc['h']
    p = tc['px'][px_y, px_x]
    return (float(p[0]), float(p[1]), float(p[2]))

_group_input_map = {}

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

def trace_output(node_tree, node, output_socket):
    if node.type == 'GROUP_INPUT':
        gt_name = node_tree.name if hasattr(node_tree, 'name') else ''
        inp_map = _group_input_map.get(gt_name, {})
        out_idx = 0
        for i, os_item in enumerate(node.outputs):
            if os_item == output_socket:
                out_idx = i
                break
        if out_idx in inp_map:
            return inp_map[out_idx]
        return ('color', (0.7, 0.5, 0.4))

    elif node.type == 'TEX_IMAGE' and node.image:
        cache_texture(node.image)
        return ('texture', node.image.name)

    elif node.type in ('MIX', 'MIX_RGB'):
        bt = getattr(node, 'blend_type', 'MIX')
        if node.type == 'MIX':
            fac = trace_input(node_tree, node, 'Factor')
            a = trace_input(node_tree, node, 'A')
            b = trace_input(node_tree, node, 'B')
        else:
            fac = trace_input(node_tree, node, 'Fac')
            a = trace_input(node_tree, node, 'Color1')
            b = trace_input(node_tree, node, 'Color2')
        if fac[0] == 'value' and fac[1] <= 0.001:
            return a
        if fac[0] == 'value' and fac[1] >= 0.999 and bt == 'MIX':
            return b
        if bt == 'MULTIPLY':
            def is_ao(t):
                return t[0] == 'texture' and 'ao' in t[1].lower()
            if is_ao(b):
                return a
            if is_ao(a):
                return b
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
        gt_name = node.node_tree.name if hasattr(node.node_tree, 'name') else ''
        inp_map = {}
        for i, inp in enumerate(node.inputs):
            if inp.is_linked:
                src_link = inp.links[0]
                inp_map[i] = trace_output(node_tree, src_link.from_node, src_link.from_socket)
        _group_input_map[gt_name] = inp_map

        out_idx = 0
        for i, os_item in enumerate(node.outputs):
            if os_item == output_socket:
                out_idx = i
                break
        for gn in node.node_tree.nodes:
            if gn.type == 'GROUP_OUTPUT':
                if out_idx < len(gn.inputs) and gn.inputs[out_idx].is_linked:
                    glink = gn.inputs[out_idx].links[0]
                    return trace_output(node.node_tree, glink.from_node, glink.from_socket)
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

# ========================================================================
# Build material info for ALL meshes
# ========================================================================
mat_info = {}
for obj in all_meshes:
    for mat in obj.data.materials:
        if mat is None or mat.name in mat_info:
            continue
        info = {'eval_tree': None, 'color': (180, 180, 180)}
        if mat.use_nodes:
            for nd in mat.node_tree.nodes:
                if nd.type == 'BSDF_PRINCIPLED':
                    bc = nd.inputs.get('Base Color')
                    if bc:
                        if bc.is_linked:
                            info['eval_tree'] = trace_input(mat.node_tree, nd, 'Base Color')
                            print(f"    Material '{mat.name}': traced")
                        else:
                            c = bc.default_value
                            info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                            print(f"    Material '{mat.name}': color {info['color']}")
                    break
        mat_info[mat.name] = info

# ========================================================================
# Helper: build BVH + UV for a set of mesh objects
# ========================================================================
class MeshInfo:
    pass

def build_mesh_infos(objs):
    mesh_list = []
    for obj in objs:
        dg = bpy.context.evaluated_depsgraph_get()
        eo = obj.evaluated_get(dg)
        me_eval = eo.to_mesh()

        bm = bmesh.new()
        bm.from_mesh(me_eval)
        bmesh.ops.transform(bm, matrix=obj.matrix_world, verts=bm.verts)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()

        uv_layer = bm.loops.layers.uv.active
        verts = [v.co.copy() for v in bm.verts]
        faces = [[v.index for v in f.verts] for f in bm.faces]
        bvh = BVHTree.FromPolygons(verts, faces)

        mi = MeshInfo()
        mi.bm = bm
        mi.bvh = bvh
        mi.uv = uv_layer
        mi.obj = obj
        mesh_list.append(mi)
        eo.to_mesh_clear()
    return mesh_list

def get_uv_at(mi, face_idx, loc):
    face = mi.bm.faces[face_idx]
    if not mi.uv:
        return None
    loops = face.loops
    v0, v1, v2 = [l.vert.co for l in loops]
    uv0 = loops[0][mi.uv].uv
    uv1 = loops[1][mi.uv].uv
    uv2 = loops[2][mi.uv].uv
    d0 = v1 - v0; d1 = v2 - v0; d2 = loc - v0
    dot00 = d0.dot(d0); dot01 = d0.dot(d1); dot02 = d0.dot(d2)
    dot11 = d1.dot(d1); dot12 = d1.dot(d2)
    denom = dot00 * dot11 - dot01 * dot01
    if abs(denom) < 1e-12:
        return None
    inv = 1.0 / denom
    u = (dot11 * dot02 - dot01 * dot12) * inv
    v = (dot00 * dot12 - dot01 * dot02) * inv
    w = 1.0 - u - v
    return (w * uv0.x + u * uv1.x + v * uv2.x,
            w * uv0.y + u * uv1.y + v * uv2.y)

def get_color(mi, face_idx, loc):
    face = mi.bm.faces[face_idx]
    mat_slot = face.material_index
    mats = mi.obj.data.materials
    mat_name = mats[mat_slot].name if mat_slot < len(mats) and mats[mat_slot] else None
    info = mat_info.get(mat_name)
    color = info.get('color', (180, 180, 180)) if info else (180, 180, 180)
    if info and info.get('eval_tree'):
        uv = get_uv_at(mi, face_idx, loc)
        if uv:
            rgb = eval_tree(info['eval_tree'], uv[0], uv[1])
            color = (max(0, min(255, int(rgb[0]*255))),
                     max(0, min(255, int(rgb[1]*255))),
                     max(0, min(255, int(rgb[2]*255))))
    return color, mat_name

# Eye-related material keywords (separated from body)
EYE_MAT_KEYWORDS = ['eye', 'cornea', 'eyelash']

def is_eye_material(mat_name):
    if not mat_name:
        return False
    name_lower = mat_name.lower()
    return any(kw in name_lower for kw in EYE_MAT_KEYWORDS)

# ========================================================================
# Voxelize a single part
# ========================================================================
def voxelize_part(mesh_list, split_eyes=False):
    """Voxelize meshes. If split_eyes=True, returns (body_voxels, eye_voxels)."""
    voxels = {}
    eye_voxels = {} if split_eyes else None
    for vz in range(gz):
        if vz % 30 == 0:
            total = len(voxels) + (len(eye_voxels) if eye_voxels else 0)
            print(f"      z={vz}/{gz} hits={total}")
        for vx in range(gx):
            for vy in range(gy):
                world_pos = Vector((
                    grid_origin.x + (vx + 0.5) * voxel_size,
                    grid_origin.y + (vy + 0.5) * voxel_size,
                    grid_origin.z + (vz + 0.5) * voxel_size,
                ))
                best_dist = thr
                best_color = None
                best_mat = None
                for mi in mesh_list:
                    loc, norm, fi, dist = mi.bvh.find_nearest(world_pos)
                    if loc is not None and dist < best_dist:
                        best_dist = dist
                        best_color, best_mat = get_color(mi, fi, loc)
                if best_color:
                    if split_eyes and is_eye_material(best_mat):
                        eye_voxels[(vx, vy, vz)] = best_color
                    else:
                        voxels[(vx, vy, vz)] = best_color
    if split_eyes:
        return voxels, eye_voxels
    return voxels

# ========================================================================
# Left-right symmetry (X axis mirror, body only)
# ========================================================================
def symmetrize_voxels(voxels):
    """Symmetrize colors only — never add or remove voxels.
    For each existing left-right voxel pair, copy the reference side's
    color to the opposite side. Unpaired voxels keep their color as-is."""
    center_x = gx / 2.0

    # Count voxels on each side to determine reference
    left_count = 0
    right_count = 0
    for (vx, vy, vz) in voxels:
        if vx < center_x:
            left_count += 1
        else:
            right_count += 1

    use_left = left_count >= right_count
    print(f"    Symmetry ref: {'left' if use_left else 'right'} (L={left_count}, R={right_count})")

    result = dict(voxels)
    synced = 0

    for (vx, vy, vz), col in voxels.items():
        # Only process voxels on the reference side
        is_ref_side = (vx < center_x) if use_left else (vx >= center_x)
        if not is_ref_side:
            continue
        mirror_x = int(round(2 * center_x - vx - 1))
        if mirror_x < 0 or mirror_x >= gx:
            continue
        mirror_key = (mirror_x, vy, vz)
        # Only sync color if the mirror position already has a voxel
        if mirror_key in result:
            result[mirror_key] = col
            synced += 1

    print(f"    Color-synced: {synced} voxel pairs (shape unchanged)")
    return result

# ========================================================================
# Color quantization + VOX writer
# ========================================================================
def quantize_colors(voxels):
    def quantize(c, step=4):
        return (min(255, (c[0]//step)*step + step//2),
                min(255, (c[1]//step)*step + step//2),
                min(255, (c[2]//step)*step + step//2))
    step = 4
    quantized = {pos: quantize(col, step) for pos, col in voxels.items()}
    unique = set(quantized.values())
    while len(unique) > 255:
        step *= 2
        quantized = {pos: quantize(col, step) for pos, col in voxels.items()}
        unique = set(quantized.values())
    colors = list(unique)
    color_idx = {c: i + 1 for i, c in enumerate(colors)}
    voxel_list = [(p[0], p[1], p[2], color_idx[col]) for p, col in quantized.items()]
    return voxel_list, colors

def write_vox(path, sx, sy, sz, voxels_data, palette):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data

    size_data = struct.pack('<III', sx, sy, sz)
    xyzi_data = struct.pack('<I', len(voxels_data))
    for v in voxels_data:
        xyzi_data += struct.pack('<BBBB', v[0], v[1], v[2], v[3])

    rgba_data = b''
    for i in range(256):
        if i < len(palette):
            c = palette[i]
            rgba_data += struct.pack('<BBBB', c[0], c[1], c[2], 255)
        else:
            rgba_data += struct.pack('<BBBB', 0, 0, 0, 255)

    children = chunk('SIZE', size_data) + chunk('XYZI', xyzi_data) + chunk('RGBA', rgba_data)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children

    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# ========================================================================
# Category classification for subdirectory organization
# ========================================================================
CATEGORY_RULES = {
    'body':        ['body', 'eyes'],
    'hair':        ['hair', 'bangs', 'ponytail'],
    'clothing':    ['bra', 'panties', 'jacket', 'leggings', 'garter', 'necktie'],
    'accessories': ['armband', 'hat', 'hip_plate', 'hologram', 'gloves', 'glove'],
}

def get_category(part_key):
    key_lower = part_key.lower()
    for category, keywords in CATEGORY_RULES.items():
        if any(kw in key_lower for kw in keywords):
            return category
    return 'other'

# ========================================================================
# Process each part
# ========================================================================
manifest = []

def save_part(part_key, voxels, mesh_names, is_body, default_on=True):
    """Quantize, write .vox into categorized subdirectory, and add to manifest."""
    if not voxels:
        print(f"    SKIP {part_key}: no voxels")
        return
    category = get_category(part_key)
    sub_dir = os.path.join(OUT_DIR, category)
    os.makedirs(sub_dir, exist_ok=True)

    voxel_list, colors = quantize_colors(voxels)
    out_path = os.path.join(sub_dir, f"{part_key}.vox")
    write_vox(out_path, gx, gy, gz, voxel_list, colors)
    print(f"    -> {category}/{part_key}.vox: {len(voxel_list)} voxels, {len(colors)} colors")
    manifest.append({
        'key': part_key,
        'file': f"/realistic/{category}/{part_key}.vox",
        'voxels': len(voxel_list),
        'default_on': default_on,
        'meshes': mesh_names,
        'is_body': is_body,
        'category': category,
    })

for part_key, objs in sorted(part_map.items()):
    print(f"\n  --- Voxelizing part: {part_key} ({len(objs)} meshes) ---")
    mesh_list = build_mesh_infos(objs)
    is_body = part_key == 'body'

    if is_body:
        # Split eyes from body
        body_voxels, eye_voxels = voxelize_part(mesh_list, split_eyes=True)
        print(f"    Body voxels: {len(body_voxels)}, Eye voxels: {len(eye_voxels)}")

        # Symmetrize body only
        if SYMMETRIZE:
            before = len(body_voxels)
            body_voxels = symmetrize_voxels(body_voxels)
            print(f"    Symmetrized: {before} -> {len(body_voxels)} voxels")

        mesh_names = [o.name for o in objs]
        save_part('body', body_voxels, mesh_names, is_body=True)
        save_part('eyes', eye_voxels, mesh_names, is_body=True, default_on=False)
    else:
        voxels = voxelize_part(mesh_list)
        print(f"    Voxels: {len(voxels)}")
        save_part(part_key, voxels, [o.name for o in objs], is_body=False)

    # Cleanup BVH
    for mi in mesh_list:
        mi.bm.free()

# Write manifest
manifest_path = os.path.join(OUT_DIR, 'parts.json')
with open(manifest_path, 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
print(f"\n  Manifest: {manifest_path}")
print(f"  Total parts: {len(manifest)}")
print(f"\n{'='*60}")
print(f"  Done!")
print(f"{'='*60}")
