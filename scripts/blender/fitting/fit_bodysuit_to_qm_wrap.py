"""GCC DOA Bodysuit (v22-fitted to QM) を Shrinkwrap で QM body 表面に密着させる。

前提:
  Helena_Bodysuit_to_QM.blend に既に v22 で fit 済みの Bodysuit が存在し、
  Queen Marika Body も同一シーンに含まれていること。

Wrap 思想 (タイト衣装版):
  v22 の bone-LBS は外側 push が弱く、bust/butt が QM body を貫通する場合あり。
  Shrinkwrap NEAREST_SURFACEPOINT + offset 2mm で各 vertex を体表に密着させて完成。

手順:
  1. Bodysuit の shape keys クリア (modifier_apply の前提)
  2. Bodysuit の Armature/Subsurf を一時無効化 (rest mesh 状態で Shrinkwrap)
  3. Shrinkwrap modifier 追加 (target=Queen Marika Body, NEAREST_SURFACEPOINT)
  4. Apply
  5. Armature/Subsurf 再有効化
  6. 別 .blend として保存

Usage:
  blender --background <input.blend> --python fit_bodysuit_to_qm_wrap.py -- \
    <out.blend> [<suit_name>] [<qm_body_name>] [<offset_m>]
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
SUIT_NAME = args[1] if len(args) > 1 else "GCC DOA Outfit Bodysuit Mesh (fit QM v22)"
QM_BODY   = args[2] if len(args) > 2 else "Queen Marika Body"
OFFSET    = float(args[3]) if len(args) > 3 else 0.002

# Shrinkwrap method (NEAREST_SURFACEPOINT, TARGET_PROJECT, PROJECT, NEAREST_VERTEX)
METHOD = 'NEAREST_SURFACEPOINT'
if '--method' in args:
    METHOD = args[args.index('--method') + 1]

print(f"\n=== fit_bodysuit_to_qm_wrap ===")
print(f"  suit  : {SUIT_NAME}")
print(f"  qm body: {QM_BODY}")
print(f"  offset: {OFFSET*1000:.1f}mm")
print(f"  output: {OUT_BLEND}")

# Enable all layer collections (in 1.6GB blend, suit collection may be hidden/excluded)
def enable_layer_collection(lc):
    lc.exclude = False
    lc.hide_viewport = False
    lc.collection.hide_viewport = False
    lc.collection.hide_render = False
    for child in lc.children:
        enable_layer_collection(child)
for lc in bpy.context.view_layer.layer_collection.children:
    enable_layer_collection(lc)
print("  enabled all layer collections")

suit = bpy.data.objects.get(SUIT_NAME)
qm_body = bpy.data.objects.get(QM_BODY)
if suit is None or qm_body is None:
    print(f"  ERROR: missing suit ({suit is not None}) or qm body ({qm_body is not None})")
    print(f"  Available objects:")
    for o in bpy.data.objects:
        if o.type == 'MESH':
            print(f"    MESH: {o.name}")
    sys.exit(1)

# Make sure suit is linked to scene collection (1.6GB blend may have orphan objects)
def link_to_scene_if_needed(obj):
    # Check if obj is in any of the scene's view-layer-visible collections
    scene_objs = set()
    def collect(c):
        for o in c.objects: scene_objs.add(o.name)
        for ch in c.children: collect(ch)
    collect(bpy.context.scene.collection)
    if obj.name not in scene_objs:
        bpy.context.scene.collection.objects.link(obj)
        print(f"  linked '{obj.name}' to scene collection")

link_to_scene_if_needed(suit)
link_to_scene_if_needed(qm_body)

# Make sure suit is visible / selectable
suit.hide_viewport = False
suit.hide_render = False
suit.hide_set(False)
qm_body.hide_viewport = False
qm_body.hide_render = False
qm_body.hide_set(False)
bpy.context.view_layer.update()

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
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))

# Report BEFORE state
print(f"\n[before fit]")
qmn, qmx = world_bbox(qm_body, evaluated=True)
smn_raw, smx_raw = world_bbox(suit, evaluated=False)
smn_eval, smx_eval = world_bbox(suit, evaluated=True)
print(f"  qm body  evaluated bbox: {tuple(round(c,3) for c in qmn)}..{tuple(round(c,3) for c in qmx)}  size={tuple(round(c,3) for c in (qmx-qmn))}")
print(f"  suit     raw       bbox: {tuple(round(c,3) for c in smn_raw)}..{tuple(round(c,3) for c in smx_raw)}  size={tuple(round(c,3) for c in (smx_raw-smn_raw))}")
print(f"  suit     evaluated bbox: {tuple(round(c,3) for c in smn_eval)}..{tuple(round(c,3) for c in smx_eval)}  size={tuple(round(c,3) for c in (smx_eval-smn_eval))}")

# Clear shape keys (modifier_apply doesn't work with shape keys).
if suit.data.shape_keys:
    n_sk = len(suit.data.shape_keys.key_blocks)
    bpy.ops.object.select_all(action='DESELECT')
    suit.select_set(True)
    bpy.context.view_layer.objects.active = suit
    bpy.ops.object.shape_key_remove(all=True)
    print(f"  cleared {n_sk} shape keys")

# Disable suit modifiers (we want to operate on rest mesh)
disabled_modifiers = []
for m in suit.modifiers:
    if m.type in ('ARMATURE', 'SUBSURF'):
        disabled_modifiers.append((m.name, m.show_viewport, m.show_render))
        m.show_viewport = False
        m.show_render = False
        print(f"  disabled suit modifier: [{m.type}] {m.name}")

# Add Shrinkwrap on suit
sw = suit.modifiers.new(name='SW_QM', type='SHRINKWRAP')
sw.target = qm_body
sw.wrap_method = METHOD
sw.offset = OFFSET
sw.use_negative_direction = False
print(f"  using wrap_method: {METHOD}")
print(f"\n[shrinkwrap added]")
print(f"  target={sw.target.name}, method={sw.wrap_method}, offset={sw.offset*1000:.1f}mm")

# Move Shrinkwrap to top of stack
bpy.ops.object.select_all(action='DESELECT')
suit.select_set(True)
bpy.context.view_layer.objects.active = suit
while suit.modifiers[0].name != sw.name:
    bpy.ops.object.modifier_move_up(modifier=sw.name)

# Apply
try:
    bpy.ops.object.modifier_apply(modifier=sw.name)
    print(f"  Shrinkwrap applied. Suit verts now snapped to QM body surface.")
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
