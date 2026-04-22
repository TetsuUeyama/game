"""QM ボクセル → Skinned GLB へのコンバータ（デモ用）

QM body.vox + region_*.vox を読み込み、単一スキンメッシュ化 + 19ボーンの
スケルトンを生成して GLB として書き出す。関節変形を GPU skinning で処理する
方式のサンプル。

Soft skinning:
- 頂点は voxel 格子の角で共有（関節境界でも1頂点）
- 各頂点の weight は、その角を共有する周辺 voxel (最大8個) の region 比率
  で計算 → 関節付近で自動的に 2ボーン以上にブレンドされる
- 関節 voxel は隣接 region へ滑らかに変形、非関節は単一 region で hard な動き

Usage:
  blender --background --python vox_to_skinned_glb.py -- \
    <body.vox> <regions_dir> <grid.json> <output.glb>
"""
import bpy
import sys
import os
import struct
import json
from mathutils import Vector, Matrix
from math import radians

# ========================================================================
# 引数
# ========================================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

BODY_VOX = args[0]
REGIONS_DIR = args[1]
GRID_JSON = args[2]
OUT_GLB = args[3]

# 衣装 vox を複数指定可能: --clothing <path.vox> --clothing <path.vox> ...
# --mesh-only: スケルトン・skin weight・アニメなし、メッシュのみ出力 + regions.json
CLOTHING_VOX_PATHS = []
MESH_ONLY = False
i = 4
while i < len(args):
    if args[i] == '--clothing' and i + 1 < len(args):
        CLOTHING_VOX_PATHS.append(args[i + 1])
        i += 2
    elif args[i] == '--mesh-only':
        MESH_ONLY = True
        i += 1
    else:
        i += 1

print(f"\n=== Vox → Skinned GLB ===")
print(f"  Body: {BODY_VOX}")
print(f"  Regions: {REGIONS_DIR}")
print(f"  Clothing: {len(CLOTHING_VOX_PATHS)} files")
print(f"  Output: {OUT_GLB}")
if MESH_ONLY: print(f"  Mode: MESH-ONLY (no skeleton, regions exported as JSON)")

# ========================================================================
# ボクセル読込
# ========================================================================
def parse_vox(path):
    with open(path, 'rb') as f: data = f.read()
    sx=sy=sz=0; voxels=[]; palette=[]
    def parse_chunks(start, end):
        nonlocal sx,sy,sz
        off = start
        while off < end:
            if off+12 > end: break
            cid = data[off:off+4].decode('ascii', errors='replace')
            csz = struct.unpack_from('<I', data, off+4)[0]
            chz = struct.unpack_from('<I', data, off+8)[0]
            cs = off+12
            if cid == 'MAIN': parse_chunks(cs+csz, cs+csz+chz)
            elif cid == 'SIZE': sx,sy,sz = struct.unpack_from('<III', data, cs)
            elif cid == 'XYZI':
                count = struct.unpack_from('<I', data, cs)[0]
                for i in range(count):
                    x,y,z,ci = struct.unpack_from('<BBBB', data, cs+4+i*4)
                    voxels.append((x,y,z,ci))
            elif cid == 'RGBA':
                for i in range(256):
                    r,g,b,a = struct.unpack_from('<BBBB', data, cs+i*4)
                    palette.append((r,g,b,a))
            off += 12+csz+chz
    parse_chunks(8, len(data))
    return voxels, palette, (sx,sy,sz)

with open(GRID_JSON) as f: grid = json.load(f)
VX_SIZE = grid['voxel_size']
ORIGIN = Vector(grid['grid_origin'])

body_vox, body_palette, (gx,gy,gz) = parse_vox(BODY_VOX)
# 全ボクセルを RGB で統一管理（複数パレットをマージするため）
voxel_rgb = {}  # (x,y,z) -> (r,g,b)
for x,y,z,ci in body_vox:
    c = body_palette[ci-1] if 0 < ci <= len(body_palette) else (200,200,200,255)
    voxel_rgb[(x,y,z)] = (c[0], c[1], c[2])
print(f"  Body voxels: {len(voxel_rgb)}")

# Region map (body側)
voxel_region = {}
for rf in sorted(os.listdir(REGIONS_DIR)):
    if not (rf.startswith('region_') and rf.endswith('.vox')): continue
    rname = rf[len('region_'):-len('.vox')]
    rvox, _, _ = parse_vox(os.path.join(REGIONS_DIR, rf))
    for x,y,z,ci in rvox:
        voxel_region[(x,y,z)] = rname
# body のみの region マップをコピー（ボーン位置計算用、衣装で bbox が歪まないように）
body_only_voxel_region = dict(voxel_region)
print(f"  Body regions mapped: {len(voxel_region)}")

