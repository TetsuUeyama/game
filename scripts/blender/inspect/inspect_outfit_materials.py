"""Outfit mesh の material / texture 状態を調べる。
voxelize_mustardui が色をどう採れるか診断する。

Usage:
  blender --background <blend> --python inspect_outfit_materials.py -- <mesh1> <mesh2> ...
"""
import bpy
import sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
MESHES = args if args else []

print(f"\n=== inspect_outfit_materials ===")
print(f"  blend: {bpy.data.filepath}")

for mname in MESHES:
    obj = bpy.data.objects.get(mname)
    if obj is None:
        print(f"\n[{mname}] NOT FOUND")
        continue
    print(f"\n[{mname}] verts={len(obj.data.vertices)} mat_slots={len(obj.material_slots)}")
    for slot_idx, slot in enumerate(obj.material_slots):
        m = slot.material
        if m is None:
            print(f"  slot {slot_idx}: NO MATERIAL")
            continue
        print(f"  slot {slot_idx}: '{m.name}'  use_nodes={m.use_nodes}")
        # diffuse_color (legacy)
        try:
            dc = m.diffuse_color
            print(f"    diffuse_color: ({dc[0]:.2f}, {dc[1]:.2f}, {dc[2]:.2f}, {dc[3]:.2f})")
        except Exception:
            pass
        if not m.use_nodes or m.node_tree is None:
            continue
        # Find Principled BSDF + image textures
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                bc = n.inputs.get("Base Color")
                if bc is not None:
                    if bc.is_linked:
                        src = bc.links[0].from_node
                        if src.type == "TEX_IMAGE":
                            img = src.image
                            sz = img.size if img else (0, 0)
                            packed = bool(img.packed_file) if img else False
                            print(f"    BaseColor <- TEX_IMAGE: '{img.name if img else None}' "
                                  f"size={sz[0]}x{sz[1]} packed={packed}")
                        else:
                            print(f"    BaseColor <- {src.type} '{src.name}'")
                    else:
                        v = bc.default_value
                        print(f"    BaseColor const: ({v[0]:.2f}, {v[1]:.2f}, {v[2]:.2f}, {v[3]:.2f})")
            elif n.type == "TEX_IMAGE":
                img = n.image
                if img is None:
                    continue
                sz = img.size
                packed = bool(img.packed_file)
                # Is connected to Base Color anywhere?
                used_for_basecolor = False
                for sock in n.outputs:
                    for link in sock.links:
                        if link.to_socket.name == "Base Color":
                            used_for_basecolor = True
                print(f"    TEX_IMAGE node '{n.name}': image='{img.name}' "
                      f"size={sz[0]}x{sz[1]} packed={packed} basecolor={used_for_basecolor}")

print("\n=== DONE ===")
