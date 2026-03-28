"""
Blender Python: 外部髪モデルをボクセル化し、BaseModelの頭部に合うようにスケール/配置するスクリプト。

Usage:
  blender --background --python blender_voxelize_hair_for_base.py -- <hair.fbx> <base_metrics.json> <output_dir> [voxel_size]
"""
# Blenderメインモジュール
import bpy
# BMesh操作モジュール
import bmesh
# システムモジュール
import sys
# OS操作モジュール
import os
# バイナリパックモジュール
import struct
# 数学モジュール
import math
# JSON操作モジュール
import json
# mathutilsからVector型
from mathutils import Vector
# BVHツリー（高速最近点検索）
from mathutils.bvhtree import BVHTree

# コマンドライン引数を取得
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
HAIR_PATH = args[0] if len(args) > 0 else ""           # 髪モデルファイル
BASE_METRICS_PATH = args[1] if len(args) > 1 else ""   # ベースモデルのメトリクスJSON
OUT_DIR = args[2] if len(args) > 2 else ""               # 出力ディレクトリ
VOXEL_SIZE = float(args[3]) if len(args) > 3 else 0.008 # ボクセルサイズ

if not HAIR_PATH or not BASE_METRICS_PATH or not OUT_DIR:
    print("Usage: blender --background --python blender_voxelize_hair_for_base.py -- <hair.fbx> <base_metrics.json> <output_dir> [voxel_size]")
    sys.exit(1)

print(f"\n=== Hair Voxelizer for BaseModel ===")
print(f"  Hair: {HAIR_PATH}")
print(f"  Base metrics: {BASE_METRICS_PATH}")
print(f"  Output: {OUT_DIR}")
print(f"  Voxel size: {VOXEL_SIZE}")

# ベースモデルのメトリクスを読み込み
with open(BASE_METRICS_PATH) as f:
    base_metrics = json.load(f)

# ベースモデルの頭部パラメータを取得
base_head = base_metrics['metrics']['head.x']
base_neck = base_metrics['metrics'].get('neck.x', base_head)
base_head_bottom = base_head['head'][2]       # 頭ボーンヘッドのZ座標
base_head_top = base_head['tail'][2]          # 頭ボーンテールのZ座標
base_head_center_x = base_head['head'][0]     # 頭部中心X
base_head_center_y = base_head['head'][1]     # 頭部中心Y
base_head_width = base_head['width']          # 頭部幅
base_head_depth = base_head['depth']          # 頭部奥行き

print(f"  Base head: bottom={base_head_bottom:.4f} top={base_head_top:.4f}")
print(f"  Base head size: width={base_head_width:.4f} depth={base_head_depth:.4f}")

# 髪モデルをインポート
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# 拡張子に応じてインポート
ext = os.path.splitext(HAIR_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=HAIR_PATH)
elif ext == '.obj':
    bpy.ops.wm.obj_import(filepath=HAIR_PATH)
elif ext == '.glb' or ext == '.gltf':
    bpy.ops.import_scene.gltf(filepath=HAIR_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=HAIR_PATH)

# 髪メッシュと頭メッシュを検出
hair_obj = None
head_obj = None
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    name_lower = obj.name.lower()
    # 髪メッシュ: 名前に'hair'または'curtain'を含む最大頂点数のメッシュ
    if 'hair' in name_lower or 'curtain' in name_lower:
        if hair_obj is None or len(obj.data.vertices) > len(hair_obj.data.vertices):
            hair_obj = obj
    # 頭メッシュ: 名前に'body'または'head'を含む最大頂点数のメッシュ
    if 'body' in name_lower or 'head' in name_lower:
        if head_obj is None or len(obj.data.vertices) > len(head_obj.data.vertices):
            head_obj = obj

if not hair_obj:
    print("ERROR: No hair mesh found!")
    sys.exit(1)

print(f"  Hair mesh: {hair_obj.name} ({len(hair_obj.data.vertices)} verts)")
if head_obj:
    print(f"  Head mesh: {head_obj.name} ({len(head_obj.data.vertices)} verts)")

