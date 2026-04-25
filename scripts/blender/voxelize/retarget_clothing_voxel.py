"""ソースキャラ (SRC) のボクセル化済み衣装を、ターゲットキャラ (TGT) の
body 表面にリマップする (standalone、no Blender)。

両モデルで既に以下が生成済みであることが前提:
  SRC/TGT それぞれ:
    body.vox, grid.json, regions/region_*.vox, skeleton.json, body.weights.json

原理:
  1. SRC 衣装の各 voxel V から最寄りの SRC body voxel B_src を探す
  2. B_src の region R と、region 内の正規化座標 (t_x, t_y, t_z) を計算
  3. TGT の region R の bbox 内で同じ (t_x, t_y, t_z) に位置する TGT body voxel B_tgt を求める
  4. V - B_src の world オフセットを計算し、B_tgt に加算 → TGT voxel grid 上の target 位置
  5. bone 名は SRC 命名 → TGT 命名にリネーム (一部、例: butt.l → butt_l)
  6. 同 target に複数 voxel が重なる場合は先勝ち

Usage:
  python retarget_clothing_voxel.py <src_dir> <src_prefix> <tgt_dir> <out_prefix>

例:
  python retarget_clothing_voxel.py \
    public/box5/darkelfblader armor_suit_bra \
    public/box5/qm_mustardui de_armor_suit_bra
"""
import sys, os, json, struct

if len(sys.argv) < 5:
    print(__doc__); sys.exit(1)

SRC_DIR = sys.argv[1]
SRC_PREFIX = sys.argv[2]
TGT_DIR = sys.argv[3]
OUT_PREFIX = sys.argv[4]

# --- vox parse ---
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
print(f"  src grid: {src_grid['gx']}x{src_grid['gy']}x{src_grid['gz']} vs={src_vs:.5f}")
print(f"  tgt grid: {tgt_grid['gx']}x{tgt_grid['gy']}x{tgt_grid['gz']} vs={tgt_vs:.5f}")

def src_world(x, y, z): return (src_origin[0] + (x+0.5)*src_vs,
                                 src_origin[1] + (y+0.5)*src_vs,
                                 src_origin[2] + (z+0.5)*src_vs)
def tgt_world(x, y, z): return (tgt_origin[0] + (x+0.5)*tgt_vs,
                                 tgt_origin[1] + (y+0.5)*tgt_vs,
                                 tgt_origin[2] + (z+0.5)*tgt_vs)

# --- load source clothing ---
src_vox_path = os.path.join(SRC_DIR, f"{SRC_PREFIX}.vox")
src_w_path = os.path.join(SRC_DIR, f"{SRC_PREFIX}.weights.json")
cloth_voxels, _, _, _, cloth_pal = parse_vox(src_vox_path)
with open(src_w_path, encoding='utf-8') as f: cloth_w = json.load(f)
cloth_weights = cloth_w['weights']
cloth_bones = cloth_w['bones']
assert len(cloth_weights) == len(cloth_voxels)
print(f"  source clothing: {len(cloth_voxels)} voxels ({len(cloth_bones)} bones)")

# --- load skeleton (for bone-anchor retargeting) ---
with open(os.path.join(SRC_DIR, 'skeleton.json'), encoding='utf-8') as f:
    src_skel = json.load(f)
with open(os.path.join(TGT_DIR, 'skeleton.json'), encoding='utf-8') as f:
    tgt_skel = json.load(f)
src_bone_pos = {b['name']: tuple(b['head_rest']) for b in src_skel['bones']}
tgt_bone_pos = {b['name']: tuple(b['head_rest']) for b in tgt_skel['bones']}
print(f"  src bones: {len(src_bone_pos)}, tgt bones: {len(tgt_bone_pos)}")

