"""Surface Mask Transfer — 衣装が body 表面のどこを覆うかを bone-cylindrical UV で記録、
target body の同 UV 位置に shell として転写する。

Pipeline:
  1. Source body 表面 voxel set 構築 (6-neighbor で外側に隣接 cell があるもの)
  2. Source 衣装 voxel ごとに最寄りの source body 表面 cell を BFS で探す → cover mask
  3. Source mask を bone-local (z_norm, theta) cylindrical UV で表現
  4. Target body 表面 voxel set 構築
  5. Target 表面 cell ごとに source mask を nearest 検索 → 衣装あり/なし
  6. Cover cell の 1 voxel 外側 (outward normal 方向) に shell 出力

Usage: python scripts/voxel_retarget/surface_mask_transfer.py <config.json>
"""
from __future__ import annotations
import json
import math
import struct
import sys
from collections import defaultdict, deque
from pathlib import Path

import numpy as np


# ---------- VOX I/O ----------

def parse_vox(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:4] == b'VOX '
    pos = 8
    voxels = []
    size = None
    palette = None
    while pos < len(data):
        cid = data[pos:pos+4]
        n = struct.unpack('<I', data[pos+4:pos+8])[0]
        _m = struct.unpack('<I', data[pos+8:pos+12])[0]
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
        elif cid == b'RGBA':
            palette = data[pos:pos+n]
            pos += n
        else:
            pos += n
    return size, voxels, palette


def write_vox(path, size, voxels, palette):
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


# ---------- Geometry helpers ----------

def voxel_to_world(i, j, k, grid):
    o = np.array(grid['grid_origin'])
    return o + (np.array([i, j, k]) + 0.5) * grid['voxel_size']


def build_bone_lookup(skel):
    """name -> (head, tail, z_axis, length, x_axis, y_axis) with Gram-Schmidt perp axes."""
    table = {}
    for b in skel['bones']:
        head = np.array(b['head_rest'])
        tail = np.array(b['tail_rest'])
        d = tail - head
        L = float(np.linalg.norm(d))
        if L < 1e-9:
            table[b['name']] = (head, tail, np.array([0, 0, 1.0]), 0.0,
                                np.array([1.0, 0, 0]), np.array([0, 1.0, 0]))
            continue
        z = d / L
        ref = np.array([0.0, 0.0, 1.0])
        if abs(float(np.dot(z, ref))) > 0.95:
            ref = np.array([1.0, 0.0, 0.0])
        x = ref - z * float(np.dot(ref, z))
        x /= np.linalg.norm(x)
        y = np.cross(z, x)
        table[b['name']] = (head, tail, z, L, x, y)
    return table


def bone_cylindrical(world_pt, head, z_axis, L, x_axis, y_axis):
    rel = world_pt - head
    z = float(np.dot(rel, z_axis))
    z_norm = z / L if L > 1e-9 else 0.0
    perp = rel - z * z_axis
    px = float(np.dot(perp, x_axis))
    py = float(np.dot(perp, y_axis))
    theta = math.atan2(py, px)
    r = math.hypot(px, py)
    return z_norm, theta, r


# ---------- Surface extraction ----------

NB6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]


def extract_surface(body_occ, gx, gy, gz):
    """Surface cell = body cell with >=1 6-neighbor that is non-body (or out of grid)."""
    surface = set()
    for (x, y, z) in body_occ:
        for dx, dy, dz in NB6:
            n = (x+dx, y+dy, z+dz)
            if not (0 <= n[0] < gx and 0 <= n[1] < gy and 0 <= n[2] < gz):
                surface.add((x, y, z))
                break
            if n not in body_occ:
                surface.add((x, y, z))
                break
    return surface


def outward_normal(cell, body_occ, gx, gy, gz):
    """Return one outward 6-neighbor direction (dx,dy,dz) toward non-body. None if all neighbors body."""
    for dx, dy, dz in NB6:
        n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
        if not (0 <= n[0] < gx and 0 <= n[1] < gy and 0 <= n[2] < gz):
            return (dx, dy, dz)
        if n not in body_occ:
            return (dx, dy, dz)
    return None


# ---------- Main pipeline ----------

