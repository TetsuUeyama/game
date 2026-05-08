"""GCC DOA Bodysuit を Helena_Base に Shrinkwrap でフィッティング。

問題:
  Bodysuit の rest mesh data は default G8F shape のまま。
  Helena_Base は Helena 体型にモーフ済み。
  Armature modifier は骨変形のみ → rest pose で衣装位置がズレる。

解決 (Wrap 思想):
  各 Bodysuit vertex を最寄りの Helena_Base 表面にスナップ (NEAREST_SURFACEPOINT)
  + 2mm offset で体表からわずかに浮かせる。
  これは非剛体表面レジストレーション = R3DS Wrap の中核アルゴリズム同等。

手順:
  1. Bodysuit の Armature/Subsurf を一時無効化 (rest mesh 状態で Shrinkwrap)
  2. Shrinkwrap modifier 追加 (target=Helena_Base, NEAREST_SURFACEPOINT, offset=2mm)
  3. Shrinkwrap Apply (mesh data に焼き込み)
  4. Armature/Subsurf 再有効化
  5. 別 .blend として保存

Usage:
  blender --background <input.blend> --python fit_bodysuit_to_helena.py -- \
    <out.blend> [<suit_name>] [<body_name>] [<offset_m>]

  default suit_name: "GCC DOA Outfit Bodysuit Mesh"
  default body_name: "Helena_Base"
  default offset:    0.002 (= 2mm)
"""
import bpy
import sys
import os
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 1:
    print(__doc__); sys.exit(1)

OUT_BLEND = args[0]
SUIT_NAME = args[1] if len(args) > 1 else "GCC DOA Outfit Bodysuit Mesh"
BODY_NAME = args[2] if len(args) > 2 else "Helena_Base"
OFFSET    = float(args[3]) if len(args) > 3 else 0.002

print(f"\n=== fit_bodysuit_to_helena ===")
print(f"  suit  : {SUIT_NAME}")
print(f"  body  : {BODY_NAME}")
print(f"  offset: {OFFSET*1000:.1f}mm")
print(f"  output: {OUT_BLEND}")

suit = bpy.data.objects.get(SUIT_NAME)
body = bpy.data.objects.get(BODY_NAME)
if suit is None or body is None:
    print(f"  ERROR: missing suit ({suit is not None}) or body ({body is not None})")
    sys.exit(1)

def world_bbox(o, evaluated=False):
    if evaluated:
        dg = bpy.context.evaluated_depsgraph_get()
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        coords = [o.matrix_world @ v.co for v in me.vertices]
        eo.to_mesh_clear()
    else:
        coords = [o.matrix_world @ v.co for v in o.data.vertices]
    if not coords: return None, None
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    return mn, mx

# Report BEFORE state
print(f"\n[before fit]")
bmn, bmx = world_bbox(body, evaluated=True)
smn_raw, smx_raw = world_bbox(suit, evaluated=False)
smn_eval, smx_eval = world_bbox(suit, evaluated=True)
print(f"  body  evaluated bbox: {tuple(round(c,3) for c in bmn)}..{tuple(round(c,3) for c in bmx)}  size={tuple(round(c,3) for c in (bmx-bmn))}")
print(f"  suit  raw       bbox: {tuple(round(c,3) for c in smn_raw)}..{tuple(round(c,3) for c in smx_raw)}  size={tuple(round(c,3) for c in (smx_raw-smn_raw))}")
print(f"  suit  evaluated bbox: {tuple(round(c,3) for c in smn_eval)}..{tuple(round(c,3) for c in smx_eval)}  size={tuple(round(c,3) for c in (smx_eval-smn_eval))}")

# Clear shape keys (modifier_apply doesn't work with shape keys).
# All suit shape keys are at value=0 except Basis=1, so removing them doesn't change mesh shape.
# JCMs/FBMs/PBMs are not needed for voxelization (we only need static rest-pose shape).
if suit.data.shape_keys:
    n_sk = len(suit.data.shape_keys.key_blocks)
    bpy.ops.object.select_all(action='DESELECT')
    suit.select_set(True)
    bpy.context.view_layer.objects.active = suit
    bpy.ops.object.shape_key_remove(all=True)
    print(f"  cleared {n_sk} shape keys (all were at value=0 except Basis)")

# Disable suit modifiers (we want to operate on rest mesh)
disabled_modifiers = []
for m in suit.modifiers:
    if m.type in ('ARMATURE', 'SUBSURF'):
        disabled_modifiers.append((m.name, m.show_viewport, m.show_render))
        m.show_viewport = False
        m.show_render = False
        print(f"  disabled suit modifier: [{m.type}] {m.name}")

# Make sure body's modifiers are also evaluated to current state for Shrinkwrap target
# Shrinkwrap reads target's evaluated mesh by default — Helena_Base modifiers stay enabled.

# Add Shrinkwrap on suit
sw = suit.modifiers.new(name='SW_HelenaBase', type='SHRINKWRAP')
sw.target = body
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.offset = OFFSET
sw.use_negative_direction = False
print(f"\n[shrinkwrap added]")
print(f"  target={sw.target.name}, method={sw.wrap_method}, offset={sw.offset*1000:.1f}mm")

# Apply Shrinkwrap
bpy.ops.object.select_all(action='DESELECT')
suit.select_set(True)
bpy.context.view_layer.objects.active = suit

# Shrinkwrap must be at top of stack to apply cleanly (no other active modifiers above it)
# Already at top since we disabled others.
# Move it to position 0 to be safe.
while suit.modifiers[0].name != sw.name:
    bpy.ops.object.modifier_move_up(modifier=sw.name)
print(f"  shrinkwrap moved to top of stack")

try:
    bpy.ops.object.modifier_apply(modifier=sw.name)
    print(f"  Shrinkwrap applied. Suit verts now snapped to Helena_Base surface.")
except Exception as e:
    print(f"  ERROR: modifier_apply failed: {e}")
    sys.exit(1)

# Re-enable disabled modifiers
for name, vp, rd in disabled_modifiers:
    m = suit.modifiers.get(name)
    if m:
        m.show_viewport = vp
        m.show_render = rd
        print(f"  re-enabled suit modifier: {m.name}")

# Report AFTER state
print(f"\n[after fit]")
smn_raw2, smx_raw2 = world_bbox(suit, evaluated=False)
smn_eval2, smx_eval2 = world_bbox(suit, evaluated=True)
print(f"  suit  raw       bbox: {tuple(round(c,3) for c in smn_raw2)}..{tuple(round(c,3) for c in smx_raw2)}  size={tuple(round(c,3) for c in (smx_raw2-smn_raw2))}")
print(f"  suit  evaluated bbox: {tuple(round(c,3) for c in smn_eval2)}..{tuple(round(c,3) for c in smx_eval2)}  size={tuple(round(c,3) for c in (smx_eval2-smn_eval2))}")

# Save
print(f"\n[save]")
out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved: {OUT_BLEND}")
print(f"\n=== DONE ===")