# --- load src/tgt body regions ---
def load_region_voxels(regions_dir):
    """region name → set of (x,y,z); and voxel → region map"""
    out = {}; vox2region = {}
    for fn in os.listdir(regions_dir):
        if not (fn.startswith('region_') and fn.endswith('.vox')): continue
        rn = fn[len('region_'):-len('.vox')]
        vs, _, _, _, _ = parse_vox(os.path.join(regions_dir, fn))
        s = set((x, y, z) for (x, y, z, _) in vs)
        out[rn] = s
        for p in s: vox2region[p] = rn
    return out, vox2region

src_regions, src_vox2region = load_region_voxels(os.path.join(SRC_DIR, 'regions'))
tgt_regions, tgt_vox2region = load_region_voxels(os.path.join(TGT_DIR, 'regions'))
print(f"  src regions: {list(src_regions.keys())}")
print(f"  tgt regions: {list(tgt_regions.keys())}")

# --- bone name → region map を src bone_map.json から読む (無ければ pattern fallback) ---
SRC_BONE_MAP_PATH = os.path.join(SRC_DIR, 'bone_map.json')
src_bone_to_region = {}
if os.path.exists(SRC_BONE_MAP_PATH):
    with open(SRC_BONE_MAP_PATH, encoding='utf-8') as f:
        src_bone_to_region = json.load(f).get('bone_map', {})
    print(f"  loaded src bone_map: {len(src_bone_to_region)} entries")
else:
    print(f"  WARN: {SRC_BONE_MAP_PATH} not found, region from weight will be disabled")

def cloth_voxel_region(wl):
    """clothing voxel の [(bi, w), ...] から最も weight の高い region を返す"""
    score = {}
    for (bi, w) in wl:
        bn = cloth_bones[bi]
        r = src_bone_to_region.get(bn)
        if r and r != 'unknown':
            score[r] = score.get(r, 0) + w
    if not score: return None
    return max(score.items(), key=lambda x: x[1])[0]

# --- compute region bboxes in WORLD space (voxel_size のスケール差を吸収するため) ---
def region_bboxes_world(regions, grid):
    out = {}
    vs = grid['voxel_size']; ox, oy, oz = grid['grid_origin']
    for rn, s in regions.items():
        if not s: continue
        wxs = [ox + (x+0.5)*vs for (x,y,z) in s]
        wys = [oy + (y+0.5)*vs for (x,y,z) in s]
        wzs = [oz + (z+0.5)*vs for (x,y,z) in s]
        out[rn] = (min(wxs), min(wys), min(wzs), max(wxs), max(wys), max(wzs))
    return out
src_bbox_w = region_bboxes_world(src_regions, src_grid)
tgt_bbox_w = region_bboxes_world(tgt_regions, tgt_grid)

# --- build src body set + tgt body set + tgt region lookup-by-t ---
src_body_set = set(src_vox2region.keys())
tgt_body_set = set(tgt_vox2region.keys())

# build tgt region voxels list (for efficient t-lookup)
tgt_region_vlist = {rn: list(s) for rn, s in tgt_regions.items()}

