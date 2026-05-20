"""body.vox の欠損(穴)パターンを Z スライスごとに分析。

各 Z 高さでの voxel 数 + xy 範囲を出力し、欠損部位を特定する。
"""
import sys
import struct
import os


def parse_vox(path):
    with open(path, 'rb') as f:
        buf = f.read()
    i = 8
    voxels = []
    size = (0, 0, 0)
    while i < len(buf):
        chunk_id = buf[i:i+4]
        n_bytes = struct.unpack('<I', buf[i+4:i+8])[0]
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


path = sys.argv[1]
size, voxels = parse_vox(path)
print(f"{path}: size={size} count={len(voxels)}")
print()

# Z slice analysis
slices = {}
for x, y, z, c in voxels:
    slices.setdefault(z, []).append((x, y))

for z in sorted(slices.keys()):
    pts = slices[z]
    n = len(pts)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    print(f"z={z:3d} (h={z * 12.63:.0f}mm): n={n:4d}  "
          f"x[{min(xs):3d},{max(xs):3d}] dx={max(xs)-min(xs)+1:2d}  "
          f"y[{min(ys):3d},{max(ys):3d}] dy={max(ys)-min(ys)+1:2d}")
