"""Voxel-level layer alignment + push-out, phased approach.

Phase A: Body region (torso, hip, legs, head, neck, shoulder, breast)
  - Z-layer alignment: shift in (X, Y) per Z layer (small clamp for stability)
  - 2D push in (X, Y) at fixed Z → external_cells

Phase B: Arm region (upper arm, forearm, hand)
  - X-layer alignment: shift in (Y, Z) per X column (Z larger for T-pose→A-pose 角度補正)
  - 2D push in (Y, Z) at fixed X → external_cells

External cells = non-body cells reachable from grid boundary via flood fill.
Internal cavities (2-layered body) excluded from push targets.

Usage:
  python align_clothing_by_layer.py <out_dir> <body_prefix> <clothing_prefix>
"""
import sys, os, json, struct
from collections import defaultdict

if len(sys.argv) < 4:
    print(__doc__); sys.exit(1)
OUT_DIR = sys.argv[1]; BODY_PREFIX = sys.argv[2]; CLOTH_PREFIX = sys.argv[3]
MAX_SHIFT = 2  # voxels (~14mm), small to preserve dress detail

def clamp(v, lim):
    if lim <= 0: return int(v)
    return int(max(-lim, min(lim, v)))

# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
print(f"=== Voxel Layer Alignment (phased) ===")
print(f"  body={BODY_PREFIX} clothing={CLOTH_PREFIX} max_shift={MAX_SHIFT}")

body_path = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")
cloth_path = os.path.join(OUT_DIR, f"{CLOTH_PREFIX}.vox")
weights_path = os.path.join(OUT_DIR, f"{CLOTH_PREFIX}.weights.json")

body_voxels, gx, gy, gz, _ = parse_vox(body_path)
body_set = set((v[0], v[1], v[2]) for v in body_voxels)
print(f"  body: {len(body_voxels)} voxels in {gx}x{gy}x{gz}")

cloth_voxels, cgx, cgy, cgz, palette = parse_vox(cloth_path)
with open(weights_path, encoding='utf-8') as f:
    cloth_data = json.load(f)
bone_names = cloth_data['bones']
weights_per_voxel = cloth_data['weights']
print(f"  clothing: {len(cloth_voxels)} voxels")

# ---------------------------------------------------------------------------
# Classify by top bone:
#   arm bones (forearm, hand, upper_arm) → arm.l/r (X-layer phase)
#   それ以外 (spine, breast, head, neck, shoulder, thigh, leg) → body (Z-layer phase)
def classify(weight_list):
    if not weight_list: return 'body'
    top_idx = weight_list[0][0]
    top_bone = bone_names[top_idx] if top_idx < len(bone_names) else ''
    if any(s in top_bone for s in ('arm_stretch', 'forearm_stretch', 'hand.')):
        if top_bone.endswith('.l'): return 'arm.l'
        if top_bone.endswith('.r'): return 'arm.r'
    return 'body'

regions = [classify(w) for w in weights_per_voxel]
print(f"  classify: body={regions.count('body')} "
      f"arm.l={regions.count('arm.l')} arm.r={regions.count('arm.r')}")

# ---------------------------------------------------------------------------
# [1] Z-layer bbox center for body alignment + push direction
print(f"\n[1] Body Z-layer references")
body_z = defaultdict(list)
for v in body_voxels:
    body_z[v[2]].append((v[0], v[1]))

body_z_bbox = {}
for z, pts in body_z.items():
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    body_z_bbox[z] = ((min(xs)+max(xs))/2.0, (min(ys)+max(ys))/2.0)

# Body Z-layer alignment shifts
cloth_body_z = defaultdict(list)
for i, (cv, r) in enumerate(zip(cloth_voxels, regions)):
    if r == 'body': cloth_body_z[cv[2]].append(i)

raw_shifts_z = {}
for z, idxs in cloth_body_z.items():
    if z not in body_z: continue
    bxc, byc = body_z_bbox[z]
    cxs = [cloth_voxels[i][0] for i in idxs]
    cys = [cloth_voxels[i][1] for i in idxs]
    cxc = (min(cxs)+max(cxs))/2.0
    cyc = (min(cys)+max(cys))/2.0
    raw_shifts_z[z] = (bxc-cxc, byc-cyc)