# 衣装ボクセル読込 & マージ
clothing_positions = set()
for cpath in CLOTHING_VOX_PATHS:
    c_vox, c_palette, _ = parse_vox(cpath)
    for x,y,z,ci in c_vox:
        c = c_palette[ci-1] if 0 < ci <= len(c_palette) else (200,200,200,255)
        # 衣装は body を上書き（服が肌を覆う）
        voxel_rgb[(x,y,z)] = (c[0], c[1], c[2])
        clothing_positions.add((x,y,z))
    print(f"  Loaded clothing: {os.path.basename(cpath)} ({len(c_vox)} voxels)")

# 衣装voxelの region を、body region から BFS で拡張
if clothing_positions:
    DIRS6_BFS = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
    all_positions = set(voxel_rgb.keys())
    # body region に割当られていない位置（衣装のみの突起など）を対象に BFS
    remaining = clothing_positions - set(voxel_region.keys())
    frontier = [p for p in voxel_region if p in all_positions]
    visited = set(voxel_region.keys())
    # body 表面から外向き BFS
    while remaining and frontier:
        next_frontier = []
        for pos in frontier:
            r = voxel_region[pos]
            for dx,dy,dz in DIRS6_BFS:
                nb = (pos[0]+dx, pos[1]+dy, pos[2]+dz)
                if nb in remaining and nb not in visited:
                    voxel_region[nb] = r
                    visited.add(nb)
                    next_frontier.append(nb)
                    remaining.discard(nb)
        frontier = next_frontier
    if remaining:
        # 6-連結 BFS で届かなかった voxel（孤立突起等）は空間最近傍の region を探索
        from mathutils.kdtree import KDTree
        assigned_list = [(p, r) for p, r in voxel_region.items()]
        kd = KDTree(len(assigned_list))
        for i, (p, _) in enumerate(assigned_list):
            kd.insert((float(p[0]), float(p[1]), float(p[2])), i)
        kd.balance()
        for p in remaining:
            _, idx, _ = kd.find((float(p[0]), float(p[1]), float(p[2])))
            if idx is not None:
                voxel_region[p] = assigned_list[idx][1]
            else:
                voxel_region[p] = 'hips'
        print(f"  Fallback (nearest region): {len(remaining)} clothing voxels")
    print(f"  Total regions mapped: {len(voxel_region)}")

# ========================================================================
# スケルトン定義（Mixamo 互換命名 - motion-editor の motion.json と直接接続可能）
# ========================================================================
# region → Mixamo ボーン名のマッピング
REGION_TO_BONE = {
    'hips':         'Hips',
    'lower_torso':  'Spine',
    'upper_torso':  'Spine2',
    'neck':         'Neck',
    'head':         'Head',
    'shoulder_l':   'LeftShoulder',
    'upper_arm_l':  'LeftArm',
    'forearm_l':    'LeftForeArm',
    'hand_l':       'LeftHand',
    'shoulder_r':   'RightShoulder',
    'upper_arm_r':  'RightArm',
    'forearm_r':    'RightForeArm',
    'hand_r':       'RightHand',
    'thigh_l':      'LeftUpLeg',
    'shin_l':       'LeftLeg',
    'foot_l':       'LeftFoot',
    'thigh_r':      'RightUpLeg',
    'shin_r':       'RightLeg',
    'foot_r':       'RightFoot',
}

# スケルトン全ボーン（Spine1は中間通過ボーン、voxel割当なし）
BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
         'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
         'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
         'LeftUpLeg', 'LeftLeg', 'LeftFoot',
         'RightUpLeg', 'RightLeg', 'RightFoot']

BONE_PARENT = {
    'Hips': None,
    'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1',
    'Neck': 'Spine2', 'Head': 'Neck',
    'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder',
    'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
    'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder',
    'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm',
    'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg',
    'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg',
}

REGIONS = list(REGION_TO_BONE.keys())

# region 別 voxel の bbox を集計してボーン位置を推定（body のみ使用）
region_voxels = {}  # region -> list of (x,y,z)
for pos, r in body_only_voxel_region.items():
    region_voxels.setdefault(r, []).append(pos)

def vox_to_world(pos):
    return Vector((ORIGIN.x + (pos[0]+0.5)*VX_SIZE,
                   ORIGIN.y + (pos[1]+0.5)*VX_SIZE,
                   ORIGIN.z + (pos[2]+0.5)*VX_SIZE))

region_bbox = {}  # region -> (min_world, max_world, center_world)
for r, vs in region_voxels.items():
    ws = [vox_to_world(p) for p in vs]
    mn = Vector((min(w.x for w in ws), min(w.y for w in ws), min(w.z for w in ws)))
    mx = Vector((max(w.x for w in ws), max(w.y for w in ws), max(w.z for w in ws)))
    region_bbox[r] = (mn, mx, (mn+mx)/2)

