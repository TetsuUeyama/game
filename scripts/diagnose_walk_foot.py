"""
Diagnose foot bone IK/FK state in walk cycle blend file.

Usage:
  blender --background --python scripts/diagnose_walk_foot.py -- "E:\MOdel\CyberElfBlender\CyberpunkElf_WalkCycle.blend"
"""

import bpy
import sys
import json

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
BLEND_PATH = args[0] if args else r"E:\MOdel\CyberElfBlender\CyberpunkElf_WalkCycle.blend"

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

print("=" * 70)
print("=== Walk Cycle Foot Diagnosis ===")
print("=" * 70)

# Find ALL armatures
print("\n--- All Armatures ---")
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        print(f"  {obj.name}: {len(obj.data.bones)} bones")

# Find the ARP rig (most bones)
rig = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        if rig is None or len(obj.data.bones) > len(rig.data.bones):
            rig = obj

if not rig:
    print("ERROR: No armature found!")
    sys.exit(1)

print(f"\nUsing: {rig.name} ({len(rig.data.bones)} bones)")
arm = rig.data

# Check IK/FK custom properties
print("\n--- IK/FK Custom Properties on Rig ---")
if hasattr(rig, 'keys'):
    for key in sorted(rig.keys()):
        kl = key.lower()
        if 'ik' in kl or 'fk' in kl or 'leg' in kl or 'foot' in kl or 'switch' in kl or 'snap' in kl:
            print(f"  rig['{key}'] = {rig[key]}")

# Check pose bone custom properties for IK/FK
print("\n--- Pose Bone IK/FK Properties ---")
for pb in rig.pose.bones:
    if hasattr(pb, 'keys'):
        for key in pb.keys():
            kl = key.lower()
            if 'ik' in kl or 'fk' in kl:
                print(f"  {pb.name}['{key}'] = {pb[key]}")

# Check constraints on foot-related bones
print("\n--- Foot/Leg Bone Constraints ---")
check_bones = ['foot.l', 'foot.r', 'c_foot_ik.l', 'c_foot_fk.l',
               'foot_fk.l', 'foot_ik.l', 'leg_fk.l', 'leg_ik.l',
               'c_leg_fk.l', 'c_leg_stretch.l']
for bname in check_bones:
    pb = rig.pose.bones.get(bname)
    if pb:
        bone_info = arm.bones.get(bname)
        is_deform = bone_info.use_deform if bone_info else '?'
        parent = bone_info.parent.name if bone_info and bone_info.parent else 'ROOT'
        print(f"\n  {bname} (deform={is_deform}, parent={parent}):")
        if pb.constraints:
            for c in pb.constraints:
                extra = ""
                if hasattr(c, 'subtarget') and c.subtarget:
                    extra = f" subtarget='{c.subtarget}'"
                if hasattr(c, 'target') and c.target:
                    extra += f" target='{c.target.name}'"
                print(f"    [{c.type}] {c.name}: influence={c.influence:.3f}, mute={c.mute}{extra}")
        else:
            print(f"    (no constraints)")

# Animation data
print("\n--- Animation / NLA ---")
if rig.animation_data:
    ad = rig.animation_data
    action = ad.action
    print(f"  Active action: {action.name if action else 'None'}")
    if action:
        print(f"    Frame range: {action.frame_range}")
        # Check which bones have fcurves
        foot_fcurves = [fc.data_path for fc in action.fcurves if 'foot' in fc.data_path.lower()]
        print(f"    Foot-related fcurves: {len(foot_fcurves)}")
        for fc in foot_fcurves[:10]:
            print(f"      {fc}")
    print(f"  NLA tracks: {len(ad.nla_tracks)}")
    for track in ad.nla_tracks:
        print(f"    Track: {track.name} (mute={track.mute})")
        for strip in track.strips:
            act = strip.action.name if strip.action else 'None'
            print(f"      Strip: {strip.name} | action={act} | frames={strip.frame_start:.0f}-{strip.frame_end:.0f}")

