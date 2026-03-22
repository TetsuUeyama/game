"""
Export motion data as RAW Blender world-space matrices.
No coordinate conversion - all transforms stay in Blender's coordinate system.
The viewer (Babylon.js) side handles all conversion.

Output format:
{
  "format": "blender_raw",
  "fps": 30,
  "frame_count": N,
  "bind_pose": {
    "boneName": [16 floats, row-major, world-space matrix at bind frame]
  },
  "animated": {
    "boneName": {
      "matrices": [[16 floats per frame], ...]
    }
  }
}

Usage:
  blender --background --python export_motion_raw.py -- <anim.blend> <orig.blend> <out_dir> [frame_ranges]

  frame_ranges: "name:start-end name:start-end ..."
  Example: "riding_default:769-793 riding_loop:769-900"
"""
import bpy, sys, json, os
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

ANIM_PATH = args[0]
ORIG_PATH = args[1]
OUT_DIR = args[2]
FRAME_RANGES = args[3] if len(args) > 3 else None

os.makedirs(OUT_DIR, exist_ok=True)

def mat_to_flat(m):
    """Flatten 4x4 Matrix to 16-element row-major list."""
    return [round(m[r][c], 7) for r in range(4) for c in range(4)]

# ========================================================================
# Step 1: Get bind pose from original model (evaluated, world-space)
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

# Store BOTH evaluated and rest bind poses
bind_eval = {}
bind_rest = {}
for bone in orig_rig.data.bones:
    if bone.use_deform:
        pb = orig_eval.pose.bones.get(bone.name)
        if pb:
            bind_eval[bone.name] = mat_to_flat(orig_eval.matrix_world @ pb.matrix)
        bind_rest[bone.name] = mat_to_flat(orig_rig.matrix_world @ bone.matrix_local)

orig_matrix_world = orig_rig.matrix_world.copy()
print(f"  Bind pose: {len(bind_eval)} eval, {len(bind_rest)} rest")
print(f"  Orig matrix_world: {[round(x,4) for row in orig_matrix_world for x in row]}")

# ========================================================================
# Step 2: Open animation file
# ========================================================================
print(f"\n=== Step 2: Open animation file ===")
bpy.ops.wm.open_mainfile(filepath=ANIM_PATH)

rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        name_lower = o.name.lower()
        if 'spartan' not in name_lower:
            rig = o
            break

if not rig:
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if armatures:
        rig = max(armatures, key=lambda o: len(o.data.bones))

if not rig:
    print("ERROR: No armature found!")
    sys.exit(1)

# Compute correction matrix: orig_matrix_world @ anim_matrix_world_inv
# This re-bases animated bone matrices from anim's world space to orig's world space
anim_matrix_world = rig.matrix_world.copy()
anim_matrix_world_inv = anim_matrix_world.inverted()
world_correction = orig_matrix_world @ anim_matrix_world_inv
is_identity = all(abs(world_correction[r][c] - (1 if r == c else 0)) < 0.0001 for r in range(4) for c in range(4))
print(f"  Anim matrix_world: {[round(x,4) for row in anim_matrix_world for x in row]}")
if not is_identity:
    print(f"  WARNING: Anim rig has different world transform than orig!")
    print(f"  Applying world correction to normalize bone matrices.")
else:
    print(f"  World transforms match - no correction needed.")

arm = rig.data
fps = int(bpy.context.scene.render.fps)
print(f"  Rig: {rig.name} ({len(arm.bones)} bones)")
print(f"  FPS: {fps}")

deform_bones = [b.name for b in arm.bones if b.use_deform]
print(f"  Deform bones: {len(deform_bones)}")

# ========================================================================
# Step 3: Export function
# ========================================================================
def export_range(start_frame, end_frame, output_name):
    """Export raw world-space bone matrices for a frame range."""
    print(f"\n  Exporting {output_name}: frames {start_frame}-{end_frame}...")
    frame_count = end_frame - start_frame + 1
    bone_matrices = {b: [] for b in deform_bones}

    depsgraph = bpy.context.evaluated_depsgraph_get()

    for frame in range(start_frame, end_frame + 1):
        bpy.context.scene.frame_set(frame)
        depsgraph.update()
        rig_eval = rig.evaluated_get(depsgraph)
        for bname in deform_bones:
            ppb = rig_eval.pose.bones.get(bname)
            if not ppb:
                bone_matrices[bname].append([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
                continue
            # World-space matrix, corrected to orig model's coordinate frame
            mat_world = rig_eval.matrix_world @ ppb.matrix
            if not is_identity:
                mat_world = world_correction @ mat_world
            bone_matrices[bname].append(mat_to_flat(mat_world))
        if (frame - start_frame) % 20 == 0:
            print(f"    Frame {frame}/{end_frame}")

    # Filter out identity-only bones
    ident = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    anim_out = {}
    for bname, mats in bone_matrices.items():
        if any(any(abs(m[i] - ident[i]) > 0.001 for i in range(16)) for m in mats):
            anim_out[bname] = {"matrices": mats}

    out_data = {
        "format": "blender_raw",
        "fps": fps,
        "frame_count": frame_count,
        "bind_pose_eval": bind_eval,
        "bind_pose_rest": bind_rest,
        "animated": anim_out,
    }

    out_path = os.path.join(OUT_DIR, output_name)
    with open(out_path, 'w') as f:
        json.dump(out_data, f)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"    Written: {out_path} ({size_mb:.1f} MB, {len(anim_out)} bones, {frame_count} frames)")

# ========================================================================
# Step 4: Export
# ========================================================================
print(f"\n=== Step 3: Export ===")

if FRAME_RANGES:
    for part in FRAME_RANGES.split():
        name, rng = part.split(':')
        start, end = map(int, rng.split('-'))
        export_range(start, end, name + '.motion.json')
else:
    # Default: detect scene range
    scene_start = int(bpy.context.scene.frame_start)
    scene_end = int(bpy.context.scene.frame_end)
    export_range(scene_start, scene_end, "animation.motion.json")

print("\n=== DONE ===")
