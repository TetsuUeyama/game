"""body.vox + body.weights.json + bone_map.json から region_*.vox (部位ごとのボクセル)
を生成する汎用ツール。ARP/Rigify 非依存 — bone_map で bone→region 分類済みの前提。

Usage:
  python generate_regions_from_weights.py <body_dir>

  body_dir/
    body.vox, body.weights.json, bone_map.json, grid.json  が入力。
    body_dir/regions/region_*.vox を出力。

各 voxel について「最も weight の大きい bone → その region」に分類。
region='unknown' は出力しない。
"""
import sys, os, json, struct

if len(sys.argv) < 2:
    print(__doc__); sys.exit(1)

BODY_DIR = sys.argv[1]
OUT_DIR = os.path.join(BODY_DIR, 'regions')
os.makedirs(OUT_DIR, exist_ok=True)

# --- load ---
with open(os.path.join(BODY_DIR, 'grid.json')) as f: grid = json.load(f)
with open(os.path.join(BODY_DIR, 'bone_map.json'), encoding='utf-8') as f:
    bone_to_region = json.load(f).get('bone_map', {})
with open(os.path.join(BODY_DIR, 'body.weights.json'), encoding='utf-8') as f:
    bw = json.load(f)
body_bones = bw['bones']
body_weights = bw['weights']

# --- vox parse/write ---
def parse_vox(path):
    with open(path, 'rb') as f: data = f.read()
    sx = sy = sz = 0; voxels = []; palette = []
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
            elif cid == 'RGBA':
                for i in range(256):
                    r, g, b, a = struct.unpack_from('<BBBB', data, cs+i*4)
                    palette.append((r, g, b, a))
            off += 12 + csz + chz
    parse_chunks(8, len(data))
    return voxels, sx, sy, sz, palette

def write_vox(path, sx, sy, sz, voxels, pal):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels: xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
    rd = b''
    for i in range(256):
        if i < len(pal):
            rd += struct.pack('<BBBB', pal[i][0], pal[i][1], pal[i][2], pal[i][3])
        else:
            rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

body_voxels, gx, gy, gz, pal = parse_vox(os.path.join(BODY_DIR, 'body.vox'))
print(f"  body.vox: {len(body_voxels)} voxels, grid {gx}x{gy}x{gz}")

# --- classify each voxel by dominant bone region ---
region_voxels = {}
region_stats = {}
assert len(body_voxels) == len(body_weights), f"vox={len(body_voxels)} != weights={len(body_weights)}"

for (v, wl) in zip(body_voxels, body_weights):
    region_score = {}
    for (bi, w) in wl:
        bn = body_bones[bi] if bi < len(body_bones) else None
        if bn is None: continue
        r = bone_to_region.get(bn)
        if r is None or r == 'unknown': continue
        region_score[r] = region_score.get(r, 0) + w
    if not region_score: continue
    r = max(region_score.items(), key=lambda x: x[1])[0]
    region_voxels.setdefault(r, []).append(v)
    region_stats[r] = region_stats.get(r, 0) + 1

print(f"  regions:")
for r in sorted(region_stats.keys()):
    print(f"    {r:16s}: {region_stats[r]}")

# --- write region_*.vox ---
for r, vl in region_voxels.items():
    out_path = os.path.join(OUT_DIR, f"region_{r}.vox")
    write_vox(out_path, gx, gy, gz, vl, pal)
    print(f"    -> {out_path} ({len(vl)} voxels)")

# --- write bone_region_map.json (metadata) ---
brm = {
    'grid': {'gx': gx, 'gy': gy, 'gz': gz},
    'regions': list(region_voxels.keys()),
    'region_voxel_counts': region_stats,
}
with open(os.path.join(OUT_DIR, 'bone_region_map.json'), 'w', encoding='utf-8') as f:
    json.dump(brm, f, ensure_ascii=False, indent=1)
print(f"  -> {OUT_DIR}/bone_region_map.json")
