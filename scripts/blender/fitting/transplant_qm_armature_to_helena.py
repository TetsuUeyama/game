"""Helena_Final_Public.blend に QueenMarika_Rigged_MustardUI.blend のアーマチュアを完全移植する。

目的:
  - Helena のメッシュをそのまま使いつつ、ボーン構造（位置/方向/階層/ポーズ）を
    QM (Auto-Rig Pro) と完全に一致させる。
  - これにより QM 用に作ったアニメ/衣装を Helena に直接適用可能にする。

処理フロー:
  [1] Helena 側に存在する全 armature を「source armature」として収集
       (Helena 本体 + Hair など物理用サブ armature を含む)
  [2] QM armature を append
  [3] 各 source armature について VG_RENAME で valid_map を構築し、
       階層フォールバック (mapped 祖先を継承) で micro-bone もカバー
  [4] source bone -> QM bone の retarget 行列
        T_h2q = M_q_world @ M_h_world^-1
  [5] source armature を参照する skinned mesh について:
       a. LBS で頂点を Helena rest 空間 → QM rest 空間へ移動
       b. vertex group 名を QM bone 名にリネーム/マージ
       c. ARMATURE modifier の target を QM armature に差し替え
  [6] 全 source armature を削除し、メッシュを QM armature 配下に reparent
  [7] 保存

Usage:
  blender --background <helena.blend> --python transplant_qm_armature_to_helena.py -- \\
    <qm.blend> <qm_armature_name> <config.json> <out.blend>
"""
import bpy
import sys
import os
import json
from mathutils import Vector


# ============================================================
# Args
# ============================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
# Optional flags
NO_LBS = "--no-lbs" in args
if NO_LBS:
    args = [a for a in args if a != "--no-lbs"]
if len(args) < 4:
    print(__doc__)
    sys.exit(1)

QM_BLEND    = args[0]
QM_ARM_NAME = args[1]
CONFIG_JSON = args[2]
OUT_BLEND   = args[3]

print("\n=== transplant_qm_armature_to_helena ===")
print(f"  qm_blend:    {QM_BLEND}")
print(f"  qm_armature: {QM_ARM_NAME}")
print(f"  config:      {CONFIG_JSON}")
print(f"  out:         {OUT_BLEND}")


# ============================================================
# [0] Load config
# ============================================================
with open(CONFIG_JSON, encoding="utf-8") as f:
    config = json.load(f)
VG_RENAME = config["vg_rename"]   # helena_bone -> qm_bone
print(f"  vg_rename entries: {len(VG_RENAME)}")


# ============================================================
# [1] Snapshot original Helena objects + collect source armatures
# ============================================================
original_objects = {o.name for o in bpy.data.objects}
source_armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
print(f"\n[1] Source armatures (in Helena blend): {len(source_armatures)}")
for a in source_armatures:
    n_def = sum(1 for b in a.data.bones if b.use_deform)
    print(f"  - {a.name}: {len(a.data.bones)} bones ({n_def} deform)")


# ============================================================
# [2] Append QM armature
# ============================================================
print(f"\n[2] Append QM armature")
QM_BLEND_ABS = os.path.abspath(QM_BLEND)
existing_before_load = {o.name for o in bpy.data.objects}
with bpy.data.libraries.load(QM_BLEND_ABS, link=False) as (df, dt):
    if QM_ARM_NAME not in df.objects:
        print(f"ERROR: {QM_ARM_NAME} not in {QM_BLEND}")
        sys.exit(1)
    dt.objects = [QM_ARM_NAME]
qm_arm = None
for o in bpy.data.objects:
    if o.name in existing_before_load:
        continue
    if o.name == QM_ARM_NAME or o.name.startswith(QM_ARM_NAME + "."):
        qm_arm = o
        break
if qm_arm is None:
    print(f"ERROR: failed to load QM armature")
    sys.exit(1)
if qm_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(qm_arm)
qm_world = qm_arm.matrix_world
qm_bone_names = {b.name for b in qm_arm.data.bones}
print(f"  QM armature: {qm_arm.name} ({len(qm_arm.data.bones)} bones)")


