"""Fit-Lite: Helena dress を QMRest 状態で QM body にフィットさせる。

仮説: QMRest Helena ですでに pose が QM と一致しているなら、
      dress 位置はほぼ正しい。残るは body 形状差による「dress が体内にめり込む」だけ。
      これだけなら body 内 vertex を表面に押し出すだけで足りる (morph 不要)。

処理:
  1. QM blend を base として開く
  2. QMRest Helena から target dress mesh を append
  3. dress VG を Helena bone 名 → QM bone 名にリネーム
  4. dress の Armature Modifier を QM armature に差し替え
  5. [Optional] dress vertex で QM body 内側にあるものを表面 + min_offset に push
  6. 別 .blend に保存 (voxelize input 用)

Usage:
  blender --background <qm.blend> --python fit_lite_no_morph.py -- \
    <helena_qmrest.blend> <helena_dress_name> <qm_armature_name> <out.blend> \
    [<qm_body_name>] [<min_offset>]

  qm_body_name 指定時: body push を実行 (default: "Queen Marika Body")
  min_offset (m): body 表面からの余裕 (default: 0.005 = 5mm)
  "" を qm_body_name に渡すと push スキップ
"""
import bpy
import sys
import os
from collections import defaultdict
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import bmesh

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 4:
    print(__doc__); sys.exit(1)

HELENA_BLEND, HELENA_DRESS, QM_ARM_NAME, OUT_BLEND = args[:4]
QM_BODY_NAME = args[4] if len(args) > 4 else "Queen Marika Body"
MIN_OFFSET = float(args[5]) if len(args) > 5 else 0.005

# Bone mapping (from fit_helena_to_qm.py 最古版)
SRC_TO_TGT_BONE = {
    'DEF-spine':       'c_root_bend.x',
    'DEF-spine.001':   'c_spine_01_bend.x',
    'DEF-spine.002':   'c_spine_02_bend.x',
    'DEF-spine.003':   'c_spine_03_bend.x',
    'DEF-spine.004':   'neck.x',
    'DEF-spine.005':   'neck.x',
    'DEF-spine.006':   'head.x',
    'DEF-neck':        'neck.x',
    'DEF-head':        'head.x',
    'DEF-breast.L':    'breast_l',
    'DEF-breast.R':    'breast_r',
    'DEF-shoulder.L':  'shoulder.l',
    'DEF-shoulder.R':  'shoulder.r',
    'DEF-upper_arm.L':     'c_arm_stretch.l',
    'DEF-upper_arm.L.001': 'c_arm_stretch.l',
    'DEF-upper_arm.R':     'c_arm_stretch.r',
    'DEF-upper_arm.R.001': 'c_arm_stretch.r',
    'DEF-forearm.L':       'c_forearm_stretch.l',
    'DEF-forearm.L.001':   'c_forearm_stretch.l',
    'DEF-forearm.R':       'c_forearm_stretch.r',
    'DEF-forearm.R.001':   'c_forearm_stretch.r',
    'DEF-hand.L':      'hand.l',
    'DEF-hand.R':      'hand.r',
    'DEF-thigh.L':         'c_thigh_stretch.l',
    'DEF-thigh.L.001':     'c_thigh_stretch.l',
    'DEF-thigh.R':         'c_thigh_stretch.r',
    'DEF-thigh.R.001':     'c_thigh_stretch.r',
    'DEF-shin.L':          'c_leg_stretch.l',
    'DEF-shin.L.001':      'c_leg_stretch.l',
    'DEF-shin.R':          'c_leg_stretch.r',
    'DEF-shin.R.001':      'c_leg_stretch.r',
    'DEF-foot.L':      'foot.l',
    'DEF-foot.R':      'foot.r',
    'DEF-toe.L':       'c_toes_middle1.l',
    'DEF-toe.R':       'c_toes_middle1.r',
    'DEF-pelvis.L':    'c_root_bend.x',
    'DEF-pelvis.R':    'c_root_bend.x',
}

print(f"\n=== fit_lite_no_morph ===")

