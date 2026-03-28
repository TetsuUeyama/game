"""
武器GLBファイルの構造を調査するスクリプト。
メッシュ名、マテリアル割り当て、頂点グループ、マテリアルごとのバウンディングボックスを確認。
ハンドル/ブレードのパーツ分離が可能かどうかの判断材料を収集する。
"""
# Blenderのメインモジュール
import bpy
# BMesh操作モジュール（メッシュ解析用）
import bmesh
# システムモジュール
import sys
# OS操作モジュール
import os
# JSON操作モジュール
import json
# mathutilsからVector型をインポート
from mathutils import Vector

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
idx = argv.index("--") if "--" in argv else len(argv)
# スクリプト引数を取得
args = argv[idx + 1:]
# 入力GLBファイルパス
INPUT_PATH = args[0] if len(args) > 0 else ""

# 入力パスが未指定の場合はUsageを表示して終了
if not INPUT_PATH:
    print("Usage: blender --background --python inspect_weapon_structure.py -- <input.glb>")
    sys.exit(1)

# シーンの全オブジェクトを選択して削除（クリーンな状態にする）
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ファイル拡張子に応じたインポート処理
ext = os.path.splitext(INPUT_PATH)[1].lower()
if ext in ('.glb', '.gltf'):
    # glTF形式でインポート
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
elif ext == '.fbx':
    # FBX形式でインポート
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)

# ファイルヘッダーを表示
print(f"\n{'='*60}")
print(f"FILE: {os.path.basename(INPUT_PATH)}")
print(f"{'='*60}")

# シーン内の全メッシュオブジェクトを取得
all_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# メッシュ数を表示
print(f"\nMesh count: {len(all_meshes)}")

# 各メッシュオブジェクトを詳細分析
for obj in all_meshes:
    # メッシュ名を表示
    print(f"\n--- Mesh: '{obj.name}' ---")
    # ワールド変換行列を取得
    mat_world = obj.matrix_world

    # マテリアル情報を表示
    print(f"  Materials ({len(obj.material_slots)}):")
    for mi, ms in enumerate(obj.material_slots):
        mat = ms.material
        mat_name = mat.name if mat else "(none)"
        # マテリアルの色情報を取得
        color = "(unknown)"
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                # Principled BSDFノードから色とメタリック値を取得
                if node.type == 'BSDF_PRINCIPLED':
                    bc = node.inputs.get('Base Color')
                    if bc and not bc.is_linked:
                        c = bc.default_value
                        color = f"RGB({c[0]:.2f}, {c[1]:.2f}, {c[2]:.2f})"
                    met = node.inputs.get('Metallic')
                    met_val = met.default_value if met and not met.is_linked else "?"
                    print(f"    [{mi}] {mat_name}: {color}, metallic={met_val}")
                    break

    # 頂点グループ情報を表示
    if obj.vertex_groups:
        print(f"  Vertex Groups ({len(obj.vertex_groups)}):")
        for vg in obj.vertex_groups:
            print(f"    - {vg.name}")

    # マテリアルごとのバウンディングボックスを計算
    depsgraph = bpy.context.evaluated_depsgraph_get()
    # 評価済みオブジェクトからメッシュを取得
    obj_eval = obj.evaluated_get(depsgraph)
    mesh = obj_eval.to_mesh()

    # メッシュを三角形化（面の分析を正確にするため）
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()

    # マテリアルインデックスごとに頂点をグループ化
    mat_verts = {}
    for poly in mesh.polygons:
        mi = poly.material_index
        if mi not in mat_verts:
            mat_verts[mi] = []
        # 頂点をワールド座標に変換して格納
        for vi in poly.vertices:
            wv = mat_world @ Vector(mesh.vertices[vi].co)
            mat_verts[mi].append(wv)

    # マテリアルごとのバウンディングボックスを表示
    print(f"  Per-material bounding boxes:")
    for mi in sorted(mat_verts.keys()):
        verts = mat_verts[mi]
        # 各軸の最小・最大値を計算
        bb_min = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
        bb_max = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
        # マテリアル名を取得
        mat_name = obj.material_slots[mi].material.name if mi < len(obj.material_slots) and obj.material_slots[mi].material else "?"
        # Z方向の範囲を表示
        z_range = f"Z: {bb_min.z:.3f} ~ {bb_max.z:.3f}"
        # 高さを計算
        height = bb_max.z - bb_min.z
        # 面数も合わせて表示
        print(f"    [{mi}] {mat_name}: {z_range} (height: {height:.3f}m) | faces: {sum(1 for p in mesh.polygons if p.material_index == mi)}")

    # メッシュ全体のバウンディングボックスを表示
    all_v = [mat_world @ Vector(v.co) for v in mesh.vertices]
    total_min_z = min(v.z for v in all_v)
    total_max_z = max(v.z for v in all_v)
    total_h = total_max_z - total_min_z
    print(f"  Total height: {total_h:.3f}m (Z: {total_min_z:.3f} ~ {total_max_z:.3f})")

    # 一時メッシュデータを解放
    obj_eval.to_mesh_clear()
