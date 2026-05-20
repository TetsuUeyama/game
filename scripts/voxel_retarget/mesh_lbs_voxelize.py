"""Mesh-level LBS retarget + triangle sub-sampling voxelize.

Pipeline:
  1. Load garment mesh JSON (rest-pose world verts + vertex_group weights)
  2. LBS retarget per vertex: source bone-local coord → target bone-local coord → world
  3. Triangle sub-sampling voxelize on target grid
  4. Write .vox

Usage: python mesh_lbs_voxelize.py <config.json>
"""
import json
import math
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


# ---------- VOX I/O ----------

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


# ---------- Bone bookkeeping ----------

def build_bone_lookup(skel):
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


# ---------- LBS retarget ----------

def retarget_vertex(pos, wdict, src_bones, tgt_bones, bone_map):
    accum = np.zeros(3)
    total_w = 0.0
    for src_bn, w in wdict.items():
        tgt_bn = bone_map.get(src_bn)
        if tgt_bn is None:
            continue
        if src_bn not in src_bones or tgt_bn not in tgt_bones:
            continue
        s_head, _, s_z, s_L, s_x, s_y = src_bones[src_bn]
        if s_L < 1e-6:
            continue
        rel = pos - s_head
        z = float(np.dot(rel, s_z))
        x = float(np.dot(rel, s_x))
        y = float(np.dot(rel, s_y))
        t_head, _, t_z, _, t_x, t_y = tgt_bones[tgt_bn]
        world_i = t_head + z * t_z + x * t_x + y * t_y
        accum += w * world_i
        total_w += w
    if total_w < 1e-9:
        return None
    return accum / total_w


# ---------- Voxelize ----------

