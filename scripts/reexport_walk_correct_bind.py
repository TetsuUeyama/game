"""
評価済みレストポーズをバインドポーズとして使用して歩行サイクルを再エクスポートするスクリプト。

ボクセルはコンストレイントがアクティブな状態の元モデルから抽出されたため、
バインドポーズはbone.matrix_localではなく評価済みポーズに一致させる必要がある。
"""
# Blender Python、システム、JSON、OS、数学モジュールをインポート
import bpy, sys, json, os, math
# mathutilsからMatrix型をインポート
from mathutils import Matrix

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
idx = argv.index("--") if "--" in argv else len(argv)
# スクリプト引数を取得
args = argv[idx + 1:]
WALK_PATH = args[0]   # 歩行サイクルのBlendファイルパス
ORIG_PATH = args[1]   # 元モデル（ボクセル抽出元）のBlendファイルパス
OUT_DIR = args[2]      # 出力ディレクトリ

# ========================================================================
# ステップ1: 元モデル（ボクセル抽出元）から評価済みレストポーズを取得
# ========================================================================
print("=== Step 1: Get evaluated bind pose from original model ===")
# 元モデルファイルを開く
bpy.ops.wm.open_mainfile(filepath=ORIG_PATH)

# 100ボーン以上のアーマチュアを元モデルのリグとして探す
orig_rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        orig_rig = o
        break

# リグが見つからなければエラー終了
if not orig_rig:
    print("ERROR: No rig in original model")
    sys.exit(1)

# 依存関係グラフを取得
depsgraph = bpy.context.evaluated_depsgraph_get()
# フレーム0に設定
bpy.context.scene.frame_set(0)
depsgraph.update()
# 評価済みリグを取得
orig_eval = orig_rig.evaluated_get(depsgraph)

# 全デフォームボーンの評価済みワールド行列を保存
eval_bind = {}
for bone in orig_rig.data.bones:
    if bone.use_deform:
        pb = orig_eval.pose.bones.get(bone.name)
        if pb:
            # ワールド空間での評価済み行列をコピーして保存
            eval_bind[bone.name] = (orig_eval.matrix_world @ pb.matrix).copy()

print(f"  Captured evaluated bind pose for {len(eval_bind)} deform bones")

# foot.lの比較表示（bone.matrix_local vs 評価済みポーズ）
bone_local = orig_rig.matrix_world @ orig_rig.data.bones['foot.l'].matrix_local
eval_mat = eval_bind['foot.l']
bl_e = bone_local.to_euler()  # ボーンローカルのオイラー角
ev_e = eval_mat.to_euler()    # 評価済みのオイラー角
print(f"  foot.l bone.matrix_local: ({math.degrees(bl_e.x):.1f}, {math.degrees(bl_e.y):.1f}, {math.degrees(bl_e.z):.1f})")
print(f"  foot.l evaluated:         ({math.degrees(ev_e.x):.1f}, {math.degrees(ev_e.y):.1f}, {math.degrees(ev_e.z):.1f})")
# 差分を表示（IK/FKの影響でどれだけずれているか）
print(f"  DIFF: ({math.degrees(ev_e.x-bl_e.x):.1f}, {math.degrees(ev_e.y-bl_e.y):.1f}, {math.degrees(ev_e.z-bl_e.z):.1f})")

# ========================================================================
# ステップ2: 歩行サイクルを開いて修正済みバインドポーズでエクスポート
# ========================================================================
print("\n=== Step 2: Export walk cycle with corrected bind ===")
# 歩行サイクルのBlendファイルを開く
bpy.ops.wm.open_mainfile(filepath=WALK_PATH)

# ボーン数最多のアーマチュアをメインリグとして選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Walk rig: {rig.name}")

# 座標変換行列: Blender Z-up → ビューア Y-up
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
# 座標変換行列の逆
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# デフォームボーン名のリストを取得
deform_bones = [b.name for b in arm.bones if b.use_deform]

# 元モデルの評価済みポーズを使ってバインド逆行列を構築
bind_inv = {}
fallback_count = 0  # フォールバック（matrix_local使用）のカウント
for bname in deform_bones:
    if bname in eval_bind:
        # 評価済みポーズの逆行列を使用
        bind_inv[bname] = eval_bind[bname].inverted()
    else:
        # 元モデルにないボーンはbone.matrix_localにフォールバック
        bone = arm.bones.get(bname)
        if bone:
            bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()
            fallback_count += 1

print(f"  Eval bind: {len(eval_bind)} bones, fallback: {fallback_count}")

# フレームをサンプリング
frame_start, frame_end = 73, 144  # 歩行サイクルのフレーム範囲
bone_matrices = {b: [] for b in deform_bones}  # ボーンごとのフレーム行列リスト
depsgraph = bpy.context.evaluated_depsgraph_get()

# 各フレームを処理
for frame in range(frame_start, frame_end + 1):
    # フレームを設定して依存関係グラフを更新
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    # 各デフォームボーンの行列を計算
    for bname in deform_bones:
        pb = rig_eval.pose.bones.get(bname)
        # ポーズボーンまたはバインド逆行列がなければ単位行列
        if not pb or bname not in bind_inv:
            bone_matrices[bname].append([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
            continue
        # ワールド空間のボーン行列
        mat_world = rig_eval.matrix_world @ pb.matrix
        # スキニング行列 = ワールド行列 × バインド逆行列
        skin = mat_world @ bind_inv[bname]
        # 座標変換を適用
        conv = C @ skin @ C_inv
        # 4x4行列を16要素フラット配列に変換
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[bname].append(flat)
    # 20フレームごとに進捗表示
    if (frame - frame_start) % 20 == 0:
        print(f"  Frame {frame}/{frame_end}")

# 出力: 実際にアニメーションがあるボーンのみ書き出し
ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]  # 単位行列
bones_out = {}
for bname, mats in bone_matrices.items():
    # いずれかのフレームで単位行列から有意に離れていれば出力対象
    if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
        bones_out[bname] = {"matrices": mats}

# モーションJSONファイルのパスを構築
out_path = os.path.join(OUT_DIR, "walk_cycle_arp.motion.json")
# 既存ファイルのバックアップ
bak = out_path + ".bak"
if os.path.exists(out_path):
    if os.path.exists(bak):
        os.remove(bak)
    os.rename(out_path, bak)

# JSONファイルとして書き出し
with open(out_path, 'w') as f:
    json.dump({"fps": 30, "frame_count": frame_end-frame_start+1, "bones": bones_out}, f)

# 結果を表示
print(f"\nWritten: {out_path} ({os.path.getsize(out_path)/1024/1024:.1f} MB)")

# 新旧の比較: foot.lのフレーム0の行列を表示
new = bones_out.get('foot.l', {}).get('matrices', [[]])[0]
if new:
    print(f"\nfoot.l frame 0 NEW (eval bind):")
    for r in range(3):
        print(f"  [{new[r*4]:.4f}, {new[r*4+1]:.4f}, {new[r*4+2]:.4f}, {new[r*4+3]:.4f}]")
# バックアップファイルから旧データも表示して比較
try:
    with open(bak) as f:
        old = json.load(f)['bones']['foot.l']['matrices'][0]
    print(f"foot.l frame 0 OLD (matrix_local bind):")
    for r in range(3):
        print(f"  [{old[r*4]:.4f}, {old[r*4+1]:.4f}, {old[r*4+2]:.4f}, {old[r*4+3]:.4f}]")
except:
    pass  # バックアップがなければスキップ

# 完了メッセージ
print("\nDONE")
