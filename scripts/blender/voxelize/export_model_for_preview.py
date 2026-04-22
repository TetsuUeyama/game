"""ソースモデルのBodyに部位色を頂点カラーで焼き込み、
Body + 衣装パーツを個別GLBとしてエクスポートする。

3つのマッピングモード:
  bones  — ボーンウェイトからキーワード自動マッピング（デフォルト）
  height — ボーンなし時、Z高さベースで部位分け
  config — JSON設定ファイルで手動マッピング

Usage:
  blender --background <source.blend> --python export_model_for_preview.py -- \
    <output_dir> [--body-name "Body"] [--mode bones|height|config] [--config mapping.json] \
    [--parts "Part1,Part2,..."]
"""
import bpy
import bmesh
import sys
import os
import json
import math
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

# 引数パース
OUT_DIR = args[0]

MODE = 'bones'
BODY_NAME = None
CONFIG_PATH = None
PART_NAMES = None

i = 1
while i < len(args):
    if args[i] == '--mode' and i + 1 < len(args):
        MODE = args[i + 1]; i += 2
    elif args[i] == '--body-name' and i + 1 < len(args):
        BODY_NAME = args[i + 1]; i += 2
    elif args[i] == '--config' and i + 1 < len(args):
        CONFIG_PATH = args[i + 1]; i += 2
    elif args[i] == '--parts' and i + 1 < len(args):
        PART_NAMES = [p.strip() for p in args[i + 1].split(',')]; i += 2
    else:
        i += 1

os.makedirs(OUT_DIR, exist_ok=True)

# ========================================================================
# 部位定義
# ========================================================================
GROUP_COLORS_LINEAR = {
    'head':         (1.0, 0.60, 0.60),
    'neck':         (1.0, 0.35, 0.35),
    'shoulder_l':   (0.60, 0.60, 1.0),
    'shoulder_r':   (0.35, 0.35, 1.0),
    'upper_torso':  (1.0, 1.0, 0.35),
    'lower_torso':  (1.0, 0.74, 0.15),
    'hips':         (1.0, 0.50, 0.10),
    'upper_arm_l':  (0.15, 0.60, 1.0),
    'upper_arm_r':  (0.04, 0.50, 1.0),
    'forearm_l':    (0.15, 1.0, 0.60),
    'forearm_r':    (0.04, 0.82, 0.50),
    'hand_l':       (0.35, 1.0, 0.35),
    'hand_r':       (0.15, 0.74, 0.15),
    'thigh_l':      (1.0, 0.35, 1.0),
    'thigh_r':      (0.82, 0.15, 0.82),
    'shin_l':       (0.60, 0.15, 1.0),
    'shin_r':       (0.50, 0.10, 0.82),
    'foot_l':       (1.0, 0.15, 0.15),
    'foot_r':       (0.74, 0.10, 0.10),
    'unknown':      (0.22, 0.22, 0.22),
}

# ボーン名キーワード → 部位グループの自動マッピングルール
# 優先度順（先にマッチしたものが採用される）
# 左右マーカー（各リグ形式に対応）
_L = ['.l', '_l', 'left', '_L', '.L', 'Left']
_R = ['.r', '_r', 'right', '_R', '.R', 'Right']

