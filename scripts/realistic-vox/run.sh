#!/bin/bash
# =======================================================================
# Realistic Voxelization Pipeline for CyberpunkElf
# =======================================================================
# Usage:
#   bash scripts/realistic-vox/run.sh [resolution]
#
# Prerequisites:
#   - Blender must be in PATH (or set BLENDER_PATH below)
#   - Input: E:\MOdel\CyberpunkElf_ARP_MustardUI.blend
# =======================================================================

BLENDER_PATH="${BLENDER_PATH:-blender}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

INPUT="E:/MOdel/CyberpunkElf_ARP_MustardUI.blend"
OUT_DIR="$PROJECT_DIR/public/realistic"
RESOLUTION="${1:-180}"

echo "============================================="
echo "  Realistic Voxelization Pipeline"
echo "============================================="
echo "  Blender:    $BLENDER_PATH"
echo "  Input:      $INPUT"
echo "  Output:     $OUT_DIR"
echo "  Resolution: $RESOLUTION"
echo "============================================="

# Step 1: List parts (for reference)
echo ""
echo ">>> Step 1: Listing mesh parts..."
"$BLENDER_PATH" --background --python "$SCRIPT_DIR/list_parts.py" -- "$INPUT" 2>/dev/null

echo ""
echo ">>> Continue with voxelization? (y/n)"
read -r CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Aborted."
    exit 0
fi

# Step 2: Voxelize all parts
echo ""
echo ">>> Step 2: Voxelizing all parts..."
"$BLENDER_PATH" --background --python "$SCRIPT_DIR/voxelize_all_parts.py" -- \
    "$INPUT" "$OUT_DIR" \
    --resolution "$RESOLUTION" \
    --body body \
    --group "hair:hair,bangs,ponytail" \
    2>&1 | tee "$OUT_DIR/voxelize_log.txt"

echo ""
echo ">>> Done! Output in: $OUT_DIR"
echo ">>> View at: http://localhost:3000/realistic-viewer"
