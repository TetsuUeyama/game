"""2つのBlendファイルのボーン名を詳細比較し、名前の違いで同じ役割のボーンを特定するスクリプト。"""
# Blender Pythonとシステムモジュールをインポート
import bpy, sys

# コマンドライン引数を取得
argv = sys.argv
# "--"セパレーターの位置を探す
idx = argv.index("--") if "--" in argv else len(argv)
# スクリプト引数（2つのBlendファイルパス）を取得
args = argv[idx + 1:]

# 各リグの情報を格納する辞書
rigs = {}

# 最大2つのBlendファイルを処理
for blend_path in args[:2]:
    # Blendファイルを開く
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    # ボーン数最多のアーマチュアをメインリグとして選択
    rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
              key=lambda o: len(o.data.bones))
    arm = rig.data
    # ファイル名をラベルとして使用
    label = blend_path.split('\\')[-1].split('/')[-1].replace('.blend','')

    # デフォームボーン名→親ボーン名のマップを構築
    deform = {}
    for b in arm.bones:
        if b.use_deform:
            parent = b.parent.name if b.parent else 'ROOT'
            deform[b.name] = parent
    rigs[label] = deform

# 2つのリグのラベルとボーンセットを取得
labels = list(rigs.keys())
a_name, b_name = labels[0], labels[1]
a_bones, b_bones = rigs[a_name], rigs[b_name]

# 共通ボーンと片方のみのボーンを計算
common = set(a_bones.keys()) & set(b_bones.keys())
only_a = sorted(set(a_bones.keys()) - set(b_bones.keys()))
only_b = sorted(set(b_bones.keys()) - set(a_bones.keys()))

# 基本統計を表示
print(f"=== {a_name}: {len(a_bones)} deform ===")
print(f"=== {b_name}: {len(b_bones)} deform ===")
print(f"Common: {len(common)}")
print(f"Only {a_name}: {len(only_a)}")
print(f"Only {b_name}: {len(only_b)}")

# 正規表現モジュールをインポート（名前マッチング用）
import re

# ボーン名を比較用に正規化する関数
def normalize(name):
    """ボーン名を正規化して比較可能にする。"""
    n = name.lower().strip()
    # アンダースコアとスペースをドットに統一
    n = n.replace('_', '.').replace(' ', '.')
    return n

# 左右サフィックスを除いたベース名を取得する関数
def base_name(name):
    """左右・番号サフィックスを無視してベース名を抽出。"""
    for suffix in ['.l', '.r', '.x', '.001', '.002']:
        if name.endswith(suffix):
            return name[:-len(suffix)]
    return name

# 名前が違うが同じ役割のボーンを類似度スコアで特定
print(f"\n=== LIKELY MATCHES (same role, different name) ===")
matches = []
used_b = set()  # 既にマッチ済みのBボーン

for a in only_a:
    a_norm = normalize(a)
    a_base = normalize(base_name(a))
    best_match = None
    best_score = 0

    for b in only_b:
        # 既にマッチ済みならスキップ
        if b in used_b:
            continue
        b_norm = normalize(b)
        b_base = normalize(base_name(b))

        # 左右サフィックスの互換性チェック（.lと.rの不一致は除外）
        a_suffix = ''
        b_suffix = ''
        for s in ['.l', '.r', '.x']:
            if a.endswith(s): a_suffix = s
            if b.endswith(s): b_suffix = s
        if a_suffix and b_suffix and a_suffix != b_suffix:
            continue

        # ベース名が完全一致（セパレータの違いのみ）
        if a_base == b_base:
            score = 100
        # 一方が他方を含む
        elif a_base in b_base or b_base in a_base:
            score = 70
        # その他のパターンマッチング
        else:
            # ドット/アンダースコアの違いを正規化して比較
            a_clean = a.replace('.', '_').replace(' ', '_').lower()
            b_clean = b.replace('.', '_').replace(' ', '_').lower()
            if a_clean == b_clean:
                score = 95
            # 末尾の左右・番号を除去して比較
            elif a_clean.rstrip('_lrx0123') == b_clean.rstrip('_lrx0123'):
                score = 80
            else:
                # ボーン名をパーツに分割して共通部分の割合で評価
                a_parts = set(re.split(r'[._]', a.lower()))
                b_parts = set(re.split(r'[._]', b.lower()))
                overlap = len(a_parts & b_parts)
                total = max(len(a_parts), len(b_parts))
                if total > 0 and overlap / total > 0.5:
                    score = int(60 * overlap / total)
                else:
                    score = 0

        # より高いスコアがあれば更新
        if score > best_score:
            best_score = score
            best_match = b

    # スコア50以上ならマッチとして登録
    if best_match and best_score >= 50:
        matches.append((a, best_match, best_score))
        used_b.add(best_match)

# スコアの降順でソート
matches.sort(key=lambda x: -x[2])

# マッチ結果を表示
if matches:
    for a, b, score in matches:
        a_parent = a_bones[a]
        b_parent = b_bones[b]
        # 親ボーンもマッチしているかチェック
        parent_match = 'parent-match' if normalize(a_parent) == normalize(b_parent) or a_parent in common or b_parent in common else ''
        print(f"  {a:35s} <-> {b:35s} (score={score}) {parent_match}")
    print(f"\nTotal likely matches: {len(matches)}")
else:
    print("  None found")

# マッチしなかったボーンを表示
unmatched_a = [a for a in only_a if a not in [m[0] for m in matches]]
unmatched_b = [b for b in only_b if b not in [m[1] for m in matches]]

print(f"\n=== UNMATCHED in {a_name} ({len(unmatched_a)}) ===")
for n in unmatched_a:
    print(f"  {n:35s} parent={a_bones[n]}")

print(f"\n=== UNMATCHED in {b_name} ({len(unmatched_b)}) ===")
for n in unmatched_b:
    print(f"  {n:35s} parent={b_bones[n]}")

# 完了メッセージ
print("\nDONE")
