"""Generate sub-grid voxels at body skin + 1 voxel layer for clothing display.

Body voxel の各 surface (= 6-conn 隣接 cell が body でない方向) に対し、
sub-grid 解像度で「body face の 1 sub_vs 外側」に voxel を配置する。
Z 範囲（脚部のみ）でフィルタ可能。

これは「皮膚の上に 1 voxel」の薄い shell を生成する。

Usage:
  python generate_body_skin_plus1.py <voxel_dir> <out_prefix> \
    [<z_min> <z_max>] [<scale_factor>]

  z_min/z_max: world coord (m). このZ 範囲の body voxel から生成
  scale_factor: sub-grid scale. default 4 (= 1.76mm voxel)
"""
import sys, os, json, struct, math
from collections import defaultdict

if len(sys.argv) < 3:
    print(__doc__); sys.exit(1)
VOXEL_DIR = sys.argv[1]; OUT_PREFIX = sys.argv[2]
Z_MIN = float(sys.argv[3]) if len(sys.argv) >= 4 else -1.0
Z_MAX = float(sys.argv[4]) if len(sys.argv) >= 5 else 1.0
SCALE_FACTOR = int(sys.argv[5]) if len(sys.argv) >= 6 else 4

print(f"\n=== Generate body skin+1 layer ===")
print(f"  out: {OUT_PREFIX}, Z range: [{Z_MIN}, {Z_MAX}]m, scale: x{SCALE_FACTOR}")

def parse_vox(path):
    with open(path,'rb') as f: d=f.read()
    voxels = []
    i = d.find(b'XYZI')
    if i >= 0:
        cnt = struct.unpack_from('<I', d, i+12)[0]
        for j in range(cnt):
            x,y,z,c = struct.unpack_from('<BBBB', d, i+16+j*4)
            voxels.append((x,y,z,c))
    return voxels

def write_vox(path, sx, sy, sz, voxels, color):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels: xd += struct.pack('<BBBB', *v)
    rd = b''
    for j in range(256):
        if j == 0: rd += struct.pack('<BBBB', *color)
        else: rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# Load body grid
body_grid = json.load(open(os.path.join(VOXEL_DIR, 'grid.json')))
body_vs = body_grid['voxel_size']
body_ox, body_oy, body_oz = body_grid['grid_origin']
body_voxels = parse_vox(os.path.join(VOXEL_DIR, 'body.vox'))
body_set = set((v[0], v[1], v[2]) for v in body_voxels)
print(f"  body: {len(body_voxels)} voxels at {body_vs*1000:.2f}mm grid")

# Sub-grid voxel size
sub_vs = body_vs / SCALE_FACTOR
print(f"  sub-grid voxel_size: {sub_vs*1000:.2f}mm")

# 6-conn directions
DIRS_6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]

# For each body voxel in Z range, for each empty 6-neighbor,
# generate sub-grid voxels covering the face area + 1 sub_vs offset
output_voxels = set()  # sub-grid coords (relative to sub_origin)

# Sub-grid origin: align with body grid for clean indexing
# Each body voxel B covers sub-grid voxels [B*S, B*S+S) in each axis
sub_origin_x = body_ox
sub_origin_y = body_oy
sub_origin_z = body_oz

n_in_range = 0
for v in body_voxels:
    bx, by, bz = v[0], v[1], v[2]
    # World Z of body voxel center
    bwz = body_oz + (bz + 0.5) * body_vs
    if bwz < Z_MIN or bwz > Z_MAX: continue
    n_in_range += 1
    # For each 6-direction, check if neighbor is empty
    for dx, dy, dz in DIRS_6:
        nb = (bx+dx, by+dy, bz+dz)
        if nb in body_set: continue
        # Empty neighbor in direction (dx, dy, dz)
        # Generate 1 sub-grid layer just outside body face
        # The face area in sub-grid: 4x4 (S × S) on the perpendicular plane
        # Position: body voxel B's outermost sub-grid coords + 1 in direction
        S = SCALE_FACTOR
        # Body voxel B occupies sub-grid [bx*S, bx*S+S-1] etc.
        # Face in +x direction is at sub_x = bx*S + S - 0.5 (face plane)
        # Skin+1 voxel: sub_x = bx*S + S (just outside)
        # For -x: sub_x = bx*S - 1
        for ix in range(S):
            for iy in range(S):
                # 2D face indices on the perpendicular plane
                if dx != 0:
                    sub_x = bx*S + (S if dx > 0 else -1)
                    sub_y = by*S + ix
                    sub_z = bz*S + iy
                elif dy != 0:
                    sub_x = bx*S + ix
                    sub_y = by*S + (S if dy > 0 else -1)
                    sub_z = bz*S + iy
                else:  # dz != 0
                    sub_x = bx*S + ix
                    sub_y = by*S + iy
                    sub_z = bz*S + (S if dz > 0 else -1)
                # Skip if would land on a body voxel cell (sub-grid coord falls in body's coverage)
                # Convert sub coord back to body voxel coord
                bbx = sub_x // S
                bby = sub_y // S
                bbz = sub_z // S
                if (bbx, bby, bbz) in body_set: continue
                output_voxels.add((sub_x, sub_y, sub_z))

