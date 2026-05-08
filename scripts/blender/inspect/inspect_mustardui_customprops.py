import bpy

# 'rig' を最優先、なければ MustardUI_RigSettings を持つ最初の armature、
# それでもなければ最初の armature を使う
ARM = bpy.data.armatures.get("rig")
if ARM is None:
    for a in bpy.data.armatures:
        if "MustardUI_RigSettings" in a.keys():
            ARM = a; break
if ARM is None and len(bpy.data.armatures) > 0:
    ARM = next(iter(bpy.data.armatures))
if ARM is None:
    print("no armature found"); raise SystemExit
print(f"Using armature: {ARM.name!r}")

print("="*70)
print("All custom properties on Armature 'rig' (raw)")
print("="*70)
for k in sorted(ARM.keys()):
    try:
        v = ARM[k]
    except Exception as e:
        v = f"<err {e}>"
    if "Mustard" in k or k.startswith("_"):
        # show MustardUI typed groups by listing their attributes
        try:
            obj = getattr(ARM, k, None)
        except Exception:
            obj = None
        print(f"\n[Armature.{k}]")
        if hasattr(v, "to_dict") or hasattr(v, "keys"):
            try:
                for kk in v.keys():
                    print(f"  {kk!r} = {v[kk]!r}")
            except Exception as e:
                print(f"  <err {e}>")
        else:
            print(f"  raw value = {v!r}")
    else:
        print(f"  {k!r} = {v!r}")

print("\n" + "="*70)
print("MustardUI_CustomProperties (typed)")
print("="*70)
cp = getattr(ARM, "MustardUI_CustomProperties", None)
if cp is not None:
    for i, p in enumerate(cp):
        attrs = {}
        for a in ("name", "rna_name", "path", "icon", "type", "section", "is_color",
                  "force_type", "subtype", "max_value", "min_value", "default_value",
                  "default_array", "array_length"):
            try:
                attrs[a] = getattr(p, a, None)
            except Exception as e:
                attrs[a] = f"<err {e}>"
        print(f"\n[{i}] name={attrs.get('name')!r} type={attrs.get('type')!r} section={attrs.get('section')!r}")
        for k, v in attrs.items():
            if k == "name": continue
            print(f"    {k}={v!r}")

print("\n" + "="*70)
print("MustardUI_CustomPropertiesOutfit (typed)")
print("="*70)
cpo = getattr(ARM, "MustardUI_CustomPropertiesOutfit", None)
if cpo is not None:
    for i, p in enumerate(cpo):
        attrs = {}
        for a in ("name", "rna_name", "path", "icon", "type", "outfit", "outfit_piece",
                  "is_color", "force_type", "subtype", "max_value", "min_value",
                  "default_value", "default_array", "array_length"):
            try:
                attrs[a] = getattr(p, a, None)
            except Exception as e:
                attrs[a] = f"<err {e}>"
        print(f"\n[{i}] name={attrs.get('name')!r} type={attrs.get('type')!r} outfit={attrs.get('outfit')!r}")
        for k, v in attrs.items():
            if k == "name": continue
            print(f"    {k}={v!r}")

print("\n" + "="*70)
print("Sections (MustardUI_RigSettings.body_custom_properties_sections etc.)")
print("="*70)
rs = getattr(ARM, "MustardUI_RigSettings", None)
if rs is not None:
    for attr_name in dir(rs):
        if attr_name.startswith("_"): continue
        try:
            v = getattr(rs, attr_name)
        except Exception:
            continue
        if hasattr(v, "__len__") and not isinstance(v, str):
            try:
                n = len(v)
                if n > 0 and "section" in attr_name.lower():
                    print(f"\n  {attr_name} ({n} items):")
                    for it in v:
                        sub = {a: getattr(it, a, None) for a in ("name", "icon", "collapsed") if hasattr(it, a)}
                        print(f"    {sub}")
            except Exception:
                pass

print("\n" + "="*70)
print("Color-typed custom properties (skin/outfit color sliders)")
print("="*70)
def is_color_like(p):
    try:
        if getattr(p, "is_color", False): return True
        if getattr(p, "subtype", "") in ("COLOR", "COLOR_GAMMA"): return True
        if getattr(p, "array_length", 0) in (3, 4): return True
        return False
    except Exception:
        return False

for label, lst in [("Body", getattr(ARM, "MustardUI_CustomProperties", []) or []),
                   ("Outfit", getattr(ARM, "MustardUI_CustomPropertiesOutfit", []) or [])]:
    for p in lst:
        if is_color_like(p):
            print(f"  [{label}] name={getattr(p, 'name', None)!r} subtype={getattr(p, 'subtype', None)!r} "
                  f"array_length={getattr(p, 'array_length', None)!r} default_array={getattr(p, 'default_array', None)!r} "
                  f"path={getattr(p, 'path', None)!r}")
