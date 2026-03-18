"""Check what drives c_foot_ik animation. Blender 5.0 compatible."""
import bpy, sys, math

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0])

def get_fcurves(action):
    """Get fcurves from action (Blender 5.0 layered actions support)."""
    if hasattr(action, 'fcurves') and action.fcurves:
        return list(action.fcurves)
    if hasattr(action, 'layers'):
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves.extend(bag.fcurves)
        return curves
    return []

print("=== ALL ACTIONS ===")
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    fcs = get_fcurves(action)
    fr = action.frame_range
    foot_ik = [fc.data_path for fc in fcs if 'c_foot_ik' in fc.data_path]
    foot_fk = [fc.data_path for fc in fcs if 'c_foot_fk' in fc.data_path]
    foot_any = [fc.data_path for fc in fcs if 'foot' in fc.data_path.lower()]
    print(f"  {action.name}: frames={fr[0]:.0f}-{fr[1]:.0f} total_fc={len(fcs)} c_foot_ik={len(foot_ik)} c_foot_fk={len(foot_fk)} foot_any={len(foot_any)}")
    if foot_ik:
        for p in foot_ik[:5]:
            print(f"    IK: {p}")
    if foot_fk:
        for p in foot_fk[:5]:
            print(f"    FK: {p}")

# Find ARP rig
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))

print(f"\n=== {rig.name} ANIMATION DATA ===")
if rig.animation_data:
    act = rig.animation_data.action
    print(f"Active action: {act.name if act else 'None'}")
    print(f"NLA tracks: {len(rig.animation_data.nla_tracks)}")
    for track in rig.animation_data.nla_tracks:
        print(f"  Track: {track.name} mute={track.mute}")
        for strip in track.strips:
            print(f"    Strip: {strip.name} action={strip.action.name if strip.action else 'None'} frames={strip.frame_start:.0f}-{strip.frame_end:.0f}")

# Sample c_foot_ik.l across frames
print(f"\n=== BONE POSITIONS ACROSS FRAMES ===")
depsgraph = bpy.context.evaluated_depsgraph_get()
for frame in [73, 79, 85, 91, 97, 103]:
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    print(f"\nFrame {frame}:")
    for bname in ['c_foot_ik.l', 'foot_ik.l', 'foot_fk.l', 'foot.l']:
        pb = rig_eval.pose.bones.get(bname)
        if pb:
            mat = rig_eval.matrix_world @ pb.matrix
            t = mat.to_translation()
            e = mat.to_euler()
            print(f"  {bname:15s} pos=({t.x:.3f},{t.y:.3f},{t.z:.3f}) rot=({math.degrees(e.x):.1f},{math.degrees(e.y):.1f},{math.degrees(e.z):.1f})")

print("\nDONE")
