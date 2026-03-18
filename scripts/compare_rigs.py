"""Compare bone structure of two blend files."""
import bpy, sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

results = {}

for i, blend_path in enumerate(args[:2]):
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
              key=lambda o: len(o.data.bones))
    arm = rig.data

    deform = sorted([b.name for b in arm.bones if b.use_deform])
    all_bones = sorted([b.name for b in arm.bones])

    label = blend_path.split('\\')[-1].split('/')[-1]
    results[label] = {
        'rig_name': rig.name,
        'total': len(all_bones),
        'deform': len(deform),
        'deform_names': set(deform),
        'all_names': set(all_bones),
    }
    print(f"=== {label} ===")
    print(f"  Rig: {rig.name}")
    print(f"  Total bones: {len(all_bones)}")
    print(f"  Deform bones: {len(deform)}")

    # Key foot/leg bones
    for bname in ['foot.l', 'foot.r', 'c_foot_ik.l', 'c_foot_fk.l',
                   'foot_ik.l', 'foot_fk.l', 'c_leg_stretch.l',
                   'c_thigh_stretch.l', 'c_root_bend.x', 'hand.l']:
        bone = arm.bones.get(bname)
        if bone:
            parent = bone.parent.name if bone.parent else 'ROOT'
            print(f"  {bname:25s} deform={bone.use_deform} parent={parent}")
        else:
            print(f"  {bname:25s} NOT FOUND")

labels = list(results.keys())
if len(labels) == 2:
    a, b = labels
    da, db = results[a]['deform_names'], results[b]['deform_names']

    common = da & db
    only_a = da - db
    only_b = db - da

    print(f"\n=== COMPARISON ===")
    print(f"  Common deform bones: {len(common)}")
    print(f"  Only in {a}: {len(only_a)}")
    print(f"  Only in {b}: {len(only_b)}")

    if only_a:
        print(f"\n  Only in {a}:")
        for n in sorted(only_a)[:30]:
            print(f"    {n}")
    if only_b:
        print(f"\n  Only in {b}:")
        for n in sorted(only_b)[:30]:
            print(f"    {n}")

print("\nDONE")