# ボーン head/tail 位置の推定ルール（人体の関節位置に近づける）
def bone_positions(region):
    mn, mx, c = region_bbox[region]
    # 基本: head=bottom, tail=top の垂直ボーン
    if region == 'hips':
        # 骨盤: 中心から上端
        return (Vector((c.x, c.y, mn.z)), Vector((c.x, c.y, mx.z)))
    if region in ('lower_torso', 'upper_torso', 'neck', 'head'):
        return (Vector((c.x, c.y, mn.z)), Vector((c.x, c.y, mx.z)))
    if region.startswith('shoulder'):
        # 肩: 内側(X中心寄り)から外側へ
        inner_x = mx.x if region.endswith('_l') else mn.x
        outer_x = mn.x if region.endswith('_l') else mx.x
        # l: X>0 方向へ、r: X<0 方向へ
        if region.endswith('_l'):
            return (Vector((min(mn.x, mx.x), c.y, c.z)), Vector((max(mn.x, mx.x), c.y, c.z)))
        else:
            return (Vector((max(mn.x, mx.x), c.y, c.z)), Vector((min(mn.x, mx.x), c.y, c.z)))
    if region.startswith('upper_arm') or region.startswith('forearm') or region.startswith('hand'):
        # 腕: 上端(肩側)から下端(手側)
        # ただし X 差が大きければ X方向、Z差が大きければ Z方向
        dx = mx.x - mn.x; dz = mx.z - mn.z
        if dx > dz:
            # X方向に伸びる（T-pose 腕）
            if region.endswith('_l'):
                return (Vector((mn.x, c.y, c.z)), Vector((mx.x, c.y, c.z)))
            else:
                return (Vector((mx.x, c.y, c.z)), Vector((mn.x, c.y, c.z)))
        else:
            return (Vector((c.x, c.y, mx.z)), Vector((c.x, c.y, mn.z)))
    if region.startswith('thigh') or region.startswith('shin') or region.startswith('foot'):
        # 脚: 上端から下端
        if region.startswith('foot'):
            # 足: 前後方向 (Y) に伸びることが多い
            return (Vector((c.x, mn.y, c.z)), Vector((c.x, mx.y, c.z)))
        return (Vector((c.x, c.y, mx.z)), Vector((c.x, c.y, mn.z)))
    return (mn, mx)

bone_head = {}
bone_tail = {}
for r in REGIONS:
    if r not in region_bbox:
        print(f"  WARNING: region '{r}' has no voxels")
        continue
    h, t = bone_positions(r)
    bone_name = REGION_TO_BONE[r]
    bone_head[bone_name] = h
    bone_tail[bone_name] = t

# Spine1 中間ボーン（Spine と Spine2 の間に補間）
if 'Spine' in bone_head and 'Spine2' in bone_head:
    spine_top = bone_head['Spine'] + (bone_tail['Spine'] - bone_head['Spine'])
    sp2_bot = bone_head['Spine2']
    # Spine1 は Spine の tail から Spine2 の head まで
    bone_head['Spine1'] = spine_top
    bone_tail['Spine1'] = sp2_bot
    # 連続性確保: Spine の tail = Spine2 の head を補間点にするため Spine2 head を Spine1 の tail に合わせる
    # (ここでは何もしない、Spine1 が Spine → Spine2 を繋ぐだけ)

# ========================================================================
# メッシュ生成（Greedy Meshing + soft skinning）
# ========================================================================
print("\n  Building mesh (greedy meshing)...")

# 方向定義: axis (0=X,1=Y,2=Z), sign (+1/-1), u_axis, v_axis
# UV軸は U×V = axis となるように選ぶ (CCW winding for +axis face)
DIR_DEFS = [
    (0, +1, 1, 2),  # +X: U=Y, V=Z
    (0, -1, 1, 2),  # -X
    (1, +1, 2, 0),  # +Y: U=Z, V=X
    (1, -1, 2, 0),  # -Y
    (2, +1, 0, 1),  # +Z: U=X, V=Y
    (2, -1, 0, 1),  # -Z
]

vert_map = {}
verts = []
vert_weights = []
faces = []
face_colors = []

def vert_index(vx, vy, vz):
    key = (vx, vy, vz)
    vi = vert_map.get(key)
    if vi is not None: return vi
    vi = len(verts)
    vert_map[key] = vi
    wx = ORIGIN.x + vx * VX_SIZE
    wy = ORIGIN.y + vy * VX_SIZE
    wz = ORIGIN.z + vz * VX_SIZE
    verts.append((wx, wy, wz))
    vert_weights.append({})
    return vi

# Step 1: 各頂点位置の weight を全 voxel の face contribution で先に計算
# （greedy merge 後の quad corner だけでは weight が失われるため）
corner_weights = {}  # (x,y,z) -> {region: count}
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
for pos, rgb in voxel_rgb.items():
    x, y, z = pos
    region = voxel_region.get(pos, 'hips')
    for dx, dy, dz in DIRS6:
        nb = (x+dx, y+dy, z+dz)
        if nb in voxel_rgb: continue
        # face の4角を列挙
        if dx != 0:
            vx = x + (1 if dx>0 else 0)
            corners = [(vx,y,z), (vx,y+1,z), (vx,y+1,z+1), (vx,y,z+1)]
        elif dy != 0:
            vy = y + (1 if dy>0 else 0)
            corners = [(x,vy,z), (x+1,vy,z), (x+1,vy,z+1), (x,vy,z+1)]
        else:
            vz = z + (1 if dz>0 else 0)
            corners = [(x,y,vz), (x+1,y,vz), (x+1,y+1,vz), (x,y+1,vz)]
        for c in corners:
            cw = corner_weights.setdefault(c, {})
            cw[region] = cw.get(region, 0) + 1