def triangle_subsample(v0, v1, v2, n):
    """Barycentric NxN sampling of triangle. Returns iter of (x,y,z) world points."""
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

    print(f"[1] Load mesh JSON: {cfg['source']['mesh_json']}")
    mesh = json.loads(Path(cfg['source']['mesh_json']).read_text(encoding='utf-8'))
    verts = np.array(mesh['vertices'])
    faces = mesh['faces']
    weights = mesh['weights']
    print(f"  {len(verts)} verts, {len(faces)} tris, {len(mesh['vertex_groups'])} vgroups")

    print(f"[2] Load skeletons + bone map")
    src_skel = json.loads(Path(cfg['source']['skeleton']).read_text(encoding='utf-8'))
    tgt_skel = json.loads(Path(cfg['target']['skeleton']).read_text(encoding='utf-8'))
    bone_map = json.loads(Path(cfg['bone_map']).read_text(encoding='utf-8'))['vg_rename']
    src_bones = build_bone_lookup(src_skel)
    tgt_bones = build_bone_lookup(tgt_skel)

    # Report mapping coverage
    vg = mesh['vertex_groups']
    mapped = {n: bone_map.get(n) for n in vg}
    unmapped = [n for n, t in mapped.items() if t is None]
    print(f"  vgroup → target bone:")
    for n, t in mapped.items():
        print(f"    {n} -> {t}")
    if unmapped:
        print(f"  [WARN] Unmapped: {unmapped}")

    print(f"[3] LBS retarget per vertex")
    new_verts = np.zeros_like(verts)
    fallback = 0
    for i, (pos, wdict) in enumerate(zip(verts, weights)):
        new_pos = retarget_vertex(pos, wdict, src_bones, tgt_bones, bone_map)
        if new_pos is None:
            new_verts[i] = pos
            fallback += 1
        else:
            new_verts[i] = new_pos
    print(f"  Deformed {len(verts) - fallback}/{len(verts)} verts ({fallback} fallback)")

    print(f"[4] Voxelize via triangle sub-sampling")
    tgt_grid = json.loads(Path(cfg['target']['grid']).read_text(encoding='utf-8'))
    origin = np.array(tgt_grid['grid_origin'])
    vs = tgt_grid['voxel_size']
    gx, gy, gz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']
    sub_n = int(cfg.get('triangle_subsample', 8))
    print(f"  Grid: {gx}x{gy}x{gz}, vs={vs:.5f}m, sub_n={sub_n}")

    occ = set()
    total_pts = 0
    for tri in faces:
        v0 = new_verts[tri[0]]
        v1 = new_verts[tri[1]]
        v2 = new_verts[tri[2]]
        pts = triangle_subsample(v0, v1, v2, sub_n)
        total_pts += len(pts)
        for p in pts:
            idx = np.floor((p - origin) / vs).astype(int)
            if 0 <= idx[0] < gx and 0 <= idx[1] < gy and 0 <= idx[2] < gz:
                occ.add((int(idx[0]), int(idx[1]), int(idx[2])))

    print(f"  Total sub-points: {total_pts}, unique voxels: {len(occ)}")

    # Optional post-process: BFS push-out for voxels inside target body
    push_out = cfg.get('push_out_inside_body', False)
    if push_out:
        body_vox_path = cfg['target'].get('body_vox')
        if body_vox_path is None:
            print(f"  [WARN] push_out_inside_body=true but no target.body_vox configured")
        else:
            _bs, body_voxels = parse_vox(body_vox_path)
            body_occ = set((x, y, z) for x, y, z, _ in body_voxels)
            max_steps = int(cfg.get('push_out_max_steps', 5))
            drop_unresolved = bool(cfg.get('push_out_drop_unresolved', True))
            print(f"[4.5] Push-out body-inside voxels (max_steps={max_steps}, drop_unresolved={drop_unresolved})")
            print(f"  Target body occupancy: {len(body_occ)} cells")

            def bfs_nearest_exterior(start):
                if start not in body_occ:
                    return start
                visited = {start}
                q = deque([(start, 0)])
                while q:
                    c, d = q.popleft()
                    if d >= max_steps:
                        continue
                    for dx, dy, dz in NB6:
                        nx, ny, nz = c[0]+dx, c[1]+dy, c[2]+dz
                        if (nx, ny, nz) in visited:
                            continue
                        if not (0 <= nx < gx and 0 <= ny < gy and 0 <= nz < gz):
                            continue
                        visited.add((nx, ny, nz))
                        if (nx, ny, nz) not in body_occ:
                            return (nx, ny, nz)
                        q.append(((nx, ny, nz), d+1))
                return None

            new_occ = set()
            pushed, kept_outside, dropped = 0, 0, 0
            for cell in occ:
                if cell not in body_occ:
                    new_occ.add(cell)
                    kept_outside += 1
                    continue
                placed = bfs_nearest_exterior(cell)
                if placed is None:
                    if drop_unresolved:
                        dropped += 1
                        continue
                    new_occ.add(cell)
                else:
                    new_occ.add(placed)
                    pushed += 1
            print(f"  Outside body (no-op): {kept_outside}, Pushed: {pushed}, Dropped: {dropped}, total: {len(new_occ)}")
            occ = new_occ

            # Optional: same-layer dilation hole-fill
            dilation_steps = int(cfg.get('dilation_steps', 0))
            if dilation_steps > 0:
                print(f"[4.6] Build outward distance field for dilation (max_dist={dilation_steps + 1})")
                max_dist = dilation_steps + 1
                dist = {c: 0 for c in body_occ}
                qf = deque(body_occ)
                while qf:
                    c = qf.popleft()
                    d = dist[c]
                    if d >= max_dist:
                        continue
                    for dx, dy, dz in NB6:
                        n = (c[0]+dx, c[1]+dy, c[2]+dz)
                        if n in dist:
                            continue
                        if not (0 <= n[0] < gx and 0 <= n[1] < gy and 0 <= n[2] < gz):
                            continue
                        dist[n] = d + 1
                        qf.append(n)
                print(f"  Distance field: {len(dist)} cells (body + shell)")

                for step in range(dilation_steps):
                    added = set()
                    for cell in occ:
                        cd = dist.get(cell)
                        if cd is None or cd == 0:
                            continue
                        for dx, dy, dz in NB6:
                            n = (cell[0]+dx, cell[1]+dy, cell[2]+dz)
                            if not (0 <= n[0] < gx and 0 <= n[1] < gy and 0 <= n[2] < gz):
                                continue
                            if dist.get(n) != cd:
                                continue
                            if n in occ or n in added:
                                continue
                            added.add(n)
                    occ |= added
                    print(f"  Dilation step {step+1}: +{len(added)} cells, total: {len(occ)}")

    print(f"[5] Write vox")
    out_path = Path(cfg['target']['output'])
    voxels_out = sorted([(x, y, z, 1) for x, y, z in occ])
    write_vox(str(out_path), (gx, gy, gz), voxels_out, palette=None)
    print(f"  Saved: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == '__main__':
    main()
