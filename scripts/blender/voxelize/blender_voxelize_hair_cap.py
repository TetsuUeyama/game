"""
Blender Python: 髪を頭部表面基準でボクセル化し、キャップ表面にリマッピングするスクリプト。

各髪ポイントについて:
  1. 頭部（ボディ）表面の最近点を見つけ、オフセットベクトルを計算
  2. 対応するキャップ表面点を見つける（頭部中心からの同じ方向）
  3. 髪をcap_surface + offsetの位置に配置

これにより、チビ変形に関わらず、元の3Dモデルで頭部を覆うように
髪がキャップを覆うことが保証される。

Usage:
  blender --background --python scripts/blender_voxelize_hair_cap.py \
    -- <input.blend> <output.vox>
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
# BVHツリー
from mathutils.bvhtree import BVHTree

# コマンドライン引数
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""     # 入力モデルファイル
OUTPUT_PATH = args[1] if len(args) > 1 else ""     # 出力VOXパス

if not INPUT_PATH or not OUTPUT_PATH:
    print("Usage: blender --background --python blender_voxelize_hair_cap.py -- <input.blend> <output.vox>")
    sys.exit(1)

# 高解像度ボディのグリッドパラメータを読み込み
GRID_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         '..', 'public', 'box2', 'cyberpunk_elf_body_base_hires_grid.json')
with open(GRID_JSON) as f:
    grid_info = json.load(f)

gx = grid_info['gx']                        # グリッドX
gy = grid_info['gy']                        # グリッドY
gz = grid_info['gz']                        # グリッドZ
voxel_size = grid_info['voxel_size']        # ボクセルサイズ
def_min = Vector(grid_info['def_min'])       # 変形空間最小値
def_max = Vector(grid_info['def_max'])       # 変形空間最大値

print(f"\n=== Hair-on-Cap Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output: {OUTPUT_PATH}")
print(f"  Grid: {gx}x{gy}x{gz}, voxel_size: {voxel_size:.6f}")

# モデル読み込み
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# MASKモディファイア無効化
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

# 髪とボディメッシュを検索
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
hair_objects = [o for o in mesh_objects if 'hair' in o.name.lower()]
body_objects = [o for o in mesh_objects if 'body' in o.name.lower()
                and 'hair' not in o.name.lower() and 'eye' not in o.name.lower()]

if not hair_objects:
    print(f"  ERROR: No hair meshes found! Available: {[o.name for o in mesh_objects]}")
    sys.exit(1)
if not body_objects:
    print(f"  ERROR: No body meshes found!")
    sys.exit(1)

print(f"  Hair: {[o.name for o in hair_objects]}")
print(f"  Body: {[o.name for o in body_objects]}")

# ── ボディバウンディングボックス（チビ変形パラメータ用） ──
min_co = Vector((1e9, 1e9, 1e9))
max_co = Vector((-1e9, -1e9, -1e9))
for obj in body_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            min_co[i] = min(min_co[i], v.co[i])
            max_co[i] = max(max_co[i], v.co[i])
    eo.to_mesh_clear()

center = (min_co + max_co) / 2    # ボディ中心
model_h = max_co.z - min_co.z     # モデル高さ
print(f"  Body center: ({center.x:.4f}, {center.y:.4f}, {center.z:.4f}), h={model_h:.4f}")

# 頭部開始Z座標
head_z_threshold = min_co.z + 0.85 * model_h
print(f"  Head starts at Z={head_z_threshold:.4f} (t=0.85)")

# ── ボディBVHを構築（頭部表面の最近点検索用） ──
print("  Building body BVH...")
body_bvh_list = []
for obj in body_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)
    body_bvh_list.append((bvh, bm))
    eo.to_mesh_clear()

def find_nearest_body(point, max_dist=1.0):
    """ボディ表面の最近点を検索。"""
    best_loc = None
    best_dist = max_dist
    for bvh, _ in body_bvh_list:
        loc, norm, fi, dist = bvh.find_nearest(point)
        if loc is not None and dist < best_dist:
            best_dist = dist; best_loc = loc
    return best_loc, best_dist

# ── 髪BVH + テクスチャ ──
print("  Building hair BVH...")

texture_cache = {}
def cache_texture(image):
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
    del raw

def sample_texture(img_name, u, v):
    if img_name not in texture_cache: return None
    w, h, pix = texture_cache[img_name]
    px = int(u * w) % w; py = int(v * h) % h
    pi = (py * w + px) * 3
    if pi + 2 < len(pix): return (pix[pi], pix[pi+1], pix[pi+2])
    return None

def score_image(name):
    n = name.lower()
    if 'basecolor' in n or 'base_color' in n or 'diffuse' in n:
        s = 10
        if any(v in n for v in ['dark','white','blue','red','turquoise','wet','blush']): s -= 8
        return s
    if 'albedo' in n: return 8
    if any(k in n for k in ['normal','roughness','metallic','specular','height','opacity','alpha','sss','ao','ambient','direction','gradient','id','emissive','emission']): return -10
    return 0

def find_texture_for_mat(mat):
    if not mat: return None
    best, best_score = None, -999
    if hasattr(mat, 'node_tree') and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                s = score_image(node.image.name)
                if s > best_score: best_score, best = s, node.image
            if node.type == 'GROUP' and node.node_tree:
                for inner in node.node_tree.nodes:
                    if inner.type == 'TEX_IMAGE' and inner.image:
                        s = score_image(inner.image.name)
                        if s > best_score: best_score, best = s, inner.image
    return best if best_score >= 0 else None

# 髪マテリアル情報を構築
mat_info = {}
for obj in hair_objects:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or mat.name in mat_info: continue
        info = {'image': None, 'color': (80, 60, 40)}
        img = find_texture_for_mat(mat)
        if img: cache_texture(img); info['image'] = img.name
        else:
            if hasattr(mat, 'node_tree') and mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED':
                        inp = node.inputs.get('Base Color')
                        if inp and not inp.is_linked:
                            c = inp.default_value
                            info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                        break
        mat_info[mat.name] = info
        tag = info['image'] or ('flat' + str(info['color']))
        print(f"    Mat '{mat.name}' -> {tag}")

# 髪メッシュデータを構築
class MeshData:
    __slots__ = ['bvh', 'bm', 'uv_layer', 'face_mat', 'face_tex']

hair_mesh_data = []
for obj in hair_objects:
    md = MeshData()
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    md.bvh = BVHTree.FromBMesh(bm); md.bm = bm
    md.uv_layer = bm.loops.layers.uv.active
    md.face_mat = {}; md.face_tex = {}
    for face in bm.faces:
        mi = face.material_index
        mat_name = None
        if mi < len(obj.material_slots) and obj.material_slots[mi].material:
            mat_name = obj.material_slots[mi].material.name
        md.face_mat[face.index] = mat_name
        md.face_tex[face.index] = mat_info.get(mat_name, {}).get('image')
    hair_mesh_data.append(md)
    eo.to_mesh_clear()

def get_color_at(md, fi, hit):
    """面上のヒット位置の色を取得。"""
    tex = md.face_tex.get(fi)
    if tex and md.uv_layer and fi < len(md.bm.faces):
        face = md.bm.faces[fi]; loops = face.loops
        if len(loops) == 3:
            v0, v1, v2 = [l.vert.co for l in loops]
            uv0, uv1, uv2 = [l[md.uv_layer].uv for l in loops]
            e0, e1 = v1 - v0, v2 - v0; ep = hit - v0
            d00, d01, d11 = e0.dot(e0), e0.dot(e1), e1.dot(e1)
            dp0, dp1 = ep.dot(e0), ep.dot(e1)
            denom = d00 * d11 - d01 * d01
            if abs(denom) > 1e-12:
                u = (d11 * dp0 - d01 * dp1) / denom
                v = (d00 * dp1 - d01 * dp0) / denom
                w2 = max(0, min(1, 1 - u - v))
                u = max(0, min(1, u)); v = max(0, min(1, v))
                uvu = w2 * uv0.x + u * uv1.x + v * uv2.x
                uvv = w2 * uv0.y + u * uv1.y + v * uv2.y
                c = sample_texture(tex, uvu, uvv)
                if c: return c
    mn = md.face_mat.get(fi)
    if mn and mn in mat_info: return mat_info[mn]['color']
    return (80, 60, 40)

# ══════════════════════════════════════════════════════════════════════
# ステップ1: モデル空間で髪ポイントをサンプリング（チビ変形前）
# 各サンプルについて位置、色、ボディ表面からのオフセットを記録
# ══════════════════════════════════════════════════════════════════════
print("\n  Step 1: Sampling hair in model space...")

# 髪のバウンディングボックスを計算
hair_min = Vector((1e9, 1e9, 1e9))
hair_max = Vector((-1e9, -1e9, -1e9))
for obj in hair_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            hair_min[i] = min(hair_min[i], v.co[i])
            hair_max[i] = max(hair_max[i], v.co[i])
    eo.to_mesh_clear()

print(f"  Hair bbox: ({hair_min.x:.3f},{hair_min.y:.3f},{hair_min.z:.3f}) to ({hair_max.x:.3f},{hair_max.y:.3f},{hair_max.z:.3f})")

THRESHOLD = voxel_size * 3.0  # 髪BVH閾値
hair_samples = []  # [(model_pos, color, offset_from_body, body_surface_pos)]

# 頭部中心（方向計算用）
head_center_model = Vector((center.x, center.y, head_z_threshold + 0.5 * (max_co.z - head_z_threshold)))
print(f"  Head center (model): ({head_center_model.x:.4f}, {head_center_model.y:.4f}, {head_center_model.z:.4f})")

# モデル空間をスキャンして髪サンプルを収集
scan_min = hair_min - Vector((voxel_size, voxel_size, voxel_size))
scan_max = hair_max + Vector((voxel_size, voxel_size, voxel_size))
nx = int(math.ceil((scan_max.x - scan_min.x) / voxel_size))
ny = int(math.ceil((scan_max.y - scan_min.y) / voxel_size))
nz = int(math.ceil((scan_max.z - scan_min.z) / voxel_size))
print(f"  Scan grid: {nx}x{ny}x{nz} = {nx*ny*nz} points")

count = 0
for iz in range(nz):
    if iz % 20 == 0:
        print(f"    z={iz}/{nz} samples={len(hair_samples)}")
    for ix in range(nx):
        for iy in range(ny):
            p = Vector((scan_min.x + (ix + 0.5) * voxel_size, scan_min.y + (iy + 0.5) * voxel_size, scan_min.z + (iz + 0.5) * voxel_size))
            # 髪表面に近いか確認
            best_dist = THRESHOLD; best_color = None; best_loc = None
            for md in hair_mesh_data:
                loc, norm, fi, dist = md.bvh.find_nearest(p)
                if loc is not None and dist < best_dist:
                    best_dist = dist; best_color = get_color_at(md, fi, loc); best_loc = loc
            if best_color is None: continue

            # ボディ表面の最近点を検索
            body_loc, body_dist = find_nearest_body(p, max_dist=0.5)
            if body_loc is None:
                # ボディから遠い髪: 頭部中心からの方向でオフセット
                dir_from_center = p - head_center_model
                offset_vec = dir_from_center
            else:
                # オフセット = 髪位置 - ボディ表面
                offset_vec = p - body_loc

            hair_samples.append((p, best_color, offset_vec, body_loc))

print(f"  Total hair samples: {len(hair_samples)}")

# ══════════════════════════════════════════════════════════════════════
# ステップ2: キャップボクセルを読み込んでキャップ表面ルックアップを構築
# ══════════════════════════════════════════════════════════════════════
print("\n  Step 2: Loading cap surface...")

import struct as _struct

def read_vox_raw(filepath):
    """VOXファイルを生データとして読み込み。"""
    with open(filepath, 'rb') as f: data = f.read()
    off = [0]
    def r32(): v = _struct.unpack_from('<I', data, off[0])[0]; off[0] += 4; return v
    def r8(): v = data[off[0]]; off[0] += 1; return v
    def rStr(n): s = data[off[0]:off[0]+n].decode('ascii'); off[0] += n; return s
    rStr(4); r32()
    sx = sy = sz = 0; voxels = []; palette = []
    def readChunks(end):
        nonlocal sx, sy, sz
        while off[0] < end:
            cid = rStr(4); cs = r32(); ccs = r32(); ce = off[0] + cs
            if cid == 'SIZE': sx = r32(); sy = r32(); sz = r32()
            elif cid == 'XYZI':
                n = r32()
                for _ in range(n): voxels.append((r8(), r8(), r8(), r8()))
            elif cid == 'RGBA':
                for _ in range(256): palette.append((r8(), r8(), r8())); r8()
            off[0] = ce
            if ccs > 0: readChunks(off[0] + ccs)
    rStr(4); mc = r32(); mcc = r32(); off[0] += mc
    readChunks(off[0] + mcc)
    return sx, sy, sz, voxels, palette

# キャップとボディのVOXを読み込み
cap_sx, cap_sy, cap_sz, cap_voxels_raw, cap_palette = read_vox_raw(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'box2', 'knit_cap.vox'))
body_sx, body_sy, body_sz, body_voxels_raw, body_palette = read_vox_raw(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'box2', 'cyberpunk_elf_body_base_hires_sym.vox'))

print(f"  Cap: {len(cap_voxels_raw)} voxels")
print(f"  Body: {len(body_voxels_raw)} voxels")

# ボクセル空間のボディセットとキャップセットを構築
body_voxel_set = set((x, y, z) for x, y, z, ci in body_voxels_raw)
cap_voxel_set = set((x, y, z) for x, y, z, ci in cap_voxels_raw)

# キャップ表面: 空き隣接を持つキャップボクセル
DIRS = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
cap_surface_voxels = []
for x, y, z, ci in cap_voxels_raw:
    for dx, dy, dz in DIRS:
        nb = (x+dx, y+dy, z+dz)
        if nb not in body_voxel_set and nb not in cap_voxel_set:
            cap_surface_voxels.append((x, y, z)); break

print(f"  Cap surface voxels: {len(cap_surface_voxels)}")

# ボクセル座標→変形空間座標の変換関数
def voxel_to_deformed(vx, vy, vz):
    return Vector((def_min.x + (vx + 0.5) * voxel_size, def_min.y + (vy + 0.5) * voxel_size, def_min.z + (vz + 0.5) * voxel_size))

# チビ逆変形関数
def inv_deform(co):
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = min(1, (t - 0.85) / 0.15); s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) / s; y = center.y + (y - center.y) / s; z = z - ht * model_h * 0.06
    elif t > 0.50:
        x = center.x + (x - center.x) / 1.1; y = center.y + (y - center.y) / 1.1
    else:
        u = (z - min_co.z) / (0.50 * model_h) if model_h > 0 else 0; u = max(0, min(1, u))
        disc = 0.49 + 1.20 * u; r = (-0.70 + math.sqrt(disc)) / 0.60 if disc >= 0 else 0; r = max(0, min(1, r))
        leg_t = r; sign = 1.0 if x > center.x else -1.0; spread = 0.06 * (1.0 - leg_t)
        x -= sign * spread; z = min_co.z + r * 0.50 * model_h
        x = center.x + (x - center.x) / 1.1; y = center.y + (y - center.y) / 1.1
    return Vector((x, y, z))

# チビ変形関数
def deform_point(co):
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = (t - 0.85) / 0.15; s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) * s; y = center.y + (y - center.y) * s; z = z + ht * model_h * 0.06
    elif t > 0.50:
        s = 1.1; x = center.x + (x - center.x) * s; y = center.y + (y - center.y) * s
    else:
        leg_t = t / 0.50; f = 0.70 * leg_t + 0.30 * leg_t * leg_t; z = min_co.z + f * 0.50 * model_h
        s = 1.1; x = center.x + (x - center.x) * s; y = center.y + (y - center.y) * s
        sign = 1.0 if x > center.x else -1.0; spread = 0.06 * (1.0 - leg_t); x += sign * spread
    return Vector((x, y, z))

# キャップ表面をモデル空間に変換（逆変形）
cap_surface_model = []
for vx, vy, vz in cap_surface_voxels:
    dp = voxel_to_deformed(vx, vy, vz)
    mp = inv_deform(dp)
    cap_surface_model.append((mp, (vx, vy, vz)))

head_center_deformed = deform_point(head_center_model)
print(f"  Head center (deformed): ({head_center_deformed.x:.4f}, {head_center_deformed.y:.4f}, {head_center_deformed.z:.4f})")

# ボディ頭部表面も構築（方向マッピング用）
body_head_voxels = [(x,y,z) for x,y,z in body_voxel_set
                    if voxel_to_deformed(x,y,z).z > def_min.z + 0.7 * (def_max.z - def_min.z)]
body_head_surface = []
for x, y, z in body_head_voxels:
    for dx, dy, dz in DIRS:
        nb = (x+dx, y+dy, z+dz)
        if nb not in body_voxel_set:
            dp = voxel_to_deformed(x, y, z); mp = inv_deform(dp)
            body_head_surface.append((mp, (x, y, z))); break

print(f"  Body head surface voxels: {len(body_head_surface)}")

# ══════════════════════════════════════════════════════════════════════
# ステップ3: 各髪サンプルをキャップ表面にリマッピング
# ══════════════════════════════════════════════════════════════════════
print("\n  Step 3: Remapping hair onto cap surface...")

# 方向マッピング用のルックアップテーブル構築
from collections import defaultdict

def direction_key(dx, dy, dz):
    """方向をグリッドに量子化（約5度解像度）。"""
    length = math.sqrt(dx*dx + dy*dy + dz*dz)
    if length < 0.001: return (0, 0, 0)
    nx, ny, nz = dx/length, dy/length, dz/length
    return (round(nx * 20), round(ny * 20), round(nz * 20))

# キャップ表面の方向マップ（モデル空間）
cap_dir_map = defaultdict(list)
for mp, vp in cap_surface_model:
    d = mp - head_center_model
    dk = direction_key(d.x, d.y, d.z)
    cap_dir_map[dk].append((mp, vp))

cap_model_positions = [(mp, vp) for mp, vp in cap_surface_model]

def find_nearest_cap_surface(model_pos):
    """モデル空間の位置に最も近いキャップ表面点を検索。"""
    d = model_pos - head_center_model
    dk = direction_key(d.x, d.y, d.z)
    # 同方向バケットと近傍を検索
    candidates = []
    for ddx in range(-2, 3):
        for ddy in range(-2, 3):
            for ddz in range(-2, 3):
                nk = (dk[0]+ddx, dk[1]+ddy, dk[2]+ddz)
                candidates.extend(cap_dir_map.get(nk, []))
    if not candidates: candidates = cap_model_positions  # フォールバック: 全検索
    best_mp, best_vp, best_d = None, None, 1e9
    for cmp, cvp in candidates:
        d2 = (cmp - model_pos).length_squared
        if d2 < best_d: best_d = d2; best_mp = cmp; best_vp = cvp
    return best_mp, best_vp

# 各髪サンプルをリマップ
result = {}  # (vx, vy, vz) → (r, g, b)
mapped = 0; skipped = 0

for sample_pos, color, offset_vec, body_surf_pos in hair_samples:
    # モデル空間で最近傍キャップ表面点を検索
    if body_surf_pos is not None:
        cap_model_pos, cap_voxel_pos = find_nearest_cap_surface(body_surf_pos)
    else:
        cap_model_pos, cap_voxel_pos = find_nearest_cap_surface(sample_pos)
    if cap_model_pos is None: skipped += 1; continue

    # 新しい髪位置: キャップ表面 + オフセット
    new_model_pos = cap_model_pos + offset_vec
    # チビ変形を適用して変形空間の位置を取得
    new_deformed_pos = deform_point(new_model_pos)
    # ボクセル座標に変換
    vx = int((new_deformed_pos.x - def_min.x) / voxel_size)
    vy = int((new_deformed_pos.y - def_min.y) / voxel_size)
    vz = int((new_deformed_pos.z - def_min.z) / voxel_size)
    # 範囲チェック
    if vx < 0 or vx >= gx or vy < 0 or vy >= gy or vz < 0 or vz >= gz: skipped += 1; continue
    # ボディ/キャップとの重複チェック
    if (vx, vy, vz) in body_voxel_set or (vx, vy, vz) in cap_voxel_set: skipped += 1; continue
    key = (vx, vy, vz)
    if key not in result: result[key] = color; mapped += 1

print(f"  Mapped: {mapped}, Skipped: {skipped}")
print(f"  Output voxels: {len(result)}")

# ══════════════════════════════════════════════════════════════════════
# ステップ4: 出力
# ══════════════════════════════════════════════════════════════════════
print("\n  Step 4: Writing output...")

def build_palette_and_voxels(voxel_dict):
    """ボクセル辞書からパレットとボクセルリストを構築（8刻みに量子化）。"""
    color_map = {}; pal = []; out = []
    for (vx, vy, vz), (r, g, b) in voxel_dict.items():
        qr = (r // 8) * 8; qg = (g // 8) * 8; qb = (b // 8) * 8
        key = (qr, qg, qb)
        if key not in color_map:
            if len(pal) >= 255:
                best_i, best_d = 0, 1e9
                for i, (pr, pg, pb) in enumerate(pal):
                    d2 = (pr-qr)**2+(pg-qg)**2+(pb-qb)**2
                    if d2 < best_d: best_d = d2; best_i = i
                color_map[key] = best_i + 1
            else:
                pal.append(key); color_map[key] = len(pal)
        out.append((vx, vy, vz, color_map[key]))
    return out, pal

def write_vox(fp, sx, sy, sz, voxels, pal):
    """VOXファイルを書き出す。"""
    xyzi = 4 + len(voxels) * 4; children = (12+12) + (12+xyzi) + (12+1024)
    os.makedirs(os.path.dirname(os.path.abspath(fp)), exist_ok=True)
    with open(fp, 'wb') as f:
        f.write(b'VOX '); f.write(_struct.pack('<I', 150))
        f.write(b'MAIN'); f.write(_struct.pack('<II', 0, children))
        f.write(b'SIZE'); f.write(_struct.pack('<II', 12, 0)); f.write(_struct.pack('<III', sx, sy, sz))
        f.write(b'XYZI'); f.write(_struct.pack('<II', xyzi, 0)); f.write(_struct.pack('<I', len(voxels)))
        for vx, vy, vz, ci in voxels: f.write(_struct.pack('BBBB', vx, vy, vz, ci))
        f.write(b'RGBA'); f.write(_struct.pack('<II', 1024, 0))
        for i in range(256):
            if i < len(pal): f.write(_struct.pack('BBBB', pal[i][0], pal[i][1], pal[i][2], 255))
            else: f.write(_struct.pack('BBBB', 0, 0, 0, 0))
    print(f"  -> {fp}: {sx}x{sy}x{sz}, {len(voxels)} voxels, {len(pal)} colors")

vlist, pal = build_palette_and_voxels(result)
write_vox(OUTPUT_PATH, gx, gy, gz, vlist, pal)

# リソース解放
for md in hair_mesh_data: md.bm.free()
for bvh, bm in body_bvh_list: bm.free()
