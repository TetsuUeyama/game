"""Offset 保存 Wrap clothing transfer (v2).

設計書: scripts/blender/fitting/CLOTHING_TRANSFER_DESIGN.md

3 軸固定原則:
  - 対応:    cloth vertex → source body の (face_idx, barycentric) を一回だけ計算
  - 座標系:  offset を TBN frame で記録 (world 空間依存なし)
  - スケール: bone length 比で offset を補正

Pipeline:
  [1] Append source body + cloth + armature into target scene
  [2] Build TPS coefficients (source/target bone landmarks for face-mapping)
  [3] Compute correspondence: per cloth vertex の (face_idx, bary, offset_TBN, scale)
  [4] Reproject to target:
      - TPS-map source nearest_loc → target world
      - Find nearest target face + TBN
      - Reproject offset with scale
      - Collision guard (outward-only push)
  [5] Re-target armature to target rig + Weight Transfer
  [6] Save

Usage:
  blender --background <target.blend> --python transfer_clothing_v2.py -- \
    <config.json> <src.blend> <src_body> <src_cloth> \
    <tgt_body> <tgt_armature> <out.blend>
"""
import bpy
import bmesh
import sys
import os
import json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 7:
    print(__doc__); sys.exit(1)

CONFIG_JSON  = args[0]
SRC_BLEND    = args[1]
SRC_BODY     = args[2]
SRC_CLOTH    = args[3]
TGT_BODY     = args[4]
TGT_ARMATURE = args[5]
OUT_BLEND    = args[6]

# Optional flags
TGT_OUTER_BVH = None   # path to outer-only body blend (for collision BVH)
TGT_OUTER_OBJ = None
i = 7
while i < len(args):
    a = args[i]
    if a == '--tgt-outer-bvh' and i + 1 < len(args):
        spec = args[i + 1]
        # Drive letter colon protection (rsplit)
        parts = spec.rsplit(':', 1)
        if len(parts) == 2:
            TGT_OUTER_BVH, TGT_OUTER_OBJ = parts[0], parts[1]
        i += 2
    else:
        i += 1

# Constants
EPS_AREA   = 1e-6   # m² (face area collapse threshold)
MIN_OFFSET = 0.002  # m (collision guard outward push)
TPS_LAMBDA = 0.001  # TPS regularization
TPS_SAMPLES_PER_BONE = 6

print(f"\n=== transfer_clothing_v2 ===")
print(f"  config   : {CONFIG_JSON}")
print(f"  source   : {SRC_BLEND}  body={SRC_BODY}  cloth={SRC_CLOTH}")
print(f"  target   : body={TGT_BODY}  armature={TGT_ARMATURE}")
print(f"  output   : {OUT_BLEND}")

with open(CONFIG_JSON, 'r', encoding='utf-8') as f:
    config = json.load(f)
LANDMARKS = config['landmarks']
VG_RENAME = config['vg_rename']

# ========================================================================
# Helper: TBN computation with consistency
# ========================================================================
def compute_TBN(v0, v1, v2):
    """Compute TBN frame from triangle, with right-handed consistency."""
    edge1 = v1 - v0
    edge2 = v2 - v0
    n_cross = edge1.cross(edge2)
    n_len = n_cross.length
    if n_len < 1e-12:
        # degenerate
        return Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    N = n_cross / n_len
    T = edge1.normalized()
    # Gram-Schmidt: T orthogonal to N
    T = (T - T.dot(N) * N)
    if T.length < 1e-9:
        # edge1 parallel to N (very rare); pick edge2
        T = (edge2 - edge2.dot(N) * N)
    T.normalize()
    B = N.cross(T).normalized()
    # Right-handed enforcement
    if (T.cross(B)).dot(N) < 0:
        B = -B
    return T, B, N

def compute_barycentric_and_face_point(p, v0, v1, v2):
    """Project p onto triangle plane, return (point_on_face, bary)."""
    n = (v1 - v0).cross(v2 - v0)
    n_len2 = n.dot(n)
    if n_len2 < 1e-12:
        return v0.copy(), Vector((1.0, 0.0, 0.0))
    # Project p to plane
    n_unit = n / np.sqrt(n_len2)
    proj = p - (p - v0).dot(n_unit) * n_unit
    # Barycentric of proj w.r.t. v0,v1,v2
    u = ((v2 - v1).cross(proj - v1)).dot(n) / n_len2
    v = ((v0 - v2).cross(proj - v2)).dot(n) / n_len2
    w = 1.0 - u - v
    return proj, Vector((u, v, w))

