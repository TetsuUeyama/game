"""
Blenderのfoot.l行列とmotion.jsonの行列を集中比較するスクリプト。
"""
# Blender Python、システム、JSONモジュールをインポート
import bpy, sys, json

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
idx = argv.index("--") if "--" in argv else len(argv)
# スクリプト引数を取得
args = argv[idx + 1:]
# Blendファイルパスを取得（未指定の場合はデフォルトパス）
BLEND_PATH = args[0] if args else r"E:\MOdel\CyberElfBlender\CyberpunkElf_WalkCycle.blend"

# Blendファイルを開く
bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

# ボーン数が最も多いアーマチュアをARPリグとして選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'], key=lambda o: len(o.data.bones))
# アーマチュアデータを取得
arm = rig.data
# リグ名とボーン数を表示
print(f"Rig: {rig.name} ({len(arm.bones)} bones)")

# 評価済みのコンストレイント情報を確認（foot.lのIK/FK状態を調査）
depsgraph = bpy.context.evaluated_depsgraph_get()
# フレーム73（歩行サイクル開始フレーム）に設定
bpy.context.scene.frame_set(73)
# 依存関係グラフを更新
depsgraph.update()

# 評価済みリグを取得
rig_eval = rig.evaluated_get(depsgraph)
# 評価済みのfoot.lポーズボーンを取得
pb_eval = rig_eval.pose.bones.get('foot.l')
if pb_eval:
    # foot.lに適用されているコンストレイントを表示
    print("\nfoot.l EVALUATED constraints:")
    for c in pb_eval.constraints:
        # コンストレイントのタイプ、名前、影響度、ミュート状態を表示
        print(f"  [{c.type}] {c.name}: influence={c.influence:.3f} mute={c.mute}")

# IK/FKスイッチの評価済み値を確認
for bname in ['c_foot_ik.l', 'c_foot_ik.r']:
    pb_e = rig_eval.pose.bones.get(bname)
    # ik_fk_switchカスタムプロパティの値を表示
    if pb_e and 'ik_fk_switch' in pb_e:
        print(f"\n{bname}['ik_fk_switch'] = {pb_e['ik_fk_switch']}")

# 行列比較: Blenderの計算結果 vs JSONに保存された行列
print("\n--- Matrix Comparison ---")
# モーションJSONファイルを読み込み
motion_path = r"C:\Users\user\developsecond\game-assets\motion\walk_cycle_arp.motion.json"
with open(motion_path, 'r') as f:
    motion = json.load(f)

# 歩行サイクルのJSONは72フレーム。シーンのフレーム73がJSON のフレーム0に対応
scene_start = 73

# 主要ボーンのマトリックスを比較
for bone_name in ['foot.l', 'foot.r', 'c_root_bend.x', 'c_leg_stretch.l']:
    # JSONから当該ボーンのエントリを取得
    json_entry = motion['bones'].get(bone_name)
    if not json_entry:
        print(f"\n{bone_name}: NOT in motion.json")
        continue

    # アーマチュアからレストボーンを取得
    rest_bone = arm.bones.get(bone_name)
    if not rest_bone:
        print(f"\n{bone_name}: NOT in armature")
        continue

    # 歩行サイクルのフレーム0（シーンフレーム73）に設定
    bpy.context.scene.frame_set(scene_start)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    # 評価済みポーズボーンを取得
    pb = rig_eval.pose.bones.get(bone_name)
    if not pb:
        print(f"\n{bone_name}: NOT in eval pose")
        continue

    # ワールド空間のボーン行列を計算
    mat_world = rig_eval.matrix_world @ pb.matrix
    # バインドポーズ行列を計算
    bind_mat = rig.matrix_world @ rest_bone.matrix_local
    # スキニング行列を計算（ワールド行列 × バインド逆行列）
    skin_mat = mat_world @ bind_mat.inverted()

    # JSONから最初のフレームの行列を取得
    json_mat = json_entry['matrices'][0]

    # 行列を16要素のフラット配列に変換（行優先）
    world_flat = [mat_world[r][c] for r in range(4) for c in range(4)]
    skin_flat = [skin_mat[r][c] for r in range(4) for c in range(4)]

    # JSON行列とワールド行列の一致をチェック（許容誤差0.02）
    match_world = all(abs(world_flat[i] - json_mat[i]) < 0.02 for i in range(16))
    # JSON行列とスキニング行列の一致をチェック
    match_skin = all(abs(skin_flat[i] - json_mat[i]) < 0.02 for i in range(16))

    # 比較結果を表示
    print(f"\n{bone_name}:")
    print(f"  world matrix match:    {'YES' if match_world else 'NO'}")
    print(f"  skinning matrix match: {'YES' if match_skin else 'NO'}")

    # 行列の先頭行と平行移動成分を比較表示
    print(f"  JSON    row0: [{json_mat[0]:.4f}, {json_mat[1]:.4f}, {json_mat[2]:.4f}, {json_mat[3]:.4f}]")
    print(f"  World   row0: [{world_flat[0]:.4f}, {world_flat[1]:.4f}, {world_flat[2]:.4f}, {world_flat[3]:.4f}]")
    print(f"  Skin    row0: [{skin_flat[0]:.4f}, {skin_flat[1]:.4f}, {skin_flat[2]:.4f}, {skin_flat[3]:.4f}]")
    print(f"  JSON    tran: [{json_mat[3]:.4f}, {json_mat[7]:.4f}, {json_mat[11]:.4f}]")
    print(f"  World   tran: [{world_flat[3]:.4f}, {world_flat[7]:.4f}, {world_flat[11]:.4f}]")
    print(f"  Skin    tran: [{skin_flat[3]:.4f}, {skin_flat[7]:.4f}, {skin_flat[11]:.4f}]")

# 完了メッセージ
print("\nDONE")
