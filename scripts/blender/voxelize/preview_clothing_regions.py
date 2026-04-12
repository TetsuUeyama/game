"""衣装パーツと QM 部位色分けBody を並べてプレビューレンダリングする。
ユーザーが衣装のカバー範囲を視覚的に確認し、部位を指定するための補助ツール。

Usage:
  blender --background <clothing.blend> --python preview_clothing_regions.py -- \
    <qm.blend> <part_name> <output_image.png>

出力: 正面・背面・側面の3アングルを1枚の画像にまとめて出力
"""
import bpy
import bmesh
import sys
import os
import json
from mathutils import Vector, Color
import math

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

QM_BLEND = args[0]
PART_NAME = args[1]
OUT_IMAGE = args[2]

# ========================================================================
# ボーン → 部位グループ定義（generate_bone_region_map.py と同一）
# ========================================================================
BONE_GROUPS = {
    'head': [
        'head.x', 'jawbone.x',
        'c_cheek_inflate.l', 'c_cheek_inflate.r',
        'c_cheek_smile.l', 'c_cheek_smile.r',
        'c_chin_01.x', 'c_chin_02.x',
        'c_ear_01.l', 'c_ear_01.r', 'c_ear_02.l', 'c_ear_02.r',
        'c_eye_offset.l', 'c_eye_offset.r',
        'c_eye_ref_track.l', 'c_eye_ref_track.r',
        'c_eyebrow_01.l', 'c_eyebrow_01.r',
        'c_eyebrow_01_end.l', 'c_eyebrow_01_end.r',
        'c_eyebrow_02.l', 'c_eyebrow_02.r',
        'c_eyebrow_03.l', 'c_eyebrow_03.r',
        'c_eyelid_bot_01.l', 'c_eyelid_bot_01.r',
        'c_eyelid_bot_02.l', 'c_eyelid_bot_02.r',
        'c_eyelid_bot_03.l', 'c_eyelid_bot_03.r',
        'c_eyelid_corner_01.l', 'c_eyelid_corner_01.r',
        'c_eyelid_corner_02.l', 'c_eyelid_corner_02.r',
        'c_eyelid_top_01.l', 'c_eyelid_top_01.r',
        'c_eyelid_top_02.l', 'c_eyelid_top_02.r',
        'c_eyelid_top_03.l', 'c_eyelid_top_03.r',
        'c_lips_bot.l', 'c_lips_bot.r', 'c_lips_bot.x',
        'c_lips_bot_01.l', 'c_lips_bot_01.r',
        'c_lips_smile.l', 'c_lips_smile.r',
        'c_lips_top.l', 'c_lips_top.r', 'c_lips_top.x',
        'c_lips_top_01.l', 'c_lips_top_01.r',
        'c_nose_01.x', 'c_nose_02.x', 'c_nose_03.x',
        'c_teeth_bot.l', 'c_teeth_bot.r', 'c_teeth_bot.x',
        'c_teeth_top.l', 'c_teeth_top.r', 'c_teeth_top.x',
        'tong_01.x', 'tong_02.x', 'tong_03.x',
    ],
    'neck': ['neck.x'],
    'shoulder_l': ['shoulder.l'],
    'shoulder_r': ['shoulder.r'],
    'upper_torso': [
        'c_spine_03_bend.x',
        'breast_l', 'breast_r', 'nipple_l', 'nipple_r',
    ],
    'lower_torso': [
        'c_spine_02_bend.x', 'c_spine_01_bend.x',
    ],
    'hips': [
        'c_root_bend.x', 'butt_l', 'butt_r',
        'genital', 'vagina_01.l', 'vagina_01.r', 'vagina_01.x',
        'vagina_02.l', 'vagina_02.r', 'vagina_02.x',
    ],
    'upper_arm_l': ['c_arm_twist.l', 'c_arm_stretch.l'],
    'upper_arm_r': ['c_arm_twist.r', 'c_arm_stretch.r'],
    'forearm_l': ['c_forearm_twist.l', 'c_forearm_stretch.l', 'lowerarm_elbow_l'],
    'forearm_r': ['c_forearm_twist.r', 'c_forearm_stretch.r', 'lowerarm_elbow_r'],
    'hand_l': [
        'hand.l', 'c_index1_base.l', 'index1.l', 'c_index2.l', 'c_index3.l',
        'c_middle1_base.l', 'middle1.l', 'c_middle2.l', 'c_middle3.l',
        'c_ring1_base.l', 'ring1.l', 'c_ring2.l', 'c_ring3.l',
        'c_pinky1_base.l', 'pinky1.l', 'c_pinky2.l', 'c_pinky3.l',
        'thumb1.l', 'c_thumb2.l', 'c_thumb3.l',
    ],
    'hand_r': [
        'hand.r', 'c_index1_base.r', 'index1.r', 'c_index2.r', 'c_index3.r',
        'c_middle1_base.r', 'middle1.r', 'c_middle2.r', 'c_middle3.r',
        'c_ring1_base.r', 'ring1.r', 'c_ring2.r', 'c_ring3.r',
        'c_pinky1_base.r', 'pinky1.r', 'c_pinky2.r', 'c_pinky3.r',
        'thumb1.r', 'c_thumb2.r', 'c_thumb3.r',
    ],
    'thigh_l': ['c_thigh_twist.l', 'c_thigh_stretch.l'],
    'thigh_r': ['c_thigh_twist.r', 'c_thigh_stretch.r'],
    'shin_l': ['c_leg_twist.l', 'c_leg_stretch.l', 'knee_l'],
    'shin_r': ['c_leg_twist.r', 'c_leg_stretch.r', 'knee_r'],
    'foot_l': [
        'foot.l', 'toes_01.l',
        'c_toes_thumb1.l', 'c_toes_thumb2.l',
        'c_toes_index1.l', 'c_toes_index2.l', 'c_toes_index3.l',
        'c_toes_middle1.l', 'c_toes_middle2.l', 'c_toes_middle3.l',
        'c_toes_ring1.l', 'c_toes_ring2.l', 'c_toes_ring3.l',
        'c_toes_pinky1.l', 'c_toes_pinky2.l', 'c_toes_pinky3.l',
    ],
    'foot_r': [
        'foot.r', 'toes_01.r',
        'c_toes_thumb1.r', 'c_toes_thumb2.r',
        'c_toes_index1.r', 'c_toes_index2.r', 'c_toes_index3.r',
        'c_toes_middle1.r', 'c_toes_middle2.r', 'c_toes_middle3.r',
        'c_toes_ring1.r', 'c_toes_ring2.r', 'c_toes_ring3.r',
        'c_toes_pinky1.r', 'c_toes_pinky2.r', 'c_toes_pinky3.r',
    ],
}

