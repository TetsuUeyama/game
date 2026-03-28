#!/bin/bash
# =======================================================================
# CyberpunkElf用リアリスティックボクセル化パイプライン
# =======================================================================
# 使用方法:
#   bash scripts/realistic-vox/run.sh [resolution]
#
# 前提条件:
#   - BlenderがPATHに含まれている（または下記のBLENDER_PATHを設定）
#   - 入力ファイル: E:\MOdel\CyberpunkElf_ARP_MustardUI.blend
# =======================================================================

# Blenderのパス（環境変数BLENDER_PATHがあればそれを使用、なければデフォルト）
BLENDER_PATH="${BLENDER_PATH:-blender}"
# スクリプトディレクトリのパスを取得（このスクリプトの位置から算出）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# プロジェクトルートディレクトリのパス（スクリプトディレクトリから2階層上）
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 入力Blendファイルのパス
INPUT="E:/MOdel/CyberpunkElf_ARP_MustardUI.blend"
# 出力ディレクトリ（public/realistic配下）
OUT_DIR="$PROJECT_DIR/public/realistic"
# 解像度（コマンドライン引数で指定可能、デフォルト180）
RESOLUTION="${1:-180}"

# 設定情報を表示
echo "============================================="
echo "  Realistic Voxelization Pipeline"
echo "============================================="
echo "  Blender:    $BLENDER_PATH"
echo "  Input:      $INPUT"
echo "  Output:     $OUT_DIR"
echo "  Resolution: $RESOLUTION"
echo "============================================="

# ステップ1: パーツ一覧を表示（参照用）
echo ""
echo ">>> Step 1: Listing mesh parts..."
# list_parts.pyを実行してモデル内のメッシュパーツを列挙
"$BLENDER_PATH" --background --python "$SCRIPT_DIR/list_parts.py" -- "$INPUT" 2>/dev/null

# ユーザーに続行確認を求める
echo ""
echo ">>> Continue with voxelization? (y/n)"
read -r CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Aborted."  # 中断
    exit 0
fi

# ステップ2: 全パーツをボクセル化
echo ""
echo ">>> Step 2: Voxelizing all parts..."
# voxelize_all_parts.pyを実行（ボディキーワード"body"、髪グループ定義付き）
# 出力をコンソールとログファイルの両方に記録（tee）
"$BLENDER_PATH" --background --python "$SCRIPT_DIR/voxelize_all_parts.py" -- \
    "$INPUT" "$OUT_DIR" \
    --resolution "$RESOLUTION" \
    --body body \
    --group "hair:hair,bangs,ponytail" \
    2>&1 | tee "$OUT_DIR/voxelize_log.txt"

# 完了メッセージとビューアURLを表示
echo ""
echo ">>> Done! Output in: $OUT_DIR"
echo ">>> View at: http://localhost:3000/realistic-viewer"
