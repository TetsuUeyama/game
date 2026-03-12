"""
Blender Python: 3D model -> voxel art (.vox) for field objects.
No chibi deformation, no face processing, no clothing logic.
Simple and clean voxelization for trees, rocks, buildings, etc.

Usage:
  blender --background --python voxelize_object.py -- <input.blend> <output_dir> [resolution] [object_name]

Args:
  input.blend  : Blender/FBX/GLB file
  output_dir   : Output directory for .vox files
  resolution   : Voxel grid height (default: 60)
  object_name  : (optional) Specific object name to voxelize. If omitted, all visible meshes.

Examples:
  # Voxelize all objects in the file:
  blender --background --python voxelize_object.py -- trees.blend public/field/ 60

  # Voxelize a specific object:
  blender --background --python voxelize_object.py -- trees.blend public/field/ 60 "Tree_01"
"""
import bpy
import bmesh
import sys
import os
import struct
import json
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ── Parse arguments ──────────────────────────────────────────────────
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""
OUT_DIR = args[1] if len(args) > 1 else ""
RESOLUTION = int(args[2]) if len(args) > 2 else 60
TARGET_OBJ = args[3] if len(args) > 3 else None

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python voxelize_object.py -- <input> <out_dir> [res] [object_name]")
    sys.exit(1)

print(f"\n=== Object Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output dir: {OUT_DIR}")
print(f"  Resolution: {RESOLUTION}")
if TARGET_OBJ:
    print(f"  Target object: {TARGET_OBJ}")

# ── Load file ────────────────────────────────────────────────────────
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
    print("  Imported FBX")
elif ext in ('.glb', '.gltf'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
    print("  Imported GLB/GLTF")
elif ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)
else:
    print(f"  Unsupported format: {ext}")
    sys.exit(1)

os.makedirs(OUT_DIR, exist_ok=True)

# ── Collect mesh objects ─────────────────────────────────────────────
all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]

if TARGET_OBJ:
    all_meshes = [o for o in all_meshes if o.name == TARGET_OBJ]
    if not all_meshes:
        print(f"  ERROR: Object '{TARGET_OBJ}' not found. Available:")
        for o in bpy.context.scene.objects:
            if o.type == 'MESH':
                print(f"    - {o.name} (visible={o.visible_get()})")
        sys.exit(1)

print(f"  Found {len(all_meshes)} mesh(es): {[o.name for o in all_meshes]}")


# ── Texture loading helpers ──────────────────────────────────────────
_tex_cache = {}

def load_texture_pixels(img):
    """Load image pixels into a flat list for fast access."""
    key = img.name
    if key in _tex_cache:
        return _tex_cache[key]
    w, h = img.size[0], img.size[1]
    if w == 0 or h == 0:
        _tex_cache[key] = (None, 0, 0)
        return (None, 0, 0)
    try:
        px = list(img.pixels[:])  # RGBA flat
    except Exception:
        _tex_cache[key] = (None, 0, 0)
        return (None, 0, 0)
    _tex_cache[key] = (px, w, h)
    return (px, w, h)


def sample_texture(img, u, v):
    """Sample RGBA from image at UV coordinates. Returns None on failure."""
    px, w, h = load_texture_pixels(img)
    if px is None or w == 0 or h == 0:
        return None
    # Wrap UVs
    u = u % 1.0
    v = v % 1.0
    ix = max(0, min(int(u * w), w - 1))
    iy = max(0, min(int(v * h), h - 1))
    base = (iy * w + ix) * 4
    if base + 3 >= len(px):
        return None
    return px[base], px[base+1], px[base+2], px[base+3]


