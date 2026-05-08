"""TPS (Thin-Plate-Spline) clothing retargeting.

Wrap-thinking implementation: 解剖学アンカー (bone head/tail) 対応ペアから
3D の滑らかな変形場を構築し、衣装メッシュ全体に適用。

決定論的・パラメータレス（lambda regularization のみ）・全衣装共通アルゴリズム。

Usage:
  blender --background <target.blend> --python tps_retarget.py -- \
    <config.json> <src.blend> <src_body> <src_suit> \
    <tgt_body> <tgt_armature> <out.blend> [<lambda>]

例:
  blender --background "E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend" \
    --python scripts/blender/fitting/tps_retarget.py -- \
    "config/clothing_retarget_helena_to_qm.json" \
    "E:/Helena_Final_Public.blend" "Helena_Base" "GCC DOA Outfit Bodysuit Mesh" \
    "Queen Marika Body" "QueenMarika_rig" "F:/Helena_Bodysuit_to_QM_tps.blend"
"""
import bpy
import sys
import os
import json
import numpy as np
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 7:
    print(__doc__); sys.exit(1)

CONFIG_JSON  = args[0]
SRC_BLEND    = args[1]
SRC_BODY     = args[2]
SRC_SUIT     = args[3]
TGT_BODY     = args[4]
TGT_ARMATURE = args[5]
OUT_BLEND    = args[6]

# Optional flags (positional arg 7 = lambda for backward compat)
TPS_LAMBDA      = 0.001
SAMPLES_PER_BONE = 2  # 2 = head + tail (legacy default). Higher = dense sampling along bone.
i = 7
while i < len(args):
    a = args[i]
    if a == '--samples-per-bone' and i + 1 < len(args):
        SAMPLES_PER_BONE = int(args[i + 1]); i += 2; continue
    if a == '--lambda' and i + 1 < len(args):
        TPS_LAMBDA = float(args[i + 1]); i += 2; continue
    # positional: lambda (backward compat)
    try:
        TPS_LAMBDA = float(a); i += 1; continue
    except ValueError:
        i += 1

print(f"\n=== tps_retarget ===")
print(f"  config   : {CONFIG_JSON}")
print(f"  source   : {SRC_BLEND}  body={SRC_BODY}  suit={SRC_SUIT}")
print(f"  target   : body={TGT_BODY}  armature={TGT_ARMATURE}")
print(f"  output   : {OUT_BLEND}")
print(f"  lambda   : {TPS_LAMBDA}")

with open(CONFIG_JSON, 'r', encoding='utf-8') as f:
    config = json.load(f)
LANDMARKS = config['landmarks']
VG_RENAME = config['vg_rename']

# ========================================================================
# 1. Verify target body / armature already in scene
# ========================================================================
tgt_body_obj = bpy.data.objects.get(TGT_BODY)
tgt_arm_obj  = bpy.data.objects.get(TGT_ARMATURE)
if tgt_body_obj is None or tgt_arm_obj is None:
    print(f"  ERROR: target body or armature missing in scene")
    sys.exit(1)
print(f"\n[0] Target armature: {tgt_arm_obj.name} ({len(tgt_arm_obj.data.bones)} bones)")

# ========================================================================
# 2. Append source body + suit + armature
# ========================================================================
print(f"\n[1] Append source from {SRC_BLEND}")
with bpy.data.libraries.load(SRC_BLEND, link=False) as (src, dst):
    want = {SRC_BODY, SRC_SUIT}
    dst.objects = [n for n in src.objects if n in want]

src_body = None
src_suit = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
    if o.name == SRC_BODY: src_body = o
    if o.name == SRC_SUIT: src_suit = o

if src_body is None or src_suit is None:
    print(f"  ERROR: append failed (body={src_body is not None}, suit={src_suit is not None})")
    sys.exit(1)

