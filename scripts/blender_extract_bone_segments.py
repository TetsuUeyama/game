"""
Blender Python: リグ付きモデルからボーンウェイトを抽出し、ボーンごとのセグメントにボクセル化するスクリプト。

Usage:
  blender --background --python blender_extract_bone_segments.py -- <input.blend> <output_dir> [voxel_size]

例:
  blender --background --python scripts/blender_extract_bone_segments.py -- "E:/MOdel/CyberpunkElf_ARP_MustardUI.blend" "C:/Users/user/developsecond/game-assets/vox/female/BasicBodyFemale" 0.007

出力:
  <output_dir>/segments/<bone_name>.vox   - ボーンごとのボクセルファイル
  <output_dir>/segments.json              - ボーン階層、位置、ウェイトのメタデータ
  <output_dir>/bone_map.json              - ボクセル→ボーン割り当てマップ
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

# ========================================================================
# 引数パース
# ========================================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
INPUT_PATH = args[0] if len(args) > 0 else ""       # 入力モデルファイル
OUT_DIR = args[1] if len(args) > 1 else ""            # 出力ディレクトリ
VOXEL_SIZE = float(args[2]) if len(args) > 2 else 0.007  # ボクセルサイズ

if not INPUT_PATH or not OUT_DIR:
    print("Usage: blender --background --python blender_extract_bone_segments.py -- <input.blend> <output_dir> [voxel_size]")
    sys.exit(1)

print(f"\n=== Bone Segment Voxelizer ===")
print(f"  Input: {INPUT_PATH}")
print(f"  Output: {OUT_DIR}")
print(f"  Voxel size: {VOXEL_SIZE}")

# ========================================================================
# モデル読み込み
# ========================================================================
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext == '.fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext == '.glb' or ext == '.gltf':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

os.makedirs(OUT_DIR, exist_ok=True)
seg_dir = os.path.join(OUT_DIR, "segments")
os.makedirs(seg_dir, exist_ok=True)

# ========================================================================
# アーマチュアとボディメッシュを検索
# ========================================================================
armature = None
body_obj = None

BODY_EXCLUDE_KEYWORDS = ['hair', 'eye', 'collision', 'modular', 'penis', 'pubes',
                         'eyelash', 'mouth', 'armor', 'weapon', 'extras', 'beard',
                         'helmet', 'cape', 'cs_']
for obj in bpy.context.scene.objects:
    if obj.type == 'ARMATURE':
        armature = obj
    if obj.type == 'MESH':
        name_lower = obj.name.lower()
        if 'body' in name_lower and not any(kw in name_lower for kw in BODY_EXCLUDE_KEYWORDS):
            if body_obj is None or len(obj.data.vertices) > len(body_obj.data.vertices):
                body_obj = obj

if not body_obj:
    meshes = [o for o in bpy.context.scene.objects
              if o.type == 'MESH' and o.visible_get() and len(o.vertex_groups) > 10
              and not any(kw in o.name.lower() for kw in BODY_EXCLUDE_KEYWORDS)]
    body_obj = max(meshes, key=lambda o: len(o.data.vertices)) if meshes else None

if not body_obj:
    print("ERROR: No body mesh found!")
    sys.exit(1)

if body_obj.parent and body_obj.parent.type == 'ARMATURE':
    armature = body_obj.parent
else:
    for mod in body_obj.modifiers:
        if mod.type == 'ARMATURE' and mod.object:
            armature = mod.object
            break

if not armature:
    print("ERROR: No armature found!")
    sys.exit(1)

print(f"  Armature: {armature.name}")
print(f"  Body mesh: {body_obj.name} ({len(body_obj.data.vertices)} verts)")

# 可視性確保
if not body_obj.visible_get():
    body_obj.hide_set(False)
    body_obj.hide_viewport = False
    print(f"  Made body visible: {body_obj.name}")

# MASKモディファイア無効化
for mod in body_obj.modifiers:
    if mod.type == 'MASK' and mod.show_viewport:
        mod.show_viewport = False
        print(f"  Disabled MASK: {mod.name}")

# ========================================================================
# ボーン階層とレストポジションを抽出
# ========================================================================
bone_hierarchy = {}
bone_rest_positions = {}

for bone in armature.data.bones:
    head_world = armature.matrix_world @ bone.head_local
    tail_world = armature.matrix_world @ bone.tail_local
    bone_rest_positions[bone.name] = {
        "head": [head_world.x, head_world.y, head_world.z],
        "tail": [tail_world.x, tail_world.y, tail_world.z],
        "length": bone.length,
    }
    bone_hierarchy[bone.name] = {
        "parent": bone.parent.name if bone.parent else None,
        "children": [c.name for c in bone.children],
    }

print(f"  Bones: {len(bone_rest_positions)}")
for bname in sorted(bone_rest_positions.keys()):
    h = bone_rest_positions[bname]
    parent = bone_hierarchy[bname]["parent"] or "ROOT"
    print(f"    {bname} (parent={parent}, length={h['length']:.4f})")

# ========================================================================
# 評価済みメッシュを構築
# ========================================================================
depsgraph = bpy.context.evaluated_depsgraph_get()
body_eval = body_obj.evaluated_get(depsgraph)
mesh_eval = body_eval.to_mesh()

bm = bmesh.new()
bm.from_mesh(mesh_eval)
bm.transform(body_obj.matrix_world)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.faces.ensure_lookup_table()
bm.verts.ensure_lookup_table()
bvh = BVHTree.FromBMesh(bm)

# ========================================================================
# 頂点ボーンウェイトマッピング
# ========================================================================
vertex_groups = body_obj.vertex_groups
vg_name_map = {vg.index: vg.name for vg in vertex_groups}

EXCLUDE_PREFIXES = ('hair_', 'Gloves_', 'Leggings_', 'Breasts_Simpl', 'Butts_Simpl',
                    'tie.', 'hologram', 'hipplate', 'spline_', 'dress_', 'belt_',
                    'braid_', 'cc_Cape_', 'cc_skirt_', 'cc_Armor_', 'SwordHolder',
                    'c_fist', 'c_tail_')
valid_deform_bones = set()
for bone in armature.data.bones:
    if bone.use_deform and not any(bone.name.startswith(p) for p in EXCLUDE_PREFIXES):
        valid_deform_bones.add(bone.name)
print(f"  Valid deform bones: {len(valid_deform_bones)}")

# 顔ボーンのプレフィックス（headに統合）
FACE_MERGE_PREFIXES = ('c_lips_', 'c_teeth_', 'c_nose_', 'c_chin_', 'c_cheek_',
                       'c_eyebrow_', 'c_eyelid_', 'c_eye_ref_track', 'c_eye_offset',
                       'tong_')

# ARPボーン名正規化マップ
ARP_NORMALIZE = {
    'thigh_stretch': 'c_thigh_stretch', 'thigh_twist': 'c_thigh_twist',
    'thigh_twist_2': 'c_thigh_twist_2', 'leg_stretch': 'c_leg_stretch',
    'leg_twist': 'c_leg_twist', 'leg_twist_2': 'c_leg_twist_2',
    'arm_stretch': 'c_arm_stretch', 'arm_twist_2': 'c_arm_twist_2',
    'c_arm_twist_offset': 'c_arm_twist', 'forearm_stretch': 'c_forearm_stretch',
    'forearm_twist': 'c_forearm_twist', 'forearm_twist_2': 'c_forearm_twist_2',
    'spine_01': 'c_spine_01_bend', 'spine_02': 'c_spine_02_bend',
    'spine_03': 'c_spine_03_bend', 'root': 'c_root_bend', 'cc_balls': 'c_root_bend',
}

def normalize_arp_name(name):
    """旧ARPボーン名を新ARP規約に正規化。"""
    suffix = ''
    for s in ['.l', '.r', '.x']:
        if name.endswith(s):
            base = name[:-len(s)]
            suffix = s
            break
    else:
        base = name
    if base in ARP_NORMALIZE:
        return ARP_NORMALIZE[base] + suffix
    return name

def resolve_bone_name(name):
    """細粒度ボーンをより粗いセグメント名にマッピング。"""
    name = normalize_arp_name(name)
    # 顔 → head
    if any(name.startswith(p) for p in FACE_MERGE_PREFIXES):
        return 'head.x'
    # 足指 → foot
    if name.startswith('toes_') or name.startswith('c_toes_'):
        if '.l' in name: return 'foot.l'
        elif '.r' in name: return 'foot.r'
        return 'foot.l'
    # 手指 → hand
    finger_prefixes = ('c_pinky', 'c_ring', 'c_middle', 'c_index', 'c_thumb',
                       'pinky', 'ring1', 'middle1', 'index1', 'thumb1',
                       'c_pinky1_base', 'c_ring1_base', 'c_middle1_base', 'c_index1_base')
    if any(name.startswith(p) for p in finger_prefixes):
        if '.l' in name: return 'hand.l'
        elif '.r' in name: return 'hand.r'
    # 性器/臀部 → ルート
    if name.startswith('vagina') or name == 'genital':
        return 'c_root_bend.x'
    if name.startswith('butt'):
        return 'c_root_bend.x'
    # 乳首 → 胸
    if name.startswith('nipple'):
        return 'breast' + name[-2:]
    # 口角 → head
    if name.startswith('c_lips_smile'):
        return 'head.x'
    return name

# 各頂点に最も影響力の大きいボーンを割り当て
vertex_bone_map = {}
for vert in mesh_eval.vertices:
    best_bone = None
    best_weight = 0.0
    for g in vert.groups:
        vg_name = vg_name_map.get(g.group, None)
        if vg_name and vg_name in valid_deform_bones and g.weight > best_weight:
            best_weight = g.weight
            best_bone = vg_name
    if best_bone:
        vertex_bone_map[vert.index] = resolve_bone_name(best_bone)

print(f"  Vertices with bone assignments: {len(vertex_bone_map)}/{len(mesh_eval.vertices)}")
resolved_names = sorted(set(vertex_bone_map.values()))
print(f"  Resolved segment names ({len(resolved_names)}): {resolved_names}")

# ========================================================================
# 面→ボーンのマッピング（多数決）
# ========================================================================
face_bone_map = {}
for face in bm.faces:
    bone_votes = {}
    for vert in face.verts:
        bone = vertex_bone_map.get(vert.index, None)
        if bone:
            bone_votes[bone] = bone_votes.get(bone, 0) + 1
    if bone_votes:
        face_bone_map[face.index] = max(bone_votes, key=bone_votes.get)

# ========================================================================
# テクスチャサンプリング
# ========================================================================
texture_cache = {}

def cache_texture(image):
    """テクスチャをRGBバイト配列としてキャッシュ。"""
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

def sample_texture(img_name, u, v):
    """UV座標でテクスチャの色をサンプリング。"""
    if img_name not in texture_cache: return None
    w, h, pix = texture_cache[img_name]
    px = int(u * w) % w
    py = int(v * h) % h
    pi = (py * w + px) * 3
    if pi + 2 < len(pix): return (pix[pi], pix[pi+1], pix[pi+2])
    return None

def find_base_texture(mat):
    """マテリアルからベースカラーテクスチャを検索。"""
    if not mat or not hasattr(mat, 'node_tree') or not mat.node_tree: return None
    best, best_score = None, -999
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            n = node.image.name.lower()
            score = 10 if ('basecolor' in n or 'base_color' in n or 'diffuse' in n) else (8 if 'albedo' in n else (-10 if any(k in n for k in ['normal','roughness','metallic','specular','height','opacity','ao','emissive']) else 0))
            if score > best_score: best_score, best = score, node.image
    return best

# 全マテリアルのテクスチャをキャッシュ
for mat in bpy.data.materials:
    tex = find_base_texture(mat)
    if tex: cache_texture(tex)

# ========================================================================
# バウンディングボックスとグリッド
# ========================================================================
world_verts = [body_obj.matrix_world @ v.co for v in mesh_eval.vertices]
bb_min = Vector((min(v.x for v in world_verts), min(v.y for v in world_verts), min(v.z for v in world_verts)))
bb_max = Vector((max(v.x for v in world_verts), max(v.y for v in world_verts), max(v.z for v in world_verts)))

pad = VOXEL_SIZE * 2
bb_min -= Vector((pad, pad, pad))
bb_max += Vector((pad, pad, pad))

gx = int(math.ceil((bb_max.x - bb_min.x) / VOXEL_SIZE)) + 1
gy = int(math.ceil((bb_max.y - bb_min.y) / VOXEL_SIZE)) + 1
gz = int(math.ceil((bb_max.z - bb_min.z) / VOXEL_SIZE)) + 1

print(f"\n  BBox: ({bb_min.x:.3f},{bb_min.y:.3f},{bb_min.z:.3f}) -> ({bb_max.x:.3f},{bb_max.y:.3f},{bb_max.z:.3f})")
print(f"  Grid: {gx}x{gy}x{gz} (total={gx*gy*gz})")
print(f"  Height: {bb_max.z - bb_min.z:.3f}m")

if gx > 256 or gy > 256 or gz > 256:
    print(f"  WARNING: Grid exceeds 256 in some axis! VOX format limit.")
    if gz > 256:
        print(f"  -> Will split into head/body at appropriate Z")

# ========================================================================
# ボクセル化（ボーン割り当て付き）
# ========================================================================
print(f"\n  Voxelizing...")
voxels = {}
palette_map = {}
palette_list = []

def get_palette_index(r, g, b):
    """色からパレットインデックスを取得。"""
    key = (r, g, b)
    if key in palette_map: return palette_map[key]
    idx = len(palette_list) + 1
    if idx > 255:
        best_idx, best_dist = 1, 999999
        for i, (pr, pg, pb) in enumerate(palette_list):
            d = (r-pr)**2 + (g-pg)**2 + (b-pb)**2
            if d < best_dist: best_dist, best_idx = d, i + 1
        return best_idx
    palette_map[key] = idx
    palette_list.append((r, g, b))
    return idx

thr = VOXEL_SIZE * 1.2
sz_limit = min(gz, 256)
sx_limit = min(gx, 256)
sy_limit = min(gy, 256)
uv_layer = bm.loops.layers.uv.active

import time
t0 = time.time()

for vz in range(sz_limit):
    if vz % 10 == 0:
        elapsed = time.time() - t0
        print(f"    z={vz}/{sz_limit} voxels={len(voxels)} ({elapsed:.1f}s)", flush=True)
    for vx in range(sx_limit):
        for vy in range(sy_limit):
            center = Vector((
                bb_min.x + (vx + 0.5) * VOXEL_SIZE,
                bb_min.y + (vy + 0.5) * VOXEL_SIZE,
                bb_min.z + (vz + 0.5) * VOXEL_SIZE,
            ))
            nearest, normal, face_idx, dist = bvh.find_nearest(center)
            if nearest is None or dist >= thr:
                continue

            bone_name = face_bone_map.get(face_idx, "unknown") if face_idx is not None else "unknown"
            ci = get_palette_index(200, 180, 160)

            # テクスチャサンプリング
            if face_idx is not None and uv_layer:
                face = bm.faces[face_idx]
                if face.material_index < len(body_obj.data.materials):
                    mat = body_obj.data.materials[face.material_index]
                    tex = find_base_texture(mat)
                    if tex and tex.name in texture_cache:
                        uv = face.loops[0][uv_layer].uv
                        sampled = sample_texture(tex.name, uv.x, uv.y)
                        if sampled:
                            ci = get_palette_index(*sampled)

            voxels[(vx, vy, vz)] = {"ci": ci, "bone": bone_name}

print(f"  Total voxels: {len(voxels)}")

# ========================================================================
# ボーンごとにグループ化
# ========================================================================
bone_voxels = {}
for (vx, vy, vz), info in voxels.items():
    bone = info["bone"]
    if bone not in bone_voxels: bone_voxels[bone] = []
    bone_voxels[bone].append((vx, vy, vz, info["ci"]))

print(f"\n  Bone segments:")
for bone_name in sorted(bone_voxels.keys()):
    print(f"    {bone_name}: {len(bone_voxels[bone_name])} voxels")

# ========================================================================
# VOXファイル書き出し
# ========================================================================
def write_vox(filepath, sx, sy, sz, voxel_list, pal):
    """VOXファイルを書き出す。"""
    num = len(voxel_list)
    xyzi_size = 4 + num * 4
    chunks = bytearray()
    chunks += b'SIZE' + struct.pack('<II', 12, 0) + struct.pack('<III', sx, sy, sz)
    chunks += b'XYZI' + struct.pack('<II', xyzi_size, 0) + struct.pack('<I', num)
    for x, y, z, c in voxel_list:
        chunks += struct.pack('BBBB', x, y, z, c)
    chunks += b'RGBA' + struct.pack('<II', 256 * 4, 0)
    for i in range(256):
        if i < len(pal):
            r, g, b = pal[i]
            chunks += struct.pack('BBBB', r, g, b, 255)
        else:
            chunks += struct.pack('BBBB', 0, 0, 0, 255)
    out = bytearray(b'VOX ') + struct.pack('<I', 150) + b'MAIN' + struct.pack('<II', 0, len(chunks)) + chunks
    with open(filepath, 'wb') as f:
        f.write(out)

sx = min(gx, 256)
sy = min(gy, 256)
sz = min(gz, 256)

# 各ボーンセグメントをVOXファイルとして書き出し
for bone_name, bvoxels in bone_voxels.items():
    safe_name = bone_name.replace(' ', '_').replace(':', '_').lower()
    filepath = os.path.join(seg_dir, f"{safe_name}.vox")
    write_vox(filepath, sx, sy, sz, bvoxels, palette_list)

# 全ボクセルを結合したボディVOXも書き出し
all_voxels = []
for bvoxels in bone_voxels.values():
    all_voxels.extend(bvoxels)
write_vox(os.path.join(OUT_DIR, "body", "body.vox"), sx, sy, sz, all_voxels, palette_list)

# ========================================================================
# メタデータ書き出し
# ========================================================================
# ボーン位置をボクセル座標に変換
bone_voxel_positions = {}
for bname, bdata in bone_rest_positions.items():
    hx = int((bdata["head"][0] - bb_min.x) / VOXEL_SIZE)
    hy = int((bdata["head"][1] - bb_min.y) / VOXEL_SIZE)
    hz = int((bdata["head"][2] - bb_min.z) / VOXEL_SIZE)
    tx = int((bdata["tail"][0] - bb_min.x) / VOXEL_SIZE)
    ty = int((bdata["tail"][1] - bb_min.y) / VOXEL_SIZE)
    tz = int((bdata["tail"][2] - bb_min.z) / VOXEL_SIZE)
    bone_voxel_positions[bname] = {
        "head_voxel": [hx, hy, hz], "tail_voxel": [tx, ty, tz],
        "head_world": bdata["head"], "tail_world": bdata["tail"],
        "length_world": bdata["length"],
    }

# segments.json
segments_meta = {}
for bone_name, bvoxels in bone_voxels.items():
    safe_name = bone_name.replace(' ', '_').replace(':', '_').lower()
    segments_meta[bone_name] = {"file": f"segments/{safe_name}.vox", "voxels": len(bvoxels)}

meta = {
    "model": os.path.basename(INPUT_PATH),
    "voxel_size": VOXEL_SIZE,
    "grid": {"gx": sx, "gy": sy, "gz": sz},
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
    "bone_hierarchy": bone_hierarchy,
    "bone_positions": bone_voxel_positions,
    "segments": segments_meta,
    "total_voxels": len(voxels),
}
with open(os.path.join(OUT_DIR, "segments.json"), 'w') as f:
    json.dump(meta, f, indent=2)

# grid.json
grid_meta = {
    "voxel_size": VOXEL_SIZE,
    "gx": sx, "gy": sy, "gz": sz,
    "grid_origin": [bb_min.x, bb_min.y, bb_min.z],
    "bb_min": [bb_min.x, bb_min.y, bb_min.z],
    "bb_max": [bb_max.x, bb_max.y, bb_max.z],
}
with open(os.path.join(OUT_DIR, "grid.json"), 'w') as f:
    json.dump(grid_meta, f, indent=2)

# parts.json（ビューア用）
parts = []
for bone_name, info in segments_meta.items():
    safe_name = bone_name.replace(' ', '_').replace(':', '_').lower()
    parts.append({
        "key": safe_name,
        "file": f"/{os.path.basename(OUT_DIR)}/{info['file']}",
        "voxels": info["voxels"],
        "default_on": True,
        "meshes": [bone_name],
        "is_body": True,
        "category": "body_segment",
    })
with open(os.path.join(OUT_DIR, "parts.json"), 'w') as f:
    json.dump(parts, f, indent=2)

# リソース解放
bm.free()
body_eval.to_mesh_clear()

print(f"\n=== Done ===")
print(f"  Segments: {len(bone_voxels)}")
