"""LBS-predicted voxel と actual voxel の比較ツール。

ユーザーリクエスト:
  「制作したものとHelenaのものを比較し、どの部分がBodyに追従して変形した部分で、
   どこが単なる修正ミスかを比較し反映させる」

アルゴリズム:
  1. Helena bodysuit voxel + weights を読み込み
  2. 各 voxel に LBS retarget (lbs_retarget_clothing.py と同ロジック) を適用
     → expected QM voxel position
  3. actual QM voxel と比較・分類:
     - Match:   actual が expected の R 以内 → 正常変形
     - Excess:  actual が expected から R 以上 → 修正ミス (artifact)
     - Missing: expected に対応 actual なし → カバレッジ不足
  4. 3 種類を別 voxel file 出力 + auto-correction

Usage:
  blender --background <target.blend> --python compare_voxels_lbs.py -- \
    <config.json> <src.blend> <src_armature> \
    <helena_voxel.vox> <helena_grid.json> <helena_weights.json> \
    <actual_qm_voxel.vox> <actual_qm_weights.json> <qm_grid.json> \
    <out_dir> <out_prefix> \
    [--R <voxels>] [--apply-correction]
"""
import bpy
import sys
import os
import json
import struct
import numpy as np
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 11:
    print(__doc__); sys.exit(1)

CONFIG_JSON      = args[0]
SRC_BLEND        = args[1]
SRC_ARM_NAME     = args[2]
HELENA_VOX       = args[3]
HELENA_GRID_JSON = args[4]
HELENA_W_JSON    = args[5]
QM_VOX           = args[6]
QM_W_JSON        = args[7]
QM_GRID_JSON     = args[8]
OUT_DIR          = args[9]
OUT_PREFIX       = args[10]

R = 3.0  # voxels
APPLY = False
i = 11
while i < len(args):
    if args[i] == '--R' and i + 1 < len(args):
        R = float(args[i + 1]); i += 2
    elif args[i] == '--apply-correction':
        APPLY = True; i += 1
    else:
        i += 1

print(f"\n=== compare_voxels_lbs ===")
print(f"  R={R} voxels, apply={APPLY}")

with open(CONFIG_JSON, 'r', encoding='utf-8') as f:
    config = json.load(f)
VG_RENAME = config['vg_rename']

# ========================================================================
# vox parser/writer
# ========================================================================
def parse_vox(path):
    with open(path, 'rb') as f: data = f.read()
    sx = sy = sz = 0; voxels = []; palette = []
    def parse_chunks(start, end):
        nonlocal sx, sy, sz
        off = start
        while off < end:
            if off + 12 > end: break
            cid = data[off:off+4].decode('ascii', errors='replace')
            csz = struct.unpack_from('<I', data, off+4)[0]
            chz = struct.unpack_from('<I', data, off+8)[0]
            cs = off + 12
            if cid == 'MAIN': parse_chunks(cs+csz, cs+csz+chz)
            elif cid == 'SIZE': sx, sy, sz = struct.unpack_from('<III', data, cs)
            elif cid == 'XYZI':
                count = struct.unpack_from('<I', data, cs)[0]
                for j in range(count):
                    x, y, z, ci = struct.unpack_from('<BBBB', data, cs+4+j*4)
                    voxels.append((x, y, z, ci))
            elif cid == 'RGBA':
                for j in range(256):
                    r, g, b, a = struct.unpack_from('<BBBB', data, cs+j*4)
                    palette.append((r, g, b, a))
            off += 12 + csz + chz
    parse_chunks(8, len(data))
    return voxels, sx, sy, sz, palette

def write_vox(path, sx, sy, sz, voxels, pal):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels: xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
    rd = b''
    for j in range(256):
        if j < len(pal):
            rd += struct.pack('<BBBB', pal[j][0], pal[j][1], pal[j][2], pal[j][3])
        else:
            rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# ========================================================================
# Step 1: Append source armature
# ========================================================================
print(f"\n[1] Append source armature {SRC_ARM_NAME}")
existing_names = set(o.name for o in bpy.data.objects)
SRC_BLEND_ABS = os.path.abspath(SRC_BLEND)
with bpy.data.libraries.load(SRC_BLEND_ABS, link=False) as (src, dst):
    dst.objects = [SRC_ARM_NAME]
src_arm = None
for o in bpy.data.objects:
    if o.name in existing_names: continue
    if o.name == SRC_ARM_NAME or o.name.startswith(SRC_ARM_NAME + '.'):
        src_arm = o
        bpy.context.scene.collection.objects.link(o)
        o.hide_viewport = False; o.hide_set(False)
        break
