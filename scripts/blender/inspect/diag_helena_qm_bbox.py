"""Helena_Final_QM.blend の各メッシュ bbox + 主要 bone 位置を出力。

LBS retarget の効果検証用。
Usage:
  blender --background <Helena_Final_QM.blend> --python diag_helena_qm_bbox.py
"""
import bpy
from mathutils import Vector

print("\n=== diag_helena_qm_bbox ===")

# Mesh bboxes (world)
print("\nMeshes:")
target_meshes = ['Helena_Base', 'Hair Mesh', 'Eyelashes',
                 'GCC DOA Outfit Bodysuit Mesh',
                 'Qipao Mesh']
for n in target_meshes:
    o = bpy.data.objects.get(n)
    if o is None:
        print(f"  {n}: NOT FOUND")
        continue
    if o.type != 'MESH':
        continue
    mw = o.matrix_world
    if not o.data.vertices:
        print(f"  {n}: empty"); continue
    xs, ys, zs = [], [], []
    for v in o.data.vertices:
        w = mw @ v.co
        xs.append(w.x); ys.append(w.y); zs.append(w.z)
    print(f"  {n}: verts={len(o.data.vertices)}")
    print(f"    bbox x[{min(xs):+.4f}, {max(xs):+.4f}] dx={max(xs)-min(xs):.4f}")
    print(f"         y[{min(ys):+.4f}, {max(ys):+.4f}] dy={max(ys)-min(ys):.4f}")
    print(f"         z[{min(zs):+.4f}, {max(zs):+.4f}] dz={max(zs)-min(zs):.4f}")

# Reference bone heights
print("\nQM bones (world Z, head):")
arm = bpy.data.objects.get('QueenMarika_rig')
if arm:
    for bn in ('c_root_bend.x', 'c_spine_03_bend.x', 'shoulder.l', 'head.x',
               'foot.l', 'hand.l', 'c_thigh_stretch.l', 'c_leg_stretch.l'):
        b = arm.data.bones.get(bn)
        if b is None: continue
        h = arm.matrix_world @ b.head_local
        t = arm.matrix_world @ b.tail_local
        L = (t - h).length
        print(f"  {bn}: head_z={h.z:+.4f} length={L:.4f}")

print("\n=== DONE ===")