# バウンディングボックスを取得するヘルパー関数
def get_bbox(obj):
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    mn = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    mx = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    return mn, mx

# 髪のバウンディングボックス
hair_min, hair_max = get_bbox(hair_obj)
print(f"  Hair bbox: ({hair_min.x:.4f},{hair_min.y:.4f},{hair_min.z:.4f}) -> ({hair_max.x:.4f},{hair_max.y:.4f},{hair_max.z:.4f})")

# ソースモデルの頭部パラメータを取得
if head_obj:
    # ボディメッシュがある場合、頭部の正確なサイズを測定
    head_min, head_max = get_bbox(head_obj)
    src_head_top = head_max.z
    src_head_center_x = (head_min.x + head_max.x) / 2
    src_head_center_y = (head_min.y + head_max.y) / 2
    # 高さ85%地点での頭部幅を推定
    head_verts = [head_obj.matrix_world @ v.co for v in head_obj.data.vertices]
    head_height = head_max.z - head_min.z
    head_band_z = head_min.z + head_height * 0.85
    head_band = [v for v in head_verts if abs(v.z - head_band_z) < head_height * 0.05]
    if head_band:
        src_head_width = max(v.x for v in head_band) - min(v.x for v in head_band)
        src_head_depth = max(v.y for v in head_band) - min(v.y for v in head_band)
    else:
        src_head_width = head_max.x - head_min.x
        src_head_depth = head_max.y - head_min.y
else:
    # ボディメッシュがない場合、髪メッシュから推定
    src_head_top = hair_max.z * 0.95
    src_head_center_x = (hair_min.x + hair_max.x) / 2
    src_head_center_y = (hair_min.y + hair_max.y) / 2
    src_head_width = (hair_max.x - hair_min.x) * 0.6
    src_head_depth = (hair_max.y - hair_min.y) * 0.6

print(f"  Source head top: {src_head_top:.4f}")
print(f"  Source head center: ({src_head_center_x:.4f},{src_head_center_y:.4f})")
print(f"  Source head size: width={src_head_width:.4f} depth={src_head_depth:.4f}")

# 変換パラメータを計算: ベースモデルの頭部に合うようにスケール+平行移動
scale_x = base_head_width / src_head_width if src_head_width > 0.01 else 1.0
scale_y = base_head_depth / src_head_depth if src_head_depth > 0.01 else 1.0
scale_z = (base_head_top - base_head_bottom) / (src_head_top - hair_min.z) if (src_head_top - hair_min.z) > 0.01 else 1.0
# プロポーション維持のため均一スケール（平均）を使用
uniform_scale = (scale_x + scale_y + scale_z) / 3
print(f"  Scale: x={scale_x:.4f} y={scale_y:.4f} z={scale_z:.4f} uniform={uniform_scale:.4f}")

# 平行移動: ソース頭頂→ベース頭頂、中心→中心
offset_x = base_head_center_x - src_head_center_x * uniform_scale
offset_y = base_head_center_y - src_head_center_y * uniform_scale
offset_z = base_head_top - src_head_top * uniform_scale

print(f"  Offset: ({offset_x:.4f},{offset_y:.4f},{offset_z:.4f})")

# 髪メッシュのBVHツリーを構築
depsgraph = bpy.context.evaluated_depsgraph_get()
hair_eval = hair_obj.evaluated_get(depsgraph)
mesh_eval = hair_eval.to_mesh()

bm = bmesh.new()
bm.from_mesh(mesh_eval)
bm.transform(hair_obj.matrix_world)  # ワールド空間に変換
bmesh.ops.triangulate(bm, faces=bm.faces)  # 三角形化
bm.faces.ensure_lookup_table()
bm.verts.ensure_lookup_table()
bvh = BVHTree.FromBMesh(bm)  # BVHツリー構築

# テクスチャサンプリング
texture_cache = {}

