"""DE voxel を QM bbox にアフィンフィットさせる (inverse mapping、隙間なし)。

原理 (forward rasterization の隙間を避ける):
  1. SRC body bbox と TGT body bbox を計算し per-axis scale を算出
  2. 変換式: W_tgt = tbb.min + (W_src - sbb.min) * scale
  3. TGT 側 voxel を枠内で全数イテレートし、逆変換で SRC voxel を引く:
     W_src = sbb.min + (W_tgt - tbb.min) / scale
     vsrc = round((W_src - src_origin) / src_vs - 0.5)
     SRC body/衣装 set に含まれるなら TGT voxel をその色/weight でコピー
  4. 結果: TGT 側は離散化穴なしで充填される (各 TGT voxel が確実にソースを引く)

Usage:
  python scale_body_to_match.py <src_dir> <src_prefix> <tgt_dir> <out_prefix>
"""
import sys, os, json, struct

if len(sys.argv) < 5:
    print(__doc__); sys.exit(1)
SRC_DIR = sys.argv[1]; SRC_PREFIX = sys.argv[2]
TGT_DIR = sys.argv[3]; OUT_PREFIX = sys.argv[4]
NO_FALLBACK = '--no-fallback' in sys.argv  # body-shell の隙間埋め fallback を無効化 (衣装向け)

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

with open(os.path.join(SRC_DIR, 'grid.json')) as f: src_grid = json.load(f)
with open(os.path.join(TGT_DIR, 'grid.json')) as f: tgt_grid = json.load(f)
src_vs = src_grid['voxel_size']; tgt_vs = tgt_grid['voxel_size']
src_origin = src_grid['grid_origin']; tgt_origin = tgt_grid['grid_origin']
src_gx, src_gy, src_gz = src_grid['gx'], src_grid['gy'], src_grid['gz']
tgt_gx, tgt_gy, tgt_gz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

# --- SRC body voxel で bbox 計算 ---
src_body_voxels, _, _, _, _ = parse_vox(os.path.join(SRC_DIR, 'body.vox'))
tgt_body_voxels, _, _, _, _ = parse_vox(os.path.join(TGT_DIR, 'body.vox'))

def voxel_world_bbox(voxels, vs, origin):
    wxs = [origin[0]+(x+0.5)*vs for (x,y,z,_) in voxels]
    wys = [origin[1]+(y+0.5)*vs for (x,y,z,_) in voxels]
    wzs = [origin[2]+(z+0.5)*vs for (x,y,z,_) in voxels]
    return (min(wxs), min(wys), min(wzs), max(wxs), max(wys), max(wzs))

sbb = voxel_world_bbox(src_body_voxels, src_vs, src_origin)
tbb = voxel_world_bbox(tgt_body_voxels, tgt_vs, tgt_origin)
print(f"  SRC body size: {sbb[3]-sbb[0]:.3f} x {sbb[4]-sbb[1]:.3f} x {sbb[5]-sbb[2]:.3f}")
print(f"  TGT body size: {tbb[3]-tbb[0]:.3f} x {tbb[4]-tbb[1]:.3f} x {tbb[5]-tbb[2]:.3f}")

sx_ = max(1e-6, sbb[3]-sbb[0]); sy_ = max(1e-6, sbb[4]-sbb[1]); sz_ = max(1e-6, sbb[5]-sbb[2])
tx_ = tbb[3]-tbb[0]; ty_ = tbb[4]-tbb[1]; tz_ = tbb[5]-tbb[2]
scale = (tx_/sx_, ty_/sy_, tz_/sz_)
print(f"  scale (TGT/SRC): ({scale[0]:.3f}, {scale[1]:.3f}, {scale[2]:.3f})")

# --- load SRC source (body or clothing) と weights ---
src_voxels, _, _, _, src_pal = parse_vox(os.path.join(SRC_DIR, f"{SRC_PREFIX}.vox"))
with open(os.path.join(SRC_DIR, f"{SRC_PREFIX}.weights.json"), encoding='utf-8') as f:
    src_w = json.load(f)
src_weights = src_w['weights']; src_bones = src_w['bones']

# SRC voxel → (ci, weight_idx) 引き用
src_lookup = {}
for idx, (x, y, z, ci) in enumerate(src_voxels):
    src_lookup[(x, y, z)] = (ci, idx)

