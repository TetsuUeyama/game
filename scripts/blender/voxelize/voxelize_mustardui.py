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
MULTI_SAMPLE = 1          # Pass 1 で voxel セル内をサンプリングする点数。
                          #   1 = セル中心 1 点 (既存動作)
                          #   8 = 2x2x2 セル内サブサンプル
                          #   27 = 3x3x3 サブサンプル (内股/薄物/サンダル strap 等の漏れ対策)
                          # サンプル数増えるとフィット精度↑、処理時間 N 倍。
ARMATURE_NAME = None  # 指定時: そのアーマチュアを使う。未指定: deform bone 数が最多のもの。
INTERNAL_VG_PATTERNS = []  # 内蔵パーツ判定用 vertex group パターン (fnmatch glob 対応)
INTERNAL_THRESHOLD = 0.3   # 内蔵 vg 合計 weight がこの値超なら voxel を「内蔵」とマーク
# 「別パーツ用 material」(eyes/cornea 等)の voxel 近傍にある「skin material」voxel を削除する radius
# 顔表面の目絵柄を消して、別パーツ (Eyes 球体) のみを表示するため
SKIP_OVERLAY_RADIUS = 0    # 0 = 機能無効、>0 で球状半径 N voxel
SKIP_OVERLAY_NEAR = []     # skip 基準とする material 名のリスト (--skip-overlay-near で指定)
SKIP_OVERLAY_FROM = []     # 削除対象の material 名のリスト (--skip-overlay-from で指定)
# MustardUI エフェクトベイク: (slot_name, material_name, image_name) のリスト
# 該当 material の voxel UV から image を sample → <prefix>.<slot>.json 出力
EFFECT_BAKES = []
# 「素」BaseColor の override (mat node_tree に素 BaseColor が存在しない or 名前が無名 'Map #N' の場合)
# {material_name: image_name}
BASE_IMAGE_OVERRIDES = {}
# Material 単位で固定色を上書き (texture を完全 bypass、フラット 1色)
# 例: --mat-color "Anna Hair Classic:#3a2418" 等。Hair のように shader 内部で
# 色を生成する material（_C texture が無い）に対して使う。
# {material_name: (r, g, b)}  (0-255)
MAT_COLOR_OVERRIDES = {}
# Body voxel cell から差し引く outfit .vox ファイルパスのリスト。
# 衣装が body 表面にかぶせる方式 (overlay) で body を carve out する。
# 例: body voxelize 時に --subtract-vox blackmottled_top.vox を指定すると、
# Top voxel が占有する cell の body voxel が削除される。
# 衣装 voxel (overlay) と body voxel が重なる領域で z-fight / 露出を防ぐ。
SUBTRACT_VOX_PATHS = []
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
    if a == '--multi-sample' and i + 1 < len(args):
        MULTI_SAMPLE = int(args[i + 1])
        if MULTI_SAMPLE not in (1, 8, 27):
            print(f"ERROR: --multi-sample must be 1, 8, or 27 (got {MULTI_SAMPLE})"); sys.exit(1)
        i += 2; continue
    if a == '--armature' and i + 1 < len(args):
        ARMATURE_NAME = args[i + 1]; i += 2; continue
    if a == '--internal-vg' and i + 1 < len(args):
        # 内蔵パーツ判定用 vertex group パターン (カンマ区切り、fnmatch glob 対応)
        # 例: c_lips_*,c_teeth_*,c_jawbone.x,jawbone.x,tongue
        INTERNAL_VG_PATTERNS.extend([s.strip() for s in args[i + 1].split(',') if s.strip()])
        i += 2; continue
    if a == '--internal-threshold' and i + 1 < len(args):
        INTERNAL_THRESHOLD = float(args[i + 1]); i += 2; continue
    if a == '--effect-bake' and i + 3 < len(args):
        # (slot_name, material_name, image_name)
        EFFECT_BAKES.append((args[i + 1], args[i + 2], args[i + 3]))
        i += 4; continue
    if a == '--base-image-override' and i + 2 < len(args):
        # 素の BaseColor 用 image を明示指定 (find_texture_for_mat で score 比較を bypass)
        BASE_IMAGE_OVERRIDES[args[i + 1]] = args[i + 2]
        i += 3; continue
    if a == '--subtract-vox' and i + 1 < len(args):
        SUBTRACT_VOX_PATHS.append(args[i + 1]); i += 2; continue
    if a == '--mat-color' and i + 1 < len(args):
        # "Material Name:#RRGGBB" を parse して MAT_COLOR_OVERRIDES に登録
        spec = args[i + 1]
        if ':' in spec:
            mname, hexcol = spec.rsplit(':', 1)
            hexcol = hexcol.lstrip('#').strip()
            if len(hexcol) == 6:
                try:
                    r_ = int(hexcol[0:2], 16); g_ = int(hexcol[2:4], 16); b_ = int(hexcol[4:6], 16)
                    MAT_COLOR_OVERRIDES[mname.strip()] = (r_, g_, b_)
                except ValueError:
                    print(f"  WARN: --mat-color invalid hex: {spec}")
            else:
                print(f"  WARN: --mat-color hex must be 6 chars: {spec}")
        else:
            print(f"  WARN: --mat-color syntax: 'Material Name:#RRGGBB', got: {spec}")
        i += 2; continue
    if a == '--skip-overlay-near' and i + 1 < len(args):
        # 「別パーツ」基準 material (例: DarkElfBlader_Eyes) — この voxel の近傍が削除対象
        SKIP_OVERLAY_NEAR.extend([s.strip() for s in args[i + 1].split(',') if s.strip()])
        i += 2; continue
    if a == '--skip-overlay-from' and i + 1 < len(args):
        # 削除対象 material (例: DarkElfBlader_Head,DarkElfBlader_Body) — 顔表面の絵柄 voxel
        SKIP_OVERLAY_FROM.extend([s.strip() for s in args[i + 1].split(',') if s.strip()])
        i += 2; continue
    if a == '--skip-overlay-radius' and i + 1 < len(args):
        SKIP_OVERLAY_RADIUS = int(args[i + 1])
        i += 2; continue
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
    if MULTI_SAMPLE > 1:
        print(f"  multi-sample: {MULTI_SAMPLE} points per voxel (anti-leak for thin/tight clothing)")

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

