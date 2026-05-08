"""Inside-only push: 衣装の「body 内部に貫通している頂点のみ」体表に押し出す。

Wrap 思想の正しい実装:
  - Body 内部 (signed_dist < OFFSET) の頂点 → 表面に押し出す
  - Body 外部 (designed gap, strap, panel, cutout) → 触らない

これにより:
  - 肩ひも・panel・cutout など意図的なギャップが保持される
  - 体貫通だけが解消される (v22 等の弱い push を補完)

入力前提:
  既に rough fit 済みの衣装 (例: v22 fit 結果) と target body が同じシーンにある。

External BVH source:
  Body に内蔵 mesh が含まれる場合 (口腔、内臓等)、find_nearest が内蔵に引き寄せる artifact あり。
  --bvh-from <blend>:<obj> で外殻のみの body mesh を別 blend から読み込んで BVH source として使用可。

Usage:
  blender --background <input.blend> --python push_inside_only.py -- \
    <out.blend> [<suit_name>] [<body_name>] [<offset_m>] [--bvh-from <blend>:<obj>]

  default suit_name: "GCC DOA Outfit Bodysuit Mesh (fit QM v22)"
  default body_name: "Queen Marika Body"
  default offset:    0.002 (2mm)
"""
import bpy
import sys
import os
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 1:
    print(__doc__); sys.exit(1)

# Parse --bvh-from option
BVH_FROM_BLEND = None
BVH_FROM_OBJ   = None
pos_args = []
i = 0
while i < len(args):
    if args[i] == '--bvh-from' and i + 1 < len(args):
        spec = args[i + 1]
        # rsplit so Windows drive letter (e.g. "F:") is not used as separator
        if ':' in spec:
            parts = spec.rsplit(':', 1)
            if len(parts) == 2:
                BVH_FROM_BLEND, BVH_FROM_OBJ = parts[0], parts[1]
        i += 2
    else:
        pos_args.append(args[i]); i += 1

OUT_BLEND = pos_args[0]
SUIT_NAME = pos_args[1] if len(pos_args) > 1 else "GCC DOA Outfit Bodysuit Mesh (fit QM v22)"
BODY_NAME = pos_args[2] if len(pos_args) > 2 else "Queen Marika Body"
OFFSET    = float(pos_args[3]) if len(pos_args) > 3 else 0.002

print(f"\n=== push_inside_only ===")
print(f"  suit  : {SUIT_NAME}")
print(f"  body  : {BODY_NAME}")
print(f"  offset: {OFFSET*1000:.1f}mm")
print(f"  output: {OUT_BLEND}")
if BVH_FROM_BLEND:
    print(f"  bvh-from: {BVH_FROM_BLEND}:{BVH_FROM_OBJ}")

# Enable layer collections + link orphan objects (1.6GB blend has both)
def enable_layer_collection(lc):
    lc.exclude = False
    lc.hide_viewport = False
    lc.collection.hide_viewport = False
    lc.collection.hide_render = False
    for child in lc.children:
        enable_layer_collection(child)
for lc in bpy.context.view_layer.layer_collection.children:
    enable_layer_collection(lc)

def link_to_scene_if_needed(obj):
    scene_objs = set()
    def collect(c):
        for o in c.objects: scene_objs.add(o.name)
        for ch in c.children: collect(ch)
    collect(bpy.context.scene.collection)
    if obj.name not in scene_objs:
        bpy.context.scene.collection.objects.link(obj)
        print(f"  linked '{obj.name}' to scene collection")

suit = bpy.data.objects.get(SUIT_NAME)
body = bpy.data.objects.get(BODY_NAME)
if suit is None or body is None:
    print(f"  ERROR: missing suit ({suit is not None}) or body ({body is not None})")
    sys.exit(1)

link_to_scene_if_needed(suit)
link_to_scene_if_needed(body)
suit.hide_viewport = False; suit.hide_set(False)
body.hide_viewport = False; body.hide_set(False)
bpy.context.view_layer.update()

# Clear shape keys on suit (mesh.co modification needs Basis only)
if suit.data.shape_keys:
    n_sk = len(suit.data.shape_keys.key_blocks)
    bpy.ops.object.select_all(action='DESELECT')
    suit.select_set(True)
    bpy.context.view_layer.objects.active = suit
    bpy.ops.object.shape_key_remove(all=True)
    print(f"  cleared {n_sk} shape keys")