src_arm = None
for m in list(src_body.modifiers) + list(src_suit.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        src_arm = m.object; break
if src_arm and src_arm.name not in {o.name for o in bpy.context.scene.collection.objects}:
    bpy.context.scene.collection.objects.link(src_arm)
    src_arm.hide_viewport = False; src_arm.hide_set(False)
print(f"  source armature: {src_arm.name if src_arm else 'NONE'}")
print(f"  body verts: {len(src_body.data.vertices)}, suit verts: {len(src_suit.data.vertices)}")

# ========================================================================
# 3. Build landmark pairs (src bone head/tail → tgt bone head/tail in WORLD space)
# ========================================================================
print(f"\n[2] Build landmark pairs")
def bone_world(arm, bone_name):
    """Return (head_world, tail_world) for bone, or (None, None)."""
    if arm is None: return None, None
    bone = arm.data.bones.get(bone_name)
    if bone is None: return None, None
    return arm.matrix_world @ bone.head_local, arm.matrix_world @ bone.tail_local

src_pts = []
tgt_pts = []
n_used = 0
n_skip = 0
print(f"  samples per bone: {SAMPLES_PER_BONE} (head + interpolated + tail)")
for pair in LANDMARKS:
    s_name, t_name = pair[0], pair[1]
    sh, st = bone_world(src_arm, s_name)
    th, tt = bone_world(tgt_arm_obj, t_name)
    if sh is None or st is None or th is None or tt is None:
        print(f"  skip {s_name!r} ↔ {t_name!r} (missing)")
        n_skip += 1; continue
    # Sample N points along bone (head=0.0, tail=1.0)
    n_steps = max(2, SAMPLES_PER_BONE)
    for k in range(n_steps):
        t = k / (n_steps - 1)
        sp = sh.lerp(st, t)
        tp = th.lerp(tt, t)
        src_pts.append([sp.x, sp.y, sp.z])
        tgt_pts.append([tp.x, tp.y, tp.z])
    n_used += 1

src_pts = np.asarray(src_pts, dtype=np.float64)
tgt_pts = np.asarray(tgt_pts, dtype=np.float64)
print(f"  used pairs: {n_used} (skipped: {n_skip})")
print(f"  raw landmarks: {len(src_pts)} (each pair = head + tail = 2 points)")

# Dedupe: parent.tail == child.head の連結 bone で src が重複すると singular matrix。
# 同じ src 位置 (within DEDUP_EPS) の landmark を統合し、対応 tgt を平均化。
DEDUP_EPS = 1e-4  # 0.1mm
keep_src = []
keep_tgt_groups = []  # list of lists for averaging
for sp, tp in zip(src_pts, tgt_pts):
    merged = False
    for i, ksp in enumerate(keep_src):
        if np.linalg.norm(sp - ksp) < DEDUP_EPS:
            keep_tgt_groups[i].append(tp); merged = True; break
    if not merged:
        keep_src.append(sp); keep_tgt_groups.append([tp])
n_dropped = len(src_pts) - len(keep_src)
src_pts = np.array(keep_src, dtype=np.float64)
tgt_pts = np.array([np.mean(g, axis=0) for g in keep_tgt_groups], dtype=np.float64)
n_landmarks = len(src_pts)
print(f"  after dedup: {n_landmarks} landmarks ({n_dropped} duplicates merged)")

if n_landmarks < 4:
    print(f"  ERROR: need ≥4 landmarks for 3D TPS"); sys.exit(1)

# ========================================================================
# 4. Solve TPS
# ========================================================================
print(f"\n[3] Solve TPS (n={n_landmarks}, λ={TPS_LAMBDA})")

def tps_kernel(r):
    """TPS basis function φ(r) = r² log(r), with safe handling at r=0."""
    out = np.zeros_like(r)
    mask = r > 1e-9
    rm = r[mask]
    out[mask] = (rm * rm) * np.log(rm)
    return out

def tps_solve(src, tgt, lam=0.0):
    """Solve TPS: find W (n×3) and C (4×3) such that
       f(x) = C[0] + C[1:].T @ x + Σ_i W[i] * φ(||x - src[i]||)
       satisfies f(src[i]) = tgt[i] for all i.
    """
    n = len(src)
    # Pairwise distances among src
    dij = np.linalg.norm(src[:, None, :] - src[None, :, :], axis=2)  # n×n
    K = tps_kernel(dij)
    K += lam * np.eye(n)
    # Affine basis P (n×4): [1, x, y, z]
    P = np.hstack([np.ones((n, 1)), src])
    # Block matrix L = [[K, P], [P.T, 0]] of shape (n+4)×(n+4)
    L = np.zeros((n + 4, n + 4))
    L[:n, :n] = K
    L[:n, n:] = P
    L[n:, :n] = P.T
    Y = np.vstack([tgt, np.zeros((4, 3))])
    coeffs = np.linalg.solve(L, Y)
    return coeffs[:n], coeffs[n:n+4]  # W (n×3), C (4×3)

def tps_apply(query, src, W, C):
    """Apply TPS deformation to query points (nq×3) → returns nq×3."""
    nq = len(query)
    # Distances query × src: nq×n
    dists = np.linalg.norm(query[:, None, :] - src[None, :, :], axis=2)
    phi = tps_kernel(dists)  # nq×n
    bending = phi @ W       # nq×3
    P_q = np.hstack([np.ones((nq, 1)), query])
    affine = P_q @ C
    return affine + bending

W, C = tps_solve(src_pts, tgt_pts, lam=TPS_LAMBDA)

# Verify TPS reproduces landmarks
verify = tps_apply(src_pts, src_pts, W, C)
errs = np.linalg.norm(verify - tgt_pts, axis=1)
print(f"  landmark reproduction error: max={errs.max()*1000:.4f}mm, mean={errs.mean()*1000:.4f}mm")

# Save TPS data for later validation/reuse
tps_data_path = os.path.splitext(OUT_BLEND)[0] + ".tps.json"
import json as _json
with open(tps_data_path, 'w', encoding='utf-8') as _f:
    _json.dump({
        'src_pts': src_pts.tolist(),
        'tgt_pts': tgt_pts.tolist(),
        'W': W.tolist(),
        'C': C.tolist(),
        'lambda': TPS_LAMBDA,
        'samples_per_bone': SAMPLES_PER_BONE,
    }, _f)
print(f"  saved TPS coefficients: {tps_data_path}")

# ========================================================================
# 5. Apply TPS to suit vertices
# ========================================================================
print(f"\n[4] Deform suit ({len(src_suit.data.vertices)} verts)")

# Clear shape keys (need clean Basis to modify .co)
if src_suit.data.shape_keys:
    n_sk = len(src_suit.data.shape_keys.key_blocks)
    bpy.ops.object.select_all(action='DESELECT')
    src_suit.select_set(True); bpy.context.view_layer.objects.active = src_suit
    bpy.ops.object.shape_key_remove(all=True)
    print(f"  cleared {n_sk} shape keys")

# Compute world-space verts → apply TPS → write back to local
suit_mw = src_suit.matrix_world.copy()
suit_mw_inv = src_suit.matrix_world.inverted()
verts_world = np.array([(suit_mw @ v.co)[:] for v in src_suit.data.vertices], dtype=np.float64)

new_world = tps_apply(verts_world, src_pts, W, C)

# Per-vertex displacement stats
disp = np.linalg.norm(new_world - verts_world, axis=1)
print(f"  per-vertex displacement: max={disp.max()*1000:.1f}mm, mean={disp.mean()*1000:.1f}mm, median={np.median(disp)*1000:.1f}mm")

for i, v in enumerate(src_suit.data.vertices):
    v.co = suit_mw_inv @ Vector(new_world[i])
src_suit.data.update()

# ========================================================================
# 6. Re-target armature + rename VGs
# ========================================================================
print(f"\n[5] Re-target armature + rename VGs")
suit_arm_mod = next((m for m in src_suit.modifiers if m.type == 'ARMATURE'), None)
if suit_arm_mod:
    suit_arm_mod.object = tgt_arm_obj
else:
    am = src_suit.modifiers.new(name='Armature_QM', type='ARMATURE')
    am.object = tgt_arm_obj; am.use_vertex_groups = True

tgt_bone_names = set(b.name for b in tgt_arm_obj.data.bones)
renamed = 0; removed = 0; kept = 0
for vg in list(src_suit.vertex_groups):
    s_n = vg.name
    if s_n in tgt_bone_names:
        kept += 1; continue
    t_n = VG_RENAME.get(s_n)
    if t_n and t_n in tgt_bone_names:
        if t_n in src_suit.vertex_groups:
            # merge: add weights into existing tgt VG
            src_idx = vg.index
            tgt_vg = src_suit.vertex_groups[t_n]
            for v in src_suit.data.vertices:
                for g in v.groups:
                    if g.group == src_idx:
                        tgt_vg.add([v.index], g.weight, 'ADD')
            src_suit.vertex_groups.remove(vg)
        else:
            vg.name = t_n
        renamed += 1
    else:
        src_suit.vertex_groups.remove(vg); removed += 1
        print(f"    unmapped (removed): {s_n}")
print(f"  VG: kept={kept}, renamed={renamed}, removed={removed}")

# ========================================================================
# 7. Cleanup + save
# ========================================================================
print(f"\n[6] Cleanup and save")
if src_arm: bpy.data.objects.remove(src_arm, do_unlink=True)
bpy.data.objects.remove(src_body, do_unlink=True)
src_suit.parent = tgt_arm_obj
src_suit.matrix_parent_inverse = tgt_arm_obj.matrix_world.inverted()
src_suit.name = f"{src_suit.name} (TPS)"

OUT_BLEND_ABS = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(OUT_BLEND_ABS)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND_ABS)
print(f"  saved: {OUT_BLEND_ABS}")
print(f"\n=== DONE ===")