# --- TGT 側 bbox 範囲を voxel 単位で算出 ---
tgt_min_vx = max(0, int((tbb[0] - tgt_origin[0]) / tgt_vs - 0.5))
tgt_max_vx = min(tgt_gx - 1, int((tbb[3] - tgt_origin[0]) / tgt_vs + 0.5))
tgt_min_vy = max(0, int((tbb[1] - tgt_origin[1]) / tgt_vs - 0.5))
tgt_max_vy = min(tgt_gy - 1, int((tbb[4] - tgt_origin[1]) / tgt_vs + 0.5))
tgt_min_vz = max(0, int((tbb[2] - tgt_origin[2]) / tgt_vs - 0.5))
tgt_max_vz = min(tgt_gz - 1, int((tbb[5] - tgt_origin[2]) / tgt_vs + 0.5))
# 少し余裕 (衣装は bbox 外にもある場合あり)
tgt_min_vx = max(0, tgt_min_vx - 2); tgt_max_vx = min(tgt_gx - 1, tgt_max_vx + 2)
tgt_min_vy = max(0, tgt_min_vy - 2); tgt_max_vy = min(tgt_gy - 1, tgt_max_vy + 2)
tgt_min_vz = max(0, tgt_min_vz - 2); tgt_max_vz = min(tgt_gz - 1, tgt_max_vz + 2)

print(f"  TGT scan range: x {tgt_min_vx}-{tgt_max_vx}, y {tgt_min_vy}-{tgt_max_vy}, z {tgt_min_vz}-{tgt_max_vz}")

# --- inverse mapping: TGT voxel → SRC voxel lookup ---
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

inv_sx = 1.0/scale[0]; inv_sy = 1.0/scale[1]; inv_sz = 1.0/scale[2]

out_voxels = []; out_weights = []
all_bones = []; bi_map = {}
count = 0

for tz_ in range(tgt_min_vz, tgt_max_vz + 1):
    for ty_ in range(tgt_min_vy, tgt_max_vy + 1):
        for tx_ in range(tgt_min_vx, tgt_max_vx + 1):
            # TGT voxel の world 座標
            twx = tgt_origin[0] + (tx_ + 0.5) * tgt_vs
            twy = tgt_origin[1] + (ty_ + 0.5) * tgt_vs
            twz = tgt_origin[2] + (tz_ + 0.5) * tgt_vs
            # inverse: SRC world 座標
            swx = sbb[0] + (twx - tbb[0]) * inv_sx
            swy = sbb[1] + (twy - tbb[1]) * inv_sy
            swz = sbb[2] + (twz - tbb[2]) * inv_sz
            # SRC voxel 座標
            svx = int(round((swx - src_origin[0]) / src_vs - 0.5))
            svy = int(round((swy - src_origin[1]) / src_vs - 0.5))
            svz = int(round((swz - src_origin[2]) / src_vs - 0.5))
            if svx < 0 or svx >= src_gx or svy < 0 or svy >= src_gy or svz < 0 or svz >= src_gz:
                continue
            src_key = (svx, svy, svz)
            # exact match。--no-fallback でない場合、3x3x3 近傍で shell 穴埋め
            if src_key not in src_lookup:
                if NO_FALLBACK: continue
                found_nb = None
                for dz_nb in (0, -1, 1):
                    for dy_nb in (0, -1, 1):
                        for dx_nb in (0, -1, 1):
                            if dx_nb == 0 and dy_nb == 0 and dz_nb == 0: continue
                            nb = (svx + dx_nb, svy + dy_nb, svz + dz_nb)
                            if nb in src_lookup:
                                found_nb = nb; break
                        if found_nb: break
                    if found_nb: break
                if found_nb is None: continue
                src_key = found_nb
            ci, idx = src_lookup[src_key]
            # weight 変換
            wl = src_weights[idx]
            new_wl = []
            for (bi, w) in wl:
                bn = SRC_TO_TGT_BONE.get(src_bones[bi], src_bones[bi])
                if bn not in bi_map:
                    bi_map[bn] = len(all_bones); all_bones.append(bn)
                new_wl.append([bi_map[bn], w])
            out_voxels.append((tx_, ty_, tz_, ci))
            out_weights.append(new_wl)
            count += 1

print(f"  output voxels (inverse mapping): {count}")

out_vox = os.path.join(TGT_DIR, f"{OUT_PREFIX}.vox")
out_w = os.path.join(TGT_DIR, f"{OUT_PREFIX}.weights.json")
out_t = os.path.join(TGT_DIR, f"{OUT_PREFIX}.transform.json")
write_vox(out_vox, tgt_gx, tgt_gy, tgt_gz, out_voxels, src_pal)
with open(out_w, 'w', encoding='utf-8') as f:
    json.dump({
        'mesh': src_w.get('mesh', '') + ' (inverse mapped)',
        'bones': all_bones,
        'voxel_count': len(out_voxels),
        'weights': out_weights,
    }, f, ensure_ascii=False, indent=0)
with open(out_t, 'w', encoding='utf-8') as f:
    json.dump({
        'src_bbox': sbb, 'tgt_bbox': tbb,
        'scale': list(scale),
        'method': 'inverse_mapping',
    }, f, indent=1)
print(f"  -> {out_vox}")
