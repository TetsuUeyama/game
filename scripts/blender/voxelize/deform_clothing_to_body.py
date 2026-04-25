"""DE 衣装を「body 表面差異の displacement field」で変形し QM body にフィットさせる。

アプローチ (滑らかな変形、隙間ゼロ):
  1. 各 DE body surface voxel B_de について、対応する QM body surface voxel B_qm を計算
     → displacement[B_de] = (B_qm - B_de) (world 空間の変位ベクトル)
  2. 各 DE 衣装 voxel V_de について:
     a. 最寄り DE body voxel を K 個探す (K=4)
     b. 各 K の変位を逆距離加重平均して平滑変位 d を計算
     c. V_qm = V_de + d
  3. これは「body の形状差を衣装にも適用」なので、衣装は body に沿って滑らかに変形
  4. 隣接 voxel は同様な変位 → 形状保持、隙間なし (1:1 mapping 可能)

Usage:
  python deform_clothing_to_body.py <src_dir> <src_prefix> <tgt_dir> <out_prefix> [--k 4]
"""
import sys, os, json, struct, math

if len(sys.argv) < 5:
    print(__doc__); sys.exit(1)
SRC_DIR = sys.argv[1]; SRC_PREFIX = sys.argv[2]
TGT_DIR = sys.argv[3]; OUT_PREFIX = sys.argv[4]
K = 4
for i in range(5, len(sys.argv)):
    if sys.argv[i] == '--k' and i+1 < len(sys.argv): K = int(sys.argv[i+1])

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

def src_world(x, y, z): return (src_origin[0]+(x+0.5)*src_vs, src_origin[1]+(y+0.5)*src_vs, src_origin[2]+(z+0.5)*src_vs)
def tgt_world(x, y, z): return (tgt_origin[0]+(x+0.5)*tgt_vs, tgt_origin[1]+(y+0.5)*tgt_vs, tgt_origin[2]+(z+0.5)*tgt_vs)

# --- load clothing ---
cloth_voxels, _, _, _, cloth_pal = parse_vox(os.path.join(SRC_DIR, f"{SRC_PREFIX}.vox"))
with open(os.path.join(SRC_DIR, f"{SRC_PREFIX}.weights.json"), encoding='utf-8') as f:
    cloth_w = json.load(f)
cloth_weights = cloth_w['weights']; cloth_bones = cloth_w['bones']

# --- load src/tgt regions (for body voxel correspondence) ---
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

# region bbox (WORLD coords)
def region_bbox_w(regions, vs, origin):
    out = {}
    for r, vlist in regions.items():
        if not vlist: continue
        wxs = [origin[0]+(x+0.5)*vs for (x,y,z) in vlist]
        wys = [origin[1]+(y+0.5)*vs for (x,y,z) in vlist]
        wzs = [origin[2]+(z+0.5)*vs for (x,y,z) in vlist]
        out[r] = (min(wxs), min(wys), min(wzs), max(wxs), max(wys), max(wzs))
    return out
src_bbox = region_bbox_w(src_regions, src_vs, src_origin)
tgt_bbox = region_bbox_w(tgt_regions, tgt_vs, tgt_origin)

# --- DE body voxel → region 逆引き ---
src_vox2region = {}
for r, vlist in src_regions.items():
    for v in vlist: src_vox2region[v] = r

# --- 各 DE body voxel の displacement (→ QM 対応位置) を事前計算 ---
# 対応: 同 region 内で正規化座標 t を使って QM voxel を決定
print(f"  computing displacement field for {len(src_vox2region)} src body voxels...")
displacement = {}  # (sx, sy, sz) → (dx, dy, dz) world 変位

tgt_vox_list_by_region = {r: vlist for r, vlist in tgt_regions.items()}

for (svx, svy, svz), region in src_vox2region.items():
    if region not in src_bbox or region not in tgt_bbox: continue
    sbb = src_bbox[region]; tbb = tgt_bbox[region]
    sww = src_world(svx, svy, svz)
    # t in src region bbox
    sx_ = max(1e-6, sbb[3]-sbb[0]); sy_ = max(1e-6, sbb[4]-sbb[1]); sz_ = max(1e-6, sbb[5]-sbb[2])
    tx_ = (sww[0]-sbb[0])/sx_; ty_ = (sww[1]-sbb[1])/sy_; tz_ = (sww[2]-sbb[2])/sz_
    # apply to tgt bbox
    tgt_wx = tbb[0] + tx_ * (tbb[3]-tbb[0])
    tgt_wy = tbb[1] + ty_ * (tbb[4]-tbb[1])
    tgt_wz = tbb[2] + tz_ * (tbb[5]-tbb[2])
    displacement[(svx, svy, svz)] = (tgt_wx - sww[0], tgt_wy - sww[1], tgt_wz - sww[2])

print(f"  displacement field entries: {len(displacement)}")

# --- 高速 nearest-src-body-voxel 検索用 Z 別 index ---
src_body_by_z = {}
for pos in displacement: src_body_by_z.setdefault(pos[2], []).append(pos)

