"""2つのBlendファイルのボーン構造を比較するスクリプト。"""
# Blender Pythonとシステムモジュールをインポート
import bpy, sys

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
idx = argv.index("--") if "--" in argv else len(argv)
# スクリプト引数（2つのBlendファイルパス）を取得
args = argv[idx + 1:]

# 各Blendファイルの分析結果を格納する辞書
results = {}

# 最大2つのBlendファイルを処理
for i, blend_path in enumerate(args[:2]):
    # Blendファイルを開く
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    # ボーン数が最も多いアーマチュアをメインリグとして選択
    rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
              key=lambda o: len(o.data.bones))
    arm = rig.data

    # デフォームボーン名をソートして取得
    deform = sorted([b.name for b in arm.bones if b.use_deform])
    # 全ボーン名をソートして取得
    all_bones = sorted([b.name for b in arm.bones])

    # ファイル名をラベルとして使用
    label = blend_path.split('\\')[-1].split('/')[-1]
    # 結果を格納
    results[label] = {
        'rig_name': rig.name,
        'total': len(all_bones),
        'deform': len(deform),
        'deform_names': set(deform),
        'all_names': set(all_bones),
    }
    # 基本情報を表示
    print(f"=== {label} ===")
    print(f"  Rig: {rig.name}")
    print(f"  Total bones: {len(all_bones)}")
    print(f"  Deform bones: {len(deform)}")

    # 主要な足・脚・手のボーンの存在と設定を確認
    for bname in ['foot.l', 'foot.r', 'c_foot_ik.l', 'c_foot_fk.l',
                   'foot_ik.l', 'foot_fk.l', 'c_leg_stretch.l',
                   'c_thigh_stretch.l', 'c_root_bend.x', 'hand.l']:
        bone = arm.bones.get(bname)
        if bone:
            # 親ボーン名を取得（ルートの場合は'ROOT'）
            parent = bone.parent.name if bone.parent else 'ROOT'
            # ボーン名、デフォームフラグ、親ボーン名を表示
            print(f"  {bname:25s} deform={bone.use_deform} parent={parent}")
        else:
            # ボーンが見つからない場合
            print(f"  {bname:25s} NOT FOUND")

# 2つのファイルが指定された場合、比較結果を表示
labels = list(results.keys())
if len(labels) == 2:
    a, b = labels
    # 各ファイルのデフォームボーン名のセットを取得
    da, db = results[a]['deform_names'], results[b]['deform_names']

    # 共通ボーン、片方のみのボーンを計算
    common = da & db       # 両方に存在するボーン
    only_a = da - db       # ファイルAにのみ存在するボーン
    only_b = db - da       # ファイルBにのみ存在するボーン

    # 比較結果を表示
    print(f"\n=== COMPARISON ===")
    print(f"  Common deform bones: {len(common)}")
    print(f"  Only in {a}: {len(only_a)}")
    print(f"  Only in {b}: {len(only_b)}")

    # ファイルAのみのボーンを最大30個表示
    if only_a:
        print(f"\n  Only in {a}:")
        for n in sorted(only_a)[:30]:
            print(f"    {n}")
    # ファイルBのみのボーンを最大30個表示
    if only_b:
        print(f"\n  Only in {b}:")
        for n in sorted(only_b)[:30]:
            print(f"    {n}")

# 完了メッセージ
print("\nDONE")
