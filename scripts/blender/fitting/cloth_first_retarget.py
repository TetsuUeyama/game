"""Cloth-First retarget v6 (Phase 1: Anchor + PBD distance + Collision).

設計書: scripts/blender/fitting/CLOTHING_TRANSFER_DESIGN.md (v6 cloth-first 路線)

「衣装構造保存型フィッティング」 — Body は拘束条件、Cloth が主役。

Pipeline:
  [1] Append source body, cloth, armature into target scene
  [2] Source contact 検出: Helena cloth vert と Helena body の距離 < THRESHOLD → anchor
  [3] LBS で全 vertex の初期位置を計算 (rough placement)
  [4] Anchor target: LBS pos を QM body 表面に snap
  [5] PBD 反復解 (anchor 固定、free vert は edge length 維持で構造保存):
      - Distance constraint relaxation
      - Anchor re-pin
      - Collision guard (outward only)
  [6] Re-target armature → Weight Transfer
  [7] Save

Phase 2-4 (将来):
  Phase 2: Anchor strength field (連続値拘束)
  Phase 3: Local shape matching (ARAP)
  Phase 4: Material profile

Usage:
  blender --background <target.blend> --python cloth_first_retarget.py -- \
    <config.json> <src.blend> <src_body> <src_cloth> \
    <tgt_body> <tgt_armature> <out.blend> \
    [--tgt-outer-bvh <blend>:<obj>]
    [--contact-threshold <m>] [--n-iter <int>] [--stiffness <0..1>]
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
TGT_OUTER_BVH = None
TGT_OUTER_OBJ = None
CONTACT_THRESHOLD = 0.005  # 5mm — Helena cloth vert と Helena body の距離
N_ITER = 50
STIFFNESS = 0.2  # PBD relaxation factor (0.5 で発散、0.2 で安定)
MIN_OFFSET = 0.005  # 5mm — anchor を body 表面より外側に置く距離
COLLISION_OFFSET = 0.003  # 3mm — collision guard の最小外側距離

i = 7
while i < len(args):
    a = args[i]
    if a == '--tgt-outer-bvh' and i + 1 < len(args):
        spec = args[i + 1]
        parts = spec.rsplit(':', 1)
        if len(parts) == 2:
            TGT_OUTER_BVH, TGT_OUTER_OBJ = parts[0], parts[1]
        i += 2
    elif a == '--contact-threshold' and i + 1 < len(args):
        CONTACT_THRESHOLD = float(args[i + 1]); i += 2
    elif a == '--n-iter' and i + 1 < len(args):
        N_ITER = int(args[i + 1]); i += 2
    elif a == '--stiffness' and i + 1 < len(args):
        STIFFNESS = float(args[i + 1]); i += 2
    else:
        i += 1

print(f"\n=== cloth_first_retarget (v6 Phase 1) ===")
print(f"  config       : {CONFIG_JSON}")
print(f"  source       : {SRC_BLEND}  body={SRC_BODY}  cloth={SRC_CLOTH}")
print(f"  target       : body={TGT_BODY}  armature={TGT_ARMATURE}")
print(f"  output       : {OUT_BLEND}")
print(f"  contact-threshold: {CONTACT_THRESHOLD*1000:.1f}mm")
print(f"  n-iter       : {N_ITER}, stiffness={STIFFNESS}")

with open(CONFIG_JSON, 'r', encoding='utf-8') as f:
    config = json.load(f)
VG_RENAME = config['vg_rename']

# ============================================================
# Helper: build BVH from mesh object
# ============================================================
def build_bvh(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(obj.matrix_world)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    eo.to_mesh_clear()
    centroid = Vector((0.0, 0.0, 0.0))
    n = 0
    for v in bm.verts:
        centroid += v.co; n += 1
    if n > 0: centroid /= n
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    return bvh, centroid

def normal_outward(nearest, normal, centroid):
    """Flip normal if it points inward (toward body centroid)."""
    out_dir = (nearest - centroid)
    if out_dir.length > 1e-6:
        out_dir.normalize()
        if normal.dot(out_dir) < 0:
            return -normal
    return normal

# Internal bone keywords — cloth weights matching these are stripped post-transfer.
# Justification: cloth is constrained by outer body only; internal organs are not
# boundary conditions for cloth.
INTERNAL_VG_KEYWORDS = (
    'genital', 'vagina', 'ovary', 'uterus', 'anus', 'intestine',
    'tongue', 'teeth', 'eye_'  # mouth/eye internals don't constrain body cloth
)

def is_internal_vg(name):
    n = name.lower()
    return any(k in n for k in INTERNAL_VG_KEYWORDS)

# --- Outward projection (案X validation layer, simplified) ---
# After observing that ray-parity inside-test produces ~96% false positives on
# meshes with holes (outer-only body), we drop ray-parity and rely on raw face
# normals. Post recalc_face_normals, outer-body face normals point outward
# consistently (this is the assumption made everywhere else in the pipeline too).
#
# Direction philosophy: NO centroid heuristic. The face normal IS the outward
# direction. signed distance = (p - nearest).dot(normal) is the canonical inside
# / outside test. Push along normal until safely outside.

def enforce_outside(point, bvh, safe_offset, max_iter=3):
    """Ensure point is at least safe_offset along outward normal from nearest face.

    Uses raw face normal direction (assumes consistent outward orientation).
    Iterates up to max_iter times in case projection lands near another face
    that still violates the constraint.
    """
    p = Vector(point) if not isinstance(point, Vector) else point.copy()
    moved = False
    for _ in range(max_iter):
        nearest, normal, _, _ = bvh.find_nearest(p)
        if nearest is None:
            return p, moved
        sd = (p - nearest).dot(normal)
        if sd >= safe_offset - 1e-6:
            return p, moved
        p = nearest + normal * safe_offset
        moved = True
    return p, moved

def signed_distance_stats(positions, bvh, centroid, mask=None):
    """Compute signed distance for each position relative to bvh surface.
    Negative = inside body (penetration). mask filters which verts to compute."""
    n = len(positions)
    sd = np.zeros(n, dtype=np.float64)
    iter_idx = np.where(mask)[0] if mask is not None else range(n)
    for i in iter_idx:
        p = Vector(positions[i])
        nearest, normal, _, _ = bvh.find_nearest(p)
        if nearest is None:
            sd[i] = 0.0; continue
        normal = normal_outward(nearest, normal, centroid)
        sd[i] = (p - nearest).dot(normal)
    return sd

def report_penetration(label, sd, mask_anchor=None):
    """Print penetration stats. sd in meters, output in mm."""
    valid = np.ones_like(sd, dtype=bool) if mask_anchor is None else np.ones_like(sd, dtype=bool)
    n = int(valid.sum())
    if n == 0: return
    sdv = sd[valid]
    inside = (sdv < 0)
    pct = 100.0 * inside.sum() / n
    print(f"  [diag {label}] n={n}, internal={int(inside.sum())} ({pct:.1f}%), "
          f"min={sdv.min()*1000:.1f}mm, mean={sdv.mean()*1000:.2f}mm, max={sdv.max()*1000:.1f}mm")
    if mask_anchor is not None:
        sa = sd[mask_anchor]
        if len(sa) > 0:
            ai = (sa < 0).sum()
            print(f"      anchor subset: internal={int(ai)}/{len(sa)} ({100.0*ai/len(sa):.1f}%), "
                  f"min={sa.min()*1000:.1f}mm")
        sf = sd[~mask_anchor]
        if len(sf) > 0:
            fi = (sf < 0).sum()
            print(f"      free   subset: internal={int(fi)}/{len(sf)} ({100.0*fi/len(sf):.1f}%), "
                  f"min={sf.min()*1000:.1f}mm")

# ============================================================
# [1] Verify target + Append source
# ============================================================
tgt_body_obj = bpy.data.objects.get(TGT_BODY)
tgt_arm_obj  = bpy.data.objects.get(TGT_ARMATURE)
if tgt_body_obj is None or tgt_arm_obj is None:
    print(f"  ERROR: target body/armature missing"); sys.exit(1)

print(f"\n[1] Append source from {SRC_BLEND}")
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

# Force REST pose
src_arm.data.pose_position = 'REST'
tgt_arm_obj.data.pose_position = 'REST'
bpy.context.view_layer.update()

# Clear cloth shape keys
if src_cloth.data.shape_keys:
    bpy.ops.object.select_all(action='DESELECT')
    src_cloth.select_set(True); bpy.context.view_layer.objects.active = src_cloth
    bpy.ops.object.shape_key_remove(all=True)

n_verts = len(src_cloth.data.vertices)
print(f"  src body: {len(src_body.data.vertices)} verts, src cloth: {n_verts} verts, arm: {src_arm.name if src_arm else 'NONE'}")

# ============================================================
# [2] Build edge list + rest lengths from source cloth
# ============================================================
print(f"\n[2] Build mesh edges + rest lengths")
cloth_mw = src_cloth.matrix_world.copy()
cloth_mw_inv = cloth_mw.inverted()

# Source cloth vert positions in world (rest)
rest_pos = np.array([(cloth_mw @ v.co)[:] for v in src_cloth.data.vertices], dtype=np.float64)

# Edges from Blender mesh
edge_list = [(e.vertices[0], e.vertices[1]) for e in src_cloth.data.edges]
edges = np.array(edge_list, dtype=np.int32)
e_i = edges[:, 0]
e_j = edges[:, 1]
edge_vec = rest_pos[e_j] - rest_pos[e_i]
rest_lengths = np.linalg.norm(edge_vec, axis=1)
print(f"  edges: {len(edges)}, mean rest length: {rest_lengths.mean()*1000:.1f}mm")

# Triangulated face list for ARAP cotangent weights (without modifying original mesh)
bm_tri = bmesh.new()
bm_tri.from_mesh(src_cloth.data)
bmesh.ops.triangulate(bm_tri, faces=bm_tri.faces)
faces_tri = np.array(
    [(f.verts[0].index, f.verts[1].index, f.verts[2].index) for f in bm_tri.faces if len(f.verts) == 3],
    dtype=np.int32,
)
bm_tri.free()
print(f"  triangulated faces (ARAP): {len(faces_tri)}")

# ============================================================
# [3] Detect anchors via Helena body distance
# ============================================================
print(f"\n[3] Detect anchors (Helena cloth ↔ Helena body distance < {CONTACT_THRESHOLD*1000:.1f}mm)")
src_bvh, src_centroid = build_bvh(src_body)

contact_distances = np.zeros(n_verts)
src_anchor_normal = np.zeros((n_verts, 3))
src_anchor_loc = np.zeros((n_verts, 3))
# Per-vertex Helena cloth-to-body signed distance — preserves cloth volume per vertex
# (cup, fold, etc. all have characteristic d_helena values)
d_helena_all = np.zeros(n_verts, dtype=np.float64)

# === Phase 1: distance-based close-contact detection ===
close_contact = np.zeros(n_verts, dtype=bool)
src_nearest_normal = [None] * n_verts
src_nearest_loc = [None] * n_verts
for i, v in enumerate(src_cloth.data.vertices):
    wp = cloth_mw @ v.co
    nearest, normal, _, _ = src_bvh.find_nearest(wp)
    if nearest is None: continue
    d = (wp - nearest).length
    contact_distances[i] = d
    # Per-vertex Helena cloth-to-body signed distance (positive = outside Helena body)
    helena_normal = normal_outward(nearest, normal, src_centroid)
    sd_h = (wp - nearest).dot(helena_normal)
    d_helena_all[i] = max(sd_h, 0.0)  # clamp to non-negative; cloth was outside body
    if d < CONTACT_THRESHOLD:
        close_contact[i] = True
        src_nearest_normal[i] = helena_normal
        src_nearest_loc[i] = Vector(nearest)

# === Phase 2: build mesh-edge adjacency ===
adj_mesh = [[] for _ in range(n_verts)]
for a, b in zip(e_i.tolist(), e_j.tolist()):
    adj_mesh[a].append(b)
    adj_mesh[b].append(a)

# === Phase 3: detect cloth mesh open edges (boundary of garment) ===
# Verts on open edges (edges adjacent to only 1 face) are garment boundaries.
# These are natural anchors per design image (neck/arm/leg holes).
bm_open = bmesh.new()
bm_open.from_mesh(src_cloth.data)
bm_open.edges.ensure_lookup_table()
on_open_edge = np.zeros(n_verts, dtype=bool)
for be in bm_open.edges:
    if len(be.link_faces) == 1:  # cloth mesh boundary edge
        for v in be.verts:
            on_open_edge[v.index] = True
bm_open.free()
n_open_edge = int(on_open_edge.sum())
print(f"  cloth mesh open-edge verts: {n_open_edge}")

# === Phase 4: anchor = close-contact AND (on patch boundary OR on cloth open edge) ===
# Cloth-first design: anchor only at "contact lines" (transitions and garment boundaries),
# NOT entire close-contact regions. ARAP handles interior cloth structure.
is_anchor = np.zeros(n_verts, dtype=bool)
n_close = int(close_contact.sum())
for i in range(n_verts):
    if not close_contact[i]: continue
    nbrs = adj_mesh[i]
    if not nbrs: continue
    has_non_close_nbr = any(not close_contact[j] for j in nbrs)
    if has_non_close_nbr or on_open_edge[i]:
        is_anchor[i] = True
        src_anchor_normal[i] = src_nearest_normal[i]
        src_anchor_loc[i] = src_nearest_loc[i]

n_anchors = int(is_anchor.sum())
n_free = n_verts - n_anchors
print(f"  close-contact (< {CONTACT_THRESHOLD*1000:.1f}mm): {n_close} ({100*n_close/n_verts:.1f}%)")
print(f"  anchors (contact-line: patch boundary OR open edge): {n_anchors} ({100*n_anchors/n_verts:.1f}%)")
print(f"  free (cloth interior, ARAP-controlled): {n_free} ({100*n_free/n_verts:.1f}%)")

# ============================================================
# [4] LBS 初期位置（全 vertex の rough placement）
# ============================================================
print(f"\n[4] LBS initial position (rough placement)")
src_arm_world = src_arm.matrix_world.copy()
tgt_arm_world = tgt_arm_obj.matrix_world.copy()
cloth_vg_names = [vg.name for vg in src_cloth.vertex_groups]
src_pose = {n: src_arm.pose.bones.get(n) for n in cloth_vg_names}
tgt_pose = {n: tgt_arm_obj.pose.bones.get(VG_RENAME.get(n)) if VG_RENAME.get(n) else None for n in cloth_vg_names}

initial_pos = np.zeros((n_verts, 3))
has_lbs = np.zeros(n_verts, dtype=bool)
n_no_weight = 0
for i, v in enumerate(src_cloth.data.vertices):
    wp = cloth_mw @ v.co
    valid = []
    total_w = 0.0
    for g in v.groups:
        s_name = cloth_vg_names[g.group]
        s_pb = src_pose.get(s_name); t_pb = tgt_pose.get(s_name)
        if s_pb is None or t_pb is None: continue
        if g.weight < 1e-4: continue
        valid.append((s_pb, t_pb, g.weight))
        total_w += g.weight
    if total_w < 1e-6:
        # Don't fill with Helena coords (broken initial condition).
        # Leave initial_pos[i] = 0; will be filled by displacement diffusion below.
        n_no_weight += 1
        continue

    blended = Vector((0.0, 0.0, 0.0))
    for s_pb, t_pb, w in valid:
        # Direction-only LBS (proven from v4)
        src_head = src_arm_world @ s_pb.head
        src_tail = src_arm_world @ s_pb.tail
        src_vec = src_tail - src_head
        s_len = src_vec.length
        if s_len < 1e-6:
            src_bone_world = src_arm_world @ s_pb.matrix
            tgt_bone_world = tgt_arm_world @ t_pb.matrix
            local_pos = src_bone_world.inverted() @ wp
            tgt_world = tgt_bone_world @ local_pos
        else:
            src_dir = src_vec / s_len
            tgt_head = tgt_arm_world @ t_pb.head
            tgt_tail = tgt_arm_world @ t_pb.tail
            tgt_vec = tgt_tail - tgt_head
            t_len = tgt_vec.length
            if t_len < 1e-6:
                t_len = s_len; tgt_dir = src_dir
            else:
                tgt_dir = tgt_vec / t_len
            offset = wp - src_head
            proj = offset.dot(src_dir)
            perp = offset - src_dir * proj
            scaled_proj = proj * (t_len / s_len)
            perp_mag = perp.length
            if perp_mag > 1e-9:
                perp_unit = perp / perp_mag
                rot_q = src_dir.rotation_difference(tgt_dir)
                rotated_perp = rot_q @ perp_unit * perp_mag
            else:
                rotated_perp = Vector((0,0,0))
            tgt_world = tgt_head + tgt_dir * scaled_proj + rotated_perp
        blended += (w / total_w) * tgt_world

    initial_pos[i] = (blended.x, blended.y, blended.z)
    has_lbs[i] = True

n_lbs = int(has_lbs.sum())
print(f"  LBS placed: {n_lbs} verts, no-weight pending diffusion: {n_no_weight}")

# ============================================================
# [4.5] Displacement diffusion for no-weight verts
#       Treat displacement field d_i = lbs_pos - rest_pos as a function on
#       the cloth graph. Weighted verts are Dirichlet boundary; no-weight
#       verts are solved by harmonic interpolation (Laplace's equation).
# ============================================================
if n_no_weight > 0:
    print(f"\n[4.5] Displacement diffusion (Laplace smoothing, Dirichlet boundary = LBS verts)")
    # rest_pos is helena world rest position (already computed at step [2])
    displacement = np.zeros((n_verts, 3))
    displacement[has_lbs] = initial_pos[has_lbs] - rest_pos[has_lbs]
    filled = has_lbs.copy()

    # Phase A: wavefront fill — propagate from LBS frontier to reach all no-weight verts
    WAVEFRONT_MAX_ITER = 200
    for diff_iter in range(WAVEFRONT_MAX_ITER):
        if filled.all():
            break
        accumulator = np.zeros((n_verts, 3))
        counter = np.zeros(n_verts)
        fi, fj = filled[e_i], filled[e_j]
        # j filled, i not: contribute disp[j] to i
        m = fj & ~fi
        np.add.at(accumulator, e_i[m], displacement[e_j[m]])
        np.add.at(counter, e_i[m], 1)
        # i filled, j not: contribute disp[i] to j
        m = fi & ~fj
        np.add.at(accumulator, e_j[m], displacement[e_i[m]])
        np.add.at(counter, e_j[m], 1)

        update_mask = (counter > 0) & ~filled
        if not update_mask.any():
            break
        displacement[update_mask] = accumulator[update_mask] / counter[update_mask, None]
        filled |= update_mask

    n_isolated = int((~filled).sum())
    n_diffused = int(filled.sum() - has_lbs.sum())
    print(f"  Phase A wavefront fill: {n_diffused} verts diffused in {diff_iter+1} iter, {n_isolated} isolated")

    # Phase B: harmonic smoothing (Jacobi) — make displacement gradient continuous
    movable = filled & ~has_lbs
    SMOOTH_ITER = 20
    if movable.any():
        for smooth_it in range(SMOOTH_ITER):
            accumulator = np.zeros((n_verts, 3))
            counter = np.zeros(n_verts)
            np.add.at(accumulator, e_i, displacement[e_j])
            np.add.at(counter, e_i, 1)
            np.add.at(accumulator, e_j, displacement[e_i])
            np.add.at(counter, e_j, 1)
            safe_count = np.maximum(counter, 1)
            new_disp = accumulator / safe_count[:, None]
            # Dirichlet: keep has_lbs verts fixed; only update movable
            displacement[movable] = new_disp[movable]
        print(f"  Phase B harmonic smoothing: {SMOOTH_ITER} iter on {int(movable.sum())} verts")

    # Apply displacement field
    initial_pos = rest_pos + displacement

    # Strong observation for isolated verts (asset / mapping problem)
    if n_isolated > 0:
        pct = 100.0 * n_isolated / n_verts
        print(f"  *** ERROR-LEVEL OBSERVATION: {n_isolated} verts ({pct:.2f}%) have NO path to any weighted vert ***")
        print(f"      Fallback: Helena rest world position used (broken initial condition).")
        print(f"      Likely causes: (1) VG_RENAME missing entries, (2) disconnected mesh islands without weights,")
        print(f"                     (3) cloth swing bones not registered in target rig.")
        # Set displacement to 0 for isolated → initial_pos[isolated] = rest_pos (already correct since
        # displacement was 0 for unfilled verts).

# ============================================================
# [5] Anchor target: LBS pos を QM body 表面に snap
# ============================================================
print(f"\n[5] Anchor target: snap to QM body surface")
# Use outer body for BVH if specified
bvh_obj = tgt_body_obj
loaded_outer = None
if TGT_OUTER_BVH:
    BVH_BLEND_ABS = os.path.abspath(TGT_OUTER_BVH)
    existing = set(o.name for o in bpy.data.objects)
    with bpy.data.libraries.load(BVH_BLEND_ABS, link=False) as (src, dst):
        dst.objects = [TGT_OUTER_OBJ]
    new_objs = [o for o in bpy.data.objects if o.name not in existing]
    for o in new_objs:
        if o.name == TGT_OUTER_OBJ or o.name.startswith(TGT_OUTER_OBJ + '.'):
            bvh_obj = o
            loaded_outer = o
            bpy.context.scene.collection.objects.link(o)
            o.hide_viewport = False; o.hide_set(False)
            break
tgt_bvh, tgt_centroid = build_bvh(bvh_obj)
print(f"  bvh source: {bvh_obj.name} (outer={'yes' if loaded_outer else 'no, falling back to full body'})")

# Diagnostic: signed distance of initial_pos (post-diffusion, pre-anchor-snap)
sd0 = signed_distance_stats(initial_pos, tgt_bvh, tgt_centroid)
report_penetration("initial_pos (post-diffusion)", sd0, mask_anchor=is_anchor)

anchor_targets = np.zeros((n_verts, 3))
for i in range(n_verts):
    if not is_anchor[i]: continue
    p = Vector(initial_pos[i])
    nearest, normal, _, _ = tgt_bvh.find_nearest(p)
    if nearest is None:
        anchor_targets[i] = initial_pos[i]
        continue
    normal = normal_outward(nearest, normal, tgt_centroid)
    target = nearest + normal * MIN_OFFSET
    anchor_targets[i] = (target.x, target.y, target.z)

# Diagnostic: snap displacement (anchor LBS → snap target)
anchor_jump = np.linalg.norm(anchor_targets[is_anchor] - initial_pos[is_anchor], axis=1)
print(f"  anchor snap displacement: mean={anchor_jump.mean()*1000:.1f}mm, max={anchor_jump.max()*1000:.1f}mm")
# Diagnostic: anchor_target signed distance — measured for observability
sd_at = signed_distance_stats(anchor_targets, tgt_bvh, tgt_centroid, mask=is_anchor)
sa_at = sd_at[is_anchor]
print(f"  anchor_target sd: min={sa_at.min()*1000:.1f}mm, mean={sa_at.mean()*1000:.2f}mm, "
      f"internal={int((sa_at<0).sum())}/{len(sa_at)}")

# ============================================================
# [6] ARAP (As-Rigid-As-Possible) — main shape preservation
#     Pipeline philosophy: cloth graph 上の局所剛体エネルギー最小化
#     - Local step: per-vertex 1-ring covariance → SVD → reflection fix
#     - Global step: cotangent Laplacian + Dirichlet anchor + per-axis dense solve
# ============================================================
ARAP_N_ITER = 20
ARAP_DO_LOCAL_STEP = True   # False = Global solve only (R = I, debug mode); True = full ARAP
ARAP_LOG_EVERY = 2

print(f"\n[6] ARAP solve (n_iter={ARAP_N_ITER}, local_step={ARAP_DO_LOCAL_STEP})")

# === [6.1] Build cotangent Laplacian from triangulated rest pose ===
n_tri = len(faces_tri)
tri_v = [faces_tri[:, k] for k in range(3)]   # tri_v[0], tri_v[1], tri_v[2]: (n_tri,) each

# For each triangle (i, j, k), the angle at vertex k contributes 0.5*cot to edge (i, j).
# Build per-edge cotangent sum with negative-clamp for robustness.
from collections import defaultdict
cot_edge = defaultdict(float)
for i_v, j_v, k_v in faces_tri:
    for (a, b, c) in ((i_v, j_v, k_v), (j_v, k_v, i_v), (k_v, i_v, j_v)):
        e1 = rest_pos[a] - rest_pos[c]
        e2 = rest_pos[b] - rest_pos[c]
        sin_th = np.linalg.norm(np.cross(e1, e2))
        if sin_th < 1e-12:
            continue
        cos_th = np.dot(e1, e2)
        cot_th = cos_th / sin_th
        key = (min(a, b), max(a, b))
        cot_edge[key] += 0.5 * cot_th

cot_edges = np.array(list(cot_edge.keys()), dtype=np.int32)        # (E', 2)
cot_weights = np.array(list(cot_edge.values()), dtype=np.float64)  # (E',)
# Clamp negatives for numerical robustness on obtuse triangles
cot_weights = np.maximum(cot_weights, 1e-6)
ce_i, ce_j = cot_edges[:, 0], cot_edges[:, 1]

print(f"  cotangent edges: {len(cot_edges)}, weight mean={cot_weights.mean():.3f}")

# Build dense Laplacian L (n_verts x n_verts)
L = np.zeros((n_verts, n_verts), dtype=np.float64)
for (a, b), w in zip(cot_edges, cot_weights):
    L[a, b] -= w
    L[b, a] -= w
    L[a, a] += w
    L[b, b] += w

# Build adjacency for Local step (vert -> [(neighbor, weight)])
adj_neighbors = [[] for _ in range(n_verts)]
adj_weights   = [[] for _ in range(n_verts)]
for (a, b), w in zip(cot_edges, cot_weights):
    adj_neighbors[a].append(b); adj_weights[a].append(w)
    adj_neighbors[b].append(a); adj_weights[b].append(w)

# === [6.2] Setup Dirichlet system ===
free_mask = ~is_anchor
n_free = int(free_mask.sum())
n_anc  = n_verts - n_free
free_idx = np.where(free_mask)[0]
anc_idx  = np.where(is_anchor)[0]

# Add tiny regularization to L_ff in case anchor coverage is incomplete (singular L_ff)
L_ff = L[np.ix_(free_idx, free_idx)] + 1e-9 * np.eye(n_free)
L_fa = L[np.ix_(free_idx, anc_idx)]

print(f"  free={n_free}, anchor={n_anc}, L_ff: {n_free}x{n_free} ({L_ff.nbytes/1e6:.1f}MB)")

# === [6.3] Initialize positions and rotations ===
pos = initial_pos.copy().astype(np.float64)
pos[is_anchor] = anchor_targets[is_anchor]
R_per = np.tile(np.eye(3, dtype=np.float64), (n_verts, 1, 1))  # (N, 3, 3)

# Pre-compute rest edge vectors and per-edge cotangent (for global RHS)
rest_e = rest_pos[ce_j] - rest_pos[ce_i]   # (E', 3)

# === [6.4] Local-Global iteration ===
for it in range(ARAP_N_ITER):
    # --- Local step: estimate R_i per vertex ---
    if ARAP_DO_LOCAL_STEP:
        n_reflected = 0
        for i in range(n_verts):
            nbrs = adj_neighbors[i]
            if not nbrs:
                continue
            wts = adj_weights[i]
            # 1-ring covariance: C = sum_j w_ij * (rest_pos[i] - rest_pos[j]) (pos[i] - pos[j])^T
            erest = rest_pos[i] - rest_pos[nbrs]   # (k, 3)
            ecur  = pos[i]      - pos[nbrs]        # (k, 3)
            wcol  = np.array(wts).reshape(-1, 1)   # (k, 1)
            C = (erest * wcol).T @ ecur            # (3, 3)
            U, S, Vt = np.linalg.svd(C)
            R_i = Vt.T @ U.T
            if np.linalg.det(R_i) < 0:
                Vt2 = Vt.copy()
                Vt2[-1, :] *= -1
                R_i = Vt2.T @ U.T
                n_reflected += 1
            R_per[i] = R_i

    # --- Global step: build RHS, solve L * P = b under Dirichlet anchor ---
    # b_i = 0.5 * sum_{j} w_ij * (R_i + R_j) * (rest_pos[i] - rest_pos[j])
    R_avg = 0.5 * (R_per[ce_i] + R_per[ce_j])             # (E', 3, 3)
    contrib = (R_avg @ rest_e[..., None]).squeeze(-1)     # (E', 3)
    contrib *= cot_weights[:, None]
    b = np.zeros((n_verts, 3), dtype=np.float64)
    np.add.at(b, ce_i,  contrib)
    np.add.at(b, ce_j, -contrib)

    rhs = b[free_idx] - L_fa @ pos[anc_idx]
    pos[free_idx] = np.linalg.solve(L_ff, rhs)
    pos[is_anchor] = anchor_targets[is_anchor]   # re-pin (no-op but explicit)

    # --- Collision guard (every few iters, outward only) ---
    if it % 5 == 4 or it == ARAP_N_ITER - 1:
        n_pushed = 0
        for i in free_idx:
            p = Vector(pos[i])
            nearest, normal, _, _ = tgt_bvh.find_nearest(p)
            if nearest is None:
                continue
            normal = normal_outward(nearest, normal, tgt_centroid)
            sd = (p - nearest).dot(normal)
            if sd < COLLISION_OFFSET:
                p2 = nearest + normal * COLLISION_OFFSET
                pos[i] = (p2.x, p2.y, p2.z)
                n_pushed += 1
        if n_pushed > 0:
            print(f"  iter {it:3d}: collision pushed {n_pushed} verts")

    # --- Energy + stretch logging ---
    if it % ARAP_LOG_EVERY == 0 or it == ARAP_N_ITER - 1:
        # ARAP energy
        ediff = (R_avg @ rest_e[..., None]).squeeze(-1) - (pos[ce_j] - pos[ce_i])
        energy = float(np.sum(cot_weights * np.einsum('ij,ij->i', ediff, ediff)))
        # Edge stretch (using mesh edges, comparable to PBD log)
        cur_e = pos[e_j] - pos[e_i]
        cur_len = np.linalg.norm(cur_e, axis=1)
        stretch = np.abs(cur_len - rest_lengths)
        ref_str = "Local+Global" if ARAP_DO_LOCAL_STEP else "Global only(R=I)"
        print(f"  iter {it:3d} [{ref_str}]: energy={energy:.4f}, stretch avg={stretch.mean()*1000:.2f}mm max={stretch.max()*1000:.2f}mm")

sd_post = signed_distance_stats(pos, tgt_bvh, tgt_centroid)
report_penetration("post-ARAP", sd_post, mask_anchor=is_anchor)

# ============================================================
# [Step 4] Per-vertex distance correction (cloth-first compatible)
# Target distance per vert = d_helena[i] (Helena cloth's distance from Helena body)
# This preserves cloth structure (cup volume, fold) per vertex while ensuring
# no body penetration. Multi-pass for fold corner stabilization.
# ============================================================
print(f"\n[Step 4] Per-vertex distance correction (target = d_helena[i])")
STEP4_ITER = 4
TOLERANCE = 0.001
for it in range(STEP4_ITER):
    n_corrected = 0
    for i in range(n_verts):
        p = Vector(pos[i])
        nearest, normal, _, _ = tgt_bvh.find_nearest(p)
        if nearest is None: continue
        normal = normal_outward(nearest, normal, tgt_centroid)
        sd = (p - nearest).dot(normal)
        target = max(d_helena_all[i], MIN_OFFSET)
        if abs(sd - target) > TOLERANCE:
            new_p = nearest + normal * target
            pos[i] = (new_p.x, new_p.y, new_p.z)
            n_corrected += 1
    if n_corrected == 0:
        print(f"  iter {it}: converged")
        break
    print(f"  iter {it}: corrected {n_corrected}/{n_verts}")

sd_step4 = signed_distance_stats(pos, tgt_bvh, tgt_centroid)
report_penetration("post-Step4", sd_step4, mask_anchor=is_anchor)

# Write back to mesh
for i, v in enumerate(src_cloth.data.vertices):
    v.co = cloth_mw_inv @ Vector(pos[i])
src_cloth.data.update()

# ============================================================
# [7] Re-target armature + Weight Transfer
# ============================================================
print(f"\n[7] Re-target armature + Weight Transfer")
for m in list(src_cloth.modifiers):
    if m.type in ('ARMATURE', 'SUBSURF'):
        src_cloth.modifiers.remove(m)

for vg in list(src_cloth.vertex_groups):
    src_cloth.vertex_groups.remove(vg)

arm_mod = src_cloth.modifiers.new(name='Armature_TGT', type='ARMATURE')
arm_mod.object = tgt_arm_obj
arm_mod.use_vertex_groups = True

bpy.ops.object.select_all(action='DESELECT')
src_cloth.select_set(True)
bpy.context.view_layer.objects.active = src_cloth

# P3-A: Weight transfer source = OUTER body (no internal mesh contamination).
# Cloth is constrained by outer surface; internal organs are NOT a boundary.
weight_src = bvh_obj  # loaded outer if --tgt-outer-bvh given, else tgt_body_obj
print(f"  weight transfer source: {weight_src.name} (P3-A: outer-body)")

try:
    dt_mod = src_cloth.modifiers.new(name='WeightTransfer', type='DATA_TRANSFER')
    dt_mod.object = weight_src
    dt_mod.use_vert_data = True
    dt_mod.data_types_verts = {'VGROUP_WEIGHTS'}
    dt_mod.vert_mapping = 'POLYINTERP_NEAREST'
    dt_mod.layers_vgroup_select_src = 'ALL'
    dt_mod.layers_vgroup_select_dst = 'NAME'
    dt_mod.mix_mode = 'REPLACE'
    bpy.ops.object.datalayout_transfer(modifier=dt_mod.name)
    while src_cloth.modifiers[0].name != dt_mod.name:
        bpy.ops.object.modifier_move_up(modifier=dt_mod.name)
    bpy.ops.object.modifier_apply(modifier=dt_mod.name)
    print(f"  weight transferred: {len(src_cloth.vertex_groups)} vgroups (pre-cleanup)")

    # P3-B: Strip internal-organ vgroups (defensive cleanup).
    # Catches leftovers from interpolation or VG_RENAME mappings to internal bones.
    removed = []
    for vg in list(src_cloth.vertex_groups):
        if is_internal_vg(vg.name):
            removed.append(vg.name)
            src_cloth.vertex_groups.remove(vg)
    if removed:
        print(f"  P3-B internal vgroup cleanup: removed {len(removed)} groups: {removed[:8]}{'...' if len(removed)>8 else ''}")
    else:
        print(f"  P3-B internal vgroup cleanup: no internal groups present (already clean)")

    if len(src_cloth.vertex_groups) > 0:
        bpy.ops.object.vertex_group_normalize_all()
    print(f"  final vgroups: {len(src_cloth.vertex_groups)}")
except Exception as e:
    print(f"  WARN: weight transfer failed: {e}")

# ============================================================
# [8] Cleanup + save
# ============================================================
print(f"\n[8] Cleanup + save")
if src_arm: bpy.data.objects.remove(src_arm, do_unlink=True)
bpy.data.objects.remove(src_body, do_unlink=True)
if loaded_outer is not None: bpy.data.objects.remove(loaded_outer, do_unlink=True)

src_cloth.parent = tgt_arm_obj
src_cloth.matrix_parent_inverse = tgt_arm_obj.matrix_world.inverted()
src_cloth.name = f"{src_cloth.name} (cloth-first v6)"

OUT_BLEND_ABS = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(OUT_BLEND_ABS)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND_ABS)
print(f"  saved: {OUT_BLEND_ABS}")
print(f"\n=== DONE ===")
