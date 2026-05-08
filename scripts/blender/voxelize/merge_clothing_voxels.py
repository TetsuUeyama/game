"""Anatomy + geometry-based clothing voxel merge.

2 つの fit 結果 (例: TPS+Push と Shrinkwrap) を解剖学+幾何で merge:
  - 領域 A 採用条件: top bone ∈ REGION_BONES  AND  iy < FRONT_IY_MAX (前面)
  - それ以外: set B 採用

例 (Bodysuit):
  - 胸 cup (breast bone, 前面): A=TPS (cup 形成)
  - 背中 (breast bone, 後面): B=Shrinkwrap (広い coverage)
  - 肩 strap (shoulder bone): A=TPS
  - 腰・腿: B=Shrinkwrap

Wrap 思想で best-of-both。

Usage:
  python merge_clothing_voxels.py <out_dir> <prefix_a> <prefix_b> <out_prefix>
    [--region-bones <comma_sep>] [--front-iy-max <int>]

  prefix_a: 領域 A 採用元 (例: helena_bodysuit_tps)
  prefix_b: 領域 A 以外採用元 (例: helena_bodysuit_v2)
  out_prefix: 出力 prefix (例: helena_bodysuit)

  --region-bones: 領域 A 判定用 bone 名 (デフォルト: breast_l,breast_r,shoulder.l,shoulder.r,c_spine_03_bend.x,neck.x)
  --front-iy-max: A 採用上限 iy 値 (それ以上は後面と判定して B 採用、デフォルト: 自動算出 = body bbox 中央)
"""
import sys, os, json, struct

if len(sys.argv) < 5:
    print(__doc__); sys.exit(1)

OUT_DIR    = sys.argv[1]
PREFIX_A   = sys.argv[2]
PREFIX_B   = sys.argv[3]
OUT_PREFIX = sys.argv[4]

DEFAULT_REGION = "breast_l,breast_r,shoulder.l,shoulder.r,c_spine_03_bend.x,neck.x"
REGION_BONES = set(DEFAULT_REGION.split(','))
if '--region-bones' in sys.argv:
    idx = sys.argv.index('--region-bones')
    REGION_BONES = set(sys.argv[idx + 1].split(','))

FRONT_IY_MAX = None  # auto-compute from voxel bbox if not specified
if '--front-iy-max' in sys.argv:
    idx = sys.argv.index('--front-iy-max')
    FRONT_IY_MAX = int(sys.argv[idx + 1])

# TPS bbox constraint for B set: drop B voxels outside A's natural extent
# This removes Shrinkwrap artifacts (over-extended verts to head/jaw, lateral wings)
USE_TPS_BBOX = '--no-tps-bbox' not in sys.argv  # default ON
TPS_BBOX_MARGIN = 5  # voxels: allow B to extend a bit beyond A
if '--tps-bbox-margin' in sys.argv:
    idx = sys.argv.index('--tps-bbox-margin')
    TPS_BBOX_MARGIN = int(sys.argv[idx + 1])

print(f"=== merge_clothing_voxels ===")
print(f"  out_dir  : {OUT_DIR}")
print(f"  prefix A : {PREFIX_A} (適用 bone: {sorted(REGION_BONES)})")
print(f"  prefix B : {PREFIX_B} (それ以外)")
print(f"  output   : {OUT_PREFIX}")

# ---- vox parser/writer (from align_clothing_by_layer.py) ----
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
                for i in range(count):
                    x, y, z, ci = struct.unpack_from('<BBBB', data, cs+4+i*4)
                    voxels.append((x, y, z, ci))
            elif cid == 'RGBA':
                for i in range(256):
                    r, g, b, a = struct.unpack_from('<BBBB', data, cs+i*4)
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
    for i in range(256):
        if i < len(pal):
            rd += struct.pack('<BBBB', pal[i][0], pal[i][1], pal[i][2], pal[i][3])
        else:
            rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# ---- Load both sets ----
def load_set(prefix):
    vox_path = os.path.join(OUT_DIR, f"{prefix}.vox")
    w_path = os.path.join(OUT_DIR, f"{prefix}.weights.json")
    voxels, sx, sy, sz, pal = parse_vox(vox_path)
    with open(w_path, encoding='utf-8') as f:
        w_data = json.load(f)
    return voxels, sx, sy, sz, pal, w_data['bones'], w_data['weights']

va, sx_a, sy_a, sz_a, pal_a, bones_a, w_a = load_set(PREFIX_A)
vb, sx_b, sy_b, sz_b, pal_b, bones_b, w_b = load_set(PREFIX_B)

if (sx_a, sy_a, sz_a) != (sx_b, sy_b, sz_b):
    print(f"  ERROR: grid mismatch A={sx_a}x{sy_a}x{sz_a} B={sx_b}x{sy_b}x{sz_b}")
    sys.exit(1)
print(f"  A: {len(va)} voxels, {len(bones_a)} bones")
print(f"  B: {len(vb)} voxels, {len(bones_b)} bones")

# Auto-compute FRONT_IY_MAX from combined voxel bbox if not specified
if FRONT_IY_MAX is None:
    all_iys = [v[1] for v in va] + [v[1] for v in vb]
    iy_min = min(all_iys); iy_max = max(all_iys)
    FRONT_IY_MAX = (iy_min + iy_max) // 2  # body Y bbox center
    print(f"  FRONT_IY_MAX auto: {FRONT_IY_MAX} (bbox iy {iy_min}..{iy_max})")
