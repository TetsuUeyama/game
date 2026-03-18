"""Quick inspection of a .blend file: armature, actions, frame range."""
import bpy, sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
BLEND_PATH = args[0]

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

print("\n=== Objects ===")
for o in bpy.data.objects:
    print(f"  {o.type:12s} {o.name}")

print("\n=== Armatures ===")
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        print(f"  {o.name}: {len(o.data.bones)} bones")
        deform = [b for b in o.data.bones if b.use_deform]
        print(f"    Deform bones: {len(deform)}")
        if o.animation_data:
            act = o.animation_data.action
            print(f"    Active action: {act.name if act else 'None'}")
            if o.animation_data.nla_tracks:
                for track in o.animation_data.nla_tracks:
                    print(f"    NLA: {track.name} (mute={track.mute})")
                    for strip in track.strips:
                        print(f"      strip: {strip.name} action={strip.action.name if strip.action else 'None'} frames={strip.frame_start:.0f}-{strip.frame_end:.0f}")

print("\n=== Actions ===")
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    fr = action.frame_range
    # Count fcurves
    fc_count = 0
    if hasattr(action, 'fcurves') and action.fcurves:
        fc_count = len(action.fcurves)
    elif hasattr(action, 'layers'):
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    fc_count += len(bag.fcurves)
    print(f"  {action.name}: frames={fr[0]:.0f}-{fr[1]:.0f} fcurves={fc_count}")

print(f"\n=== Scene ===")
print(f"  Frame range: {bpy.context.scene.frame_start}-{bpy.context.scene.frame_end}")
print(f"  FPS: {bpy.context.scene.render.fps}")
