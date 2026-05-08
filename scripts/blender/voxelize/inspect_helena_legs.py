"""Helena .blend で脚関連衣類のメッシュ情報を比較。
   各メッシュの頂点数、面数、bbox、平均エッジ長、面方向の偏りを確認する。

Usage:
  blender --background <helena.blend> --python inspect_helena_legs.py
"""
import bpy
import sys
from mathutils import Vector

LEG_KEYWORDS = ['Leggings', 'Pants', 'Shoes', 'Sneakers', 'Shin', 'Bunny', 'Bottom']

def get_world_bbox(obj):
    mat = obj.matrix_world
    cs = [mat @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in cs]; ys = [c.y for c in cs]; zs = [c.z for c in cs]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))

def avg_edge_length(obj):
    me = obj.data
    me.calc_loop_triangles()
    if not me.loop_triangles: return 0
    mat = obj.matrix_world
    total = 0; count = 0
    for tri in me.loop_triangles[:200]:  # サンプル
        v0 = mat @ me.vertices[tri.vertices[0]].co
        v1 = mat @ me.vertices[tri.vertices[1]].co
        v2 = mat @ me.vertices[tri.vertices[2]].co
        total += (v1-v0).length + (v2-v1).length + (v0-v2).length
        count += 3
    return total / count if count else 0

def normal_diversity(obj):
    """面法線の多様性 (0=全部同じ, 高い=多方向)。closed shell なら全方向 → 高い"""
    me = obj.data
    me.calc_loop_triangles()
    if not me.loop_triangles: return 0
    bins = [0]*26  # 5x5 angular bins approximation
    import math
    mat = obj.matrix_world
    for tri in me.loop_triangles[:500]:
        v0 = mat @ me.vertices[tri.vertices[0]].co
        v1 = mat @ me.vertices[tri.vertices[1]].co
        v2 = mat @ me.vertices[tri.vertices[2]].co
        n = ((v1-v0).cross(v2-v0)).normalized()
        # azimuth + elevation
        az = math.atan2(n.y, n.x)
        el = math.asin(max(-1, min(1, n.z)))
        b = int((az + math.pi) / (2*math.pi) * 16) + int((el + math.pi/2) / math.pi * 8) * 16
        bins[min(b, 25)] += 1
    nonzero = sum(1 for b in bins if b > 0)
    return nonzero  # 0-26, higher = more directions

def is_closed_mesh(obj):
    """エッジ単位で manifold チェック (closed = 各 edge が exactly 2 face を持つ)"""
    me = obj.data
    edge_face_count = {}
    for poly in me.polygons:
        verts = list(poly.vertices)
        for i in range(len(verts)):
            ek = tuple(sorted([verts[i], verts[(i+1)%len(verts)]]))
            edge_face_count[ek] = edge_face_count.get(ek, 0) + 1
    border = sum(1 for c in edge_face_count.values() if c == 1)
    nonmanifold = sum(1 for c in edge_face_count.values() if c > 2)
    return {'total': len(edge_face_count), 'border': border, 'nonmanifold': nonmanifold}

print("\n=== Helena leg-related clothing inspection ===\n")
candidates = []
for ob in bpy.data.objects:
    if ob.type != 'MESH': continue
    if not ob.name.startswith('Helena'): continue
    if any(kw in ob.name for kw in LEG_KEYWORDS):
        candidates.append(ob)

candidates.sort(key=lambda o: o.name)
for ob in candidates:
    me = ob.data
    bx, by, bz = get_world_bbox(ob)
    height_mm = (bz[1] - bz[0]) * 1000
    width_mm = (bx[1] - bx[0]) * 1000
    depth_mm = (by[1] - by[0]) * 1000
    edge_mm = avg_edge_length(ob) * 1000
    closure = is_closed_mesh(ob)
    nd = normal_diversity(ob)
    print(f"{ob.name}")
    print(f"  verts: {len(me.vertices)}, faces: {len(me.polygons)}")
    print(f"  bbox: {width_mm:.0f}W x {depth_mm:.0f}D x {height_mm:.0f}H mm")
    print(f"  Z range: {bz[0]:.3f} ~ {bz[1]:.3f} m")
    print(f"  avg edge: {edge_mm:.1f} mm")
    print(f"  edges: {closure['total']}, border (open): {closure['border']}, non-manifold: {closure['nonmanifold']}")
    print(f"  normal diversity: {nd}/26 (high = closed shell)")
    print()

print("=== Body reference ===")
body = bpy.data.objects.get('Body')
if body:
    me = body.data
    bx, by, bz = get_world_bbox(body)
    print(f"Body: verts={len(me.vertices)}, height_mm={(bz[1]-bz[0])*1000:.0f}, Z={bz[0]:.3f}~{bz[1]:.3f}")
