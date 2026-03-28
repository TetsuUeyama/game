"""3Dモデルの全パーツを個別にオリジナルプロポーションでボクセル化するスクリプト

モデル全体のバウンディングボックスから共有グリッドを作成し、
各メッシュオブジェクトを同一グリッド上で個別にボクセル化する。
ビューア用のパーツマニフェストJSONも生成する。

使用方法:
  blender --background --python voxelize_all_parts.py -- <input> <output_dir> [options]

オプション:
  --resolution N      最長軸のボクセル数上限（デフォルト: 250）
  --voxel-size F      固定ボクセルサイズ（メートル単位、--resolutionを上書き）
                      キャラクター間のスケール統一に使用（例: CE基準の0.007108）
  --body KEYWORD      ボディメッシュを識別するキーワード（複数指定可、デフォルト: "body"）
  --symmetrize        ボディパーツのみ左右対称化を有効にする
  --exclude KEYWORD   BBox計算から除外するキーワード（ボクセル化は実行される）
  --group NAME:KW,KW  キーワードでメッシュをグループ化して1パーツに統合（複数指定可）
                      例: --group "hair:hair,bangs" --group "boots:boot_l,boot_r"

使用例:
  blender --background --python voxelize_all_parts.py -- model.blend ./output --resolution 250 --symmetrize
  blender --background --python voxelize_all_parts.py -- model.blend ./output --voxel-size 0.007108 --group "hair:hair"
  blender --background --python voxelize_all_parts.py -- model.blend ./output --body body --group "hair:hair,bangs,ponytail"
"""
import bpy       # Blender Python API
import bmesh     # Blender メッシュ編集モジュール
import sys       # システムモジュール（コマンドライン引数取得）
import os        # OS操作（ファイルパス・ディレクトリ作成）
import struct    # バイナリデータパッキング（VOXファイル書き出し）
import json      # JSON読み書き（マニフェスト出力）
import numpy as np  # 数値計算（テクスチャピクセルデータ操作）
from mathutils import Vector         # Blender 3Dベクトル型
from mathutils.bvhtree import BVHTree  # BVH木（最近傍点探索用）

# ========================================================================
# Argument parsing（コマンドライン引数の解析）
# ========================================================================
argv = sys.argv  # コマンドライン引数の全リスト
sep = argv.index("--") if "--" in argv else len(argv)  # "--" セパレータの位置を検索
script_args = argv[sep + 1:]  # セパレータ以降がスクリプト引数

# 名前付き引数を取得するヘルパー関数（単一値）
def get_arg(name, default=None):
    flag = f'--{name}'  # フラグ文字列を構築
    if flag in script_args:
        idx = script_args.index(flag)  # フラグの位置を取得
        if idx + 1 < len(script_args):
            return script_args[idx + 1]  # フラグの次の値を返す
    return default  # 見つからなければデフォルト値

# 名前付き引数を取得するヘルパー関数（複数値、同名フラグを複数回指定可能）
def get_arg_list(name):
    flag = f'--{name}'
    values = []
    for i, a in enumerate(script_args):
        if a == flag and i + 1 < len(script_args):
            values.append(script_args[i + 1])  # 各出現の値を収集
    return values

# 位置引数（フラグでない引数）を収集
positional = []
skip_next = False  # 次の引数をスキップするフラグ
for i, a in enumerate(script_args):
    if skip_next:
        skip_next = False  # スキップ後にリセット
        continue
    if a.startswith('--'):
        skip_next = True  # フラグの次の値はスキップ
        continue
    positional.append(a)  # 位置引数として追加

# 必須の位置引数を取得
INPUT_PATH = positional[0]  # 入力ファイルパス（.blend/.fbx/.glb等）
OUT_DIR = positional[1]     # 出力ディレクトリパス
# オプション引数の解析
RESOLUTION = int(get_arg('resolution', '250'))  # 解像度（最長軸のボクセル数）
FIXED_VOXEL_SIZE = get_arg('voxel-size', None)  # 固定ボクセルサイズ（メートル）
if FIXED_VOXEL_SIZE is not None:
    FIXED_VOXEL_SIZE = float(FIXED_VOXEL_SIZE)  # 文字列→浮動小数点に変換
BODY_KEYWORDS = [kw.lower() for kw in get_arg_list('body')] or ['body']  # ボディ識別キーワード（デフォルト: ['body']）
SYMMETRIZE = '--symmetrize' in script_args  # 左右対称化フラグ
EXCLUDE_KEYWORDS = [kw.lower() for kw in get_arg_list('exclude')]  # BBox除外キーワード
SHOW_KEYWORDS = [kw.lower() for kw in get_arg_list('show')]  # 表示強制キーワード
HIDE_KEYWORDS = [kw.lower() for kw in get_arg_list('hide')]  # 非表示強制キーワード

# グループ定義の解析（"名前:キーワード1,キーワード2" 形式）
GROUP_DEFS = {}  # グループ名 -> [キーワードリスト]
for g in get_arg_list('group'):
    name, kws = g.split(':', 1)  # 名前とキーワード部分を分割
    GROUP_DEFS[name.strip()] = [k.strip().lower() for k in kws.split(',')]  # キーワードをリスト化

# 出力ディレクトリを再帰的に作成（存在していてもエラーにしない）
os.makedirs(OUT_DIR, exist_ok=True)

# 設定情報をコンソールに表示
print(f"\n{'='*60}")
print(f"  Realistic All-Parts Voxelizer")
print(f"{'='*60}")
print(f"  Input:      {INPUT_PATH}")
print(f"  Output dir: {OUT_DIR}")
if FIXED_VOXEL_SIZE:
    print(f"  Voxel size: {FIXED_VOXEL_SIZE:.6f} (fixed)")  # 固定ボクセルサイズ表示
else:
    print(f"  Resolution: {RESOLUTION}")  # 解像度表示
print(f"  Body KWs:   {BODY_KEYWORDS}")
if SYMMETRIZE:
    print(f"  Symmetrize: body parts only")  # 対称化がボディのみであることを表示
if GROUP_DEFS:
    print(f"  Groups:     {GROUP_DEFS}")  # グループ定義表示
if EXCLUDE_KEYWORDS:
    print(f"  Exclude:    {EXCLUDE_KEYWORDS}")  # 除外キーワード表示

# ========================================================================
# Load file（ファイル読み込み）
# ========================================================================
ext = os.path.splitext(INPUT_PATH)[1].lower()  # 入力ファイルの拡張子を小文字で取得
# 拡張子に応じたインポート処理
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')  # 全オブジェクト選択
    bpy.ops.object.delete()                      # 既存オブジェクトを削除
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)  # FBXインポート
elif ext in ('.glb', '.gltf'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)  # glTF/GLBインポート
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)  # Blendファイルを直接開く

