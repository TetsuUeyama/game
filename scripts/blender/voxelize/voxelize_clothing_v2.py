"""ボーンリージョンマップベースの衣装ボクセル化スクリプト v2。

ソースモデルの衣装メッシュをターゲットBody（QM）にフィットさせてボクセル化する。
ボーンリージョンマップにより、部位単位の正確な体型変換を行う。
衣装がカバーする部位はソースBody上の衣装メッシュ位置から自動検出される。

Usage:
  blender --background <source.blend> --python voxelize_clothing_v2.py -- \
    <part_name> <target_body.vox> <target_grid.json> <target_region_map.json> \
    <source_bone_mapping.json> <output.vox> \
    [--body-name "Body"] [--no-deform] [--texture-dir /path/to/textures]
"""
import bpy
import bmesh
import sys
import os
import struct
import json
import math
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

BODY_NAME = None
TEXTURE_DIRS = []

for i, a in enumerate(args):
    if a == '--body-name' and i + 1 < len(args):
        BODY_NAME = args[i + 1]
    elif a == '--texture-dir' and i + 1 < len(args):
        TEXTURE_DIRS.append(args[i + 1])

pos_args = []
skip_next = False
for a in args:
    if skip_next: skip_next = False; continue
    if a in ('--bones', '--body-name', '--texture-dir'): skip_next = True; continue
    if a.startswith('--'): continue
    pos_args.append(a)

PART_NAME = pos_args[0]
TGT_BODY_VOX = pos_args[1]
TGT_GRID_JSON = pos_args[2]
TGT_REGION_MAP = pos_args[3]
SRC_BONE_MAPPING = pos_args[4]
OUT_PATH = pos_args[5]

print(f"\n=== Clothing Voxelizer v2 (Bone Region, Auto-detect) ===")
print(f"  Part: {PART_NAME}")
print(f"  Target body: {TGT_BODY_VOX}")
print(f"  Output: {OUT_PATH}")

# ========================================================================
# ターゲット情報読み込み
# ========================================================================
with open(TGT_GRID_JSON) as f:
    tgt_grid = json.load(f)
tgt_voxel_size = tgt_grid['voxel_size']
tgt_grid_origin = Vector(tgt_grid['grid_origin'])
tgt_gx, tgt_gy, tgt_gz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']
tgt_bb_min = Vector(tgt_grid.get('bb_min', tgt_grid.get('raw_min', [0,0,0])))
tgt_bb_max = Vector(tgt_grid.get('bb_max', tgt_grid.get('raw_max', [0,0,0])))
tgt_height = tgt_bb_max.z - tgt_bb_min.z

# ターゲットリージョンマップ
with open(TGT_REGION_MAP) as f:
    tgt_region_data = json.load(f)

# ソースボーンマッピング
with open(SRC_BONE_MAPPING) as f:
    src_bone_data = json.load(f)
src_bone_map = src_bone_data.get('bone_map', {})

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
# ターゲットBody読み込み + リージョンフィルタ
# ========================================================================
print("  Loading target body...")
tgt_voxels, tgt_sx, tgt_sy, tgt_sz = parse_vox_file(TGT_BODY_VOX)
tgt_body_set = set()
for x, y, z, ci in tgt_voxels:
    tgt_body_set.add((x, y, z))

# ターゲットのリージョンマップ: 全リージョンを読み込む（フィルタはBONES決定後）
tgt_voxel_region_all = {}  # (x,y,z) -> region
region_files_dir = os.path.join(os.path.dirname(TGT_BODY_VOX), 'regions')

all_region_names = [f.replace('region_', '').replace('.vox', '')
                    for f in os.listdir(region_files_dir) if f.startswith('region_') and f.endswith('.vox')]
for region_name in all_region_names:
    region_vox_path = os.path.join(region_files_dir, f'region_{region_name}.vox')
    rvoxels, _, _, _ = parse_vox_file(region_vox_path)
    for x, y, z, ci in rvoxels:
        tgt_voxel_region_all[(x, y, z)] = region_name
