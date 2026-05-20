"""Bone-local source-vs-target silhouette refine.

Why bbox-UV (refine_to_source_silhouette) fails for surface_anchor outputs:
  surface_anchor uses world-coord offsets, so target voxels can land at
  different global bbox-UV than source. Comparing against global bbox-UV
  mask deletes valid voxels.

Bone-local fix: group voxels by max-weight bone, compute each bone's body
voxel bbox separately, and map (bone, bbox-uv) source <-> target. Body
proportions differ but anatomical regions correspond.

Pipeline:
  1. Load bone rename map (src bone name -> tgt bone name)
  2. Per-bone bbox: for src body and tgt body, group body voxels by max-weight
     bone, compute world-space bbox of each bone's voxels
  3. Source garment -> nearest src body surface cell -> bone -> uv in that
     bone's source-bbox -> bin. Track per-bin source color.
  4. Same for current target garment voxels.
  5. Drop target voxels whose (bone, bin) not in source set.
  6. For source (bone, bin) missing in target: find target body surface cells
     with same (bone, bin), add 1-outward neighbor with bin's mean color.
  7. Quantize palette + write.

Usage: python refine_to_source_bone_local.py <config.json>

Config:
  {
    "bin_n": 8,             # per-bone bin resolution (small — each bone is small)
    "bin_dilate": 1,
    "cover_max_search": 6,
    "rename_map": "config/transplant_rachel_to_qm.json",
    "source": {
      "voxel_dir": ".../rachel",
      "garment": "casual_thong",
      "body_weights": ".../rachel/body.weights.json"
    },
    "target": {
      "grid": ".../qm/grid.json",
      "body_vox": ".../qm/body.vox",
      "body_weights": ".../qm/body.weights.json",
      "input":  ".../rachel_qm/casual_thong_bbox_bin.vox",
      "output": ".../rachel_qm/casual_thong_bbox_bin.vox"
    }
  }
"""
import json
import struct
import sys
from collections import deque, Counter, defaultdict
from pathlib import Path

import numpy as np


NB6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]


def parse_vox_with_palette(path):
    with open(path, 'rb') as f:
        data = f.read()
    pos = 8
    main_cs = struct.unpack('<I', data[pos+4:pos+8])[0]; pos += 12
    pos += main_cs
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


def uv_to_bin(u, bin_n):
    return (min(bin_n-1, max(0, int(u[0]*bin_n))),
            min(bin_n-1, max(0, int(u[1]*bin_n))),
            min(bin_n-1, max(0, int(u[2]*bin_n))))


def build_bone_bboxes(body_vox, body_weights, grid, rename=None):
    """Group body voxels by max-weight bone -> compute per-bone world bbox.
    Returns: dict bone_name -> (min_xyz, max_xyz) and dict cell -> bone_name."""
    bone_names = body_weights['bones']
    cell_bone = {}
    bone_to_worlds = defaultdict(list)
    for vi, (vx, vy, vz, _) in enumerate(body_vox):
        wlist = body_weights['weights'][vi]
        if not wlist:
            continue
        bi, _ = max(wlist, key=lambda p: p[1])
        bn = bone_names[bi]
        if rename:
            bn = rename.get(bn, bn)
        cell_bone[(vx, vy, vz)] = bn
        bone_to_worlds[bn].append(voxel_to_world(vx, vy, vz, grid))
    bone_bbox = {}
    for bn, worlds in bone_to_worlds.items():
        arr = np.array(worlds)
        bone_bbox[bn] = (arr.min(axis=0), arr.max(axis=0))
    return cell_bone, bone_bbox


def cell_bone_local_uv_bin(cell, grid, cell_bone, bone_bbox, bin_n):
    bn = cell_bone.get(cell)
    if bn is None or bn not in bone_bbox:
        return None
    bb_min, bb_max = bone_bbox[bn]
    w = voxel_to_world(cell[0], cell[1], cell[2], grid)
    span = bb_max - bb_min
    span = np.where(span < 1e-9, 1.0, span)
    uv = (w - bb_min) / span
    return (bn, uv_to_bin(uv, bin_n))


def find_cover_cell(src_garment_cell, src_surface, sgx, sgy, sgz, max_bfs):
    if src_garment_cell in src_surface:
        return src_garment_cell
    visited = {src_garment_cell}; q = deque([(src_garment_cell, 0)])
    while q:
        c, d = q.popleft()
        if d > max_bfs:
            return None
        if c in src_surface:
            return c
        for dx, dy, dz in NB6:
            n = (c[0]+dx, c[1]+dy, c[2]+dz)
            if n in visited: continue
            if not (0 <= n[0] < sgx and 0 <= n[1] < sgy and 0 <= n[2] < sgz): continue
            visited.add(n); q.append((n, d+1))
    return None


