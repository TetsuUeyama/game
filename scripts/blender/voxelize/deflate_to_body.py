"""Cloth voxel を body 表面まで radial inward に deflate (= 1 voxel ずつ近づける)。

V19 + 50mm push で得られた "body-following balloon" を body にピッタリ密着させる。

各 cloth voxel について:
  1. per-Z body XY 重心を計算
  2. cloth voxel から重心方向 (= inward) に 1 voxel ずつ step
  3. 次の step が body cell にぶつかる直前で停止
  4. → 結果: cloth voxel は body 表面 + 1 voxel に snap

50mm balloon は body 形状に沿った曲面を保持しているので、deflate 後も体形状に追従する。
さらに各 voxel が独立して動くので、shape preserving (元の角度位置を保持)。

Usage:
  python deflate_to_body.py <out_dir> <body_prefix> <clothing_prefix>
"""
import sys, os, json, struct, math
from collections import defaultdict

if len(sys.argv) < 4:
    print(__doc__); sys.exit(1)
OUT_DIR = sys.argv[1]; BODY_PREFIX = sys.argv[2]; CLOTH_PREFIX = sys.argv[3]
# 最大 inward step (voxels). 4th 引数で上書き可。
# 大きいほど離れた voxel まで引き寄せる。drape を保護したい場合は小さく (e.g. 5)。
MAX_STEP = int(sys.argv[4]) if len(sys.argv) >= 5 else 12

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

print(f"=== Deflate to body (radial inward snap) ===")
print(f"  body={BODY_PREFIX} clothing={CLOTH_PREFIX} max_step={MAX_STEP}")

body_path = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")
cloth_path = os.path.join(OUT_DIR, f"{CLOTH_PREFIX}.vox")
weights_path = os.path.join(OUT_DIR, f"{CLOTH_PREFIX}.weights.json")

body_voxels, gx, gy, gz, _ = parse_vox(body_path)
body_set = set((v[0], v[1], v[2]) for v in body_voxels)
print(f"  body: {len(body_voxels)} voxels in {gx}x{gy}x{gz}")

cloth_voxels, cgx, cgy, cgz, palette = parse_vox(cloth_path)
with open(weights_path, encoding='utf-8') as f:
    cloth_data = json.load(f)
weights_per_voxel = cloth_data['weights']
print(f"  clothing: {len(cloth_voxels)} voxels")

# Per-Z body XY centroid
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
print(f"  body Z layers: {len(body_centroid_per_z)}")

# Top-down processing: sort cloth voxels by Z descending
cloth_indexed = list(enumerate(cloth_voxels))
cloth_indexed.sort(key=lambda iv: -iv[1][2])  # Z descending

# Deflate each cloth voxel toward body
final_cloth = [None] * len(cloth_voxels)
final_weights = [None] * len(cloth_voxels)
n_moved = 0; n_kept = 0; n_no_centroid = 0; n_already_at_surface = 0
n_no_body_in_path = 0
move_distance_hist = [0] * (MAX_STEP + 1)

for idx, cv in cloth_indexed:
    x, y, z, ci = cv
    if z not in body_centroid_per_z:
        # No body at this Z (above shoulder or below feet)
        final_cloth[idx] = cv
        final_weights[idx] = weights_per_voxel[idx]
        n_no_centroid += 1
        continue
    cx, cy = body_centroid_per_z[z]
    dx = x - cx; dy = y - cy
    length = math.sqrt(dx*dx + dy*dy)
    if length < 0.5:
        final_cloth[idx] = cv
        final_weights[idx] = weights_per_voxel[idx]
        n_kept += 1
        continue
    # inward direction (toward body center)
    ux = -dx / length; uy = -dy / length
    # step inward 1 voxel at a time until next step is body
    cur_x, cur_y = x, y
    moved_steps = 0
    hit_body = False
    for step in range(1, MAX_STEP + 1):
        nx = int(round(x + ux * step))
        ny = int(round(y + uy * step))
        if not (0 <= nx < cgx and 0 <= ny < cgy): break
        if (nx, ny, z) in body_set:
            # Next step would be body — stop at previous step (cur_x, cur_y)
            hit_body = True
            break
        cur_x, cur_y = nx, ny
        moved_steps = step
    if not hit_body:
        # body に当たらず MAX_STEP 到達: 元位置に戻す (誤った deflate を避ける)
        final_cloth[idx] = cv
        final_weights[idx] = weights_per_voxel[idx]
        n_no_body_in_path += 1
        continue
    final_cloth[idx] = (cur_x, cur_y, z, ci)
    final_weights[idx] = weights_per_voxel[idx]
    if moved_steps > 0:
        n_moved += 1
        move_distance_hist[min(moved_steps, MAX_STEP)] += 1
    else:
        n_already_at_surface += 1

print(f"\nresult:")
print(f"  moved (deflated inward): {n_moved}")
print(f"  already at body surface (no move): {n_already_at_surface}")
print(f"  no body in radial path (kept original): {n_no_body_in_path}")
print(f"  no centroid (above/below body): {n_no_centroid}")
print(f"  kept (at center): {n_kept}")
print(f"  move distance histogram (voxels):")
for d, c in enumerate(move_distance_hist):
    if c > 0: print(f"    d={d:>2}: {c}")

# Dedup: collapse multiple voxels at same coord (keep first)
seen = set()
dedup_cloth = []
dedup_weights = []
for cv, cw in zip(final_cloth, final_weights):
    key = (cv[0], cv[1], cv[2])
    if key in seen: continue
    seen.add(key)
    dedup_cloth.append(cv)
    dedup_weights.append(cw)
print(f"  unique voxels after dedup: {len(dedup_cloth)} (was {len(final_cloth)})")

write_vox(cloth_path, cgx, cgy, cgz, dedup_cloth, palette)
cloth_data['weights'] = dedup_weights
cloth_data['voxel_count'] = len(dedup_cloth)
with open(weights_path, 'w', encoding='utf-8') as f:
    json.dump(cloth_data, f, ensure_ascii=False, indent=0)
print(f"  output: {len(dedup_cloth)} voxels → {cloth_path}")
print(f"\n=== DONE ===")