# Force-reload any unloaded images so texture sampling can read pixels.
# Rachel/DAZ blend files often reference external textures whose path isn't
# resolved on background launch; without reload, image.pixels[] returns black.
# Also try resolving by basename in sibling directories (handles moved/renamed
# texture folders, e.g. textures -> textures2.0_4mSURGu/textures).
import os as _os

def _build_search_paths():
    paths = []
    if bpy.data.filepath:
        blend_dir = _os.path.dirname(bpy.data.filepath)
        paths += [blend_dir, _os.path.join(blend_dir, 'textures')]
        try:
            for d in _os.listdir(blend_dir):
                full = _os.path.join(blend_dir, d)
                if _os.path.isdir(full):
                    paths.append(full)
                    tex = _os.path.join(full, 'textures')
                    if _os.path.isdir(tex):
                        paths.append(tex)
        except Exception:
            pass
    return paths

_search_paths = _build_search_paths()
_reloaded = 0
_resolved_by_search = 0
for _img in bpy.data.images:
    try:
        if _img.size[0] == 0 or _img.size[1] == 0:
            _img.reload()
            if _img.size[0] > 0 and _img.size[1] > 0:
                _reloaded += 1
                continue
        else:
            continue
        # still missing — try to resolve by basename
        if _img.filepath and _search_paths:
            _fp = _img.filepath.replace('\\', '/').lstrip('/')  # strip Blender '//' prefix
            base = _os.path.basename(_fp)
            if base:
                for sp in _search_paths:
                    cand = _os.path.join(sp, base)
                    if _os.path.isfile(cand):
                        _img.filepath = cand
                        try:
                            _img.reload()
                            if _img.size[0] > 0 and _img.size[1] > 0:
                                _resolved_by_search += 1
                                break
                        except Exception:
                            pass
    except Exception:
        pass
_missing = sum(1 for _img in bpy.data.images if _img.size[0] == 0 or _img.size[1] == 0)
print(f"  Image resolve: reloaded={_reloaded}, by_search={_resolved_by_search}, still_missing={_missing}")
print(f"  Search paths ({len(_search_paths)}):")
for sp in _search_paths:
    print(f"    {sp}")

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

# ========================================================================
# MustardUI Body エフェクトを全て 0 に強制
# (Cracked が non-zero だと Body/Head BaseColor が石化テクスチャに切り替わる等
# 動的色変化が発生し、ベース color の voxel ベイクに混入する。
# voxel 化はクリーンな base 状態で行う。)
# ========================================================================
_arm_data = bpy.data.armatures.get('rig')
if _arm_data is None:
    # rig が見つからない場合は最初の armature data
    if len(bpy.data.armatures) > 0:
        _arm_data = next(iter(bpy.data.armatures))
