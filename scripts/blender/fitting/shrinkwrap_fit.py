"""Standard Blender Shrinkwrap-based fitting (no custom math).

Pipeline (per VRC clothing fitting workflow):
  1. Append Helena cloth + body to QM scene
  2. Force REST pose (both armatures)
  3. Apply Shrinkwrap modifier: NEAREST_SURFACEPOINT to QM outer body, offset = MIN_OFFSET
  4. Apply DataTransfer modifier: weight transfer from QM outer body
  5. Strip internal vgroups, save

Usage:
  blender --background <qm.blend> --python shrinkwrap_fit.py -- \
    <src.blend> <src_body> <src_cloth> \
    <tgt_body> <tgt_armature> <out.blend> \
    [--tgt-outer-bvh <blend>:<obj>] [--offset 0.005]
"""
import bpy
import sys
import os

argv = sys.argv
idx = argv.index('--') if '--' in argv else len(argv)
args = argv[idx+1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

SRC_BLEND, SRC_BODY, SRC_CLOTH, TGT_BODY, TGT_ARMATURE, OUT_BLEND = args[:6]

TGT_OUTER_BVH = None
TGT_OUTER_OBJ = None
OFFSET = 0.005

i = 6
while i < len(args):
    if args[i] == '--tgt-outer-bvh' and i+1 < len(args):
        spec = args[i+1]
        parts = spec.rsplit(':', 1)
        if len(parts) == 2:
            TGT_OUTER_BVH, TGT_OUTER_OBJ = parts[0], parts[1]
        i += 2
    elif args[i] == '--offset' and i+1 < len(args):
        OFFSET = float(args[i+1]); i += 2
    else:
        i += 1

print(f"\n=== shrinkwrap_fit ===")
print(f"  src: {SRC_BLEND}  cloth={SRC_CLOTH}")
print(f"  tgt body: {TGT_BODY}  arm: {TGT_ARMATURE}")
print(f"  offset: {OFFSET*1000:.1f}mm")

INTERNAL_VG_KEYWORDS = ('genital', 'vagina', 'ovary', 'uterus', 'anus', 'intestine',
                        'tongue', 'teeth', 'eye_')
def is_internal_vg(name):
    n = name.lower()
    return any(k in n for k in INTERNAL_VG_KEYWORDS)


# ===== Verify target =====
tgt_body_obj = bpy.data.objects.get(TGT_BODY)
tgt_arm_obj = bpy.data.objects.get(TGT_ARMATURE)
if tgt_body_obj is None or tgt_arm_obj is None:
    print("ERROR: target body/arm missing"); sys.exit(1)
tgt_arm_obj.data.pose_position = 'REST'

# ===== Append source =====
print(f"\n[1] Append source cloth + body")
with bpy.data.libraries.load(SRC_BLEND, link=False) as (src, dst):
    want = {SRC_BODY, SRC_CLOTH}
    dst.objects = [n for n in src.objects if n in want]

src_body = None; src_cloth = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
    if o.name == SRC_BODY: src_body = o
    if o.name == SRC_CLOTH: src_cloth = o

if src_cloth is None:
    print("ERROR: cloth append failed"); sys.exit(1)

src_arm = None
for m in list(src_cloth.modifiers) + (list(src_body.modifiers) if src_body else []):
    if m.type == 'ARMATURE' and m.object is not None:
        src_arm = m.object; break
if src_arm and src_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(src_arm)
if src_arm:
    src_arm.data.pose_position = 'REST'
bpy.context.view_layer.update()

# Clear shape keys
if src_cloth.data.shape_keys:
    bpy.ops.object.select_all(action='DESELECT')
    src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth
    bpy.ops.object.shape_key_remove(all=True)

print(f"  cloth verts: {len(src_cloth.data.vertices)}")

# ===== Load outer body if specified =====
print(f"\n[2] Load outer body for shrinkwrap target")
target_obj = tgt_body_obj
loaded_outer = None
if TGT_OUTER_BVH:
    BVH_BLEND_ABS = os.path.abspath(TGT_OUTER_BVH)
    existing = set(o.name for o in bpy.data.objects)
    with bpy.data.libraries.load(BVH_BLEND_ABS, link=False) as (src, dst):
        dst.objects = [TGT_OUTER_OBJ]
    new_objs = [o for o in bpy.data.objects if o.name not in existing]
    for o in new_objs:
        if o.name == TGT_OUTER_OBJ or o.name.startswith(TGT_OUTER_OBJ + '.'):
            target_obj = o
            loaded_outer = o
            bpy.context.scene.collection.objects.link(o)
            o.hide_viewport = False; o.hide_set(False)
            # Strip CorrectiveSmooth (causes bind mismatch warnings)
            for m in list(o.modifiers):
                if m.type == 'CORRECTIVE_SMOOTH':
                    o.modifiers.remove(m)
            break
print(f"  shrinkwrap target: {target_obj.name}")

# ===== Apply Shrinkwrap modifier =====
print(f"\n[3] Shrinkwrap modifier (NEAREST_SURFACEPOINT, offset={OFFSET*1000:.1f}mm)")
bpy.ops.object.select_all(action='DESELECT')
src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth

# Remove existing modifiers (armature, etc.) — re-add later
for m in list(src_cloth.modifiers):
    if m.type in ('ARMATURE', 'SUBSURF', 'CORRECTIVE_SMOOTH'):
        src_cloth.modifiers.remove(m)

sw = src_cloth.modifiers.new(name='Shrinkwrap', type='SHRINKWRAP')
sw.target = target_obj
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.offset = OFFSET
bpy.ops.object.modifier_apply(modifier=sw.name)
print(f"  shrinkwrap applied")

# ===== Add new Armature modifier (target rig) =====
print(f"\n[4] Add Armature modifier (target rig)")
arm_mod = src_cloth.modifiers.new(name='Armature_TGT', type='ARMATURE')
arm_mod.object = tgt_arm_obj
arm_mod.use_vertex_groups = True

# ===== Weight Transfer (DataTransfer) =====
print(f"\n[5] DataTransfer: weight transfer from outer body")
for vg in list(src_cloth.vertex_groups):
    src_cloth.vertex_groups.remove(vg)

try:
    dt = src_cloth.modifiers.new(name='WeightTransfer', type='DATA_TRANSFER')
    dt.object = target_obj
    dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'
    dt.layers_vgroup_select_dst = 'NAME'
    dt.mix_mode = 'REPLACE'
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    while src_cloth.modifiers[0].name != dt.name:
        bpy.ops.object.modifier_move_up(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)
    print(f"  weight transferred: {len(src_cloth.vertex_groups)} vgroups")

    removed = []
    for vg in list(src_cloth.vertex_groups):
        if is_internal_vg(vg.name):
            removed.append(vg.name)
            src_cloth.vertex_groups.remove(vg)
    print(f"  internal cleanup: removed {len(removed)} groups")
    if len(src_cloth.vertex_groups) > 0:
        bpy.ops.object.vertex_group_normalize_all()
    print(f"  final vgroups: {len(src_cloth.vertex_groups)}")
except Exception as e:
    print(f"  WARN: weight transfer failed: {e}")

# ===== Cleanup + save =====
print(f"\n[6] Cleanup + save")
if src_arm: bpy.data.objects.remove(src_arm, do_unlink=True)
if src_body: bpy.data.objects.remove(src_body, do_unlink=True)
if loaded_outer is not None:
    bpy.data.objects.remove(loaded_outer, do_unlink=True)

src_cloth.parent = tgt_arm_obj
src_cloth.matrix_parent_inverse = tgt_arm_obj.matrix_world.inverted()
src_cloth.name = f"{src_cloth.name} (shrinkwrap)"

OUT_ABS = os.path.abspath(OUT_BLEND)
bpy.ops.wm.save_as_mainfile(filepath=OUT_ABS)
print(f"  saved: {OUT_ABS}")
print("=== DONE ===")
