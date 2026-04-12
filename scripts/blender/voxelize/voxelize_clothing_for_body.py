"""衣装メッシュをターゲットBody体型にフィットさせてボクセル化するスクリプト。

表面オフセット + BVHスナップ方式に、ボディ部位フィルタを追加。
--regions で衣装の適用部位を指定し、不要な部位への誤マッピングを防止。

部位名:
  head       : 頭部 (90%以上)
  neck       : 首 (85-90%)
  torso      : 胴体上部 (60-85%)
  waist      : 腰 (50-60%)
  arms       : 腕 (胴体横のクラスタ)
  hands      : 手 (腕先端)
  hips       : 臀部 (40-50%)
  upper_legs : 太もも (20-40%)
  lower_legs : すね (8-20%)
  feet       : 足 (8%以下)

Usage:
  blender --background --python voxelize_clothing_for_body.py -- \
    <source.blend> <source_grid.json> <part_name> \
    <target_body.vox> <target_grid.json> <output.vox> \
    [--no-deform] [--regions torso,arms,hips]
"""
import bpy
import bmesh
import sys
import os
import struct
import math
import json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from collections import defaultdict

# ========================================================================
# 引数パース
# ========================================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
NO_DEFORM = '--no-deform' in args

# --regions パース
REGIONS = None
for i, a in enumerate(args):
    if a == '--regions' and i + 1 < len(args):
        REGIONS = set(args[i + 1].split(','))

# --texture-dir パース
TEXTURE_DIRS = []
for i, a in enumerate(args):
    if a == '--texture-dir' and i + 1 < len(args):
        TEXTURE_DIRS.append(args[i + 1])

pos_args = []
skip_next = False
for a in args:
    if skip_next: skip_next = False; continue
    if a in ('--regions', '--body-name', '--texture-dir'): skip_next = True; continue
    if a.startswith('--'): continue
    pos_args.append(a)

SRC_PATH = pos_args[0]
SRC_GRID_JSON = pos_args[1]
PART_NAME = pos_args[2]
TGT_BODY_VOX = pos_args[3]
TGT_GRID_JSON = pos_args[4]
OUT_PATH = pos_args[5]

print(f"\n=== Clothing-for-Body Voxelizer (Region-filtered) ===")
print(f"  Source: {SRC_PATH}")
print(f"  Part: {PART_NAME}")
print(f"  Target body: {TGT_BODY_VOX}")
print(f"  Output: {OUT_PATH}")
print(f"  Regions: {REGIONS or 'ALL (no filter)'}")

# ========================================================================
# グリッド情報
# ========================================================================
with open(SRC_GRID_JSON) as f:
    src_grid = json.load(f)
with open(TGT_GRID_JSON) as f:
    tgt_grid = json.load(f)

src_voxel_size = src_grid['voxel_size']
src_grid_origin = Vector(src_grid['grid_origin'])
src_raw_min = Vector(src_grid.get('raw_min', src_grid.get('bb_min', [0,0,0])))
src_raw_max = Vector(src_grid.get('raw_max', src_grid.get('bb_max', [0,0,0])))
src_center = Vector(src_grid.get('raw_center', [(src_raw_min[i]+src_raw_max[i])/2 for i in range(3)]))
src_height = src_raw_max.z - src_raw_min.z

tgt_voxel_size = tgt_grid['voxel_size']
tgt_grid_origin = Vector(tgt_grid['grid_origin'])
tgt_gx, tgt_gy, tgt_gz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']
tgt_bb_min = Vector(tgt_grid.get('bb_min', tgt_grid.get('raw_min', [0,0,0])))
tgt_bb_max = Vector(tgt_grid.get('bb_max', tgt_grid.get('raw_max', [0,0,0])))
tgt_center_x = (tgt_bb_min.x + tgt_bb_max.x) / 2
tgt_center_y = (tgt_bb_min.y + tgt_bb_max.y) / 2
tgt_height = tgt_bb_max.z - tgt_bb_min.z

