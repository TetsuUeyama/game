"""
異なるリグからモーションをエクスポートし、ボーン名をCyberpunkElf規約にリマップするスクリプト。
CyberpunkElfの元モデルから評価済みバインドポーズを使用。
"""
# Blender Python、システム、JSON、OS、数学モジュールをインポート
import bpy, sys, json, os, math
# mathutilsからMatrix型をインポート
from mathutils import Matrix

# コマンドライン引数を取得
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
MOTION_PATH = args[0]  # モーション付きBlendファイル
ORIG_PATH = args[1]    # CyberpunkElf元モデル（バインドポーズソース）
OUT_DIR = args[2]       # 出力ディレクトリ
# 出力ファイル名（省略時はデフォルト）
OUT_NAME = args[3] if len(args) > 3 else "remapped.motion.json"

# QueenMarika → CyberpunkElfのボーン名変換マップ
BONE_REMAP = {
    'breast_l': 'breast.l',                     # 胸（左）
    'breast_r': 'breast.r',                     # 胸（右）
    'butt_l': 'butt.l',                         # 臀部（左）
    'butt_r': 'butt.r',                         # 臀部（右）
    'nipple_l': 'nipple.l',                     # 乳首（左）
    'nipple_r': 'nipple.r',                     # 乳首（右）
    'c_toes_index1.l': 'c_toes_index1_base.l',  # 足指・人差し指（左）
    'c_toes_index1.r': 'c_toes_index1_base.r',  # 足指・人差し指（右）
    'c_toes_middle1.l': 'c_toes_middle1_base.l', # 足指・中指（左）
    'c_toes_middle1.r': 'c_toes_middle1_base.r', # 足指・中指（右）
    'c_toes_pinky1.l': 'c_toes_pinky1_base.l',  # 足指・小指（左）
    'c_toes_pinky1.r': 'c_toes_pinky1_base.r',  # 足指・小指（右）
    'c_toes_ring1.l': 'c_toes_ring1_base.l',    # 足指・薬指（左）
    'c_toes_ring1.r': 'c_toes_ring1_base.r',    # 足指・薬指（右）
    'c_toes_thumb1.l': 'c_toes_thumb1_base.l',  # 足指・親指（左）
    'c_toes_thumb1.r': 'c_toes_thumb1_base.r',  # 足指・親指（右）
}

# ========================================================================
# ステップ1: CyberpunkElfから評価済みバインドポーズを取得
# ========================================================================
print("=== Step 1: CyberpunkElf evaluated bind pose ===")
# CyberpunkElfの元モデルを開く
bpy.ops.wm.open_mainfile(filepath=ORIG_PATH)

# 100ボーン以上のアーマチュアをリグとして選択
orig_rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        orig_rig = o
        break

# 依存関係グラフを取得して評価
depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(0)
depsgraph.update()
orig_eval = orig_rig.evaluated_get(depsgraph)

# 全デフォームボーンの評価済みワールド行列を保存
eval_bind = {}
for bone in orig_rig.data.bones:
    if bone.use_deform:
        pb = orig_eval.pose.bones.get(bone.name)
        if pb:
            eval_bind[bone.name] = (orig_eval.matrix_world @ pb.matrix).copy()

print(f"  CyberpunkElf bind pose: {len(eval_bind)} deform bones")

# ========================================================================
# ステップ2: モーションファイルを開く
# ========================================================================
print(f"\n=== Step 2: Open motion file ===")
# モーション付きBlendファイルを開く
bpy.ops.wm.open_mainfile(filepath=MOTION_PATH)

# ボーン数最多のアーマチュアを選択
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Motion rig: {rig.name} ({len(arm.bones)} bones)")

# シーンのフレーム範囲とFPSを取得
fs = int(bpy.context.scene.frame_start)
fe = int(bpy.context.scene.frame_end)
fps = bpy.context.scene.render.fps
print(f"Frames: {fs}-{fe} ({fe-fs+1} frames, {fps} fps)")

# ソースのデフォームボーンリストを構築
src_deform = [b.name for b in arm.bones if b.use_deform]
print(f"Source deform bones: {len(src_deform)}")

# 座標変換行列
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])       # Blender→ビューア
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])   # ビューア→Blender

# バインド逆行列を構築: CyberpunkElfの評価済みバインドポーズを使用
# ソースボーンがCyberpunkElfに存在する場合（同名またはリマップ後）、
# CyberpunkElfのバインドポーズを使用して、CyberpunkElfのレストポーズからの変換を保証
bind_inv = {}
target_names = {}  # ソース名 → ターゲット名（CyberpunkElf名）
matched = 0    # 同名で一致したボーン数
remapped = 0   # リマップで一致したボーン数
skipped = 0    # スキップされたボーン数

for src_name in src_deform:
    # ターゲット名を決定
    if src_name in eval_bind:
        # 同名で一致
        target = src_name
        matched += 1
    elif src_name in BONE_REMAP and BONE_REMAP[src_name] in eval_bind:
        # リマップテーブルで一致
        target = BONE_REMAP[src_name]
        remapped += 1
    else:
        # 対応するボーンなし
        skipped += 1
        continue

    target_names[src_name] = target
    # CyberpunkElfの評価済みバインドポーズの逆行列
    bind_inv[src_name] = eval_bind[target].inverted()

print(f"  Matched: {matched}, Remapped: {remapped}, Skipped: {skipped}")
print(f"  Total exportable: {len(target_names)}")

# リマップされたボーンを表示
if remapped > 0:
    print(f"\n  Remapped bones:")
    for src, tgt in sorted(target_names.items()):
        if src != tgt:
            print(f"    {src} -> {tgt}")

# ========================================================================
# ステップ3: エクスポート
# ========================================================================
print(f"\n=== Step 3: Export ===")
depsgraph = bpy.context.evaluated_depsgraph_get()
bone_matrices = {src: [] for src in target_names}

# 各フレームを処理
for frame in range(fs, fe + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    for src_name in target_names:
        pb = rig_eval.pose.bones.get(src_name)
        if not pb:
            # ポーズボーンがなければ単位行列
            bone_matrices[src_name].append([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
            continue

        # ワールド行列 → スキニング行列 → 座標変換
        mat_world = rig_eval.matrix_world @ pb.matrix
        skin = mat_world @ bind_inv[src_name]
        conv = C @ skin @ C_inv
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[src_name].append(flat)

    # 50フレームごとに進捗表示
    if (frame - fs) % 50 == 0:
        print(f"  Frame {frame}/{fe}")

# ターゲット名（CyberpunkElf規約）で出力（アニメーションのあるボーンのみ）
ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
bones_out = {}
for src_name, mats in bone_matrices.items():
    tgt_name = target_names[src_name]  # ソース名→ターゲット名に変換
    if any(any(abs(m[i]-ident[i]) > 0.001 for i in range(16)) for m in mats):
        bones_out[tgt_name] = {"matrices": mats}

# モーションJSONとして出力
frame_count = fe - fs + 1
out_path = os.path.join(OUT_DIR, OUT_NAME)
with open(out_path, 'w') as f:
    json.dump({"fps": fps, "frame_count": frame_count, "bones": bones_out}, f)

# 結果を表示
sz = os.path.getsize(out_path) / 1024 / 1024
print(f"\nWritten: {out_path} ({sz:.1f} MB, {len(bones_out)} bones, {frame_count} frames)")
print("DONE")
