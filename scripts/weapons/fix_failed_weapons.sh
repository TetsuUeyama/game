#!/bin/bash
# ファイル名にアポストロフィが含まれていて失敗した武器を再処理するスクリプト

# Blender実行ファイルのパス
BLENDER="/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
# ボクセル化スクリプトのパス
SCRIPT="/c/Users/user/developsecond/contactform/scripts/voxelize_weapon.py"
# GLBファイルのソースディレクトリ
SRC_DIR="/c/Users/user/Downloads/uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1/+100 Fantasy Weapons Basemesh Pack V1/GLB"
# 出力先ベースディレクトリ
OUT_BASE="/c/Users/user/developsecond/game-assets/wapons"
# ボクセルサイズ（メートル単位）
VOXEL_SIZE="0.007"

# 失敗した武器のリスト: "元のファイル名|カテゴリ|安全なファイル名" 形式
declare -a WEAPONS=(
    "Adventurer's Halberd|halberds|Adventurers_Halberd"           # 冒険者のハルバード
    "Adventurer's Spear|spears|Adventurers_Spear"                 # 冒険者の槍
    "Executioner's Great Machete|greatswords|Executioners_Great_Machete"  # 処刑人の大鉈
    "Falconer's White Bow|bows|Falconers_White_Bow"               # 鷹匠の白弓
    "Knight's Straight Sword|swords|Knights_Straight_Sword"       # 騎士の直剣
    "Knight's Sword|swords|Knights_Sword"                         # 騎士の剣
    "Miner's Pick|axes|Miners_Pick"                               # 採掘のつるはし
    "Ripper's Harpoon|spears|Rippers_Harpoon"                     # リッパーの銛
    "Ripper's Scythe|scythes|Rippers_Scythe"                      # リッパーの鎌
    "Wyvern's Thorn|swords|Wyverns_Thorn"                         # ワイバーンの棘
)

# カウンター初期化
success=0  # 成功数
fail=0     # 失敗数

# 各失敗武器を順次再処理
for entry in "${WEAPONS[@]}"; do
    IFS='|' read -r name category safe_name <<< "$entry"  # パイプ区切りで分解
    glb_file="$SRC_DIR/${name}.glb"                        # 入力GLBファイルパス
    out_dir="$OUT_BASE/$category/$safe_name"               # 出力ディレクトリパス

    echo "Processing: $name -> $category/$safe_name"
    mkdir -p "$out_dir"  # 出力ディレクトリを作成

    # Blenderでボクセル化を実行
    "$BLENDER" --background --python "$SCRIPT" -- "$glb_file" "$out_dir" "$VOXEL_SIZE" 2>&1 | grep -E "(Generated|Written|ERROR|Grid:|No voxels)"

    # 期待されるファイル名でVOXが生成されたか確認
    if [ -f "$out_dir/${safe_name}.vox" ]; then
        success=$((success + 1))
        echo "  OK"
    else
        # アポストロフィ処理の違いで別名のVOXファイルが生成されている可能性を確認
        vox_count=$(find "$out_dir" -name "*.vox" | wc -l)
        if [ "$vox_count" -gt 0 ]; then
            # 生成されたVOXファイルを期待される名前にリネーム
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

# サマリー表示
echo ""
echo "=== Fix Summary ==="
echo "Success: $success"
echo "Failed: $fail"
