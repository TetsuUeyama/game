"""Source (DE) の body と衣装を Target (QM) の body サイズにリサイズする。

アプローチ: per-region bbox 比を使って、SRC の body + 衣装を TGT body サイズに
アフィン変換する。各 voxel は:
  1. その所属 region を判定
  2. region bbox 内の正規化座標 (t) を計算
  3. TGT region bbox に同じ t を適用 → 新座標
  4. 出力

これで「DE キャラを QM サイズにシュリンクしたクローン」が得られ、その上の
衣装はすでに QM body 表面にフィットしている。

Usage:
  python resize_model_to_body.py <src_dir> <src_prefix> <tgt_dir> <out_prefix>
  例:
    # DE body を QM サイズに
    python resize_model_to_body.py public/box5/darkelfblader body public/box5/qm_mustardui de_body_as_qm
    # DE 衣装を QM サイズに (body と同じ変換を適用)
    python resize_model_to_body.py public/box5/darkelfblader armor_suit_bra public/box5/qm_mustardui de_armor_suit_bra
"""
import sys, os, json, struct

if len(sys.argv) < 5:
    print(__doc__); sys.exit(1)
SRC_DIR = sys.argv[1]; SRC_PREFIX = sys.argv[2]
TGT_DIR = sys.argv[3]; OUT_PREFIX = sys.argv[4]

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

# --- load grids ---
with open(os.path.join(SRC_DIR, 'grid.json')) as f: src_grid = json.load(f)
with open(os.path.join(TGT_DIR, 'grid.json')) as f: tgt_grid = json.load(f)
src_vs = src_grid['voxel_size']; tgt_vs = tgt_grid['voxel_size']
src_origin = src_grid['grid_origin']; tgt_origin = tgt_grid['grid_origin']

def src_world(x, y, z): return (src_origin[0]+(x+0.5)*src_vs, src_origin[1]+(y+0.5)*src_vs, src_origin[2]+(z+0.5)*src_vs)

# --- load source voxels + weights ---
src_voxels, _, _, _, src_pal = parse_vox(os.path.join(SRC_DIR, f"{SRC_PREFIX}.vox"))
with open(os.path.join(SRC_DIR, f"{SRC_PREFIX}.weights.json"), encoding='utf-8') as f:
    src_w = json.load(f)
src_weights = src_w['weights']; src_bones = src_w['bones']
print(f"  source: {len(src_voxels)} voxels ({len(src_bones)} bones)")

# --- load regions (DE + QM) ---
def load_regions_as_bbox(dir_path):
    """region -> (min_wx, min_wy, min_wz, max_wx, max_wy, max_wz) in WORLD coords"""
    grid_path = os.path.join(os.path.dirname(dir_path), 'grid.json')
    with open(grid_path) as f: grid = json.load(f)
    vs = grid['voxel_size']; ox, oy, oz = grid['grid_origin']
    out = {}
    for fn in os.listdir(dir_path):
        if not (fn.startswith('region_') and fn.endswith('.vox')): continue
        rn = fn[len('region_'):-len('.vox')]
        vs_list, _, _, _, _ = parse_vox(os.path.join(dir_path, fn))
        if not vs_list: continue
        wxs = [ox+(x+0.5)*vs for (x,y,z,_) in vs_list]
        wys = [oy+(y+0.5)*vs for (x,y,z,_) in vs_list]
        wzs = [oz+(z+0.5)*vs for (x,y,z,_) in vs_list]
        out[rn] = (min(wxs), min(wys), min(wzs), max(wxs), max(wys), max(wzs))
    return out

src_bbox_w = load_regions_as_bbox(os.path.join(SRC_DIR, 'regions'))
tgt_bbox_w = load_regions_as_bbox(os.path.join(TGT_DIR, 'regions'))

# --- per-region voxel membership (for src voxels) ---
src_regions_set = {}  # region -> set of src voxel positions (from region_*.vox)
for fn in os.listdir(os.path.join(SRC_DIR, 'regions')):
    if not (fn.startswith('region_') and fn.endswith('.vox')): continue
    rn = fn[len('region_'):-len('.vox')]
    vs_list, _, _, _, _ = parse_vox(os.path.join(SRC_DIR, 'regions', fn))
    src_regions_set[rn] = set((x,y,z) for (x,y,z,_) in vs_list)

# --- bone map (src bones → region) ---
src_bone_to_region = {}
bm_path = os.path.join(SRC_DIR, 'bone_map.json')
if os.path.exists(bm_path):
    with open(bm_path, encoding='utf-8') as f:
        src_bone_to_region = json.load(f).get('bone_map', {})

# --- voxel の region 決定: 1) body voxel なら region map で直接、2) 衣装なら bone weight から ---
# 高速化のため src_voxel → region の逆引き
src_vox2region = {}
for rn, s in src_regions_set.items():
    for p in s: src_vox2region[p] = rn

