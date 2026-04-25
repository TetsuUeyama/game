"""衣装 voxel を全方向に膨張して隙間を塞ぐ (QM Default の dilate_parts_de.js と同ロジック)。

第 1 パス: 6 方向 (±X, ±Y, ±Z) に 1 voxel 膨張
第 2 パス: Y 方向 (キャラ前後) に追加で 1 voxel 膨張
結果: XZ+1, Y+2 の非対称膨張 — 1-voxel 幅の隙間を確実に塞ぐ

新規 voxel の色/weight は隣接 voxel から継承。
body voxel 内には膨張しない (collision mask)。

Usage:
  python dilate_clothing.py <out_dir> <prefix> [--body body] [--no-y-extra]
"""
import sys, os, json, struct

def parse_args():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    body_prefix = 'body'; y_extra = True
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--body' and i+1 < len(sys.argv): body_prefix = sys.argv[i+1]; i += 2; continue
        if a == '--no-y-extra': y_extra = False; i += 1; continue
        i += 1
    return out_dir, prefix, body_prefix, y_extra

OUT_DIR, PREFIX, BODY_PREFIX, Y_EXTRA = parse_args()

VOX_PATH = os.path.join(OUT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(OUT_DIR, f"{PREFIX}.weights.json")
BODY_VOX_PATH = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")

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

part_voxels, gx, gy, gz, palette = parse_vox(VOX_PATH)
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']

body_set = set()
if os.path.exists(BODY_VOX_PATH):
    body_v, _, _, _, _ = parse_vox(BODY_VOX_PATH)
    body_set = set((x, y, z) for (x, y, z, _) in body_v)

print(f"  part: {len(part_voxels)} voxels, {gx}x{gy}x{gz}")
print(f"  body: {len(body_set)} voxels (collision)")

# pos -> (ci, weights_idx)
pos_to_data = {}
for idx, (x, y, z, ci) in enumerate(part_voxels):
    pos_to_data[(x, y, z)] = (ci, idx)

def dilate_pass(dirs, label):
    added = 0
    # 現在の voxel を迭代、各方向の空きセルに新規 voxel を追加
    originals = list(pos_to_data.items())
    for (pos, (ci, idx)) in originals:
        x, y, z = pos
        for (dx, dy, dz) in dirs:
            nx, ny, nz = x + dx, y + dy, z + dz
            if nx < 0 or nx >= gx or ny < 0 or ny >= gy or nz < 0 or nz >= gz: continue
            np = (nx, ny, nz)
            if np in pos_to_data: continue
            if np in body_set: continue
            pos_to_data[np] = (ci, idx)  # 色/weight 継承
            added += 1
    print(f"  {label}: +{added} voxels (total {len(pos_to_data)})")

# 第 1 パス: 6 方向に 1 voxel 膨張
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
dilate_pass(DIRS6, "Pass 1: 6-direction dilate (XZ+1, Y+1)")

# 第 2 パス: Y 方向にさらに 1 voxel (透け防止の厚み)
if Y_EXTRA:
    Y_DIRS = [(0,1,0),(0,-1,0)]
    dilate_pass(Y_DIRS, "Pass 2: Y-direction extra dilate (Y+1 more, total Y+2)")

# 出力
sorted_keys = sorted(pos_to_data.keys())
new_voxels = [(k[0], k[1], k[2], pos_to_data[k][0]) for k in sorted_keys]
new_weights = [weights_list[pos_to_data[k][1]] for k in sorted_keys]

write_vox(VOX_PATH, gx, gy, gz, new_voxels, palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}: {len(new_voxels)} voxels")
