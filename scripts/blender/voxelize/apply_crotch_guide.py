"""Filter clothing voxels using a crotch guide as inner boundary.

入力 clothing voxel 中で、guide voxel より body 側 (内側) にある voxel を除去する。
これにより衣装が guide より内部 (体内 / 内蔵領域) に侵入することを防ぐ。

Usage:
  python apply_crotch_guide.py <clothing_vox> <clothing_grid_json> \
      <guide_vox> <guide_grid_json> <out_vox> \
      [--body-center X Y Z] [--near-radius 0.03]

Notes:
  - body-center: 局所的な「body 中心」推定。crotch 領域では (0, 0.02, 1.0) 付近
  - near-radius: guide voxel との距離がこれ未満の clothing voxel のみフィルタ対象
                それ以外の clothing voxel (guide から十分離れている) はそのまま keep
"""
import sys
import os
import json
import struct
import argparse
import numpy as np


def parse_vox(path):
    """Parse VOX file, return (voxels list of (x,y,z,color), palette list of (r,g,b,a))."""
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'VOX ':
        raise ValueError(f"Not a VOX file: {path}")
    i = 8  # skip VOX  + version
    if data[i:i+4] != b'MAIN':
        raise ValueError("Missing MAIN chunk")
    i += 12
    voxels = []
    palette = [(0, 0, 0, 0)] * 256
    while i < len(data) - 4:
        chunk_id = data[i:i+4]
        sz, _ = struct.unpack('<II', data[i+4:i+12])
        i += 12
        if chunk_id == b'XYZI':
            n_voxels = struct.unpack('<I', data[i:i+4])[0]
            for k in range(n_voxels):
                x, y, z, c = struct.unpack('BBBB', data[i+4+k*4:i+8+k*4])
                voxels.append((x, y, z, c))
        elif chunk_id == b'RGBA':
            for k in range(256):
                r, g, b, a = struct.unpack('BBBB', data[i+k*4:i+(k+1)*4])
                palette[k] = (r, g, b, a)
        i += sz
    return voxels, palette


def write_vox(path, voxels, palette, gx, gy, gz):
    """Write VOX file."""
    xyzi_size = 4 + len(voxels) * 4
    children_size = (12 + 12) + (12 + xyzi_size) + (12 + 1024)
    with open(path, 'wb') as f:
        f.write(b'VOX ')
        f.write(struct.pack('<I', 150))
        f.write(b'MAIN')
        f.write(struct.pack('<II', 0, children_size))
        f.write(b'SIZE')
        f.write(struct.pack('<II', 12, 0))
        f.write(struct.pack('<III', gx, gy, gz))
        f.write(b'XYZI')
        f.write(struct.pack('<II', xyzi_size, 0))
        f.write(struct.pack('<I', len(voxels)))
        for x, y, z, c in voxels:
            f.write(struct.pack('BBBB', x, y, z, c))
        f.write(b'RGBA')
        f.write(struct.pack('<II', 1024, 0))
        for r, g, b, a in palette[:256]:
            f.write(struct.pack('BBBB', r, g, b, a))


def vox_to_world(grid, vx, vy, vz):
    return (
        grid['grid_origin'][0] + (vx + 0.5) * grid['voxel_size'],
        grid['grid_origin'][1] + (vy + 0.5) * grid['voxel_size'],
        grid['grid_origin'][2] + (vz + 0.5) * grid['voxel_size'],
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clothing_vox')
    ap.add_argument('clothing_grid_json')
    ap.add_argument('guide_vox')
    ap.add_argument('guide_grid_json')
    ap.add_argument('out_vox')
    ap.add_argument('--body-center', nargs=3, type=float, default=[0.0, 0.02, 1.0],
                    help='Body interior reference point (default: 0 0.02 1.0 for crotch region)')
    ap.add_argument('--near-radius', type=float, default=0.03,
                    help='Filter only clothing voxels within this radius of any guide voxel (default 30mm)')
    ap.add_argument('--out-grid-json', default=None, help='If clothing_grid is sub-grid, output grid path')
    args = ap.parse_args()

    # Load guide
    guide_voxels, _ = parse_vox(args.guide_vox)
    with open(args.guide_grid_json) as f:
        guide_grid = json.load(f)
    guide_world = np.array([vox_to_world(guide_grid, x, y, z) for x, y, z, _ in guide_voxels])
    print(f"Guide: {len(guide_voxels)} voxels, bbox: "
          f"X[{guide_world[:,0].min():.3f}, {guide_world[:,0].max():.3f}] "
          f"Y[{guide_world[:,1].min():.3f}, {guide_world[:,1].max():.3f}] "
          f"Z[{guide_world[:,2].min():.3f}, {guide_world[:,2].max():.3f}]")

    # Load clothing
    cloth_voxels, cloth_palette = parse_vox(args.clothing_vox)
    with open(args.clothing_grid_json) as f:
        cloth_grid = json.load(f)
    print(f"Clothing: {len(cloth_voxels)} voxels (grid: {cloth_grid['gx']}x{cloth_grid['gy']}x{cloth_grid['gz']}, "
          f"vs={cloth_grid['voxel_size']:.5f}m)")

    body_center = np.array(args.body_center)
    near_r2 = args.near_radius ** 2

    kept = []
    n_far = 0
    n_outside = 0
    n_inside = 0
    for v in cloth_voxels:
        x, y, z, c = v
        p = np.array(vox_to_world(cloth_grid, x, y, z))
        # Find nearest guide voxel
        diffs = guide_world - p
        d2 = np.einsum('ij,ij->i', diffs, diffs)
        idx = int(d2.argmin())
        if d2[idx] > near_r2:
            kept.append(v)
            n_far += 1
            continue
        g = guide_world[idx]
        inside_dir = body_center - g
        norm = np.linalg.norm(inside_dir)
        if norm < 1e-6:
            kept.append(v); n_outside += 1; continue
        inside_dir /= norm
        # If p is on body-side of g (closer to body than g), it is INSIDE the guide.
        if np.dot(p - g, inside_dir) > 0:
            n_inside += 1
            continue
        kept.append(v)
        n_outside += 1

    print(f"  far from guide (kept): {n_far}")
    print(f"  near guide, outside (kept): {n_outside}")
    print(f"  near guide, inside guide (REMOVED): {n_inside}")
    print(f"  total kept: {len(kept)} / {len(cloth_voxels)}  ({100.0*len(kept)/len(cloth_voxels):.1f}%)")

    write_vox(args.out_vox, kept, cloth_palette, cloth_grid['gx'], cloth_grid['gy'], cloth_grid['gz'])
    print(f"  -> {args.out_vox}")

    if args.out_grid_json:
        with open(args.out_grid_json, 'w') as f:
            json.dump(cloth_grid, f, indent=2)
        print(f"  -> {args.out_grid_json}")


if __name__ == '__main__':
    main()