print(f"  Loaded {len(all_region_names)} target regions, {len(tgt_voxel_region_all)} voxels total")

DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]

# ターゲット部位別プロファイル

# ターゲットグローバルプロファイル（v1方式）
def build_tgt_global_profile():
    tgt_profile = {}
    for x, y, z, ci in tgt_voxels:
        wz = tgt_grid_origin.z + (z + 0.5) * tgt_voxel_size
        wx = tgt_grid_origin.x + (x + 0.5) * tgt_voxel_size
        wy = tgt_grid_origin.y + (y + 0.5) * tgt_voxel_size
        zkey = round(wz, 4)
        if zkey not in tgt_profile:
            tgt_profile[zkey] = {'xs': [], 'ys': []}
        tgt_profile[zkey]['xs'].append(wx)
        tgt_profile[zkey]['ys'].append(wy)
    profiles = {}
    for zkey, d in tgt_profile.items():
        profiles[zkey] = {
            'center_x': (min(d['xs']) + max(d['xs'])) / 2,
            'center_y': (min(d['ys']) + max(d['ys'])) / 2,
            'width': max(d['xs']) - min(d['xs']),
            'depth': max(d['ys']) - min(d['ys']),
        }
    return profiles, sorted(profiles.keys())

# ========================================================================
# ソースBlendファイル読み込み
# ========================================================================
# MASK解除
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

# テクスチャ強制ロード
blend_dir = os.path.dirname(os.path.abspath(bpy.data.filepath))
search_dirs = [blend_dir] + TEXTURE_DIRS
for d in os.listdir(os.path.dirname(bpy.data.filepath) or '.'):
    full = os.path.join(blend_dir, d)
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
            img.filepath = abs_path; img.reload()
            if img.size[0] > 0: loaded_count += 1; continue
        raw_path = img.filepath.replace('//', '').replace('\\', '/')
        basename = raw_path.split('/')[-1]
        for sd in search_dirs:
            candidate = os.path.join(sd, basename)
            if os.path.exists(candidate):
                img.filepath = candidate; img.reload()
                if img.size[0] > 0: loaded_count += 1; break
print(f"  Force-loaded {loaded_count} textures")

bpy.context.view_layer.update()

# Body検索
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
print(f"  Source body: h={src_body_h:.4f}")

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

# ソース部位別プロファイル（ボーンウェイトベース）
print("  Building source region profiles...")
# ソースBody頂点の部位分類
src_body_obj = body_objs[0]
vg_idx_to_name = {vg.index: vg.name for vg in src_body_obj.vertex_groups}

dg = bpy.context.evaluated_depsgraph_get()
eo = src_body_obj.evaluated_get(dg)
src_me = eo.to_mesh()
src_me.transform(src_body_obj.matrix_world)

# ソースグローバルプロファイル構築（v1方式: Body全体のZスライスプロファイル）
def build_src_global_profile():
    """ソースBody全体のZスライスプロファイルを構築"""
    print("  Building source global profile...")
    profile = {}
    n_slices = 256
    for iz in range(n_slices):
        z = src_min_co.z + (iz + 0.5) * src_body_h / n_slices
        hits_x = []; hits_y = []
        for ix in range(-50, 51):
            for iy in range(-25, 26):
                px = src_body_center.x + ix * tgt_voxel_size
                py = src_body_center.y + iy * tgt_voxel_size
                for bvh in src_body_bvh_list:
                    loc, norm, fi, dist = bvh.find_nearest(Vector((px, py, z)))
                    if loc is not None and dist < tgt_voxel_size * 1.5:
                        hits_x.append(px); hits_y.append(py); break
        if hits_x:
            zkey = round(z, 4)
            profile[zkey] = {
                'center_x': (min(hits_x) + max(hits_x)) / 2,
                'center_y': (min(hits_y) + max(hits_y)) / 2,
                'width': max(hits_x) - min(hits_x),
                'depth': max(hits_y) - min(hits_y),
            }
    zkeys = sorted(profile.keys())
    print(f"    {len(zkeys)} Z-slices")
    return profile, zkeys

