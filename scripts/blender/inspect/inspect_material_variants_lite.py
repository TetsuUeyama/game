"""軽量版: マテリアルノードツリーのみ解析 (画像データは触らない、メモリ節約)。

Usage:
  blender --background <blend> --python inspect_material_variants_lite.py 2>&1 | tail -N
"""
import bpy

# Disable image auto-loading / forget any packed data
try:
    for img in bpy.data.images:
        if getattr(img, 'packed_file', None):
            # unload packed data
            try: img.buffers_free()
            except Exception: pass
except Exception:
    pass

# === Material custom properties ===
print(f"\n=== Material custom properties ===")
props_count = 0
for mat in bpy.data.materials:
    keys = list(mat.keys())
    keys = [k for k in keys if k not in ('_RNA_UI', 'cycles')]
    if keys:
        props = {}
        for k in keys:
            try: props[k] = mat[k]
            except Exception: props[k] = '<unreadable>'
        print(f"  {mat.name}: {props}")
        props_count += 1
if props_count == 0:
    print("  (none)")

# === Object custom properties ===
print(f"\n=== Object custom properties ===")
obj_prop_count = 0
for obj in bpy.data.objects:
    if obj.type not in ('MESH', 'ARMATURE'): continue
    keys = [k for k in obj.keys() if k not in ('_RNA_UI', 'cycles')]
    if keys:
        props = {}
        for k in keys[:20]:
            try: props[k] = obj[k]
            except Exception: props[k] = '<unreadable>'
        print(f"  [{obj.type}] {obj.name}: {props}")
        obj_prop_count += 1
if obj_prop_count == 0:
    print("  (none)")

# === NodeGroups ===
print(f"\n=== NodeGroups ({len(bpy.data.node_groups)}) ===")
for ng in bpy.data.node_groups:
    # inputs 数 (変数サポート数の目安)
    inps = []
    try:
        # Blender 4.x: interface.items_tree
        if hasattr(ng, 'interface') and hasattr(ng.interface, 'items_tree'):
            for item in ng.interface.items_tree:
                if getattr(item, 'in_out', '') == 'INPUT':
                    inps.append(f"{item.name}:{item.socket_type}")
        elif hasattr(ng, 'inputs'):
            for inp in ng.inputs:
                inps.append(f"{inp.name}:{inp.type}")
    except Exception:
        pass
    print(f"  {ng.name}  inputs=[{', '.join(inps[:6])}]")

# === Key material node trees (first 15 interesting) ===
print(f"\n=== Node tree summary per material ===")
KEY_PATTERNS = ['body', 'armor', 'suit', 'hair', 'cape', 'belt', 'mask', 'earring', 'strap', 'legs', 'arm', 'shoulder']
shown = 0
for mat in bpy.data.materials:
    n = mat.name.lower()
    if not any(p in n for p in KEY_PATTERNS): continue
    if any(skip in n for skip in ('cs_',)): continue
    if not mat.use_nodes or not mat.node_tree: continue
    shown += 1
    if shown > 20: break
    print(f"\n  [{mat.name}]")
    for nd in mat.node_tree.nodes:
        t = nd.type
        if t in ('BSDF_PRINCIPLED', 'MIX_RGB', 'MIX', 'VALTORGB', 'VALUE', 'RGB',
                 'TEX_IMAGE', 'GROUP', 'HUE_SAT', 'BRIGHTCONTRAST', 'GAMMA', 'INVERT',
                 'ATTRIBUTE', 'VERTEX_COLOR'):
            extras = []
            if t == 'MIX' or t == 'MIX_RGB':
                bt = getattr(nd, 'blend_type', '?')
                extras.append(f"blend={bt}")
                fi = nd.inputs.get('Factor') or nd.inputs.get('Fac')
                if fi is not None:
                    if fi.is_linked: extras.append("Factor=[linked]")
                    else: extras.append(f"F={fi.default_value:.2f}")
            if t == 'VALUE':
                try: extras.append(f"v={nd.outputs[0].default_value:.2f}")
                except Exception: pass
            if t == 'RGB':
                try:
                    c = nd.outputs[0].default_value
                    extras.append(f"c=({c[0]:.2f},{c[1]:.2f},{c[2]:.2f})")
                except Exception: pass
            if t == 'VALTORGB':
                cr = getattr(nd, 'color_ramp', None)
                if cr: extras.append(f"ramp={len(cr.elements)}")
            if t == 'TEX_IMAGE':
                if nd.image: extras.append(f"img={nd.image.name}")
            if t == 'GROUP' and nd.node_tree:
                extras.append(f"g={nd.node_tree.name}")
            if t == 'HUE_SAT':
                extras.append("HSV adj")
            if t == 'ATTRIBUTE':
                try: extras.append(f"attr={nd.attribute_name}")
                except Exception: pass
            print(f"    {t:20s} '{nd.name}' {' '.join(extras)}")
