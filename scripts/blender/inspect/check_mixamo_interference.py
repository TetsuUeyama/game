"""MixamoアーマチュアがARPリグの足アニメーションに干渉しているか調査するスクリプト。"""
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

# ボーン数が最も多いアーマチュアをARPリグとして選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
# Mixamoアーマチュアを探す（ARPリグ以外のアーマチュア）
mixamo = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE' and obj != rig:
        mixamo = obj

# リグ名を表示
print(f"ARP rig: {rig.name}")
print(f"Mixamo armature: {mixamo.name if mixamo else 'None'}")

# ARPボーンにMixamoを参照するコンストレイントがないか確認
print("\n=== ARP bones with constraints referencing Mixamo ===")
mixamo_refs = []
for pb in rig.pose.bones:
    for c in pb.constraints:
        # コンストレイントのターゲットとサブターゲットを取得
        target = getattr(c, 'target', None)
        subtarget = getattr(c, 'subtarget', '')
        # ターゲットがMixamoアーマチュアの場合
        if target and target == mixamo:
            mixamo_refs.append((pb.name, c.name, c.type, subtarget, c.influence, c.mute))

if mixamo_refs:
    # Mixamo参照コンストレイントが見つかった場合
    print(f"  Found {len(mixamo_refs)} constraints referencing Mixamo!")
    for bname, cname, ctype, sub, inf, mute in mixamo_refs[:20]:
        print(f"    {bname} -> [{ctype}] {cname}: subtarget={sub} influence={inf:.1f} mute={mute}")
else:
    print("  None found")

# ARPリグのドライバーでMixamoを参照しているものがないか確認
print("\n=== ARP drivers referencing Mixamo ===")
if rig.animation_data and rig.animation_data.drivers:
    mixamo_drivers = []
    for driver in rig.animation_data.drivers:
        for var in driver.driver.variables:
            for target in var.targets:
                # ターゲットIDがMixamoアーマチュアの場合
                if target.id == mixamo:
                    mixamo_drivers.append(driver.data_path)
    if mixamo_drivers:
        print(f"  Found {len(mixamo_drivers)} drivers!")
        for dp in mixamo_drivers[:10]:
            print(f"    {dp}")
    else:
        print("  None found")

# ARPリターゲットプロパティを確認
print("\n=== ARP Retarget Properties ===")
for key in sorted(rig.keys()):
    # リターゲットやソースに関連するカスタムプロパティを表示
    if 'retarget' in key.lower() or 'source' in key.lower():
        val = rig[key]
        print(f"  rig['{key}'] = {val}")

# テスト: Mixamoアーマチュアの有無でfoot.lの値を比較
print("\n=== foot.l comparison: with vs without Mixamo ===")
# 依存関係グラフを取得
depsgraph = bpy.context.evaluated_depsgraph_get()
# フレーム73（歩行サイクル開始）に設定
bpy.context.scene.frame_set(73)
depsgraph.update()
rig_eval = rig.evaluated_get(depsgraph)

# Mixamoあり状態でのfoot.lの位置・回転を記録
pb = rig_eval.pose.bones.get('foot.l')
if pb:
    mat1 = rig_eval.matrix_world @ pb.matrix
    e1 = mat1.to_euler()
    t1 = mat1.to_translation()
    print(f"  WITH Mixamo: pos=({t1.x:.4f},{t1.y:.4f},{t1.z:.4f}) rot=({math.degrees(e1.x):.1f},{math.degrees(e1.y):.1f},{math.degrees(e1.z):.1f})")

# Mixamoアーマチュアを非表示・無効化
if mixamo:
    mixamo.hide_set(True)
    mixamo.hide_viewport = True
    # Mixamoのアニメーションアクションを解除
    if mixamo.animation_data:
        mixamo.animation_data.action = None

    # 再評価
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bpy.context.scene.frame_set(73)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    # Mixamoなし状態でのfoot.lの位置・回転を記録
    pb = rig_eval.pose.bones.get('foot.l')
    if pb:
        mat2 = rig_eval.matrix_world @ pb.matrix
        e2 = mat2.to_euler()
        t2 = mat2.to_translation()
        print(f"  WITHOUT Mixamo: pos=({t2.x:.4f},{t2.y:.4f},{t2.z:.4f}) rot=({math.degrees(e2.x):.1f},{math.degrees(e2.y):.1f},{math.degrees(e2.z):.1f})")

        # 回転の差分を計算（度単位の最大差）
        diff = max(abs(math.degrees(e1[i]-e2[i])) for i in range(3))
        print(f"  Rotation difference: {diff:.2f} degrees")
        if diff > 0.1:
            # 0.1度以上の差がある場合、Mixamoが影響している
            print(f"  *** MIXAMO IS AFFECTING FOOT ROTATION! ***")
        else:
            print(f"  No significant difference")

# さらにMixamoアーマチュアを完全に削除してテスト
if mixamo:
    bpy.data.objects.remove(mixamo, do_unlink=True)
    print("\n  After DELETING Mixamo armature:")

    # 再評価
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bpy.context.scene.frame_set(73)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    # 削除後のfoot.lの位置・回転を記録
    pb = rig_eval.pose.bones.get('foot.l')
    if pb:
        mat3 = rig_eval.matrix_world @ pb.matrix
        e3 = mat3.to_euler()
        t3 = mat3.to_translation()
        print(f"  DELETED Mixamo: pos=({t3.x:.4f},{t3.y:.4f},{t3.z:.4f}) rot=({math.degrees(e3.x):.1f},{math.degrees(e3.y):.1f},{math.degrees(e3.z):.1f})")

        # 元の状態との回転差分
        diff3 = max(abs(math.degrees(e1[i]-e3[i])) for i in range(3))
        print(f"  Rotation difference from original: {diff3:.2f} degrees")
        if diff3 > 0.1:
            print(f"  *** DELETING MIXAMO CHANGED FOOT ROTATION! ***")

# 完了メッセージ
print("\nDONE")
