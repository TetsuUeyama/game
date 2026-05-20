"""Piecewise (quadrant) bbox UV transfer.

Source 衣装と target body 表面を縦横中心線で 4 quadrant に分割し、
各 quadrant ごとに独立した bbox UV で density-based transfer を行う。
quadrant 境界の隙間は同 distance layer 上の dilation で埋める。

4 quadrant 分類:
  Q0: X < cx, Y < cy  (左前)
  Q1: X >= cx, Y < cy (右前)
  Q2: X < cx, Y >= cy (左後)
  Q3: X >= cx, Y >= cy (右後)

中心 (cx, cy) は source/target body 各々の voxel centroid を使用 (解剖学的中心)。

Usage: python bbox_quad_transfer.py <config.json>
"""
import json
import struct
import sys
from collections import defaultdict, deque
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


def world_centroid(body_voxels, grid):
    arr = np.array([voxel_to_world(x, y, z, grid) for x, y, z, _ in body_voxels])
    return arr.mean(axis=0)


def classify_quadrant(world_xy, cxy):
    """Return 0..3 based on (x<cx, y<cy)."""
    q = 0
    if world_xy[0] >= cxy[0]:
        q += 1
    if world_xy[1] >= cxy[1]:
        q += 2
    return q


def classify_octant(world_xy, cxy, x_q1, x_q3):
    """Return 0..7. X is split into 4 (xr=0..3) by (x_q1, cx, x_q3), Y is split into 2."""
    x = world_xy[0]
    if x < x_q1: xr = 0
    elif x < cxy[0]: xr = 1
    elif x < x_q3: xr = 2
    else: xr = 3
    yr = 0 if world_xy[1] < cxy[1] else 1
    return xr + yr * 4


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

    print(f"[3] Compute body centroids (X, Y) and X quartiles")
    src_centroid = world_centroid(src_body, src_grid)[:2]
    tgt_centroid = world_centroid(tgt_body, tgt_grid)[:2]
    src_xs = np.array([voxel_to_world(v[0], v[1], v[2], src_grid)[0] for v in src_body])
    tgt_xs = np.array([voxel_to_world(v[0], v[1], v[2], tgt_grid)[0] for v in tgt_body])
    src_xq1, src_xq3 = float(np.percentile(src_xs, 25)), float(np.percentile(src_xs, 75))
    tgt_xq1, tgt_xq3 = float(np.percentile(tgt_xs, 25)), float(np.percentile(tgt_xs, 75))
    print(f"  src cx,cy = {src_centroid}, x q1/q3 = ({src_xq1:.3f}, {src_xq3:.3f})")
    print(f"  tgt cx,cy = {tgt_centroid}, x q1/q3 = ({tgt_xq1:.3f}, {tgt_xq3:.3f})")
    n_regions = int(cfg.get('regions', 8))  # 8 = X*4 * Y*2, 4 = X*2 * Y*2

    print(f"[4] Extract target body surface")
    tgt_surface = extract_surface(tgt_body_occ, tgx, tgy, tgz)
    print(f"  tgt_surface={len(tgt_surface)} cells")

    print(f"[5] Partition source body / garment / target surface by region (n={n_regions})")
    src_body_q = [[] for _ in range(n_regions)]
    src_garment_q = [[] for _ in range(n_regions)]
    tgt_surface_q = [[] for _ in range(n_regions)]

    def classify_src(w):
        if n_regions == 8:
            return classify_octant(w[:2], src_centroid, src_xq1, src_xq3)
        return classify_quadrant(w[:2], src_centroid)

    def classify_tgt(w):
        if n_regions == 8:
            return classify_octant(w[:2], tgt_centroid, tgt_xq1, tgt_xq3)
        return classify_quadrant(w[:2], tgt_centroid)

    for v in src_body:
        w = voxel_to_world(v[0], v[1], v[2], src_grid)
        src_body_q[classify_src(w)].append((v, w))

    for v in src_garment:
        w = voxel_to_world(v[0], v[1], v[2], src_grid)
        src_garment_q[classify_src(w)].append((v, w))

    for cell in tgt_surface:
        w = voxel_to_world(cell[0], cell[1], cell[2], tgt_grid)
        tgt_surface_q[classify_tgt(w)].append((cell, w))

    for q in range(n_regions):
        print(f"  R{q}: src_body={len(src_body_q[q])}, src_garment={len(src_garment_q[q])}, tgt_surface={len(tgt_surface_q[q])}")

    print(f"[6] Per-quadrant bbox UV density transfer")
    radius = float(cfg.get('kernel_radius', 0.025))
    min_count = int(cfg.get('density_min_count', 1))
    chunk = int(cfg.get('tgt_chunk_size', 512))
    radius2 = radius * radius

    cover_target_cells = set()  # final cover target body surface cells across all quadrants

    for q in range(n_regions):
        if not src_garment_q[q] or not src_body_q[q] or not tgt_surface_q[q]:
            print(f"  R{q}: empty, skip")
            continue
        # Quadrant bboxes (world)
        src_body_worlds = np.array([w for _, w in src_body_q[q]])
        tgt_body_worlds_q = []  # all target body voxels in this region
        for v in tgt_body:
            w = voxel_to_world(v[0], v[1], v[2], tgt_grid)
            if classify_tgt(w) == q:
                tgt_body_worlds_q.append(w)
        if not tgt_body_worlds_q:
            print(f"  R{q}: no tgt_body voxels, skip")
            continue
        tgt_body_worlds_q = np.array(tgt_body_worlds_q)
        src_min = src_body_worlds.min(axis=0)
        src_max = src_body_worlds.max(axis=0)
        tgt_min = tgt_body_worlds_q.min(axis=0)
        tgt_max = tgt_body_worlds_q.max(axis=0)
        src_span = np.where(src_max - src_min < 1e-9, 1.0, src_max - src_min)
        tgt_span = np.where(tgt_max - tgt_min < 1e-9, 1.0, tgt_max - tgt_min)

        # Source garment uvw
        sg_worlds = np.array([w for _, w in src_garment_q[q]])
        sg_uvws = (sg_worlds - src_min) / src_span

        # Target surface uvw (this quadrant)
        ts_worlds = np.array([w for _, w in tgt_surface_q[q]])
        ts_uvws = (ts_worlds - tgt_min) / tgt_span

        # Density check
        q_cover = 0
        for start in range(0, len(ts_uvws), chunk):
            end = min(start + chunk, len(ts_uvws))
            sub = ts_uvws[start:end]
            diff = sub[:, None, :] - sg_uvws[None, :, :]
            d2 = np.einsum('bmd,bmd->bm', diff, diff)
            count = (d2 <= radius2).sum(axis=1)
            for li, c in enumerate(count):
                if c >= min_count:
                    cell = tgt_surface_q[q][start + li][0]
                    cover_target_cells.add(cell)
                    q_cover += 1
        print(f"  R{q}: {q_cover} cover cells")

    print(f"[7] Build output cells = ALL outward 6-neighbors of cover target cells")
    output_cells = set()
    no_outward = 0
    for cell in cover_target_cells:
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

    # Hole-fill via dilation on same distance layer (catches quadrant seams)
    output_dilate = int(cfg.get('output_dilate', 0))
    if output_dilate > 0:
        print(f"[7.5] Output dilation x{output_dilate} (same dist=1 layer)")
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

    print(f"[8] Write")
    out_path = Path(tgt_cfg['output'])
    voxels_out = sorted([(x, y, z, 1) for x, y, z in output_cells])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, None)
    print(f"  Saved: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == '__main__':
    main()