else:
    print(f"  FRONT_IY_MAX specified: {FRONT_IY_MAX}")

# ---- Classify voxels by (top bone in REGION_BONES) AND (iy < FRONT_IY_MAX) ----
def top_bone(weight_list, bones):
    if not weight_list: return None
    top_idx = weight_list[0][0]
    return bones[top_idx] if top_idx < len(bones) else None

# A voxels: keep only those whose top bone in REGION_BONES AND at front (iy < FRONT_IY_MAX)
keep_a = []
keep_a_weights = []
n_a_in = 0; n_a_out_bone = 0; n_a_out_back = 0
for vox, wlist in zip(va, w_a):
    tb = top_bone(wlist, bones_a)
    if tb not in REGION_BONES:
        n_a_out_bone += 1
        continue
    if vox[1] >= FRONT_IY_MAX:
        n_a_out_back += 1
        continue
    keep_a.append(vox)
    keep_a_weights.append(wlist)
    n_a_in += 1
print(f"  A in-region front: {n_a_in}, out (bone): {n_a_out_bone}, out (back): {n_a_out_back}")

# Compute A's bbox per region as constraint for B (TPS bbox = trusted natural extent)
if USE_TPS_BBOX and len(va) > 0:
    a_ix = [v[0] for v in va]; a_iy = [v[1] for v in va]; a_iz = [v[2] for v in va]
    a_bbox = (min(a_ix) - TPS_BBOX_MARGIN, max(a_ix) + TPS_BBOX_MARGIN,
              min(a_iy) - TPS_BBOX_MARGIN, max(a_iy) + TPS_BBOX_MARGIN,
              min(a_iz) - TPS_BBOX_MARGIN, max(a_iz) + TPS_BBOX_MARGIN)
    print(f"  TPS bbox (A) constraint: ix {a_bbox[0]}..{a_bbox[1]}, iy {a_bbox[2]}..{a_bbox[3]}, iz {a_bbox[4]}..{a_bbox[5]} (margin={TPS_BBOX_MARGIN})")
else:
    a_bbox = None

# B voxels: keep all EXCEPT
#   (1) those that A would handle (in-region AND front)
#   (2) those outside A's bbox (Shrinkwrap over-extension artifacts)
keep_b = []
keep_b_weights = []
n_b_in = 0; n_b_out = 0; n_b_outside = 0
for vox, wlist in zip(vb, w_b):
    tb = top_bone(wlist, bones_b)
    is_a_region = tb in REGION_BONES and vox[1] < FRONT_IY_MAX
    if is_a_region:
        n_b_in += 1
        continue
    if a_bbox is not None:
        ix, iy, iz = vox[0], vox[1], vox[2]
        if (ix < a_bbox[0] or ix > a_bbox[1] or
            iy < a_bbox[2] or iy > a_bbox[3] or
            iz < a_bbox[4] or iz > a_bbox[5]):
            n_b_outside += 1
            continue
    keep_b.append(vox)
    keep_b_weights.append(wlist)
    n_b_out += 1
print(f"  B kept: {n_b_out}, B skipped (A handles): {n_b_in}, B skipped (outside TPS bbox): {n_b_outside}")

# ---- Unify bone list ----
unified_bones = list(bones_a)
bone_idx_map_a = {i: i for i in range(len(bones_a))}
bone_idx_map_b = {}
for i, b in enumerate(bones_b):
    if b in unified_bones:
        bone_idx_map_b[i] = unified_bones.index(b)
    else:
        bone_idx_map_b[i] = len(unified_bones)
        unified_bones.append(b)
print(f"  unified bones: {len(unified_bones)} ({len(bones_a)} from A + {len(unified_bones) - len(bones_a)} new from B)")

# ---- Remap and combine ----
# Position-keyed dedup: A wins if collision
combined = {}  # (x,y,z) → (vox, weights_remapped)

for vox, wlist in zip(keep_b, keep_b_weights):
    pos = (vox[0], vox[1], vox[2])
    remapped = [(bone_idx_map_b[bi], w) for bi, w in wlist]
    combined[pos] = (vox, remapped)

for vox, wlist in zip(keep_a, keep_a_weights):
    pos = (vox[0], vox[1], vox[2])
    remapped = [(bone_idx_map_a[bi], w) for bi, w in wlist]
    combined[pos] = (vox, remapped)  # overwrite B if same position

print(f"  combined voxels: {len(combined)} (A+B duplicates merged)")

# ---- Build output ----
final_voxels = []
final_weights = []
for pos, (vox, wlist) in sorted(combined.items()):
    final_voxels.append(vox)
    final_weights.append(wlist)

# Use palette A (TPS — typically same as B for consistent rendering)
out_vox_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.vox")
out_w_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.weights.json")
write_vox(out_vox_path, sx_a, sy_a, sz_a, final_voxels, pal_a)
with open(out_w_path, 'w', encoding='utf-8') as f:
    json.dump({"bones": unified_bones, "weights": final_weights}, f)

print(f"  -> {out_vox_path} ({len(final_voxels)} voxels)")
print(f"  -> {out_w_path} ({len(unified_bones)} bones)")
print(f"=== DONE ===")
