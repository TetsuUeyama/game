"""
Blender Python: 長い武器をハンドル+ブレードに分割してボクセル化するスクリプト。
マテリアル割り当てで分割点を自動検出する。

マテリアル分類:
  mat_Metal (metallic=1.0)       → ブレード/先端
  mat_Black_Matte (metallic~0.8) → ハンドル/シャフト
  mat_Grey_Matte (metallic=0)    → ガード/装飾（ハンドル側）
  mat_Withe (metallic~0.1)       → 巻き付け/装飾

分割ロジック:
  1. 面を「ブレード」(Metal)か「ハンドル」(Black_Matte等)に分類
  2. ハンドルが終わりブレードが始まるZ境界を検出
  3. シームレスな接合のため若干の重複を持たせて分割
  4. 各パーツを個別にボクセル化

Usage:
  blender --background --python voxelize_weapon_split.py -- <input.glb> <output_dir> [voxel_size] [forced_split_z]
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
# BVHツリー
from mathutils.bvhtree import BVHTree

# ── 引数パース ──────────────────────────────────────────────────
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""         # 入力GLBファイル
OUT_DIR = args[1] if len(args) > 1 else ""              # 出力ディレクトリ
VOXEL_SIZE = float(args[2]) if len(args) > 2 else 0.007  # ボクセルサイズ
FORCED_SPLIT_Z = float(args[3]) if len(args) > 3 else None  # 強制分割Z座標
OVERLAP_VOXELS = 2  # 分割境界でのオーバーラップ量（ボクセル数）

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python voxelize_weapon_split.py -- <input.glb> <out_dir> [voxel_size]")
    sys.exit(1)

print(f"\n=== Weapon Split Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output dir: {OUT_DIR}")
print(f"  Voxel size: {VOXEL_SIZE}")

MAX_VOXELS_PER_AXIS = 256  # VOXフォーマットの軸あたり上限

# ── ファイル読み込み ────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
else:
    print(f"  Unsupported format: {ext}")
    sys.exit(1)

os.makedirs(OUT_DIR, exist_ok=True)

all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not all_meshes:
    print("  No meshes found.")
    sys.exit(1)

print(f"  Found {len(all_meshes)} mesh(es)")

# ── ヘルパー関数 ──────────────────────────────────────────────
# ブレード（金属）とハンドル（その他）のマテリアル名セット
BLADE_MATERIALS = {'mat_Metal', 'mat_metal'}
HANDLE_MATERIALS = {'mat_Black Matte', 'mat_Black_Matte', 'mat_Grey Matte',
                    'mat_Grey_Matte', 'mat_Withe', 'mat_withe'}

def get_material_flat_color(mat):
    """マテリアルからフラットカラーを取得。"""
    if not mat:
        return (0.6, 0.6, 0.6)
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                bc = node.inputs.get('Base Color')
                if bc and not bc.is_linked:
                    c = bc.default_value
                    return (c[0], c[1], c[2])
                met = node.inputs.get('Metallic')
                if met and not met.is_linked and met.default_value > 0.5:
                    return (0.78, 0.78, 0.78)
                return (0.5, 0.5, 0.5)
    return (mat.diffuse_color[0], mat.diffuse_color[1], mat.diffuse_color[2])

def find_base_color_texture(mat):
    """マテリアルからベースカラーテクスチャを検索。"""
    if not mat or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bc_input = node.inputs.get('Base Color')
            if bc_input and bc_input.is_linked:
                src = bc_input.links[0].from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    return src.image
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            return node.image
    return None

# テクスチャキャッシュ
_tex_cache = {}

def load_texture_pixels(img):
    """テクスチャピクセルをキャッシュに読み込み。"""
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
    if px is None:
        return None
    u = u % 1.0
    v = v % 1.0
    ix = max(0, min(int(u * w), w - 1))
    iy = max(0, min(int(v * h), h - 1))
    base = (iy * w + ix) * 4
    if base + 3 >= len(px):
        return None
    return px[base], px[base + 1], px[base + 2], px[base + 3]

def write_vox(filepath, size_x, size_y, size_z, voxels, palette):
    """VOXファイルを書き出す。"""
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

# ── メッシュデータ準備 ────────────────────────────────────────
depsgraph = bpy.context.evaluated_depsgraph_get()

mesh_data_list = []
all_verts_world = []

for obj in all_meshes:
    obj_eval = obj.evaluated_get(depsgraph)
    mesh = obj_eval.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    mat_world = obj.matrix_world
    verts_world = [mat_world @ Vector(v.co) for v in mesh.vertices]
    all_verts_world.extend(verts_world)
    mesh_data_list.append((mesh, mat_world, obj, obj_eval, verts_world))

# バウンディングボックス
bb_min = Vector((min(v.x for v in all_verts_world), min(v.y for v in all_verts_world), min(v.z for v in all_verts_world)))
bb_max = Vector((max(v.x for v in all_verts_world), max(v.y for v in all_verts_world), max(v.z for v in all_verts_world)))
total_height = bb_max.z - bb_min.z

print(f"  Total height: {total_height:.3f}m")
print(f"  BB: Z {bb_min.z:.3f} ~ {bb_max.z:.3f}")

# ── マテリアル分析で分割点を検出 ────────────────────────────
# マテリアルカテゴリごとのZ値を収集
blade_z_values = []    # ブレード（金属）面のZ値
handle_z_values = []   # ハンドル（その他）面のZ値

for mesh, mat_world, obj, obj_eval, verts_world in mesh_data_list:
    for poly in mesh.polygons:
        mi = poly.material_index
        mat_name = ""
        if mi < len(obj.material_slots) and obj.material_slots[mi].material:
            mat_name = obj.material_slots[mi].material.name

        # ワールド空間での面重心Z
        face_verts = [verts_world[vi] for vi in poly.vertices]
        centroid_z = sum(v.z for v in face_verts) / len(face_verts)

        if mat_name in BLADE_MATERIALS:
            blade_z_values.append(centroid_z)
        else:
            handle_z_values.append(centroid_z)

# 分割点を決定
if blade_z_values and handle_z_values:
    blade_min_z = min(blade_z_values)
    blade_max_z = max(blade_z_values)
    handle_min_z = min(handle_z_values)
    handle_max_z = max(handle_z_values)

    print(f"\n  Material analysis:")
    print(f"    Blade (Metal):  Z {blade_min_z:.3f} ~ {blade_max_z:.3f}")
    print(f"    Handle (other): Z {handle_min_z:.3f} ~ {handle_max_z:.3f}")

    # ヒストグラムアプローチで分割点を検出
    n_bins = 100
    z_step = total_height / n_bins
    blade_hist = [0] * n_bins
    handle_hist = [0] * n_bins

    for z in blade_z_values:
        bi = min(n_bins - 1, max(0, int((z - bb_min.z) / z_step)))
        blade_hist[bi] += 1
    for z in handle_z_values:
        bi = min(n_bins - 1, max(0, int((z - bb_min.z) / z_step)))
        handle_hist[bi] += 1

    # ハンドル比率が15%以下に下がる位置を分割点とする
    split_bin = n_bins // 2
    for i in range(n_bins):
        total_in_bin = blade_hist[i] + handle_hist[i]
        if total_in_bin == 0:
            continue
        handle_ratio = handle_hist[i] / total_in_bin
        if i > n_bins * 0.2:
            if handle_ratio < 0.15 and blade_hist[i] > 0:
                split_bin = i
                break

    split_z = bb_min.z + split_bin * z_step
    print(f"    Auto split point: Z = {split_z:.3f}m")
else:
    # マテリアル区別なし → 中点で分割
    split_z = bb_min.z + total_height / 2
    print(f"  No material distinction found, splitting at midpoint: Z = {split_z:.3f}m")

# 強制分割点が指定されている場合は上書き
if FORCED_SPLIT_Z is not None:
    split_z = FORCED_SPLIT_Z
    print(f"  Forced split point: Z = {split_z:.3f}m")

# 各パーツが256に収まるか検証
handle_gz_check = int((split_z - bb_min.z + OVERLAP_VOXELS * VOXEL_SIZE) / VOXEL_SIZE) + 2
blade_gz_check = int((bb_max.z - split_z + OVERLAP_VOXELS * VOXEL_SIZE) / VOXEL_SIZE) + 2
if handle_gz_check > 256 or blade_gz_check > 256:
    old_split = split_z
    split_z = bb_min.z + total_height / 2
    print(f"  Auto split caused overflow (handle={handle_gz_check}, blade={blade_gz_check}), forcing midpoint: Z = {split_z:.3f}m (was {old_split:.3f})")

# ── BVH + カラーデータの構築 ───────────────────────────────
bvh_data_list = []
for mesh, mat_world, obj, obj_eval, verts_world in mesh_data_list:
    world_verts_raw = [mat_world @ v.co for v in mesh.vertices]
    world_tris = [(p.vertices[0], p.vertices[1], p.vertices[2]) for p in mesh.polygons]
    bvh = BVHTree.FromPolygons(world_verts_raw, world_tris)
    uv_layer = mesh.uv_layers.active
    uv_data = uv_layer.data if uv_layer else None
    mat_textures = {}
    mat_colors = {}
    for mi, mat_slot in enumerate(obj.material_slots):
        mat = mat_slot.material
        tex = find_base_color_texture(mat)
        mat_textures[mi] = tex
        mat_colors[mi] = get_material_flat_color(mat)
    poly_uvs = {}
    if uv_data:
        for pi, poly in enumerate(mesh.polygons):
            uvs = []
            for li in poly.loop_indices:
                uv = uv_data[li].uv
                uvs.append((uv[0], uv[1]))
            poly_uvs[pi] = uvs
    bvh_data_list.append({
        'bvh': bvh, 'mesh': mesh, 'world_verts': world_verts_raw,
        'mat_textures': mat_textures, 'mat_colors': mat_colors, 'poly_uvs': poly_uvs,
    })

# ── Z範囲を指定してボクセル化する関数 ──────────────────────
def voxelize_range(z_lo, z_hi, part_name):
    """武器のz_lo〜z_hi範囲をボクセル化する。"""
    print(f"\n  Voxelizing '{part_name}': Z {z_lo:.3f} ~ {z_hi:.3f}")
    part_height = z_hi - z_lo
    part_width = bb_max.x - bb_min.x
    part_depth = bb_max.y - bb_min.y
    gx = min(256, max(1, int(part_width / VOXEL_SIZE) + 2))
    gy = min(256, max(1, int(part_depth / VOXEL_SIZE) + 2))
    gz = min(256, max(1, int(part_height / VOXEL_SIZE) + 2))
    grid_origin = Vector((bb_min.x - VOXEL_SIZE, bb_min.y - VOXEL_SIZE, z_lo - VOXEL_SIZE))
    print(f"    Grid: {gx}x{gy}x{gz}")
    threshold = VOXEL_SIZE * 0.8
    colors_map = {}
    progress_step = max(1, gx // 10)

    for gxi in range(gx):
        if gxi % progress_step == 0:
            print(f"    Progress: {gxi}/{gx} ({100 * gxi // gx}%)")
        for gyi in range(gy):
            for gzi in range(gz):
                wx = grid_origin.x + (gxi + 0.5) * VOXEL_SIZE
                wy = grid_origin.y + (gyi + 0.5) * VOXEL_SIZE
                wz = grid_origin.z + (gzi + 0.5) * VOXEL_SIZE
                if wz < z_lo - VOXEL_SIZE or wz > z_hi + VOXEL_SIZE:
                    continue
                pt = Vector((wx, wy, wz))
                best_dist = threshold + 1
                best_color = None
                for bdata in bvh_data_list:
                    loc, normal, face_idx, dist = bdata['bvh'].find_nearest(pt)
                    if loc is None or dist > threshold or dist >= best_dist:
                        continue
                    best_dist = dist
                    r, g, b = 0.6, 0.6, 0.6
                    m = bdata['mesh']
                    if face_idx is not None and face_idx < len(m.polygons):
                        poly = m.polygons[face_idx]
                        mi = poly.material_index
                        tex = bdata['mat_textures'].get(mi)
                        if tex and face_idx in bdata['poly_uvs']:
                            uvs = bdata['poly_uvs'][face_idx]
                            v0 = bdata['world_verts'][poly.vertices[0]]
                            v1 = bdata['world_verts'][poly.vertices[1]]
                            v2 = bdata['world_verts'][poly.vertices[2]]
                            e0 = Vector(v1) - Vector(v0)
                            e1 = Vector(v2) - Vector(v0)
                            ep = loc - Vector(v0)
                            d00 = e0.dot(e0); d01 = e0.dot(e1); d11 = e1.dot(e1)
                            dp0 = ep.dot(e0); dp1 = ep.dot(e1)
                            denom = d00 * d11 - d01 * d01
                            if abs(denom) > 1e-12:
                                u_bc = max(0, min(1, (d11 * dp0 - d01 * dp1) / denom))
                                v_bc = max(0, min(1, (d00 * dp1 - d01 * dp0) / denom))
                                w_bc = max(0, min(1, 1.0 - u_bc - v_bc))
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
                    ri = max(0, min(255, int(r * 255)))
                    gi = max(0, min(255, int(g * 255)))
                    bi = max(0, min(255, int(b * 255)))
                    best_color = (ri, gi, bi)
                if best_color:
                    colors_map[(gxi, gyi, gzi)] = best_color

    if not colors_map:
        print(f"    No voxels for '{part_name}'!")
        return None
    print(f"    Generated {len(colors_map)} voxels")

    # パレット構築（色数が多い場合は量子化）
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
        while len(unique_colors) > 255:
            new_map = {}
            for pos, col in colors_map.items():
                new_map[pos] = quantize(col, step)
            colors_map = new_map
            unique_colors = list(set(colors_map.values()))
            step *= 2

    palette = unique_colors[:255]
    color_to_idx = {c: i + 1 for i, c in enumerate(palette)}
    voxels = [(vx, vy, vz, color_to_idx.get(col, 1)) for (vx, vy, vz), col in colors_map.items()]

    # VOXファイル書き出し
    base_name = os.path.splitext(os.path.basename(INPUT_PATH))[0]
    safe_name = base_name.replace(' ', '_').replace("'", "").replace('.', '_')
    vox_path = os.path.join(OUT_DIR, f"{safe_name}_{part_name}.vox")
    write_vox(vox_path, gx, gy, gz, voxels, palette)

    return {
        "key": f"{safe_name}_{part_name}",
        "file": os.path.basename(vox_path),
        "voxels": len(voxels),
        "grid": [gx, gy, gz],
        "z_range": [z_lo, z_hi],
        "grid_origin": [grid_origin.x, grid_origin.y, grid_origin.z],
        "voxel_size": VOXEL_SIZE,
        "part_type": part_name,
    }

# ── 分割してボクセル化 ───────────────────────────────────────
overlap = OVERLAP_VOXELS * VOXEL_SIZE  # オーバーラップ量（ワールド座標）

# ハンドルパーツ: 底部〜分割点+オーバーラップ
handle_z_lo = bb_min.z
handle_z_hi = split_z + overlap

# ブレードパーツ: 分割点-オーバーラップ〜頂点
blade_z_lo = split_z - overlap
blade_z_hi = bb_max.z

print(f"\n=== Splitting weapon ===")
print(f"  Handle: Z {handle_z_lo:.3f} ~ {handle_z_hi:.3f} ({(handle_z_hi - handle_z_lo)*100:.1f}cm)")
print(f"  Blade:  Z {blade_z_lo:.3f} ~ {blade_z_hi:.3f} ({(blade_z_hi - blade_z_lo)*100:.1f}cm)")

# 各パーツのグリッドZ確認
handle_gz = int((handle_z_hi - handle_z_lo) / VOXEL_SIZE) + 2
blade_gz = int((blade_z_hi - blade_z_lo) / VOXEL_SIZE) + 2
print(f"  Handle grid Z: {handle_gz} voxels")
print(f"  Blade grid Z:  {blade_gz} voxels")

if handle_gz > 256 or blade_gz > 256:
    print(f"  WARNING: Part still exceeds 256! May need further splitting.")

# 各パーツをボクセル化
parts = []

handle_result = voxelize_range(handle_z_lo, handle_z_hi, "handle")
if handle_result:
    parts.append(handle_result)

blade_result = voxelize_range(blade_z_lo, blade_z_hi, "blade")
if blade_result:
    parts.append(blade_result)

# リソース解放
for mesh, mat_world, obj, obj_eval, verts_world in mesh_data_list:
    obj_eval.to_mesh_clear()

# parts.jsonを書き出し
base_name = os.path.splitext(os.path.basename(INPUT_PATH))[0]
safe_name = base_name.replace(' ', '_').replace("'", "").replace('.', '_')

parts_json = {
    "weapon": safe_name,
    "source": base_name,
    "total_height_m": total_height,
    "split_z": split_z,
    "voxel_size": VOXEL_SIZE,
    "parts": parts,
}

parts_path = os.path.join(OUT_DIR, "parts.json")
with open(parts_path, 'w') as f:
    json.dump(parts_json, f, indent=2)
print(f"\n  parts.json: {parts_path}")

# grid.jsonを書き出し（統合情報）
grid_json = {
    "grid_origin": [bb_min.x - VOXEL_SIZE, bb_min.y - VOXEL_SIZE, bb_min.z - VOXEL_SIZE],
    "voxel_size": VOXEL_SIZE,
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
    "total_height": total_height,
    "split_z": split_z,
    "split_type": "handle_blade",
    "parts": [p["key"] for p in parts],
}
grid_path = os.path.join(OUT_DIR, "grid.json")
with open(grid_path, 'w') as f:
    json.dump(grid_json, f, indent=2)