# Smoothing across Z
zs_sorted = sorted(raw_shifts_z.keys())
smooth_shifts_z = {}
for i, z in enumerate(zs_sorted):
    neigh = [raw_shifts_z[zs_sorted[j]] for j in (i-1, i, i+1) if 0 <= j < len(zs_sorted)]
    sx = sum(s[0] for s in neigh) / len(neigh)
    sy = sum(s[1] for s in neigh) / len(neigh)
    smooth_shifts_z[z] = (sx, sy)

# ---------------------------------------------------------------------------
# [2] X-layer references for arm region (alignment shift + push direction)
print(f"[2] Arm X-layer references")
hip_z_threshold = sorted(v[2] for v in body_voxels)[len(body_voxels) * 35 // 100]

body_arm_x = defaultdict(list)
for v in body_voxels:
    if v[2] >= hip_z_threshold:
        body_arm_x[v[0]].append((v[1], v[2]))

body_arm_x_bbox = {}
for x, pts in body_arm_x.items():
    ys = [p[0] for p in pts]; zs = [p[1] for p in pts]
    body_arm_x_bbox[x] = ((min(ys)+max(ys))/2.0, (min(zs)+max(zs))/2.0)

# Arm X-layer alignment shifts (T-pose Helena → QM A-pose 角度補正)
cloth_arm_x = {'arm.l': defaultdict(list), 'arm.r': defaultdict(list)}
for i, (cv, r) in enumerate(zip(cloth_voxels, regions)):
    if r in cloth_arm_x:
        cloth_arm_x[r][cv[0]].append(i)

def per_x_shifts(arm_dict):
    raw = {}
    for x, idxs in arm_dict.items():
        if x not in body_arm_x_bbox: continue
        byc, bzc = body_arm_x_bbox[x]
        cys = [cloth_voxels[i][1] for i in idxs]
        czs = [cloth_voxels[i][2] for i in idxs]
        cyc = (min(cys)+max(cys))/2.0
        czc = (min(czs)+max(czs))/2.0
        raw[x] = (byc-cyc, bzc-czc)
    xs = sorted(raw.keys())
    smooth = {}
    for i, x in enumerate(xs):
        neigh = [raw[xs[j]] for j in (i-1, i, i+1) if 0 <= j < len(xs)]
        sy = sum(s[0] for s in neigh) / len(neigh)
        sz = sum(s[1] for s in neigh) / len(neigh)
        smooth[x] = (sy, sz)
    return smooth

shifts_arm_l = per_x_shifts(cloth_arm_x['arm.l'])
shifts_arm_r = per_x_shifts(cloth_arm_x['arm.r'])

def adaptive_arm_z_clamp(x):
    """X 位置で body の Z 範囲が広い (= 肩-腕境界) と小さく clamp、
    狭い (= 純粋な前腕/手) と大きく clamp。region-aware Z 補正。"""
    b_zs = [p[1] for p in body_arm_x.get(x, [])]
    if not b_zs: return MAX_SHIFT
    z_range = max(b_zs) - min(b_zs)
    if z_range > 40: return 3    # 肩-腕境界: ほぼ shift 無し
    if z_range > 20: return 10   # 中間
    return 40                     # 純粋な前腕/手: 十分 (T-pose→A-pose)

# ---------------------------------------------------------------------------
# [3] Apply alignment shifts (Body Z-layer + Arm X-layer)
print(f"[3] Apply alignment shifts")
shifted_cloth = []
shifted_regions = []
for cv, cw, r in zip(cloth_voxels, weights_per_voxel, regions):
    nx, ny, nz = cv[0], cv[1], cv[2]
    if r == 'body' and cv[2] in smooth_shifts_z:
        dx, dy = smooth_shifts_z[cv[2]]
        nx += clamp(dx, MAX_SHIFT); ny += clamp(dy, MAX_SHIFT)
    elif r == 'arm.l' and cv[0] in shifts_arm_l:
        dy, dz = shifts_arm_l[cv[0]]
        ny += clamp(dy, MAX_SHIFT); nz += clamp(dz, adaptive_arm_z_clamp(cv[0]))
    elif r == 'arm.r' and cv[0] in shifts_arm_r:
        dy, dz = shifts_arm_r[cv[0]]
        ny += clamp(dy, MAX_SHIFT); nz += clamp(dz, adaptive_arm_z_clamp(cv[0]))
    if 0 <= nx < cgx and 0 <= ny < cgy and 0 <= nz < cgz:
        shifted_cloth.append((nx, ny, nz, cv[3]))
        shifted_regions.append(r)
    else:
        shifted_cloth.append(cv)
        shifted_regions.append(r)

# ---------------------------------------------------------------------------
# [4] Flood fill from grid boundary: external cells (true outside body)
print(f"\n[4] Flood fill external cells")
DIRS_6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
DIRS_8 = [(da, db) for da in (-1,0,1) for db in (-1,0,1) if (da,db) != (0,0)]
DIRS_26 = [(dx, dy, dz) for dx in (-1,0,1) for dy in (-1,0,1) for dz in (-1,0,1)
           if (dx,dy,dz) != (0,0,0)]

external_cells = set()
queue = []
for x in (0, cgx-1):
    for y in range(cgy):
        for z in range(cgz):
            if (x, y, z) not in body_set:
                external_cells.add((x, y, z)); queue.append((x, y, z))
for y in (0, cgy-1):
    for x in range(cgx):
        for z in range(cgz):
            if (x, y, z) not in body_set and (x, y, z) not in external_cells:
                external_cells.add((x, y, z)); queue.append((x, y, z))
for z in (0, cgz-1):
    for x in range(cgx):
        for y in range(cgy):
            if (x, y, z) not in body_set and (x, y, z) not in external_cells:
                external_cells.add((x, y, z)); queue.append((x, y, z))
head = 0
while head < len(queue):
    cx, cy, cz = queue[head]; head += 1
    for dx, dy, dz in DIRS_6:
        nx, ny, nz = cx+dx, cy+dy, cz+dz
        if not (0 <= nx < cgx and 0 <= ny < cgy and 0 <= nz < cgz): continue
        if (nx, ny, nz) in body_set: continue
        if (nx, ny, nz) in external_cells: continue
        external_cells.add((nx, ny, nz))
        queue.append((nx, ny, nz))
total_grid = cgx * cgy * cgz
n_internal_cavity = total_grid - len(body_set) - len(external_cells)
print(f"  external cells: {len(external_cells)} / internal cavities: {n_internal_cavity}")

# Safe external = external cells with <= 1 body neighbor in 6-conn.
# Excludes cells touching body in 2+ directions (= narrow concavities).
print(f"  computing safe-external (<=1 body neighbor in 6-conn)...")
safe_external = set()
for cell in external_cells:
    x, y, z = cell
    body_neighbors = 0
    for dx, dy, dz in DIRS_6:
        if (x+dx, y+dy, z+dz) in body_set:
            body_neighbors += 1
            if body_neighbors > 1: break
    if body_neighbors <= 1:
        safe_external.add(cell)
print(f"  safe-external cells: {len(safe_external)} "
      f"(narrow gap excluded: {len(external_cells) - len(safe_external)})")

# ---------------------------------------------------------------------------
# True-external filter: exclude BIG inner cavity (体内空洞).
# 開口部 (首・足首) から flood fill が体内に到達するため、external_cells には
# body bbox の中身も含まれる。push 先として使えないので per-Z body bbox の
# 外側にある cells のみを true_external とする。
print(f"  filtering true-external (outside per-Z body bbox)...")
body_bbox_per_z = {}
for v in body_voxels:
    x, y, z = v[0], v[1], v[2]
    if z not in body_bbox_per_z:
        body_bbox_per_z[z] = [x, x, y, y]
    else:
        b = body_bbox_per_z[z]
        if x < b[0]: b[0] = x
        if x > b[1]: b[1] = x
        if y < b[2]: b[2] = y
        if y > b[3]: b[3] = y

def is_inside_body_bbox(cell):
    x, y, z = cell
    if z not in body_bbox_per_z: return False
    xmin, xmax, ymin, ymax = body_bbox_per_z[z]
    return xmin <= x <= xmax and ymin <= y <= ymax

true_external = set(c for c in safe_external if not is_inside_body_bbox(c))
print(f"  true-external (outside body bbox): {len(true_external)} "
      f"(excluded BIG inner cavity: {len(safe_external) - len(true_external)})")
safe_external = true_external

# Per-Z body XY centroid (radial fallback 用)
body_centroid_per_z = {}
_z_counts = {}
for v in body_voxels:
    z = v[2]
    if z not in body_centroid_per_z:
        body_centroid_per_z[z] = [0.0, 0.0]
        _z_counts[z] = 0
    body_centroid_per_z[z][0] += v[0]
    body_centroid_per_z[z][1] += v[1]
    _z_counts[z] += 1
for z in body_centroid_per_z:
    n = _z_counts[z]
    body_centroid_per_z[z][0] /= n
    body_centroid_per_z[z][1] /= n

# Outer shell + outward normals (true_external 隣接の body voxel のみ)
import math
print(f"  computing outer shell normals...")
outer_shell_normals = {}  # (x,y,z) -> (nx, ny, nz)
for bv in body_voxels:
    bx, by, bz = bv[0], bv[1], bv[2]
    ux = uy = uz = 0.0
    n_external = 0
    for dx, dy, dz in DIRS_6:
        if (bx+dx, by+dy, bz+dz) in safe_external:
            ux += dx; uy += dy; uz += dz
            n_external += 1
    if n_external > 0:
        length = math.sqrt(ux*ux + uy*uy + uz*uz)
        if length > 1e-6:
            outer_shell_normals[(bx, by, bz)] = (ux/length, uy/length, uz/length)
print(f"  outer shell voxels: {len(outer_shell_normals)}")

# Index outer shell by Z for nearest-neighbor lookup
outer_by_z = defaultdict(list)
for pos, normal in outer_shell_normals.items():
    outer_by_z[pos[2]].append((pos, normal))

# ---------------------------------------------------------------------------
# [5] Unified push: shell-normal projection (body contour に沿った配置)。
#     各 cloth voxel について最寄り outer shell voxel を探し、その local 法線方向に
#     沿って voxel を配置 (cloth の lateral 位置は保持)。これで body のカーブに
#     沿った corset 形状が再現される。
#     Shell が見つからない場合: radial fallback (XY 重心方向)
#     それも失敗: BFS fallback
print(f"\n[5] Unified push (shell-normal projection, radial/BFS fallback)")

PUSH_MAX_RADIAL = 30
PUSH_MAX_BFS = 40
SHELL_SEARCH_Z = 4    # 上下 ±4 Z layer を検索
SHELL_SEARCH_R = 15   # XY 半径 ≤15 voxel
OFFSET_BASE = 1       # 体表から最低 1 voxel 外側

def shell_normal_push(x, y, z):
    """最寄り outer shell voxel + その法線方向への投影で push 先を決定。"""
    best_pos = None; best_norm = None; best_d2 = 1e18
    for dz in range(-SHELL_SEARCH_Z, SHELL_SEARCH_Z + 1):
        zz = z + dz
        if zz not in outer_by_z: continue
        for (sx, sy, sz), normal in outer_by_z[zz]:
            ddx = sx - x; ddy = sy - y; ddz = sz - z
            d2 = ddx*ddx + ddy*ddy + ddz*ddz
            if d2 > SHELL_SEARCH_R*SHELL_SEARCH_R: continue
            if d2 < best_d2:
                best_d2 = d2; best_pos = (sx, sy, sz); best_norm = normal
    if best_pos is None: return None
    sx, sy, sz = best_pos
    nx, ny, nz = best_norm
    # cloth 位置を「shell + lateral + 法線方向に max(原 depth, OFFSET)」へ投影
    cx_off = x - sx; cy_off = y - sy; cz_off = z - sz
    t = cx_off * nx + cy_off * ny + cz_off * nz  # 法線方向の符号付き距離
    lat_x = cx_off - t * nx
    lat_y = cy_off - t * ny
    lat_z = cz_off - t * nz
    new_t = max(t, OFFSET_BASE)  # 内側 (t<0) または近すぎ → OFFSET_BASE まで押す
    new_x = sx + new_t * nx + lat_x
    new_y = sy + new_t * ny + lat_y
    new_z = sz + new_t * nz + lat_z
    tx = int(round(new_x))
    ty = int(round(new_y))
    tz = int(round(new_z))
    if not (0 <= tx < cgx and 0 <= ty < cgy and 0 <= tz < cgz): return None
    # 投影先が safe_external でない場合は法線方向に push
    if (tx, ty, tz) in safe_external:
        return (tx, ty, tz)
    for extra in range(1, 6):
        tx2 = int(round(new_x + nx * extra))
        ty2 = int(round(new_y + ny * extra))
        tz2 = int(round(new_z + nz * extra))
        if not (0 <= tx2 < cgx and 0 <= ty2 < cgy and 0 <= tz2 < cgz): break
        if (tx2, ty2, tz2) in safe_external:
            return (tx2, ty2, tz2)
    return None

def radial_push(x, y, z):
    if z not in body_centroid_per_z: return None
    cx, cy = body_centroid_per_z[z]
    dx = x - cx; dy = y - cy
    length = math.sqrt(dx*dx + dy*dy)
    if length < 0.5: return None
    ux = dx / length; uy = dy / length
    for step in range(1, PUSH_MAX_RADIAL + 1):
        nx_ = int(round(x + ux * step))
        ny_ = int(round(y + uy * step))
        if not (0 <= nx_ < cgx and 0 <= ny_ < cgy): break
        if (nx_, ny_, z) in safe_external:
            return (nx_, ny_, z)
    return None

def bfs_push(x, y, z, max_steps=PUSH_MAX_BFS):
    visited = {(x, y, z)}
    q = [(0, x, y, z)]; head = 0
    while head < len(q):
        steps, cx, cy, cz = q[head]; head += 1
        if steps >= max_steps: continue
        for dx, dy, dz in DIRS_26:
            nx_, ny_, nz_ = cx+dx, cy+dy, cz+dz
            if (nx_, ny_, nz_) in visited: continue
            if not (0 <= nx_ < cgx and 0 <= ny_ < cgy and 0 <= nz_ < cgz): continue
            visited.add((nx_, ny_, nz_))
            if (nx_, ny_, nz_) in safe_external:
                return (nx_, ny_, nz_)
            q.append((steps+1, nx_, ny_, nz_))
    return None

push_method_counts = {'already': 0, 'shell': 0, 'radial': 0, 'bfs': 0, 'gave_up': 0}

def push_to_body_surface(x, y, z):
    if (x, y, z) in safe_external:
        push_method_counts['already'] += 1
        return (x, y, z)
    target = shell_normal_push(x, y, z)
    if target is not None:
        push_method_counts['shell'] += 1
        return target
    target = radial_push(x, y, z)
    if target is not None:
        push_method_counts['radial'] += 1
        return target
    target = bfs_push(x, y, z)
    if target is not None:
        push_method_counts['bfs'] += 1
        return target
    push_method_counts['gave_up'] += 1
    return None

PUSH_MAX_3D = PUSH_MAX_BFS  # for backward compat in histogram size

final_cloth = []
final_weights = []
n_pushed = 0; n_not_embedded = 0; n_gave_up = 0
push_distance_hist = [0] * (PUSH_MAX_3D + 1)

for cv, cw, r in zip(shifted_cloth, weights_per_voxel, shifted_regions):
    x, y, z, ci = cv
    if (x, y, z) in safe_external:
        final_cloth.append(cv); final_weights.append(cw)
        n_not_embedded += 1
        continue
    target = push_to_body_surface(x, y, z)
    if target is not None:
        tx, ty, tz = target
        final_cloth.append((tx, ty, tz, ci)); final_weights.append(cw)
        n_pushed += 1
        # Chebyshev distance for histogram
        d = max(abs(tx-x), abs(ty-y), abs(tz-z))
        push_distance_hist[min(d, PUSH_MAX_3D)] += 1
    else:
        final_cloth.append(cv); final_weights.append(cw)
        n_gave_up += 1

print(f"  not_embedded={n_not_embedded} pushed={n_pushed} gave_up={n_gave_up}")
print(f"  push method: shell={push_method_counts['shell']} "
      f"radial={push_method_counts['radial']} "
      f"bfs={push_method_counts['bfs']} gave_up={push_method_counts['gave_up']}")
print(f"  push distance histogram (Chebyshev voxels):")
for d, c in enumerate(push_distance_hist):
    if c > 0: print(f"    d={d:>2}: {c}")

# ---------------------------------------------------------------------------
print(f"\n[7] Save")
write_vox(cloth_path, cgx, cgy, cgz, final_cloth, palette)
cloth_data['weights'] = final_weights
cloth_data['voxel_count'] = len(final_cloth)
with open(weights_path, 'w', encoding='utf-8') as f:
    json.dump(cloth_data, f, ensure_ascii=False, indent=0)
print(f"  output: {len(final_cloth)} voxels → {cloth_path}")
print(f"\n=== DONE ===")
