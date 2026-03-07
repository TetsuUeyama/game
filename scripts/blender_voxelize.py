"""
Blender Python: 3D model -> deformed voxel art (.vox)
Usage: blender --background --python blender_voxelize.py -- <input.blend> <output_dir> [resolution]

v3: UV texture color, chibi deform, hair split, detail overlay priority
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
RESOLUTION = int(args[2]) if len(args) > 2 else 100

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python blender_voxelize.py -- <input> <out_dir> [res]")
    sys.exit(1)

print(f"\n=== Voxelizer v3 ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output dir: {OUT_DIR}")
print(f"  Resolution: {RESOLUTION}")

ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
    print("  Imported FBX")
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)
os.makedirs(OUT_DIR, exist_ok=True)

# No Blender pose adjustment — leg spread is done in deform_point() instead

# ========================================================================
# Disable MASK modifiers on Body mesh to expose full skin (legs, forearms)
# ========================================================================
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        disabled = []
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False
                disabled.append(mod.name)
        if disabled:
            print(f"  Disabled MASK modifiers on '{obj.name}': {disabled}")

# ========================================================================
# Classify meshes: each visible mesh is a separate part for toggling
# ========================================================================
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]

# Auto-detect common prefix from mesh names
_names = [o.name for o in mesh_objects]
_prefix = ""
if len(_names) > 1:
    _prefix = os.path.commonprefix(_names)
    # Trim to last '_' or ' ' boundary
    for sep in ['_', ' ']:
        idx = _prefix.rfind(sep)
        if idx > 0:
            _prefix = _prefix[:idx + 1]
            break
    else:
        _prefix = ""
print(f"  Auto-detected prefix: '{_prefix}'")

def part_key(name):
    """Generate a short file-safe key from mesh name."""
    n = name
    if _prefix:
        n = n[len(_prefix):] if n.startswith(_prefix) else n
    n = n.replace('CyberpunkElf ', '').replace('CyberpunkElf_', '')
    n = n.replace('Default - ', '').strip()
    n = n.replace(' ', '_').lower()
    n = n.replace('_-_default', '').replace('-_default', '')
    # Collapse "clothes_" prefix for cleaner keys
    n = n.replace('clothes_', '')
    return n
part_objects = {}  # part_key -> [obj, ...]
for obj in mesh_objects:
    key = part_key(obj.name)
    if key not in part_objects:
        part_objects[key] = []
    part_objects[key].append(obj)
    print(f"  [{key:20s}] {obj.name} ({len(obj.data.vertices)} verts)")

print(f"\n  Parts: {list(part_objects.keys())}")

# ========================================================================
# Texture cache + sampling
# ========================================================================
texture_cache = {}

def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    print(f"    Cache: {image.name} ({w}x{h})")
    # Store as compact bytes (RGB uint8) instead of Python float list to save memory
    # A 4096x4096 RGBA float list uses ~1.8GB; bytes use ~50MB
    raw = image.pixels[:]  # fast copy as flat float array
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

# ========================================================================
# Material texture matching (improved)
# ========================================================================
def score_image(name):
    n = name.lower()
    if 'basecolor' in n or 'base_color' in n or 'diffuse' in n:
        s = 10
        # Strongly penalize variant names (use default version)
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

TEXTURES_DIR = os.path.join(os.path.dirname(INPUT_PATH), "..", "Assets", "Textures")

def try_load_image(filepath):
    """Load image from filesystem. Always force-load to ensure correct file."""
    if not os.path.exists(filepath):
        return None
    name = os.path.basename(filepath)
    # Check if already loaded by exact name
    for img in bpy.data.images:
        if img.name == name:
            return img
    # Force load from disk (don't match by filepath to avoid Map# aliases)
    try:
        img = bpy.data.images.load(filepath)
        print(f"    Loaded from disk: {name}")
        return img
    except:
        return None

def find_texture_for_mat(mat):
    """Find best BaseColor texture for a material. Checks all sources, picks highest score."""
    if not mat:
        return None
    best = None
    best_score = -999
    # Method 1: search all image nodes in node tree
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
    # Method 2: name-based matching from all loaded images
    key = mat.name.replace('CyberpunkElf_', '').replace('Default - ', '').strip().lower()
    for img in bpy.data.images:
        n = img.name.lower()
        if key.replace(' ', '_') in n or key.replace(' ', '') in n:
            s = score_image(n)
            if s > best_score:
                best_score = s; best = img
    # Method 3: try to load from Assets/Textures/ folder
    if os.path.isdir(TEXTURES_DIR):
        key_clean = mat.name.replace('Default - ', '').replace(' ', '_')
        for fn in os.listdir(TEXTURES_DIR):
            fl = fn.lower()
            if key_clean.lower() in fl and ('basecolor' in fl or 'diffuse' in fl):
                s = score_image(fn)
                if s > best_score:
                    img = try_load_image(os.path.join(TEXTURES_DIR, fn))
                    if img:
                        best_score = s; best = img
    return best if best_score >= 0 else None

mat_info = {}  # mat_name -> {'image': str|None, 'color': (r,g,b)}

for obj in mesh_objects:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or mat.name in mat_info:
            continue
        info = {'image': None, 'color': (180, 180, 180)}
        img = find_texture_for_mat(mat)
        if img:
            cache_texture(img)
            info['image'] = img.name
        else:
            # Flat color
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

# ========================================================================
# Bounding box (BODY-ONLY for consistent deformation across models)
# Using only body mesh ensures accessories don't affect deformation params
# ========================================================================
body_objects = [o for o in mesh_objects if part_key(o.name) == 'body']
bbox_objects = body_objects if body_objects else mesh_objects
print(f"  BBox source: {[o.name for o in bbox_objects]}")

min_co = Vector((1e9, 1e9, 1e9))
max_co = Vector((-1e9, -1e9, -1e9))
for obj in bbox_objects:
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
print(f"  BBox: {size.x:.3f} x {size.y:.3f} x {size.z:.3f}")

# ========================================================================
# Chibi deformation
# ========================================================================
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
        # Leg region: compress Z + spread legs outward (ハの字 / Terry stance)
        # Use smooth quadratic compression: f(leg_t) = 0.70*leg_t + 0.30*leg_t^2
        # This ensures f(0)=0, f(1)=1.0 (continuous with torso at boundary)
        # while still compressing the lower legs (feet get 70% compression)
        leg_t = t / 0.50
        f = 0.70 * leg_t + 0.30 * leg_t * leg_t
        z = min_co.z + f * 0.50 * model_h
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        # Spread legs outward: push X away from center based on height
        # More spread at feet (leg_t=0), less at hip (leg_t=1)
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)  # max ~6cm at feet, 0 at hip
        x += sign * spread
    return Vector((x, y, z))

def inv_deform(co, head_scale_override=None):
    """Inverse chibi deformation. head_scale_override: use reduced head scale for hair."""
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
        # Inverse of f(leg_t) = 0.70*leg_t + 0.30*leg_t^2
        # Solve 0.30*r^2 + 0.70*r - u = 0 where u = (z - min_co.z) / (0.50 * model_h)
        import math as _math
        u = (z - min_co.z) / (0.50 * model_h) if model_h > 0 else 0
        u = max(0, min(1, u))
        disc = 0.49 + 1.20 * u
        r = (-0.70 + _math.sqrt(disc)) / 0.60 if disc >= 0 else 0
        r = max(0, min(1, r))
        # Reverse leg spread
        leg_t = r
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x -= sign * spread
        z = min_co.z + r * 0.50 * model_h
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    return Vector((x, y, z))

# ========================================================================
# Build BVH + UV data per mesh (triangulated)
# ========================================================================
print("\n  Building BVH trees (triangulated)...")

class MeshData:
    __slots__ = ['bvh', 'bm', 'uv_layer', 'face_mat', 'face_tex', 'obj_name']

all_mesh_data = {}  # part_key -> [MeshData]
for key in part_objects:
    all_mesh_data[key] = []

for obj in mesh_objects:
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

    key = part_key(obj.name)
    all_mesh_data[key].append(md)
    eo.to_mesh_clear()

# ========================================================================
# Color at surface via UV
# ========================================================================
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
    return (180, 180, 180)

# ========================================================================
# Deformed bounding box
# ========================================================================
# Step 1: Body-only deformed bbox → determines voxel_size (consistent across models)
body_def_min = Vector((1e9, 1e9, 1e9))
body_def_max = Vector((-1e9, -1e9, -1e9))
for obj in bbox_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        dc = deform_point(v.co)
        for i in range(3):
            body_def_min[i] = min(body_def_min[i], dc[i])
            body_def_max[i] = max(body_def_max[i], dc[i])
    eo.to_mesh_clear()

body_def_size = body_def_max - body_def_min
voxel_size = body_def_size.z / RESOLUTION
print(f"  Body deformed height: {body_def_size.z:.4f}, voxel_size: {voxel_size:.6f}")

# Step 2: All-meshes deformed bbox → determines grid extent (fits all parts)
def_min = Vector((1e9, 1e9, 1e9))
def_max = Vector((-1e9, -1e9, -1e9))
for obj in mesh_objects:
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
gx = min(256, int(math.ceil(def_size.x / voxel_size)) + 2)
gy = min(256, int(math.ceil(def_size.y / voxel_size)) + 2)
gz = min(256, int(math.ceil(def_size.z / voxel_size)) + 2)
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.4f}")

# ========================================================================
# Voxelize each part separately
# ========================================================================
print("\n  Voxelizing (per-part)...")

def voxelize_layer(mesh_list, threshold_mult=1.2, head_scale_override=None):
    """Voxelize a list of MeshData, return dict {(vx,vy,vz): (r,g,b)}.
    head_scale_override: if set, use reduced head scale in inv_deform (for hair).
    """
    result = {}
    thr = voxel_size * threshold_mult
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
                op = inv_deform(dp, head_scale_override=head_scale_override)
                best_dist = thr
                best_color = None
                for md in mesh_list:
                    loc, norm, fi, dist = md.bvh.find_nearest(op)
                    if loc is not None and dist < best_dist:
                        best_dist = dist
                        best_color = get_color_at(md, fi, loc)
                if best_color:
                    result[(vx, vy, vz)] = best_color
    return result

part_voxels = {}  # part_key -> voxel_dict
for key, mesh_list in all_mesh_data.items():
    if not mesh_list:
        continue
    print(f"  --- {key} ---")
    if 'hair' in key:
        # Hair: higher threshold to catch flowing hair, no head enlargement (1.0)
        # to match original realistic model proportions relative to chibi-enlarged face
        part_voxels[key] = voxelize_layer(mesh_list, threshold_mult=3.0, head_scale_override=1.0)
        print(f"  {key}: {len(part_voxels[key])} voxels (hair mode: thr=3.0, head_scale=1.0)")
    else:
        part_voxels[key] = voxelize_layer(mesh_list, 1.2)
        print(f"  {key}: {len(part_voxels[key])} voxels")

# Fill body skin under clothing: only for garments that actually cover skin
# Accessories (hat, hologram, armband, hip_plate, necktie, garter_straps) sit ON TOP of body/clothing
# and should NOT generate skin fill underneath
# Tight-fitting garments that directly cover skin - auto-detect from part keys
# Exclude parts with collars/stiff shapes that extend beyond body surface
SKIN_EXCLUDE_KEYWORDS = {'jacket', 'hat', 'hologram', 'armband', 'hip_plate', 'necktie',
                         'garter', 'wings', 'staff', 'pauldron', 'shoulder', 'ruffle',
                         'gem', 'hanging', 'armor', 'decoration', 'neckerchief',
                         'eyes', 'eyelash', 'eyeshadow', 'teeth', 'tongue', 'toungue'}
SKIN_COVER_PARTS = set()
for key in part_voxels:
    if key == 'body' or key == 'hair':
        continue
    if any(kw in key for kw in SKIN_EXCLUDE_KEYWORDS):
        continue
    # Check if this part's mesh overlaps body significantly
    SKIN_COVER_PARTS.add(key)
print(f"  Skin cover parts: {SKIN_COVER_PARTS}")
if 'body' in part_voxels:
    body_meshes = all_mesh_data['body']
    clothing_positions = set()
    for key, voxels in part_voxels.items():
        if key in SKIN_COVER_PARTS:
            clothing_positions.update(voxels.keys())
    added = 0
    thr = voxel_size * 5.0
    for pos in clothing_positions:
        if pos in part_voxels['body']:
            continue
        vx, vy, vz = pos
        dp = Vector((
            def_min.x + (vx + 0.5) * voxel_size,
            def_min.y + (vy + 0.5) * voxel_size,
            def_min.z + (vz + 0.5) * voxel_size,
        ))
        op = inv_deform(dp)
        best_dist = thr
        best_color = None
        for md in body_meshes:
            loc, norm, fi, dist = md.bvh.find_nearest(op)
            if loc is not None and dist < best_dist:
                best_dist = dist
                best_color = get_color_at(md, fi, loc)
        if best_color:
            part_voxels['body'][pos] = best_color
            added += 1
    print(f"  Body skin fill: added {added} voxels under clothing (total body: {len(part_voxels['body'])})")

# ========================================================================
# Color-correct body voxels under clothing to match exposed skin
# The body texture often has darker/shadow colors in areas designed to be hidden
# ========================================================================
if 'body' in part_voxels:
    clothing_positions = set()
    for key, voxels in part_voxels.items():
        if key in SKIN_COVER_PARTS:
            clothing_positions.update(voxels.keys())

    # Collect exposed body skin colors per Z layer for reference
    exposed_avg_per_z = {}
    for (vx, vy, vz), col in part_voxels['body'].items():
        if (vx, vy, vz) not in clothing_positions:
            if vz not in exposed_avg_per_z:
                exposed_avg_per_z[vz] = [0, 0, 0, 0]
            exposed_avg_per_z[vz][0] += col[0]
            exposed_avg_per_z[vz][1] += col[1]
            exposed_avg_per_z[vz][2] += col[2]
            exposed_avg_per_z[vz][3] += 1

    for z in exposed_avg_per_z:
        n = exposed_avg_per_z[z][3]
        if n > 0:
            exposed_avg_per_z[z] = (
                exposed_avg_per_z[z][0] // n,
                exposed_avg_per_z[z][1] // n,
                exposed_avg_per_z[z][2] // n,
            )
        else:
            exposed_avg_per_z[z] = None

    # For body voxels under clothing, blend toward exposed skin color
    corrected = 0
    for pos in clothing_positions:
        if pos not in part_voxels['body']:
            continue
        vx, vy, vz = pos
        orig = part_voxels['body'][pos]
        # Find nearest Z layer with exposed skin
        ref = exposed_avg_per_z.get(vz)
        if ref is None:
            for dz in range(1, 10):
                ref = exposed_avg_per_z.get(vz + dz) or exposed_avg_per_z.get(vz - dz)
                if ref:
                    break
        if ref is None:
            continue
        # Blend: 70% toward exposed skin avg, keep 30% original for natural variation
        blend = 0.7
        nr = int(orig[0] * (1 - blend) + ref[0] * blend)
        ng = int(orig[1] * (1 - blend) + ref[1] * blend)
        nb = int(orig[2] * (1 - blend) + ref[2] * blend)
        part_voxels['body'][pos] = (nr, ng, nb)
        corrected += 1
    print(f"  Body color correction: {corrected} voxels blended toward exposed skin tone")

# ========================================================================
# Face post-processing: symmetry, mascara thinning, lip enhancement
# ========================================================================
if 'body' in part_voxels:
    bv = part_voxels['body']
    # Determine head region in voxel space (t > 0.85 in original = chibi head)
    # Head threshold: deformed Z for t=0.85
    head_z_orig = min_co.z + 0.85 * model_h
    head_z_vox = int((head_z_orig - def_min.z) / voxel_size)
    # Face front: low Y values (Y < face_y_max)
    head_voxels = {(x,y,z): c for (x,y,z), c in bv.items() if z >= head_z_vox}
    if head_voxels:
        hxs = [x for x,y,z in head_voxels]
        face_cx = (min(hxs) + max(hxs)) / 2.0
        cx_int = int(round(face_cx))
        print(f"  Face post-process: head_z>={head_z_vox}, center_x={face_cx:.1f}")

        # 1) Symmetry: mirror voxels around center X
        sym_added = 0
        sym_keys = list(head_voxels.keys())
        for (x, y, z) in sym_keys:
            mirror_x = 2 * cx_int - x
            if (mirror_x, y, z) not in bv and mirror_x >= 0 and mirror_x < gx:
                bv[(mirror_x, y, z)] = bv[(x, y, z)]
                sym_added += 1
        print(f"    Symmetry: added {sym_added} mirrored voxels")

        # 2) Mascara thinning: keep only 1-voxel-wide eyeliner
        #    For each Y row in eye area, find skin center, keep only the
        #    first dark voxel on each side of the eye opening
        def is_dark(c):
            return (c[0] + c[1] + c[2]) / 3.0 < 50
        # Get skin color reference from forehead (Z = eye_z + 2)
        eye_z_top = head_z_vox + 10  # Z=90 in current grid
        eye_z_bot = head_z_vox + 9   # Z=89
        forehead_z = head_z_vox + 11  # Z=91
        mascara_thinned = 0
        for z_target in [eye_z_top, eye_z_bot, eye_z_top - 1, eye_z_bot - 1,
                         eye_z_top + 1]:
            for y_target in range(0, 6):
                # Collect voxels in this row
                row = {}
                for (x, y, z), c in bv.items():
                    if y == y_target and z == z_target and min(hxs) <= x <= max(hxs):
                        row[x] = c
                if not row:
                    continue
                xs_sorted = sorted(row.keys())
                # Find skin reference from forehead at same Y
                skin_ref = None
                for (x, y, z), c in bv.items():
                    if y == y_target and z == forehead_z and not is_dark(c):
                        skin_ref = c
                        break
                if skin_ref is None:
                    continue
                # Scan from left: find first skin, then keep max 1 dark before it
                # Scan from center outward to left and right
                # Find the skin region center
                skin_xs = [x for x in xs_sorted if x in row and not is_dark(row[x])]
                dark_xs = [x for x in xs_sorted if x in row and is_dark(row[x])]
                if not skin_xs or not dark_xs:
                    continue
                skin_min = min(skin_xs)
                skin_max = max(skin_xs)
                # Left side: dark voxels left of skin_min
                # Keep only the one closest to skin (skin_min - 1)
                for x in dark_xs:
                    if x < skin_min - 1:  # more than 1 away from skin edge
                        bv[(x, y_target, z_target)] = skin_ref
                        mascara_thinned += 1
                    elif x > skin_max + 1:  # more than 1 away from right skin edge
                        bv[(x, y_target, z_target)] = skin_ref
                        mascara_thinned += 1
        print(f"    Mascara thinning: replaced {mascara_thinned} voxels (kept 1px outline)")

        # 3) Lip coloring: subtle pink at mouth position
        #    Mouth: Z=87-88 (head_z_vox+7 to +8), Y=1-3, X within ±3 of center
        #    Only modify skin-colored voxels (not dark or white)
        mouth_z_min = head_z_vox + 7
        mouth_z_max = head_z_vox + 8
        lip_count = 0
        for (x, y, z) in list(bv.keys()):
            if z < mouth_z_min or z > mouth_z_max:
                continue
            if y < 1 or y > 3:
                continue
            if abs(x - cx_int) > 3:
                continue
            col = bv[(x, y, z)]
            br = (col[0] + col[1] + col[2]) / 3.0
            if br < 50 or br > 200:  # skip dark (mascara) and white (teeth)
                continue
            # Subtle pink shift: boost red slightly, reduce green
            nr = min(255, int(col[0] * 1.08))
            ng = max(0, int(col[1] * 0.85))
            nb = max(0, int(col[2] * 0.88))
            bv[(x, y, z)] = (nr, ng, nb)
            lip_count += 1
        print(f"    Lip pink: adjusted {lip_count} voxels")

# ========================================================================
# Write .vox
# ========================================================================
def build_palette_and_voxels(voxel_dict):
    """Convert {(x,y,z): (r,g,b)} to (voxel_list, palette)."""
    color_map = {}
    pal = []
    out = []
    for (vx, vy, vz), (r, g, b) in voxel_dict.items():
        # Quantize to 8-step for palette efficiency
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

# Output each part as separate .vox file
import json
part_manifest = []  # [{key, file, voxels, default_on}]

# Auto-detect model base name from input file
_model_base = os.path.splitext(os.path.basename(INPUT_PATH))[0].lower()
# Clean up common prefixes like "uploads_files_NNNNN_"
import re
_model_base = re.sub(r'^uploads_files_\d+_', '', _model_base)
_model_base = _model_base.replace(' ', '_')
# Derive output subdirectory name from OUT_DIR
_out_subdir = os.path.basename(OUT_DIR.rstrip('/\\'))
print(f"  Model base: '{_model_base}', output subdir: '{_out_subdir}'")

# Parts that are ON by default: body, hair, eyes, teeth, tongue,
# and any part with 'clothes' or 'suit' in original name
# Small decorative parts (wings, staff, etc.) default to off
DEFAULT_ON_KEYWORDS = {'body', 'hair', 'eyes', 'eyelash', 'teeth', 'tongue', 'eyeshadow'}
CLOTHES_KEYWORDS = {'clothes', 'suit', 'leotard', 'boot', 'hat', 'jacket', 'gloves',
                    'bra', 'panties', 'leggings', 'pauldron', 'shoulder', 'neck', 'ruffle'}
def is_default_on(key, orig_names):
    """Determine if a part should be on by default."""
    k = key.lower()
    if any(kw in k for kw in DEFAULT_ON_KEYWORDS):
        return True
    # Check original mesh names for clothing keywords
    for n in orig_names:
        nl = n.lower()
        if any(kw in nl for kw in CLOTHES_KEYWORDS):
            return True
    return False

for key, voxels in part_voxels.items():
    if not voxels:
        continue
    filename = f"{_model_base}_{key}.vox"
    vlist, pal = build_palette_and_voxels(voxels)
    write_vox(os.path.join(OUT_DIR, filename), gx, gy, gz, vlist, pal)
    orig_names = [o.name for o in part_objects.get(key, [])]
    part_manifest.append({
        'key': key,
        'file': f'/{_out_subdir}/{filename}',
        'voxels': len(voxels),
        'default_on': is_default_on(key, orig_names),
    })

# Combined (all parts merged) for fallback
all_merged = {}
for voxels in part_voxels.values():
    all_merged.update(voxels)
vlist_c, pal_c = build_palette_and_voxels(all_merged)
write_vox(os.path.join(OUT_DIR, f"{_model_base}.vox"), gx, gy, gz, vlist_c, pal_c)

# Write manifest JSON for the viewer
manifest_path = os.path.join(OUT_DIR, f"{_model_base}_parts.json")
with open(manifest_path, 'w') as f:
    json.dump(part_manifest, f, indent=2)
print(f"  -> {manifest_path}: {len(part_manifest)} parts")

# Write grid info JSON for body sharing / cross-model alignment
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
grid_info_path = os.path.join(OUT_DIR, f"{_model_base}_grid.json")
with open(grid_info_path, 'w') as f:
    json.dump(grid_info, f, indent=2)
print(f"  -> {grid_info_path}: grid info saved")

# Cleanup
for cat in all_mesh_data:
    for md in all_mesh_data[cat]:
        md.bm.free()

print("\n=== Done ===\n")
