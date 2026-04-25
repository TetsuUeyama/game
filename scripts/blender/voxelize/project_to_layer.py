"""Part voxel を body 表面から N voxel 外側の 1 層に投影する (厚さを揃えた薄いシェル化)。

各 part voxel について「最寄りの body 表面 voxel」を見つけ、その voxel の
局所外向き法線 (= 空いている 6-方向隣接の合成) に沿って LAYER 歩分 外に
target を置く。これにより腕・脚のように局所的に曲がる部位でも、局所的な
外向き方向で正しく薄いリング状のシェルが得られる。

snap_to_surface.py: body 表面と同居 (layer 0 相当)
push_outward.py:     body 内部のみ 1 voxel 外に押す
project_to_layer.py: 全 voxel を「nearest_surface + N × local_outward」に投影 ← 本スクリプト

Usage:
  python project_to_layer.py <out_dir> <prefix> [--body body] [--layer 1]
"""
import sys, os, json, struct, math

def parse_args():
    if len(sys.argv) < 3:
        print("Usage: python project_to_layer.py <out_dir> <prefix> [--body body] [--layer 1]")
        sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    body_prefix = 'body'; layer = 1
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--body' and i+1 < len(sys.argv): body_prefix = sys.argv[i+1]; i += 2; continue
        if a == '--layer' and i+1 < len(sys.argv): layer = int(sys.argv[i+1]); i += 2; continue
        i += 1
    return out_dir, prefix, body_prefix, layer

OUT_DIR, PREFIX, BODY_PREFIX, LAYER = parse_args()

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

part_voxels, gx, gy, gz, part_palette = parse_vox(VOX_PATH)
body_voxels, _, _, _, _ = parse_vox(BODY_VOX_PATH)
print(f"  part: {len(part_voxels)} voxels, {gx}x{gy}x{gz}")

with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']
assert len(weights_list) == len(part_voxels)

body_set = set((x, y, z) for (x, y, z, _) in body_voxels)
print(f"  body: {len(body_set)} voxels")

# --- body 表面 + 局所外向き法線を計算 ---
# normal = 空いている 6-方向の合計ベクトル (長さで正規化)
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
surface_normals = {}
for (x, y, z) in body_set:
    ux = uy = uz = 0.0
    empty = 0
    for (dx, dy, dz) in DIRS6:
        if (x+dx, y+dy, z+dz) not in body_set:
            ux += dx; uy += dy; uz += dz
            empty += 1
    if empty == 0: continue  # interior voxel
    length = math.sqrt(ux*ux + uy*uy + uz*uz)
    if length < 0.1:
        # balanced empty neighbors (rare) → fallback up
        surface_normals[(x, y, z)] = (0.0, 0.0, 1.0)
    else:
        surface_normals[(x, y, z)] = (ux/length, uy/length, uz/length)
print(f"  body surface: {len(surface_normals)} voxels (with outward normal)")

# --- part voxel → nearest surface + local normal で target 算出 ---
# 表面 voxel を Z でバケット化して探索を高速化 (腕/脚は Z 範囲狭い)
surface_by_z = {}
for pos in surface_normals:
    surface_by_z.setdefault(pos[2], []).append(pos)

moved = 0; failed = 0
new_voxels_map = {}  # (tx, ty, tz) -> (ci, weights)
# 最寄り探索は Z=v.z±Z_SEARCH_RANGE の範囲に限定
Z_SEARCH = 8

for (v, wl) in zip(part_voxels, weights_list):
    x, y, z, ci = v
    # 最寄り body 表面 voxel を探す (3D euclidean in limited Z range)
    best = None; best_d2 = 1e18
    for dz in range(-Z_SEARCH, Z_SEARCH + 1):
        zz = z + dz
        if zz not in surface_by_z: continue
        for (sx, sy, sz) in surface_by_z[zz]:
            dx_ = sx - x; dy_ = sy - y; dz_ = sz - z
            d2 = dx_*dx_ + dy_*dy_ + dz_*dz_
            if d2 < best_d2:
                best_d2 = d2; best = (sx, sy, sz)
    if best is None:
        failed += 1; continue
    nx, ny, nz = surface_normals[best]
    tx = int(round(best[0] + nx * LAYER))
    ty = int(round(best[1] + ny * LAYER))
    tz = int(round(best[2] + nz * LAYER))
    if tx < 0 or tx >= gx or ty < 0 or ty >= gy or tz < 0 or tz >= gz:
        failed += 1; continue
    key = (tx, ty, tz)
    if key not in new_voxels_map:
        new_voxels_map[key] = (ci, wl)
        moved += 1

print(f"  projected: {moved} voxels (failed: {failed})")
print(f"  output: {len(new_voxels_map)} voxels")

sorted_keys = sorted(new_voxels_map.keys())
new_voxels = [(k[0], k[1], k[2], new_voxels_map[k][0]) for k in sorted_keys]
new_weights = [new_voxels_map[k][1] for k in sorted_keys]

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

write_vox(VOX_PATH, gx, gy, gz, new_voxels, part_palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}")
print(f"  -> {WEIGHTS_PATH}")
