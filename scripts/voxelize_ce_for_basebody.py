"""
CyberpunkElfの衣装/アクセサリー/髪をBasicBodyFemaleベースボディ用にボクセル化するスクリプト。

Usage:
  blender --background --python voxelize_ce_for_basebody.py -- <input.blend> <output_dir> [voxel_size] [hair_thr]

処理:
1. CyberpunkElfモデルを開く
2. 全メッシュパーツを識別（ボディ、衣装、アクセサリー、髪）
3. 各非ボディパーツをBasicBodyFemaleと同じグリッドでボクセル化
4. 髪はカスタム閾値でボクセル化（デフォルト0.3）
5. パーツごとの.voxファイル + parts.json + grid.json を出力
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
# 時間計測モジュール
import time
# mathutilsからVector型
from mathutils import Vector
# BVHツリー
from mathutils.bvhtree import BVHTree

# コマンドライン引数を取得
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""        # 入力モデルファイル
OUT_DIR = args[1] if len(args) > 1 else ""             # 出力ディレクトリ
VOXEL_SIZE = float(args[2]) if len(args) > 2 else 0.007  # ボクセルサイズ（BasicBodyFemaleと一致）
HAIR_THR = float(args[3]) if len(args) > 3 else 0.3   # 髪の閾値倍率

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python voxelize_ce_for_basebody.py -- <input.blend> <output_dir> [voxel_size] [hair_thr]")
    sys.exit(1)

print(f"\n=== CyberpunkElf Voxelizer for BaseBody ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output: {OUT_DIR}")
print(f"  Voxel size: {VOXEL_SIZE}")
print(f"  Hair threshold: {HAIR_THR}")

# ========================================================================
# BasicBodyFemaleのグリッドを読み込んで同じ座標系を使用
# ========================================================================
BASEBODY_GRID_PATH = os.path.join(os.path.dirname(OUT_DIR), "BasicBodyFemale", "grid.json")
if os.path.exists(BASEBODY_GRID_PATH):
    with open(BASEBODY_GRID_PATH) as f:
        base_grid = json.load(f)
    print(f"  Using BasicBodyFemale grid: {BASEBODY_GRID_PATH}")
    BASE_BB_MIN = Vector(base_grid["bb_min"])     # ベースモデルのBB最小値
    BASE_BB_MAX = Vector(base_grid["bb_max"])     # ベースモデルのBB最大値
    BASE_VOXEL_SIZE = base_grid["voxel_size"]     # ベースモデルのボクセルサイズ
    USE_BASE_GRID = True
else:
    print(f"  WARNING: BasicBodyFemale grid not found at {BASEBODY_GRID_PATH}, using auto grid")
    USE_BASE_GRID = False

# ========================================================================
# モデル読み込み
# ========================================================================
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext == '.glb' or ext == '.gltf':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# ========================================================================
# メッシュをカテゴリ分類
# ========================================================================
BODY_KEYWORDS = ['body']        # ボディメッシュのキーワード
HAIR_KEYWORDS = ['hair']        # 髪メッシュのキーワード
EXCLUDE_KEYWORDS = ['collision', 'modular', 'penis', 'pubes', 'cs_']  # 除外キーワード

meshes_by_category = {
    'body': [],         # ボディ（処理しない、BasicBodyFemaleセグメントを使用）
    'hair': [],         # 髪
    'clothing': [],     # 衣装
    'accessories': [],  # アクセサリー
}

print(f"\n=== Mesh objects ===")
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    name_lower = obj.name.lower()

    # 除外キーワードに一致する場合はスキップ
    if any(kw in name_lower for kw in EXCLUDE_KEYWORDS):
        print(f"  SKIP: {obj.name}")
        continue

    vert_count = len(obj.data.vertices)

    # カテゴリ分類
    if any(kw in name_lower for kw in BODY_KEYWORDS) and 'bra' not in name_lower:
        meshes_by_category['body'].append(obj)
        print(f"  BODY: {obj.name} ({vert_count} verts)")
    elif any(kw in name_lower for kw in HAIR_KEYWORDS):
        meshes_by_category['hair'].append(obj)
        print(f"  HAIR: {obj.name} ({vert_count} verts)")
    else:
        # 衣装またはアクセサリーを名前から判定
        clothing_hints = ['bra', 'panties', 'legging', 'jacket', 'garter', 'glove', 'boot',
                         'suit', 'dress', 'skirt', 'shirt', 'pants', 'coat']
        if any(h in name_lower for h in clothing_hints):
            meshes_by_category['clothing'].append(obj)
            print(f"  CLOTHING: {obj.name} ({vert_count} verts)")
        else:
            meshes_by_category['accessories'].append(obj)
            print(f"  ACCESSORY: {obj.name} ({vert_count} verts)")

# ========================================================================
# 可視性確保とMASKモディファイア無効化
# ========================================================================
for cat_meshes in meshes_by_category.values():
    for obj in cat_meshes:
        if not obj.visible_get():
            obj.hide_set(False)
            obj.hide_viewport = False
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False
                print(f"  Disabled MASK: {obj.name}.{mod.name}")

# ========================================================================
# テクスチャサンプリング
# ========================================================================
texture_cache = {}

def cache_texture(image):
    """テクスチャをRGBバイト配列としてキャッシュ。"""
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    raw = image.pixels[:]
    n = w * h
    rgb = bytearray(n * 3)
    for i in range(n):
        si = i * 4
        rgb[i*3]   = max(0, min(255, int(raw[si]   * 255)))
        rgb[i*3+1] = max(0, min(255, int(raw[si+1] * 255)))
        rgb[i*3+2] = max(0, min(255, int(raw[si+2] * 255)))
    texture_cache[image.name] = (w, h, bytes(rgb))

def sample_texture(img_name, u, v):
    """UV座標でテクスチャの色をサンプリング。"""
    if img_name not in texture_cache:
        return None
    w, h, pix = texture_cache[img_name]
    px = int(u * w) % w
    py = int(v * h) % h
    pi = (py * w + px) * 3
    if pi + 2 < len(pix):
        return (pix[pi], pix[pi+1], pix[pi+2])
    return None

def find_base_texture(mat):
    """マテリアルからベースカラーテクスチャを検索（スコアリング方式）。"""
    if not mat or not hasattr(mat, 'node_tree') or not mat.node_tree:
        return None
    best = None
    best_score = -999
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            n = node.image.name.lower()
            score = 0
            if 'basecolor' in n or 'base_color' in n or 'diffuse' in n or 'color' in n:
                score = 10
            elif 'albedo' in n:
                score = 8
            elif any(k in n for k in ['normal','roughness','metallic','specular','height','opacity','ao','emissive']):
                score = -10
            if score > best_score:
                best_score = score
                best = node.image
    return best

# 全マテリアルのテクスチャをキャッシュ
for mat in bpy.data.materials:
    tex = find_base_texture(mat)
    if tex:
        cache_texture(tex)

print(f"  Cached textures: {len(texture_cache)}")

# ========================================================================
# グリッドセットアップ - BasicBodyFemaleのグリッドを使用
# ========================================================================
if USE_BASE_GRID:
    bb_min = BASE_BB_MIN
    bb_max = BASE_BB_MAX
    voxel_size = BASE_VOXEL_SIZE
else:
    # 全メッシュからバウンディングボックスを計算
    all_verts = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for cat_meshes in meshes_by_category.values():
        for obj in cat_meshes:
            obj_eval = obj.evaluated_get(depsgraph)
            mesh_eval = obj_eval.to_mesh()
            for v in mesh_eval.vertices:
                all_verts.append(obj.matrix_world @ v.co)
            obj_eval.to_mesh_clear()
    bb_min = Vector((min(v.x for v in all_verts), min(v.y for v in all_verts), min(v.z for v in all_verts)))
    bb_max = Vector((max(v.x for v in all_verts), max(v.y for v in all_verts), max(v.z for v in all_verts)))
    pad = VOXEL_SIZE * 2
    bb_min -= Vector((pad, pad, pad))
    bb_max += Vector((pad, pad, pad))
    voxel_size = VOXEL_SIZE

# グリッドサイズを計算
gx = int(math.ceil((bb_max.x - bb_min.x) / voxel_size)) + 1
gy = int(math.ceil((bb_max.y - bb_min.y) / voxel_size)) + 1
gz = int(math.ceil((bb_max.z - bb_min.z) / voxel_size)) + 1

print(f"\n  Grid: {gx}x{gy}x{gz}")
print(f"  BBox: ({bb_min.x:.3f},{bb_min.y:.3f},{bb_min.z:.3f}) -> ({bb_max.x:.3f},{bb_max.y:.3f},{bb_max.z:.3f})")

# 256上限
sx = min(gx, 256)
sy = min(gy, 256)
sz = min(gz, 256)

# ========================================================================
# VOXライター
# ========================================================================
def write_vox(filepath, sx, sy, sz, voxel_list, pal):
    """ボクセルデータをVOXファイルとして書き出す。"""
    num = len(voxel_list)
    xyzi_size = 4 + num * 4
    size_size = 12
    rgba_size = 256 * 4
    chunks = bytearray()
    chunks += b'SIZE' + struct.pack('<II', size_size, 0) + struct.pack('<III', sx, sy, sz)
    chunks += b'XYZI' + struct.pack('<II', xyzi_size, 0) + struct.pack('<I', num)
    for x, y, z, c in voxel_list:
        chunks += struct.pack('BBBB', x & 0xFF, y & 0xFF, z & 0xFF, c & 0xFF)
    chunks += b'RGBA' + struct.pack('<II', rgba_size, 0)
    for i in range(256):
        if i < len(pal):
            r, g, b = pal[i]
            chunks += struct.pack('BBBB', r, g, b, 255)
        else:
            chunks += struct.pack('BBBB', 0, 0, 0, 255)
    out = bytearray()
    out += b'VOX ' + struct.pack('<I', 150) + b'MAIN' + struct.pack('<II', 0, len(chunks)) + chunks
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'wb') as f:
        f.write(out)

# ========================================================================
# メッシュオブジェクト群をボクセル化する関数
# ========================================================================
def voxelize_meshes(mesh_objects, threshold_mult=1.2):
    """メッシュオブジェクトのリストをボクセル化し、(x,y,z,color_index)のリストを返す。"""
    depsgraph = bpy.context.evaluated_depsgraph_get()

    # 全メッシュオブジェクトから結合BVHを構築
    combined_bm = bmesh.new()
    mat_map = {}  # face_index → (material, obj)
    face_offset = 0

    for obj in mesh_objects:
        obj_eval = obj.evaluated_get(depsgraph)
        mesh_eval = obj_eval.to_mesh()
        bm_part = bmesh.new()
        bm_part.from_mesh(mesh_eval)
        bm_part.transform(obj.matrix_world)  # ワールド空間に変換
        bmesh.ops.triangulate(bm_part, faces=bm_part.faces)  # 三角形化

        # マテリアルマッピングを保存
        for face in bm_part.faces:
            mat_idx = face.material_index
            mat = obj.data.materials[mat_idx] if mat_idx < len(obj.data.materials) else None
            mat_map[face_offset + face.index] = (mat, obj)
        face_offset += len(bm_part.faces)

        # 結合BMeshにマージ
        vert_offset = len(combined_bm.verts)
        for v in bm_part.verts:
            combined_bm.verts.new(v.co)
        combined_bm.verts.ensure_lookup_table()

        # UVレイヤーのコピー
        uv_layer_src = bm_part.loops.layers.uv.active
        uv_layer_dst = combined_bm.loops.layers.uv.active
        if uv_layer_dst is None and uv_layer_src is not None:
            uv_layer_dst = combined_bm.loops.layers.uv.new()

        for face in bm_part.faces:
            try:
                new_verts = [combined_bm.verts[vert_offset + v.index] for v in face.verts]
                new_face = combined_bm.faces.new(new_verts)
                if uv_layer_src and uv_layer_dst:
                    for i, loop in enumerate(new_face.loops):
                        loop[uv_layer_dst].uv = face.loops[i][uv_layer_src].uv
            except Exception:
                pass

        bm_part.free()
        obj_eval.to_mesh_clear()

    combined_bm.faces.ensure_lookup_table()
    combined_bm.verts.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(combined_bm)
    uv_layer = combined_bm.loops.layers.uv.active

    thr = voxel_size * threshold_mult  # BVH距離閾値
    palette_map = {}
    palette_list = []

    def get_palette_index(r, g, b):
        """色からパレットインデックスを取得。"""
        key = (r, g, b)
        if key in palette_map:
            return palette_map[key]
        idx = len(palette_list) + 1
        if idx > 255:
            best_idx = 1
            best_dist = 999999
            for i, (pr, pg, pb) in enumerate(palette_list):
                d = (r-pr)**2 + (g-pg)**2 + (b-pb)**2
                if d < best_dist:
                    best_dist = d
                    best_idx = i + 1
            return best_idx
        palette_map[key] = idx
        palette_list.append((r, g, b))
        return idx

    voxels = []
    t0 = time.time()

    # 全グリッド座標を走査
    for vz in range(sz):
        if vz % 20 == 0:
            elapsed = time.time() - t0
            print(f"      z={vz}/{sz} voxels={len(voxels)} ({elapsed:.1f}s)", flush=True)
        for vx in range(sx):
            for vy in range(sy):
                center = Vector((
                    bb_min.x + (vx + 0.5) * voxel_size,
                    bb_min.y + (vy + 0.5) * voxel_size,
                    bb_min.z + (vz + 0.5) * voxel_size,
                ))
                nearest, normal, face_idx, dist = bvh.find_nearest(center)
                if nearest is None or dist >= thr:
                    continue

                # デフォルトカラー
                ci = get_palette_index(200, 180, 160)

                # テクスチャサンプリング
                if face_idx is not None and uv_layer:
                    face = combined_bm.faces[face_idx]
                    mat_info = mat_map.get(face_idx)
                    if mat_info:
                        mat, obj = mat_info
                        tex = find_base_texture(mat)
                        if tex and tex.name in texture_cache:
                            uv = face.loops[0][uv_layer].uv
                            sampled = sample_texture(tex.name, uv.x, uv.y)
                            if sampled:
                                ci = get_palette_index(*sampled)

                voxels.append((vx, vy, vz, ci))

    combined_bm.free()
    return voxels, palette_list

# ========================================================================
# 各カテゴリを処理（ボディは除く — BasicBodyFemaleセグメントを使用）
# ========================================================================
os.makedirs(OUT_DIR, exist_ok=True)

parts_manifest = []  # パーツマニフェスト

categories_to_process = ['clothing', 'accessories', 'hair']

for category in categories_to_process:
    cat_meshes = meshes_by_category[category]
    if not cat_meshes:
        continue

    cat_dir = os.path.join(OUT_DIR, category)
    os.makedirs(cat_dir, exist_ok=True)

    for obj in cat_meshes:
        # ファイル名を安全な形式に変換
        safe_name = obj.name.lower().replace(' ', '_').replace('-', '_').replace('__', '_')
        for prefix in ['cyberpunkelf_', 'cyberpunk_elf_']:
            if safe_name.startswith(prefix):
                safe_name = safe_name[len(prefix):]

        print(f"\n  Processing: {obj.name} -> {category}/{safe_name}.vox")

        # カテゴリに応じた閾値を設定
        if category == 'hair':
            thr_mult = HAIR_THR
            print(f"    Using hair threshold: {thr_mult}")
        else:
            thr_mult = 1.2

        # ボクセル化
        voxels, palette = voxelize_meshes([obj], threshold_mult=thr_mult)

        if not voxels:
            print(f"    WARNING: No voxels generated for {obj.name}")
            continue

        # 範囲外ボクセルをフィルタ
        voxels = [(x, y, z, c) for x, y, z, c in voxels if 0 <= x < 256 and 0 <= y < 256 and 0 <= z < 256]

        # VOXファイルとして書き出し
        vox_path = os.path.join(cat_dir, f"{safe_name}.vox")
        write_vox(vox_path, sx, sy, sz, voxels, palette)

        # マニフェストに追加
        rel_path = f"/{os.path.basename(OUT_DIR)}/{category}/{safe_name}.vox"
        parts_manifest.append({
            "key": safe_name,
            "file": rel_path,
            "voxels": len(voxels),
            "default_on": True,
            "meshes": [obj.name],
            "is_body": False,
            "category": category,
        })

        print(f"    Written: {vox_path} ({len(voxels)} voxels)")

# ========================================================================
# grid.jsonを書き出し（BasicBodyFemaleと同じ）
# ========================================================================
grid_meta = {
    "voxel_size": voxel_size,
    "gx": sx, "gy": sy, "gz": sz,
    "grid_origin": [bb_min.x, bb_min.y, bb_min.z],
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
}
with open(os.path.join(OUT_DIR, "grid.json"), 'w') as f:
    json.dump(grid_meta, f, indent=2)

# ========================================================================
# parts.jsonを書き出し
# ========================================================================
with open(os.path.join(OUT_DIR, "parts.json"), 'w') as f:
    json.dump(parts_manifest, f, indent=2)

# 結果サマリー
print(f"\n=== Done ===")
print(f"  Parts: {len(parts_manifest)}")
print(f"  Output: {OUT_DIR}")
for p in parts_manifest:
    print(f"    {p['key']}: {p['voxels']} voxels ({p['category']})")