def cache_texture(image):
    """テクスチャをRGBバイト配列としてキャッシュ。"""
    if image.name in texture_cache: return
    w, h = image.size
    if w == 0 or h == 0: return
    raw = image.pixels[:]
    n = w * h
    rgb = bytearray(n * 3)
    for i in range(n):
        si = i * 4
        rgb[i*3] = max(0, min(255, int(raw[si]*255)))
        rgb[i*3+1] = max(0, min(255, int(raw[si+1]*255)))
        rgb[i*3+2] = max(0, min(255, int(raw[si+2]*255)))
    texture_cache[image.name] = (w, h, bytes(rgb))

def sample_texture(img_name, u, v):
    """UV座標でテクスチャの色をサンプリング。"""
    if img_name not in texture_cache: return None
    w, h, pix = texture_cache[img_name]
    px, py = int(u*w)%w, int(v*h)%h
    pi = (py*w+px)*3
    return (pix[pi], pix[pi+1], pix[pi+2]) if pi+2 < len(pix) else None

def find_base_texture(mat):
    """マテリアルからベースカラーテクスチャを検索（スコアリング方式）。"""
    if not mat or not hasattr(mat, 'node_tree') or not mat.node_tree: return None
    best, best_s = None, -999
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            n = node.image.name.lower()
            # 名前に基づくスコアリング
            s = 10 if ('basecolor' in n or 'base_color' in n or 'diffuse' in n or 'hair' in n) else (8 if 'albedo' in n else (-10 if any(k in n for k in ['normal','roughness','metallic','specular','height','opacity','ao','emissive']) else 0))
            if s > best_s: best_s, best = s, node.image
    return best

# 全マテリアルのテクスチャをキャッシュ
for mat in bpy.data.materials:
    tex = find_base_texture(mat)
    if tex: cache_texture(tex)

# UVレイヤーを取得
uv_layer = bm.loops.layers.uv.active

# ベースモデル空間でのボクセル化グリッドを計算
# 髪のバウンディングボックスをベースモデル空間に変換
scaled_hair_min = Vector((
    hair_min.x * uniform_scale + offset_x,
    hair_min.y * uniform_scale + offset_y,
    hair_min.z * uniform_scale + offset_z,
))
scaled_hair_max = Vector((
    hair_max.x * uniform_scale + offset_x,
    hair_max.y * uniform_scale + offset_y,
    hair_max.z * uniform_scale + offset_z,
))

# パディング付きバウンディングボックス
pad = VOXEL_SIZE * 2
bb_min = scaled_hair_min - Vector((pad, pad, pad))
bb_max = scaled_hair_max + Vector((pad, pad, pad))

# グリッドサイズ（256上限）
gx = min(256, int(math.ceil((bb_max.x - bb_min.x) / VOXEL_SIZE)) + 1)
gy = min(256, int(math.ceil((bb_max.y - bb_min.y) / VOXEL_SIZE)) + 1)
gz = min(256, int(math.ceil((bb_max.z - bb_min.z) / VOXEL_SIZE)) + 1)

print(f"\n  Grid: {gx}x{gy}x{gz}")
print(f"  BBox: ({bb_min.x:.4f},{bb_min.y:.4f},{bb_min.z:.4f}) -> ({bb_max.x:.4f},{bb_max.y:.4f},{bb_max.z:.4f})")

# ボクセル化: ベースモデル空間でサンプリングし、髪空間に逆変換してBVH検索
thr = VOXEL_SIZE * 3.0  # 髪は大きめの閾値が必要
voxels = {}              # (vx,vy,vz) → カラーインデックス
palette_map = {}
palette_list = []

def get_ci(r, g, b):
    """色からパレットインデックスを取得（新色なら追加）。"""
    key = (r, g, b)
    if key in palette_map: return palette_map[key]
    idx = len(palette_list) + 1
    if idx > 255:
        # パレット上限: 最近色を検索
        best_idx, best_d = 1, 999999
        for i, (pr,pg,pb) in enumerate(palette_list):
            d = (r-pr)**2+(g-pg)**2+(b-pb)**2
            if d < best_d: best_d, best_idx = d, i+1
        return best_idx
    palette_map[key] = idx
    palette_list.append((r, g, b))
    return idx

import time
t0 = time.time()

