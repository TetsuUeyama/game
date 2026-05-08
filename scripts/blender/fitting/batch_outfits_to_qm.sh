#!/usr/bin/env bash
# Batch process all Helena outfits → QM voxel pipeline.
# Each outfit: TPS retarget → push_inside_only → voxelize → output to public/box5/qm_mustardui/
#
# 所要時間: 1 outfit あたり ~3-4分。10 outfit で ~35分。

set -e

BL="/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
QM_BLEND="E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend"
HELENA_BLEND="E:/Helena_Final_Public.blend"
HELENA_BODY="Helena_Base"
QM_BODY="Queen Marika Body"
QM_ARM="QueenMarika_rig"
OUTER_BVH="F:/QM_OuterBodyOnly.blend:Queen Marika Body"
CONFIG="config/clothing_retarget_helena_to_qm.json"
VOX_OUT="C:/Users/user/developsecond/contactform/public/box5/qm_mustardui"

# (outfit_key, mesh_name)
declare -a OUTFITS=(
    "rs_panties|GCC DOA Outfit Rise and Shine Blouse Panties Mesh"
    "rs_shirt_normal|GCC DOA Outfit Rise and Shine Blouse Shirt Normal Mesh"
    "rs_shirt_nude|GCC DOA Outfit Rise and Shine Blouse Shirt Nude Mesh"
    "dark_prison_a|GCC DOA Outfit Dark Prison A Mesh"
    "dark_prison_b|GCC DOA Outfit Dark Prison B Mesh"
    "qipao|Qipao Mesh"
    "qipao_panty|Qipao Panty Mesh"
    "qipao_shoe|Qipao Shoe Mesh"
    "qipao_sock|Qipao Sock Mesh"
)

LOG_DIR="F:/batch_outfits"
mkdir -p "$LOG_DIR"

for entry in "${OUTFITS[@]}"; do
    key="${entry%%|*}"
    mesh="${entry#*|}"
    echo ""
    echo "=================================================="
    echo "Processing: $key ($mesh)"
    echo "=================================================="

    TPS_BLEND="E:/Helena_${key}_to_QM_tps.blend"
    PUSH_BLEND="E:/Helena_${key}_to_QM_tps_push.blend"
    OUT_PREFIX="helena_${key}"

    # Step 1: TPS retarget
    echo "[1/3] TPS retarget..."
    "$BL" --background "$QM_BLEND" \
      --python scripts/blender/fitting/tps_retarget.py -- \
      "$CONFIG" "$HELENA_BLEND" "$HELENA_BODY" "$mesh" \
      "$QM_BODY" "$QM_ARM" "$TPS_BLEND" \
      --samples-per-bone 6 --lambda 0.001 \
      > "$LOG_DIR/${key}_tps.log" 2>&1
    echo "  done. Log: $LOG_DIR/${key}_tps.log"

    # Step 2: Push inside only
    echo "[2/3] Push inside only..."
    "$BL" --background "$TPS_BLEND" \
      --python scripts/blender/fitting/push_inside_only.py -- \
      "$PUSH_BLEND" \
      "${mesh} (TPS)" \
      "$QM_BODY" \
      0.002 \
      --bvh-from "$OUTER_BVH" \
      > "$LOG_DIR/${key}_push.log" 2>&1
    echo "  done."

    # Step 3: Voxelize
    echo "[3/3] Voxelize..."
    "$BL" --background "$PUSH_BLEND" \
      --python scripts/blender/voxelize/voxelize_mustardui.py -- \
      "$VOX_OUT" "${mesh} (TPS)" "$OUT_PREFIX" \
      --no-interior \
      > "$LOG_DIR/${key}_voxelize.log" 2>&1
    echo "  done. → ${VOX_OUT}/${OUT_PREFIX}.vox"

    # Cleanup intermediate blends to save disk
    rm -f "$TPS_BLEND" "$PUSH_BLEND" "${TPS_BLEND%.blend}.tps.json"
    echo "  cleaned up intermediate blends"
done

echo ""
echo "=================================================="
echo "All outfits processed. Logs in $LOG_DIR/"
echo "=================================================="
