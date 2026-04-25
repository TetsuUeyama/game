"""Eyes メッシュのマテリアル構成を調査する。"""
import bpy
import sys

target_name = "Queen Marika Eyes"
target = None
for o in bpy.data.objects:
    if o.name == target_name and o.type == 'MESH':
        target = o; break
if not target:
    print(f"ERROR: mesh '{target_name}' not found"); sys.exit(1)

print(f"\n=== {target.name} ===")
print(f"  verts: {len(target.data.vertices)}")
print(f"  tris: {len(target.data.polygons)}")
print(f"  material_slots: {len(target.material_slots)}")

for si, slot in enumerate(target.material_slots):
    mat = slot.material
    if not mat:
        print(f"\n  slot[{si}]: (empty)")
        continue
    print(f"\n  slot[{si}]: {mat.name}  use_nodes={mat.use_nodes}")
    # テクスチャノード探索
    if mat.use_nodes and mat.node_tree:
        for nd in mat.node_tree.nodes:
            if nd.type == 'BSDF_PRINCIPLED':
                bc = nd.inputs.get('Base Color')
                if bc:
                    if bc.is_linked:
                        src = bc.links[0].from_node
                        print(f"      BSDF Base Color linked to: {src.type} '{src.name}'")
                        if src.type == 'TEX_IMAGE' and src.image:
                            print(f"        -> image: {src.image.name} ({src.image.size[0]}x{src.image.size[1]})  filepath={src.image.filepath}")
                    else:
                        c = bc.default_value
                        print(f"      BSDF Base Color flat: ({c[0]:.2f}, {c[1]:.2f}, {c[2]:.2f})")
            elif nd.type == 'TEX_IMAGE' and nd.image:
                print(f"      TEX_IMAGE '{nd.name}': {nd.image.name} ({nd.image.size[0]}x{nd.image.size[1]})  fp={nd.image.filepath}")
            elif nd.type == 'GROUP':
                print(f"      GROUP '{nd.name}': tree={nd.node_tree.name if nd.node_tree else '?'}")

# ポリゴンごとの material_index 分布
mi_hist = {}
for p in target.data.polygons:
    mi_hist[p.material_index] = mi_hist.get(p.material_index, 0) + 1
print(f"\n  polygon material_index histogram:")
for mi in sorted(mi_hist.keys()):
    slot_name = target.material_slots[mi].material.name if mi < len(target.material_slots) and target.material_slots[mi].material else '(empty)'
    print(f"    slot[{mi}] '{slot_name}': {mi_hist[mi]} polys")
