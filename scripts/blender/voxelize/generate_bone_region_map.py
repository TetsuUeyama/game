"""QM Body メッシュのスキニングウェイトを使って、body.vox の各ボクセルを
ボーングループ（部位）に分類し、以下を出力する:
  1. bone_region_map.json  — ボクセル座標→部位名のマップ + 部位定義
  2. 部位ごとの個別 VOX ファイル（色分け確認用）
  3. 全部位を色分けした統合 VOX ファイル

Usage:
  blender --background <QM.blend> --python generate_bone_region_map.py -- \
    <body.vox> <grid.json> <output_dir>
"""
import bpy
import bmesh
import sys
import os
import struct
import json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

BODY_VOX = args[0]
GRID_JSON = args[1]
OUT_DIR = args[2]

os.makedirs(OUT_DIR, exist_ok=True)

# ========================================================================
# ボーン → 部位グループ定義
# ========================================================================
BONE_GROUPS = {
    'head': [
        'head.x', 'jawbone.x',
        'c_cheek_inflate.l', 'c_cheek_inflate.r',
        'c_cheek_smile.l', 'c_cheek_smile.r',
        'c_chin_01.x', 'c_chin_02.x',
        'c_ear_01.l', 'c_ear_01.r', 'c_ear_02.l', 'c_ear_02.r',
        'c_eye_offset.l', 'c_eye_offset.r',
        'c_eye_ref_track.l', 'c_eye_ref_track.r',
        'c_eyebrow_01.l', 'c_eyebrow_01.r',
        'c_eyebrow_01_end.l', 'c_eyebrow_01_end.r',
        'c_eyebrow_02.l', 'c_eyebrow_02.r',
        'c_eyebrow_03.l', 'c_eyebrow_03.r',
        'c_eyelid_bot_01.l', 'c_eyelid_bot_01.r',
        'c_eyelid_bot_02.l', 'c_eyelid_bot_02.r',
        'c_eyelid_bot_03.l', 'c_eyelid_bot_03.r',
        'c_eyelid_corner_01.l', 'c_eyelid_corner_01.r',
        'c_eyelid_corner_02.l', 'c_eyelid_corner_02.r',
        'c_eyelid_top_01.l', 'c_eyelid_top_01.r',
        'c_eyelid_top_02.l', 'c_eyelid_top_02.r',
        'c_eyelid_top_03.l', 'c_eyelid_top_03.r',
        'c_lips_bot.l', 'c_lips_bot.r', 'c_lips_bot.x',
        'c_lips_bot_01.l', 'c_lips_bot_01.r',
        'c_lips_smile.l', 'c_lips_smile.r',
        'c_lips_top.l', 'c_lips_top.r', 'c_lips_top.x',
        'c_lips_top_01.l', 'c_lips_top_01.r',
        'c_nose_01.x', 'c_nose_02.x', 'c_nose_03.x',
        'c_teeth_bot.l', 'c_teeth_bot.r', 'c_teeth_bot.x',
        'c_teeth_top.l', 'c_teeth_top.r', 'c_teeth_top.x',
        'tong_01.x', 'tong_02.x', 'tong_03.x',
    ],
    'neck': ['neck.x'],
    'shoulder_l': ['shoulder.l'],
    'shoulder_r': ['shoulder.r'],
    'upper_torso': [
        'c_spine_03_bend.x',
        'breast_l', 'breast_r', 'nipple_l', 'nipple_r',
    ],
    'lower_torso': [
        'c_spine_02_bend.x', 'c_spine_01_bend.x',
    ],
    'hips': [
        'c_root_bend.x', 'butt_l', 'butt_r',
        'genital', 'vagina_01.l', 'vagina_01.r', 'vagina_01.x',
        'vagina_02.l', 'vagina_02.r', 'vagina_02.x',
    ],
    'upper_arm_l': ['c_arm_twist.l', 'c_arm_stretch.l'],
    'upper_arm_r': ['c_arm_twist.r', 'c_arm_stretch.r'],
    'forearm_l': [
        'c_forearm_twist.l', 'c_forearm_stretch.l',
        'lowerarm_elbow_l',
    ],
    'forearm_r': [
        'c_forearm_twist.r', 'c_forearm_stretch.r',
        'lowerarm_elbow_r',
    ],
    'hand_l': [
        'hand.l',
        'c_index1_base.l', 'index1.l', 'c_index2.l', 'c_index3.l',
        'c_middle1_base.l', 'middle1.l', 'c_middle2.l', 'c_middle3.l',
        'c_ring1_base.l', 'ring1.l', 'c_ring2.l', 'c_ring3.l',
        'c_pinky1_base.l', 'pinky1.l', 'c_pinky2.l', 'c_pinky3.l',
        'thumb1.l', 'c_thumb2.l', 'c_thumb3.l',
    ],
    'hand_r': [
        'hand.r',
        'c_index1_base.r', 'index1.r', 'c_index2.r', 'c_index3.r',
        'c_middle1_base.r', 'middle1.r', 'c_middle2.r', 'c_middle3.r',
        'c_ring1_base.r', 'ring1.r', 'c_ring2.r', 'c_ring3.r',
        'c_pinky1_base.r', 'pinky1.r', 'c_pinky2.r', 'c_pinky3.r',
        'thumb1.r', 'c_thumb2.r', 'c_thumb3.r',
    ],
    'thigh_l': ['c_thigh_twist.l', 'c_thigh_stretch.l'],
    'thigh_r': ['c_thigh_twist.r', 'c_thigh_stretch.r'],
    'shin_l': ['c_leg_twist.l', 'c_leg_stretch.l', 'knee_l'],
    'shin_r': ['c_leg_twist.r', 'c_leg_stretch.r', 'knee_r'],
    'foot_l': [
        'foot.l', 'toes_01.l',
        'c_toes_thumb1.l', 'c_toes_thumb2.l',
        'c_toes_index1.l', 'c_toes_index2.l', 'c_toes_index3.l',
        'c_toes_middle1.l', 'c_toes_middle2.l', 'c_toes_middle3.l',
        'c_toes_ring1.l', 'c_toes_ring2.l', 'c_toes_ring3.l',
        'c_toes_pinky1.l', 'c_toes_pinky2.l', 'c_toes_pinky3.l',
    ],
    'foot_r': [
        'foot.r', 'toes_01.r',
        'c_toes_thumb1.r', 'c_toes_thumb2.r',
        'c_toes_index1.r', 'c_toes_index2.r', 'c_toes_index3.r',
        'c_toes_middle1.r', 'c_toes_middle2.r', 'c_toes_middle3.r',
        'c_toes_ring1.r', 'c_toes_ring2.r', 'c_toes_ring3.r',
        'c_toes_pinky1.r', 'c_toes_pinky2.r', 'c_toes_pinky3.r',
    ],
}

