"""
FK足アニメーションをIK足に変換して歩行サイクルモーションを再エクスポートするスクリプト。

手順:
1. 各フレームでfoot.lのワールド位置/回転を読み取り（現在FKで駆動）
2. c_foot_ik.lをそのワールドトランスフォームに一致させる
3. IKモードに切り替え（foot.lのFKコンストレイントを無効化）
4. c_foot_ik.lのキーフレームをベイク
5. 再評価してスキニング行列をエクスポート
"""
# Blender Python、システム、JSON、OS、数学モジュールをインポート
import bpy, sys, json, os, math
# mathutilsからMatrix, Vector, Quaternion型をインポート
from mathutils import Matrix, Vector, Quaternion

# コマンドライン引数を取得
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
BLEND_PATH = args[0]   # 歩行サイクルのBlendファイル
OUT_DIR = args[1]       # 出力ディレクトリ

# Blendファイルを開く
bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

# ボーン数最多のアーマチュアをメインリグとして選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Rig: {rig.name}")

# 歩行サイクルのフレーム範囲
frame_start, frame_end = 73, 144
frame_count = frame_end - frame_start + 1

# ========================================================================
# ステップ1: 現在のFK駆動のfoot.l/foot.rワールドトランスフォームをサンプリング
# ========================================================================
print("\n=== Step 1: Sample FK foot world transforms ===")
depsgraph = bpy.context.evaluated_depsgraph_get()

# 各フレームの足のワールド行列を格納
foot_targets = {}
for side in ['l', 'r']:
    foot_targets[f'foot.{side}'] = []

# 全フレームでの足のワールド行列を記録
for frame in range(frame_start, frame_end + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    for side in ['l', 'r']:
        pb = rig_eval.pose.bones.get(f'foot.{side}')
        if pb:
            mat_world = rig_eval.matrix_world @ pb.matrix
            foot_targets[f'foot.{side}'].append((frame, mat_world.copy()))

print(f"  Sampled {len(foot_targets['foot.l'])} frames per foot")

# サンプル値を表示
for side in ['l', 'r']:
    mat = foot_targets[f'foot.{side}'][0][1]
    t = mat.to_translation()
    e = mat.to_euler()
    print(f"  foot.{side} frame {frame_start}: pos=({t.x:.3f},{t.y:.3f},{t.z:.3f}) rot=({math.degrees(e.x):.1f},{math.degrees(e.y):.1f},{math.degrees(e.z):.1f})")

# ========================================================================
# ステップ2: c_foot_ikをFK足のワールドトランスフォームに一致させてキーフレームをベイク
# ========================================================================
print("\n=== Step 2: Bake IK foot keyframes ===")

for side in ['l', 'r']:
    ik_ctrl_name = f'c_foot_ik.{side}'  # IKコントロールボーン名
    foot_name = f'foot.{side}'            # デフォームボーン名
    ik_ctrl = rig.pose.bones.get(ik_ctrl_name)

    if not ik_ctrl:
        print(f"  {ik_ctrl_name}: NOT FOUND")
        continue

    print(f"  Baking {ik_ctrl_name}...")

    for frame, foot_world_mat in foot_targets[foot_name]:
        bpy.context.scene.frame_set(frame)

        # c_foot_ikはワールド空間（Child Ofコンストレイントでc_trajに接続）
        # foot.lのターゲットワールドトランスフォームに一致するローカルトランスフォームを計算
        rig_inv = rig.matrix_world.inverted()
        if ik_ctrl.parent:
            # 親ボーンがある場合、親のワールド行列の逆でローカル行列を計算
            parent_mat = rig.matrix_world @ ik_ctrl.parent.matrix
            local_mat = parent_mat.inverted() @ foot_world_mat
        else:
            # 親がない場合、リグのワールド行列の逆でローカル行列を計算
            local_mat = rig_inv @ foot_world_mat

        # IKコントロールボーンの行列を設定
        ik_ctrl.matrix = rig_inv @ foot_world_mat

        # 位置と回転のキーフレームを挿入
        ik_ctrl.keyframe_insert(data_path="location", frame=frame)
        ik_ctrl.keyframe_insert(data_path="rotation_euler", frame=frame)
        ik_ctrl.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    print(f"  Baked {len(foot_targets[foot_name])} keyframes for {ik_ctrl_name}")

# ========================================================================
# ステップ3: foot.l/foot.rのFKコンストレイントを無効化してIKのみにする
# ========================================================================
print("\n=== Step 3: Switch to IK-only ===")
for side in ['l', 'r']:
    pb = rig.pose.bones.get(f'foot.{side}')
    if pb:
        for c in pb.constraints:
            # FK関連コンストレイントのインフルエンスを0に設定
            if 'FK' in c.name or 'fk' in c.name.lower():
                print(f"  foot.{side}: {c.name} influence {c.influence:.1f} -> 0.0")
                c.influence = 0.0

# ========================================================================
# ステップ4: IK足の方向が変わったか再評価して検証
# ========================================================================
print("\n=== Step 4: Verify IK foot ===")
depsgraph = bpy.context.evaluated_depsgraph_get()

# 3フレームでサンプリングして検証
for frame in [frame_start, frame_start + 6, frame_start + 12]:
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    # IKコントロール、IKボーン、デフォームボーンの位置と回転を表示
    for bname in [f'c_foot_ik.l', f'foot_ik.l', f'foot.l']:
        pb = rig_eval.pose.bones.get(bname)
        if pb:
            mat = rig_eval.matrix_world @ pb.matrix
            t = mat.to_translation()
            e = mat.to_euler()
            print(f"  f={frame} {bname:15s} pos=({t.x:.3f},{t.y:.3f},{t.z:.3f}) rot=({math.degrees(e.x):.1f},{math.degrees(e.y):.1f},{math.degrees(e.z):.1f})")
    print()

# ========================================================================
# ステップ5: スキニング行列をエクスポート
# ========================================================================
print("=== Step 5: Export ===")

# 座標変換行列
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])       # Blender→ビューア
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])   # ビューア→Blender

