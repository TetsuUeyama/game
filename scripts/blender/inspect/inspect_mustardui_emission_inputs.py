import bpy

def describe_input(sock):
    info = f"{sock.name!r}({sock.type})"
    if sock.is_linked:
        link = sock.links[0]
        info += f"  <- {link.from_node.name!r}({link.from_node.type}).{link.from_socket.name!r}"
        if link.from_node.type == "TEX_IMAGE":
            img = link.from_node.image
            img_name = img.name if img else None
            info += f"  image={img_name!r}"
    else:
        if hasattr(sock, "default_value"):
            v = sock.default_value
            try:
                v = list(v)
            except TypeError:
                pass
            info += f"  default={v!r}"
    return info

def inspect_node(mat_name, node_name):
    mat = bpy.data.materials.get(mat_name)
    if mat is None or mat.node_tree is None:
        print(f"[{mat_name}] not found")
        return
    n = mat.node_tree.nodes.get(node_name)
    if n is None:
        print(f"[{mat_name}.{node_name}] not found")
        return
    print(f"\n[{mat_name}] node {node_name!r} type={n.type} bl_idname={n.bl_idname}")
    if hasattr(n, "blend_type"):
        print(f"  blend_type={n.blend_type}")
    if hasattr(n, "data_type"):
        print(f"  data_type={n.data_type}")
    print("  inputs:")
    for s in n.inputs:
        print(f"    {describe_input(s)}")

def inspect_principled(mat_name):
    mat = bpy.data.materials.get(mat_name)
    if mat is None or mat.node_tree is None:
        return
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            print(f"\n[{mat_name}] Principled BSDF inputs:")
            for s in n.inputs:
                if s.name in ("Emission Color", "Emission Strength", "Base Color"):
                    print(f"  {describe_input(s)}")

print("="*60)
inspect_principled("QueenMarika_Body")
inspect_node("QueenMarika_Body", "Mix.002")

print("="*60)
inspect_principled("QueenMarika_Head")
inspect_node("QueenMarika_Head", "Mix.006")

print("="*60)
inspect_principled("QueenMarika_Dress_Necklace")
