"""
Blender Python: 3Dモデルをチビ変形付きボクセルアート(.vox)に変換するスクリプト。
Usage: blender --background --python blender_voxelize.py -- <input.blend> <output_dir> [resolution]

v3: UVテクスチャカラー、チビ変形、髪分割、詳細オーバーレイ優先
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
# mathutilsからVector型
from mathutils import Vector
# BVHツリー
from mathutils.bvhtree import BVHTree

# コマンドライン引数
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""    # 入力モデルファイル
OUT_DIR = args[1] if len(args) > 1 else ""         # 出力ディレクトリ
RESOLUTION = int(args[2]) if len(args) > 2 else 100  # グリッド解像度

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python blender_voxelize.py -- <input> <out_dir> [res]")
    sys.exit(1)

print(f"\n=== Voxelizer v3 ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output dir: {OUT_DIR}")
print(f"  Resolution: {RESOLUTION}")

# ファイル読み込み
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
    print("  Imported FBX")
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)
os.makedirs(OUT_DIR, exist_ok=True)

# ========================================================================
# MASKモディファイアを無効化（ボディメッシュの全スキンを露出）
# ========================================================================
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        disabled = []
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False
                disabled.append(mod.name)
        if disabled:
            print(f"  Disabled MASK modifiers on '{obj.name}': {disabled}")

# ========================================================================
# メッシュ分類: 各可視メッシュはトグル可能な個別パーツ
# ========================================================================
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]

# メッシュ名から共通プレフィックスを自動検出
_names = [o.name for o in mesh_objects]
_prefix = ""
if len(_names) > 1:
    _prefix = os.path.commonprefix(_names)
    for sep in ['_', ' ']:
        idx = _prefix.rfind(sep)
        if idx > 0:
            _prefix = _prefix[:idx + 1]
            break
    else:
        _prefix = ""
print(f"  Auto-detected prefix: '{_prefix}'")

def part_key(name):
    """メッシュ名からファイルセーフな短いキーを生成。"""
    n = name
    if _prefix: n = n[len(_prefix):] if n.startswith(_prefix) else n
    n = n.replace('CyberpunkElf ', '').replace('CyberpunkElf_', '')
    n = n.replace('Default - ', '').strip()
    n = n.replace(' ', '_').lower()
    n = n.replace('_-_default', '').replace('-_default', '')
    n = n.replace('clothes_', '')
    return n

# パーツごとにメッシュオブジェクトをグループ化
part_objects = {}
for obj in mesh_objects:
    key = part_key(obj.name)
    if key not in part_objects: part_objects[key] = []
    part_objects[key].append(obj)
    print(f"  [{key:20s}] {obj.name} ({len(obj.data.vertices)} verts)")

print(f"\n  Parts: {list(part_objects.keys())}")

# ========================================================================
# テクスチャキャッシュ + サンプリング
# ========================================================================
texture_cache = {}

def cache_texture(image):
    """テクスチャをRGBバイト配列としてキャッシュ（メモリ効率化）。"""
    if image.name in texture_cache: return
    w, h = image.size
    if w == 0 or h == 0: return
    print(f"    Cache: {image.name} ({w}x{h})")
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
    """UV座標でテクスチャの色をサンプリング。"""
    if img_name not in texture_cache: return None
    w, h, pix = texture_cache[img_name]
    px = int(u * w) % w; py = int(v * h) % h
    pi = (py * w + px) * 3
    if pi + 2 < len(pix): return (pix[pi], pix[pi+1], pix[pi+2])
    return None

# ========================================================================
# マテリアルテクスチャマッチング（改良版）
# ========================================================================
def score_image(name):
    """テクスチャ名からスコアを算出（ベースカラー優先）。"""
    n = name.lower()
    if 'basecolor' in n or 'base_color' in n or 'diffuse' in n:
        s = 10
        if any(v in n for v in ['dark','white','blue','red','turquoise','wet','blush']): s -= 8
        return s
    if 'albedo' in n: return 8
    if any(k in n for k in ['normal','roughness','metallic','specular','height','opacity','alpha','sss','ao','ambient','direction','gradient','id','emissive','emission']): return -10
    return 0

TEXTURES_DIR = os.path.join(os.path.dirname(INPUT_PATH), "..", "Assets", "Textures")

def try_load_image(filepath):
    """ファイルシステムから画像を読み込み。"""
    if not os.path.exists(filepath): return None
    name = os.path.basename(filepath)
    for img in bpy.data.images:
        if img.name == name: return img
    try:
        img = bpy.data.images.load(filepath)
        print(f"    Loaded from disk: {name}")
        return img
    except: return None

def find_texture_for_mat(mat):
    """マテリアルのベストなBaseColorテクスチャを検索（全ソースから最高スコア）。"""
    if not mat: return None
    best, best_score = None, -999
    # 方法1: ノードツリー内のイメージノードを検索
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
    # 方法2: 読み込み済み画像から名前ベースマッチング
    key = mat.name.replace('CyberpunkElf_', '').replace('Default - ', '').strip().lower()
    for img in bpy.data.images:
        n = img.name.lower()
        if key.replace(' ', '_') in n or key.replace(' ', '') in n:
            s = score_image(n)
            if s > best_score: best_score, best = s, img
    # 方法3: Assets/Textures/フォルダからの読み込みを試行
    if os.path.isdir(TEXTURES_DIR):
        key_clean = mat.name.replace('Default - ', '').replace(' ', '_')
        for fn in os.listdir(TEXTURES_DIR):
            fl = fn.lower()
            if key_clean.lower() in fl and ('basecolor' in fl or 'diffuse' in fl):
                s = score_image(fn)
                if s > best_score:
                    img = try_load_image(os.path.join(TEXTURES_DIR, fn))
                    if img: best_score, best = s, img
    return best if best_score >= 0 else None

# マテリアル情報を構築
mat_info = {}
for obj in mesh_objects:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or mat.name in mat_info: continue
        info = {'image': None, 'color': (180, 180, 180)}
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
        tag = info['image'] or f"flat{info['color']}"
        print(f"    Mat '{mat.name}' -> {tag}")

# ========================================================================
# バウンディングボックス（ボディのみで一貫した変形パラメータを確保）
# ========================================================================
body_objects = [o for o in mesh_objects if part_key(o.name) == 'body']
bbox_objects = body_objects if body_objects else mesh_objects
print(f"  BBox source: {[o.name for o in bbox_objects]}")

min_co = Vector((1e9, 1e9, 1e9))
max_co = Vector((-1e9, -1e9, -1e9))
for obj in bbox_objects:
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
print(f"  BBox: {size.x:.3f} x {size.y:.3f} x {size.z:.3f}")

# ========================================================================
# チビ変形関数
# ========================================================================
def deform_point(co):
    """ワールド座標→チビ変形座標。"""
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = (t - 0.85) / 0.15; s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) * s; y = center.y + (y - center.y) * s
        z = z + ht * model_h * 0.06
    elif t > 0.50:
        s = 1.1; x = center.x + (x - center.x) * s; y = center.y + (y - center.y) * s
    else:
        leg_t = t / 0.50; f = 0.70 * leg_t + 0.30 * leg_t * leg_t
        z = min_co.z + f * 0.50 * model_h; s = 1.1
        x = center.x + (x - center.x) * s; y = center.y + (y - center.y) * s
        sign = 1.0 if x > center.x else -1.0; spread = 0.06 * (1.0 - leg_t); x += sign * spread
    return Vector((x, y, z))

def inv_deform(co, head_scale_override=None):
    """チビ変形座標→ワールド座標。head_scale_override: 髪用に頭部拡大率を上書き。"""
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = min(1, (t - 0.85) / 0.15)
        s = head_scale_override if head_scale_override is not None else (1.5 + ht * 0.3)
        x = center.x + (x - center.x) / s; y = center.y + (y - center.y) / s
        z = z - ht * model_h * 0.06
    elif t > 0.50:
        x = center.x + (x - center.x) / 1.1; y = center.y + (y - center.y) / 1.1
    else:
        import math as _math
        u = (z - min_co.z) / (0.50 * model_h) if model_h > 0 else 0; u = max(0, min(1, u))
        disc = 0.49 + 1.20 * u; r = (-0.70 + _math.sqrt(disc)) / 0.60 if disc >= 0 else 0; r = max(0, min(1, r))
        leg_t = r; sign = 1.0 if x > center.x else -1.0; spread = 0.06 * (1.0 - leg_t); x -= sign * spread
        z = min_co.z + r * 0.50 * model_h
        x = center.x + (x - center.x) / 1.1; y = center.y + (y - center.y) / 1.1
    return Vector((x, y, z))

# ========================================================================
# BVH + UVデータを構築（三角形化済み）
# ========================================================================
print("\n  Building BVH trees (triangulated)...")

class MeshData:
    """メッシュデータを保持するクラス。"""
    __slots__ = ['bvh', 'bm', 'uv_layer', 'face_mat', 'face_tex', 'obj_name']

all_mesh_data = {key: [] for key in part_objects}

for obj in mesh_objects:
    md = MeshData()
    md.obj_name = obj.name
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
    key = part_key(obj.name)
    all_mesh_data[key].append(md)
    eo.to_mesh_clear()

# ========================================================================
# UV経由の表面色取得
# ========================================================================
def get_color_at(md, fi, hit):
    """面上のヒット位置の色を取得（テクスチャサンプリング→フラットカラー）。"""
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
                u = max(0, min(1, (d11 * dp0 - d01 * dp1) / denom))
                v = max(0, min(1, (d00 * dp1 - d01 * dp0) / denom))
                w = max(0, min(1, 1 - u - v))
                uvu = w * uv0.x + u * uv1.x + v * uv2.x
                uvv = w * uv0.y + u * uv1.y + v * uv2.y
                c = sample_texture(tex, uvu, uvv)
                if c: return c
    mn = md.face_mat.get(fi)
    if mn and mn in mat_info: return mat_info[mn]['color']
    return (180, 180, 180)

# ========================================================================
# 変形後バウンディングボックス
# ========================================================================
# ステップ1: ボディのみの変形BBox → voxel_sizeを決定（モデル間で一貫）
body_def_min = Vector((1e9, 1e9, 1e9))
body_def_max = Vector((-1e9, -1e9, -1e9))
for obj in bbox_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh(); me.transform(obj.matrix_world)
    for v in me.vertices:
        dc = deform_point(v.co)
        for i in range(3):
            body_def_min[i] = min(body_def_min[i], dc[i])
            body_def_max[i] = max(body_def_max[i], dc[i])
    eo.to_mesh_clear()

body_def_size = body_def_max - body_def_min
voxel_size = body_def_size.z / RESOLUTION
print(f"  Body deformed height: {body_def_size.z:.4f}, voxel_size: {voxel_size:.6f}")

# ステップ2: 全メッシュの変形BBox → グリッド範囲を決定
def_min = Vector((1e9, 1e9, 1e9))
def_max = Vector((-1e9, -1e9, -1e9))
for obj in mesh_objects:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh(); me.transform(obj.matrix_world)
    for v in me.vertices:
        dc = deform_point(v.co)
        for i in range(3):
            def_min[i] = min(def_min[i], dc[i])
            def_max[i] = max(def_max[i], dc[i])
    eo.to_mesh_clear()

def_size = def_max - def_min
gx = min(256, int(math.ceil(def_size.x / voxel_size)) + 2)
gy = min(256, int(math.ceil(def_size.y / voxel_size)) + 2)
gz = min(256, int(math.ceil(def_size.z / voxel_size)) + 2)
print(f"  Grid: {gx}x{gy}x{gz}, voxel={voxel_size:.4f}")

# ========================================================================
# パーツごとのボクセル化
# ========================================================================
print("\n  Voxelizing (per-part)...")

def voxelize_layer(mesh_list, threshold_mult=1.2, head_scale_override=None):
    """メッシュリストをボクセル化して{(vx,vy,vz): (r,g,b)}を返す。"""
    result = {}
    thr = voxel_size * threshold_mult
    for vz in range(gz):
        if vz % 20 == 0: print(f"    z={vz}/{gz} hits={len(result)}")
        for vx in range(gx):
            for vy in range(gy):
                dp = Vector((def_min.x + (vx + 0.5) * voxel_size, def_min.y + (vy + 0.5) * voxel_size, def_min.z + (vz + 0.5) * voxel_size))
                op = inv_deform(dp, head_scale_override=head_scale_override)
                best_dist = thr; best_color = None
                for md in mesh_list:
                    loc, norm, fi, dist = md.bvh.find_nearest(op)
                    if loc is not None and dist < best_dist:
                        best_dist = dist; best_color = get_color_at(md, fi, loc)
                if best_color: result[(vx, vy, vz)] = best_color
    return result

part_voxels = {}
for key, mesh_list in all_mesh_data.items():
    if not mesh_list: continue
    print(f"  --- {key} ---")
    if 'hair' in key:
        # 髪: 大きめ閾値 + 頭部拡大なし（元のプロポーション維持）
        part_voxels[key] = voxelize_layer(mesh_list, threshold_mult=3.0, head_scale_override=1.0)
        print(f"  {key}: {len(part_voxels[key])} voxels (hair mode: thr=3.0, head_scale=1.0)")
    else:
        part_voxels[key] = voxelize_layer(mesh_list, 1.2)
        print(f"  {key}: {len(part_voxels[key])} voxels")

# ボディスキンフィル: 衣装の下にスキンを充填
SKIN_EXCLUDE_KEYWORDS = {'jacket','hat','hologram','armband','hip_plate','necktie','garter','wings','staff','pauldron','shoulder','ruffle','gem','hanging','armor','decoration','neckerchief','eyes','eyelash','eyeshadow','teeth','tongue','toungue'}
SKIN_COVER_PARTS = set()
for key in part_voxels:
    if key == 'body' or key == 'hair': continue
    if any(kw in key for kw in SKIN_EXCLUDE_KEYWORDS): continue
    SKIN_COVER_PARTS.add(key)
print(f"  Skin cover parts: {SKIN_COVER_PARTS}")

if 'body' in part_voxels:
    body_meshes = all_mesh_data['body']
    clothing_positions = set()
    for key, voxels in part_voxels.items():
        if key in SKIN_COVER_PARTS: clothing_positions.update(voxels.keys())
    added = 0; thr = voxel_size * 5.0
    for pos in clothing_positions:
        if pos in part_voxels['body']: continue
        vx, vy, vz = pos
        dp = Vector((def_min.x + (vx + 0.5) * voxel_size, def_min.y + (vy + 0.5) * voxel_size, def_min.z + (vz + 0.5) * voxel_size))
        op = inv_deform(dp)
        best_dist = thr; best_color = None
        for md in body_meshes:
            loc, norm, fi, dist = md.bvh.find_nearest(op)
            if loc is not None and dist < best_dist: best_dist = dist; best_color = get_color_at(md, fi, loc)
        if best_color: part_voxels['body'][pos] = best_color; added += 1
    print(f"  Body skin fill: added {added} voxels under clothing (total body: {len(part_voxels['body'])})")

# ボディスキン色補正: 衣装下の暗い色を露出スキン色に合わせる
if 'body' in part_voxels:
    clothing_positions = set()
    for key, voxels in part_voxels.items():
        if key in SKIN_COVER_PARTS: clothing_positions.update(voxels.keys())
    exposed_avg_per_z = {}
    for (vx, vy, vz), col in part_voxels['body'].items():
        if (vx, vy, vz) not in clothing_positions:
            if vz not in exposed_avg_per_z: exposed_avg_per_z[vz] = [0, 0, 0, 0]
            exposed_avg_per_z[vz][0] += col[0]; exposed_avg_per_z[vz][1] += col[1]
            exposed_avg_per_z[vz][2] += col[2]; exposed_avg_per_z[vz][3] += 1
    for z in exposed_avg_per_z:
        n = exposed_avg_per_z[z][3]
        if n > 0: exposed_avg_per_z[z] = (exposed_avg_per_z[z][0]//n, exposed_avg_per_z[z][1]//n, exposed_avg_per_z[z][2]//n)
        else: exposed_avg_per_z[z] = None
    corrected = 0
    for pos in clothing_positions:
        if pos not in part_voxels['body']: continue
        vx, vy, vz = pos; orig = part_voxels['body'][pos]
        ref = exposed_avg_per_z.get(vz)
        if ref is None:
            for dz in range(1, 10):
                ref = exposed_avg_per_z.get(vz + dz) or exposed_avg_per_z.get(vz - dz)
                if ref: break
        if ref is None: continue
        blend = 0.7
        part_voxels['body'][pos] = (int(orig[0]*(1-blend)+ref[0]*blend), int(orig[1]*(1-blend)+ref[1]*blend), int(orig[2]*(1-blend)+ref[2]*blend))
        corrected += 1
    print(f"  Body color correction: {corrected} voxels blended toward exposed skin tone")

# ========================================================================
# 顔後処理: 対称化、マスカラ薄化、リップ着色
# ========================================================================
if 'body' in part_voxels:
    bv = part_voxels['body']
    head_z_orig = min_co.z + 0.85 * model_h
    head_z_vox = int((head_z_orig - def_min.z) / voxel_size)
    head_voxels = {(x,y,z): c for (x,y,z), c in bv.items() if z >= head_z_vox}
    if head_voxels:
        hxs = [x for x,y,z in head_voxels]
        face_cx = (min(hxs) + max(hxs)) / 2.0; cx_int = int(round(face_cx))
        print(f"  Face post-process: head_z>={head_z_vox}, center_x={face_cx:.1f}")
        # 対称化
        sym_added = 0
        for (x, y, z) in list(head_voxels.keys()):
            mirror_x = 2 * cx_int - x
            if (mirror_x, y, z) not in bv and mirror_x >= 0 and mirror_x < gx:
                bv[(mirror_x, y, z)] = bv[(x, y, z)]; sym_added += 1
        print(f"    Symmetry: added {sym_added} mirrored voxels")
        # マスカラ薄化
        def is_dark(c): return (c[0] + c[1] + c[2]) / 3.0 < 50
        eye_z_top = head_z_vox + 10; eye_z_bot = head_z_vox + 9; forehead_z = head_z_vox + 11
        mascara_thinned = 0
        for z_target in [eye_z_top, eye_z_bot, eye_z_top - 1, eye_z_bot - 1, eye_z_top + 1]:
            for y_target in range(0, 6):
                row = {}
                for (x, y, z), c in bv.items():
                    if y == y_target and z == z_target and min(hxs) <= x <= max(hxs): row[x] = c
                if not row: continue
                xs_sorted = sorted(row.keys())
                skin_ref = None
                for (x, y, z), c in bv.items():
                    if y == y_target and z == forehead_z and not is_dark(c): skin_ref = c; break
                if skin_ref is None: continue
                skin_xs = [x for x in xs_sorted if x in row and not is_dark(row[x])]
                dark_xs = [x for x in xs_sorted if x in row and is_dark(row[x])]
                if not skin_xs or not dark_xs: continue
                skin_min, skin_max = min(skin_xs), max(skin_xs)
                for x in dark_xs:
                    if x < skin_min - 1 or x > skin_max + 1:
                        bv[(x, y_target, z_target)] = skin_ref; mascara_thinned += 1
        print(f"    Mascara thinning: replaced {mascara_thinned} voxels (kept 1px outline)")
        # リップ着色
        mouth_z_min = head_z_vox + 7; mouth_z_max = head_z_vox + 8; lip_count = 0
        for (x, y, z) in list(bv.keys()):
            if z < mouth_z_min or z > mouth_z_max: continue
            if y < 1 or y > 3: continue
            if abs(x - cx_int) > 3: continue
            col = bv[(x, y, z)]; br = (col[0] + col[1] + col[2]) / 3.0
            if br < 50 or br > 200: continue
            bv[(x, y, z)] = (min(255, int(col[0]*1.08)), max(0, int(col[1]*0.85)), max(0, int(col[2]*0.88))); lip_count += 1
        print(f"    Lip pink: adjusted {lip_count} voxels")

# ========================================================================
# VOXファイル書き出し
# ========================================================================
def build_palette_and_voxels(voxel_dict):
    """ボクセル辞書からパレットとボクセルリストを構築（8刻みに量子化）。"""
    color_map = {}; pal = []; out = []
    for (vx, vy, vz), (r, g, b) in voxel_dict.items():
        qr = (r//8)*8; qg = (g//8)*8; qb = (b//8)*8; key = (qr, qg, qb)
        if key not in color_map:
            if len(pal) >= 255:
                best_i, best_d = 0, 1e9
                for i, (pr, pg, pb) in enumerate(pal):
                    d = (pr-qr)**2+(pg-qg)**2+(pb-qb)**2
                    if d < best_d: best_d, best_i = d, i
                color_map[key] = best_i + 1
            else:
                pal.append(key); color_map[key] = len(pal)
        out.append((vx, vy, vz, color_map[key]))
    return out, pal

def write_vox(fp, sx, sy, sz, voxels, pal):
    """VOXファイルを書き出す。"""
    xyzi = 4 + len(voxels) * 4; children = (12+12) + (12+xyzi) + (12+1024)
    with open(fp, 'wb') as f:
        f.write(b'VOX '); f.write(struct.pack('<I', 150))
        f.write(b'MAIN'); f.write(struct.pack('<II', 0, children))
        f.write(b'SIZE'); f.write(struct.pack('<II', 12, 0)); f.write(struct.pack('<III', sx, sy, sz))
        f.write(b'XYZI'); f.write(struct.pack('<II', xyzi, 0)); f.write(struct.pack('<I', len(voxels)))
        for vx, vy, vz, ci in voxels: f.write(struct.pack('BBBB', vx, vy, vz, ci))
        f.write(b'RGBA'); f.write(struct.pack('<II', 1024, 0))
        for i in range(256):
            if i < len(pal): f.write(struct.pack('BBBB', pal[i][0], pal[i][1], pal[i][2], 255))
            else: f.write(struct.pack('BBBB', 0, 0, 0, 0))
    print(f"  -> {fp}: {sx}x{sy}x{sz}, {len(voxels)} voxels, {len(pal)} colors")

# パーツごとにVOXファイルを出力
import json
part_manifest = []

# モデルベース名を入力ファイルから決定
_model_base = os.path.splitext(os.path.basename(INPUT_PATH))[0].lower()
import re
_model_base = re.sub(r'^uploads_files_\d+_', '', _model_base)
_model_base = _model_base.replace(' ', '_')
_out_subdir = os.path.basename(OUT_DIR.rstrip('/\\'))
print(f"  Model base: '{_model_base}', output subdir: '{_out_subdir}'")

# デフォルトON判定
DEFAULT_ON_KEYWORDS = {'body','hair','eyes','eyelash','teeth','tongue','eyeshadow'}
CLOTHES_KEYWORDS = {'clothes','suit','leotard','boot','hat','jacket','gloves','bra','panties','leggings','pauldron','shoulder','neck','ruffle'}
def is_default_on(key, orig_names):
    k = key.lower()
    if any(kw in k for kw in DEFAULT_ON_KEYWORDS): return True
    for n in orig_names:
        if any(kw in n.lower() for kw in CLOTHES_KEYWORDS): return True
    return False

for key, voxels in part_voxels.items():
    if not voxels: continue
    filename = f"{_model_base}_{key}.vox"
    vlist, pal = build_palette_and_voxels(voxels)
    write_vox(os.path.join(OUT_DIR, filename), gx, gy, gz, vlist, pal)
    orig_names = [o.name for o in part_objects.get(key, [])]
    part_manifest.append({'key': key, 'file': f'/{_out_subdir}/{filename}', 'voxels': len(voxels), 'default_on': is_default_on(key, orig_names)})

# 結合VOX（全パーツマージ、フォールバック用）
all_merged = {}
for voxels in part_voxels.values(): all_merged.update(voxels)
vlist_c, pal_c = build_palette_and_voxels(all_merged)
write_vox(os.path.join(OUT_DIR, f"{_model_base}.vox"), gx, gy, gz, vlist_c, pal_c)

# パーツマニフェストJSON
manifest_path = os.path.join(OUT_DIR, f"{_model_base}_parts.json")
with open(manifest_path, 'w') as f: json.dump(part_manifest, f, indent=2)
print(f"  -> {manifest_path}: {len(part_manifest)} parts")

# グリッド情報JSON
grid_info = {
    'gx': gx, 'gy': gy, 'gz': gz, 'voxel_size': voxel_size,
    'def_min': [def_min.x, def_min.y, def_min.z], 'def_max': [def_max.x, def_max.y, def_max.z],
    'raw_min': [min_co.x, min_co.y, min_co.z], 'raw_max': [max_co.x, max_co.y, max_co.z],
    'raw_center': [center.x, center.y, center.z], 'model_h': model_h,
}
grid_info_path = os.path.join(OUT_DIR, f"{_model_base}_grid.json")
with open(grid_info_path, 'w') as f: json.dump(grid_info, f, indent=2)
print(f"  -> {grid_info_path}: grid info saved")

# リソース解放
for cat in all_mesh_data:
    for md in all_mesh_data[cat]: md.bm.free()