# ボーン名 → グループ名 (substring pattern) で未登録ボーンを自動分類
# 他モデル (DE 等) の命名ゆれ (c_thigh_twist_2.l, toes_*_def.l, hand_l 等) を吸収する
import re as _re
def _classify_by_pattern(name):
    n = name.lower()
    # side
    if n.endswith('.l') or n.endswith('_l') or _re.search(r'[._]l[._]', n): s = 'l'
    elif n.endswith('.r') or n.endswith('_r') or _re.search(r'[._]r[._]', n): s = 'r'
    else: s = 'x'
    # head
    if any(kw in n for kw in ['head.x','jawbone','skull','chin','cheek','nose','ear','eye','eyebrow','eyelid','lips','teeth','tongue']):
        return 'head'
    if 'neck' in n: return 'neck'
    if 'shoulder' in n: return f'shoulder_{s}' if s in ('l','r') else 'upper_torso'
    if 'breast' in n or 'nipple' in n or 'spine_03' in n or 'spine_04' in n:
        return 'upper_torso'
    if 'spine_01' in n or 'spine_02' in n or 'spine_00' in n:
        return 'lower_torso'
    if any(kw in n for kw in ['root_bend','butt','genital','vagina','pelvis','tail']):
        return 'hips'
    if 'forearm' in n: return f'forearm_{s}' if s in ('l','r') else 'forearm_l'
    if 'arm_twist' in n or 'arm_stretch' in n or 'arm_bendy' in n or 'elbow' in n:
        return f'upper_arm_{s}' if s in ('l','r') else 'upper_arm_l'
    if any(kw in n for kw in ['hand','finger','index','middle','ring','pinky','thumb']) and not n.startswith('c_toes') and 'toes' not in n:
        return f'hand_{s}' if s in ('l','r') else 'hand_l'
    if 'thigh' in n: return f'thigh_{s}' if s in ('l','r') else 'thigh_l'
    if 'leg_twist' in n or 'leg_stretch' in n or 'leg_bendy' in n or 'knee' in n:
        return f'shin_{s}' if s in ('l','r') else 'shin_l'
    if 'foot' in n or 'toes' in n or n.startswith('c_toes'):
        return f'foot_{s}' if s in ('l','r') else 'foot_l'
    return None

