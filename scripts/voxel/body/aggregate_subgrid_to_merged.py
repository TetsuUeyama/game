"""Subgrid → merged weights 集約スクリプト

入力 (例: public/box5/qm_mustardui/):
  - <prefix>.vox          : parent grid voxels (e.g. body.vox = 167,917 occupied)
  - <prefix>.grid.json    : sub-grid metadata (grid_origin, voxel_size, parent_voxel_size, chunks[])
  - <prefix>_c1..cN.vox   : sub-voxel chunks
  - <prefix>.weights.json : per-sub-voxel bone weights (concatenated chunk iteration order)

出力:
  - <prefix>.beforeSubgrid.bak.weights.json : merged-format weights matching <prefix>.vox

集約戦略:
  各 parent voxel について、world 座標上で重なる sub-voxel の weights を bone ごとに合計、
  正規化して top-4 を保持。sub-voxel が 1 つも見つからない parent voxel は空 entry。

依存: 標準ライブラリのみ (Blender 不要)。

使用例:
  python scripts/voxel/body/aggregate_subgrid_to_merged.py public/box5/qm_mustardui body
"""
import sys
import os
import json
import struct
import math
from collections import defaultdict


def parse_vox(path):
    """MagicaVoxel .vox を読んで (sx, sy, sz, [(x,y,z,color), ...]) を返す。"""
    with open(path, 'rb') as f:
        d = f.read()
    voxels = []
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
    return sx, sy, sz, voxels


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    out_dir = sys.argv[1]
    prefix = sys.argv[2]

    # --- 1. parent grid (.vox) ---
    parent_path = os.path.join(out_dir, f"{prefix}.vox")
    psx, psy, psz, parent_voxels = parse_vox(parent_path)
    print(f"[parent] {prefix}.vox: {psx}x{psy}x{psz}, occupied={len(parent_voxels)}")

    # --- 2. grid metadata ---
    grid_path = os.path.join(out_dir, f"{prefix}.grid.json")
    with open(grid_path) as f:
        grid = json.load(f)
    voxel_size = grid['voxel_size']
    parent_voxel_size = grid.get('parent_voxel_size', voxel_size * grid.get('scale_factor', 1))
    scale_factor = grid['scale_factor']
    grid_origin = grid['grid_origin']
    chunks_meta = grid['chunks']
    print(f"[grid] voxel_size={voxel_size:.6f}, parent_voxel_size={parent_voxel_size:.6f}, "
          f"scale_factor={scale_factor}")
    print(f"[grid] grid_origin={grid_origin}")
    print(f"[grid] chunks={len(chunks_meta)}")

    # --- 3. weights ---
    weights_path = os.path.join(out_dir, f"{prefix}.weights.json")
    with open(weights_path) as f:
        w = json.load(f)
    sub_weights = w['weights']  # list of [[bone_idx, weight], ...]
    bones = w['bones']
    print(f"[weights] entries={w['voxel_count']}, bones={len(bones)}")

    # --- 4. 各 sub-voxel の world 座標 + parent grid index を計算 ---
    # weights.json 内の index は chunks の concat 順 (chunk1 の voxels → chunk2 の voxels → ...)
    sub_total = 0
    # parent grid 座標 -> [(bone_idx, weight), ...] を集める
    parent_idx_to_weights = defaultdict(lambda: defaultdict(float))
    parent_idx_to_subhits = defaultdict(int)

    weight_idx = 0
    for c_idx, cm in enumerate(chunks_meta):
        cpath = os.path.join(out_dir, cm['vox_file'])
        csx, csy, csz, cvox = parse_vox(cpath)
        if len(cvox) != cm['voxel_count']:
            print(f"[WARN] chunk {c_idx + 1}: meta voxel_count={cm['voxel_count']}, "
                  f"actual={len(cvox)} — mismatch")

        chunk_origin = cm['grid_origin']

        for (sx, sy, sz, _color) in cvox:
            # sub-voxel world center
            wx = chunk_origin[0] + (sx + 0.5) * voxel_size
            wy = chunk_origin[1] + (sy + 0.5) * voxel_size
            wz = chunk_origin[2] + (sz + 0.5) * voxel_size
            # parent grid index (= 該当 parent voxel)
            px = int(math.floor((wx - grid_origin[0]) / parent_voxel_size))
            py = int(math.floor((wy - grid_origin[1]) / parent_voxel_size))
            pz = int(math.floor((wz - grid_origin[2]) / parent_voxel_size))
            key = (px, py, pz)
            pairs = sub_weights[weight_idx]
            for pair in pairs:
                b_idx, ww = pair[0], pair[1]
                parent_idx_to_weights[key][b_idx] += ww
            parent_idx_to_subhits[key] += 1
            weight_idx += 1
        sub_total += len(cvox)

    print(f"[subgrid] aggregated sub-voxels={sub_total}")
    print(f"[subgrid] unique parent voxels touched={len(parent_idx_to_weights)}")

    # --- 5. parent grid の各 voxel に対応する weights を出力順に並べる ---
    # body.vox の XYZI 列挙順を respect する
    out_weights = []
    parent_hits = 0
    parent_misses = 0
    sub_hit_distribution = defaultdict(int)

    for (vx, vy, vz, _vc) in parent_voxels:
        key = (vx, vy, vz)
        bw = parent_idx_to_weights.get(key)
        sub_hit_distribution[parent_idx_to_subhits.get(key, 0)] += 1
        if not bw:
            # 対応する sub-voxel が見つからない parent voxel
            out_weights.append([])
            parent_misses += 1
            continue
        # 合計 → 正規化 → top-4
        total = sum(bw.values())
        if total <= 0:
            out_weights.append([])
            parent_misses += 1
            continue
        items = [(b, ww / total) for b, ww in bw.items()]
        items.sort(key=lambda x: -x[1])
        top4 = items[:4]
        total2 = sum(ww for _, ww in top4)
        if total2 > 0:
            out_weights.append([[int(b), float(ww / total2)] for b, ww in top4])
        else:
            out_weights.append([])
            parent_misses += 1
            continue
        parent_hits += 1

    print(f"[aggregate] parent hits={parent_hits} / total={len(parent_voxels)}  "
          f"(misses={parent_misses})")
    print("[aggregate] sub-voxels per parent voxel distribution:")
    for k in sorted(sub_hit_distribution.keys())[:12]:
        print(f"  {k:>3} sub-voxels: {sub_hit_distribution[k]} parents")

    if parent_hits == 0:
        print("\n[ERROR] No parent voxel mapped to any sub-voxel. "
              "Likely body.vox and sub-grid have different bbox / grid_origin.")
        print(f"  body.vox occupied={len(parent_voxels)}, parent grid dims={psx}x{psy}x{psz}")
        print(f"  grid_origin={grid_origin}, parent_voxel_size={parent_voxel_size}")
        sys.exit(2)

    if parent_misses > len(parent_voxels) * 0.05:
        print(f"\n[WARN] {parent_misses} / {len(parent_voxels)} parent voxels have NO matching "
              f"sub-voxel ({parent_misses/len(parent_voxels)*100:.1f}%). "
              f"Mesh skinning will fall back to bone[0] for those.")

    # --- 6. 出力 ---
    out_json = {
        'mesh': w.get('mesh', ''),
        'bones': bones,
        'voxel_count': len(parent_voxels),
        'weights': out_weights,
    }
    out_path = os.path.join(out_dir, f"{prefix}.beforeSubgrid.bak.weights.json")
    with open(out_path, 'w') as f:
        json.dump(out_json, f)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"\n[output] {out_path}")
    print(f"  voxel_count={len(parent_voxels)}  bones={len(bones)}  size={size_kb:.0f} KB")


if __name__ == '__main__':
    main()