# [1] QM is already loaded as base. Get QM armature.
qm_arm = bpy.data.objects.get(QM_ARM_NAME)
if not qm_arm:
    print(f"ERROR: QM armature {QM_ARM_NAME} not found"); sys.exit(1)
print(f"[1] QM armature: {qm_arm.name}")

# [2] Append Helena dress from QMRest Helena
print(f"[2] Append {HELENA_DRESS} from {HELENA_BLEND}")
with bpy.data.libraries.load(HELENA_BLEND, link=False) as (src, dst):
    if HELENA_DRESS not in src.objects:
        print(f"ERROR: '{HELENA_DRESS}' not in {HELENA_BLEND}"); sys.exit(1)
    dst.objects = [HELENA_DRESS]
helena_dress = bpy.data.objects.get(HELENA_DRESS)
if not helena_dress:
    print(f"ERROR: failed to load dress"); sys.exit(1)
bpy.context.scene.collection.objects.link(helena_dress)
print(f"  loaded: {helena_dress.name} verts={len(helena_dress.data.vertices)}")

# Clear shape keys (interfere with operations)
if helena_dress.data.shape_keys:
    n = len(helena_dress.data.shape_keys.key_blocks)
    helena_dress.shape_key_clear()
    print(f"  cleared {n} shape keys")

# [3] Rename VGs (Helena → QM)
print(f"[3] Rename vertex groups")
qm_bone_names = set(b.name for b in qm_arm.data.bones)
kept = renamed = merged = removed = 0
for vg in list(helena_dress.vertex_groups):
    src_name = vg.name
    if src_name in qm_bone_names:
        kept += 1
        continue
    tgt_name = SRC_TO_TGT_BONE.get(src_name)
    if tgt_name and tgt_name in qm_bone_names:
        if tgt_name in helena_dress.vertex_groups:
            tgt_vg = helena_dress.vertex_groups[tgt_name]
            src_idx = vg.index
            for v in helena_dress.data.vertices:
                for g in v.groups:
                    if g.group == src_idx:
                        tgt_vg.add([v.index], g.weight, 'ADD')
            helena_dress.vertex_groups.remove(vg)
            merged += 1
        else:
            vg.name = tgt_name
            renamed += 1
    else:
        helena_dress.vertex_groups.remove(vg)
        removed += 1
print(f"  VG: kept={kept}, renamed={renamed}, merged={merged}, removed={removed}")

# [4] Replace Armature Modifier (Helena → QM)
print(f"[4] Replace Armature Modifier")
existing_arm_mod = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE':
        existing_arm_mod = m
        break
if existing_arm_mod:
    existing_arm_mod.object = qm_arm
    existing_arm_mod.use_vertex_groups = True
    print(f"  reused existing modifier '{existing_arm_mod.name}', set object={qm_arm.name}")
else:
    am = helena_dress.modifiers.new(name='Armature_QM', type='ARMATURE')
    am.object = qm_arm
    am.use_vertex_groups = True
    print(f"  added new Armature modifier -> {qm_arm.name}")

# Parent dress to QM armature (so transforms match)
helena_dress.parent = qm_arm
helena_dress.matrix_parent_inverse = qm_arm.matrix_world.inverted()