# Build BVH for body. If --bvh-from specified, use that mesh instead of in-scene body.
# 内蔵 mesh が含まれる body だと find_nearest が内臓に引き寄せる artifact が発生するため、
# 外殻のみの mesh を別 blend (例: QM_OuterBodyOnly.blend) から読み込んで使う。
if BVH_FROM_BLEND:
    BVH_FROM_BLEND_ABS = os.path.abspath(BVH_FROM_BLEND)
    print(f"\n[build BVH from external: {BVH_FROM_BLEND_ABS}:{BVH_FROM_OBJ}]")
    # 同名 object 衝突対策: load 前後の差分で新規追加 object を特定
    existing_names = set(o.name for o in bpy.data.objects)
    with bpy.data.libraries.load(BVH_FROM_BLEND_ABS, link=False) as (src, dst):
        dst.objects = [BVH_FROM_OBJ]
    new_objs = [o for o in bpy.data.objects if o.name not in existing_names]
    # name は "Queen Marika Body.001" 等にリネームされている可能性あり
    bvh_obj = None
    for o in new_objs:
        if o.name == BVH_FROM_OBJ or o.name.startswith(BVH_FROM_OBJ + '.'):
            bvh_obj = o
            bpy.context.scene.collection.objects.link(o)
            o.hide_viewport = False; o.hide_set(False)
            break
    if bvh_obj is None:
        print(f"  ERROR: BVH source object {BVH_FROM_OBJ!r} not loaded.")
        print(f"  newly loaded objects: {[o.name for o in new_objs]}")
        sys.exit(1)
    print(f"  loaded as: {bvh_obj.name}")
    dg = bpy.context.evaluated_depsgraph_get()
    body_eval = bvh_obj.evaluated_get(dg)
    body_me = body_eval.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(body_me)
    bm.transform(bvh_obj.matrix_world)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body_eval.to_mesh_clear()
    body_bvh = BVHTree.FromBMesh(bm)
    print(f"  external body verts={len(bm.verts)}, faces={len(bm.faces)}")
    bm.free()
    # Cleanup: remove the temp BVH object so it doesn't appear in the saved blend
    bpy.data.objects.remove(bvh_obj, do_unlink=True)
else:
    print(f"\n[build BVH for {BODY_NAME}]")
    dg = bpy.context.evaluated_depsgraph_get()
    body_eval = body.evaluated_get(dg)
    body_me = body_eval.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(body_me)
    bm.transform(body.matrix_world)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body_eval.to_mesh_clear()
    body_bvh = BVHTree.FromBMesh(bm)
    print(f"  body verts={len(bm.verts)}, faces={len(bm.faces)}")
    bm.free()

# Push inside vertices to surface
print(f"\n[push inside vertices]")
suit_mw = suit.matrix_world
suit_mw_inv = suit_mw.inverted()

n_inside = 0
n_close = 0
n_kept = 0
max_push = 0.0
push_total = 0.0

for v in suit.data.vertices:
    wp = suit_mw @ v.co
    nearest_loc, nearest_normal, _, _ = body_bvh.find_nearest(wp)
    if nearest_loc is None:
        n_kept += 1; continue
    delta = wp - nearest_loc
    signed_dist = delta.dot(nearest_normal)
    if signed_dist < 0:
        # Inside body — push to surface + OFFSET along outward normal
        new_wp = nearest_loc + nearest_normal * OFFSET
        push = (new_wp - wp).length
        v.co = suit_mw_inv @ new_wp
        n_inside += 1
        push_total += push
        if push > max_push: max_push = push
    elif signed_dist < OFFSET:
        # Outside but too close — push to OFFSET
        new_wp = nearest_loc + nearest_normal * OFFSET
        push = (new_wp - wp).length
        v.co = suit_mw_inv @ new_wp
        n_close += 1
        push_total += push
        if push > max_push: max_push = push
    else:
        # Outside with enough clearance — keep
        n_kept += 1

n_pushed = n_inside + n_close
total = n_pushed + n_kept
print(f"  total verts: {total}")
print(f"  pushed (inside body): {n_inside} ({100*n_inside/total:.1f}%)")
print(f"  pushed (too close):   {n_close} ({100*n_close/total:.1f}%)")
print(f"  kept (designed gap):  {n_kept} ({100*n_kept/total:.1f}%)")
if n_pushed > 0:
    print(f"  avg push: {push_total/n_pushed*1000:.2f}mm, max push: {max_push*1000:.2f}mm")

# Mark mesh updated
suit.data.update()

# Save
print(f"\n[save]")
out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved: {OUT_BLEND}")
print(f"\n=== DONE ===")