# Step 2: Greedy merge per slice
# face key: (axis, sign, depth) -> {(u,v): (rgb_tuple, region)}
from collections import defaultdict
slices = defaultdict(dict)
for pos, rgb in voxel_rgb.items():
    region = voxel_region.get(pos, 'hips')
    for axis, sign, u_axis, v_axis in DIR_DEFS:
        nb = list(pos); nb[axis] += sign
        if tuple(nb) in voxel_rgb: continue
        slices[(axis, sign, pos[axis])][(pos[u_axis], pos[v_axis])] = (rgb, region)

for (axis, sign, depth), mask in slices.items():
    # 方向の u_axis/v_axis を取得
    for a, s, ua, va in DIR_DEFS:
        if a == axis and s == sign: u_axis, v_axis = ua, va; break
    processed = set()
    # ソートして deterministic な merge
    for uv in sorted(mask.keys()):
        if uv in processed: continue
        u, v = uv
        key = mask[uv]
        rgb, region = key
        # U方向に拡張
        w = 1
        while (u+w, v) in mask and mask[(u+w, v)] == key and (u+w, v) not in processed:
            w += 1
        # V方向に拡張
        h = 1
        while True:
            if not all((u+k, v+h) in mask and mask[(u+k, v+h)] == key and (u+k, v+h) not in processed
                       for k in range(w)):
                break
            h += 1
        for k in range(w):
            for l in range(h):
                processed.add((u+k, v+l))
        # 3D corner を構築: face は axis=face_coord 平面
        face_coord = depth + (1 if sign > 0 else 0)
        uv_corners = [(u, v), (u+w, v), (u+w, v+h), (u, v+h)]
        if sign < 0: uv_corners = uv_corners[::-1]
        corners_3d = []
        for cu, cv in uv_corners:
            c = [0, 0, 0]
            c[axis] = face_coord
            c[u_axis] = cu
            c[v_axis] = cv
            corners_3d.append(tuple(c))
        quad_vi = [vert_index(*c) for c in corners_3d]
        faces.append(quad_vi)
        face_colors.append((rgb[0]/255, rgb[1]/255, rgb[2]/255))

# Step 3: 使われている頂点 index に対して corner_weights から weight 割当
for (key, vi) in vert_map.items():
    cw = corner_weights.get(key, {})
    vert_weights[vi] = dict(cw)

# weight 正規化: 合計1.0、上位4ボーンにキャップ
for vi, wmap in enumerate(vert_weights):
    items = sorted(wmap.items(), key=lambda x: -x[1])[:4]
    total = sum(w for _, w in items)
    if total > 0:
        vert_weights[vi] = {r: w/total for r, w in items}
    else:
        vert_weights[vi] = {'hips': 1.0}

# ========================================================================
# 頂点 index → grid位置の逆引きマップ
# ========================================================================
grid_by_vi = [None] * len(verts)
for key, vi in vert_map.items():
    grid_by_vi[vi] = key

# ========================================================================
# 左右サイド別 Influence Injection (広範囲変形)
# 背中の中心線を境に、右半身の torso voxel は RightShoulder/RightArm に、
# 左半身は LeftShoulder/LeftArm に部分的に追従させる。
# 腕を振ると背中片側が全体的に少し動く自然な変形を実現。
# ========================================================================
print("  Adding side-aware limb influence...")

# body X中心 (voxel単位)
_all_xs = [gp[0] for gp in vert_map.keys()]
body_center_gx = (min(_all_xs) + max(_all_xs)) / 2

# world位置 → voxel grid単位に変換
def world_to_grid(v):
    return ((v.x - ORIGIN.x)/VX_SIZE,
            (v.y - ORIGIN.y)/VX_SIZE,
            (v.z - ORIGIN.z)/VX_SIZE)

# 影響源（region名で処理、後段で REGION_TO_BONE で骨に変換される）
# (source_region, grid_pos, radius, max_weight, side_sign)
# Blender +X が QM の character's left か right かは blend 次第だが、
# region voxel の実データから自動判定する
def _region_side(rname):
    """region 名から grid X で左右判定（+X側なら 1, -X側なら -1）"""
    if rname not in region_voxels: return 0
    xs = [p[0] for p in region_voxels[rname]]
    avg_x = sum(xs) / len(xs)
    return 1 if avg_x > body_center_gx else -1

