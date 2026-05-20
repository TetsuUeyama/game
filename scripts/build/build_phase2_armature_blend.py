"""Build a blend with source body + Phase 2 armature (qm_at_source.skeleton.json).

Rachel body は Rachel rig から source bone 名で skinned されている。
これを vg_rename を介して QM bone 名に書き換え、Phase 2 で計算した QM-rest-pose
+ source-resized bone 位置を持つ Blender armature に紐づけ直す。

Usage:
  blender --background <source.blend> --python build_phase2_armature_blend.py -- \\
    <source_body_mesh> <source_armature> <phase2_skeleton_json> <vg_rename_json> \\
    <out.blend> [<qm_blend> <qm_body>]

  qm_blend / qm_body を指定すると、QM body mesh を append する (後段で
  QM body 表面参照が必要な場合)。
"""
import bpy
import json
import os
import sys
from mathutils import Vector, Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

# --src-direction: use source bone rest direction/length when constructing
# Phase 2 bones (mapped bones only). Useful when source mesh differs from QM
# rest pose and you want LBS T ≈ identity. Default False (Phase 2 = QM dir +
# source scaled length, T = QM rest reshape transform).
USE_SRC_DIRECTION = "--src-direction" in args
if USE_SRC_DIRECTION:
    args = [a for a in args if a != "--src-direction"]

if len(args) < 5:
    print(__doc__); sys.exit(1)

SRC_BODY    = args[0]
SRC_ARM     = args[1]
PHASE2_JSON = args[2]
VG_RENAME_JSON = args[3]
OUT_BLEND   = args[4]
QM_BLEND    = args[5] if len(args) > 5 else None
QM_BODY     = args[6] if len(args) > 6 else None

print(f"\n=== build_phase2_armature_blend ===")
print(f"  source body: {SRC_BODY}")
print(f"  source arm:  {SRC_ARM}")
print(f"  phase2 json: {PHASE2_JSON}")
print(f"  vg_rename:   {VG_RENAME_JSON}")
print(f"  out:         {OUT_BLEND}")

with open(PHASE2_JSON, encoding="utf-8") as f:
    phase2 = json.load(f)
with open(VG_RENAME_JSON, encoding="utf-8") as f:
    cfg = json.load(f)
vg_rename = cfg.get("vg_rename", {})
print(f"  phase2 bones: {len(phase2['bones'])}")
print(f"  vg_rename entries: {len(vg_rename)}")
print(f"  use_src_direction: {USE_SRC_DIRECTION}")

# Find source body & armature in current blend (we loaded source.blend at startup)
body = bpy.data.objects.get(SRC_BODY)
src_arm = bpy.data.objects.get(SRC_ARM)
if body is None:
    print(f"ERROR: source body {SRC_BODY!r} not found"); sys.exit(1)
if src_arm is None:
    print(f"ERROR: source armature {SRC_ARM!r} not found"); sys.exit(1)

# Empty vg_rename → identity (source bones map to themselves). Used when
# source = QM body and Phase 2 bones share the QM names.
if not vg_rename:
    vg_rename = {b.name: b.name for b in src_arm.data.bones}
    print(f"  vg_rename empty -> generated identity mapping ({len(vg_rename)} bones)")

# === 1. Build new Phase 2 armature (QM-named bones, **using source rest pose
#       direction for mapped bones**). This makes LBS T = identity for mapped
#       bones so the mesh isn't rotated into QM rest pose direction (which
#       caused holes/streaks at bone direction boundaries).
# ===
print(f"\n[1] Build Phase 2 armature (source-direction for mapped bones)")
# Reverse vg_rename: QM bone -> first matching source bone (for direction lookup)
q_to_src_dir = {}
for src_name, q_name in vg_rename.items():
    if src_name in {b.name for b in src_arm.data.bones} and q_name not in q_to_src_dir:
        q_to_src_dir[q_name] = src_name