print(f"  Source: h={src_height:.4f}, voxel={src_voxel_size:.6f}")
print(f"  Target: {tgt_gx}x{tgt_gy}x{tgt_gz}, h={tgt_height:.4f}, voxel={tgt_voxel_size:.6f}")

# ========================================================================
# VOXパーサー
# ========================================================================
def parse_vox_file(path):
    with open(path, 'rb') as f:
        data = f.read()
    sx = sy = sz = 0; voxels = []
    def parse_chunks(start, end):
        nonlocal sx, sy, sz
        offset = start
        while offset < end:
            if offset + 12 > end: break
            chunk_id = data[offset:offset+4].decode('ascii', errors='replace')
            chunk_size = struct.unpack_from('<I', data, offset+4)[0]
            child_size = struct.unpack_from('<I', data, offset+8)[0]
            cs = offset + 12
            if chunk_id == 'MAIN': parse_chunks(cs + chunk_size, cs + chunk_size + child_size)
            elif chunk_id == 'SIZE': sx, sy, sz = struct.unpack_from('<III', data, cs)
            elif chunk_id == 'XYZI':
                count = struct.unpack_from('<I', data, cs)[0]
                for i in range(count):
                    x, y, z, ci = struct.unpack_from('<BBBB', data, cs + 4 + i*4)
                    voxels.append((x, y, z, ci))
            offset += 12 + chunk_size + child_size
    parse_chunks(8, len(data))
    return voxels, sx, sy, sz

# ========================================================================
# ターゲットBody: 読み込み + 表面 + 部位分類 + プロファイル
# ========================================================================
print("  Loading target body...")
tgt_voxels, tgt_sx, tgt_sy, tgt_sz = parse_vox_file(TGT_BODY_VOX)
tgt_body_set = set()
tgt_body_by_z = defaultdict(list)
for x, y, z, ci in tgt_voxels:
    tgt_body_set.add((x, y, z))
    tgt_body_by_z[z].append((x, y))

# 表面
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
tgt_surface = set()
for pos in tgt_body_set:
    for dx, dy, dz in DIRS6:
        if (pos[0]+dx, pos[1]+dy, pos[2]+dz) not in tgt_body_set:
            tgt_surface.add(pos); break

# ボディ中心X (ボクセル単位)
all_xs = [x for x, y, z, ci in tgt_voxels]
tgt_vx_center = (min(all_xs) + max(all_xs)) / 2

# Z範囲
all_zs = [z for x, y, z, ci in tgt_voxels]
tgt_vz_min, tgt_vz_max = min(all_zs), max(all_zs)
tgt_vz_range = tgt_vz_max - tgt_vz_min

# 2Dクラスタ分析
def find_clusters_2d(positions):
    pos_set = set(positions); visited = set(); clusters = []
    for pos in pos_set:
        if pos in visited: continue
        cluster = set(); queue = [pos]
        while queue:
            p = queue.pop()
            if p in visited: continue
            visited.add(p); cluster.add(p)
            for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
                nb = (p[0]+dx, p[1]+dy)
                if nb in pos_set and nb not in visited: queue.append(nb)
        clusters.append(cluster)
    return clusters

# 部位分類
print("  Classifying body regions...")
tgt_voxel_region = {}  # (x,y,z) → region_name

