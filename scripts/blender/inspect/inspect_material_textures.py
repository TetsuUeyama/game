"""指定 material の node_tree 内の全 TEX_IMAGE node を列挙."""
import bpy

TARGET_MATS = ['CyberpunkElf_Body', 'CyberpunkElf_Head', 'CyberpunkElf_Eyes', 'CyberpunkElf_Hair', 'CyberpunkElf_Suit_01', 'CyberpunkElf_Suit_02',
               '40_outfit_base_a_0.1_16_16-1', '40_outfit_base_c_0.1_16_16-4', '40_outfit_base_d_0.1_16_16-1',
               '40_outfit_base_e_0.1_16_16-1', '40_outfit_base_g_0.1_16_16-1',
               '41_body_normal_base_d_0.1_16_16-2', '41_body_normal_base_d_0.1_16_16-3']

print("=" * 70)
for mat_name in TARGET_MATS:
    mat = bpy.data.materials.get(mat_name)
    if not mat:
        print(f"\n[{mat_name}] NOT FOUND")
        continue
    print(f"\n[{mat_name}]")
    if not mat.node_tree:
        print("  (no node_tree)")
        continue
    for nd in mat.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image:
            w, h = nd.image.size
            print(f"  TOP   {nd.image.name!r:60s} {w}x{h}")
        if nd.type == 'GROUP' and nd.node_tree:
            for inner in nd.node_tree.nodes:
                if inner.type == 'TEX_IMAGE' and inner.image:
                    w, h = inner.image.size
                    print(f"  GROUP/{nd.name} > {inner.image.name!r:60s} {w}x{h}")
