"""マテリアルノードツリーをデバッグしてテクスチャトレースが失敗する原因を調査するスクリプト。

Usage:
  blender --background --python debug_materials.py -- <input.blend>
"""
# Blenderメインモジュール
import bpy
# システムモジュール
import sys

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
    # FBX形式: 既存オブジェクトを削除してインポート
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext in ('glb', 'gltf'):
    # glTF形式: 既存オブジェクトを削除してインポート
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
        if mod.type == 'MASK' and mod.show_viewport:
            mod.show_viewport = False

# ビューレイヤーを更新
bpy.context.view_layer.update()

# 可視メッシュから使用されているユニークなマテリアルを収集
seen_mats = set()
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or not obj.visible_get():
        continue
    for mat in obj.data.materials:
        if mat and mat.name not in seen_mats:
            seen_mats.add(mat.name)

# ヘッダーを表示
print("\n" + "=" * 70)
print("MATERIAL NODE TREE DEBUG")
print("=" * 70)

# 各マテリアルのノードツリーを解析
for mat_name in sorted(seen_mats):
    mat = bpy.data.materials.get(mat_name)
    # ノードを使用していないマテリアル
    if not mat or not mat.use_nodes:
        print(f"\n--- {mat_name}: no nodes ---")
        continue

    print(f"\n--- {mat_name} ---")
    nt = mat.node_tree

    # Principled BSDFノードを探す
    principled = None
    for nd in nt.nodes:
        if nd.type == 'BSDF_PRINCIPLED':
            principled = nd
            break

    # Principled BSDFが見つからない場合
    if not principled:
        print("  No Principled BSDF found")
        # 存在するノードタイプを表示
        print(f"  Nodes: {[n.type + '(' + n.name + ')' for n in nt.nodes]}")
        continue

    # Base Colorインプットを取得
    bc = principled.inputs.get('Base Color')
    if not bc:
        print("  No Base Color input")
        continue

    # リンクされていない場合（単色）
    if not bc.is_linked:
        c = bc.default_value
        print(f"  Base Color: solid ({c[0]:.3f}, {c[1]:.3f}, {c[2]:.3f})")
        continue

    # Base Colorからリンクチェーンを再帰的にトレースする関数
    def trace_chain(node_tree, node, depth=0):
        indent = "  " * (depth + 1)
        # ノードタイプと名前を表示
        print(f"{indent}Node: {node.type} ({node.name})")

        # テクスチャイメージノードの場合
        if node.type == 'TEX_IMAGE':
            if node.image:
                # 画像情報を表示
                print(f"{indent}  Image: {node.image.name} ({node.image.size[0]}x{node.image.size[1]})")
                print(f"{indent}  Filepath: {node.image.filepath}")
                print(f"{indent}  Packed: {node.image.packed_file is not None}")
            else:
                print(f"{indent}  No image loaded")
            return

        # グループノードの場合（ノードグループの内部を探索）
        if node.type == 'GROUP' and node.node_tree:
            gt = node.node_tree
            print(f"{indent}  Group: {gt.name}")
            # グループの入力を表示
            print(f"{indent}  Inputs: {[(i, inp.name, inp.type) for i, inp in enumerate(node.inputs)]}")
            # リンクされた入力を追跡
            for i, inp in enumerate(node.inputs):
                if inp.is_linked:
                    src = inp.links[0].from_node
                    print(f"{indent}  Input[{i}] '{inp.name}' <- {src.type}({src.name})")
                    trace_chain(node_tree, src, depth + 1)
            # グループ出力ノードを探して内部チェーンを追跡
            for gn in gt.nodes:
                if gn.type == 'GROUP_OUTPUT':
                    print(f"{indent}  GroupOutput inputs: {[(i, inp.name) for i, inp in enumerate(gn.inputs)]}")
                    for i, inp in enumerate(gn.inputs):
                        if inp.is_linked:
                            gsrc = inp.links[0].from_node
                            print(f"{indent}  GroupOut[{i}] <- {gsrc.type}({gsrc.name})")
                            trace_chain(gt, gsrc, depth + 2)
            return

        # MIXノードの場合
        if node.type in ('MIX', 'MIX_RGB'):
            bt = getattr(node, 'blend_type', 'MIX')
            print(f"{indent}  Blend: {bt}")

        # SEPARATE_COLORノードの場合
        if node.type == 'SEPARATE_COLOR':
            print(f"{indent}  Mode: {getattr(node, 'mode', '?')}")

        # 全リンク入力を再帰的にトレース
        for inp in node.inputs:
            if inp.is_linked:
                src = inp.links[0].from_node
                src_socket = inp.links[0].from_socket
                print(f"{indent}  '{inp.name}' <- {src.type}({src.name}).{src_socket.name}")
                trace_chain(node_tree, src, depth + 1)
            else:
                # リンクされていない入力のデフォルト値を表示
                val = inp.default_value
                if hasattr(val, '__len__') and len(val) >= 3:
                    print(f"{indent}  '{inp.name}' = ({val[0]:.3f}, {val[1]:.3f}, {val[2]:.3f})")
                elif hasattr(val, '__float__'):
                    print(f"{indent}  '{inp.name}' = {float(val):.3f}")

    # Base Colorにリンクされたノードからチェーンをトレース開始
    link = bc.links[0]
    print(f"  Base Color <- {link.from_node.type}({link.from_node.name}).{link.from_socket.name}")
    trace_chain(nt, link.from_node, 1)

# フッターを表示
print("\n" + "=" * 70)