eo.to_mesh_clear()

# ========================================================================
# 衣装メッシュ
# ========================================================================
part_obj = None
for o in mesh_objects:
    if o.name == PART_NAME: part_obj = o; break
if not part_obj:
    print(f"ERROR: Part '{PART_NAME}' not found"); sys.exit(1)
print(f"  Clothing: {part_obj.name} ({len(part_obj.data.vertices)} verts)")

# テクスチャ・マテリアル（voxelize_clothing_for_body.py と同一）
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
        if bt == 'MULTIPLY':
            def is_ao(t): return t[0] == 'texture' and 'ao' in t[1].lower()
            if is_ao(b): return a
            if is_ao(a): return b
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
    elif nd.type == 'CURVE_RGB': return trace_input(nt, nd, 'Color')
    elif nd.type == 'MATH': return trace_input(nt, nd, 'Value')
    elif nd.type == 'GROUP' and nd.node_tree:
        diffuse_inp = nd.inputs.get('Diffuse')
        if diffuse_inp:
            for lk in nt.links:
                if lk.to_node == nd and lk.to_socket.name == 'Diffuse':
                    return trace_output(nt, lk.from_node, lk.from_socket)
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

# ========================================================================
# 衣装カバー部位の自動検出
# 衣装メッシュの各頂点→最寄りBody表面→その頂点のボーンウェイト→部位
# ========================================================================
print("  Auto-detecting covered regions...")

# ソースBodyのBMeshで頂点部位マップを構築
src_body_bm = bmesh.new()
dg_body = bpy.context.evaluated_depsgraph_get()
eo_body = src_body_obj.evaluated_get(dg_body)
me_body = eo_body.to_mesh()
bm_body_tmp = bmesh.new()
bm_body_tmp.from_mesh(me_body)
bmesh.ops.transform(bm_body_tmp, matrix=src_body_obj.matrix_world, verts=bm_body_tmp.verts)
bmesh.ops.triangulate(bm_body_tmp, faces=bm_body_tmp.faces)
bm_body_tmp.verts.ensure_lookup_table()
bm_body_tmp.faces.ensure_lookup_table()
body_bvh_for_detect = BVHTree.FromBMesh(bm_body_tmp)

# Body頂点→部位（ウェイト合算方式）
orig_body_verts = src_body_obj.data.vertices
body_vert_region = []
for v in orig_body_verts:
    region_weights = {}
    for g in v.groups:
        vg_name = vg_idx_to_name.get(g.group, '')
        region = src_bone_map.get(vg_name, 'unknown')
        if region != 'unknown':
            region_weights[region] = region_weights.get(region, 0.0) + g.weight
    best_r = 'unknown'
    best_w = 0.0
    for r, w in region_weights.items():
        if w > best_w: best_w = w; best_r = r
    body_vert_region.append(best_r)

# 衣装の各頂点→Body最寄り面→面の頂点の部位とZ座標を取得
region_hit_counts = defaultdict(int)
region_hit_zs = defaultdict(list)
for cloth_vert in bm_cloth.verts:
    loc, norm, face_idx, dist = body_bvh_for_detect.find_nearest(cloth_vert.co)
    if loc is None or face_idx is None:
        continue
    body_face = bm_body_tmp.faces[face_idx]
    best_region = 'unknown'
    best_dist = float('inf')
    for loop in body_face.loops:
        vi = loop.vert.index
        d = (bm_body_tmp.verts[vi].co - loc).length
        if d < best_dist and vi < len(body_vert_region):
            best_dist = d
            best_region = body_vert_region[vi]
    if best_region != 'unknown':
        region_hit_counts[best_region] += 1
        region_hit_zs[best_region].append(loc.z)

bm_body_tmp.free()
eo_body.to_mesh_clear()

# ヒット数が衣装頂点の1%以上の部位を採用
# 同時に各部位の衣装カバーZ範囲を記録
cloth_vert_count = len(bm_cloth.verts)
min_hits = max(1, cloth_vert_count * 0.01)
BONES = set()
region_z_limits = {}  # region -> (src_z_min, src_z_max) 衣装が実際にカバーするZ範囲