# MASKモディファイアを無効化し、SURFACE_DEFORMモディファイアを削除
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue  # メッシュ以外はスキップ
    # MASKモディファイアのビューポート表示を無効化
    for mod in obj.modifiers:
        if mod.type == 'MASK' and mod.show_viewport:
            mod.show_viewport = False
    # SURFACE_DEFORMモディファイアを削除（ボクセル化に不要）
    for mod in list(obj.modifiers):
        if mod.type == 'SURFACE_DEFORM':
            obj.modifiers.remove(mod)

# --show / --hide による表示状態の上書き適用
if SHOW_KEYWORDS or HIDE_KEYWORDS:
    # ステップ1: 全レイヤーコレクションを有効化（コレクションで非表示のオブジェクトにアクセス可能にする）
    # これがないと、除外コレクション内のオブジェクトはhide_set(False)後もvisible_get()=Falseになる
    def enable_layer_collections(layer_col):
        layer_col.exclude = False        # コレクション除外を解除
        layer_col.hide_viewport = False  # ビューポート非表示を解除
        for child in layer_col.children:
            enable_layer_collections(child)  # 子コレクションも再帰的に有効化
    enable_layer_collections(bpy.context.view_layer.layer_collection)
    bpy.context.view_layer.update()  # ビューレイヤーを更新

    # データレベルのコレクション可視性も確保
    for col in bpy.data.collections:
        col.hide_viewport = False

    # ステップ2: オブジェクトレベルの表示/非表示を適用
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        name_lower = obj.name.lower()
        # SHOWキーワードに一致するオブジェクトを表示
        for kw in SHOW_KEYWORDS:
            if kw in name_lower:
                obj.hide_set(False)        # ランタイム非表示を解除
                obj.hide_viewport = False  # ビューポート非表示を解除
                print(f"  SHOW: {obj.name}")
        # HIDEキーワードに一致するオブジェクトを非表示
        for kw in HIDE_KEYWORDS:
            if kw in name_lower:
                obj.hide_set(True)         # ランタイム非表示に設定
                obj.hide_viewport = True   # ビューポート非表示に設定
                print(f"  HIDE: {obj.name}")

bpy.context.view_layer.update()  # 最終的なビューレイヤー更新

# ========================================================================
# Classify meshes into parts（メッシュのパーツ分類）
# ========================================================================
# 表示中のメッシュオブジェクトを全て取得
all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
print(f"\n  Visible meshes ({len(all_meshes)}):")
for o in all_meshes:
    print(f"    - {o.name} (verts={len(o.data.vertices)})")  # メッシュ名と頂点数を表示

# メッシュを分類する関数
# 優先度: グループ > ボディ > 個別パーツ
def classify_mesh(obj_name):
    name_lower = obj_name.lower()
    # まずグループ定義をチェック
    for group_name, keywords in GROUP_DEFS.items():
        if any(kw in name_lower for kw in keywords):
            return ('group', group_name)  # グループに属する
    # ボディキーワードをチェック
    if any(kw in name_lower for kw in BODY_KEYWORDS):
        return ('body', 'body')  # ボディパーツ
    # どちらにも属さない場合は個別パーツ
    return ('part', obj_name)

# パーツマップの構築: パーツキー -> [メッシュオブジェクトリスト]
part_map = {}  # キー -> メッシュオブジェクトのリスト
for obj in all_meshes:
    kind, key = classify_mesh(obj.name)  # メッシュを分類
    # パーツキーをファイル名安全な形式に変換（スペース→_、ドット→_、小文字化）
    safe_key = key.replace(' ', '_').replace('.', '_').lower()
    if safe_key not in part_map:
        part_map[safe_key] = []  # 新しいパーツキーのエントリを作成
    part_map[safe_key].append(obj)  # メッシュを対応するパーツに追加

# --exclude フィルタの適用（BBox計算からのみ除外、ボクセル化は実行する）
bbox_excluded_keys = set()  # BBox除外されるパーツキーのセット
if EXCLUDE_KEYWORDS:
    for key in part_map.keys():
        if any(kw in key.lower() for kw in EXCLUDE_KEYWORDS):
            bbox_excluded_keys.add(key)  # 除外対象に追加
    if bbox_excluded_keys:
        print(f"\n  BBox-excluded parts ({len(bbox_excluded_keys)}): {list(bbox_excluded_keys)}")

# パーツ情報を表示
print(f"\n  Parts ({len(part_map)}):")
for key, objs in part_map.items():
    tag = " [bbox-excluded]" if key in bbox_excluded_keys else ""
    print(f"    {key}: {[o.name for o in objs]}{tag}")

# ========================================================================
# Compute unified bounding box（統一バウンディングボックスの計算）
# - voxel_size: 非除外パーツのみから計算（ボディのディテールを保持）
# - grid extent: 全パーツから計算（武器等の除外パーツもグリッドに収まるように）
# ========================================================================
remaining_meshes = set()   # BBox計算に含めるメッシュ
all_part_meshes = set()    # 全パーツのメッシュ
for key, objs in part_map.items():
    for obj in objs:
        all_part_meshes.add(obj)
        if key not in bbox_excluded_keys:
            remaining_meshes.add(obj)  # 除外されていないメッシュのみ

# ボクセルサイズ決定用のBBox（ボディのみ）
bb_min = Vector((1e9, 1e9, 1e9))     # 最小座標（初期値は大きな値）
bb_max = Vector((-1e9, -1e9, -1e9))  # 最大座標（初期値は小さな値）
for obj in remaining_meshes:
    dg = bpy.context.evaluated_depsgraph_get()  # 評価済みデプスグラフを取得
    eo = obj.evaluated_get(dg)                   # モディファイア適用済みオブジェクト
    me = eo.to_mesh()                            # メッシュデータに変換
    me.transform(obj.matrix_world)               # ワールド座標に変換
    # 全頂点をスキャンしてBBoxを更新
    for v in me.vertices:
        for i in range(3):
            bb_min[i] = min(bb_min[i], v.co[i])
            bb_max[i] = max(bb_max[i], v.co[i])
    eo.to_mesh_clear()  # 一時メッシュを解放