arm_data = bpy.data.armatures.new('phase2_rig')
arm_obj  = bpy.data.objects.new('phase2_rig', arm_data)
bpy.context.scene.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
for o in bpy.data.objects:
    try: o.select_set(False)
    except RuntimeError: pass
arm_obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
src_world = src_arm.matrix_world
n_src_dir = 0
n_qm_dir = 0
for b in phase2['bones']:
    eb = arm_data.edit_bones.new(b['name'])
    src_name = q_to_src_dir.get(b['name'])
    used_src = False
    if USE_SRC_DIRECTION and src_name and src_name in src_arm.data.bones:
        sb = src_arm.data.bones[src_name]
        head_w = src_world @ sb.head_local
        tail_w = src_world @ sb.tail_local
        # Guard against zero-length bones (Blender drops them) — fall back to Phase 2 pos
        if (tail_w - head_w).length >= 1e-5:
            eb.head = head_w
            eb.tail = tail_w
            n_src_dir += 1
            used_src = True
    if not used_src:
        eb.head = b['head_rest']
        eb.tail = b['tail_rest']
        n_qm_dir += 1
    eb.use_deform = b.get('use_deform', True)
for b in phase2['bones']:
    parent = b.get('parent')
    if not parent: continue
    if parent not in arm_data.edit_bones: continue
    arm_data.edit_bones[b['name']].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
print(f"  created {len(arm_data.bones)} bones (src-dir={n_src_dir}, qm-dir={n_qm_dir})")

# === 2. LBS retarget: move source body vertices from source rest → Phase 2 rest ===
# For each source bone with vg_rename to a QM bone, build:
#   T[src_bone] = M_phase2_world @ M_src_world^-1
# Then for each vertex: v_new = Σ (w_i / Σw) * T_i @ v_world
# Hierarchy fallback: bones not in vg_rename inherit transform from nearest mapped ancestor.
print(f"\n[2] LBS retarget vertices: source rest → Phase 2 rest")
# NOTE: ROOT_FALLBACK was removed — unmapped vertices used to be teleported to
# c_root_bend.x (pelvis), causing streaks/holes. Now they stay in place.
# Combined with src-direction Phase 2 bones, mapped bones also yield T ≈ identity
# (only resize-induced translation), so the mesh stays in source rest pose.
phase2_world = arm_obj.matrix_world
src_bone_names = {b.name for b in src_arm.data.bones}
phase2_bone_names = {b.name for b in arm_obj.data.bones}

# Direct vg_rename mapping (only entries where both sides exist)
valid_map = {}
for h, q in vg_rename.items():
    if h not in src_bone_names: continue
    if q not in phase2_bone_names: continue
    valid_map[h] = q

# Hierarchy fallback: if source bone not in map, inherit from nearest mapped ancestor
for b in src_arm.data.bones:
    if b.name in valid_map: continue
    cur = b.parent
    while cur is not None:
        if cur.name in valid_map:
            valid_map[b.name] = valid_map[cur.name]
            break
        cur = cur.parent

# Build per-bone retarget transform
bone_T = {}
for h_name, q_name in valid_map.items():
    h_bone = src_arm.data.bones[h_name]
    q_bone = arm_obj.data.bones[q_name]
    M_h = src_world @ h_bone.matrix_local
    M_q = phase2_world @ q_bone.matrix_local
    bone_T[h_name] = M_q @ M_h.inverted()
print(f"  retarget transforms: {len(bone_T)} bones (mapped via vg_rename + hierarchy fallback)")

# Remove shape keys (they store absolute positions, would silently discard our edits)
if body.data.shape_keys:
    try:
        bpy.context.view_layer.objects.active = body
        body.select_set(True)
        bpy.ops.object.shape_key_remove(all=True)
        print(f"  removed shape keys")
    except Exception as e:
        print(f"  WARN: shape_key_remove failed: {e}")

# vgroup index → T lookup
vg_idx_to_T = {}
for vg in body.vertex_groups:
    T = bone_T.get(vg.name)
    if T is not None:
        vg_idx_to_T[vg.index] = T

