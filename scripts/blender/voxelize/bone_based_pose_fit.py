"""bone 位置 (膝・かかと・つま先) を基準に per-voxel pose 補正を適用 (スタンス差吸収)。

想定: scale_body_to_match.py で全身 bbox scale 済みの中間 vox に対して適用。
    足が QM に届かない等のスタンス差を、各 voxel の bone weight を加重で
    適用する bone-local 変換で補正する。

原理:
  - 各 bone について: DE 側 bone 位置 P_de (head/tail) と QM 側の対応 bone 位置 P_qm
  - bone-space での voxel 位置 = P_de 基準の相対座標
  - bone を DE P_de → QM P_qm に動かすと、voxel も一緒に動く (linear blend)
  - 複数 bone weight の voxel は各 bone の変換を weight で加重平均

対応 bone (ARP 名、両モデルで共通するものを自動対応):
  - c_toes_thumb1_base.l, c_toes_*
  - foot.l, foot.r
  - c_leg_stretch.l, c_leg_stretch.r (膝周辺)
  - c_thigh_stretch.l, c_thigh_stretch.r (太もも)

Usage:
  python bone_based_pose_fit.py <src_dir> <tgt_dir> <prefix>
  例:
    python bone_based_pose_fit.py \
      public/box5/darkelfblader public/box5/qm_mustardui de_body_as_qm
"""
import sys, os, json, struct

if len(sys.argv) < 4:
    print(__doc__); sys.exit(1)
SRC_DIR = sys.argv[1]; TGT_DIR = sys.argv[2]; PREFIX = sys.argv[3]

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

with open(os.path.join(TGT_DIR, 'grid.json')) as f: tgt_grid = json.load(f)
tgt_vs = tgt_grid['voxel_size']; tgt_origin = tgt_grid['grid_origin']

# source/target skeleton
with open(os.path.join(SRC_DIR, 'skeleton.json'), encoding='utf-8') as f: src_skel = json.load(f)
with open(os.path.join(TGT_DIR, 'skeleton.json'), encoding='utf-8') as f: tgt_skel = json.load(f)
src_bone_head = {b['name']: tuple(b['head_rest']) for b in src_skel['bones']}
tgt_bone_head = {b['name']: tuple(b['head_rest']) for b in tgt_skel['bones']}

# scale 済み voxel に対して pose fit を適用するため、DE bone 位置を同じスケール変換
# (src_bbox → tgt_bbox) で事前に QM 空間に写像する。
TRANSFORM_JSON_CANDIDATES = [
    os.path.join(TGT_DIR, f"{sys.argv[3]}.transform.json"),
    os.path.join(TGT_DIR, "de_body_as_qm.transform.json"),  # fallback
]
transform = None
for p in TRANSFORM_JSON_CANDIDATES:
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f: transform = json.load(f); break
if transform is None:
    print(f"  WARN: transform.json not found, using raw DE bones (結果過剰補正の可能性あり)")
    src_bone_scaled = src_bone_head
else:
    sbb = transform['src_bbox']; tbb = transform['tgt_bbox']; sc = transform['scale']
    src_bone_scaled = {}
    for (bn, p) in src_bone_head.items():
        src_bone_scaled[bn] = (
            tbb[0] + (p[0] - sbb[0]) * sc[0],
            tbb[1] + (p[1] - sbb[1]) * sc[1],
            tbb[2] + (p[2] - sbb[2]) * sc[2],
        )
    print(f"  applied scale transform to DE bones: scale={sc}")

