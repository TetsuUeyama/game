"""QM MustardUI (ARP rigged) model voxelizer with per-voxel bone weights.

リアルプロポーションのまま voxel 化し、ARP の deform ボーンを全て書き出す。
衣装・髪の揺れボーン (hair_braid / dress_front / belt_tail 等) を保持する
ので、後段で Spring Bone / cloth sim に接続可能。

出力:
  - grid.json           共通グリッド (voxel_size, grid_origin, gx/gy/gz)
  - skeleton.json       ARP deform ボーンの階層 + rest-pose (head/tail world)
  - <prefix>.vox        パーツのボクセル (256色パレット)
  - <prefix>.weights.json  voxel ごとの bone weight (最大4本)

Usage:
  blender --background <blend> --python voxelize_mustardui.py -- \
    <out_dir> [<mesh_name>] [<out_prefix>] [--resolution 250] [--init-only]

  --init-only: grid.json + skeleton.json のみ出力。メッシュのボクセル化はしない。
"""
import bpy
import bmesh
import sys
import os
import struct
import json
import time
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ========================================================================
# 引数パース
# ========================================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

pos_args = []
RESOLUTION = 250
INIT_ONLY = False
SCALE_FACTOR = 1  # > 1 で sub-grid モード (voxel_size = body_vs / N, 自前 bbox)
SKIP_MATERIALS = []  # ボクセル化時にスキップするマテリアル名 (透明レンズ Cornea 等)
CROP_BONES = []       # これらのボーン rest 位置で bbox を決定してクロップ
CROP_PADDING = 0.008  # crop_bbox を広げる量 (m)。唇外側の肌を少し含めるため
NO_INTERIOR = False   # Pass 2 (parity ray cast で内部充填) を skip
ERODE_PASSES = 0      # ボクセル化後に N パス浸食 (5+ 方向 solid 隣接の voxel を削除)
ERODE_THRESHOLD = 5   # 浸食判定に使う最小隣接数 (5 or 6)
SURFACE_THRESHOLD = 0.9  # Pass 1 で「voxel が面に近い」と判定する距離 (voxel_size 倍数)
                          #   小さい (0.3-0.5) = voxel を貫通する面のみ → 薄い
                          #   大きい (1.5-3.0) = voxel 近傍の面も拾う → 太い (sparse hair 等)
ARMATURE_NAME = None  # 指定時: そのアーマチュアを使う。未指定: deform bone 数が最多のもの。
i = 0
while i < len(args):
    a = args[i]
    if a == '--resolution' and i + 1 < len(args):
        RESOLUTION = int(args[i + 1]); i += 2; continue
    if a == '--init-only':
        INIT_ONLY = True; i += 1; continue
    if a == '--scale-factor' and i + 1 < len(args):
        SCALE_FACTOR = int(args[i + 1]); i += 2; continue
    if a == '--skip-material' and i + 1 < len(args):
        SKIP_MATERIALS.append(args[i + 1]); i += 2; continue
    if a == '--crop-bones' and i + 1 < len(args):
        CROP_BONES.extend([s.strip() for s in args[i + 1].split(',') if s.strip()])
        i += 2; continue
    if a == '--crop-padding' and i + 1 < len(args):
        CROP_PADDING = float(args[i + 1]); i += 2; continue
    if a == '--no-interior':
        NO_INTERIOR = True; i += 1; continue
    if a == '--erode' and i + 1 < len(args):
        ERODE_PASSES = int(args[i + 1]); i += 2; continue
    if a == '--erode-threshold' and i + 1 < len(args):
        ERODE_THRESHOLD = int(args[i + 1]); i += 2; continue
    if a == '--surface-threshold' and i + 1 < len(args):
        SURFACE_THRESHOLD = float(args[i + 1]); i += 2; continue
    if a == '--armature' and i + 1 < len(args):
        ARMATURE_NAME = args[i + 1]; i += 2; continue
    if a.startswith('--'):
        i += 1; continue
    pos_args.append(a); i += 1

if len(pos_args) < 1:
    print("ERROR: need <out_dir> at minimum"); sys.exit(1)

OUT_DIR = pos_args[0]
MESH_NAME = pos_args[1] if len(pos_args) > 1 else None
OUT_PREFIX = pos_args[2] if len(pos_args) > 2 else None

if not INIT_ONLY and (not MESH_NAME or not OUT_PREFIX):
    print("ERROR: need <mesh_name> <out_prefix> (or pass --init-only)"); sys.exit(1)

