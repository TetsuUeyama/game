"""Direct projection: source 衣装 voxel から target body 表面 cell へ 1対1 投影.

Pipeline:
  1. Source body bbox + target body bbox を計算
  2. Source 衣装 voxel ごとに bbox-uv (u, v, w) を計算
  3. Target body 表面 cell ごとに bbox-uv (u', v', w') を計算 (numpy array)
  4. 各 source 衣装 voxel について、最寄り target surface cell を全検索
  5. 採用された target cell の 1 voxel 外側を cover として出力

bin 量子化を排除することで穴の原因を構造的に取り除く。

Usage: python bbox_direct_project.py <config.json>
"""
import json
import struct
import sys
from collections import deque
from pathlib import Path

import numpy as np


NB6 = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]


def parse_vox(path):
    with open(path, 'rb') as f:
        data = f.read()
    pos = 8
    voxels = []
    size = None
    while pos < len(data):
        cid = data[pos:pos+4]
        n = struct.unpack('<I', data[pos+4:pos+8])[0]
        pos += 12
        if cid == b'SIZE':
            size = struct.unpack('<III', data[pos:pos+12])
            pos += n
        elif cid == b'XYZI':
            num = struct.unpack('<I', data[pos:pos+4])[0]
            pos += 4
            for _ in range(num):
                voxels.append((data[pos], data[pos+1], data[pos+2], data[pos+3]))
                pos += 4
        else:
            pos += n
    return size, voxels


def write_vox(path, size, voxels, palette=None):
    out = bytearray()
    out += b'VOX '
    out += struct.pack('<I', 150)
    main = bytearray()
    main += b'SIZE' + struct.pack('<II', 12, 0) + struct.pack('<III', *size)
    xyzi = struct.pack('<I', len(voxels))
    for x, y, z, c in voxels:
        xyzi += bytes([x, y, z, c])
    main += b'XYZI' + struct.pack('<II', len(xyzi), 0) + xyzi
    if palette:
        main += b'RGBA' + struct.pack('<II', len(palette), 0) + palette
    out += b'MAIN' + struct.pack('<II', 0, len(main)) + main
    with open(path, 'wb') as f:
        f.write(out)


def voxel_to_world(i, j, k, grid):
    o = np.array(grid['grid_origin'])
    return o + (np.array([i, j, k]) + 0.5) * grid['voxel_size']


def extract_surface(occ, gx, gy, gz):
    surface = set()
    for (x, y, z) in occ:
        for dx, dy, dz in NB6:
            n = (x+dx, y+dy, z+dz)
            if not (0 <= n[0] < gx and 0 <= n[1] < gy and 0 <= n[2] < gz):
                surface.add((x, y, z))
                break
            if n not in occ:
                surface.add((x, y, z))
                break
    return surface


def outward_normal(cell, body_occ, gx, gy, gz):
    for dx, dy, dz in NB6:
        n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
        if not (0 <= n[0] < gx and 0 <= n[1] < gy and 0 <= n[2] < gz):
            return (dx, dy, dz)
        if n not in body_occ:
            return (dx, dy, dz)
    return None


def body_bbox_world(body_voxels, grid):
    arr = np.array([voxel_to_world(x, y, z, grid) for x, y, z, _ in body_voxels])
    return arr.min(axis=0), arr.max(axis=0)


