"""Dilate sub-grid voxel set by N steps (6-conn).

For each existing voxel, add voxels at all 6 neighbors. Result: shell becomes
~2N voxels thicker, ensuring visible coverage.

Per-chunk processing (preserves multi-chunk file layout).

Usage:
  python dilate_subgrid_voxels.py <voxel_dir> <prefix> [<dilate_steps>]
"""
import sys, os, json, struct, shutil
from collections import defaultdict

if len(sys.argv) < 3:
    print(__doc__); sys.exit(1)
VOXEL_DIR = sys.argv[1]; PREFIX = sys.argv[2]
N_STEPS = int(sys.argv[3]) if len(sys.argv) >= 4 else 1

print(f"\n=== Dilate sub-grid voxels ===")
print(f"  prefix: {PREFIX}, steps: {N_STEPS}")

# Backup
for ext in ['.vox']:
    src = os.path.join(VOXEL_DIR, f'{PREFIX}{ext}')
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(VOXEL_DIR, f'{PREFIX}.preDilate.bak{ext}'))

def parse_vox(path):
    with open(path,'rb') as f: d=f.read()
    voxels = []; palette = []
    sx = sy = sz = 0
    i = d.find(b'SIZE')
    if i >= 0:
        sx, sy, sz = struct.unpack_from('<III', d, i+12)
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
        if j < len(palette):
            rd += struct.pack('<BBBB', *palette[j])
        else:
            rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# Read grid.json
g_path = os.path.join(VOXEL_DIR, f'{PREFIX}.grid.json')
with open(g_path) as f: g = json.load(f)

# Determine vox files
if 'chunks' in g:
    vox_files = [(c['vox_file'], c['gx'], c['gy'], c['gz']) for c in g['chunks']]
else:
    vox_files = [(f'{PREFIX}.vox', g['gx'], g['gy'], g['gz'])]

DIRS_6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]

total_in = 0; total_out = 0
for vf, gx, gy, gz in vox_files:
    p = os.path.join(VOXEL_DIR, vf)
    voxels, sx, sy, sz, palette = parse_vox(p)
    in_count = len(voxels)
    total_in += in_count
    occupied = {(v[0], v[1], v[2]): v[3] for v in voxels}
    cur = dict(occupied)
    for step in range(N_STEPS):
        nxt = dict(cur)
        for (x,y,z), c in cur.items():
            for dx,dy,dz in DIRS_6:
                nx, ny, nz = x+dx, y+dy, z+dz
                if 0 <= nx < gx and 0 <= ny < gy and 0 <= nz < gz:
                    if (nx, ny, nz) not in nxt:
                        nxt[(nx, ny, nz)] = c  # inherit color from source
        cur = nxt
    out_voxels = [(x, y, z, c) for (x,y,z), c in cur.items()]
    out_count = len(out_voxels)
    total_out += out_count
    write_vox(p, sx, sy, sz, out_voxels, palette)
    if 'chunks' in g:
        for ch in g['chunks']:
            if ch['vox_file'] == vf:
                ch['voxel_count'] = out_count
                break
    print(f"  {vf}: {in_count} -> {out_count}")

# Update grid.json
with open(g_path, 'w') as f:
    json.dump(g, f, indent=1)

print(f"\nTotal: {total_in} -> {total_out} voxels (x{total_out/total_in:.2f})")
print(f"=== DONE ===")
