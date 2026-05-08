import bpy

def short(sock):
    if sock.is_linked:
        link = sock.links[0]
        info = f"<- {link.from_node.name!r}({link.from_node.type}).{link.from_socket.name!r}"
        if link.from_node.type == "TEX_IMAGE":
            img = link.from_node.image
            img_name = img.name if img else None
            info += f" img={img_name!r}"
        return info
    if hasattr(sock, "default_value"):
        v = sock.default_value
        try: v = list(v)
        except TypeError: pass
        return f"= {v!r}"
    return "(?)"

def dump_node(mat_name, node_name, label=""):
    mat = bpy.data.materials.get(mat_name)
    if mat is None or mat.node_tree is None:
        print(f"[{mat_name}] not found"); return
    n = mat.node_tree.nodes.get(node_name)
    if n is None:
        print(f"[{mat_name}.{node_name}] not found"); return
    bt = getattr(n, "blend_type", "")
    print(f"\n{label} [{mat_name}] {node_name!r} type={n.type} blend={bt}")
    for s in n.inputs:
        print(f"  in {s.name!r}({s.type})  {short(s)}")
    for s in n.outputs:
        if s.is_linked:
            for link in s.links:
                print(f"  out {s.name!r} -> {link.to_node.name!r}.{link.to_socket.name!r}")

print("="*70)
print("BODY: Tatoos chain (Base Color path)")
print("="*70)
for nm in ["Mix.001", "Mix", "Mix.005", "Mix.003", "Mix.004", "Mix.008", "Mix.002"]:
    dump_node("QueenMarika_Body", nm)

print("\n" + "="*70)
print("BODY: Wet chain")
print("="*70)
for nm in ["Group.001", "Group.002", "Mix.006"]:
    dump_node("QueenMarika_Body", nm)

print("\n" + "="*70)
print("HEAD: Blush chain")
print("="*70)
for nm in ["Mix.004", "Mix.003", "Mix", "Mix.007"]:
    dump_node("QueenMarika_Head", nm)

print("\n" + "="*70)
print("WetnessMix node group internals")
print("="*70)
grp = bpy.data.node_groups.get("WetnessMix")
if grp is not None:
    print("nodes:")
    for n in grp.nodes:
        bt = getattr(n, "blend_type", "")
        op = getattr(n, "operation", "")
        print(f"  {n.bl_idname:30s} {n.name!r}  blend={bt} op={op}")
    print("links:")
    for link in grp.links:
        print(f"  {link.from_node.name!r}.{link.from_socket.name!r} -> {link.to_node.name!r}.{link.to_socket.name!r}")

print("\n" + "="*70)
print("List image textures used by Body/Head materials")
print("="*70)
seen = set()
for mname in ["QueenMarika_Body", "QueenMarika_Head"]:
    mat = bpy.data.materials.get(mname)
    if mat is None or mat.node_tree is None: continue
    print(f"\n[{mname}]")
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            print(f"  {n.name!r} image={n.image.name!r}")
