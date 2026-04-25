"""衣装 voxel を body 表面の 1-layer シェルに再生成する (隙間ゼロ保証)。

project_to_layer が「衣装 voxel → nearest 表面」で collision に敗けて穴を作るのに対し、
本スクリプトは「body 表面 → 近くに衣装 voxel があればシェルを置く」と逆走査するため
body 表面に穴が空くことがない (guaranteed coverage)。

Usage:
  python build_body_shell.py <out_dir> <prefix> [--body body] [--layer 1] [--radius 4]

手順:
  1. body.vox から body surface + 局所外向き法線を計算
  2. 現在の <prefix>.vox の voxel を source として保持 (色/weight 継承用)
  3. 各 body surface voxel S について:
       - 半径 R (voxel 単位) 内に source voxel があるか
       - あれば最寄り source を選び、S + N × normal の位置に shell voxel を配置
       - 色/weight は最寄り source から継承
  4. 結果を <prefix>.vox に書き戻す

Usage:
  python build_body_shell.py <out_dir> <prefix> [--body body] [--layer 1] [--radius 4]
"""
import sys, os, json, struct, math

def parse_args():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    body_prefix = 'body'; layer = 1; radius = 4
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--body' and i+1 < len(sys.argv): body_prefix = sys.argv[i+1]; i += 2; continue
        if a == '--layer' and i+1 < len(sys.argv): layer = int(sys.argv[i+1]); i += 2; continue
        if a == '--radius' and i+1 < len(sys.argv): radius = int(sys.argv[i+1]); i += 2; continue
        i += 1
    return out_dir, prefix, body_prefix, layer, radius

OUT_DIR, PREFIX, BODY_PREFIX, LAYER, RADIUS = parse_args()

VOX_PATH = os.path.join(OUT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(OUT_DIR, f"{PREFIX}.weights.json")
BODY_VOX_PATH = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")
for p in (VOX_PATH, WEIGHTS_PATH, BODY_VOX_PATH):
    if not os.path.exists(p): print(f"ERROR: {p} not found"); sys.exit(1)

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

# --- load ---
source_voxels, gx, gy, gz, palette = parse_vox(VOX_PATH)
body_voxels, _, _, _, _ = parse_vox(BODY_VOX_PATH)
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
source_weights = weights_obj['weights']
assert len(source_weights) == len(source_voxels)

print(f"  source (clothing): {len(source_voxels)} voxels")
print(f"  body: {len(body_voxels)} voxels")

body_set = set((x, y, z) for (x, y, z, _) in body_voxels)
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]

# body 表面 + 局所外向き法線
surface_normals = {}
for (x, y, z) in body_set:
    ux = uy = uz = 0.0; empty = 0
    for (dx, dy, dz) in DIRS6:
        if (x+dx, y+dy, z+dz) not in body_set:
            ux += dx; uy += dy; uz += dz; empty += 1
    if empty == 0: continue
    length = math.sqrt(ux*ux + uy*uy + uz*uz)
    if length < 0.1:
        surface_normals[(x, y, z)] = (0.0, 0.0, 1.0)
    else:
        surface_normals[(x, y, z)] = (ux/length, uy/length, uz/length)
print(f"  body surface: {len(surface_normals)} voxels")

# source voxels を (index → pos) で保持 + 空間ハッシュ (XY でバケット)
source_pos = [(v[0], v[1], v[2]) for v in source_voxels]
source_ci = [v[3] for v in source_voxels]
source_by_z = {}
for idx, (x, y, z) in enumerate(source_pos):
    source_by_z.setdefault(z, []).append(idx)

def nearest_source(x, y, z):
    """(x,y,z) から R 内の nearest source voxel index を返す (3D euclidean)"""
    best = -1; best_d2 = RADIUS * RADIUS + 1
    for dz in range(-RADIUS, RADIUS + 1):
        zz = z + dz
        if zz not in source_by_z: continue
        for idx in source_by_z[zz]:
            sx, sy, sz = source_pos[idx]
            ddx = sx - x; ddy = sy - y; ddz = sz - z
            d2 = ddx*ddx + ddy*ddy + ddz*ddz
            if d2 < best_d2:
                best_d2 = d2; best = idx
    return best

# body 表面を走査し、近くに source があれば shell voxel を置く
shell_map = {}  # (tx, ty, tz) -> (ci, weight_idx)
placed = 0
for (sp, normal) in surface_normals.items():
    sx, sy, sz = sp
    nidx = nearest_source(sx, sy, sz)
    if nidx < 0: continue  # source が近くにない → shell 不要 (衣装で覆われない領域)
    # target = S + layer × normal
    tx = int(round(sx + normal[0] * LAYER))
    ty = int(round(sy + normal[1] * LAYER))
    tz = int(round(sz + normal[2] * LAYER))
    if tx < 0 or tx >= gx or ty < 0 or ty >= gy or tz < 0 or tz >= gz: continue
    if (tx, ty, tz) in body_set: continue  # body 内なら skip
    key = (tx, ty, tz)
    if key in shell_map: continue
    shell_map[key] = (source_ci[nidx], nidx)
    placed += 1

print(f"  shell voxels placed: {placed}")

# 出力
sorted_keys = sorted(shell_map.keys())
new_voxels = [(k[0], k[1], k[2], shell_map[k][0]) for k in sorted_keys]
new_weights = [source_weights[shell_map[k][1]] for k in sorted_keys]

write_vox(VOX_PATH, gx, gy, gz, new_voxels, palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}: {len(new_voxels)} voxels")