influence_sources = []  # (src_region, grid_pos, radius, max_weight, side_sign)
# upper_arm_l/r を主影響源（Wave/StarJump で実際に回転する骨）
# shoulder_l/r も補助として追加（肩自体がすくめる動作用）
# thigh_l/r は Squat/StarJump での脚の動き用
INFLUENCE_CONFIG = [
    # (region, radius, max_weight)
    ('upper_arm_l', 70, 0.40),
    ('upper_arm_r', 70, 0.40),
    ('shoulder_l',  50, 0.20),
    ('shoulder_r',  50, 0.20),
    ('thigh_l',     50, 0.30),
    ('thigh_r',     50, 0.30),
]
for src_region, radius, max_w in INFLUENCE_CONFIG:
    if src_region not in region_voxels: continue
    bone_name = REGION_TO_BONE.get(src_region)
    if not bone_name or bone_name not in bone_head: continue
    gp = world_to_grid(bone_head[bone_name])
    side = _region_side(src_region)
    influence_sources.append((src_region, gp, radius, max_w, side))
    print(f"    influence: {src_region} side={'L(+X)' if side>0 else 'R(-X)'} radius={radius} max={max_w}")

# 対象 region (torso 系、小文字 region 名)
TORSO_REGIONS_SET = {'hips', 'lower_torso', 'upper_torso', 'neck'}

influenced_count = 0
MAX_TOTAL_INFLUENCE_RATIO = 0.75  # torso weightの最大75%を外部骨に移動

# mesh-only モードでは influence/smoothing をスキップ（region情報だけを後で出力）
if MESH_ONLY:
    print("  [mesh-only] Skipping influence/smoothing steps")

for vi in range(len(verts)):
    if MESH_ONLY: break
    gp = grid_by_vi[vi]
    current = vert_weights[vi]
    torso_total = sum(w for r, w in current.items() if r in TORSO_REGIONS_SET)
    if torso_total < 0.5: continue

    v_side = 1 if gp[0] > body_center_gx else -1

    # 全影響源を先に集計してから一括適用
    accumulated = {}
    total_inf = 0.0
    for src_region, src_gp, radius, max_w, src_side in influence_sources:
        if src_side == 0 or src_side != v_side: continue
        dx = gp[0] - src_gp[0]; dy = gp[1] - src_gp[1]; dz = gp[2] - src_gp[2]
        dist = (dx*dx + dy*dy + dz*dz) ** 0.5
        if dist > radius: continue
        t = dist / radius
        falloff = (1 - t) * (1 - t)
        inf = max_w * falloff * torso_total
        if inf < 0.005: continue
        accumulated[src_region] = accumulated.get(src_region, 0.0) + inf
        total_inf += inf

    if total_inf < 0.01: continue

    # 総影響量が上限を超えたら比例縮小
    max_allowed = torso_total * MAX_TOTAL_INFLUENCE_RATIO
    if total_inf > max_allowed:
        scale_down = max_allowed / total_inf
        accumulated = {k: v * scale_down for k, v in accumulated.items()}
        total_inf = max_allowed

    # torso を scale down し、影響先を加算
    scale = 1.0 - (total_inf / torso_total)
    new_curr = {}
    for r, w in current.items():
        if r in TORSO_REGIONS_SET:
            new_curr[r] = w * scale
        else:
            new_curr[r] = w
    for src_region, inf in accumulated.items():
        new_curr[src_region] = new_curr.get(src_region, 0.0) + inf

    vert_weights[vi] = new_curr
    influenced_count += 1

print(f"  Influenced {influenced_count}/{len(verts)} vertices")

# ========================================================================
# Weight Smoothing (関節周辺の伸び広げ)
# 近傍頂点の weight を混ぜることで、関節境界の「1ボクセル幅の急変化」を
# 数ボクセル幅のグラデーションに広げる。Influence Injection と組み合わせて
# 局所的な強い変化を滑らかに拡散させる。
# ========================================================================
print("  Smoothing skin weights...")
SMOOTH_ITERATIONS = 5 if not MESH_ONLY else 0
SELF_W = 0.35
NEIGHBOR_W_PER = (1.0 - SELF_W) / 6.0
SMOOTH_DIRS = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]

for _iter in range(SMOOTH_ITERATIONS):
    new_vw = [None] * len(verts)
    for vi in range(len(verts)):
        gp = grid_by_vi[vi]
        combined = {}
        for r, w in vert_weights[vi].items():
            combined[r] = combined.get(r, 0.0) + w * SELF_W
        for dx, dy, dz in SMOOTH_DIRS:
            nb = (gp[0]+dx, gp[1]+dy, gp[2]+dz)
            ni = vert_map.get(nb)
            source = vert_weights[ni] if ni is not None else vert_weights[vi]
            for r, w in source.items():
                combined[r] = combined.get(r, 0.0) + w * NEIGHBOR_W_PER
        items = sorted(combined.items(), key=lambda x: -x[1])[:4]
        total = sum(w for _, w in items)
        new_vw[vi] = {r: w/total for r, w in items} if total > 0 else {'hips': 1.0}
    vert_weights = new_vw

