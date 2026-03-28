"""ファイル名にアポストロフィを含む9個の失敗した武器を再ボクセル化するスクリプト。"""
# サブプロセス実行モジュール
import subprocess
# OS操作モジュール
import os

# Blender実行ファイルのパス
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"
# 武器ボクセル化Pythonスクリプトのパス
SCRIPT = r"C:\Users\user\developsecond\contactform\scripts\voxelize_weapon.py"
# 武器GLBファイルのソースディレクトリ
SRC_DIR = r"C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB"
# ボクセル化結果の出力ベースディレクトリ
OUT_BASE = r"C:\Users\user\developsecond\game-assets\wapons"

# 修正対象の武器リスト（元ファイル名, カテゴリ, 安全なファイル名）
WEAPONS = [
    ("Adventurer's Spear", "spears", "Adventurers_Spear"),           # 冒険者の槍
    ("Executioner's Great Machete", "greatswords", "Executioners_Great_Machete"),  # 処刑人の大鉈
    ("Falconer's White Bow", "bows", "Falconers_White_Bow"),         # 鷹匠の白弓
    ("Knight's Straight Sword", "swords", "Knights_Straight_Sword"), # 騎士の直剣
    ("Knight's Sword", "swords", "Knights_Sword"),                   # 騎士の剣
    ("Miner's Pick", "axes", "Miners_Pick"),                         # 鉱夫のピッケル
    ("Ripper's Harpoon", "spears", "Rippers_Harpoon"),               # リッパーの銛
    ("Ripper's Scythe", "scythes", "Rippers_Scythe"),                # リッパーの大鎌
    ("Wyvern's Thorn", "swords", "Wyverns_Thorn"),                   # ワイバーンの棘
]

# 成功/失敗カウンター
success = 0
fail = 0

# 各武器を処理
for name, category, safe_name in WEAPONS:
    # GLBファイルのフルパスを構築
    glb_file = os.path.join(SRC_DIR, f"{name}.glb")
    # 出力ディレクトリのパスを構築
    out_dir = os.path.join(OUT_BASE, category, safe_name)
    # 出力ディレクトリを作成（既存なら何もしない）
    os.makedirs(out_dir, exist_ok=True)

    # 処理中の武器名を表示
    print(f"Processing: {name} -> {category}/{safe_name}")

    # Blenderをバックグラウンドで起動し、ボクセル化スクリプトを実行（ボクセルサイズ0.007）
    result = subprocess.run(
        [BLENDER, "--background", "--python", SCRIPT, "--", glb_file, out_dir, "0.007"],
        capture_output=True, text=True, timeout=120  # タイムアウト120秒
    )

    # 期待されるVOXファイルパス
    vox_path = os.path.join(out_dir, f"{safe_name}.vox")
    # VOXファイルが正しい名前で生成されたか確認
    if os.path.exists(vox_path):
        print(f"  OK: {vox_path}")
        success += 1
    else:
        # 別の名前で生成されていないか確認
        vox_files = [f for f in os.listdir(out_dir) if f.endswith('.vox')]
        if vox_files:
            # 最初に見つかったVOXファイルを正しい名前にリネーム
            old = os.path.join(out_dir, vox_files[0])
            os.rename(old, vox_path)
            print(f"  OK (renamed): {vox_path}")
            success += 1
        else:
            # VOXファイルが全く生成されなかった場合
            print(f"  FAILED")
            # デバッグ用にstdout/stderrの末尾200文字を表示
            print(f"  stdout: {result.stdout[-200:]}")
            print(f"  stderr: {result.stderr[-200:]}")
            fail += 1

# 最終結果サマリーを表示
print(f"\nSuccess: {success}, Failed: {fail}")
