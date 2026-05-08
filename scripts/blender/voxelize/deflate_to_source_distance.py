"""Source-distance-aware deflate/push.

各 cloth voxel を「QM body 表面 + source_body_distance」の位置に移動させる。
これにより Helena 元モデルの body-clothing 距離関係を QM-fit voxel で再現する:
  - 元で密着 (0mm) → QM body 隣接 voxel (body + 1) に snap
  - 元で 30mm 浮く → QM body から 30mm (≈ 4 voxel) 離れた位置
  - 元で 100mm 浮く drape → QM body から 100mm (≈ 14 voxel) 離れた位置を維持

Usage:
  python deflate_to_source_distance.py <out_dir> <body_prefix> <clothing_prefix>

前提:
  <clothing_prefix>.weights.json に `source_body_distance` 配列が必要
  (build_voxel_distance_map.py で生成)
"""
import sys, os, json, struct, math
from collections import defaultdict

if len(sys.argv) < 4:
    print(__doc__); sys.exit(1)
OUT_DIR = sys.argv[1]; BODY_PREFIX = sys.argv[2]; CLOTH_PREFIX = sys.argv[3]
MAX_SEARCH = 30  # 半径方向 body 探索の最大 voxel 数
# 1 voxel あたり最大 ±N voxel に移動を制限 (誤マッピング保護)
MAX_MOVE = int(sys.argv[4]) if len(sys.argv) >= 5 else 5
# 除外 bone (カンマ区切り)。これらへの合計 weight が EXCLUDE_THRESH を超える voxel は deflate しない。
# 例: leg drape を保護したい場合 "c_thigh_stretch.l,c_thigh_stretch.r,c_thigh_twist.l,c_thigh_twist.r"
EXCLUDE_BONES = sys.argv[5].split(',') if len(sys.argv) >= 6 else []
EXCLUDE_THRESH = float(sys.argv[6]) if len(sys.argv) >= 7 else 0.3

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

print(f"\n=== Source-distance-aware deflate ===")
print(f"  body={BODY_PREFIX} clothing={CLOTH_PREFIX}")

# --- Load grid ---
with open(os.path.join(OUT_DIR, 'grid.json')) as f:
    grid = json.load(f)
vs = grid['voxel_size']  # meters per voxel
print(f"  voxel_size: {vs*1000:.2f} mm")

# --- Load body ---
body_path = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")
body_voxels, gx, gy, gz, _ = parse_vox(body_path)
body_set = set((v[0], v[1], v[2]) for v in body_voxels)
print(f"  body: {len(body_voxels)} voxels in {gx}x{gy}x{gz}")

# --- Load cloth + weights ---
cloth_path = os.path.join(OUT_DIR, f"{CLOTH_PREFIX}.vox")
weights_path = os.path.join(OUT_DIR, f"{CLOTH_PREFIX}.weights.json")
cloth_voxels, cgx, cgy, cgz, palette = parse_vox(cloth_path)
with open(weights_path, encoding='utf-8') as f:
    cloth_data = json.load(f)
weights = cloth_data['weights']
bones_list = cloth_data.get('bones', [])
# Build index list of excluded bones
exclude_idx = [i for i, b in enumerate(bones_list) if b in EXCLUDE_BONES]
if EXCLUDE_BONES:
    print(f"  exclude bones: {EXCLUDE_BONES} (idx={exclude_idx}, thresh={EXCLUDE_THRESH})")
source_distances = cloth_data.get('source_body_distance')
if source_distances is None:
    print("ERROR: source_body_distance missing in weights.json")
    print("Run build_voxel_distance_map.py first")
    sys.exit(1)
print(f"  cloth: {len(cloth_voxels)} voxels")
print(f"  source distances: {len(source_distances)} entries")

# --- Per-Z body centroid ---
body_cent = {}
_z_n = {}
for v in body_voxels:
    z = v[2]
    if z not in body_cent:
        body_cent[z] = [0.0, 0.0]; _z_n[z] = 0
    body_cent[z][0] += v[0]; body_cent[z][1] += v[1]
    _z_n[z] += 1
for z in body_cent:
    n = _z_n[z]
    body_cent[z][0] /= n; body_cent[z][1] /= n
print(f"  body Z layers: {len(body_cent)}")

# --- For each voxel, find body surface along radial direction ---
def find_body_surface(vx, vy, vz):
    """centroid から voxel 方向に外側へ歩き、最後に body セルだった位置を返す。
    centroid が body 内部にあるはずなので「内→外」へ抜ける境界の最後の body セル。"""
    if vz not in body_cent: return None, None
    cx, cy = body_cent[vz]
    dx = vx - cx; dy = vy - cy
    length = math.sqrt(dx*dx + dy*dy)
    if length < 0.5: return None, None
    ux = dx / length; uy = dy / length
    last_body = None
    for s in range(0, MAX_SEARCH + 1):
        nx = int(round(cx + ux * s))
        ny = int(round(cy + uy * s))
        if not (0 <= nx < cgx and 0 <= ny < cgy): break
        if (nx, ny, vz) in body_set:
            last_body = (nx, ny)
        else:
            if last_body is not None:
                return last_body, (ux, uy)  # 抜けた直後
    return last_body, (ux, uy)  # 抜けず

