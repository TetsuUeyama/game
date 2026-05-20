"""Mesh Deform Modifier retarget pipeline.

Concept:
  1. Use Rachel Female body as a low-poly cage
  2. Each garment gets Mesh Deform modifier bound to Rachel body cage
  3. Cage (Rachel body) is shrinkwrapped to QM body shape
  4. Mesh Deform recomputes garment verts based on cage deformation
  5. Apply all modifiers, save, voxelize

Mesh Deform binds verts to tetrahedra inside the cage. As cage deforms,
verts move accordingly. Smoother than Surface Deform (which only uses
nearest face) for shape transfer.

Usage:
  blender --background <rachel_blend> --python mesh_deform_retarget.py -- \
    <qm_blend> <qm_body_name> <rachel_body_name> <out_blend> <garment1> [<garment2> ...] \
    [--precision 4]
"""
import bpy
import sys
import os


argv = sys.argv
idx = argv.index('--') if '--' in argv else len(argv)
args = argv[idx + 1:]
if len(args) < 5:
    print(__doc__); sys.exit(1)

QM_BLEND = args[0]
QM_BODY = args[1]
RACHEL_BODY = args[2]
OUT_BLEND = args[3]
GARMENTS = []
PRECISION = 4

i = 4
while i < len(args):
    if args[i] == '--precision' and i + 1 < len(args):
        PRECISION = int(args[i + 1]); i += 2
    else:
        GARMENTS.append(args[i]); i += 1


def remove_modifier_by_name(obj, name):
    m = obj.modifiers.get(name)
    if m is not None: obj.modifiers.remove(m)


def remove_modifiers_by_type(obj, mod_type):
    for m in list(obj.modifiers):
        if m.type == mod_type:
            obj.modifiers.remove(m)


def remove_shape_keys(obj):
    if obj.data.shape_keys is not None:
        obj.shape_key_clear()


def ensure_in_view_layer(obj):
    scene_coll = bpy.context.scene.collection
    if obj.name not in scene_coll.objects:
        scene_coll.objects.link(obj)
    obj.hide_viewport = False
    obj.hide_set(False)


def apply_modifier(obj, mod_name):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.data.objects: o.select_set(False)
    obj.select_set(True)
    remove_shape_keys(obj)
    bpy.ops.object.modifier_apply(modifier=mod_name)


def append_object_from_blend(blend_path, obj_name):
    if obj_name in bpy.data.objects:
        print(f"  {obj_name!r} already exists")
        return bpy.data.objects[obj_name]
    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        if obj_name not in data_from.objects:
            print(f"  ERROR: {obj_name!r} not in {blend_path}")
            return None
        data_to.objects = [obj_name]
    for o in data_to.objects:
        if o is not None:
            bpy.context.scene.collection.objects.link(o)
            return o
    return None


def main():
    print(f"=== Mesh Deform Retarget ===")
    print(f"  precision: {PRECISION}")
    print(f"  garments: {GARMENTS}")

    # 1. Append QM body
    print(f"\n[1] Append {QM_BODY}")
    qm = append_object_from_blend(QM_BLEND, QM_BODY)
    if qm is None: sys.exit(1)
    # Strip modifiers from QM
    for nm in [m.name for m in qm.modifiers]:
        m = qm.modifiers.get(nm)
        if m is None: continue
        try:
            bpy.context.view_layer.objects.active = qm
            qm.select_set(True)
            bpy.ops.object.modifier_apply(modifier=nm)
        except Exception:
            qm.modifiers.remove(m)
    print(f"  QM body: {len(qm.data.vertices)} verts")

    # 2. Prepare Rachel body as cage
    print(f"\n[2] Prepare cage {RACHEL_BODY}")
    cage = bpy.data.objects.get(RACHEL_BODY)
    if cage is None: print(f"FATAL: {RACHEL_BODY} not found"); sys.exit(1)
    ensure_in_view_layer(cage)
    remove_shape_keys(cage)
    # Strip subsurf/multires (cage needs base mesh)
    rm = [m.name for m in cage.modifiers if m.type in ('SUBSURF', 'MULTIRES')]
    for nm in rm:
        m = cage.modifiers.get(nm)
        if m is not None: cage.modifiers.remove(m)
    print(f"  cage: {len(cage.data.vertices)} verts")

    # 3. Bind each garment via Mesh Deform to cage
    print(f"\n[3] Bind garments to cage")
    bound = []
    for gname in GARMENTS:
        g = bpy.data.objects.get(gname)
        if g is None:
            print(f"  SKIP {gname}: not found"); continue
        ensure_in_view_layer(g)
        # Strip extras
        rm = [m.name for m in g.modifiers if m.type in ('SUBSURF', 'MULTIRES', 'MESH_DEFORM', 'SURFACE_DEFORM')]
        for nm in rm:
            m = g.modifiers.get(nm)
            if m is not None: g.modifiers.remove(m)
        remove_shape_keys(g)
        md = g.modifiers.new(name='MD_to_cage', type='MESH_DEFORM')
        md.object = cage
        md.precision = PRECISION
        md.use_dynamic_bind = False
        bpy.context.view_layer.objects.active = g
        for o in bpy.data.objects: o.select_set(False)
        g.select_set(True)
        print(f"  binding {gname} ({len(g.data.vertices)} verts, cage precision {PRECISION})...", flush=True)
        try:
            bpy.ops.object.meshdeform_bind(modifier=md.name)
        except Exception as e:
            print(f"  FAIL {gname}: {e}"); continue
        if not md.is_bound:
            print(f"  WARN {gname}: bind=False (cage may not enclose mesh)")
            continue
        print(f"  ✓ {gname}")
        bound.append(gname)

    # 4. Shrinkwrap cage to QM body
    print(f"\n[4] Shrinkwrap cage to QM body")
    remove_modifier_by_name(cage, 'SW_to_qm')
    sw = cage.modifiers.new(name='SW_to_qm', type='SHRINKWRAP')
    sw.target = qm
    sw.wrap_method = 'NEAREST_SURFACEPOINT'
    sw.offset = 0.0
    apply_modifier(cage, 'SW_to_qm')
    bpy.context.view_layer.update()
    print(f"  Cage deformed")

    # 5. Apply MD on each garment
    print(f"\n[5] Apply MeshDeform on garments")
    for gname in bound:
        g = bpy.data.objects.get(gname)
        if g is None: continue
        try:
            apply_modifier(g, 'MD_to_cage')
            print(f"  ✓ {gname}")
        except RuntimeError as e:
            print(f"  WARN {gname}: {e}")

    # 6. Save
    print(f"\n[6] Save")
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  Saved {OUT_BLEND}")


if __name__ == '__main__':
    main()