if _arm_data is not None:
    # 完全一致リセット対象 (QM スタイル: シンプル名)
    _EXACT_RESET = {'Tatoos', 'Tattoos', 'Cracked', 'Wet', 'Emission', '放射', 'Blush'}
    # プレフィックス一致リセット対象 (DarkElfBlader 等: MustardUI プレフィックス付き)
    # 'MustardUI ' (末尾スペース) で始まる人間読みやすい key を全部 0 リセット
    # ('MustardUI_CustomProperties' などのアンダースコア系設定 dict は除外)
    _PREFIX_RESET = ('MustardUI ',)
    for _effect_key in list(_arm_data.keys()):
        _matches = (_effect_key in _EXACT_RESET) or any(_effect_key.startswith(p) for p in _PREFIX_RESET)
        if not _matches:
            continue
        try:
            _old = _arm_data[_effect_key]
            # 数値 (int/float) のみ 0 リセット (Texture Number 等の整数 enum も 0 にすると Default 崩れる可能性あるが、
            # ベース色変化を防ぐ目的で一旦リセット。期待動作と異なる場合は voxel 後に手動戻す。)
            if isinstance(_old, (int, float)):
                _arm_data[_effect_key] = type(_old)(0)
                print(f"  Reset MustardUI effect: {_effect_key}: {_old} -> 0")
        except Exception as _e:
            print(f"  Failed to reset {_effect_key}: {_e}")
    # ドライバ更新を反映 (シェーダー側に伝搬)
    bpy.context.view_layer.update()

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
    # Colorspace 補正:
    # - Non-Color: image.pixels[:] が生値 (典型的に既に sRGB エンコード済) を返す → そのまま 0-255 化
    # - sRGB:     image.pixels[:] が linear 値を返す → sRGB エンコードして表示用にする
    cs = image.colorspace_settings.name
    is_srgb = cs == 'sRGB'
    rgb = bytearray(n * 3)
    if is_srgb:
        # linear -> sRGB encoding (IEC 61966-2-1)
        def to_srgb(x):
            if x <= 0.0031308: return 12.92 * x
            return 1.055 * (x ** (1.0 / 2.4)) - 0.055
        for i in range(n):
            si = i * 4
            rgb[i*3]   = max(0, min(255, int(to_srgb(raw[si]) * 255)))
            rgb[i*3+1] = max(0, min(255, int(to_srgb(raw[si+1]) * 255)))
            rgb[i*3+2] = max(0, min(255, int(to_srgb(raw[si+2]) * 255)))
    else:
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

# === Effect texture cache (RGBA、tatoo の alpha マスクなどを保持) ===
effect_texture_cache = {}  # image_name → (w, h, rgba bytes)

def cache_effect_texture(img_name):
    """指定名の image を RGBA888 でキャッシュ。完全一致 → 部分一致 → fnmatch の順で検索"""
    if img_name in effect_texture_cache: return True
    img = bpy.data.images.get(img_name)
    if img is None:
        for i_ in bpy.data.images:
            if i_.name == img_name or i_.name.startswith(img_name) or img_name.startswith(i_.name):
                img = i_; break
    if img is None: return False
    w, h = img.size
    if w == 0 or h == 0: return False
    raw = img.pixels[:]
    n = w * h
    rgba = bytearray(n * 4)
    for i_ in range(n):
        si = i_ * 4
        rgba[i_*4]   = max(0, min(255, int(raw[si] * 255)))
        rgba[i_*4+1] = max(0, min(255, int(raw[si+1] * 255)))
        rgba[i_*4+2] = max(0, min(255, int(raw[si+2] * 255)))
        rgba[i_*4+3] = max(0, min(255, int(raw[si+3] * 255)))
    effect_texture_cache[img_name] = (w, h, bytes(rgba))
    return True

def sample_effect_texture(img_name, u, v):
    if img_name not in effect_texture_cache: return None
    w, h, pix = effect_texture_cache[img_name]
    px = int(u * w) % w; py = int(v * h) % h
    pi = (py * w + px) * 4
    if pi + 3 < len(pix):
        return (pix[pi], pix[pi+1], pix[pi+2], pix[pi+3])
    return None

