"""基準Bodyに体型を寄せてボクセル化するスクリプト。
voxelize_body_only.py の処理後に、基準Body VOXとのスライス差分で体型補正を行う。

Usage:
  blender --background --python voxelize_body_normalized.py -- <input> <output.vox> [resolution] \
    --base-body <base_body.vox> [--blend-rate 0.5] [--no-deform]

Arguments:
  input         : .blend / .fbx / .glb ファイル
  output.vox    : 出力VOXパス
  resolution    : グリッド解像度（デフォルト: 250）
  --base-body   : 基準Body VOXファイルパス（Queen Marika等）
  --blend-rate  : 適用率 0.0-1.0（デフォルト: 0.5）  0.0=元のまま, 1.0=完全に基準体型
  --no-deform   : チビ変形を無効化
"""
import bpy
import bmesh
import sys
import os
import struct
import math
import json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ========================================================================
# コマンドライン引数パース
# ========================================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
NO_DEFORM = '--no-deform' in args

# --base-body と --blend-rate を抽出
BASE_BODY_PATH = None
BLEND_RATE = 0.5
for i, a in enumerate(args):
    if a == '--base-body' and i + 1 < len(args):
        BASE_BODY_PATH = args[i + 1]
    if a == '--blend-rate' and i + 1 < len(args):
        BLEND_RATE = float(args[i + 1])

pos_args = [a for a in args if not a.startswith('--') and args[max(0, args.index(a)-1)] not in ('--base-body', '--blend-rate')]
# 安全なパース: flagの値を除外
clean_args = []
skip_next = False
for a in args:
    if skip_next:
        skip_next = False
        continue
    if a in ('--base-body', '--blend-rate'):
        skip_next = True
        continue
    if a.startswith('--'):
        continue
    clean_args.append(a)

INPUT_PATH = clean_args[0]
OUT_PATH = clean_args[1]
RESOLUTION = int(clean_args[2]) if len(clean_args) > 2 else 250

print(f"=== voxelize_body_normalized ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output: {OUT_PATH}")
print(f"  Resolution: {RESOLUTION}")
print(f"  Base body: {BASE_BODY_PATH}")
print(f"  Blend rate: {BLEND_RATE}")
print(f"  No deform: {NO_DEFORM}")

if not BASE_BODY_PATH or not os.path.exists(BASE_BODY_PATH):
    print(f"ERROR: --base-body is required and must exist: {BASE_BODY_PATH}")
    sys.exit(1)

# ========================================================================
# 基準Body VOXの読み込みとスライスプロファイル生成
# ========================================================================
def parse_vox_file(path):
    """VOXファイルをパースして (voxels_list, palette, sx, sy, sz) を返す。"""
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'VOX ':
        raise ValueError("Not a VOX file")
    # skip magic(4) + version(4)
    sx = sy = sz = 0
    voxels = []
    palette = [(i, i, i) for i in range(256)]

    def parse_chunks(start, end):
        nonlocal sx, sy, sz
        offset = start
        while offset < end:
            if offset + 12 > end:
                break
            chunk_id = data[offset:offset+4].decode('ascii', errors='replace')
            chunk_size = struct.unpack_from('<I', data, offset+4)[0]
            child_size = struct.unpack_from('<I', data, offset+8)[0]
            content_start = offset + 12
            if chunk_id == 'MAIN':
                # MAINの子チャンクを再帰パース
                parse_chunks(content_start + chunk_size, content_start + chunk_size + child_size)
            elif chunk_id == 'SIZE':
                sx, sy, sz = struct.unpack_from('<III', data, content_start)
            elif chunk_id == 'XYZI':
                count = struct.unpack_from('<I', data, content_start)[0]
                for i in range(count):
                    x, y, z, ci = struct.unpack_from('<BBBB', data, content_start + 4 + i * 4)
                    voxels.append((x, y, z, ci))
            elif chunk_id == 'RGBA':
                for i in range(256):
                    r, g, b, a = struct.unpack_from('<BBBB', data, content_start + i * 4)
                    palette[i] = (r, g, b)
            offset += 12 + chunk_size + child_size

    parse_chunks(8, len(data))
    return voxels, palette, sx, sy, sz