# ボディBBoxのサイズを計算・表示
size = bb_max - bb_min
print(f"\n  Body BBox: {size.x:.4f} x {size.y:.4f} x {size.z:.4f}")
if FIXED_VOXEL_SIZE:
    # .voxフォーマットは1軸最大256ボクセル; モデルが収まらない場合は自動調整
    min_voxel_size = max(size) / (256 - 6)  # マージン分を引く
    if FIXED_VOXEL_SIZE < min_voxel_size:
        voxel_size = min_voxel_size  # 自動調整されたサイズ
        print(f"  WARNING: fixed voxel_size {FIXED_VOXEL_SIZE:.6f} too small for this model")
        print(f"  Auto-adjusted to {voxel_size:.6f} (model needs {max(size)/FIXED_VOXEL_SIZE:.0f} voxels)")
    else:
        voxel_size = FIXED_VOXEL_SIZE  # 指定サイズをそのまま使用
    print(f"  Using voxel_size: {voxel_size:.6f}")
else:
    voxel_size = max(size) / RESOLUTION  # 解像度からボクセルサイズを算出

# グリッド範囲用のフルBBox（除外パーツ含む全パーツ）
if bbox_excluded_keys:
    full_min = bb_min.copy()
    full_max = bb_max.copy()
    # 除外パーツのBBoxも含めて拡張
    for obj in all_part_meshes:
        if obj in remaining_meshes:
            continue  # 既に含まれているメッシュはスキップ
        dg = bpy.context.evaluated_depsgraph_get()
        eo = obj.evaluated_get(dg)
        me = eo.to_mesh()
        me.transform(obj.matrix_world)
        for v in me.vertices:
            for i in range(3):
                full_min[i] = min(full_min[i], v.co[i])
                full_max[i] = max(full_max[i], v.co[i])
        eo.to_mesh_clear()
    full_size = full_max - full_min
    print(f"  Full BBox: {full_size.x:.4f} x {full_size.y:.4f} x {full_size.z:.4f}")
else:
    # 除外パーツがない場合はボディBBoxをそのまま使用
    full_min = bb_min
    full_max = bb_max
    full_size = size

margin = 2  # グリッドマージン（両端に2ボクセルずつ）
# グリッド原点: XYはフル範囲（武器等含む）、Zはボディ範囲（高さ保持）
grid_origin = Vector((
    full_min.x - voxel_size * margin,  # X原点
    full_min.y - voxel_size * margin,  # Y原点
    bb_min.z - voxel_size * margin,    # Z原点（ボディ基準）
))
# グリッドサイズを計算（各軸最大256ボクセル）
gx = min(256, int(full_size.x / voxel_size) + margin * 2 + 2)  # X方向グリッドサイズ
gy = min(256, int(full_size.y / voxel_size) + margin * 2 + 2)  # Y方向グリッドサイズ
gz = min(256, int(size.z / voxel_size) + margin * 2 + 2)       # Z方向グリッドサイズ（ボディ高さ基準）
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.6f}")

# グリッド情報をJSONファイルとして保存
grid_data = {
    'grid_origin': list(grid_origin),  # グリッド原点座標
    'voxel_size': voxel_size,          # ボクセルサイズ
    'gx': gx, 'gy': gy, 'gz': gz,     # グリッド寸法
    'bb_min': list(bb_min),            # ボディBBox最小座標
    'bb_max': list(bb_max),            # ボディBBox最大座標
    'resolution': RESOLUTION,          # 解像度設定
}
grid_path = os.path.join(OUT_DIR, 'grid.json')
with open(grid_path, 'w') as f:
    json.dump(grid_data, f, indent=2)
print(f"  Grid saved: {grid_path}")

thr = voxel_size * 1.2  # BVH最近傍探索の閾値距離（ボクセルサイズの1.2倍）

# ========================================================================
# Texture sampling & node tree evaluation（テクスチャサンプリングとノードツリー評価）
# voxelize.pyと同じ実装
# ========================================================================
texture_cache = {}  # テクスチャデータのキャッシュ辞書

TEX_MAX_SIZE = 1024  # このサイズを超えるテクスチャはダウンサンプル

# テクスチャ画像をキャッシュに読み込む関数
def cache_texture(image):
    if image.name in texture_cache:
        return  # 既にキャッシュ済みならスキップ
    w, h = image.size  # テクスチャの幅と高さ
    if w == 0 or h == 0:
        return  # 無効なサイズならスキップ
    # ピクセルデータをNumPy配列に変換（高さ×幅×RGBA）
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    # 大きなテクスチャはメモリ節約のためダウンサンプル
    if w > TEX_MAX_SIZE or h > TEX_MAX_SIZE:
        scale = TEX_MAX_SIZE / max(w, h)  # スケール係数
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))  # 新しいサイズ
        # 最近傍法によるダウンサンプル（インデックスマッピング）
        ys = np.linspace(0, h - 1, nh).astype(int)
        xs = np.linspace(0, w - 1, nw).astype(int)
        pixels = pixels[np.ix_(ys, xs)]
        print(f"    Cached texture: {image.name} ({w}x{h} -> {nw}x{nh})")
        w, h = nw, nh
    else:
        print(f"    Cached texture: {image.name} ({w}x{h})")
    # キャッシュに格納（幅・高さ・ピクセルデータ）
    texture_cache[image.name] = {'w': w, 'h': h, 'px': pixels}

# テクスチャをUV座標でサンプリングする関数
def sample_texture(tex_name, uv_x, uv_y):
    tc = texture_cache.get(tex_name)
    if not tc:
        return (0.7, 0.5, 0.4)  # テクスチャがなければデフォルト色
    px_x = int(uv_x * tc['w']) % tc['w']  # UV X → ピクセルX座標
    px_y = int(uv_y * tc['h']) % tc['h']  # UV Y → ピクセルY座標
    p = tc['px'][px_y, px_x]              # ピクセル値を取得
    return (float(p[0]), float(p[1]), float(p[2]))  # RGB値を返却

_group_input_map = {}  # グループノードの入力マッピングキャッシュ

# ノードツリー内でノードの指定ソケットへのリンクを探す関数
def find_input_link(node_tree, node, socket_name):
    for link in node_tree.links:
        if link.to_node == node and link.to_socket.name == socket_name:
            return link  # 一致するリンクを返却
    return None  # 見つからなければNone

# カラー/ベクター型の入力ソケットを探す関数（Blender 4.xのMIXノード対応）
def find_color_input(node, socket_name):
    """Blender 4.x MIXノードはfloatとcolor入力に同名ソケットがある。
    カラー/ベクター版を優先して返す。"""
    matches = [inp for inp in node.inputs if inp.name == socket_name]
    # カラー/ベクター入力を優先（RGBA/VECTOR型）
    for inp in matches:
        if inp.type in ('RGBA', 'VECTOR'):
            return inp
    # フォールバック: 最初のマッチ
    return matches[0] if matches else None