# ========================================================================
# Step 1: Verify target + Append source
# ========================================================================
tgt_body_obj = bpy.data.objects.get(TGT_BODY)
tgt_arm_obj  = bpy.data.objects.get(TGT_ARMATURE)
if tgt_body_obj is None or tgt_arm_obj is None:
    print(f"  ERROR: target body/armature missing"); sys.exit(1)
print(f"\n[1] Target ready. Appending source from {SRC_BLEND}")

with bpy.data.libraries.load(SRC_BLEND, link=False) as (src, dst):
    want = {SRC_BODY, SRC_CLOTH}
    dst.objects = [n for n in src.objects if n in want]

src_body = None
src_cloth = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
    if o.name == SRC_BODY: src_body = o
    if o.name == SRC_CLOTH: src_cloth = o

if src_body is None or src_cloth is None:
    print(f"  ERROR: append failed"); sys.exit(1)

src_arm = None
for m in list(src_body.modifiers) + list(src_cloth.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        src_arm = m.object; break
if src_arm and src_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(src_arm)
    src_arm.hide_viewport = False; src_arm.hide_set(False)
print(f"  src body: {len(src_body.data.vertices)} verts, src cloth: {len(src_cloth.data.vertices)} verts, arm: {src_arm.name if src_arm else 'NONE'}")

# Clear shape keys on cloth (for vertex modification)
if src_cloth.data.shape_keys:
    n_sk = len(src_cloth.data.shape_keys.key_blocks)
    bpy.ops.object.select_all(action='DESELECT')
    src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth
    bpy.ops.object.shape_key_remove(all=True)
    print(f"  cleared {n_sk} shape keys from cloth")

# ========================================================================
# Step 2: Build TPS coefficients (for face-mapping source→target)
# ========================================================================
print(f"\n[2] Build TPS (source/target bone landmarks)")

def bone_world(arm, bone_name):
    if arm is None: return None, None
    bone = arm.data.bones.get(bone_name)
    if bone is None: return None, None
    return arm.matrix_world @ bone.head_local, arm.matrix_world @ bone.tail_local

src_pts = []
tgt_pts = []
for pair in LANDMARKS:
    s_name, t_name = pair[0], pair[1]
    sh, st = bone_world(src_arm, s_name)
    th, tt = bone_world(tgt_arm_obj, t_name)
    if sh is None or st is None or th is None or tt is None:
        continue
    n_steps = max(2, TPS_SAMPLES_PER_BONE)
    for k in range(n_steps):
        t = k / (n_steps - 1)
        sp = sh.lerp(st, t)
        tp = th.lerp(tt, t)
        src_pts.append([sp.x, sp.y, sp.z])
        tgt_pts.append([tp.x, tp.y, tp.z])

src_pts = np.asarray(src_pts, dtype=np.float64)
tgt_pts = np.asarray(tgt_pts, dtype=np.float64)
# Dedup
DEDUP_EPS = 1e-4
keep_src = []; keep_tgt_groups = []
for sp, tp in zip(src_pts, tgt_pts):
    merged = False
    for i, ksp in enumerate(keep_src):
        if np.linalg.norm(sp - ksp) < DEDUP_EPS:
            keep_tgt_groups[i].append(tp); merged = True; break
    if not merged:
        keep_src.append(sp); keep_tgt_groups.append([tp])
src_pts = np.array(keep_src)
tgt_pts = np.array([np.mean(g, axis=0) for g in keep_tgt_groups])
n_lm = len(src_pts)
print(f"  TPS landmarks: {n_lm}")

def tps_kernel(r):
    out = np.zeros_like(r)
    mask = r > 1e-9
    rm = r[mask]
    out[mask] = (rm * rm) * np.log(rm)
    return out

def tps_solve(src, tgt, lam=0.001):
    n = len(src)
    dij = np.linalg.norm(src[:, None, :] - src[None, :, :], axis=2)
    K = tps_kernel(dij) + lam * np.eye(n)
    P = np.hstack([np.ones((n, 1)), src])
    L = np.zeros((n + 4, n + 4))
    L[:n, :n] = K
    L[:n, n:] = P
    L[n:, :n] = P.T
    Y = np.vstack([tgt, np.zeros((4, 3))])
    coeffs = np.linalg.solve(L, Y)
    return coeffs[:n], coeffs[n:n+4]

def tps_apply(query, src, W, C):
    nq = len(query)
    dists = np.linalg.norm(query[:, None, :] - src[None, :, :], axis=2)
    phi = tps_kernel(dists)
    bending = phi @ W
    P_q = np.hstack([np.ones((nq, 1)), query])
    return P_q @ C + bending

W_tps, C_tps = tps_solve(src_pts, tgt_pts, lam=TPS_LAMBDA)
err = np.linalg.norm(tps_apply(src_pts, src_pts, W_tps, C_tps) - tgt_pts, axis=1)
print(f"  TPS error: max={err.max()*1000:.2f}mm, mean={err.mean()*1000:.2f}mm")

# ========================================================================
# Step 3: Build BVH for source body + bone scale ratio per cloth vertex
# ========================================================================
print(f"\n[3] Build source body BVH + scale ratios")

def build_bvh(obj):
    """Build BVHTree from evaluated mesh in world space. Returns (bvh, faces_world_verts, faces_areas)."""
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(obj.matrix_world)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    eo.to_mesh_clear()
    bm.faces.ensure_lookup_table()
    # Triangulate (BVH find_nearest works on tris)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    # Extract per-face vert positions (world)
    face_verts = []
    face_areas = []
    for f in bm.faces:
        vs = [v.co.copy() for v in f.verts]
        face_verts.append(vs)
        face_areas.append(f.calc_area())
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    return bvh, face_verts, face_areas

src_bvh, src_face_verts, src_face_areas = build_bvh(src_body)
print(f"  src body: {len(src_face_verts)} faces")

# Build vertex group → bone name lookup
cloth_vg_names = [vg.name for vg in src_cloth.vertex_groups]

# Build bone length lookup
def bone_length(arm, bone_name):
    if arm is None: return None
    b = arm.data.bones.get(bone_name)
    if b is None: return None
    return (b.tail_local - b.head_local).length

src_bone_lens = {n: bone_length(src_arm, n) for n in cloth_vg_names}
tgt_bone_lens = {n: bone_length(tgt_arm_obj, VG_RENAME.get(n, n)) for n in cloth_vg_names}

def vertex_scale_ratio(vert):
    total_w = 0.0; weighted = 0.0
    for g in vert.groups:
        vg_name = cloth_vg_names[g.group]
        sl = src_bone_lens.get(vg_name)
        tl = tgt_bone_lens.get(vg_name)
        if sl is None or tl is None or sl < 1e-6: continue
        weighted += g.weight * (tl / sl)
        total_w += g.weight
    return weighted / total_w if total_w > 1e-9 else 1.0

# ========================================================================
# Step 4: Compute correspondence (face_idx, bary, offset_TBN, scale) per cloth vertex
# ========================================================================
print(f"\n[4] Compute correspondence")
cloth_mw = src_cloth.matrix_world.copy()
cloth_mw_inv = src_cloth.matrix_world.inverted()

correspondence = []  # list of dicts per vertex
for v in src_cloth.data.vertices:
    wp = cloth_mw @ v.co
    nearest_loc, nearest_normal, face_idx, _ = src_bvh.find_nearest(wp)
    if nearest_loc is None:
        correspondence.append(None); continue
    # Face area check (collapse fallback)
    if face_idx >= len(src_face_areas) or src_face_areas[face_idx] < EPS_AREA:
        # find nearby face with larger area (simple fallback: just keep this for now)
        pass
    v0, v1, v2 = src_face_verts[face_idx]
    proj_loc, bary = compute_barycentric_and_face_point(wp, v0, v1, v2)
    T, B, N = compute_TBN(v0, v1, v2)
    delta = wp - proj_loc
    offset_local = Vector((delta.dot(T), delta.dot(B), delta.dot(N)))
    scale = vertex_scale_ratio(v)
    correspondence.append({
        'face_idx': face_idx,
        'bary': bary,
        'offset_local': offset_local,
        'scale': scale,
        'src_face_center': proj_loc,
    })

# Stats
scales = [c['scale'] for c in correspondence if c]
offsets_n = [c['offset_local'].z for c in correspondence if c]
print(f"  computed for {sum(1 for c in correspondence if c)} verts")
print(f"  scale ratio: min={min(scales):.3f}, max={max(scales):.3f}, mean={sum(scales)/len(scales):.3f}")
print(f"  offset N (signed): min={min(offsets_n)*1000:.1f}mm, max={max(offsets_n)*1000:.1f}mm, mean={sum(offsets_n)/len(offsets_n)*1000:.1f}mm")

# ========================================================================
# Step 5: Build target body BVH + reproject cloth vertices
# ========================================================================
print(f"\n[5] Build target body BVH + reproject")
# Use outer-only body for BVH if specified (avoids internal cavity issues)
bvh_body_obj = tgt_body_obj
if TGT_OUTER_BVH:
    print(f"  loading external outer body from {TGT_OUTER_BVH}:{TGT_OUTER_OBJ}")
    BVH_BLEND_ABS = os.path.abspath(TGT_OUTER_BVH)
    existing = set(o.name for o in bpy.data.objects)
    with bpy.data.libraries.load(BVH_BLEND_ABS, link=False) as (src, dst):
        dst.objects = [TGT_OUTER_OBJ]
    new_objs = [o for o in bpy.data.objects if o.name not in existing]
    for o in new_objs:
        if o.name == TGT_OUTER_OBJ or o.name.startswith(TGT_OUTER_OBJ + '.'):
            bvh_body_obj = o
            bpy.context.scene.collection.objects.link(o)
            o.hide_viewport = False; o.hide_set(False)
            print(f"  outer body loaded as: {o.name}")
            break
tgt_bvh, tgt_face_verts, tgt_face_areas = build_bvh(bvh_body_obj)
print(f"  tgt body BVH: {len(tgt_face_verts)} faces (from {bvh_body_obj.name})")

def safe_target_face(point, bvh, face_areas):
    nearest_loc, normal, face_idx, dist = bvh.find_nearest(point)
    if face_idx is not None and face_idx < len(face_areas) and face_areas[face_idx] >= EPS_AREA:
        return nearest_loc, normal, face_idx
    # fallback: try slight perturbations
    for d in [Vector((0.005, 0, 0)), Vector((-0.005, 0, 0)), Vector((0, 0.005, 0)), Vector((0, -0.005, 0))]:
        nl, no, fi, _ = bvh.find_nearest(point + d)
        if fi is not None and fi < len(face_areas) and face_areas[fi] >= EPS_AREA:
            return nl, no, fi
    return nearest_loc, normal, face_idx

n_pushed_collision = 0
n_skipped = 0
for i, v in enumerate(src_cloth.data.vertices):
    c = correspondence[i]
    if c is None:
        n_skipped += 1; continue
    src_center = c['src_face_center']
    offset_local = c['offset_local']
    scale = c['scale']

    # Map src_center → tgt world via TPS
    tgt_target = tps_apply(np.array([[src_center.x, src_center.y, src_center.z]]), src_pts, W_tps, C_tps)[0]
    tgt_target_v = Vector(tgt_target)

    # Find nearest tgt face
    tgt_p, tgt_normal, tgt_face_idx = safe_target_face(tgt_target_v, tgt_bvh, tgt_face_areas)
    if tgt_face_idx is None:
        n_skipped += 1; continue
    tv0, tv1, tv2 = tgt_face_verts[tgt_face_idx]
    Tt, Bt, Nt = compute_TBN(tv0, tv1, tv2)

    # Apply scale-corrected offset in target TBN
    new_pos = tgt_p + scale * (offset_local.x * Tt + offset_local.y * Bt + offset_local.z * Nt)

    # Collision guard (outward only push)
    nl_check, n_check, _, _ = tgt_bvh.find_nearest(new_pos)
    if nl_check is not None:
        delta_check = new_pos - nl_check
        sd = delta_check.dot(n_check)
        if sd < MIN_OFFSET:
            new_pos = nl_check + n_check * MIN_OFFSET
            n_pushed_collision += 1

    v.co = cloth_mw_inv @ new_pos

src_cloth.data.update()
print(f"  reprojected {len(src_cloth.data.vertices) - n_skipped} verts ({n_skipped} skipped)")
print(f"  collision-guarded {n_pushed_collision} verts")

# ========================================================================
# Step 6: Re-target armature + Weight Transfer from target body
# ========================================================================
print(f"\n[6] Re-target armature + Weight Transfer")

# Disable existing cloth modifiers temporarily
disabled_mods = []
for m in list(src_cloth.modifiers):
    if m.type in ('ARMATURE', 'SUBSURF'):
        disabled_mods.append((m.name, m.show_viewport))
        m.show_viewport = False

# Remove all existing vertex groups
for vg in list(src_cloth.vertex_groups):
    src_cloth.vertex_groups.remove(vg)

# Add target armature modifier
arm_mod = src_cloth.modifiers.new(name='Armature_TGT', type='ARMATURE')
arm_mod.object = tgt_arm_obj
arm_mod.use_vertex_groups = True

# Weight Transfer from target body to cloth via DATA_TRANSFER modifier
# (headless では operator より modifier-based が確実)
bpy.ops.object.select_all(action='DESELECT')
src_cloth.select_set(True)
bpy.context.view_layer.objects.active = src_cloth

try:
    # Add DATA_TRANSFER modifier
    dt_mod = src_cloth.modifiers.new(name='WeightTransfer', type='DATA_TRANSFER')
    dt_mod.object = tgt_body_obj
    dt_mod.use_vert_data = True
    dt_mod.data_types_verts = {'VGROUP_WEIGHTS'}
    dt_mod.vert_mapping = 'POLYINTERP_NEAREST'
    dt_mod.layers_vgroup_select_src = 'ALL'
    dt_mod.layers_vgroup_select_dst = 'NAME'
    dt_mod.mix_mode = 'REPLACE'

    # Generate destination vertex groups based on modifier settings
    bpy.ops.object.datalayout_transfer(modifier=dt_mod.name)
    print(f"  layer create (via modifier): cloth now has {len(src_cloth.vertex_groups)} vgroups")

    # Move modifier to top of stack and apply
    while src_cloth.modifiers[0].name != dt_mod.name:
        bpy.ops.object.modifier_move_up(modifier=dt_mod.name)
    bpy.ops.object.modifier_apply(modifier=dt_mod.name)
    print(f"  weight transfer applied: cloth has {len(src_cloth.vertex_groups)} vgroups with weights")

    # Normalize
    if len(src_cloth.vertex_groups) > 0:
        bpy.ops.object.vertex_group_normalize_all()
        print(f"  normalized")
except Exception as e:
    print(f"  WARN: weight transfer failed: {e}. cloth has {len(src_cloth.vertex_groups)} vgroups.")

# Re-enable other cloth modifiers
for name, vp in disabled_mods:
    m = src_cloth.modifiers.get(name)
    if m and m.type != 'ARMATURE':  # don't reenable old armature mod
        m.show_viewport = vp

# ========================================================================
# Step 7: Cleanup + save
# ========================================================================
print(f"\n[7] Cleanup + save")
if src_arm: bpy.data.objects.remove(src_arm, do_unlink=True)
bpy.data.objects.remove(src_body, do_unlink=True)
# Remove temp outer BVH body if loaded
if TGT_OUTER_BVH and bvh_body_obj is not tgt_body_obj:
    bpy.data.objects.remove(bvh_body_obj, do_unlink=True)
    print(f"  removed temp outer BVH body")
src_cloth.parent = tgt_arm_obj
src_cloth.matrix_parent_inverse = tgt_arm_obj.matrix_world.inverted()
src_cloth.name = f"{src_cloth.name} (v2)"

OUT_BLEND_ABS = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(OUT_BLEND_ABS)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND_ABS)
print(f"  saved: {OUT_BLEND_ABS}")
print(f"\n=== DONE ===")