AUTO_BONE_RULES = [
    # 足指（手指より先に判定。`c_toes_index1.l` のような複合命名で手指ルールが
    # 誤マッチするのを防ぐ）
    (['toe', 'lefttoe', 'righttoe'], _L, 'foot_l'),
    (['toe', 'lefttoe', 'righttoe'], _R, 'foot_r'),
    (['foot', 'leftfoot', 'rightfoot'], _L, 'foot_l'),
    (['foot', 'leftfoot', 'rightfoot'], _R, 'foot_r'),
    # 手指
    (['index', 'middle', 'ring', 'pinky', 'thumb'], _L, 'hand_l'),
    (['index', 'middle', 'ring', 'pinky', 'thumb'], _R, 'hand_r'),
    (['hand', 'lefthand'], _L, 'hand_l'),
    (['hand', 'righthand'], _R, 'hand_r'),
    # 脛
    (['shin', 'calf', 'leg_twist', 'leg_stretch', 'knee', 'leftleg', 'rightleg'], _L, 'shin_l'),
    (['shin', 'calf', 'leg_twist', 'leg_stretch', 'knee', 'leftleg', 'rightleg'], _R, 'shin_r'),
    (['c_leg'], _L, 'shin_l'),
    (['c_leg'], _R, 'shin_r'),
    # 太もも (Mixamo: LeftUpLeg/RightUpLeg)
    (['thigh', 'upleg', 'leftupleg', 'rightupleg'], _L, 'thigh_l'),
    (['thigh', 'upleg', 'leftupleg', 'rightupleg'], _R, 'thigh_r'),
    # 前腕
    (['forearm', 'lowerarm', 'elbow', 'leftforearm', 'rightforearm'], _L, 'forearm_l'),
    (['forearm', 'lowerarm', 'elbow', 'leftforearm', 'rightforearm'], _R, 'forearm_r'),
    # 上腕 (Mixamo: LeftArm/RightArm)
    (['arm_twist', 'arm_stretch', 'upperarm', 'upper_arm', 'leftarm', 'rightarm'], _L, 'upper_arm_l'),
    (['arm_twist', 'arm_stretch', 'upperarm', 'upper_arm', 'leftarm', 'rightarm'], _R, 'upper_arm_r'),
    (['c_arm'], _L, 'upper_arm_l'),
    (['c_arm'], _R, 'upper_arm_r'),
    # 肩
    (['shoulder', 'clavicle', 'leftshoulder', 'rightshoulder'], _L, 'shoulder_l'),
    (['shoulder', 'clavicle', 'leftshoulder', 'rightshoulder'], _R, 'shoulder_r'),
    # 手のひら
    (['palm'], _L, 'hand_l'),
    (['palm'], _R, 'hand_r'),
    # 頭
    (['head', 'jaw', 'eye', 'ear', 'nose', 'lip', 'brow', 'cheek', 'chin',
      'eyelid', 'teeth', 'tong', 'lid', 'temple', 'forehead'], [], 'head'),
    # 首
    (['neck'], [], 'neck'),
    # 胴体上部 (Mixamo: Spine2)
    (['spine_03', 'spine3', 'spine.03', 'chest', 'breast', 'nipple', 'c_spine_03',
      'spine2'], [], 'upper_torso'),
    # 胴体下部 (Mixamo: Spine/Spine1)
    (['spine_02', 'spine.02', 'spine_01', 'spine.01',
      'c_spine_02', 'c_spine_01', 'spine1', 'spine'], [], 'lower_torso'),
    # 腰 (Mixamo: Hips)
    (['root', 'hips', 'pelvis', 'butt', 'genital', 'vagina', 'c_root', 'anus'], [], 'hips'),
]

def auto_map_bone(bone_name, bone_obj=None, _spine_regions=None):
    """ボーン名からキーワードマッチで部位を推定。
    spineチェーンは親子関係+shoulder分岐で分類済みの辞書を優先使用。"""
    bn_lower = bone_name.lower()

    # spine チェーンの事前分類結果を優先
    if _spine_regions and bone_name in _spine_regions:
        return _spine_regions[bone_name]

    # spine ボーンの子孫（head等）は親 spine の分類を継承
    if bone_obj and _spine_regions:
        p = bone_obj.parent
        while p:
            if p.name in _spine_regions:
                parent_region = _spine_regions[p.name]
                # head/neck の spine の子孫は head
                if parent_region in ('head', 'neck'):
                    return 'head'
                break
            p = p.parent

    for keywords, side_markers, region in AUTO_BONE_RULES:
        keyword_match = any(kw in bn_lower for kw in keywords)
        if not keyword_match:
            continue
        if side_markers:
            side_match = any(sm.lower() in bn_lower for sm in side_markers)
            if side_match:
                return region
        else:
            return region
    return 'unknown'

