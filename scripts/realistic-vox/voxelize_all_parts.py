"""Voxelize all parts of a 3D model individually at original proportions.

Creates a shared grid from the full model bounding box, then voxelizes
each mesh object separately using that grid for perfect alignment.
Also generates a parts manifest JSON for the viewer.

Usage:
  blender --background --python voxelize_all_parts.py -- <input> <output_dir> [options]

Options:
  --resolution N      Max voxel count along longest axis (default: 250)
  --voxel-size F      Fixed voxel size in meters (overrides --resolution).
                      Use this to unify scale across characters (e.g. 0.007108 from CE reference)
  --body KEYWORD      Keywords identifying body meshes (repeatable, default: "body")
  --symmetrize        Enable left-right symmetry for body parts only
  --exclude KEYWORD   Exclude matching parts from BBox calculation (still voxelized)
  --group NAME:KW,KW  Group meshes by keyword into a single part (repeatable)
                      e.g. --group "hair:hair,bangs" --group "boots:boot_l,boot_r"

Examples:
  blender --background --python voxelize_all_parts.py -- model.blend ./output --resolution 250 --symmetrize
  blender --background --python voxelize_all_parts.py -- model.blend ./output --voxel-size 0.007108 --group "hair:hair"
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
FIXED_VOXEL_SIZE = get_arg('voxel-size', None)
if FIXED_VOXEL_SIZE is not None:
    FIXED_VOXEL_SIZE = float(FIXED_VOXEL_SIZE)
BODY_KEYWORDS = [kw.lower() for kw in get_arg_list('body')] or ['body']
SYMMETRIZE = '--symmetrize' in script_args
EXCLUDE_KEYWORDS = [kw.lower() for kw in get_arg_list('exclude')]
SHOW_KEYWORDS = [kw.lower() for kw in get_arg_list('show')]
HIDE_KEYWORDS = [kw.lower() for kw in get_arg_list('hide')]

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
if FIXED_VOXEL_SIZE:
    print(f"  Voxel size: {FIXED_VOXEL_SIZE:.6f} (fixed)")
else:
    print(f"  Resolution: {RESOLUTION}")
print(f"  Body KWs:   {BODY_KEYWORDS}")
if SYMMETRIZE:
    print(f"  Symmetrize: body parts only")
if GROUP_DEFS:
    print(f"  Groups:     {GROUP_DEFS}")
if EXCLUDE_KEYWORDS:
    print(f"  Exclude:    {EXCLUDE_KEYWORDS}")

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

# Apply --show / --hide visibility overrides
if SHOW_KEYWORDS or HIDE_KEYWORDS:
    # Step 1: Enable all layer collections so hidden-by-collection objects become accessible.
    # Without this, objects in excluded collections return visible_get()=False
    # even after hide_set(False).
    def enable_layer_collections(layer_col):
        layer_col.exclude = False
        layer_col.hide_viewport = False
        for child in layer_col.children:
            enable_layer_collections(child)
    enable_layer_collections(bpy.context.view_layer.layer_collection)
    bpy.context.view_layer.update()

    # Also ensure data-level collection visibility
    for col in bpy.data.collections:
        col.hide_viewport = False

    # Step 2: Apply object-level show/hide
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        name_lower = obj.name.lower()
        for kw in SHOW_KEYWORDS:
            if kw in name_lower:
                obj.hide_set(False)
                obj.hide_viewport = False
                print(f"  SHOW: {obj.name}")
        for kw in HIDE_KEYWORDS:
            if kw in name_lower:
                obj.hide_set(True)
                obj.hide_viewport = True
                print(f"  HIDE: {obj.name}")

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

# Apply --exclude filter (exclude from BBox only, still voxelize)
bbox_excluded_keys = set()
if EXCLUDE_KEYWORDS:
    for key in part_map.keys():
        if any(kw in key.lower() for kw in EXCLUDE_KEYWORDS):
            bbox_excluded_keys.add(key)
    if bbox_excluded_keys:
        print(f"\n  BBox-excluded parts ({len(bbox_excluded_keys)}): {list(bbox_excluded_keys)}")

print(f"\n  Parts ({len(part_map)}):")
for key, objs in part_map.items():
    tag = " [bbox-excluded]" if key in bbox_excluded_keys else ""
    print(f"    {key}: {[o.name for o in objs]}{tag}")

# ========================================================================
# Compute unified bounding box
# - voxel_size: from non-excluded parts only (body detail preserved)
# - grid extent: from ALL parts (so excluded parts like weapons fit in grid)
# ========================================================================
remaining_meshes = set()
all_part_meshes = set()
for key, objs in part_map.items():
    for obj in objs:
        all_part_meshes.add(obj)
        if key not in bbox_excluded_keys:
            remaining_meshes.add(obj)

# BBox for voxel_size (body only)
bb_min = Vector((1e9, 1e9, 1e9))
bb_max = Vector((-1e9, -1e9, -1e9))
for obj in remaining_meshes:
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
print(f"\n  Body BBox: {size.x:.4f} x {size.y:.4f} x {size.z:.4f}")
if FIXED_VOXEL_SIZE:
    # .vox format limits to 256 per axis; auto-increase if model doesn't fit
    min_voxel_size = max(size) / (256 - 6)  # minus margin
    if FIXED_VOXEL_SIZE < min_voxel_size:
        voxel_size = min_voxel_size
        print(f"  WARNING: fixed voxel_size {FIXED_VOXEL_SIZE:.6f} too small for this model")
        print(f"  Auto-adjusted to {voxel_size:.6f} (model needs {max(size)/FIXED_VOXEL_SIZE:.0f} voxels)")
    else:
        voxel_size = FIXED_VOXEL_SIZE
    print(f"  Using voxel_size: {voxel_size:.6f}")
else:
    voxel_size = max(size) / RESOLUTION

# Full BBox for grid extent (including excluded parts)
if bbox_excluded_keys:
    full_min = bb_min.copy()
    full_max = bb_max.copy()
    for obj in all_part_meshes:
        if obj in remaining_meshes:
            continue
        dg = bpy.context.evaluated_depsgraph_get()
        eo = obj.evaluated_get(dg)
        me = eo.to_mesh()
        me.transform(obj.matrix_world)
        for v in me.vertices:
            for i in range(3):
                full_min[i] = min(full_min[i], v.co[i])
                full_max[i] = max(full_max[i], v.co[i])
        eo.to_mesh_clear()
    full_size = full_max - full_min
    print(f"  Full BBox: {full_size.x:.4f} x {full_size.y:.4f} x {full_size.z:.4f}")
else:
    full_min = bb_min
    full_max = bb_max
    full_size = size

margin = 2
# Grid origin: use full extent for X/Y (weapons), body extent for Z (height preserved)
grid_origin = Vector((
    full_min.x - voxel_size * margin,
    full_min.y - voxel_size * margin,
    bb_min.z - voxel_size * margin,
))
gx = min(256, int(full_size.x / voxel_size) + margin * 2 + 2)
gy = min(256, int(full_size.y / voxel_size) + margin * 2 + 2)
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

TEX_MAX_SIZE = 1024  # Downsample textures larger than this to save memory

def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    # Downsample large textures to reduce memory usage
    if w > TEX_MAX_SIZE or h > TEX_MAX_SIZE:
        scale = TEX_MAX_SIZE / max(w, h)
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        # Simple nearest-neighbor downsample via index mapping
        ys = np.linspace(0, h - 1, nh).astype(int)
        xs = np.linspace(0, w - 1, nw).astype(int)
        pixels = pixels[np.ix_(ys, xs)]
        print(f"    Cached texture: {image.name} ({w}x{h} -> {nw}x{nh})")
        w, h = nw, nh
    else:
        print(f"    Cached texture: {image.name} ({w}x{h})")
    texture_cache[image.name] = {'w': w, 'h': h, 'px': pixels}

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

def find_color_input(node, socket_name):
    """Find the color/vector version of an input socket (not the float version).
    Blender 4.x MIX nodes have duplicate socket names for float and color inputs."""
    matches = [inp for inp in node.inputs if inp.name == socket_name]
    # Prefer the color/vector input (type RGBA or VECTOR) over float
    for inp in matches:
        if inp.type in ('RGBA', 'VECTOR'):
            return inp
    # Fallback to first match
    return matches[0] if matches else None

def trace_input(node_tree, node, socket_name):
    inp = node.inputs.get(socket_name)
    if inp is None:
        return ('value', 0.0)
    # For MIX nodes, prefer color inputs over float inputs
    if node.type == 'MIX' and socket_name in ('A', 'B', 'Factor'):
        color_inp = find_color_input(node, socket_name)
        if color_inp:
            inp = color_inp
    # Find link specifically to this socket instance
    link = None
    for l in node_tree.links:
        if l.to_node == node and l.to_socket == inp:
            link = l
            break
    if link is None:
        # Fallback: search by name (for older Blender versions)
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
        # Try to evaluate constant math operations
        op = getattr(node, 'operation', '')
        inputs_val = []
        for inp in node.inputs:
            if inp.name == 'Value':
                if inp.is_linked:
                    t = trace_input(node_tree, node, 'Value')
                    if t[0] == 'value':
                        inputs_val.append(t[1])
                    else:
                        return t  # Non-constant, pass through
                else:
                    inputs_val.append(float(inp.default_value))
                if len(inputs_val) >= 2:
                    break
        if len(inputs_val) >= 2:
            a, b = inputs_val[0], inputs_val[1]
            if op == 'GREATER_THAN':
                return ('value', 1.0 if a > b else 0.0)
            elif op == 'LESS_THAN':
                return ('value', 1.0 if a < b else 0.0)
            elif op == 'MULTIPLY':
                return ('value', a * b)
            elif op == 'ADD':
                return ('value', a + b)
            elif op == 'SUBTRACT':
                return ('value', a - b)
        return trace_input(node_tree, node, 'Value')
    elif node.type == 'RGB':
        c = node.outputs[0].default_value
        return ('color', (float(c[0]), float(c[1]), float(c[2])))

    elif node.type == 'GROUP' and node.node_tree:
        gt_name = node.node_tree.name if hasattr(node.node_tree, 'name') else ''

        # Special handling: Skin Selector groups (picks between Default/Inquisitor/Corrupted skins)
        # Always use the "Default" input as the chosen skin.
        if 'skin' in gt_name.lower() and 'selector' in gt_name.lower():
            for inp in node.inputs:
                if inp.name.lower() == 'default' and inp.is_linked:
                    src_link = inp.links[0]
                    result = trace_output(node_tree, src_link.from_node, src_link.from_socket)
                    print(f"      Skin Selector: using Default -> {result[0]}:{result[1] if len(result) > 1 else ''}")
                    return result

        # Special handling: Texture Selector groups (MustardUI pattern)
        # These groups select between multiple texture inputs based on a numeric selector.
        # Instead of tracing the complex internal MIX chain, directly pick the selected texture.
        if 'texture' in gt_name.lower() and 'selector' in gt_name.lower():
            # Find the texture number value
            tex_num = 1  # default to first texture
            for inp in node.inputs:
                if 'number' in inp.name.lower() or 'select' in inp.name.lower():
                    if inp.is_linked:
                        src_node = inp.links[0].from_node
                        if src_node.type == 'VALUE':
                            tex_num = max(1, int(round(float(src_node.outputs[0].default_value))))
                    else:
                        tex_num = max(1, int(round(float(inp.default_value))))
                    break

            # Texture inputs are 0-indexed: "Texture 1" = input[0], "Texture 2" = input[1], etc.
            tex_idx = tex_num - 1
            if tex_idx < len(node.inputs) and node.inputs[tex_idx].is_linked:
                src_link = node.inputs[tex_idx].links[0]
                result = trace_output(node_tree, src_link.from_node, src_link.from_socket)
                print(f"      Texture Selector: picked Texture {tex_num} -> {result[0]}:{result[1] if len(result) > 1 else ''}")
                return result
            # Fallback to first linked texture input
            for inp in node.inputs:
                if inp.is_linked:
                    src = inp.links[0].from_node
                    if src.type == 'TEX_IMAGE' and src.image:
                        cache_texture(src.image)
                        return ('texture', src.image.name)

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
def find_principled_bsdf(node_tree):
    """Find Principled BSDF in node tree, searching inside group nodes if needed."""
    for nd in node_tree.nodes:
        if nd.type == 'BSDF_PRINCIPLED':
            return node_tree, nd
    # Search inside group nodes connected to Material Output
    for nd in node_tree.nodes:
        if nd.type == 'GROUP' and nd.node_tree:
            result = find_principled_bsdf(nd.node_tree)
            if result:
                return result
    return None

def find_group_with_base_color(node_tree):
    """Find a Group node connected to Material Output that has a 'Base Color' input."""
    for nd in node_tree.nodes:
        if nd.type == 'GROUP' and nd.inputs.get('Base Color'):
            return nd
    return None

mat_info = {}
for obj in all_meshes:
    for mat in obj.data.materials:
        if mat is None or mat.name in mat_info:
            continue
        info = {'eval_tree': None, 'color': (180, 180, 180)}
        if mat.use_nodes:
            result = find_principled_bsdf(mat.node_tree)
            if result:
                bsdf_tree, bsdf_node = result
                bc = bsdf_node.inputs.get('Base Color')
                if bc:
                    if bc.is_linked:
                        # Set up group input mapping if BSDF is inside a group
                        if bsdf_tree != mat.node_tree:
                            # Find the group node in the parent tree that uses this subtree
                            for nd in mat.node_tree.nodes:
                                if nd.type == 'GROUP' and nd.node_tree == bsdf_tree:
                                    # Map group inputs: index -> traced value from parent tree
                                    inp_map = {}
                                    for i, inp in enumerate(nd.inputs):
                                        if inp.is_linked:
                                            link = None
                                            for l in mat.node_tree.links:
                                                if l.to_node == nd and l.to_socket == inp:
                                                    link = l
                                                    break
                                            if link:
                                                inp_map[i] = trace_output(mat.node_tree, link.from_node, link.from_socket)
                                        else:
                                            val = inp.default_value
                                            if hasattr(val, '__len__') and len(val) >= 3:
                                                inp_map[i] = ('color', (float(val[0]), float(val[1]), float(val[2])))
                                    _group_input_map[bsdf_tree.name] = inp_map
                                    break
                        info['eval_tree'] = trace_input(bsdf_tree, bsdf_node, 'Base Color')
                        print(f"    Material '{mat.name}': traced")
                    else:
                        c = bc.default_value
                        info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                        print(f"    Material '{mat.name}': color {info['color']}")
            else:
                # Fallback: Group node with 'Base Color' input (no BSDF_PRINCIPLED)
                group_nd = find_group_with_base_color(mat.node_tree)
                if group_nd:
                    bc = group_nd.inputs.get('Base Color')
                    if bc and bc.is_linked:
                        info['eval_tree'] = trace_input(mat.node_tree, group_nd, 'Base Color')
                        print(f"    Material '{mat.name}': traced (via Group 'Base Color')")
                    elif bc:
                        c = bc.default_value
                        info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                        print(f"    Material '{mat.name}': color {info['color']} (via Group)")
                else:
                    print(f"    Material '{mat.name}': WARNING no BSDF or Group with Base Color, using default gray")
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
# 'eyes' (plural) to avoid matching 'eyeshadow'
EYE_MAT_KEYWORDS = ['eyes', 'cornea', 'eyelash']
EYE_MAT_EXCLUDES = ['eyeshadow', 'eyebrow']

def is_eye_material(mat_name):
    if not mat_name:
        return False
    name_lower = mat_name.lower()
    if any(exc in name_lower for exc in EYE_MAT_EXCLUDES):
        return False
    return any(kw in name_lower for kw in EYE_MAT_KEYWORDS)

# Hair-related material keywords (separated from body)
# Body meshes often include hair material faces; split them out
# so body height = skull top, not hair top
HAIR_MAT_KEYWORDS = ['hair']
HAIR_MAT_EXCLUDES = []  # add if needed

def is_hair_material(mat_name):
    if not mat_name:
        return False
    name_lower = mat_name.lower()
    if any(exc in name_lower for exc in HAIR_MAT_EXCLUDES):
        return False
    return any(kw in name_lower for kw in HAIR_MAT_KEYWORDS)

# ========================================================================
# Voxelize a single part
# ========================================================================
def voxelize_part(mesh_list, split_body=False):
    """Voxelize meshes. If split_body=True, returns (body_voxels, eye_voxels, hair_voxels)."""
    voxels = {}
    eye_voxels = {} if split_body else None
    hair_voxels = {} if split_body else None
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
                    if split_body and is_eye_material(best_mat):
                        eye_voxels[(vx, vy, vz)] = best_color
                    elif split_body and is_hair_material(best_mat):
                        hair_voxels[(vx, vy, vz)] = best_color
                    else:
                        voxels[(vx, vy, vz)] = best_color
    if split_body:
        return voxels, eye_voxels, hair_voxels
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
    'clothing':    ['bra', 'panties', 'jacket', 'leggings', 'garter', 'necktie', 'suit'],
    'armor':       ['armor', 'mask', 'cape', 'belt', 'shoulder', 'earring', 'scabbard'],
    'weapons':     ['weapon'],
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
        'file': f"/{os.path.basename(OUT_DIR)}/{category}/{part_key}.vox",
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
        # Split eyes and hair from body
        body_voxels, eye_voxels, hair_voxels = voxelize_part(mesh_list, split_body=True)
        print(f"    Body voxels: {len(body_voxels)}, Eye voxels: {len(eye_voxels)}, Hair voxels: {len(hair_voxels)}")

        # Expand eye region: body voxels adjacent to eye voxels are likely
        # cornea/eyelid geometry that got classified as body by BVH nearest.
        # Flood-fill from eye voxels into nearby body voxels (max N iterations).
        if eye_voxels:
            eye_set = set(eye_voxels.keys())
            EXPAND_ITERATIONS = 3  # expand up to 3 voxels outward
            for iteration in range(EXPAND_ITERATIONS):
                new_eye = {}
                for (ex, ey, ez) in eye_set:
                    for dx, dy, dz in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]:
                        nb = (ex+dx, ey+dy, ez+dz)
                        if nb in body_voxels and nb not in eye_voxels:
                            new_eye[nb] = body_voxels[nb]
                if not new_eye:
                    break
                for pos, col in new_eye.items():
                    eye_voxels[pos] = col
                    del body_voxels[pos]
                eye_set = set(eye_voxels.keys())
                print(f"    Eye expand iter {iteration+1}: +{len(new_eye)} -> {len(eye_voxels)} eye voxels")

        # Symmetrize body only
        if SYMMETRIZE:
            before = len(body_voxels)
            body_voxels = symmetrize_voxels(body_voxels)
            print(f"    Symmetrized: {before} -> {len(body_voxels)} voxels")

        mesh_names = [o.name for o in objs]
        save_part('body', body_voxels, mesh_names, is_body=True)
        save_part('eyes', eye_voxels, mesh_names, is_body=True, default_on=False)
        # Hair from body mesh is merged into the hair group part (if exists)
        # or saved as a separate body_hair part
        if hair_voxels:
            save_part('body_hair', hair_voxels, mesh_names, is_body=False, default_on=True)
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