os.makedirs(OUT_DIR, exist_ok=True)
GRID_PATH = os.path.join(OUT_DIR, 'grid.json')
SKEL_PATH = os.path.join(OUT_DIR, 'skeleton.json')

print(f"\n=== voxelize_mustardui ===")
print(f"  out_dir: {OUT_DIR}")
print(f"  resolution: {RESOLUTION}")
if INIT_ONLY:
    print(f"  mode: INIT-ONLY (grid + skeleton)")
else:
    print(f"  mesh: {MESH_NAME}")
    print(f"  prefix: {OUT_PREFIX}")
    if SCALE_FACTOR > 1:
        print(f"  sub-grid: scale factor x{SCALE_FACTOR} (own bbox + smaller voxel)")
    if SKIP_MATERIALS:
        print(f"  skip materials: {SKIP_MATERIALS}")
    if NO_INTERIOR:
        print(f"  no-interior: skip Pass 2 (surface only)")
    if ERODE_PASSES > 0:
        print(f"  erode: {ERODE_PASSES} passes, threshold={ERODE_THRESHOLD}+ neighbors")
    print(f"  surface-threshold: {SURFACE_THRESHOLD} (× voxel_size)")

# ========================================================================
# Blender 準備
# ========================================================================
t0 = time.time()

# MASK modifier を無効化（body メッシュのスキンを全露出）
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

# ========================================================================
# Armature 検出 & skeleton.json 書き出し
# ========================================================================
arm_obj = None
if ARMATURE_NAME:
    for o in bpy.data.objects:
        if o.type == 'ARMATURE' and o.name == ARMATURE_NAME:
            arm_obj = o; break
    if not arm_obj:
        print(f"ERROR: armature '{ARMATURE_NAME}' not found"); sys.exit(1)
else:
    # Pick the armature with the most deform bones (avoid accessory rigs)
    best_count = -1
    for o in bpy.data.objects:
        if o.type == 'ARMATURE':
            c = sum(1 for b in o.data.bones if b.use_deform)
            if c > best_count:
                best_count = c; arm_obj = o
if not arm_obj:
    print("ERROR: No armature found"); sys.exit(1)
print(f"  Armature: {arm_obj.name} ({len(arm_obj.data.bones)} bones)")

def _save_skeleton():
    mat_world = arm_obj.matrix_world
    bones_data = []
    for b in arm_obj.data.bones:
        if not b.use_deform:
            continue
        head_w = mat_world @ b.head_local
        tail_w = mat_world @ b.tail_local
        bones_data.append({
            'name': b.name,
            'parent': b.parent.name if b.parent else None,
            'use_deform': True,
            'head_rest': [round(head_w.x, 6), round(head_w.y, 6), round(head_w.z, 6)],
            'tail_rest': [round(tail_w.x, 6), round(tail_w.y, 6), round(tail_w.z, 6)],
        })
    data = {
        'armature': arm_obj.name,
        'bone_count': len(bones_data),
        'bones': bones_data,
    }
    with open(SKEL_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"  -> skeleton.json ({len(bones_data)} deform bones)")

if not os.path.exists(SKEL_PATH):
    _save_skeleton()
else:
    print(f"  skeleton.json exists: skip")

# ========================================================================
# 可視 rigged メッシュ一覧 (cage / cs_ / Golden Bikini 除外)
# ========================================================================
def is_target_mesh(o):
    if o.type != 'MESH':
        return False
    n = o.name.lower()
    if n.startswith('cs_'):
        return False
    if n.startswith('cage-') or n.startswith('cage_'):
        return False
    # 非表示かつデフォルト衣装 ≠ のものも対象（Golden Bikini等）には含めない。
    # ただし処理は MESH_NAME 指定時はその名前のみ。
    return True

visible_rigged = [o for o in bpy.data.objects
                  if is_target_mesh(o) and o.visible_get()]
print(f"  Visible rigged meshes: {len(visible_rigged)}")