# ノードの入力ソケットの値/リンク元をトレースする関数
def trace_input(node_tree, node, socket_name):
    inp = node.inputs.get(socket_name)
    if inp is None:
        return ('value', 0.0)  # ソケットが存在しなければデフォルト値
    # MIXノードの場合、カラー入力をフロート入力より優先
    if node.type == 'MIX' and socket_name in ('A', 'B', 'Factor'):
        color_inp = find_color_input(node, socket_name)
        if color_inp:
            inp = color_inp
    # このソケットインスタンスへのリンクを探索
    link = None
    for l in node_tree.links:
        if l.to_node == node and l.to_socket == inp:
            link = l
            break
    if link is None:
        # フォールバック: 名前ベースの検索（古いBlenderバージョン用）
        link = find_input_link(node_tree, node, socket_name)
    if link is None:
        # リンクがない場合はデフォルト値を返す
        val = inp.default_value
        if hasattr(val, '__len__') and len(val) >= 3:
            return ('color', (float(val[0]), float(val[1]), float(val[2])))  # カラー値
        return ('value', float(val))  # スカラー値
    # リンク元のノード出力をトレース
    return trace_output(node_tree, link.from_node, link.from_socket)

# ノードの出力をトレースする関数（再帰的にノードツリーを辿る）
def trace_output(node_tree, node, output_socket):
    # GROUP_INPUTノード: グループの入力値を参照
    if node.type == 'GROUP_INPUT':
        gt_name = node_tree.name if hasattr(node_tree, 'name') else ''
        inp_map = _group_input_map.get(gt_name, {})
        # 出力ソケットのインデックスを特定
        out_idx = 0
        for i, os_item in enumerate(node.outputs):
            if os_item == output_socket:
                out_idx = i
                break
        if out_idx in inp_map:
            return inp_map[out_idx]  # マッピング済みの値を返す
        return ('color', (0.7, 0.5, 0.4))  # デフォルト色

    # TEX_IMAGEノード: テクスチャ画像をキャッシュして参照を返す
    elif node.type == 'TEX_IMAGE' and node.image:
        cache_texture(node.image)
        return ('texture', node.image.name)

    # MIX/MIX_RGBノード: ブレンドタイプに応じた色の混合
    elif node.type in ('MIX', 'MIX_RGB'):
        bt = getattr(node, 'blend_type', 'MIX')  # ブレンドタイプ取得
        # MIXノードとMIX_RGBノードで入力ソケット名が異なる
        if node.type == 'MIX':
            fac = trace_input(node_tree, node, 'Factor')  # 混合係数
            a = trace_input(node_tree, node, 'A')          # 入力A
            b = trace_input(node_tree, node, 'B')          # 入力B
        else:
            fac = trace_input(node_tree, node, 'Fac')
            a = trace_input(node_tree, node, 'Color1')
            b = trace_input(node_tree, node, 'Color2')
        # 係数が0に近い場合はAをそのまま返す
        if fac[0] == 'value' and fac[1] <= 0.001:
            return a
        # 係数が1に近く、MIXブレンドの場合はBをそのまま返す
        if fac[0] == 'value' and fac[1] >= 0.999 and bt == 'MIX':
            return b
        # MULTIPLYブレンドでAO(アンビエントオクルージョン)テクスチャを検出して除外
        if bt == 'MULTIPLY':
            def is_ao(t):
                return t[0] == 'texture' and 'ao' in t[1].lower()
            if is_ao(b):
                return a  # AOテクスチャを無視してAを返す
            if is_ao(a):
                return b  # AOテクスチャを無視してBを返す
        return ('mix', bt, fac, a, b)  # 混合情報をタプルで返す

    # VALUEノード: 定数値
    elif node.type == 'VALUE':
        return ('value', float(node.outputs[0].default_value))
    # CURVE_RGBノード: カーブ調整（入力Color値をそのまま返す）
    elif node.type == 'CURVE_RGB':
        return trace_input(node_tree, node, 'Color')
    # MATHノード: 数学演算（定数の場合は評価、変数の場合はパススルー）
    elif node.type == 'MATH':
        op = getattr(node, 'operation', '')  # 演算タイプ
        inputs_val = []
        for inp in node.inputs:
            if inp.name == 'Value':
                if inp.is_linked:
                    t = trace_input(node_tree, node, 'Value')
                    if t[0] == 'value':
                        inputs_val.append(t[1])  # 定数値を収集
                    else:
                        return t  # 非定数の場合はパススルー
                else:
                    inputs_val.append(float(inp.default_value))
                if len(inputs_val) >= 2:
                    break  # 2入力取得で打ち切り
        # 2入力が定数なら演算を評価
        if len(inputs_val) >= 2:
            a, b = inputs_val[0], inputs_val[1]
            if op == 'GREATER_THAN':
                return ('value', 1.0 if a > b else 0.0)
            elif op == 'LESS_THAN':
                return ('value', 1.0 if a < b else 0.0)
            elif op == 'MULTIPLY':
                return ('value', a * b)
            elif op == 'ADD':
                return ('value', a + b)
            elif op == 'SUBTRACT':
                return ('value', a - b)
        return trace_input(node_tree, node, 'Value')
    # RGBノード: 定数カラー値
    elif node.type == 'RGB':
        c = node.outputs[0].default_value
        return ('color', (float(c[0]), float(c[1]), float(c[2])))

    # GROUPノード: サブノードツリーの内部をトレース
    elif node.type == 'GROUP' and node.node_tree:
        gt_name = node.node_tree.name if hasattr(node.node_tree, 'name') else ''

        # 特殊処理: Skin Selectorグループ（Default/Inquisitor/Corruptedスキンの選択）
        # 常に"Default"入力を選択されたスキンとして使用
        if 'skin' in gt_name.lower() and 'selector' in gt_name.lower():
            for inp in node.inputs:
                if inp.name.lower() == 'default' and inp.is_linked:
                    src_link = inp.links[0]
                    result = trace_output(node_tree, src_link.from_node, src_link.from_socket)
                    print(f"      Skin Selector: using Default -> {result[0]}:{result[1] if len(result) > 1 else ''}")
                    return result

        # 特殊処理: Texture Selectorグループ（MustardUIパターン）
        # 内部のMIXチェーンをトレースする代わりに、選択されたテクスチャを直接取得
        if 'texture' in gt_name.lower() and 'selector' in gt_name.lower():
            tex_num = 1  # デフォルトは最初のテクスチャ
            # テクスチャ番号の値を探す
            for inp in node.inputs:
                if 'number' in inp.name.lower() or 'select' in inp.name.lower():
                    if inp.is_linked:
                        src_node = inp.links[0].from_node
                        if src_node.type == 'VALUE':
                            tex_num = max(1, int(round(float(src_node.outputs[0].default_value))))
                    else:
                        tex_num = max(1, int(round(float(inp.default_value))))
                    break

            # テクスチャ入力は0インデックス: "Texture 1" = input[0]等
            tex_idx = tex_num - 1
            if tex_idx < len(node.inputs) and node.inputs[tex_idx].is_linked:
                src_link = node.inputs[tex_idx].links[0]
                result = trace_output(node_tree, src_link.from_node, src_link.from_socket)
                print(f"      Texture Selector: picked Texture {tex_num} -> {result[0]}:{result[1] if len(result) > 1 else ''}")
                return result
            # フォールバック: 最初のリンク済みテクスチャ入力を使用
            for inp in node.inputs:
                if inp.is_linked:
                    src = inp.links[0].from_node
                    if src.type == 'TEX_IMAGE' and src.image:
                        cache_texture(src.image)
                        return ('texture', src.image.name)

        # 一般的なグループノード: 入力マッピングを構築してサブツリーをトレース
        inp_map = {}
        for i, inp in enumerate(node.inputs):
            if inp.is_linked:
                src_link = inp.links[0]
                inp_map[i] = trace_output(node_tree, src_link.from_node, src_link.from_socket)
        _group_input_map[gt_name] = inp_map  # グループ入力マップをキャッシュ

        # 出力ソケットのインデックスを特定
        out_idx = 0
        for i, os_item in enumerate(node.outputs):
            if os_item == output_socket:
                out_idx = i
                break
        # GROUP_OUTPUTノードを探して出力をトレース
        for gn in node.node_tree.nodes:
            if gn.type == 'GROUP_OUTPUT':
                if out_idx < len(gn.inputs) and gn.inputs[out_idx].is_linked:
                    glink = gn.inputs[out_idx].links[0]
                    return trace_output(node.node_tree, glink.from_node, glink.from_socket)
        # フォールバック: グループ内の最初のテクスチャノードを返す
        for inp in node.inputs:
            if inp.is_linked:
                src = inp.links[0].from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    cache_texture(src.image)
                    return ('texture', src.image.name)
        return ('color', (0.7, 0.5, 0.4))  # デフォルト色

    # 未対応ノードタイプ: デフォルト色を返す
    else:
        return ('color', (0.7, 0.5, 0.4))

