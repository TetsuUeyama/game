"""voxel の interior を除去し、薄い shell にする。

Usage:
  python erode_interior.py <out_dir> <prefix> [--layers 2] [--threshold 5]

  --layers N: N 回繰り返す (default 2)
  --threshold K: 6 面隣接中 K 以上が solid な voxel を除去 (default 5)
     6: pure interior のみ (≥1 empty neighbor の全 voxel 残る = 1-layer shell 目標だが厚い)
     5: 1 つしか空きない voxel も除去 → より薄い shell
     4: より積極的
"""
import sys, os, json, struct

def parse_args():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    layers = 2; threshold = 5
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--layers' and i+1 < len(sys.argv): layers = int(sys.argv[i+1]); i += 2; continue
        if a == '--threshold' and i+1 < len(sys.argv): threshold = int(sys.argv[i+1]); i += 2; continue
        i += 1
    return out_dir, prefix, layers, threshold

OUT_DIR, PREFIX, LAYERS, THRESHOLD = parse_args()

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

VOX_PATH = os.path.join(OUT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(OUT_DIR, f"{PREFIX}.weights.json")

part_voxels, gx, gy, gz, palette = parse_vox(VOX_PATH)
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']

# pos → index
pos_to_idx = {}
for idx, (x, y, z, ci) in enumerate(part_voxels):
    pos_to_idx[(x, y, z)] = idx

DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
print(f"  input: {len(part_voxels)} voxels, erode {LAYERS} passes, threshold={THRESHOLD}/6")

current = set(pos_to_idx.keys())
for pass_i in range(LAYERS):
    to_remove = set()
    for (x, y, z) in current:
        # 6 方向 solid 隣接カウント
        count = 0
        for (dx, dy, dz) in DIRS6:
            if (x+dx, y+dy, z+dz) in current: count += 1
        if count >= THRESHOLD:
            to_remove.add((x, y, z))
    current -= to_remove
    print(f"  pass {pass_i+1}: removed {len(to_remove)} voxels (remaining {len(current)})")
    if not to_remove: break

# 残した voxel で再構築
new_voxels = []; new_weights = []
for (x, y, z) in sorted(current):
    idx = pos_to_idx[(x, y, z)]
    _, _, _, ci = part_voxels[idx]
    new_voxels.append((x, y, z, ci))
    new_weights.append(weights_list[idx])

write_vox(VOX_PATH, gx, gy, gz, new_voxels, palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}: {len(new_voxels)} voxels (from {len(part_voxels)})")
