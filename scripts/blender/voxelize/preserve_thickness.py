"""DE 衣装の body 表面からの距離を保持して QM body 表面にフィットさせる。
混在した厚み (arms の薄部分 + 厚い装甲、legs の tights + 脛アーマー) を DE 通りに再現。

原理:
  1. DE 衣装の各 voxel について、最寄り DE body 表面 voxel B_de と局所法線・offset を取得
  2. QM 側で対応する body 表面 voxel B_qm を region bbox で決定
  3. V_qm = B_qm + (DE の offset を法線方向に同じだけ保持)

Usage:
  python preserve_thickness.py <src_dir> <src_prefix> <tgt_dir> <out_prefix>
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

with open(os.path.join(SRC_DIR, 'grid.json')) as f: src_grid = json.load(f)
with open(os.path.join(TGT_DIR, 'grid.json')) as f: tgt_grid = json.load(f)
src_vs = src_grid['voxel_size']; tgt_vs = tgt_grid['voxel_size']
src_origin = src_grid['grid_origin']; tgt_origin = tgt_grid['grid_origin']

def src_world(x, y, z): return (src_origin[0]+(x+0.5)*src_vs, src_origin[1]+(y+0.5)*src_vs, src_origin[2]+(z+0.5)*src_vs)
def tgt_world(x, y, z): return (tgt_origin[0]+(x+0.5)*tgt_vs, tgt_origin[1]+(y+0.5)*tgt_vs, tgt_origin[2]+(z+0.5)*tgt_vs)

# --- load clothing voxels ---
cloth_voxels, _, _, _, cloth_pal = parse_vox(os.path.join(SRC_DIR, f"{SRC_PREFIX}.vox"))
with open(os.path.join(SRC_DIR, f"{SRC_PREFIX}.weights.json"), encoding='utf-8') as f:
    cloth_w = json.load(f)
cloth_weights = cloth_w['weights']; cloth_bones = cloth_w['bones']
print(f"  clothing: {len(cloth_voxels)} voxels")

# --- load bodies ---
src_body_voxels, _, _, _, _ = parse_vox(os.path.join(SRC_DIR, 'body.vox'))
tgt_body_voxels, _, _, _, _ = parse_vox(os.path.join(TGT_DIR, 'body.vox'))
src_body_set = set((x, y, z) for (x, y, z, _) in src_body_voxels)
tgt_body_set = set((x, y, z) for (x, y, z, _) in tgt_body_voxels)

# --- body surface + normals ---
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
def surface_normals(body_set):
    sn = {}
    for (x, y, z) in body_set:
        ux = uy = uz = 0.0; empty = 0
        for (dx, dy, dz) in DIRS6:
            if (x+dx, y+dy, z+dz) not in body_set:
                ux += dx; uy += dy; uz += dz; empty += 1
        if empty == 0: continue
        length = math.sqrt(ux*ux + uy*uy + uz*uz)
        if length < 0.1:
            sn[(x, y, z)] = (0.0, 1.0, 0.0)
        else:
            sn[(x, y, z)] = (ux/length, uy/length, uz/length)
    return sn
src_surf = surface_normals(src_body_set)
tgt_surf = surface_normals(tgt_body_set)
print(f"  src surface: {len(src_surf)}, tgt surface: {len(tgt_surf)}")

# --- load regions for src/tgt body voxel → region ---
def load_regions(dir_path):
    out = {}
    for fn in os.listdir(dir_path):
        if not (fn.startswith('region_') and fn.endswith('.vox')): continue
        rn = fn[len('region_'):-len('.vox')]
        vs, _, _, _, _ = parse_vox(os.path.join(dir_path, fn))
        for (x, y, z, _) in vs:
            out[(x, y, z)] = rn
    return out
src_vox2region = load_regions(os.path.join(SRC_DIR, 'regions'))
tgt_vox2region = load_regions(os.path.join(TGT_DIR, 'regions'))

# --- region bbox (world) ---
def region_bbox_world(vox2region, vs, origin):
    regions = {}
    for (x, y, z), r in vox2region.items():
        regions.setdefault(r, []).append((x, y, z))
    bboxes = {}
    for r, vlist in regions.items():
        wxs = [origin[0]+(x+0.5)*vs for (x,y,z) in vlist]
        wys = [origin[1]+(y+0.5)*vs for (x,y,z) in vlist]
        wzs = [origin[2]+(z+0.5)*vs for (x,y,z) in vlist]
        bboxes[r] = (min(wxs), min(wys), min(wzs), max(wxs), max(wys), max(wzs))
    return bboxes
src_region_bbox = region_bbox_world(src_vox2region, src_vs, src_origin)
tgt_region_bbox = region_bbox_world(tgt_vox2region, tgt_vs, tgt_origin)

# --- src surface by Z (高速検索) + per region ---
src_surf_by_z = {}
for pos in src_surf: src_surf_by_z.setdefault(pos[2], []).append(pos)
tgt_surf_by_region = {}
for pos in tgt_surf:
    r = tgt_vox2region.get(pos)
    if r: tgt_surf_by_region.setdefault(r, []).append(pos)

def nearest_src_surf(x, y, z, zrange=10):
    best = None; best_d2 = 1e18
    for dz in range(-zrange, zrange+1):
        zz = z + dz
        if zz not in src_surf_by_z: continue
        for pos in src_surf_by_z[zz]:
            ddx = pos[0]-x; ddy = pos[1]-y; ddz = pos[2]-z
            d2 = ddx*ddx + ddy*ddy + ddz*ddz
            if d2 < best_d2: best_d2 = d2; best = pos
    return best

def nearest_tgt_surf_in_region(wx, wy, wz, region):
    """region 内の最寄り tgt 表面 voxel"""
    cand = tgt_surf_by_region.get(region, [])
    if not cand: return None
    # world で近い voxel を探す
    best = None; best_d2 = 1e18
    for pos in cand:
        tw = tgt_world(*pos)
        ddx = tw[0]-wx; ddy = tw[1]-wy; ddz = tw[2]-wz
        d2 = ddx*ddx + ddy*ddy + ddz*ddz
        if d2 < best_d2: best_d2 = d2; best = pos
    return best

# --- bone map / bone_disp (pose fit) ---
with open(os.path.join(SRC_DIR, 'skeleton.json'), encoding='utf-8') as f: src_skel = json.load(f)
with open(os.path.join(TGT_DIR, 'skeleton.json'), encoding='utf-8') as f: tgt_skel = json.load(f)
src_bone_pos = {b['name']: tuple(b['head_rest']) for b in src_skel['bones']}
tgt_bone_pos = {b['name']: tuple(b['head_rest']) for b in tgt_skel['bones']}

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

# --- refit: 各 DE 衣装 voxel について body 表面からの offset を保持 ---
print(f"\n  refitting with surface-distance preservation...")
out_map = {}
from collections import deque
BFS26 = [(dx,dy,dz) for dx in (-1,0,1) for dy in (-1,0,1) for dz in (-1,0,1) if not (dx==0 and dy==0 and dz==0)]

def find_empty(ideal):
    if ideal not in out_map: return ideal
    visited = {ideal}; queue = deque([(ideal, 0)])
    while queue:
        (k, d) = queue.popleft()
        if d >= 20: continue
        for (dx, dy, dz) in BFS26:
            nb = (k[0]+dx, k[1]+dy, k[2]+dz)
            if nb in visited: continue
            visited.add(nb)
            if nb[0]<0 or nb[0]>=tgt_grid['gx'] or nb[1]<0 or nb[1]>=tgt_grid['gy'] or nb[2]<0 or nb[2]>=tgt_grid['gz']:
                continue
            if nb not in out_map: return nb
            queue.append((nb, d+1))
    return None

no_src_surf = 0; no_region = 0; no_tgt_surf = 0; oob = 0; placed = 0
for (v, wl) in zip(cloth_voxels, cloth_weights):
    vx, vy, vz, vci = v
    # 1. 最寄り DE body 表面
    nb_src = nearest_src_surf(vx, vy, vz)
    if nb_src is None: no_src_surf += 1; continue
    # 2. DE 側の offset (world 単位、法線成分/接線成分)
    vw = src_world(vx, vy, vz)
    nbw = src_world(*nb_src)
    nb_n = src_surf[nb_src]
    offset = (vw[0]-nbw[0], vw[1]-nbw[1], vw[2]-nbw[2])
    off_n = offset[0]*nb_n[0] + offset[1]*nb_n[1] + offset[2]*nb_n[2]  # 法線方向成分
    off_t = (offset[0]-nb_n[0]*off_n, offset[1]-nb_n[1]*off_n, offset[2]-nb_n[2]*off_n)  # 接線成分

    # 3. src body region
    region = src_vox2region.get(nb_src)
    if region is None or region not in tgt_region_bbox or region not in src_region_bbox:
        no_region += 1; continue

    # 4. DE の nb_src の region 内正規化座標 t を tgt region bbox に適用
    sbb = src_region_bbox[region]; tbb = tgt_region_bbox[region]
    sx_ = max(1e-6, sbb[3]-sbb[0]); sy_ = max(1e-6, sbb[4]-sbb[1]); sz_ = max(1e-6, sbb[5]-sbb[2])
    tnx = (nbw[0]-sbb[0])/sx_; tny = (nbw[1]-sbb[1])/sy_; tnz = (nbw[2]-sbb[2])/sz_
    tgt_wx = tbb[0] + tnx*(tbb[3]-tbb[0])
    tgt_wy = tbb[1] + tny*(tbb[4]-tbb[1])
    tgt_wz = tbb[2] + tnz*(tbb[5]-tbb[2])
    # 最寄り tgt 表面 voxel
    tb = nearest_tgt_surf_in_region(tgt_wx, tgt_wy, tgt_wz, region)
    if tb is None: no_tgt_surf += 1; continue
    tb_n = tgt_surf[tb]
    tbw = tgt_world(*tb)
    # 5. tgt 側 target world = B_qm + off_n * tb_normal + off_t
    qwx = tbw[0] + tb_n[0]*off_n + off_t[0]
    qwy = tbw[1] + tb_n[1]*off_n + off_t[1]
    qwz = tbw[2] + tb_n[2]*off_n + off_t[2]
    tx = int(round((qwx - tgt_origin[0]) / tgt_vs - 0.5))
    ty = int(round((qwy - tgt_origin[1]) / tgt_vs - 0.5))
    tz = int(round((qwz - tgt_origin[2]) / tgt_vs - 0.5))
    if tx<0 or tx>=tgt_grid['gx'] or ty<0 or ty>=tgt_grid['gy'] or tz<0 or tz>=tgt_grid['gz']:
        oob += 1; continue
    slot = find_empty((tx, ty, tz))
    if slot is None: oob += 1; continue
    new_wl = [[SRC_TO_TGT_BONE.get(cloth_bones[bi], cloth_bones[bi]), w] for (bi, w) in wl]
    out_map[slot] = (vci, new_wl)
    placed += 1

print(f"  placed: {placed}")
print(f"  failed: no_src_surf={no_src_surf} no_region={no_region} no_tgt_surf={no_tgt_surf} oob={oob}")

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
        'mesh': cloth_w.get('mesh', '') + ' (thickness preserved)',
        'bones': all_bones, 'voxel_count': len(new_voxels), 'weights': new_weights,
    }, f, ensure_ascii=False, indent=0)
print(f"  -> {out_vox}: {len(new_voxels)} voxels")
