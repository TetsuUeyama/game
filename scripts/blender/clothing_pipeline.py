"""Clothing fitting pipeline orchestrator.

Reads config/clothing_pipeline.json and runs the full fit → voxelize → align
pipeline for any clothing item on any character.

Usage:
  python clothing_pipeline.py <item_key>
  python clothing_pipeline.py --all --source helena
  python clothing_pipeline.py --list
"""
import sys, os, json, subprocess, argparse, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_PATH = os.path.join(ROOT, "config/clothing_pipeline.json")
# Auto-detect Blender executable: try the Windows-native path first, then the
# Git Bash style (/c/...) for cross-shell compatibility.
_BLENDER_CANDIDATES = [
    r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe",
    "/c/Program Files/Blender Foundation/Blender 5.0/blender.exe",
]
BLENDER = next((p for p in _BLENDER_CANDIDATES if os.path.exists(p)), _BLENDER_CANDIDATES[0])
_PYTHON_CANDIDATES = [
    r"C:\Program Files\Blender Foundation\Blender 5.0\5.0\python\bin\python.exe",
    "/c/Program Files/Blender Foundation/Blender 5.0/5.0/python/bin/python.exe",
]
PYTHON = next((p for p in _PYTHON_CANDIDATES if os.path.exists(p)), _PYTHON_CANDIDATES[0])

FIT_SCRIPT      = os.path.join(ROOT, "scripts/blender/fitting/fit_helena_to_qm_v16.py")
VOXELIZE_SCRIPT = os.path.join(ROOT, "scripts/blender/voxelize/voxelize_mustardui.py")
ALIGN_SCRIPT    = os.path.join(ROOT, "scripts/blender/voxelize/align_clothing_by_layer.py")

def load_config():
    with open(CONFIG_PATH, encoding='utf-8') as f:
        return json.load(f)

def run(label, cmd, log_file):
    print(f"\n--- {label} ---")
    print(f"  cmd: {' '.join(cmd)}")
    print(f"  log: {log_file}")
    t0 = time.time()
    with open(log_file, 'w') as f:
        rc = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT).returncode
    dt = time.time() - t0
    if rc != 0:
        print(f"  FAILED (rc={rc}, {dt:.1f}s) - tail of log:")
        with open(log_file) as f:
            print('  ' + f.read()[-1000:].replace('\n', '\n  '))
        return False
    print(f"  OK ({dt:.1f}s)")
    return True

def resolve_params(config, item):
    """Merge preset + item-level overrides."""
    preset_name = item.get('preset', 'fitted_dress')
    params = dict(config['presets'][preset_name])
    # item-level overrides
    for key in ('max_depth', 'max_shift', 'min_offset'):
        if key in item:
            params[key] = item[key]
    return params

def run_item(config, key):
    if key not in config['clothing_items']:
        print(f"ERROR: item '{key}' not in config")
        return False
    item = config['clothing_items'][key]
    src = config['characters'][item['source']]
    tgt = config['characters'][item['target']]
    params = resolve_params(config, item)
    out_prefix = item['out_prefix']
    # Output to F:/ContactFormModel/ (E: drive is full; F: has more room).
    fitted_blend = f"F:/ContactFormModel/{tgt['rig'].split('_')[0]}_to_{item['source']}_{key}.blend"
    fitted_mesh_name = f"{item['source_mesh']} (fit QM v16)"

    log_dir = os.path.join(ROOT, "tmp/fit")
    os.makedirs(log_dir, exist_ok=True)

    print(f"\n========== {key} ==========")
    print(f"  source: {item['source']} ({src['blend']})")
    print(f"  source_mesh: {item['source_mesh']}")
    print(f"  target: {item['target']} ({tgt['blend']})")
    print(f"  preset: {item.get('preset', 'fitted_dress')} → {params}")

    # Step 1: Fit
    fit_cmd = [
        BLENDER, "--background", tgt['blend'],
        "--python", FIT_SCRIPT, "--",
        src['blend'], src['body'], item['source_mesh'],
        tgt['body'], tgt['rig'], fitted_blend,
        str(params.get('min_offset', 0.005)),
        # Optional: extra vg_rename config (for non-Helena sources). v16
        # reads this as arg 7 (after min_offset) when provided.
        # If config field is absent or path doesn't exist, fall back to empty
        # string which v16 treats as "no extra mapping".
        src.get('vg_rename_config', ''),
        str(params.get('max_depth', 0.20)),
    ]
    if not run("Step 1: Fit (v16 bone-centric)", fit_cmd,
               os.path.join(log_dir, f"fit_{key}.log")):
        return False

    # Step 2: Voxelize
    vox_cmd = [
        BLENDER, "--background", fitted_blend,
        "--python", VOXELIZE_SCRIPT, "--",
        tgt['voxel_dir'], fitted_mesh_name, out_prefix,
    ]
    if not run("Step 2: Voxelize", vox_cmd,
               os.path.join(log_dir, f"voxelize_{key}.log")):
        return False

    # Step 3: Align (per-item max_shift via env or CLI; current script uses constant)
    align_cmd = [
        PYTHON, ALIGN_SCRIPT,
        tgt['voxel_dir'], "body", out_prefix,
    ]
    if not run("Step 3: Align (push to safe_external)", align_cmd,
               os.path.join(log_dir, f"align_{key}.log")):
        return False

    print(f"\n  ✓ DONE: {key} → {tgt['voxel_dir']}/{out_prefix}.vox")
    return True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("item", nargs='?', help="clothing item key (or use --all)")
    ap.add_argument("--all", action="store_true", help="run all items")
    ap.add_argument("--source", help="filter by source character (with --all)")
    ap.add_argument("--list", action="store_true", help="list available items")
    args = ap.parse_args()

    config = load_config()

    if args.list:
        print("Available clothing items:")
        for k, v in config['clothing_items'].items():
            print(f"  {k:35} ({v['source']} → {v['target']}, preset={v.get('preset')})")
        return 0

    if args.all:
        keys = list(config['clothing_items'].keys())
        if args.source:
            keys = [k for k in keys if config['clothing_items'][k]['source'] == args.source]
        print(f"Running {len(keys)} items: {keys}")
        ok = 0
        for k in keys:
            if run_item(config, k):
                ok += 1
        print(f"\n=== Summary: {ok}/{len(keys)} succeeded ===")
        return 0 if ok == len(keys) else 1

    if not args.item:
        ap.print_help()
        return 1
    return 0 if run_item(config, args.item) else 1

if __name__ == "__main__":
    sys.exit(main())
