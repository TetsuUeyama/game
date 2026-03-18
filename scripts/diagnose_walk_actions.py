"""Check what animation actions/NLA are available in the walk cycle blend file."""
import bpy, sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0])

rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
print(f"Rig: {rig.name}")

print("\n--- ALL ACTIONS ---")
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    fr = action.frame_range
    foot_tracks = [fc.data_path for fc in action.fcurves
                   if 'foot' in fc.data_path.lower()]
    print(f"  {action.name}: frames {fr[0]:.0f}-{fr[1]:.0f}, "
          f"fcurves={len(action.fcurves)}, foot_tracks={len(foot_tracks)}")

print(f"\n--- ACTIVE ACTION on rig ---")
if rig.animation_data and rig.animation_data.action:
    print(f"  {rig.animation_data.action.name}")
else:
    print("  None")

print(f"\n--- NLA TRACKS ---")
if rig.animation_data:
    for track in rig.animation_data.nla_tracks:
        print(f"  Track: {track.name} (mute={track.mute})")
        for strip in track.strips:
            act = strip.action.name if strip.action else 'None'
            print(f"    Strip: {strip.name} action={act} "
                  f"frames={strip.frame_start:.0f}-{strip.frame_end:.0f}")

# Also check Mixamo armature
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE' and obj != rig:
        print(f"\n--- {obj.name} animation ---")
        if obj.animation_data and obj.animation_data.action:
            act = obj.animation_data.action
            print(f"  Action: {act.name} frames {act.frame_range}")
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                print(f"  NLA: {track.name}")
                for strip in track.strips:
                    print(f"    {strip.name} action={strip.action.name if strip.action else 'None'}")

print("\nDONE")
