import bpy
import sys

TARGET_KEYS = ["Tatoos", "Tattoos", "Cracked", "Wet", "放射", "Emission", "Blush"]

def dump_id_props(obj, prefix=""):
    keys = list(obj.keys())
    if not keys:
        return
    for k in keys:
        try:
            v = obj[k]
        except Exception as e:
            v = f"<error: {e}>"
        print(f"  {prefix}[{k!r}] = {v!r}")

def find_driver_targets():
    print("\n--- Drivers referencing target keys ---")
    for mat in bpy.data.materials:
        if mat.node_tree is None:
            continue
        ad = mat.node_tree.animation_data
        if ad is None or ad.drivers is None:
            continue
        for fcu in ad.drivers:
            drv = fcu.driver
            for var in drv.variables:
                for tgt in var.targets:
                    dp = tgt.data_path or ""
                    if any(k in dp for k in TARGET_KEYS):
                        print(f"  material={mat.name!r} dp={fcu.data_path!r} var={var.name!r} target_id={tgt.id!r} target_dp={dp!r}")

def main():
    print("=" * 60)
    print("Blender file:", bpy.data.filepath)
    print("=" * 60)

    print("\n--- All Objects ---")
    for o in bpy.data.objects:
        print(f"  {o.type:10s} {o.name!r}  parent={o.parent.name if o.parent else None}")

    print("\n--- Custom properties on each object (non-empty) ---")
    for o in bpy.data.objects:
        keys = [k for k in o.keys() if k != "_RNA_UI"]
        if not keys:
            continue
        print(f"\n[Object] {o.name!r} ({o.type})")
        dump_id_props(o)

    print("\n--- Custom properties on Armatures (data) ---")
    for a in bpy.data.armatures:
        keys = [k for k in a.keys() if k != "_RNA_UI"]
        if not keys:
            continue
        print(f"\n[Armature] {a.name!r}")
        dump_id_props(a)

    print("\n--- Custom properties on Meshes (data) ---")
    for m in bpy.data.meshes:
        keys = [k for k in m.keys() if k != "_RNA_UI"]
        if not keys:
            continue
        print(f"\n[Mesh] {m.name!r}")
        dump_id_props(m)

    print("\n--- Search for target effect keys anywhere ---")
    found = []
    for o in bpy.data.objects:
        for k in o.keys():
            if any(t.lower() in k.lower() or k == t for t in TARGET_KEYS):
                try:
                    v = o[k]
                except Exception:
                    v = "<err>"
                found.append(("Object", o.name, k, v))
    for a in bpy.data.armatures:
        for k in a.keys():
            if any(t.lower() in k.lower() or k == t for t in TARGET_KEYS):
                try:
                    v = a[k]
                except Exception:
                    v = "<err>"
                found.append(("Armature", a.name, k, v))
    for m in bpy.data.meshes:
        for k in m.keys():
            if any(t.lower() in k.lower() or k == t for t in TARGET_KEYS):
                try:
                    v = m[k]
                except Exception:
                    v = "<err>"
                found.append(("Mesh", m.name, k, v))
    if not found:
        print("  (no exact-match target keys found in custom properties)")
    else:
        for kind, name, k, v in found:
            print(f"  {kind:8s} {name!r}  [{k!r}] = {v!r}")

    find_driver_targets()

    print("\n--- MustardUI presence check ---")
    has_mustardui = False
    for o in bpy.data.objects:
        for k in o.keys():
            if "mustard" in k.lower() or "MustardUI" in k:
                has_mustardui = True
                print(f"  Object {o.name!r} key {k!r}")
    for a in bpy.data.armatures:
        for k in a.keys():
            if "mustard" in k.lower() or "MustardUI" in k:
                has_mustardui = True
                print(f"  Armature {a.name!r} key {k!r}")
        if hasattr(a, "MustardUI_RigSettings"):
            print(f"  Armature {a.name!r} has typed MustardUI_RigSettings")
            has_mustardui = True
    if not has_mustardui:
        print("  (MustardUI tags not detected - addon may not be enabled)")

    print("\n--- Body mesh modifiers/materials ---")
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        if "body" not in o.name.lower():
            continue
        print(f"\n[BodyCandidate] {o.name!r}")
        print("  Modifiers:")
        for m in o.modifiers:
            print(f"    {m.type:20s} {m.name!r}")
        print("  Materials:")
        for slot in o.material_slots:
            mat = slot.material
            if mat is None:
                print("    (empty slot)")
                continue
            print(f"    {mat.name!r}")

main()
