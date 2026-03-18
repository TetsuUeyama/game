"""
Export motion from a different rig, remapping bone names to CyberpunkElf convention.
Uses evaluated bind pose from CyberpunkElf original model.
"""
import bpy, sys, json, os, math
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
MOTION_PATH = args[0]  # Blend file with motion
ORIG_PATH = args[1]    # CyberpunkElf original model (bind pose source)
OUT_DIR = args[2]
OUT_NAME = args[3] if len(args) > 3 else "remapped.motion.json"

# QueenMarika -> CyberpunkElf bone name mapping
BONE_REMAP = {
    'breast_l': 'breast.l',
    'breast_r': 'breast.r',
    'butt_l': 'butt.l',
    'butt_r': 'butt.r',
    'nipple_l': 'nipple.l',
    'nipple_r': 'nipple.r',
    'c_toes_index1.l': 'c_toes_index1_base.l',
    'c_toes_index1.r': 'c_toes_index1_base.r',
    'c_toes_middle1.l': 'c_toes_middle1_base.l',
    'c_toes_middle1.r': 'c_toes_middle1_base.r',
    'c_toes_pinky1.l': 'c_toes_pinky1_base.l',
    'c_toes_pinky1.r': 'c_toes_pinky1_base.r',
    'c_toes_ring1.l': 'c_toes_ring1_base.l',
    'c_toes_ring1.r': 'c_toes_ring1_base.r',
    'c_toes_thumb1.l': 'c_toes_thumb1_base.l',
    'c_toes_thumb1.r': 'c_toes_thumb1_base.r',
}

# ========================================================================
# Step 1: Get evaluated bind pose from CyberpunkElf
# ========================================================================
print("=== Step 1: CyberpunkElf evaluated bind pose ===")
bpy.ops.wm.open_mainfile(filepath=ORIG_PATH)

orig_rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        orig_rig = o
        break

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

print(f"  CyberpunkElf bind pose: {len(eval_bind)} deform bones")

# ========================================================================
# Step 2: Open motion file
# ========================================================================
print(f"\n=== Step 2: Open motion file ===")
bpy.ops.wm.open_mainfile(filepath=MOTION_PATH)

rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Motion rig: {rig.name} ({len(arm.bones)} bones)")

fs = int(bpy.context.scene.frame_start)
fe = int(bpy.context.scene.frame_end)
fps = bpy.context.scene.render.fps
print(f"Frames: {fs}-{fe} ({fe-fs+1} frames, {fps} fps)")

# Build source deform bone list
src_deform = [b.name for b in arm.bones if b.use_deform]
print(f"Source deform bones: {len(src_deform)}")

# Build remapped name list and bind inverse
# For each source bone, determine target name (CyberpunkElf name)
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# Bind inverse: use CyberpunkElf's evaluated bind for the TARGET bone name
# For source bones that exist in CyberpunkElf (same name or remapped),
# use CyberpunkElf's bind pose. This ensures the skinning matrix
# transforms FROM CyberpunkElf's rest pose.
bind_inv = {}
target_names = {}  # src_name -> target_name
matched = 0
remapped = 0
skipped = 0

for src_name in src_deform:
    # Determine target name
    if src_name in eval_bind:
        target = src_name
        matched += 1
    elif src_name in BONE_REMAP and BONE_REMAP[src_name] in eval_bind:
        target = BONE_REMAP[src_name]
        remapped += 1
    else:
        skipped += 1
        continue

    target_names[src_name] = target
    bind_inv[src_name] = eval_bind[target].inverted()

print(f"  Matched: {matched}, Remapped: {remapped}, Skipped: {skipped}")
print(f"  Total exportable: {len(target_names)}")

# Show remapped bones
if remapped > 0:
    print(f"\n  Remapped bones:")
    for src, tgt in sorted(target_names.items()):
        if src != tgt:
            print(f"    {src} -> {tgt}")

# ========================================================================
# Step 3: Export
# ========================================================================
print(f"\n=== Step 3: Export ===")
depsgraph = bpy.context.evaluated_depsgraph_get()
bone_matrices = {src: [] for src in target_names}

for frame in range(fs, fe + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)

    for src_name in target_names:
        pb = rig_eval.pose.bones.get(src_name)
        if not pb:
            bone_matrices[src_name].append([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
            continue

        mat_world = rig_eval.matrix_world @ pb.matrix
        skin = mat_world @ bind_inv[src_name]
        conv = C @ skin @ C_inv
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[src_name].append(flat)

    if (frame - fs) % 50 == 0:
        print(f"  Frame {frame}/{fe}")

# Write with TARGET names (CyberpunkElf convention)
ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
bones_out = {}
for src_name, mats in bone_matrices.items():
    tgt_name = target_names[src_name]
    if any(any(abs(m[i]-ident[i]) > 0.001 for i in range(16)) for m in mats):
        bones_out[tgt_name] = {"matrices": mats}

frame_count = fe - fs + 1
out_path = os.path.join(OUT_DIR, OUT_NAME)
with open(out_path, 'w') as f:
    json.dump({"fps": fps, "frame_count": frame_count, "bones": bones_out}, f)

sz = os.path.getsize(out_path) / 1024 / 1024
print(f"\nWritten: {out_path} ({sz:.1f} MB, {len(bones_out)} bones, {frame_count} frames)")
print("DONE")