def build_slice_profile(voxels):
    """Z軸ごとのスライスプロファイルを生成。"""
    slices = {}
    for x, y, z, _ in voxels:
        if z not in slices:
            slices[z] = {'xs': [], 'ys': []}
        slices[z]['xs'].append(x)
        slices[z]['ys'].append(y)
    profiles = {}
    for z, data in slices.items():
        xs, ys = data['xs'], data['ys']
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        profiles[z] = {
            'center_x': (min_x + max_x) / 2.0,
            'center_y': (min_y + max_y) / 2.0,
            'width': max_x - min_x + 1,
            'depth': max_y - min_y + 1,
            'count': len(xs),
        }
    return profiles

def find_nearest_profile(profiles, target_z):
    """最も近いZのプロファイルを返す。"""
    best_z = None
    best_dist = float('inf')
    for z in profiles:
        d = abs(z - target_z)
        if d < best_dist:
            best_dist = d
            best_z = z
    return profiles[best_z] if best_z is not None else None

# 基準Body読み込み
print("  Loading base body VOX...")
base_voxels, base_palette, base_sx, base_sy, base_sz = parse_vox_file(BASE_BODY_PATH)
base_profile = build_slice_profile(base_voxels)
base_zs = sorted(base_profile.keys())
base_min_z = min(base_zs)
base_max_z = max(base_zs)
base_height = base_max_z - base_min_z + 1
print(f"  Base body: {base_sx}x{base_sy}x{base_sz}, {len(base_voxels)} voxels, Z range {base_min_z}-{base_max_z}")

def find_clusters_in_slice(voxel_positions_in_slice):
    """スライス内のボクセル座標(x,y)の連結成分を検出する。
    隣接 = 上下左右 (4連結)
    Returns: list of sets, 各setは連結成分のボクセル座標集合
    """
    pos_set = set(voxel_positions_in_slice)
    visited = set()
    clusters = []
    for pos in pos_set:
        if pos in visited:
            continue
        # BFS
        cluster = set()
        queue = [pos]
        while queue:
            p = queue.pop()
            if p in visited:
                continue
            visited.add(p)
            cluster.add(p)
            x, y = p
            for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
                nb = (x+dx, y+dy)
                if nb in pos_set and nb not in visited:
                    queue.append(nb)
        clusters.append(cluster)
    return clusters

def cluster_profile(cluster):
    """クラスタの幅/奥行/中心を計算。"""
    xs = [p[0] for p in cluster]
    ys = [p[1] for p in cluster]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return {
        'center_x': (min_x + max_x) / 2.0,
        'center_y': (min_y + max_y) / 2.0,
        'width': max_x - min_x + 1,
        'depth': max_y - min_y + 1,
    }

def normalize_voxels(voxel_dict, blend_rate):
    """ボクセル辞書を基準Bodyに向けて補正する。
    クラスタベース: 各スライスで連結成分分析を行い、最大クラスタ（胴体）のみ補正。
    腕や離れたパーツはそのまま保持。
    """
    if blend_rate <= 0 or not voxel_dict:
        return voxel_dict

    # Zごとにボクセルをグループ化
    z_groups = {}
    for (vx, vy, vz), col in voxel_dict.items():
        if vz not in z_groups:
            z_groups[vz] = []
        z_groups[vz].append((vx, vy, col))

    src_zs = sorted(z_groups.keys())
    src_min_z = min(src_zs)
    src_max_z = max(src_zs)
    src_height = src_max_z - src_min_z + 1

    # 足先スキップ: 最下部5%のスライスは補正しない（ヒール/フラット差の影響回避）
    foot_skip_z = src_min_z + int(src_height * 0.05)

    result = {}

    for vz in src_zs:
        entries = z_groups[vz]

        # 足先領域はスキップ
        if vz < foot_skip_z:
            for (vx, vy, col) in entries:
                result[(vx, vy, vz)] = col
            continue

        # このスライスの連結成分分析
        xy_positions = [(vx, vy) for (vx, vy, _) in entries]
        clusters = find_clusters_in_slice(xy_positions)

        if not clusters:
            for (vx, vy, col) in entries:
                result[(vx, vy, vz)] = col
            continue

        # 最大クラスタ = 胴体（体幹）と見なす
        largest = max(clusters, key=len)
        largest_set = largest
        torso_prof = cluster_profile(largest)

        # 基準BodyのZにマッピング
        t = (vz - src_min_z) / max(src_height - 1, 1)
        mapped_z = int(round(base_min_z + t * (base_height - 1)))
        bp = base_profile.get(mapped_z) or find_nearest_profile(base_profile, mapped_z)

        # 基準プロファイルが無い or 胴体クラスタが小さすぎる場合はスキップ
        if not bp or bp['width'] < 2 or torso_prof['width'] < 2:
            for (vx, vy, col) in entries:
                result[(vx, vy, vz)] = col
            continue

        # 補正スケール（胴体クラスタの幅に基づく）
        target_width = torso_prof['width'] - (torso_prof['width'] - bp['width']) * blend_rate
        scale_x = target_width / torso_prof['width']

        target_depth = torso_prof['depth'] - (torso_prof['depth'] - bp['depth']) * blend_rate
        scale_y = target_depth / torso_prof['depth']

        # 各ボクセルを処理
        for (vx, vy, col) in entries:
            if (vx, vy) in largest_set:
                # 胴体クラスタ: 補正適用
                rel_x = vx - torso_prof['center_x']
                rel_y = vy - torso_prof['center_y']
                new_x = int(round(torso_prof['center_x'] + rel_x * scale_x))
                new_y = int(round(torso_prof['center_y'] + rel_y * scale_y))
                new_x = max(0, min(255, new_x))
                new_y = max(0, min(255, new_y))
                pos = (new_x, new_y, vz)
                if pos not in result:
                    result[pos] = col
            else:
                # 腕等の非胴体クラスタ: そのまま
                pos = (vx, vy, vz)
                if pos not in result:
                    result[pos] = col

    return result