BONE_TO_GROUP = {}
for gn, bones in BONE_GROUPS.items():
    for bn in bones:
        BONE_TO_GROUP[bn] = gn

GROUP_COLORS = {
    'head':         (1.0, 0.78, 0.78),
    'neck':         (1.0, 0.59, 0.59),
    'shoulder_l':   (0.78, 0.78, 1.0),
    'shoulder_r':   (0.59, 0.59, 1.0),
    'upper_torso':  (1.0, 1.0, 0.59),
    'lower_torso':  (1.0, 0.86, 0.39),
    'hips':         (1.0, 0.71, 0.31),
    'upper_arm_l':  (0.39, 0.78, 1.0),
    'upper_arm_r':  (0.20, 0.71, 1.0),
    'forearm_l':    (0.39, 1.0, 0.78),
    'forearm_r':    (0.20, 0.90, 0.71),
    'hand_l':       (0.59, 1.0, 0.59),
    'hand_r':       (0.39, 0.86, 0.39),
    'thigh_l':      (1.0, 0.59, 1.0),
    'thigh_r':      (0.90, 0.39, 0.90),
    'shin_l':       (0.78, 0.39, 1.0),
    'shin_r':       (0.71, 0.31, 0.90),
    'foot_l':       (1.0, 0.39, 0.39),
    'foot_r':       (0.86, 0.31, 0.31),
    'unknown':      (0.5, 0.5, 0.5),
}

print(f"\n=== Clothing Region Preview ===")
print(f"  Clothing blend: {bpy.data.filepath}")
print(f"  QM blend: {QM_BLEND}")
print(f"  Part: {PART_NAME}")

# ========================================================================
# Step 1: 衣装パーツを取得
# ========================================================================
# MASK解除
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for mod in obj.modifiers:
            if mod.type == 'MASK' and mod.show_viewport:
                mod.show_viewport = False

part_obj = None
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH' and obj.name == PART_NAME:
        part_obj = obj
        break