if src_arm is None:
    print(f"  ERROR: src armature not loaded"); sys.exit(1)
print(f"  loaded: {src_arm.name}")

tgt_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and o is not src_arm:
        tgt_arm = o; break
if tgt_arm is None:
    print(f"  ERROR: target armature not found in scene"); sys.exit(1)
print(f"  target arm: {tgt_arm.name}")

src_arm.data.pose_position = 'REST'
tgt_arm.data.pose_position = 'REST'
bpy.context.view_layer.update()

# ========================================================================
# Step 2: Load Helena reference + LBS retarget each voxel
# ========================================================================
print(f"\n[2] LBS retarget Helena voxel → expected QM positions")

h_voxels, _, _, _, _ = parse_vox(HELENA_VOX)
with open(HELENA_GRID_JSON, encoding='utf-8') as f:
    h_grid = json.load(f)
with open(HELENA_W_JSON, encoding='utf-8') as f:
    h_w_data = json.load(f)
h_bones = h_w_data['bones']
h_weights = h_w_data['weights']
print(f"  helena: {len(h_voxels)} voxels, {len(h_bones)} bones")

h_org = h_grid['grid_origin']
h_vs = h_grid['voxel_size']

with open(QM_GRID_JSON, encoding='utf-8') as f:
    q_grid = json.load(f)
q_org = q_grid['grid_origin']
q_vs = q_grid['voxel_size']
q_gx = q_grid['gx']; q_gy = q_grid['gy']; q_gz = q_grid['gz']

src_arm_world = src_arm.matrix_world.copy()
tgt_arm_world = tgt_arm.matrix_world.copy()

# Cache pose bone matrices
src_pb_cache = {n: src_arm.pose.bones.get(n) for n in h_bones}
tgt_pb_cache = {}
for n in h_bones:
    t_n = VG_RENAME.get(n)
    tgt_pb_cache[n] = tgt_arm.pose.bones.get(t_n) if t_n else None

expected_qm_grid = []
n_no_weight = 0
for vox_idx, (ix, iy, iz, ci) in enumerate(h_voxels):
    # Helena world position (voxel center)
    h_world = Vector((
        h_org[0] + (ix + 0.5) * h_vs,
        h_org[1] + (iy + 0.5) * h_vs,
        h_org[2] + (iz + 0.5) * h_vs,
    ))

    # LBS retarget
    weights = h_weights[vox_idx]  # list of [bone_idx, weight]
    valid = []
    total_w = 0.0
    for bidx, w in weights:
        if bidx >= len(h_bones): continue
        bn = h_bones[bidx]
        s_pb = src_pb_cache.get(bn)
        t_pb = tgt_pb_cache.get(bn)
        if s_pb is None or t_pb is None: continue
        if w < 1e-4: continue
        valid.append((s_pb, t_pb, w))
        total_w += w
    if total_w < 1e-6:
        n_no_weight += 1; continue

    blended = Vector((0, 0, 0))
    for s_pb, t_pb, w in valid:
        s_bone_world = src_arm_world @ s_pb.matrix
        t_bone_world = tgt_arm_world @ t_pb.matrix
        local_pos = s_bone_world.inverted() @ h_world
        s_len = s_pb.length
        t_len = t_pb.length
        if s_len > 1e-6:
            local_pos.y *= (t_len / s_len)
        tgt_world = t_bone_world @ local_pos
        blended += (w / total_w) * tgt_world

    # Convert to QM grid voxel coords (float)
    qix = (blended.x - q_org[0]) / q_vs - 0.5
    qiy = (blended.y - q_org[1]) / q_vs - 0.5
    qiz = (blended.z - q_org[2]) / q_vs - 0.5
    expected_qm_grid.append((qix, qiy, qiz))

print(f"  expected: {len(expected_qm_grid)} positions ({n_no_weight} skipped)")

# ========================================================================
# Step 3: Load actual QM voxels + classify
# ========================================================================
print(f"\n[3] Classify actual QM voxels vs expected")
q_voxels, q_sx, q_sy, q_sz, q_pal = parse_vox(QM_VOX)
with open(QM_W_JSON, encoding='utf-8') as f:
    q_w_data = json.load(f)
print(f"  actual: {len(q_voxels)} voxels in {q_sx}x{q_sy}x{q_sz}")

actual_pts = np.array([[v[0], v[1], v[2]] for v in q_voxels], dtype=np.float64)
expected_pts = np.array(expected_qm_grid, dtype=np.float64)