def score_image(name):
    n = name.lower()
    score = 0
    import re
    # 拡張子を除去した base 文字列 (suffix 末尾判定用、トレイリング .001 等 dup 番号も除く)
    base = re.sub(r'\.\d{3,}$', '', n)
    base = re.sub(r'\.(tga|png|jpg|jpeg|bmp|exr|hdr)$', '', base)
    # DAZ G8F 命名規則: G8FBase<Part>MapD_<num> = Diffuse、MapB = Bump、MapS = Specular、MapN = Normal
    if 'basecolor' in n or 'base_color' in n or 'diffuse' in n or 'mapd_' in n or 'map_d_' in n:
        score = 10
    elif 'albedo' in n or '_alb' in n or 'alb_' in n:
        score = 8
    # Tekken/UE 命名規則: <name>_C = Color (= BaseColor). 単独 _c suffix を Color として認識。
    elif base.endswith('_c'):
        score = 10
    # DAZ Studio character preset 命名規則: <name>_D = Diffuse (Sydney/Eva/Hinata/Luminus 等)
    elif base.endswith('_d'):
        score = 10
    # Pharah 系のドット区切り命名規則: <name>.D = Diffuse
    elif base.endswith('.d'):
        score = 10
    # Tekken/UE penalty: _RMA = Roughness/Metallic/AO、_OBD = Object Bake Detail、
    # _TSE = Tessellation/Surface Edge、_AN = Normal、_ID = ID mask、_N = Normal
    # _ADI = Anisotropic/Direction Information (hair shader 用、色ではない)
    # _R = Roughness 単独 (Tekken hair texture で散見)
    if any(base.endswith(suf) for suf in ['_rma', '_obd', '_tse', '_an', '_id', '_emi', '_msk',
                                            '_adi', '_r']):
        return -10
    if any(k in n for k in ['normal','roughness','metallic','specular','opacity','alpha','sss','ao','ambient',
                              'mapb_','map_b_','mapn_','map_n_','maps_','map_s_',
                              'nrm','_nm','normalmap','norm.','_rough','_spec','_metal','_ao',
                              'displ','height','occlusion','emissive_only','bumpmap',
                              'nmh','_rfr','refraction','reflection']):
        return -10
    # DAZ Studio 末尾 suffix: <base>n / <base>s / <base>tr (normal/specular/transparency)
    # 例: Hair_01n / Hair03n / Ribbon01_Tr → diffuse じゃない
    if base.endswith('n') and len(base) > 2 and (base[-2].isdigit() or base[-2] == '_'):
        return -10  # *_n / *0n / *1n etc → normal
    if base.endswith('s') and len(base) > 2 and (base[-2].isdigit() or base[-2] == '_'):
        return -10  # *_s / *0s etc → specular
    if base.endswith('tr') and len(base) > 3 and (base[-3].isdigit() or base[-3] == '_'):
        return -10  # *_tr / *0tr etc → transparency
    # Pharah 系ドット区切り: <name>.B (Bump) / .N (Normal) / .R (Roughness) / .S (Specular) / .TR (Transparency) / .A (Alpha)
    if any(base.endswith(suf) for suf in ['.b', '.n', '.r', '.s', '.tr', '.a', '.nrm', '.rgh', '.spec']):
        return -10
    # MustardUI バリアントテクスチャ (Tattoo/Stone/Blush/Wet/Cracked/Emissive/SkinVariant/ColorVariant 等)
    # を penalize → 「素」の BaseColor を優先選択
    if any(k in n for k in [
        # MustardUI エフェクト系
        'tattoo', 'tatoo', 'stone', 'cracked', 'wet', 'wetter',
        'blush', 'emission', 'emissive',
        # 色 variant 系 (Skin Color / Eyes Color / Hair Color / Suit Color 等)
        '_red', '_white', '_blue', '_dark', '_crimson', '_azure', '_turquoise',
        '_royal', '_lightskin', '_darkskin', '_pink', '_green', '_yellow',
    ]):
        score -= 6
    return score

def find_texture_for_mat(mat):
    if not mat: return None
    # Override: 明示指定の image があればそれを返す (score 比較 bypass)
    if mat.name in BASE_IMAGE_OVERRIDES:
        target = BASE_IMAGE_OVERRIDES[mat.name]
        # node_tree 内を検索 (完全一致 → 部分一致)
        if hasattr(mat, 'node_tree') and mat.node_tree:
            for nd in mat.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image and nd.image.name == target:
                    return nd.image
            for nd in mat.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image and (nd.image.name.startswith(target) or target in nd.image.name):
                    return nd.image
        # bpy.data.images 全体で検索
        img = bpy.data.images.get(target)
        if img: return img
        for img in bpy.data.images:
            if img.name == target or img.name.startswith(target) or target in img.name:
                return img
        print(f"  WARN: --base-image-override target {target!r} not found for mat {mat.name!r}")
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
    # --mat-color 指定があれば最優先 (texture を完全 bypass)
    if mat.name in MAT_COLOR_OVERRIDES:
        info['color'] = MAT_COLOR_OVERRIDES[mat.name]
        info['image'] = None
        mat_info[mat.name] = info
        print(f"    Mat '{mat.name}': flat-rgb{info['color']} (--mat-color override)")
        continue
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

