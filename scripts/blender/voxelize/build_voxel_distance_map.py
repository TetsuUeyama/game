"""Build per-voxel source body distance via K-nearest fitted vertices.

各 voxel について QM 空間の fitted vertex 群から半径 R 内にあるものを集め、
逆距離重み付け平均で source_distance を割り当てる。

R 内に vertex が見つからない voxel は target=None (= deflate スキップ) とし、
sparse な drape 領域での誤マッピングを防ぐ。

Usage:
  python build_voxel_distance_map.py <voxel_dir> <prefix> <bake_json> [<radius_voxels>]

Outputs:
  <voxel_dir>/<prefix>.weights.json (updated with source_body_distance + confidence)
"""
import sys, os, json, struct, math
from collections import defaultdict

if len(sys.argv) < 4:
    print(__doc__); sys.exit(1)
VOXEL_DIR = sys.argv[1]; PREFIX = sys.argv[2]; BAKE_JSON = sys.argv[3]
R_VOXELS = int(sys.argv[4]) if len(sys.argv) >= 5 else 3  # default 3 voxels (~21mm)

print(f"\n=== Build voxel distance map (K-nearest weighted) ===")
print(f"  voxel_dir:  {VOXEL_DIR}")
print(f"  prefix:     {PREFIX}")
print(f"  bake_json:  {BAKE_JSON}")
print(f"  R_voxels:   {R_VOXELS}")

def parse_vox(path):
    with open(path, 'rb') as f: data = f.read()
    sx = sy = sz = 0; voxels = []
    def parse_chunks(start, end):
        nonlocal sx, sy, sz
        off = start
        while off < end:
            if off + 12 > end: break
            cid = data[off:off+4].decode('ascii', errors='replace')
            csz = struct.unpack_from('<I', data, off+4)[0]
            chz = struct.unpack_from('<I', data, off+8)[0]
            cs = off + 12
            if cid == 'MAIN': parse_chunks(cs+csz, cs+csz+chz)
            elif cid == 'SIZE': sx, sy, sz = struct.unpack_from('<III', data, cs)
            elif cid == 'XYZI':
                count = struct.unpack_from('<I', data, cs)[0]
                for i in range(count):
                    x, y, z, ci = struct.unpack_from('<BBBB', data, cs+4+i*4)
                    voxels.append((x, y, z, ci))
            off += 12 + csz + chz
    parse_chunks(8, len(data))
    return voxels, sx, sy, sz

# --- Load grid ---
with open(os.path.join(VOXEL_DIR, 'grid.json')) as f:
    grid = json.load(f)
vs = grid['voxel_size']
ox, oy, oz = grid['grid_origin']
print(f"\n[1] Grid: voxel_size={vs*1000:.2f}mm, origin=({ox:.3f}, {oy:.3f}, {oz:.3f})")

# --- Load voxels ---
vox_path = os.path.join(VOXEL_DIR, f"{PREFIX}.vox")
voxels, gx, gy, gz = parse_vox(vox_path)
print(f"[2] Voxels: {len(voxels)} in {gx}x{gy}x{gz}")

# --- Load weights.json ---
weights_path = os.path.join(VOXEL_DIR, f"{PREFIX}.weights.json")
with open(weights_path, encoding='utf-8') as f:
    weights_data = json.load(f)
print(f"[3] Weights: {len(weights_data.get('weights', []))} entries")

# --- Load bake JSON ---
with open(BAKE_JSON, encoding='utf-8') as f:
    bake = json.load(f)
print(f"[4] Bake: {bake['vertex_count']} vertices")

# --- Convert vertices to voxel-space positions ---
vert_data = []  # (vx_float, vy_float, vz_float, source_distance)
for v in bake['vertices']:
    qp = v.get('qm_pos')
    if qp is None: continue
    vfx = (qp[0] - ox) / vs - 0.5
    vfy = (qp[1] - oy) / vs - 0.5
    vfz = (qp[2] - oz) / vs - 0.5
    vert_data.append((vfx, vfy, vfz, v['source_distance']))
print(f"[5] Vertex world->voxel-space conversion: {len(vert_data)} entries")

# --- Bucket vertices into 3D grid for fast spatial query ---
# Grid cell size = R_VOXELS, so each query searches 3x3x3 = 27 cells
bucket_size = R_VOXELS
def bucket_key(vx, vy, vz):
    return (int(math.floor(vx / bucket_size)),
            int(math.floor(vy / bucket_size)),
            int(math.floor(vz / bucket_size)))
buckets = defaultdict(list)
for vd in vert_data:
    buckets[bucket_key(vd[0], vd[1], vd[2])].append(vd)
print(f"[6] Spatial buckets: {len(buckets)} (bucket_size={bucket_size} voxels)")

# --- Per-voxel weighted average ---
print(f"[7] Compute per-voxel target distance (radius={R_VOXELS} voxels)")
target_distances = [None] * len(voxels)
confidences = [0] * len(voxels)  # 0=no nearby vertex, N>0=count of nearby vertices

R2 = R_VOXELS * R_VOXELS
for i, (vx, vy, vz, _) in enumerate(voxels):
    bk = bucket_key(vx, vy, vz)
    weighted_sum = 0.0
    weight_total = 0.0
    n_nearby = 0
    # Check 3x3x3 neighbor buckets
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                k = (bk[0]+dx, bk[1]+dy, bk[2]+dz)
                if k not in buckets: continue
                for (fx, fy, fz, sd) in buckets[k]:
                    ddx = fx - vx; ddy = fy - vy; ddz = fz - vz
                    d2 = ddx*ddx + ddy*ddy + ddz*ddz
                    if d2 > R2: continue
                    # Inverse-distance² weighting (epsilon for d=0)
                    w = 1.0 / (d2 + 0.01)
                    weighted_sum += sd * w
                    weight_total += w
                    n_nearby += 1
    if n_nearby > 0:
        target_distances[i] = weighted_sum / weight_total
        confidences[i] = n_nearby

n_assigned = sum(1 for t in target_distances if t is not None)
print(f"  assigned: {n_assigned} / {len(voxels)} ({100*n_assigned/len(voxels):.1f}%)")
print(f"  unassigned (drape area, leave alone): {len(voxels) - n_assigned}")

# --- Stats ---
valid = [d for d in target_distances if d is not None]
print(f"\n[8] Target distance stats (mm) - assigned voxels only:")
if valid:
    print(f"  count: {len(valid)}")
    print(f"  min:   {min(valid)*1000:.1f}")
    print(f"  avg:   {sum(valid)/len(valid)*1000:.1f}")
    print(f"  max:   {max(valid)*1000:.1f}")
    hist = [0]*11
    for d in valid:
        b = min(int(d*100), 10); hist[b] += 1
    for b, c in enumerate(hist):
        label = f"{b}-{b+1}cm" if b < 10 else ">10cm"
        print(f"  {label:>6}: {c} voxels")

# --- Update weights.json ---
weights_data['source_body_distance'] = [round(d, 5) if d is not None else None for d in target_distances]
weights_data['source_body_distance_unit'] = 'meters'
weights_data['source_body_distance_confidence'] = confidences
with open(weights_path, 'w', encoding='utf-8') as f:
    json.dump(weights_data, f, ensure_ascii=False, indent=0)
print(f"\n[9] Updated {weights_path}")
print(f"=== DONE ===")
