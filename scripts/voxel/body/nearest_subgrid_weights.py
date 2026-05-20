"""body.vox の各 voxel に対し、最近傍の sub-voxel の weights を割り当てて
   body.beforeSubgrid.bak.weights.json を生成する (現行 body.vox はそのまま)。

入力:
  - <prefix>.vox          : 現行 body.vox (167,917 voxels 等)
  - <prefix>.grid.json    : subgrid metadata
  - <prefix>_cN.vox       : sub-voxel chunks
  - <prefix>.weights.json : sub-voxel weights (491,119 entries)

出力:
  - <prefix>.beforeSubgrid.bak.weights.json : voxel_count=現行 body.vox occupied, body.vox iteration 順

引数 (重要):
  --skel-height <m>  : skeleton の height (Y range)。estimateVoxFit と同じ scale 計算用。
                       省略時は 1.632 (qm_mustardui の標準値)。
  --offset-y <m>     : Canonical Y への offset。skeleton の最下端位置。省略時 -0.019。

born-editer の skinned-mesh.ts と同じ座標変換:
  world_x = (vx - sx/2) * scale
  world_y = vz * scale + offset_y
  world_z = -(vy - sy/2) * scale
  (scale = skel_height / vox_z_range)

使用例:
  python scripts/voxel/body/nearest_subgrid_weights.py public/box5/qm_mustardui body
"""
import sys
import os
import json
import struct
import math
from collections import defaultdict


def parse_vox(path):
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
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    out_dir = args[0]
    prefix = args[1]
    skel_height = 1.632
    offset_y = -0.019
    i = 2
    while i < len(args):
        if args[i] == '--skel-height':
            skel_height = float(args[i + 1]); i += 2
        elif args[i] == '--offset-y':
            offset_y = float(args[i + 1]); i += 2
        else:
            i += 1

    # --- 1. 現行 body.vox ---
    parent_path = os.path.join(out_dir, f"{prefix}.vox")
    psx, psy, psz, parent_voxels = parse_vox(parent_path)
    # body.vox の vox z range = z 方向の occupied 範囲 (max - min)
    z_min = min(v[2] for v in parent_voxels)
    z_max = max(v[2] for v in parent_voxels)
    z_range = z_max - z_min
    scale = skel_height / z_range
    print(f"[parent] {prefix}.vox: {psx}x{psy}x{psz}, occupied={len(parent_voxels)}")
    print(f"[parent] vox z range = {z_range} (min={z_min}, max={z_max})")
    print(f"[parent] scale={scale:.6f}, offset_y={offset_y}")
    cx = psx / 2
    cy = psy / 2

    # --- 2. grid.json + chunk vox + weights.json ---
    grid_path = os.path.join(out_dir, f"{prefix}.grid.json")
    with open(grid_path) as f:
        grid = json.load(f)
    voxel_size = grid['voxel_size']
    chunks_meta = grid['chunks']

    weights_path = os.path.join(out_dir, f"{prefix}.weights.json")
    with open(weights_path) as f:
        w = json.load(f)
    sub_weights = w['weights']
    bones = w['bones']
    print(f"[grid] voxel_size={voxel_size:.6f}, chunks={len(chunks_meta)}")
    print(f"[weights] entries={w['voxel_count']}, bones={len(bones)}")

    # --- 3. sub-voxel: (world_x, world_y, world_z, weight_idx) の配列を構築 ---
    # bucketing で近傍検索を高速化
    bucket_size = voxel_size * 4  # 大きめバケット
    buckets = defaultdict(list)
    sub_world_positions = []  # (wx, wy, wz, weight_idx) のリスト
    weight_idx = 0
    for cm in chunks_meta:
        cpath = os.path.join(out_dir, cm['vox_file'])
        _csx, _csy, _csz, cvox = parse_vox(cpath)
        chunk_origin = cm['grid_origin']
        for (sx, sy, sz, _c) in cvox:
            wx = chunk_origin[0] + (sx + 0.5) * voxel_size
            wy = chunk_origin[1] + (sy + 0.5) * voxel_size
            wz = chunk_origin[2] + (sz + 0.5) * voxel_size
            sub_world_positions.append((wx, wy, wz, weight_idx))
            bx = int(math.floor(wx / bucket_size))
            by = int(math.floor(wy / bucket_size))
            bz = int(math.floor(wz / bucket_size))
            buckets[(bx, by, bz)].append(len(sub_world_positions) - 1)
            weight_idx += 1
    print(f"[subgrid] sub-voxels={len(sub_world_positions)}, buckets={len(buckets)}")

    # --- 4. 各 body.vox voxel について最近傍 sub-voxel を探す ---
    out_weights = []
    dist_stats = []  # (距離, ...) for debug
    no_neighbor_count = 0

    for (vx, vy, vz, _vc) in parent_voxels:
        # body.vox voxel center の世界位置 (assemble.ts と一致)
        wx = (vx - cx) * scale
        wy = vz * scale + offset_y
        wz = -(vy - cy) * scale

        bx = int(math.floor(wx / bucket_size))
        by = int(math.floor(wy / bucket_size))
        bz = int(math.floor(wz / bucket_size))

        # 周囲 3x3x3 バケットを探索
        best_dist_sq = float('inf')
        best_widx = -1
        for dbx in (-1, 0, 1):
            for dby in (-1, 0, 1):
                for dbz in (-1, 0, 1):
                    key = (bx + dbx, by + dby, bz + dbz)
                    if key not in buckets:
                        continue
                    for sidx in buckets[key]:
                        swx, swy, swz, widx = sub_world_positions[sidx]
                        d2 = (swx - wx) ** 2 + (swy - wy) ** 2 + (swz - wz) ** 2
                        if d2 < best_dist_sq:
                            best_dist_sq = d2
                            best_widx = widx

        if best_widx < 0:
            # 周囲バケットに見つからない → 全範囲探索 fallback
            for swx, swy, swz, widx in sub_world_positions:
                d2 = (swx - wx) ** 2 + (swy - wy) ** 2 + (swz - wz) ** 2
                if d2 < best_dist_sq:
                    best_dist_sq = d2
                    best_widx = widx
            no_neighbor_count += 1

        if best_widx < 0:
            out_weights.append([])
            continue

        # 採用: 最近傍 sub-voxel の weights をそのまま (top 4 / 正規化済 想定)
        sw = sub_weights[best_widx]
        # 念のため top-4 + normalize
        if not sw:
            out_weights.append([])
            continue
        sorted_sw = sorted(sw, key=lambda x: -x[1])[:4]
        total = sum(ww for _, ww in sorted_sw)
        if total <= 0:
            out_weights.append([])
            continue
        out_weights.append([[int(b), float(ww / total)] for b, ww in sorted_sw])
        dist_stats.append(math.sqrt(best_dist_sq))

    if dist_stats:
        dist_stats.sort()
        avg = sum(dist_stats) / len(dist_stats)
        median = dist_stats[len(dist_stats) // 2]
        p99 = dist_stats[int(len(dist_stats) * 0.99)]
        print(f"[nearest] distance avg={avg*1000:.2f}mm median={median*1000:.2f}mm "
              f"p99={p99*1000:.2f}mm max={dist_stats[-1]*1000:.2f}mm")
    if no_neighbor_count > 0:
        print(f"[WARN] {no_neighbor_count} parent voxels needed full-range fallback search")

    # --- 5. 出力 ---
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