def height_map_region(z_ratio):
    """Z高さ比率(0-1)から部位を推定"""
    if z_ratio >= 0.90: return 'head'
    if z_ratio >= 0.85: return 'neck'
    if z_ratio >= 0.72: return 'upper_torso'
    if z_ratio >= 0.62: return 'lower_torso'
    if z_ratio >= 0.55: return 'hips'
    if z_ratio >= 0.30: return 'thigh'  # 左右不明
    if z_ratio >= 0.08: return 'shin'
    return 'foot'

# ========================================================================
# メイン処理
# ========================================================================
print(f"\n=== Export Model for Preview ===")
print(f"  Output: {OUT_DIR}")
print(f"  Mode: {MODE}")

# MASK解除
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

bpy.context.view_layer.update()

# Body検索
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
body_obj = None

if BODY_NAME:
    body_obj = next((o for o in mesh_objects if o.name == BODY_NAME), None)
else:
    for o in mesh_objects:
        if 'body' in o.name.lower() and not any(x in o.name.lower() for x in
            ['teeth', 'tongue', 'toungue', 'collision', 'cage', 'eye', 'lash']):
            body_obj = o
            break

if not body_obj:
    print("ERROR: Body mesh not found. Available:")
    for o in mesh_objects:
        print(f"  - {o.name}")
    sys.exit(1)

print(f"  Body: {body_obj.name} ({len(body_obj.data.vertices)} verts)")

# ========================================================================
# マッピング構築
# ========================================================================
config_map = None
if MODE == 'config' and CONFIG_PATH:
    with open(CONFIG_PATH) as f:
        config_data = json.load(f)
    config_map = {}
    for region, bone_names in config_data.get('bone_map', {}).items():
        for bn in bone_names:
            config_map[bn] = region
    print(f"  Config loaded: {len(config_map)} bone mappings")

# 頂点グループ情報
vg_idx_to_name = {vg.index: vg.name for vg in body_obj.vertex_groups}
has_vertex_groups = len(body_obj.vertex_groups) > 0

# マッピングモード決定
if MODE == 'bones' and not has_vertex_groups:
    print("  No vertex groups found, falling back to height mode")
    MODE = 'height'

# ボーン→部位マップ構築
# Bodyメッシュに紐づくarmatureを特定
armature_bones = {}
body_armature = None
for mod in body_obj.modifiers:
    if mod.type == 'ARMATURE' and mod.object:
        body_armature = mod.object.data
        break
if not body_armature:
    # フォールバック: 最大ボーン数のarmatureを使用
    body_armature = max(bpy.data.armatures, key=lambda a: len(a.bones))
print(f"  Armature: {body_armature.name} ({len(body_armature.bones)} bones)")

# spine チェーンを解析して、shoulder/arm分岐点を特定
# → 分岐点より上の spine = neck/head、分岐点以下 = torso
spine_chain = []
for bone in body_armature.bones:
    if bone.name.startswith('DEF-spine'):
        spine_chain.append(bone)
spine_chain.sort(key=lambda b: b.head_local.z)

# shoulder/upper_arm ボーンのZ座標から、spine チェーンの分岐点を特定
# DEF-shoulder は DEF-spine の直接の子でないことが多い（Rigify等）ため、
# Z座標の一致で対応する spine を見つける
spine_shoulder_z = None
shoulder_z_values = []
for bone in body_armature.bones:
    bn = bone.name.lower()
    if bone.name.startswith('DEF-') and ('shoulder' in bn or 'clavicle' in bn):
        shoulder_z_values.append(bone.head_local.z)

if shoulder_z_values:
    avg_shoulder_z = sum(shoulder_z_values) / len(shoulder_z_values)
    # shoulder の Z に最も近い spine の head_z を分岐点とする
    best_spine = None
    best_dist = float('inf')
    for sbone in spine_chain:
        d = abs(sbone.tail_local.z - avg_shoulder_z)
        if d < best_dist:
            best_dist = d
            best_spine = sbone
    if best_spine:
        spine_shoulder_z = best_spine.head_local.z
        print(f"  Shoulder Z={avg_shoulder_z:.4f} -> spine branch: {best_spine.name} (z={spine_shoulder_z:.4f})")