# ========================================================================
# Blenderファイル読み込み（voxelize_body_only.py と同一）
# ========================================================================
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext in ('.glb', '.gltf'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# MASKモディファイア無効化
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

# 衣装シェイプキーのリセットとSURFACE_DEFORMモディファイアの除去
KEEP_SHAPEKEYS = '--keep-shapekeys' in argv
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or 'body' not in obj.name.lower():
        continue
    if obj.data.shape_keys:
        for kb in obj.data.shape_keys.key_blocks:
            if kb.name.startswith('Clothes_'):
                if KEEP_SHAPEKEYS:
                    print(f"  Keep shape key '{kb.name}' on {obj.name}: {kb.value:.1f} (unchanged)")
                else:
                    print(f"  Reset shape key '{kb.name}' on {obj.name}: {kb.value:.1f} -> 0.0")
                    kb.value = 0.0
    for mod in list(obj.modifiers):
        if mod.type == 'SURFACE_DEFORM':
            print(f"  Removed modifier '{mod.name}' on {obj.name}")
            obj.modifiers.remove(mod)

# バックグラウンドモードでテクスチャ画像を強制ロード
blend_dir = os.path.dirname(os.path.abspath(INPUT_PATH))
loaded_count = 0
for img in bpy.data.images:
    if img.size[0] == 0 and img.filepath:
        abs_path = bpy.path.abspath(img.filepath, library=img.library)
        if not os.path.isabs(abs_path):
            abs_path = os.path.join(blend_dir, abs_path)
        if os.path.exists(abs_path):
            img.filepath = abs_path
            img.reload()
            if img.size[0] > 0:
                loaded_count += 1
print(f"  Force-loaded {loaded_count} textures")

bpy.context.view_layer.update()

# --body-name パラメータ（ボディメッシュ名を直接指定）
BODY_NAME = None
for i, a in enumerate(args):
    if a == '--body-name' and i + 1 < len(args):
        BODY_NAME = args[i + 1]

# ボディメッシュを検索
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
if BODY_NAME:
    body_objs = [o for o in mesh_objects if o.name == BODY_NAME]
else:
    body_objs = [o for o in mesh_objects if 'body' in o.name.lower() and
                 not any(x in o.name.lower() for x in ['teeth', 'tongue', 'toungue'])]
print(f"  Body objects: {[o.name for o in body_objs]}")

if not body_objs:
    print("ERROR: No body mesh found")
    sys.exit(1)

# バウンディングボックスを計算
min_co = Vector((1e9, 1e9, 1e9))
max_co = Vector((-1e9, -1e9, -1e9))
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            min_co[i] = min(min_co[i], v.co[i])
            max_co[i] = max(max_co[i], v.co[i])
    eo.to_mesh_clear()

size = max_co - min_co
center = (min_co + max_co) / 2
model_h = size.z
print(f"  Body BBox: {size.x:.3f} x {size.y:.3f} x {size.z:.3f}, h={model_h:.4f}")

# チビ変形関数
def deform_point(co):
    if NO_DEFORM:
        return co.copy()
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.90:
        ht = (t - 0.90) / 0.10
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        z = z + ht * model_h * 0.06
    elif t > 0.85:
        nt = (t - 0.85) / 0.05
        smooth = nt * nt * (3 - 2 * nt)
        s = 1.1 + (1.5 - 1.1) * smooth
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
    elif t > 0.50:
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
    else:
        leg_t = t / 0.50
        f = 0.70 * leg_t + 0.30 * leg_t * leg_t
        z = min_co.z + f * 0.50 * model_h
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x += sign * spread
    return Vector((x, y, z))

def inv_deform(co):
    if NO_DEFORM:
        return co.copy()
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.90:
        ht = min(1, (t - 0.90) / 0.10)
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) / s
        y = center.y + (y - center.y) / s
        z = z - ht * model_h * 0.06
    elif t > 0.85:
        nt = (t - 0.85) / 0.05
        smooth = nt * nt * (3 - 2 * nt)
        s = 1.1 + (1.5 - 1.1) * smooth
        x = center.x + (x - center.x) / s
        y = center.y + (y - center.y) / s
    elif t > 0.50:
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    else:
        u = (z - min_co.z) / (0.50 * model_h) if model_h > 0 else 0
        u = max(0, min(1, u))
        disc = 0.49 + 1.20 * u
        r = (-0.70 + math.sqrt(disc)) / 0.60 if disc >= 0 else 0
        r = max(0, min(1, r))
        leg_t = r
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x -= sign * spread
        z = min_co.z + r * 0.50 * model_h
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    return Vector((x, y, z))