mesh = body.data
mesh_world = body.matrix_world
mesh_world_inv = mesh_world.inverted()
n_v = len(mesh.vertices)
n_unmapped = 0
for v in mesh.vertices:
    if not v.groups: continue
    wsum = 0.0
    contribs = []
    for g in v.groups:
        T = vg_idx_to_T.get(g.group)
        if T is None or g.weight <= 0.0: continue
        contribs.append((g.weight, T))
        wsum += g.weight
    if wsum <= 1e-9:
        n_unmapped += 1
        continue
    p_world = mesh_world @ v.co
    acc = Vector((0.0, 0.0, 0.0))
    for w, T in contribs:
        acc += (w / wsum) * (T @ p_world)
    v.co = mesh_world_inv @ acc
print(f"  retargeted {n_v - n_unmapped}/{n_v} vertices (unmapped={n_unmapped})")

# === 3. vg_rename: rename/merge vertex groups to QM names ===
print(f"\n[3] Rename + merge vertex groups via vg_rename")
n_renamed = 0
n_merged  = 0
for vg in list(body.vertex_groups):
    if vg.name not in vg_rename:
        continue
    target_name = vg_rename[vg.name]
    if target_name == vg.name:
        continue  # identity — nothing to rename or merge
    target_vg = body.vertex_groups.get(target_name)
    if target_vg is None or target_vg is vg:
        vg.name = target_name
        n_renamed += 1
    else:
        src_idx = vg.index
        for v in body.data.vertices:
            for g in v.groups:
                if g.group == src_idx:
                    target_vg.add([v.index], g.weight, 'ADD')
                    break
        body.vertex_groups.remove(vg)
        n_merged += 1
print(f"  renamed={n_renamed}, merged={n_merged}")

# === 4. Replace body's armature modifier target with phase2_rig ===
print(f"\n[4] Re-attach body to phase2_rig")
arm_mods = [m for m in body.modifiers if m.type == 'ARMATURE']
if arm_mods:
    for m in arm_mods:
        m.object = arm_obj
        m.show_viewport = True
else:
    m = body.modifiers.new(name='Armature', type='ARMATURE')
    m.object = arm_obj
body.parent = arm_obj
print(f"  armature modifiers: {len(arm_mods)}")

# === 5a. Optionally append QM body (reference mesh for downstream steps) ===
qm_body_obj = None
if QM_BLEND and QM_BODY:
    print(f"\n[5a] Append QM body {QM_BODY!r} from {QM_BLEND}")
    with bpy.data.libraries.load(QM_BLEND, link=False) as (src_lib, dst_lib):
        dst_lib.objects = [n for n in src_lib.objects if n == QM_BODY]
    for o in dst_lib.objects:
        if o is None: continue
        bpy.context.scene.collection.objects.link(o)
        if o.type == 'MESH' and o.name == QM_BODY:
            qm_body_obj = o
    print(f"  appended: {qm_body_obj.name if qm_body_obj else '(NONE)'}")

# === 5. Remove old source armature (no longer needed) to keep blend small ===
print(f"\n[5] Remove old source armature {SRC_ARM!r}")
# Hide other non-essential objects (keep body, phase2_rig, and QM body if appended)
keep = {body.name, arm_obj.name}
if qm_body_obj: keep.add(qm_body_obj.name)
n_removed = 0
for o in list(bpy.data.objects):
    if o.name in keep: continue
    bpy.data.objects.remove(o, do_unlink=True)
    n_removed += 1
try:
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
except Exception:
    pass
print(f"  removed {n_removed} other objects")

# === 6. Save ===
out_path = os.path.normpath(os.path.abspath(OUT_BLEND))
out_dir = os.path.dirname(out_path)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
# Always overwrite — don't keep .blend1 backups (saves disk space).
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=out_path, check_existing=False, compress=True)
size_mb = os.path.getsize(out_path) / (1024 * 1024)
print(f"\n  saved: {out_path} ({size_mb:.1f} MB)")
print(f"\n=== DONE ===")