# spine の分類: 階層位置ベース
# shoulder 分岐 spine = upper_torso の最上部
# その上 = neck → head
    # 分類ロジック:
    #   shoulder分岐のspineまで = torso系（下からhips→lower_torso→upper_torso）
    #   shoulder分岐より上〜最後の1つ手前 = 全て neck
    #   最後のspine = head
spine_regions = {}
if spine_chain:
    n = len(spine_chain)
    shoulder_idx = None
    if spine_shoulder_z is not None:
        shoulder_idx = min(range(n),
            key=lambda i: abs(spine_chain[i].head_local.z - spine_shoulder_z))

    if shoulder_idx is not None:
        # shoulder以下: hips → lower_torso → upper_torso
        torso_count = shoulder_idx + 1
        for i in range(torso_count):
            if i == 0:
                spine_regions[spine_chain[i].name] = 'hips'
            elif i <= torso_count // 2:
                spine_regions[spine_chain[i].name] = 'lower_torso'
            else:
                spine_regions[spine_chain[i].name] = 'upper_torso'
        # shoulderより上〜最後の1つ手前 = 全て neck
        for i in range(shoulder_idx + 1, n - 1):
            spine_regions[spine_chain[i].name] = 'neck'
        # 最後の1つ = head
        if n > shoulder_idx + 1:
            spine_regions[spine_chain[n - 1].name] = 'head'
    else:
        for i, sbone in enumerate(spine_chain):
            t = i / max(n - 1, 1)
            if t >= 0.85:   spine_regions[sbone.name] = 'head'
            elif t >= 0.70: spine_regions[sbone.name] = 'neck'
            elif t >= 0.40: spine_regions[sbone.name] = 'upper_torso'
            elif t >= 0.15: spine_regions[sbone.name] = 'lower_torso'
            else:           spine_regions[sbone.name] = 'hips'

    print("  Spine chain classification:")
    for sbone in spine_chain:
        r = spine_regions.get(sbone.name, '?')
        print(f"    {sbone.name:25s} z={sbone.head_local.z:.4f}-{sbone.tail_local.z:.4f} -> {r}")

for bone in body_armature.bones:
    armature_bones[bone.name] = bone
    if not bone.name.startswith('DEF-'):
        armature_bones[f'DEF-{bone.name}'] = bone

bone_to_region = {}
if MODE in ('bones', 'config'):
    mapped_count = {}
    for vg in body_obj.vertex_groups:
        if config_map:
            region = config_map.get(vg.name, 'unknown')
        else:
            bone_obj = armature_bones.get(vg.name)
            region = auto_map_bone(vg.name, bone_obj, spine_regions)
        bone_to_region[vg.name] = region
        mapped_count[region] = mapped_count.get(region, 0) + 1

    print("  Bone mapping results:")
    for r, c in sorted(mapped_count.items()):
        print(f"    {r}: {c} bones")

    # マッピング結果をJSONに保存（確認・修正用）
    mapping_out = os.path.join(OUT_DIR, 'bone_mapping.json')
    with open(mapping_out, 'w') as f:
        json.dump({
            'mode': MODE,
            'model': os.path.basename(bpy.data.filepath),
            'bone_map': {vg.name: bone_to_region.get(vg.name, 'unknown')
                         for vg in body_obj.vertex_groups},
        }, f, indent=2)
    print(f"  Saved mapping: {mapping_out}")

# ========================================================================
# Body に頂点カラーを適用
# ========================================================================
print("  Applying vertex colors...")

dg = bpy.context.evaluated_depsgraph_get()
eo = body_obj.evaluated_get(dg)
body_mesh_data = bpy.data.meshes.new_from_object(eo)
body_mesh_data.transform(body_obj.matrix_world)

# 頂点カラー作成（削除不可の必須 color attribute があるモデル対策）
for ca in list(body_mesh_data.color_attributes):
    if ca.name == 'RegionColor': continue
    try: body_mesh_data.color_attributes.remove(ca)
    except (RuntimeError, Exception): pass
existing = body_mesh_data.color_attributes.get('RegionColor')
if existing and (existing.data_type != 'BYTE_COLOR' or existing.domain != 'CORNER'):
    try: body_mesh_data.color_attributes.remove(existing); existing = None
    except (RuntimeError, Exception): pass