# [5] アプローチ A-1: dress 全体を QM body に Shrinkwrap (ON_SURFACE)
# drape は失うが、確実に QM body に密着する第二皮膚化
if QM_BODY_NAME:
    print(f"[5] Approach A-1: Shrinkwrap dress ALL verts to QM body (offset={MIN_OFFSET*1000:.1f}mm)")
    qm_body = bpy.data.objects.get(QM_BODY_NAME)
    if not qm_body:
        print(f"  WARN: {QM_BODY_NAME} not found, skipping push")
    else:
        sw = helena_dress.modifiers.new(name='SW_ALL', type='SHRINKWRAP')
        sw.target = qm_body
        sw.wrap_method = 'NEAREST_SURFACEPOINT'
        sw.wrap_mode = 'ON_SURFACE'  # snap to surface in both directions
        sw.offset = MIN_OFFSET
        # NO vertex_group → all verts affected
        bpy.ops.object.select_all(action='DESELECT')
        helena_dress.select_set(True)
        bpy.context.view_layer.objects.active = helena_dress
        bpy.context.view_layer.update()
        bpy.ops.object.modifier_apply(modifier=sw.name)
        print(f"  Shrinkwrap applied: ALL dress verts snapped to QM body")
        helena_dress.data.update()
    if False:
        # Build BVH from QM body in world space, with OUTER-shell filtering
        # (QM body has double shell; inner faces would mis-attract dress verts inward)
        bm = bmesh.new()
        bm.from_mesh(qm_body.data)
        bm.transform(qm_body.matrix_world)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

        qm_bvh = BVHTree.FromBMesh(bm)
        print(f"  QM body BVH: {len(bm.verts)} verts, {len(bm.faces)} faces (full body, no filter)")

        # Pre-compute QM bone heads in world space
        qm_bone_heads_w = {}
        for b in qm_arm.data.bones:
            qm_bone_heads_w[b.name] = qm_arm.matrix_world @ b.head_local

        # Multi-hit ray cast: returns distance to FURTHEST hit along ray
        # (handles double-shell: ignores inner shell, uses outer)
        def find_outermost_hit(bvh, origin, direction, max_dist=2.0):
            cur_origin = origin.copy()
            cumulative = 0.0
            last_dist = None
            for _ in range(15):
                remaining = max_dist - cumulative
                if remaining <= 0: break
                hit_loc, _, _, dist = bvh.ray_cast(cur_origin, direction, remaining)
                if hit_loc is None: break
                cumulative += dist
                last_dist = cumulative
                cur_origin = hit_loc + direction * 1e-4
            return last_dist

        mw = helena_dress.matrix_world
        mwi = mw.inverted()
        n_pushed = n_kept = n_no_bone = n_no_hit = 0
        depth_stats = []
        for v in helena_dress.data.vertices:
            # Find dominant bone (max weight, must exist in QM armature)
            max_w = 0
            dominant_bone = None
            for g in v.groups:
                vg = helena_dress.vertex_groups[g.group]
                if g.weight > max_w and vg.name in qm_bone_heads_w:
                    max_w = g.weight
                    dominant_bone = vg.name
            if dominant_bone is None:
                n_no_bone += 1
                continue

            wp = mw @ v.co
            bone_head = qm_bone_heads_w[dominant_bone]
            direction_vec = wp - bone_head
            r_v = direction_vec.length
            if r_v < 1e-6:
                n_kept += 1
                continue
            d = direction_vec / r_v

            # Cast from bone_head outward, find OUTERMOST hit (= outer body shell)
            R_outer = find_outermost_hit(qm_bvh, bone_head, d, 2.0)
            if R_outer is None:
                n_no_hit += 1
                continue

            target_r = R_outer + MIN_OFFSET
            depth_stats.append(r_v - R_outer)  # negative = inside outer shell
            if r_v < target_r:
                # Push to outer surface + offset along the SAME bone-direction
                new_wp = bone_head + d * target_r
                v.co = mwi @ new_wp
                n_pushed += 1
            else:
                n_kept += 1
        helena_dress.data.update()
        bm.free()
        if depth_stats:
            depth_stats.sort()
            print(f"  PRE-push depth (vert_r - outer_R): min={min(depth_stats)*100:.1f}cm "
                  f"max={max(depth_stats)*100:.1f}cm "
                  f"median={depth_stats[len(depth_stats)//2]*100:.1f}cm")
        print(f"  pushed to outer surface: {n_pushed} verts")
        print(f"  kept (already outside outer shell): {n_kept} verts")
        print(f"  no dominant bone: {n_no_bone}, ray no-hit: {n_no_hit}")
else:
    print(f"[5] SKIP body push (qm_body_name empty)")

# Rename dress to indicate fit-lite
new_name = f"{HELENA_DRESS} (fit-lite)"
helena_dress.name = new_name
print(f"  dress renamed: {new_name}")

# [6] Save
print(f"[6] Save to {OUT_BLEND}")
out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved")
print(f"\n=== DONE ===")
