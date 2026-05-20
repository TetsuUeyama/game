"""Refine a retargeted garment .vox to match the source garment's silhouette.

Why: surface_anchor_deform and bbox_bin_transfer place voxels at QM body
positions that approximate the source. Edges can be jagged / overshoot, and
some bins covered by the source can be missing on the target. This pass:

  1. Build source coverage bins in bbox-UV space (bins covered by source garment
     mapped to source body surface, dilated `bin_dilate` times). Each bin stores
     mean source color.
  2. Remove target voxels whose bin is NOT in source coverage (excess cleanup).
  3. For each source bin missing in target, find target body surface cells in
     that bin; for each, add the 1-outward neighbor with the bin's mean color.
  4. Quantize palette to <=255 colors and write.

Usage:
  python refine_to_source_silhouette.py <config.json>

Config schema:
{
  "bin_n": 150,
  "bin_dilate": 1,
  "cover_max_search": 6,
  "source": { "voxel_dir": "...", "garment": "casual_thong" },
  "target": {
    "grid": "...", "body_vox": "...",
    "input":  "<retargeted .vox to refine>",
    "output": "<refined .vox path>"
  }
}
"""
import json
import struct
import sys
from collections import deque, Counter
from pathlib import Path

import numpy as np


NB6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]


def parse_vox_with_palette(path):
    with open(path, 'rb') as f:
        data = f.read()
    pos = 8
    main_cs = struct.unpack('<I', data[pos+4:pos+8])[0]; pos += 12
    main_ccs_start = pos + main_cs
    pos = main_ccs_start
    end = len(data)
    size = None; voxels = []; palette = None
    while pos < end:
        cid = data[pos:pos+4]
        cs = struct.unpack('<I', data[pos+4:pos+8])[0]
        pos += 12
        chunk_end = pos + cs
        if cid == b'SIZE':
            size = struct.unpack('<III', data[pos:pos+12])
        elif cid == b'XYZI':
            n = struct.unpack('<I', data[pos:pos+4])[0]
            for i in range(n):
                p = pos + 4 + i*4
                voxels.append((data[p], data[p+1], data[p+2], data[p+3]))
        elif cid == b'RGBA':
            palette = []
            for i in range(256):
                p = pos + i*4
                palette.append((data[p], data[p+1], data[p+2], data[p+3]))
        pos = chunk_end
    return size, voxels, palette


def write_vox(path, size, voxels, palette_rgba):
    main = bytearray()
    main += b'SIZE' + struct.pack('<II', 12, 0) + struct.pack('<III', *size)
    xyzi = struct.pack('<I', len(voxels))
    for x, y, z, c in voxels:
        xyzi += bytes([x, y, z, c])
    main += b'XYZI' + struct.pack('<II', len(xyzi), 0) + xyzi
    if palette_rgba is not None:
        pal = bytearray()
        for i in range(256):
            if i < len(palette_rgba): pal += bytes(palette_rgba[i])
            else: pal += bytes([0,0,0,255])
        main += b'RGBA' + struct.pack('<II', 256*4, 0) + bytes(pal)
    out = b'VOX ' + struct.pack('<I', 150) + b'MAIN' + struct.pack('<II', 0, len(main)) + main
    Path(path).parent.mkdir(parents=True, exist_ok=True)
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
                surface.add((x, y, z)); break
            if n not in occ:
                surface.add((x, y, z)); break
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


def uv_to_bin(u, bin_n):
    return (min(bin_n-1, max(0, int(u[0]*bin_n))),
            min(bin_n-1, max(0, int(u[1]*bin_n))),
            min(bin_n-1, max(0, int(u[2]*bin_n))))


