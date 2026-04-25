"""Blend ファイルのマテリアル・テクスチャ構造と色バリアント仕組みを調査する。

色バリアントの存在を検出するため、以下を出力:
  1. 全マテリアル一覧と各マテリアルの種別
  2. マテリアルの custom properties (`mat["key"]` 形式のユーザー設定)
  3. BSDF Base Color に繋がるノードツリーの要約 (Mix/MixRGB/ColorRamp/Math/Value)
  4. マテリアル内の "variant"/"tint"/"color_ramp"/"mix_factor" 的ノード値
  5. Image Texture で `variant_[1-4]` や `.001/.002/.003` 命名違いがあるか
  6. オブジェクトの custom properties

Usage:
  blender --background <blend> --python inspect_material_variants.py 2>&1 | tail -N
"""
import bpy

def show_node_tree(mat, depth=0):
    if not mat.use_nodes or not mat.node_tree: return
    # principled BSDF の Base Color を辿る
    bsdf = None
    for nd in mat.node_tree.nodes:
        if nd.type == 'BSDF_PRINCIPLED': bsdf = nd; break
    if not bsdf:
        # fallback: 全 Mix / ColorRamp / Value ノード列挙
        for nd in mat.node_tree.nodes:
            if nd.type in ('MIX', 'MIX_RGB', 'VALUE', 'RGB', 'VALTORGB', 'TEX_IMAGE'):
                print(f"    {nd.type:12s} '{nd.name}'", end='')
                if nd.type in ('VALUE',):
                    try: print(f" value={nd.outputs[0].default_value:.3f}")
                    except Exception: print()
                elif nd.type == 'TEX_IMAGE' and nd.image:
                    print(f" image={nd.image.name}")
                else:
                    print()
        return
    # BSDF の Base Color を辿る
    bc = bsdf.inputs.get('Base Color')
    if bc is None: return
    def trace(node, prefix='    -> '):
        if not node: return
        info = f"{node.type} '{node.name}'"
        extras = []
        if node.type in ('MIX', 'MIX_RGB'):
            bt = getattr(node, 'blend_type', '?')
            extras.append(f"blend={bt}")
            fi = node.inputs.get('Factor') or node.inputs.get('Fac')
            if fi is not None:
                if fi.is_linked: extras.append("Factor=[linked]")
                else: extras.append(f"Factor={fi.default_value:.3f}")
        if node.type == 'VALUE':
            try: extras.append(f"value={node.outputs[0].default_value:.3f}")
            except Exception: pass
        if node.type == 'RGB':
            try:
                c = node.outputs[0].default_value
                extras.append(f"color=({c[0]:.2f},{c[1]:.2f},{c[2]:.2f})")
            except Exception: pass
        if node.type == 'TEX_IMAGE' and node.image:
            extras.append(f"image={node.image.name}")
        if node.type == 'VALTORGB':
            cr = getattr(node, 'color_ramp', None)
            if cr: extras.append(f"ramp_elements={len(cr.elements)}")
        if node.type == 'GROUP' and node.node_tree:
            extras.append(f"tree={node.node_tree.name}")
        print(f"{prefix}{info}  {' '.join(extras)}")
    # 直接 Base Color に繋がるノードを辿る
    if bc.is_linked:
        print(f"    BSDF Base Color linked:")
        for lk in mat.node_tree.links:
            if lk.to_node == bsdf and lk.to_socket.name == 'Base Color':
                trace(lk.from_node)
                # 一段深く
                for lk2 in mat.node_tree.links:
                    if lk2.to_node == lk.from_node:
                        trace(lk2.from_node, prefix='       * ')
    else:
        c = bc.default_value
        print(f"    BSDF Base Color FLAT: ({c[0]:.3f}, {c[1]:.3f}, {c[2]:.3f})")

# === マテリアル一覧 ===
print(f"\n=== All Materials ({len(bpy.data.materials)}) ===")
interesting = []
for mat in bpy.data.materials:
    n = mat.name.lower()
    # "variant", "color", "tint", "01"-"04" 等を検出
    if any(k in n for k in ('variant', 'color', 'tint', '_01', '_02', '_03', '_04', 'a_', 'b_', 'c_', 'd_')):
        interesting.append(mat.name)

print(f"  interesting-named materials: {len(interesting)}")
for n in interesting[:50]:
    print(f"    {n}")

# === 全 material custom properties ===
print(f"\n=== Material custom properties ===")
props_count = 0
for mat in bpy.data.materials:
    props = {k: mat[k] for k in mat.keys() if k not in ('_RNA_UI', 'cycles')}
    if props:
        print(f"  {mat.name}: {props}")
        props_count += 1
if props_count == 0:
    print("  (none)")

# === 主要 body/衣装マテリアルのノードツリー ===
print(f"\n=== Key materials: node tree ===")
KEY_PATTERNS = ['body', 'armor', 'suit', 'hair', 'cape', 'belt', 'skin', 'cloth']
for mat in bpy.data.materials:
    n = mat.name.lower()
    if not any(p in n for p in KEY_PATTERNS): continue
    if any(skip in n for skip in ('cs_', 'widget')): continue
    print(f"\n  [{mat.name}]")
    show_node_tree(mat)

# === Image list (variant patterns) ===
print(f"\n=== Images (variant patterns) ===")
images_by_base = {}
for img in bpy.data.images:
    nm = img.name
    import re
    base = re.sub(r'[._](\d{1,3}|[a-d]|variant\d*)$', '', nm, flags=re.IGNORECASE)
    images_by_base.setdefault(base, []).append(nm)
for base, nms in images_by_base.items():
    if len(nms) >= 2:
        print(f"  {base}:")
        for n in nms[:8]: print(f"    {n}")

# === Mesh object custom properties (variant select?) ===
print(f"\n=== Object custom properties (variant-like) ===")
obj_props_count = 0
for obj in bpy.data.objects:
    if obj.type not in ('MESH', 'ARMATURE'): continue
    props = {k: obj[k] for k in obj.keys() if k not in ('_RNA_UI', 'cycles')}
    if props:
        print(f"  [{obj.type}] {obj.name}: {props}")
        obj_props_count += 1
if obj_props_count == 0:
    print("  (none)")

# === Armature custom props (for bone-driven color select via drivers) ===
print(f"\n=== Armature bone custom properties ===")
bone_prop_count = 0
for obj in bpy.data.objects:
    if obj.type != 'ARMATURE': continue
    for pb in obj.pose.bones:
        props = {k: pb[k] for k in pb.keys() if k not in ('_RNA_UI', 'cycles')}
        if props:
            if bone_prop_count < 30:
                print(f"  {obj.name}/{pb.name}: {props}")
            bone_prop_count += 1
print(f"  (total bones with props: {bone_prop_count})")

# === NodeGroups (variant groups?) ===
print(f"\n=== NodeGroup names (potentially color variants) ===")
for ng in bpy.data.node_groups:
    n = ng.name
    print(f"  {n}")
