"""partial library load: マテリアル/NodeGroup のみ読み込み (画像スキップでメモリ節約)。

Usage:
  blender --background --python inspect_material_variants_partial.py -- <blend>
"""
import bpy, sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
BLEND_PATH = args[0]

print(f"\n=== Partial load: {BLEND_PATH} ===")

# Start from factory settings (no images)
try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
except Exception as e:
    print(f"  (read_factory_settings failed: {e})")

# Load only materials & node_groups (no meshes, no images, no objects)
with bpy.data.libraries.load(BLEND_PATH, link=False) as (data_from, data_to):
    data_to.materials = list(data_from.materials)
    data_to.node_groups = list(data_from.node_groups)

print(f"  materials loaded: {len(bpy.data.materials)}")
print(f"  node_groups loaded: {len(bpy.data.node_groups)}")
print(f"  images (auto-referenced): {len(bpy.data.images)}")

# Material custom props
print(f"\n=== Material custom properties ===")
found = 0
for mat in bpy.data.materials:
    keys = [k for k in mat.keys() if k not in ('_RNA_UI', 'cycles')]
    if keys:
        props = {}
        for k in keys:
            try: props[k] = mat[k]
            except Exception: props[k] = '<unreadable>'
        print(f"  {mat.name}: {props}")
        found += 1
if found == 0: print("  (none)")

# NodeGroup interface (variants might be node group inputs)
print(f"\n=== NodeGroup interface (inputs) ===")
for ng in bpy.data.node_groups:
    inps = []
    try:
        if hasattr(ng, 'interface') and hasattr(ng.interface, 'items_tree'):
            for item in ng.interface.items_tree:
                if getattr(item, 'in_out', '') == 'INPUT':
                    val = ''
                    try:
                        if hasattr(item, 'default_value'):
                            dv = item.default_value
                            if hasattr(dv, '__len__'): val = f"={tuple(float(x) for x in dv)}"
                            else: val = f"={dv}"
                    except Exception: pass
                    inps.append(f"{item.name}:{item.socket_type}{val}")
        elif hasattr(ng, 'inputs'):
            for inp in ng.inputs:
                inps.append(f"{inp.name}:{inp.type}")
    except Exception: pass
    print(f"  {ng.name}:")
    for s in inps: print(f"    {s}")

# Material node tree summary
print(f"\n=== Material node trees ===")
KEY_PATTERNS = ['body', 'armor', 'suit', 'hair', 'cape', 'belt', 'mask', 'earring', 'strap']
for mat in bpy.data.materials:
    n = mat.name.lower()
    if not any(p in n for p in KEY_PATTERNS): continue
    if any(skip in n for skip in ('cs_',)): continue
    if not mat.use_nodes or not mat.node_tree: continue
    print(f"\n  [{mat.name}]")
    for nd in mat.node_tree.nodes:
        t = nd.type
        extras = []
        if t in ('MIX', 'MIX_RGB'):
            bt = getattr(nd, 'blend_type', '?'); extras.append(f"blend={bt}")
            fi = nd.inputs.get('Factor') or nd.inputs.get('Fac')
            if fi is not None:
                extras.append("F=linked" if fi.is_linked else f"F={fi.default_value:.2f}")
        elif t == 'VALUE':
            try: extras.append(f"v={nd.outputs[0].default_value:.3f}")
            except Exception: pass
        elif t == 'RGB':
            try:
                c = nd.outputs[0].default_value
                extras.append(f"c=({c[0]:.2f},{c[1]:.2f},{c[2]:.2f})")
            except Exception: pass
        elif t == 'VALTORGB':
            cr = getattr(nd, 'color_ramp', None)
            if cr: extras.append(f"ramp_elements={len(cr.elements)}")
        elif t == 'TEX_IMAGE':
            extras.append(f"img={nd.image.name if nd.image else '(none)'}")
        elif t == 'GROUP' and nd.node_tree:
            extras.append(f"g={nd.node_tree.name}")
        elif t == 'ATTRIBUTE':
            try: extras.append(f"attr={nd.attribute_name}")
            except Exception: pass
        elif t == 'HUE_SAT':
            # check Hue/Saturation/Value inputs
            for inp_name in ('Hue', 'Saturation', 'Value'):
                inp = nd.inputs.get(inp_name)
                if inp and not inp.is_linked:
                    extras.append(f"{inp_name}={inp.default_value:.2f}")
        if t in ('BSDF_PRINCIPLED', 'MIX', 'MIX_RGB', 'VALTORGB', 'VALUE', 'RGB',
                 'TEX_IMAGE', 'GROUP', 'HUE_SAT', 'ATTRIBUTE', 'VERTEX_COLOR',
                 'BRIGHTCONTRAST', 'GAMMA', 'INVERT'):
            print(f"    {t:16s} '{nd.name[:30]}' {' '.join(extras)}")

# Image name patterns (variant detection)
print(f"\n=== Image names (variant patterns) ===")
import re
by_base = {}
for img in bpy.data.images:
    nm = img.name
    base = re.sub(r'[._-](\d{1,3}|variant\d*|v\d+|[a-d])$', '', nm, flags=re.IGNORECASE)
    by_base.setdefault(base, []).append(nm)
for base, nms in sorted(by_base.items()):
    if len(nms) >= 2:
        print(f"  {base}:")
        for n in nms: print(f"    {n}")
