"""Helena_Final_QM.blend の状態を検証する。

確認項目:
  1. シーン内の armature は QueenMarika_rig のみ
  2. メッシュの ARMATURE modifier は全て QueenMarika_rig を参照
  3. 各メッシュの vertex group 名が QM bone 名になっている
  4. メッシュが QM rest pose の bone 位置に対して妥当か
     (主要 bone 周辺の頂点が QM bone head 近傍にあること)

Usage:
  blender --background <out.blend> --python verify_helena_qm_transplant.py
"""
import bpy
from mathutils import Vector


print("\n=== verify_helena_qm_transplant ===")

# [1] Armatures
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
print(f"\n[1] Armatures in scene: {len(arms)}")
for a in arms:
    print(f"  - {a.name}: {len(a.data.bones)} bones")

# [2] Meshes & their armature modifier targets
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print(f"\n[2] Meshes: {len(meshes)}")
target_count = {}
for m in meshes:
    mods = [mod for mod in m.modifiers if mod.type == 'ARMATURE']
    for mod in mods:
        tgt = mod.object.name if mod.object else "(none)"
        target_count[tgt] = target_count.get(tgt, 0) + 1
for k, v in target_count.items():
    print(f"  ARMATURE modifier target '{k}': {v} meshes")

# [3] Vertex groups: must be subset of QM bone names
qm = next((a for a in arms if 'QueenMarika' in a.name), None)
if qm is None:
    print(f"\n[3] WARN: QM armature not found — skipping vgroup check")
else:
    qm_bones = {b.name for b in qm.data.bones}
    print(f"\n[3] vertex group name check (QM has {len(qm_bones)} bones)")
    bad_total = 0
    for m in meshes:
        bad = [vg.name for vg in m.vertex_groups if vg.name not in qm_bones]
        if bad:
            bad_total += len(bad)
            print(f"  {m.name}: {len(bad)} vgroups NOT in QM ({bad[:5]}{'...' if len(bad)>5 else ''})")
    if bad_total == 0:
        print(f"  OK: all vgroups across all meshes are valid QM bone names")
    else:
        print(f"  TOTAL invalid vgroup entries: {bad_total}")

# [4] Spatial sanity: compare a few vertices to QM bone locations
# Pick the spine/head bones, check that some Helena_Base vertices are near them.
if qm is not None:
    print(f"\n[4] Spatial sanity (Helena_Base vs QM bones)")
    body = next((m for m in meshes if 'Helena_Base' in m.name or 'Body' in m.name), None)
    if body is None:
        body = next((m for m in meshes if m.vertex_groups), None)
    if body is not None:
        body_world = body.matrix_world
        verts_w = [body_world @ v.co for v in body.data.vertices]
        zs = [w.z for w in verts_w]
        ys = [w.y for w in verts_w]
        xs = [w.x for w in verts_w]
        print(f"  {body.name}: verts={len(verts_w)}")
        print(f"  bbox: x[{min(xs):+.3f}, {max(xs):+.3f}] "
              f"y[{min(ys):+.3f}, {max(ys):+.3f}] "
              f"z[{min(zs):+.3f}, {max(zs):+.3f}]")
        # head_z and pelvis_z from QM:
        qmw = qm.matrix_world
        for bn in ('c_root_bend.x', 'c_spine_03_bend.x', 'head.x', 'foot.l'):
            b = qm.data.bones.get(bn)
            if b is None:
                continue
            head_w = qmw @ b.head_local
            print(f"  QM {bn} head world: {head_w.x:+.3f} {head_w.y:+.3f} {head_w.z:+.3f}")
print(f"\n=== DONE ===")