# ========================================================================
# grid.json 初期化 (bbox は visible rigged 全体から取る)
# ========================================================================
def _compute_grid():
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    dg = bpy.context.evaluated_depsgraph_get()
    count = 0
    for o in visible_rigged:
        # Golden Bikini 等の非表示系は除外済み
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        me.transform(o.matrix_world)
        for v in me.vertices:
            for k in range(3):
                mn[k] = min(mn[k], v.co[k])
                mx[k] = max(mx[k], v.co[k])
            count += 1
        eo.to_mesh_clear()
    print(f"  bbox sampled from {count} verts over {len(visible_rigged)} meshes")
    print(f"  bbox min = ({mn.x:.3f}, {mn.y:.3f}, {mn.z:.3f})")
    print(f"  bbox max = ({mx.x:.3f}, {mx.y:.3f}, {mx.z:.3f})")
    # 少しパディング
    pad = (mx - mn).length * 0.01
    mn -= Vector((pad, pad, pad))
    mx += Vector((pad, pad, pad))
    # resolution は bbox.z を RESOLUTION 分割する
    size = mx - mn
    voxel_size = size.z / RESOLUTION
    gx = int(size.x / voxel_size) + 1
    gy = int(size.y / voxel_size) + 1
    gz = int(size.z / voxel_size) + 1
    grid = {
        'voxel_size': voxel_size,
        'grid_origin': [mn.x, mn.y, mn.z],
        'gx': gx, 'gy': gy, 'gz': gz,
        'bb_min': [mn.x, mn.y, mn.z],
        'bb_max': [mx.x, mx.y, mx.z],
        'resolution': RESOLUTION,
    }
    with open(GRID_PATH, 'w') as f:
        json.dump(grid, f, indent=1)
    print(f"  -> grid.json: {gx}x{gy}x{gz}, voxel_size={voxel_size:.5f}")
    return grid

if os.path.exists(GRID_PATH):
    with open(GRID_PATH) as f:
        grid = json.load(f)
    print(f"  grid.json exists: {grid['gx']}x{grid['gy']}x{grid['gz']}, "
          f"voxel_size={grid['voxel_size']:.5f}")
else:
    grid = _compute_grid()

VOX_SIZE = grid['voxel_size']
ORIGIN = Vector(grid['grid_origin'])
GX, GY, GZ = grid['gx'], grid['gy'], grid['gz']

if INIT_ONLY:
    print(f"\n  init-only done in {time.time()-t0:.1f}s")
    sys.exit(0)

# ========================================================================
# 指定メッシュを voxel 化
# ========================================================================
target = None
for o in bpy.data.objects:
    if o.name == MESH_NAME and o.type == 'MESH':
        target = o; break
if not target:
    print(f"ERROR: mesh '{MESH_NAME}' not found"); sys.exit(1)
print(f"\n  Target: {target.name} ({len(target.data.vertices)} verts)")

