"""Blendファイルの概要調査: アーマチュア、アクション、フレーム範囲を表示するスクリプト。"""
# Blender PythonモジュールとシステムモジュールをインポートA
import bpy, sys

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す（Blenderの引数とスクリプトの引数を分離）
idx = argv.index("--") if "--" in argv else len(argv)
# "--"以降のスクリプト引数を取得
args = argv[idx + 1:]
# 最初の引数をBlendファイルパスとして取得
BLEND_PATH = args[0]

# 指定されたBlendファイルを開く
bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

# === シーン内の全オブジェクトを表示 ===
print("\n=== Objects ===")
for o in bpy.data.objects:
    # オブジェクトのタイプ（MESH, ARMATURE等）と名前を表示
    print(f"  {o.type:12s} {o.name}")

# === アーマチュア（スケルトン）の詳細を表示 ===
print("\n=== Armatures ===")
for o in bpy.data.objects:
    # アーマチュアタイプのオブジェクトのみ処理
    if o.type == 'ARMATURE':
        # アーマチュア名とボーン数を表示
        print(f"  {o.name}: {len(o.data.bones)} bones")
        # デフォームに使用されるボーンのみをフィルタしてカウント
        deform = [b for b in o.data.bones if b.use_deform]
        print(f"    Deform bones: {len(deform)}")
        # アニメーションデータが存在する場合
        if o.animation_data:
            # アクティブなアクション（アニメーション）を表示
            act = o.animation_data.action
            print(f"    Active action: {act.name if act else 'None'}")
            # NLA（Non-Linear Animation）トラックがある場合
            if o.animation_data.nla_tracks:
                for track in o.animation_data.nla_tracks:
                    # トラック名とミュート状態を表示
                    print(f"    NLA: {track.name} (mute={track.mute})")
                    for strip in track.strips:
                        # ストリップの詳細（名前、アクション、フレーム範囲）を表示
                        print(f"      strip: {strip.name} action={strip.action.name if strip.action else 'None'} frames={strip.frame_start:.0f}-{strip.frame_end:.0f}")

# === 全アクション（アニメーション）を名前順に表示 ===
print("\n=== Actions ===")
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    # アクションのフレーム範囲を取得
    fr = action.frame_range
    # Fカーブ（キーフレームアニメーションカーブ）の数をカウント
    fc_count = 0
    # Blenderのバージョンによってfcurvesのアクセス方法が異なる
    if hasattr(action, 'fcurves') and action.fcurves:
        # 旧バージョン: 直接fcurvesプロパティからカウント
        fc_count = len(action.fcurves)
    elif hasattr(action, 'layers'):
        # 新バージョン（Blender 5.0+）: layers→strips→channelbagsを辿ってカウント
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    fc_count += len(bag.fcurves)
    # アクション名、フレーム範囲、Fカーブ数を表示
    print(f"  {action.name}: frames={fr[0]:.0f}-{fr[1]:.0f} fcurves={fc_count}")

# === シーン設定を表示 ===
print(f"\n=== Scene ===")
# シーンのフレーム範囲（開始〜終了）を表示
print(f"  Frame range: {bpy.context.scene.frame_start}-{bpy.context.scene.frame_end}")
# レンダリングのFPS設定を表示
print(f"  FPS: {bpy.context.scene.render.fps}")