def voxel_region(vox_pos, weight_list):
    # body voxel なら直接
    if vox_pos in src_vox2region: return src_vox2region[vox_pos]
    # 衣装 voxel → bone weight から region 判定
    score = {}
    for (bi, w) in weight_list:
        bn = src_bones[bi]
        r = src_bone_to_region.get(bn)
        if r and r != 'unknown':
            score[r] = score.get(r, 0) + w
    if not score: return None
    return max(score.items(), key=lambda x: x[1])[0]

# --- bone name map (SRC → TGT) ---
SRC_TO_TGT_BONE = {
    'breast.l':'breast_l','breast.r':'breast_r','butt.l':'butt_l','butt.r':'butt_r',
    'foot.l':'foot_l','foot.r':'foot_r','nipple.l':'nipple_l','nipple.r':'nipple_r',
    'c_thigh_twist_2.l':'c_thigh_twist.l','c_thigh_twist_2.r':'c_thigh_twist.r',
    'c_arm_twist_2.l':'c_arm_twist.l','c_arm_twist_2.r':'c_arm_twist.r',
    'c_forearm_twist_2.l':'c_forearm_twist.l','c_forearm_twist_2.r':'c_forearm_twist.r',
    'c_leg_twist_2.l':'c_leg_twist.l','c_leg_twist_2.r':'c_leg_twist.r',
    'vagina_01_l':'vagina_01.l','vagina_01_r':'vagina_01.r',
    'vagina_02_l':'vagina_02.l','vagina_02_r':'vagina_02.r',
}

# --- resize loop: per-region bbox t-mapping (world coords) ---
print(f"  resizing with per-region bbox t-mapping...")
out_map = {}  # (tx,ty,tz) -> (ci, weight_list)
region_hits = {}; skipped_no_region = 0; skipped_oob = 0

for (v, wl) in zip(src_voxels, src_weights):
    vx, vy, vz, vci = v
    region = voxel_region((vx, vy, vz), wl)
    if region is None or region not in src_bbox_w or region not in tgt_bbox_w:
        skipped_no_region += 1; continue
    region_hits[region] = region_hits.get(region, 0) + 1

    vw = src_world(vx, vy, vz)
    sbb = src_bbox_w[region]; tbb = tgt_bbox_w[region]

    # 正規化 t (clamp しない: 外側 voxel も正しく比例移動)
    def trem(v, s, t, sbb_i0, sbb_i1, tbb_i0, tbb_i1):
        ssz = max(1e-6, sbb_i1 - sbb_i0)
        tsz = tbb_i1 - tbb_i0
        t = (v - sbb_i0) / ssz
        return tbb_i0 + t * tsz
    qwx = trem(vw[0], None, None, sbb[0], sbb[3], tbb[0], tbb[3])
    qwy = trem(vw[1], None, None, sbb[1], sbb[4], tbb[1], tbb[4])
    qwz = trem(vw[2], None, None, sbb[2], sbb[5], tbb[2], tbb[5])

    tx = int(round((qwx - tgt_origin[0]) / tgt_vs - 0.5))
    ty = int(round((qwy - tgt_origin[1]) / tgt_vs - 0.5))
    tz = int(round((qwz - tgt_origin[2]) / tgt_vs - 0.5))
    if tx<0 or tx>=tgt_grid['gx'] or ty<0 or ty>=tgt_grid['gy'] or tz<0 or tz>=tgt_grid['gz']:
        skipped_oob += 1; continue
    key = (tx, ty, tz)
    if key not in out_map:
        new_wl = [[SRC_TO_TGT_BONE.get(src_bones[bi], src_bones[bi]), w] for (bi, w) in wl]
        out_map[key] = (vci, new_wl)

# stats
print(f"  placed: {len(out_map)} (input {len(src_voxels)})")
print(f"  skipped: no_region={skipped_no_region} oob={skipped_oob}")
print(f"  regions used:")
for r, c in sorted(region_hits.items(), key=lambda x: -x[1]):
    print(f"    {r}: {c}")

# bones → index
all_bones = []; bi_map = {}
for (_, wl) in out_map.values():
    for (bn, _) in wl:
        if bn not in bi_map: bi_map[bn] = len(all_bones); all_bones.append(bn)

sorted_keys = sorted(out_map.keys())
new_voxels = [(k[0], k[1], k[2], out_map[k][0]) for k in sorted_keys]
new_weights = [[[bi_map[bn], w] for (bn, w) in out_map[k][1]] for k in sorted_keys]

out_vox = os.path.join(TGT_DIR, f"{OUT_PREFIX}.vox")
out_w = os.path.join(TGT_DIR, f"{OUT_PREFIX}.weights.json")
write_vox(out_vox, tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz'], new_voxels, src_pal)
with open(out_w, 'w', encoding='utf-8') as f:
    json.dump({
        'mesh': src_w.get('mesh', '') + f' (resized from {SRC_DIR})',
        'bones': all_bones,
        'voxel_count': len(new_voxels),
        'weights': new_weights,
    }, f, ensure_ascii=False, indent=0)
print(f"\n  -> {out_vox}: {len(new_voxels)} voxels")
