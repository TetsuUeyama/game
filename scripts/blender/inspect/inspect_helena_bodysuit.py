"""Helena_Base と Bodysuit の現状を比較 inspect。

調査項目:
  - Mesh data 状態 (頂点数、bbox)
  - Shape keys 一覧 (key 名、現在 value、min/max)
  - Modifier stack (種類、有効/無効、target)
  - 同時表示時の bbox 重なり (体内貫通 / 浮遊の判定)

Usage:
  blender --background <blend> --python inspect_helena_bodysuit.py
"""
import bpy
from mathutils import Vector

BODY_NAME = "Helena_Base"
BODYSUIT_NAME = "GCC DOA Outfit Bodysuit Mesh"

def world_bbox(o):
    mw = o.matrix_world
    coords = [mw @ v.co for v in o.data.vertices]
    if not coords:
        return None, None, None
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    ctr = Vector(((mn.x+mx.x)/2, (mn.y+mx.y)/2, (mn.z+mx.z)/2))
    return mn, mx, ctr

def report(o):
    print(f"\n=== {o.name} ===")
    print(f"  type={o.type}, verts={len(o.data.vertices)}")
    print(f"  matrix_world.translation={tuple(round(c,3) for c in o.matrix_world.translation)}")
    mn, mx, ctr = world_bbox(o)
    if mn is not None:
        size = mx - mn
        print(f"  world bbox min={tuple(round(c,3) for c in mn)}")
        print(f"  world bbox max={tuple(round(c,3) for c in mx)}")
        print(f"  world bbox center={tuple(round(c,3) for c in ctr)}")
        print(f"  world bbox size={tuple(round(c,3) for c in size)}")

    # Shape keys
    sk = o.data.shape_keys
    if sk:
        print(f"  Shape keys: {len(sk.key_blocks)}")
        for kb in sk.key_blocks:
            print(f"    {kb.name!r}: value={kb.value:.3f} (min={kb.slider_min}, max={kb.slider_max})")
    else:
        print(f"  Shape keys: NONE")

    # Modifiers
    print(f"  Modifiers: {len(o.modifiers)}")
    for m in o.modifiers:
        info = f"    [{m.type}] {m.name} viewport={m.show_viewport}"
        if hasattr(m, 'object') and m.object:
            info += f" object={m.object.name}"
        if m.type == 'ARMATURE':
            info += f" use_vg={m.use_vertex_groups}"
        print(info)

    # Vertex groups (count only)
    print(f"  Vertex groups: {len(o.vertex_groups)}")

body = bpy.data.objects.get(BODY_NAME)
suit = bpy.data.objects.get(BODYSUIT_NAME)

if not body:
    print(f"ERROR: {BODY_NAME} not found");
else:
    report(body)
if not suit:
    print(f"ERROR: {BODYSUIT_NAME} not found")
else:
    report(suit)

# Compare bbox overlap
if body and suit:
    print(f"\n=== Comparison ===")
    bmn, bmx, bctr = world_bbox(body)
    smn, smx, sctr = world_bbox(suit)
    print(f"  body  size: {tuple(round(c,3) for c in (bmx - bmn))}")
    print(f"  suit  size: {tuple(round(c,3) for c in (smx - smn))}")
    print(f"  size ratio (suit/body): {tuple(round((smx[i]-smn[i])/(bmx[i]-bmn[i]),3) if bmx[i]-bmn[i]>1e-6 else 0 for i in range(3))}")
    delta_ctr = sctr - bctr
    print(f"  center delta (suit-body): {tuple(round(c,3) for c in delta_ctr)}")