# --- target vox ファイル (TGT_DIR 側、既にスケール済) ---
VOX_PATH = os.path.join(TGT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(TGT_DIR, f"{PREFIX}.weights.json")

voxels, gx, gy, gz, palette = parse_vox(VOX_PATH)
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']
bones = weights_obj['bones']
print(f"  input: {len(voxels)} voxels, {len(bones)} bones")

# 各 bone について DE→QM の per-bone 変位を計算
SRC_TO_TGT = {
    'breast.l':'breast_l','breast.r':'breast_r','butt.l':'butt_l','butt.r':'butt_r',
    'foot.l':'foot_l','foot.r':'foot_r','nipple.l':'nipple_l','nipple.r':'nipple_r',
    'c_thigh_twist_2.l':'c_thigh_twist.l','c_thigh_twist_2.r':'c_thigh_twist.r',
    'c_arm_twist_2.l':'c_arm_twist.l','c_arm_twist_2.r':'c_arm_twist.r',
    'c_forearm_twist_2.l':'c_forearm_twist.l','c_forearm_twist_2.r':'c_forearm_twist.r',
    'c_leg_twist_2.l':'c_leg_twist.l','c_leg_twist_2.r':'c_leg_twist.r',
    'vagina_01_l':'vagina_01.l','vagina_01_r':'vagina_01.r',
    'vagina_02_l':'vagina_02.l','vagina_02_r':'vagina_02.r',
}
def src_to_tgt_bone_name(src_name):
    # weights は既に QM 命名に変換済みなので、直接 tgt skel で引く
    if src_name in tgt_bone_head: return src_name
    mapped = SRC_TO_TGT.get(src_name)
    if mapped and mapped in tgt_bone_head: return mapped
    return None

# bone 別の per-bone displacement (weights.json は QM 名なので tgt 基準で SRC 名を逆引き)
TGT_TO_SRC = {v: k for k, v in SRC_TO_TGT.items()}
def qm_name_to_de(qm_name):
    if qm_name in src_bone_head: return qm_name
    reverse = TGT_TO_SRC.get(qm_name)
    if reverse and reverse in src_bone_head: return reverse
    return None

bone_disp = {}
for bname in bones:
    qm_pos = tgt_bone_head.get(bname)
    de_name = qm_name_to_de(bname)
    de_pos = src_bone_scaled.get(de_name) if de_name else None  # scale 済み DE bone
    if qm_pos is None or de_pos is None: continue
    # 変位 = QM bone - scaled DE bone (scale 後の pose 差分のみ)
    bone_disp[bname] = (qm_pos[0]-de_pos[0], qm_pos[1]-de_pos[1], qm_pos[2]-de_pos[2])
print(f"  bones with disp: {len(bone_disp)}")

# 入力 voxel の world 座標 を作り、per-voxel 加重並進
new_voxels = []; new_weights = []
no_disp_count = 0

# 既に scale 済みの voxel を再変換する: 各 voxel の weights の bone 並進を加重平均して
# 現在の世界座標に加算してから voxel 座標に戻す。
# ただし scale が既に適用されているので、"さらに bone-based 補正" をかける形になる。
# bone-based 補正は delta 的に効いて、足の開き差 (スタンス) を吸収。

for (v, wl) in zip(voxels, weights_list):
    vx, vy, vz, vci = v
    # world 座標
    wx = tgt_origin[0] + (vx + 0.5) * tgt_vs
    wy = tgt_origin[1] + (vy + 0.5) * tgt_vs
    wz = tgt_origin[2] + (vz + 0.5) * tgt_vs
    # per-bone delta 平均
    dx_sum = dy_sum = dz_sum = 0.0; w_sum = 0.0
    for (bi, w) in wl:
        bn = bones[bi]
        d = bone_disp.get(bn)
        if d is None: continue
        dx_sum += d[0]*w; dy_sum += d[1]*w; dz_sum += d[2]*w; w_sum += w
    if w_sum < 1e-6:
        # no bone disp → 変換なしでそのまま保持
        new_voxels.append(v); new_weights.append(wl); no_disp_count += 1
        continue
    dx = dx_sum / w_sum; dy = dy_sum / w_sum; dz = dz_sum / w_sum
    # 補正 world 座標
    new_wx = wx + dx; new_wy = wy + dy; new_wz = wz + dz
    new_vx = int(round((new_wx - tgt_origin[0]) / tgt_vs - 0.5))
    new_vy = int(round((new_wy - tgt_origin[1]) / tgt_vs - 0.5))
    new_vz = int(round((new_wz - tgt_origin[2]) / tgt_vs - 0.5))
    if new_vx < 0 or new_vx >= gx or new_vy < 0 or new_vy >= gy or new_vz < 0 or new_vz >= gz:
        continue
    new_voxels.append((new_vx, new_vy, new_vz, vci))
    new_weights.append(wl)

print(f"  output: {len(new_voxels)} voxels (no-bone-disp: {no_disp_count})")

# dedup (重なった voxel は 1 つ残す)
seen = set(); dedup_v = []; dedup_w = []
for (v, w) in zip(new_voxels, new_weights):
    key = (v[0], v[1], v[2])
    if key in seen: continue
    seen.add(key); dedup_v.append(v); dedup_w.append(w)
print(f"  after dedup: {len(dedup_v)} voxels")

write_vox(VOX_PATH, gx, gy, gz, dedup_v, palette)
weights_obj['weights'] = dedup_w
weights_obj['voxel_count'] = len(dedup_v)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}")
