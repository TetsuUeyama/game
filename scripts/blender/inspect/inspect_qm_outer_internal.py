"""QM_OuterBodyOnly に内蔵 mesh が残っているか確認 (crotch area で内向き normal を持つ face を検出)."""
import bpy
import bmesh
from mathutils import Vector

obj = bpy.data.objects.get("Queen Marika Body")
if not obj:
    print("ERROR: body not found"); raise SystemExit(1)

bm = bmesh.new()
bm.from_mesh(obj.data)
bm.transform(obj.matrix_world)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

# Body centroid for outward direction check
centroid = Vector((0,0,0))
for v in bm.verts: centroid += v.co
centroid /= len(bm.verts)
print(f"  body centroid: {tuple(round(c,3) for c in centroid)}")
print(f"  total faces: {len(bm.faces)}")

# Crotch region: Z 0.7-1.0, |X| < 0.15, |Y| < 0.15
crotch_faces = 0
inward_normal = 0
genital_signature = 0
for f in bm.faces:
    fc = f.calc_center_median()
    if 0.7 < fc.z < 1.0 and abs(fc.x) < 0.15 and abs(fc.y) < 0.15:
        crotch_faces += 1
        # Outward direction from centroid
        out_dir = (fc - centroid)
        if out_dir.length > 1e-6:
            out_dir.normalize()
            if f.normal.dot(out_dir) < 0:
                inward_normal += 1
        # If face is "deep" inside (close to centroid)
        if (fc - centroid).length < 0.15:
            genital_signature += 1
print(f"\n  crotch region faces: {crotch_faces}")
print(f"    inward normal (potentially internal): {inward_normal}")
print(f"    deep inside body (genital/internal candidate): {genital_signature}")

# Find face most likely "internal" — in crotch and very close to centroid
print(f"\n  suspicious internal faces (crotch + close to centroid):")
n_show = 0
for f in bm.faces:
    fc = f.calc_center_median()
    d_from_centroid = (fc - centroid).length
    if 0.7 < fc.z < 1.0 and abs(fc.x) < 0.10 and d_from_centroid < 0.13:
        print(f"    Z={fc.z:.3f}, X={fc.x:.3f}, Y={fc.y:.3f}, dist_from_centroid={d_from_centroid:.3f}")
        n_show += 1
        if n_show > 10: print("    ..."); break

bm.free()
