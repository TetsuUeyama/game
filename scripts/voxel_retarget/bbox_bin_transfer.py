"""Body-bbox bin transfer.

Source 衣装が覆う source body 表面 cell を bbox-uv 空間で bin 化 (region mask)、
target body 表面 cell が同 bin に当たれば「cover」として 1 voxel 外側に shell を生成。

A3 (point-based nearest threshold) との違い:
  - A3: 各 target cell から nearest source point を threshold 距離内で検索 → 隙間が出る
  - C1: source を bin grid で region 化 → bin に当たれば即 cover、隙間なし

Usage: python bbox_bin_transfer.py <config.json>
"""
import json
import struct
import sys
from collections import deque
from pathlib import Path

import numpy as np


NB6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]


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


def to_uv(world, bb_min, bb_max):
    span = bb_max - bb_min
    span = np.where(span < 1e-9, 1.0, span)
    return (world - bb_min) / span


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
    sgx, sgy, sgz = src_grid['gx'], src_grid['gy'], src_grid['gz']
    tgx, tgy, tgz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

    print(f"[3] Extract body surface")
    src_surface = extract_surface(src_body_occ, sgx, sgy, sgz)
    tgt_surface = extract_surface(tgt_body_occ, tgx, tgy, tgz)
    print(f"  src_surface={len(src_surface)}, tgt_surface={len(tgt_surface)}")

    print(f"[4] BFS: garment voxel -> nearest source body surface cell")
    max_bfs = int(cfg.get('cover_max_search', 6))
    cover_cells = set()
    for (vx, vy, vz, _color) in src_garment:
        start = (vx, vy, vz)
        if start in src_surface:
            cover_cells.add(start)
            continue
        visited = {start}
        q = deque([(start, 0)])
        found = None
        while q:
            c, d = q.popleft()
            if d > max_bfs:
                break
            if c in src_surface:
                found = c
                break
            for dx, dy, dz in NB6:
                n = (c[0]+dx, c[1]+dy, c[2]+dz)
                if n in visited:
                    continue
                if not (0 <= n[0] < sgx and 0 <= n[1] < sgy and 0 <= n[2] < sgz):
                    continue
                visited.add(n)
                q.append((n, d+1))
        if found is not None:
            cover_cells.add(found)
    print(f"  cover cells: {len(cover_cells)}")

    print(f"[5] Compute body bboxes")
    src_min, src_max = body_bbox_world(src_body, src_grid)
    tgt_min, tgt_max = body_bbox_world(tgt_body, tgt_grid)
    print(f"  src bbox: min={src_min}, max={src_max}, size={src_max-src_min}")
    print(f"  tgt bbox: min={tgt_min}, max={tgt_max}, size={tgt_max-tgt_min}")

    print(f"[6] Build cover bin set (source side)")
    bin_n = int(cfg.get('bin_n', 100))
    cover_bins = set()
    for cell in cover_cells:
        w = voxel_to_world(cell[0], cell[1], cell[2], src_grid)
        u = to_uv(w, src_min, src_max)
        bi = (min(bin_n-1, max(0, int(u[0] * bin_n))),
              min(bin_n-1, max(0, int(u[1] * bin_n))),
              min(bin_n-1, max(0, int(u[2] * bin_n))))
        cover_bins.add(bi)
    print(f"  Occupied bins: {len(cover_bins)} / {bin_n}^3 = {bin_n**3}")

    # Optional: dilate cover bins in bin space to fill gaps from sparse cells
    bin_dilate = int(cfg.get('bin_dilate', 0))
    for step in range(bin_dilate):
        added = set()
        for bi in cover_bins:
            for dx, dy, dz in NB6:
                n = (bi[0]+dx, bi[1]+dy, bi[2]+dz)
                if not (0 <= n[0] < bin_n and 0 <= n[1] < bin_n and 0 <= n[2] < bin_n):
                    continue
                if n not in cover_bins and n not in added:
                    added.add(n)
        cover_bins |= added
        print(f"  Bin dilation step {step+1}: +{len(added)}, total: {len(cover_bins)}")

    print(f"[7] Target lookup")
    output_cells = set()
    covered, no_outward = 0, 0
    for cell in tgt_surface:
        w = voxel_to_world(cell[0], cell[1], cell[2], tgt_grid)
        u = to_uv(w, tgt_min, tgt_max)
        bi = (min(bin_n-1, max(0, int(u[0] * bin_n))),
              min(bin_n-1, max(0, int(u[1] * bin_n))),
              min(bin_n-1, max(0, int(u[2] * bin_n))))
        if bi not in cover_bins:
            continue
        out_dir = outward_normal(cell, tgt_body_occ, tgx, tgy, tgz)
        if out_dir is None:
            no_outward += 1
            continue
        oc = (cell[0]+out_dir[0], cell[1]+out_dir[1], cell[2]+out_dir[2])
        if not (0 <= oc[0] < tgx and 0 <= oc[1] < tgy and 0 <= oc[2] < tgz):
            no_outward += 1
            continue
        if oc in tgt_body_occ:
            no_outward += 1
            continue
        output_cells.add(oc)
        covered += 1
    print(f"  Target surface covered: {covered}, no_outward: {no_outward}, output unique: {len(output_cells)}")

    # Optional hole-fill via dilation on the body-surface-adjacent layer (dist=1)
    output_dilate = int(cfg.get('output_dilate', 0))
    if output_dilate > 0:
        print(f"[7.5] Output dilation: build outward distance field (max_dist=2)")
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
        # only dist=1 cells are the skin-tight layer where output_cells live
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

    print(f"[8] Write")
    out_path = Path(tgt_cfg['output'])
    voxels_out = sorted([(x, y, z, 1) for x, y, z in output_cells])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, None)
    print(f"  Saved: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == '__main__':
    main()
