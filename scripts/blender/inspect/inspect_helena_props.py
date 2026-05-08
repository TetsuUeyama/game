"""Helena armature の MustardUI custom properties を全列挙 (Hair armature と分離)."""
import bpy

for arm_name in ['Helena', 'Hair']:
    ARM = bpy.data.armatures.get(arm_name)
    if ARM is None:
        print(f"\n=== {arm_name} armature: NOT FOUND ===")
        continue
    print(f"\n{'=' * 70}")
    print(f"=== {arm_name} armature ===")
    print('=' * 70)

    # 全 keys
    print("\n--- All keys ---")
    for k in sorted(ARM.keys()):
        if k.startswith('_'): continue
        try:
            v = ARM[k]
            v_str = repr(v)[:120]
            print(f"  {k!r} = {v_str}")
        except Exception as e:
            print(f"  {k!r} = <err {e}>")

    # MustardUI_CustomProperties (typed)
    print("\n--- MustardUI_CustomProperties (typed) ---")
    cp = getattr(ARM, "MustardUI_CustomProperties", None)
    if cp is not None and len(cp) > 0:
        for i, p in enumerate(cp):
            name = getattr(p, 'name', '?')
            type_ = getattr(p, 'type', '?')
            section = getattr(p, 'section', '?')
            print(f"  [{i}] name={name!r} type={type_!r} section={section!r}")
    else:
        print("  (empty)")

    # MustardUI_CustomPropertiesOutfit
    print("\n--- MustardUI_CustomPropertiesOutfit (typed) ---")
    cpo = getattr(ARM, "MustardUI_CustomPropertiesOutfit", None)
    if cpo is not None and len(cpo) > 0:
        for i, p in enumerate(cpo):
            name = getattr(p, 'name', '?')
            type_ = getattr(p, 'type', '?')
            outfit = getattr(p, 'outfit', '?')
            print(f"  [{i}] name={name!r} type={type_!r} outfit={outfit!r}")
    else:
        print("  (empty)")