print("  Region detection results:")
for region, count in sorted(region_hit_counts.items(), key=lambda x: -x[1]):
    pct = count / cloth_vert_count * 100
    selected = count >= min_hits
    marker = 'Y' if selected else '-'
    z_range_str = ''
    if selected and region in region_hit_zs:
        zs = region_hit_zs[region]
        z_min, z_max = min(zs), max(zs)
        region_z_limits[region] = (z_min, z_max)
        z_range_str = f' z={z_min:.3f}-{z_max:.3f}'
    print(f"    [{marker}] {region}: {count} hits ({pct:.1f}%){z_range_str}")
    if selected:
        BONES.add(region)

if not BONES:
    print("ERROR: No regions detected for this clothing")
    sys.exit(1)
print(f"  Auto-detected bones: {sorted(BONES)}")

# BONES決定後: ターゲットリージョンをフィルタリング + Z範囲制限
# 各部位のソースZ範囲をターゲットZ範囲に変換してフィルタ
tgt_voxel_region = {}
for pos, region in tgt_voxel_region_all.items():
    if region not in BONES:
        continue
    # Z範囲制限: ソースの衣装カバー範囲をターゲットに変換
    if region in region_z_limits:
        src_z_min, src_z_max = region_z_limits[region]
        # ソースZ → 高さ比率 → ターゲットZ（マージン付き）
        t_min = (src_z_min - src_min_co.z) / src_body_h if src_body_h > 0 else 0
        t_max = (src_z_max - src_min_co.z) / src_body_h if src_body_h > 0 else 1
        tgt_z_min = tgt_bb_min.z + t_min * tgt_height - tgt_voxel_size * 3
        tgt_z_max = tgt_bb_min.z + t_max * tgt_height + tgt_voxel_size * 3
        voxel_z = tgt_grid_origin.z + (pos[2] + 0.5) * tgt_voxel_size
        if voxel_z < tgt_z_min or voxel_z > tgt_z_max:
            continue
    tgt_voxel_region[pos] = region

tgt_surface = set()
for pos in tgt_voxel_region:
    for dx, dy, dz in DIRS6:
        if (pos[0]+dx, pos[1]+dy, pos[2]+dz) not in tgt_body_set:
            tgt_surface.add(pos); break
print(f"  Filtered surface: {len(tgt_surface)} voxels for {len(BONES)} regions")

# グローバルプロファイル構築（v1方式 — Body全体の幅/奥行きで体型変換）
tgt_global_profile, tgt_global_zkeys = build_tgt_global_profile()
src_global_profile, src_global_zkeys = build_src_global_profile()

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
# ボクセル化: 2パス方式
#   Pass 1: Body表面スキャン（密着衣装）
#   Pass 2: 直接グリッドサンプリング（袖・裾など体から離れた衣装）
# ========================================================================
thr = tgt_voxel_size * 0.55  # 衣装BVH距離閾値（表面判定用）

def find_nearest_profile(profiles, zkeys, target_z):
    if not zkeys: return None
    best_z = min(zkeys, key=lambda z: abs(z - target_z))
    return profiles[best_z]

def map_tgt_to_src(tgt_world, region=None):
    """ターゲット空間→ソース空間のマッピング（グローバルプロファイル）"""
    t_height = (tgt_world.z - tgt_bb_min.z) / tgt_height if tgt_height > 0 else 0.5
    src_z = src_min_co.z + t_height * src_body_h

    tp_data = find_nearest_profile(tgt_global_profile, tgt_global_zkeys, tgt_world.z)
    sp_data = find_nearest_profile(src_global_profile, src_global_zkeys, src_z)
    if not tp_data or not sp_data: return None
    if tp_data['width'] < 0.001 or sp_data['width'] < 0.001: return None

    nx = (tgt_world.x - tp_data['center_x']) / (tp_data['width'] / 2) if tp_data['width'] > 0.001 else 0
    ny = (tgt_world.y - tp_data['center_y']) / (tp_data['depth'] / 2) if tp_data['depth'] > 0.001 else 0
    return Vector((
        sp_data['center_x'] + nx * (sp_data['width'] / 2),
        sp_data['center_y'] + ny * (sp_data['depth'] / 2),
        src_z,
    ))

