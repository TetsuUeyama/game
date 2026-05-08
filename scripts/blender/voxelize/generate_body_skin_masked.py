"""Generate body skin+1 sub-grid voxels constrained by a mask of original clothing.

各 body voxel について 1 sub_vs 外側の sub-grid voxel を候補とし、
原 clothing voxel の半径 R 以内にある候補のみ保持。
これで「紐しかない場所」は除外される（mask が無いので候補も無効）。

Usage:
  python generate_body_skin_masked.py <voxel_dir> <out_prefix> <mask_prefix_with_chunks>
    [<z_min> <z_max>] [<scale_factor>] [<mask_radius_voxels>]

Example:
  python generate_body_skin_masked.py public/box5/qm_mustardui helena_witch_leggings \
    helena_witch_leggings.preFilter.bak 0.0 1.0 4 3
"""
import sys, os, json, struct
from collections import defaultdict

if len(sys.argv) < 4:
    print(__doc__); sys.exit(1)
VOXEL_DIR = sys.argv[1]; OUT_PREFIX = sys.argv[2]; MASK_PREFIX = sys.argv[3]
Z_MIN = float(sys.argv[4]) if len(sys.argv) >= 5 else 0.0
Z_MAX = float(sys.argv[5]) if len(sys.argv) >= 6 else 1.0
SCALE_FACTOR = int(sys.argv[6]) if len(sys.argv) >= 7 else 4
MASK_RADIUS = int(sys.argv[7]) if len(sys.argv) >= 8 else 3  # sub_vs unit

print(f"\n=== Generate masked body skin+1 ===")
print(f"  out: {OUT_PREFIX}, mask: {MASK_PREFIX}")
print(f"  Z range: [{Z_MIN}, {Z_MAX}]m, scale: x{SCALE_FACTOR}, mask radius: {MASK_RADIUS}")

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

# Load body
body_grid = json.load(open(os.path.join(VOXEL_DIR, 'grid.json')))
body_vs = body_grid['voxel_size']
body_ox, body_oy, body_oz = body_grid['grid_origin']
body_voxels = parse_vox(os.path.join(VOXEL_DIR, 'body.vox'))
body_set = set((v[0], v[1], v[2]) for v in body_voxels)
print(f"  body: {len(body_voxels)} voxels at {body_vs*1000:.2f}mm")

sub_vs = body_vs / SCALE_FACTOR
print(f"  sub-grid voxel_size: {sub_vs*1000:.2f}mm")

# Load mask: try .grid.json first
mask_set = set()  # sub-grid coord (relative to common sub origin = body_origin)
mask_grid_path = os.path.join(VOXEL_DIR, f'{MASK_PREFIX}.grid.json')
sub_origin_x = body_ox; sub_origin_y = body_oy; sub_origin_z = body_oz

if os.path.exists(mask_grid_path):
    mask_grid = json.load(open(mask_grid_path))
    mask_vs = mask_grid['voxel_size']
    print(f"  mask grid found: vs={mask_vs*1000:.2f}mm")
    if 'chunks' in mask_grid:
        for ch in mask_grid['chunks']:
            cox, coy, coz = ch['grid_origin']
            for x, y, z, c in parse_vox(os.path.join(VOXEL_DIR, ch['vox_file'])):
                wx = cox + (x + 0.5) * mask_vs
                wy = coy + (y + 0.5) * mask_vs
                wz = coz + (z + 0.5) * mask_vs
                # Convert to common sub-grid coord
                sx = int((wx - sub_origin_x) / sub_vs)
                sy = int((wy - sub_origin_y) / sub_vs)
                sz = int((wz - sub_origin_z) / sub_vs)
                mask_set.add((sx, sy, sz))
    else:
        cox, coy, coz = mask_grid['grid_origin']
        mp = os.path.join(VOXEL_DIR, f'{MASK_PREFIX}.vox')
        if os.path.exists(mp):
            for x, y, z, c in parse_vox(mp):
                wx = cox + (x + 0.5) * mask_vs
                wy = coy + (y + 0.5) * mask_vs
                wz = coz + (z + 0.5) * mask_vs
                sx = int((wx - sub_origin_x) / sub_vs)
                sy = int((wy - sub_origin_y) / sub_vs)
                sz = int((wz - sub_origin_z) / sub_vs)
                mask_set.add((sx, sy, sz))
else:
    # Try preFilter.bak chunks directly (no grid.json)
    print(f"  no mask grid.json, trying chunked .vox files directly")
    # Find chunks: helena_witch_leggings_c1.preFilter.bak.vox etc
    base = MASK_PREFIX.replace('.preFilter.bak', '')
    for fname in os.listdir(VOXEL_DIR):
        if fname.startswith(base + '_c') and fname.endswith('.preFilter.bak.vox'):
            # Need original chunk's grid_origin from existing OUT_PREFIX or fall back
            # Use a heuristic: assume same origin pattern
            print(f"  loading {fname}")
            # Not enough info without grid.json - will fall back
    print(f"  WARNING: mask incomplete without grid.json. Using whole body skin (no masking).")