# ============================================================
# [3+4] Build aggregated bone-name -> retarget transform map
#       across all source armatures.
#       T_h2q = M_q_world @ M_h_world^-1
# ============================================================
print(f"\n[3] Build retarget map across source armatures")
bone_T = {}                  # bone_name -> world->world transform
name_to_qm = {}              # bone_name -> QM bone name (single global map)
src_arm_of_bone = {}         # bone_name -> source armature object
n_direct = 0
n_fallback = 0
n_unmapped_source_bones = 0

for src in source_armatures:
    src_world = src.matrix_world
    src_bones = src.data.bones
    src_bone_names = {b.name for b in src_bones}

    # Direct mapping
    valid_map = {}
    for h, q in VG_RENAME.items():
        if h not in src_bone_names:
            continue
        if q not in qm_bone_names:
            continue
        valid_map[h] = q

    # Hierarchy fallback within this armature
    for b in src_bones:
        if b.name in valid_map:
            continue
        cur = b.parent
        while cur is not None:
            if cur.name in valid_map:
                valid_map[b.name] = valid_map[cur.name]
                break
            cur = cur.parent

    # Root fallback: bones that still have no mapping (typically the
    # armature root with no parent, or sibling roots) fall back to a
    # sensible QM target chosen per-armature.
    if "hair" in src.name.lower():
        ROOT_FALLBACK = "head.x"
    else:
        ROOT_FALLBACK = "c_root_bend.x"
    if ROOT_FALLBACK in qm_bone_names:
        for b in src_bones:
            if b.name not in valid_map:
                valid_map[b.name] = ROOT_FALLBACK

    # Build retarget transforms.
    #   T_h2q = M_q_world @ M_h_world^-1
    # Pure rotation + translation per bone — vertex distances from bone are
    # preserved (Helena keeps her original silhouette/proportions, just
    # placed in QM rest-pose space).
    # NOTE: Bone-axial Y scaling was tried (scale = q_len / h_len) but the
    # LBS weighted-sum produced runaway stretching at joints because each
    # bone independently stretches its weighted vertices and the average
    # over multiple bone influences does not preserve the chain length.
    for h_name, q_name in valid_map.items():
        h_bone = src_bones[h_name]
        q_bone = qm_arm.data.bones[q_name]
        M_h_world = src_world @ h_bone.matrix_local
        M_q_world = qm_world  @ q_bone.matrix_local
        bone_T[h_name] = M_q_world @ M_h_world.inverted()
        name_to_qm[h_name] = q_name
        src_arm_of_bone[h_name] = src
        if h_name in VG_RENAME:
            n_direct += 1
        else:
            n_fallback += 1

    n_unmapped_source_bones += sum(1 for b in src_bones if b.name not in valid_map)
    print(f"  [{src.name}] mapped: {len(valid_map)}/{len(src_bones)} "
          f"(unmapped: {len(src_bones) - len(valid_map)}) "
          f"root_fallback={ROOT_FALLBACK}")
print(f"  Total: direct={n_direct} fallback={n_fallback} "
      f"unmapped_source_bones={n_unmapped_source_bones}")


# ============================================================
# [5] Process meshes referencing any source armature
# ============================================================
src_arm_set = set(source_armatures)
mesh_targets = []   # (mesh_obj, [armature_modifiers_to_swap])
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    arm_mods = [m for m in o.modifiers
                if m.type == "ARMATURE" and m.object in src_arm_set]
    if arm_mods:
        mesh_targets.append((o, arm_mods))
print(f"\n[5] Skinned meshes referencing source armatures: {len(mesh_targets)}")

n_total_verts = 0
n_unmapped_verts = 0

