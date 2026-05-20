"""body.vox + body.weights.json を subgrid (body_cN.vox + body.weights.json) から再生成。

入力 (例: public/box5/qm_mustardui/):
  - <prefix>_c1..cN.vox       : sub-voxel chunks
  - <prefix>.grid.json        : grid metadata (chunks 配列)
  - <prefix>.weights.json     : 491k entries (subgrid 形式)

出力 (上書き):
  - <prefix>.vox              : merged parent grid (例: 46k voxels)
  - <prefix>.weights.json     : merged weights (parent voxel に対応)

退避:
  - <prefix>.vox              → <prefix>.preSubgridMerge.bak.vox
  - <prefix>.weights.json     → <prefix>.preSubgridMerge.bak.weights.json

集約戦略:
  - 各 sub-voxel の中心 world 座標 → parent grid index (px, py, pz)
  - 同じ parent voxel に属する sub-voxel の weights を bone ごとに合計、正規化、top-4 保持
  - color: 同じ parent voxel に属する sub-voxel の **最頻出 color** を採用
  - parent voxel の iteration 順: (px, py, pz) lex sort (= chunk1 c2 c3... の concat 順とは別)

依存: 標準ライブラリのみ。

使用例:
  python scripts/voxel/body/rebuild_body_from_subgrid.py public/box5/qm_mustardui body
"""
import sys
import os
import json
import struct
import math
import shutil
from collections import defaultdict, Counter


def parse_vox(path):
    """VOX を読んで (sx, sy, sz, voxels, palette) を返す。palette は 256 要素 (r,g,b,a)。"""
    with open(path, 'rb') as f:
        d = f.read()
    voxels = []
    palette = []
    sx = sy = sz = 0
    i = d.find(b'SIZE')
    if i >= 0:
        sx, sy, sz = struct.unpack_from('<III', d, i + 12)
    i = d.find(b'XYZI')
    if i >= 0:
        cnt = struct.unpack_from('<I', d, i + 12)[0]
        for j in range(cnt):
            x, y, z, c = struct.unpack_from('<BBBB', d, i + 16 + j * 4)
            voxels.append((x, y, z, c))
    i = d.find(b'RGBA')
    if i >= 0:
        for j in range(256):
            r, g, b, a = struct.unpack_from('<BBBB', d, i + 12 + j * 4)
            palette.append((r, g, b, a))
    return sx, sy, sz, voxels, palette