# ---- 内蔵パーツ vertex group の解決 (fnmatch glob 対応) ----
import fnmatch
internal_vg_idxs = set()
internal_vg_matched_names = []
if INTERNAL_VG_PATTERNS:
    for vgi, vgn in enumerate(vg_names):
        for pat in INTERNAL_VG_PATTERNS:
            if fnmatch.fnmatch(vgn, pat) or fnmatch.fnmatch(vgn.lower(), pat.lower()):
                internal_vg_idxs.add(vgi)
                internal_vg_matched_names.append(vgn)
                break
    print(f"  Internal VG patterns: {INTERNAL_VG_PATTERNS}")
    print(f"  Internal VG matched: {len(internal_vg_idxs)}")
    if internal_vg_matched_names and len(internal_vg_matched_names) <= 30:
        for n in internal_vg_matched_names:
            print(f"    {n}")
    print(f"  Internal threshold: {INTERNAL_THRESHOLD}")

# ---- Effect texture pre-cache ----
if EFFECT_BAKES:
    print(f"  Effect bakes:")
    for slot_name, mat_match, img_name in EFFECT_BAKES:
        ok = cache_effect_texture(img_name)
        print(f"    [{slot_name}] mat={mat_match!r} image={img_name!r} cached={ok}")

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
result_internal = {} # (x,y,z) -> True if 内蔵 vg weight 合計 > INTERNAL_THRESHOLD
result_material = {} # (x,y,z) -> material name (overlay skip 用に各 voxel の所属 material を記録)
# Effect samples: result_effects[slot_name][(x,y,z)] = (r,g,b,a)
result_effects = {slot: {} for slot, _, _ in EFFECT_BAKES}

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
        return None, None, None, None, None
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
    # 色 + UV
    color = None
    mat_idx = face.material_index
    mat_name = None
    if mat_idx < len(target.data.materials) and target.data.materials[mat_idx]:
        mat_name = target.data.materials[mat_idx].name
    mi = mat_info.get(mat_name, {})
    # UV を常時計算 (effect bake で必要、color sampling でも使う)
    uu, vv, have_uv = 0.0, 0.0, False
    if uv_layer:
        uv0 = loops[0][uv_layer].uv
        uv1 = loops[1][uv_layer].uv
        uv2 = loops[2][uv_layer].uv
        uu = w * uv0.x + u * uv1.x + v * uv2.x
        vv = w * uv0.y + u * uv1.y + v * uv2.y
        have_uv = True
    if mi.get('image') and have_uv:
        c = sample_texture(mi['image'], uu, vv)
        if c is not None:
            color = c
    if color is None:
        color = mi.get('color', (180, 180, 180))
    # Effect bake samples (該当 material のみサンプル、結果は (slot, rgba))
    # alpha == 0 の sample は記録しない (Blush 等で頬以外の voxel に重畳しないように)
    effect_samples = []
    if EFFECT_BAKES and have_uv:
        for slot_name, mat_match, img_name in EFFECT_BAKES:
            if mat_name == mat_match:
                ec = sample_effect_texture(img_name, uu, vv)
                if ec is not None and ec[3] > 0:
                    effect_samples.append((slot_name, ec))

    # Weights: 3 頂点から barycentric 合成
    accum = {}  # bone_idx -> weight
    internal_w = 0.0  # 内蔵 vg weight 合計
    verts_bary = [(loops[0].vert.index, w), (loops[1].vert.index, u), (loops[2].vert.index, v)]
    for vi, bw in verts_bary:
        if vi >= len(vert_weights_src):
            continue
        vw = vert_weights_src[vi]
        for vg_idx, gw in vw.items():
            bi = vg_idx_to_bone_idx.get(vg_idx)
            if bi is not None:
                accum[bi] = accum.get(bi, 0.0) + bw * gw
            if vg_idx in internal_vg_idxs:
                internal_w += bw * gw
    # 上位 4 個 + 正規化
    items = sorted(accum.items(), key=lambda x: -x[1])[:4]
    total = sum(w for _, w in items)
    if total > 0:
        weights = [[bi, round(w / total, 4)] for bi, w in items]
    else:
        weights = []
    return color, weights, internal_w, effect_samples, mat_name

# Pass 1: surface voxels (BVH.find_nearest)
# multi_sample=1: voxel セル中心 1 点のみ (既存動作)
# multi_sample=8: 2x2x2 オフセット (±0.25 × VOX_SIZE) を試す (薄物/密着の漏れ対策)
# multi_sample=27: 3x3x3 オフセット (-1/3, 0, +1/3 × VOX_SIZE) を試す
if MULTI_SAMPLE == 1:
    sample_offsets = [(0.0, 0.0, 0.0)]
elif MULTI_SAMPLE == 8:
    sample_offsets = [(dx, dy, dz)
                      for dx in (-0.25, 0.25)
                      for dy in (-0.25, 0.25)
                      for dz in (-0.25, 0.25)]