if not part_obj:
    print(f"ERROR: Part '{PART_NAME}' not found")
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for m in meshes:
        print(f"  - {m.name}")
    sys.exit(1)

print(f"  Found clothing: {part_obj.name}")

# 衣装の評価済みメッシュを独立オブジェクトとして取得
dg = bpy.context.evaluated_depsgraph_get()
eo = part_obj.evaluated_get(dg)
cloth_mesh = bpy.data.meshes.new_from_object(eo)
cloth_mesh.transform(part_obj.matrix_world)
cloth_obj = bpy.data.objects.new("ClothingPreview", cloth_mesh)

# ========================================================================
# Step 2: QM Body をリンク/アペンドして頂点カラーで部位色分け
# ========================================================================
print("  Loading QM body...")

# QMのBodyオブジェクトをアペンド
with bpy.data.libraries.load(QM_BLEND, link=False) as (data_from, data_to):
    # メッシュオブジェクトを全てアペンド
    data_to.objects = [n for n in data_from.objects]

qm_body = None
for obj in data_to.objects:
    if obj is not None:
        if obj.type == 'MESH' and 'body' in obj.name.lower() and 'queen' in obj.name.lower():
            qm_body = obj
            break

if not qm_body:
    # フォールバック: bodyを含むメッシュを探す
    for obj in data_to.objects:
        if obj is not None and obj.type == 'MESH' and 'body' in obj.name.lower():
            qm_body = obj
            break

if not qm_body:
    print("ERROR: QM body not found in blend file")
    sys.exit(1)

print(f"  QM body: {qm_body.name} ({len(qm_body.data.vertices)} verts)")

# QM Bodyに頂点カラーを設定
qm_mesh = qm_body.data
# 既存の色属性を削除してから作成
for ca in list(qm_mesh.color_attributes):
    qm_mesh.color_attributes.remove(ca)
color_attr = qm_mesh.color_attributes.new(name="RegionColor", type='BYTE_COLOR', domain='CORNER')
qm_mesh.color_attributes.active_color = color_attr

# vertex group情報
vg_idx_to_name = {vg.index: vg.name for vg in qm_body.vertex_groups}

# 各頂点の部位を判定
vert_region = {}
for v in qm_mesh.vertices:
    best_group = 'unknown'
    best_weight = 0.0
    for g in v.groups:
        vg_name = vg_idx_to_name.get(g.group, '')
        region = BONE_TO_GROUP.get(vg_name)
        if region and g.weight > best_weight:
            best_weight = g.weight
            best_group = region
    vert_region[v.index] = best_group

# ループ（コーナー）に色を設定
for poly in qm_mesh.polygons:
    for loop_idx in poly.loop_indices:
        vi = qm_mesh.loops[loop_idx].vertex_index
        region = vert_region.get(vi, 'unknown')
        col = GROUP_COLORS.get(region, (0.5, 0.5, 0.5))
        color_attr.data[loop_idx].color = (col[0], col[1], col[2], 1.0)

# ========================================================================
# Step 3: シーン構築
# ========================================================================
print("  Building preview scene...")

# 既存オブジェクトを全非表示
for obj in bpy.context.scene.objects:
    obj.hide_viewport = True
    obj.hide_render = True

# 新しいコレクションに追加
preview_col = bpy.data.collections.new("Preview")
bpy.context.scene.collection.children.link(preview_col)

# QM Body を追加（頂点カラー表示）
preview_col.objects.link(qm_body)
qm_body.hide_viewport = False
qm_body.hide_render = False