print(f"  body voxels in Z range: {n_in_range}")
print(f"  generated sub-grid voxels: {len(output_voxels)}")

# Compute grid bounds for output
if not output_voxels:
    print("ERROR: no voxels generated"); sys.exit(1)

xs = [v[0] for v in output_voxels]; ys = [v[1] for v in output_voxels]; zs = [v[2] for v in output_voxels]
sub_min_x, sub_max_x = min(xs), max(xs)
sub_min_y, sub_max_y = min(ys), max(ys)
sub_min_z, sub_max_z = min(zs), max(zs)

# New grid origin in world coord
new_origin = [
    sub_origin_x + sub_min_x * sub_vs,
    sub_origin_y + sub_min_y * sub_vs,
    sub_origin_z + sub_min_z * sub_vs,
]
gx = sub_max_x - sub_min_x + 1
gy = sub_max_y - sub_min_y + 1
gz = sub_max_z - sub_min_z + 1

print(f"\n  output grid: {gx}x{gy}x{gz}")

# Re-index voxels relative to new origin
final_voxels = [(v[0]-sub_min_x, v[1]-sub_min_y, v[2]-sub_min_z, 1) for v in output_voxels]

# Handle multi-chunk if gz > 256
out_grid = {
    "voxel_size": sub_vs,
    "grid_origin": new_origin,
    "gx": gx, "gy": gy, "gz": gz,
    "scale_factor": SCALE_FACTOR,
    "parent_voxel_size": body_vs,
}

if gz > 256:
    # Split into chunks along Z
    chunks = []
    chunk_idx = 1
    z_start = 0
    while z_start < gz:
        z_end = min(z_start + 256, gz)
        chunk_voxels = [(v[0], v[1], v[2]-z_start, v[3]) for v in final_voxels if z_start <= v[2] < z_end]
        chunk_path = os.path.join(VOXEL_DIR, f"{OUT_PREFIX}_c{chunk_idx}.vox")
        write_vox(chunk_path, gx, gy, z_end-z_start, chunk_voxels, color=(102, 0, 170, 255))
        chunks.append({
            "vox_file": f"{OUT_PREFIX}_c{chunk_idx}.vox",
            "grid_origin": [new_origin[0], new_origin[1], new_origin[2] + z_start * sub_vs],
            "gx": gx, "gy": gy, "gz": z_end-z_start,
            "voxel_count": len(chunk_voxels),
        })
        print(f"  chunk c{chunk_idx}: {len(chunk_voxels)} voxels")
        z_start = z_end
        chunk_idx += 1
    out_grid["chunks"] = chunks
    out_grid["split_axis"] = "z"
else:
    write_vox(os.path.join(VOXEL_DIR, f"{OUT_PREFIX}.vox"), gx, gy, gz, final_voxels, color=(102, 0, 170, 255))
    print(f"  single .vox: {len(final_voxels)} voxels")

# Remove old chunk files if any
for n in range(1, 10):
    old = os.path.join(VOXEL_DIR, f"{OUT_PREFIX}_c{n}.vox")
    if os.path.exists(old) and 'chunks' not in out_grid:
        os.remove(old)
        print(f"  removed old chunk: {old}")

with open(os.path.join(VOXEL_DIR, f"{OUT_PREFIX}.grid.json"), 'w') as f:
    json.dump(out_grid, f, indent=1)

# Minimal weights.json
weights = {
    "bones": ["c_root_bend.x"],
    "weights": [[[0, 1.0]] for _ in final_voxels],
    "voxel_count": len(final_voxels),
    "note": f"body skin+1 layer (Z range {Z_MIN}~{Z_MAX}m)"
}
with open(os.path.join(VOXEL_DIR, f"{OUT_PREFIX}.weights.json"), 'w') as f:
    json.dump(weights, f)
print(f"\n=== DONE: {len(final_voxels)} skin+1 voxels ===")