else:  # 27
    sample_offsets = [(dx, dy, dz)
                      for dx in (-1/3, 0.0, 1/3)
                      for dy in (-1/3, 0.0, 1/3)
                      for dz in (-1/3, 0.0, 1/3)]

print(f"  Pass 1: surface sampling (threshold = {SURFACE_THRESHOLD} × voxel_size, "
      f"{MULTI_SAMPLE} sample{'s' if MULTI_SAMPLE > 1 else ''}/voxel)...")
t_p1 = time.time()
surf_count = 0
surf_radius = VOX_SIZE * SURFACE_THRESHOLD
for ix in range(GX):
    for iy in range(GY):
        for iz in range(GZ):
            c = voxel_center(ix, iy, iz)
            # multi_sample: いずれかのサンプル点が surface 近傍にあれば voxel ON
            hit_pt = None
            for ox, oy, oz in sample_offsets:
                p = Vector((c.x + ox * VOX_SIZE,
                            c.y + oy * VOX_SIZE,
                            c.z + oz * VOX_SIZE))
                loc, _, _, _ = bvh.find_nearest(p, surf_radius)
                if loc is not None:
                    hit_pt = c  # 色/weight はセル中心基準で計算 (一貫性のため)
                    break
            if hit_pt is None: continue
            color, weights, internal_w, effect_samples, mat_name_v = compute_color_weight_at(hit_pt)
            if color is None: continue
            result_voxels[(ix, iy, iz)] = color
            result_weights[(ix, iy, iz)] = weights
            result_material[(ix, iy, iz)] = mat_name_v
            if internal_w > INTERNAL_THRESHOLD:
                result_internal[(ix, iy, iz)] = True
            for slot_name, ec in effect_samples:
                result_effects[slot_name][(ix, iy, iz)] = ec
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
                    color, weights, internal_w, effect_samples, mat_name_v = compute_color_weight_at(c)
                    if color is None: continue
                    result_voxels[(ix, iy, iz)] = color
                    result_weights[(ix, iy, iz)] = weights
                    result_material[(ix, iy, iz)] = mat_name_v
                    if internal_w > INTERNAL_THRESHOLD:
                        result_internal[(ix, iy, iz)] = True
                    for slot_name, ec in effect_samples:
                        result_effects[slot_name][(ix, iy, iz)] = ec
                    interior_count += 1
        if ix % 20 == 0:
            print(f"    column {ix}/{GX} interior so far: {interior_count}")
    print(f"    interior: {interior_count} voxels ({time.time()-t_p2:.1f}s)")

# ========================================================================
# Skip overlay: 「別パーツ用 material」(eyes 等) voxel の近傍にある「skin material」voxel を削除
# 用途: 顔表面に描かれた目絵柄を削除して、別途 Eyes mesh / 球体 voxel のみで表現する
# ========================================================================
if SKIP_OVERLAY_RADIUS > 0 and SKIP_OVERLAY_NEAR and SKIP_OVERLAY_FROM:
    print(f"\n  Skip overlay: removing voxels of {SKIP_OVERLAY_FROM} near {SKIP_OVERLAY_NEAR} (radius={SKIP_OVERLAY_RADIUS})")
    near_set = set(SKIP_OVERLAY_NEAR)
    from_set = set(SKIP_OVERLAY_FROM)
    # near material の voxel 座標を集める
    seed_voxels = [k for k, m in result_material.items() if m in near_set]
    print(f"    seeds (near material): {len(seed_voxels)} voxels")
    # 球状近傍 offset を計算
    r = SKIP_OVERLAY_RADIUS
    r2 = r * r
    offsets = []
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            for dz in range(-r, r + 1):
                if dx*dx + dy*dy + dz*dz <= r2:
                    offsets.append((dx, dy, dz))
    # seed 周辺の from material voxel を削除候補に
    to_remove = set()
    for (sx, sy, sz) in seed_voxels:
        for (dx, dy, dz) in offsets:
            cand = (sx + dx, sy + dy, sz + dz)
            if cand in result_voxels and result_material.get(cand) in from_set:
                to_remove.add(cand)
    print(f"    removing {len(to_remove)} overlay voxels")
    for k in to_remove:
        del result_voxels[k]
        if k in result_weights: del result_weights[k]
        if k in result_internal: del result_internal[k]
        if k in result_material: del result_material[k]
        for d in result_effects.values():
            d.pop(k, None)

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
            if k in result_internal:
                del result_internal[k]
            if k in result_material:
                del result_material[k]
            for slot_dict in result_effects.values():
                if k in slot_dict:
                    del slot_dict[k]
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

