"""Helena_Base メッシュの modifier スタック + 評価後 mesh の bbox を確認。

shrinkwrap で v.co を直接編集したが voxelize 結果が変わらない原因調査用。
"""
import bpy

helena = bpy.data.objects.get("Helena_Base")
if helena is None:
    print("ERROR: Helena_Base not found"); exit()

print(f"Helena_Base:")
print(f"  raw mesh verts: {len(helena.data.vertices)}")
print(f"  shape keys: {len(helena.data.shape_keys.key_blocks) if helena.data.shape_keys else 0}")

print(f"  modifiers ({len(helena.modifiers)}):")
for m in helena.modifiers:
    info = f"    {m.type:15s} '{m.name}'"
    if m.type == 'ARMATURE':
        info += f"  obj={m.object.name if m.object else None}"
    elif m.type == 'MASK':
        info += f"  vg={m.vertex_group}"
    print(info)

# Bbox of raw mesh (no modifiers)
mw = helena.matrix_world
verts = [mw @ v.co for v in helena.data.vertices]
xs = [v.x for v in verts]; ys = [v.y for v in verts]; zs = [v.z for v in verts]
print(f"  RAW bbox: x[{min(xs):+.4f},{max(xs):+.4f}] y[{min(ys):+.4f},{max(ys):+.4f}] z[{min(zs):+.4f},{max(zs):+.4f}]")

# Bbox of evaluated mesh
deps = bpy.context.evaluated_depsgraph_get()
eval_obj = helena.evaluated_get(deps)
eval_mesh = eval_obj.to_mesh()
eval_verts = [eval_obj.matrix_world @ v.co for v in eval_mesh.vertices]
xs = [v.x for v in eval_verts]; ys = [v.y for v in eval_verts]; zs = [v.z for v in eval_verts]
print(f"  EVAL bbox: x[{min(xs):+.4f},{max(xs):+.4f}] y[{min(ys):+.4f},{max(ys):+.4f}] z[{min(zs):+.4f},{max(zs):+.4f}]")
print(f"  EVAL verts: {len(eval_mesh.vertices)}")
eval_obj.to_mesh_clear()

# Check shape keys influence
if helena.data.shape_keys:
    print(f"  shape key blocks:")
    for k in helena.data.shape_keys.key_blocks:
        print(f"    '{k.name}' value={k.value:.3f} relative_to={k.relative_key.name if k.relative_key else None}")