# 評価ツリーをUV座標で評価してRGB色を取得する関数
def eval_tree(tree, uv_x, uv_y):
    kind = tree[0]  # ツリーノードの種類
    if kind == 'texture':
        return sample_texture(tree[1], uv_x, uv_y)  # テクスチャサンプリング
    elif kind == 'color':
        return tree[1]  # 定数カラーを返す
    elif kind == 'value':
        v = tree[1]
        return (v, v, v)  # スカラー値をRGBに展開
    elif kind == 'mix':
        _, blend_type, fac_tree, a_tree, b_tree = tree  # 混合パラメータを分解
        fac_val = eval_tree(fac_tree, uv_x, uv_y)       # 係数を評価
        fac = fac_val[0] if isinstance(fac_val, tuple) else fac_val
        fac = max(0.0, min(1.0, fac))                    # 0〜1にクランプ
        a = eval_tree(a_tree, uv_x, uv_y)               # 入力Aを評価
        b = eval_tree(b_tree, uv_x, uv_y)               # 入力Bを評価
        # ブレンドタイプに応じた色の混合
        if blend_type == 'MULTIPLY':
            return (a[0]*(1-fac)+a[0]*b[0]*fac, a[1]*(1-fac)+a[1]*b[1]*fac, a[2]*(1-fac)+a[2]*b[2]*fac)
        else:
            return (a[0]*(1-fac)+b[0]*fac, a[1]*(1-fac)+b[1]*fac, a[2]*(1-fac)+b[2]*fac)  # 線形補間
    return (0.7, 0.5, 0.4)  # デフォルト色

# ========================================================================
# Build material info for ALL meshes（全メッシュのマテリアル情報を構築）
# ========================================================================
# Principled BSDFノードをノードツリー内（グループ内含む）から探す関数
def find_principled_bsdf(node_tree):
    """ノードツリー内でPrincipled BSDFを探索。グループノード内も再帰検索。"""
    for nd in node_tree.nodes:
        if nd.type == 'BSDF_PRINCIPLED':
            return node_tree, nd  # 見つかったノードツリーとBSDFノードを返す
    # マテリアル出力に接続されたグループノード内を検索
    for nd in node_tree.nodes:
        if nd.type == 'GROUP' and nd.node_tree:
            result = find_principled_bsdf(nd.node_tree)
            if result:
                return result
    return None  # 見つからなければNone

# 'Base Color'入力を持つグループノードを探す関数
def find_group_with_base_color(node_tree):
    """マテリアル出力に接続された、Base Color入力を持つGroupノードを探す。"""
    for nd in node_tree.nodes:
        if nd.type == 'GROUP' and nd.inputs.get('Base Color'):
            return nd
    return None

# 全メッシュのマテリアル情報を収集
mat_info = {}  # マテリアル名 -> 情報辞書
for obj in all_meshes:
    for mat in obj.data.materials:
        if mat is None or mat.name in mat_info:
            continue  # Noneまたは処理済みマテリアルはスキップ
        info = {'eval_tree': None, 'color': (180, 180, 180)}  # デフォルト: 灰色
        if mat.use_nodes:
            # Principled BSDFノードを検索
            result = find_principled_bsdf(mat.node_tree)
            if result:
                bsdf_tree, bsdf_node = result
                bc = bsdf_node.inputs.get('Base Color')  # Base Colorソケットを取得
                if bc:
                    if bc.is_linked:
                        # BSDFがグループ内にある場合、グループ入力マッピングを設定
                        if bsdf_tree != mat.node_tree:
                            for nd in mat.node_tree.nodes:
                                if nd.type == 'GROUP' and nd.node_tree == bsdf_tree:
                                    inp_map = {}
                                    for i, inp in enumerate(nd.inputs):
                                        if inp.is_linked:
                                            link = None
                                            for l in mat.node_tree.links:
                                                if l.to_node == nd and l.to_socket == inp:
                                                    link = l
                                                    break
                                            if link:
                                                inp_map[i] = trace_output(mat.node_tree, link.from_node, link.from_socket)
                                        else:
                                            val = inp.default_value
                                            if hasattr(val, '__len__') and len(val) >= 3:
                                                inp_map[i] = ('color', (float(val[0]), float(val[1]), float(val[2])))
                                    _group_input_map[bsdf_tree.name] = inp_map
                                    break
                        # Base Colorの入力をトレースして評価ツリーを保存
                        info['eval_tree'] = trace_input(bsdf_tree, bsdf_node, 'Base Color')
                        print(f"    Material '{mat.name}': traced")
                    else:
                        # Base Colorがリンクなし: デフォルト値をRGB整数に変換
                        c = bc.default_value
                        info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                        print(f"    Material '{mat.name}': color {info['color']}")
            else:
                # フォールバック: BSDFなしだが'Base Color'入力を持つグループノード
                group_nd = find_group_with_base_color(mat.node_tree)
                if group_nd:
                    bc = group_nd.inputs.get('Base Color')
                    if bc and bc.is_linked:
                        info['eval_tree'] = trace_input(mat.node_tree, group_nd, 'Base Color')
                        print(f"    Material '{mat.name}': traced (via Group 'Base Color')")
                    elif bc:
                        c = bc.default_value
                        info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                        print(f"    Material '{mat.name}': color {info['color']} (via Group)")
                else:
                    print(f"    Material '{mat.name}': WARNING no BSDF or Group with Base Color, using default gray")
        mat_info[mat.name] = info  # マテリアル情報を保存

