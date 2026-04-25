"""フィッティング済 blend を複数アングルからレンダリングして視覚確認用 PNG を出力。

Usage:
  blender --background <blend> --python render_fit_check.py -- \
    <qm_body_name> <dress_name> <out_dir>

生成:
  <out_dir>/front.png, side.png, back.png, perspective.png
"""
import bpy
import sys
import os
import math
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

QM_BODY = args[0]
DRESS = args[1]
OUT_DIR = args[2]
os.makedirs(OUT_DIR, exist_ok=True)

# 既存の light / camera を一旦全部削除
for obj in list(bpy.data.objects):
    if obj.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(obj, do_unlink=True)

# 体 + dress 以外の mesh を隠す (cage や他衣装が散乱してるので)
target_names = {QM_BODY, DRESS}
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        if obj.name not in target_names:
            obj.hide_render = True
            obj.hide_viewport = True
        else:
            obj.hide_render = False
            obj.hide_viewport = False
            obj.hide_set(False)

qm_body = bpy.data.objects.get(QM_BODY)
dress = bpy.data.objects.get(DRESS)
if not qm_body or not dress:
    print(f"ERROR: {QM_BODY} or {DRESS} not found")
    print("Available:")
    for o in bpy.data.objects:
        if o.type == 'MESH': print(f"  {o.name}")
    sys.exit(1)

print(f"  QM body: {qm_body.name}  Dress: {dress.name}")

# 対象 bbox 計算 (world)
def world_bbox(obj):
    mw = obj.matrix_world
    cs = [mw @ v.co for v in obj.data.vertices]
    xs = [c.x for c in cs]; ys = [c.y for c in cs]; zs = [c.z for c in cs]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))

b_min, b_max = world_bbox(qm_body)
d_min, d_max = world_bbox(dress)
print(f"  QM body bbox: {tuple(round(c,2) for c in b_min)} .. {tuple(round(c,2) for c in b_max)}")
print(f"  Dress bbox: {tuple(round(c,2) for c in d_min)} .. {tuple(round(c,2) for c in d_max)}")

# 両方包含する bbox
mn = Vector((min(b_min[i], d_min[i]) for i in range(3)))
mx = Vector((max(b_max[i], d_max[i]) for i in range(3)))
center = (mn + mx) * 0.5
size = (mx - mn)
radius = max(size.x, size.y, size.z) * 0.75

print(f"  scene center: {tuple(round(c,2) for c in center)} size: {tuple(round(c,2) for c in size)}")

# dress は赤 solid (全 material slot を上書き)
dress_mat = bpy.data.materials.new('DressPreview')
dress_mat.use_nodes = True
bsdf = dress_mat.node_tree.nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.95, 0.15, 0.15, 1.0)
# face の material_index を 0 に揃えて全 slot を dress_mat で上書き
for poly in dress.data.polygons:
    poly.material_index = 0
while len(dress.data.materials) > 0:
    dress.data.materials.pop(index=0)
dress.data.materials.append(dress_mat)
print(f"  dress material slots: {len(dress.data.materials)}")

# QM body は灰色 (同様に)
body_mat = bpy.data.materials.new('BodyPreview')
body_mat.use_nodes = True
bsdf_b = body_mat.node_tree.nodes.get('Principled BSDF')
if bsdf_b:
    bsdf_b.inputs['Base Color'].default_value = (0.7, 0.7, 0.7, 1.0)
for poly in qm_body.data.polygons:
    poly.material_index = 0
while len(qm_body.data.materials) > 0:
    qm_body.data.materials.pop(index=0)
qm_body.data.materials.append(body_mat)
print(f"  body material slots: {len(qm_body.data.materials)}")

# カメラ設定
def add_camera_at(loc, target):
    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    # Point camera at target
    direction = target - loc
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = direction.to_track_quat('-Z', 'Y')
    bpy.context.scene.camera = cam
    return cam

# ライト設定
def add_light(loc, energy=5.0, t='SUN'):
    ld = bpy.data.lights.new('L', t)
    ld.energy = energy
    lo = bpy.data.objects.new('L', ld)
    bpy.context.scene.collection.objects.link(lo)
    lo.location = loc
    if t == 'SUN':
        # Sunは方向のみ重要。対象を向くように回転
        direction = center - loc
        lo.rotation_mode = 'QUATERNION'
        lo.rotation_quaternion = direction.to_track_quat('-Z', 'Y')
    return lo

add_light(Vector((2, -2, 3)), energy=3.0)
add_light(Vector((-2, 2, 2)), energy=1.5)

# Render settings
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in type(scene.render).bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except:
    try: scene.render.engine = 'BLENDER_EEVEE'
    except: pass
scene.render.resolution_x = 800
scene.render.resolution_y = 1200
scene.render.image_settings.file_format = 'PNG'
scene.world.use_nodes = True
# 背景を白に
bg = scene.world.node_tree.nodes.get('Background')
if bg: bg.inputs['Color'].default_value = (0.9, 0.9, 0.9, 1.0)

# 4 アングルから撮影
angles = {
    'front':  Vector((center.x, center.y - radius*1.5, center.z)),
    'back':   Vector((center.x, center.y + radius*1.5, center.z)),
    'side_r': Vector((center.x + radius*1.5, center.y, center.z)),
    'perspective': Vector((center.x + radius*1.0, center.y - radius*1.2, center.z + radius*0.3)),
}

for name, loc in angles.items():
    # remove previous camera
    for obj in list(bpy.data.objects):
        if obj.type == 'CAMERA':
            bpy.data.objects.remove(obj, do_unlink=True)
    add_camera_at(loc, center)

    # 通常 render (body + dress)
    qm_body.hide_render = False
    dress.hide_render = False
    out_path = os.path.join(OUT_DIR, f"{name}.png")
    scene.render.filepath = out_path
    print(f"  rendering {name} -> {out_path}")
    bpy.ops.render.render(write_still=True)

    # dress のみ (body 隠す)
    qm_body.hide_render = True
    dress_only = os.path.join(OUT_DIR, f"{name}_dressonly.png")
    scene.render.filepath = dress_only
    print(f"  rendering {name} dress only -> {dress_only}")
    bpy.ops.render.render(write_still=True)

    # body のみ (dress 隠す)
    qm_body.hide_render = False
    dress.hide_render = True
    body_only = os.path.join(OUT_DIR, f"{name}_bodyonly.png")
    scene.render.filepath = body_only
    print(f"  rendering {name} body only -> {body_only}")
    bpy.ops.render.render(write_still=True)
    dress.hide_render = False

print(f"\n=== DONE ===")