# ---- sub-grid モード: 自前 bbox + 小さい voxel_size でローカルグリッドを作る ----
# 重要: grid_origin (world座標) は共通 bbox に揃えず、メッシュ自身の bbox を使う。
# ただし voxel_size は body_voxel_size / SCALE_FACTOR とし world スケールは一致。
if SCALE_FACTOR > 1:
    body_vs = VOX_SIZE  # 元の grid.json から
    sub_vs = body_vs / SCALE_FACTOR

    if CROP_BONES:
        # --- ボーン rest 位置から bbox を決定 (メッシュではなく骨格基準) ---
        mn_sub = Vector((1e9, 1e9, 1e9))
        mx_sub = Vector((-1e9, -1e9, -1e9))
        matched = []
        arm_mw = arm_obj.matrix_world
        for b in arm_obj.data.bones:
            if not b.use_deform: continue
            if not any(pat in b.name for pat in CROP_BONES): continue
            matched.append(b.name)
            for p_local in (b.head_local, b.tail_local):
                p = arm_mw @ p_local
                for k in range(3):
                    mn_sub[k] = min(mn_sub[k], p[k])
                    mx_sub[k] = max(mx_sub[k], p[k])
        if not matched:
            print(f"ERROR: crop-bones {CROP_BONES} matched no deform bones"); sys.exit(1)
        print(f"  crop-bones: {len(matched)} matched → {matched[:8]}{'...' if len(matched)>8 else ''}")
        # padding 追加（mesh 表面を拾うため）
        pad = CROP_PADDING
        mn_sub -= Vector((pad, pad, pad))
        mx_sub += Vector((pad, pad, pad))
    else:
        # --- メッシュ全体の bbox を使う ---
        mn_sub = Vector((1e9, 1e9, 1e9))
        mx_sub = Vector((-1e9, -1e9, -1e9))
        dg_sub = bpy.context.evaluated_depsgraph_get()
        eo_sub = target.evaluated_get(dg_sub)
        me_sub = eo_sub.to_mesh()
        me_sub.transform(target.matrix_world)
        for v in me_sub.vertices:
            for k in range(3):
                mn_sub[k] = min(mn_sub[k], v.co[k])
                mx_sub[k] = max(mx_sub[k], v.co[k])
        eo_sub.to_mesh_clear()
        # 余裕マージン 2 voxel 分
        margin = sub_vs * 2
        mn_sub -= Vector((margin, margin, margin))
        mx_sub += Vector((margin, margin, margin))
    sub_gx = int((mx_sub.x - mn_sub.x) / sub_vs) + 1
    sub_gy = int((mx_sub.y - mn_sub.y) / sub_vs) + 1
    sub_gz = int((mx_sub.z - mn_sub.z) / sub_vs) + 1
    # 全体グリッドの代わりに sub-grid を使う
    VOX_SIZE = sub_vs
    ORIGIN = Vector((mn_sub.x, mn_sub.y, mn_sub.z))
    GX, GY, GZ = sub_gx, sub_gy, sub_gz
    # part 専用 grid を保存
    sub_grid_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.grid.json")
    with open(sub_grid_path, 'w') as f:
        json.dump({
            'voxel_size': sub_vs,
            'grid_origin': [mn_sub.x, mn_sub.y, mn_sub.z],
            'gx': sub_gx, 'gy': sub_gy, 'gz': sub_gz,
            'scale_factor': SCALE_FACTOR,
            'parent_voxel_size': body_vs,
        }, f, indent=1)
    print(f"  sub-grid: {sub_gx}x{sub_gy}x{sub_gz}, voxel_size={sub_vs:.6f} (x{SCALE_FACTOR})")
    print(f"  sub-grid bbox world: ({mn_sub.x:.3f},{mn_sub.y:.3f},{mn_sub.z:.3f}) .. "
          f"({mx_sub.x:.3f},{mx_sub.y:.3f},{mx_sub.z:.3f})")
    print(f"  -> {sub_grid_path}")

# ---- テクスチャキャッシュ & sampling (blender_voxelize.py 由来) ----
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
        rgb[i*3]   = max(0, min(255, int(raw[si] * 255)))
        rgb[i*3+1] = max(0, min(255, int(raw[si+1] * 255)))
        rgb[i*3+2] = max(0, min(255, int(raw[si+2] * 255)))
    texture_cache[image.name] = (w, h, bytes(rgb))
    del raw

def sample_texture(img_name, u, v):
    if img_name not in texture_cache: return None
    w, h, pix = texture_cache[img_name]
    # Blender の image.pixels は bottom-up なので V flip 不要（UV も同じ向き）
    px = int(u * w) % w; py = int(v * h) % h
    pi = (py * w + px) * 3
    if pi + 2 < len(pix):
        return (pix[pi], pix[pi+1], pix[pi+2])
    return None

def score_image(name):
    n = name.lower()
    if 'basecolor' in n or 'base_color' in n or 'diffuse' in n: return 10
    if 'albedo' in n: return 8
    if any(k in n for k in ['normal','roughness','metallic','specular','opacity','alpha','sss','ao','ambient']):
        return -10
    return 0

def find_texture_for_mat(mat):
    if not mat: return None
    best, best_score = None, -999
    if hasattr(mat, 'node_tree') and mat.node_tree:
        for nd in mat.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image:
                s = score_image(nd.image.name)
                if s > best_score: best_score, best = s, nd.image
            if nd.type == 'GROUP' and nd.node_tree:
                for inner in nd.node_tree.nodes:
                    if inner.type == 'TEX_IMAGE' and inner.image:
                        s = score_image(inner.image.name)
                        if s > best_score: best_score, best = s, inner.image
    return best if best_score >= 0 else None

mat_info = {}  # material name → {'image': img_name or None, 'color': (r,g,b)}
for slot in target.material_slots:
    mat = slot.material
    if not mat or mat.name in mat_info: continue
    info = {'image': None, 'color': (180, 180, 180)}
    img = find_texture_for_mat(mat)
    if img:
        cache_texture(img); info['image'] = img.name
    else:
        if hasattr(mat, 'node_tree') and mat.node_tree:
            for nd in mat.node_tree.nodes:
                if nd.type == 'BSDF_PRINCIPLED':
                    inp = nd.inputs.get('Base Color')
                    if inp and not inp.is_linked:
                        c = inp.default_value
                        info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                    break
    mat_info[mat.name] = info
    tag = info['image'] if info['image'] else f"flat-rgb{info['color']}"
    print(f"    Mat '{mat.name}': {tag}")

