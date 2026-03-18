"""Re-export walk cycle with original C*M_skin*C^-1 conversion for ALL bones."""
import bpy, sys, json, os
from mathutils import Matrix

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0])

rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
          key=lambda o: len(o.data.bones))
arm = rig.data
print(f"Rig: {rig.name}")

C = Matrix([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
C_inv = Matrix([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]])

deform_bones = [b.name for b in arm.bones if b.use_deform]
bind_inv = {}
for bname in deform_bones:
    bone = arm.bones.get(bname)
    if bone:
        bind_inv[bname] = (rig.matrix_world @ bone.matrix_local).inverted()

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

ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
bones_out = {}
for bname, mats in bone_matrices.items():
    if any(any(abs(m[i]-ident[i])>0.001 for i in range(16)) for m in mats):
        bones_out[bname] = {"matrices": mats}

out_path = os.path.join(args[1], "walk_cycle_arp.motion.json")
with open(out_path, 'w') as f:
    json.dump({"fps": 30, "frame_count": frame_end-frame_start+1, "bones": bones_out}, f)

print(f"Written: {out_path} ({os.path.getsize(out_path)/1024/1024:.1f} MB, {len(bones_out)} bones)")
m = bones_out['foot.l']['matrices'][0]
print(f"foot.l[0] tx={m[3]:.4f}")
print("DONE")
