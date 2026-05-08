"""Override helena_witch_leggings with a bright red test cube to verify rendering pipeline.

A 50x50x50 cube placed at a recognizable position. If the viewer shows this cube,
the rendering pipeline works and previous "no visual change" was misperception.
If it doesn't, there's a deeper rendering issue.

Usage:
  python make_test_block.py
"""
import struct, json, os, shutil

OUT_DIR = 'C:/Users/user/developsecond/contactform/public/box5/qm_mustardui'
PREFIX = 'helena_witch_leggings'

# Backup current state
print("=== Backup current files ===")
for ext in ['.vox', '.grid.json', '.weights.json']:
    src = os.path.join(OUT_DIR, f'{PREFIX}{ext}')
    bak = os.path.join(OUT_DIR, f'{PREFIX}.testblock_orig.bak{ext}')
    if os.path.exists(src):
        shutil.copy2(src, bak)
        print(f"  {src} -> {bak}")

# Also backup chunks (since current is multi-chunk)
for n in [1, 2, 3]:
    src = os.path.join(OUT_DIR, f'{PREFIX}_c{n}.vox')
    bak = os.path.join(OUT_DIR, f'{PREFIX}_c{n}.testblock_orig.bak.vox')
    if os.path.exists(src):
        shutil.copy2(src, bak)
        print(f"  {src} -> {bak}")

# Create test voxels: 50x50x50 cube at center of leg region
# Position: world (0, 0, 0.5) — should be visible at hip level
SIZE = 50
voxels = []
for x in range(SIZE):
    for y in range(SIZE):
        for z in range(SIZE):
            # Hollow shell + diagonal stripes for texture
            on_face = (x == 0 or x == SIZE-1 or y == 0 or y == SIZE-1 or z == 0 or z == SIZE-1)
            stripe = (x + y + z) % 5 == 0
            if on_face or stripe:
                voxels.append((x, y, z, 1))  # color index 1
print(f"\n=== Test cube ===")
print(f"  voxels: {len(voxels)} (50x50x50 shell + stripes)")

# Write .vox (single chunk, no sub-grid)
def write_vox(path, sx, sy, sz, voxels, color):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels: xd += struct.pack('<BBBB', *v)
    rd = b''
    for i in range(256):
        if i == 0: rd += struct.pack('<BBBB', *color)
        else: rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# Write helena_witch_leggings.vox as the test cube
test_vox_path = os.path.join(OUT_DIR, f'{PREFIX}.vox')
write_vox(test_vox_path, SIZE, SIZE, SIZE, voxels, color=(255, 0, 0, 255))  # bright red
print(f"\n=== Wrote test ===")
print(f"  {test_vox_path}")

# Override grid.json to single chunk (no sub-grid chunks list)
# Place at world (-0.10, -0.10, 0.45) - somewhere visible at hip level
grid = {
    "voxel_size": 0.005,  # 5mm voxels = 25cm cube total
    "grid_origin": [-0.10, -0.10, 0.45],
    "gx": SIZE,
    "gy": SIZE,
    "gz": SIZE,
    "scale_factor": 1,
    "parent_voxel_size": 0.007051008224487305,
}
grid_path = os.path.join(OUT_DIR, f'{PREFIX}.grid.json')
with open(grid_path, 'w') as f:
    json.dump(grid, f, indent=1)
print(f"  {grid_path}")

# Delete existing chunk files (so viewer fetches single .vox per spec)
for n in [1, 2, 3]:
    cp = os.path.join(OUT_DIR, f'{PREFIX}_c{n}.vox')
    if os.path.exists(cp):
        os.remove(cp)
        print(f"  removed (chunk): {cp}")

# Minimal weights.json
weights = {
    "bones": ["c_root_bend.x"],
    "weights": [[[0, 1.0]] for _ in voxels],
    "voxel_count": len(voxels),
    "note": "TEST BLOCK - 50x50x50 red cube at hip level"
}
weights_path = os.path.join(OUT_DIR, f'{PREFIX}.weights.json')
with open(weights_path, 'w') as f:
    json.dump(weights, f)
print(f"  {weights_path}")

print("\n=== DONE ===")
print("Reload viewer. Expected: bright RED 50x50x50 cube near hip area (world Z=0.45-0.70).")
print("If you see it: rendering works. If not: deeper rendering issue.")
print("\nTo restore original:")
print(f"  cp {PREFIX}.testblock_orig.bak.* helena_witch_leggings.*")
