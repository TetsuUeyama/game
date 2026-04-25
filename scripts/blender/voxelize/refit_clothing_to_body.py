"""DE 衣装を QM body 形状にフィット: body 表面 voxel 対応による voxel 単位 refit。

原理:
  1. 両キャラの body 表面 voxel を region ごとにグルーピング
  2. region bbox の正規化座標 (t) で DE surface ↔ QM surface の対応を establish
  3. 各 DE 衣装 voxel について:
     a. 最寄り DE body surface voxel B_de を探す
     b. B_de の局所外向き法線で衣装→body 距離 offset を計算
     c. B_de → B_qm 対応を使って QM body 表面に移動
     d. 移動先の法線方向に同じ offset を取って配置
  4. 結果として衣装は QM body 形状 (胸の膨らみ) に沿って配置される

入力: DE/QM それぞれに body.vox + grid.json + regions/region_*.vox が生成済み

Usage:
  python refit_clothing_to_body.py <src_dir> <src_prefix> <tgt_dir> <out_prefix>

例:
  python refit_clothing_to_body.py \
    public/box5/darkelfblader armor_suit_bra \
    public/box5/qm_mustardui de_armor_suit_bra
"""
import sys, os, json, struct, math

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

# --- load clothing ---
cloth_voxels, _, _, _, cloth_pal = parse_vox(os.path.join(SRC_DIR, f"{SRC_PREFIX}.vox"))
with open(os.path.join(SRC_DIR, f"{SRC_PREFIX}.weights.json"), encoding='utf-8') as f:
    cloth_w = json.load(f)
cloth_weights = cloth_w['weights']; cloth_bones = cloth_w['bones']

# --- load body.vox (src/tgt) ---
src_body_vox, _, _, _, _ = parse_vox(os.path.join(SRC_DIR, 'body.vox'))
tgt_body_vox, _, _, _, _ = parse_vox(os.path.join(TGT_DIR, 'body.vox'))
src_body_set = set((x, y, z) for (x, y, z, _) in src_body_vox)
tgt_body_set = set((x, y, z) for (x, y, z, _) in tgt_body_vox)

# --- load regions for both ---
def load_regions(dir_path):
    out = {}
    for fn in os.listdir(dir_path):
        if not (fn.startswith('region_') and fn.endswith('.vox')): continue
        rn = fn[len('region_'):-len('.vox')]
        vs, _, _, _, _ = parse_vox(os.path.join(dir_path, fn))
        out[rn] = [(x, y, z) for (x, y, z, _) in vs]
    return out
src_regions = load_regions(os.path.join(SRC_DIR, 'regions'))
tgt_regions = load_regions(os.path.join(TGT_DIR, 'regions'))

# --- compute surface normals (local outward) per body ---
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
def compute_surface_normals(body_set):
    sn = {}
    for (x, y, z) in body_set:
        ux = uy = uz = 0.0; empty = 0
        for (dx, dy, dz) in DIRS6:
            if (x+dx, y+dy, z+dz) not in body_set:
                ux += dx; uy += dy; uz += dz; empty += 1
        if empty == 0: continue
        length = math.sqrt(ux*ux + uy*uy + uz*uz)
        if length < 0.1:
            sn[(x, y, z)] = (0.0, 0.0, 1.0)
        else:
            sn[(x, y, z)] = (ux/length, uy/length, uz/length)
    return sn
src_surf = compute_surface_normals(src_body_set)
tgt_surf = compute_surface_normals(tgt_body_set)
print(f"  src body surface: {len(src_surf)} voxels")
print(f"  tgt body surface: {len(tgt_surf)} voxels")

# --- build DE surface → region + t (normalized within region bbox) ---
# region 内の body surface voxel のみ使う
def bbox_of(voxel_list):
    if not voxel_list: return None
    xs = [p[0] for p in voxel_list]; ys = [p[1] for p in voxel_list]; zs = [p[2] for p in voxel_list]
    return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))

src_region_bbox = {r: bbox_of(v) for r, v in src_regions.items()}
tgt_region_bbox = {r: bbox_of(v) for r, v in tgt_regions.items()}

# 各 region の body surface voxel だけ抽出 (tgt の対応検索用)
tgt_surf_by_region = {}
for (pos, r) in ((p, r) for r in tgt_regions for p in tgt_regions[r]):
    if pos in tgt_surf:
        tgt_surf_by_region.setdefault(r, []).append(pos)
print(f"  tgt surface per region: {[(r, len(v)) for r, v in tgt_surf_by_region.items()]}")

