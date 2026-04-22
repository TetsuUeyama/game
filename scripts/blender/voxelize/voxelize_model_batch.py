"""モデルの全衣装・髪パーツをQM Bodyに合わせて一括ボクセル化する汎用バッチ。

v3 の膜+突起方式を内蔵し、Blender 1セッションで全パーツを処理する。

分類ルール:
- 衣装（Outfit コレクション）: v3 クロージング処理、胴体/肩は全拡張、腕/脚/頭は自動検出のまま
- 髪（Hair コレクション）: 頭部のみ、offset 閾値拡大
- Skip: Physics/Body/Eyes/Brows/Lashes/Gun/Katana/Mask/Sunglasses 等

Usage:
  blender --background <source.blend> --python voxelize_model_batch.py -- \
    <qm.blend> <qm_body.vox> <qm_grid.json> <qm_regions_dir> \
    <bone_mapping.json> <output_dir> \
    --model <nina|helena> \
    [--body-name "Body"] [--texture-dir /path] [--outfit-only NAME]
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
# 引数
# ========================================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

BODY_NAME = None
TEXTURE_DIRS = []
OUTFIT_ONLY = None
MODEL = 'nina'  # デフォルト
pos_args = []
skip_next = False
for i, a in enumerate(args):
    if skip_next: skip_next = False; continue
    if a == '--body-name' and i + 1 < len(args): BODY_NAME = args[i+1]; skip_next = True; continue
    if a == '--texture-dir' and i + 1 < len(args): TEXTURE_DIRS.append(args[i+1]); skip_next = True; continue
    if a == '--outfit-only' and i + 1 < len(args): OUTFIT_ONLY = args[i+1]; skip_next = True; continue
    if a == '--model' and i + 1 < len(args): MODEL = args[i+1]; skip_next = True; continue
    if a.startswith('--'): continue
    pos_args.append(a)

QM_BLEND = pos_args[0]
QM_BODY_VOX = pos_args[1]
QM_GRID_JSON = pos_args[2]
QM_REGIONS_DIR = pos_args[3]
SRC_BONE_MAPPING = pos_args[4]
OUT_DIR = pos_args[5]
os.makedirs(OUT_DIR, exist_ok=True)

print(f"\n=== {MODEL.capitalize()} → QM Batch Voxelizer ===")
print(f"  QM blend: {QM_BLEND}")
print(f"  Output: {OUT_DIR}")

# ========================================================================
# マクロ領域定義
# ========================================================================
MACRO_LIMBS = {'upper_arm_l','upper_arm_r','forearm_l','forearm_r','hand_l','hand_r',
               'thigh_l','thigh_r','shin_l','shin_r','foot_l','foot_r'}
MACRO_TORSO = {'hips','lower_torso','upper_torso','shoulder_l','shoulder_r'}
MACRO_HEAD  = {'head','neck'}

# ========================================================================
# モデル別設定
# ========================================================================
MODEL_CONFIGS = {
    'nina': {
        'prefix': 'nina',
        'body_default': 'Nina Body',
        'skip_colls': ['Nina Physics', 'Nina_grp_rig'],
        'hair_coll': 'Nina Hair',
        'coll_to_outfit': {
            'Nina Battlesuit': 'battlesuit',
            'Nina Biker Suit': 'biker',
            'Nina Casual': 'casual',
            'Nina Gym': 'gym',
            'Nina Intelligence Outfit': 'intel',
            'Nina Lingerie': 'lingerie',
            'Nina Swimsuit': 'swimsuit',
            'Nina T8 Swimsuit': 't8swim',
            'Nina Tekken 8': 't8',
            'Nina Wedding': 'wedding',
            'Nina Extras': 'extras',
            'Nina Hair': 'hair',
        },
    },
    'helena': {
        'prefix': 'helena',
        'body_default': 'Body',
        'skip_colls': ['Helena Body', 'Helena Physics', 'Ultimate_tongue_collection',
                       'WGTS_Helena', '[Scene]'],
        'hair_coll': 'Helena Hair',
        'coll_to_outfit': {
            'Helena Alluring Mandarin': 'mandarin',
            'Helena Default': 'default',
            'Helena Energy Up!': 'energy',
            'Helena Hot Summer': 'summer',
            'Helena Qipao': 'qipao',
            'Helena Sexy Bunny': 'bunny',
            'Helena Swimsuit': 'swimsuit',
            'Helena Witch': 'witch',
            'Helena Hair': 'hair',
        },
        # 既存 vox 命名との互換性エイリアス
        'part_aliases': {
            'shin_guard': 'shinguard',
            'crop_top': 'croptop',
            'bunny': 'suit',     # "Sexy Bunny - Bunny" → helena_bunny_suit
            'earings': 'earings',  # 既存名を維持（正しいスペルearrings ではない）
        },
    },
}

if MODEL not in MODEL_CONFIGS:
    print(f"ERROR: unknown --model {MODEL!r}. Available: {list(MODEL_CONFIGS.keys())}")
    sys.exit(1)
MCFG = MODEL_CONFIGS[MODEL]
COLL_TO_OUTFIT = MCFG['coll_to_outfit']
SKIP_COLLS = set(MCFG['skip_colls'])
HAIR_COLL = MCFG['hair_coll']
MODEL_PREFIX = MCFG['prefix']
PART_ALIASES = MCFG.get('part_aliases', {})
if BODY_NAME is None:
    BODY_NAME = MCFG['body_default']

SKIP_NAME_KEYWORDS = ['phys','collision','cage','eye','brow','lash',
                      'gun','katana','weapon','sword',
                      'mask','sunglass','glasses','iris','teeth','tongue',
                      'throwdown','cube','plane']

import unicodedata

def _ascii_fold(s):
    """アクセント付き文字をASCII化: 'Qípáo' → 'Qipao'"""
    nfkd = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))

def classify(obj):
    """Return ('clothing'|'hair'|None, outfit_name, part_name)"""
    name = obj.name
    name_l = name.lower()
    if any(x in name_l for x in SKIP_NAME_KEYWORDS): return (None,None,None)
    # 裸のbody/face系は名前でも除外
    if name_l in ('body', f'{MODEL_PREFIX} body'): return (None,None,None)
    colls = [c.name for c in obj.users_collection]
    if not colls: return (None,None,None)
    coll = colls[0]
    if coll in SKIP_COLLS: return (None,None,None)
    outfit = COLL_TO_OUTFIT.get(coll)
    if not outfit: return (None,None,None)
    # Part name: ASCII正規化してから prefix を削除
    name_ascii = _ascii_fold(name)
    coll_ascii = _ascii_fold(coll)
    prefix_patterns = [f'{coll} - ', f'{coll} ', f'{coll_ascii} - ', f'{coll_ascii} ']
    part = name_ascii
    for p in prefix_patterns:
        if part.startswith(p):
            part = part[len(p):]; break
    # fallback strip "<Prefix> "
    cap_prefix = MODEL_PREFIX.capitalize() + ' '
    if part.startswith(cap_prefix):
        part = part[len(cap_prefix):]
    part_n = part.lower().strip()
    for ch in (' ', '-', '/', '.'):
        part_n = part_n.replace(ch, '_')
    # outfit 語が part 名の先頭に残っていたら削除（"bunny bunny ears" → "ears"、"qipao qipao" → "qipao"）
    outfit_token = outfit + '_'
    while part_n.startswith(outfit_token) and part_n != outfit:
        part_n = part_n[len(outfit_token):]
    while '__' in part_n: part_n = part_n.replace('__', '_')
    part_n = part_n.strip('_')
    if not part_n: part_n = outfit  # 単一コレクション名と同じだった場合
    # エイリアス適用（既存命名との互換性）
    part_n = PART_ALIASES.get(part_n, part_n)
    kind = 'hair' if coll == HAIR_COLL else 'clothing'
    return (kind, outfit, part_n)

# ========================================================================
# QM (Target) データロード
# ========================================================================
def parse_vox_file(path):
    with open(path, 'rb') as f: data = f.read()
    sx=sy=sz=0; voxels=[]
    def parse_chunks(start, end):
        nonlocal sx,sy,sz
        off = start
        while off < end:
            if off+12 > end: break
            cid = data[off:off+4].decode('ascii', errors='replace')
            csz = struct.unpack_from('<I', data, off+4)[0]
            chz = struct.unpack_from('<I', data, off+8)[0]
            cs = off+12
            if cid == 'MAIN': parse_chunks(cs+csz, cs+csz+chz)
            elif cid == 'SIZE': sx,sy,sz = struct.unpack_from('<III', data, cs)
            elif cid == 'XYZI':
                count = struct.unpack_from('<I', data, cs)[0]
                for i in range(count):
                    x,y,z,ci = struct.unpack_from('<BBBB', data, cs+4+i*4)
                    voxels.append((x,y,z,ci))
            off += 12+csz+chz
    parse_chunks(8, len(data))
    return voxels, sx, sy, sz

with open(QM_GRID_JSON) as f: tgt_grid = json.load(f)
tgt_voxel_size = tgt_grid['voxel_size']
tgt_grid_origin = Vector(tgt_grid['grid_origin'])
tgt_gx, tgt_gy, tgt_gz = tgt_grid['gx'], tgt_grid['gy'], tgt_grid['gz']

print("  Loading QM body vox...")
tgt_voxels, tgt_sx, tgt_sy, tgt_sz = parse_vox_file(QM_BODY_VOX)
tgt_body_set = set((x,y,z) for x,y,z,ci in tgt_voxels)

tgt_voxel_region = {}
for rf in [f for f in os.listdir(QM_REGIONS_DIR) if f.startswith('region_') and f.endswith('.vox')]:
    rname = rf.replace('region_','').replace('.vox','')
    rvox, _,_,_ = parse_vox_file(os.path.join(QM_REGIONS_DIR, rf))
    for x,y,z,ci in rvox: tgt_voxel_region[(x,y,z)] = rname
print(f"  QM regions: {len(tgt_voxel_region)} voxels")

DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
tgt_surface_all = {}
for pos, region in tgt_voxel_region.items():
    for dx,dy,dz in DIRS6:
        if (pos[0]+dx,pos[1]+dy,pos[2]+dz) not in tgt_body_set:
            tgt_surface_all[pos] = region; break

# ソースボーンマッピング
with open(SRC_BONE_MAPPING) as f: src_bone_data = json.load(f)
src_bone_map = src_bone_data.get('bone_map', {})

# QM Body アペンド
print("  Loading QM body mesh...")
with bpy.data.libraries.load(QM_BLEND, link=False) as (df, dt):
    dt.objects = [n for n in df.objects]
qm_body = None
for o in dt.objects:
    if o and o.type == 'MESH' and 'body' in o.name.lower() and 'queen' in o.name.lower():
        qm_body = o; break
if not qm_body:
    for o in dt.objects:
        if o and o.type == 'MESH' and 'body' in o.name.lower(): qm_body = o; break
qm_bvh = None
bm_qm = None
if qm_body:
    bm_qm = bmesh.new(); bm_qm.from_mesh(qm_body.data)
    bmesh.ops.transform(bm_qm, matrix=qm_body.matrix_world, verts=bm_qm.verts)
    bmesh.ops.triangulate(bm_qm, faces=bm_qm.faces)
    bm_qm.verts.ensure_lookup_table(); bm_qm.faces.ensure_lookup_table()
    qm_bvh = BVHTree.FromBMesh(bm_qm)
    print(f"  QM body: {qm_body.name}")
else:
    print("  WARNING: QM body not found")

# ========================================================================
# Nina (Source) Body
# ========================================================================
# MASK モディファイア無効化
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

# テクスチャ強制ロード
blend_dir = os.path.dirname(os.path.abspath(bpy.data.filepath))
search_dirs = [blend_dir] + TEXTURE_DIRS
if os.path.isdir(blend_dir):
    for d in os.listdir(blend_dir):
        full = os.path.join(blend_dir, d)
        if os.path.isdir(full):
            search_dirs.append(full)
            for sub in os.listdir(full):
                if os.path.isdir(os.path.join(full, sub)):
                    search_dirs.append(os.path.join(full, sub))
for img in bpy.data.images:
    if img.size[0] == 0 and img.filepath:
        abs_path = bpy.path.abspath(img.filepath, library=img.library)
        if not os.path.isabs(abs_path): abs_path = os.path.join(blend_dir, abs_path)
        if os.path.exists(abs_path):
            img.filepath = abs_path
            try: img.reload()
            except Exception: pass
            if img.size[0] > 0: continue
        raw = img.filepath.replace('//','').replace('\\','/')
        basename = raw.split('/')[-1]
        for sd in search_dirs:
            cand = os.path.join(sd, basename)
            if os.path.exists(cand):
                img.filepath = cand
                try: img.reload()
                except Exception: pass
                if img.size[0] > 0: break
bpy.context.view_layer.update()

mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if BODY_NAME:
    body_objs = [o for o in mesh_objects if o.name == BODY_NAME]
else:
    body_objs = [o for o in mesh_objects if o.name == BODY_NAME]
if not body_objs:
    print(f"ERROR: body '{BODY_NAME}' not found"); sys.exit(1)
src_body_obj = body_objs[0]
print(f"  Source body: {src_body_obj.name}")

dg = bpy.context.evaluated_depsgraph_get()
eo_b = src_body_obj.evaluated_get(dg)
me_b = eo_b.to_mesh()
bm_src = bmesh.new(); bm_src.from_mesh(me_b)
bmesh.ops.transform(bm_src, matrix=src_body_obj.matrix_world, verts=bm_src.verts)
bmesh.ops.triangulate(bm_src, faces=bm_src.faces)
bm_src.verts.ensure_lookup_table(); bm_src.faces.ensure_lookup_table()
src_body_bvh = BVHTree.FromBMesh(bm_src)

vg_idx_to_name = {vg.index: vg.name for vg in src_body_obj.vertex_groups}
orig_verts = src_body_obj.data.vertices
body_vert_region = []
for v in orig_verts:
    rw = {}
    for g in v.groups:
        vgn = vg_idx_to_name.get(g.group, '')
        r = src_bone_map.get(vgn, 'unknown')
        if r != 'unknown': rw[r] = rw.get(r, 0) + g.weight
    body_vert_region.append(max(rw, key=rw.get) if rw else 'unknown')
eo_b.to_mesh_clear()

# ========================================================================
# マテリアル評価ヘルパ（パーツごとに作り直す）
# ========================================================================
texture_cache = {}
def cache_texture(image):
    if image.name in texture_cache: return
    w,h = image.size
    if w==0 or h==0: return
    try:
        px = np.array(image.pixels[:], dtype=np.float32).reshape(h,w,4)
        texture_cache[image.name] = {'w':w,'h':h,'px':px}
    except Exception: pass

def sample_texture(tn, ux, uy):
    tc = texture_cache.get(tn)
    if not tc: return (0.7,0.5,0.4)
    px = tc['px']; w,h = tc['w'], tc['h']
    ix = int(ux*w) % w; iy = int(uy*h) % h
    return (float(px[iy,ix,0]), float(px[iy,ix,1]), float(px[iy,ix,2]))

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

def trace_output(nt, nd, os_sock):
    if nd.type == 'REROUTE': return trace_input(nt, nd, 'Input')
    elif nd.type == 'TEX_IMAGE' and nd.image:
        cache_texture(nd.image); return ('texture', nd.image.name)
    elif nd.type == 'MIX':
        bt = nd.blend_type if hasattr(nd,'blend_type') else 'MIX'
        f = trace_input(nt,nd,'Factor'); a = trace_input(nt,nd,'A'); b = trace_input(nt,nd,'B')
        if f[0]=='value' and f[1]<=0.001: return a
        if f[0]=='value' and f[1]>=0.999 and bt=='MIX': return b
        if bt == 'MULTIPLY':
            def is_ao(t): return t[0]=='texture' and 'ao' in t[1].lower()
            if is_ao(b): return a
            if is_ao(a): return b
        return ('mix', bt, f, a, b)
    elif nd.type == 'MIX_RGB':
        bt = nd.blend_type if hasattr(nd,'blend_type') else 'MIX'
        f = trace_input(nt,nd,'Fac'); a = trace_input(nt,nd,'Color1'); b = trace_input(nt,nd,'Color2')
        if f[0]=='value' and f[1]<=0.001: return a
        if f[0]=='value' and f[1]>=0.999 and bt=='MIX': return b
        return ('mix', bt, f, a, b)
    elif nd.type == 'VALUE': return ('value', float(nd.outputs[0].default_value))
    elif nd.type == 'BSDF_PRINCIPLED':
        return trace_input(nt, nd, 'Base Color')
    else:
        for inp in nd.inputs:
            if inp.is_linked:
                src = inp.links[0].from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    cache_texture(src.image); return ('texture', src.image.name)
        return ('color', (0.7,0.5,0.4))

def eval_tree(tree, ux, uy):
    k = tree[0]
    if k == 'texture': return sample_texture(tree[1], ux, uy)
    elif k == 'color': return tree[1]
    elif k == 'value': v = tree[1]; return (v,v,v)
    elif k == 'mix':
        _,bt,ft,at,btt = tree
        fv = eval_tree(ft,ux,uy); f = fv[0] if isinstance(fv,tuple) else fv
        f = max(0.0, min(1.0, f)); a = eval_tree(at,ux,uy); b = eval_tree(btt,ux,uy)
        if bt == 'MULTIPLY':
            return (a[0]*(1-f)+a[0]*b[0]*f, a[1]*(1-f)+a[1]*b[1]*f, a[2]*(1-f)+a[2]*b[2]*f)
        return (a[0]*(1-f)+b[0]*f, a[1]*(1-f)+b[1]*f, a[2]*(1-f)+b[2]*f)
    return (0.7,0.5,0.4)

# ========================================================================
# パーツ処理本体
# ========================================================================
def expand_macros(detected, hit_counts):
    """ドミナント・マクロ（最も多くヒットしたマクロ）だけを全領域に拡張する。
    胴体・肩の分類が不正確な場合への対処。腕/脚/頭は過剰拡張しないよう温存。
    ドミナント率が 70% 超のときは非ドミナント・マクロのノイズ領域を除外。"""
    out = set(detected)
    macros = {'limbs': MACRO_LIMBS, 'torso': MACRO_TORSO, 'head_neck': MACRO_HEAD}
    macro_hits = {name: sum(hit_counts.get(r, 0) for r in regs) for name, regs in macros.items()}
    total = sum(macro_hits.values())
    if total == 0: return out
    dominant = max(macro_hits, key=macro_hits.get)
    dominant_ratio = macro_hits[dominant] / total
    # ドミナントが全体の50%未満なら拡張せず自動検出のまま
    if dominant_ratio < 0.5: return out
    if dominant == 'torso':
        out |= MACRO_TORSO
    elif dominant == 'head_neck':
        out |= MACRO_HEAD
    # limbs: 拡張しない（腕/脚/手/足の精度は元々良いため）
    # ドミナントが強い場合は他マクロのスピルオーバーを除去
    if dominant_ratio > 0.70:
        out &= macros[dominant]
    return out

def process_part(part_obj, out_path, is_hair=False):
    # 衣装BVH + マテリアル
    mat_info = {}
    for mat in part_obj.data.materials:
        if mat is None or mat.name in mat_info: continue
        info = {'eval_tree': None, 'color': (180,180,180)}
        if mat.use_nodes:
            for nd in mat.node_tree.nodes:
                if nd.type == 'BSDF_PRINCIPLED':
                    bc = nd.inputs.get('Base Color')
                    if bc:
                        if bc.is_linked: info['eval_tree'] = trace_input(mat.node_tree, nd, 'Base Color')
                        else: c = bc.default_value; info['color'] = (int(c[0]*255),int(c[1]*255),int(c[2]*255))
                    break
        mat_info[mat.name] = info

    dg2 = bpy.context.evaluated_depsgraph_get()
    eo_c = part_obj.evaluated_get(dg2)
    me_c = eo_c.to_mesh()
    bm_cloth = bmesh.new(); bm_cloth.from_mesh(me_c)
    bmesh.ops.transform(bm_cloth, matrix=part_obj.matrix_world, verts=bm_cloth.verts)
    bmesh.ops.triangulate(bm_cloth, faces=bm_cloth.faces)
    bm_cloth.verts.ensure_lookup_table(); bm_cloth.faces.ensure_lookup_table()
    uv_layer = bm_cloth.loops.layers.uv.active
    cloth_bvh = BVHTree.FromBMesh(bm_cloth)

    def get_uv_at(fi, loc):
        face = bm_cloth.faces[fi]
        if not uv_layer: return None
        loops = face.loops
        v0,v1,v2 = [l.vert.co for l in loops]
        uv0,uv1,uv2 = loops[0][uv_layer].uv, loops[1][uv_layer].uv, loops[2][uv_layer].uv
        d0 = v1-v0; d1 = v2-v0; d2 = loc-v0
        dn = d0.dot(d0)*d1.dot(d1) - d0.dot(d1)**2
        if abs(dn) < 1e-12: return None
        inv = 1.0/dn
        ub = (d1.dot(d1)*d0.dot(d2)-d0.dot(d1)*d1.dot(d2))*inv
        vb = (d0.dot(d0)*d1.dot(d2)-d0.dot(d1)*d0.dot(d2))*inv
        wb = 1-ub-vb
        return (wb*uv0.x+ub*uv1.x+vb*uv2.x, wb*uv0.y+ub*uv1.y+vb*uv2.y)

    def get_color(fi, loc):
        face = bm_cloth.faces[fi]; ms = face.material_index
        mats = part_obj.data.materials
        mn = mats[ms].name if ms < len(mats) and mats[ms] else None
        mi = mat_info.get(mn)
        if mi and mi.get('eval_tree'):
            uv = get_uv_at(fi, loc)
            if uv:
                rgb = eval_tree(mi['eval_tree'], uv[0], uv[1])
                return (max(0,min(255,int(rgb[0]*255))), max(0,min(255,int(rgb[1]*255))), max(0,min(255,int(rgb[2]*255))))
        return mi.get('color', (180,180,180)) if mi else (180,180,180)

    # 自動部位検出
    region_hit = defaultdict(int)
    for cv in bm_cloth.verts:
        loc, n, fi, d = src_body_bvh.find_nearest(cv.co)
        if loc is None or fi is None: continue
        body_face = bm_src.faces[fi]
        best_r, best_d = 'unknown', float('inf')
        for loop in body_face.loops:
            vi = loop.vert.index
            dd = (bm_src.verts[vi].co - loc).length
            if dd < best_d and vi < len(body_vert_region):
                best_d = dd; best_r = body_vert_region[vi]
        if best_r != 'unknown': region_hit[best_r] += 1

    total = max(1, len(bm_cloth.verts))
    min_hits = max(1, total * 0.03)  # 3%以上のヒットのみ採用（ノイズ除去）
    BONES = set(r for r,c in region_hit.items() if c >= min_hits)
    if is_hair:
        # 髪は必ず頭に限定
        BONES = MACRO_HEAD.copy()
    else:
        BONES = expand_macros(BONES, region_hit)

    if not BONES:
        print(f"    no regions"); bm_cloth.free(); eo_c.to_mesh_clear(); return False

    # ボクセル化
    max_offset_mult = 30 if is_hair else 8
    max_protrusion_steps = 64 if is_hair else 16
    thr = tgt_voxel_size * 0.55
    result = {}
    mem = 0; pro = 0

    target_surface = [(p,r) for p,r in tgt_surface_all.items() if r in BONES]
    for surf_pos, region in target_surface:
        tgt_world = Vector((
            tgt_grid_origin.x + (surf_pos[0]+0.5)*tgt_voxel_size,
            tgt_grid_origin.y + (surf_pos[1]+0.5)*tgt_voxel_size,
            tgt_grid_origin.z + (surf_pos[2]+0.5)*tgt_voxel_size,
        ))
        tgt_norm = Vector((0,0,1))
        if qm_bvh:
            ql, qn, _, _ = qm_bvh.find_nearest(tgt_world)
            if qn is not None: tgt_norm = qn.normalized()
        sl, sn, sfi, sd = src_body_bvh.find_nearest(tgt_world)
        if sl is None: continue
        cl, cn, cfi, cd = cloth_bvh.find_nearest(sl)
        if cl is None: continue
        offset_dist = cd
        if offset_dist > tgt_voxel_size * max_offset_mult: continue
        color = get_color(cfi, cl)
        # 膜（直上1ボクセル）
        for dx,dy,dz in DIRS6:
            nb = (surf_pos[0]+dx, surf_pos[1]+dy, surf_pos[2]+dz)
            if nb not in tgt_body_set and nb not in result:
                if 0<=nb[0]<tgt_gx and 0<=nb[1]<tgt_gy and 0<=nb[2]<tgt_gz:
                    result[nb] = color; mem += 1; break
        # 突起
        if offset_dist >= tgt_voxel_size * 1.5:
            n_steps = int(offset_dist / tgt_voxel_size)
            for step_i in range(2, min(n_steps+1, max_protrusion_steps)):
                pp = tgt_world + tgt_norm * step_i * tgt_voxel_size
                pvx = int((pp.x - tgt_grid_origin.x)/tgt_voxel_size)
                pvy = int((pp.y - tgt_grid_origin.y)/tgt_voxel_size)
                pvz = int((pp.z - tgt_grid_origin.z)/tgt_voxel_size)
                if 0<=pvx<tgt_gx and 0<=pvy<tgt_gy and 0<=pvz<tgt_gz:
                    pk = (pvx,pvy,pvz)
                    if pk not in result and pk not in tgt_body_set:
                        result[pk] = color; pro += 1

    bm_cloth.free(); eo_c.to_mesh_clear()

    if not result:
        print(f"    no voxels generated")
        return False

    # VOX 出力
    def quantize(c, step=4):
        return (min(255,(c[0]//step)*step+step//2),
                min(255,(c[1]//step)*step+step//2),
                min(255,(c[2]//step)*step+step//2))
    step = 4
    qr = {p: quantize(c,step) for p,c in result.items()}
    uq = set(qr.values())
    while len(uq) > 255:
        step *= 2
        qr = {p: quantize(c,step) for p,c in result.items()}
        uq = set(qr.values())
    colors = list(uq)
    cidx = {c: i+1 for i,c in enumerate(colors)}
    vlist = [(p[0],p[1],p[2],cidx[c]) for p,c in qr.items()]

    def write_vox(path, sx, sy, sz, voxels, pal):
        def ck(tag, data): return tag.encode() + struct.pack('<II', len(data), 0) + data
        sd = struct.pack('<III', sx, sy, sz)
        xd = struct.pack('<I', len(voxels))
        for v in voxels: xd += struct.pack('<BBBB', v[0],v[1],v[2],v[3])
        rd = b''
        for i in range(256):
            if i < len(pal): rd += struct.pack('<BBBB', pal[i][0], pal[i][1], pal[i][2], 255)
            else: rd += struct.pack('<BBBB', 0,0,0,255)
        children = ck('SIZE',sd) + ck('XYZI',xd) + ck('RGBA',rd)
        main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
        with open(path, 'wb') as f: f.write(b'VOX ' + struct.pack('<I', 150) + main)

    write_vox(out_path, tgt_gx, tgt_gy, tgt_gz, vlist, colors)
    print(f"    -> {os.path.basename(out_path)}: {len(vlist)} vox, membrane={mem} protrusion={pro}, regions={sorted(BONES)[:5]}{'...' if len(BONES)>5 else ''}")
    return True

# ========================================================================
# メインループ
# ========================================================================
processed = 0
skipped = 0
failed = 0

# 対象パーツを収集
targets = []  # (kind, outfit, part, obj)
for obj in mesh_objects:
    if obj == src_body_obj: continue
    kind, outfit, part = classify(obj)
    if kind is None: skipped += 1; continue
    if OUTFIT_ONLY and outfit != OUTFIT_ONLY: continue
    targets.append((kind, outfit, part, obj))

print(f"\n  Found {len(targets)} target parts ({skipped} skipped)\n")

for kind, outfit, part, obj in targets:
    out_name = f"{MODEL_PREFIX}_{outfit}_{part}.vox"
    out_path = os.path.join(OUT_DIR, out_name)
    print(f"  [{kind}] {obj.name}  →  {out_name}")
    try:
        ok = process_part(obj, out_path, is_hair=(kind == 'hair'))
        if ok: processed += 1
        else: failed += 1
    except Exception as e:
        import traceback
        print(f"    ERROR: {e}"); traceback.print_exc()
        failed += 1

print(f"\n=== Summary ===")
print(f"  Processed: {processed}")
print(f"  Failed:    {failed}")
print(f"  Skipped:   {skipped}")
if bm_qm: bm_qm.free()
bm_src.free()
print("  Done!")
