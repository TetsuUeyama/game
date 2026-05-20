"""Helena 元 blend の Body breast 頂点を、ユーザー指定の source point を
起点として QM breast bone 長に合わせる Y-scale 変形。

ユーザーは Helena (orig) panel で breast tip 位置 (source) を指定。
QM breast bone tail 位置 (target) は QM blend を append して取得。

処理:
  [1] Helena armature 検出
  [2] QM armature を append (target 位置取得用)
  [3] 各側 (L/R) について:
       - Helena DEF-breast.{L,R} bone の rest matrix
       - source point (世界座標) の Helena bone-local 座標を計算
       - Y 軸 (bone axis) 上の axial 距離 = 元の breast 長 (Helena 視点)
       - QM breast_{l,r} bone の length = target 長
       - scale_y = target_length / source_axial_length
  [4] Body の各 breast 頂点 (DEF-breast.{L,R} weight > threshold) について:
       - Helena bone-local に変換
       - Y 軸方向に scale を適用
       - world に戻して v.co 更新
  [5] QM armature を削除し、変形後の Helena blend を保存

Usage:
  blender --background <Helena_Douglas_1.10.blend> \\
    --python adjust_helena_breast_anchor.py -- \\
    <out.blend> <qm.blend> <qm_armature_name> \\
    <left_x> <left_y> <left_z> <right_x> <right_y> <right_z>
"""
import bpy
import sys
import os
from mathutils import Vector


argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
if len(args) < 9:
    print(__doc__); sys.exit(1)

OUT_BLEND   = args[0]
QM_BLEND    = args[1]
QM_ARM_NAME = args[2]
source_L = Vector((float(args[3]), float(args[4]), float(args[5])))
source_R = Vector((float(args[6]), float(args[7]), float(args[8])))

print(f"\n=== adjust_helena_breast_anchor ===")
print(f"  out: {OUT_BLEND}")
print(f"  source L (Helena world): {source_L}")
print(f"  source R (Helena world): {source_R}")

BREAST_VG_THRESHOLD = 0.2  # この weight 以上で breast 頂点扱い
HELENA_BREAST_BONES = {
    "L": "DEF-breast.L",
    "R": "DEF-breast.R",
}
QM_BREAST_BONES = {
    "L": "breast_l",
    "R": "breast_r",
}


# ============================================================
# [1] Find Helena armature (most deform bones, not 'cs_*')
# ============================================================
helena_arm = None
for o in bpy.data.objects:
    if o.type != "ARMATURE" or o.name.startswith("cs_"):
        continue
    if "hair" in o.name.lower():
        continue
    score = sum(1 for b in o.data.bones if b.use_deform)
    if helena_arm is None or score > sum(1 for b in helena_arm.data.bones if b.use_deform):
        helena_arm = o
if helena_arm is None:
    print("ERROR: Helena armature not found"); sys.exit(1)
print(f"\n[1] Helena armature: {helena_arm.name}")
helena_world = helena_arm.matrix_world


# ============================================================
# [2] Append QM armature for target bone positions
# ============================================================
print(f"\n[2] Append QM armature")
existing = {o.name for o in bpy.data.objects}
QM_BLEND_ABS = os.path.abspath(QM_BLEND)
with bpy.data.libraries.load(QM_BLEND_ABS, link=False) as (df, dt):
    if QM_ARM_NAME not in df.objects:
        print(f"ERROR: {QM_ARM_NAME} not in {QM_BLEND}"); sys.exit(1)
    dt.objects = [QM_ARM_NAME]
qm_arm = None
for o in bpy.data.objects:
    if o.name in existing:
        continue
    if o.name == QM_ARM_NAME or o.name.startswith(QM_ARM_NAME + "."):
        qm_arm = o; break
if qm_arm is None:
    print(f"ERROR: failed to load QM armature"); sys.exit(1)
if qm_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(qm_arm)
qm_world = qm_arm.matrix_world
print(f"  QM armature: {qm_arm.name}")


