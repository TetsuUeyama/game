"""Compare foot_ik.l vs foot_fk.l vs foot.l rotation at each frame."""
import bpy, sys, json
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0])

rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Rig: {rig.name}")

depsgraph = bpy.context.evaluated_depsgraph_get()

# Check rest pose (bone.matrix_local) differences
print("\n=== REST POSE (matrix_local) ===")
for bname in ['foot.l', 'foot_ik.l', 'foot_fk.l', 'c_foot_ik.l', 'c_foot_fk.l']:
    bone = arm.bones.get(bname)
    if bone:
        mat = rig.matrix_world @ bone.matrix_local
        euler = mat.to_euler()
        import math
        print(f"  {bname:20s} euler(deg): X={math.degrees(euler.x):7.2f} Y={math.degrees(euler.y):7.2f} Z={math.degrees(euler.z):7.2f}")
        t = mat.to_translation()
        print(f"  {' ':20s} pos: ({t.x:.4f}, {t.y:.4f}, {t.z:.4f})")

# Compare animated rotations at frame 73 (walk cycle start)
print("\n=== ANIMATED POSE (frame 73) ===")
bpy.context.scene.frame_set(73)
depsgraph.update()
rig_eval = rig.evaluated_get(depsgraph)

import math
for bname in ['foot.l', 'foot_ik.l', 'foot_fk.l', 'c_foot_ik.l', 'c_foot_fk.l']:
    pb = rig_eval.pose.bones.get(bname)
    if pb:
        mat_world = rig_eval.matrix_world @ pb.matrix
        euler = mat_world.to_euler()
        t = mat_world.to_translation()
        print(f"  {bname:20s} euler(deg): X={math.degrees(euler.x):7.2f} Y={math.degrees(euler.y):7.2f} Z={math.degrees(euler.z):7.2f}")
        print(f"  {' ':20s} pos: ({t.x:.4f}, {t.y:.4f}, {t.z:.4f})")

# Now: disable FK, enable only IK, re-evaluate
print("\n=== AFTER DISABLING FK CONSTRAINTS ===")
# Must modify on the original rig, not eval
pb_foot = rig.pose.bones.get('foot.l')
if pb_foot:
    for c in pb_foot.constraints:
        if 'FK' in c.name or 'fk' in c.name.lower():
            print(f"  Disabling: {c.name} (was influence={c.influence:.3f})")
            c.influence = 0.0

    # Force re-evaluation
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bpy.context.scene.frame_set(73)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    pb_after = rig_eval.pose.bones.get('foot.l')
    if pb_after:
        mat_after = rig_eval.matrix_world @ pb_after.matrix
        euler_after = mat_after.to_euler()
        t_after = mat_after.to_translation()
        print(f"  foot.l (IK only)   euler(deg): X={math.degrees(euler_after.x):7.2f} Y={math.degrees(euler_after.y):7.2f} Z={math.degrees(euler_after.z):7.2f}")
        print(f"                      pos: ({t_after.x:.4f}, {t_after.y:.4f}, {t_after.z:.4f})")

# Compare with the original foot.l (both constraints active)
# Re-enable FK to see the difference
for c in pb_foot.constraints:
    if 'FK' in c.name or 'fk' in c.name.lower():
        c.influence = 1.0

depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(73)
depsgraph.update()
rig_eval = rig.evaluated_get(depsgraph)
pb_both = rig_eval.pose.bones.get('foot.l')
if pb_both:
    mat_both = rig_eval.matrix_world @ pb_both.matrix
    euler_both = mat_both.to_euler()
    print(f"  foot.l (IK+FK)     euler(deg): X={math.degrees(euler_both.x):7.2f} Y={math.degrees(euler_both.y):7.2f} Z={math.degrees(euler_both.z):7.2f}")

# Now export with IK-only foot
print("\n=== RE-EXPORTING WITH IK-ONLY FOOT ===")

# Disable FK on both feet
for bname in ['foot.l', 'foot.r']:
    pb = rig.pose.bones.get(bname)
    if pb:
        for c in pb.constraints:
            if 'FK' in c.name or 'fk' in c.name.lower():
                c.influence = 0.0
                print(f"  {bname}: {c.name} -> 0.0")

# Coordinate conversion
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# Get deform bones
deform_bones = [b.name for b in arm.bones if b.use_deform]

# Bind pose inverse
bind_inv = {}
for bname in deform_bones:
    bone = arm.bones.get(bname)
    if bone:
        bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()

# Sample
frame_start, frame_end = 73, 144
bone_matrices = {b: [] for b in deform_bones}

for frame in range(frame_start, frame_end + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    for bname in deform_bones:
        pb = rig_eval.pose.bones.get(bname)
        if not pb or bname not in bind_inv:
            bone_matrices[bname].append([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
            continue
        mat_world = rig_eval.matrix_world @ pb.matrix
        skin = mat_world @ bind_inv[bname]
        conv = C @ skin @ C_inv
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[bname].append(flat)
    if (frame - frame_start) % 20 == 0:
        print(f"  Frame {frame}/{frame_end}")

# Write
import os
bones_out = {}
ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
for bname, mats in bone_matrices.items():
    if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
        bones_out[bname] = {"matrices": mats}

out_path = os.path.join(args[1], "walk_cycle_arp.motion.json")
bak = out_path + ".bak"
if os.path.exists(out_path):
    if os.path.exists(bak):
        os.remove(bak)
    os.rename(out_path, bak)

with open(out_path, 'w') as f:
    json.dump({"fps": 30, "frame_count": frame_end - frame_start + 1, "bones": bones_out}, f)

sz = os.path.getsize(out_path) / 1024 / 1024
print(f"\nWritten: {out_path} ({sz:.1f} MB, {len(bones_out)} bones)")

# Show new vs old foot.l
if 'foot.l' in bones_out:
    new = bones_out['foot.l']['matrices'][0]
    print(f"\nfoot.l frame 0 (new/IK-only):")
    print(f"  [{new[0]:.4f}, {new[1]:.4f}, {new[2]:.4f}, {new[3]:.4f}]")
    print(f"  [{new[4]:.4f}, {new[5]:.4f}, {new[6]:.4f}, {new[7]:.4f}]")
    print(f"  [{new[8]:.4f}, {new[9]:.4f}, {new[10]:.4f}, {new[11]:.4f}]")

try:
    with open(bak, 'r') as f:
        old_data = json.load(f)
    old = old_data['bones']['foot.l']['matrices'][0]
    print(f"foot.l frame 0 (old):")
    print(f"  [{old[0]:.4f}, {old[1]:.4f}, {old[2]:.4f}, {old[3]:.4f}]")
    print(f"  [{old[4]:.4f}, {old[5]:.4f}, {old[6]:.4f}, {old[7]:.4f}]")
    print(f"  [{old[8]:.4f}, {old[9]:.4f}, {old[10]:.4f}, {old[11]:.4f}]")
except:
    pass

print("\nDONE")