print(f"  mask voxels in common sub-grid: {len(mask_set)}")

# Build a fast lookup for "near mask"
DIRS_6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
S = SCALE_FACTOR

def is_near_mask(sx, sy, sz, R):
    if not mask_set: return True  # no mask: keep all
    for dx in range(-R, R+1):
        for dy in range(-R, R+1):
            for dz in range(-R, R+1):
                if dx*dx + dy*dy + dz*dz > R*R: continue
                if (sx+dx, sy+dy, sz+dz) in mask_set: return True
    return False

# Generate candidates: body skin+1 in Z range
output_voxels = set()
n_in_range = 0
n_candidates = 0
n_near_mask = 0

for v in body_voxels:
    bx, by, bz = v[0], v[1], v[2]
    bwz = body_oz + (bz + 0.5) * body_vs
    if bwz < Z_MIN or bwz > Z_MAX: continue
    n_in_range += 1
    for dx, dy, dz in DIRS_6:
        nb = (bx+dx, by+dy, bz+dz)
        if nb in body_set: continue
        # Generate face sub-grid coords
        for ix in range(S):
            for iy in range(S):
                if dx != 0:
                    sub_x = bx*S + (S if dx > 0 else -1)
                    sub_y = by*S + ix
                    sub_z = bz*S + iy
                elif dy != 0:
                    sub_x = bx*S + ix
                    sub_y = by*S + (S if dy > 0 else -1)
                    sub_z = bz*S + iy
                else:
                    sub_x = bx*S + ix
                    sub_y = by*S + iy
                    sub_z = bz*S + (S if dz > 0 else -1)
                bbx = sub_x // S; bby = sub_y // S; bbz = sub_z // S
                if (bbx, bby, bbz) in body_set: continue
                n_candidates += 1
                if is_near_mask(sub_x, sub_y, sub_z, MASK_RADIUS):
                    output_voxels.add((sub_x, sub_y, sub_z))
                    n_near_mask += 1

print(f"\n  body voxels in Z range: {n_in_range}")
print(f"  candidate sub-grid voxels: {n_candidates}")
print(f"  near mask (kept): {n_near_mask}")
print(f"  unique output: {len(output_voxels)}")

if not output_voxels:
    print("ERROR: no voxels"); sys.exit(1)

xs = [v[0] for v in output_voxels]; ys = [v[1] for v in output_voxels]; zs = [v[2] for v in output_voxels]
sub_min_x, sub_max_x = min(xs), max(xs)
sub_min_y, sub_max_y = min(ys), max(ys)
sub_min_z, sub_max_z = min(zs), max(zs)

new_origin = [
    sub_origin_x + sub_min_x * sub_vs,
    sub_origin_y + sub_min_y * sub_vs,
    sub_origin_z + sub_min_z * sub_vs,
]
gx = sub_max_x - sub_min_x + 1
gy = sub_max_y - sub_min_y + 1
gz = sub_max_z - sub_min_z + 1
print(f"  output grid: {gx}x{gy}x{gz}")

final_voxels = [(v[0]-sub_min_x, v[1]-sub_min_y, v[2]-sub_min_z, 1) for v in output_voxels]

out_grid = {
    "voxel_size": sub_vs,
    "grid_origin": new_origin,
    "gx": gx, "gy": gy, "gz": gz,
    "scale_factor": SCALE_FACTOR,
    "parent_voxel_size": body_vs,
}

# Clean up old chunks
for n in range(1, 10):
    old = os.path.join(VOXEL_DIR, f"{OUT_PREFIX}_c{n}.vox")
    if os.path.exists(old): os.remove(old)
old_main = os.path.join(VOXEL_DIR, f"{OUT_PREFIX}.vox")
if os.path.exists(old_main): os.remove(old_main)

if gz > 256:
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
    write_vox(old_main, gx, gy, gz, final_voxels, color=(102, 0, 170, 255))
    print(f"  single .vox: {len(final_voxels)} voxels")

with open(os.path.join(VOXEL_DIR, f"{OUT_PREFIX}.grid.json"), 'w') as f:
    json.dump(out_grid, f, indent=1)

weights = {
    "bones": ["c_root_bend.x"],
    "weights": [[[0, 1.0]] for _ in final_voxels],
    "voxel_count": len(final_voxels),
    "note": f"body skin+1 masked by {MASK_PREFIX} (R={MASK_RADIUS}), Z={Z_MIN}~{Z_MAX}m"
}
with open(os.path.join(VOXEL_DIR, f"{OUT_PREFIX}.weights.json"), 'w') as f:
    json.dump(weights, f)
print(f"\n=== DONE ===")
