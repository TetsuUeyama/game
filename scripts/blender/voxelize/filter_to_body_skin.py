"""Filter sub-grid clothing voxels to keep only those that are at body skin + 1 voxel.

各 sub-grid voxel について:
  - world 位置を計算
  - 最近 body voxel との world 距離を計算
  - body voxel の中心から half_body_vs (= body 表面) より外側 かつ
    half_body_vs + sub_vs * tolerance より内側 の voxel を保持
  → body 表面に sub_vs 1 個分の薄い shell として残す

Usage:
  python filter_to_body_skin.py <voxel_dir> <prefix> [<tolerance_voxels>]
"""
import sys, os, json, struct, shutil, math
from collections import defaultdict

if len(sys.argv) < 3:
    print(__doc__); sys.exit(1)
VOXEL_DIR = sys.argv[1]; PREFIX = sys.argv[2]
TOLERANCE = float(sys.argv[3]) if len(sys.argv) >= 4 else 1.5  # sub_vs unit

print(f"\n=== Filter to body skin+1 ===")
print(f"  prefix: {PREFIX}, tolerance: {TOLERANCE} sub_vs")

def parse_vox(path):
    with open(path,'rb') as f: d=f.read()
    voxels = []; palette = []
    sx = sy = sz = 0
    i = d.find(b'SIZE')
    if i >= 0: sx, sy, sz = struct.unpack_from('<III', d, i+12)
    i = d.find(b'XYZI')
    if i >= 0:
        cnt = struct.unpack_from('<I', d, i+12)[0]
        for j in range(cnt):
            x,y,z,c = struct.unpack_from('<BBBB', d, i+16+j*4)
            voxels.append((x,y,z,c))
    i = d.find(b'RGBA')
    if i >= 0:
        for j in range(256):
            r,g,b,a = struct.unpack_from('<BBBB', d, i+12+j*4)
            palette.append((r,g,b,a))
    return voxels, sx, sy, sz, palette

def write_vox(path, sx, sy, sz, voxels, palette):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels: xd += struct.pack('<BBBB', *v)
    rd = b''
    for j in range(256):
        if j < len(palette): rd += struct.pack('<BBBB', *palette[j])
        else: rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# Load body
body_grid = json.load(open(os.path.join(VOXEL_DIR, 'grid.json')))
body_vs = body_grid['voxel_size']
body_ox, body_oy, body_oz = body_grid['grid_origin']
body_voxels, _, _, _, _ = parse_vox(os.path.join(VOXEL_DIR, 'body.vox'))
print(f"  body: {len(body_voxels)} voxels at {body_vs*1000:.2f}mm grid")

# Build body voxel set in body voxel coord
body_set = set((v[0], v[1], v[2]) for v in body_voxels)

# Load sub-grid clothing
g_path = os.path.join(VOXEL_DIR, f'{PREFIX}.grid.json')
g = json.load(open(g_path))
sub_vs = g['voxel_size']
print(f"  clothing sub-grid: voxel_size={sub_vs*1000:.2f}mm")

# Backup
for f in os.listdir(VOXEL_DIR):
    if f.startswith(PREFIX) and ('.vox' in f) and 'preFilter' not in f and 'preDilate' not in f and 'preSrcDeflate' not in f and 'testblock' not in f:
        if f.endswith('.vox'):
            src = os.path.join(VOXEL_DIR, f)
            bak = src.replace('.vox', '.preFilter.bak.vox')
            if not os.path.exists(bak):
                shutil.copy2(src, bak)

vox_files = []
if 'chunks' in g:
    vox_files = [(c['vox_file'], c['gx'], c['gy'], c['gz'], c['grid_origin']) for c in g['chunks']]
else:
    vox_files = [(f'{PREFIX}.vox', g['gx'], g['gy'], g['gz'], g['grid_origin'])]

# tolerance in world units
TOL_WORLD = TOLERANCE * sub_vs

total_in = 0; total_kept = 0
n_inside = 0; n_too_far = 0; n_kept = 0

for vf, gx, gy, gz, origin in vox_files:
    p = os.path.join(VOXEL_DIR, vf)
    voxels, sx, sy, sz, palette = parse_vox(p)
    cox, coy, coz = origin
    in_count = len(voxels)
    total_in += in_count

    kept = []
    for v in voxels:
        x, y, z, ci = v
        # world position of voxel center
        wx = cox + (x + 0.5) * sub_vs
        wy = coy + (y + 0.5) * sub_vs
        wz = coz + (z + 0.5) * sub_vs
        # corresponding body voxel coord (truncate)
        bx = (wx - body_ox) / body_vs
        by = (wy - body_oy) / body_vs
        bz = (wz - body_oz) / body_vs
        bxi, byi, bzi = int(bx), int(by), int(bz)
        # If V_world is INSIDE a body voxel: drop (overlap)
        if (bxi, byi, bzi) in body_set:
            n_inside += 1
            continue
        # Find nearest body voxel and compute world distance
        best_d = 1e18
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    if (bxi+dx, byi+dy, bzi+dz) in body_set:
                        # body voxel center world
                        bwx = body_ox + (bxi+dx + 0.5) * body_vs
                        bwy = body_oy + (byi+dy + 0.5) * body_vs
                        bwz = body_oz + (bzi+dz + 0.5) * body_vs
                        # world distance
                        d = math.sqrt((wx-bwx)**2 + (wy-bwy)**2 + (wz-bwz)**2)
                        if d < best_d: best_d = d
        # body voxel half size + tolerance
        # body voxel face is at body_vs/2 from center → distance from face = best_d - body_vs/2
        # Keep if face_distance ≤ TOL_WORLD
        face_d = best_d - body_vs / 2
        if face_d > TOL_WORLD:
            n_too_far += 1
            continue
        kept.append(v)
        n_kept += 1
    total_kept += len(kept)
    write_vox(p, sx, sy, sz, kept, palette)
    if 'chunks' in g:
        for ch in g['chunks']:
            if ch['vox_file'] == vf:
                ch['voxel_count'] = len(kept)
                break
    print(f"  {vf}: {in_count} -> {len(kept)}")

with open(g_path, 'w') as f: json.dump(g, f, indent=1)

print(f"\nResult:")
print(f"  total input: {total_in}")
print(f"  inside body (dropped): {n_inside}")
print(f"  too far from body (dropped): {n_too_far}")
print(f"  kept (skin+1 layer): {n_kept}")
print(f"  total kept: {total_kept} ({total_kept/total_in*100:.1f}%)")
print(f"=== DONE ===")