# Sample foot.l matrices at several frames
print("\n--- foot.l Pose Matrices ---")
depsgraph = bpy.context.evaluated_depsgraph_get()
frame_start = int(bpy.context.scene.frame_start)
frame_end = int(bpy.context.scene.frame_end)
print(f"  Scene frame range: {frame_start}-{frame_end}")

for frame in range(frame_start, min(frame_end + 1, frame_start + 25), 6):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()

    pb = rig.pose.bones.get('foot.l')
    if not pb:
        print(f"  foot.l NOT FOUND in pose bones!")
        break

    mat_world = rig.matrix_world @ pb.matrix
    t = mat_world.to_translation()
    print(f"  Frame {frame}: world=({t.x:.4f}, {t.y:.4f}, {t.z:.4f})")

# Compare with motion.json
print("\n--- Comparison: Blender vs motion.json ---")
try:
    motion_path = r"C:\Users\user\developsecond\game-assets\motion\walk_cycle_arp.motion.json"
    with open(motion_path, 'r') as f:
        motion = json.load(f)

    bpy.context.scene.frame_set(frame_start)
    depsgraph.update()

    for bname in ['foot.l', 'foot.r', 'c_root_bend.x', 'c_leg_stretch.l']:
        pb = rig.pose.bones.get(bname)
        if not pb:
            print(f"  {bname}: NOT FOUND")
            continue

        # Blender world matrix
        mat_world = rig.matrix_world @ pb.matrix
        blender_flat = []
        for row in range(4):
            for col in range(4):
                blender_flat.append(mat_world[row][col])

        # motion.json matrix
        json_entry = motion['bones'].get(bname)
        if not json_entry:
            print(f"  {bname}: not in motion.json")
            continue
        json_mat = json_entry['matrices'][0]

        # Check direct match (row-major world matrix)
        match_world = all(abs(blender_flat[i] - json_mat[i]) < 0.01 for i in range(16))

        # Check skinning matrix match (pose * bind^-1)
        rest_bone = arm.bones.get(bname)
        match_skin = False
        if rest_bone:
            bind_mat = rig.matrix_world @ rest_bone.matrix_local
            skin_mat = mat_world @ bind_mat.inverted()
            skin_flat = []
            for row in range(4):
                for col in range(4):
                    skin_flat.append(skin_mat[row][col])
            match_skin = all(abs(skin_flat[i] - json_mat[i]) < 0.01 for i in range(16))

        print(f"\n  {bname} (frame {frame_start}):")
        print(f"    world matrix match:    {'YES' if match_world else 'NO'}")
        print(f"    skinning matrix match: {'YES' if match_skin else 'NO'}")

        if not match_world and not match_skin:
            # Show both for comparison
            print(f"    Blender world row0: [{blender_flat[0]:.4f}, {blender_flat[1]:.4f}, {blender_flat[2]:.4f}, {blender_flat[3]:.4f}]")
            print(f"    JSON         row0: [{json_mat[0]:.4f}, {json_mat[1]:.4f}, {json_mat[2]:.4f}, {json_mat[3]:.4f}]")
            print(f"    Blender world row3: [{blender_flat[12]:.4f}, {blender_flat[13]:.4f}, {blender_flat[14]:.4f}, {blender_flat[15]:.4f}]")
            print(f"    JSON         row3: [{json_mat[12]:.4f}, {json_mat[13]:.4f}, {json_mat[14]:.4f}, {json_mat[15]:.4f}]")
            if rest_bone:
                print(f"    Skinning     row0: [{skin_flat[0]:.4f}, {skin_flat[1]:.4f}, {skin_flat[2]:.4f}, {skin_flat[3]:.4f}]")
                print(f"    Skinning     row3: [{skin_flat[12]:.4f}, {skin_flat[13]:.4f}, {skin_flat[14]:.4f}, {skin_flat[15]:.4f}]")

except Exception as e:
    print(f"  Error: {e}")
    import traceback
    traceback.print_exc()

print("\n=== DIAGNOSIS COMPLETE ===")