print(f"  Vertices: {len(verts)}, Faces: {len(faces)}")
multi_bone = sum(1 for w in vert_weights if len(w) >= 2)
print(f"  Soft-skinned vertices (≥2 bones): {multi_bone} ({multi_bone*100/len(verts):.1f}%)")

# ========================================================================
# Blender シーン構築
# ========================================================================
# 既存シーンクリア
bpy.ops.wm.read_factory_settings(use_empty=True)

arm_obj = None
ebones = {}
if not MESH_ONLY:
    # Armature 作成
    arm_data = bpy.data.armatures.new('Skeleton')
    arm_obj = bpy.data.objects.new('Skeleton', arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')

    for b in BONES:
        if b not in bone_head: continue
        eb = arm_data.edit_bones.new(b)
        eb.head = bone_head[b]
        eb.tail = bone_tail[b]
        if (eb.tail - eb.head).length < 0.001:
            eb.tail = eb.head + Vector((0, 0, 0.05))
        ebones[b] = eb

    for b in BONES:
        p = BONE_PARENT.get(b)
        if p and b in ebones and p in ebones:
            ebones[b].parent = ebones[p]

    bpy.ops.object.mode_set(mode='OBJECT')

# Mesh 作成
mesh = bpy.data.meshes.new('VoxelMesh')
mesh.from_pydata(verts, [], faces)

# 頂点カラー（face corner domain）
cattr = mesh.color_attributes.new(name='Col', type='BYTE_COLOR', domain='CORNER')
for fi, face in enumerate(mesh.polygons):
    col = face_colors[fi]
    for li in face.loop_indices:
        cattr.data[li].color = (col[0], col[1], col[2], 1.0)

mesh.update()
mesh_obj = bpy.data.objects.new('VoxelMesh', mesh)
bpy.context.scene.collection.objects.link(mesh_obj)

# マテリアル（頂点カラー表示）
mat = bpy.data.materials.new('VoxMat')
mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial')
bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
vcol = nt.nodes.new('ShaderNodeVertexColor')
vcol.layer_name = 'Col'
nt.links.new(vcol.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.8
nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
mesh.materials.append(mat)

if not MESH_ONLY:
    # Vertex Group をボーンごとに作成し、region→bone 経由で weight 割当
    for b in BONES:
        if b in ebones:
            mesh_obj.vertex_groups.new(name=b)

    vg_by_name = {vg.name: vg for vg in mesh_obj.vertex_groups}
    for vi, wmap in enumerate(vert_weights):
        for region, w in wmap.items():
            bone_name = REGION_TO_BONE.get(region)
            if bone_name and bone_name in vg_by_name:
                vg_by_name[bone_name].add([vi], w, 'REPLACE')

    # Armature モディファイア
    mod = mesh_obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm_obj
    mesh_obj.parent = arm_obj

# ========================================================================
# アニメーション作成（Babylon.js 基準で Blender bone-local Euler 回転）
# Blender の bone-local 軸:
#   - 直立ボーン（Hips/Spine/Head）: local Y = +Z world (上)
#   - 腕ボーン（LeftArm等）: local Y = bone方向
#   各アニメーションは独立した Action として NLA に配置し、GLB に複数出力される
# ========================================================================
def _build_animations():
    print("  Creating animations...")
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='POSE')

    for pb in arm_obj.pose.bones:
        pb.rotation_mode = 'XYZ'

    def reset_pose():
        for pb in arm_obj.pose.bones:
            pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)

    def kf(bone_name, frame, rx_deg=0, ry_deg=0, rz_deg=0, loc=None):
        if bone_name not in arm_obj.pose.bones: return
        pb = arm_obj.pose.bones[bone_name]
        pb.rotation_euler = (radians(rx_deg), radians(ry_deg), radians(rz_deg))
        pb.keyframe_insert(data_path='rotation_euler', frame=frame)
        if loc is not None:
            pb.location = loc
            pb.keyframe_insert(data_path='location', frame=frame)

    def create_action(name):
        reset_pose()
        act = bpy.data.actions.new(name)
        arm_obj.animation_data_create()
        arm_obj.animation_data.action = act
        return act

    def finalize_action(act):
        arm_obj.animation_data.action = None
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, int(act.frame_range[0]), act)
        strip.name = act.name

    # Wave
    act = create_action('Wave')
    for f in (1, 60):
        kf('RightArm', f); kf('RightForeArm', f); kf('LeftArm', f); kf('LeftForeArm', f)
    kf('RightArm', 15, rz_deg=-110); kf('RightForeArm', 15, rx_deg=60)
    kf('RightArm', 30, rz_deg=-110, rx_deg=25); kf('RightForeArm', 30, rx_deg=60)
    kf('RightArm', 45, rz_deg=-110, rx_deg=-25); kf('RightForeArm', 45, rx_deg=60)
    kf('RightArm', 60, rz_deg=-110, rx_deg=25); kf('RightForeArm', 60, rx_deg=60)
    finalize_action(act)

    # Squat
    act = create_action('Squat')
    reset_pose()
    for b in ('Hips','LeftUpLeg','LeftLeg','RightUpLeg','RightLeg','Spine','Spine2','LeftArm','RightArm'):
        kf(b, 1)
    kf('Hips', 30, loc=(0, -0.3, 0))
    kf('LeftUpLeg', 30, rx_deg=60); kf('RightUpLeg', 30, rx_deg=60)
    kf('LeftLeg', 30, rx_deg=-100); kf('RightLeg', 30, rx_deg=-100)
    kf('Spine', 30, rx_deg=-20)
    kf('LeftArm', 30, rx_deg=70); kf('RightArm', 30, rx_deg=-70)
    for b in ('Hips','LeftUpLeg','LeftLeg','RightUpLeg','RightLeg','Spine','LeftArm','RightArm'):
        kf(b, 60)
    finalize_action(act)

    # Twist
    act = create_action('Twist')
    reset_pose()
    for b in ('Spine','Spine2','Neck','LeftArm','RightArm'):
        kf(b, 1)
    kf('Spine', 20, ry_deg=30); kf('Spine2', 20, ry_deg=25); kf('Neck', 20, ry_deg=15)
    kf('LeftArm', 20, rx_deg=15); kf('RightArm', 20, rx_deg=-15)
    kf('Spine', 40, ry_deg=-30); kf('Spine2', 40, ry_deg=-25); kf('Neck', 40, ry_deg=-15)
    kf('LeftArm', 40, rx_deg=-15); kf('RightArm', 40, rx_deg=15)
    for b in ('Spine','Spine2','Neck','LeftArm','RightArm'):
        kf(b, 60)
    finalize_action(act)

    # StarJump
    act = create_action('StarJump')
    reset_pose()
    for b in ('Hips','LeftArm','RightArm','LeftUpLeg','RightUpLeg'):
        kf(b, 1)
    kf('Hips', 15, loc=(0, 0.15, 0))
    kf('LeftArm', 15, rz_deg=-80); kf('RightArm', 15, rz_deg=80)
    kf('LeftUpLeg', 15, rz_deg=20); kf('RightUpLeg', 15, rz_deg=-20)
    for b in ('Hips','LeftArm','RightArm','LeftUpLeg','RightUpLeg'):
        kf(b, 30)
    kf('Hips', 45, loc=(0, 0.15, 0))
    kf('LeftArm', 45, rz_deg=-80); kf('RightArm', 45, rz_deg=80)
    kf('LeftUpLeg', 45, rz_deg=20); kf('RightUpLeg', 45, rz_deg=-20)
    for b in ('Hips','LeftArm','RightArm','LeftUpLeg','RightUpLeg'):
        kf(b, 60)
    finalize_action(act)

    # --------- Walk (前後方向の脚・腕スウィング、歩行イン・プレース) ---------
    # Blender bone-local 軸メモ:
    #   腕: local Y = 腕方向。rx_deg で前後スウィング（sagittal plane）
    #       LeftArm: rx=+ → 前、rx=- → 後ろ
    #       RightArm: rx=- → 前、rx=+ → 後ろ (対称)
    #   脚: 両脚とも下向き。rx_deg=+ → 前に曲げる
    act = create_action('Walk')
    reset_pose()
    for b in ('LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftArm','RightArm','LeftForeArm','RightForeArm'):
        kf(b, 1)
    # Frame 15: 右脚 前、左脚 後ろ / 左腕 前、右腕 後ろ（対角スウィング）
    kf('RightUpLeg', 15, rx_deg=30)
    kf('RightLeg', 15, rx_deg=-15)
    kf('LeftUpLeg', 15, rx_deg=-20)
    kf('LeftArm', 15, rx_deg=35)
    kf('RightArm', 15, rx_deg=35)   # rx+ on Right = 後ろ
    kf('LeftForeArm', 15, rx_deg=25)
    kf('RightForeArm', 15, rx_deg=25)
    # Frame 30: neutral (足が揃う)
    for b in ('LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftArm','RightArm','LeftForeArm','RightForeArm'):
        kf(b, 30)
    # Frame 45: 左脚 前、右脚 後ろ / 右腕 前、左腕 後ろ
    kf('LeftUpLeg', 45, rx_deg=30)
    kf('LeftLeg', 45, rx_deg=-15)
    kf('RightUpLeg', 45, rx_deg=-20)
    kf('RightArm', 45, rx_deg=-35)  # rx- on Right = 前
    kf('LeftArm', 45, rx_deg=-35)   # rx- on Left = 後ろ
    kf('LeftForeArm', 45, rx_deg=25)
    kf('RightForeArm', 45, rx_deg=25)
    # Frame 60: neutral
    for b in ('LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftArm','RightArm','LeftForeArm','RightForeArm'):
        kf(b, 60)
    finalize_action(act)

    # --------- Punch (右・左交互ストレートパンチ) ---------
    act = create_action('Punch')
    reset_pose()
    for b in ('LeftArm','RightArm','LeftForeArm','RightForeArm','Spine','Spine2'):
        kf(b, 1)
    # Frame 15: 右ストレート
    kf('RightArm', 15, rx_deg=-75)       # 右腕 前へ
    kf('RightForeArm', 15, rx_deg=15)    # 腕伸ばす
    kf('LeftArm', 15, rx_deg=50)         # 左ガード
    kf('LeftForeArm', 15, rx_deg=80)     # 肘深く曲げる
    kf('Spine2', 15, ry_deg=-15)         # 上体を右にひねって勢い付け
    # Frame 25: 右 引き戻す
    kf('RightArm', 25, rx_deg=30)
    kf('RightForeArm', 25, rx_deg=90)
    kf('Spine2', 25, ry_deg=0)
    # Frame 40: 左ストレート
    kf('LeftArm', 40, rx_deg=75)         # 左腕 前へ
    kf('LeftForeArm', 40, rx_deg=15)
    kf('RightArm', 40, rx_deg=-50)       # 右ガード
    kf('RightForeArm', 40, rx_deg=80)
    kf('Spine2', 40, ry_deg=15)          # 上体を左にひねる
    # Frame 50: 左 引き戻す
    kf('LeftArm', 50, rx_deg=-30)
    kf('LeftForeArm', 50, rx_deg=90)
    kf('Spine2', 50, ry_deg=0)
    # Frame 60: neutral
    for b in ('LeftArm','RightArm','LeftForeArm','RightForeArm','Spine','Spine2'):
        kf(b, 60)
    finalize_action(act)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 60
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"  Created {len(arm_obj.animation_data.nla_tracks)} animations")