# --- DE→QM surface correspondence lookup ---
def tgt_surface_from_t(region, t_norm):
    """region 内の tgt surface voxel で正規化座標 t_norm = (tx, ty, tz) に最も近いものを返す"""
    if region not in tgt_region_bbox or region not in tgt_surf_by_region: return None
    tbb = tgt_region_bbox[region]
    target_x = tbb[0] + t_norm[0] * (tbb[3] - tbb[0])
    target_y = tbb[1] + t_norm[1] * (tbb[4] - tbb[1])
    target_z = tbb[2] + t_norm[2] * (tbb[5] - tbb[2])
    best = None; best_d2 = 1e18
    for (x, y, z) in tgt_surf_by_region[region]:
        dx = x - target_x; dy = y - target_y; dz = z - target_z
        d2 = dx*dx + dy*dy + dz*dz
        if d2 < best_d2: best_d2 = d2; best = (x, y, z)
    return best

# --- src body voxel → region lookup ---
src_vox_region = {}
for (r, vs) in src_regions.items():
    for v in vs: src_vox_region[v] = r

# --- bone_map for region classification (for voxels with bone weights) ---
SRC_BONE_MAP_PATH = os.path.join(SRC_DIR, 'bone_map.json')
src_bone_to_region = {}
if os.path.exists(SRC_BONE_MAP_PATH):
    with open(SRC_BONE_MAP_PATH, encoding='utf-8') as f:
        src_bone_to_region = json.load(f).get('bone_map', {})

def cloth_voxel_region(wl):
    score = {}
    for (bi, w) in wl:
        bn = cloth_bones[bi]
        r = src_bone_to_region.get(bn)
        if r and r != 'unknown':
            score[r] = score.get(r, 0) + w
    if not score: return None
    return max(score.items(), key=lambda x: x[1])[0]

# --- bone name mapping (SRC → TGT) ---
SRC_TO_TGT_BONE = {
    'breast.l': 'breast_l', 'breast.r': 'breast_r',
    'butt.l': 'butt_l', 'butt.r': 'butt_r',
    'foot.l': 'foot_l', 'foot.r': 'foot_r',
    'nipple.l': 'nipple_l', 'nipple.r': 'nipple_r',
    'c_thigh_twist_2.l': 'c_thigh_twist.l', 'c_thigh_twist_2.r': 'c_thigh_twist.r',
    'c_arm_twist_2.l': 'c_arm_twist.l', 'c_arm_twist_2.r': 'c_arm_twist.r',
    'c_forearm_twist_2.l': 'c_forearm_twist.l', 'c_forearm_twist_2.r': 'c_forearm_twist.r',
    'c_leg_twist_2.l': 'c_leg_twist.l', 'c_leg_twist_2.r': 'c_leg_twist.r',
    'vagina_01_l': 'vagina_01.l', 'vagina_01_r': 'vagina_01.r',
    'vagina_02_l': 'vagina_02.l', 'vagina_02_r': 'vagina_02.r',
}

# --- src surface voxel for nearest-surface lookup per region ---
src_surf_by_region = {}
for (r, vs) in src_regions.items():
    for v in vs:
        if v in src_surf:
            src_surf_by_region.setdefault(r, []).append(v)

def nearest_src_surface_in_region(x, y, z, region):
    """region 内の最寄り src surface voxel を返す"""
    if region not in src_surf_by_region: return None
    best = None; best_d2 = 1e18
    for (sx_, sy_, sz_) in src_surf_by_region[region]:
        dx = sx_ - x; dy = sy_ - y; dz = sz_ - z
        d2 = dx*dx + dy*dy + dz*dz
        if d2 < best_d2: best_d2 = d2; best = (sx_, sy_, sz_)
    return best

# --- refit loop ---
print(f"\n  Refitting {len(cloth_voxels)} clothing voxels...")
retargeted = {}
no_region = 0
no_surface = 0
no_correspondence = 0
oob = 0
placed = 0

