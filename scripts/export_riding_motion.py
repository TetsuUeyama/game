"""
CyberpunkElf_Riding.blendから騎乗モーションのバリエーションをエクスポートするスクリプト。

Blendファイルにはレイヤード化されたNLAアニメーションがある。各フレームで
depsgraphを評価して最終的な合成ポーズ（IK解決、コンストレイント適用、NLAブレンド）を
キャプチャする。

Usage:
  blender --background --python export_riding_motion.py -- <riding.blend> <orig.blend> <out_dir>
"""
# Blender Python、システム、JSON、OS、数学モジュールをインポート
import bpy, sys, json, os, math
# mathutilsからMatrix型をインポート
from mathutils import Matrix

# コマンドライン引数を取得
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
RIDE_PATH = args[0]   # 騎乗アニメーションのBlendファイル
ORIG_PATH = args[1]   # 元モデル（バインドポーズソース）
OUT_DIR = args[2]      # 出力ディレクトリ

# 出力ディレクトリを作成
os.makedirs(OUT_DIR, exist_ok=True)

# Blender→ビューア座標変換行列（Z-up右手系 → ビューア空間）
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# ========================================================================
# ステップ1: 元モデルから評価済みバインドポーズを取得
# ========================================================================
print("=== Step 1: Bind pose from original model ===")
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

# 全デフォームボーンの評価済みバインドポーズを保存
eval_bind = {}
for bone in orig_rig.data.bones:
    if bone.use_deform:
        pb = orig_eval.pose.bones.get(bone.name)
        if pb:
            eval_bind[bone.name] = (orig_eval.matrix_world @ pb.matrix).copy()

print(f"  Bind pose: {len(eval_bind)} deform bones")

# ========================================================================
# ステップ2: 騎乗ファイルを開く
# ========================================================================
print(f"\n=== Step 2: Open riding file ===")
bpy.ops.wm.open_mainfile(filepath=RIDE_PATH)

# CyberpunkElfリグを探す（Spartanリグは除外）
rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        name_lower = o.name.lower()
        if 'spartan' not in name_lower:
            rig = o
            break

if not rig:
    # フォールバック: 最大のアーマチュア
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if armatures:
        rig = max(armatures, key=lambda o: len(o.data.bones))

if not rig:
    print("ERROR: No armature found!")
    sys.exit(1)

arm = rig.data
fps = int(bpy.context.scene.render.fps)
print(f"  Rig: {rig.name} ({len(arm.bones)} bones)")
print(f"  FPS: {fps}")

# デフォームボーンリストを取得
deform_bones = [b.name for b in arm.bones if b.use_deform]
print(f"  Deform bones: {len(deform_bones)}")

# バインド逆行列を構築
bind_inv = {}
fallback_count = 0
for bname in deform_bones:
    if bname in eval_bind:
        bind_inv[bname] = eval_bind[bname].inverted()
    else:
        bone = arm.bones.get(bname)
        if bone:
            bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()
            fallback_count += 1
print(f"  Bind inv: {len(eval_bind)} eval, {fallback_count} fallback")

# ========================================================================
# ステップ3: サンプリングで騎乗フレーム範囲を検出
# ========================================================================
print(f"\n=== Step 3: Detect frame ranges ===")

# シーン範囲は121-1560。騎乗アクションのキーフレームは769-793にある。
# NLAストリップが0-1570にマッピングしている。
scene_start = int(bpy.context.scene.frame_start)
scene_end = int(bpy.context.scene.frame_end)
print(f"  Scene: {scene_start}-{scene_end}")

# タイムライン全体でヒップボーンの位置をサンプリング
depsgraph = bpy.context.evaluated_depsgraph_get()
hip_bone = 'c_root_bend.x'

print(f"\n  Sampling hip position across timeline...")
sample_frames = list(range(scene_start, scene_end + 1, 50))
for frame in sample_frames:
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    pb = rig_eval.pose.bones.get(hip_bone)
    if pb:
        pos = (rig_eval.matrix_world @ pb.matrix).to_translation()
        print(f"    f={frame:4d}: hip=({pos.x:.3f}, {pos.y:.3f}, {pos.z:.3f})")

# 騎乗アクション範囲（769-793）を確認
print(f"\n  Checking riding range (769-793)...")
for frame in [769, 775, 781, 787, 793]:
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    pb = rig_eval.pose.bones.get(hip_bone)
    if pb:
        pos = (rig_eval.matrix_world @ pb.matrix).to_translation()
        print(f"    f={frame}: hip=({pos.x:.3f}, {pos.y:.3f}, {pos.z:.3f})")

# ========================================================================
# ステップ4: エクスポート関数
# ========================================================================
def export_range(start_frame, end_frame, output_name):
    """指定フレーム範囲の評価済みアニメーションをエクスポート。"""
    print(f"\n  Exporting {output_name}: frames {start_frame}-{end_frame}...")
    frame_count = end_frame - start_frame + 1
    bone_matrices = {b: [] for b in deform_bones}

    for frame in range(start_frame, end_frame + 1):
        bpy.context.scene.frame_set(frame)
        depsgraph.update()
        rig_eval = rig.evaluated_get(depsgraph)
        for bname in deform_bones:
            ppb = rig_eval.pose.bones.get(bname)
            if not ppb or bname not in bind_inv:
                bone_matrices[bname].append([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
                continue
            # スキニング行列を計算して座標変換
            mat_world = rig_eval.matrix_world @ ppb.matrix
            skin = mat_world @ bind_inv[bname]
            conv = C @ skin @ C_inv
            flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
            bone_matrices[bname].append(flat)
        # 10フレームごとに進捗表示
        if (frame - start_frame) % 10 == 0:
            print(f"    Frame {frame}/{end_frame}")

    # 単位行列のみのボーンをフィルタ除去
    ident = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    bones_out = {}
    for bname, mats in bone_matrices.items():
        if any(any(abs(m[i] - ident[i]) > 0.001 for i in range(16)) for m in mats):
            bones_out[bname] = {"matrices": mats}

    # JSONとして出力
    out_path = os.path.join(OUT_DIR, output_name)
    with open(out_path, 'w') as f:
        json.dump({"fps": fps, "frame_count": frame_count, "bones": bones_out}, f)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"    Written: {out_path} ({size_mb:.1f} MB, {len(bones_out)} bones, {frame_count} frames)")

# ========================================================================
# ステップ5: 騎乗セクションをエクスポート
# ========================================================================
print(f"\n=== Step 4: Export ===")

# 騎乗ループセクション（769-793 = 25フレームループ）
export_range(769, 793, "riding_default.motion.json")

# バリエーションと遷移を含むより広いセクションもエクスポート
# タイムライン構成:
# - ~121-400: 初期ポーズ / セットアップ
# - ~400-768: 遷移
# - ~769-793: 騎乗ループ
# - ~793+: クライマックス/フィニッシュ
export_range(121, 250, "riding_full_start.motion.json")
export_range(400, 500, "riding_mid.motion.json")
export_range(769, 900, "riding_loop_extended.motion.json")

# 完了メッセージ
print("\n=== DONE ===")