def quantize_palette(rgb_list, max_colors=255):
    buckets = Counter()
    for rgb in rgb_list:
        key = ((rgb[0]>>4)<<4, (rgb[1]>>4)<<4, (rgb[2]>>4)<<4)
        buckets[key] += 1
    top = [k for k, _ in buckets.most_common(max_colors)]
    if not top: return [(128,128,128)], [0]*len(rgb_list)
    palette = top
    idx_map = {}; indices = []
    for rgb in rgb_list:
        key = ((rgb[0]>>4)<<4, (rgb[1]>>4)<<4, (rgb[2]>>4)<<4)
        if key in idx_map: indices.append(idx_map[key]); continue
        if key in palette: i = palette.index(key)
        else:
            best = 0; best_d = 1e18
            for j, p in enumerate(palette):
                d = (p[0]-key[0])**2 + (p[1]-key[1])**2 + (p[2]-key[2])**2
                if d < best_d: best_d = d; best = j
            i = best
        idx_map[key] = i; indices.append(i)
    return palette, indices


def main():
    cfg = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    src_cfg = cfg['source']; tgt_cfg = cfg['target']
    src_dir = Path(src_cfg['voxel_dir'])
    garment = src_cfg['garment']

    print(f"[1] Load source + target")
    src_grid = json.loads((src_dir / 'grid.json').read_text(encoding='utf-8'))
    _bs, src_body, _ = parse_vox_with_palette(str(src_dir / 'body.vox'))
    _gs, src_garment_vox, src_palette = parse_vox_with_palette(str(src_dir / f'{garment}.vox'))

    tgt_grid = json.loads(Path(tgt_cfg['grid']).read_text(encoding='utf-8'))
    _ts, tgt_body, _ = parse_vox_with_palette(str(Path(tgt_cfg['body_vox'])))
    _is, tgt_in, _tin_pal = parse_vox_with_palette(str(Path(tgt_cfg['input'])))
    print(f"  src_garment={len(src_garment_vox)} (palette={'yes' if src_palette else 'no'}), "
          f"tgt_in={len(tgt_in)}")

    src_body_occ = set((x,y,z) for x,y,z,_ in src_body)
    tgt_body_occ = set((x,y,z) for x,y,z,_ in tgt_body)
    sgx, sgy, sgz = src_grid['gx'], src_grid['gy'], src_grid['gz']
    tgx, tgy, tgz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

    src_surface = extract_surface(src_body_occ, sgx, sgy, sgz)
    tgt_surface = extract_surface(tgt_body_occ, tgx, tgy, tgz)

    print(f"[2] BFS source garment -> body surface cover cells (with colors)")
    max_bfs = int(cfg.get('cover_max_search', 6))
    cover_cell_colors = {}
    for (vx, vy, vz, ci) in src_garment_vox:
        color = (src_palette[ci-1][0], src_palette[ci-1][1], src_palette[ci-1][2]) \
                if src_palette and 1 <= ci <= 256 else (128, 128, 128)
        start = (vx, vy, vz)
        if start in src_surface:
            cover_cell_colors.setdefault(start, []).append(color); continue
        visited = {start}; q = deque([(start, 0)]); found = None
        while q:
            c, d = q.popleft()
            if d > max_bfs: break
            if c in src_surface: found = c; break
            for dx, dy, dz in NB6:
                n = (c[0]+dx, c[1]+dy, c[2]+dz)
                if n in visited: continue
                if not (0 <= n[0] < sgx and 0 <= n[1] < sgy and 0 <= n[2] < sgz): continue
                visited.add(n); q.append((n, d+1))
        if found is not None:
            cover_cell_colors.setdefault(found, []).append(color)
    print(f"  cover cells: {len(cover_cell_colors)}")

    print(f"[3] Bucket source bins")
    src_min, src_max = body_bbox_world(src_body, src_grid)
    tgt_min, tgt_max = body_bbox_world(tgt_body, tgt_grid)
    bin_n = int(cfg.get('bin_n', 150))
    src_bin_colors = {}
    for cell, colors in cover_cell_colors.items():
        w = voxel_to_world(cell[0], cell[1], cell[2], src_grid)
        u = to_uv(w, src_min, src_max)
        bi = uv_to_bin(u, bin_n)
        src_bin_colors.setdefault(bi, []).extend(colors)
    print(f"  src bins: {len(src_bin_colors)}")

    # Dilate source bins (color = mean of neighbors)
    bin_dilate = int(cfg.get('bin_dilate', 1))
    for step in range(bin_dilate):
        added = {}
        keys = set(src_bin_colors.keys())
        for bi in keys:
            for dx, dy, dz in NB6:
                n = (bi[0]+dx, bi[1]+dy, bi[2]+dz)
                if not (0 <= n[0] < bin_n and 0 <= n[1] < bin_n and 0 <= n[2] < bin_n): continue
                if n not in src_bin_colors and n not in added:
                    added[n] = list(src_bin_colors[bi])
        for n, colors in added.items():
            src_bin_colors[n] = colors
        print(f"  bin dilate {step+1}: +{len(added)}, total={len(src_bin_colors)}")

    def mean_color(colors):
        n = len(colors)
        return (int(sum(c[0] for c in colors)/n),
                int(sum(c[1] for c in colors)/n),
                int(sum(c[2] for c in colors)/n))
    src_bin_mean = {bi: mean_color(c) for bi, c in src_bin_colors.items()}

    print(f"[4] Filter target voxels (drop bins not in source mask)")
    output_cells = {}  # cell -> (r,g,b)
    kept, dropped = 0, 0
    for (x, y, z, ci) in tgt_in:
        w = voxel_to_world(x, y, z, tgt_grid)
        u = to_uv(w, tgt_min, tgt_max)
        bi = uv_to_bin(u, bin_n)
        if bi in src_bin_mean:
            # keep existing palette color (don't overwrite with bin mean — preserve detail)
            if _tin_pal and 1 <= ci <= 256:
                rgba = _tin_pal[ci-1]; col = (rgba[0], rgba[1], rgba[2])
            else:
                col = src_bin_mean[bi]
            output_cells[(x, y, z)] = col
            kept += 1
        else:
            dropped += 1
    print(f"  kept={kept}, dropped (excess)={dropped}")

    print(f"[5] Fill missing source bins from target body surface")
    existing_bins = set()
    for (x, y, z) in output_cells:
        w = voxel_to_world(x, y, z, tgt_grid)
        bi = uv_to_bin(to_uv(w, tgt_min, tgt_max), bin_n)
        existing_bins.add(bi)
    missing_bins = set(src_bin_mean.keys()) - existing_bins
    print(f"  missing bins: {len(missing_bins)}")

    # Build map: target surface cell -> bin (for fast lookup of which surface cells fall in missing bins)
    surf_by_bin = {}
    for cell in tgt_surface:
        w = voxel_to_world(cell[0], cell[1], cell[2], tgt_grid)
        bi = uv_to_bin(to_uv(w, tgt_min, tgt_max), bin_n)
        surf_by_bin.setdefault(bi, []).append(cell)

    added_fill = 0
    for bi in missing_bins:
        cells = surf_by_bin.get(bi, [])
        for cell in cells:
            out_dir = outward_normal(cell, tgt_body_occ, tgx, tgy, tgz)
            if out_dir is None: continue
            oc = (cell[0]+out_dir[0], cell[1]+out_dir[1], cell[2]+out_dir[2])
            if not (0 <= oc[0] < tgx and 0 <= oc[1] < tgy and 0 <= oc[2] < tgz): continue
            if oc in tgt_body_occ: continue
            if oc in output_cells: continue
            output_cells[oc] = src_bin_mean[bi]
            added_fill += 1
    print(f"  filled missing: +{added_fill}")

    print(f"[6] Quantize palette + write")
    rgbs = list(output_cells.values())
    palette, indices = quantize_palette(rgbs, max_colors=255)
    palette_rgba = [(r,g,b,255) for (r,g,b) in palette]
    voxels_out = []
    for i, (cell, _) in enumerate(output_cells.items()):
        voxels_out.append((cell[0], cell[1], cell[2], indices[i] + 1))
    voxels_out.sort()
    out_path = Path(tgt_cfg['output'])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, palette_rgba)
    print(f"  Wrote {out_path} (palette={len(palette)}, voxels={len(voxels_out)})")


if __name__ == '__main__':
    main()
