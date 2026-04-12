"""膜方式の衣装ボクセル化スクリプト v3。

QM Body表面の1ボクセル厚の膜を基準にし、
ソース衣装の色を転写 + 突起（Body表面からのオフセット）を追加する。

体型変換にはボーンローカル座標系を使用し、腕等の体幹横の部位も正確に対応する。

Usage:
  blender --background <source.blend> --python voxelize_clothing_v3.py -- \
    <part_name> <target_body.vox> <target_grid.json> <target_region_map_dir> \
    <source_bone_mapping.json> <qm_blend> <output.vox> \
    [--body-name "Body"] [--no-deform] [--texture-dir /path]
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
    if a == '--body-name' and i + 1 < len(args): BODY_NAME = args[i + 1]
    elif a == '--texture-dir' and i + 1 < len(args): TEXTURE_DIRS.append(args[i + 1])

pos_args = [a for a in args if not a.startswith('--') and args[max(0,args.index(a)-1)] not in ('--body-name','--texture-dir')]
# 再パース
pos_args = []
skip_next = False
for a in args:
    if skip_next: skip_next = False; continue
    if a in ('--body-name', '--texture-dir'): skip_next = True; continue
    if a.startswith('--'): continue
    pos_args.append(a)

PART_NAME = pos_args[0]
TGT_BODY_VOX = pos_args[1]
TGT_GRID_JSON = pos_args[2]
TGT_REGION_DIR = pos_args[3]  # body/regions/ ディレクトリ
SRC_BONE_MAPPING = pos_args[4]
QM_BLEND = pos_args[5]
OUT_PATH = pos_args[6]

print(f"\n=== Clothing Voxelizer v3 (Membrane + Protrusion) ===")
print(f"  Part: {PART_NAME}")
print(f"  QM blend: {QM_BLEND}")
print(f"  Output: {OUT_PATH}")

# ========================================================================
# ターゲット（QM）情報
# ========================================================================
with open(TGT_GRID_JSON) as f:
    tgt_grid = json.load(f)
tgt_voxel_size = tgt_grid['voxel_size']
tgt_grid_origin = Vector(tgt_grid['grid_origin'])
tgt_gx, tgt_gy, tgt_gz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

# ターゲットBody VOX
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

print("  Loading target body...")
tgt_voxels, tgt_sx, tgt_sy, tgt_sz = parse_vox_file(TGT_BODY_VOX)
tgt_body_set = set((x,y,z) for x,y,z,ci in tgt_voxels)

# 全リージョン読み込み
tgt_voxel_region = {}
region_files = [f for f in os.listdir(TGT_REGION_DIR) if f.startswith('region_') and f.endswith('.vox')]
for rf in region_files:
    rname = rf.replace('region_','').replace('.vox','')
    rvox, _, _, _ = parse_vox_file(os.path.join(TGT_REGION_DIR, rf))
    for x,y,z,ci in rvox:
        tgt_voxel_region[(x,y,z)] = rname
print(f"  Loaded {len(region_files)} regions, {len(tgt_voxel_region)} voxels")

# 表面抽出（全部位）
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
tgt_surface_all = {}  # (x,y,z) -> region
for pos, region in tgt_voxel_region.items():
    for dx,dy,dz in DIRS6:
        if (pos[0]+dx, pos[1]+dy, pos[2]+dz) not in tgt_body_set:
            tgt_surface_all[pos] = region; break

# ソースボーンマッピング
with open(SRC_BONE_MAPPING) as f:
    src_bone_data = json.load(f)
src_bone_map = src_bone_data.get('bone_map', {})

# ========================================================================
# QM Body BVH（ターゲット側のBody表面法線取得用）
# ========================================================================
print("  Loading QM body mesh...")
# QMのblendからBodyメッシュをアペンド
with bpy.data.libraries.load(QM_BLEND, link=False) as (data_from, data_to):
    data_to.objects = [n for n in data_from.objects]

qm_body = None
for obj in data_to.objects:
    if obj is not None and obj.type == 'MESH' and 'body' in obj.name.lower() and 'queen' in obj.name.lower():
        qm_body = obj; break
if not qm_body:
    for obj in data_to.objects:
        if obj is not None and obj.type == 'MESH' and 'body' in obj.name.lower():
            qm_body = obj; break

if qm_body:
    qm_me = qm_body.data
    bm_qm = bmesh.new(); bm_qm.from_mesh(qm_me)
    bmesh.ops.transform(bm_qm, matrix=qm_body.matrix_world, verts=bm_qm.verts)
    bmesh.ops.triangulate(bm_qm, faces=bm_qm.faces)
    bm_qm.verts.ensure_lookup_table(); bm_qm.faces.ensure_lookup_table()
    qm_bvh = BVHTree.FromBMesh(bm_qm)
    print(f"  QM body: {qm_body.name} ({len(qm_me.vertices)} verts)")
else:
    print("  WARNING: QM body not found, normal direction may be inaccurate")
    qm_bvh = None

# ========================================================================
# ソースBlendファイル（衣装の元データ）
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
for d in os.listdir(blend_dir or '.'):
    full = os.path.join(blend_dir, d)
    if os.path.isdir(full):
        search_dirs.append(full)
        for sub in os.listdir(full):
            if os.path.isdir(os.path.join(full, sub)):
                search_dirs.append(os.path.join(full, sub))
loaded_count = 0
for img in bpy.data.images:
    if img.size[0] == 0 and img.filepath:
        abs_path = bpy.path.abspath(img.filepath, library=img.library)
        if not os.path.isabs(abs_path): abs_path = os.path.join(blend_dir, abs_path)
        if os.path.exists(abs_path):
            img.filepath = abs_path; img.reload()
            if img.size[0] > 0: loaded_count += 1; continue
        raw_path = img.filepath.replace('//','').replace('\\','/')
        basename = raw_path.split('/')[-1]
        for sd in search_dirs:
            candidate = os.path.join(sd, basename)
            if os.path.exists(candidate):
                img.filepath = candidate; img.reload()
                if img.size[0] > 0: loaded_count += 1; break
print(f"  Force-loaded {loaded_count} textures")
bpy.context.view_layer.update()

# ソースBody
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if BODY_NAME:
    body_objs = [o for o in mesh_objects if o.name == BODY_NAME]
else:
    body_objs = [o for o in mesh_objects if 'body' in o.name.lower() and 'female' in o.name.lower()
                 or ('body' in o.name.lower() and not any(x in o.name.lower() for x in
                     ['teeth','tongue','toungue','collision','cage','eye','lash','futa']))]
if not body_objs:
    body_objs = [o for o in mesh_objects if 'body' in o.name.lower()
                 and not any(x in o.name.lower() for x in ['teeth','tongue','collision','cage','futa'])]

src_body_obj = body_objs[0]
print(f"  Source body: {src_body_obj.name}")

# ソースBody BVH
dg = bpy.context.evaluated_depsgraph_get()
eo_b = src_body_obj.evaluated_get(dg)
me_b = eo_b.to_mesh()
bm_src = bmesh.new(); bm_src.from_mesh(me_b)
bmesh.ops.transform(bm_src, matrix=src_body_obj.matrix_world, verts=bm_src.verts)
bmesh.ops.triangulate(bm_src, faces=bm_src.faces)
bm_src.verts.ensure_lookup_table(); bm_src.faces.ensure_lookup_table()
src_body_bvh = BVHTree.FromBMesh(bm_src)

# ソースBody頂点→部位（ウェイト合算）
vg_idx_to_name = {vg.index: vg.name for vg in src_body_obj.vertex_groups}
orig_verts = src_body_obj.data.vertices
body_vert_region = []
for v in orig_verts:
    rw = {}
    for g in v.groups:
        vgn = vg_idx_to_name.get(g.group, '')
        r = src_bone_map.get(vgn, 'unknown')
        if r != 'unknown': rw[r] = rw.get(r, 0) + g.weight
    best_r = max(rw, key=rw.get) if rw else 'unknown'
    body_vert_region.append(best_r)

eo_b.to_mesh_clear()

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
        gn = nt.name if hasattr(nt, 'name') else ''; im = _gim.get(gn, {}); oi = 0
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
                    else: c = bc.default_value; info['color'] = (int(c[0]*255), int(c[1]*255), int(c[2]*255))
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

# 衣装BVH
dg2 = bpy.context.evaluated_depsgraph_get(); eo_c = part_obj.evaluated_get(dg2)
me_c = eo_c.to_mesh(); bm_cloth = bmesh.new(); bm_cloth.from_mesh(me_c)
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
# 衣装カバー部位の自動検出
# ========================================================================
print("  Auto-detecting covered regions...")
region_hit_counts = defaultdict(int)
region_hit_zs = defaultdict(list)

for cloth_vert in bm_cloth.verts:
    loc, norm, face_idx, dist = src_body_bvh.find_nearest(cloth_vert.co)
    if loc is None or face_idx is None: continue
    body_face = bm_src.faces[face_idx]
    best_region = 'unknown'; best_dist = float('inf')
    for loop in body_face.loops:
        vi = loop.vert.index
        d = (bm_src.verts[vi].co - loc).length
        if d < best_dist and vi < len(body_vert_region):
            best_dist = d; best_region = body_vert_region[vi]
    if best_region != 'unknown':
        region_hit_counts[best_region] += 1
        region_hit_zs[best_region].append(loc.z)

cloth_vert_count = len(bm_cloth.verts)
min_hits = max(1, cloth_vert_count * 0.01)
BONES = set()
region_z_limits = {}

print("  Region detection results:")
for region, count in sorted(region_hit_counts.items(), key=lambda x: -x[1]):
    pct = count / cloth_vert_count * 100
    selected = count >= min_hits
    marker = 'Y' if selected else '-'
    z_str = ''
    if selected and region in region_hit_zs:
        zs = region_hit_zs[region]
        region_z_limits[region] = (min(zs), max(zs))
        z_str = f' z={min(zs):.3f}-{max(zs):.3f}'
    print(f"    [{marker}] {region}: {count} hits ({pct:.1f}%){z_str}")
    if selected: BONES.add(region)

if not BONES:
    print("ERROR: No regions detected"); sys.exit(1)
print(f"  Auto-detected: {sorted(BONES)}")

# ========================================================================
# 膜の構築: QM表面ボクセル→ソースBody対応点→衣装判定
# ========================================================================
print(f"\n  Voxelizing (v3 membrane + protrusion)...")
thr = tgt_voxel_size * 0.55
result = {}
membrane_count = 0
protrusion_count = 0
processed = 0

# 対象部位の表面ボクセルのみ
target_surface = [(pos, region) for pos, region in tgt_surface_all.items() if region in BONES]
print(f"  Target surface: {len(target_surface)} voxels")

for surf_pos, region in target_surface:
    processed += 1
    if processed % 3000 == 0:
        print(f"    {processed}/{len(target_surface)} membrane={membrane_count} protrusion={protrusion_count}")

    # QM膜ボクセルのワールド座標
    tgt_world = Vector((
        tgt_grid_origin.x + (surf_pos[0] + 0.5) * tgt_voxel_size,
        tgt_grid_origin.y + (surf_pos[1] + 0.5) * tgt_voxel_size,
        tgt_grid_origin.z + (surf_pos[2] + 0.5) * tgt_voxel_size,
    ))

    # QM Body表面の法線を取得
    tgt_norm = Vector((0, 0, 1))  # フォールバック
    if qm_bvh:
        qloc, qnorm, qfi, qdist = qm_bvh.find_nearest(tgt_world)
        if qloc is not None and qnorm is not None:
            tgt_norm = qnorm.normalized()

    # QM表面点→ソースBody表面の対応点を求める
    # ソースBody BVHでQM表面点に最も近い点を取得
    src_loc, src_norm, src_fi, src_dist = src_body_bvh.find_nearest(tgt_world)
    if src_loc is None:
        continue

    # ソース対応点で衣装メッシュが存在するか確認
    # (1) ソースBody表面上で衣装メッシュとの距離チェック
    cloth_loc, cloth_norm, cloth_fi, cloth_dist = cloth_bvh.find_nearest(src_loc)
    if cloth_loc is None:
        continue

    # 衣装メッシュがソースBody表面から一定距離以内なら衣装あり
    # Body表面から衣装までのオフセット距離を計算
    offset_dist = cloth_dist

    if offset_dist > tgt_voxel_size * 8:
        # 衣装が遠すぎる → この位置に衣装なし（肌露出）
        continue

    color = get_color(cloth_fi, cloth_loc)

    if offset_dist < tgt_voxel_size * 1.5:
        # 密着 → 膜（Body直上1ボクセル）に配置
        for dx, dy, dz in DIRS6:
            nb = (surf_pos[0]+dx, surf_pos[1]+dy, surf_pos[2]+dz)
            if nb not in tgt_body_set and nb not in result:
                if 0 <= nb[0] < tgt_gx and 0 <= nb[1] < tgt_gy and 0 <= nb[2] < tgt_gz:
                    result[nb] = color
                    membrane_count += 1
                    break
    else:
        # 突起 → Body表面から法線方向にオフセット分のボクセルを配置
        # 膜（直上）も配置
        for dx, dy, dz in DIRS6:
            nb = (surf_pos[0]+dx, surf_pos[1]+dy, surf_pos[2]+dz)
            if nb not in tgt_body_set and nb not in result:
                if 0 <= nb[0] < tgt_gx and 0 <= nb[1] < tgt_gy and 0 <= nb[2] < tgt_gz:
                    result[nb] = color
                    membrane_count += 1
                    break

        # 突起ボクセル: 法線方向に追加
        n_steps = int(offset_dist / tgt_voxel_size)
        for step_i in range(2, min(n_steps + 1, 16)):
            proto_pos = tgt_world + tgt_norm * step_i * tgt_voxel_size
            pvx = int((proto_pos.x - tgt_grid_origin.x) / tgt_voxel_size)
            pvy = int((proto_pos.y - tgt_grid_origin.y) / tgt_voxel_size)
            pvz = int((proto_pos.z - tgt_grid_origin.z) / tgt_voxel_size)
            if 0 <= pvx < tgt_gx and 0 <= pvy < tgt_gy and 0 <= pvz < tgt_gz:
                pkey = (pvx, pvy, pvz)
                if pkey not in result and pkey not in tgt_body_set:
                    result[pkey] = color
                    protrusion_count += 1

print(f"  Membrane: {membrane_count}, Protrusion: {protrusion_count}")
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

bm_cloth.free(); eo_c.to_mesh_clear(); bm_src.free()
if qm_bvh: bm_qm.free()
print("  Done!")