# 全グリッド座標を走査
for vz in range(gz):
    if vz % 10 == 0:
        print(f"    z={vz}/{gz} voxels={len(voxels)} ({time.time()-t0:.1f}s)", flush=True)
    for vx in range(gx):
        for vy in range(gy):
            # ベースモデルワールド空間の位置
            base_x = bb_min.x + (vx + 0.5) * VOXEL_SIZE
            base_y = bb_min.y + (vy + 0.5) * VOXEL_SIZE
            base_z = bb_min.z + (vz + 0.5) * VOXEL_SIZE

            # 髪モデル空間に逆変換
            hair_x = (base_x - offset_x) / uniform_scale
            hair_y = (base_y - offset_y) / uniform_scale
            hair_z = (base_z - offset_z) / uniform_scale

            # BVHで最近点を検索
            center = Vector((hair_x, hair_y, hair_z))
            nearest, normal, face_idx, dist = bvh.find_nearest(center)
            if nearest is None or dist >= thr / uniform_scale:
                continue

            # デフォルトの髪色
            ci = get_ci(80, 60, 40)
            # テクスチャからの色取得を試行
            if face_idx is not None and uv_layer:
                face = bm.faces[face_idx]
                if face.material_index < len(hair_obj.data.materials):
                    mat = hair_obj.data.materials[face.material_index]
                    tex = find_base_texture(mat)
                    if tex and tex.name in texture_cache:
                        uv = face.loops[0][uv_layer].uv
                        sampled = sample_texture(tex.name, uv.x, uv.y)
                        if sampled:
                            ci = get_ci(*sampled)

            voxels[(vx, vy, vz)] = ci

print(f"  Total: {len(voxels)} voxels")

# VOXファイルとして書き出し
os.makedirs(OUT_DIR, exist_ok=True)

def write_vox(filepath, sx, sy, sz, voxel_dict, pal):
    """ボクセルデータをVOXファイルとして書き出す。"""
    vlist = [(x, y, z, c) for (x, y, z), c in voxel_dict.items()]
    n = len(vlist)
    chunks = bytearray()
    chunks += b'SIZE' + struct.pack('<II', 12, 0) + struct.pack('<III', sx, sy, sz)
    chunks += b'XYZI' + struct.pack('<II', 4+n*4, 0) + struct.pack('<I', n)
    for x, y, z, c in vlist:
        chunks += struct.pack('BBBB', x, y, z, c)
    chunks += b'RGBA' + struct.pack('<II', 256*4, 0)
    for i in range(256):
        if i < len(pal):
            chunks += struct.pack('BBBB', pal[i][0], pal[i][1], pal[i][2], 255)
        else:
            chunks += struct.pack('BBBB', 0, 0, 0, 255)
    out = bytearray(b'VOX ') + struct.pack('<I', 150) + b'MAIN' + struct.pack('<II', 0, len(chunks)) + chunks
    with open(filepath, 'wb') as f:
        f.write(out)

# 髪VOXを書き出し
write_vox(os.path.join(OUT_DIR, "hair.vox"), gx, gy, gz, voxels, palette_list)

# grid.jsonを書き出し
grid_info = {
    "voxel_size": VOXEL_SIZE,
    "gx": gx, "gy": gy, "gz": gz,
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
    "source": os.path.basename(HAIR_PATH),
    "scale": uniform_scale,
    "offset": [offset_x, offset_y, offset_z],
}
with open(os.path.join(OUT_DIR, "grid.json"), 'w') as f:
    json.dump(grid_info, f, indent=2)

# parts.jsonを書き出し
dir_name = os.path.basename(OUT_DIR)
parts = [{
    "key": "hair",
    "file": f"/{dir_name}/hair.vox",
    "voxels": len(voxels),
    "default_on": True,
    "meshes": [hair_obj.name],
    "is_body": False,
    "category": "hair",
}]
with open(os.path.join(OUT_DIR, "parts.json"), 'w') as f:
    json.dump(parts, f, indent=2)

# リソース解放
bm.free()
hair_eval.to_mesh_clear()

# 結果を表示
print(f"\n=== Done ===")
print(f"  Hair: {gx}x{gy}x{gz} ({len(voxels)} voxels)")
print(f"  Scale: {uniform_scale:.4f}")
