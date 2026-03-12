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
NO_DEFORM = '--no-deform' in argv
pos_args = [a for a in args if not a.startswith('--')]
INPUT_PATH = pos_args[0]
OUT_PATH = pos_args[1]
RESOLUTION = int(pos_args[2]) if len(pos_args) > 2 else 100
print(f"  NO_DEFORM: {NO_DEFORM}")

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

# Pre-process modifiers and shape keys for clean body export
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

# Reset clothing shape keys and remove SURFACE_DEFORM (physics jiggle - cannot run in background)
KEEP_SHAPEKEYS = '--keep-shapekeys' in argv
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or 'body' not in obj.name.lower():
        continue
    # List all clothing shape keys
    if obj.data.shape_keys:
        for kb in obj.data.shape_keys.key_blocks:
            if kb.name.startswith('Clothes_'):
                if KEEP_SHAPEKEYS:
                    print(f"  Keep shape key '{kb.name}' on {obj.name}: {kb.value:.1f} (unchanged)")
                else:
                    print(f"  Reset shape key '{kb.name}' on {obj.name}: {kb.value:.1f} -> 0.0")
                    kb.value = 0.0
    # Remove SURFACE_DEFORM modifiers (physics-based, gives wrong results in background mode)
    for mod in list(obj.modifiers):
        if mod.type == 'SURFACE_DEFORM':
            print(f"  Removed modifier '{mod.name}' on {obj.name} (physics, skip in background)")
            obj.modifiers.remove(mod)

bpy.context.view_layer.update()

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

# Chibi deformation (skipped when --no-deform)
# Regions: head (t>0.90), neck transition (0.85-0.90), torso (0.50-0.85), legs (<0.50)
def deform_point(co):
    if NO_DEFORM:
        return co.copy()
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.90:
        # Head: scale 1.5 ~ 1.8x
        ht = (t - 0.90) / 0.10
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        z = z + ht * model_h * 0.06
    elif t > 0.85:
        # Neck: smooth transition from torso(1.1) to head(1.5)
        nt = (t - 0.85) / 0.05
        smooth = nt * nt * (3 - 2 * nt)  # smoothstep
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
        z = min_co.z + f * 0.50 * model_h
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
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
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
# Add margin on BOTH sides so body (including BVH halo) isn't cut at grid walls
# Chibi scales head up to 1.8x, so the effective surface halo in deformed space
# is thr * max_scale. Margin must exceed this.
base_voxel = max(def_size) / 100
thr = max(voxel_size * 1.2, base_voxel * 1.2)
max_chibi_scale = 1.0 if NO_DEFORM else 1.8
margin = int(math.ceil(thr * max_chibi_scale / voxel_size)) + 1
print(f"  Threshold: {thr:.4f}, margin: {margin} voxels")
grid_origin = def_min - Vector((voxel_size * margin, voxel_size * margin, voxel_size * margin))
gx = min(256, int(math.ceil(def_size.x / voxel_size)) + margin * 2 + 2)
gy = min(256, int(math.ceil(def_size.y / voxel_size)) + margin * 2 + 2)
gz = min(256, int(math.ceil(def_size.z / voxel_size)) + margin * 2 + 2)
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.4f}")

# Build BVH + texture data
import numpy as np

texture_cache = {}
def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    # Use numpy for memory efficiency (~4 bytes/float vs ~28 bytes for Python float)
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    texture_cache[image.name] = {'w': w, 'h': h, 'px': pixels}
    print(f"  Cached texture: {image.name} ({w}x{h})")

def sample_texture(tex_name, uv_x, uv_y):
    """Sample a cached texture at UV coordinates, return (r,g,b) as 0-1 floats."""
    tc = texture_cache.get(tex_name)
    if not tc:
        return (0.7, 0.5, 0.4)
    px_x = int(uv_x * tc['w']) % tc['w']
    px_y = int(uv_y * tc['h']) % tc['h']
    pixel = tc['px'][px_y, px_x]  # numpy: [row, col] → (r, g, b, a)
    return (float(pixel[0]), float(pixel[1]), float(pixel[2]))

# --- Node tree evaluator ---
# Build an evaluation tree by tracing links from Principled BSDF Base Color backwards.
# Tree node types:
#   ('texture', image_name)
#   ('color', (r, g, b))       - constant color (0-1 floats)
#   ('value', float)            - constant scalar
#   ('mix', blend_type, fac_tree, a_tree, b_tree)

def find_input_link(node_tree, node, socket_name):
    """Find the link feeding into a specific input socket by name."""
    for link in node_tree.links:
        if link.to_node == node and link.to_socket.name == socket_name:
            return link
    return None