# ---- 評価済みメッシュを world 空間へ変換、BMesh + BVH ----
dg = bpy.context.evaluated_depsgraph_get()
eo = target.evaluated_get(dg)
me_eval = eo.to_mesh()
bm = bmesh.new()
bm.from_mesh(me_eval)
bmesh.ops.transform(bm, matrix=target.matrix_world, verts=bm.verts)

# Skip 対象マテリアルの face を削除（透明 Cornea 等を除外）
if SKIP_MATERIALS:
    skip_mat_indices = set()
    for mi, slot in enumerate(target.material_slots):
        if slot.material and slot.material.name in SKIP_MATERIALS:
            skip_mat_indices.add(mi)
    faces_to_delete = [f for f in bm.faces if f.material_index in skip_mat_indices]
    if faces_to_delete:
        bmesh.ops.delete(bm, geom=faces_to_delete, context='FACES')
        print(f"  Deleted {len(faces_to_delete)} faces from skipped materials")
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

bmesh.ops.triangulate(bm, faces=bm.faces)
bm.verts.ensure_lookup_table()
bm.faces.ensure_lookup_table()
uv_layer = bm.loops.layers.uv.active
bvh = BVHTree.FromBMesh(bm)
print(f"  Triangulated: {len(bm.faces)} tris, uv={'yes' if uv_layer else 'no'}")

# ---- 元メッシュの vertex group weights を取得 ----
orig_mesh = target.data
vg_names = [vg.name for vg in target.vertex_groups]
# 各元頂点 → {vg_idx: weight} を作る
vert_weights_src = []
for v in orig_mesh.vertices:
    wm = {}
    for g in v.groups:
        if g.weight > 0.001:
            wm[g.group] = g.weight
    vert_weights_src.append(wm)

# 評価済みメッシュの face → 元頂点 index (corrective smooth 等で頂点増加した場合、
# bm.verts.index に対応する元 index を引き直す必要があるが、vertex modifier は
# 通常トポロジを変えないので index はそのまま使える想定)
# target.data.vertices の数と bm.verts の数が一致するか確認
if len(bm.verts) != len(orig_mesh.vertices):
    print(f"  WARN: evaluated verts {len(bm.verts)} != orig {len(orig_mesh.vertices)}; "
          f"weight 取得精度が落ちる可能性あり (Subsurf/Mirror 等の modifier)")

# ---- ARP deform bones のみに限定 ----
deform_bone_names = set()
for b in arm_obj.data.bones:
    if b.use_deform:
        deform_bone_names.add(b.name)

# vg_name → deform bone index のマップ (deform でない vg は無視)
with open(SKEL_PATH) as f:
    skel_data = json.load(f)
skel_bone_names = [b['name'] for b in skel_data['bones']]
bone_name_to_idx = {n: i for i, n in enumerate(skel_bone_names)}

vg_idx_to_bone_idx = {}
for vgi, vgn in enumerate(vg_names):
    if vgn in bone_name_to_idx:
        vg_idx_to_bone_idx[vgi] = bone_name_to_idx[vgn]

print(f"  Mapped vertex groups -> bones: {len(vg_idx_to_bone_idx)}/{len(vg_names)}")

# ========================================================================
# 穴明き対策: 衣装のように薄いメッシュは ray cast で inside 判定しにくい。
# まず surface sampling (voxel ごとに BVH.find_nearest で近接判定) して近い voxel を on にする。
# body のようにボリュームがあるメッシュは ray parity で内部も埋める。
# ========================================================================
# どっちでも動くよう両方やって union を取る戦略:
#   1. surface voxels (距離 < voxel_size * 0.9) を on
#   2. parity ray cast で interior voxels を on
# ========================================================================
result_voxels = {}  # (x,y,z) -> (r, g, b)
result_weights = {} # (x,y,z) -> [[bone_idx, weight], ...]

def voxel_center(ix, iy, iz):
    return Vector((
        ORIGIN.x + (ix + 0.5) * VOX_SIZE,
        ORIGIN.y + (iy + 0.5) * VOX_SIZE,
        ORIGIN.z + (iz + 0.5) * VOX_SIZE,
    ))

