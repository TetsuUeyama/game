"""Helena_Final_Public.blend の全 outfit mesh の vertex groups と armature deform bones を一覧。

Bone mapping JSON 拡張のための情報収集。
"""
import bpy

OUTFITS = [
    ("bodysuit",         "GCC DOA Outfit Bodysuit Mesh"),
    ("dark_prison_a",    "GCC DOA Outfit Dark Prison A Mesh"),
    ("dark_prison_b",    "GCC DOA Outfit Dark Prison B Mesh"),
    ("rs_panties",       "GCC DOA Outfit Rise and Shine Blouse Panties Mesh"),
    ("rs_shirt_normal",  "GCC DOA Outfit Rise and Shine Blouse Shirt Normal Mesh"),
    ("rs_shirt_nude",    "GCC DOA Outfit Rise and Shine Blouse Shirt Nude Mesh"),
    ("qipao",            "Qipao Mesh"),
    ("qipao_panty",      "Qipao Panty Mesh"),
    ("qipao_shoe",       "Qipao Shoe Mesh"),
    ("qipao_sock",       "Qipao Sock Mesh"),
    ("hair",             "Hair Mesh"),
    ("eyelashes",        "Eyelashes"),
]

print("\n=== Helena armature deform bones (full list) ===")
arm = bpy.data.objects.get("Helena")
if arm:
    deform_bones = [b.name for b in arm.data.bones if b.use_deform]
    print(f"  total deform: {len(deform_bones)}")
    for n in sorted(deform_bones):
        print(f"    {n}")

print("\n\n=== Outfit vertex groups ===")
all_used_bones = set()
for key, mesh_name in OUTFITS:
    o = bpy.data.objects.get(mesh_name)
    if not o:
        print(f"\n--- {key} ({mesh_name}) NOT FOUND ---")
        continue
    print(f"\n--- {key} ({mesh_name}) ---")
    print(f"  verts: {len(o.data.vertices)}, vgroups: {len(o.vertex_groups)}")
    for vg in o.vertex_groups:
        print(f"    {vg.name}")
        all_used_bones.add(vg.name)

print("\n\n=== All unique bones used across outfits ===")
for n in sorted(all_used_bones):
    print(f"  {n}")
