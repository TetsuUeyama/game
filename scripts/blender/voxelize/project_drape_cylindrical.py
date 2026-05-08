"""Cylindrical projection: Helena 元空間で voxelize した skirt を QM 空間に投影。

Drape clothing 用の純生成パイプライン。Helena body と clothing の voxel から
円柱座標 (z, angle, body軸からの radial offset) を抽出し、対応する QM body
表面上に同じ offset で voxel を生成する。Helena→QM の体型差は body radius の
差として吸収される。

Algorithm:
  1. Helena 空間と QM 空間それぞれで body の per-Z 重心と per-(Z, angle) radius を計算
  2. Helena world Z 範囲 → QM world Z 範囲 を線形マップ (body bbox 基準)
  3. 各 Helena skirt voxel について:
     - Helena 円柱 (h_z, h_angle, h_r) を計算
     - skirt_offset_world = (h_r - h_body_r) * helena_voxel_size  [m]
     - h_world_z → q_world_z にマップ → q_voxel_z 算出
     - QM body radius at (q_voxel_z, h_angle) を取得 → q_body_r_world
     - target_r_world = q_body_r_world + skirt_offset_world
     - QM voxel 座標 = (q_centroid + cos/sin*h_angle * target_r_voxel, q_voxel_z)

Usage:
  python project_drape_cylindrical.py \
    <helena_native_dir> <helena_prefix> \
    <qm_voxel_dir> <qm_body_prefix> <qm_out_prefix> \
    [<n_angle_bins>]

Example:
  python project_drape_cylindrical.py \
    tmp/helena_native witch_skirt \
    public/box5/qm_mustardui body helena_witch_skirt
"""
import sys, os, json, struct, math
from collections import defaultdict

if len(sys.argv) < 6:
    print(__doc__); sys.exit(1)
H_DIR = sys.argv[1]; H_PREFIX = sys.argv[2]
Q_DIR = sys.argv[3]; Q_BODY = sys.argv[4]; Q_OUT = sys.argv[5]
N_ANGLES = int(sys.argv[6]) if len(sys.argv) >= 7 else 24

print(f"\n=== Cylindrical drape projection ===")
print(f"  helena: {H_DIR}/{H_PREFIX}_*.vox")
print(f"  qm body: {Q_DIR}/{Q_BODY}.vox")
print(f"  qm output: {Q_DIR}/{Q_OUT}.vox")
print(f"  angle bins: {N_ANGLES}")

def parse_vox(path):
    with open(path, 'rb') as f: data = f.read()
    sx = sy = sz = 0; voxels = []
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
            off += 12 + csz + chz
    parse_chunks(8, len(data))
    return voxels, sx, sy, sz

def write_vox(path, sx, sy, sz, voxels, color=(180, 130, 220, 255)):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels:
        if len(v) == 4:
            xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
        else:
            xd += struct.pack('<BBBB', v[0], v[1], v[2], 1)
    rd = b''
    for i in range(256):
        if i == 0: rd += struct.pack('<BBBB', *color)
        else: rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# --- Load Helena native ---
with open(os.path.join(H_DIR, f"{H_PREFIX}_grid.json")) as f:
    h_grid = json.load(f)
h_vs = h_grid['voxel_size']
h_ox, h_oy, h_oz = h_grid['grid_origin']
h_gx, h_gy, h_gz = h_grid['gx'], h_grid['gy'], h_grid['gz']
print(f"\n[1] Helena grid: {h_gx}x{h_gy}x{h_gz}, voxel_size={h_vs*1000:.2f}mm")

h_body, _, _, _ = parse_vox(os.path.join(H_DIR, f"{H_PREFIX}_body.vox"))
h_cloth, _, _, _ = parse_vox(os.path.join(H_DIR, f"{H_PREFIX}_cloth.vox"))
print(f"  helena body: {len(h_body)} voxels")
print(f"  helena cloth: {len(h_cloth)} voxels")

# --- Load QM grid ---
with open(os.path.join(Q_DIR, 'grid.json')) as f:
    q_grid = json.load(f)
q_vs = q_grid['voxel_size']
q_ox, q_oy, q_oz = q_grid['grid_origin']
q_gx, q_gy, q_gz = q_grid['gx'], q_grid['gy'], q_grid['gz']
print(f"\n[2] QM grid: {q_gx}x{q_gy}x{q_gz}, voxel_size={q_vs*1000:.2f}mm")

q_body, _, _, _ = parse_vox(os.path.join(Q_DIR, f"{Q_BODY}.vox"))
print(f"  qm body: {len(q_body)} voxels")

