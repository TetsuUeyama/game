"""Blenderファイル内の全メッシュオブジェクトを階層情報付きでリスト表示するスクリプト。

Usage:
  blender --background --python list_parts.py -- <input.blend>

出力: 各メッシュの名前、親オブジェクト、頂点数、マテリアルリストを表示。
"""
# Blenderメインモジュール
import bpy
# システムモジュール
import sys
# JSON操作モジュール
import json

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
sep = argv.index("--") if "--" in argv else len(argv)
# スクリプト引数を取得
script_args = argv[sep + 1:]

# 入力ファイルパス
INPUT_PATH = script_args[0]

# ファイル拡張子に応じたインポート処理
ext = INPUT_PATH.lower().rsplit('.', 1)[-1]
if ext == 'fbx':
    # FBX形式: 既存オブジェクトを削除してからインポート
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext in ('glb', 'gltf'):
    # glTF形式: 既存オブジェクトを削除してからインポート
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
else:
    # Blend形式: 直接開く
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# MASKモディファイアを無効化（全メッシュを表示するため）
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    for mod in obj.modifiers:
        # ビューポートで有効なMASKモディファイアを無効化
        if mod.type == 'MASK' and mod.show_viewport:
            mod.show_viewport = False

# ビューレイヤーを更新
bpy.context.view_layer.update()

# ヘッダーを表示
print("\n" + "=" * 70)
print("MESH OBJECTS IN FILE")
print("=" * 70)

# メッシュオブジェクト情報を収集
parts = []
for obj in sorted(bpy.context.scene.objects, key=lambda o: o.name):
    # メッシュタイプのオブジェクトのみ処理
    if obj.type != 'MESH':
        continue
    # 可視状態を取得
    visible = obj.visible_get()
    # 頂点数を取得
    verts = len(obj.data.vertices)
    # マテリアル名のリストを取得
    mats = [m.name for m in obj.data.materials if m]
    # 親オブジェクト名を取得（なければNone）
    parent = obj.parent.name if obj.parent else None

    # パーツ情報を辞書に格納
    parts.append({
        'name': obj.name,
        'visible': visible,
        'vertices': verts,
        'materials': mats,
        'parent': parent,
    })

    # 可視状態のラベル
    status = "VISIBLE" if visible else "hidden"
    # メッシュ情報を表示
    print(f"  [{status:7s}] {obj.name}")
    print(f"           verts={verts}  parent={parent}")
    # マテリアルがあれば表示
    if mats:
        print(f"           materials: {', '.join(mats)}")

# 合計メッシュ数を表示
print(f"\nTotal: {len(parts)} mesh objects")
print("=" * 70)

# JSON形式でも出力（スクリプトからのパース用）
json_str = json.dumps(parts, indent=2, ensure_ascii=False)
print(f"\n__JSON_START__\n{json_str}\n__JSON_END__")