for (v, wl) in zip(cloth_voxels, cloth_weights):
    vx, vy, vz, vci = v
    region = cloth_voxel_region(wl)
    if region is None or region not in src_region_bbox or region not in tgt_region_bbox:
        no_region += 1; continue

    # 1. 最寄り src body surface voxel
    nb = nearest_src_surface_in_region(vx, vy, vz, region)
    if nb is None: no_surface += 1; continue

    # 2. nb の局所法線
    nb_n = src_surf[nb]

    # 3. 衣装 voxel から body 表面までのオフセット (world 単位)
    def src_world(x, y, z): return (src_origin[0] + (x+0.5)*src_vs,
                                     src_origin[1] + (y+0.5)*src_vs,
                                     src_origin[2] + (z+0.5)*src_vs)
    vw = src_world(vx, vy, vz)
    nbw = src_world(*nb)
    offset_world = (vw[0]-nbw[0], vw[1]-nbw[1], vw[2]-nbw[2])
    # 法線方向成分 (正ならば body 外側、負ならば body 内側)
    off_n = offset_world[0]*nb_n[0] + offset_world[1]*nb_n[1] + offset_world[2]*nb_n[2]
    # 法線と垂直な成分 (body 表面を滑る成分)
    off_tangent = (offset_world[0] - nb_n[0]*off_n,
                   offset_world[1] - nb_n[1]*off_n,
                   offset_world[2] - nb_n[2]*off_n)

    # 4. DE→QM surface 対応: nb の region 内正規化 t を tgt に適用
    sbb = src_region_bbox[region]
    sxr = max(1e-6, sbb[3]-sbb[0]); syr = max(1e-6, sbb[4]-sbb[1]); szr = max(1e-6, sbb[5]-sbb[2])
    t_norm = ((nb[0]-sbb[0])/sxr, (nb[1]-sbb[1])/syr, (nb[2]-sbb[2])/szr)
    tb = tgt_surface_from_t(region, t_norm)
    if tb is None: no_correspondence += 1; continue
    tb_n = tgt_surf[tb]  # tgt 表面の法線

    # 5. QM body world 座標
    def tgt_world(x, y, z): return (tgt_origin[0] + (x+0.5)*tgt_vs,
                                     tgt_origin[1] + (y+0.5)*tgt_vs,
                                     tgt_origin[2] + (z+0.5)*tgt_vs)
    tbw = tgt_world(*tb)
    # 6. target = tb + tb の法線方向に off_n (法線距離保持) + tangent (そのまま)
    qwx = tbw[0] + tb_n[0]*off_n + off_tangent[0]
    qwy = tbw[1] + tb_n[1]*off_n + off_tangent[1]
    qwz = tbw[2] + tb_n[2]*off_n + off_tangent[2]
    # 7. QM voxel 座標
    tx = int(round((qwx - tgt_origin[0]) / tgt_vs - 0.5))
    ty = int(round((qwy - tgt_origin[1]) / tgt_vs - 0.5))
    tz = int(round((qwz - tgt_origin[2]) / tgt_vs - 0.5))
    if tx < 0 or tx >= tgt_grid['gx'] or ty < 0 or ty >= tgt_grid['gy'] or tz < 0 or tz >= tgt_grid['gz']:
        oob += 1; continue
    key = (tx, ty, tz)
    if key not in retargeted:
        new_wl = [[SRC_TO_TGT_BONE.get(cloth_bones[bi], cloth_bones[bi]), w] for (bi, w) in wl]
        retargeted[key] = (vci, new_wl)
        placed += 1

print(f"  placed: {placed}")
print(f"  no region: {no_region}")
print(f"  no src surface: {no_surface}")
print(f"  no tgt correspondence: {no_correspondence}")
print(f"  oob: {oob}")
print(f"  collisions (silent): {len(cloth_voxels) - placed - no_region - no_surface - no_correspondence - oob}")

# --- output: collapse bones to global bones[] ---
all_bones = []; bone_idx = {}
for (ci, wl) in retargeted.values():
    for (bn, _) in wl:
        if bn not in bone_idx: bone_idx[bn] = len(all_bones); all_bones.append(bn)

sorted_keys = sorted(retargeted.keys())
new_voxels = [(k[0], k[1], k[2], retargeted[k][0]) for k in sorted_keys]
new_weights = [[[bone_idx[bn], w] for (bn, w) in retargeted[k][1]] for k in sorted_keys]

out_vox = os.path.join(TGT_DIR, f"{OUT_PREFIX}.vox")
out_w = os.path.join(TGT_DIR, f"{OUT_PREFIX}.weights.json")
write_vox(out_vox, tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz'], new_voxels, cloth_pal)
with open(out_w, 'w', encoding='utf-8') as f:
    json.dump({
        'mesh': cloth_w.get('mesh', '') + f' (refit from {SRC_DIR})',
        'bones': all_bones,
        'voxel_count': len(new_voxels),
        'weights': new_weights,
    }, f, ensure_ascii=False, indent=0)
print(f"\n  -> {out_vox}: {len(new_voxels)} voxels")
print(f"  -> {out_w}: {len(all_bones)} unique bones")
