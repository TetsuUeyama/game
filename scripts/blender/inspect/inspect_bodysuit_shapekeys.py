"""Bodysuit の shape key 詳細 + 各 key value=1 にした時の bbox 変化を調査。"""
import bpy
from mathutils import Vector

SUIT_NAME = "GCC DOA Outfit Bodysuit Mesh"
suit = bpy.data.objects.get(SUIT_NAME)
if not suit:
    print(f"ERROR: {SUIT_NAME} not found"); raise SystemExit(1)

def evaluated_bbox(o):
    dg = bpy.context.evaluated_depsgraph_get()
    eo = o.evaluated_get(dg)
    me = eo.to_mesh()
    coords = [o.matrix_world @ v.co for v in me.vertices]
    eo.to_mesh_clear()
    if not coords: return None, None, None
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    return mn, mx, mx - mn

print(f"=== Bodysuit shape keys ===")
sk = suit.data.shape_keys
if not sk:
    print("  NONE"); raise SystemExit(0)

print(f"  total: {len(sk.key_blocks)}")
for kb in sk.key_blocks:
    print(f"    {kb.name!r}: value={kb.value:.3f} (min={kb.slider_min}, max={kb.slider_max})")

# Save current values
orig_values = {kb.name: kb.value for kb in sk.key_blocks}

# bbox before any change (current state)
mn, mx, sz = evaluated_bbox(suit)
print(f"\n  current bbox: {tuple(round(c,3) for c in mn)}..{tuple(round(c,3) for c in mx)}  size={tuple(round(c,3) for c in sz)}")

# Try each non-Basis key at value=1 individually
print(f"\n=== Per-key bbox impact (value=1) ===")
for kb in sk.key_blocks:
    if kb.name == 'Basis': continue
    # Reset all to original
    for k, v in orig_values.items():
        sk.key_blocks[k].value = v
    # Set this one to 1
    kb.value = 1.0
    bpy.context.view_layer.update()
    mn2, mx2, sz2 = evaluated_bbox(suit)
    delta_size = (sz2 - sz) if sz2 is not None and sz is not None else None
    if delta_size and (abs(delta_size.x) > 0.01 or abs(delta_size.y) > 0.01 or abs(delta_size.z) > 0.01):
        print(f"  {kb.name!r}: size_delta={tuple(round(c,3) for c in delta_size)}  new_size={tuple(round(c,3) for c in sz2)}")

# Restore
for k, v in orig_values.items():
    sk.key_blocks[k].value = v