def find_base_color_texture(mat):
    """Find the base color texture image from a material's node tree."""
    if not mat or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bc_input = node.inputs.get('Base Color')
            if bc_input and bc_input.is_linked:
                link = bc_input.links[0]
                src = link.from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    return src.image
                # Check through MIX nodes
                if src.type in ('MIX', 'MIX_RGB'):
                    for inp in src.inputs:
                        if inp.is_linked:
                            n = inp.links[0].from_node
                            if n.type == 'TEX_IMAGE' and n.image:
                                return n.image
    # Fallback: any TEX_IMAGE node
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            return node.image
    return None


def get_material_flat_color(mat):
    """Get flat diffuse color from material (no texture)."""
    if not mat:
        return (0.6, 0.6, 0.6)
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                bc = node.inputs.get('Base Color')
                if bc and not bc.is_linked:
                    c = bc.default_value
                    return (c[0], c[1], c[2])
    return (mat.diffuse_color[0], mat.diffuse_color[1], mat.diffuse_color[2])


# ── VOX writer ───────────────────────────────────────────────────────
def write_vox(filepath, size_x, size_y, size_z, voxels, palette):
    """
    Write a .vox file (MagicaVoxel format).
    voxels: list of (x, y, z, color_index) where color_index is 1-based
    palette: list of (r, g, b) tuples (0-255), up to 255 entries
    """
    with open(filepath, 'wb') as f:
        def w32(v): f.write(struct.pack('<I', v))
        def w8(v):  f.write(struct.pack('B', v))

        # Build chunks in memory
        # SIZE chunk
        size_data = struct.pack('<III', size_x, size_y, size_z)

        # XYZI chunk
        xyzi_data = struct.pack('<I', len(voxels))
        for x, y, z, ci in voxels:
            xyzi_data += struct.pack('BBBB', x, y, z, ci)

        # RGBA chunk (256 entries, 1-indexed: entry 0 unused but must exist at end)
        rgba_data = b''
        for i in range(256):
            if i < len(palette):
                r, g, b = palette[i]
                rgba_data += struct.pack('BBBB', r, g, b, 255)
            else:
                rgba_data += struct.pack('BBBB', 0, 0, 0, 255)

        # Chunk sizes
        def chunk(cid, data):
            return cid + struct.pack('<II', len(data), 0) + data

        main_content = chunk(b'SIZE', size_data) + chunk(b'XYZI', xyzi_data) + chunk(b'RGBA', rgba_data)

        # File header
        f.write(b'VOX ')
        w32(150)  # version
        f.write(b'MAIN')
        w32(0)
        w32(len(main_content))
        f.write(main_content)

    print(f"  Written: {filepath} ({len(voxels)} voxels, {size_x}x{size_y}x{size_z})")


