"""シーン内 ARMATURE modifier 付き全 mesh の頂点 X 座標を均等 scale する。
Post-Step-A の LBS で X 方向に縮小されたモデル (Rachel 等 Rigify 系) を
QM 体形 W に近付ける簡易修正。スケール中心は world X=0 (体の中央)。

Usage:
  blender --background <in.blend> --python scale_meshes_x.py -- <out.blend> <scale_factor>
"""
import bpy
import sys
import os

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
if len(args) < 2:
    print(__doc__); sys.exit(1)

OUT_BLEND = os.path.abspath(args[0])
SCALE = float(args[1])
print(f"\n=== scale_meshes_x ===")
print(f"  out:   {OUT_BLEND}")
print(f"  scale: {SCALE}")

EXCLUDE = {"Queen Marika Body"}  # QM 参照 body は scale しない (BVH ターゲット)

n_meshes = 0
n_verts_total = 0
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    if o.name in EXCLUDE or any(o.name.startswith(e + ".") for e in EXCLUDE):
        print(f"  skip excluded: {o.name}")
        continue
    has_arm = any(m.type == "ARMATURE" for m in o.modifiers)
    if not has_arm:
        continue
    mesh = o.data
    # Remove shape keys (avoid morph data overriding edits)
    if mesh.shape_keys:
        try:
            for kb in list(mesh.shape_keys.key_blocks):
                o.shape_key_remove(kb)
        except Exception as e:
            print(f"  WARN {o.name}: shape_key cleanup: {e}")
    mw = o.matrix_world
    mwi = mw.inverted()
    n = 0
    for v in mesh.vertices:
        p_world = mw @ v.co
        p_world.x *= SCALE
        v.co = mwi @ p_world
        n += 1
    n_meshes += 1
    n_verts_total += n
    print(f"  scaled {o.name}: verts={n}")

print(f"  total: {n_meshes} meshes, {n_verts_total} verts")

out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved -> {OUT_BLEND}")
print("\n=== DONE ===")