for z in sorted(tgt_body_by_z.keys()):
    t = (z - tgt_vz_min) / tgt_vz_range if tgt_vz_range > 0 else 0.5
    positions = tgt_body_by_z[z]
    clusters = find_clusters_2d(positions)
    # 最大クラスタ = 胴体（中央）
    clusters.sort(key=lambda c: -len(c))
    torso_cluster = clusters[0] if clusters else set()
    arm_clusters = clusters[1:] if len(clusters) > 1 else []

    # 高さベースの部位名（中央クラスタ用）
    if t >= 0.90:      center_region = 'head'
    elif t >= 0.85:    center_region = 'neck'
    elif t >= 0.60:    center_region = 'torso'
    elif t >= 0.50:    center_region = 'waist'
    elif t >= 0.40:    center_region = 'hips'
    elif t >= 0.20:    center_region = 'upper_legs'
    elif t >= 0.08:    center_region = 'lower_legs'
    else:              center_region = 'feet'

    for p in torso_cluster:
        tgt_voxel_region[(p[0], p[1], z)] = center_region

    # 腕クラスタ: 高さに応じてarms/hands
    for ac in arm_clusters:
        # クラスタの平均X → 中心から遠い = 腕/手
        avg_x = sum(p[0] for p in ac) / len(ac)
        # 手 = 腕クラスタのうち最も外側（体幹から遠い位置）
        # 簡易判定: 0.50-0.70の高さで外側 = hands, それ以上 = arms
        if t < 0.50 or t >= 0.85:
            region = 'arms'  # この高さなら腕
        elif t < 0.70:
            region = 'hands'
        else:
            region = 'arms'
        for p in ac:
            tgt_voxel_region[(p[0], p[1], z)] = region

# 部位統計
region_counts = defaultdict(int)
for r in tgt_voxel_region.values():
    region_counts[r] += 1
for r, c in sorted(region_counts.items()):
    marker = '✓' if (REGIONS is None or r in REGIONS) else '✗'
    print(f"    [{marker}] {r}: {c} voxels")

# フィルタ適用: 有効な表面ボクセルのみ
if REGIONS:
    tgt_surface_filtered = {pos for pos in tgt_surface if tgt_voxel_region.get(pos) in REGIONS}
    print(f"  Filtered surface: {len(tgt_surface_filtered)}/{len(tgt_surface)} voxels")
else:
    tgt_surface_filtered = tgt_surface
    print(f"  Surface: {len(tgt_surface)} voxels (no filter)")

# プロファイル（マッピング用）
def build_profile(voxels_data, grid_origin, voxel_size):
    world_by_z = {}
    for x, y, z, ci in voxels_data:
        wz = grid_origin.z + (z + 0.5) * voxel_size
        wx = grid_origin.x + (x + 0.5) * voxel_size
        wy = grid_origin.y + (y + 0.5) * voxel_size
        zkey = round(wz, 4)
        if zkey not in world_by_z: world_by_z[zkey] = {'xs': [], 'ys': []}
        world_by_z[zkey]['xs'].append(wx); world_by_z[zkey]['ys'].append(wy)
    profiles = {}
    for zkey, d in world_by_z.items():
        profiles[zkey] = {
            'center_x': (min(d['xs']) + max(d['xs'])) / 2,
            'center_y': (min(d['ys']) + max(d['ys'])) / 2,
            'width': max(d['xs']) - min(d['xs']),
            'depth': max(d['ys']) - min(d['ys']),
        }
    return profiles

tgt_profile = build_profile(tgt_voxels, tgt_grid_origin, tgt_voxel_size)
tgt_zkeys = sorted(tgt_profile.keys())

def find_nearest_profile(profiles, zkeys, target_z):
    best_z = None; best_dist = float('inf')
    for z in zkeys:
        d = abs(z - target_z)
        if d < best_dist: best_dist = d; best_z = z
    return profiles[best_z] if best_z is not None else None

# ========================================================================
# ソースBlendファイル
# ========================================================================
ext = os.path.splitext(SRC_PATH)[1].lower()
if ext in ('.glb', '.gltf'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=SRC_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=SRC_PATH)

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

# バックグラウンドモードでテクスチャ画像を強制ロード
blend_dir = os.path.dirname(os.path.abspath(SRC_PATH))
# テクスチャ検索パス: blendファイルの周辺 + --texture-dir
search_dirs = [blend_dir] + TEXTURE_DIRS
for d in os.listdir(os.path.dirname(SRC_PATH) or '.'):
    full = os.path.join(os.path.dirname(os.path.abspath(SRC_PATH)), d)
    if os.path.isdir(full):
        search_dirs.append(full)
        for sub in os.listdir(full):
            subfull = os.path.join(full, sub)
            if os.path.isdir(subfull):
                search_dirs.append(subfull)

