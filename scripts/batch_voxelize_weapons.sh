#!/bin/bash
# Batch voxelize all 109 Fantasy Weapons into categorized folders
# Usage: bash scripts/batch_voxelize_weapons.sh

BLENDER="/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
SCRIPT="/c/Users/user/developsecond/contactform/scripts/voxelize_weapon.py"
SRC_DIR="/c/Users/user/Downloads/uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1/+100 Fantasy Weapons Basemesh Pack V1/GLB"
OUT_BASE="/c/Users/user/developsecond/game-assets/wapons"
VOXEL_SIZE="0.007"

# Category mapping function
get_category() {
    local name="$1"
    case "$name" in
        # Swords (片手剣)
        "Adventurer Sword"|"AnotherNormalSword"|"Beastslayer Sword"|"Crystal Sword"|"Curve Sword"|"Curved Sword"|"Cyber Blade"|"Demon Slayer Sword"|"Guard Sword"|"Gun Sword"|"Knight's Straight Sword"|"Knight's Sword"|"Lonsword"|"Mist King Sword"|"Sandard-Length Sword"|"Short Sword"|"Silver Straight Sword"|"Simple Sword"|"Straight Sword"|"Sword of the Eternal Saint"|"Sword of the Serpent God"|"Wide Short Sword"|"Wide sword"|"Wyvern's Thorn")
            echo "swords"
            ;;
        # Greatswords (大剣)
        "4-Blade Sword"|"Black Bone Sword"|"Blunt Blade"|"Claymore"|"Crystallized Greatsword"|"Double Crystal Edge"|"Executioner's Great Machete"|"Fractured Demon Sword"|"General Krieg Greatsword"|"Greatsword of Scales"|"Greatsword of the Conqueror"|"Heavy Steel Greatsword"|"Imperial GreatSword"|"Leiden Grand Sword1"|"Silver Greatsword"|"Slicer Blade"|"The Heavy Slasher"|"Ultra Greatsword of the Perpetual Knight"|"Fang of the Worldeater")
            echo "greatswords"
            ;;
        # Katanas (刀)
        "CurvKatana"|"LongKatana"|"ShortKatana"|"Espada Recta de Damasco"|"Facón")
            echo "katanas"
            ;;
        # Daggers (短剣)
        "Curv Dagger"|"Dagger"|"Double-Bladed Hand Dagger"|"Droad Dagger"|"Iron Dagger"|"Knife"|"Knife Sheath"|"Medieval Dagger "|"Pointed  Dagger"|"Rare Dagger"|"Shadow Assassin Dagger"|"ShortDagger"|"Standard Dagger"|"Throwing Knife"|"Curve Knife"|"Bone Fang"|"Razor Saw")
            echo "daggers"
            ;;
        # Rapiers (細剣)
        "Crystal Rapier"|"LightSaber"|"Sai"|"Sai_2")
            echo "rapiers"
            ;;
        # Axes (斧)
        "Axe"|"Double Ax"|"Giant Great Ax of the Fallen"|"Hacha de Guerra"|"Knight Axe"|"Pick Ax"|"Rough Axe"|"Steel Ax"|"Miner's Pick")
            echo "axes"
            ;;
        # Spears (槍)
        "Adventurer's Spear"|"Ash Spear"|"Crossed Spear"|"Jagged Spear"|"Spear of the Fang"|"Steel Harpoon"|"Ripper's Harpoon")
            echo "spears"
            ;;
        # Halberds (薙刀/ハルバード)
        "Adventurer's Halberd"|"Demonic Halberd"|"Runic Halberd")
            echo "halberds"
            ;;
        # Scythes (鎌)
        "Ash Crusade Scythe"|"Death Scythe"|"Fang Scythe"|"Great Cinder Scythe"|"Ripper's Scythe"|"Scythe Hook"|"Scythe of the Ruin King"|"Short Bronze Scythe")
            echo "scythes"
            ;;
        # Bows (弓)
        "Falconer's White Bow"|"Frost Bow. Ignavus"|"Great Crystal Bow"|"Mechanical Bow"|"Obsidian Dragon Bow X")
            echo "bows"
            ;;
        # Guns (銃)
        "Hunter Gun"|"Hunter Gun_2")
            echo "guns"
            ;;
        # Shields (盾)
        "Shield_1"|"Shield_2"|"Shield_3"|"Shield_4")
            echo "shields"
            ;;
        # Hammers/Maces (鈍器)
        "WarHammer")
            echo "hammers"
            ;;
        # Wands/Staves (杖)
        "Wand")
            echo "wands"
            ;;
        *)
            echo "other"
            ;;
    esac
}

# Create output directories
mkdir -p "$OUT_BASE"/{swords,greatswords,katanas,daggers,rapiers,axes,spears,halberds,scythes,bows,guns,shields,hammers,wands,other}

# Count
total=0
success=0
fail=0

echo "=== Batch Weapon Voxelizer ==="
echo "Source: $SRC_DIR"
echo "Output: $OUT_BASE"
echo ""

for glb_file in "$SRC_DIR"/*.glb; do
    base_name=$(basename "$glb_file" .glb)
    category=$(get_category "$base_name")
    safe_name=$(echo "$base_name" | sed 's/ /_/g; s/'\''//g; s/\./_/g')
    out_dir="$OUT_BASE/$category/$safe_name"

    total=$((total + 1))

    # Skip if already done
    if [ -f "$out_dir/${safe_name}.vox" ]; then
        echo "[$total] SKIP (exists): $base_name -> $category/"
        success=$((success + 1))
        continue
    fi

    mkdir -p "$out_dir"

    echo "[$total] Processing: $base_name -> $category/$safe_name"

    "$BLENDER" --background --python "$SCRIPT" -- "$glb_file" "$out_dir" "$VOXEL_SIZE" 2>&1 | grep -E "(Generated|Written|ERROR|Grid:|No voxels)"

    if [ -f "$out_dir/${safe_name}.vox" ]; then
        success=$((success + 1))
    else
        echo "  FAILED: $base_name"
        fail=$((fail + 1))
    fi
done

echo ""
echo "=== Summary ==="
echo "Total: $total"
echo "Success: $success"
echo "Failed: $fail"

# Generate master parts.json for each category
echo ""
echo "=== Generating parts.json per category ==="
for cat_dir in "$OUT_BASE"/*/; do
    cat_name=$(basename "$cat_dir")
    parts_json="$cat_dir/parts.json"

    # Build JSON array
    echo "[" > "$parts_json"
    first=true
    for weapon_dir in "$cat_dir"/*/; do
        [ -d "$weapon_dir" ] || continue
        weapon_name=$(basename "$weapon_dir")
        vox_file="$weapon_dir/${weapon_name}.vox"
        grid_file="$weapon_dir/grid.json"

        [ -f "$vox_file" ] || continue

        # Get voxel count from grid.json
        voxel_count=0
        if [ -f "$grid_file" ]; then
            voxel_count=$(python3 -c "import json; print(json.load(open('$grid_file')).get('voxel_count', 0))" 2>/dev/null || echo "0")
        fi

        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$parts_json"
        fi

        cat >> "$parts_json" << ENTRY
  {
    "key": "$weapon_name",
    "file": "/$cat_name/$weapon_name/${weapon_name}.vox",
    "voxels": $voxel_count,
    "default_on": true,
    "category": "$cat_name"
  }
ENTRY
    done
    echo "]" >> "$parts_json"
    echo "  $cat_name/parts.json created"
done

echo ""
echo "=== All Done! ==="