# --- bone name mapping (SRC → TGT) ---
# 共通 ARP 命名が多数だが、DE と QM で異なる点:
#   DE: breast.l, butt.l, foot.l, nipple.l  (dot 区切り)
#   QM: breast_l, butt_l, foot_l, nipple_l  (underscore)
#   DE: c_thigh_twist_2.l, c_arm_twist_2.l  (副ツイスト)
#   QM: c_thigh_twist.l のみ (副ツイストなし)
SRC_TO_TGT_BONE = {
    'breast.l': 'breast_l', 'breast.r': 'breast_r',
    'butt.l': 'butt_l',     'butt.r': 'butt_r',
    'foot.l': 'foot_l',     'foot.r': 'foot_r',
    'nipple.l': 'nipple_l', 'nipple.r': 'nipple_r',
    'c_thigh_twist_2.l': 'c_thigh_twist.l',
    'c_thigh_twist_2.r': 'c_thigh_twist.r',
    'c_arm_twist_2.l': 'c_arm_twist.l',
    'c_arm_twist_2.r': 'c_arm_twist.r',
    'c_forearm_twist_2.l': 'c_forearm_twist.l',
    'c_forearm_twist_2.r': 'c_forearm_twist.r',
    'c_leg_twist_2.l': 'c_leg_twist.l',
    'c_leg_twist_2.r': 'c_leg_twist.r',
    # vagina naming
    'vagina_01_l': 'vagina_01.l', 'vagina_01_r': 'vagina_01.r',
    'vagina_02_l': 'vagina_02.l', 'vagina_02_r': 'vagina_02.r',
    # Rigify (Helena) → ARP (QM) mapping
    'DEF-spine':       'c_root_bend.x',
    'DEF-spine.001':   'c_spine_01_bend.x',
    'DEF-spine.002':   'c_spine_02_bend.x',
    'DEF-spine.003':   'c_spine_03_bend.x',
    'DEF-spine.004':   'neck.x',
    'DEF-spine.005':   'neck.x',
    'DEF-spine.006':   'head.x',
    'DEF-neck':        'neck.x',
    'DEF-head':        'head.x',
    'DEF-breast.L':    'breast_l',
    'DEF-breast.R':    'breast_r',
    'DEF-shoulder.L':  'shoulder.l',
    'DEF-shoulder.R':  'shoulder.r',
    'DEF-upper_arm.L':     'c_arm_stretch.l',
    'DEF-upper_arm.L.001': 'c_arm_stretch.l',
    'DEF-upper_arm.R':     'c_arm_stretch.r',
    'DEF-upper_arm.R.001': 'c_arm_stretch.r',
    'DEF-forearm.L':       'c_forearm_stretch.l',
    'DEF-forearm.L.001':   'c_forearm_stretch.l',
    'DEF-forearm.R':       'c_forearm_stretch.r',
    'DEF-forearm.R.001':   'c_forearm_stretch.r',
    'DEF-hand.L':      'hand.l',
    'DEF-hand.R':      'hand.r',
    'DEF-thigh.L':         'c_thigh_stretch.l',
    'DEF-thigh.L.001':     'c_thigh_stretch.l',
    'DEF-thigh.R':         'c_thigh_stretch.r',
    'DEF-thigh.R.001':     'c_thigh_stretch.r',
    'DEF-shin.L':          'c_leg_stretch.l',
    'DEF-shin.L.001':      'c_leg_stretch.l',
    'DEF-shin.R':          'c_leg_stretch.r',
    'DEF-shin.R.001':      'c_leg_stretch.r',
    'DEF-foot.L':      'foot.l',
    'DEF-foot.R':      'foot.r',
    'DEF-toe.L':       'c_toes_middle1.l',
    'DEF-toe.R':       'c_toes_middle1.r',
    'DEF-pelvis.L':    'c_root_bend.x',
    'DEF-pelvis.R':    'c_root_bend.x',
}

# DE/QM 固有の揺れボーン (hair_ponytail / hair_braid / beltcape / armor_cape 等) は
# ターゲット側に存在しないので、fallback として親部位のボーンを使う。
# パターン: ボーン名 prefix → fallback bone name
FALLBACK_BONE_BY_PATTERN = [
    ('hair_ponytail', 'head.x'),
    ('hair_braid',    'head.x'),
    ('armor_cape',    'c_spine_03_bend.x'),
    ('beltcape',      'c_spine_01_bend.x'),
    ('armor_belt',    'c_spine_01_bend.x'),
    ('dress_front',   'c_spine_01_bend.x'),
    ('dress_back',    'c_spine_01_bend.x'),
    ('belt_tail',     'c_spine_01_bend.x'),
    ('Necklace',      'c_spine_03_bend.x'),
]
import re as _re
def _bone_side(name):
    m = _re.search(r'\.([lr])(?:\.|$)|_([lr])$', name)
    return (m.group(1) or m.group(2)) if m else None

def _side_from_rigify(name):
    """Rigify .L / .R → l / r"""
    if name.endswith('.L') or '.L.' in name: return 'l'
    if name.endswith('.R') or '.R.' in name: return 'r'
    return None

