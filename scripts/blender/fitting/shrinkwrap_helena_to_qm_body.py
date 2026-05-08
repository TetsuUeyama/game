"""Helena_Base + outfit メッシュの体部位頂点を QM body 表面にスナップ。

LBS retarget で QM rest pose 空間に移動済の Helena 関連メッシュに対し、
体部位 (頭/顔/首以外) の頂点を QM body 表面にプロジェクションして
シルエットを QM プロポーションに揃える。

頭/顔は Helena のまま保持 → キャラクター個性を残す。
髪 (Hair Mesh) は別メッシュなので自動的に変更されない。

入力:
  Helena_Final_QM.blend (transplant_qm_armature_to_helena.py の出力)
  - Helena_Base (Helena ボディメッシュ、QueenMarika_rig 骨組み済)
  - 各 outfit メッシュ (GCC DOA Outfit ..., Qipao Mesh, ...)
  - Queen Marika Body (QM の参照メッシュ)
  - QueenMarika_rig (QM アーマチュア)

処理:
  [1] 各対象メッシュ + QM body を特定
  [2] QM body の BVH ツリー構築 (最近傍検索用)
  [3] 各対象メッシュの頂点 v について:
       - shape keys がある場合は事前に削除 (DAZ morph が編集を上書きする問題回避)
       - 最も大きく寄与している vertex group の bone 名を取得
       - bone 名が HEAD_BONE_PATTERNS にマッチする → スキップ (頭/顔)
       - それ以外 → QM body 表面の最近傍点に移動

Usage:
  blender --background <Helena_Final_QM.blend> \\
    --python scripts/blender/fitting/shrinkwrap_helena_to_qm_body.py -- \\
    <out.blend> [<mesh_name1> <mesh_name2> ...]

  mesh_name 省略時は Helena_Base のみ処理。
  複数指定で outfit も同様にラップ可能。
"""
import bpy
import sys
import os
from mathutils import Vector
from mathutils.bvhtree import BVHTree


# 頭/顔/首として除外するボーン名パターン (lowercase substring match)
HEAD_BONE_PATTERNS = [
    'head', 'neck', 'jaw', 'eyelid', 'eye', 'lip', 'tongue',
    'teeth', 'mouth', 'ear', 'cheek', 'brow', 'face',
    'tongue', 'lash', 'pupil', 'nose',
    'hair', 'ponytail', 'sidehair',
]
# 体として shrinkwrap 対象に含めるボーン名 (lowercase substring match)
BODY_OVERRIDE_PATTERNS = [
    'breast',
]
QM_BODY_NAME = "Queen Marika Body"


def is_head_bone(bn: str) -> bool:
    n = bn.lower()
    if any(p in n for p in BODY_OVERRIDE_PATTERNS):
        return False
    return any(p in n for p in HEAD_BONE_PATTERNS)


# ============================================================
# Args
# ============================================================
argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 1:
    print(__doc__)
    sys.exit(1)

OUT_BLEND = args[0]
MESH_NAMES = args[1:] if len(args) > 1 else ["Helena_Base"]

print(f"\n=== shrinkwrap_helena_to_qm_body ===")
print(f"  out: {OUT_BLEND}")
print(f"  meshes: {MESH_NAMES}")


# ============================================================
# [1] Find QM body (BVH target) + target meshes
# ============================================================
qm_body = bpy.data.objects.get(QM_BODY_NAME)
if qm_body is None:
    print(f"ERROR: {QM_BODY_NAME} not found")
    sys.exit(1)

target_meshes = []
for name in MESH_NAMES:
    o = bpy.data.objects.get(name)
    if o is None:
        print(f"  WARN: mesh '{name}' not found, skipping")
        continue
    if o.type != "MESH":
        print(f"  WARN: '{name}' is not a mesh ({o.type}), skipping")
        continue
    target_meshes.append(o)

print(f"\n[1] Found {len(target_meshes)} target meshes (QM body: {qm_body.name})")


# ============================================================
# [2] Build BVH from QM body (in world space)
# ============================================================
print(f"\n[2] Build BVH from QM body world-space mesh")
qm_world = qm_body.matrix_world
qm_polys = qm_body.data.polygons
qm_verts_world = [qm_world @ v.co for v in qm_body.data.vertices]
verts = qm_verts_world
polys = []
for p in qm_polys:
    vi = list(p.vertices)
    for i in range(1, len(vi) - 1):
        polys.append([vi[0], vi[i], vi[i + 1]])
bvh = BVHTree.FromPolygons(verts, polys, all_triangles=True)
print(f"    BVH: {len(verts)} verts, {len(polys)} triangles")


# ============================================================
# [3] Process each mesh
# ============================================================
print(f"\n[3] Shrinkwrap each mesh")
totals = {'verts': 0, 'head': 0, 'snap': 0, 'no_w': 0}

for helena in target_meshes:
    mesh = helena.data

    # Remove shape keys (DAZ-imported meshes have morphs whose data blocks
    # override v.co edits during depsgraph evaluation)
    if mesh.shape_keys:
        n_keys = len(mesh.shape_keys.key_blocks)
        bpy.context.view_layer.objects.active = helena
        try:
            helena.select_set(True)
        except RuntimeError:
            pass
        bpy.ops.object.shape_key_remove(all=True)
        print(f"    [{helena.name}] removed {n_keys} shape keys")

    mesh_world = helena.matrix_world
    mesh_world_inv = mesh_world.inverted()

    vg_idx_to_name = {vg.index: vg.name for vg in helena.vertex_groups}
    vg_idx_is_head = {idx: is_head_bone(name) for idx, name in vg_idx_to_name.items()}

    n_total = len(mesh.vertices)
    n_head = 0
    n_snap = 0
    n_no_w = 0
    max_dist = 0.0
    sum_dist = 0.0

    for v in mesh.vertices:
        if not v.groups:
            n_no_w += 1
            continue
        best_w = -1.0
        best_idx = -1
        for g in v.groups:
            if g.weight > best_w:
                best_w = g.weight
                best_idx = g.group
        if best_idx < 0:
            n_no_w += 1
            continue
        if vg_idx_is_head.get(best_idx, False):
            n_head += 1
            continue
        p_world = mesh_world @ v.co
        nearest = bvh.find_nearest(p_world)
        if nearest is None or nearest[0] is None:
            continue
        loc, _normal, _idx, dist = nearest
        v.co = mesh_world_inv @ loc
        n_snap += 1
        if dist > max_dist: max_dist = dist
        sum_dist += dist

    avg_dist = sum_dist / max(1, n_snap)
    print(f"    [{helena.name}] verts={n_total} head={n_head} snap={n_snap} "
          f"no_w={n_no_w} avg={avg_dist*1000:.2f}mm max={max_dist*1000:.2f}mm")
    totals['verts'] += n_total
    totals['head'] += n_head
    totals['snap'] += n_snap
    totals['no_w'] += n_no_w

print(f"\n  TOTAL: verts={totals['verts']} head={totals['head']} "
      f"snap={totals['snap']} no_w={totals['no_w']}")


# ============================================================
# [4] Save
# ============================================================
out_abs = os.path.abspath(OUT_BLEND)
out_dir = os.path.dirname(out_abs)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
print(f"\n[4] Save -> {out_abs}")
bpy.ops.wm.save_as_mainfile(filepath=out_abs)
print(f"\n=== DONE ===")