def write_vox(path, sx, sy, sz, voxels, palette):
    """VOX を書き出す。voxels = [(x, y, z, color_idx), ...]、palette は 256 要素 (r,g,b,a)。"""
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data

    size_data = struct.pack('<III', sx, sy, sz)
    xyzi_data = struct.pack('<I', len(voxels))
    for v in voxels:
        xyzi_data += struct.pack('<BBBB', v[0], v[1], v[2], v[3])

    rgba_data = b''
    for j in range(256):
        if j < len(palette):
            r, g, b, a = palette[j]
            rgba_data += struct.pack('<BBBB', r, g, b, a)
        else:
            rgba_data += struct.pack('<BBBB', 0, 0, 0, 255)

    children = chunk('SIZE', size_data) + chunk('XYZI', xyzi_data) + chunk('RGBA', rgba_data)
    # MAIN chunk: tag + content_size (0) + children_size + children
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children

    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    out_dir = sys.argv[1]
    prefix = sys.argv[2]

    # --- 1. grid metadata ---
    grid_path = os.path.join(out_dir, f"{prefix}.grid.json")
    with open(grid_path) as f:
        grid = json.load(f)
    voxel_size = grid['voxel_size']
    parent_voxel_size = grid.get('parent_voxel_size', voxel_size * grid.get('scale_factor', 1))
    grid_origin = grid['grid_origin']
    chunks_meta = grid['chunks']
    print(f"[grid] voxel_size={voxel_size:.6f}, parent_voxel_size={parent_voxel_size:.6f}")
    print(f"[grid] grid_origin={grid_origin}")
    print(f"[grid] chunks={len(chunks_meta)}")

    # --- 2. weights ---
    weights_path = os.path.join(out_dir, f"{prefix}.weights.json")
    with open(weights_path) as f:
        w = json.load(f)
    sub_weights = w['weights']
    bones = w['bones']
    print(f"[weights] entries={w['voxel_count']}, bones={len(bones)}")

    # --- 3. sub-voxel を読みつつ parent voxel に集約 ---
    parent_weights = defaultdict(lambda: defaultdict(float))  # (px,py,pz) -> {bone_idx: sum_weight}
    parent_colors = defaultdict(Counter)                       # (px,py,pz) -> Counter(color_idx)
    palette = []

    weight_idx = 0
    sub_total = 0
    for c_idx, cm in enumerate(chunks_meta):
        cpath = os.path.join(out_dir, cm['vox_file'])
        csx, csy, csz, cvox, cpal = parse_vox(cpath)
        if not palette and cpal:
            palette = cpal
        if len(cvox) != cm['voxel_count']:
            print(f"[WARN] chunk {c_idx + 1}: meta count={cm['voxel_count']}, actual={len(cvox)}")

        chunk_origin = cm['grid_origin']

        for (sx, sy, sz, color) in cvox:
            wx = chunk_origin[0] + (sx + 0.5) * voxel_size
            wy = chunk_origin[1] + (sy + 0.5) * voxel_size
            wz = chunk_origin[2] + (sz + 0.5) * voxel_size
            px = int(math.floor((wx - grid_origin[0]) / parent_voxel_size))
            py = int(math.floor((wy - grid_origin[1]) / parent_voxel_size))
            pz = int(math.floor((wz - grid_origin[2]) / parent_voxel_size))
            key = (px, py, pz)

            parent_colors[key][color] += 1
            pairs = sub_weights[weight_idx]
            for pair in pairs:
                b_idx, ww = pair[0], pair[1]
                parent_weights[key][b_idx] += ww
            weight_idx += 1
        sub_total += len(cvox)

    print(f"[aggregate] sub-voxels processed={sub_total}, parent voxels={len(parent_weights)}")

    # --- 4. parent grid 寸法を決定 ---
    max_x = max(k[0] for k in parent_weights.keys())
    max_y = max(k[1] for k in parent_weights.keys())
    max_z = max(k[2] for k in parent_weights.keys())
    min_x = min(k[0] for k in parent_weights.keys())
    min_y = min(k[1] for k in parent_weights.keys())
    min_z = min(k[2] for k in parent_weights.keys())
    gx = max_x + 1
    gy = max_y + 1
    gz = max_z + 1
    print(f"[parent] grid bounds: x[{min_x}..{max_x}]={gx}, y[{min_y}..{max_y}]={gy}, z[{min_z}..{max_z}]={gz}")
    if gx > 256 or gy > 256 or gz > 256:
        print(f"[ERROR] parent grid exceeds 256 in some axis — single .vox file cannot store this.")
        sys.exit(2)
    if min_x < 0 or min_y < 0 or min_z < 0:
        print(f"[ERROR] negative parent index (subgrid origin mismatch).")
        sys.exit(2)

    # --- 5. 出力 voxel と weights を parent (x, y, z) iteration 順で生成 ---
    # 注: MagicaVoxel .vox の慣習に従い (x, y, z) lex で書き出す
    sorted_keys = sorted(parent_weights.keys())
    out_voxels = []
    out_weights = []
    for key in sorted_keys:
        px, py, pz = key
        # color: 最頻出 (tie-breaker: 小さい color_idx)
        color = parent_colors[key].most_common(1)[0][0]
        out_voxels.append((px, py, pz, color))

        # weights: 合計 → 正規化 → top-4
        bw = parent_weights[key]
        total = sum(bw.values())
        if total <= 0:
            out_weights.append([])
            continue
        items = [(b, ww / total) for b, ww in bw.items()]
        items.sort(key=lambda x: -x[1])
        top4 = items[:4]
        total2 = sum(ww for _, ww in top4)
        if total2 > 0:
            out_weights.append([[int(b), float(ww / total2)] for b, ww in top4])
        else:
            out_weights.append([])

    print(f"[output] parent voxel count = {len(out_voxels)}")

    # --- 6. 退避 ---
    cur_vox = os.path.join(out_dir, f"{prefix}.vox")
    cur_weights = os.path.join(out_dir, f"{prefix}.weights.json")
    bak_vox = os.path.join(out_dir, f"{prefix}.preSubgridMerge.bak.vox")
    bak_weights = os.path.join(out_dir, f"{prefix}.preSubgridMerge.bak.weights.json")

    if os.path.exists(cur_vox) and not os.path.exists(bak_vox):
        shutil.copy2(cur_vox, bak_vox)
        print(f"[backup] {cur_vox} -> {bak_vox}")
    elif os.path.exists(bak_vox):
        print(f"[backup] {bak_vox} already exists, skipping vox backup")
    if os.path.exists(cur_weights) and not os.path.exists(bak_weights):
        shutil.copy2(cur_weights, bak_weights)
        print(f"[backup] {cur_weights} -> {bak_weights}")
    elif os.path.exists(bak_weights):
        print(f"[backup] {bak_weights} already exists, skipping weights backup")

    # --- 7. 上書き ---
    if not palette:
        # palette 取得失敗 fallback: gray scale
        palette = [(128, 128, 128, 255)] * 256
    write_vox(cur_vox, gx, gy, gz, out_voxels, palette)
    print(f"[write] {cur_vox} ({gx}x{gy}x{gz}, {len(out_voxels)} voxels)")

    out_json = {
        'mesh': w.get('mesh', ''),
        'bones': bones,
        'voxel_count': len(out_voxels),
        'weights': out_weights,
    }
    with open(cur_weights, 'w') as f:
        json.dump(out_json, f)
    print(f"[write] {cur_weights} (voxel_count={len(out_voxels)}, bones={len(bones)})")

    print("\n[done] body.vox / body.weights.json regenerated from subgrid.")
    print("       Reload /qm-motion in born-editer to verify body skinning.")


if __name__ == '__main__':
    main()
