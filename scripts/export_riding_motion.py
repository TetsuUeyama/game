"""
Export Riding motion variants from CyberpunkElf_Riding.blend.

The blend file has NLA-layered animation. We evaluate the depsgraph at each frame
to capture the final combined pose (IK solved, constraints applied, NLA blended).

Usage:
  blender --background --python export_riding_motion.py -- <riding.blend> <orig.blend> <out_dir>
"""
import bpy, sys, json, os, math
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
RIDE_PATH = args[0]
ORIG_PATH = args[1]
OUT_DIR = args[2]

os.makedirs(OUT_DIR, exist_ok=True)

# Blender->Viewer coordinate conversion (Y-up right-hand -> viewer space)
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# ========================================================================
# Step 1: Get evaluated bind pose from original model
# ========================================================================
print("=== Step 1: Bind pose from original model ===")
bpy.ops.wm.open_mainfile(filepath=ORIG_PATH)

orig_rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        orig_rig = o
        break

if not orig_rig:
    print("ERROR: No armature in original model!")
    sys.exit(1)

depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(0)
depsgraph.update()
orig_eval = orig_rig.evaluated_get(depsgraph)

eval_bind = {}
for bone in orig_rig.data.bones:
    if bone.use_deform:
        pb = orig_eval.pose.bones.get(bone.name)
        if pb:
            eval_bind[bone.name] = (orig_eval.matrix_world @ pb.matrix).copy()

print(f"  Bind pose: {len(eval_bind)} deform bones")

# ========================================================================
# Step 2: Open riding file
# ========================================================================
print(f"\n=== Step 2: Open riding file ===")
bpy.ops.wm.open_mainfile(filepath=RIDE_PATH)

# Find the CyberpunkElf rig (not Spartan)
rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        name_lower = o.name.lower()
        if 'spartan' not in name_lower:
            rig = o
            break

if not rig:
    # Fallback: largest armature
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if armatures:
        rig = max(armatures, key=lambda o: len(o.data.bones))

if not rig:
    print("ERROR: No armature found!")
    sys.exit(1)

arm = rig.data
fps = int(bpy.context.scene.render.fps)
print(f"  Rig: {rig.name} ({len(arm.bones)} bones)")
print(f"  FPS: {fps}")

# Find deform bones
deform_bones = [b.name for b in arm.bones if b.use_deform]
print(f"  Deform bones: {len(deform_bones)}")

# Build bind inverse
bind_inv = {}
fallback_count = 0
for bname in deform_bones:
    if bname in eval_bind:
        bind_inv[bname] = eval_bind[bname].inverted()
    else:
        bone = arm.bones.get(bname)
        if bone:
            bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()
            fallback_count += 1
print(f"  Bind inv: {len(eval_bind)} eval, {fallback_count} fallback")

# ========================================================================
# Step 3: Detect riding frame ranges by sampling
# ========================================================================
print(f"\n=== Step 3: Detect frame ranges ===")

# The scene range is 121-1560. Riding actions have fcurves at 769-793.
# NLA strips map these to 0-1570. We need to find which scene frames
# correspond to the riding motion.
# Let's sample the hip bone position to find the looping motion section.

scene_start = int(bpy.context.scene.frame_start)
scene_end = int(bpy.context.scene.frame_end)
print(f"  Scene: {scene_start}-{scene_end}")

# Sample hip position at several frames to understand the timeline
depsgraph = bpy.context.evaluated_depsgraph_get()
hip_bone = 'c_root_bend.x'

print(f"\n  Sampling hip position across timeline...")
sample_frames = list(range(scene_start, scene_end + 1, 50))
for frame in sample_frames:
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    pb = rig_eval.pose.bones.get(hip_bone)
    if pb:
        pos = (rig_eval.matrix_world @ pb.matrix).to_translation()
        print(f"    f={frame:4d}: hip=({pos.x:.3f}, {pos.y:.3f}, {pos.z:.3f})")

# The Riding actions are 769-793 (25 frames). Let's export the full scene
# and also extract specific sections that likely correspond to each variant.
# Based on NLA, all layers are mapped to 0-1570, so the actions blend across
# the entire timeline. Let's just export a few key sections.

# For a comprehensive export, let's extract the entire evaluated animation
# and let the user pick sections later, OR export specific frame ranges.

# Let's check what happens at frames 769-793 specifically
print(f"\n  Checking riding range (769-793)...")
for frame in [769, 775, 781, 787, 793]:
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    pb = rig_eval.pose.bones.get(hip_bone)
    if pb:
        pos = (rig_eval.matrix_world @ pb.matrix).to_translation()
        print(f"    f={frame}: hip=({pos.x:.3f}, {pos.y:.3f}, {pos.z:.3f})")

# ========================================================================
# Step 4: Export function
# ========================================================================
def export_range(start_frame, end_frame, output_name):
    """Export evaluated animation for a frame range."""
    print(f"\n  Exporting {output_name}: frames {start_frame}-{end_frame}...")
    frame_count = end_frame - start_frame + 1
    bone_matrices = {b: [] for b in deform_bones}

    for frame in range(start_frame, end_frame + 1):
        bpy.context.scene.frame_set(frame)
        depsgraph.update()
        rig_eval = rig.evaluated_get(depsgraph)
        for bname in deform_bones:
            ppb = rig_eval.pose.bones.get(bname)
            if not ppb or bname not in bind_inv:
                bone_matrices[bname].append([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
                continue
            mat_world = rig_eval.matrix_world @ ppb.matrix
            skin = mat_world @ bind_inv[bname]
            conv = C @ skin @ C_inv
            flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
            bone_matrices[bname].append(flat)
        if (frame - start_frame) % 10 == 0:
            print(f"    Frame {frame}/{end_frame}")

    # Filter out identity-only bones
    ident = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    bones_out = {}
    for bname, mats in bone_matrices.items():
        if any(any(abs(m[i] - ident[i]) > 0.001 for i in range(16)) for m in mats):
            bones_out[bname] = {"matrices": mats}

    out_path = os.path.join(OUT_DIR, output_name)
    with open(out_path, 'w') as f:
        json.dump({"fps": fps, "frame_count": frame_count, "bones": bones_out}, f)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"    Written: {out_path} ({size_mb:.1f} MB, {len(bones_out)} bones, {frame_count} frames)")

# ========================================================================
# Step 5: Export riding sections
# ========================================================================
print(f"\n=== Step 4: Export ===")

# The Riding actions are at frames 769-793 in the action editor,
# but with NLA blending across the full timeline, the "riding" motion
# likely spans a larger section. Let's export the range where riding
# actions are active.
# From the NLA setup, all strips are mapped 0-1570.
# The Riding-Default action has keyframes at 769-793.
# With NLA influence, this creates a loop from 769-793.

# Export the riding loop section (769-793 = 25 frames loop)
export_range(769, 793, "riding_default.motion.json")

# Export a wider section to capture variation/transitions
# Typically in these setups:
# - ~121-400: initial pose / setup
# - ~400-768: transition
# - ~769-793: riding loop
# - ~793+: climax/finish

# Let's also export a broader range to see the full motion
export_range(121, 250, "riding_full_start.motion.json")
export_range(400, 500, "riding_mid.motion.json")
export_range(769, 900, "riding_loop_extended.motion.json")

print("\n=== DONE ===")