# --- Move each voxel to body_surface + target_voxel_offset ---
final_cloth = []
final_weights = []
final_distances = []
n_moved = 0
n_no_body = 0
move_hist = defaultdict(int)  # signed move distance: +outward, -inward

n_skipped_no_target = 0
n_skipped_excluded_bone = 0
n_clamped = 0

def excluded_weight(weight_entry):
    """指定 bone idx 群への合計 weight"""
    if not exclude_idx: return 0.0
    s = 0.0
    for bi, w in weight_entry:
        if bi in exclude_idx: s += w
    return s

for i, (x, y, z, ci) in enumerate(cloth_voxels):
    src_dist_m = source_distances[i]
    if src_dist_m is None:
        # ターゲットなし (drape 領域) - そのまま保持
        final_cloth.append((x, y, z, ci))
        final_weights.append(weights[i])
        final_distances.append(src_dist_m)
        n_skipped_no_target += 1
        continue
    # 除外 bone への weight が閾値を超えたら触らない
    if excluded_weight(weights[i]) >= EXCLUDE_THRESH:
        final_cloth.append((x, y, z, ci))
        final_weights.append(weights[i])
        final_distances.append(src_dist_m)
        n_skipped_excluded_bone += 1
        continue
    body_surf, dirvec = find_body_surface(x, y, z)
    if body_surf is None:
        final_cloth.append((x, y, z, ci))
        final_weights.append(weights[i])
        final_distances.append(src_dist_m)
        n_no_body += 1
        continue
    bx, by = body_surf
    ux, uy = dirvec
    # Desired offset (voxel単位): src_dist=0 → +1 voxel from body surface
    target_offset_voxels = max(1, int(round(src_dist_m / vs)) + 1)
    # Current offset
    cur_dx = x - bx; cur_dy = y - by
    cur_offset = math.sqrt(cur_dx*cur_dx + cur_dy*cur_dy)
    # Move = target - current (signed). Clamp to [-MAX_MOVE, +MAX_MOVE] for safety.
    desired_move = target_offset_voxels - cur_offset
    if desired_move > MAX_MOVE:
        actual_move = MAX_MOVE
        n_clamped += 1
    elif desired_move < -MAX_MOVE:
        actual_move = -MAX_MOVE
        n_clamped += 1
    else:
        actual_move = desired_move
    # Apply: new pos = current + actual_move * direction
    nx = int(round(x + ux * actual_move))
    ny = int(round(y + uy * actual_move))
    nx = max(0, min(cgx - 1, nx))
    ny = max(0, min(cgy - 1, ny))
    # Safety: don't land inside body
    if (nx, ny, z) in body_set:
        nx2 = int(round(nx + ux))
        ny2 = int(round(ny + uy))
        nx2 = max(0, min(cgx - 1, nx2))
        ny2 = max(0, min(cgy - 1, ny2))
        nx, ny = nx2, ny2
    final_cloth.append((nx, ny, z, ci))
    final_weights.append(weights[i])
    final_distances.append(src_dist_m)
    if (nx, ny) != (x, y):
        n_moved += 1
        signed = int(round(actual_move))
        move_hist[signed] += 1

print(f"\nresult:")
print(f"  moved:                          {n_moved}")
print(f"  skipped (no target/drape):      {n_skipped_no_target}")
print(f"  skipped (excluded bone weight): {n_skipped_excluded_bone}")
print(f"  no body in path:                {n_no_body}")
print(f"  clamped to MAX_MOVE={MAX_MOVE}:           {n_clamped}")
print(f"  signed move histogram (- inward, + outward, voxels):")
for s in sorted(move_hist.keys()):
    print(f"    {s:+>3}: {move_hist[s]}")

# --- Dedup ---
seen = set()
ded_cloth = []; ded_w = []; ded_d = []
for v, w, d in zip(final_cloth, final_weights, final_distances):
    key = (v[0], v[1], v[2])
    if key in seen: continue
    seen.add(key)
    ded_cloth.append(v); ded_w.append(w); ded_d.append(d)
print(f"  unique after dedup: {len(ded_cloth)} (was {len(final_cloth)})")

# --- Save ---
write_vox(cloth_path, cgx, cgy, cgz, ded_cloth, palette)
cloth_data['weights'] = ded_w
cloth_data['voxel_count'] = len(ded_cloth)
cloth_data['source_body_distance'] = [round(d, 5) if d is not None else None for d in ded_d]
with open(weights_path, 'w', encoding='utf-8') as f:
    json.dump(cloth_data, f, ensure_ascii=False, indent=0)
print(f"  wrote {cloth_path} ({len(ded_cloth)} voxels)")
print(f"\n=== DONE ===")
