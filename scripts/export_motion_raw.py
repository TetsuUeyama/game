"""
モーションデータをBlenderワールド空間の生（RAW）行列としてエクスポートするスクリプト。
座標変換なし - 全てのトランスフォームがBlenderの座標系のまま。
ビューア（Babylon.js）側で全変換を処理する。

出力形式:
{
  "format": "blender_raw",
  "fps": 30,
  "frame_count": N,
  "bind_pose": {
    "boneName": [16要素float, 行優先, バインドフレームのワールド空間行列]
  },
  "animated": {
    "boneName": {
      "matrices": [[フレームごとの16要素float], ...]
    }
  }
}

Usage:
  blender --background --python export_motion_raw.py -- <anim.blend> <orig.blend> <out_dir> [frame_ranges]

  frame_ranges: "name:start-end name:start-end ..."
  例: "riding_default:769-793 riding_loop:769-900"
"""
# Blender Python、システム、JSON、OSモジュールをインポート
import bpy, sys, json, os
# mathutilsからMatrix型をインポート
from mathutils import Matrix

# コマンドライン引数を取得
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

ANIM_PATH = args[0]     # アニメーション付きBlendファイル
ORIG_PATH = args[1]     # 元モデル（バインドポーズソース）
OUT_DIR = args[2]        # 出力ディレクトリ
# フレーム範囲指定（省略時はシーン全体）
FRAME_RANGES = args[3] if len(args) > 3 else None

# 出力ディレクトリを作成
os.makedirs(OUT_DIR, exist_ok=True)

# 4x4行列を16要素の行優先フラット配列に変換するヘルパー関数
def mat_to_flat(m):
    """4x4 Matrixを16要素の行優先リストに平坦化。"""
    return [round(m[r][c], 7) for r in range(4) for c in range(4)]

# ========================================================================
# ステップ1: 元モデルからバインドポーズを取得（評価済み、ワールド空間）
# ========================================================================
print("=== Step 1: Bind pose from original model ===")
# 元モデルを開く
bpy.ops.wm.open_mainfile(filepath=ORIG_PATH)

# 100ボーン以上のアーマチュアを探す
orig_rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        orig_rig = o
        break

if not orig_rig:
    print("ERROR: No armature in original model!")
    sys.exit(1)

# 依存関係グラフで評価
depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(0)
depsgraph.update()
orig_eval = orig_rig.evaluated_get(depsgraph)

# 評価済みバインドポーズとレストバインドポーズの両方を保存
bind_eval = {}   # 評価済みポーズ（IK/FK適用後）
bind_rest = {}   # レストポーズ（bone.matrix_local）
for bone in orig_rig.data.bones:
    if bone.use_deform:
        pb = orig_eval.pose.bones.get(bone.name)
        if pb:
            # 評価済みワールド行列を保存
            bind_eval[bone.name] = mat_to_flat(orig_eval.matrix_world @ pb.matrix)
        # レストポーズのワールド行列を保存
        bind_rest[bone.name] = mat_to_flat(orig_rig.matrix_world @ bone.matrix_local)

# 元モデルのワールド行列を保持（座標系補正用）
orig_matrix_world = orig_rig.matrix_world.copy()
print(f"  Bind pose: {len(bind_eval)} eval, {len(bind_rest)} rest")
print(f"  Orig matrix_world: {[round(x,4) for row in orig_matrix_world for x in row]}")

# ========================================================================
# ステップ2: アニメーションファイルを開く
# ========================================================================
print(f"\n=== Step 2: Open animation file ===")
bpy.ops.wm.open_mainfile(filepath=ANIM_PATH)

# リグを探す（'spartan'を含まない100ボーン以上のアーマチュア優先）
rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        name_lower = o.name.lower()
        if 'spartan' not in name_lower:
            rig = o
            break

if not rig:
    # 見つからなければ最大のアーマチュアを使用
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if armatures:
        rig = max(armatures, key=lambda o: len(o.data.bones))

if not rig:
    print("ERROR: No armature found!")
    sys.exit(1)