# デフォームボーンとバインドポーズ逆行列
deform_bones = [b.name for b in arm.bones if b.use_deform]
bind_inv = {}
for bname in deform_bones:
    bone = arm.bones.get(bname)
    if bone:
        bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()

# フレームごとの行列を計算
bone_matrices = {b: [] for b in deform_bones}
depsgraph = bpy.context.evaluated_depsgraph_get()

for frame in range(frame_start, frame_end + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    for bname in deform_bones:
        pb = rig_eval.pose.bones.get(bname)
        if not pb or bname not in bind_inv:
            bone_matrices[bname].append([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
            continue
        # スキニング行列を計算して座標変換
        mat_world = rig_eval.matrix_world @ pb.matrix
        skin = mat_world @ bind_inv[bname]
        conv = C @ skin @ C_inv
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[bname].append(flat)

    # 20フレームごとに進捗表示
    if (frame - frame_start) % 20 == 0:
        print(f"  Frame {frame}/{frame_end}")

# アニメーションのあるボーンのみ出力
ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
bones_out = {}
for bname, mats in bone_matrices.items():
    if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
        bones_out[bname] = {"matrices": mats}

# JSON出力（既存ファイルはバックアップ）
out_path = os.path.join(OUT_DIR, "walk_cycle_arp.motion.json")
bak = out_path + ".bak"
if os.path.exists(out_path):
    if os.path.exists(bak):
        os.remove(bak)
    os.rename(out_path, bak)

with open(out_path, 'w') as f:
    json.dump({"fps": 30, "frame_count": frame_count, "bones": bones_out}, f)

# 結果を表示
sz = os.path.getsize(out_path)/1024/1024
print(f"\nWritten: {out_path} ({sz:.1f} MB, {len(bones_out)} bones)")

# 新旧のfoot.lの行列を比較表示
print("\n=== foot.l frame 0 comparison ===")
new = bones_out.get('foot.l', {}).get('matrices', [[]])[0]
if new:
    print(f"NEW (IK):")
    for r in range(3):
        print(f"  [{new[r*4]:.4f}, {new[r*4+1]:.4f}, {new[r*4+2]:.4f}, {new[r*4+3]:.4f}]")

# バックアップから旧データを表示
try:
    with open(bak, 'r') as f:
        old_data = json.load(f)
    old = old_data['bones']['foot.l']['matrices'][0]
    print(f"OLD (FK):")
    for r in range(3):
        print(f"  [{old[r*4]:.4f}, {old[r*4+1]:.4f}, {old[r*4+2]:.4f}, {old[r*4+3]:.4f}]")
except Exception as e:
    print(f"  Could not read old data: {e}")

# 完了メッセージ
print("\nDONE")