# 変形後バウンディングボックス
def_min = Vector((1e9, 1e9, 1e9))
def_max = Vector((-1e9, -1e9, -1e9))
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        dc = deform_point(v.co)
        for i in range(3):
            def_min[i] = min(def_min[i], dc[i])
            def_max[i] = max(def_max[i], dc[i])
    eo.to_mesh_clear()

def_size = def_max - def_min
voxel_size = max(def_size) / RESOLUTION
thr = voxel_size * 1.0  # メッシュ表面から1ボクセル分の距離
margin = 2
grid_origin = def_min - Vector((voxel_size * margin, voxel_size * margin, voxel_size * margin))
gx = min(256, int(math.ceil(def_size.x / voxel_size)) + margin * 2 + 2)
gy = min(256, int(math.ceil(def_size.y / voxel_size)) + margin * 2 + 2)
gz = min(256, int(math.ceil(def_size.z / voxel_size)) + margin * 2 + 2)
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.4f}")

# ========================================================================
# テクスチャサンプリング
# ========================================================================
texture_cache = {}
def cache_texture(image):
    if image.name in texture_cache: return
    w, h = image.size
    if w == 0 or h == 0: return
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    texture_cache[image.name] = {'w': w, 'h': h, 'px': pixels}
    print(f"  Cached texture: {image.name} ({w}x{h})")

def sample_texture(tex_name, uv_x, uv_y):
    tc = texture_cache.get(tex_name)
    if not tc: return (0.7, 0.5, 0.4)
    px_x = int(uv_x * tc['w']) % tc['w']
    px_y = int(uv_y * tc['h']) % tc['h']
    pixel = tc['px'][px_y, px_x]
    return (float(pixel[0]), float(pixel[1]), float(pixel[2]))

# ノードツリー評価
def find_input_link(node_tree, node, socket_name):
    for link in node_tree.links:
        if link.to_node == node and link.to_socket.name == socket_name:
            return link
    return None

def trace_input(node_tree, node, socket_name):
    inp = node.inputs.get(socket_name)
    if inp is None: return ('value', 0.0)
    link = find_input_link(node_tree, node, socket_name)
    if link is None:
        val = inp.default_value
        if hasattr(val, '__len__') and len(val) >= 3:
            return ('color', (float(val[0]), float(val[1]), float(val[2])))
        return ('value', float(val))
    return trace_output(node_tree, link.from_node, link.from_socket)

def make_mix(blend_type, fac_tree, a_tree, b_tree):
    if fac_tree[0] == 'value':
        fac = fac_tree[1]
        if fac <= 0.001: return a_tree
        if fac >= 0.999 and blend_type == 'MIX': return b_tree
    return ('mix', blend_type, fac_tree, a_tree, b_tree)