print(f"\n  Voxelizing (bone-region v2, surface scan + mesh overlap)...")
print(f"  Threshold: {thr:.6f}")
result = {}
MAX_STEPS = 15

# ------------------------------------------------------------------
# Pass 1: Body表面スキャン（外側方向に衣装メッシュを探索）
#        + Body表面でのめり込み検出（find_nearest距離判定）
# ------------------------------------------------------------------
print("  Pass 1: Surface scan + overlap detection...")
DIRS18 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1),
          (1,1,0),(-1,1,0),(1,-1,0),(-1,-1,0),
          (0,1,1),(0,-1,1),(0,1,-1),(0,-1,-1),
          (1,0,1),(-1,0,1),(1,0,-1),(-1,0,-1)]
processed = 0
overlap_count = 0
# めり込み検出閾値: 衣装メッシュの中央距離（実測 ~0.007m）をカバー
overlap_thr = tgt_voxel_size * 3.0  # ~0.02m

for surf_pos in tgt_surface:
    processed += 1
    if processed % 5000 == 0:
        print(f"    surface {processed}/{len(tgt_surface)} hits={len(result)} overlaps={overlap_count}")

    region = tgt_voxel_region.get(surf_pos)
    if not region or region not in BONES:
        continue

    tgt_world = Vector((
        tgt_grid_origin.x + (surf_pos[0] + 0.5) * tgt_voxel_size,
        tgt_grid_origin.y + (surf_pos[1] + 0.5) * tgt_voxel_size,
        tgt_grid_origin.z + (surf_pos[2] + 0.5) * tgt_voxel_size,
    ))

    src_approx = map_tgt_to_src(tgt_world, region)
    if src_approx is None: continue

    best_snap = None; best_snap_dist = 1e9
    for bvh in src_body_bvh_list:
        loc, norm, fi, dist = bvh.find_nearest(src_approx)
        if loc is not None and dist < best_snap_dist:
            best_snap_dist = dist; best_snap = loc
    if best_snap is None: continue

    # めり込み検出: Body表面位置で衣装メッシュがoverlap_thr以内にあるか
    # これは外側スキャンとは別に、めり込んだ衣装をBody直上に配置するため
    loc_cloth, norm_cloth, fi_cloth, dist_cloth = cloth_bvh.find_nearest(best_snap)
    if loc_cloth is not None and dist_cloth < overlap_thr:
        for dx, dy, dz in DIRS6:
            nb = (surf_pos[0]+dx, surf_pos[1]+dy, surf_pos[2]+dz)
            if nb not in tgt_body_set and nb not in result:
                if 0 <= nb[0] < tgt_gx and 0 <= nb[1] < tgt_gy and 0 <= nb[2] < tgt_gz:
                    result[nb] = get_color(fi_cloth, loc_cloth)
                    overlap_count += 1
                    break

    # 外側スキャン: 各方向で最初にヒットした衣装面のみ採用
    # ヒット後にミスが続いたらその方向は終了（筒の反対側を拾わない）
    for dx, dy, dz in DIRS18:
        nb = (surf_pos[0]+dx, surf_pos[1]+dy, surf_pos[2]+dz)
        if nb not in tgt_body_set:
            offset_dir = Vector((dx, dy, dz)).normalized()
            hit_in_dir = False
            miss_after_hit = 0
            for step_i in range(1, MAX_STEPS + 1):
                tgt_offset_pos = tgt_world + offset_dir * step_i * tgt_voxel_size
                tgt_vx = int((tgt_offset_pos.x - tgt_grid_origin.x) / tgt_voxel_size)
                tgt_vy = int((tgt_offset_pos.y - tgt_grid_origin.y) / tgt_voxel_size)
                tgt_vz = int((tgt_offset_pos.z - tgt_grid_origin.z) / tgt_voxel_size)
                if tgt_vx < 0 or tgt_vx >= tgt_gx or tgt_vy < 0 or tgt_vy >= tgt_gy or tgt_vz < 0 or tgt_vz >= tgt_gz:
                    break
                vkey = (tgt_vx, tgt_vy, tgt_vz)
                if vkey in tgt_body_set: continue

                src_offset = step_i * tgt_voxel_size
                query_pos = best_snap + offset_dir * src_offset
                loc, norm, fi, dist = cloth_bvh.find_nearest(query_pos)
                if loc is not None and dist < thr:
                    if vkey not in result:
                        result[vkey] = get_color(fi, loc)
                    hit_in_dir = True
                    miss_after_hit = 0
                else:
                    if hit_in_dir:
                        miss_after_hit += 1
                        if miss_after_hit >= 2:
                            break  # 衣装面を通過した→これ以上は反対側