def map_bone_with_fallback(src_name, tgt_bone_pos):
    """SRC_TO_TGT_BONE 優先 → 同名 → pattern fallback → side-aware fallback"""
    mapped = SRC_TO_TGT_BONE.get(src_name, src_name)
    if mapped in tgt_bone_pos: return mapped
    # Rigify DEF- prefix 付きボーンの追加 fallback
    if src_name.startswith('DEF-'):
        s = _side_from_rigify(src_name) or _bone_side(src_name)
        low = src_name.lower()
        # finger bones → hand
        if any(f in low for f in ('f_index', 'f_middle', 'f_ring', 'f_pinky', 'thumb', 'palm')) and s:
            for cand in (f'hand.{s}', f'hand_{s}'):
                if cand in tgt_bone_pos: return cand
        # forehead/temple/eye/jaw/lips 等 face bones → head.x
        if any(f in low for f in ('forehead', 'temple', 'cheek', 'jaw', 'lid.', 'lip.',
                                   'brow.', 'eye.', 'eye_', 'nose.', 'nose_', 'ear.', 'tongue',
                                   'teeth', 'chin')):
            if 'head.x' in tgt_bone_pos: return 'head.x'
        # spine fallback
        if 'spine' in low:
            if 'c_spine_01_bend.x' in tgt_bone_pos: return 'c_spine_01_bend.x'
        # hand / forearm / upper_arm generic
        for key, cand_base in (('upper_arm', 'c_arm_stretch'), ('forearm', 'c_forearm_stretch'),
                                 ('shoulder', 'shoulder'), ('hand', 'hand'),
                                 ('thigh', 'c_thigh_stretch'), ('shin', 'c_leg_stretch'),
                                 ('foot', 'foot'), ('toe', 'c_toes_middle1')):
            if key in low and s:
                for cand in (f'{cand_base}.{s}', f'{cand_base}_{s}'):
                    if cand in tgt_bone_pos: return cand
    # DE toe bone (c_toes_thumb1_base.l, toes_*_def.l 等) → QM toe bone (c_toes_thumb1.l 等) または foot
    if 'toes' in src_name or src_name.startswith('c_toes'):
        s = _bone_side(src_name)
        # DE: c_toes_thumb1_base.l → QM: c_toes_thumb1.l (末尾 _base や _def を除去して同名検索)
        simplified = src_name.replace('_base', '').replace('_def', '')
        if simplified in tgt_bone_pos: return simplified
        # foot に fallback
        for cand in (f'foot.{s}', f'foot_{s}'):
            if cand in tgt_bone_pos: return cand
    # finger → hand
    if any(f in src_name for f in ('thumb', 'index', 'middle', 'ring', 'pinky')) and 'toes' not in src_name:
        s = _bone_side(src_name)
        for cand in (f'hand.{s}', f'hand_{s}'):
            if cand in tgt_bone_pos: return cand
    for (pat, fb) in FALLBACK_BONE_BY_PATTERN:
        if pat in src_name and fb in tgt_bone_pos: return fb
    return None

# --- retarget loop ---
retargeted = {}   # (tx, ty, tz) -> (colorIndex, [[bone_name, w], ...])
failed_no_src_body = 0
failed_oob = 0
moved = 0

SEARCH_R = 40  # region 制限時は広めに検索 (衣装から体まで遠い場合もある)

# region ごとに yz 空間ハッシュ
sb_by_region_yz = {}  # region -> {(y,z): [x, ...]}
for (x, y, z), r in src_vox2region.items():
    sb_by_region_yz.setdefault(r, {}).setdefault((y, z), []).append(x)