loaded_count = 0
for img in bpy.data.images:
    if img.size[0] == 0 and img.filepath:
        abs_path = bpy.path.abspath(img.filepath, library=img.library)
        if not os.path.isabs(abs_path):
            abs_path = os.path.join(blend_dir, abs_path)
        if os.path.exists(abs_path):
            img.filepath = abs_path
            img.reload()
            if img.size[0] > 0:
                loaded_count += 1
                continue
        # パスが見つからない場合、ファイル名で検索ディレクトリを探す
        # Blenderパス（//textures\file.jpg）のバックスラッシュ対応
        raw_path = img.filepath.replace('//', '').replace('\\', '/')
        basename = raw_path.split('/')[-1]
        for sd in search_dirs:
            candidate = os.path.join(sd, basename)
            if os.path.exists(candidate):
                img.filepath = candidate
                img.reload()
                if img.size[0] > 0:
                    loaded_count += 1
                break
print(f"  Force-loaded {loaded_count} textures (searched {len(search_dirs)} dirs)")

bpy.context.view_layer.update()

# --body-name パラメータ
BODY_NAME = None
for i, a in enumerate(args):
    if a == '--body-name' and i + 1 < len(args):
        BODY_NAME = args[i + 1]

mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if BODY_NAME:
    body_objs = [o for o in mesh_objects if o.name == BODY_NAME]
else:
    body_objs = [o for o in mesh_objects if 'body' in o.name.lower()
                 and not any(x in o.name.lower() for x in ['teeth','tongue','toungue','collision','cage'])]

# ソースBody BBox
src_min_co = Vector((1e9,1e9,1e9)); src_max_co = Vector((-1e9,-1e9,-1e9))
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get(); eo = obj.evaluated_get(dg)
    me = eo.to_mesh(); me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            src_min_co[i] = min(src_min_co[i], v.co[i])
            src_max_co[i] = max(src_max_co[i], v.co[i])
    eo.to_mesh_clear()
src_body_center = (src_min_co + src_max_co) / 2
src_body_h = src_max_co.z - src_min_co.z

# ソースBody BVH
src_body_bvh_list = []
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get(); eo = obj.evaluated_get(dg)
    me = eo.to_mesh(); bm_b = bmesh.new(); bm_b.from_mesh(me)
    bmesh.ops.transform(bm_b, matrix=obj.matrix_world, verts=bm_b.verts)
    bmesh.ops.triangulate(bm_b, faces=bm_b.faces)
    bm_b.verts.ensure_lookup_table(); bm_b.faces.ensure_lookup_table()
    src_body_bvh_list.append(BVHTree.FromBMesh(bm_b))
    bm_b.free(); eo.to_mesh_clear()

# ソースプロファイル（BVHスキャン）
print("  Building source body profile...")
src_profile = {}
n_slices = 256
for iz in range(n_slices):
    z = src_min_co.z + (iz + 0.5) * src_body_h / n_slices
    hits_x = []; hits_y = []
    for ix in range(-50, 51):
        for iy in range(-25, 26):
            px = src_body_center.x + ix * src_voxel_size
            py = src_body_center.y + iy * src_voxel_size
            for bvh in src_body_bvh_list:
                loc, norm, fi, dist = bvh.find_nearest(Vector((px, py, z)))
                if loc is not None and dist < src_voxel_size * 1.5:
                    hits_x.append(px); hits_y.append(py); break
    if hits_x:
        src_profile[round(z, 4)] = {
            'center_x': (min(hits_x) + max(hits_x)) / 2,
            'center_y': (min(hits_y) + max(hits_y)) / 2,
            'width': max(hits_x) - min(hits_x),
            'depth': max(hits_y) - min(hits_y),
        }
src_zkeys = sorted(src_profile.keys())
print(f"  Source profile: {len(src_zkeys)} Z-slices")