# --subtract-vox: 指定された .vox ファイルが占有する cell を vlist から除外。
# 衣装 overlay 方式で body 表面の z-fight / 露出を防ぐ。
if SUBTRACT_VOX_PATHS:
    def _read_vox_cells(path):
        """.vox ファイルから (x, y, z) cell 集合を読む (XYZI チャンクのみ)"""
        cells = set()
        try:
            with open(path, 'rb') as f:
                data = f.read()
        except IOError:
            print(f"  WARN: subtract-vox not found: {path}")
            return cells
        if not data.startswith(b'VOX '):
            print(f"  WARN: not a .vox file: {path}")
            return cells
        # MAIN chunk header (8 bytes magic+version) skip
        i_ = 8
        while i_ < len(data) - 8:
            tag = data[i_:i_+4]
            size = struct.unpack('<I', data[i_+4:i_+8])[0]
            children_size = struct.unpack('<I', data[i_+8:i_+12])[0]
            i_ += 12
            if tag == b'XYZI':
                n = struct.unpack('<I', data[i_:i_+4])[0]
                p = i_ + 4
                for _k in range(n):
                    if p + 4 > len(data): break
                    x = data[p]; y = data[p+1]; z = data[p+2]
                    cells.add((x, y, z))
                    p += 4
                i_ += size
            else:
                i_ += size
            i_ += 0  # children handled in nested calls — but vox files are flat enough
        return cells

    subtract_set = set()
    for sp in SUBTRACT_VOX_PATHS:
        s = _read_vox_cells(sp)
        subtract_set.update(s)
        print(f"  --subtract-vox {os.path.basename(sp)}: {len(s)} cells")
    if subtract_set:
        before_n = len(vlist)
        vlist = [v for v in vlist if (v[0], v[1], v[2]) not in subtract_set]
        print(f"  subtracted {before_n - len(vlist)} body cells covered by outfits "
              f"({len(vlist)} remaining)")

def write_vox(path, sx, sy, sz, voxels, pal):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    # XYZI: O(n) join instead of O(n²) bytes concat
    xd_parts = [struct.pack('<I', len(voxels))]
    for v in voxels:
        xd_parts.append(struct.pack('<BBBB', v[0], v[1], v[2], v[3]))
    xd = b''.join(xd_parts)
    # RGBA palette
    rd_parts = []
    for i in range(256):
        if i < len(pal):
            rd_parts.append(struct.pack('<BBBB', pal[i][0], pal[i][1], pal[i][2], 255))
        else:
            rd_parts.append(struct.pack('<BBBB', 0, 0, 0, 255))
    rd = b''.join(rd_parts)
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
    # Multi-axis split: 256超の全軸で分割（vox フォーマットは座標 1byte なので各軸 ≤256）
    nx_chunks = (GX + VOX_MAX - 1) // VOX_MAX
    ny_chunks = (GY + VOX_MAX - 1) // VOX_MAX
    nz_chunks = (GZ + VOX_MAX - 1) // VOX_MAX
    total_chunks = nx_chunks * ny_chunks * nz_chunks
    print(f"  [split] x={nx_chunks} y={ny_chunks} z={nz_chunks} → {total_chunks} total chunks")

    # 各 voxel を 3D chunk index にバケット化
    buckets = {}  # (cx, cy, cz) -> list of voxels (local coords + color idx)
    for v in vlist:  # (x, y, z, ci)
        cx = v[0] // VOX_MAX
        cy = v[1] // VOX_MAX
        cz = v[2] // VOX_MAX
        local = (
            v[0] - cx * VOX_MAX,
            v[1] - cy * VOX_MAX,
            v[2] - cz * VOX_MAX,
            v[3],
        )
        buckets.setdefault((cx, cy, cz), []).append(local)

    chunks_meta = []
    chunk_idx = 0
    for cz in range(nz_chunks):
        for cy in range(ny_chunks):
            for cx in range(nx_chunks):
                key = (cx, cy, cz)
                if key not in buckets:
                    continue
                voxels = buckets[key]
                local_gx = min(VOX_MAX, GX - cx * VOX_MAX)
                local_gy = min(VOX_MAX, GY - cy * VOX_MAX)
                local_gz = min(VOX_MAX, GZ - cz * VOX_MAX)
                chunk_idx += 1
                chunk_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}_c{chunk_idx}.vox")
                write_vox(chunk_path, local_gx, local_gy, local_gz, voxels, colors_list)
                co = [
                    float(ORIGIN.x) + cx * VOX_MAX * VOX_SIZE,
                    float(ORIGIN.y) + cy * VOX_MAX * VOX_SIZE,
                    float(ORIGIN.z) + cz * VOX_MAX * VOX_SIZE,
                ]
                chunks_meta.append({
                    'vox_file': os.path.basename(chunk_path),
                    'grid_origin': co,
                    'gx': local_gx, 'gy': local_gy, 'gz': local_gz,
                    'voxel_count': len(voxels),
                })
                print(f"  -> {chunk_path} ({local_gx}x{local_gy}x{local_gz}, {len(voxels)} voxels)")

    # .grid.json に chunks 配列を追加
    sub_grid_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.grid.json")
    if SCALE_FACTOR > 1:
        # 既存の sub-grid.json を読み込んで chunks を追記
        with open(sub_grid_path) as f:
            gd = json.load(f)
        gd['chunks'] = chunks_meta
        gd['split_axes'] = {'nx': nx_chunks, 'ny': ny_chunks, 'nz': nz_chunks}
        with open(sub_grid_path, 'w') as f:
            json.dump(gd, f, indent=1)
        print(f"  -> {sub_grid_path} (chunks appended, multi-axis)")
    else:
        # 共通グリッドを使うパーツが split を要求した場合は専用 grid.json を作る
        with open(sub_grid_path, 'w') as f:
            json.dump({
                'voxel_size': VOX_SIZE,
                'grid_origin': [float(ORIGIN.x), float(ORIGIN.y), float(ORIGIN.z)],
                'gx': GX, 'gy': GY, 'gz': GZ,
                'chunks': chunks_meta,
                'split_axes': {'nx': nx_chunks, 'ny': ny_chunks, 'nz': nz_chunks},
            }, f, indent=1)
        print(f"  -> {sub_grid_path} (split grid, multi-axis)")

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