def nearest_src_body_in_region(vx, vy, vz, region):
    """region 内の最寄り src body voxel を返す。region=None の場合は全 region 検索"""
    best = None; best_d2 = 1e18
    if region and region in sb_by_region_yz:
        yz_map = sb_by_region_yz[region]
    else:
        yz_map = None
    if yz_map is not None:
        for dy in range(-SEARCH_R, SEARCH_R + 1):
            for dz in range(-SEARCH_R, SEARCH_R + 1):
                xs = yz_map.get((vy + dy, vz + dz))
                if not xs: continue
                for bx in xs:
                    dx = bx - vx
                    d2 = dx*dx + dy*dy + dz*dz
                    if d2 < best_d2:
                        best_d2 = d2; best = (bx, vy+dy, vz+dz)
    else:
        # fallback: 全 body 検索
        for dy in range(-SEARCH_R, SEARCH_R + 1):
            for dz in range(-SEARCH_R, SEARCH_R + 1):
                for r, yz_map in sb_by_region_yz.items():
                    xs = yz_map.get((vy + dy, vz + dz))
                    if not xs: continue
                    for bx in xs:
                        dx = bx - vx
                        d2 = dx*dx + dy*dy + dz*dz
                        if d2 < best_d2:
                            best_d2 = d2; best = (bx, vy+dy, vz+dz)
    return best

# tgt region voxel を (tx, ty, tz) 空間で検索
def find_tgt_body_at_t(region, t_yz, t_x):
    """TGT region 内で voxel の x/y/z 正規化座標 (tx, ty, tz) に最も近い tgt body voxel を返す"""
    if region not in tgt_bbox: return None
    bb = tgt_bbox[region]
    tx = bb[0] + t_x * (bb[3] - bb[0])
    ty = bb[1] + t_yz[0] * (bb[4] - bb[1])
    tz = bb[2] + t_yz[1] * (bb[5] - bb[2])
    # 最寄り body voxel (region内)
    best = None; best_d2 = 1e18
    for (x, y, z) in tgt_region_vlist[region]:
        dx = x - tx; dy = y - ty; dz = z - tz
        d2 = dx*dx + dy*dy + dz*dz
        if d2 < best_d2:
            best_d2 = d2; best = (x, y, z)
    return best

print("\n  Retargeting (bone-anchor offset + region bbox scale)...")
# 各 voxel について:
# 1. region と bone anchor を決定
# 2. offset_de = voxel_world - anchor_de
# 3. scale factor = QM_region_bbox_size / DE_region_bbox_size (per axis)
# 4. retargeted = anchor_qm + scale * offset_de

# region ごとのスケール係数 (QM/DE region bbox の各軸比)
region_scale = {}
for r in src_bbox_w:
    if r not in tgt_bbox_w: continue
    sbb = src_bbox_w[r]; tbb = tgt_bbox_w[r]
    sx_ = max(1e-6, sbb[3] - sbb[0]); tx_ = max(1e-6, tbb[3] - tbb[0])
    sy_ = max(1e-6, sbb[4] - sbb[1]); ty_ = max(1e-6, tbb[4] - tbb[1])
    sz_ = max(1e-6, sbb[5] - sbb[2]); tz_ = max(1e-6, tbb[5] - tbb[2])
    # スケール無し: DE のサイズをそのまま保持し、位置のみ移動 (形完全保持)
    region_scale[r] = (1.0, 1.0, 1.0)
print(f"  region scales (QM/DE):")
for r, s in sorted(region_scale.items()):
    print(f"    {r}: X={s[0]:.2f} Y={s[1]:.2f} Z={s[2]:.2f}")

region_hits = {}
failed_no_region = 0
failed_no_anchor = 0