def compute_color_weight_at(world_pt):
    """最寄り三角形から barycentric で色 + bone weight を計算。"""
    loc, norm, fi, dist = bvh.find_nearest(world_pt, VOX_SIZE * 3)
    if loc is None or fi is None:
        return None, None
    face = bm.faces[fi]
    loops = list(face.loops)
    v0, v1, v2 = [l.vert.co for l in loops]
    # Barycentric
    d0 = v1 - v0; d1 = v2 - v0; d2 = loc - v0
    dn = d0.dot(d0) * d1.dot(d1) - d0.dot(d1) ** 2
    if abs(dn) < 1e-12:
        u, v, w = 0.33, 0.33, 0.34
    else:
        inv = 1.0 / dn
        u = (d1.dot(d1) * d0.dot(d2) - d0.dot(d1) * d1.dot(d2)) * inv
        v = (d0.dot(d0) * d1.dot(d2) - d0.dot(d1) * d0.dot(d2)) * inv
        w = 1.0 - u - v
    # 色
    color = None
    mat_idx = face.material_index
    mat_name = None
    if mat_idx < len(target.data.materials) and target.data.materials[mat_idx]:
        mat_name = target.data.materials[mat_idx].name
    mi = mat_info.get(mat_name, {})
    if mi.get('image') and uv_layer:
        uv0 = loops[0][uv_layer].uv
        uv1 = loops[1][uv_layer].uv
        uv2 = loops[2][uv_layer].uv
        uu = w * uv0.x + u * uv1.x + v * uv2.x
        vv = w * uv0.y + u * uv1.y + v * uv2.y
        c = sample_texture(mi['image'], uu, vv)
        if c is not None:
            color = c
    if color is None:
        color = mi.get('color', (180, 180, 180))

    # Weights: 3 頂点から barycentric 合成
    accum = {}  # bone_idx -> weight
    verts_bary = [(loops[0].vert.index, w), (loops[1].vert.index, u), (loops[2].vert.index, v)]
    for vi, bw in verts_bary:
        if vi >= len(vert_weights_src):
            continue
        vw = vert_weights_src[vi]
        for vg_idx, gw in vw.items():
            bi = vg_idx_to_bone_idx.get(vg_idx)
            if bi is None:
                continue
            accum[bi] = accum.get(bi, 0.0) + bw * gw
    # 上位 4 個 + 正規化
    items = sorted(accum.items(), key=lambda x: -x[1])[:4]
    total = sum(w for _, w in items)
    if total > 0:
        weights = [[bi, round(w / total, 4)] for bi, w in items]
    else:
        weights = []
    return color, weights

# Pass 1: surface voxels (BVH.find_nearest)
print(f"  Pass 1: surface sampling (threshold = {SURFACE_THRESHOLD} × voxel_size)...")
t_p1 = time.time()
surf_count = 0
surf_radius = VOX_SIZE * SURFACE_THRESHOLD
for ix in range(GX):
    for iy in range(GY):
        for iz in range(GZ):
            c = voxel_center(ix, iy, iz)
            loc, norm, fi, dist = bvh.find_nearest(c, surf_radius)
            if loc is None: continue
            color, weights = compute_color_weight_at(c)
            if color is None: continue
            result_voxels[(ix, iy, iz)] = color
            result_weights[(ix, iy, iz)] = weights
            surf_count += 1
print(f"    surface: {surf_count} voxels ({time.time()-t_p1:.1f}s)")

interior_count = 0
if NO_INTERIOR:
    print(f"  Pass 2: SKIPPED (--no-interior)")