# ========================================================================
# internal_voxels.json 書き出し (内蔵パーツ判定: 口腔内など)
# voxel_order と同じ順で internal フラグの voxel index を sparse 出力
# 表示側の flood fill で「内蔵 voxel に隣接する empty cell を exterior 扱い」
# として使い、閉じた口腔内の voxel face を可視化する。
# ========================================================================
if INTERNAL_VG_PATTERNS:
    # サブグリッド (full unsplit) 座標で出力。viewer は chunks の voxel idx + chunk_origin_offset
    # で sub-grid index を計算し、この list と照合する。
    internal_coords = [list(k) for k in result_internal.keys() if k in result_voxels]
    internal_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.internal_voxels.json")
    internal_obj = {
        'voxel_size': VOX_SIZE,
        'grid_origin': [float(ORIGIN.x), float(ORIGIN.y), float(ORIGIN.z)],
        'gx': GX, 'gy': GY, 'gz': GZ,
        'internal_vg_patterns': INTERNAL_VG_PATTERNS,
        'internal_vg_matched': internal_vg_matched_names,
        'threshold': INTERNAL_THRESHOLD,
        'voxel_count': len(voxel_order),
        'internal_count': len(internal_coords),
        # サブグリッド (full) 座標 [ix, iy, iz]
        'internal_voxels': internal_coords,
    }
    with open(internal_path, 'w', encoding='utf-8') as f:
        json.dump(internal_obj, f, ensure_ascii=False, indent=0)
    print(f"  -> {internal_path} ({len(internal_coords)} internal voxels / {len(voxel_order)} total)")

# ========================================================================
# Effect bake 出力 (per slot)
# 各 slot の per-voxel rgba を sub-grid 座標で sparse 保存
# 表示側は <prefix>.<slot>.json を fetch → voxel coord と照合 → 頂点色 lerp
# ========================================================================
if EFFECT_BAKES:
    for slot_name, mat_match, img_name in EFFECT_BAKES:
        slot_dict = result_effects.get(slot_name, {})
        # sub-grid (full unsplit) 座標 + rgba
        samples = [[k[0], k[1], k[2], v[0], v[1], v[2], v[3]] for k, v in slot_dict.items() if k in result_voxels]
        out_path = os.path.join(OUT_DIR, f"{OUT_PREFIX}.{slot_name}.json")
        out_obj = {
            'voxel_size': VOX_SIZE,
            'grid_origin': [float(ORIGIN.x), float(ORIGIN.y), float(ORIGIN.z)],
            'gx': GX, 'gy': GY, 'gz': GZ,
            'slot_name': slot_name,
            'material': mat_match,
            'image': img_name,
            'voxel_count': len(voxel_order),
            'sample_count': len(samples),
            # サブグリッド座標 + RGBA (各 0-255): [ix, iy, iz, r, g, b, a]
            'samples': samples,
        }
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(out_obj, f, ensure_ascii=False, indent=0)
        print(f"  -> {out_path} ({len(samples)} samples / {len(voxel_order)} total voxels)")

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
