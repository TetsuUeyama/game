"""
Fix foot IK/FK constraint issue and re-export walk cycle motion.

Problem: foot.l/foot.r have both rotIK and rotFK at influence=1.0,
causing FK to overwrite IK rotation. Fix: set FK influence to 0
when in IK mode (ik_fk_switch=1.0).

Usage:
  blender --background --python scripts/fix_and_reexport_walk.py -- <blend_file> <output_dir> [frame_start] [frame_end]
"""

import bpy
import sys
import json
import math
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

BLEND_PATH = args[0] if len(args) > 0 else r"E:\MOdel\CyberElfBlender\CyberpunkElf_WalkCycle.blend"
OUT_DIR = args[1] if len(args) > 1 else r"C:\Users\user\developsecond\game-assets\motion"
FRAME_START = int(args[2]) if len(args) > 2 else None
FRAME_END = int(args[3]) if len(args) > 3 else None

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

# Find ARP rig (most bones)
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Rig: {rig.name} ({len(arm.bones)} bones)")

# ========================================================================
# Step 1: Fix foot IK/FK constraints
# ========================================================================
print("\n=== Fixing foot constraints ===")

foot_bones = ['foot.l', 'foot.r']
fixed_count = 0

for bname in foot_bones:
    pb = rig.pose.bones.get(bname)
    if not pb:
        print(f"  {bname}: NOT FOUND")
        continue

    # Check IK/FK switch
    ik_ctrl = rig.pose.bones.get(bname.replace('foot.', 'c_foot_ik.'))
    ik_mode = False
    if ik_ctrl and 'ik_fk_switch' in ik_ctrl:
        ik_fk = ik_ctrl['ik_fk_switch']
        ik_mode = (ik_fk >= 0.5)
        print(f"  {bname}: ik_fk_switch={ik_fk} -> {'IK' if ik_mode else 'FK'} mode")

    print(f"  {bname} constraints BEFORE fix:")
    for c in pb.constraints:
        print(f"    [{c.type}] {c.name}: influence={c.influence:.3f}")

    # Fix: in IK mode, disable FK; in FK mode, disable IK
    for c in pb.constraints:
        if ik_mode:
            # IK mode: disable FK constraints
            if 'FK' in c.name or 'fk' in c.name.lower():
                if c.influence > 0:
                    c.influence = 0.0
                    fixed_count += 1
                    print(f"    -> Set {c.name} influence to 0.0 (IK mode)")
        else:
            # FK mode: disable IK constraints
            if 'IK' in c.name or 'ik' in c.name.lower():
                if c.influence > 0 and c.name != 'locIK':  # locIK is already 0
                    c.influence = 0.0
                    fixed_count += 1
                    print(f"    -> Set {c.name} influence to 0.0 (FK mode)")

    print(f"  {bname} constraints AFTER fix:")
    for c in pb.constraints:
        print(f"    [{c.type}] {c.name}: influence={c.influence:.3f}")

print(f"\nFixed {fixed_count} constraints")

# ========================================================================
# Step 2: Determine frame range
# ========================================================================
if FRAME_START is None:
    FRAME_START = int(bpy.context.scene.frame_start)
if FRAME_END is None:
    FRAME_END = int(bpy.context.scene.frame_end)

# Walk cycle is typically 72 frames (73-144)
frame_count = FRAME_END - FRAME_START + 1
fps = bpy.context.scene.render.fps
print(f"\nFrame range: {FRAME_START}-{FRAME_END} ({frame_count} frames, {fps} fps)")

# ========================================================================
# Step 3: Collect deform bones (matching original export)
# ========================================================================
deform_bones = [b.name for b in arm.bones if b.use_deform]
print(f"Deform bones: {len(deform_bones)}")

# ========================================================================
# Step 4: Coordinate conversion matrix (Blender Z-up -> Y-up)
# ========================================================================
# C: (x, y, z) -> (x, z, -y)
C = Matrix([
    [1,  0,  0,  0],
    [0,  0,  1,  0],
    [0, -1,  0,  0],
    [0,  0,  0,  1],
])
C_inv = Matrix([
    [1,  0,  0,  0],
    [0,  0, -1,  0],
    [0,  1,  0,  0],
    [0,  0,  0,  1],
])

# ========================================================================
# Step 5: Sample skinning matrices per frame
# ========================================================================
print(f"\nSampling {len(deform_bones)} bones over {frame_count} frames...")

depsgraph = bpy.context.evaluated_depsgraph_get()

# Pre-compute bind pose inverse matrices
bind_inv = {}
for bname in deform_bones:
    bone = arm.bones.get(bname)
    if bone:
        bind_mat = rig.matrix_world @ bone.matrix_local
        bind_inv[bname] = bind_mat.inverted()

bone_matrices = {bname: [] for bname in deform_bones}

for frame in range(FRAME_START, FRAME_END + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    for bname in deform_bones:
        pb = rig_eval.pose.bones.get(bname)
        if not pb or bname not in bind_inv:
            bone_matrices[bname].append([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
            continue

        # World-space pose matrix
        mat_world = rig_eval.matrix_world @ pb.matrix

        # Skinning matrix = pose * bind^-1
        skin_mat = mat_world @ bind_inv[bname]

        # Convert to Y-up: M_json = C * M_skin * C^-1
        converted = C @ skin_mat @ C_inv

        # Flatten to row-major 16 elements
        flat = []
        for row in range(4):
            for col in range(4):
                flat.append(round(converted[row][col], 7))
        bone_matrices[bname].append(flat)

    if (frame - FRAME_START) % 10 == 0:
        print(f"  Frame {frame}/{FRAME_END}")

# ========================================================================
# Step 6: Write motion JSON
# ========================================================================
# Remove bones with no motion data or identity matrices throughout
bones_output = {}
for bname, matrices in bone_matrices.items():
    # Check if bone has any non-identity frames
    has_motion = False
    for mat in matrices:
        if any(abs(mat[i] - [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1][i]) > 0.001 for i in range(16)):
            has_motion = True
            break
    if has_motion:
        bones_output[bname] = {"matrices": matrices}

motion_data = {
    "fps": fps,
    "frame_count": frame_count,
    "bones": bones_output,
}

import os
out_path = os.path.join(OUT_DIR, "walk_cycle_arp.motion.json")

# Backup old file
if os.path.exists(out_path):
    backup_path = out_path + ".bak"
    if os.path.exists(backup_path):
        os.remove(backup_path)
    os.rename(out_path, backup_path)
    print(f"\nBacked up old file to: {backup_path}")

with open(out_path, 'w') as f:
    json.dump(motion_data, f)

file_size = os.path.getsize(out_path) / (1024 * 1024)
print(f"Written: {out_path}")
print(f"Size: {file_size:.1f} MB")
print(f"Bones: {len(bones_output)}")
print(f"Frames: {frame_count}")

# Verify: print foot.l frame 0 matrix
if 'foot.l' in bones_output:
    m = bones_output['foot.l']['matrices'][0]
    print(f"\nfoot.l frame 0: [{m[0]:.4f}, {m[1]:.4f}, {m[2]:.4f}, {m[3]:.4f}]")
    print(f"                [{m[4]:.4f}, {m[5]:.4f}, {m[6]:.4f}, {m[7]:.4f}]")
    print(f"                [{m[8]:.4f}, {m[9]:.4f}, {m[10]:.4f}, {m[11]:.4f}]")

print("\n=== DONE ===")