if MESH_ONLY:
    print("  [mesh-only] Skipping animation creation")
else:
    _build_animations()

# ========================================================================
# GLB エクスポート
# ========================================================================
print("  Exporting GLB...")
os.makedirs(os.path.dirname(OUT_GLB) or '.', exist_ok=True)

for obj in bpy.context.scene.objects:
    try: obj.select_set(False)
    except RuntimeError: pass
if arm_obj is not None: arm_obj.select_set(True)
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj if arm_obj else mesh_obj

gltf_kwargs = dict(
    filepath=OUT_GLB,
    use_selection=True,
    export_format='GLB',
    export_normals=True,
    export_apply=False,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_color_quantization=8,
    export_draco_generic_quantization=12,
)
if MESH_ONLY:
    gltf_kwargs['export_skins'] = False
    gltf_kwargs['export_animations'] = False
else:
    gltf_kwargs['export_skins'] = True
    gltf_kwargs['export_animations'] = True
    gltf_kwargs['export_animation_mode'] = 'NLA_TRACKS'

try:
    bpy.ops.export_scene.gltf(**gltf_kwargs)
except TypeError:
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB, use_selection=True, export_format='GLB',
    )

size_kb = os.path.getsize(OUT_GLB) / 1024
print(f"  -> {OUT_GLB} ({size_kb:.1f} KB)")

