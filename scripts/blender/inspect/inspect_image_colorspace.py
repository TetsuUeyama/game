"""Image の colorspace と中央 1px の RGB 値を表示。
voxelize の色サンプリングが linear/sRGB のどちらを返すか診断する。

Usage:
  blender --background <blend> --python inspect_image_colorspace.py -- <image_name1> <image_name2> ...
"""
import bpy
import sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

print(f"\n=== inspect_image_colorspace ===")
for needle in args:
    found = []
    for img in bpy.data.images:
        if needle.lower() in img.name.lower():
            found.append(img)
    if not found:
        print(f"\n[{needle}] no match")
        continue
    for img in found[:3]:
        cs = img.colorspace_settings.name
        w, h = img.size
        if w == 0 or h == 0:
            print(f"  '{img.name}': cs={cs} size={w}x{h} EMPTY")
            continue
        # Sample center pixel
        cx, cy = w // 2, h // 2
        try:
            pix = img.pixels[:]
            i = (cy * w + cx) * 4
            r, g, b, a = pix[i], pix[i+1], pix[i+2], pix[i+3]
            r255 = int(r * 255); g255 = int(g * 255); b255 = int(b * 255)
            print(f"  '{img.name}': cs={cs} size={w}x{h} center=("
                  f"{r:.3f},{g:.3f},{b:.3f}) -> rgb({r255},{g255},{b255})")
        except Exception as e:
            print(f"  '{img.name}': cs={cs} size={w}x{h} read error: {e}")

print("\n=== DONE ===")
