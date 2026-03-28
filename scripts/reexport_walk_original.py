"""歩行サイクルを元のC*M_skin*C^-1座標変換で全ボーン再エクスポートするスクリプト。"""
# Blender Python、システム、JSON、OSモジュールをインポート
import bpy, sys, json, os
# mathutilsからMatrix型をインポート
from mathutils import Matrix

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
idx = argv.index("--") if "--" in argv else len(argv)
# スクリプト引数を取得
args = argv[idx + 1:]
# Blendファイルを開く
bpy.ops.wm.open_mainfile(filepath=args[0])

# ボーン数が最も多いアーマチュアをメインリグとして選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
# アーマチュアデータを取得
arm = rig.data
# リグ名を表示
print(f"Rig: {rig.name}")

# 座標変換行列: Blender Z-up → ビューア Y-up（(x,y,z)→(x,z,-y)）
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
# 座標変換行列の逆行列
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# デフォームボーンの名前リストを取得（use_deformフラグがオンのボーンのみ）
deform_bones = [b.name for b in arm.bones if b.use_deform]
# 各ボーンのバインドポーズ逆行列を計算
bind_inv = {}
for bname in deform_bones:
    bone = arm.bones.get(bname)
    if bone:
        # ワールド行列 × ボーンローカル行列の逆行列を計算
        bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()

# 歩行サイクルのフレーム範囲（73〜144フレーム）
frame_start, frame_end = 73, 144
# 各ボーンのフレームごとの行列を格納する辞書
bone_matrices = {b: [] for b in deform_bones}
# 依存関係グラフを取得（評価済みメッシュ・ポーズの取得に必要）
depsgraph = bpy.context.evaluated_depsgraph_get()

# 各フレームを処理
for frame in range(frame_start, frame_end + 1):
    # 現在のフレームを設定
    bpy.context.scene.frame_set(frame)
    # 依存関係グラフを更新
    depsgraph.update()
    # 評価済みのリグを取得
    rig_eval = rig.evaluated_get(depsgraph)
    # 各デフォームボーンの行列を計算
    for bname in deform_bones:
        # ポーズボーンを取得
        pb = rig_eval.pose.bones.get(bname)
        # ポーズボーンまたはバインド逆行列がなければ単位行列を追加
        if not pb or bname not in bind_inv:
            bone_matrices[bname].append([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
            continue
        # ワールド空間のボーン行列を計算
        mat_world = rig_eval.matrix_world @ pb.matrix
        # スキニング行列を計算（ワールド行列 × バインド逆行列）
        skin = mat_world @ bind_inv[bname]
        # 座標変換を適用（Blender→ビューア空間）
        conv = C @ skin @ C_inv
        # 4x4行列を16要素のフラット配列に変換（行優先、小数点7桁で丸め）
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[bname].append(flat)
    # 進捗を20フレームごとに表示
    if (frame - frame_start) % 20 == 0:
        print(f"  Frame {frame}/{frame_end}")

# 単位行列（アニメーションの有無を判定する基準）
ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
# 実際にアニメーションがあるボーンのみを出力用辞書に格納
bones_out = {}
for bname, mats in bone_matrices.items():
    # いずれかのフレームで単位行列から0.001以上離れていれば有効なアニメーション
    if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
        bones_out[bname] = {"matrices": mats}

# モーションJSONファイルとして出力
out_path = os.path.join(args[1], "walk_cycle_arp.motion.json")
with open(out_path, 'w') as f:
    json.dump({"fps": 30, "frame_count": frame_end-frame_start+1, "bones": bones_out}, f)

# 結果情報を表示
print(f"Written: {out_path} ({os.path.getsize(out_path)/1024/1024:.1f} MB, {len(bones_out)} bones)")
# foot.lの最初のフレームのtx値を検証用に表示
m = bones_out['foot.l']['matrices'][0]
print(f"foot.l[0] tx={m[3]:.4f}")
print("DONE")