# ========================================================================
# Helper: build BVH + UV for a set of mesh objects
# （ヘルパー: メッシュオブジェクト群のBVH木＋UV情報を構築）
# ========================================================================
# メッシュ情報を格納するクラス
class MeshInfo:
    pass

# メッシュオブジェクトリストからBVH木とUV情報を構築する関数
def build_mesh_infos(objs):
    mesh_list = []
    for obj in objs:
        dg = bpy.context.evaluated_depsgraph_get()  # 評価済みデプスグラフ
        eo = obj.evaluated_get(dg)                   # モディファイア適用済みオブジェクト
        me_eval = eo.to_mesh()                       # メッシュデータに変換

        bm = bmesh.new()                              # BMeshオブジェクト作成
        bm.from_mesh(me_eval)                         # メッシュデータからBMeshを構築
        bmesh.ops.transform(bm, matrix=obj.matrix_world, verts=bm.verts)  # ワールド座標に変換
        bmesh.ops.triangulate(bm, faces=bm.faces)     # 全面を三角形に分割
        bm.verts.ensure_lookup_table()                 # 頂点ルックアップテーブルを構築
        bm.faces.ensure_lookup_table()                 # 面ルックアップテーブルを構築

        uv_layer = bm.loops.layers.uv.active           # アクティブUVレイヤーを取得
        verts = [v.co.copy() for v in bm.verts]        # 頂点座標をコピー
        faces = [[v.index for v in f.verts] for f in bm.faces]  # 面のインデックスリスト
        bvh = BVHTree.FromPolygons(verts, faces)        # BVH木を構築

        # MeshInfoオブジェクトに情報を格納
        mi = MeshInfo()
        mi.bm = bm        # BMesh参照
        mi.bvh = bvh      # BVH木
        mi.uv = uv_layer  # UVレイヤー
        mi.obj = obj       # 元オブジェクト参照
        mesh_list.append(mi)
        eo.to_mesh_clear()  # 一時メッシュを解放
    return mesh_list

# 指定面の指定位置でのUV座標をバリセントリック補間で取得する関数
def get_uv_at(mi, face_idx, loc):
    face = mi.bm.faces[face_idx]
    if not mi.uv:
        return None  # UVレイヤーがなければNone
    loops = face.loops
    # 三角形の3頂点座標とUV座標を取得
    v0, v1, v2 = [l.vert.co for l in loops]
    uv0 = loops[0][mi.uv].uv
    uv1 = loops[1][mi.uv].uv
    uv2 = loops[2][mi.uv].uv
    # バリセントリック座標を計算
    d0 = v1 - v0; d1 = v2 - v0; d2 = loc - v0
    dot00 = d0.dot(d0); dot01 = d0.dot(d1); dot02 = d0.dot(d2)
    dot11 = d1.dot(d1); dot12 = d1.dot(d2)
    denom = dot00 * dot11 - dot01 * dot01
    if abs(denom) < 1e-12:
        return None  # 退化三角形の場合はNone
    inv = 1.0 / denom
    u = (dot11 * dot02 - dot01 * dot12) * inv  # バリセントリック座標u
    v = (dot00 * dot12 - dot01 * dot02) * inv   # バリセントリック座標v
    w = 1.0 - u - v                              # バリセントリック座標w
    # UV座標をバリセントリック補間
    return (w * uv0.x + u * uv1.x + v * uv2.x,
            w * uv0.y + u * uv1.y + v * uv2.y)

# 指定面の指定位置での色を取得する関数（マテリアル＋テクスチャ考慮）
def get_color(mi, face_idx, loc):
    face = mi.bm.faces[face_idx]
    mat_slot = face.material_index  # 面のマテリアルインデックス
    mats = mi.obj.data.materials
    mat_name = mats[mat_slot].name if mat_slot < len(mats) and mats[mat_slot] else None  # マテリアル名
    info = mat_info.get(mat_name)
    color = info.get('color', (180, 180, 180)) if info else (180, 180, 180)  # デフォルト色
    # 評価ツリーがある場合はテクスチャサンプリングで色を取得
    if info and info.get('eval_tree'):
        uv = get_uv_at(mi, face_idx, loc)
        if uv:
            rgb = eval_tree(info['eval_tree'], uv[0], uv[1])
            # 0-255にクランプして整数に変換
            color = (max(0, min(255, int(rgb[0]*255))),
                     max(0, min(255, int(rgb[1]*255))),
                     max(0, min(255, int(rgb[2]*255))))
    return color, mat_name  # 色とマテリアル名のタプルを返す

# 目に関連するマテリアルキーワード（ボディから分離するため）
# 'eyes'（複数形）で'eyeshadow'との誤マッチを回避
EYE_MAT_KEYWORDS = ['eyes', 'cornea', 'eyelash']
EYE_MAT_EXCLUDES = ['eyeshadow', 'eyebrow']  # 除外キーワード

# マテリアル名が目関連かどうかを判定する関数
def is_eye_material(mat_name):
    if not mat_name:
        return False
    name_lower = mat_name.lower()
    # 除外キーワードに一致する場合はFalse
    if any(exc in name_lower for exc in EYE_MAT_EXCLUDES):
        return False
    return any(kw in name_lower for kw in EYE_MAT_KEYWORDS)

# 髪に関連するマテリアルキーワード（ボディから分離するため）
# ボディメッシュに髪マテリアルの面が含まれることがあるため分離が必要
# これによりボディの高さ＝頭頂部（髪の頂部ではなく）となる
HAIR_MAT_KEYWORDS = ['hair']
HAIR_MAT_EXCLUDES = []  # 必要に応じて追加