# For each actual: nearest expected distance
print(f"  computing actual → expected distances...")
batch = 1000
nearest_d_actual = np.zeros(len(actual_pts))
for i in range(0, len(actual_pts), batch):
    end = min(i + batch, len(actual_pts))
    chunk = actual_pts[i:end]
    d = np.linalg.norm(chunk[:, None, :] - expected_pts[None, :, :], axis=2)
    nearest_d_actual[i:end] = d.min(axis=1)

mask_match = nearest_d_actual <= R
n_match = int(mask_match.sum())
n_excess = len(actual_pts) - n_match
print(f"  Match (actual within R of expected): {n_match} ({100*n_match/len(actual_pts):.1f}%)")
print(f"  Excess (actual outside R, = artifact): {n_excess} ({100*n_excess/len(actual_pts):.1f}%)")

# For each expected: nearest actual distance
print(f"  computing expected → actual distances...")
nearest_d_expected = np.zeros(len(expected_pts))
for i in range(0, len(expected_pts), batch):
    end = min(i + batch, len(expected_pts))
    chunk = expected_pts[i:end]
    d = np.linalg.norm(chunk[:, None, :] - actual_pts[None, :, :], axis=2)
    nearest_d_expected[i:end] = d.min(axis=1)

mask_missing = nearest_d_expected > R
n_missing = int(mask_missing.sum())
n_covered = len(expected_pts) - n_missing
print(f"  Covered (expected has nearby actual): {n_covered} ({100*n_covered/len(expected_pts):.1f}%)")
print(f"  Missing (no actual nearby): {n_missing} ({100*n_missing/len(expected_pts):.1f}%)")

# ========================================================================
# Step 4: Save 3 voxel files for visualization
# ========================================================================
print(f"\n[4] Save classification voxel files")
os.makedirs(OUT_DIR, exist_ok=True)

# Match voxels (= actual whose nearest expected is within R)
match_voxels = [v for v, m in zip(q_voxels, mask_match) if m]
write_vox(os.path.join(OUT_DIR, f"{OUT_PREFIX}_match.vox"), q_sx, q_sy, q_sz, match_voxels, q_pal)
print(f"  -> {OUT_PREFIX}_match.vox: {len(match_voxels)} voxels (legitimate body-following)")

# Excess voxels (= actual whose nearest expected is > R)
excess_voxels = [v for v, m in zip(q_voxels, mask_match) if not m]
# Use red color palette
red_pal = [(255, 80, 80, 255)] + [(0,0,0,255)]*255
excess_voxels_red = [(v[0], v[1], v[2], 0) for v in excess_voxels]
write_vox(os.path.join(OUT_DIR, f"{OUT_PREFIX}_excess.vox"), q_sx, q_sy, q_sz, excess_voxels_red, red_pal)
print(f"  -> {OUT_PREFIX}_excess.vox: {len(excess_voxels)} voxels (artifacts, RED)")

# Missing voxels (= expected with no nearby actual). Round to grid.
missing_voxels = []
for ep, mm in zip(expected_qm_grid, mask_missing):
    if not mm: continue
    qix = int(round(ep[0]))
    qiy = int(round(ep[1]))
    qiz = int(round(ep[2]))
    if 0 <= qix < q_sx and 0 <= qiy < q_sy and 0 <= qiz < q_sz:
        missing_voxels.append((qix, qiy, qiz, 0))
# dedup
missing_voxels = list({(v[0], v[1], v[2]): v for v in missing_voxels}.values())
blue_pal = [(80, 80, 255, 255)] + [(0,0,0,255)]*255
write_vox(os.path.join(OUT_DIR, f"{OUT_PREFIX}_missing.vox"), q_sx, q_sy, q_sz, missing_voxels, blue_pal)
print(f"  -> {OUT_PREFIX}_missing.vox: {len(missing_voxels)} voxels (uncovered, BLUE)")

# ========================================================================
# Step 5: Auto-correction (optional)
# ========================================================================
if APPLY:
    print(f"\n[5] Apply auto-correction: drop excess from main vox")
    # Create corrected version: original minus excess voxels
    excess_set = set((v[0], v[1], v[2]) for v in excess_voxels)
    corrected_voxels = []
    corrected_weights = []
    for v, w in zip(q_voxels, q_w_data['weights']):
        if (v[0], v[1], v[2]) in excess_set:
            continue
        corrected_voxels.append(v)
        corrected_weights.append(w)
    write_vox(QM_VOX, q_sx, q_sy, q_sz, corrected_voxels, q_pal)
    with open(QM_W_JSON, 'w', encoding='utf-8') as f:
        json.dump({"bones": q_w_data['bones'], "weights": corrected_weights}, f)
    print(f"  -> {QM_VOX} (corrected: {len(corrected_voxels)} voxels, removed {len(excess_voxels)} artifacts)")

print(f"\n=== DONE ===")