# ============================================================
# [3] Compute scale per side
# ============================================================
print(f"\n[3] Compute scale per side")
specs = {}  # side -> {bone_name, M_h_world, M_h_world_inv, scale_y}
for side, src_world in [("L", source_L), ("R", source_R)]:
    h_name = HELENA_BREAST_BONES[side]
    q_name = QM_BREAST_BONES[side]
    h_bone = helena_arm.data.bones.get(h_name)
    q_bone = qm_arm.data.bones.get(q_name)
    if h_bone is None:
        print(f"  WARN: {h_name} not in Helena, skip {side}"); continue
    if q_bone is None:
        print(f"  WARN: {q_name} not in QM, skip {side}"); continue

    M_h = helena_world @ h_bone.matrix_local
    M_h_inv = M_h.inverted()
    # Source in Helena bone-local
    src_local = M_h_inv @ src_world
    # Axial (Y) distance from bone head to source
    src_axial = src_local.y
    if abs(src_axial) < 1e-6:
        print(f"  WARN: {side} source axial = 0 (source on bone head plane)")
        continue
    # QM target axial = QM bone length
    qm_length = q_bone.length
    scale_y = qm_length / src_axial

    specs[side] = {
        "bone_name": h_name,
        "M_h": M_h,
        "M_h_inv": M_h_inv,
        "scale_y": scale_y,
        "src_axial": src_axial,
        "qm_length": qm_length,
    }
    print(f"  [{side}] {h_name}: src_axial={src_axial*1000:.1f}mm  "
          f"qm_length={qm_length*1000:.1f}mm  scale_y={scale_y:.3f}")


# ============================================================
# [4] Body mesh: scale breast verts in Helena bone frame
# ============================================================
print(f"\n[4] Scale Body breast verts")
body = bpy.data.objects.get("Body") or bpy.data.objects.get("Helena_Base")
if body is None:
    print("ERROR: Body mesh not found"); sys.exit(1)
print(f"  Body: {body.name} (verts={len(body.data.vertices)})")

# Remove shape keys
if body.data.shape_keys:
    try:
        bpy.context.view_layer.objects.active = body
        body.select_set(True)
        bpy.ops.object.shape_key_remove(all=True)
        print(f"  shape keys removed")
    except RuntimeError as e:
        print(f"  WARN shape_key_remove: {e}")

mesh = body.data
mesh_world = body.matrix_world
mesh_world_inv = mesh_world.inverted()

# Map vgroup index -> side
vg_idx_to_side = {}
for vg in body.vertex_groups:
    for side, name in HELENA_BREAST_BONES.items():
        if vg.name == name and side in specs:
            vg_idx_to_side[vg.index] = side

print(f"  breast vgroup indices: {vg_idx_to_side}")

n_processed = 0
for v in mesh.vertices:
    best_side = None
    best_w = 0.0
    for g in v.groups:
        side = vg_idx_to_side.get(g.group)
        if side is None:
            continue
        if g.weight > best_w:
            best_w = g.weight
            best_side = side
    if best_side is None or best_w < BREAST_VG_THRESHOLD:
        continue
    spec = specs[best_side]
    p_world = mesh_world @ v.co
    p_local = spec["M_h_inv"] @ p_world
    p_local.y *= spec["scale_y"]
    p_world_new = spec["M_h"] @ p_local
    v.co = mesh_world_inv @ p_world_new
    n_processed += 1
print(f"  scaled {n_processed} breast verts")


# ============================================================
# [5] Remove QM armature + save
# ============================================================
print(f"\n[5] Cleanup QM armature + save")
qm_data = qm_arm.data
bpy.data.objects.remove(qm_arm, do_unlink=True)
if qm_data.users == 0:
    bpy.data.armatures.remove(qm_data)

out_abs = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(out_abs)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
print(f"  save -> {out_abs}")
bpy.ops.wm.save_as_mainfile(filepath=out_abs)
print(f"\n=== DONE ===")