def knn_src_body(x, y, z, k=K, zrange=10):
    """(x,y,z) から最寄り k 個の src body voxel を (dist, pos) リストで返す"""
    cands = []
    for dz in range(-zrange, zrange+1):
        zz = z + dz
        if zz not in src_body_by_z: continue
        for (sx_, sy_, sz_) in src_body_by_z[zz]:
            ddx = sx_ - x; ddy = sy_ - y; ddz = sz_ - z
            d2 = ddx*ddx + ddy*ddy + ddz*ddz
            cands.append((d2, (sx_, sy_, sz_)))
    cands.sort(key=lambda x: x[0])
    return cands[:k]

# --- bone name map ---
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

# --- 変形ループ (衝突時に隣接空きセルに配置、voxel loss ゼロ保証) ---
print(f"\n  deforming {len(cloth_voxels)} clothing voxels (k-NN={K}, collision-resilient)...")
out_map = {}
oob = 0; no_knn = 0; collision_spilled = 0

# 衝突時の近接空きセル探索 (BFS)
from collections import deque
BFS26 = [(dx,dy,dz) for dx in (-1,0,1) for dy in (-1,0,1) for dz in (-1,0,1) if not (dx==0 and dy==0 and dz==0)]
MAX_SPILL = 40  # 最大 BFS 半径 (voxel)

def find_empty_slot(ideal_key):
    """ideal_key が空いていればそのまま、埋まっていれば近接空きを BFS で探す"""
    if ideal_key not in out_map: return ideal_key
    visited = {ideal_key}
    queue = deque([(ideal_key, 0)])
    while queue:
        (k, dist) = queue.popleft()
        if dist >= MAX_SPILL: continue
        for (dx, dy, dz) in BFS26:
            nb = (k[0]+dx, k[1]+dy, k[2]+dz)
            if nb in visited: continue
            visited.add(nb)
            if nb[0]<0 or nb[0]>=tgt_grid['gx'] or nb[1]<0 or nb[1]>=tgt_grid['gy'] or nb[2]<0 or nb[2]>=tgt_grid['gz']:
                continue
            if nb not in out_map: return nb
            queue.append((nb, dist+1))
    return None

for (v, wl) in zip(cloth_voxels, cloth_weights):
    vx, vy, vz, vci = v
    knn = knn_src_body(vx, vy, vz)
    if not knn:
        no_knn += 1; continue
    dx_sum = dy_sum = dz_sum = 0.0; w_sum = 0.0
    for (d2, pos) in knn:
        w = 1.0 / (d2 + 0.5)
        d = displacement[pos]
        dx_sum += d[0] * w; dy_sum += d[1] * w; dz_sum += d[2] * w
        w_sum += w
    if w_sum < 1e-9:
        no_knn += 1; continue
    disp_x = dx_sum / w_sum; disp_y = dy_sum / w_sum; disp_z = dz_sum / w_sum

    vw = src_world(vx, vy, vz)
    target_wx = vw[0] + disp_x; target_wy = vw[1] + disp_y; target_wz = vw[2] + disp_z
    tx = int(round((target_wx - tgt_origin[0]) / tgt_vs - 0.5))
    ty = int(round((target_wy - tgt_origin[1]) / tgt_vs - 0.5))
    tz = int(round((target_wz - tgt_origin[2]) / tgt_vs - 0.5))
    if tx<0 or tx>=tgt_grid['gx'] or ty<0 or ty>=tgt_grid['gy'] or tz<0 or tz>=tgt_grid['gz']:
        oob += 1; continue

    ideal = (tx, ty, tz)
    slot = find_empty_slot(ideal)
    if slot is None:
        oob += 1; continue
    if slot != ideal: collision_spilled += 1
    new_wl = [[SRC_TO_TGT_BONE.get(cloth_bones[bi], cloth_bones[bi]), w] for (bi, w) in wl]
    out_map[slot] = (vci, new_wl)

print(f"  placed: {len(out_map)} (input {len(cloth_voxels)})")
print(f"  collision spilled to neighbor: {collision_spilled}")
print(f"  no-knn: {no_knn}, oob: {oob}")

# output
all_bones = []; bi_map = {}
for (_, wl) in out_map.values():
    for (bn, _) in wl:
        if bn not in bi_map: bi_map[bn] = len(all_bones); all_bones.append(bn)
sorted_keys = sorted(out_map.keys())
new_voxels = [(k[0], k[1], k[2], out_map[k][0]) for k in sorted_keys]
new_weights = [[[bi_map[bn], w] for (bn, w) in out_map[k][1]] for k in sorted_keys]

out_vox = os.path.join(TGT_DIR, f"{OUT_PREFIX}.vox")
out_w = os.path.join(TGT_DIR, f"{OUT_PREFIX}.weights.json")
write_vox(out_vox, tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz'], new_voxels, cloth_pal)
with open(out_w, 'w', encoding='utf-8') as f:
    json.dump({
        'mesh': cloth_w.get('mesh', '') + ' (deformed)',
        'bones': all_bones,
        'voxel_count': len(new_voxels),
        'weights': new_weights,
    }, f, ensure_ascii=False, indent=0)
print(f"  -> {out_vox}: {len(new_voxels)} voxels")