# マテリアル名が髪関連かどうかを判定する関数
def is_hair_material(mat_name):
    if not mat_name:
        return False
    name_lower = mat_name.lower()
    if any(exc in name_lower for exc in HAIR_MAT_EXCLUDES):
        return False
    return any(kw in name_lower for kw in HAIR_MAT_KEYWORDS)

# ========================================================================
# Voxelize a single part（単一パーツのボクセル化）
# ========================================================================
# メッシュリストをボクセル化する関数。split_body=Trueの場合、(body, eyes, hair)の3分割
def voxelize_part(mesh_list, split_body=False):
    """メッシュをボクセル化。split_body=Trueの場合は(body_voxels, eye_voxels, hair_voxels)を返す。"""
    voxels = {}       # メインのボクセル辞書 {(x,y,z): (r,g,b)}
    eye_voxels = {} if split_body else None   # 目のボクセル（分割時）
    hair_voxels = {} if split_body else None  # 髪のボクセル（分割時）
    # Z軸（高さ方向）をスライスしてスキャン
    for vz in range(gz):
        # 30スライスごとに進捗表示
        if vz % 30 == 0:
            total = len(voxels) + (len(eye_voxels) if eye_voxels else 0)
            print(f"      z={vz}/{gz} hits={total}")
        # XY平面をスキャン
        for vx in range(gx):
            for vy in range(gy):
                # グリッド座標→ワールド座標に変換（ボクセル中心位置）
                world_pos = Vector((
                    grid_origin.x + (vx + 0.5) * voxel_size,
                    grid_origin.y + (vy + 0.5) * voxel_size,
                    grid_origin.z + (vz + 0.5) * voxel_size,
                ))
                best_dist = thr      # 最小距離の初期値（閾値）
                best_color = None     # 最近傍の色
                best_mat = None       # 最近傍のマテリアル名
                # 全メッシュに対してBVH最近傍点探索
                for mi in mesh_list:
                    loc, norm, fi, dist = mi.bvh.find_nearest(world_pos)
                    if loc is not None and dist < best_dist:
                        best_dist = dist
                        best_color, best_mat = get_color(mi, fi, loc)  # 色とマテリアルを取得
                # ヒットがあった場合、マテリアルに基づいてボクセルを分類
                if best_color:
                    if split_body and is_eye_material(best_mat):
                        eye_voxels[(vx, vy, vz)] = best_color    # 目のボクセルに分類
                    elif split_body and is_hair_material(best_mat):
                        hair_voxels[(vx, vy, vz)] = best_color   # 髪のボクセルに分類
                    else:
                        voxels[(vx, vy, vz)] = best_color         # メインボクセルに分類
    if split_body:
        return voxels, eye_voxels, hair_voxels  # 3分割で返却
    return voxels  # 単一辞書で返却

# ========================================================================
# Left-right symmetry (X axis mirror, body only)
# （左右対称化、X軸ミラー、ボディのみ）
# ========================================================================
# ボクセルの色を左右対称化する関数（形状は変えず色のみ対称化）
def symmetrize_voxels(voxels):
    """色のみを対称化 — ボクセルの追加/削除は行わない。
    既存の左右ペアのボクセルに対して、基準側の色を反対側にコピーする。
    ペアのないボクセルは元の色を保持。"""
    center_x = gx / 2.0  # X軸中心座標

    # 各サイドのボクセル数をカウントして基準側を決定
    left_count = 0
    right_count = 0
    for (vx, vy, vz) in voxels:
        if vx < center_x:
            left_count += 1   # 左側のカウント
        else:
            right_count += 1  # 右側のカウント

    # ボクセル数が多い側を基準とする
    use_left = left_count >= right_count
    print(f"    Symmetry ref: {'left' if use_left else 'right'} (L={left_count}, R={right_count})")

    result = dict(voxels)  # 結果辞書（元のコピー）
    synced = 0  # 同期されたペア数

    for (vx, vy, vz), col in voxels.items():
        # 基準側のボクセルのみ処理
        is_ref_side = (vx < center_x) if use_left else (vx >= center_x)
        if not is_ref_side:
            continue
        # ミラー先のX座標を計算
        mirror_x = int(round(2 * center_x - vx - 1))
        if mirror_x < 0 or mirror_x >= gx:
            continue  # グリッド範囲外ならスキップ
        mirror_key = (mirror_x, vy, vz)
        # ミラー先にボクセルが存在する場合のみ色を同期
        if mirror_key in result:
            result[mirror_key] = col
            synced += 1

    print(f"    Color-synced: {synced} voxel pairs (shape unchanged)")
    return result

