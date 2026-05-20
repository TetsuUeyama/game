"""Boundary + inside-fill transfer.

衣装範囲 (cover cells on source body surface) を target に投影後、
target body 表面 graph 上で morphological closing を行って穴を埋める。

Pipeline:
  1. Source body surface S_src + cover cells C_src (BFS from garment voxels)
  2. Target body surface S_tgt
  3. Direct projection: 各 c in C_src について bbox-uv で S_tgt の最寄り cell を選んで C_tgt に加える
  4. Morphological closing (dilate K 段 → erode K 段) on target surface graph
     - Dilate: cover の 6-neighbor 表面 cell を加える
     - Erode: 6-neighbor 表面 cell に non-cover があれば外す
     - K voxel 以下の穴は埋まり、boundary 外側は維持
  5. Cover cells の 1 voxel 外側 (全 outward 6-neighbor) を出力

Usage: python boundary_fill_transfer.py <config.json>
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


def body_bbox_world(body_voxels, grid):
    arr = np.array([voxel_to_world(x, y, z, grid) for x, y, z, _ in body_voxels])
    return arr.min(axis=0), arr.max(axis=0)


def surface_neighbors(cell, surface_set):
    """Return 6-neighbor cells that are on the surface."""
    out = []
    for dx, dy, dz in NB6:
        n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
        if n in surface_set:
            out.append(n)
    return out


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

    print(f"[3] Extract body surfaces")
    src_surface = extract_surface(src_body_occ, sgx, sgy, sgz)
    tgt_surface = extract_surface(tgt_body_occ, tgx, tgy, tgz)
    print(f"  src_surface={len(src_surface)}, tgt_surface={len(tgt_surface)}")

    print(f"[4] BFS: garment voxel -> nearest source surface cell")
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
    print(f"  source cover cells: {len(cover_cells)}")

    print(f"[5] Project source cover to target body surface via bbox uv")
    src_min, src_max = body_bbox_world(src_body, src_grid)
    tgt_min, tgt_max = body_bbox_world(tgt_body, tgt_grid)
    src_span = np.where(src_max - src_min < 1e-9, 1.0, src_max - src_min)
    tgt_span = np.where(tgt_max - tgt_min < 1e-9, 1.0, tgt_max - tgt_min)

    tgt_surface_list = list(tgt_surface)
    tgt_worlds = np.array([voxel_to_world(c[0], c[1], c[2], tgt_grid) for c in tgt_surface_list])
    tgt_uvws = (tgt_worlds - tgt_min) / tgt_span

    cover_list = list(cover_cells)
    cover_worlds = np.array([voxel_to_world(c[0], c[1], c[2], src_grid) for c in cover_list])
    cover_uvws = (cover_worlds - src_min) / src_span

    # Find nearest target surface cell for each source cover (chunked)
    chunk = int(cfg.get('chunk_size', 256))
    tgt_cover = set()
    for start in range(0, len(cover_uvws), chunk):
        end = min(start + chunk, len(cover_uvws))
        sub = cover_uvws[start:end]
        diff = sub[:, None, :] - tgt_uvws[None, :, :]
        d2 = np.einsum('bmd,bmd->bm', diff, diff)
        idx = np.argmin(d2, axis=1)
        for i in idx.tolist():
            tgt_cover.add(tgt_surface_list[int(i)])
    print(f"  target cover cells (after projection): {len(tgt_cover)}")

    # Morphological closing: dilate K then erode K
    K = int(cfg.get('closing_iters', 3))
    print(f"[6] Morphological closing on target surface graph (K={K})")

    def dilate(cover_set, k):
        cur = set(cover_set)
        for step in range(k):
            new = set()
            for c in cur:
                for nb in surface_neighbors(c, tgt_surface):
                    if nb not in cur:
                        new.add(nb)
            cur |= new
            print(f"    dilate step {step+1}: +{len(new)}, total {len(cur)}")
        return cur

    def erode(cover_set, k):
        cur = set(cover_set)
        for step in range(k):
            removed = set()
            for c in cur:
                # if any surface neighbor is outside cover → boundary, remove
                for nb in surface_neighbors(c, tgt_surface):
                    if nb not in cur:
                        removed.add(c)
                        break
            cur -= removed
            print(f"    erode step {step+1}: -{len(removed)}, total {len(cur)}")
        return cur

    expanded = dilate(tgt_cover, K)
    closed = erode(expanded, K)
    print(f"  after closing: {len(closed)} cover cells (started {len(tgt_cover)})")

    print(f"[7] Build output cells = ALL outward 6-neighbors of cover cells")
    output_cells = set()
    no_outward = 0
    for cell in closed:
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

    print(f"[8] Write")
    out_path = Path(tgt_cfg['output'])
    voxels_out = sorted([(x, y, z, 1) for x, y, z in output_cells])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, None)
    print(f"  Saved: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == '__main__':
    main()