# --- Centroid + radius per body ---
def filter_torso_only(voxels, size_ratio_threshold=0.4):
    """各 Z レイヤーで 4-連結 connected components を計算し、
    最大クラスターサイズの size_ratio_threshold 倍以上の cluster のみ残す。

    腕/手は torso/legs に比べて小さいので除外される。
    両足など同サイズ複数 cluster は両方維持。"""
    by_z = defaultdict(set)
    for (x, y, z, _) in voxels:
        by_z[z].add((x, y))
    out = []
    n_kept_clusters = 0
    n_dropped_clusters = 0
    for z, cells in by_z.items():
        if len(cells) < 3:
            for (x, y) in cells: out.append((x, y, z, 1))
            continue
        visited = set()
        components = []
        for start in cells:
            if start in visited: continue
            comp = []
            stack = [start]; visited.add(start)
            while stack:
                cur = stack.pop()
                comp.append(cur)
                for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
                    nb = (cur[0]+dx, cur[1]+dy)
                    if nb in cells and nb not in visited:
                        visited.add(nb); stack.append(nb)
            components.append(comp)
        components.sort(key=len, reverse=True)
        max_size = len(components[0])
        threshold = max_size * size_ratio_threshold
        for comp in components:
            if len(comp) >= threshold:
                for (x, y) in comp: out.append((x, y, z, 1))
                n_kept_clusters += 1
            else:
                n_dropped_clusters += 1
    print(f"  filter_torso_only: kept {len(out)} voxels, "
          f"kept {n_kept_clusters} clusters, dropped {n_dropped_clusters} small clusters")
    return out

def compute_centroid_radii(voxels, n_angles):
    cent = {}; cnt = {}
    for (x, y, z, _) in voxels:
        if z not in cent: cent[z] = [0.0, 0.0]; cnt[z] = 0
        cent[z][0] += x; cent[z][1] += y; cnt[z] += 1
    for z in cent:
        n = cnt[z]
        cent[z][0] /= n; cent[z][1] /= n
    radii = {}  # (z, ang_bin) -> max radius (voxels)
    for (x, y, z, _) in voxels:
        cx, cy = cent[z]
        dx = x - cx; dy = y - cy
        r = math.sqrt(dx*dx + dy*dy)
        ang = math.atan2(dy, dx)
        ab = int((ang + math.pi) / (2*math.pi) * n_angles) % n_angles
        key = (z, ab)
        if key not in radii or radii[key] < r:
            radii[key] = r
    return cent, radii

print(f"\n[3] Filter Helena body to torso only (drop arms/hands)")
h_body_torso = filter_torso_only(h_body)
print(f"\n[3b] Compute Helena body centroid + radii (torso only)")
h_cent, h_radii = compute_centroid_radii(h_body_torso, N_ANGLES)
print(f"  Z layers: {len(h_cent)}")

print(f"\n[4] Filter QM body to torso only (drop arms/hands)")
q_body_torso = filter_torso_only(q_body)
print(f"\n[4b] Compute QM body centroid + radii (torso only)")
q_cent, q_radii = compute_centroid_radii(q_body_torso, N_ANGLES)
print(f"  Z layers: {len(q_cent)}")

# --- World Z range for body (used in linear Z mapping) ---
def world_z_range_body(cent, voxel_size, origin_z):
    zs = sorted(cent.keys())
    if not zs: return None, None
    z_min_world = origin_z + (zs[0] + 0.5) * voxel_size
    z_max_world = origin_z + (zs[-1] + 0.5) * voxel_size
    return z_min_world, z_max_world

h_z_min_w, h_z_max_w = world_z_range_body(h_cent, h_vs, h_oz)
q_z_min_w, q_z_max_w = world_z_range_body(q_cent, q_vs, q_oz)
print(f"\n[5] Helena body Z world range: {h_z_min_w:.3f} ~ {h_z_max_w:.3f} m (height {(h_z_max_w-h_z_min_w)*1000:.0f}mm)")
print(f"  QM body Z world range:    {q_z_min_w:.3f} ~ {q_z_max_w:.3f} m (height {(q_z_max_w-q_z_min_w)*1000:.0f}mm)")

def map_world_z(z_h):
    t = (z_h - h_z_min_w) / (h_z_max_w - h_z_min_w) if h_z_max_w > h_z_min_w else 0
    return q_z_min_w + t * (q_z_max_w - q_z_min_w)

def find_nearest_z_in(zmap, z):
    if z in zmap: return z
    if not zmap: return None
    return min(zmap.keys(), key=lambda zz: abs(zz - z))