# ボーン名 → グループ名の逆引き
BONE_TO_GROUP = {}
for group_name, bones in BONE_GROUPS.items():
    for bone_name in bones:
        BONE_TO_GROUP[bone_name] = group_name

# 部位ごとの表示色 (R, G, B)
GROUP_COLORS = {
    'head':         (255, 200, 200),  # 薄ピンク
    'neck':         (255, 150, 150),  # ピンク
    'shoulder_l':   (200, 200, 255),  # 薄青
    'shoulder_r':   (150, 150, 255),  # 青
    'upper_torso':  (255, 255, 150),  # 薄黄
    'lower_torso':  (255, 220, 100),  # 黄
    'hips':         (255, 180, 80),   # オレンジ
    'upper_arm_l':  (100, 200, 255),  # 水色
    'upper_arm_r':  (50, 180, 255),   # 青系
    'forearm_l':    (100, 255, 200),  # ミント
    'forearm_r':    (50, 230, 180),   # ミント系
    'hand_l':       (150, 255, 150),  # 薄緑
    'hand_r':       (100, 220, 100),  # 緑
    'thigh_l':      (255, 150, 255),  # 薄マゼンタ
    'thigh_r':      (230, 100, 230),  # マゼンタ
    'shin_l':       (200, 100, 255),  # 紫
    'shin_r':       (180, 80, 230),   # 紫系
    'foot_l':       (255, 100, 100),  # 赤
    'foot_r':       (220, 80, 80),    # 暗赤
    'unknown':      (128, 128, 128),  # グレー
}

# ========================================================================
# QM Body メッシュから頂点→部位マップを構築
# ========================================================================
print("\n=== Bone Region Map Generator ===")

body_obj = None
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH' and 'body' in obj.name.lower():
        body_obj = obj
        break

if not body_obj:
    print("ERROR: Body mesh not found")
    sys.exit(1)

print(f"  Body mesh: {body_obj.name} ({len(body_obj.data.vertices)} verts)")

# vertex group index → name
vg_idx_to_name = {vg.index: vg.name for vg in body_obj.vertex_groups}

# 各頂点の最大ウェイトのボーングループを取得
# 注意: evaluated mesh (CorrectiveSmooth 等のモディファイヤ後) は vertex_groups を
# 保持しないため、ORIGINAL の body_obj.data.vertices から weight を取る。
# ワールド座標は matrix_world で手動変換。
dg = bpy.context.evaluated_depsgraph_get()
eo = body_obj.evaluated_get(dg)
me = eo.to_mesh()
me.transform(body_obj.matrix_world)  # BVH のみ evaluated を使う

orig_verts = body_obj.data.vertices
world_mat = body_obj.matrix_world

