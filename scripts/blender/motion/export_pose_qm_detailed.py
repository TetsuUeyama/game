"""
QM Detailedモデル（個別の指/足指ボーン）用のポーズモーションをエクスポートするスクリプト。

Usage:
  blender --background --python export_pose_qm_detailed.py -- <pose.blend> <orig.blend> <out_dir> [out_name]
"""
# Blender Python、システム、JSON、OSモジュールをインポート
import bpy, sys, json, os
# mathutilsからMatrix型をインポート
from mathutils import Matrix

# コマンドライン引数を取得
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
POSE_PATH = args[0]     # ポーズ付きBlendファイル
ORIG_PATH = args[1]     # 元モデル（バインドポーズソース）
OUT_DIR = args[2]        # 出力ディレクトリ
# 出力ファイル名（省略時はデフォルト）
OUT_NAME = args[3] if len(args) > 3 else "pose_qm_detailed.motion.json"

# ARPボーン名の正規化マップ（QMリグ名→CEリグ名）
ARP_NORMALIZE = {
    'thigh_stretch': 'c_thigh_stretch',       # 太ももストレッチ
    'thigh_twist': 'c_thigh_twist',           # 太ももツイスト
    'thigh_twist_2': 'c_thigh_twist_2',       # 太ももツイスト2
    'leg_stretch': 'c_leg_stretch',           # 脛ストレッチ
    'leg_twist': 'c_leg_twist',               # 脛ツイスト
    'leg_twist_2': 'c_leg_twist_2',           # 脛ツイスト2
    'arm_stretch': 'c_arm_stretch',           # 腕ストレッチ
    'arm_twist_2': 'c_arm_twist_2',           # 腕ツイスト2
    'c_arm_twist_offset': 'c_arm_twist',      # 腕ツイストオフセット
    'forearm_stretch': 'c_forearm_stretch',   # 前腕ストレッチ
    'forearm_twist': 'c_forearm_twist',       # 前腕ツイスト
    'forearm_twist_2': 'c_forearm_twist_2',   # 前腕ツイスト2
    'spine_01': 'c_spine_01_bend',            # 脊椎01
    'spine_02': 'c_spine_02_bend',            # 脊椎02
    'spine_03': 'c_spine_03_bend',            # 脊椎03
    'root': 'c_root_bend',                    # ルートボーン
    'cc_balls': 'c_root_bend',                # CC balls → ルートに統合
}

# 顔ボーンのプレフィックス（headに統合される）
FACE_MERGE_PREFIXES = ('c_lips_', 'c_teeth_', 'c_nose_', 'c_chin_', 'c_cheek_',
                       'c_eyebrow_', 'c_eyelid_', 'c_eye_ref_track', 'c_eye_offset',
                       'tong_')

# ARPボーン名を正規化する関数
def normalize_arp_name(name):
    suffix = ''
    # 左右・中心サフィックスを分離
    for s in ['.l', '.r', '.x']:
        if name.endswith(s):
            base = name[:-len(s)]
            suffix = s
            break
    else:
        base = name
    # 正規化マップに含まれていれば変換
    if base in ARP_NORMALIZE:
        return ARP_NORMALIZE[base] + suffix
    return name

# ボーン名を解決する関数（指/足指は個別に保持、その他はグループ化）
def resolve_bone_name(name):
    """ボーン名を解決 - 指/足指は個別に保持。"""
    name = normalize_arp_name(name)
    # 顔ボーン → headに統合
    if any(name.startswith(p) for p in FACE_MERGE_PREFIXES):
        return 'head.x'
    # 性器/臀部ボーン → ルートに統合
    if name.startswith('vagina') or name == 'genital':
        return 'c_root_bend.x'
    if name.startswith('butt'):
        return 'c_root_bend.x'
    # 乳首ボーン → 胸に統合
    if name.startswith('nipple'):
        if '_l' in name or '.l' in name: return 'breast_l'
        if '_r' in name or '.r' in name: return 'breast_r'
        return 'breast_l'
    # 口角ボーン → headに統合
    if name.startswith('c_lips_smile'):
        return 'head.x'
    # 目ボーン → headに統合
    if name.startswith('c_eye.'):
        return 'head.x'
    # アクセサリーボーン → スキップ
    if name.startswith('Necklace_') or name.startswith('belt_tail'):
        return None
    # 肘サブボーン → スキップ
    if name.startswith('lowerarm_elbow'):
        return None
    # QMのドット→アンダースコア変換（knee, breast）
    if name in ('knee.l', 'knee.r', 'breast.l', 'breast.r'):
        return name.replace('.', '_')
    return name

