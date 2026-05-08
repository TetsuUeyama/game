"""Helena 元空間で body と衣装メッシュを同一グリッドで voxelize する。

Drape clothing 用の cylindrical projection の入力となる。Helena world coordinates
の bbox を元にグリッドを構築。voxel_size は QM grid と一致させる (0.00705 m)。

Output:
  <out_dir>/<out_prefix>_grid.json
  <out_dir>/<out_prefix>_body.vox
  <out_dir>/<out_prefix>_cloth.vox

Usage:
  blender --background "<helena_blend>" --python voxelize_helena_native.py -- \
    <body_obj_name> <cloth_obj_name> <out_dir> <out_prefix> [<voxel_size>]

Example:
  blender --background "E:/Helena_Douglas_1.10.blend" \
    --python voxelize_helena_native.py -- \
    "Body" "Helena Witch - Skirt" "tmp/helena_native" "witch_skirt" 0.00705
"""
import bpy
import sys, os, json, struct, math
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
if len(args) < 4:
    print(__doc__); sys.exit(1)

BODY_NAME, CLOTH_NAME, OUT_DIR, OUT_PREFIX = args[:4]
VOXEL_SIZE = float(args[4]) if len(args) >= 5 else 0.00705
N_SAMPLES = 8  # triangle barycentric sample density (8x8/2 ~= 36 samples per triangle)

print(f"\n=== Voxelize Helena native space ===")
print(f"  body: {BODY_NAME}")
print(f"  cloth: {CLOTH_NAME}")
print(f"  out_dir: {OUT_DIR}")
print(f"  out_prefix: {OUT_PREFIX}")
print(f"  voxel_size: {VOXEL_SIZE*1000:.2f} mm")

body = bpy.data.objects.get(BODY_NAME)
cloth = bpy.data.objects.get(CLOTH_NAME)
if not body or not cloth:
    print(f"ERROR: body or cloth not found in current blend")
    print("Available MESH objects:")
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            print(f"  - {ob.name} ({len(ob.data.vertices)} verts)")
    sys.exit(1)
print(f"  body verts: {len(body.data.vertices)}")
print(f"  cloth verts: {len(cloth.data.vertices)}")

def get_world_bbox(obj):
    mat = obj.matrix_world
    cs = [mat @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in cs]; ys = [c.y for c in cs]; zs = [c.z for c in cs]
    return min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)

bb_b = get_world_bbox(body)
bb_c = get_world_bbox(cloth)
PAD = 0.10  # 10cm pad to be safe
gx_min = min(bb_b[0], bb_c[0]) - PAD
gy_min = min(bb_b[1], bb_c[1]) - PAD
gz_min = min(bb_b[2], bb_c[2]) - PAD
gx_max = max(bb_b[3], bb_c[3]) + PAD
gy_max = max(bb_b[4], bb_c[4]) + PAD
gz_max = max(bb_b[5], bb_c[5]) + PAD

gx = int(math.ceil((gx_max - gx_min) / VOXEL_SIZE))
gy = int(math.ceil((gy_max - gy_min) / VOXEL_SIZE))
gz = int(math.ceil((gz_max - gz_min) / VOXEL_SIZE))
ox = gx_min; oy = gy_min; oz = gz_min

print(f"\n  grid: {gx} x {gy} x {gz}")
print(f"  origin: ({ox:.3f}, {oy:.3f}, {oz:.3f})")

if gx > 256 or gy > 256 or gz > 256:
    print(f"WARNING: grid dim > 256, .vox format will clip. Increase voxel_size.")

def voxelize_mesh(obj):
    """Surface voxelization via triangle barycentric sampling."""
    mat = obj.matrix_world
    me = obj.data
    me.calc_loop_triangles()
    voxel_set = set()
    for tri in me.loop_triangles:
        v0 = mat @ me.vertices[tri.vertices[0]].co
        v1 = mat @ me.vertices[tri.vertices[1]].co
        v2 = mat @ me.vertices[tri.vertices[2]].co
        # Uniform barycentric grid
        for i in range(N_SAMPLES + 1):
            for j in range(N_SAMPLES + 1 - i):
                u = i / N_SAMPLES; v = j / N_SAMPLES; w = 1 - u - v
                pt = v0 * u + v1 * v + v2 * w
                vx = int((pt.x - ox) / VOXEL_SIZE)
                vy = int((pt.y - oy) / VOXEL_SIZE)
                vz = int((pt.z - oz) / VOXEL_SIZE)
                if 0 <= vx < gx and 0 <= vy < gy and 0 <= vz < gz:
                    voxel_set.add((vx, vy, vz))
    return voxel_set

print("\n[1] Voxelize body...")
body_voxels = voxelize_mesh(body)
print(f"  body: {len(body_voxels)} surface voxels")

print("[2] Voxelize cloth...")
cloth_voxels = voxelize_mesh(cloth)
print(f"  cloth: {len(cloth_voxels)} surface voxels")

def write_vox(path, sx, sy, sz, voxels, color=(255, 255, 255, 255)):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for x, y, z in voxels:
        xd += struct.pack('<BBBB', x, y, z, 1)
    rd = b''
    for i in range(256):
        if i == 0: rd += struct.pack('<BBBB', *color)
        else: rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

if not os.path.exists(OUT_DIR): os.makedirs(OUT_DIR)
body_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}_body.vox")
cloth_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}_cloth.vox")
write_vox(body_path, gx, gy, gz, sorted(body_voxels))
write_vox(cloth_path, gx, gy, gz, sorted(cloth_voxels))

grid_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}_grid.json")
with open(grid_path, 'w') as f:
    json.dump({
        'voxel_size': VOXEL_SIZE,
        'grid_origin': [ox, oy, oz],
        'gx': gx, 'gy': gy, 'gz': gz,
    }, f, indent=2)

print(f"\n[3] Wrote:")
print(f"  {body_path}")
print(f"  {cloth_path}")
print(f"  {grid_path}")
print(f"=== DONE ===")
