"""
Blender Python: 3Dモデルをフィールドオブジェクト用ボクセルアート(.vox)に変換するスクリプト。
チビ変形なし、顔処理なし、衣装ロジックなし。
木、岩、建物などのシンプルでクリーンなボクセル化。

Usage:
  blender --background --python voxelize_object.py -- <input.blend> <output_dir> [resolution] [object_name]

引数:
  input.blend  : Blender/FBX/GLBファイル
  output_dir   : .voxファイルの出力ディレクトリ
  resolution   : ボクセルグリッドの高さ（デフォルト: 60）
  object_name  : (省略可) ボクセル化する特定のオブジェクト名。省略時は全可視メッシュ。

例:
  # ファイル内の全オブジェクトをボクセル化:
  blender --background --python voxelize_object.py -- trees.blend public/field/ 60

  # 特定オブジェクトをボクセル化:
  blender --background --python voxelize_object.py -- trees.blend public/field/ 60 "Tree_01"
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
INPUT_PATH = args[0] if len(args) > 0 else ""    # 入力ファイル
OUT_DIR = args[1] if len(args) > 1 else ""         # 出力ディレクトリ
RESOLUTION = int(args[2]) if len(args) > 2 else 60  # グリッド解像度（高さ）
TARGET_OBJ = args[3] if len(args) > 3 else None    # 対象オブジェクト名

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python voxelize_object.py -- <input> <out_dir> [res] [object_name]")
    sys.exit(1)

print(f"\n=== Object Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output dir: {OUT_DIR}")
print(f"  Resolution: {RESOLUTION}")
if TARGET_OBJ:
    print(f"  Target object: {TARGET_OBJ}")

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
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

os.makedirs(OUT_DIR, exist_ok=True)

# MASKモディファイアを無効化
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    for mod in obj.modifiers:
        if mod.type == 'MASK' and mod.show_viewport:
            mod.show_viewport = False

bpy.context.view_layer.update()

# ── 対象メッシュを収集 ─────────────────────────────────────────
if TARGET_OBJ:
    # 特定オブジェクト指定時
    all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name == TARGET_OBJ]
    if not all_meshes:
        # 部分一致でも検索
        all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and TARGET_OBJ in o.name]
else:
    # 可視メッシュ全て
    all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]

print(f"  Meshes to voxelize: {len(all_meshes)}")
for o in all_meshes:
    print(f"    {o.name}: {len(o.data.vertices)} verts")

if not all_meshes:
    print("  No meshes found!")
    sys.exit(1)

# ── マテリアルカラー抽出 ────────────────────────────────────────
def get_material_color(mat):
    """マテリアルからベースカラーを取得。"""
    if not mat:
        return (0.5, 0.5, 0.5)
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                bc = node.inputs.get('Base Color')
                if bc and not bc.is_linked:
                    c = bc.default_value
                    return (c[0], c[1], c[2])
                return (0.5, 0.5, 0.5)
    return (mat.diffuse_color[0], mat.diffuse_color[1], mat.diffuse_color[2])

def find_texture(mat):
    """マテリアルからベースカラーテクスチャを検索。"""
    if not mat or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bc = node.inputs.get('Base Color')
            if bc and bc.is_linked:
                src = bc.links[0].from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    return src.image
                # グループノード内も検索
                if src.type == 'GROUP' and src.node_tree:
                    for inner in src.node_tree.nodes:
                        if inner.type == 'TEX_IMAGE' and inner.image:
                            return inner.image
    # フォールバック: 任意のテクスチャイメージ
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            n = node.image.name.lower()
            if not any(k in n for k in ['normal', 'roughness', 'metallic', 'height']):
                return node.image
    return None

# テクスチャキャッシュ
_tex_cache = {}

def load_tex(img):
    """テクスチャピクセルをキャッシュに読み込み。"""
    if img.name in _tex_cache:
        return _tex_cache[img.name]
    w, h = img.size
    if w == 0 or h == 0:
        _tex_cache[img.name] = (None, 0, 0)
        return (None, 0, 0)
    try:
        px = list(img.pixels[:])
    except:
        _tex_cache[img.name] = (None, 0, 0)
        return (None, 0, 0)
    _tex_cache[img.name] = (px, w, h)
    print(f"    Cached texture: {img.name} ({w}x{h})")
    return (px, w, h)

def sample_tex(img, u, v):
    """UV座標でテクスチャの色をサンプリング。"""
    px, w, h = load_tex(img)
    if px is None:
        return None
    u = u % 1.0
    v = v % 1.0
    ix = max(0, min(int(u * w), w - 1))
    iy = max(0, min(int(v * h), h - 1))
    base = (iy * w + ix) * 4
    if base + 3 >= len(px):
        return None
    return (px[base], px[base+1], px[base+2])

# ── VOXライター ───────────────────────────────────────────────
def write_vox(filepath, sx, sy, sz, voxels, palette):
    """ボクセルデータをVOXファイルとして書き出す。"""
    with open(filepath, 'wb') as f:
        def w32(v): f.write(struct.pack('<I', v))
        size_data = struct.pack('<III', sx, sy, sz)
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
    print(f"  Written: {filepath} ({len(voxels)} voxels)")

# ── ボクセル化処理 ─────────────────────────────────────────────
print(f"\n=== Voxelizing ===")

# 評価済みメッシュでバウンディングボックスを計算
depsgraph = bpy.context.evaluated_depsgraph_get()
all_world_verts = []
mesh_infos = []

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
    world_verts = [mat_world @ Vector(v.co) for v in mesh.vertices]
    all_world_verts.extend(world_verts)

    # マテリアル情報を収集
    mat_colors = {}
    mat_textures = {}
    for mi, slot in enumerate(obj.material_slots):
        mat = slot.material
        mat_colors[mi] = get_material_color(mat)
        mat_textures[mi] = find_texture(mat)

    # UV情報を収集
    uv_layer = mesh.uv_layers.active
    uv_data = uv_layer.data if uv_layer else None
    poly_uvs = {}
    if uv_data:
        for pi, poly in enumerate(mesh.polygons):
            uvs = []
            for li in poly.loop_indices:
                uv = uv_data[li].uv
                uvs.append((uv[0], uv[1]))
            poly_uvs[pi] = uvs

    # BVHツリーを構築
    world_tris = [(p.vertices[0], p.vertices[1], p.vertices[2]) for p in mesh.polygons]
    bvh = BVHTree.FromPolygons(world_verts, world_tris)

    mesh_infos.append({
        'bvh': bvh,
        'mesh': mesh,
        'world_verts': world_verts,
        'mat_colors': mat_colors,
        'mat_textures': mat_textures,
        'poly_uvs': poly_uvs,
        'obj_eval': obj_eval,
    })

if not all_world_verts:
    print("  No vertices!")
    sys.exit(1)

# バウンディングボックス
bb_min = Vector((min(v.x for v in all_world_verts), min(v.y for v in all_world_verts), min(v.z for v in all_world_verts)))
bb_max = Vector((max(v.x for v in all_world_verts), max(v.y for v in all_world_verts), max(v.z for v in all_world_verts)))
bb_size = bb_max - bb_min

# ボクセルサイズを高さから計算
voxel_size = bb_size.z / RESOLUTION if bb_size.z > 0 else 0.01
grid_x = max(1, min(256, int(bb_size.x / voxel_size) + 2))
grid_y = max(1, min(256, int(bb_size.y / voxel_size) + 2))
grid_z = max(1, min(256, int(bb_size.z / voxel_size) + 2))

print(f"  BB: {bb_size.x:.3f} x {bb_size.y:.3f} x {bb_size.z:.3f}")
print(f"  Grid: {grid_x}x{grid_y}x{grid_z}, voxel_size: {voxel_size:.6f}")

# グリッド原点
grid_origin = Vector((bb_min.x - voxel_size, bb_min.y - voxel_size, bb_min.z - voxel_size))

# ボクセル化
threshold = voxel_size * 0.8
colors_map = {}
progress_step = max(1, grid_z // 10)

for gz in range(grid_z):
    if gz % progress_step == 0:
        print(f"  z={gz}/{grid_z} hits={len(colors_map)}")
    for gx in range(grid_x):
        for gy in range(grid_y):
            wx = grid_origin.x + (gx + 0.5) * voxel_size
            wy = grid_origin.y + (gy + 0.5) * voxel_size
            wz = grid_origin.z + (gz + 0.5) * voxel_size
            pt = Vector((wx, wy, wz))

            best_dist = threshold + 1
            best_color = None

            for minfo in mesh_infos:
                loc, normal, face_idx, dist = minfo['bvh'].find_nearest(pt)
                if loc is None or dist > threshold or dist >= best_dist:
                    continue
                best_dist = dist

                r, g, b = 0.5, 0.5, 0.5
                mesh = minfo['mesh']
                if face_idx is not None and face_idx < len(mesh.polygons):
                    poly = mesh.polygons[face_idx]
                    mi = poly.material_index
                    tex = minfo['mat_textures'].get(mi)

                    if tex and face_idx in minfo['poly_uvs']:
                        # テクスチャサンプリング（重心座標でUV補間）
                        uvs = minfo['poly_uvs'][face_idx]
                        verts = [Vector(minfo['world_verts'][vi]) for vi in poly.vertices]
                        if len(verts) >= 3 and len(uvs) >= 3:
                            e0, e1 = verts[1] - verts[0], verts[2] - verts[0]
                            ep = loc - verts[0]
                            d00, d01 = e0.dot(e0), e0.dot(e1)
                            d11 = e1.dot(e1)
                            dp0, dp1 = ep.dot(e0), ep.dot(e1)
                            denom = d00 * d11 - d01 * d01
                            if abs(denom) > 1e-12:
                                u_bc = max(0, min(1, (d11 * dp0 - d01 * dp1) / denom))
                                v_bc = max(0, min(1, (d00 * dp1 - d01 * dp0) / denom))
                                w_bc = max(0, min(1, 1 - u_bc - v_bc))
                                u_t = w_bc * uvs[0][0] + u_bc * uvs[1][0] + v_bc * uvs[2][0]
                                v_t = w_bc * uvs[0][1] + u_bc * uvs[1][1] + v_bc * uvs[2][1]
                                sampled = sample_tex(tex, u_t, v_t)
                                if sampled:
                                    r, g, b = sampled
                                else:
                                    r, g, b = minfo['mat_colors'].get(mi, (0.5, 0.5, 0.5))
                            else:
                                r, g, b = minfo['mat_colors'].get(mi, (0.5, 0.5, 0.5))
                        else:
                            r, g, b = minfo['mat_colors'].get(mi, (0.5, 0.5, 0.5))
                    else:
                        r, g, b = minfo['mat_colors'].get(mi, (0.5, 0.5, 0.5))

                ri = max(0, min(255, int(r * 255)))
                gi = max(0, min(255, int(g * 255)))
                bi = max(0, min(255, int(b * 255)))
                best_color = (ri, gi, bi)

            if best_color:
                colors_map[(gx, gy, gz)] = best_color

# 一時メッシュを解放
for minfo in mesh_infos:
    minfo['obj_eval'].to_mesh_clear()

if not colors_map:
    print("  No voxels generated!")
    sys.exit(1)

print(f"  Generated {len(colors_map)} voxels")

# パレット構築
unique_colors = list(set(colors_map.values()))
if len(unique_colors) > 255:
    # 量子化で色数を削減
    step = 4
    while len(unique_colors) > 255:
        new_map = {}
        for pos, (r, g, b) in colors_map.items():
            new_map[pos] = ((r // step) * step, (g // step) * step, (b // step) * step)
        colors_map = new_map
        unique_colors = list(set(colors_map.values()))
        step *= 2

palette = unique_colors[:255]
color_to_idx = {c: i + 1 for i, c in enumerate(palette)}

voxels = []
for (gx, gy, gz), col in colors_map.items():
    ci = color_to_idx.get(col, 1)
    voxels.append((gx, gy, gz, ci))

# 出力名を決定
obj_name = TARGET_OBJ or os.path.splitext(os.path.basename(INPUT_PATH))[0]
safe_name = obj_name.replace(' ', '_').replace("'", "").replace('.', '_')

# VOXファイルとして書き出し
out_path = os.path.join(OUT_DIR, f"{safe_name}.vox")
write_vox(out_path, grid_x, grid_y, grid_z, voxels, palette)

# grid.jsonとして書き出し
grid_json = {
    "grid_origin": [grid_origin.x, grid_origin.y, grid_origin.z],
    "voxel_size": voxel_size,
    "gx": grid_x, "gy": grid_y, "gz": grid_z,
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
    "voxel_count": len(voxels),
}
grid_path = os.path.join(OUT_DIR, f"{safe_name}_grid.json")
with open(grid_path, 'w') as f:
    json.dump(grid_json, f, indent=2)

# parts.jsonを生成
parts = [{
    "key": safe_name,
    "file": f"/{os.path.basename(OUT_DIR)}/{safe_name}.vox",
    "voxels": len(voxels),
    "default_on": True,
    "meshes": [safe_name],
    "is_body": True,
}]
parts_path = os.path.join(OUT_DIR, f"{safe_name}_parts.json")
with open(parts_path, 'w') as f:
    json.dump(parts, f, indent=2)

print(f"\n=== Done ===")
print(f"  VOX: {out_path}")
print(f"  Grid: {grid_path}")
print(f"  Parts: {parts_path}")
