"""Filter clothing voxels using QM body BVH as global inside-test.

Removes voxels that are inside QM body (signed distance < threshold).
Uses raw face normals (assumes outer body has consistent outward normals via recalc_face_normals).

Usage:
  blender --background <qm.blend> --python filter_voxel_by_body.py -- \
    <body_obj_name> <clothing_vox> <clothing_grid_json> <out_vox> \
    [--min-offset 0.003] [--push-out 1]

Where:
  --min-offset: signed distance threshold (mm). Voxels with sd < this are filtered/pushed.
  --push-out: 0 = remove inside voxels, 1 = push to surface + offset
"""
import bpy
import bmesh
import sys
import os
import json
import struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 4:
    print(__doc__); sys.exit(1)

BODY_NAME = args[0]
CLOTH_VOX = args[1]
CLOTH_GRID = args[2]
OUT_VOX = args[3]

MIN_OFFSET = 0.003
PUSH_OUT = False
i = 4
while i < len(args):
    if args[i] == '--min-offset':
        MIN_OFFSET = float(args[i+1]); i += 2
    elif args[i] == '--push-out':
        PUSH_OUT = bool(int(args[i+1])); i += 2
    else:
        i += 1

print(f"\n=== filter_voxel_by_body ===")
print(f"  body: {BODY_NAME}")
print(f"  clothing: {CLOTH_VOX}")
print(f"  out: {OUT_VOX}")
print(f"  min-offset: {MIN_OFFSET*1000:.1f}mm")
print(f"  mode: {'push outward' if PUSH_OUT else 'remove'}")


def parse_vox(path):
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'VOX ':
        raise ValueError(f"Not a VOX: {path}")
    i = 8
    if data[i:i+4] != b'MAIN':
        raise ValueError("Missing MAIN")
    i += 12
    voxels = []
    palette = [(0,0,0,0)] * 256
    sizes = [0, 0, 0]
    while i < len(data) - 4:
        chunk_id = data[i:i+4]
        sz, _ = struct.unpack('<II', data[i+4:i+12])
        i += 12
        if chunk_id == b'SIZE':
            sx, sy, sz_ = struct.unpack('<III', data[i:i+12])
            sizes = [sx, sy, sz_]
        elif chunk_id == b'XYZI':
            n = struct.unpack('<I', data[i:i+4])[0]
            for k in range(n):
                voxels.append(struct.unpack('BBBB', data[i+4+k*4:i+8+k*4]))
        elif chunk_id == b'RGBA':
            for k in range(256):
                palette[k] = struct.unpack('BBBB', data[i+k*4:i+(k+1)*4])
        i += sz
    return voxels, palette, sizes


def write_vox(path, voxels, palette, sizes):
    xyzi_size = 4 + len(voxels) * 4
    children_size = (12 + 12) + (12 + xyzi_size) + (12 + 1024)
    with open(path, 'wb') as f:
        f.write(b'VOX ')
        f.write(struct.pack('<I', 150))
        f.write(b'MAIN')
        f.write(struct.pack('<II', 0, children_size))
        f.write(b'SIZE')
        f.write(struct.pack('<II', 12, 0))
        f.write(struct.pack('<III', sizes[0], sizes[1], sizes[2]))
        f.write(b'XYZI')
        f.write(struct.pack('<II', xyzi_size, 0))
        f.write(struct.pack('<I', len(voxels)))
        for v in voxels:
            f.write(struct.pack('BBBB', *v))
        f.write(b'RGBA')
        f.write(struct.pack('<II', 1024, 0))
        for c in palette[:256]:
            f.write(struct.pack('BBBB', *c))


# Get QM body
body_obj = bpy.data.objects.get(BODY_NAME)
if body_obj is None:
    print(f"ERROR: body '{BODY_NAME}' not found"); sys.exit(1)

# Build BVH from body (with modifier evaluation, recalc normals for consistent outward)
dg = bpy.context.evaluated_depsgraph_get()
eo = body_obj.evaluated_get(dg)
me = eo.to_mesh()
bm = bmesh.new()
bm.from_mesh(me)
bm.transform(body_obj.matrix_world)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
eo.to_mesh_clear()
# Compute body centroid for normal-flip fallback
centroid = Vector((0, 0, 0))
for v in bm.verts:
    centroid += v.co
if len(bm.verts) > 0:
    centroid /= len(bm.verts)
print(f"  body BVH: {len(bm.verts)} verts, {len(bm.faces)} faces, centroid={tuple(round(c,3) for c in centroid)}")
bvh = BVHTree.FromBMesh(bm)
bm.free()

# Load clothing
cloth_voxels, cloth_palette, sizes = parse_vox(CLOTH_VOX)
with open(CLOTH_GRID) as f:
    cloth_grid = json.load(f)
print(f"  clothing: {len(cloth_voxels)} voxels, sizes={sizes}, vs={cloth_grid['voxel_size']:.5f}m")

origin = cloth_grid['grid_origin']
vs = cloth_grid['voxel_size']

def vox_to_world(x, y, z):
    return Vector((origin[0] + (x + 0.5) * vs, origin[1] + (y + 0.5) * vs, origin[2] + (z + 0.5) * vs))

def normal_outward(nearest, normal):
    out_dir = nearest - centroid
    if out_dir.length > 1e-6:
        if normal.dot(out_dir.normalized()) < 0:
            return -normal
    return normal


# Filter
kept = []
n_outside = 0
n_inside_removed = 0
n_pushed = 0
for v in cloth_voxels:
    x, y, z, c = v
    p = vox_to_world(x, y, z)
    nearest, normal, _, _ = bvh.find_nearest(p)
    if nearest is None:
        kept.append(v); n_outside += 1; continue
    normal = normal_outward(nearest, normal)
    sd = (p - nearest).dot(normal)
    if sd >= MIN_OFFSET:
        kept.append(v); n_outside += 1
    else:
        # Inside body or too close
        if PUSH_OUT:
            new_p = nearest + normal * MIN_OFFSET
            # Snap to nearest grid cell
            new_x = int((new_p.x - origin[0]) / vs - 0.5 + 0.5)  # round
            new_y = int((new_p.y - origin[1]) / vs - 0.5 + 0.5)
            new_z = int((new_p.z - origin[2]) / vs - 0.5 + 0.5)
            if 0 <= new_x < sizes[0] and 0 <= new_y < sizes[1] and 0 <= new_z < sizes[2]:
                kept.append((new_x, new_y, new_z, c))
                n_pushed += 1
            else:
                n_inside_removed += 1
        else:
            n_inside_removed += 1

print(f"  outside (kept): {n_outside}")
print(f"  inside (removed): {n_inside_removed}")
if PUSH_OUT:
    print(f"  inside (pushed out): {n_pushed}")
print(f"  total kept: {len(kept)} / {len(cloth_voxels)} ({100.0*len(kept)/len(cloth_voxels):.1f}%)")

# Deduplicate (push may create duplicates)
seen = set()
dedup = []
for v in kept:
    k = (v[0], v[1], v[2])
    if k in seen: continue
    seen.add(k); dedup.append(v)
if len(dedup) != len(kept):
    print(f"  deduplicated: {len(kept)} -> {len(dedup)}")

write_vox(OUT_VOX, dedup, cloth_palette, sizes)
print(f"  -> {OUT_VOX}")