# QM Body用マテリアル（頂点カラー表示）
qm_mat = bpy.data.materials.new("QM_RegionMat")
qm_mat.use_nodes = True
nodes = qm_mat.node_tree.nodes
links = qm_mat.node_tree.links
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
vcol = nodes.new('ShaderNodeVertexColor')
vcol.layer_name = "RegionColor"
links.new(vcol.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.8
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
output.location = (400, 0)
bsdf.location = (200, 0)
vcol.location = (0, 0)

qm_body.data.materials.clear()
qm_body.data.materials.append(qm_mat)

# 衣装を追加（半透明白）
preview_col.objects.link(cloth_obj)
cloth_obj.hide_viewport = False
cloth_obj.hide_render = False

cloth_mat = bpy.data.materials.new("ClothPreviewMat")
cloth_mat.use_nodes = True
cloth_mat.blend_method = 'BLEND' if hasattr(cloth_mat, 'blend_method') else 'OPAQUE'
cn = cloth_mat.node_tree.nodes
cl = cloth_mat.node_tree.links
cn.clear()
c_out = cn.new('ShaderNodeOutputMaterial')
c_bsdf = cn.new('ShaderNodeBsdfPrincipled')
c_bsdf.inputs['Base Color'].default_value = (0.9, 0.9, 1.0, 1.0)
c_bsdf.inputs['Alpha'].default_value = 0.4
c_bsdf.inputs['Roughness'].default_value = 0.3
cl.new(c_bsdf.outputs['BSDF'], c_out.inputs['Surface'])
c_out.location = (400, 0)
c_bsdf.location = (200, 0)

cloth_obj.data.materials.clear()
cloth_obj.data.materials.append(cloth_mat)

# ========================================================================
# Step 4: カメラ・ライト設定 & マルチアングルレンダリング
# ========================================================================
# EEVEE使用（高速）
bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in dir(bpy.types) else 'BLENDER_EEVEE'
bpy.context.scene.render.resolution_x = 600
bpy.context.scene.render.resolution_y = 1000
bpy.context.scene.render.film_transparent = True

# Body中心を計算
body_bb = [qm_body.matrix_world @ Vector(corner) for corner in qm_body.bound_box]
center = sum(body_bb, Vector()) / 8
height = max(v.z for v in body_bb) - min(v.z for v in body_bb)
look_at = Vector((center.x, center.y, center.z + height * 0.05))

# ライト
light_data = bpy.data.lights.new("PreviewLight", 'SUN')
light_data.energy = 3.0
light_obj = bpy.data.objects.new("PreviewLight", light_data)
preview_col.objects.link(light_obj)
light_obj.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))

# 環境光
bpy.context.scene.world = bpy.data.worlds.new("PreviewWorld")
bpy.context.scene.world.use_nodes = True
bg = bpy.context.scene.world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Color'].default_value = (0.15, 0.15, 0.20, 1.0)
    bg.inputs['Strength'].default_value = 0.5

# カメラ
cam_data = bpy.data.cameras.new("PreviewCam")
cam_data.type = 'PERSP'
cam_data.lens = 85
cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
preview_col.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# 3アングル: 正面、背面、側面
import tempfile

angles = [
    ("front", 0),
    ("back", math.pi),
    ("side", math.pi / 2),
]

dist = height * 1.3
renders = []

for label, angle_y in angles:
    cam_x = look_at.x + dist * math.sin(angle_y)
    cam_y = look_at.y - dist * math.cos(angle_y)
    cam_z = look_at.z + height * 0.15
    cam_obj.location = Vector((cam_x, cam_y, cam_z))

    direction = look_at - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    tmp_path = os.path.join(os.path.dirname(OUT_IMAGE), f"_tmp_{label}.png")
    bpy.context.scene.render.filepath = tmp_path
    bpy.ops.render.render(write_still=True)
    renders.append(tmp_path)
    print(f"    Rendered {label}: {tmp_path}")

# ========================================================================
# Step 5: 3画像を横に結合
# ========================================================================
print("  Compositing final image...")

# Blenderの compositor で結合、またはPILがなければ単純に正面だけ使用
try:
    # numpy で結合
    import numpy as np
    images = []
    for rp in renders:
        img = bpy.data.images.load(rp)
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        px = np.flipud(px)  # Blenderは下から上
        images.append(px)

    combined = np.concatenate(images, axis=1)  # 横に結合
    ch, cw, _ = combined.shape

    # PNG書き出し
    out_img = bpy.data.images.new("combined", width=cw, height=ch, alpha=True)
    combined_flipped = np.flipud(combined)
    out_img.pixels[:] = combined_flipped.flatten()
    out_img.filepath_raw = OUT_IMAGE
    out_img.file_format = 'PNG'
    out_img.save()
    print(f"  -> {OUT_IMAGE} ({cw}x{ch})")

except Exception as e:
    print(f"  Composite failed ({e}), using front view only")
    import shutil
    shutil.copy2(renders[0], OUT_IMAGE)
    print(f"  -> {OUT_IMAGE}")

# クリーンアップ
for rp in renders:
    if os.path.exists(rp):
        os.remove(rp)

print("  Done!")
