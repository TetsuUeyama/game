"""voxel を XYZ 方向にシフトする (後処理用ユーティリティ)。

Usage:
  python shift_voxels.py <out_dir> <prefix> --dx N --dy N --dz N

座標系: grid 座標
  +Y = 後ろ (キャラ背面方向)
  -Y = 前 (キャラ正面方向)
  +Z = 上
  -Z = 下
  +X = 右, -X = 左

例 (2 voxel 後ろ + 下):
  python shift_voxels.py public/box5/qm_mustardui de_armor_legs --dy 2 --dz -2
"""
import sys, os, json, struct

def parse_args():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    dx = dy = dz = 0
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--dx' and i+1 < len(sys.argv): dx = int(sys.argv[i+1]); i += 2; continue
        if a == '--dy' and i+1 < len(sys.argv): dy = int(sys.argv[i+1]); i += 2; continue
        if a == '--dz' and i+1 < len(sys.argv): dz = int(sys.argv[i+1]); i += 2; continue
        i += 1
    return out_dir, prefix, dx, dy, dz

OUT_DIR, PREFIX, DX, DY, DZ = parse_args()

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

voxels, gx, gy, gz, palette = parse_vox(VOX_PATH)
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']

print(f"  input: {len(voxels)} voxels, shift by ({DX}, {DY}, {DZ})")
new_voxels = []; new_weights = []; clipped = 0
for (v, wl) in zip(voxels, weights_list):
    nx, ny, nz, ci = v[0]+DX, v[1]+DY, v[2]+DZ, v[3]
    if nx<0 or nx>=gx or ny<0 or ny>=gy or nz<0 or nz>=gz:
        clipped += 1; continue
    new_voxels.append((nx, ny, nz, ci))
    new_weights.append(wl)
print(f"  output: {len(new_voxels)} voxels (clipped {clipped})")

write_vox(VOX_PATH, gx, gy, gz, new_voxels, palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}")
