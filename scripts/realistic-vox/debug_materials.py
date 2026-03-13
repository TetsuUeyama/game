"""Debug material node trees to understand why texture tracing fails.

Usage:
  blender --background --python debug_materials.py -- <input.blend>
"""
import bpy
import sys

argv = sys.argv
sep = argv.index("--") if "--" in argv else len(argv)
script_args = argv[sep + 1:]
INPUT_PATH = script_args[0]

ext = INPUT_PATH.lower().rsplit('.', 1)[-1]
if ext == 'fbx':
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext in ('glb', 'gltf'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=INPUT_PATH)

# Disable MASK modifiers
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    for mod in obj.modifiers:
        if mod.type == 'MASK' and mod.show_viewport:
            mod.show_viewport = False

bpy.context.view_layer.update()

# Collect unique materials from visible meshes
seen_mats = set()
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or not obj.visible_get():
        continue
    for mat in obj.data.materials:
        if mat and mat.name not in seen_mats:
            seen_mats.add(mat.name)

print("\n" + "=" * 70)
print("MATERIAL NODE TREE DEBUG")
print("=" * 70)

for mat_name in sorted(seen_mats):
    mat = bpy.data.materials.get(mat_name)
    if not mat or not mat.use_nodes:
        print(f"\n--- {mat_name}: no nodes ---")
        continue

    print(f"\n--- {mat_name} ---")
    nt = mat.node_tree

    # Find Principled BSDF
    principled = None
    for nd in nt.nodes:
        if nd.type == 'BSDF_PRINCIPLED':
            principled = nd
            break

    if not principled:
        print("  No Principled BSDF found")
        print(f"  Nodes: {[n.type + '(' + n.name + ')' for n in nt.nodes]}")
        continue

    bc = principled.inputs.get('Base Color')
    if not bc:
        print("  No Base Color input")
        continue

    if not bc.is_linked:
        c = bc.default_value
        print(f"  Base Color: solid ({c[0]:.3f}, {c[1]:.3f}, {c[2]:.3f})")
        continue

    # Trace the chain from Base Color
    def trace_chain(node_tree, node, depth=0):
        indent = "  " * (depth + 1)
        print(f"{indent}Node: {node.type} ({node.name})")

        if node.type == 'TEX_IMAGE':
            if node.image:
                print(f"{indent}  Image: {node.image.name} ({node.image.size[0]}x{node.image.size[1]})")
                print(f"{indent}  Filepath: {node.image.filepath}")
                print(f"{indent}  Packed: {node.image.packed_file is not None}")
            else:
                print(f"{indent}  No image loaded")
            return

        if node.type == 'GROUP' and node.node_tree:
            gt = node.node_tree
            print(f"{indent}  Group: {gt.name}")
            print(f"{indent}  Inputs: {[(i, inp.name, inp.type) for i, inp in enumerate(node.inputs)]}")
            # Show which inputs are linked
            for i, inp in enumerate(node.inputs):
                if inp.is_linked:
                    src = inp.links[0].from_node
                    print(f"{indent}  Input[{i}] '{inp.name}' <- {src.type}({src.name})")
                    trace_chain(node_tree, src, depth + 1)
            # Find group output
            for gn in gt.nodes:
                if gn.type == 'GROUP_OUTPUT':
                    print(f"{indent}  GroupOutput inputs: {[(i, inp.name) for i, inp in enumerate(gn.inputs)]}")
                    for i, inp in enumerate(gn.inputs):
                        if inp.is_linked:
                            gsrc = inp.links[0].from_node
                            print(f"{indent}  GroupOut[{i}] <- {gsrc.type}({gsrc.name})")
                            trace_chain(gt, gsrc, depth + 2)
            return

        if node.type in ('MIX', 'MIX_RGB'):
            bt = getattr(node, 'blend_type', 'MIX')
            print(f"{indent}  Blend: {bt}")

        if node.type == 'SEPARATE_COLOR':
            print(f"{indent}  Mode: {getattr(node, 'mode', '?')}")

        # Trace all linked inputs
        for inp in node.inputs:
            if inp.is_linked:
                src = inp.links[0].from_node
                src_socket = inp.links[0].from_socket
                print(f"{indent}  '{inp.name}' <- {src.type}({src.name}).{src_socket.name}")
                trace_chain(node_tree, src, depth + 1)
            else:
                val = inp.default_value
                if hasattr(val, '__len__') and len(val) >= 3:
                    print(f"{indent}  '{inp.name}' = ({val[0]:.3f}, {val[1]:.3f}, {val[2]:.3f})")
                elif hasattr(val, '__float__'):
                    print(f"{indent}  '{inp.name}' = {float(val):.3f}")

    # Find what's linked to Base Color
    link = bc.links[0]
    print(f"  Base Color <- {link.from_node.type}({link.from_node.name}).{link.from_socket.name}")
    trace_chain(nt, link.from_node, 1)

print("\n" + "=" * 70)
