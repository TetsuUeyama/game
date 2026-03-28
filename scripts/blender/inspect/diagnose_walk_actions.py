"""歩行サイクルBlendファイルのアニメーションアクション・NLAを調査するスクリプト。"""
# Blender PythonモジュールとシステムモジュールをインポートA
import bpy, sys

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
idx = argv.index("--") if "--" in argv else len(argv)
# "--"以降のスクリプト引数を取得
args = argv[idx + 1:]
# 指定されたBlendファイルを開く
bpy.ops.wm.open_mainfile(filepath=args[0])

# ボーン数が最も多いアーマチュアをメインリグとして選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
# メインリグ名を表示
print(f"Rig: {rig.name}")

# --- 全アクションの詳細を表示 ---
print("\n--- ALL ACTIONS ---")
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    # フレーム範囲を取得
    fr = action.frame_range
    # footに関連するトラック（Fカーブ）を抽出（足のIK/FK調査用）
    foot_tracks = [fc.data_path for fc in action.fcurves
                   if 'foot' in fc.data_path.lower()]
    # アクション名、フレーム範囲、Fカーブ総数、足関連トラック数を表示
    print(f"  {action.name}: frames {fr[0]:.0f}-{fr[1]:.0f}, "
          f"fcurves={len(action.fcurves)}, foot_tracks={len(foot_tracks)}")

# --- メインリグのアクティブアクションを表示 ---
print(f"\n--- ACTIVE ACTION on rig ---")
if rig.animation_data and rig.animation_data.action:
    # アクティブなアクション名を表示
    print(f"  {rig.animation_data.action.name}")
else:
    # アクティブなアクションがない場合
    print("  None")

# --- NLAトラックの詳細を表示 ---
print(f"\n--- NLA TRACKS ---")
if rig.animation_data:
    for track in rig.animation_data.nla_tracks:
        # トラック名とミュート状態を表示
        print(f"  Track: {track.name} (mute={track.mute})")
        for strip in track.strips:
            # ストリップのアクション名を取得
            act = strip.action.name if strip.action else 'None'
            # ストリップの詳細（名前、アクション、フレーム範囲）を表示
            print(f"    Strip: {strip.name} action={act} "
                  f"frames={strip.frame_start:.0f}-{strip.frame_end:.0f}")

# メインリグ以外のアーマチュア（Mixamo等）のアニメーション情報もチェック
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE' and obj != rig:
        # アーマチュア名を表示
        print(f"\n--- {obj.name} animation ---")
        # アクティブアクションを表示
        if obj.animation_data and obj.animation_data.action:
            act = obj.animation_data.action
            print(f"  Action: {act.name} frames {act.frame_range}")
        # NLAトラックを表示
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                print(f"  NLA: {track.name}")
                for strip in track.strips:
                    print(f"    {strip.name} action={strip.action.name if strip.action else 'None'}")

# 完了メッセージ
print("\nDONE")