# ========================================================================
# Color quantization + VOX writer（色の量子化 + VOXファイル書き出し）
# ========================================================================
# ボクセルの色をパレット(最大255色)に量子化する関数
def quantize_colors(voxels):
    # 色を指定ステップで量子化するヘルパー（ステップの倍数に丸める）
    def quantize(c, step=4):
        return (min(255, (c[0]//step)*step + step//2),
                min(255, (c[1]//step)*step + step//2),
                min(255, (c[2]//step)*step + step//2))
    step = 4  # 初期量子化ステップ
    quantized = {pos: quantize(col, step) for pos, col in voxels.items()}
    unique = set(quantized.values())  # ユニークカラー数を取得
    # ユニークカラーが255色に収まるまでステップを倍増
    while len(unique) > 255:
        step *= 2
        quantized = {pos: quantize(col, step) for pos, col in voxels.items()}
        unique = set(quantized.values())
    colors = list(unique)  # パレット色のリスト
    color_idx = {c: i + 1 for i, c in enumerate(colors)}  # 色→パレットインデックスのマップ（1始まり）
    # ボクセルリストを作成（x, y, z, colorIndex）
    voxel_list = [(p[0], p[1], p[2], color_idx[col]) for p, col in quantized.items()]
    return voxel_list, colors

# MagicaVoxel形式のVOXファイルを書き出す関数
def write_vox(path, sx, sy, sz, voxels_data, palette):
    # チャンクデータを構築するヘルパー（タグ+サイズヘッダ+データ）
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data

    # SIZEチャンク: グリッド寸法
    size_data = struct.pack('<III', sx, sy, sz)
    # XYZIチャンク: ボクセルデータ
    xyzi_data = struct.pack('<I', len(voxels_data))  # ボクセル数
    for v in voxels_data:
        xyzi_data += struct.pack('<BBBB', v[0], v[1], v[2], v[3])  # 各ボクセル(x,y,z,ci)

    # RGBAチャンク: パレット（256エントリ）
    rgba_data = b''
    for i in range(256):
        if i < len(palette):
            c = palette[i]
            rgba_data += struct.pack('<BBBB', c[0], c[1], c[2], 255)  # RGBA
        else:
            rgba_data += struct.pack('<BBBB', 0, 0, 0, 255)  # 未使用スロットは黒

    # MAINチャンク: 子チャンク（SIZE+XYZI+RGBA）を結合
    children = chunk('SIZE', size_data) + chunk('XYZI', xyzi_data) + chunk('RGBA', rgba_data)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children

    # ファイルに書き出し（VOXヘッダ + MAINチャンク）
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# ========================================================================
# Category classification for subdirectory organization
# （サブディレクトリ整理用のカテゴリ分類）
# ========================================================================
# カテゴリ分類ルール（キーワード→カテゴリのマッピング）
CATEGORY_RULES = {
    'body':        ['body', 'eyes'],                                            # 体・目
    'hair':        ['hair', 'bangs', 'ponytail'],                               # 髪
    'clothing':    ['bra', 'panties', 'jacket', 'leggings', 'garter', 'necktie', 'suit'],  # 衣類
    'armor':       ['armor', 'mask', 'cape', 'belt', 'shoulder', 'earring', 'scabbard'],   # 鎧・装備
    'weapons':     ['weapon'],                                                   # 武器
    'accessories': ['armband', 'hat', 'hip_plate', 'hologram', 'gloves', 'glove'],  # アクセサリ
}

# パーツキーからカテゴリを判定する関数
def get_category(part_key):
    key_lower = part_key.lower()
    for category, keywords in CATEGORY_RULES.items():
        if any(kw in key_lower for kw in keywords):
            return category  # 一致するカテゴリを返す
    return 'other'  # どのルールにも一致しなければ'other'

# ========================================================================
# Process each part（各パーツの処理）
# ========================================================================
manifest = []  # パーツマニフェスト（JSONファイル出力用）

# パーツを量子化・VOX書き出し・マニフェスト追加する関数
def save_part(part_key, voxels, mesh_names, is_body, default_on=True):
    """量子化し、カテゴリ別サブディレクトリに.voxを書き出し、マニフェストに追加する。"""
    if not voxels:
        print(f"    SKIP {part_key}: no voxels")  # ボクセルがなければスキップ
        return
    category = get_category(part_key)               # カテゴリを判定
    sub_dir = os.path.join(OUT_DIR, category)        # カテゴリ別サブディレクトリ
    os.makedirs(sub_dir, exist_ok=True)              # ディレクトリ作成

    voxel_list, colors = quantize_colors(voxels)     # 色の量子化
    out_path = os.path.join(sub_dir, f"{part_key}.vox")
    write_vox(out_path, gx, gy, gz, voxel_list, colors)  # VOXファイル書き出し
    print(f"    -> {category}/{part_key}.vox: {len(voxel_list)} voxels, {len(colors)} colors")
    # マニフェストにパーツ情報を追加
    manifest.append({
        'key': part_key,                                           # パーツキー
        'file': f"/{os.path.basename(OUT_DIR)}/{category}/{part_key}.vox",  # 相対パス
        'voxels': len(voxel_list),                                 # ボクセル数
        'default_on': default_on,                                  # デフォルト表示フラグ
        'meshes': mesh_names,                                      # 元メッシュ名リスト
        'is_body': is_body,                                        # ボディフラグ
        'category': category,                                      # カテゴリ
    })

# 全パーツをソート順に処理
for part_key, objs in sorted(part_map.items()):
    print(f"\n  --- Voxelizing part: {part_key} ({len(objs)} meshes) ---")
    mesh_list = build_mesh_infos(objs)  # BVH木＋UV情報を構築
    is_body = part_key == 'body'         # ボディパーツかどうか

    if is_body:
        # ボディの場合: 目と髪をマテリアルベースで分離
        body_voxels, eye_voxels, hair_voxels = voxelize_part(mesh_list, split_body=True)
        print(f"    Body voxels: {len(body_voxels)}, Eye voxels: {len(eye_voxels)}, Hair voxels: {len(hair_voxels)}")

        # 目領域の拡張: BVH最近傍でボディに分類された目周辺のボクセルを目に再分類
        # 角膜/まぶたのジオメトリがボディとして誤分類されることがあるため
        if eye_voxels:
            eye_set = set(eye_voxels.keys())
            EXPAND_ITERATIONS = 3  # 最大3ボクセル外側に拡張
            for iteration in range(EXPAND_ITERATIONS):
                new_eye = {}  # この反復で新たに目に再分類されるボクセル
                for (ex, ey, ez) in eye_set:
                    # 6近傍をチェック
                    for dx, dy, dz in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]:
                        nb = (ex+dx, ey+dy, ez+dz)
                        if nb in body_voxels and nb not in eye_voxels:
                            new_eye[nb] = body_voxels[nb]  # ボディから目に移動
                if not new_eye:
                    break  # 新たな拡張がなければ終了
                # 拡張されたボクセルを目に移動し、ボディから削除
                for pos, col in new_eye.items():
                    eye_voxels[pos] = col
                    del body_voxels[pos]
                eye_set = set(eye_voxels.keys())
                print(f"    Eye expand iter {iteration+1}: +{len(new_eye)} -> {len(eye_voxels)} eye voxels")

        # 左右対称化（ボディのみ）
        if SYMMETRIZE:
            before = len(body_voxels)
            body_voxels = symmetrize_voxels(body_voxels)
            print(f"    Symmetrized: {before} -> {len(body_voxels)} voxels")

        mesh_names = [o.name for o in objs]
        save_part('body', body_voxels, mesh_names, is_body=True)             # ボディを保存
        save_part('eyes', eye_voxels, mesh_names, is_body=True, default_on=False)  # 目を保存（デフォルト非表示）
        # ボディメッシュから分離された髪はhairグループに統合するか、body_hairとして個別保存
        if hair_voxels:
            save_part('body_hair', hair_voxels, mesh_names, is_body=False, default_on=True)
    else:
        # ボディ以外のパーツ: 通常のボクセル化
        voxels = voxelize_part(mesh_list)
        print(f"    Voxels: {len(voxels)}")
        save_part(part_key, voxels, [o.name for o in objs], is_body=False)

    # BVH木のメモリ解放
    for mi in mesh_list:
        mi.bm.free()

# パーツマニフェストをJSONファイルとして書き出し
manifest_path = os.path.join(OUT_DIR, 'parts.json')
with open(manifest_path, 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
print(f"\n  Manifest: {manifest_path}")
print(f"  Total parts: {len(manifest)}")
# 完了メッセージ
print(f"\n{'='*60}")
print(f"  Done!")
print(f"{'='*60}")
