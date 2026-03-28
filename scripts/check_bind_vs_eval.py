"""bone.matrix_local（バインドポーズ）とレストポーズの評価済みポーズを比較するスクリプト。"""
# Blender Python、システム、数学モジュールをインポート
import bpy, sys, math

# コマンドライン最後の引数をBlendファイルパスとして開く
bpy.ops.wm.open_mainfile(filepath=sys.argv[-1])
# ボーン数が最も多いアーマチュアをメインリグとして選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'], key=lambda o: len(o.data.bones))
# アーマチュアデータを取得
arm = rig.data

# foot.lボーンのバインドポーズ（matrix_local）を取得
bone = arm.bones['foot.l']
# ワールド空間でのバインドポーズ行列を計算
bind_mat = rig.matrix_world @ bone.matrix_local
# オイラー角に変換
be = bind_mat.to_euler()
# 位置ベクトルを抽出
bp = bind_mat.to_translation()
# バインドポーズの回転と位置を表示
print(f"BIND (bone.matrix_local): rot=({math.degrees(be.x):.2f}, {math.degrees(be.y):.2f}, {math.degrees(be.z):.2f}) pos=({bp.x:.4f}, {bp.y:.4f}, {bp.z:.4f})")

# 依存関係グラフを取得
depsgraph = bpy.context.evaluated_depsgraph_get()
# 複数のフレーム（0, 1, 73）で評価済みポーズを確認
for frame in [0, 1, 73]:
    # フレームを設定
    bpy.context.scene.frame_set(frame)
    # 依存関係グラフを更新
    depsgraph.update()
    # 評価済みリグを取得
    re = rig.evaluated_get(depsgraph)
    # 評価済みのfoot.lポーズボーンを取得
    pb = re.pose.bones['foot.l']
    # ワールド空間の評価済み行列を計算
    em = re.matrix_world @ pb.matrix
    # オイラー角に変換
    ee = em.to_euler()
    # 位置を抽出
    ep = em.to_translation()
    # バインドポーズとの差分を度単位で計算
    dx = math.degrees(ee.x - be.x)
    dy = math.degrees(ee.y - be.y)
    dz = math.degrees(ee.z - be.z)
    # 評価済みポーズの回転・位置・差分を表示
    print(f"EVAL frame {frame:3d}: rot=({math.degrees(ee.x):.2f}, {math.degrees(ee.y):.2f}, {math.degrees(ee.z):.2f}) pos=({ep.x:.4f}, {ep.y:.4f}, {ep.z:.4f}) DIFF=({dx:.2f}, {dy:.2f}, {dz:.2f})")

# 元のモデルファイルも確認
print()
# 元のCyberpunkElfモデルファイルを開く
bpy.ops.wm.open_mainfile(filepath='E:/MOdel/CyberpunkElf_ARP_MustardUI.blend')
# 100ボーン以上のアーマチュアを探す
rig2 = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        rig2 = o
        break
# 元モデルのリグが見つかった場合
if rig2:
    # foot.lボーンを取得
    bone2 = rig2.data.bones.get('foot.l')
    if bone2:
        # バインドポーズ行列を計算
        bm2 = rig2.matrix_world @ bone2.matrix_local
        # オイラー角と位置を取得
        be2 = bm2.to_euler()
        bp2 = bm2.to_translation()
        # 元モデルのバインドポーズを表示
        print(f"ORIGINAL MODEL BIND: rot=({math.degrees(be2.x):.2f}, {math.degrees(be2.y):.2f}, {math.degrees(be2.z):.2f}) pos=({bp2.x:.4f}, {bp2.y:.4f}, {bp2.z:.4f})")

        # 依存関係グラフを取得
        depsgraph2 = bpy.context.evaluated_depsgraph_get()
        # フレーム0に設定
        bpy.context.scene.frame_set(0)
        depsgraph2.update()
        # 評価済みリグを取得
        re2 = rig2.evaluated_get(depsgraph2)
        # 評価済みのfoot.lポーズボーンを取得
        pb2 = re2.pose.bones.get('foot.l')
        if pb2:
            # ワールド空間の評価済み行列を計算
            em2 = re2.matrix_world @ pb2.matrix
            ee2 = em2.to_euler()
            # バインドポーズとの差分を計算
            dx2 = math.degrees(ee2.x - be2.x)
            dy2 = math.degrees(ee2.y - be2.y)
            dz2 = math.degrees(ee2.z - be2.z)
            # 元モデルの評価済みポーズと差分を表示
            print(f"ORIGINAL MODEL EVAL: rot=({math.degrees(ee2.x):.2f}, {math.degrees(ee2.y):.2f}, {math.degrees(ee2.z):.2f}) DIFF=({dx2:.2f}, {dy2:.2f}, {dz2:.2f})")
    else:
        # foot.lが見つからない場合
        print("foot.l not found in original model")
else:
    # リグが見つからない場合
    print("No rig found in original model")

# 完了メッセージ
print("END")
