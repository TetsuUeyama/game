"""Fix the 9 remaining failed weapons (apostrophe in filename)."""
import subprocess
import os

BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"
SCRIPT = r"C:\Users\user\developsecond\contactform\scripts\voxelize_weapon.py"
SRC_DIR = r"C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB"
OUT_BASE = r"C:\Users\user\developsecond\game-assets\wapons"

WEAPONS = [
    # (filename_without_ext, category, safe_name)
    ("Adventurer's Spear", "spears", "Adventurers_Spear"),
    ("Executioner's Great Machete", "greatswords", "Executioners_Great_Machete"),
    ("Falconer's White Bow", "bows", "Falconers_White_Bow"),
    ("Knight's Straight Sword", "swords", "Knights_Straight_Sword"),
    ("Knight's Sword", "swords", "Knights_Sword"),
    ("Miner's Pick", "axes", "Miners_Pick"),
    ("Ripper's Harpoon", "spears", "Rippers_Harpoon"),
    ("Ripper's Scythe", "scythes", "Rippers_Scythe"),
    ("Wyvern's Thorn", "swords", "Wyverns_Thorn"),
]

success = 0
fail = 0

for name, category, safe_name in WEAPONS:
    glb_file = os.path.join(SRC_DIR, f"{name}.glb")
    out_dir = os.path.join(OUT_BASE, category, safe_name)
    os.makedirs(out_dir, exist_ok=True)

    print(f"Processing: {name} -> {category}/{safe_name}")

    result = subprocess.run(
        [BLENDER, "--background", "--python", SCRIPT, "--", glb_file, out_dir, "0.007"],
        capture_output=True, text=True, timeout=120
    )

    vox_path = os.path.join(out_dir, f"{safe_name}.vox")
    if os.path.exists(vox_path):
        print(f"  OK: {vox_path}")
        success += 1
    else:
        # Check if file was created with different name
        vox_files = [f for f in os.listdir(out_dir) if f.endswith('.vox')]
        if vox_files:
            old = os.path.join(out_dir, vox_files[0])
            os.rename(old, vox_path)
            print(f"  OK (renamed): {vox_path}")
            success += 1
        else:
            print(f"  FAILED")
            print(f"  stdout: {result.stdout[-200:]}")
            print(f"  stderr: {result.stderr[-200:]}")
            fail += 1

print(f"\nSuccess: {success}, Failed: {fail}")