color_attr = existing or body_mesh_data.color_attributes.new(
    name="RegionColor", type='BYTE_COLOR', domain='CORNER')
# アクティブに設定してマテリアルから参照されるように
try: body_mesh_data.color_attributes.active_color = color_attr
except AttributeError: pass

# ========================================================================
# 胴体＋肩 ランドマーク抽出（世界座標）
#   胴体（hips/lower_torso/upper_torso）と肩（shoulder_l/r）はウェイトが
#   跨ぐため境界が曖昧。解剖学ボーンのランドマークで再分類する。
#   - 胴体: Z 座標の帯で分離
#   - 肩: 肩/鎖骨ボーンのセグメント距離で分離
# ========================================================================
armature_obj_ref = None
for mod in body_obj.modifiers:
    if mod.type == 'ARMATURE' and mod.object:
        armature_obj_ref = mod.object
        break

def _bw(bone, use_tail=False):
    """ボーン head/tail を世界座標で取得"""
    p = bone.tail_local if use_tail else bone.head_local
    return (armature_obj_ref.matrix_world @ p) if armature_obj_ref else p.copy()

def _side_of(bn_lower):
    if any(m in bn_lower for m in ['.l', '_l', 'left']): return 'l'
    if any(m in bn_lower for m in ['.r', '_r', 'right']): return 'r'
    return None

def _match_any(bn, patterns):
    return any(p in bn for p in patterns)

def _is_ctrl(bn):
    return any(x in bn for x in ['stretch', 'twist', '_ik', '.ik', 'ctrl', 'tweak', '.twk'])

# body中心X（左右判定基準、フォールバック用）
_body_xs = [v.co.x for v in body_mesh_data.vertices]
body_center_x = (min(_body_xs) + max(_body_xs)) / 2 if _body_xs else 0.0

# shoulder / clavicle ボーン（side付き、ctrl除く）
shoulder_bones = []
for bone in body_armature.bones:
    bn = bone.name.lower()
    if not _match_any(bn, ['shoulder', 'clavicle']): continue
    if _is_ctrl(bn): continue
    side = _side_of(bn)
    if side: shoulder_bones.append((bone, side))

# chest 系（breast/nipple/pectoral、ctrl除外せず — 通常ボーンでない場合も位置指標として使える）
chest_mark_bones = []
for bone in body_armature.bones:
    bn = bone.name.lower()
    if _match_any(bn, ['breast', 'nipple', 'pectoral']):
        chest_mark_bones.append(bone)

# pelvis / root 系
pelvis_bones = []
for bone in body_armature.bones:
    bn = bone.name.lower()
    if _match_any(bn, ['pelvis', 'c_root']) and 'rotate' not in bn:
        pelvis_bones.append(bone)

# neck 系
neck_bones = []
for bone in body_armature.bones:
    bn = bone.name.lower()
    if 'neck' in bn and not _is_ctrl(bn):
        neck_bones.append(bone)

# 胴体 spine 系（DEF/prefix無し両対応）
torso_spine_bones = []
for bone in body_armature.bones:
    bn = bone.name.lower()
    if not _match_any(bn, ['spine', 'chest', 'torso', 'back']): continue
    if _is_ctrl(bn): continue
    torso_spine_bones.append(bone)
torso_spine_bones.sort(key=lambda b: _bw(b).z)

# ランドマーク計算
torso_hips_top_z = None
if pelvis_bones:
    torso_hips_top_z = max(_bw(b, use_tail=True).z for b in pelvis_bones)
elif torso_spine_bones:
    torso_hips_top_z = _bw(torso_spine_bones[0]).z

torso_shoulder_top_z = None
if shoulder_bones:
    torso_shoulder_top_z = sum(_bw(b).z for b, _ in shoulder_bones) / len(shoulder_bones)
elif neck_bones:
    torso_shoulder_top_z = min(_bw(b).z for b in neck_bones)

torso_chest_z = None
if chest_mark_bones:
    torso_chest_z = sum(_bw(b).z for b in chest_mark_bones) / len(chest_mark_bones)
elif torso_hips_top_z is not None and torso_shoulder_top_z is not None:
    torso_chest_z = torso_hips_top_z + (torso_shoulder_top_z - torso_hips_top_z) * 0.55

