"""Source-free morphological cleanup of a retargeted garment .vox.

Designed to fix common voxelization artifacts without comparing to source:
  - Hole filling: morphological CLOSE (dilate -> erode) along the body
    surface tangent. Fills 1-2 voxel gaps that voxelization left behind.
  - Outlier removal: drop voxels with too few (face-)neighbors in the
    garment occupancy. Defaults to <2 face-neighbors = drop.
  - Optional opening (erode -> dilate) for stronger ragged-edge smoothing.

Each new voxel created by closing inherits the mean color of its existing
garment neighbors so palette continuity is preserved.

Usage: python refine_morphological.py <config.json>

Config:
{
  "min_face_neighbors": 2,
  "close_iters": 1,
  "open_iters": 0,
  "skin_layer_only": true,
  "target": {
    "grid": "...", "body_vox": "...",
    "input":  "...", "output": "..."
  }
}
"""
import json
import struct
import sys
from collections import deque, Counter
from pathlib import Path

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


def build_skin_distance(body_occ, gx, gy, gz, max_d=3):
    """BFS distance from body surface (exterior) cells, up to max_d."""
    dist = {c: 0 for c in body_occ}
    q = deque(body_occ)
    while q:
        c = q.popleft()
        d = dist[c]
        if d >= max_d: continue
        for dx, dy, dz in NB6:
            n = (c[0]+dx, c[1]+dy, c[2]+dz)
            if n in dist: continue
            if not (0 <= n[0] < gx and 0 <= n[1] < gy and 0 <= n[2] < gz): continue
            dist[n] = d + 1
            q.append(n)
    return dist


def count_face_neighbors(cell, occ):
    n = 0
    for dx, dy, dz in NB6:
        if (cell[0]+dx, cell[1]+dy, cell[2]+dz) in occ:
            n += 1
    return n


def mean_color(colors):
    n = len(colors)
    if n == 0: return (128, 128, 128)
    return (int(sum(c[0] for c in colors)/n),
            int(sum(c[1] for c in colors)/n),
            int(sum(c[2] for c in colors)/n))


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
    tgt_cfg = cfg['target']
    min_nb = int(cfg.get('min_face_neighbors', 2))
    close_iters = int(cfg.get('close_iters', 1))
    open_iters = int(cfg.get('open_iters', 0))
    skin_only = bool(cfg.get('skin_layer_only', True))
    skin_max_d = int(cfg.get('skin_max_distance', 3))

    tgt_grid = json.loads(Path(tgt_cfg['grid']).read_text(encoding='utf-8'))
    _ts, tgt_body, _ = parse_vox_with_palette(str(Path(tgt_cfg['body_vox'])))
    _is, tgt_in, tgt_palette = parse_vox_with_palette(str(Path(tgt_cfg['input'])))
    tgx, tgy, tgz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

    tgt_body_occ = set((x,y,z) for x,y,z,_ in tgt_body)
    # garment occ + per-cell color
    occ = {}  # (x,y,z) -> (r,g,b)
    for (x, y, z, ci) in tgt_in:
        if tgt_palette and 1 <= ci <= 256:
            rgba = tgt_palette[ci-1]
            occ[(x, y, z)] = (rgba[0], rgba[1], rgba[2])
        else:
            occ[(x, y, z)] = (180, 180, 180)
    print(f"[in] garment voxels: {len(occ)}, body voxels: {len(tgt_body_occ)}")

    # Build skin layer (cells where new voxels may live: outside body, within max_d)
    dist = build_skin_distance(tgt_body_occ, tgx, tgy, tgz, max_d=skin_max_d)
    print(f"[skin] cells with distance computed: {len(dist)} (max_d={skin_max_d})")

    def in_skin(cell):
        if not skin_only: return True
        d = dist.get(cell)
        return d is not None and 1 <= d <= skin_max_d

    # === CLOSE (dilate -> erode) — fills small holes ===
    for it in range(close_iters):
        added = {}
        for cell in occ:
            for dx, dy, dz in NB6:
                n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
                if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz): continue
                if n in occ or n in added: continue
                if n in tgt_body_occ: continue  # don't add inside body
                if not in_skin(n): continue
                # neighbor color from existing occ neighbors
                colors = []
                for ddx, ddy, ddz in NB6:
                    nn = (n[0]+ddx, n[1]+ddy, n[2]+ddz)
                    if nn in occ: colors.append(occ[nn])
                added[n] = mean_color(colors)
        for n, c in added.items(): occ[n] = c
        # Erode: a cell stays if it had AT LEAST 2 neighbors in the original (post-dilate) set
        # Simple alternative: just dilate without erode (= 1-step grow). Pure morphological
        # close is dilate then erode, but erosion can shrink real structure. We use a
        # 'kept-if-dense' erosion: drop newly-added cells with <2 garment neighbors.
        if added:
            drop = []
            for n in added:
                if count_face_neighbors(n, occ) < 2:
                    drop.append(n)
            for n in drop: occ.pop(n)
            print(f"[close {it+1}] +{len(added)} -{len(drop)} (net {len(added) - len(drop)})")

    # === OPEN (erode -> dilate) — smooths protrusions ===
    for it in range(open_iters):
        # Erode: drop cells with < min_nb neighbors
        drop = [c for c in occ if count_face_neighbors(c, occ) < min_nb]
        for c in drop: occ.pop(c)
        # Dilate: add cells whose >=min_nb neighbors are in occ (so smoothing of edges)
        added = {}
        for cell in occ:
            for dx, dy, dz in NB6:
                n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
                if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz): continue
                if n in occ or n in added: continue
                if n in tgt_body_occ: continue
                if not in_skin(n): continue
                if count_face_neighbors(n, occ) >= min_nb:
                    colors = []
                    for ddx, ddy, ddz in NB6:
                        nn = (n[0]+ddx, n[1]+ddy, n[2]+ddz)
                        if nn in occ: colors.append(occ[nn])
                    added[n] = mean_color(colors)
        for n, c in added.items(): occ[n] = c
        print(f"[open {it+1}] -{len(drop)} (erode) +{len(added)} (dilate)")

    # === Final outlier prune: drop any cell with <min_nb face neighbors ===
    drop = [c for c in occ if count_face_neighbors(c, occ) < min_nb]
    for c in drop: occ.pop(c)
    print(f"[prune] removed {len(drop)} sparse outliers (<{min_nb} face nbrs)")

    print(f"[out] garment voxels: {len(occ)}")
    rgbs = list(occ.values())
    palette, indices = quantize_palette(rgbs, max_colors=255)
    palette_rgba = [(r,g,b,255) for (r,g,b) in palette]
    cells = list(occ)
    voxels_out = sorted([(c[0], c[1], c[2], indices[i]+1) for i, c in enumerate(cells)])
    out_path = Path(tgt_cfg['output'])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, palette_rgba)
    print(f"  Wrote {out_path}  voxels={len(voxels_out)} palette={len(palette)}")


if __name__ == '__main__':
    main()
