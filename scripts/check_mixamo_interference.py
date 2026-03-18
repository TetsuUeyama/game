"""Check if Mixamo armature interferes with ARP rig foot animation."""
import bpy, sys, math

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0])

rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
mixamo = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE' and obj != rig:
        mixamo = obj

print(f"ARP rig: {rig.name}")
print(f"Mixamo armature: {mixamo.name if mixamo else 'None'}")

# Check if any ARP bones have constraints referencing Mixamo
print("\n=== ARP bones with constraints referencing Mixamo ===")
mixamo_refs = []
for pb in rig.pose.bones:
    for c in pb.constraints:
        target = getattr(c, 'target', None)
        subtarget = getattr(c, 'subtarget', '')
        if target and target == mixamo:
            mixamo_refs.append((pb.name, c.name, c.type, subtarget, c.influence, c.mute))

if mixamo_refs:
    print(f"  Found {len(mixamo_refs)} constraints referencing Mixamo!")
    for bname, cname, ctype, sub, inf, mute in mixamo_refs[:20]:
        print(f"    {bname} -> [{ctype}] {cname}: subtarget={sub} influence={inf:.1f} mute={mute}")
else:
    print("  None found")

# Check ARP rig drivers referencing Mixamo
print("\n=== ARP drivers referencing Mixamo ===")
if rig.animation_data and rig.animation_data.drivers:
    mixamo_drivers = []
    for driver in rig.animation_data.drivers:
        for var in driver.driver.variables:
            for target in var.targets:
                if target.id == mixamo:
                    mixamo_drivers.append(driver.data_path)
    if mixamo_drivers:
        print(f"  Found {len(mixamo_drivers)} drivers!")
        for dp in mixamo_drivers[:10]:
            print(f"    {dp}")
    else:
        print("  None found")

# Check retarget properties
print("\n=== ARP Retarget Properties ===")
for key in sorted(rig.keys()):
    if 'retarget' in key.lower() or 'source' in key.lower():
        val = rig[key]
        print(f"  rig['{key}'] = {val}")

# Test: compare foot.l with and without Mixamo armature
print("\n=== foot.l comparison: with vs without Mixamo ===")
depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(73)
depsgraph.update()
rig_eval = rig.evaluated_get(depsgraph)

pb = rig_eval.pose.bones.get('foot.l')
if pb:
    mat1 = rig_eval.matrix_world @ pb.matrix
    e1 = mat1.to_euler()
    t1 = mat1.to_translation()
    print(f"  WITH Mixamo: pos=({t1.x:.4f},{t1.y:.4f},{t1.z:.4f}) rot=({math.degrees(e1.x):.1f},{math.degrees(e1.y):.1f},{math.degrees(e1.z):.1f})")

# Disable/hide Mixamo armature
if mixamo:
    mixamo.hide_set(True)
    mixamo.hide_viewport = True
    if mixamo.animation_data:
        mixamo.animation_data.action = None

    depsgraph = bpy.context.evaluated_depsgraph_get()
    bpy.context.scene.frame_set(73)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    pb = rig_eval.pose.bones.get('foot.l')
    if pb:
        mat2 = rig_eval.matrix_world @ pb.matrix
        e2 = mat2.to_euler()
        t2 = mat2.to_translation()
        print(f"  WITHOUT Mixamo: pos=({t2.x:.4f},{t2.y:.4f},{t2.z:.4f}) rot=({math.degrees(e2.x):.1f},{math.degrees(e2.y):.1f},{math.degrees(e2.z):.1f})")

        diff = max(abs(math.degrees(e1[i]-e2[i])) for i in range(3))
        print(f"  Rotation difference: {diff:.2f} degrees")
        if diff > 0.1:
            print(f"  *** MIXAMO IS AFFECTING FOOT ROTATION! ***")
        else:
            print(f"  No significant difference")

# Now also try DELETING Mixamo armature entirely
if mixamo:
    bpy.data.objects.remove(mixamo, do_unlink=True)
    print("\n  After DELETING Mixamo armature:")

    depsgraph = bpy.context.evaluated_depsgraph_get()
    bpy.context.scene.frame_set(73)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    pb = rig_eval.pose.bones.get('foot.l')
    if pb:
        mat3 = rig_eval.matrix_world @ pb.matrix
        e3 = mat3.to_euler()
        t3 = mat3.to_translation()
        print(f"  DELETED Mixamo: pos=({t3.x:.4f},{t3.y:.4f},{t3.z:.4f}) rot=({math.degrees(e3.x):.1f},{math.degrees(e3.y):.1f},{math.degrees(e3.z):.1f})")

        diff3 = max(abs(math.degrees(e1[i]-e3[i])) for i in range(3))
        print(f"  Rotation difference from original: {diff3:.2f} degrees")
        if diff3 > 0.1:
            print(f"  *** DELETING MIXAMO CHANGED FOOT ROTATION! ***")

print("\nDONE")