def get_input_socket(node, names):
    """Get an input socket by trying multiple possible names."""
    for name in names:
        s = node.inputs.get(name)
        if s is not None:
            return s
    return None

def trace_input(node_tree, node, socket_name):
    """Trace what feeds into a node's input, return eval tree."""
    inp = node.inputs.get(socket_name)
    if inp is None:
        return ('value', 0.0)
    link = find_input_link(node_tree, node, socket_name)
    if link is None:
        # Not linked - use default value
        val = inp.default_value
        if hasattr(val, '__len__') and len(val) >= 3:
            return ('color', (float(val[0]), float(val[1]), float(val[2])))
        return ('value', float(val))
    return trace_output(node_tree, link.from_node, link.from_socket)

def make_mix(blend_type, fac_tree, a_tree, b_tree):
    """Create a mix node, optimizing away constant-factor cases."""
    if fac_tree[0] == 'value':
        fac = fac_tree[1]
        if fac <= 0.001:
            return a_tree   # factor=0 → output is A only
        if fac >= 0.999 and blend_type == 'MIX':
            return b_tree   # factor=1 MIX → output is B only
    return ('mix', blend_type, fac_tree, a_tree, b_tree)

def trace_output(node_tree, node, output_socket):
    """Given a node and its output, build eval tree."""
    if node.type == 'TEX_IMAGE' and node.image:
        cache_texture(node.image)
        return ('texture', node.image.name)
    elif node.type == 'MIX':
        blend_type = node.blend_type if hasattr(node, 'blend_type') else 'MIX'
        fac = trace_input(node_tree, node, 'Factor')
        a = trace_input(node_tree, node, 'A')
        b = trace_input(node_tree, node, 'B')
        return make_mix(blend_type, fac, a, b)
    elif node.type == 'MIX_RGB':
        blend_type = node.blend_type if hasattr(node, 'blend_type') else 'MIX'
        fac = trace_input(node_tree, node, 'Fac')
        a = trace_input(node_tree, node, 'Color1')
        b = trace_input(node_tree, node, 'Color2')
        return make_mix(blend_type, fac, a, b)
    elif node.type == 'VALUE':
        return ('value', float(node.outputs[0].default_value))
    elif node.type == 'CURVE_RGB':
        # Approximate: pass through the Color input
        return trace_input(node_tree, node, 'Color')
    elif node.type == 'MATH':
        # Return first input value (approximate)
        return trace_input(node_tree, node, 'Value')
    elif node.type == 'RGB':
        c = node.outputs[0].default_value
        return ('color', (float(c[0]), float(c[1]), float(c[2])))
    else:
        return ('color', (0.7, 0.5, 0.4))

def eval_tree(tree, uv_x, uv_y):
    """Evaluate a color tree at given UV, return (r, g, b) as 0-1 floats."""
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
            # result = A * (1 - fac) + A * B * fac
            return (
                a[0] * (1 - fac) + a[0] * b[0] * fac,
                a[1] * (1 - fac) + a[1] * b[1] * fac,
                a[2] * (1 - fac) + a[2] * b[2] * fac,
            )
        else:  # MIX (linear interpolation)
            return (
                a[0] * (1 - fac) + b[0] * fac,
                a[1] * (1 - fac) + b[1] * fac,
                a[2] * (1 - fac) + b[2] * fac,
            )
    return (0.7, 0.5, 0.4)

# Build material eval trees
mat_info = {}
for obj in body_objs:
    for mat in obj.data.materials:
        if mat is None or mat.name in mat_info:
            continue
        info = {'eval_tree': None, 'color': (180, 180, 180)}
        if mat.use_nodes:
            # Find Principled BSDF and trace Base Color
            for nd in mat.node_tree.nodes:
                if nd.type == 'BSDF_PRINCIPLED':
                    bc_inp = nd.inputs.get('Base Color')
                    if bc_inp:
                        if bc_inp.is_linked:
                            info['eval_tree'] = trace_input(mat.node_tree, nd, 'Base Color')
                            print(f"  Material '{mat.name}': eval_tree = {repr(info['eval_tree'])}")
                        else:
                            c = bc_inp.default_value
                            info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                            print(f"  Material '{mat.name}': constant color {info['color']}")
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

def get_uv_at(md, face_idx, loc):
    """Compute UV coordinates at a location on a face using barycentric interpolation."""
    face = md.bm.faces[face_idx]
    if not md.uv:
        return None
    loops = face.loops
    v0, v1, v2 = [l.vert.co for l in loops]
    uv0 = loops[0][md.uv].uv
    uv1 = loops[1][md.uv].uv
    uv2 = loops[2][md.uv].uv
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
    uv_x = w_b * uv0.x + u_b * uv1.x + v_b * uv2.x
    uv_y = w_b * uv0.y + u_b * uv1.y + v_b * uv2.y
    return (uv_x, uv_y)