pass1_count = len(result)
print(f"  Pass 1 result: {pass1_count} voxels (overlaps: {overlap_count})")

# ------------------------------------------------------------------
# Pass 2: フラッドフィル拡張（密着部から派生する袖・裾）
# ------------------------------------------------------------------
print("  Pass 2: Flood-fill expansion...")
frontier = set(result.keys())
visited = set(result.keys()) | tgt_body_set
pass2_count = 0
iteration = 0

DIRS26 = []
for dx in (-1, 0, 1):
    for dy in (-1, 0, 1):
        for dz in (-1, 0, 1):
            if dx == 0 and dy == 0 and dz == 0: continue
            DIRS26.append((dx, dy, dz))

while frontier and iteration < 50:
    iteration += 1
    new_frontier = set()

    for vkey in frontier:
        vx, vy, vz = vkey
        tgt_world = Vector((
            tgt_grid_origin.x + (vx + 0.5) * tgt_voxel_size,
            tgt_grid_origin.y + (vy + 0.5) * tgt_voxel_size,
            tgt_grid_origin.z + (vz + 0.5) * tgt_voxel_size,
        ))
        region = tgt_voxel_region.get(vkey)
        if not region:
            best_r = None; best_d = float('inf')
            for r_pos, r_name in tgt_voxel_region.items():
                if r_name not in BONES: continue
                d = abs(vx - r_pos[0]) + abs(vy - r_pos[1]) + abs(vz - r_pos[2])
                if d < best_d: best_d = d; best_r = r_name
            region = best_r
        if not region or region not in BONES: continue

        src_approx = map_tgt_to_src(tgt_world, region)
        if src_approx is None: continue

        for dx, dy, dz in DIRS26:
            nb = (vx + dx, vy + dy, vz + dz)
            if nb in visited: continue
            if nb[0] < 0 or nb[0] >= tgt_gx or nb[1] < 0 or nb[1] >= tgt_gy or nb[2] < 0 or nb[2] >= tgt_gz:
                continue
            nb_tgt = Vector((
                tgt_grid_origin.x + (nb[0] + 0.5) * tgt_voxel_size,
                tgt_grid_origin.y + (nb[1] + 0.5) * tgt_voxel_size,
                tgt_grid_origin.z + (nb[2] + 0.5) * tgt_voxel_size,
            ))
            offset = nb_tgt - tgt_world
            nb_src = src_approx + offset
            loc, norm, fi, dist = cloth_bvh.find_nearest(nb_src)
            if loc is not None and dist < thr:
                result[nb] = get_color(fi, loc)
                new_frontier.add(nb)
                pass2_count += 1
            visited.add(nb)

    frontier = new_frontier
    if new_frontier:
        print(f"    iteration {iteration}: +{len(new_frontier)} voxels (total pass2: {pass2_count})")

print(f"  Pass 2 result: {pass2_count} voxels ({iteration} iterations)")

print(f"  Total: {len(result)} voxels")
if not result:
    print("WARNING: No voxels generated"); sys.exit(1)

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