# ── Voxelize a single object ────────────────────────────────────────
def voxelize_object(obj, resolution, out_dir):
    """Voxelize a single mesh object and save as .vox file."""
    name = obj.name.replace(' ', '_').replace('.', '_')
    print(f"\n  Voxelizing: {obj.name} -> {name}.vox")

    # Get evaluated mesh (with modifiers applied)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    obj_eval = obj.evaluated_get(depsgraph)
    mesh = obj_eval.to_mesh()

    # Triangulate
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()

    # World transform
    mat_world = obj.matrix_world

    # Compute bounding box in world space
    verts_world = [mat_world @ Vector(v.co) for v in mesh.vertices]
    if not verts_world:
        print(f"    No vertices, skipping.")
        obj_eval.to_mesh_clear()
        return

    bb_min = Vector((min(v.x for v in verts_world),
                      min(v.y for v in verts_world),
                      min(v.z for v in verts_world)))
    bb_max = Vector((max(v.x for v in verts_world),
                      max(v.y for v in verts_world),
                      max(v.z for v in verts_world)))

    bb_size = bb_max - bb_min
    max_dim = max(bb_size.x, bb_size.y, bb_size.z)
    if max_dim < 1e-6:
        print(f"    Zero-size bounding box, skipping.")
        obj_eval.to_mesh_clear()
        return

    # Grid resolution: longest axis = resolution voxels
    voxel_size = max_dim / resolution
    grid_x = max(1, int(bb_size.x / voxel_size) + 2)
    grid_y = max(1, int(bb_size.y / voxel_size) + 2)
    grid_z = max(1, int(bb_size.z / voxel_size) + 2)

    # Clamp to 256
    if grid_x > 256 or grid_y > 256 or grid_z > 256:
        scale_down = 256.0 / max(grid_x, grid_y, grid_z)
        voxel_size /= scale_down
        grid_x = min(256, int(bb_size.x / voxel_size) + 2)
        grid_y = min(256, int(bb_size.y / voxel_size) + 2)
        grid_z = min(256, int(bb_size.z / voxel_size) + 2)

    print(f"    Grid: {grid_x}x{grid_y}x{grid_z}, voxel_size: {voxel_size:.4f}")

    # Build BVH tree from world-space triangles
    world_verts = [mat_world @ v.co for v in mesh.vertices]
    world_tris = [(p.vertices[0], p.vertices[1], p.vertices[2]) for p in mesh.polygons]

    bvh = BVHTree.FromPolygons(world_verts, world_tris)

    # UV layer
    uv_layer = mesh.uv_layers.active
    uv_data = uv_layer.data if uv_layer else None

    # Per-polygon material and texture info
    mat_textures = {}  # mat_index -> image or None
    mat_colors = {}    # mat_index -> (r, g, b)
    for mi, mat_slot in enumerate(obj.material_slots):
        mat = mat_slot.material
        tex = find_base_color_texture(mat)
        mat_textures[mi] = tex
        mat_colors[mi] = get_material_flat_color(mat)

    # Polygon UV lookup (for barycentric sampling)
    poly_uvs = {}  # poly_index -> [(u,v), (u,v), (u,v)]
    if uv_data:
        for pi, poly in enumerate(mesh.polygons):
            uvs = []
            for li in poly.loop_indices:
                uv = uv_data[li].uv
                uvs.append((uv[0], uv[1]))
            poly_uvs[pi] = uvs

    # Voxelize: for each grid cell, find nearest surface
    threshold = voxel_size * 0.8  # distance threshold for "inside"
    colors_map = {}  # (gx, gy, gz) -> (r, g, b) as 0-255
    total_cells = grid_x * grid_y * grid_z
    progress_step = max(1, grid_x // 10)

    for gx in range(grid_x):
        if gx % progress_step == 0:
            print(f"    Progress: {gx}/{grid_x} ({100*gx//grid_x}%)")
        for gy in range(grid_y):
            for gz in range(grid_z):
                # World position of voxel center
                wx = bb_min.x + (gx + 0.5) * voxel_size
                wy = bb_min.y + (gy + 0.5) * voxel_size
                wz = bb_min.z + (gz + 0.5) * voxel_size
                pt = Vector((wx, wy, wz))

                # Find nearest surface point
                loc, normal, face_idx, dist = bvh.find_nearest(pt)
                if loc is None or dist > threshold:
                    continue

                # Get color
                r, g, b = 0.6, 0.6, 0.6
                if face_idx is not None and face_idx < len(mesh.polygons):
                    poly = mesh.polygons[face_idx]
                    mi = poly.material_index
                    tex = mat_textures.get(mi)

                    if tex and face_idx in poly_uvs:
                        # Barycentric UV interpolation
                        uvs = poly_uvs[face_idx]
                        v0 = world_verts[poly.vertices[0]]
                        v1 = world_verts[poly.vertices[1]]
                        v2 = world_verts[poly.vertices[2]]

                        # Barycentric coords
                        e0 = v1 - v0
                        e1 = v2 - v0
                        ep = loc - v0
                        d00 = e0.dot(e0)
                        d01 = e0.dot(e1)
                        d11 = e1.dot(e1)
                        dp0 = ep.dot(e0)
                        dp1 = ep.dot(e1)
                        denom = d00 * d11 - d01 * d01
                        if abs(denom) > 1e-12:
                            u_bc = (d11 * dp0 - d01 * dp1) / denom
                            v_bc = (d00 * dp1 - d01 * dp0) / denom
                            w_bc = 1.0 - u_bc - v_bc
                            # Clamp
                            u_bc = max(0, min(1, u_bc))
                            v_bc = max(0, min(1, v_bc))
                            w_bc = max(0, min(1, w_bc))
                            # Interpolate UV
                            u_tex = w_bc * uvs[0][0] + u_bc * uvs[1][0] + v_bc * uvs[2][0]
                            v_tex = w_bc * uvs[0][1] + u_bc * uvs[1][1] + v_bc * uvs[2][1]
                            sampled = sample_texture(tex, u_tex, v_tex)
                            if sampled:
                                r, g, b = sampled[0], sampled[1], sampled[2]
                            else:
                                r, g, b = mat_colors.get(mi, (0.6, 0.6, 0.6))
                        else:
                            r, g, b = mat_colors.get(mi, (0.6, 0.6, 0.6))
                    else:
                        r, g, b = mat_colors.get(mi, (0.6, 0.6, 0.6))

                # Convert to 0-255
                ri = max(0, min(255, int(r * 255)))
                gi = max(0, min(255, int(g * 255)))
                bi = max(0, min(255, int(b * 255)))
                colors_map[(gx, gy, gz)] = (ri, gi, bi)

    obj_eval.to_mesh_clear()

    if not colors_map:
        print(f"    No voxels generated, skipping.")
        return

    print(f"    Generated {len(colors_map)} voxels")

    # Build palette (quantize to <=255 colors)
    unique_colors = list(set(colors_map.values()))
    if len(unique_colors) > 255:
        # Simple quantization: reduce precision
        def quantize(c, step=4):
            return ((c[0] // step) * step, (c[1] // step) * step, (c[2] // step) * step)
        new_map = {}
        for pos, col in colors_map.items():
            new_map[pos] = quantize(col)
        colors_map = new_map
        unique_colors = list(set(colors_map.values()))
        # If still too many, increase step
        step = 8
        while len(unique_colors) > 255:
            new_map = {}
            for pos, col in colors_map.items():
                new_map[pos] = quantize(col, step)
            colors_map = new_map
            unique_colors = list(set(colors_map.values()))
            step *= 2

    palette = unique_colors[:255]
    color_to_idx = {c: i + 1 for i, c in enumerate(palette)}

    # Build voxel list
    voxels = []
    for (gx, gy, gz), col in colors_map.items():
        ci = color_to_idx.get(col, 1)
        # VOX format: x, y(depth), z(height)
        # Blender: X=right, Y=forward, Z=up
        # VOX:     X=right, Y=forward, Z=up (same mapping)
        voxels.append((gx, gy, gz, ci))

    # Write .vox
    out_path = os.path.join(out_dir, f"{name}.vox")
    write_vox(out_path, grid_x, grid_y, grid_z, voxels, palette)

    # Write metadata
    meta = {
        "name": obj.name,
        "grid": [grid_x, grid_y, grid_z],
        "voxel_size": voxel_size,
        "voxel_count": len(voxels),
        "bb_min": [bb_min.x, bb_min.y, bb_min.z],
        "bb_max": [bb_max.x, bb_max.y, bb_max.z],
        "resolution": resolution,
    }
    meta_path = os.path.join(out_dir, f"{name}_meta.json")
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    print(f"    Metadata: {meta_path}")


# ── Main ─────────────────────────────────────────────────────────────
print(f"\n=== Processing {len(all_meshes)} object(s) ===")
for obj in all_meshes:
    try:
        voxelize_object(obj, RESOLUTION, OUT_DIR)
    except Exception as e:
        print(f"  ERROR voxelizing '{obj.name}': {e}")
        import traceback
        traceback.print_exc()

print(f"\n=== Done! Output in: {OUT_DIR} ===")
