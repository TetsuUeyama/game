"""
Re-export walk cycle using EVALUATED rest pose as bind pose.

The voxels were extracted from the original model with constraints active,
so the bind pose must match that evaluated pose, NOT bone.matrix_local.
"""
import bpy, sys, json, os, math
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
WALK_PATH = args[0]   # Walk cycle blend
ORIG_PATH = args[1]   # Original model (voxel source)
OUT_DIR = args[2]

# ========================================================================
# Step 1: Get evaluated rest pose from ORIGINAL model (voxel source)
# ========================================================================
print("=== Step 1: Get evaluated bind pose from original model ===")
bpy.ops.wm.open_mainfile(filepath=ORIG_PATH)

orig_rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        orig_rig = o
        break

if not orig_rig:
    print("ERROR: No rig in original model")
    sys.exit(1)

depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.scene.frame_set(0)
depsgraph.update()
orig_eval = orig_rig.evaluated_get(depsgraph)

# Store evaluated world matrices for all deform bones
eval_bind = {}
for bone in orig_rig.data.bones:
    if bone.use_deform:
        pb = orig_eval.pose.bones.get(bone.name)
        if pb:
            eval_bind[bone.name] = (orig_eval.matrix_world @ pb.matrix).copy()

print(f"  Captured evaluated bind pose for {len(eval_bind)} deform bones")

# Show foot comparison
bone_local = orig_rig.matrix_world @ orig_rig.data.bones['foot.l'].matrix_local
eval_mat = eval_bind['foot.l']
bl_e = bone_local.to_euler()
ev_e = eval_mat.to_euler()
print(f"  foot.l bone.matrix_local: ({math.degrees(bl_e.x):.1f}, {math.degrees(bl_e.y):.1f}, {math.degrees(bl_e.z):.1f})")
print(f"  foot.l evaluated:         ({math.degrees(ev_e.x):.1f}, {math.degrees(ev_e.y):.1f}, {math.degrees(ev_e.z):.1f})")
print(f"  DIFF: ({math.degrees(ev_e.x-bl_e.x):.1f}, {math.degrees(ev_e.y-bl_e.y):.1f}, {math.degrees(ev_e.z-bl_e.z):.1f})")

# ========================================================================
# Step 2: Open walk cycle and export with corrected bind pose
# ========================================================================
print("\n=== Step 2: Export walk cycle with corrected bind ===")
bpy.ops.wm.open_mainfile(filepath=WALK_PATH)

rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Walk rig: {rig.name}")

C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

deform_bones = [b.name for b in arm.bones if b.use_deform]

# Build bind inverse using EVALUATED pose from original model
bind_inv = {}
fallback_count = 0
for bname in deform_bones:
    if bname in eval_bind:
        bind_inv[bname] = eval_bind[bname].inverted()
    else:
        # Fallback to bone.matrix_local for bones not in original model
        bone = arm.bones.get(bname)
        if bone:
            bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()
            fallback_count += 1

print(f"  Eval bind: {len(eval_bind)} bones, fallback: {fallback_count}")

# Sample frames
frame_start, frame_end = 73, 144
bone_matrices = {b: [] for b in deform_bones}
depsgraph = bpy.context.evaluated_depsgraph_get()

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
ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
bones_out = {}
for bname, mats in bone_matrices.items():
    if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
        bones_out[bname] = {"matrices": mats}

out_path = os.path.join(OUT_DIR, "walk_cycle_arp.motion.json")
bak = out_path + ".bak"
if os.path.exists(out_path):
    if os.path.exists(bak):
        os.remove(bak)
    os.rename(out_path, bak)

with open(out_path, 'w') as f:
    json.dump({"fps": 30, "frame_count": frame_end-frame_start+1, "bones": bones_out}, f)

print(f"\nWritten: {out_path} ({os.path.getsize(out_path)/1024/1024:.1f} MB)")

# Compare
new = bones_out.get('foot.l', {}).get('matrices', [[]])[0]
if new:
    print(f"\nfoot.l frame 0 NEW (eval bind):")
    for r in range(3):
        print(f"  [{new[r*4]:.4f}, {new[r*4+1]:.4f}, {new[r*4+2]:.4f}, {new[r*4+3]:.4f}]")
try:
    with open(bak) as f:
        old = json.load(f)['bones']['foot.l']['matrices'][0]
    print(f"foot.l frame 0 OLD (matrix_local bind):")
    for r in range(3):
        print(f"  [{old[r*4]:.4f}, {old[r*4+1]:.4f}, {old[r*4+2]:.4f}, {old[r*4+3]:.4f}]")
except:
    pass

print("\nDONE")