def find_target_cover_cell(tgt_garment_cell, tgt_surface, tgx, tgy, tgz, max_bfs):
    """Same BFS-to-body-surface but for target voxels.
    Note: target garment voxels are usually 1 outward of body surface,
    so 'cover cell' is the cell they're projecting from."""
    if tgt_garment_cell in tgt_surface:
        return tgt_garment_cell
    visited = {tgt_garment_cell}; q = deque([(tgt_garment_cell, 0)])
    while q:
        c, d = q.popleft()
        if d > max_bfs:
            return None
        if c in tgt_surface:
            return c
        for dx, dy, dz in NB6:
            n = (c[0]+dx, c[1]+dy, c[2]+dz)
            if n in visited: continue
            if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz): continue
            visited.add(n); q.append((n, d+1))
    return None


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
    bin_n = int(cfg.get('bin_n', 8))
    bin_dilate = int(cfg.get('bin_dilate', 1))
    max_bfs = int(cfg.get('cover_max_search', 6))

    rename = {}
    rename_path = cfg.get('rename_map')
    if rename_path:
        rename = json.loads(Path(rename_path).read_text(encoding='utf-8')).get('vg_rename', {})
        print(f"[map] bone rename entries: {len(rename)}")

    src_dir = Path(src_cfg['voxel_dir'])
    src_grid = json.loads((src_dir / 'grid.json').read_text(encoding='utf-8'))
    _bs, src_body, _ = parse_vox_with_palette(str(src_dir / 'body.vox'))
    src_weights = json.loads(Path(src_cfg.get('body_weights', src_dir / 'body.weights.json')).read_text(encoding='utf-8'))
    _gs, src_garment, src_palette = parse_vox_with_palette(str(src_dir / f"{src_cfg['garment']}.vox"))
    sgx, sgy, sgz = src_grid['gx'], src_grid['gy'], src_grid['gz']

    tgt_grid = json.loads(Path(tgt_cfg['grid']).read_text(encoding='utf-8'))
    _ts, tgt_body, _ = parse_vox_with_palette(str(Path(tgt_cfg['body_vox'])))
    tgt_weights = json.loads(Path(tgt_cfg['body_weights']).read_text(encoding='utf-8'))
    _is, tgt_in, tgt_in_palette = parse_vox_with_palette(str(Path(tgt_cfg['input'])))
    tgx, tgy, tgz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

    print(f"[1] src body={len(src_body)}, src garment={len(src_garment)} (pal={'y' if src_palette else 'n'})")
    print(f"    tgt body={len(tgt_body)}, tgt in={len(tgt_in)}")

    src_body_occ = set((x,y,z) for x,y,z,_ in src_body)
    tgt_body_occ = set((x,y,z) for x,y,z,_ in tgt_body)
    src_surface = extract_surface(src_body_occ, sgx, sgy, sgz)
    tgt_surface = extract_surface(tgt_body_occ, tgx, tgy, tgz)

    print(f"[2] per-bone bbox (src renamed via map -> qm bone names)")
    src_cell_bone, src_bone_bbox = build_bone_bboxes(src_body, src_weights, src_grid, rename)
    tgt_cell_bone, tgt_bone_bbox = build_bone_bboxes(tgt_body, tgt_weights, tgt_grid, rename=None)
    print(f"    src bones (post-rename): {len(src_bone_bbox)}, tgt bones: {len(tgt_bone_bbox)}")
    shared = set(src_bone_bbox) & set(tgt_bone_bbox)
    print(f"    shared: {len(shared)}")

    print(f"[3] src garment -> (bone, uv_bin)")
    src_bin_colors = defaultdict(list)  # (bone, bin) -> list of (r,g,b)
    src_garment_bins = set()
    for (vx, vy, vz, ci) in src_garment:
        cover = find_cover_cell((vx, vy, vz), src_surface, sgx, sgy, sgz, max_bfs)
        if cover is None: continue
        key = cell_bone_local_uv_bin(cover, src_grid, src_cell_bone, src_bone_bbox, bin_n)
        if key is None: continue
        if key[0] not in tgt_bone_bbox:  # bone has no target counterpart
            continue
        color = (src_palette[ci-1][0], src_palette[ci-1][1], src_palette[ci-1][2]) \
                if src_palette and 1 <= ci <= 256 else (128, 128, 128)
        src_bin_colors[key].append(color)
        src_garment_bins.add(key)
    print(f"    src (bone,bin) count: {len(src_garment_bins)}")

    # Dilate within bone (in bin space)
    for step in range(bin_dilate):
        added = {}
        for (bn, bi) in list(src_bin_colors.keys()):
            for dx, dy, dz in NB6:
                n = (bi[0]+dx, bi[1]+dy, bi[2]+dz)
                if not (0 <= n[0] < bin_n and 0 <= n[1] < bin_n and 0 <= n[2] < bin_n): continue
                nk = (bn, n)
                if nk not in src_bin_colors and nk not in added:
                    added[nk] = list(src_bin_colors[(bn, bi)])
        for nk, colors in added.items():
            src_bin_colors[nk] = colors
        print(f"    bone-bin dilate {step+1}: +{len(added)} (total {len(src_bin_colors)})")

    def mean_color(colors):
        n = len(colors)
        return (int(sum(c[0] for c in colors)/n),
                int(sum(c[1] for c in colors)/n),
                int(sum(c[2] for c in colors)/n))
    src_bin_mean = {k: mean_color(v) for k, v in src_bin_colors.items()}
    src_bin_keys = set(src_bin_mean)

    print(f"[4] Filter target voxels: keep if (bone, bin) in src set")
    output_cells = {}  # cell -> (r,g,b)
    kept, dropped = 0, 0
    for (x, y, z, ci) in tgt_in:
        cover = find_target_cover_cell((x, y, z), tgt_surface, tgx, tgy, tgz, max_bfs)
        if cover is None:
            dropped += 1; continue
        key = cell_bone_local_uv_bin(cover, tgt_grid, tgt_cell_bone, tgt_bone_bbox, bin_n)
        if key is None:
            dropped += 1; continue
        if key in src_bin_keys:
            if tgt_in_palette and 1 <= ci <= 256:
                rgba = tgt_in_palette[ci-1]; col = (rgba[0], rgba[1], rgba[2])
            else:
                col = src_bin_mean[key]
            output_cells[(x, y, z)] = col
            kept += 1
        else:
            dropped += 1
    print(f"    kept={kept}, dropped={dropped}")

    print(f"[5] Fill missing source (bone, bin) on target body surface")
    # Build (bone, bin) -> list of target surface cells
    tgt_surf_by_key = defaultdict(list)
    for cell in tgt_surface:
        k = cell_bone_local_uv_bin(cell, tgt_grid, tgt_cell_bone, tgt_bone_bbox, bin_n)
        if k is None: continue
        tgt_surf_by_key[k].append(cell)

    existing_keys = set()
    for (x, y, z) in output_cells:
        cover = find_target_cover_cell((x, y, z), tgt_surface, tgx, tgy, tgz, max_bfs)
        if cover is None: continue
        k = cell_bone_local_uv_bin(cover, tgt_grid, tgt_cell_bone, tgt_bone_bbox, bin_n)
        if k: existing_keys.add(k)
    missing = src_bin_keys - existing_keys
    print(f"    missing keys: {len(missing)}")

    added_fill = 0
    for k in missing:
        cells = tgt_surf_by_key.get(k, [])
        for cell in cells:
            out_dir = outward_normal(cell, tgt_body_occ, tgx, tgy, tgz)
            if out_dir is None: continue
            oc = (cell[0]+out_dir[0], cell[1]+out_dir[1], cell[2]+out_dir[2])
            if not (0 <= oc[0] < tgx and 0 <= oc[1] < tgy and 0 <= oc[2] < tgz): continue
            if oc in tgt_body_occ: continue
            if oc in output_cells: continue
            output_cells[oc] = src_bin_mean[k]
            added_fill += 1
    print(f"    filled: +{added_fill}")

    print(f"[6] Quantize + write")
    rgbs = list(output_cells.values())
    palette, indices = quantize_palette(rgbs, max_colors=255)
    palette_rgba = [(r,g,b,255) for (r,g,b) in palette]
    voxels_out = sorted([(c[0], c[1], c[2], indices[i] + 1)
                          for i, c in enumerate(output_cells)])
    out_path = Path(tgt_cfg['output'])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, palette_rgba)
    print(f"    Wrote {out_path}  voxels={len(voxels_out)} palette={len(palette)}")


if __name__ == '__main__':
    main()
