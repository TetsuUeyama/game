"""Compare bone.matrix_local (bind pose) vs evaluated pose at rest."""
import bpy, sys, math

bpy.ops.wm.open_mainfile(filepath=sys.argv[-1])
rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'], key=lambda o: len(o.data.bones))
arm = rig.data

bone = arm.bones['foot.l']
bind_mat = rig.matrix_world @ bone.matrix_local
be = bind_mat.to_euler()
bp = bind_mat.to_translation()
print(f"BIND (bone.matrix_local): rot=({math.degrees(be.x):.2f}, {math.degrees(be.y):.2f}, {math.degrees(be.z):.2f}) pos=({bp.x:.4f}, {bp.y:.4f}, {bp.z:.4f})")

depsgraph = bpy.context.evaluated_depsgraph_get()
for frame in [0, 1, 73]:
    bpy.context.scene.frame_set(frame)
    depsgraph.update()
    re = rig.evaluated_get(depsgraph)
    pb = re.pose.bones['foot.l']
    em = re.matrix_world @ pb.matrix
    ee = em.to_euler()
    ep = em.to_translation()
    dx = math.degrees(ee.x - be.x)
    dy = math.degrees(ee.y - be.y)
    dz = math.degrees(ee.z - be.z)
    print(f"EVAL frame {frame:3d}: rot=({math.degrees(ee.x):.2f}, {math.degrees(ee.y):.2f}, {math.degrees(ee.z):.2f}) pos=({ep.x:.4f}, {ep.y:.4f}, {ep.z:.4f}) DIFF=({dx:.2f}, {dy:.2f}, {dz:.2f})")

# Also check the original model file
print()
bpy.ops.wm.open_mainfile(filepath='E:/MOdel/CyberpunkElf_ARP_MustardUI.blend')
rig2 = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and len(o.data.bones) > 100:
        rig2 = o
        break
if rig2:
    bone2 = rig2.data.bones.get('foot.l')
    if bone2:
        bm2 = rig2.matrix_world @ bone2.matrix_local
        be2 = bm2.to_euler()
        bp2 = bm2.to_translation()
        print(f"ORIGINAL MODEL BIND: rot=({math.degrees(be2.x):.2f}, {math.degrees(be2.y):.2f}, {math.degrees(be2.z):.2f}) pos=({bp2.x:.4f}, {bp2.y:.4f}, {bp2.z:.4f})")

        depsgraph2 = bpy.context.evaluated_depsgraph_get()
        bpy.context.scene.frame_set(0)
        depsgraph2.update()
        re2 = rig2.evaluated_get(depsgraph2)
        pb2 = re2.pose.bones.get('foot.l')
        if pb2:
            em2 = re2.matrix_world @ pb2.matrix
            ee2 = em2.to_euler()
            dx2 = math.degrees(ee2.x - be2.x)
            dy2 = math.degrees(ee2.y - be2.y)
            dz2 = math.degrees(ee2.z - be2.z)
            print(f"ORIGINAL MODEL EVAL: rot=({math.degrees(ee2.x):.2f}, {math.degrees(ee2.y):.2f}, {math.degrees(ee2.z):.2f}) DIFF=({dx2:.2f}, {dy2:.2f}, {dz2:.2f})")
    else:
        print("foot.l not found in original model")
else:
    print("No rig found in original model")

print("END")
