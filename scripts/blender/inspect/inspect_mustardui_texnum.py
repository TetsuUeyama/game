import bpy

# Texture Number は driver で何かに繋がっているはず
ARM = bpy.data.armatures.get("rig")
print("rig['Texture Number'] =", ARM.get("Texture Number"))

# 全マテリアルの全 driver を確認し、'Texture Number' を参照しているものを列挙
print("\n--- Drivers referencing 'Texture Number' ---")
for mat in bpy.data.materials:
    if mat.node_tree is None: continue
    ad = mat.node_tree.animation_data
    if ad is None: continue
    for fcu in ad.drivers:
        for var in fcu.driver.variables:
            for tgt in var.targets:
                dp = tgt.data_path or ""
                if "Texture Number" in dp or "Texture_Number" in dp:
                    print(f"  mat={mat.name!r} fcurve_dp={fcu.data_path!r} target_id={tgt.id!r} target_dp={dp!r}")

# Dress 系マテリアルの構造を覗く
print("\n--- Dress / Outfit related materials ---")
for mat in bpy.data.materials:
    if any(t in mat.name for t in ["Dress", "Outfit", "Bikini", "Default"]):
        print(f"  {mat.name!r}")

# Dress マテリアルの Base Color に何が繋がっているか
for name in ["QueenMarika_Dress", "QueenMarika_Dress_Necklace", "QueenMarika_Dress_Texture_1",
             "QueenMarika_Outfit", "Outfit_Default"]:
    mat = bpy.data.materials.get(name)
    if mat is None or mat.node_tree is None: continue
    print(f"\n[{mat.name}] Image textures:")
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            print(f"  {n.name!r} image={n.image.name!r}")
    print(f"[{mat.name}] Drivers:")
    ad = mat.node_tree.animation_data
    if ad is not None:
        for fcu in ad.drivers:
            for var in fcu.driver.variables:
                for tgt in var.targets:
                    print(f"    {fcu.data_path!r} <- {tgt.data_path!r}")

# 全マテリアル列挙（簡潔）
print("\n--- All materials ---")
for m in bpy.data.materials:
    print(f"  {m.name!r}")