else:
    # Pass 2: parity ray cast for interior
    # 各 (ix, iy) 列で +Z 方向に ray を飛ばし、tri hit を順番に並べて parity で内側判定
    print(f"  Pass 2: parity ray cast for interior...")
    t_p2 = time.time()
    for ix in range(GX):
        for iy in range(GY):
            start = Vector((
                ORIGIN.x + (ix + 0.5) * VOX_SIZE,
                ORIGIN.y + (iy + 0.5) * VOX_SIZE,
                ORIGIN.z - 1.0,
            ))
            direction = Vector((0, 0, 1))
            hits = []
            cur = start.copy()
            max_z = ORIGIN.z + (GZ + 1) * VOX_SIZE
            while cur.z < max_z:
                loc, norm, fi, dist = bvh.ray_cast(cur, direction)
                if loc is None: break
                hits.append(loc.z)
                cur = loc + direction * 1e-5
                if len(hits) > 2000: break
            if len(hits) < 2: continue
            for k in range(0, len(hits) - 1, 2):
                z_enter = hits[k]
                z_exit = hits[k + 1]
                iz0 = max(0, int((z_enter - ORIGIN.z) / VOX_SIZE))
                iz1 = min(GZ - 1, int((z_exit - ORIGIN.z) / VOX_SIZE))
                for iz in range(iz0, iz1 + 1):
                    if (ix, iy, iz) in result_voxels: continue
                    c = voxel_center(ix, iy, iz)
                    color, weights = compute_color_weight_at(c)
                    if color is None: continue
                    result_voxels[(ix, iy, iz)] = color
                    result_weights[(ix, iy, iz)] = weights
                    interior_count += 1
        if ix % 20 == 0:
            print(f"    column {ix}/{GX} interior so far: {interior_count}")
    print(f"    interior: {interior_count} voxels ({time.time()-t_p2:.1f}s)")

# Erosion pass: 周囲 N 方向以上が solid な voxel を削除する
if ERODE_PASSES > 0:
    print(f"  Erode: {ERODE_PASSES} passes at threshold ≥{ERODE_THRESHOLD} neighbors")
    NEIGHBOR_DIRS = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
    for ep in range(ERODE_PASSES):
        to_remove = []
        for (x, y, z) in result_voxels.keys():
            nc = 0
            for dx, dy, dz in NEIGHBOR_DIRS:
                if (x+dx, y+dy, z+dz) in result_voxels:
                    nc += 1
            if nc >= ERODE_THRESHOLD:
                to_remove.append((x, y, z))
        for k in to_remove:
            del result_voxels[k]
            if k in result_weights:
                del result_weights[k]
        print(f"    pass {ep+1}: removed {len(to_remove)} voxels ({len(result_voxels)} remaining)")

total_voxels = len(result_voxels)
print(f"  TOTAL: {total_voxels} voxels")

if total_voxels == 0:
    print("WARNING: no voxels generated"); sys.exit(1)