# neck 下端（肩帯 Z 上限の代替）
torso_shoulder_band_top_z = None
if neck_bones:
    torso_shoulder_band_top_z = min(_bw(b).z for b in neck_bones)
elif torso_shoulder_top_z is not None:
    # shoulder ボーン Z + 肩ボーン長の30%をキャップとする
    if shoulder_bones:
        avg_sh_len = sum((_bw(b, use_tail=True) - _bw(b)).length for b, _ in shoulder_bones) / len(shoulder_bones)
        torso_shoulder_band_top_z = torso_shoulder_top_z + avg_sh_len * 0.3

# 肩セグメント（世界座標、side付き）
shoulder_segs = []  # list of (head, tail, side)
for bone, side in shoulder_bones:
    shoulder_segs.append((_bw(bone), _bw(bone, use_tail=True), side))

# 肩セグメントの平均長 × 閾値係数 = 肩近傍の距離閾値
shoulder_dist_threshold = None
if shoulder_segs:
    avg_len = sum((t - h).length for h, t, _ in shoulder_segs) / len(shoulder_segs)
    shoulder_dist_threshold = avg_len * 0.55

def dist_to_seg_xz(p, a, b):
    """XZ平面上の距離（Y=前後は無視）— 背中側も肩として捕捉するため"""
    p2x, p2z = p.x, p.z
    a2x, a2z = a.x, a.z
    abx, abz = b.x - a2x, b.z - a2z
    al_sq = abx*abx + abz*abz
    if al_sq < 1e-10:
        return math.hypot(p2x - a2x, p2z - a2z)
    t = max(0.0, min(1.0, ((p2x - a2x)*abx + (p2z - a2z)*abz) / al_sq))
    cx, cz = a2x + t*abx, a2z + t*abz
    return math.hypot(p2x - cx, p2z - cz)

def nearest_shoulder_side(p):
    """肩ボーン近傍（XZ平面）なら side('l'/'r')、そうでないなら None"""
    if not shoulder_segs or shoulder_dist_threshold is None: return None
    best_side, best_d = None, float('inf')
    for h, t, side in shoulder_segs:
        d = dist_to_seg_xz(p, h, t)
        if d < best_d:
            best_d = d; best_side = side
    if best_d < shoulder_dist_threshold:
        return best_side
    return None

can_reclass = all(v is not None for v in
                  (torso_hips_top_z, torso_chest_z, torso_shoulder_top_z))

print(f"  Torso/shoulder landmarks:")
print(f"    hips_top_z         = {torso_hips_top_z}")
print(f"    chest_z            = {torso_chest_z}")
print(f"    shoulder_top_z     = {torso_shoulder_top_z}")
print(f"    shoulder_band_top  = {torso_shoulder_band_top_z}")
print(f"    shoulder segs      = {len(shoulder_segs)} (threshold={shoulder_dist_threshold})")
print(f"    body_center_x      = {body_center_x:.4f}")
print(f"    reclassify enabled : {can_reclass}")

if MODE == 'height':
    # 高さベース
    all_z = [v.co.z for v in body_mesh_data.vertices]
    min_z, max_z = min(all_z), max(all_z)
    z_range = max_z - min_z if max_z > min_z else 1.0

    # X中心を計算（左右判定用）
    all_x = [v.co.x for v in body_mesh_data.vertices]
    center_x = (min(all_x) + max(all_x)) / 2

    for poly in body_mesh_data.polygons:
        for loop_idx in poly.loop_indices:
            vi = body_mesh_data.loops[loop_idx].vertex_index
            v = body_mesh_data.vertices[vi]
            t = (v.co.z - min_z) / z_range
            base_region = height_map_region(t)

            # 左右判定（腕・脚系）
            if base_region in ('thigh', 'shin', 'foot'):
                side = '_l' if v.co.x > center_x else '_r'
                region = base_region + side
            elif t > 0.55 and abs(v.co.x - center_x) > z_range * 0.12:
                # 腕領域（体の横に出ている部分）
                side = '_l' if v.co.x > center_x else '_r'
                if t > 0.80:
                    region = 'upper_arm' + side
                elif t > 0.70:
                    region = 'forearm' + side
                else:
                    region = 'hand' + side
            else:
                region = base_region

            col = GROUP_COLORS_LINEAR.get(region, (0.22, 0.22, 0.22))
            color_attr.data[loop_idx].color = (col[0], col[1], col[2], 1.0)
