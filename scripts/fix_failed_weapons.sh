#!/bin/bash
# Re-process weapons that failed due to apostrophe in filename

BLENDER="/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
SCRIPT="/c/Users/user/developsecond/contactform/scripts/voxelize_weapon.py"
SRC_DIR="/c/Users/user/Downloads/uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1/+100 Fantasy Weapons Basemesh Pack V1/GLB"
OUT_BASE="/c/Users/user/developsecond/game-assets/wapons"
VOXEL_SIZE="0.007"

# Failed weapons: name|category|safe_name
declare -a WEAPONS=(
    "Adventurer's Halberd|halberds|Adventurers_Halberd"
    "Adventurer's Spear|spears|Adventurers_Spear"
    "Executioner's Great Machete|greatswords|Executioners_Great_Machete"
    "Falconer's White Bow|bows|Falconers_White_Bow"
    "Knight's Straight Sword|swords|Knights_Straight_Sword"
    "Knight's Sword|swords|Knights_Sword"
    "Miner's Pick|axes|Miners_Pick"
    "Ripper's Harpoon|spears|Rippers_Harpoon"
    "Ripper's Scythe|scythes|Rippers_Scythe"
    "Wyvern's Thorn|swords|Wyverns_Thorn"
)

success=0
fail=0

for entry in "${WEAPONS[@]}"; do
    IFS='|' read -r name category safe_name <<< "$entry"
    glb_file="$SRC_DIR/${name}.glb"
    out_dir="$OUT_BASE/$category/$safe_name"

    echo "Processing: $name -> $category/$safe_name"
    mkdir -p "$out_dir"

    "$BLENDER" --background --python "$SCRIPT" -- "$glb_file" "$out_dir" "$VOXEL_SIZE" 2>&1 | grep -E "(Generated|Written|ERROR|Grid:|No voxels)"

    if [ -f "$out_dir/${safe_name}.vox" ]; then
        success=$((success + 1))
        echo "  OK"
    else
        # The vox file might have a different name due to apostrophe handling in Python
        vox_count=$(find "$out_dir" -name "*.vox" | wc -l)
        if [ "$vox_count" -gt 0 ]; then
            # Rename to expected name
            actual_vox=$(find "$out_dir" -name "*.vox" | head -1)
            if [ "$actual_vox" != "$out_dir/${safe_name}.vox" ]; then
                mv "$actual_vox" "$out_dir/${safe_name}.vox"
                echo "  Renamed vox file"
            fi
            success=$((success + 1))
            echo "  OK (after rename)"
        else
            echo "  FAILED"
            fail=$((fail + 1))
        fi
    fi
done

echo ""
echo "=== Fix Summary ==="
echo "Success: $success"
echo "Failed: $fail"