def trace_output(node_tree, node, output_socket):
    if node.type == 'TEX_IMAGE' and node.image:
        cache_texture(node.image)
        return ('texture', node.image.name)
    elif node.type == 'REROUTE':
        # Rerouteノードは入力をそのまま出力する
        return trace_input(node_tree, node, 'Input')
    elif node.type == 'GROUP' and node.node_tree:
        # MustardUI等の複雑なグループ: まず外部の'Diffuse'入力を優先トレース
        diffuse_inp = node.inputs.get('Diffuse')
        if diffuse_inp:
            link = find_input_link(node_tree, node, 'Diffuse')
            if link:
                return trace_output(node_tree, link.from_node, link.from_socket)
        # Diffuseが無い場合、内部のBSDF_PRINCIPLEDを探す
        inner_tree = node.node_tree
        for inner_nd in inner_tree.nodes:
            if inner_nd.type == 'BSDF_PRINCIPLED':
                bc = inner_nd.inputs.get('Base Color')
                if bc and bc.is_linked:
                    result = trace_input(inner_tree, inner_nd, 'Base Color')
                    if result[0] == 'group_input':
                        socket_name = result[1]
                        return trace_input(node_tree, node, socket_name)
                    return result
                elif bc:
                    val = bc.default_value
                    if hasattr(val, '__len__') and len(val) >= 3:
                        return ('color', (float(val[0]), float(val[1]), float(val[2])))
        # BSDFもDiffuseも無い場合（TextureSelector等）:
        # フォールバック: 外部から接続されたテクスチャ入力の中で最初に見つかったものを使用
        # （TextureSelector等ではTexture 1がデフォルト選択される）
        for inp in node.inputs:
            link = find_input_link(node_tree, node, inp.name)
            if link and link.from_node.type == 'TEX_IMAGE' and link.from_node.image:
                cache_texture(link.from_node.image)
                print(f"    GROUP fallback: using first texture input '{inp.name}' -> {link.from_node.image.name}")
                return ('texture', link.from_node.image.name)
        return ('color', (0.7, 0.5, 0.4))
    elif node.type == 'GROUP_INPUT':
        if output_socket:
            return ('group_input', output_socket.name)
        return ('color', (0.7, 0.5, 0.4))
    elif node.type == 'MIX':
        bt = node.blend_type if hasattr(node, 'blend_type') else 'MIX'
        fac = trace_input(node_tree, node, 'Factor')
        a = trace_input(node_tree, node, 'A')
        b = trace_input(node_tree, node, 'B')
        return make_mix(bt, fac, a, b)
    elif node.type == 'MIX_RGB':
        bt = node.blend_type if hasattr(node, 'blend_type') else 'MIX'
        fac = trace_input(node_tree, node, 'Fac')
        a = trace_input(node_tree, node, 'Color1')
        b = trace_input(node_tree, node, 'Color2')
        return make_mix(bt, fac, a, b)
    elif node.type == 'VALUE':
        return ('value', float(node.outputs[0].default_value))
    elif node.type == 'CURVE_RGB':
        return trace_input(node_tree, node, 'Color')
    elif node.type == 'MATH':
        return trace_input(node_tree, node, 'Value')
    elif node.type == 'RGB':
        c = node.outputs[0].default_value
        return ('color', (float(c[0]), float(c[1]), float(c[2])))
    else:
        return ('color', (0.7, 0.5, 0.4))

def eval_tree(tree, uv_x, uv_y):
    kind = tree[0]
    if kind == 'texture': return sample_texture(tree[1], uv_x, uv_y)
    elif kind == 'color': return tree[1]
    elif kind == 'value': v = tree[1]; return (v, v, v)
    elif kind == 'mix':
        _, blend_type, fac_tree, a_tree, b_tree = tree
        fac_val = eval_tree(fac_tree, uv_x, uv_y)
        fac = fac_val[0] if isinstance(fac_val, tuple) else fac_val
        fac = max(0.0, min(1.0, fac))
        a = eval_tree(a_tree, uv_x, uv_y)
        b = eval_tree(b_tree, uv_x, uv_y)
        if blend_type == 'MULTIPLY':
            return (a[0]*(1-fac)+a[0]*b[0]*fac, a[1]*(1-fac)+a[1]*b[1]*fac, a[2]*(1-fac)+a[2]*b[2]*fac)
        else:
            return (a[0]*(1-fac)+b[0]*fac, a[1]*(1-fac)+b[1]*fac, a[2]*(1-fac)+b[2]*fac)
    return (0.7, 0.5, 0.4)

