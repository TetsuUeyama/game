"""
足のスキニング行列を修正して歩行サイクルを再エクスポートするスクリプト。

foot.l/foot.r: P*M_skin*P^-1を使用（完全なビューア空間変換）
その他のボーン: C*M_skin*C^-1を使用（軸変換のみ、元の方法と一致）

P = Blender→ビューアの完全変換行列（スケール + オフセット + 軸入れ替え）
C = 軸入れ替えのみ (x,y,z) → (x,z,-y)
"""
# Blender Python、システム、JSON、OSモジュールをインポート
import bpy, sys, json, os
# mathutilsからMatrix型をインポート
from mathutils import Matrix

# コマンドライン引数を取得
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
BLEND_PATH = args[0]   # 歩行サイクルのBlendファイルパス
OUT_DIR = args[1]       # 出力ディレクトリ

# Blendファイルを開く
bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

# ボーン数最多のアーマチュアをメインリグとして選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Rig: {rig.name}")

# ビューア空間パラメータをsegments.jsonから読み込み
seg_path = r"C:\Users\user\developsecond\game-assets\vox\female\BasicBodyFemale\segments.json"
with open(seg_path, 'r') as f:
    seg = json.load(f)

# ビューア空間の定数
SCALE = 0.010                        # ビューアのスケール
vs = seg['voxel_size']               # ボクセルサイズ（0.007）
bb_min = seg['bb_min']               # バウンディングボックス最小値
gx, gy = seg['grid']['gx'], seg['grid']['gy']  # グリッドサイズ
cx_grid = gx / 2.0                   # グリッドX中心
cy_grid = gy / 2.0                   # グリッドY中心
s = SCALE / vs                       # ビューアスケール / ボクセルサイズ（≒1.4286）

# パラメータを表示
print(f"Viewer params: SCALE={SCALE}, vs={vs}, s={s:.4f}")
print(f"  bb_min=({bb_min[0]:.4f}, {bb_min[1]:.4f}, {bb_min[2]:.4f})")
print(f"  grid=({gx}, {gy}), cx={cx_grid}, cy={cy_grid}")

# P: Blenderワールド座標 → ビューア空間への完全変換行列
# viewer_x = s*(bx - bb_min[0]) - cx_grid*SCALE
# viewer_y = s*(bz - bb_min[2])
# viewer_z = -(s*(by - bb_min[1]) - cy_grid*SCALE)
P = Matrix([
    [s,  0,  0, -s*bb_min[0] - cx_grid*SCALE],
    [0,  0,  s, -s*bb_min[2]],
    [0, -s,  0,  s*bb_min[1] + cy_grid*SCALE],
    [0,  0,  0,  1],
])
# Pの逆行列
P_inv = P.inverted()

# P行列の検証: foot.lのhead_voxelでテスト
test_vox = [151, 33, 28]  # foot.lのhead_voxel座標
# ボクセル座標→Blenderワールド座標に変換
test_blender = [bb_min[0] + test_vox[0]*vs, bb_min[1] + test_vox[1]*vs, bb_min[2] + test_vox[2]*vs]
from mathutils import Vector
# P行列でBlender座標をビューア座標に変換
test_result = P @ Vector((*test_blender, 1))
# 期待されるビューア座標（ボクセル座標から直接計算）
test_viewer = [(test_vox[0]-cx_grid)*SCALE, test_vox[2]*SCALE, -(test_vox[1]-cy_grid)*SCALE]
print(f"\nP verification (foot.l head):")
print(f"  P*blender: ({test_result.x:.4f}, {test_result.y:.4f}, {test_result.z:.4f})")
print(f"  expected:  ({test_viewer[0]:.4f}, {test_viewer[1]:.4f}, {test_viewer[2]:.4f})")
# 0.01以内の一致を確認
match = all(abs(test_result[i] - test_viewer[i]) < 0.01 for i in range(3))
print(f"  match: {'YES' if match else 'NO'}")

# C: 軸のみの入れ替え行列（元の変換方法）
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
# Cの逆行列
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# 完全P変換を使用するボーン（足のみ）
FULL_P_BONES = {'foot.l', 'foot.r'}

# デフォームボーンのバインドポーズ逆行列を計算
deform_bones = [b.name for b in arm.bones if b.use_deform]
bind_inv = {}
for bname in deform_bones:
    bone = arm.bones.get(bname)
    if bone:
        bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()

# フレームサンプリング
frame_start, frame_end = 73, 144  # 歩行サイクルのフレーム範囲
frame_count = frame_end - frame_start + 1
print(f"\nSampling {len(deform_bones)} bones, {frame_count} frames...")

# 依存関係グラフを取得
depsgraph = bpy.context.evaluated_depsgraph_get()
bone_matrices = {b: [] for b in deform_bones}

# 各フレームを処理
for frame in range(frame_start, frame_end + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    for bname in deform_bones:
        pb = rig_eval.pose.bones.get(bname)
        if not pb or bname not in bind_inv:
            bone_matrices[bname].append([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
            continue

        # ワールド行列を計算
        mat_world = rig_eval.matrix_world @ pb.matrix
        # スキニング行列を計算
        skin_mat = mat_world @ bind_inv[bname]

        # ボーンに応じて変換方法を選択
        if bname in FULL_P_BONES:
            # 足ボーン: 完全ビューア空間変換（P*skin*P^-1）
            converted = P @ skin_mat @ P_inv
        else:
            # その他: 軸変換のみ（C*skin*C^-1）
            converted = C @ skin_mat @ C_inv

        # 4x4行列を16要素フラット配列に変換
        flat = [round(converted[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[bname].append(flat)

    # 20フレームごとに進捗表示
    if (frame - frame_start) % 20 == 0:
        print(f"  Frame {frame}/{frame_end}")

# アニメーションのあるボーンのみフィルタして出力
ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
bones_out = {}
for bname, mats in bone_matrices.items():
    if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
        bones_out[bname] = {"matrices": mats}

# モーションJSONとして出力（既存ファイルはバックアップ）
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

# foot.lの新旧行列を比較表示
print("\n=== foot.l frame 0 comparison ===")
if 'foot.l' in bones_out:
    new = bones_out['foot.l']['matrices'][0]
    print(f"NEW (P*M*P^-1):")
    for r in range(3):
        print(f"  [{new[r*4]:.4f}, {new[r*4+1]:.4f}, {new[r*4+2]:.4f}, {new[r*4+3]:.4f}]")

# バックアップから旧データを表示
try:
    with open(bak, 'r') as f:
        old_data = json.load(f)
    old = old_data['bones']['foot.l']['matrices'][0]
    print(f"OLD (C*M*C^-1):")
    for r in range(3):
        print(f"  [{old[r*4]:.4f}, {old[r*4+1]:.4f}, {old[r*4+2]:.4f}, {old[r*4+3]:.4f}]")
except:
    pass

# 完了メッセージ
print("\nDONE")