vert_regions = []  # index → group_name
vert_coords = []   # index → world coord

for v in orig_verts:
    v_world = world_mat @ v.co
    vert_coords.append(Vector(v_world))
    # 頂点のウェイト一覧を取得
    best_group = 'unknown'
    best_weight = 0.0
    for g in v.groups:
        vg_name = vg_idx_to_name.get(g.group, '')
        # 1. 明示リストで引く
        region = BONE_TO_GROUP.get(vg_name)
        # 2. 失敗時パターンで引く (DE 等の命名ゆれ吸収)
        if not region:
            region = _classify_by_pattern(vg_name)
        if region and g.weight > best_weight:
            best_weight = g.weight
            best_group = region
    vert_regions.append(best_group)

# 統計
region_vert_counts = {}
for r in vert_regions:
    region_vert_counts[r] = region_vert_counts.get(r, 0) + 1
print("  Vertex region counts:")
for r, c in sorted(region_vert_counts.items()):
    print(f"    {r}: {c}")

# BVHツリー構築（最寄り頂点検索用）
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.verts.ensure_lookup_table()
bm.faces.ensure_lookup_table()

bvh = BVHTree.FromBMesh(bm)

eo.to_mesh_clear()

# ========================================================================
# Body VOX を読み込み、各ボクセルを部位に割り当て
# ========================================================================
print(f"\n  Loading body VOX: {BODY_VOX}")

with open(GRID_JSON) as f:
    grid = json.load(f)

grid_origin = Vector(grid['grid_origin'])
voxel_size = grid['voxel_size']
gx, gy, gz = grid['gx'], grid['gy'], grid['gz']

# VOXパーサー
def parse_vox_file(path):
    with open(path, 'rb') as f:
        data = f.read()
    sx = sy = sz = 0
    voxels = []
    palette = [(0,0,0)] * 256
    def parse_chunks(start, end):
        nonlocal sx, sy, sz
        offset = start
        while offset < end:
            if offset + 12 > end:
                break
            chunk_id = data[offset:offset+4].decode('ascii', errors='replace')
            chunk_size = struct.unpack_from('<I', data, offset+4)[0]
            child_size = struct.unpack_from('<I', data, offset+8)[0]
            cs = offset + 12
            if chunk_id == 'MAIN':
                parse_chunks(cs + chunk_size, cs + chunk_size + child_size)
            elif chunk_id == 'SIZE':
                sx, sy, sz = struct.unpack_from('<III', data, cs)
            elif chunk_id == 'XYZI':
                count = struct.unpack_from('<I', data, cs)[0]
                for i in range(count):
                    x, y, z, ci = struct.unpack_from('<BBBB', data, cs + 4 + i*4)
                    voxels.append((x, y, z, ci))
            elif chunk_id == 'RGBA':
                for i in range(256):
                    r, g, b, a = struct.unpack_from('<BBBB', data, cs + i*4)
                    palette[i] = (r, g, b)
            offset += 12 + chunk_size + child_size
    parse_chunks(8, len(data))
    return voxels, sx, sy, sz, palette

body_voxels, sx, sy, sz, body_palette = parse_vox_file(BODY_VOX)
print(f"  Body: {sx}x{sy}x{sz}, {len(body_voxels)} voxels")

# 各ボクセルのワールド座標→BVH最寄り点→頂点の部位を取得
print("  Assigning regions to voxels...")
voxel_regions = {}  # (x,y,z) → group_name
region_voxel_counts = {}

