#!/bin/bash
# 109個のファンタジー武器を一括ボクセル化してカテゴリ別フォルダに格納するスクリプト
# 使用方法: bash scripts/batch_voxelize_weapons.sh

# Blender実行ファイルのパス
BLENDER="/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
# ボクセル化スクリプトのパス
SCRIPT="/c/Users/user/developsecond/contactform/scripts/voxelize_weapon.py"
# GLBファイルのソースディレクトリ（100+ファンタジー武器パック）
SRC_DIR="/c/Users/user/Downloads/uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1/+100 Fantasy Weapons Basemesh Pack V1/GLB"
# ボクセル化結果の出力先ベースディレクトリ
OUT_BASE="/c/Users/user/developsecond/game-assets/wapons"
# ボクセルサイズ（メートル単位）
VOXEL_SIZE="0.007"

# 武器名からカテゴリを判定する関数
get_category() {
    local name="$1"  # 武器名を引数として受け取る
    case "$name" in
        # Swords（片手剣）— 24種類
        "Adventurer Sword"|"AnotherNormalSword"|"Beastslayer Sword"|"Crystal Sword"|"Curve Sword"|"Curved Sword"|"Cyber Blade"|"Demon Slayer Sword"|"Guard Sword"|"Gun Sword"|"Knight's Straight Sword"|"Knight's Sword"|"Lonsword"|"Mist King Sword"|"Sandard-Length Sword"|"Short Sword"|"Silver Straight Sword"|"Simple Sword"|"Straight Sword"|"Sword of the Eternal Saint"|"Sword of the Serpent God"|"Wide Short Sword"|"Wide sword"|"Wyvern's Thorn")
            echo "swords"
            ;;
        # Greatswords（大剣）— 19種類
        "4-Blade Sword"|"Black Bone Sword"|"Blunt Blade"|"Claymore"|"Crystallized Greatsword"|"Double Crystal Edge"|"Executioner's Great Machete"|"Fractured Demon Sword"|"General Krieg Greatsword"|"Greatsword of Scales"|"Greatsword of the Conqueror"|"Heavy Steel Greatsword"|"Imperial GreatSword"|"Leiden Grand Sword1"|"Silver Greatsword"|"Slicer Blade"|"The Heavy Slasher"|"Ultra Greatsword of the Perpetual Knight"|"Fang of the Worldeater")
            echo "greatswords"
            ;;
        # Katanas（刀）— 5種類
        "CurvKatana"|"LongKatana"|"ShortKatana"|"Espada Recta de Damasco"|"Facón")
            echo "katanas"
            ;;
        # Daggers（短剣）— 17種類
        "Curv Dagger"|"Dagger"|"Double-Bladed Hand Dagger"|"Droad Dagger"|"Iron Dagger"|"Knife"|"Knife Sheath"|"Medieval Dagger "|"Pointed  Dagger"|"Rare Dagger"|"Shadow Assassin Dagger"|"ShortDagger"|"Standard Dagger"|"Throwing Knife"|"Curve Knife"|"Bone Fang"|"Razor Saw")
            echo "daggers"
            ;;
        # Rapiers（細剣）— 4種類
        "Crystal Rapier"|"LightSaber"|"Sai"|"Sai_2")
            echo "rapiers"
            ;;
        # Axes（斧）— 9種類
        "Axe"|"Double Ax"|"Giant Great Ax of the Fallen"|"Hacha de Guerra"|"Knight Axe"|"Pick Ax"|"Rough Axe"|"Steel Ax"|"Miner's Pick")
            echo "axes"
            ;;
        # Spears（槍）— 7種類
        "Adventurer's Spear"|"Ash Spear"|"Crossed Spear"|"Jagged Spear"|"Spear of the Fang"|"Steel Harpoon"|"Ripper's Harpoon")
            echo "spears"
            ;;
        # Halberds（薙刀/ハルバード）— 3種類
        "Adventurer's Halberd"|"Demonic Halberd"|"Runic Halberd")
            echo "halberds"
            ;;
        # Scythes（鎌）— 8種類
        "Ash Crusade Scythe"|"Death Scythe"|"Fang Scythe"|"Great Cinder Scythe"|"Ripper's Scythe"|"Scythe Hook"|"Scythe of the Ruin King"|"Short Bronze Scythe")
            echo "scythes"
            ;;
        # Bows（弓）— 5種類
        "Falconer's White Bow"|"Frost Bow. Ignavus"|"Great Crystal Bow"|"Mechanical Bow"|"Obsidian Dragon Bow X")
            echo "bows"
            ;;
        # Guns（銃）— 2種類
        "Hunter Gun"|"Hunter Gun_2")
            echo "guns"
            ;;
        # Shields（盾）— 4種類
        "Shield_1"|"Shield_2"|"Shield_3"|"Shield_4")
            echo "shields"
            ;;
        # Hammers/Maces（鈍器）— 1種類
        "WarHammer")
            echo "hammers"
            ;;
        # Wands/Staves（杖）— 1種類
        "Wand")
            echo "wands"
            ;;
        # その他（分類不能な武器）
        *)
            echo "other"
            ;;
    esac
}