def transfer(config):
    src_cfg = config['source']
    tgt_cfg = config['target']

    src_dir = Path(src_cfg['voxel_dir'])
    garment = src_cfg['garment']
    uv_method = config.get('uv_method', 'bone-cylindrical')  # or 'body-bbox'

    print(f"[1] Load source data from {src_dir}  (uv_method={uv_method})")
    src_grid = json.loads((src_dir / 'grid.json').read_text(encoding='utf-8'))
    src_skel = json.loads((src_dir / 'skeleton.json').read_text(encoding='utf-8'))
    _bs, src_body_voxels, _bp = parse_vox(str(src_dir / 'body.vox'))
    src_body_w = json.loads((src_dir / 'body.weights.json').read_text(encoding='utf-8'))
    _gs, src_garment_voxels, src_palette = parse_vox(str(src_dir / f'{garment}.vox'))
    print(f"  Source: body={len(src_body_voxels)} voxels, garment={len(src_garment_voxels)} voxels")

    tgt_skel = json.loads(Path(tgt_cfg['skeleton']).read_text(encoding='utf-8'))
    tgt_grid = json.loads(Path(tgt_cfg['grid']).read_text(encoding='utf-8'))
    _ts, tgt_body_voxels, _tp = parse_vox(str(Path(tgt_cfg['body_vox'])))
    tgt_body_w = json.loads(Path(tgt_cfg['body_weights']).read_text(encoding='utf-8'))
    print(f"  Target: body={len(tgt_body_voxels)} voxels")

    bone_map = json.loads(Path(config['bone_map']).read_text(encoding='utf-8'))['vg_rename']
    src_bones = build_bone_lookup(src_skel)
    tgt_bones = build_bone_lookup(tgt_skel)

    sgx, sgy, sgz = src_grid['gx'], src_grid['gy'], src_grid['gz']
    tgx, tgy, tgz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']
    src_body_occ = set((x, y, z) for x, y, z, _ in src_body_voxels)
    tgt_body_occ = set((x, y, z) for x, y, z, _ in tgt_body_voxels)

    print(f"[2] Extract body surface cells")
    src_surface = extract_surface(src_body_occ, sgx, sgy, sgz)
    tgt_surface = extract_surface(tgt_body_occ, tgx, tgy, tgz)
    print(f"  Source surface: {len(src_surface)} cells, Target surface: {len(tgt_surface)} cells")

    # Body bbox in world coords (for body-bbox uv_method)
    def body_bbox_world(body_voxels, grid):
        xs = np.array([voxel_to_world(x, y, z, grid)[0] for x, y, z, _ in body_voxels])
        ys = np.array([voxel_to_world(x, y, z, grid)[1] for x, y, z, _ in body_voxels])
        zs = np.array([voxel_to_world(x, y, z, grid)[2] for x, y, z, _ in body_voxels])
        return ((xs.min(), xs.max()), (ys.min(), ys.max()), (zs.min(), zs.max()))

    src_bbox = body_bbox_world(src_body_voxels, src_grid)
    tgt_bbox = body_bbox_world(tgt_body_voxels, tgt_grid)
    print(f"  Source bbox (world): X={src_bbox[0]}, Y={src_bbox[1]}, Z={src_bbox[2]}")
    print(f"  Target bbox (world): X={tgt_bbox[0]}, Y={tgt_bbox[1]}, Z={tgt_bbox[2]}")

    def to_uv(world, bbox):
        return tuple((world[i] - bbox[i][0]) / (bbox[i][1] - bbox[i][0])
                     for i in range(3))

    print(f"[3] Map garment voxels to nearest source body surface cell (BFS)")
    # cover_cells: source body surface cell -> color (covered by garment)
    cover_cells = {}
    max_bfs = int(config.get('cover_max_search', 6))
    for (vx, vy, vz, color) in src_garment_voxels:
        # BFS from garment voxel, find first body surface cell
        start = (vx, vy, vz)
        if start in src_surface:
            cover_cells[start] = color
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
            if found not in cover_cells:
                cover_cells[found] = color
    print(f"  Covered source surface cells: {len(cover_cells)}")

    print(f"[4] Compute source body surface max-weight bone per voxel")
    # Build voxel_index → (i,j,k) map for source body (weights.json voxel order = vox file order)
    src_body_bone_names = src_body_w['bones']
    src_body_max_bone = {}  # (i,j,k) -> src bone name
    for idx, (vx, vy, vz, _c) in enumerate(src_body_voxels):
        wlist = src_body_w['weights'][idx]
        if not wlist:
            continue
        max_idx, _ = max(wlist, key=lambda p: p[1])
        src_body_max_bone[(vx, vy, vz)] = src_body_bone_names[max_idx]

    if uv_method == 'body-bbox':
        print(f"[5] Build source cover mask in body-bbox UV (bone-free)")
        # Mask: list of (u, v, w, color) — no bone partitioning
        src_mask_pts = []
        for cell, color in cover_cells.items():
            world = voxel_to_world(cell[0], cell[1], cell[2], src_grid)
            u, v, w = to_uv(world, src_bbox)
            src_mask_pts.append((u, v, w, color))
        print(f"  Source mask: {len(src_mask_pts)} (u,v,w) points")

        print(f"[6] Lookup target surface cells against source mask in body-bbox UV")
        threshold = float(config.get('uvw_threshold', 0.04))
        mask_arr = np.array([(p[0], p[1], p[2]) for p in src_mask_pts])
        mask_cols = np.array([p[3] for p in src_mask_pts], dtype=np.int32)

        output_cells = {}
        covered, no_outward, no_nearest = 0, 0, 0
        for cell in tgt_surface:
            world = voxel_to_world(cell[0], cell[1], cell[2], tgt_grid)
            u, v, w = to_uv(world, tgt_bbox)
            du = mask_arr[:, 0] - u
            dv = mask_arr[:, 1] - v
            dw = mask_arr[:, 2] - w
            d = np.sqrt(du * du + dv * dv + dw * dw)
            min_idx = int(np.argmin(d))
            if d[min_idx] > threshold:
                no_nearest += 1
                continue
            color = int(mask_cols[min_idx])
            out_dir = outward_normal(cell, tgt_body_occ, tgx, tgy, tgz)
            if out_dir is None:
                no_outward += 1
                continue
            out_cell = (cell[0]+out_dir[0], cell[1]+out_dir[1], cell[2]+out_dir[2])
            if not (0 <= out_cell[0] < tgx and 0 <= out_cell[1] < tgy and 0 <= out_cell[2] < tgz):
                no_outward += 1
                continue
            if out_cell in tgt_body_occ:
                no_outward += 1
                continue
            if out_cell not in output_cells:
                output_cells[out_cell] = color
            covered += 1
        print(f"  Target cells covered: {covered}, no_outward: {no_outward}, no_nearest: {no_nearest}")
        print(f"  Output unique voxels: {len(output_cells)}")

        print(f"[8] Write output vox")
        out_path = Path(tgt_cfg['output'])
        voxels_out = sorted([(x, y, z, c) for (x, y, z), c in output_cells.items()])
        write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, src_palette)
        print(f"  Saved: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
        return

    print(f"[5] Build source cover mask in bone-cylindrical UV")
    # tgt_bone_name -> list of (z_norm, theta, color)
    src_mask = defaultdict(list)
    skipped_bone, skipped_remap = 0, 0
    for cell, color in cover_cells.items():
        src_bone = src_body_max_bone.get(cell)
        if src_bone is None:
            skipped_bone += 1
            continue
        tgt_bone = bone_map.get(src_bone)
        if tgt_bone is None or tgt_bone not in tgt_bones:
            skipped_remap += 1
            continue
        if src_bone not in src_bones:
            skipped_bone += 1
            continue
        head, _, zax, L, xax, yax = src_bones[src_bone]
        if L < 1e-6:
            continue
        world = voxel_to_world(cell[0], cell[1], cell[2], src_grid)
        zn, th, _r = bone_cylindrical(world, head, zax, L, xax, yax)
        src_mask[tgt_bone].append((zn, th, color))
    print(f"  Mask entries per target bone: {{k: len(v) for k, v in src_mask.items()}}")
    for k, v in src_mask.items():
        print(f"    {k}: {len(v)} cells")
    if skipped_bone or skipped_remap:
        print(f"  Skipped: no_bone={skipped_bone}, no_remap={skipped_remap}")

    print(f"[6] Compute target body surface max-weight bone per voxel")
    tgt_body_bone_names = tgt_body_w['bones']
    tgt_body_max_bone = {}
    for idx, (vx, vy, vz, _c) in enumerate(tgt_body_voxels):
        wlist = tgt_body_w['weights'][idx]
        if not wlist:
            continue
        max_idx, _ = max(wlist, key=lambda p: p[1])
        tgt_body_max_bone[(vx, vy, vz)] = tgt_body_bone_names[max_idx]

    print(f"[7] Lookup target surface cells against source mask")
    # Threshold to reject mask matches that are too far in normalized UV space.
    # Set high to favor "always cover within same bone region", low to be strict.
    z_threshold = float(config.get('z_threshold', 0.5))   # large default
    theta_threshold = float(config.get('theta_threshold', 1.5))  # ~86°
    # NEW: also map source z_norm range to target z_norm range per bone, so
    # different bone lengths align bone-region-wise instead of head-relative.
    align_z_range = bool(config.get('align_z_range', True))
    # Precompute source z_norm min/max per bone for range alignment
    src_z_range = {}
    for bone, entries in src_mask.items():
        if not entries:
            continue
        zs = [e[0] for e in entries]
        src_z_range[bone] = (min(zs), max(zs))

    # Compute target z_norm range per bone from body surface cells
    tgt_z_range = defaultdict(lambda: [float('inf'), float('-inf')])
    for cell in tgt_surface:
        tbone = tgt_body_max_bone.get(cell)
        if tbone is None or tbone not in src_mask:
            continue
        head, _, zax, L, xax, yax = tgt_bones[tbone]
        if L < 1e-6:
            continue
        world = voxel_to_world(cell[0], cell[1], cell[2], tgt_grid)
        zn, _t, _r = bone_cylindrical(world, head, zax, L, xax, yax)
        tgt_z_range[tbone][0] = min(tgt_z_range[tbone][0], zn)
        tgt_z_range[tbone][1] = max(tgt_z_range[tbone][1], zn)
    print(f"  Per-bone z_norm range: src vs tgt")
    for bone in src_z_range:
        sr = src_z_range[bone]; tr = tgt_z_range.get(bone, [None, None])
        print(f"    {bone}: src=[{sr[0]:.3f}, {sr[1]:.3f}], tgt=[{tr[0] if tr[0] != float('inf') else '?'}, {tr[1] if tr[1] != float('-inf') else '?'}]")

    # Convert mask to numpy arrays for fast vectorized search.
    # Re-map src z_norm into tgt z_norm range per bone so bone-region alignment works.
    mask_arr = {}
    for bone, entries in src_mask.items():
        if not entries:
            continue
        sr_lo, sr_hi = src_z_range[bone]
        if align_z_range and bone in tgt_z_range and tgt_z_range[bone][1] > tgt_z_range[bone][0]:
            tr_lo, tr_hi = tgt_z_range[bone]
            sr_span = sr_hi - sr_lo if sr_hi > sr_lo else 1.0
            tr_span = tr_hi - tr_lo
            zns = [(e[0] - sr_lo) / sr_span * tr_span + tr_lo for e in entries]
        else:
            zns = [e[0] for e in entries]
        arr = np.array([(zns[i], entries[i][1]) for i in range(len(entries))])
        cols = np.array([e[2] for e in entries], dtype=np.int32)
        mask_arr[bone] = (arr, cols)

    output_cells = {}
    covered, no_mask, no_outward, no_nearest = 0, 0, 0, 0
    for cell in tgt_surface:
        tbone = tgt_body_max_bone.get(cell)
        if tbone is None or tbone not in mask_arr:
            no_mask += 1
            continue
        head, _, zax, L, xax, yax = tgt_bones[tbone]
        if L < 1e-6:
            continue
        world = voxel_to_world(cell[0], cell[1], cell[2], tgt_grid)
        zn, th, _r = bone_cylindrical(world, head, zax, L, xax, yax)
        arr, cols = mask_arr[tbone]
        dz = arr[:, 0] - zn
        dtheta = arr[:, 1] - th
        dtheta = ((dtheta + math.pi) % (2 * math.pi)) - math.pi
        d = np.sqrt((dz / z_threshold) ** 2 + (dtheta / theta_threshold) ** 2)
        min_idx = int(np.argmin(d))
        if d[min_idx] > 1.0:
            no_nearest += 1
            continue
        color = int(cols[min_idx])
        # Output: 1 voxel outward
        out_dir = outward_normal(cell, tgt_body_occ, tgx, tgy, tgz)
        if out_dir is None:
            no_outward += 1
            continue
        out_cell = (cell[0]+out_dir[0], cell[1]+out_dir[1], cell[2]+out_dir[2])
        if not (0 <= out_cell[0] < tgx and 0 <= out_cell[1] < tgy and 0 <= out_cell[2] < tgz):
            no_outward += 1
            continue
        # Don't write into body (in case outward heuristic missed)
        if out_cell in tgt_body_occ:
            no_outward += 1
            continue
        if out_cell not in output_cells:
            output_cells[out_cell] = color
        covered += 1
    print(f"  Target cells covered: {covered}, no_mask: {no_mask}, no_outward: {no_outward}, no_nearest: {no_nearest}")
    print(f"  Output unique voxels: {len(output_cells)}")

    print(f"[8] Write output vox")
    out_path = Path(tgt_cfg['output'])
    voxels_out = sorted([(x, y, z, c) for (x, y, z), c in output_cells.items()])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, src_palette)
    print(f"  Saved: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


def main():
    if len(sys.argv) < 2:
        print("Usage: surface_mask_transfer.py <config.json>")
        sys.exit(1)
    cfg = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    transfer(cfg)


if __name__ == '__main__':
    main()