for i, (vx, vy, vz, ci) in enumerate(body_voxels):
    if i % 10000 == 0:
        print(f"    {i}/{len(body_voxels)}")
    # ボクセル中心のワールド座標
    world = Vector((
        grid_origin.x + (vx + 0.5) * voxel_size,
        grid_origin.y + (vy + 0.5) * voxel_size,
        grid_origin.z + (vz + 0.5) * voxel_size,
    ))
    # BVH最寄り点
    loc, norm, face_idx, dist = bvh.find_nearest(world)
    if loc is None:
        voxel_regions[(vx, vy, vz)] = 'unknown'
        continue

    # 最寄り面の頂点のうち最もウェイトが近いものを使用
    face = bm.faces[face_idx]
    # 面の3頂点の部位を取得し、最寄り点に最も近い頂点の部位を採用
    best_region = 'unknown'
    best_dist = float('inf')
    for loop in face.loops:
        vi = loop.vert.index
        d = (vert_coords[vi] - loc).length
        if d < best_dist:
            best_dist = d
            best_region = vert_regions[vi]

    voxel_regions[(vx, vy, vz)] = best_region
    region_voxel_counts[best_region] = region_voxel_counts.get(best_region, 0) + 1

print("\n  Voxel region counts:")
for r, c in sorted(region_voxel_counts.items()):
    print(f"    {r}: {c}")

# ========================================================================
# VOX書き出しヘルパー
# ========================================================================
def write_vox(path, sx, sy, sz, voxels, palette_colors):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    size_data = struct.pack('<III', sx, sy, sz)
    xyzi_data = struct.pack('<I', len(voxels))
    for v in voxels:
        xyzi_data += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
    rgba_data = b''
    for i in range(256):
        if i < len(palette_colors):
            c = palette_colors[i]
            rgba_data += struct.pack('<BBBB', c[0], c[1], c[2], 255)
        else:
            rgba_data += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', size_data) + chunk('XYZI', xyzi_data) + chunk('RGBA', rgba_data)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# ========================================================================
# 出力1: 全部位色分け統合VOX
# ========================================================================
print("\n  Writing combined region VOX...")
group_names = sorted(set(voxel_regions.values()))
group_to_palette_idx = {g: i + 1 for i, g in enumerate(group_names)}
palette = [GROUP_COLORS.get(g, (128, 128, 128)) for g in group_names]

combined_voxels = []
for (vx, vy, vz), region in voxel_regions.items():
    ci = group_to_palette_idx[region]
    combined_voxels.append((vx, vy, vz, ci))

combined_path = os.path.join(OUT_DIR, 'body_regions_combined.vox')
write_vox(combined_path, sx, sy, sz, combined_voxels, palette)
print(f"  -> {combined_path}: {len(combined_voxels)} voxels, {len(group_names)} regions")

# ========================================================================
# 出力2: 部位ごとの個別VOX
# ========================================================================
print("\n  Writing per-region VOX files...")
for group_name in group_names:
    region_voxels = []
    color = GROUP_COLORS.get(group_name, (128, 128, 128))
    for (vx, vy, vz), region in voxel_regions.items():
        if region == group_name:
            region_voxels.append((vx, vy, vz, 1))
    if not region_voxels:
        continue
    path = os.path.join(OUT_DIR, f'region_{group_name}.vox')
    write_vox(path, sx, sy, sz, region_voxels, [color])
    print(f"    {group_name}: {len(region_voxels)} voxels -> {path}")

# ========================================================================
# 出力3: bone_region_map.json
# ========================================================================
print("\n  Writing bone_region_map.json...")
region_map = {
    'bone_groups': BONE_GROUPS,
    'group_colors': GROUP_COLORS,
    'grid': {
        'gx': gx, 'gy': gy, 'gz': gz,
        'voxel_size': voxel_size,
        'grid_origin': list(grid_origin),
    },
    'region_voxel_counts': region_voxel_counts,
}

map_path = os.path.join(OUT_DIR, 'bone_region_map.json')
with open(map_path, 'w') as f:
    json.dump(region_map, f, indent=2)
print(f"  -> {map_path}")

# パレット凡例
print("\n  Color legend:")
for g in group_names:
    c = GROUP_COLORS.get(g, (128, 128, 128))
    print(f"    {g}: RGB({c[0]},{c[1]},{c[2]})")

bm.free()
print("\n  Done!")