# ========================================================================
# 衣装メッシュ
# ========================================================================
part_obj = None
for o in mesh_objects:
    if o.name == PART_NAME: part_obj = o; break
if not part_obj:
    print(f"ERROR: Part '{PART_NAME}' not found"); sys.exit(1)
print(f"  Clothing: {part_obj.name} ({len(part_obj.data.vertices)} verts)")

# テクスチャ・マテリアル
texture_cache = {}
def cache_texture(image):
    if image.name in texture_cache: return
    w, h = image.size
    if w == 0 or h == 0: return
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    texture_cache[image.name] = {'w': w, 'h': h, 'px': pixels}

def sample_texture(tn, ux, uy):
    tc = texture_cache.get(tn)
    if not tc: return (0.7, 0.5, 0.4)
    return (float(tc['px'][int(uy*tc['h'])%tc['h'], int(ux*tc['w'])%tc['w'], 0]),
            float(tc['px'][int(uy*tc['h'])%tc['h'], int(ux*tc['w'])%tc['w'], 1]),
            float(tc['px'][int(uy*tc['h'])%tc['h'], int(ux*tc['w'])%tc['w'], 2]))

def find_input_link(nt, nd, sn):
    for lk in nt.links:
        if lk.to_node == nd and lk.to_socket.name == sn: return lk
    return None

def trace_input(nt, nd, sn):
    inp = nd.inputs.get(sn)
    if inp is None: return ('value', 0.0)
    lk = find_input_link(nt, nd, sn)
    if lk is None:
        val = inp.default_value
        if hasattr(val, '__len__') and len(val) >= 3:
            return ('color', (float(val[0]), float(val[1]), float(val[2])))
        return ('value', float(val))
    return trace_output(nt, lk.from_node, lk.from_socket)

_gim = {}
def trace_output(nt, nd, os_sock):
    if nd.type == 'REROUTE': return trace_input(nt, nd, 'Input')
    elif nd.type == 'GROUP_INPUT':
        gn = nt.name if hasattr(nt, 'name') else ''
        im = _gim.get(gn, {}); oi = 0
        for i, s in enumerate(nd.outputs):
            if s == os_sock: oi = i; break
        return im.get(oi, ('color', (0.7, 0.5, 0.4)))
    elif nd.type == 'TEX_IMAGE' and nd.image:
        cache_texture(nd.image); return ('texture', nd.image.name)
    elif nd.type == 'MIX':
        bt = nd.blend_type if hasattr(nd, 'blend_type') else 'MIX'
        f = trace_input(nt, nd, 'Factor'); a = trace_input(nt, nd, 'A'); b = trace_input(nt, nd, 'B')
        if f[0] == 'value' and f[1] <= 0.001: return a
        if f[0] == 'value' and f[1] >= 0.999 and bt == 'MIX': return b
        return ('mix', bt, f, a, b)
    elif nd.type == 'MIX_RGB':
        bt = nd.blend_type if hasattr(nd, 'blend_type') else 'MIX'
        f = trace_input(nt, nd, 'Fac'); a = trace_input(nt, nd, 'Color1'); b = trace_input(nt, nd, 'Color2')
        if f[0] == 'value' and f[1] <= 0.001: return a
        if f[0] == 'value' and f[1] >= 0.999 and bt == 'MIX': return b
        return ('mix', bt, f, a, b)
    elif nd.type == 'VALUE': return ('value', float(nd.outputs[0].default_value))
    elif nd.type == 'RGB':
        c = nd.outputs[0].default_value; return ('color', (float(c[0]), float(c[1]), float(c[2])))
    elif nd.type == 'GROUP' and nd.node_tree:
        # MustardUI等: まず外部の'Diffuse'入力を優先トレース
        diffuse_inp = nd.inputs.get('Diffuse')
        if diffuse_inp:
            for lk in nt.links:
                if lk.to_node == nd and lk.to_socket.name == 'Diffuse':
                    return trace_output(nt, lk.from_node, lk.from_socket)
        # GROUP_INPUTマッピング方式
        gn = nd.node_tree.name if hasattr(nd.node_tree, 'name') else ''
        im = {}
        for i, inp in enumerate(nd.inputs):
            if inp.is_linked: im[i] = trace_output(nt, inp.links[0].from_node, inp.links[0].from_socket)
        _gim[gn] = im; oi = 0
        for i, s in enumerate(nd.outputs):
            if s == os_sock: oi = i; break
        for g in nd.node_tree.nodes:
            if g.type == 'GROUP_OUTPUT':
                if oi < len(g.inputs) and g.inputs[oi].is_linked:
                    gl = g.inputs[oi].links[0]
                    return trace_output(nd.node_tree, gl.from_node, gl.from_socket)
        for inp in nd.inputs:
            if inp.is_linked:
                src = inp.links[0].from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    cache_texture(src.image); return ('texture', src.image.name)
        return ('color', (0.7, 0.5, 0.4))
    else: return ('color', (0.7, 0.5, 0.4))

