"""
Export pose motion data from QM blend file with ARP name normalization.

Usage:
  blender --background --python export_pose_qm.py -- <pose.blend> <orig.blend> <out_dir> [out_name]
"""
import bpy, sys, json, os, math
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
POSE_PATH = args[0]
ORIG_PATH = args[1]
OUT_DIR = args[2]
OUT_NAME = args[3] if len(args) > 3 else "pose_qm.motion.json"

# ARP naming normalization (same as blender_extract_bone_segments.py)
ARP_NORMALIZE = {
    'thigh_stretch': 'c_thigh_stretch',
    'thigh_twist': 'c_thigh_twist',
    'thigh_twist_2': 'c_thigh_twist_2',
    'leg_stretch': 'c_leg_stretch',
    'leg_twist': 'c_leg_twist',
    'leg_twist_2': 'c_leg_twist_2',
    'arm_stretch': 'c_arm_stretch',
    'arm_twist_2': 'c_arm_twist_2',
    'c_arm_twist_offset': 'c_arm_twist',
    'forearm_stretch': 'c_forearm_stretch',
    'forearm_twist': 'c_forearm_twist',
    'forearm_twist_2': 'c_forearm_twist_2',
    'spine_01': 'c_spine_01_bend',
    'spine_02': 'c_spine_02_bend',
    'spine_03': 'c_spine_03_bend',
    'root': 'c_root_bend',
    'cc_balls': 'c_root_bend',
}

# Face/finger merge mapping (same as blender_extract_bone_segments.py)
FACE_MERGE_PREFIXES = ('c_lips_', 'c_teeth_', 'c_nose_', 'c_chin_', 'c_cheek_',
                       'c_eyebrow_', 'c_eyelid_', 'c_eye_ref_track', 'c_eye_offset',
                       'tong_')

def normalize_arp_name(name):
    suffix = ''
    for s in ['.l', '.r', '.x']:
        if name.endswith(s):
            base = name[:-len(s)]
            suffix = s
            break
    else:
        base = name
    if base in ARP_NORMALIZE:
        return ARP_NORMALIZE[base] + suffix
    return name

def resolve_bone_name(name):
    name = normalize_arp_name(name)
    if any(name.startswith(p) for p in FACE_MERGE_PREFIXES):
        return 'head.x'
    if name.startswith('toes_') or name.startswith('c_toes_'):
        if '.l' in name: return 'foot.l'
        elif '.r' in name: return 'foot.r'
        return 'foot.l'
    finger_prefixes = ('c_pinky', 'c_ring', 'c_middle', 'c_index', 'c_thumb',
                       'pinky', 'ring1', 'middle1', 'index1', 'thumb1',
                       'c_pinky1_base', 'c_ring1_base', 'c_middle1_base', 'c_index1_base')
    if any(name.startswith(p) for p in finger_prefixes):
        if '.l' in name: return 'hand.l'
        elif '.r' in name: return 'hand.r'
    if name.startswith('vagina') or name == 'genital':
        return 'c_root_bend.x'
    if name.startswith('butt'):
        return 'c_root_bend.x'
    if name.startswith('nipple'):
        # Map to QM underscore style: breast_l, breast_r
        if '.l' in name or '_l' in name: return 'breast_l'
        if '.r' in name or '_r' in name: return 'breast_r'
        return 'breast_l'
    if name.startswith('c_lips_smile'):
        return 'head.x'
    if name.startswith('c_eye.'):
        return 'head.x'
    # Accessory bones -> skip
    if name.startswith('Necklace_') or name.startswith('belt_tail'):
        return None
    if name.startswith('lowerarm_elbow'):
        return None
    # Normalize dot vs underscore for QM-specific bones (knee, breast)
    # QM BaseBody segments use underscore: knee_l, breast_l
    if name in ('knee.l', 'knee.r'):
        return name.replace('.', '_')
    if name in ('breast.l', 'breast.r'):
        return name.replace('.', '_')
    return name

# Coordinate conversion
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# ========================================================================
# Step 1: Bind pose from original
# ========================================================================
print("=== Step 1: Bind pose ===")
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
# Step 2: Open pose file
# ========================================================================
print(f"\n=== Step 2: Open pose ===")
bpy.ops.wm.open_mainfile(filepath=POSE_PATH)