# ワールド変換の補正行列を計算: orig_world × anim_world_inv
# アニメーションリグのワールド空間を元モデルのワールド空間にリベースする
anim_matrix_world = rig.matrix_world.copy()
anim_matrix_world_inv = anim_matrix_world.inverted()
world_correction = orig_matrix_world @ anim_matrix_world_inv
# 補正行列が単位行列かどうかチェック
is_identity = all(abs(world_correction[r][c] - (1 if r == c else 0)) < 0.0001 for r in range(4) for c in range(4))
print(f"  Anim matrix_world: {[round(x,4) for row in anim_matrix_world for x in row]}")
if not is_identity:
    print(f"  WARNING: Anim rig has different world transform than orig!")
    print(f"  Applying world correction to normalize bone matrices.")
else:
    print(f"  World transforms match - no correction needed.")

arm = rig.data
fps = int(bpy.context.scene.render.fps)
print(f"  Rig: {rig.name} ({len(arm.bones)} bones)")
print(f"  FPS: {fps}")

# デフォームボーンリスト
deform_bones = [b.name for b in arm.bones if b.use_deform]
print(f"  Deform bones: {len(deform_bones)}")

# ========================================================================
# ステップ3: エクスポート関数
# ========================================================================
def export_range(start_frame, end_frame, output_name):
    """指定フレーム範囲のワールド空間ボーン行列をエクスポート。"""
    print(f"\n  Exporting {output_name}: frames {start_frame}-{end_frame}...")
    frame_count = end_frame - start_frame + 1
    bone_matrices = {b: [] for b in deform_bones}

    depsgraph = bpy.context.evaluated_depsgraph_get()

    # 各フレームを処理
    for frame in range(start_frame, end_frame + 1):
        bpy.context.scene.frame_set(frame)
        depsgraph.update()
        rig_eval = rig.evaluated_get(depsgraph)
        for bname in deform_bones:
            ppb = rig_eval.pose.bones.get(bname)
            if not ppb:
                # ポーズボーンがなければ単位行列
                bone_matrices[bname].append([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
                continue
            # ワールド空間行列（元モデルの座標系に補正済み）
            mat_world = rig_eval.matrix_world @ ppb.matrix
            if not is_identity:
                mat_world = world_correction @ mat_world
            bone_matrices[bname].append(mat_to_flat(mat_world))
        # 20フレームごとに進捗表示
        if (frame - start_frame) % 20 == 0:
            print(f"    Frame {frame}/{end_frame}")

    # 単位行列のみのボーンをフィルタ除去
    ident = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    anim_out = {}
    for bname, mats in bone_matrices.items():
        if any(any(abs(m[i] - ident[i]) > 0.001 for i in range(16)) for m in mats):
            anim_out[bname] = {"matrices": mats}

    # 出力データ構造を構築
    out_data = {
        "format": "blender_raw",         # フォーマット識別子
        "fps": fps,                       # フレームレート
        "frame_count": frame_count,       # フレーム数
        "bind_pose_eval": bind_eval,      # 評価済みバインドポーズ
        "bind_pose_rest": bind_rest,      # レストバインドポーズ
        "animated": anim_out,             # アニメーションデータ
    }

    # JSONファイルとして出力
    out_path = os.path.join(OUT_DIR, output_name)
    with open(out_path, 'w') as f:
        json.dump(out_data, f)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"    Written: {out_path} ({size_mb:.1f} MB, {len(anim_out)} bones, {frame_count} frames)")

# ========================================================================
# ステップ4: エクスポート実行
# ========================================================================
print(f"\n=== Step 3: Export ===")

if FRAME_RANGES:
    # フレーム範囲が指定されている場合、各範囲を個別にエクスポート
    for part in FRAME_RANGES.split():
        name, rng = part.split(':')           # "name:start-end"形式をパース
        start, end = map(int, rng.split('-'))  # 開始・終了フレーム
        export_range(start, end, name + '.motion.json')
else:
    # デフォルト: シーン全体のフレーム範囲を使用
    scene_start = int(bpy.context.scene.frame_start)
    scene_end = int(bpy.context.scene.frame_end)
    export_range(scene_start, scene_end, "animation.motion.json")

# 完了メッセージ
print("\n=== DONE ===")