# カテゴリ別の出力ディレクトリを一括作成
mkdir -p "$OUT_BASE"/{swords,greatswords,katanas,daggers,rapiers,axes,spears,halberds,scythes,bows,guns,shields,hammers,wands,other}

# カウンター初期化
total=0    # 処理対象の総数
success=0  # 成功数
fail=0     # 失敗数

# 開始メッセージ
echo "=== Batch Weapon Voxelizer ==="
echo "Source: $SRC_DIR"
echo "Output: $OUT_BASE"
echo ""

# ソースディレクトリ内の全GLBファイルをループ処理
for glb_file in "$SRC_DIR"/*.glb; do
    base_name=$(basename "$glb_file" .glb)            # ファイル名から拡張子を除去
    category=$(get_category "$base_name")              # カテゴリを判定
    safe_name=$(echo "$base_name" | sed 's/ /_/g; s/'\''//g; s/\./_/g')  # ファイル名安全化（スペース→_, アポストロフィ除去, ドット→_）
    out_dir="$OUT_BASE/$category/$safe_name"           # 出力先ディレクトリパス

    total=$((total + 1))  # 総数をインクリメント

    # 既にボクセル化済みの場合はスキップ
    if [ -f "$out_dir/${safe_name}.vox" ]; then
        echo "[$total] SKIP (exists): $base_name -> $category/"
        success=$((success + 1))
        continue
    fi

    mkdir -p "$out_dir"  # 出力ディレクトリを作成

    echo "[$total] Processing: $base_name -> $category/$safe_name"

    # Blenderをバックグラウンドモードで実行し、ボクセル化スクリプトを適用
    # 出力からキーワードのみをgrepして表示（Generated/Written/ERROR/Grid/No voxels）
    "$BLENDER" --background --python "$SCRIPT" -- "$glb_file" "$out_dir" "$VOXEL_SIZE" 2>&1 | grep -E "(Generated|Written|ERROR|Grid:|No voxels)"

    # VOXファイルの存在で成功/失敗を判定
    if [ -f "$out_dir/${safe_name}.vox" ]; then
        success=$((success + 1))
    else
        echo "  FAILED: $base_name"
        fail=$((fail + 1))
    fi
done

# サマリー表示
echo ""
echo "=== Summary ==="
echo "Total: $total"
echo "Success: $success"
echo "Failed: $fail"

# カテゴリごとのparts.jsonマスターファイルを生成
echo ""
echo "=== Generating parts.json per category ==="
for cat_dir in "$OUT_BASE"/*/; do
    cat_name=$(basename "$cat_dir")        # カテゴリ名を取得
    parts_json="$cat_dir/parts.json"       # parts.jsonのパス

    # JSON配列を構築
    echo "[" > "$parts_json"
    first=true  # カンマ制御用フラグ
    for weapon_dir in "$cat_dir"/*/; do
        [ -d "$weapon_dir" ] || continue   # ディレクトリでなければスキップ
        weapon_name=$(basename "$weapon_dir")          # 武器名を取得
        vox_file="$weapon_dir/${weapon_name}.vox"      # VOXファイルパス
        grid_file="$weapon_dir/grid.json"              # グリッドJSONパス

        [ -f "$vox_file" ] || continue     # VOXファイルが存在しなければスキップ

        # grid.jsonからボクセル数を取得
        voxel_count=0
        if [ -f "$grid_file" ]; then
            # Python3でJSONを読み込んでvoxel_countを取得
            voxel_count=$(python3 -c "import json; print(json.load(open('$grid_file')).get('voxel_count', 0))" 2>/dev/null || echo "0")
        fi

        # 2番目以降のエントリの前にカンマを挿入
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$parts_json"
        fi

        # パーツエントリをJSONに書き出し
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
    echo "]" >> "$parts_json"              # JSON配列を閉じる
    echo "  $cat_name/parts.json created"  # 完了メッセージ
done

echo ""
echo "=== All Done! ==="