for (v, wl) in zip(cloth_voxels, cloth_weights):
    vx, vy, vz, vci = v

    # 1. region (body region が無い場合は 'unknown' のまま bone anchor で処理する)
    region = cloth_voxel_region(wl) or 'unknown'
    region_hits[region] = region_hits.get(region, 0) + 1
    scale = region_scale.get(region, (1.0, 1.0, 1.0))  # unknown はスケール 1

    # 2. weight で加重平均したボーンアンカーを DE / QM で計算
    wt_sum = 0.0
    de_ax = de_ay = de_az = 0.0
    qm_ax = qm_ay = qm_az = 0.0
    for (bi, w) in wl:
        src_name = cloth_bones[bi]
        de_p = src_bone_pos.get(src_name)
        if de_p is None: continue
        tgt_name = map_bone_with_fallback(src_name, tgt_bone_pos)
        if tgt_name is None: continue
        qm_p = tgt_bone_pos.get(tgt_name)
        if qm_p is None: continue
        wt_sum += w
        de_ax += de_p[0] * w; de_ay += de_p[1] * w; de_az += de_p[2] * w
        qm_ax += qm_p[0] * w; qm_ay += qm_p[1] * w; qm_az += qm_p[2] * w
    if wt_sum < 1e-6:
        failed_no_anchor += 1; continue
    de_ax /= wt_sum; de_ay /= wt_sum; de_az /= wt_sum
    qm_ax /= wt_sum; qm_ay /= wt_sum; qm_az /= wt_sum

    # 3. 衣装 voxel の world 座標 (DE)
    vw = src_world(vx, vy, vz)
    # 4. DE anchor からのオフセット
    ox_ = vw[0] - de_ax; oy_ = vw[1] - de_ay; oz_ = vw[2] - de_az
    # 5. スケール適用 + QM anchor に加算
    qwx = qm_ax + ox_ * scale[0]
    qwy = qm_ay + oy_ * scale[1]
    qwz = qm_az + oz_ * scale[2]

    # 6. QM voxel 座標へ
    tx = int(round((qwx - tgt_origin[0]) / tgt_vs - 0.5))
    ty = int(round((qwy - tgt_origin[1]) / tgt_vs - 0.5))
    tz = int(round((qwz - tgt_origin[2]) / tgt_vs - 0.5))
    if tx < 0 or tx >= tgt_grid['gx'] or ty < 0 or ty >= tgt_grid['gy'] or tz < 0 or tz >= tgt_grid['gz']:
        failed_oob += 1; continue
    key = (tx, ty, tz)
    if key not in retargeted:
        new_wl = []
        for (bi, w) in wl:
            src_name = cloth_bones[bi]
            tgt_name = map_bone_with_fallback(src_name, tgt_bone_pos) or src_name
            new_wl.append([tgt_name, w])
        retargeted[key] = (vci, new_wl)
        moved += 1

print(f"  retargeted: {moved} voxels")
print(f"  failed (no anchor / unmapped bones): {failed_no_anchor}")
print(f"  failed (out of bounds): {failed_oob}")
print(f"  region distribution:")
for r, c in sorted(region_hits.items(), key=lambda x: -x[1]):
    print(f"    {r}: {c}")

# --- collapse bones: voxel ごとの [bone_name, w] を全体 bones 配列 + local index に変換 ---
all_bones = []; bone_idx = {}
for (key, (ci, wl)) in retargeted.items():
    for (bn, _) in wl:
        if bn not in bone_idx:
            bone_idx[bn] = len(all_bones); all_bones.append(bn)

# --- output ---
sorted_keys = sorted(retargeted.keys())
new_voxels = [(k[0], k[1], k[2], retargeted[k][0]) for k in sorted_keys]
new_weights = []
for k in sorted_keys:
    wl = retargeted[k][1]
    new_weights.append([[bone_idx[bn], w] for (bn, w) in wl])

out_vox = os.path.join(TGT_DIR, f"{OUT_PREFIX}.vox")
out_w = os.path.join(TGT_DIR, f"{OUT_PREFIX}.weights.json")
write_vox(out_vox, tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz'], new_voxels, cloth_pal)
with open(out_w, 'w', encoding='utf-8') as f:
    json.dump({
        'mesh': cloth_w.get('mesh', '') + f' (retargeted from {SRC_DIR})',
        'bones': all_bones,
        'voxel_count': len(new_voxels),
        'weights': new_weights,
    }, f, ensure_ascii=False, indent=0)
print(f"\n  -> {out_vox}: {len(new_voxels)} voxels")
print(f"  -> {out_w}: {len(all_bones)} unique bones")
