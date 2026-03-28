"""
Blender Python: GLB武器をボクセルアート(.vox)に変換するスクリプト。
固定voxel_sizeを使用、変形なし。マテリアルフラットカラーを使用。
Fantasy Weapons Basemesh Pack → game-assets/wapons/ 用に設計。

Usage:
  blender --background --python voxelize_weapon.py -- <input.glb> <output_dir> [voxel_size]

引数:
  input.glb   : 単体武器のGLBファイル
  output_dir  : .vox + grid.json の出力ディレクトリ
  voxel_size  : 固定ボクセルサイズ（デフォルト: 0.007）
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
# JSON操作モジュール
import json
# mathutilsからVector型
from mathutils import Vector
# BVHツリー（高速最近点検索）
from mathutils.bvhtree import BVHTree

# ── 引数パース ──────────────────────────────────────────────────
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""   # 入力GLBファイル
OUT_DIR = args[1] if len(args) > 1 else ""        # 出力ディレクトリ
VOXEL_SIZE = float(args[2]) if len(args) > 2 else 0.007  # ボクセルサイズ
SCALE = float(args[3]) if len(args) > 3 else 1.0  # スケール倍率

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python voxelize_weapon.py -- <input.glb> <out_dir> [voxel_size] [scale]")
    sys.exit(1)

print(f"\n=== Weapon Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output dir: {OUT_DIR}")
print(f"  Voxel size: {VOXEL_SIZE}")
print(f"  Scale: {SCALE}")

# ── ファイル読み込み ────────────────────────────────────────────
ext = os.path.splitext(INPUT_PATH)[1].lower()

# シーンをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# 拡張子に応じてインポート
if ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)
else:
    print(f"  Unsupported format: {ext}")
    sys.exit(1)

# 出力ディレクトリを作成
os.makedirs(OUT_DIR, exist_ok=True)

# ── メッシュオブジェクトを収集 ─────────────────────────────────
all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print(f"  Found {len(all_meshes)} mesh(es): {[o.name for o in all_meshes]}")

if not all_meshes:
    print("  No meshes found, exiting.")
    sys.exit(1)


# ── マテリアルカラー抽出 ────────────────────────────────────────
def get_material_flat_color(mat):
    """マテリアルからフラットディフューズカラーを取得。"""
    if not mat:
        return (0.6, 0.6, 0.6)
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                bc = node.inputs.get('Base Color')
                if bc and not bc.is_linked:
                    c = bc.default_value
                    return (c[0], c[1], c[2])
                # メタリック値でシェーディングヒント
                met = node.inputs.get('Metallic')
                if met:
                    met_val = met.default_value if not met.is_linked else 0.5
                else:
                    met_val = 0.0
                # テクスチャが解決できない場合、メタリックヒントで色決定
                if met_val > 0.5:
                    return (0.78, 0.78, 0.78)  # メタリックシルバー
                return (0.5, 0.5, 0.5)
    return (mat.diffuse_color[0], mat.diffuse_color[1], mat.diffuse_color[2])


def find_base_color_texture(mat):
    """マテリアルのノードツリーからベースカラーテクスチャイメージを検索。"""
    if not mat or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bc_input = node.inputs.get('Base Color')
            if bc_input and bc_input.is_linked:
                link = bc_input.links[0]
                src = link.from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    return src.image
    # フォールバック: 任意のテクスチャイメージノード
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            return node.image
    return None


# テクスチャピクセルキャッシュ
_tex_cache = {}

def load_texture_pixels(img):
    """テクスチャのピクセルデータをキャッシュに読み込み。"""
    key = img.name
    if key in _tex_cache:
        return _tex_cache[key]
    w, h = img.size[0], img.size[1]
    if w == 0 or h == 0:
        _tex_cache[key] = (None, 0, 0)
        return (None, 0, 0)
    try:
        px = list(img.pixels[:])
    except Exception:
        _tex_cache[key] = (None, 0, 0)
        return (None, 0, 0)
    _tex_cache[key] = (px, w, h)
    return (px, w, h)


def sample_texture(img, u, v):
    """UV座標でテクスチャの色をサンプリング。"""
    px, w, h = load_texture_pixels(img)
    if px is None or w == 0 or h == 0:
        return None
    u = u % 1.0
    v = v % 1.0
    ix = max(0, min(int(u * w), w - 1))
    iy = max(0, min(int(v * h), h - 1))
    base = (iy * w + ix) * 4
    if base + 3 >= len(px):
        return None
    return px[base], px[base+1], px[base+2], px[base+3]


# ── VOXライター ───────────────────────────────────────────────
def write_vox(filepath, size_x, size_y, size_z, voxels, palette):
    """ボクセルデータをVOXファイルとして書き出す。"""
    with open(filepath, 'wb') as f:
        def w32(v): f.write(struct.pack('<I', v))

        size_data = struct.pack('<III', size_x, size_y, size_z)
        xyzi_data = struct.pack('<I', len(voxels))
        for x, y, z, ci in voxels:
            xyzi_data += struct.pack('BBBB', x, y, z, ci)

        rgba_data = b''
        for i in range(256):
            if i < len(palette):
                r, g, b = palette[i]
                rgba_data += struct.pack('BBBB', r, g, b, 255)
            else:
                rgba_data += struct.pack('BBBB', 0, 0, 0, 255)

        def chunk(cid, data):
            return cid + struct.pack('<II', len(data), 0) + data

        main_content = chunk(b'SIZE', size_data) + chunk(b'XYZI', xyzi_data) + chunk(b'RGBA', rgba_data)

        f.write(b'VOX ')
        w32(150)
        f.write(b'MAIN')
        w32(0)
        w32(len(main_content))
        f.write(main_content)

    print(f"  Written: {filepath} ({len(voxels)} voxels, {size_x}x{size_y}x{size_z})")


# ── 全メッシュを統合してボクセル化 ─────────────────────────────
print(f"\n=== Voxelizing weapon ===")

# 全オブジェクトを選択
for obj in all_meshes:
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

# 評価済みメッシュをワールド変換付きで取得
depsgraph = bpy.context.evaluated_depsgraph_get()

# 結合バウンディングボックスを計算
all_verts_world = []
mesh_data_list = []

for obj in all_meshes:
    obj_eval = obj.evaluated_get(depsgraph)
    mesh = obj_eval.to_mesh()

    # 三角形化
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()

    mat_world = obj.matrix_world
    # ワールド空間の頂点（スケール適用）
    verts_world = [mat_world @ Vector(v.co) * SCALE for v in mesh.vertices]
    all_verts_world.extend(verts_world)
    mesh_data_list.append((mesh, mat_world, obj, obj_eval, verts_world))

if not all_verts_world:
    print("  No vertices found.")
    sys.exit(1)

# バウンディングボックスを計算
bb_min = Vector((min(v.x for v in all_verts_world),
                  min(v.y for v in all_verts_world),
                  min(v.z for v in all_verts_world)))
bb_max = Vector((max(v.x for v in all_verts_world),
                  max(v.y for v in all_verts_world),
                  max(v.z for v in all_verts_world)))

bb_size = bb_max - bb_min
print(f"  Bounding box: {bb_size.x:.4f} x {bb_size.y:.4f} x {bb_size.z:.4f}")
print(f"  BB min: ({bb_min.x:.4f}, {bb_min.y:.4f}, {bb_min.z:.4f})")
print(f"  BB max: ({bb_max.x:.4f}, {bb_max.y:.4f}, {bb_max.z:.4f})")

# 固定voxel_sizeでグリッドサイズを計算
voxel_size = VOXEL_SIZE
grid_x = max(1, int(bb_size.x / voxel_size) + 2)
grid_y = max(1, int(bb_size.y / voxel_size) + 2)
grid_z = max(1, int(bb_size.z / voxel_size) + 2)

# 各軸を256にクランプ（VOXフォーマット制限）
if grid_x > 256 or grid_y > 256 or grid_z > 256:
    print(f"  WARNING: Grid {grid_x}x{grid_y}x{grid_z} exceeds 256, clamping.")
    grid_x = min(256, grid_x)
    grid_y = min(256, grid_y)
    grid_z = min(256, grid_z)

print(f"  Grid: {grid_x}x{grid_y}x{grid_z}, voxel_size: {voxel_size:.6f}")

# グリッド原点（1ボクセルマージン付き）
grid_origin = Vector((
    bb_min.x - voxel_size,
    bb_min.y - voxel_size,
    bb_min.z - voxel_size
))

# 各メッシュのBVHツリーとマテリアル情報を構築
bvh_list = []
for mesh, mat_world, obj, obj_eval, verts_world in mesh_data_list:
    # ワールド空間の頂点と三角形
    world_verts = [mat_world @ v.co * SCALE for v in mesh.vertices]
    world_tris = [(p.vertices[0], p.vertices[1], p.vertices[2]) for p in mesh.polygons]
    bvh = BVHTree.FromPolygons(world_verts, world_tris)

    # UVレイヤー
    uv_layer = mesh.uv_layers.active
    uv_data = uv_layer.data if uv_layer else None

    # マテリアルごとのテクスチャとフラットカラー
    mat_textures = {}
    mat_colors = {}
    for mi, mat_slot in enumerate(obj.material_slots):
        mat = mat_slot.material
        tex = find_base_color_texture(mat)
        mat_textures[mi] = tex
        mat_colors[mi] = get_material_flat_color(mat)

    # ポリゴンごとのUV座標
    poly_uvs = {}
    if uv_data:
        for pi, poly in enumerate(mesh.polygons):
            uvs = []
            for li in poly.loop_indices:
                uv = uv_data[li].uv
                uvs.append((uv[0], uv[1]))
            poly_uvs[pi] = uvs

    bvh_list.append({
        'bvh': bvh,
        'mesh': mesh,
        'world_verts': world_verts,
        'mat_textures': mat_textures,
        'mat_colors': mat_colors,
        'poly_uvs': poly_uvs,
    })

# ボクセル化処理
threshold = voxel_size * 0.8  # BVH距離閾値
colors_map = {}                # (gx,gy,gz) → (r,g,b)
progress_step = max(1, grid_x // 10)

for gx in range(grid_x):
    if gx % progress_step == 0:
        print(f"  Progress: {gx}/{grid_x} ({100*gx//grid_x}%)")
    for gy in range(grid_y):
        for gz in range(grid_z):
            # グリッド座標→ワールド座標
            wx = grid_origin.x + (gx + 0.5) * voxel_size
            wy = grid_origin.y + (gy + 0.5) * voxel_size
            wz = grid_origin.z + (gz + 0.5) * voxel_size
            pt = Vector((wx, wy, wz))

            best_dist = threshold + 1
            best_color = None

            # 全メッシュのBVHで最近点を検索
            for bdata in bvh_list:
                loc, normal, face_idx, dist = bdata['bvh'].find_nearest(pt)
                if loc is None or dist > threshold or dist >= best_dist:
                    continue
                best_dist = dist

                # 色を取得（テクスチャサンプリング or フラットカラー）
                r, g, b = 0.6, 0.6, 0.6
                mesh = bdata['mesh']
                if face_idx is not None and face_idx < len(mesh.polygons):
                    poly = mesh.polygons[face_idx]
                    mi = poly.material_index
                    tex = bdata['mat_textures'].get(mi)

                    if tex and face_idx in bdata['poly_uvs']:
                        # テクスチャサンプリング（重心座標でUV補間）
                        uvs = bdata['poly_uvs'][face_idx]
                        v0 = bdata['world_verts'][poly.vertices[0]]
                        v1 = bdata['world_verts'][poly.vertices[1]]
                        v2 = bdata['world_verts'][poly.vertices[2]]
                        e0 = Vector(v1) - Vector(v0)
                        e1 = Vector(v2) - Vector(v0)
                        ep = loc - Vector(v0)
                        d00 = e0.dot(e0)
                        d01 = e0.dot(e1)
                        d11 = e1.dot(e1)
                        dp0 = ep.dot(e0)
                        dp1 = ep.dot(e1)
                        denom = d00 * d11 - d01 * d01
                        if abs(denom) > 1e-12:
                            u_bc = (d11 * dp0 - d01 * dp1) / denom
                            v_bc = (d00 * dp1 - d01 * dp0) / denom
                            w_bc = 1.0 - u_bc - v_bc
                            u_bc = max(0, min(1, u_bc))
                            v_bc = max(0, min(1, v_bc))
                            w_bc = max(0, min(1, w_bc))
                            u_tex = w_bc * uvs[0][0] + u_bc * uvs[1][0] + v_bc * uvs[2][0]
                            v_tex = w_bc * uvs[0][1] + u_bc * uvs[1][1] + v_bc * uvs[2][1]
                            sampled = sample_texture(tex, u_tex, v_tex)
                            if sampled:
                                r, g, b = sampled[0], sampled[1], sampled[2]
                            else:
                                r, g, b = bdata['mat_colors'].get(mi, (0.6, 0.6, 0.6))
                        else:
                            r, g, b = bdata['mat_colors'].get(mi, (0.6, 0.6, 0.6))
                    else:
                        r, g, b = bdata['mat_colors'].get(mi, (0.6, 0.6, 0.6))

                # 0-255に変換
                ri = max(0, min(255, int(r * 255)))
                gi = max(0, min(255, int(g * 255)))
                bi = max(0, min(255, int(b * 255)))
                best_color = (ri, gi, bi)

            if best_color:
                colors_map[(gx, gy, gz)] = best_color

# 一時メッシュを解放
for mesh, mat_world, obj, obj_eval, verts_world in mesh_data_list:
    obj_eval.to_mesh_clear()

if not colors_map:
    print("  No voxels generated!")
    sys.exit(1)

print(f"  Generated {len(colors_map)} voxels")

# パレットを構築（色数が256を超える場合は量子化）
unique_colors = list(set(colors_map.values()))
if len(unique_colors) > 255:
    def quantize(c, step=4):
        return ((c[0] // step) * step, (c[1] // step) * step, (c[2] // step) * step)
    new_map = {}
    for pos, col in colors_map.items():
        new_map[pos] = quantize(col)
    colors_map = new_map
    unique_colors = list(set(colors_map.values()))
    step = 8
    # 255色以下になるまで量子化ステップを拡大
    while len(unique_colors) > 255:
        new_map = {}
        for pos, col in colors_map.items():
            new_map[pos] = quantize(col, step)
        colors_map = new_map
        unique_colors = list(set(colors_map.values()))
        step *= 2

# パレットとカラーインデックスマップを作成
palette = unique_colors[:255]
color_to_idx = {c: i + 1 for i, c in enumerate(palette)}

# ボクセルデータを構築
voxels = []
for (gx, gy, gz), col in colors_map.items():
    ci = color_to_idx.get(col, 1)
    voxels.append((gx, gy, gz, ci))

# 入力ファイル名から出力名を決定
base_name = os.path.splitext(os.path.basename(INPUT_PATH))[0]
safe_name = base_name.replace(' ', '_').replace("'", "").replace('.', '_')

# VOXファイルとして書き出し
out_path = os.path.join(OUT_DIR, f"{safe_name}.vox")
write_vox(out_path, grid_x, grid_y, grid_z, voxels, palette)

# grid.jsonとして書き出し
grid_json = {
    "grid_origin": [grid_origin.x, grid_origin.y, grid_origin.z],
    "voxel_size": voxel_size,
    "gx": grid_x,
    "gy": grid_y,
    "gz": grid_z,
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
    "voxel_count": len(voxels),
    "source": base_name,
}
grid_path = os.path.join(OUT_DIR, "grid.json")
with open(grid_path, 'w') as f:
    json.dump(grid_json, f, indent=2)

print(f"  grid.json: {grid_path}")