# ========================================================================
# Region メタデータ JSON 出力（mesh-only モード時、または常時）
# 移行先プロジェクトで自前のボーンに weight 割当てするために使う
# ========================================================================
regions_json_path = os.path.splitext(OUT_GLB)[0] + '.regions.json'
# 各頂点の region（ドミナント）+ weight マップ
vertex_regions = []
for vi in range(len(verts)):
    wmap = vert_weights[vi]
    if wmap:
        dominant = max(wmap, key=wmap.get)
    else:
        dominant = 'hips'
    vertex_regions.append(dominant)

# region ごとの bbox (world座標 + voxel grid) を出力
regions_out = {}
for r, (mn, mx, c) in region_bbox.items():
    regions_out[r] = {
        'world_min': [mn.x, mn.y, mn.z],
        'world_max': [mx.x, mx.y, mx.z],
        'world_center': [c.x, c.y, c.z],
    }

# ボーン推奨位置（current Mixamo 配置）
bone_suggested = {}
for b, h in bone_head.items():
    t = bone_tail[b]
    bone_suggested[b] = {
        'head_world': [h.x, h.y, h.z],
        'tail_world': [t.x, t.y, t.z],
        'parent': BONE_PARENT.get(b),
    }

meta = {
    'vertex_count': len(verts),
    'face_count': len(faces),
    'mode': 'mesh-only' if MESH_ONLY else 'skinned',
    'vertex_regions': vertex_regions,  # 頂点 index → region 名
    'region_to_bone': REGION_TO_BONE,  # region → Mixamo bone (参考)
    'regions': regions_out,             # region bbox
    'suggested_bones': bone_suggested,  # 推奨スケルトン
    'vertex_full_weights': [
        [{'region': r, 'weight': w} for r, w in wmap.items()]
        for wmap in vert_weights
    ] if MESH_ONLY else None,
}
with open(regions_json_path, 'w') as f:
    json.dump(meta, f, separators=(',', ':'))
json_kb = os.path.getsize(regions_json_path) / 1024
print(f"  -> {regions_json_path} ({json_kb:.1f} KB)")
print("  Done!")
