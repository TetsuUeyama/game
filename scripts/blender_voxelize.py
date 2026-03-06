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

bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)
os.makedirs(OUT_DIR, exist_ok=True)

# ========================================================================
# Classify meshes into layers: body vs hair
# Face features (eyes, nose, mouth) are part of body mesh UV texture
# ========================================================================
def classify_mesh(name):
    if 'hair' in name.lower():
        return 'hair'
    return 'body'

mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
classified = {'body': [], 'hair': []}
for obj in mesh_objects:
    cat = classify_mesh(obj.name)
    classified[cat].append(obj)
    print(f"  [{cat:6s}] {obj.name} ({len(obj.data.vertices)} verts)")

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
    texture_cache[image.name] = (w, h, list(image.pixels))

def sample_texture(img_name, u, v):
    if img_name not in texture_cache:
        return None
    w, h, pix = texture_cache[img_name]
    px = int(u * w) % w
    py = int(v * h) % h
    pi = (py * w + px) * 4
    if pi + 2 < len(pix):
        return (int(pix[pi]*255), int(pix[pi+1]*255), int(pix[pi+2]*255))
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
# Bounding box
# ========================================================================
min_co = Vector((1e9, 1e9, 1e9))
max_co = Vector((-1e9, -1e9, -1e9))
for obj in mesh_objects:
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
        leg_t = t / 0.50
        z = min_co.z + leg_t * 0.70 * 0.50 * model_h
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
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
        r = (z - min_co.z) / (0.70 * 0.50 * model_h) if model_h > 0 else 0
        r = max(0, min(1, r))
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

all_mesh_data = {}  # category -> [MeshData]
for cat in ['body', 'hair']:
    all_mesh_data[cat] = []

for obj in mesh_objects:
    md = MeshData()
    md.obj_name = obj.name
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)

    bm = bmesh.new()
    bm.from_mesh(me)
    # Triangulate for correct barycentric coords
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

    cat = classify_mesh(obj.name)
    all_mesh_data[cat].append(md)
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
voxel_size = max(def_size) / RESOLUTION
gx = min(256, int(math.ceil(def_size.x / voxel_size)) + 2)
gy = min(256, int(math.ceil(def_size.y / voxel_size)) + 2)
gz = min(256, int(math.ceil(def_size.z / voxel_size)) + 2)
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.4f}")

# ========================================================================
# Voxelize with layered priority: body → detail overlay → hair separate
# ========================================================================
print("\n  Voxelizing (layered)...")

def voxelize_layer(mesh_list, threshold_mult=1.2):
    """Voxelize a list of MeshData, return dict {(vx,vy,vz): (r,g,b)}."""
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
                op = inv_deform(dp)
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

# Layer 1: body (suit, body, accessories - not hair, not detail)
print("  --- Body layer ---")
body_voxels = voxelize_layer(all_mesh_data['body'], 1.2)
print(f"  Body: {len(body_voxels)} voxels")

# Face features (eyes, nose, mouth) are part of body mesh UV — no separate detail layer needed
merged_body = body_voxels

# Layer 3: hair (separate output)
print("  --- Hair layer ---")
hair_voxels = voxelize_layer(all_mesh_data['hair'], 1.2)
print(f"  Hair: {len(hair_voxels)} voxels")

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

# Body output
vlist, pal = build_palette_and_voxels(merged_body)
write_vox(os.path.join(OUT_DIR, "cyberpunk_elf_body.vox"), gx, gy, gz, vlist, pal)

# Hair output
if hair_voxels:
    vlist_h, pal_h = build_palette_and_voxels(hair_voxels)
    write_vox(os.path.join(OUT_DIR, "cyberpunk_elf_hair.vox"), gx, gy, gz, vlist_h, pal_h)

# Combined (for preview)
all_merged = dict(merged_body)
all_merged.update(hair_voxels)
vlist_c, pal_c = build_palette_and_voxels(all_merged)
write_vox(os.path.join(OUT_DIR, "cyberpunk_elf.vox"), gx, gy, gz, vlist_c, pal_c)

# Cleanup
for cat in all_mesh_data:
    for md in all_mesh_data[cat]:
        md.bm.free()

print("\n=== Done ===\n")
