"""Voxel validation by Helena reference + TPS expected position.

Wrap 思想の検証ステップ:
  1. Helena 体型上の bodysuit voxel (helena_final/bodysuit.vox) = 「正解形状」
  2. TPS で Helena world → QM world に変換 → 「期待される QM voxel 位置」V_expected
  3. 実 QM voxel V_actual を V_expected と比較
  4. V_expected の近傍 R 以内 → keep (deformation)
  5. 距離 R 以上 → drop (異物)

異物例 (検出される):
  - mustache 凹み: TPS 期待は cup 中央、実は cleavage 偏向 → 異物
  - wing 状の余分張り出し: 期待は body 沿い、実は外側 → 異物
  - strap 上方延伸: 期待は肩、実は jaw → 異物
  - hip zigzag 凸部: 期待は smooth、凸は局所外れ → 異物

完全決定論的 (基準: Helena 元 voxel + R)。AI 判断ゼロ。

Usage:
  python validate_voxels_by_helena.py \
    <helena_vox> <helena_grid_json> \
    <qm_vox> <qm_weights_json> <qm_grid_json> \
    <tps_json> \
    <out_vox> <out_weights> [--R <voxels>]

  R: 許容距離 (voxel 単位、default 2.0)
"""
import sys, os, json, struct
import numpy as np

if len(sys.argv) < 9:
    print(__doc__); sys.exit(1)

HELENA_VOX        = sys.argv[1]
HELENA_GRID_JSON  = sys.argv[2]
QM_VOX            = sys.argv[3]
QM_WEIGHTS_JSON   = sys.argv[4]
QM_GRID_JSON      = sys.argv[5]
TPS_JSON          = sys.argv[6]
OUT_VOX           = sys.argv[7]
OUT_WEIGHTS       = sys.argv[8]

R = 2.0  # voxels
if '--R' in sys.argv:
    R = float(sys.argv[sys.argv.index('--R') + 1])

print(f"=== validate_voxels_by_helena ===")
print(f"  helena ref vox: {HELENA_VOX}")
print(f"  qm actual vox : {QM_VOX}")
print(f"  TPS data      : {TPS_JSON}")
print(f"  R (voxels)    : {R}")
print(f"  output        : {OUT_VOX}")

# ---- vox parser/writer (from align_clothing_by_layer.py) ----
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

# ---- TPS apply (re-implementation of tps_retarget.py logic) ----
def tps_kernel(r):
    out = np.zeros_like(r)
    mask = r > 1e-9
    rm = r[mask]
    out[mask] = (rm * rm) * np.log(rm)
    return out

def tps_apply(query, src, W, C):
    nq = len(query)
    dists = np.linalg.norm(query[:, None, :] - src[None, :, :], axis=2)
    phi = tps_kernel(dists)
    bending = phi @ W
    P_q = np.hstack([np.ones((nq, 1)), query])
    affine = P_q @ C
    return affine + bending

# ---- Load Helena reference ----
print(f"\n[1] Load Helena reference")
h_voxels, h_sx, h_sy, h_sz, _ = parse_vox(HELENA_VOX)
with open(HELENA_GRID_JSON, encoding='utf-8') as f:
    h_grid = json.load(f)
h_org = h_grid['grid_origin']
h_vs = h_grid['voxel_size']
print(f"  helena voxels: {len(h_voxels)} in {h_sx}x{h_sy}x{h_sz}")
print(f"  helena grid: vs={h_vs:.4f}m, origin={h_org}")

# Convert Helena voxels to world coords
h_world = np.array([
    [h_org[0] + (v[0]+0.5)*h_vs,
     h_org[1] + (v[1]+0.5)*h_vs,
     h_org[2] + (v[2]+0.5)*h_vs]
    for v in h_voxels
], dtype=np.float64)
print(f"  helena world bbox: {h_world.min(axis=0)}..{h_world.max(axis=0)}")

# ---- Load TPS data + apply ----
print(f"\n[2] Apply TPS Helena world -> QM world")
with open(TPS_JSON, encoding='utf-8') as f:
    tps_data = json.load(f)
