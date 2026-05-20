"""Inspect mesh UV mapping and texture image state."""
import bpy
import sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
MESH_NAME = args[0] if args else "Casual Bra Mesh"
IMG_NAME = args[1] if len(args) > 1 else None

# Force-reload images
for img in bpy.data.images:
    try:
        if img.size[0] == 0 or img.size[1] == 0:
            img.reload()
    except Exception:
        pass

obj = bpy.data.objects.get(MESH_NAME)
if obj is None or obj.type != 'MESH':
    print(f"ERROR: {MESH_NAME} not found")
    sys.exit(1)

mesh = obj.data
print(f"=== {MESH_NAME} ===")
print(f"  vertices: {len(mesh.vertices)}, faces: {len(mesh.polygons)}, loops: {len(mesh.loops)}")
print(f"  materials: {[s.material.name if s.material else None for s in obj.material_slots]}")
print(f"  uv_layers: {[uv.name for uv in mesh.uv_layers]}")
if mesh.uv_layers:
    uv = mesh.uv_layers[0]
    print(f"  UV layer '{uv.name}' has {len(uv.data)} entries")
    # Sample first 10 loops
    for i in range(min(10, len(uv.data))):
        v = uv.data[i].uv
        print(f"    loop {i}: uv = ({v.x:.4f}, {v.y:.4f})")
    # Compute UV range
    xs = [uv.data[i].uv.x for i in range(len(uv.data))]
    ys = [uv.data[i].uv.y for i in range(len(uv.data))]
    print(f"    UV X range: [{min(xs):.4f}, {max(xs):.4f}]")
    print(f"    UV Y range: [{min(ys):.4f}, {max(ys):.4f}]")

# Find materials' textures
print("\n=== Material textures ===")
for s in obj.material_slots:
    mat = s.material
    if not mat: continue
    print(f"  Material: {mat.name}")
    if not mat.node_tree: continue
    for nd in mat.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image:
            img = nd.image
            print(f"    TEX_IMAGE node: '{img.name}'")
            print(f"      size: {tuple(img.size)}, colorspace: {img.colorspace_settings.name}")
            print(f"      filepath: {img.filepath}")
            print(f"      packed_file: {img.packed_file}")
            try:
                pixels = img.pixels[:]
                n = img.size[0] * img.size[1]
                if n > 0:
                    nonblack = 0
                    nonzero_alpha = 0
                    sample_color = None
                    for i in range(min(1000, n)):
                        si = i * 4
                        r, g, b, a = pixels[si], pixels[si+1], pixels[si+2], pixels[si+3]
                        if r > 0.01 or g > 0.01 or b > 0.01: nonblack += 1
                        if a > 0.01: nonzero_alpha += 1
                        if sample_color is None and (r > 0.01 or g > 0.01 or b > 0.01):
                            sample_color = (r, g, b, a)
                    print(f"      pixel scan (first 1000): non-black={nonblack}, non-zero alpha={nonzero_alpha}")
                    print(f"      first non-black sample: {sample_color}")
                    # center pixel
                    cx, cy = img.size[0] // 2, img.size[1] // 2
                    ci = (cy * img.size[0] + cx) * 4
                    print(f"      center pixel ({cx},{cy}): rgba=({pixels[ci]:.3f},{pixels[ci+1]:.3f},{pixels[ci+2]:.3f},{pixels[ci+3]:.3f})")
            except Exception as e:
                print(f"      pixels error: {e}")