# --- Project ---
print(f"\n[6] Project Helena skirt voxels to QM space")
out_voxels = set()
n_processed = 0
n_skipped_no_body = 0
n_skipped_clip = 0
n_inside_body = 0  # h_r < h_body_r — skirt clip into body
offset_hist = defaultdict(int)  # offset bucket (cm) -> count

for hsx, hsy, hsz, _ in h_cloth:
    n_processed += 1
    # Helena cylindrical at this voxel's Z
    h_radii_z = find_nearest_z_in(h_cent, hsz)
    if h_radii_z is None:
        n_skipped_no_body += 1; continue
    cx, cy = h_cent[h_radii_z]
    dx = hsx - cx; dy = hsy - cy
    h_r_voxel = math.sqrt(dx*dx + dy*dy)
    h_ang = math.atan2(dy, dx)
    ab = int((h_ang + math.pi) / (2*math.pi) * N_ANGLES) % N_ANGLES
    h_body_r_voxel = h_radii.get((h_radii_z, ab), 0)
    # Compute skirt offset in WORLD units
    skirt_offset_world = (h_r_voxel - h_body_r_voxel) * h_vs
    if skirt_offset_world < 0:
        skirt_offset_world = 0
        n_inside_body += 1
    offset_cm = int(skirt_offset_world * 100)
    offset_hist[offset_cm] += 1

    # Helena world Z → QM world Z
    h_world_z = h_oz + (hsz + 0.5) * h_vs
    q_world_z = map_world_z(h_world_z)
    q_voxel_z = int((q_world_z - q_oz) / q_vs)
    if q_voxel_z < 0 or q_voxel_z >= q_gz:
        n_skipped_clip += 1; continue

    # QM cylindrical at this Z
    q_radii_z = find_nearest_z_in(q_cent, q_voxel_z)
    if q_radii_z is None:
        n_skipped_no_body += 1; continue
    q_cx, q_cy = q_cent[q_radii_z]
    q_body_r_voxel = q_radii.get((q_radii_z, ab), 0)
    q_body_r_world = q_body_r_voxel * q_vs

    # Target radial position in QM
    target_r_world = q_body_r_world + skirt_offset_world
    target_r_voxel = target_r_world / q_vs

    qsx = int(round(q_cx + math.cos(h_ang) * target_r_voxel))
    qsy = int(round(q_cy + math.sin(h_ang) * target_r_voxel))

    if not (0 <= qsx < q_gx and 0 <= qsy < q_gy):
        n_skipped_clip += 1; continue
    out_voxels.add((qsx, qsy, q_voxel_z, 1))

print(f"\nresult:")
print(f"  processed:       {n_processed}")
print(f"  inside body (clamped to surface): {n_inside_body}")
print(f"  skipped (clip):  {n_skipped_clip}")
print(f"  skipped (no body for Z): {n_skipped_no_body}")
print(f"  unique output voxels: {len(out_voxels)}")
print(f"\n  skirt offset histogram (cm):")
for cm in sorted(offset_hist.keys()):
    if offset_hist[cm] > 50 or cm < 5:
        print(f"    {cm:>3}cm: {offset_hist[cm]}")

# --- Write output ---
out_path = os.path.join(Q_DIR, f"{Q_OUT}.vox")
write_vox(out_path, q_gx, q_gy, q_gz, sorted(out_voxels))
print(f"\n[7] Wrote {out_path} ({len(out_voxels)} voxels)")

# --- Generate placeholder weights.json (uniform c_spine_01_bend.x) ---
# 既存の weights.json があれば bones を継承
weights_path = os.path.join(Q_DIR, f"{Q_OUT}.weights.json")
existing_bones = ['c_spine_01_bend.x']
if os.path.exists(weights_path):
    try:
        with open(weights_path, encoding='utf-8') as f:
            existing = json.load(f)
        if 'bones' in existing and existing['bones']:
            existing_bones = existing['bones']
    except: pass

# c_spine_01_bend.x の index を決定
if 'c_spine_01_bend.x' in existing_bones:
    spine_idx = existing_bones.index('c_spine_01_bend.x')
else:
    existing_bones.append('c_spine_01_bend.x')
    spine_idx = len(existing_bones) - 1

new_weights = [[[spine_idx, 1.0]] for _ in out_voxels]
with open(weights_path, 'w', encoding='utf-8') as f:
    json.dump({
        'bones': existing_bones,
        'weights': new_weights,
        'voxel_count': len(out_voxels),
        'note': 'cylindrical projection - uniform spine_01 weight (animation TBD)',
    }, f, ensure_ascii=False, indent=0)
print(f"  Wrote {weights_path} (uniform c_spine_01_bend.x weight)")

print(f"\n=== DONE ===")