# Eye/mouth material names for part separation (generic keyword matching)
EYE_MATERIAL_KEYWORDS = ['eye', 'cornea', 'eyelash']

def is_eye_material(mat_name):
    if mat_name is None:
        return False
    low = mat_name.lower()
    return any(kw in low for kw in EYE_MATERIAL_KEYWORDS)

# Legacy set kept for backward-compat references
EYE_MATERIALS = {'CyberpunkElf_Eyes', 'Eyes_Cornea', 'eyeshadow', 'Eyelashes'}

def get_color_and_mat(md, face_idx, loc):
    """Return (color_rgb, material_name) tuple."""
    face = md.bm.faces[face_idx]
    mat_slot = face.material_index
    mats = md.mesh_obj.data.materials
    mat_name = mats[mat_slot].name if mat_slot < len(mats) and mats[mat_slot] else None
    mi = md.mat_info.get(mat_name)
    if mi and mi.get('eval_tree'):
        uv = get_uv_at(md, face_idx, loc)
        if uv:
            rgb = eval_tree(mi['eval_tree'], uv[0], uv[1])
            result = (
                max(0, min(255, int(rgb[0] * 255))),
                max(0, min(255, int(rgb[1] * 255))),
                max(0, min(255, int(rgb[2] * 255))),
            )
            return result, mat_name
    fallback = mi.get('color', (180,180,180)) if mi else (180,180,180)
    return fallback, mat_name

# Voxelize — track material per voxel for part separation
print("  Voxelizing body...")
body_voxels = {}    # pos → color
voxel_mats = {}     # pos → material_name
for vz in range(gz):
    if vz % 20 == 0:
        print(f"    z={vz}/{gz} hits={len(body_voxels)}")
    for vx in range(gx):
        for vy in range(gy):
            dp = Vector((
                grid_origin.x + (vx + 0.5) * voxel_size,
                grid_origin.y + (vy + 0.5) * voxel_size,
                grid_origin.z + (vz + 0.5) * voxel_size,
            ))
            op = inv_deform(dp)
            best_dist = thr
            best_color = None
            best_mat = None
            for md in all_mesh_data:
                loc, norm, fi, dist = md.bvh.find_nearest(op)
                if loc is not None and dist < best_dist:
                    best_dist = dist
                    best_color, best_mat = get_color_and_mat(md, fi, loc)
            if best_color:
                body_voxels[(vx, vy, vz)] = best_color
                voxel_mats[(vx, vy, vz)] = best_mat

# Post-process: trim extra foot sole thickness (global bottom layers)
# The BVH threshold captures voxels below the flat foot sole surface.
# For flat surfaces, captures from both sides → ~2x threshold layers of artifact.
min_vz = min(pos[2] for pos in body_voxels)
sole_trim_layers = int(thr / voxel_size) * 3  # flat sole artifact: ~3x single-side threshold
removed_sole = 0
for vz_trim in range(min_vz, min_vz + sole_trim_layers):
    to_remove = [pos for pos in body_voxels if pos[2] == vz_trim]
    for pos in to_remove:
        del body_voxels[pos]
        if pos in voxel_mats:
            del voxel_mats[pos]
        removed_sole += 1
print(f"  Sole trim: removed {removed_sole} voxels from bottom {sole_trim_layers} layers (z={min_vz}~{min_vz+sole_trim_layers-1})")

# Separate eye voxels and snap to face surface
eye_voxels_raw = {}
eye_positions = set()
for pos, mat in voxel_mats.items():
    if is_eye_material(mat):
        eye_voxels_raw[pos] = body_voxels[pos]
        eye_positions.add(pos)

# Find face surface Y (front-most Head voxel) at each (x,z) near eyes
# Generic: look for "head" in material name (works for any model)
def is_head_material(mat_name):
    return mat_name is not None and 'head' in mat_name.lower()

face_front_y = {}  # (x,z) → min Y of Head material
for pos, mat in voxel_mats.items():
    if is_head_material(mat) and pos not in eye_positions:
        xz = (pos[0], pos[2])
        if xz not in face_front_y or pos[1] < face_front_y[xz]:
            face_front_y[xz] = pos[1]

# Remap eye voxels to face surface: snap Y to face front
eye_voxels = {}
eye_protruding = set()  # positions that protrude beyond face (to remove from body)
for pos, col in eye_voxels_raw.items():
    xz = (pos[0], pos[2])
    face_y = face_front_y.get(xz)
    if face_y is not None:
        new_pos = (pos[0], face_y, pos[2])
        eye_voxels[new_pos] = col
        if pos[1] < face_y:
            # This eye voxel protrudes in front of face → mark for removal from body
            eye_protruding.add(pos)
    else:
        eye_voxels[pos] = col