# ========================================================================
# VOX 書き出し
# ========================================================================
def quantize_color(c, step=4):
    return (
        min(255, (c[0] // step) * step + step // 2),
        min(255, (c[1] // step) * step + step // 2),
        min(255, (c[2] // step) * step + step // 2),
    )

step = 4
quantized = {p: quantize_color(c, step) for p, c in result_voxels.items()}
uq = set(quantized.values())
while len(uq) > 255:
    step *= 2
    quantized = {p: quantize_color(c, step) for p, c in result_voxels.items()}
    uq = set(quantized.values())

colors_list = list(uq)
cidx = {c: i + 1 for i, c in enumerate(colors_list)}
# voxel 出力順を決定 (weights.json でも同じ順を使う)
voxel_order = sorted(result_voxels.keys())
vlist = [(p[0], p[1], p[2], cidx[quantized[p]]) for p in voxel_order]

def write_vox(path, sx, sy, sz, voxels, pal):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels:
        xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
    rd = b''
    for i in range(256):
        if i < len(pal):
            rd += struct.pack('<BBBB', pal[i][0], pal[i][1], pal[i][2], 255)
        else:
            rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

# .vox の 1 座標 = 1 byte 制限 (0-255) のため、256 超の次元は分割する
VOX_MAX = 256
need_split = GX > VOX_MAX or GY > VOX_MAX or GZ > VOX_MAX

if not need_split:
    vox_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.vox")
    write_vox(vox_path, GX, GY, GZ, vlist, colors_list)
    print(f"  -> {vox_path} ({GX}x{GY}x{GZ}, {len(vlist)} voxels, {len(colors_list)} colors)")
else:
    # 最も超過量が大きい軸で分割
    axes = [('x', GX), ('y', GY), ('z', GZ)]
    axes.sort(key=lambda a: -a[1])
    split_axis_name, split_len = axes[0]
    split_axis = {'x': 0, 'y': 1, 'z': 2}[split_axis_name]
    n_chunks = (split_len + VOX_MAX - 1) // VOX_MAX
    print(f"  [split] axis={split_axis_name} length={split_len} → {n_chunks} chunks of ≤{VOX_MAX}")
    # voxel を chunk index でバケットに分類
    buckets = [[] for _ in range(n_chunks)]
    for v in vlist:  # (x, y, z, ci)
        axis_v = v[split_axis]
        ci_chunk = axis_v // VOX_MAX
        local = list(v)
        local[split_axis] = axis_v - ci_chunk * VOX_MAX
        buckets[ci_chunk].append(tuple(local))
    chunks_meta = []
    for ci in range(n_chunks):
        if not buckets[ci]:
            continue
        # chunk の local 次元
        dims = [GX, GY, GZ]
        if split_axis == 0:
            local_size = min(VOX_MAX, GX - ci * VOX_MAX)
            dims = [local_size, GY, GZ]
        elif split_axis == 1:
            local_size = min(VOX_MAX, GY - ci * VOX_MAX)
            dims = [GX, local_size, GZ]
        else:
            local_size = min(VOX_MAX, GZ - ci * VOX_MAX)
            dims = [GX, GY, local_size]
        chunk_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}_c{ci+1}.vox")
        write_vox(chunk_path, dims[0], dims[1], dims[2], buckets[ci], colors_list)
        # chunk の grid_origin をずらす
        co = [float(ORIGIN.x), float(ORIGIN.y), float(ORIGIN.z)]
        co[split_axis] += ci * VOX_MAX * VOX_SIZE
        chunks_meta.append({
            'vox_file': os.path.basename(chunk_path),
            'grid_origin': co,
            'gx': dims[0], 'gy': dims[1], 'gz': dims[2],
            'voxel_count': len(buckets[ci]),
        })
        print(f"  -> {chunk_path} ({dims[0]}x{dims[1]}x{dims[2]}, {len(buckets[ci])} voxels)")
    # .grid.json に chunks 配列を追加
    if SCALE_FACTOR > 1:
        sub_grid_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.grid.json")
        # 既存の sub-grid.json を読み込んで chunks を追記
        with open(sub_grid_path) as f:
            gd = json.load(f)
        gd['chunks'] = chunks_meta
        gd['split_axis'] = split_axis_name
        with open(sub_grid_path, 'w') as f:
            json.dump(gd, f, indent=1)
        print(f"  -> {sub_grid_path} (chunks appended)")
    else:
        # 共通グリッドを使うパーツが split を要求した場合は専用 grid.json を作る
        sub_grid_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.grid.json")
        with open(sub_grid_path, 'w') as f:
            json.dump({
                'voxel_size': VOX_SIZE,
                'grid_origin': [float(ORIGIN.x), float(ORIGIN.y), float(ORIGIN.z)],
                'gx': GX, 'gy': GY, 'gz': GZ,
                'chunks': chunks_meta,
                'split_axis': split_axis_name,
            }, f, indent=1)
        print(f"  -> {sub_grid_path} (split grid)")

# ========================================================================
# weights.json 書き出し
# ========================================================================
# voxel_order と同じ順で weights を並べる
weights_array = [result_weights.get(p, []) for p in voxel_order]

# bone 名を使うインデックスだけに絞って出力 (ファイル小さく)
used_bone_indices = set()
for wl in weights_array:
    for bi, _ in wl:
        used_bone_indices.add(bi)
used_bone_indices = sorted(used_bone_indices)
# local remap: used_bone_indices[i] = skel_bone_idx
# weights 出力時は local idx で書く
skel_to_local = {bi: i for i, bi in enumerate(used_bone_indices)}
local_bone_names = [skel_bone_names[bi] for bi in used_bone_indices]

weights_compact = []
for wl in weights_array:
    weights_compact.append([[skel_to_local[bi], w] for bi, w in wl])

weights_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.weights.json")
weights_obj = {
    'mesh': target.name,
    'bones': local_bone_names,           # local bone 名 (上位4本に登場するもの)
    'voxel_count': len(voxel_order),
    'weights': weights_compact,           # voxel と同じ順、[[local_bi, w], ...]
}
with open(weights_path, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {weights_path} ({len(local_bone_names)} unique bones)")

# ボーン weight 分布統計
bone_total = {}
for wl in weights_compact:
    for bi, w in wl:
        bone_total[local_bone_names[bi]] = bone_total.get(local_bone_names[bi], 0) + w
print(f"\n  Top bones by voxel weight-sum:")
for bn, bw in sorted(bone_total.items(), key=lambda x: -x[1])[:10]:
    print(f"    {bn}: {bw:.1f}")

bm.free(); eo.to_mesh_clear()
print(f"\n  Done in {time.time()-t0:.1f}s")
