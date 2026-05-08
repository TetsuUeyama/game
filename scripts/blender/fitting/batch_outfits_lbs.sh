#!/usr/bin/env bash
# Batch LBS retarget for all Helena outfits → QM voxel.
# 各 outfit: lbs_retarget_clothing.py → voxelize_mustardui.py
# 所要: ~3分/outfit、9 outfit で ~30分

set -e

BL="/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
QM_BLEND="E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend"
HELENA_BLEND="E:/Helena_Final_Public_QMRest.blend"   # v4 QMRest-baked (rest pose 統一済)
HELENA_BODY="Helena_Base"
QM_BODY="Queen Marika Body"
QM_ARM="QueenMarika_rig"
OUTER_BVH="F:/QM_OuterBodyOnly.blend:Queen Marika Body"
CONFIG="config/clothing_retarget_helena_to_qm.json"
VOX_OUT="C:/Users/user/developsecond/contactform/public/box5/qm_mustardui"

declare -a OUTFITS=(
    "bodysuit|GCC DOA Outfit Bodysuit Mesh"
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

LOG_DIR="F:/batch_outfits_lbs"
mkdir -p "$LOG_DIR"

for entry in "${OUTFITS[@]}"; do
    key="${entry%%|*}"
    mesh="${entry#*|}"
    echo ""
    echo "=================================================="
    echo "LBS Processing: $key"
    echo "=================================================="

    LBS_BLEND="E:/Helena_${key}_lbs.blend"
    OUT_PREFIX="helena_${key}"

    # Step 1: LBS retarget
    echo "[1/2] LBS retarget..."
    "$BL" --background "$QM_BLEND" \
      --python scripts/blender/fitting/lbs_retarget_clothing.py -- \
      "$CONFIG" "$HELENA_BLEND" "$HELENA_BODY" "$mesh" \
      "$QM_BODY" "$QM_ARM" "$LBS_BLEND" \
      --tgt-outer-bvh "$OUTER_BVH" \
      > "$LOG_DIR/${key}_lbs.log" 2>&1
    echo "  done. log: $LOG_DIR/${key}_lbs.log"

    # Step 2: Voxelize
    echo "[2/2] Voxelize..."
    "$BL" --background "$LBS_BLEND" \
      --python scripts/blender/voxelize/voxelize_mustardui.py -- \
      "$VOX_OUT" "${mesh} (LBS v3)" "$OUT_PREFIX" \
      --no-interior \
      > "$LOG_DIR/${key}_voxelize.log" 2>&1
    echo "  done → ${VOX_OUT}/${OUT_PREFIX}.vox"

    rm -f "$LBS_BLEND"
    echo "  cleaned up"
done

echo ""
echo "=================================================="
echo "All outfits processed via LBS. Logs in $LOG_DIR/"
echo "=================================================="
