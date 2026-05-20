"""Surface-anchored mesh deformation.

Pipeline:
  1. Load garment mesh (vertices + faces) — export via export_garment_mesh.py
  2. Each vertex V_i:
       a. Find nearest source body surface cell A_src (3D euclidean)
       b. Compute anchor offset: off = V_i - world(A_src)
       c. Find nearest target body surface cell A_tgt (bbox-uv nearest)
       d. New vertex = world(A_tgt) + off
  3. Voxelize deformed mesh via triangle sub-sampling on target grid
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
    palette = None
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
        elif cid == b'RGBA':
            palette = data[pos:pos+n]
            pos += n
        else:
            pos += n
    return size, voxels, palette


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


def triangle_subsample(v0, v1, v2, n):
    pts = []
    for i in range(n + 1):
        for j in range(n + 1 - i):
            k = n - i - j
            a = i / n
            b = j / n
            c = k / n
            pts.append(a * v0 + b * v1 + c * v2)
    return pts


def main():
    cfg = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    src_cfg = cfg['source']
    tgt_cfg = cfg['target']

    print(f"[1] Load mesh JSON: {src_cfg['mesh_json']}")
    mesh = json.loads(Path(src_cfg['mesh_json']).read_text(encoding='utf-8'))
    vertices = np.array(mesh['vertices'])
    faces = mesh['faces']
    print(f"  {len(vertices)} verts, {len(faces)} tris")

    print(f"[2] Load source body / grid")
    src_grid = json.loads(Path(src_cfg['grid']).read_text(encoding='utf-8'))
    _bs, src_body, _bp = parse_vox(str(Path(src_cfg['body_vox'])))
    print(f"  body={len(src_body)}")

    print(f"[3] Load target body / grid")
    tgt_grid = json.loads(Path(tgt_cfg['grid']).read_text(encoding='utf-8'))
    _ts, tgt_body, _tp = parse_vox(str(Path(tgt_cfg['body_vox'])))
    print(f"  body={len(tgt_body)}")

    src_body_occ = set((x, y, z) for x, y, z, _ in src_body)
    tgt_body_occ = set((x, y, z) for x, y, z, _ in tgt_body)
    sgx, sgy, sgz = src_grid['gx'], src_grid['gy'], src_grid['gz']
    tgx, tgy, tgz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

    print(f"[4] Extract body surfaces")
    src_surface = list(extract_surface(src_body_occ, sgx, sgy, sgz))
    tgt_surface = list(extract_surface(tgt_body_occ, tgx, tgy, tgz))
    print(f"  src_surface={len(src_surface)}, tgt_surface={len(tgt_surface)}")

    src_surf_worlds = np.array([voxel_to_world(c[0], c[1], c[2], src_grid) for c in src_surface])
    tgt_surf_worlds = np.array([voxel_to_world(c[0], c[1], c[2], tgt_grid) for c in tgt_surface])

    src_min, src_max = body_bbox_world(src_body, src_grid)
    tgt_min, tgt_max = body_bbox_world(tgt_body, tgt_grid)
    src_span = np.where(src_max - src_min < 1e-9, 1.0, src_max - src_min)
    tgt_span = np.where(tgt_max - tgt_min < 1e-9, 1.0, tgt_max - tgt_min)
    src_surf_uvws = (src_surf_worlds - src_min) / src_span
    tgt_surf_uvws = (tgt_surf_worlds - tgt_min) / tgt_span

    print(f"[5] Anchor each vertex to nearest source surface cell (3D euclidean)")
    chunk = int(cfg.get('chunk_size', 128))
    nearest_src = np.zeros(len(vertices), dtype=np.int64)
    for start in range(0, len(vertices), chunk):
        end = min(start + chunk, len(vertices))
        sub = vertices[start:end]
        diff = sub[:, None, :] - src_surf_worlds[None, :, :]
        d2 = np.einsum('vmd,vmd->vm', diff, diff)
        nearest_src[start:end] = np.argmin(d2, axis=1)
    src_anchor_world = src_surf_worlds[nearest_src]    # (N, 3)
    src_anchor_uvw = src_surf_uvws[nearest_src]        # (N, 3)
    offsets = vertices - src_anchor_world              # (N, 3)
    print(f"  anchor offsets: min={offsets.min(axis=0)}, max={offsets.max(axis=0)}")

    # Optional: bone-aware anchor filter for end-effectors (gloves, boots).
    # Each source vertex's anchor cell has a max-weight Rachel bone; via vg_rename
    # we get the corresponding QM bone, and limit nearest search to target surface
    # cells with that same QM bone. This avoids end-effectors collapsing to the
    # wrong anatomical region due to whole-body bbox-uv distortion.
    bone_aware = bool(cfg.get('bone_aware_anchor', False))
    src_surf_tgt_bones = None  # per src_surface cell: target bone name (or None)
    tgt_surf_bones = None      # per tgt_surface cell: target bone name (or None)
    if bone_aware:
        src_body_w_path = src_cfg.get('body_weights')
        tgt_body_w_path = tgt_cfg.get('body_weights')
        bone_map_path = cfg.get('bone_map')
        if src_body_w_path and tgt_body_w_path and bone_map_path:
            print(f"  bone_aware_anchor enabled - loading body weights + rename map")
            src_body_w = json.loads(Path(src_body_w_path).read_text(encoding='utf-8'))
            tgt_body_w = json.loads(Path(tgt_body_w_path).read_text(encoding='utf-8'))
            bone_map = json.loads(Path(bone_map_path).read_text(encoding='utf-8'))['vg_rename']
            # max-weight bone per cell
            src_bone_by_cell = {}
            for vi, (x, y, z, _c) in enumerate(src_body):
                wl = src_body_w['weights'][vi]
                if not wl: continue
                mb, _ = max(wl, key=lambda p: p[1])
                src_bone_by_cell[(x, y, z)] = src_body_w['bones'][mb]
            tgt_bone_by_cell = {}
            for vi, (x, y, z, _c) in enumerate(tgt_body):
                wl = tgt_body_w['weights'][vi]
                if not wl: continue
                mb, _ = max(wl, key=lambda p: p[1])
                tgt_bone_by_cell[(x, y, z)] = tgt_body_w['bones'][mb]
            src_surf_tgt_bones = [bone_map.get(src_bone_by_cell.get(c)) for c in src_surface]
            tgt_surf_bones = [tgt_bone_by_cell.get(c) for c in tgt_surface]
            # report distribution
            from collections import Counter
            src_b_counts = Counter(b for b in src_surf_tgt_bones if b)
            tgt_b_counts = Counter(b for b in tgt_surf_bones if b)
            print(f"  src surf -> target bones (top 5): {src_b_counts.most_common(5)}")
            print(f"  tgt surf bones (top 5): {tgt_b_counts.most_common(5)}")
        else:
            print("  [WARN] bone_aware_anchor needs source.body_weights, target.body_weights, bone_map")
            bone_aware = False

    print(f"[6] Project anchor uvw to nearest target surface cell (Z-aware)")
    # Optional Z-axis tolerance: only consider target cells whose z_norm is within
    # this distance from the source anchor's z_norm. Keeps end-effectors (hands/feet)
    # from collapsing onto the wrong Z band due to whole-body bbox-uv distortion.
    z_axis_tol = float(cfg.get('anchor_z_tolerance', 0.0))
    anchor_tol = float(cfg.get('anchor_uvw_tolerance', 0.0))
    nearest_tgt = np.zeros(len(vertices), dtype=np.int64)
    for start in range(0, len(vertices), chunk):
        end = min(start + chunk, len(vertices))
        sub = src_anchor_uvw[start:end]
        if anchor_tol > 0:
            tol2 = anchor_tol * anchor_tol
            for li in range(end - start):
                diff = sub[li] - tgt_surf_uvws
                d2 = (diff * diff).sum(axis=1)
                # tolerance shell
                d2_masked = np.where(d2 <= tol2, d2, np.inf)
                if not np.isfinite(d2_masked.min()):
                    d2_masked = d2  # fallback: no in-tolerance candidate
                nearest_tgt[start + li] = int(np.argmin(d2_masked))
        elif bone_aware and src_surf_tgt_bones is not None:
            # per-vertex: bone-filtered nearest
            for li in range(end - start):
                vi = start + li
                bone = src_surf_tgt_bones[int(nearest_src[vi])]
                if bone is None:
                    # fallback: unfiltered
                    diff = sub[li] - tgt_surf_uvws
                    d2 = (diff * diff).sum(axis=1)
                else:
                    diff = sub[li] - tgt_surf_uvws
                    d2 = (diff * diff).sum(axis=1)
                    # mask cells whose target bone != bone
                    mask = np.array([tb == bone for tb in tgt_surf_bones])
                    d2 = np.where(mask, d2, np.inf)
                    if not np.isfinite(d2.min()):
                        # no matching bone in target — fallback to unfiltered
                        d2 = (sub[li] - tgt_surf_uvws)
                        d2 = (d2 * d2).sum(axis=1)
                nearest_tgt[vi] = int(np.argmin(d2))
        elif z_axis_tol > 0:
            for li in range(end - start):
                dz = np.abs(tgt_surf_uvws[:, 2] - sub[li, 2])
                diff = sub[li] - tgt_surf_uvws
                d2 = (diff * diff).sum(axis=1)
                d2 = np.where(dz <= z_axis_tol, d2, np.inf)
                nearest_tgt[start + li] = int(np.argmin(d2))
        else:
            diff = sub[:, None, :] - tgt_surf_uvws[None, :, :]
            d2 = np.einsum('vmd,vmd->vm', diff, diff)
            nearest_tgt[start:end] = np.argmin(d2, axis=1)
    tgt_anchor_world = tgt_surf_worlds[nearest_tgt]    # (N, 3)

    # Optional offset scaling — by default offsets preserved as world vectors.
    # Scale by bbox span ratio per axis if requested.
    if cfg.get('scale_offset_by_bbox', False):
        scale = tgt_span / src_span
        offsets = offsets * scale
        print(f"  scaled offsets by bbox ratio: {scale}")

    new_vertices = tgt_anchor_world + offsets
    print(f"  new vertices: bbox X[{new_vertices[:,0].min():.3f},{new_vertices[:,0].max():.3f}] "
          f"Y[{new_vertices[:,1].min():.3f},{new_vertices[:,1].max():.3f}] "
          f"Z[{new_vertices[:,2].min():.3f},{new_vertices[:,2].max():.3f}]")

    print(f"[7] Voxelize via triangle sub-sampling")
    origin = np.array(tgt_grid['grid_origin'])
    vs = tgt_grid['voxel_size']
    sub_n = int(cfg.get('triangle_subsample', 8))
    occ = set()
    for tri in faces:
        v0 = new_vertices[tri[0]]
        v1 = new_vertices[tri[1]]
        v2 = new_vertices[tri[2]]
        for p in triangle_subsample(v0, v1, v2, sub_n):
            idx = np.floor((p - origin) / vs).astype(int)
            if 0 <= idx[0] < tgx and 0 <= idx[1] < tgy and 0 <= idx[2] < tgz:
                occ.add((int(idx[0]), int(idx[1]), int(idx[2])))
    print(f"  voxels: {len(occ)}")

    # Optional: cover specific anatomy bones (e.g. nipple) by adding their
    # max-weight body voxels directly to the output. Useful for bras where
    # nipple protrusions should be wrapped by the garment.
    cover_bones_kw = cfg.get('cover_bones_keywords', [])
    if cover_bones_kw:
        body_w_path = tgt_cfg.get('body_weights')
        if not body_w_path:
            body_w_path = str(Path(tgt_cfg['body_vox']).with_suffix('.weights.json'))
        try:
            tgt_body_w = json.loads(Path(body_w_path).read_text(encoding='utf-8'))
            bone_names = tgt_body_w['bones']
            target_bone_idxs = {i for i, n in enumerate(bone_names)
                                if any(kw.lower() in n.lower() for kw in cover_bones_kw)}
            print(f"  cover_bones matched indices: {len(target_bone_idxs)} (keywords={cover_bones_kw})")
            added_anatomy = 0
            for vox_idx, (vx, vy, vz, _c) in enumerate(tgt_body):
                wlist = tgt_body_w['weights'][vox_idx]
                if not wlist:
                    continue
                max_b, _ = max(wlist, key=lambda p: p[1])
                if max_b in target_bone_idxs:
                    cell = (vx, vy, vz)
                    if cell not in occ:
                        occ.add(cell)
                        added_anatomy += 1
            print(f"  anatomy cover: +{added_anatomy} voxels, total: {len(occ)}")
        except Exception as e:
            print(f"  [WARN] cover_bones failed: {e}")

    # Optional: Rachel-inside body cover. Identify source garment voxels that
    # are INSIDE the source body (= the garment intrudes into the body, typically
    # to cover convex protrusions like nipples), and project them to target body
    # voxels at the corresponding anatomical (bbox-uv) position. Only those
    # body voxels are absorbed — thin straps that float outside the body are
    # NOT thickened.
    inside_cover = bool(cfg.get('inside_cover', False))
    src_garment_vox_path = src_cfg.get('garment_vox')
    if inside_cover and src_garment_vox_path:
        _gs, _src_garment_all, _gp = parse_vox(str(Path(src_garment_vox_path)))
        inside_voxels = [(v[0], v[1], v[2]) for v in _src_garment_all
                         if (v[0], v[1], v[2]) in src_body_occ]
        print(f"  inside_cover: {len(inside_voxels)}/{len(_src_garment_all)} src garment voxels are inside Rachel body")
        if inside_voxels:
            inside_worlds = np.array([voxel_to_world(c[0], c[1], c[2], src_grid) for c in inside_voxels])
            inside_uvws = (inside_worlds - src_min) / src_span
            tgt_body_list = [(v[0], v[1], v[2]) for v in tgt_body]
            tgt_body_worlds_all = np.array([voxel_to_world(c[0], c[1], c[2], tgt_grid) for c in tgt_body_list])
            tgt_body_uvws_all = (tgt_body_worlds_all - tgt_min) / tgt_span
            added = 0
            for start in range(0, len(inside_uvws), chunk):
                end = min(start + chunk, len(inside_uvws))
                sub = inside_uvws[start:end]
                diff = sub[:, None, :] - tgt_body_uvws_all[None, :, :]
                d2 = np.einsum('vmd,vmd->vm', diff, diff)
                idx = np.argmin(d2, axis=1)
                for i in idx.tolist():
                    cell = tgt_body_list[int(i)]
                    if cell not in occ:
                        occ.add(cell)
                        added += 1
            print(f"  inside_cover absorbed: +{added} body voxels, total: {len(occ)}")

    # Optional: include source anatomy-bone body voxels (e.g. Rachel's nipple bones).
    # Rachel weights are clean, so we can identify nipple voxels reliably on the source
    # side, then project to anatomically corresponding target body voxels via bbox-uv.
    src_anatomy_kw = cfg.get('include_src_anatomy_bones', [])
    if src_anatomy_kw:
        src_body_w_path = src_cfg.get('body_weights')
        if src_body_w_path:
            src_body_w = json.loads(Path(src_body_w_path).read_text(encoding='utf-8'))
            src_bone_names = src_body_w['bones']
            matched_idxs = {i for i, n in enumerate(src_bone_names)
                            if any(kw.lower() in n.lower() for kw in src_anatomy_kw)}
            print(f"  src anatomy bones matched: {[src_bone_names[i] for i in matched_idxs]}")
            # Collect src body voxels whose max-weight bone is one of the matched bones
            anatomy_voxels = []
            for vi, (vx, vy, vz, _c) in enumerate(src_body):
                wl = src_body_w['weights'][vi]
                if not wl:
                    continue
                max_b, _ = max(wl, key=lambda p: p[1])
                if max_b in matched_idxs:
                    anatomy_voxels.append((vx, vy, vz))
            print(f"  src anatomy voxels: {len(anatomy_voxels)}")
            if anatomy_voxels:
                ana_worlds = np.array([voxel_to_world(c[0], c[1], c[2], src_grid) for c in anatomy_voxels])
                ana_uvws = (ana_worlds - src_min) / src_span
                tgt_body_list = [(v[0], v[1], v[2]) for v in tgt_body]
                tgt_body_worlds_all = np.array([voxel_to_world(c[0], c[1], c[2], tgt_grid) for c in tgt_body_list])
                tgt_body_uvws_all = (tgt_body_worlds_all - tgt_min) / tgt_span
                added = 0
                for start in range(0, len(ana_uvws), chunk):
                    end = min(start + chunk, len(ana_uvws))
                    sub = ana_uvws[start:end]
                    diff = sub[:, None, :] - tgt_body_uvws_all[None, :, :]
                    d2 = np.einsum('vmd,vmd->vm', diff, diff)
                    idx = np.argmin(d2, axis=1)
                    for i in idx.tolist():
                        cell = tgt_body_list[int(i)]
                        if cell not in occ:
                            occ.add(cell)
                            added += 1
                print(f"  src anatomy cover: +{added} target body voxels, total: {len(occ)}")

    # Optional: absorb body voxels within radius of garment voxels (covers nipples
    # and other convex protrusions automatically — bone-semantic independent).
    cover_radius = int(cfg.get('cover_body_radius', 0))
    if cover_radius > 0:
        new_cells = set()
        r2 = cover_radius * cover_radius
        for cell in occ:
            for dx in range(-cover_radius, cover_radius + 1):
                for dy in range(-cover_radius, cover_radius + 1):
                    for dz in range(-cover_radius, cover_radius + 1):
                        if dx*dx + dy*dy + dz*dz > r2:
                            continue
                        n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
                        if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz):
                            continue
                        if n in tgt_body_occ and n not in occ:
                            new_cells.add(n)
        occ |= new_cells
        print(f"  body cover (radius={cover_radius}): +{len(new_cells)} body voxels absorbed, total: {len(occ)}")

    # Optional dilation to wrap convex body protrusions
    dilate_steps = int(cfg.get('output_dilate', 0))
    if dilate_steps > 0:
        for step in range(dilate_steps):
            added = set()
            for cell in occ:
                for dx, dy, dz in NB6:
                    n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
                    if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz):
                        continue
                    if n in tgt_body_occ:
                        continue
                    if n in occ or n in added:
                        continue
                    added.add(n)
            occ |= added
            print(f"  dilate step {step+1}: +{len(added)}, total: {len(occ)}")

    # Final mask: filter output voxels to those within mask_radius of any
    # source garment voxel in bbox-uv space. Enforces Rachel original boundary
    # so e.g. thin shoulder straps don't get thickened by dilation/cover_body_radius.
    mask_radius = cfg.get('mask_radius', None)
    src_garment_vox_path = src_cfg.get('garment_vox')
    if mask_radius is not None and src_garment_vox_path:
        print(f"[7.5] Apply Rachel boundary mask (radius={mask_radius})")
        _gs, src_garment, _gp = parse_vox(str(Path(src_garment_vox_path)))
        sg_worlds = np.array([voxel_to_world(v[0], v[1], v[2], src_grid) for v in src_garment])
        sg_uvws = (sg_worlds - src_min) / src_span
        mr2 = float(mask_radius) * float(mask_radius)

        occ_list = list(occ)
        occ_worlds = np.array([voxel_to_world(c[0], c[1], c[2], tgt_grid) for c in occ_list])
        occ_uvws = (occ_worlds - tgt_min) / tgt_span
        keep_flags = np.zeros(len(occ_list), dtype=bool)
        for start in range(0, len(occ_uvws), chunk):
            end = min(start + chunk, len(occ_uvws))
            sub = occ_uvws[start:end]
            diff = sub[:, None, :] - sg_uvws[None, :, :]
            d2 = np.einsum('vmd,vmd->vm', diff, diff)
            min_d2 = d2.min(axis=1)
            keep_flags[start:end] = (min_d2 <= mr2)
        new_occ = {occ_list[i] for i in range(len(occ_list)) if keep_flags[i]}
        removed = len(occ) - len(new_occ)
        print(f"  mask filter: kept {len(new_occ)}, removed {removed}")
        occ = new_occ

    # Final push-out: any voxel currently inside the target body is pushed
    # outward (BFS 6-neighbor) to the nearest body-exterior cell. Prevents the
    # "sinking" appearance caused by inside_cover absorbing body voxels.
    final_push_out = bool(cfg.get('final_push_out', False))
    if final_push_out:
        max_steps = int(cfg.get('final_push_out_max_steps', 5))
        nb6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
        def bfs_nearest_exterior(start):
            if start not in tgt_body_occ:
                return start
            visited = {start}
            q = deque([(start, 0)])
            while q:
                c, d = q.popleft()
                if d >= max_steps:
                    continue
                for dx, dy, dz in nb6:
                    n = (c[0]+dx, c[1]+dy, c[2]+dz)
                    if n in visited:
                        continue
                    if not (0 <= n[0] < tgx and 0 <= n[1] < tgy and 0 <= n[2] < tgz):
                        continue
                    visited.add(n)
                    if n not in tgt_body_occ:
                        return n
                    q.append((n, d+1))
            return None

        new_occ = set()
        pushed, kept_outside, dropped = 0, 0, 0
        for cell in occ:
            if cell not in tgt_body_occ:
                new_occ.add(cell)
                kept_outside += 1
                continue
            placed = bfs_nearest_exterior(cell)
            if placed is None:
                dropped += 1
                continue
            new_occ.add(placed)
            pushed += 1
        print(f"  final_push_out: outside={kept_outside}, pushed={pushed}, dropped={dropped}, total={len(new_occ)}")
        occ = new_occ

    # Load garment palette and per-voxel colors. Each output voxel inherits the
    # color of its nearest source garment voxel (bbox-uv space).
    out_palette = None
    sg2 = None
    if src_garment_vox_path:
        try:
            _gs2, sg2, sg_palette = parse_vox(str(Path(src_garment_vox_path)))
            out_palette = sg_palette
        except Exception as e:
            print(f"  [WARN] palette load failed: {e}")

    print(f"[8] Write (palette={'yes' if out_palette else 'no'}, src_garment={'yes' if sg2 else 'no'})")
    if sg2:
        sg_worlds = np.array([voxel_to_world(v[0], v[1], v[2], src_grid) for v in sg2])
        sg_uvws = (sg_worlds - src_min) / src_span
        sg_colors = np.array([v[3] for v in sg2], dtype=np.int32)

        occ_list = list(occ)
        occ_worlds = np.array([voxel_to_world(c[0], c[1], c[2], tgt_grid) for c in occ_list])
        occ_uvws = (occ_worlds - tgt_min) / tgt_span

        voxels_out = []
        for start in range(0, len(occ_uvws), chunk):
            end = min(start + chunk, len(occ_uvws))
            sub = occ_uvws[start:end]
            diff = sub[:, None, :] - sg_uvws[None, :, :]
            d2 = np.einsum('vmd,vmd->vm', diff, diff)
            idx = np.argmin(d2, axis=1)
            for i, gi in enumerate(idx.tolist()):
                cell = occ_list[start + i]
                voxels_out.append((cell[0], cell[1], cell[2], int(sg_colors[int(gi)])))
        voxels_out.sort()
    else:
        voxels_out = sorted([(x, y, z, 1) for x, y, z in occ])

    out_path = Path(tgt_cfg['output'])
    write_vox(str(out_path), (tgx, tgy, tgz), voxels_out, out_palette)
    print(f"  Saved: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == '__main__':
    main()
