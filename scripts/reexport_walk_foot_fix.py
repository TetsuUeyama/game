"""
Re-export walk cycle with corrected foot skinning matrices.

For foot.l/foot.r: use P*M_skin*P^-1 (full viewer-space conversion)
For all other bones: use C*M_skin*C^-1 (axis-only conversion, matches original)

P = full Blender-to-viewer transform (scale + offset + axis swap)
C = axis-only swap (x,y,z) -> (x,z,-y)
"""
import bpy, sys, json, os
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
BLEND_PATH = args[0]
OUT_DIR = args[1]

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Rig: {rig.name}")

# Load segments.json for viewer space parameters
seg_path = r"C:\Users\user\developsecond\game-assets\vox\female\BasicBodyFemale\segments.json"
with open(seg_path, 'r') as f:
    seg = json.load(f)

SCALE = 0.010
vs = seg['voxel_size']  # 0.007
bb_min = seg['bb_min']
gx, gy = seg['grid']['gx'], seg['grid']['gy']
cx_grid = gx / 2.0
cy_grid = gy / 2.0
s = SCALE / vs  # ~1.4286

print(f"Viewer params: SCALE={SCALE}, vs={vs}, s={s:.4f}")
print(f"  bb_min=({bb_min[0]:.4f}, {bb_min[1]:.4f}, {bb_min[2]:.4f})")
print(f"  grid=({gx}, {gy}), cx={cx_grid}, cy={cy_grid}")

# P: Blender world -> Viewer space
# viewer_x = s*(bx - bb_min[0]) - cx_grid*SCALE
# viewer_y = s*(bz - bb_min[2])
# viewer_z = -(s*(by - bb_min[1]) - cy_grid*SCALE)
P = Matrix([
    [s,  0,  0, -s*bb_min[0] - cx_grid*SCALE],
    [0,  0,  s, -s*bb_min[2]],
    [0, -s,  0,  s*bb_min[1] + cy_grid*SCALE],
    [0,  0,  0,  1],
])
P_inv = P.inverted()

# Verify P
test_vox = [151, 33, 28]  # foot.l head_voxel
test_blender = [bb_min[0] + test_vox[0]*vs, bb_min[1] + test_vox[1]*vs, bb_min[2] + test_vox[2]*vs]
from mathutils import Vector
test_result = P @ Vector((*test_blender, 1))
test_viewer = [(test_vox[0]-cx_grid)*SCALE, test_vox[2]*SCALE, -(test_vox[1]-cy_grid)*SCALE]
print(f"\nP verification (foot.l head):")
print(f"  P*blender: ({test_result.x:.4f}, {test_result.y:.4f}, {test_result.z:.4f})")
print(f"  expected:  ({test_viewer[0]:.4f}, {test_viewer[1]:.4f}, {test_viewer[2]:.4f})")
match = all(abs(test_result[i] - test_viewer[i]) < 0.01 for i in range(3))
print(f"  match: {'YES' if match else 'NO'}")

# C: axis-only swap (original conversion)
C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

# Bones to use full P conversion (foot only)
FULL_P_BONES = {'foot.l', 'foot.r'}

# Deform bones and bind pose
deform_bones = [b.name for b in arm.bones if b.use_deform]
bind_inv = {}
for bname in deform_bones:
    bone = arm.bones.get(bname)
    if bone:
        bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()

# Sample frames
frame_start, frame_end = 73, 144
frame_count = frame_end - frame_start + 1
print(f"\nSampling {len(deform_bones)} bones, {frame_count} frames...")

depsgraph = bpy.context.evaluated_depsgraph_get()
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
        skin_mat = mat_world @ bind_inv[bname]

        # Choose conversion based on bone
        if bname in FULL_P_BONES:
            converted = P @ skin_mat @ P_inv
        else:
            converted = C @ skin_mat @ C_inv

        flat = [round(converted[r][c], 7) for r in range(4) for c in range(4)]
        bone_matrices[bname].append(flat)

    if (frame - frame_start) % 20 == 0:
        print(f"  Frame {frame}/{frame_end}")

# Filter and write
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
    json.dump({"fps": 30, "frame_count": frame_count, "bones": bones_out}, f)

sz = os.path.getsize(out_path)/1024/1024
print(f"\nWritten: {out_path} ({sz:.1f} MB, {len(bones_out)} bones)")

# Compare foot.l old vs new
print("\n=== foot.l frame 0 comparison ===")
if 'foot.l' in bones_out:
    new = bones_out['foot.l']['matrices'][0]
    print(f"NEW (P*M*P^-1):")
    for r in range(3):
        print(f"  [{new[r*4]:.4f}, {new[r*4+1]:.4f}, {new[r*4+2]:.4f}, {new[r*4+3]:.4f}]")

try:
    with open(bak, 'r') as f:
        old_data = json.load(f)
    old = old_data['bones']['foot.l']['matrices'][0]
    print(f"OLD (C*M*C^-1):")
    for r in range(3):
        print(f"  [{old[r*4]:.4f}, {old[r*4+1]:.4f}, {old[r*4+2]:.4f}, {old[r*4+3]:.4f}]")
except:
    pass

print("\nDONE")