def main():
    cfg = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    src_cfg = cfg['source']
    tgt_cfg = cfg['target']
    src_dir = Path(src_cfg['voxel_dir'])
    garment = src_cfg['garment']

    print(f"[1] Load source")
    src_grid = json.loads((src_dir / 'grid.json').read_text(encoding='utf-8'))
    _bs, src_body = parse_vox(str(src_dir / 'body.vox'))
    _gs, src_garment = parse_vox(str(src_dir / f'{garment}.vox'))
    print(f"  body={len(src_body)}, garment={len(src_garment)}")

    print(f"[2] Load target")
    tgt_grid = json.loads(Path(tgt_cfg['grid']).read_text(encoding='utf-8'))
    _ts, tgt_body = parse_vox(str(Path(tgt_cfg['body_vox'])))
    print(f"  body={len(tgt_body)}")

    src_body_occ = set((x, y, z) for x, y, z, _ in src_body)
    tgt_body_occ = set((x, y, z) for x, y, z, _ in tgt_body)
    tgx, tgy, tgz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

    print(f"[3] Extract target body surface")
    tgt_surface = extract_surface(tgt_body_occ, tgx, tgy, tgz)
    print(f"  tgt_surface={len(tgt_surface)} cells")

    print(f"[4] Compute body bboxes (world)")
    src_min, src_max = body_bbox_world(src_body, src_grid)
    tgt_min, tgt_max = body_bbox_world(tgt_body, tgt_grid)
    src_span = np.where(src_max - src_min < 1e-9, 1.0, src_max - src_min)
    tgt_span = np.where(tgt_max - tgt_min < 1e-9, 1.0, tgt_max - tgt_min)
    print(f"  src span: {src_span}")
    print(f"  tgt span: {tgt_span}")

    print(f"[5] Compute target surface uvw array")
    tgt_surface_list = list(tgt_surface)
    tgt_worlds = np.array([voxel_to_world(c[0], c[1], c[2], tgt_grid) for c in tgt_surface_list])
    tgt_uvws = (tgt_worlds - tgt_min) / tgt_span
    print(f"  tgt_uvws: {tgt_uvws.shape}")

    print(f"[6] Compute source garment uvw")
    src_worlds = np.array([voxel_to_world(v[0], v[1], v[2], src_grid) for v in src_garment])
    src_uvws = (src_worlds - src_min) / src_span
    print(f"  src_uvws: {src_uvws.shape}")

    method = cfg.get('method', 'density')   # 'density' | 'nearest'
    chunk = int(cfg.get('chunk_size', 256))

    cover_target_idxs = set()
    if method == 'nearest':
        print(f"[7] Nearest: for each source garment voxel, find nearest target surface cell")
        for start in range(0, len(src_uvws), chunk):
            end = min(start + chunk, len(src_uvws))
            sub = src_uvws[start:end]
            diff = sub[:, None, :] - tgt_uvws[None, :, :]
            d2 = np.einsum('bmd,bmd->bm', diff, diff)
            idx = np.argmin(d2, axis=1)
            cover_target_idxs.update(idx.tolist())
        print(f"  Unique target cells: {len(cover_target_idxs)}")
    else:
        # density: for each target cell, count source voxels within radius
        radius = float(cfg.get('kernel_radius', 0.025))  # in bbox uv units
        min_count = int(cfg.get('density_min_count', 1))
        radius2 = radius * radius
        print(f"[7] Density: each target cell needs >={min_count} source voxel(s) within uv radius {radius}")
        # iterate target in chunks (smaller) since N=27334, M=2271
        tgt_chunk = int(cfg.get('tgt_chunk_size', 512))
        for start in range(0, len(tgt_uvws), tgt_chunk):
            end = min(start + tgt_chunk, len(tgt_uvws))
            sub = tgt_uvws[start:end]              # (B, 3)
            diff = sub[:, None, :] - src_uvws[None, :, :]
            d2 = np.einsum('bmd,bmd->bm', diff, diff)
            count = (d2 <= radius2).sum(axis=1)
            for li, c in enumerate(count):
                if c >= min_count:
                    cover_target_idxs.add(start + li)
        print(f"  Cover target cells: {len(cover_target_idxs)}")

    print(f"[8] Build output cells = ALL outward neighbors of chosen target surface cells")
    # Cover every 6-neighbor that lies outside the body. On convex regions (e.g. nipple)
    # this produces multiple shell voxels per surface cell, ensuring the protrusion
    # is fully wrapped instead of leaking through.
    output_cells = set()
    no_outward = 0
    for idx in cover_target_idxs:
        cell = tgt_surface_list[int(idx)]
        any_out = False
        for dx, dy, dz in NB6:
            n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
            if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz):
                continue
            if n in tgt_body_occ:
                continue
            output_cells.add(n)
            any_out = True
        if not any_out:
            no_outward += 1
    print(f"  Output cells: {len(output_cells)}, no_outward: {no_outward}")

    # Optional hole-fill via dilation on the body-surface-adjacent layer
    output_dilate = int(cfg.get('output_dilate', 0))
    if output_dilate > 0:
        print(f"[8.5] Output dilation x{output_dilate} (same dist layer)")
        dist = {c: 0 for c in tgt_body_occ}
        qf = deque(tgt_body_occ)
        while qf:
            c = qf.popleft()
            d = dist[c]
            if d >= 2:
                continue
            for dx, dy, dz in NB6:
                n = (c[0]+dx, c[1]+dy, c[2]+dz)
                if n in dist:
                    continue
                if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz):
                    continue
                dist[n] = d + 1
                qf.append(n)
        for step in range(output_dilate):
            added = set()
            for cell in output_cells:
                if dist.get(cell) != 1:
                    continue
                for dx, dy, dz in NB6:
                    n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
                    if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz):
                        continue
                    if dist.get(n) != 1:
                        continue
                    if n in output_cells or n in added:
                        continue
                    added.add(n)
            output_cells |= added
            print(f"  Dilate step {step+1}: +{len(added)}, total: {len(output_cells)}")

    print(f"[9] Write")
    out_path = Path(tgt_cfg['output'])
    voxels_out = sorted([(x, y, z, 1) for x, y, z in output_cells])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, None)
    print(f"  Saved: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == '__main__':
    main()
