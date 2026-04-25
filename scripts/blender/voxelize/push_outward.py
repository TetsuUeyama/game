"""衣装・装飾パーツの voxel を body 衝突から外側に押し出す。

body の voxel 群を衝突判定マスクとして読み、対象 part の voxel が body 内部に
ある場合、body 中心 (X, Y 重心) から離れる方向に XY 平面で段階的に押し出す。
Z (高さ) は保持。

典型ユース:
  - mirror_part_lr.py で左右ミラーした後、右側が body にめり込む箇所を修正
  - 衣装ボクセルと body ボクセルの僅かな不整合 (非対称グリッド等) を補正

Usage:
  python push_outward.py <out_dir> <prefix> [--body body] [--max-step 20]

処理後:
  - <prefix>.vox         push 後の voxel で上書き
  - <prefix>.weights.json voxel 順と同じ並びに対応する weights を保持
"""
import sys, os, json, struct, math

# --- args ---
def parse_args():
    if len(sys.argv) < 3:
        print("Usage: python push_outward.py <out_dir> <prefix> [--body body] [--max-step 20]")
        sys.exit(1)
    out_dir = sys.argv[1]
    prefix = sys.argv[2]
    body_prefix = 'body'
    max_step = 20
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--body' and i + 1 < len(sys.argv):
            body_prefix = sys.argv[i+1]; i += 2; continue
        if a == '--max-step' and i + 1 < len(sys.argv):
            max_step = int(sys.argv[i+1]); i += 2; continue
        i += 1
    return out_dir, prefix, body_prefix, max_step

OUT_DIR, PREFIX, BODY_PREFIX, MAX_STEP = parse_args()

VOX_PATH = os.path.join(OUT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(OUT_DIR, f"{PREFIX}.weights.json")
BODY_VOX_PATH = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")

for p in (VOX_PATH, WEIGHTS_PATH, BODY_VOX_PATH):
    if not os.path.exists(p):
        print(f"ERROR: {p} not found"); sys.exit(1)

# --- .vox parse ---
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
print(f"  body: {len(body_voxels)} voxels (collision mask)")

with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']
assert len(weights_list) == len(part_voxels)

# --- body set + body centroid (XY) ---
body_set = set((x, y, z) for (x, y, z, _) in body_voxels)
if not body_set:
    print("ERROR: body set is empty"); sys.exit(1)

# body 表面 + 局所外向き法線を計算 (push 方向として使用)
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
surface_normals = {}
for (x, y, z) in body_set:
    ux = uy = uz = 0.0; empty = 0
    for (dx, dy, dz) in DIRS6:
        if (x+dx, y+dy, z+dz) not in body_set:
            ux += dx; uy += dy; uz += dz; empty += 1
    if empty == 0: continue
    length = math.sqrt(ux*ux + uy*uy + uz*uz)
    if length < 0.1:
        surface_normals[(x, y, z)] = (0.0, 1.0, 0.0)  # default outward=+Y
    else:
        surface_normals[(x, y, z)] = (ux/length, uy/length, uz/length)
print(f"  body surface voxels with normals: {len(surface_normals)}")
print(f"  max-step: {MAX_STEP} voxels")

# 最寄り body 表面 voxel 探索用の Z 別索引
surface_by_z = {}
for pos in surface_normals:
    surface_by_z.setdefault(pos[2], []).append(pos)
Z_SEARCH = 12

def nearest_surface(x, y, z):
    best = None; best_d2 = 1e18
    for dz in range(-Z_SEARCH, Z_SEARCH + 1):
        zz = z + dz
        if zz not in surface_by_z: continue
        for (sx_, sy_, sz_) in surface_by_z[zz]:
            ddx = sx_ - x; ddy = sy_ - y; ddz = sz_ - z
            d2 = ddx*ddx + ddy*ddy + ddz*ddz
            if d2 < best_d2:
                best_d2 = d2; best = (sx_, sy_, sz_)
    return best

# --- push loop ---
moved = 0
not_escaped = 0
collisions = 0
new_voxels = []
new_weights = []
occupied_new = set()

# voxel と weight は同じ順で並んでいるので zip
for (v, wl) in zip(part_voxels, weights_list):
    x, y, z, ci = v
    if (x, y, z) not in body_set:
        # 衝突なし: そのまま
        if (x, y, z) in occupied_new:
            continue  # すでに他の voxel が移動してきた
        occupied_new.add((x, y, z))
        new_voxels.append(v)
        new_weights.append(wl)
        continue

    collisions += 1
    # 最寄り body 表面の局所法線を採用 (胸・背など曲面に正しく垂直な方向)
    ns = nearest_surface(x, y, z)
    if ns is None:
        # surface 未検出 → 放射フォールバック (XY)
        scx = sum(px for (px, _, _) in body_set) / max(1, len(body_set))
        scy = sum(py for (_, py, _) in body_set) / max(1, len(body_set))
        dx = x - scx; dy = y - scy
        length = math.sqrt(dx*dx + dy*dy)
        if length < 0.5: ux, uy, uz = 1.0, 0.0, 0.0
        else: ux, uy, uz = dx/length, dy/length, 0.0
    else:
        ux, uy, uz = surface_normals[ns]

    escaped = False
    for step in range(1, MAX_STEP + 1):
        nx = x + int(round(ux * step))
        ny = y + int(round(uy * step))
        nz = z + int(round(uz * step))
        if nx < 0 or nx >= gx or ny < 0 or ny >= gy or nz < 0 or nz >= gz: break
        if (nx, ny, nz) in body_set: continue
        if (nx, ny, nz) in occupied_new: continue
        new_voxels.append((nx, ny, nz, ci))
        new_weights.append(wl)
        occupied_new.add((nx, ny, nz))
        moved += 1
        escaped = True
        break
    if not escaped:
        # 脱出できず → 元位置に残す (問題voxel として記録)
        if (x, y, z) not in occupied_new:
            occupied_new.add((x, y, z))
            new_voxels.append(v)
            new_weights.append(wl)
        not_escaped += 1

print(f"  collisions: {collisions} voxels inside body")
print(f"    moved: {moved}")
print(f"    not escaped (kept in place): {not_escaped}")
print(f"  total output: {len(new_voxels)} voxels")

# --- write back ---
def write_vox(path, sx, sy, sz, voxels, pal):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels:
        xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
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
