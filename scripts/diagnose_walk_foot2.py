"""
Focused comparison: Blender foot.l matrix vs motion.json matrix.
"""
import bpy, sys, json

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
BLEND_PATH = args[0] if args else r"E:\MOdel\CyberElfBlender\CyberpunkElf_WalkCycle.blend"

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

# Find ARP rig (most bones)
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'], key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Rig: {rig.name} ({len(arm.bones)} bones)")

# Check evaluated constraint influences on foot.l
depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(73)
depsgraph.update()

rig_eval = rig.evaluated_get(depsgraph)
pb_eval = rig_eval.pose.bones.get('foot.l')
if pb_eval:
    print("\nfoot.l EVALUATED constraints:")
    for c in pb_eval.constraints:
        print(f"  [{c.type}] {c.name}: influence={c.influence:.3f} mute={c.mute}")

# IK/FK switch evaluated value
for bname in ['c_foot_ik.l', 'c_foot_ik.r']:
    pb_e = rig_eval.pose.bones.get(bname)
    if pb_e and 'ik_fk_switch' in pb_e:
        print(f"\n{bname}['ik_fk_switch'] = {pb_e['ik_fk_switch']}")

# Sample foot matrices and compare with JSON
print("\n--- Matrix Comparison ---")
motion_path = r"C:\Users\user\developsecond\game-assets\motion\walk_cycle_arp.motion.json"
with open(motion_path, 'r') as f:
    motion = json.load(f)

# The walk cycle in JSON has 72 frames. Scene starts at frame 73.
# JSON frame 0 = scene frame 73
scene_start = 73

for bone_name in ['foot.l', 'foot.r', 'c_root_bend.x', 'c_leg_stretch.l']:
    json_entry = motion['bones'].get(bone_name)
    if not json_entry:
        print(f"\n{bone_name}: NOT in motion.json")
        continue

    rest_bone = arm.bones.get(bone_name)
    if not rest_bone:
        print(f"\n{bone_name}: NOT in armature")
        continue

    # Frame 0 of walk cycle
    bpy.context.scene.frame_set(scene_start)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    pb = rig_eval.pose.bones.get(bone_name)
    if not pb:
        print(f"\n{bone_name}: NOT in eval pose")
        continue

    mat_world = rig_eval.matrix_world @ pb.matrix
    bind_mat = rig.matrix_world @ rest_bone.matrix_local
    skin_mat = mat_world @ bind_mat.inverted()

    json_mat = json_entry['matrices'][0]

    # Flatten matrices
    world_flat = [mat_world[r][c] for r in range(4) for c in range(4)]
    skin_flat = [skin_mat[r][c] for r in range(4) for c in range(4)]

    match_world = all(abs(world_flat[i] - json_mat[i]) < 0.02 for i in range(16))
    match_skin = all(abs(skin_flat[i] - json_mat[i]) < 0.02 for i in range(16))

    print(f"\n{bone_name}:")
    print(f"  world matrix match:    {'YES' if match_world else 'NO'}")
    print(f"  skinning matrix match: {'YES' if match_skin else 'NO'}")

    # Show row 0 and translation for comparison
    print(f"  JSON    row0: [{json_mat[0]:.4f}, {json_mat[1]:.4f}, {json_mat[2]:.4f}, {json_mat[3]:.4f}]")
    print(f"  World   row0: [{world_flat[0]:.4f}, {world_flat[1]:.4f}, {world_flat[2]:.4f}, {world_flat[3]:.4f}]")
    print(f"  Skin    row0: [{skin_flat[0]:.4f}, {skin_flat[1]:.4f}, {skin_flat[2]:.4f}, {skin_flat[3]:.4f}]")
    print(f"  JSON    tran: [{json_mat[3]:.4f}, {json_mat[7]:.4f}, {json_mat[11]:.4f}]")
    print(f"  World   tran: [{world_flat[3]:.4f}, {world_flat[7]:.4f}, {world_flat[11]:.4f}]")
    print(f"  Skin    tran: [{skin_flat[3]:.4f}, {skin_flat[7]:.4f}, {skin_flat[11]:.4f}]")

print("\nDONE")
