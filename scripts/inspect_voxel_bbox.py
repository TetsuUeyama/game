"""body.vox の中身を読み取り、voxel index 範囲と count を表示。

Usage:
  python scripts/inspect_voxel_bbox.py <vox_path> [<vox_path> ...]
"""
import sys
import struct
import os


def parse_vox(path):
    with open(path, 'rb') as f:
        buf = f.read()
    if buf[:4] != b'VOX ':
        raise ValueError("not a VOX file")
    # Skip header + version
    i = 8
    voxels = []
    size = (0, 0, 0)
    while i < len(buf):
        chunk_id = buf[i:i+4]
        n_bytes = struct.unpack('<I', buf[i+4:i+8])[0]
        n_children = struct.unpack('<I', buf[i+8:i+12])[0]
        i += 12
        if chunk_id == b'SIZE':
            sx, sy, sz = struct.unpack('<III', buf[i:i+12])
            size = (sx, sy, sz)
        elif chunk_id == b'XYZI':
            n = struct.unpack('<I', buf[i:i+4])[0]
            for j in range(n):
                x, y, z, c = buf[i+4+j*4:i+8+j*4]
                voxels.append((x, y, z, c))
        i += n_bytes
    return size, voxels


for path in sys.argv[1:]:
    if not os.path.exists(path):
        print(f"{path}: NOT FOUND")
        continue
    size, voxels = parse_vox(path)
    if not voxels:
        print(f"{path}: empty")
        continue
    xs = [v[0] for v in voxels]
    ys = [v[1] for v in voxels]
    zs = [v[2] for v in voxels]
    print(f"{path}:")
    print(f"  size:   {size}")
    print(f"  count:  {len(voxels)}")
    print(f"  bbox x[{min(xs)}, {max(xs)}] dx={max(xs)-min(xs)+1}")
    print(f"  bbox y[{min(ys)}, {max(ys)}] dy={max(ys)-min(ys)+1}")
    print(f"  bbox z[{min(zs)}, {max(zs)}] dz={max(zs)-min(zs)+1}")