else:
    # ボーンウェイトベース
    # 同じ部位グループに属するボーンのウェイトを合算してからグループ間で比較
    orig_verts = body_obj.data.vertices
    RECLASSIFY_SET = {'hips', 'lower_torso', 'upper_torso', 'shoulder_l', 'shoulder_r'}
    reclass_stats = {'changed': 0, 'total_in_set': 0}

    for poly in body_mesh_data.polygons:
        for loop_idx in poly.loop_indices:
            vi = body_mesh_data.loops[loop_idx].vertex_index
            if vi < len(orig_verts):
                orig_v = orig_verts[vi]
                region_weights = {}  # region -> total weight
                for g in orig_v.groups:
                    vg_name = vg_idx_to_name.get(g.group, '')
                    region = bone_to_region.get(vg_name, 'unknown')
                    if region != 'unknown':
                        region_weights[region] = region_weights.get(region, 0.0) + g.weight
                best_region = 'unknown'
                best_weight = 0.0
                for region, total_w in region_weights.items():
                    if total_w > best_weight:
                        best_weight = total_w
                        best_region = region

                # 胴体＋肩のみ ランドマークで再分類
                if can_reclass and best_region in RECLASSIFY_SET:
                    reclass_stats['total_in_set'] += 1
                    prev = best_region
                    vco = body_mesh_data.vertices[vi].co
                    vz = vco.z
                    # 肩帯判定の上限: neck 下端 or shoulder_top + 余裕
                    _band_top = torso_shoulder_band_top_z if torso_shoulder_band_top_z is not None else torso_shoulder_top_z
                    if vz < torso_hips_top_z:
                        best_region = 'hips'
                    elif vz < torso_chest_z:
                        best_region = 'lower_torso'
                    elif vz < _band_top:
                        # 肩帯: 肩ボーンセグメント近傍なら shoulder、それ以外は upper_torso
                        side = nearest_shoulder_side(vco)
                        if side is not None:
                            best_region = 'shoulder_' + side
                        else:
                            best_region = 'upper_torso'
                    else:
                        # neck/head 領域。torso系ウェイトの漏れを吸収
                        best_region = 'upper_torso'
                    if best_region != prev:
                        reclass_stats['changed'] += 1

                col = GROUP_COLORS_LINEAR.get(best_region, (0.22, 0.22, 0.22))
            else:
                col = (0.22, 0.22, 0.22)
            color_attr.data[loop_idx].color = (col[0], col[1], col[2], 1.0)

    if can_reclass:
        print(f"  Reclassified {reclass_stats['changed']}/{reclass_stats['total_in_set']} loops in torso+shoulder")

# Bodyオブジェクト作成
body_export = bpy.data.objects.new("Body_Regions", body_mesh_data)