# ========================================================================
# マテリアル評価ツリー構築（テクスチャキャッシュより先に実行）
# ========================================================================
mat_info = {}
for obj in body_objs:
    for mat in obj.data.materials:
        if mat is None or mat.name in mat_info: continue
        info = {'eval_tree': None, 'color': (180, 180, 180)}
        if mat.use_nodes:
            found_bsdf = False
            for nd in mat.node_tree.nodes:
                if nd.type == 'BSDF_PRINCIPLED':
                    bc_inp = nd.inputs.get('Base Color')
                    if bc_inp:
                        if bc_inp.is_linked:
                            info['eval_tree'] = trace_input(mat.node_tree, nd, 'Base Color')
                        else:
                            c = bc_inp.default_value
                            info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                    found_bsdf = True
                    break
            # BSDF_PRINCIPLEDが外側にない場合（MustardUI等）:
            # Material Output → Surface入力 → GROUPノードを辿る
            if not found_bsdf:
                for nd in mat.node_tree.nodes:
                    if nd.type == 'OUTPUT_MATERIAL':
                        surface_link = find_input_link(mat.node_tree, nd, 'Surface')
                        if surface_link:
                            result = trace_output(mat.node_tree, surface_link.from_node, surface_link.from_socket)
                            if result[0] != 'color' or result[1] != (0.7, 0.5, 0.4):
                                info['eval_tree'] = result
                                print(f"  Material '{mat.name}': traced via Material Output -> {result[0]}")
                        break
        mat_info[mat.name] = info

# ========================================================================
# bodyマテリアルで使用されるテクスチャのみキャッシュ（メモリ節約）
# ========================================================================
def collect_texture_names(tree):
    """評価ツリーから参照されるテクスチャ名を収集する。"""
    names = set()
    if tree is None:
        return names
    if tree[0] == 'texture':
        names.add(tree[1])
    elif tree[0] == 'mix':
        _, _, fac_tree, a_tree, b_tree = tree
        names |= collect_texture_names(fac_tree)
        names |= collect_texture_names(a_tree)
        names |= collect_texture_names(b_tree)
    return names

needed_textures = set()
for mi in mat_info.values():
    if mi.get('eval_tree'):
        needed_textures |= collect_texture_names(mi['eval_tree'])

print(f"  Body materials need {len(needed_textures)} textures: {needed_textures}")

# 必要なテクスチャだけキャッシュ（不要な巨大テクスチャを読み込まない）
for img in bpy.data.images:
    if img.name not in needed_textures:
        continue
    if img.size[0] == 0 and img.filepath:
        abs_p = bpy.path.abspath(img.filepath)
        if os.path.exists(abs_p):
            img.filepath = abs_p
            img.reload()
    if img.size[0] > 0 and img.name not in texture_cache:
        cache_texture(img)

# ========================================================================
# BVHツリー構築
# ========================================================================
class MeshData:
    pass

all_mesh_data = []
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me_eval = eo.to_mesh()
    bm_local = bmesh.new()
    bm_local.from_mesh(me_eval)
    bmesh.ops.transform(bm_local, matrix=obj.matrix_world, verts=bm_local.verts)
    bmesh.ops.triangulate(bm_local, faces=bm_local.faces)
    bm_local.verts.ensure_lookup_table()
    bm_local.faces.ensure_lookup_table()
    uv_layer = bm_local.loops.layers.uv.active
    verts_list = [v.co.copy() for v in bm_local.verts]
    faces_list = [[v.index for v in f.verts] for f in bm_local.faces]
    bvh = BVHTree.FromPolygons(verts_list, faces_list)
    md = MeshData()
    md.bm = bm_local; md.bvh = bvh; md.uv = uv_layer
    md.mat_info = mat_info; md.mesh_obj = obj
    all_mesh_data.append(md)
    eo.to_mesh_clear()

def get_uv_at(md, face_idx, loc):
    face = md.bm.faces[face_idx]
    if not md.uv: return None
    loops = face.loops
    v0, v1, v2 = [l.vert.co for l in loops]
    uv0, uv1, uv2 = loops[0][md.uv].uv, loops[1][md.uv].uv, loops[2][md.uv].uv
    d0 = v1 - v0; d1 = v2 - v0; d2 = loc - v0
    dot00 = d0.dot(d0); dot01 = d0.dot(d1); dot02 = d0.dot(d2)
    dot11 = d1.dot(d1); dot12 = d1.dot(d2)
    denom = dot00 * dot11 - dot01 * dot01
    if abs(denom) < 1e-12: return None
    inv = 1.0 / denom
    u_b = (dot11 * dot02 - dot01 * dot12) * inv
    v_b = (dot00 * dot12 - dot01 * dot02) * inv
    w_b = 1.0 - u_b - v_b
    return (w_b * uv0.x + u_b * uv1.x + v_b * uv2.x,
            w_b * uv0.y + u_b * uv1.y + v_b * uv2.y)