def eval_tree(tree, ux, uy):
    k = tree[0]
    if k == 'texture': return sample_texture(tree[1], ux, uy)
    elif k == 'color': return tree[1]
    elif k == 'value': v = tree[1]; return (v, v, v)
    elif k == 'mix':
        _, bt, ft, at, btt = tree
        fv = eval_tree(ft, ux, uy); f = fv[0] if isinstance(fv, tuple) else fv
        f = max(0.0, min(1.0, f)); a = eval_tree(at, ux, uy); b = eval_tree(btt, ux, uy)
        if bt == 'MULTIPLY':
            return (a[0]*(1-f)+a[0]*b[0]*f, a[1]*(1-f)+a[1]*b[1]*f, a[2]*(1-f)+a[2]*b[2]*f)
        return (a[0]*(1-f)+b[0]*f, a[1]*(1-f)+b[1]*f, a[2]*(1-f)+b[2]*f)
    return (0.7, 0.5, 0.4)

mat_info = {}
for mat in part_obj.data.materials:
    if mat is None or mat.name in mat_info: continue
    info = {'eval_tree': None, 'color': (180, 180, 180)}
    if mat.use_nodes:
        found = False
        for nd in mat.node_tree.nodes:
            if nd.type == 'BSDF_PRINCIPLED':
                bc = nd.inputs.get('Base Color')
                if bc:
                    if bc.is_linked: info['eval_tree'] = trace_input(mat.node_tree, nd, 'Base Color')
                    else:
                        c = bc.default_value; info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
                found = True; break
        if not found:
            for nd in mat.node_tree.nodes:
                if nd.type == 'OUTPUT_MATERIAL':
                    sl = find_input_link(mat.node_tree, nd, 'Surface')
                    if sl:
                        r = trace_output(mat.node_tree, sl.from_node, sl.from_socket)
                        if r[0] != 'color' or r[1] != (0.7, 0.5, 0.4): info['eval_tree'] = r
                    break
    mat_info[mat.name] = info
    print(f"  Material '{mat.name}': {'eval_tree' if info['eval_tree'] else 'color'}")

# 衣装BVH
dg = bpy.context.evaluated_depsgraph_get(); eo = part_obj.evaluated_get(dg)
me_eval = eo.to_mesh(); bm_cloth = bmesh.new(); bm_cloth.from_mesh(me_eval)
bmesh.ops.transform(bm_cloth, matrix=part_obj.matrix_world, verts=bm_cloth.verts)
bmesh.ops.triangulate(bm_cloth, faces=bm_cloth.faces)
bm_cloth.verts.ensure_lookup_table(); bm_cloth.faces.ensure_lookup_table()
uv_layer = bm_cloth.loops.layers.uv.active
cloth_bvh = BVHTree.FromBMesh(bm_cloth)