print(f"  Total: {len(body_voxels)} voxels")
print(f"  Eye voxels: {len(eye_voxels)}")

# --- Handle eye positions in body ---
# Eye voxels that protrude beyond face surface → DELETE from body
# Eye voxels on face surface → fill with face skin color
eye_zs = [p[2] for p in eye_positions]
eye_z_min, eye_z_max = min(eye_zs), max(eye_zs)
if eye_positions:
    for pos in eye_protruding:
        if pos in body_voxels:
            del body_voxels[pos]
    print(f"  Eye protruding (removed from body): {len(eye_protruding)}")

    eye_on_surface = eye_positions - eye_protruding
    face_colors = []
    for pos, mat in voxel_mats.items():
        if is_head_material(mat) and pos not in eye_positions:
            if eye_z_min - 3 <= pos[2] <= eye_z_max + 3:
                face_colors.append(body_voxels[pos])
    if face_colors:
        avg_r = sorted([c[0] for c in face_colors])[len(face_colors)//2]
        avg_g = sorted([c[1] for c in face_colors])[len(face_colors)//2]
        avg_b = sorted([c[2] for c in face_colors])[len(face_colors)//2]
        face_skin = (avg_r, avg_g, avg_b)
        print(f"  Face skin color (median): {face_skin}")
        for pos in eye_on_surface:
            if pos in body_voxels:
                body_voxels[pos] = face_skin

print(f"  Unique colors: {len(set(body_voxels.values()))}")

# Quantize colors to fit within 255-color palette
# Round each channel to nearest multiple of step size
def quantize_color(c, step=4):
    return (
        min(255, (c[0] // step) * step + step // 2),
        min(255, (c[1] // step) * step + step // 2),
        min(255, (c[2] // step) * step + step // 2),
    )

# Quantize all voxel colors
quantized_voxels = {}
for pos, col in body_voxels.items():
    quantized_voxels[pos] = quantize_color(col)

unique_q = set(quantized_voxels.values())
print(f"  Quantized unique colors: {len(unique_q)}")

# If still > 255 after quantization, increase step
step = 4
while len(unique_q) > 255:
    step *= 2
    print(f"  Re-quantizing with step={step}...")
    quantized_voxels = {pos: quantize_color(col, step) for pos, col in body_voxels.items()}
    unique_q = set(quantized_voxels.values())
    print(f"  Quantized unique colors: {len(unique_q)}")

# Build palette from quantized colors
colors = list(unique_q)
color_idx = {c: i+1 for i, c in enumerate(colors)}
vlist = []
for pos, col in quantized_voxels.items():
    ci = color_idx[col]
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

# Helper: save a part as separate .vox
def save_part(part_voxels, suffix):
    if not part_voxels:
        return
    part_q = {pos: quantize_color(col, step) for pos, col in part_voxels.items()}
    part_colors = list(set(part_q.values()))
    if len(part_colors) > 255:
        from collections import Counter as C2
        freq2 = C2(part_q.values())
        part_colors = [c for c, _ in freq2.most_common(255)]
    part_cidx = {c: i+1 for i, c in enumerate(part_colors)}
    part_vlist = []
    for pos, col in part_q.items():
        ci = part_cidx.get(col, 1)
        part_vlist.append((pos[0], pos[1], pos[2], ci))
    part_path = OUT_PATH.replace('.vox', f'_{suffix}.vox')
    write_vox(part_path, gx, gy, gz, part_vlist, part_colors)
    print(f"  -> {part_path}: {len(part_vlist)} voxels, {len(part_colors)} colors")

save_part(eye_voxels, 'eyes')

# Save grid info
import json
grid_info = {
    'gx': gx, 'gy': gy, 'gz': gz,
    'voxel_size': voxel_size,
    'grid_origin': [grid_origin.x, grid_origin.y, grid_origin.z],
    'def_min': [def_min.x, def_min.y, def_min.z],
    'def_max': [def_max.x, def_max.y, def_max.z],
    'raw_min': [min_co.x, min_co.y, min_co.z],
    'raw_max': [max_co.x, max_co.y, max_co.z],
    'raw_center': [center.x, center.y, center.z],
    'model_h': model_h,
    'eye_materials': list(EYE_MATERIALS),
    'eye_voxel_count': len(eye_voxels),
}
grid_path = OUT_PATH.replace('.vox', '_grid.json')
with open(grid_path, 'w') as f:
    json.dump(grid_info, f, indent=2)
print(f"  -> {grid_path}")

# Cleanup
for md in all_mesh_data:
    md.bm.free()

print("\n=== Done ===")