EYE_MATERIAL_KEYWORDS = ['eye', 'cornea', 'eyelash']
def is_eye_material(mat_name):
    if mat_name is None: return False
    return any(kw in mat_name.lower() for kw in EYE_MATERIAL_KEYWORDS)

def get_color_and_mat(md, face_idx, loc):
    face = md.bm.faces[face_idx]
    mat_slot = face.material_index
    mats = md.mesh_obj.data.materials
    mat_name = mats[mat_slot].name if mat_slot < len(mats) and mats[mat_slot] else None
    mi = md.mat_info.get(mat_name)
    if mi and mi.get('eval_tree'):
        uv = get_uv_at(md, face_idx, loc)
        if uv:
            rgb = eval_tree(mi['eval_tree'], uv[0], uv[1])
            return (max(0, min(255, int(rgb[0]*255))), max(0, min(255, int(rgb[1]*255))), max(0, min(255, int(rgb[2]*255)))), mat_name
    fallback = mi.get('color', (180,180,180)) if mi else (180,180,180)
    return fallback, mat_name

# ========================================================================
# ボクセル化
# ========================================================================
print("  Voxelizing body...")
body_voxels = {}
voxel_mats = {}
for vz in range(gz):
    if vz % 20 == 0:
        print(f"    z={vz}/{gz} hits={len(body_voxels)}")
    for vx in range(gx):
        for vy in range(gy):
            dp = Vector((grid_origin.x + (vx + 0.5) * voxel_size,
                         grid_origin.y + (vy + 0.5) * voxel_size,
                         grid_origin.z + (vz + 0.5) * voxel_size))
            op = inv_deform(dp)
            best_dist = thr; best_color = None; best_mat = None
            for md in all_mesh_data:
                loc, norm, fi, dist = md.bvh.find_nearest(op)
                if loc is not None and dist < best_dist:
                    best_dist = dist
                    best_color, best_mat = get_color_and_mat(md, fi, loc)
            if best_color:
                body_voxels[(vx, vy, vz)] = best_color
                voxel_mats[(vx, vy, vz)] = best_mat

# 足底トリム
min_vz = min(pos[2] for pos in body_voxels)
sole_trim_layers = int(thr / voxel_size) * 3
for vz_trim in range(min_vz, min_vz + sole_trim_layers):
    to_remove = [pos for pos in body_voxels if pos[2] == vz_trim]
    for pos in to_remove:
        del body_voxels[pos]
        if pos in voxel_mats: del voxel_mats[pos]

# 目ボクセル分離
eye_voxels_raw = {}
eye_positions = set()
for pos, mat in voxel_mats.items():
    if is_eye_material(mat):
        eye_voxels_raw[pos] = body_voxels[pos]
        eye_positions.add(pos)

def is_head_material(mat_name):
    return mat_name is not None and 'head' in mat_name.lower()

face_front_y = {}
for pos, mat in voxel_mats.items():
    if is_head_material(mat) and pos not in eye_positions:
        xz = (pos[0], pos[2])
        if xz not in face_front_y or pos[1] < face_front_y[xz]:
            face_front_y[xz] = pos[1]

eye_voxels = {}
eye_protruding = set()
for pos, col in eye_voxels_raw.items():
    xz = (pos[0], pos[2])
    face_y = face_front_y.get(xz)
    if face_y is not None:
        new_pos = (pos[0], face_y, pos[2])
        eye_voxels[new_pos] = col
        if pos[1] < face_y:
            eye_protruding.add(pos)
    else:
        eye_voxels[pos] = col