# 座標変換行列
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])       # Blender→ビューア
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])   # ビューア→Blender

# ステップ1: バインドポーズ取得
print("=== Step 1: Bind pose ===")
bpy.ops.wm.open_mainfile(filepath=ORIG_PATH)
orig_rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        orig_rig = o
        break

depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(0)
depsgraph.update()
orig_eval = orig_rig.evaluated_get(depsgraph)

# 評価済みバインドポーズを保存
eval_bind = {}
for bone in orig_rig.data.bones:
    if bone.use_deform:
        pb = orig_eval.pose.bones.get(bone.name)
        if pb:
            eval_bind[bone.name] = (orig_eval.matrix_world @ pb.matrix).copy()
print(f"  Bind pose: {len(eval_bind)} deform bones")

# ステップ2: ポーズファイルを開く
print(f"\n=== Step 2: Open pose ===")
bpy.ops.wm.open_mainfile(filepath=POSE_PATH)

# QMリグを探す（名前にqueenmarikaを含むアーマチュア優先）
rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and 'queenmarika' in o.name.lower().replace(' ', '').replace('_', ''):
        rig = o
        break
if not rig:
    # 除外リストに含まれない最大のアーマチュアを使用
    exclude = ['radagon', 'spartan', 'pillarwoman']
    candidates = [o for o in bpy.data.objects
                  if o.type == 'ARMATURE' and len(o.data.bones) > 100
                  and not any(ex in o.name.lower() for ex in exclude)]
    if candidates:
        rig = max(candidates, key=lambda o: len(o.data.bones))
    else:
        armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
        rig = max(armatures, key=lambda o: len(o.data.bones))

arm = rig.data
fps = int(bpy.context.scene.render.fps)
fs = int(bpy.context.scene.frame_start)
fe = int(bpy.context.scene.frame_end)
print(f"  Rig: {rig.name} ({len(arm.bones)} bones)")
print(f"  Scene: frames {fs}-{fe}, {fps} fps")

# デフォームボーンとバインド逆行列を準備
deform_bones = [b.name for b in arm.bones if b.use_deform]

bind_inv = {}
fallback = 0
for bname in deform_bones:
    if bname in eval_bind:
        bind_inv[bname] = eval_bind[bname].inverted()
    else:
        bone = arm.bones.get(bname)
        if bone:
            bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()
            fallback += 1
print(f"  Bind inv: {len(eval_bind)} eval, {fallback} fallback")

# ステップ3: エクスポート
print(f"\n=== Step 3: Export ===")
frame_count = fe - fs + 1
raw_matrices = {b: [] for b in deform_bones}

# 各フレームのスキニング行列を計算
depsgraph = bpy.context.evaluated_depsgraph_get()
for frame in range(fs, fe + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    for bname in deform_bones:
        ppb = rig_eval.pose.bones.get(bname)
        if not ppb or bname not in bind_inv:
            raw_matrices[bname].append([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
            continue
        mat_world = rig_eval.matrix_world @ ppb.matrix
        skin = mat_world @ bind_inv[bname]
        conv = C @ skin @ C_inv
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        raw_matrices[bname].append(flat)
    if (frame - fs) % 20 == 0:
        print(f"  Frame {frame}/{fe}")

# 解決済みボーン名でグループ化
ident = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
resolved_groups = {}
for bname, mats in raw_matrices.items():
    resolved = resolve_bone_name(bname)
    if resolved is None:
        continue  # スキップ対象のボーン
    if resolved not in resolved_groups:
        resolved_groups[resolved] = []
    resolved_groups[resolved].append((bname, mats))

# 各グループから代表ボーンの行列を出力
bones_out = {}
for resolved_name, group in resolved_groups.items():
    if len(group) == 1:
        # 1対1マッピングの場合
        bname, mats = group[0]
        if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
            bones_out[resolved_name] = {"matrices": mats}
    else:
        # 複数ボーンが同じ名前に解決された場合、優先ボーンを選択
        primary = None
        for bname, mats in group:
            if bname == resolved_name:
                primary = (bname, mats)
                break
        if not primary:
            primary = group[0]  # 見つからなければ最初のボーンを使用
        bname, mats = primary
        if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
            bones_out[resolved_name] = {"matrices": mats}

# JSONとして出力
out_path = os.path.join(OUT_DIR, OUT_NAME)
with open(out_path, 'w') as f:
    json.dump({"fps": fps, "frame_count": frame_count, "bones": bones_out}, f)

# 結果を表示
print(f"\nWritten: {out_path} ({os.path.getsize(out_path)/1024/1024:.1f} MB, {len(bones_out)} bones, {frame_count} frames)")
print("DONE")
