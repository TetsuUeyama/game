"""Passthrough fit: rename Helena vgroups to QM bones + retarget armature, no geometry change.

Premise: Helena_Final_Public_QMRest.blend has Helena REST pose pre-matched to QM REST.
So Helena cloth's spatial position already overlaps QM body. No fitting math needed —
just rename vertex groups (Helena bone names → QM bone names) and switch armature target.

This preserves Helena cloth's exact shape and its natural distance from body
(the "gap" structure that the user wants to maintain).

Usage:
  blender --background <qm.blend> --python passthrough_fit.py -- \
    <config.json> <src.blend> <src_body> <src_cloth> \
    <tgt_armature> <out.blend>
"""
import bpy
import sys
import os
import json

argv = sys.argv
idx = argv.index('--') if '--' in argv else len(argv)
args = argv[idx+1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

CONFIG_JSON, SRC_BLEND, SRC_BODY, SRC_CLOTH, TGT_ARMATURE, OUT_BLEND = args[:6]

print(f"\n=== passthrough_fit ===")
print(f"  src cloth: {SRC_CLOTH}")
print(f"  tgt arm: {TGT_ARMATURE}")

with open(CONFIG_JSON, 'r', encoding='utf-8') as f:
    config = json.load(f)
VG_RENAME = config['vg_rename']

INTERNAL_VG_KEYWORDS = ('genital','vagina','ovary','uterus','anus','intestine','tongue','teeth','eye_')
def is_internal_vg(name):
    n = name.lower()
    return any(k in n for k in INTERNAL_VG_KEYWORDS)

tgt_arm_obj = bpy.data.objects.get(TGT_ARMATURE)
if tgt_arm_obj is None:
    print(f"ERROR: target armature '{TGT_ARMATURE}' not found"); sys.exit(1)
tgt_arm_obj.data.pose_position = 'REST'

# ===== Append source =====
print(f"\n[1] Append cloth + body")
with bpy.data.libraries.load(SRC_BLEND, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in {SRC_BODY, SRC_CLOTH}]

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

print(f"  cloth verts: {len(src_cloth.data.vertices)}, vgroups: {len(src_cloth.vertex_groups)}")

# ===== Rename vgroups (Helena bone names → QM bone names) =====
print(f"\n[2] Rename vgroups via vg_rename ({len(VG_RENAME)} mappings)")
n_renamed = 0
n_internal = 0
for vg in list(src_cloth.vertex_groups):
    new_name = VG_RENAME.get(vg.name)
    if new_name and new_name != vg.name:
        # Avoid name collision: if QM bone name already exists, merge or skip
        existing = src_cloth.vertex_groups.get(new_name)
        if existing is None:
            vg.name = new_name
            n_renamed += 1
        else:
            # Just remove the old one (weight already in target if mapped before)
            src_cloth.vertex_groups.remove(vg)

# Strip internal vgroups
for vg in list(src_cloth.vertex_groups):
    if is_internal_vg(vg.name):
        src_cloth.vertex_groups.remove(vg)
        n_internal += 1
print(f"  renamed: {n_renamed}, removed internal: {n_internal}, final: {len(src_cloth.vertex_groups)}")

# ===== Replace armature modifier =====
print(f"\n[3] Retarget armature: {src_arm.name if src_arm else 'NONE'} → {TGT_ARMATURE}")
for m in list(src_cloth.modifiers):
    if m.type == 'ARMATURE':
        m.object = tgt_arm_obj
        m.use_vertex_groups = True
    elif m.type in ('SUBSURF', 'CORRECTIVE_SMOOTH'):
        src_cloth.modifiers.remove(m)

# If no armature modifier, add one
has_arm = any(m.type == 'ARMATURE' for m in src_cloth.modifiers)
if not has_arm:
    am = src_cloth.modifiers.new(name='Armature', type='ARMATURE')
    am.object = tgt_arm_obj
    am.use_vertex_groups = True

# Normalize weights
bpy.ops.object.select_all(action='DESELECT')
src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth
if len(src_cloth.vertex_groups) > 0:
    bpy.ops.object.vertex_group_normalize_all()

# ===== Cleanup + save =====
print(f"\n[4] Cleanup + save")
if src_arm: bpy.data.objects.remove(src_arm, do_unlink=True)
if src_body: bpy.data.objects.remove(src_body, do_unlink=True)

src_cloth.parent = tgt_arm_obj
src_cloth.matrix_parent_inverse = tgt_arm_obj.matrix_world.inverted()
src_cloth.name = f"{src_cloth.name} (passthrough)"

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT_BLEND))
print(f"  saved: {OUT_BLEND}")
print("=== DONE ===")
