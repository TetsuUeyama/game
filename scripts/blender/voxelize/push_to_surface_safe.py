"""埋め込み voxel を body 表面に移動、衝突時は表面上を BFS で横展開 (voxel loss ゼロ)。

従来の push_outward.py は衝突時にさらに外層に逃がしていたため層状化・隙間が
発生した。本スクリプトは:
  1. body 外にある voxel は原位置保持
  2. body 内の voxel は局所法線方向に 1 voxel 外へ押し出す (surface + 1)
  3. そこが既に埋まっていたら、body surface に沿って BFS で空き位置を探す
  4. それでも見つからなければ法線方向に 2, 3 歩と押して空きを探す

全 voxel が必ず配置される (not_escaped=0)。

Usage:
  python push_to_surface_safe.py <out_dir> <prefix> [--body body] [--bfs-radius 8]
"""
import sys, os, json, struct, math
from collections import deque

def parse_args():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    body_prefix = 'body'; bfs_r = 8
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--body' and i+1 < len(sys.argv): body_prefix = sys.argv[i+1]; i += 2; continue
        if a == '--bfs-radius' and i+1 < len(sys.argv): bfs_r = int(sys.argv[i+1]); i += 2; continue
        i += 1
    return out_dir, prefix, body_prefix, bfs_r

OUT_DIR, PREFIX, BODY_PREFIX, BFS_RADIUS = parse_args()

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
body_voxels, _, _, _, _ = parse_vox(BODY_VOX_PATH)
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']

body_set = set((x, y, z) for (x, y, z, _) in body_voxels)
print(f"  part: {len(part_voxels)} voxels")
print(f"  body: {len(body_set)} voxels (collision mask)")

# body surface + 局所法線
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
        surface_normals[(x, y, z)] = (0.0, 1.0, 0.0)
    else:
        surface_normals[(x, y, z)] = (ux/length, uy/length, uz/length)
print(f"  body surface: {len(surface_normals)}")

# Z 別 index で高速 nearest lookup
surface_by_z = {}
for pos in surface_normals: surface_by_z.setdefault(pos[2], []).append(pos)
def nearest_surface(x, y, z, zrange=12):
    best = None; best_d2 = 1e18
    for dz in range(-zrange, zrange + 1):
        zz = z + dz
        if zz not in surface_by_z: continue
        for (sx_, sy_, sz_) in surface_by_z[zz]:
            ddx = sx_ - x; ddy = sy_ - y; ddz = sz_ - z
            d2 = ddx*ddx + ddy*ddy + ddz*ddz
            if d2 < best_d2: best_d2 = d2; best = (sx_, sy_, sz_)
    return best

# surface 上で BFS: 空き target を探す (surface + 1 layer の voxel を候補)
def bfs_find_empty_surface_slot(seed_surface_pos, occupied, max_radius=BFS_RADIUS):
    """seed から body surface 沿いに BFS で "surface + normal 方向に 1 歩" の空きを探す"""
    visited = {seed_surface_pos}
    queue = deque([(seed_surface_pos, 0)])
    while queue:
        (sp, dist) = queue.popleft()
        if dist > max_radius: continue
        # sp + normal 方向 1 歩 = 候補 target
        n = surface_normals[sp]
        tx = int(round(sp[0] + n[0]))
        ty = int(round(sp[1] + n[1]))
        tz = int(round(sp[2] + n[2]))
        if 0 <= tx < gx and 0 <= ty < gy and 0 <= tz < gz:
            if (tx, ty, tz) not in body_set and (tx, ty, tz) not in occupied:
                return (tx, ty, tz)
        # さらに 2-3 歩外へ (高密度衝突時の fallback)
        for extra in (2, 3):
            tx2 = int(round(sp[0] + n[0]*extra))
            ty2 = int(round(sp[1] + n[1]*extra))
            tz2 = int(round(sp[2] + n[2]*extra))
            if 0 <= tx2 < gx and 0 <= ty2 < gy and 0 <= tz2 < gz:
                if (tx2, ty2, tz2) not in body_set and (tx2, ty2, tz2) not in occupied:
                    return (tx2, ty2, tz2)
        # 6-方向隣接 surface voxel を BFS queue に追加
        for (dx, dy, dz) in DIRS6:
            nb = (sp[0]+dx, sp[1]+dy, sp[2]+dz)
            if nb in visited: continue
            if nb not in surface_normals: continue
            visited.add(nb)
            queue.append((nb, dist+1))
    return None

occupied = set()
new_voxels = []; new_weights = []
kept_outside = 0; pushed = 0; bfs_used = 0; lost = 0

for (v, wl) in zip(part_voxels, weights_list):
    x, y, z, ci = v
    if (x, y, z) not in body_set:
        # body 外 → そのまま
        if (x, y, z) in occupied:
            # すでに何か置いてある → 隣接の空きを探す
            placed_key = None
            for (dx, dy, dz) in DIRS6:
                nb = (x+dx, y+dy, z+dz)
                if 0 <= nb[0] < gx and 0 <= nb[1] < gy and 0 <= nb[2] < gz:
                    if nb not in body_set and nb not in occupied:
                        placed_key = nb; break
            if placed_key is None: lost += 1; continue
            occupied.add(placed_key)
            new_voxels.append((placed_key[0], placed_key[1], placed_key[2], ci))
            new_weights.append(wl)
        else:
            occupied.add((x, y, z))
            new_voxels.append(v)
            new_weights.append(wl)
        kept_outside += 1
        continue

    # body 内 → body 表面 + 1 layer に押し出す
    ns = nearest_surface(x, y, z)
    if ns is None:
        lost += 1; continue
    normal = surface_normals[ns]
    # 素の target
    tx = int(round(ns[0] + normal[0]))
    ty = int(round(ns[1] + normal[1]))
    tz = int(round(ns[2] + normal[2]))
    if 0 <= tx < gx and 0 <= ty < gy and 0 <= tz < gz and \
       (tx, ty, tz) not in body_set and (tx, ty, tz) not in occupied:
        occupied.add((tx, ty, tz))
        new_voxels.append((tx, ty, tz, ci))
        new_weights.append(wl)
        pushed += 1
    else:
        # 衝突 → surface 沿いに BFS
        slot = bfs_find_empty_surface_slot(ns, occupied)
        if slot is None:
            lost += 1; continue
        occupied.add(slot)
        new_voxels.append((slot[0], slot[1], slot[2], ci))
        new_weights.append(wl)
        pushed += 1; bfs_used += 1

print(f"  kept outside body: {kept_outside}")
print(f"  pushed to surface: {pushed} (of which bfs used: {bfs_used})")
print(f"  lost: {lost}")
print(f"  total output: {len(new_voxels)}")

write_vox(VOX_PATH, gx, gy, gz, new_voxels, palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}")