src_pts = np.array(tps_data['src_pts'], dtype=np.float64)
W = np.array(tps_data['W'], dtype=np.float64)
C = np.array(tps_data['C'], dtype=np.float64)
print(f"  TPS landmarks: {len(src_pts)}, λ={tps_data['lambda']}, samples_per_bone={tps_data.get('samples_per_bone','?')}")

expected_world = tps_apply(h_world, src_pts, W, C)
print(f"  expected QM world bbox: {expected_world.min(axis=0)}..{expected_world.max(axis=0)}")

# ---- Convert expected world to QM grid voxel coords ----
print(f"\n[3] Convert expected to QM grid")
with open(QM_GRID_JSON, encoding='utf-8') as f:
    q_grid = json.load(f)
q_org = q_grid['grid_origin']
q_vs = q_grid['voxel_size']
print(f"  qm grid: vs={q_vs:.4f}m, origin={q_org}, gx={q_grid['gx']}, gy={q_grid['gy']}, gz={q_grid['gz']}")

expected_grid = np.zeros_like(expected_world)
expected_grid[:, 0] = (expected_world[:, 0] - q_org[0]) / q_vs - 0.5
expected_grid[:, 1] = (expected_world[:, 1] - q_org[1]) / q_vs - 0.5
expected_grid[:, 2] = (expected_world[:, 2] - q_org[2]) / q_vs - 0.5

# ---- Load actual QM voxels ----
print(f"\n[4] Load actual QM voxels")
q_voxels, q_sx, q_sy, q_sz, q_pal = parse_vox(QM_VOX)
with open(QM_WEIGHTS_JSON, encoding='utf-8') as f:
    q_w_data = json.load(f)
q_bones = q_w_data['bones']
q_weights = q_w_data['weights']
print(f"  qm voxels: {len(q_voxels)} in {q_sx}x{q_sy}x{q_sz}")

# ---- Filter: keep voxels within R of expected ----
print(f"\n[5] Filter (R={R} voxels)")
qm_pts = np.array([[v[0], v[1], v[2]] for v in q_voxels], dtype=np.float64)

# Compute nearest expected for each actual qm voxel
# Using batched broadcast: (N_qm, 1, 3) - (1, N_exp, 3) → (N_qm, N_exp)
# For ~10000 × ~7000 = 70M, OK with numpy
print(f"  computing distances ({len(qm_pts)} qm × {len(expected_grid)} expected)...")
# Process in batches to avoid memory peak
batch = 1000
nearest_dist = np.zeros(len(qm_pts))
for i in range(0, len(qm_pts), batch):
    end = min(i + batch, len(qm_pts))
    chunk = qm_pts[i:end]
    d = np.linalg.norm(chunk[:, None, :] - expected_grid[None, :, :], axis=2)
    nearest_dist[i:end] = d.min(axis=1)

mask_keep = nearest_dist <= R
n_kept = int(mask_keep.sum())
n_dropped = len(q_voxels) - n_kept
print(f"  kept (within R): {n_kept} ({100*n_kept/len(q_voxels):.1f}%)")
print(f"  dropped (artifact): {n_dropped} ({100*n_dropped/len(q_voxels):.1f}%)")

# Distance histogram
print(f"  dropped voxel distance histogram:")
dropped_dist = nearest_dist[~mask_keep]
if len(dropped_dist) > 0:
    bins = [R, R+1, R+2, R+5, R+10, R+20, 1e9]
    prev = R
    for b in bins[1:]:
        n = int(((dropped_dist > prev) & (dropped_dist <= b)).sum())
        if n > 0:
            tag = f">{b}" if b == 1e9 else f"{prev:.0f}-{b:.0f}"
            print(f"    d {tag} voxels: {n}")
        prev = b

# ---- Save filtered ----
print(f"\n[6] Save filtered voxels")
kept_voxels = [v for v, k in zip(q_voxels, mask_keep) if k]
kept_weights = [w for w, k in zip(q_weights, mask_keep) if k]
write_vox(OUT_VOX, q_sx, q_sy, q_sz, kept_voxels, q_pal)
with open(OUT_WEIGHTS, 'w', encoding='utf-8') as f:
    json.dump({"bones": q_bones, "weights": kept_weights}, f)
print(f"  -> {OUT_VOX} ({len(kept_voxels)} voxels)")
print(f"  -> {OUT_WEIGHTS}")
print(f"=== DONE ===")