def get_uv_at(fi, loc):
    face = bm_cloth.faces[fi]
    if not uv_layer: return None
    loops = face.loops; v0, v1, v2 = [l.vert.co for l in loops]
    uv0, uv1, uv2 = loops[0][uv_layer].uv, loops[1][uv_layer].uv, loops[2][uv_layer].uv
    d0 = v1-v0; d1 = v2-v0; d2 = loc-v0
    dn = d0.dot(d0)*d1.dot(d1) - d0.dot(d1)**2
    if abs(dn) < 1e-12: return None
    inv = 1.0/dn; ub = (d1.dot(d1)*d0.dot(d2)-d0.dot(d1)*d1.dot(d2))*inv
    vb = (d0.dot(d0)*d1.dot(d2)-d0.dot(d1)*d0.dot(d2))*inv; wb = 1-ub-vb
    return (wb*uv0.x+ub*uv1.x+vb*uv2.x, wb*uv0.y+ub*uv1.y+vb*uv2.y)

def get_color(fi, loc):
    face = bm_cloth.faces[fi]; ms = face.material_index; mats = part_obj.data.materials
    mn = mats[ms].name if ms < len(mats) and mats[ms] else None
    mi = mat_info.get(mn)
    if mi and mi.get('eval_tree'):
        uv = get_uv_at(fi, loc)
        if uv:
            rgb = eval_tree(mi['eval_tree'], uv[0], uv[1])
            return (max(0,min(255,int(rgb[0]*255))), max(0,min(255,int(rgb[1]*255))), max(0,min(255,int(rgb[2]*255))))
    return mi.get('color', (180,180,180)) if mi else (180,180,180)

# ========================================================================
# ボクセル化: 表面オフセット + BVHスナップ（v2） + 部位フィルタ
# ========================================================================
thr = src_voxel_size * 0.55
height_scale = src_body_h / tgt_height if tgt_height > 0 else 1.0

print(f"\n  Voxelizing (surface-offset + BVH snap + region filter)...")
print(f"  Threshold: {thr:.6f}, Height scale: {height_scale:.4f}")
result = {}
processed = 0

