import bpy

TARGET_MATERIALS = ["QueenMarika_Body", "QueenMarika_Head", "QueenMarika_Dress_Necklace"]
TARGET_NODE_NAMES = ["Emission", "Tatoos", "Cracked", "Wet", "Blush"]

def describe_socket(sock):
    try:
        if hasattr(sock, "default_value"):
            v = sock.default_value
            try:
                v = list(v)
            except TypeError:
                pass
            return f"{sock.name!r}({sock.type}) default={v!r}"
        return f"{sock.name!r}({sock.type})"
    except Exception as e:
        return f"<err {e}>"

def find_links_from(node_tree, source_node):
    out = []
    for link in node_tree.links:
        if link.from_node == source_node:
            out.append(link)
    return out

def trace_downstream(node_tree, node, depth=0, visited=None, max_depth=6):
    if visited is None:
        visited = set()
    if node.name in visited or depth > max_depth:
        return
    visited.add(node.name)
    pad = "  " * depth
    print(f"{pad}- node {node.name!r} type={node.type} bl_idname={node.bl_idname}")
    if node.type == "GROUP" and node.node_tree:
        print(f"{pad}    (group: {node.node_tree.name!r})")
    for sock in node.outputs:
        print(f"{pad}    out {describe_socket(sock)}")
    links = find_links_from(node_tree, node)
    for link in links:
        print(f"{pad}    -> {link.to_node.name!r}.{link.to_socket.name!r}")
    for link in links:
        trace_downstream(node_tree, link.to_node, depth + 1, visited, max_depth)

def inspect_material(mat_name):
    mat = bpy.data.materials.get(mat_name)
    if mat is None:
        print(f"\n[Material '{mat_name}'] NOT FOUND")
        return
    print(f"\n{'='*70}\n[Material] {mat.name!r}\n{'='*70}")
    nt = mat.node_tree
    if nt is None:
        print("  (no node tree)")
        return
    for tname in TARGET_NODE_NAMES:
        node = nt.nodes.get(tname)
        if node is None:
            continue
        print(f"\n  >>> Tracing '{tname}' downstream <<<")
        trace_downstream(nt, node, depth=1)

def inspect_group(name):
    grp = bpy.data.node_groups.get(name)
    if grp is None:
        return False
    print(f"\n{'-'*70}\n[NodeGroup] {grp.name!r}\n{'-'*70}")
    print("  inputs:")
    for s in grp.interface.items_tree if hasattr(grp, "interface") else []:
        try:
            print(f"    {s.item_type} {s.in_out} {s.name!r} ({getattr(s, 'socket_type', '?')})")
        except Exception as e:
            print(f"    <err {e}>")
    print("  nodes:")
    for n in grp.nodes:
        print(f"    {n.bl_idname:30s} {n.name!r}")
    return True

def main():
    print("Blender file:", bpy.data.filepath)
    for mname in TARGET_MATERIALS:
        inspect_material(mname)

    print("\n\n--- Looking for any node group used by Emission paths ---")
    for mname in TARGET_MATERIALS:
        mat = bpy.data.materials.get(mname)
        if mat is None or mat.node_tree is None:
            continue
        for n in mat.node_tree.nodes:
            if n.type == "GROUP" and n.node_tree:
                groups_seen.add(n.node_tree.name)

    for g in sorted(groups_seen):
        inspect_group(g)

groups_seen = set()
main()