# Find QM rig by name (prefer QueenMarika_rig specifically)
rig = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and 'queenmarika' in o.name.lower().replace(' ', '').replace('_', ''):
        rig = o
        break

if not rig:
    # Fallback: exclude known non-QM rigs, pick by bone count
    exclude = ['radagon', 'spartan', 'pillarwoman']
    candidates = [o for o in bpy.data.objects
                  if o.type == 'ARMATURE' and len(o.data.bones) > 100
                  and not any(ex in o.name.lower() for ex in exclude)]
    if candidates:
        rig = max(candidates, key=lambda o: len(o.data.bones))
    else:
        armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
        rig = max(armatures, key=lambda o: len(o.data.bones))

arm = rig.data
fps = int(bpy.context.scene.render.fps)
fs = int(bpy.context.scene.frame_start)
fe = int(bpy.context.scene.frame_end)
print(f"  Rig: {rig.name} ({len(arm.bones)} bones)")
print(f"  Scene: frames {fs}-{fe}, {fps} fps")

deform_bones = [b.name for b in arm.bones if b.use_deform]

# Build bind inverse
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
print(f"  Bind inv: {len(eval_bind)} eval, {fallback} fallback")

# Show bone name mapping
print(f"\n  Bone name normalization:")
for bname in sorted(deform_bones):
    resolved = resolve_bone_name(bname)
    if resolved and resolved != bname:
        print(f"    {bname} -> {resolved}")

# ========================================================================
# Step 3: Export with normalized names
# ========================================================================
print(f"\n=== Step 3: Export ===")

frame_count = fe - fs + 1
# Collect per-original-bone matrices
raw_matrices = {b: [] for b in deform_bones}

depsgraph = bpy.context.evaluated_depsgraph_get()
for frame in range(fs, fe + 1):
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    rig_eval = rig.evaluated_get(depsgraph)
    for bname in deform_bones:
        ppb = rig_eval.pose.bones.get(bname)
        if not ppb or bname not in bind_inv:
            raw_matrices[bname].append([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
            continue
        mat_world = rig_eval.matrix_world @ ppb.matrix
        skin = mat_world @ bind_inv[bname]
        conv = C @ skin @ C_inv
        flat = [round(conv[r][c], 7) for r in range(4) for c in range(4)]
        raw_matrices[bname].append(flat)
    if (frame - fs) % 20 == 0:
        print(f"  Frame {frame}/{fe}")

# Merge bones by resolved name (pick the primary bone's matrices)
# For merged groups (fingers->hand, face->head), use the primary bone
ident = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]

resolved_groups = {}  # resolved_name -> list of (original_name, matrices)
for bname, mats in raw_matrices.items():
    resolved = resolve_bone_name(bname)
    if resolved is None:
        continue
    if resolved not in resolved_groups:
        resolved_groups[resolved] = []
    resolved_groups[resolved].append((bname, mats))

bones_out = {}
for resolved_name, group in resolved_groups.items():
    if len(group) == 1:
        bname, mats = group[0]
        if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
            bones_out[resolved_name] = {"matrices": mats}
    else:
        # Multiple bones merged into one segment
        # Use the primary bone (the one matching the resolved name, or first one)
        primary = None
        for bname, mats in group:
            if bname == resolved_name:
                primary = (bname, mats)
                break
        if not primary:
            primary = group[0]
        bname, mats = primary
        if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
            bones_out[resolved_name] = {"matrices": mats}

out_path = os.path.join(OUT_DIR, OUT_NAME)
with open(out_path, 'w') as f:
    json.dump({"fps": fps, "frame_count": frame_count, "bones": bones_out}, f)

print(f"\nWritten: {out_path} ({os.path.getsize(out_path)/1024/1024:.1f} MB, {len(bones_out)} bones, {frame_count} frames)")

# Show final bone list
print(f"\nFinal bones ({len(bones_out)}):")
for b in sorted(bones_out.keys()):
    print(f"  {b}")

print("DONE")