# フィルタ済み表面ボクセルから外側にスキャン
for surf_pos in tgt_surface_filtered:
    processed += 1
    if processed % 5000 == 0:
        print(f"    surface {processed}/{len(tgt_surface_filtered)} hits={len(result)}")

    tgt_world = Vector((
        tgt_grid_origin.x + (surf_pos[0] + 0.5) * tgt_voxel_size,
        tgt_grid_origin.y + (surf_pos[1] + 0.5) * tgt_voxel_size,
        tgt_grid_origin.z + (surf_pos[2] + 0.5) * tgt_voxel_size,
    ))

    # 表面ボクセルの部位を取得
    surf_region = tgt_voxel_region.get(surf_pos, 'torso')
    is_limb = surf_region in ('arms', 'hands')

    t_height = (tgt_world.z - tgt_bb_min.z) / tgt_height if tgt_height > 0 else 0.5
    src_z = src_min_co.z + t_height * src_body_h

    if is_limb:
        # 腕/手: 直接比例スケーリング（プロファイル正規化は胴体幅を含むため不適）
        tgt_body_w = tgt_bb_max.x - tgt_bb_min.x
        tgt_body_d = tgt_bb_max.y - tgt_bb_min.y
        src_body_w = src_max_co.x - src_min_co.x
        src_body_d = src_max_co.y - src_min_co.y
        src_approx = Vector((
            src_body_center.x + (tgt_world.x - tgt_center_x) * (src_body_w / tgt_body_w) if tgt_body_w > 0 else 0,
            src_body_center.y + (tgt_world.y - tgt_center_y) * (src_body_d / tgt_body_d) if tgt_body_d > 0 else 0,
            src_z,
        ))
    else:
        # 胴体/脚/頭: プロファイルベースのマッピング
        tp = find_nearest_profile(tgt_profile, tgt_zkeys, tgt_world.z)
        if not tp or tp['width'] < 0.001: continue
        nx = (tgt_world.x - tp['center_x']) / (tp['width'] / 2) if tp['width'] > 0.001 else 0
        ny = (tgt_world.y - tp['center_y']) / (tp['depth'] / 2) if tp['depth'] > 0.001 else 0
        sp = find_nearest_profile(src_profile, src_zkeys, src_z)
        if not sp or sp['width'] < 0.001: continue
        src_approx = Vector((
            sp['center_x'] + nx * (sp['width'] / 2),
            sp['center_y'] + ny * (sp['depth'] / 2),
            src_z,
        ))

    # BVHスナップ
    best_snap = None; best_snap_dist = 1e9
    for bvh in src_body_bvh_list:
        loc, norm, fi, dist = bvh.find_nearest(src_approx)
        if loc is not None and dist < best_snap_dist:
            best_snap_dist = dist; best_snap = loc
    if best_snap is None: continue

    # 6方向 + 斜め方向（18方向）スキャン
    for dx, dy, dz in DIRS6 + [(1,1,0),(-1,1,0),(1,-1,0),(-1,-1,0),(0,1,1),(0,-1,1),(0,1,-1),(0,-1,-1),(1,0,1),(-1,0,1),(1,0,-1),(-1,0,-1)]:
        nb = (surf_pos[0]+dx, surf_pos[1]+dy, surf_pos[2]+dz)
        if nb not in tgt_body_set:
            offset_dir = Vector((dx, dy, dz)).normalized()
            for step_i in range(1, 6):
                tgt_offset_pos = tgt_world + offset_dir * step_i * tgt_voxel_size
                tgt_vx = int((tgt_offset_pos.x - tgt_grid_origin.x) / tgt_voxel_size)
                tgt_vy = int((tgt_offset_pos.y - tgt_grid_origin.y) / tgt_voxel_size)
                tgt_vz = int((tgt_offset_pos.z - tgt_grid_origin.z) / tgt_voxel_size)
                if tgt_vx < 0 or tgt_vx >= tgt_gx or tgt_vy < 0 or tgt_vy >= tgt_gy or tgt_vz < 0 or tgt_vz >= tgt_gz:
                    break
                vkey = (tgt_vx, tgt_vy, tgt_vz)
                if vkey in result or vkey in tgt_body_set: continue

                src_offset = step_i * src_voxel_size
                query_pos = best_snap + offset_dir * src_offset
                loc, norm, fi, dist = cloth_bvh.find_nearest(query_pos)
                if loc is not None and dist < thr:
                    result[vkey] = get_color(fi, loc)

print(f"  Total: {len(result)} voxels")
if not result:
    print("ERROR: No voxels generated"); sys.exit(1)

# ========================================================================
# VOX出力
# ========================================================================
def quantize_color(c, step=4):
    return (min(255,(c[0]//step)*step+step//2), min(255,(c[1]//step)*step+step//2), min(255,(c[2]//step)*step+step//2))

step = 4
quantized = {p: quantize_color(c, step) for p, c in result.items()}
uq = set(quantized.values())
while len(uq) > 255:
    step *= 2; quantized = {p: quantize_color(c, step) for p, c in result.items()}; uq = set(quantized.values())

colors = list(uq); cidx = {c: i+1 for i, c in enumerate(colors)}
vlist = [(p[0],p[1],p[2],cidx[c]) for p, c in quantized.items()]

def write_vox(path, sx, sy, sz, voxels, pal):
    def chunk(tag, data): return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels: xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
    rd = b''
    for i in range(256):
        if i < len(pal): rd += struct.pack('<BBBB', pal[i][0], pal[i][1], pal[i][2], 255)
        else: rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f: f.write(b'VOX ' + struct.pack('<I', 150) + main)

os.makedirs(os.path.dirname(OUT_PATH) or '.', exist_ok=True)
write_vox(OUT_PATH, tgt_gx, tgt_gy, tgt_gz, vlist, colors)
print(f"  -> {OUT_PATH}: {tgt_gx}x{tgt_gy}x{tgt_gz}, {len(vlist)} voxels, {len(colors)} colors")

bm_cloth.free(); eo.to_mesh_clear()
print("  Done!")