# 目ボクセルの後処理
eye_zs = [p[2] for p in eye_positions] if eye_positions else [0]
eye_z_min, eye_z_max = min(eye_zs), max(eye_zs)
if eye_positions:
    for pos in eye_protruding:
        if pos in body_voxels: del body_voxels[pos]
    eye_on_surface = eye_positions - eye_protruding
    face_colors = []
    for pos, mat in voxel_mats.items():
        if is_head_material(mat) and pos not in eye_positions:
            if eye_z_min - 3 <= pos[2] <= eye_z_max + 3:
                face_colors.append(body_voxels[pos])
    if face_colors:
        avg_r = sorted([c[0] for c in face_colors])[len(face_colors)//2]
        avg_g = sorted([c[1] for c in face_colors])[len(face_colors)//2]
        avg_b = sorted([c[2] for c in face_colors])[len(face_colors)//2]
        face_skin = (avg_r, avg_g, avg_b)
        for pos in eye_on_surface:
            if pos in body_voxels: body_voxels[pos] = face_skin

print(f"  Pre-normalize: {len(body_voxels)} body voxels, {len(eye_voxels)} eye voxels")

# ========================================================================
# 基準Body補正を適用
# ========================================================================
print(f"  Normalizing to base body (blend_rate={BLEND_RATE})...")
body_voxels = normalize_voxels(body_voxels, BLEND_RATE)
print(f"  Post-normalize: {len(body_voxels)} body voxels")

# ========================================================================
# 色の量子化とVOX出力
# ========================================================================
def quantize_color(c, step=4):
    return (min(255, (c[0]//step)*step + step//2), min(255, (c[1]//step)*step + step//2), min(255, (c[2]//step)*step + step//2))

quantized_voxels = {pos: quantize_color(col) for pos, col in body_voxels.items()}
unique_q = set(quantized_voxels.values())
step = 4
while len(unique_q) > 255:
    step *= 2
    quantized_voxels = {pos: quantize_color(col, step) for pos, col in body_voxels.items()}
    unique_q = set(quantized_voxels.values())

colors = list(unique_q)
color_idx = {c: i+1 for i, c in enumerate(colors)}
vlist = [(pos[0], pos[1], pos[2], color_idx[col]) for pos, col in quantized_voxels.items()]

def write_vox(path, sx, sy, sz, voxels, palette_colors):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    size_data = struct.pack('<III', sx, sy, sz)
    xyzi_data = struct.pack('<I', len(voxels))
    for v in voxels: xyzi_data += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
    rgba_data = b''
    for i in range(256):
        if i < len(palette_colors):
            c = palette_colors[i]; rgba_data += struct.pack('<BBBB', c[0], c[1], c[2], 255)
        else:
            rgba_data += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', size_data) + chunk('XYZI', xyzi_data) + chunk('RGBA', rgba_data)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f: f.write(b'VOX ' + struct.pack('<I', 150) + main)

os.makedirs(os.path.dirname(OUT_PATH) or '.', exist_ok=True)
write_vox(OUT_PATH, gx, gy, gz, vlist, colors)
print(f"  -> {OUT_PATH}: {gx}x{gy}x{gz}, {len(vlist)} voxels, {len(colors)} colors")

# 目パーツ
def save_part(part_voxels, suffix):
    if not part_voxels: return
    part_q = {pos: quantize_color(col, step) for pos, col in part_voxels.items()}
    part_colors = list(set(part_q.values()))
    if len(part_colors) > 255:
        from collections import Counter as C2
        freq2 = C2(part_q.values())
        part_colors = [c for c, _ in freq2.most_common(255)]
    part_cidx = {c: i+1 for i, c in enumerate(part_colors)}
    part_vlist = [(pos[0], pos[1], pos[2], part_cidx.get(col, 1)) for pos, col in part_q.items()]
    part_path = OUT_PATH.replace('.vox', f'_{suffix}.vox')
    write_vox(part_path, gx, gy, gz, part_vlist, part_colors)
    print(f"  -> {part_path}: {len(part_vlist)} voxels")

save_part(eye_voxels, 'eyes')

# グリッド情報
grid_info = {
    'gx': gx, 'gy': gy, 'gz': gz,
    'voxel_size': voxel_size,
    'grid_origin': [grid_origin.x, grid_origin.y, grid_origin.z],
    'def_min': [def_min.x, def_min.y, def_min.z],
    'def_max': [def_max.x, def_max.y, def_max.z],
    'raw_min': [min_co.x, min_co.y, min_co.z],
    'raw_max': [max_co.x, max_co.y, max_co.z],
    'raw_center': [center.x, center.y, center.z],
    'model_h': model_h,
    'base_body': BASE_BODY_PATH,
    'blend_rate': BLEND_RATE,
    'normalized': True,
}
grid_path = OUT_PATH.replace('.vox', '_grid.json')
with open(grid_path, 'w') as f:
    json.dump(grid_info, f, indent=2)
print(f"  -> {grid_path}")

# リソース解放
for md in all_mesh_data:
    md.bm.free()

print("  Done!")