# 全マテリアルスロットをクリアしてからRegionMaterial1つだけ設定
body_mesh_data.materials.clear()
mat = bpy.data.materials.new("RegionMaterial")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
vcol = nodes.new('ShaderNodeVertexColor')
vcol.layer_name = "RegionColor"
links.new(vcol.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.8
bsdf.inputs['Metallic'].default_value = 0.0
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
body_mesh_data.materials.append(mat)

# 全ポリゴンのマテリアルインデックスを0（RegionMaterial）に統一
for poly in body_mesh_data.polygons:
    poly.material_index = 0

# ========================================================================
# GLBエクスポート
# ========================================================================
# 全オブジェクト非選択（ops.select_allはpoll失敗することがあるため直接操作）
for obj in bpy.context.view_layer.objects:
    try: obj.select_set(False)
    except RuntimeError: pass
for obj in bpy.context.scene.objects:
    obj.hide_viewport = True

# Body エクスポート
export_col = bpy.data.collections.new("ExportTemp")
bpy.context.scene.collection.children.link(export_col)
export_col.objects.link(body_export)
body_export.hide_viewport = False
body_export.select_set(True)
bpy.context.view_layer.objects.active = body_export

body_path = os.path.join(OUT_DIR, 'body_regions.glb')
try:
    bpy.ops.export_scene.gltf(
        filepath=body_path,
        use_selection=True,
        export_format='GLB',
        export_colors=True,
        export_normals=True,
        export_apply=True,
    )
except TypeError:
    bpy.ops.export_scene.gltf(
        filepath=body_path,
        use_selection=True,
        export_format='GLB',
        export_normals=True,
        export_apply=True,
    )
print(f"  Exported body: {body_path}")

# 衣装パーツ エクスポート
if PART_NAMES:
    parts_to_export = PART_NAMES
else:
    # Body以外の全メッシュを衣装候補とする
    parts_to_export = [o.name for o in mesh_objects
                       if o != body_obj and not o.name.startswith('WGT-')
                       and not any(x in o.name.lower() for x in
                           ['teeth', 'tongue', 'toungue', 'iris', 'eye', 'lash',
                            'rig_', 'physics', 'plane', 'cube', 'throwdown'])]

exported_parts = []
for pname in parts_to_export:
    part = next((o for o in mesh_objects if o.name == pname), None)
    if not part:
        print(f"  SKIP (not found): {pname}")
        continue

    # 評価済みメッシュ
    try:
        dg2 = bpy.context.evaluated_depsgraph_get()
        eo2 = part.evaluated_get(dg2)
        part_mesh = bpy.data.meshes.new_from_object(eo2)
        part_mesh.transform(part.matrix_world)
    except Exception as e:
        print(f"  SKIP (error): {pname}: {e}")
        continue

    if len(part_mesh.vertices) == 0:
        print(f"  SKIP (empty): {pname}")
        continue

    # 簡易マテリアル
    pmat = bpy.data.materials.new(f"Mat_{pname}")
    pmat.use_nodes = True
    pn = pmat.node_tree.nodes
    pn.clear()
    po = pn.new('ShaderNodeOutputMaterial')
    pb = pn.new('ShaderNodeBsdfPrincipled')
    pb.inputs['Base Color'].default_value = (0.85, 0.85, 0.95, 1.0)
    pb.inputs['Roughness'].default_value = 0.5
    pmat.node_tree.links.new(pb.outputs['BSDF'], po.inputs['Surface'])
    part_mesh.materials.clear()
    part_mesh.materials.append(pmat)

    part_export = bpy.data.objects.new(f"Part_{pname}", part_mesh)
    export_col.objects.link(part_export)
    part_export.hide_viewport = False

    for obj in bpy.context.view_layer.objects:
        try: obj.select_set(False)
        except RuntimeError: pass
    part_export.select_set(True)
    bpy.context.view_layer.objects.active = part_export

    safe_name = pname.lower().replace(' ', '_').replace('-', '_').replace('__', '_').strip('_')
    part_path = os.path.join(OUT_DIR, f'part_{safe_name}.glb')
    try:
        bpy.ops.export_scene.gltf(
            filepath=part_path,
            use_selection=True,
            export_format='GLB',
            export_normals=True,
            export_apply=True,
        )
    except TypeError:
        bpy.ops.export_scene.gltf(
            filepath=part_path,
            use_selection=True,
            export_format='GLB',
        )
    exported_parts.append({'name': pname, 'file': f'part_{safe_name}.glb'})
    print(f"  Exported part: {pname} -> {part_path}")

# マニフェスト出力
manifest = {
    'model': os.path.basename(bpy.data.filepath),
    'mode': MODE,
    'body_glb': 'body_regions.glb',
    'parts': exported_parts,
    'regions': list(GROUP_COLORS_LINEAR.keys()),
}
manifest_path = os.path.join(OUT_DIR, 'manifest.json')
with open(manifest_path, 'w') as f:
    json.dump(manifest, f, indent=2)
print(f"  Manifest: {manifest_path}")

print(f"\n  Total: 1 body + {len(exported_parts)} parts exported")
print("  Done!")
