"""Bake source body distance per Helena clothing vertex + capture QM-fitted positions.

Helena .blend から「衣類頂点 → Helena body 表面」の距離を計算し、
fit 結果 .blend から同一頂点の QM-space ワールド位置を取得して JSON に出力する。

Usage:
  blender --background <fit_blend> --python bake_source_distance.py -- \
    <helena_blend> <helena_body_name> <helena_dress_name> <fit_dress_name> <out_json>

Example:
  blender --background "E:/MOdel/Helena_to_QM_witch_corset.blend" \
    --python scripts/blender/voxelize/bake_source_distance.py -- \
    "E:/Helena_Douglas_1.10.blend" "Body" "Helena Witch - Corset" \
    "Helena Witch - Corset" "tmp/source_distance/helena_witch_corset.json"
"""
import bpy, sys, os, json

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 5:
    print(__doc__); sys.exit(1)

HELENA_BLEND, HELENA_BODY, HELENA_DRESS, FIT_DRESS, OUT_JSON = args[:5]

print(f"\n=== Bake source body distance ===")
print(f"  helena_blend: {HELENA_BLEND}")
print(f"  helena_body:  {HELENA_BODY}")
print(f"  helena_dress: {HELENA_DRESS}")
print(f"  fit_dress:    {FIT_DRESS}")
print(f"  out_json:     {OUT_JSON}")

print(f"\n[0] Inspect FIT blend objects (currently loaded)")
for ob in bpy.data.objects:
    print(f"  - {ob.name} ({ob.type})")

# Find fitted dress in current scene
fit_dress = bpy.data.objects.get(FIT_DRESS)
if fit_dress is None or fit_dress.type != 'MESH':
    print(f"\nERROR: fit dress mesh '{FIT_DRESS}' not found in fit blend")
    print("Available MESH objects:")
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            print(f"  - {ob.name} ({len(ob.data.vertices)} verts)")
    sys.exit(1)

print(f"\n[1] Fit dress: {fit_dress.name} ({len(fit_dress.data.vertices)} verts)")

# Capture fitted vertex world positions
mat_fit = fit_dress.matrix_world
fit_positions = []
for v in fit_dress.data.vertices:
    wp = mat_fit @ v.co
    fit_positions.append((wp.x, wp.y, wp.z))
print(f"  captured {len(fit_positions)} QM-fitted vertex positions")

# Load Helena assets into a temp scene to avoid name collision
print(f"\n[2] Load Helena body + dress from source blend")
# Append with temp suffix to avoid collision with fit_dress (same name)
TEMP_PREFIX = "__SRC__"
with bpy.data.libraries.load(HELENA_BLEND, link=False) as (src, dst):
    dst.objects = [HELENA_BODY, HELENA_DRESS]

# Loaded objects are now in bpy.data.objects but not linked to scene.
# Find them — they may have been imported with names like "Body.001" if collision.
# Fall back to scanning recently added objects.
helena_body = None
helena_dress = None
for ob in bpy.data.objects:
    if ob == fit_dress: continue
    if ob.type != 'MESH': continue
    # Match by exact name first
    if ob.name == HELENA_BODY and helena_body is None:
        helena_body = ob
    elif ob.name == HELENA_DRESS and helena_dress is None and ob != fit_dress:
        helena_dress = ob
    # Match by ".001" suffix (collision)
    elif ob.name.startswith(HELENA_BODY) and helena_body is None:
        helena_body = ob
    elif ob.name.startswith(HELENA_DRESS) and helena_dress is None and ob != fit_dress:
        helena_dress = ob

if helena_body is None or helena_dress is None:
    print(f"ERROR: failed to find Helena body/dress after load")
    print("All MESH objects:")
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            print(f"  - {ob.name} ({len(ob.data.vertices)} verts)")
    sys.exit(1)

print(f"  helena_body:  {helena_body.name} ({len(helena_body.data.vertices)} verts)")
print(f"  helena_dress: {helena_dress.name} ({len(helena_dress.data.vertices)} verts)")

# Sanity: dress vertex count must match between Helena and fit
if len(helena_dress.data.vertices) != len(fit_positions):
    print(f"\nWARNING: vertex count mismatch helena={len(helena_dress.data.vertices)} fit={len(fit_positions)}")

# Build BVHTree for Helena body
print(f"\n[3] Build BVHTree for Helena body")
from mathutils.bvhtree import BVHTree
mat_body = helena_body.matrix_world
body_verts = [mat_body @ v.co for v in helena_body.data.vertices]
body_polys = [[vi for vi in p.vertices] for p in helena_body.data.polygons]
body_bvh = BVHTree.FromPolygons(body_verts, body_polys)
print(f"  body verts: {len(body_verts)}, polys: {len(body_polys)}")

# For each dress vertex, compute source distance
print(f"\n[4] Compute per-vertex source body distance")
mat_dress = helena_dress.matrix_world
results = []
dist_min, dist_max, dist_sum = 1e18, 0.0, 0.0
hist_buckets = [0] * 11  # 0-10mm, 10-20, ..., >100mm
for i, v in enumerate(helena_dress.data.vertices):
    helena_wp = mat_dress @ v.co
    nearest_loc, nearest_n, _, dist = body_bvh.find_nearest(helena_wp)
    qm_wp = fit_positions[i] if i < len(fit_positions) else None
    results.append({
        'i': i,
        'helena_pos': [round(helena_wp.x, 5), round(helena_wp.y, 5), round(helena_wp.z, 5)],
        'qm_pos': [round(qm_wp[0], 5), round(qm_wp[1], 5), round(qm_wp[2], 5)] if qm_wp else None,
        'source_distance': round(dist, 5),
    })
    dist_min = min(dist_min, dist)
    dist_max = max(dist_max, dist)
    dist_sum += dist
    bucket = min(int(dist * 100), 10)  # 1cm per bucket, cap at 10
    hist_buckets[bucket] += 1

avg = dist_sum / len(results) if results else 0
print(f"  vertices: {len(results)}")
print(f"  source distance min/avg/max: {dist_min*1000:.1f} / {avg*1000:.1f} / {dist_max*1000:.1f} mm")
print(f"  distance histogram (cm bins):")
for b, c in enumerate(hist_buckets):
    label = f"{b}-{b+1}cm" if b < 10 else ">10cm"
    print(f"    {label:>6}: {c} verts")

# Save
print(f"\n[5] Save JSON")
out_dir = os.path.dirname(OUT_JSON)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir)
with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump({
        'helena_blend': HELENA_BLEND,
        'helena_dress': HELENA_DRESS,
        'fit_dress': FIT_DRESS,
        'vertex_count': len(results),
        'distance_stats_mm': {
            'min': round(dist_min * 1000, 2),
            'avg': round(avg * 1000, 2),
            'max': round(dist_max * 1000, 2),
        },
        'vertices': results,
    }, f, ensure_ascii=False)
print(f"  wrote {OUT_JSON}")
print(f"\n=== DONE ===")
