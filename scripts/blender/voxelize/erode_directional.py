"""指定方向の外側 voxel のみを削除する (directional erosion)。

座標系 (grid):
  -Y = 前 (キャラ正面), +Y = 後ろ (背面)
  -X = 右, +X = 左 (キャラ基準)
  -Z = 下, +Z = 上

Usage:
  python erode_directional.py <out_dir> <prefix> [--from front,left,right,back,top,bottom]

  --from front: -Y 方向の外側 voxel を削除 (voxel 群を -Y 面から 1 voxel 薄く)
  --from left,right: ±X 方向の外側削除 (左右薄く)
  複数指定可 (カンマ区切り)、各 1 voxel 分 erode

例: 前 + 左右から 1 voxel 削る
  python erode_directional.py public/box5/qm_mustardui de_armor_legs --from front,left,right
"""
import sys, os, json, struct

def parse_args():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    sides = []
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--from' and i+1 < len(sys.argv):
            sides = [s.strip() for s in sys.argv[i+1].split(',')]; i += 2; continue
        i += 1
    return out_dir, prefix, sides

OUT_DIR, PREFIX, SIDES = parse_args()

SIDE_TO_DIR = {
    'front': (0, -1, 0),   # -Y
    'back':  (0,  1, 0),   # +Y
    'left':  (1,  0, 0),   # +X (キャラ左は Blender +X が一般的)
    'right': (-1, 0, 0),   # -X
    'top':   (0,  0, 1),   # +Z
    'bottom':(0,  0,-1),   # -Z
}

dirs = []
for s in SIDES:
    if s in SIDE_TO_DIR: dirs.append((s, SIDE_TO_DIR[s]))
print(f"  erode from: {[s for s, _ in dirs]}")

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
with open(WEIGHTS_PATH, encoding='utf-8') as f: weights_obj = json.load(f)
weights_list = weights_obj['weights']

pos_set = set((x, y, z) for (x, y, z, _) in part_voxels)
print(f"  input: {len(part_voxels)} voxels")

# voxel を残す条件: 「erode 対象方向の "外側" ではない」
# "外側 in 方向 d" = voxel V について、 V + (-d) 位置に voxel がない
# (つまり d 方向の外側表面に露出している)
# その voxel を削除。
# 各方向個別に判定、いずれかで「外側」なら削除。
to_remove = set()
for (x, y, z) in pos_set:
    for (name, d) in dirs:
        # voxel V が方向 d の「外側」(= -d 方向に voxel なし) なら削除
        neighbor = (x - d[0], y - d[1], z - d[2])
        if neighbor not in pos_set:
            to_remove.add((x, y, z)); break

print(f"  removed: {len(to_remove)}")
new_voxels = []; new_weights = []
for (v, wl) in zip(part_voxels, weights_list):
    if (v[0], v[1], v[2]) in to_remove: continue
    new_voxels.append(v); new_weights.append(wl)

write_vox(VOX_PATH, gx, gy, gz, new_voxels, palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}: {len(new_voxels)} voxels")