for mesh_obj, arm_mods in mesh_targets:
    mesh = mesh_obj.data
    mesh_world = mesh_obj.matrix_world
    mesh_world_inv = mesh_world.inverted()

    # Remove all shape keys before editing vertex coordinates.
    # DAZ-imported meshes carry hundreds of facial/body morphs whose data
    # blocks store absolute vertex positions; modifying mesh.vertices[i].co
    # does NOT update those data blocks, and depsgraph evaluation uses the
    # shape-key data (not mesh.vertices), silently discarding our edits.
    if mesh.shape_keys:
        bpy.context.view_layer.objects.active = mesh_obj
        try:
            mesh_obj.select_set(True)
        except RuntimeError:
            pass
        bpy.ops.object.shape_key_remove(all=True)

    # Map vgroup index -> retarget transform (only those whose name we can map)
    vg_idx_to_T = {}
    for vg in mesh_obj.vertex_groups:
        T = bone_T.get(vg.name)
        if T is not None:
            vg_idx_to_T[vg.index] = T

    n_v = len(mesh.vertices)
    n_unmapped = 0
    if not NO_LBS:
        for v in mesh.vertices:
            if not v.groups:
                continue
            contribs = []
            wsum = 0.0
            for g in v.groups:
                T = vg_idx_to_T.get(g.group)
                if T is None or g.weight <= 0.0:
                    continue
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

    n_total_verts += n_v
    n_unmapped_verts += n_unmapped

    # ---------- vertex group rename / merge ----------
    # Use the shared name_to_qm map built in step [3].
    qm_to_sources = {}
    for vg in list(mesh_obj.vertex_groups):
        q = name_to_qm.get(vg.name)
        if q is None:
            continue
        qm_to_sources.setdefault(q, []).append(vg.name)

    for q_name, src_names in qm_to_sources.items():
        if len(src_names) == 1 and src_names[0] == q_name:
            continue
        if len(src_names) == 1:
            mesh_obj.vertex_groups[src_names[0]].name = q_name
            continue
        target = mesh_obj.vertex_groups.get(q_name)
        if target is None:
            first = mesh_obj.vertex_groups[src_names[0]]
            first.name = q_name
            target = first
            remaining = src_names[1:]
        else:
            remaining = src_names[:]
        target_idx = target.index
        src_indices = [mesh_obj.vertex_groups[n].index for n in remaining
                       if n in mesh_obj.vertex_groups]
        for v in mesh.vertices:
            extra = 0.0
            target_w = 0.0
            for g in v.groups:
                if g.group == target_idx:
                    target_w = g.weight
                elif g.group in src_indices:
                    extra += g.weight
            if extra <= 0.0:
                continue
            new_w = min(1.0, target_w + extra)
            target.add([v.index], new_w, "REPLACE")
        for nm in remaining:
            vg = mesh_obj.vertex_groups.get(nm)
            if vg is not None:
                mesh_obj.vertex_groups.remove(vg)

    # ---------- swap armature modifier ----------
    for m in arm_mods:
        m.object = qm_arm

    print(f"  {mesh_obj.name}: verts={n_v} unmapped={n_unmapped} "
          f"vgroups_after={len(mesh_obj.vertex_groups)}")

print(f"\n  TOTAL: verts={n_total_verts} unmapped={n_unmapped_verts}")


# ============================================================
# [6] Cleanup: remove all source armatures, reparent meshes to QM
# ============================================================
print(f"\n[6] Remove source armatures + reparent")
src_arm_names = [a.name for a in source_armatures]
for src in list(source_armatures):
    src_data = src.data
    bpy.data.objects.remove(src, do_unlink=True)
    if src_data.users == 0:
        bpy.data.armatures.remove(src_data)
print(f"  removed armatures: {src_arm_names}")

n_reparent = 0
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    if not any(m.type == "ARMATURE" and m.object == qm_arm for m in o.modifiers):
        continue
    world = o.matrix_world.copy()
    o.parent = qm_arm
    o.parent_type = "OBJECT"
    o.matrix_parent_inverse = qm_arm.matrix_world.inverted()
    o.matrix_world = world
    n_reparent += 1
print(f"  reparented to QM: {n_reparent} meshes")


# ============================================================
# [7] Save
# ============================================================
OUT_BLEND_ABS = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(OUT_BLEND_ABS)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
print(f"\n[7] Save -> {OUT_BLEND_ABS}")
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND_ABS)
print(f"  saved.")
print(f"\n=== DONE ===")
