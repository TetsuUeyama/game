"""c_foot_ikアニメーションの駆動要素を調査するスクリプト。Blender 5.0互換。"""
# Blender Python、システム、数学モジュールをインポート
import bpy, sys, math

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
idx = argv.index("--") if "--" in argv else len(argv)
# スクリプト引数を取得
args = argv[idx + 1:]
# Blendファイルを開く
bpy.ops.wm.open_mainfile(filepath=args[0])

# アクションからFカーブを取得するヘルパー関数（Blender 5.0のレイヤードアクション対応）
def get_fcurves(action):
    """Get fcurves from action (Blender 5.0 layered actions support)."""
    # 旧バージョン: 直接fcurvesプロパティがある場合
    if hasattr(action, 'fcurves') and action.fcurves:
        return list(action.fcurves)
    # 新バージョン（Blender 5.0+）: layers→strips→channelbagsを辿る
    if hasattr(action, 'layers'):
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves.extend(bag.fcurves)
        return curves
    return []

# === 全アクションの足IK/FK関連情報を表示 ===
print("=== ALL ACTIONS ===")
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    # アクションのFカーブを取得
    fcs = get_fcurves(action)
    # フレーム範囲を取得
    fr = action.frame_range
    # c_foot_ikに関連するFカーブをフィルタ
    foot_ik = [fc.data_path for fc in fcs if 'c_foot_ik' in fc.data_path]
    # c_foot_fkに関連するFカーブをフィルタ
    foot_fk = [fc.data_path for fc in fcs if 'c_foot_fk' in fc.data_path]
    # footを含む全Fカーブをフィルタ
    foot_any = [fc.data_path for fc in fcs if 'foot' in fc.data_path.lower()]
    # アクション情報を表示
    print(f"  {action.name}: frames={fr[0]:.0f}-{fr[1]:.0f} total_fc={len(fcs)} c_foot_ik={len(foot_ik)} c_foot_fk={len(foot_fk)} foot_any={len(foot_any)}")
    # IK関連トラックの先頭5つを表示
    if foot_ik:
        for p in foot_ik[:5]:
            print(f"    IK: {p}")
    # FK関連トラックの先頭5つを表示
    if foot_fk:
        for p in foot_fk[:5]:
            print(f"    FK: {p}")

# ARPリグを検索（ボーン数最大のアーマチュア）
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))

# === リグのアニメーションデータを表示 ===
print(f"\n=== {rig.name} ANIMATION DATA ===")
if rig.animation_data:
    # アクティブアクション名を表示
    act = rig.animation_data.action
    print(f"Active action: {act.name if act else 'None'}")
    # NLAトラック数を表示
    print(f"NLA tracks: {len(rig.animation_data.nla_tracks)}")
    for track in rig.animation_data.nla_tracks:
        # トラック名とミュート状態
        print(f"  Track: {track.name} mute={track.mute}")
        for strip in track.strips:
            # ストリップの詳細
            print(f"    Strip: {strip.name} action={strip.action.name if strip.action else 'None'} frames={strip.frame_start:.0f}-{strip.frame_end:.0f}")

# === 複数フレームでのボーン位置をサンプリング ===
print(f"\n=== BONE POSITIONS ACROSS FRAMES ===")
# 依存関係グラフを取得
depsgraph = bpy.context.evaluated_depsgraph_get()
# 6フレーム間隔でサンプリング
for frame in [73, 79, 85, 91, 97, 103]:
    # フレームを設定
    bpy.context.scene.frame_set(frame)
    # 依存関係グラフを更新
    depsgraph.update()
    # 評価済みリグを取得
    rig_eval = rig.evaluated_get(depsgraph)
    print(f"\nFrame {frame}:")
    # 足関連のIK/FKボーンの位置と回転を表示
    for bname in ['c_foot_ik.l', 'foot_ik.l', 'foot_fk.l', 'foot.l']:
        pb = rig_eval.pose.bones.get(bname)
        if pb:
            # ワールド空間の行列を計算
            mat = rig_eval.matrix_world @ pb.matrix
            # 位置を抽出
            t = mat.to_translation()
            # オイラー角を抽出
            e = mat.to_euler()
            # 位置と回転を表示
            print(f"  {bname:15s} pos=({t.x:.3f},{t.y:.3f},{t.z:.3f}) rot=({math.degrees(e.x):.1f},{math.degrees(e.y):.1f},{math.degrees(e.z):.1f})")

# 完了メッセージ
print("\nDONE")
