"""Helena_Base のmodifierを1つずつ無効化して bbox の変化を観察。
"""
import bpy

helena = bpy.data.objects.get("Helena_Base")
if helena is None:
    print("ERROR"); exit()

mw = helena.matrix_world


def get_eval_bbox():
    deps = bpy.context.evaluated_depsgraph_get()
    eo = helena.evaluated_get(deps)
    em = eo.to_mesh()
    verts = [eo.matrix_world @ v.co for v in em.vertices]
    xs = [v.x for v in verts]; ys = [v.y for v in verts]; zs = [v.z for v in verts]
    nv = len(em.vertices)
    eo.to_mesh_clear()
    return (nv, min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


# Save original states
original_show = {m.name: m.show_viewport for m in helena.modifiers}

# 1. All on (default)
nv, xn, xx, yn, yx, zn, zx = get_eval_bbox()
print(f"[ALL ON]  nv={nv}  z[{zn:+.4f},{zx:+.4f}]  x[{xn:+.4f},{xx:+.4f}]")

# 2. Disable each modifier individually
for m in helena.modifiers:
    # Re-enable all, then disable just this one
    for mm in helena.modifiers:
        mm.show_viewport = original_show[mm.name]
    m.show_viewport = False
    nv, xn, xx, yn, yx, zn, zx = get_eval_bbox()
    print(f"[OFF {m.type:8s} '{m.name[:20]}']  nv={nv}  z[{zn:+.4f},{zx:+.4f}]  x[{xn:+.4f},{xx:+.4f}]")

# 3. Disable ALL
for m in helena.modifiers:
    m.show_viewport = False
nv, xn, xx, yn, yx, zn, zx = get_eval_bbox()
print(f"[ALL OFF]  nv={nv}  z[{zn:+.4f},{zx:+.4f}]  x[{xn:+.4f},{xx:+.4f}]")

# Restore
for m in helena.modifiers:
    m.show_viewport = original_show[m.name]
