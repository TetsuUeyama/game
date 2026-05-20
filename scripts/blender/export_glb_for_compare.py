"""ブラウザ比較用に blend → GLB エクスポートする。

特定のメッシュのみ可視化してエクスポート (衣装は除外して身体ベースのみ)。
ARMATURE は全エクスポート (rest pose 比較に必要)。

Usage:
  blender --background <input.blend> --python export_glb_for_compare.py -- \\
    <output.glb> <visible_mesh_pattern1> [<visible_mesh_pattern2> ...]

例:
  blender --background "E:/MOdel/QueenMarika_Rigged_MustardUI.blend" \\
    --python scripts/blender/export_glb_for_compare.py -- \\
    "public/box5/helena_qm_compare/qm.glb" "Queen Marika Body"
"""
import bpy
import sys
import os
import fnmatch


argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
if len(args) < 2:
    print(__doc__)
    sys.exit(1)

OUT_GLB = args[0]
PATTERNS = args[1:]

print(f"\n=== export_glb_for_compare ===")
print(f"  out: {OUT_GLB}")
print(f"  visible patterns: {PATTERNS}")


def matches_any(name, patterns):
    return any(fnmatch.fnmatch(name, p) for p in patterns)


# ---- Make sure all target collections are visible ----
def enable_layer_collection(lc):
    lc.exclude = False
    lc.hide_viewport = False
    lc.collection.hide_viewport = False
    lc.collection.hide_render = False
    for child in lc.children:
        enable_layer_collection(child)
for lc in bpy.context.view_layer.layer_collection.children:
    enable_layer_collection(lc)


# ---- Selection: meshes matching pattern + all armatures ----
n_visible_mesh = 0
n_hidden_mesh = 0
n_arm = 0
for o in bpy.data.objects:
    o.hide_viewport = False
    o.hide_render = False
    o.hide_set(False)

# Deselect everything via direct API (bpy.ops can fail in background mode)
for o in bpy.data.objects:
    try:
        o.select_set(False)
    except RuntimeError:
        pass

for o in bpy.data.objects:
    if o.type == 'MESH':
        if matches_any(o.name, PATTERNS):
            try:
                o.select_set(True)
            except RuntimeError:
                pass
            n_visible_mesh += 1
        else:
            o.hide_viewport = True
            o.hide_render = True
            try:
                o.hide_set(True)
            except RuntimeError:
                pass  # Object not in current view layer; viewport/render hide is enough
            n_hidden_mesh += 1
    elif o.type == 'ARMATURE':
        # Skip Auto-Rig Pro custom shape helpers (cs_*)
        if o.name.startswith("cs_"):
            continue
        try:
            o.select_set(True)
        except RuntimeError:
            pass
        n_arm += 1
print(f"  visible meshes: {n_visible_mesh}, hidden: {n_hidden_mesh}, armatures: {n_arm}")


# ---- Export GLB ----
out_dir = os.path.dirname(os.path.abspath(OUT_GLB))
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)

print(f"  exporting...")
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(OUT_GLB),
    export_format='GLB',
    use_selection=True,
    use_visible=True,
    export_apply=False,           # keep skinning + armature
    export_skins=True,
    export_animations=False,
    export_materials='EXPORT',
    export_yup=True,              # Y-up for Three/Babylon
)
size_kb = os.path.getsize(OUT_GLB) / 1024
print(f"  saved: {OUT_GLB} ({size_kb:.0f} KB)")
print(f"\n=== DONE ===")
