"""Check IK/FK status and export pose motion data."""
import bpy, sys, json, os, math
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
POSE_PATH = args[0]
ORIG_PATH = args[1]  # Original model for evaluated bind pose
OUT_DIR = args[2]
OUT_NAME = args[3] if len(args) > 3 else "pose_01.motion.json"

# ========================================================================
# Step 1: Get evaluated bind pose from original model
# ========================================================================
print("=== Step 1: Evaluated bind pose from original model ===")
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

print(f"  Bind pose: {len(eval_bind)} deform bones")

# ========================================================================
# Step 2: Open pose file and analyze
# ========================================================================
print(f"\n=== Step 2: Analyze pose file ===")
bpy.ops.wm.open_mainfile(filepath=POSE_PATH)

# Find rig
rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        rig = o
        break

if not rig:
    # Try largest armature
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if armatures:
        rig = max(armatures, key=lambda o: len(o.data.bones))

if not rig:
    print("ERROR: No armature found!")
    sys.exit(1)

arm = rig.data
print(f"Rig: {rig.name} ({len(arm.bones)} bones)")

# Scene info
fs = int(bpy.context.scene.frame_start)
fe = int(bpy.context.scene.frame_end)
fps = bpy.context.scene.render.fps
print(f"Scene: frames {fs}-{fe}, {fps} fps")

# IK/FK status
print(f"\n--- IK/FK Status ---")
for bname in ['c_foot_ik.l', 'c_foot_ik.r', 'c_hand_ik.l', 'c_hand_ik.r']:
    pb = rig.pose.bones.get(bname)
    if pb and 'ik_fk_switch' in pb:
        val = pb['ik_fk_switch']
        mode = 'IK' if val >= 0.5 else 'FK'
        print(f"  {bname}: ik_fk_switch={val} -> {mode}")

# Actions
print(f"\n--- Actions ---")
def get_fcurves(action):
    if hasattr(action, 'fcurves') and action.fcurves:
        return list(action.fcurves)
    if hasattr(action, 'layers'):
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves.extend(bag.fcurves)
        return curves
    return []

for action in sorted(bpy.data.actions, key=lambda a: a.name):
    fcs = get_fcurves(action)
    fr = action.frame_range
    foot_ik = len([fc for fc in fcs if 'c_foot_ik' in fc.data_path])
    foot_fk = len([fc for fc in fcs if 'c_foot_fk' in fc.data_path])
    print(f"  {action.name}: frames={fr[0]:.0f}-{fr[1]:.0f} fcurves={len(fcs)} c_foot_ik={foot_ik} c_foot_fk={foot_fk}")

# Active action and NLA
if rig.animation_data:
    act = rig.animation_data.action
    print(f"\nActive action: {act.name if act else 'None'}")
    if rig.animation_data.nla_tracks:
        print(f"NLA tracks: {len(rig.animation_data.nla_tracks)}")
        for track in rig.animation_data.nla_tracks:
            print(f"  {track.name} (mute={track.mute})")
            for strip in track.strips:
                print(f"    {strip.name}: action={strip.action.name if strip.action else 'None'} frames={strip.frame_start:.0f}-{strip.frame_end:.0f}")

# Check foot constraints
print(f"\n--- foot.l Constraints ---")
pb = rig.pose.bones.get('foot.l')
if pb:
    for c in pb.constraints:
        print(f"  [{c.type}] {c.name}: influence={c.influence:.3f} target_space={getattr(c,'target_space','?')} subtarget={getattr(c,'subtarget','')}")

# Evaluate and check foot at key frames
print(f"\n--- Foot evaluation ---")
depsgraph = bpy.context.evaluated_depsgraph_get()
for frame in range(fs, min(fe+1, fs+5)):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    re = rig.evaluated_get(depsgraph)
    for bname in ['c_foot_ik.l', 'foot_ik.l', 'foot_fk.l', 'foot.l']:
        ppb = re.pose.bones.get(bname)
        if ppb:
            mat = re.matrix_world @ ppb.matrix
            e = mat.to_euler()
            t = mat.to_translation()
            print(f"  f={frame} {bname:15s} rot=({math.degrees(e.x):.1f},{math.degrees(e.y):.1f},{math.degrees(e.z):.1f}) pos=({t.x:.3f},{t.y:.3f},{t.z:.3f})")
    print()

# ========================================================================
# Step 3: Export
# ========================================================================
print(f"=== Step 3: Export ===")

C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

deform_bones = [b.name for b in arm.bones if b.use_deform]

# Use evaluated bind from original model
bind_inv = {}
fallback = 0
for bname in deform_bones:
    if bname in eval_bind:
        bind_inv[bname] = eval_bind[bname].inverted()
    else:
        bone = arm.bones.get(bname)
        if bone:
            bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()
            fallback += 1
print(f"  Bind: {len(eval_bind)} eval, {fallback} fallback")

frame_count = fe - fs + 1
bone_matrices = {b: [] for b in deform_bones}

for frame in range(fs, fe + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    for bname in deform_bones:
        ppb = rig_eval.pose.bones.get(bname)
        if not ppb or bname not in bind_inv:
            bone_matrices[bname].append([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
            continue
        mat_world = rig_eval.matrix_world @ ppb.matrix
        skin = mat_world @ bind_inv[bname]
        conv = C @ skin @ C_inv
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[bname].append(flat)
    if (frame - fs) % 20 == 0:
        print(f"  Frame {frame}/{fe}")

ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
bones_out = {}
for bname, mats in bone_matrices.items():
    if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
        bones_out[bname] = {"matrices": mats}

out_path = os.path.join(OUT_DIR, OUT_NAME)
with open(out_path, 'w') as f:
    json.dump({"fps": fps, "frame_count": frame_count, "bones": bones_out}, f)

print(f"\nWritten: {out_path} ({os.path.getsize(out_path)/1024/1024:.1f} MB, {len(bones_out)} bones, {frame_count} frames)")
print("DONE")
