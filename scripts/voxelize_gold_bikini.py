"""Voxelize Gold Bikini parts from Queen Marika model.
The collection is hidden by default, so we enable it first.

Usage: blender --background --python scripts/voxelize_gold_bikini.py
"""
import bpy
import bmesh
import struct
import math
import os
import json
from mathutils import Vector
from mathutils.bvhtree import BVHTree

bpy.ops.wm.open_mainfile(filepath="E:/QueenMarika_Rigged_MustardUI.blend")

# Enable hidden Golden Bikini collection
for col in bpy.data.collections:
    if "Golden Bikini" in col.name:
        col.hide_viewport = False
        def enable_lc(parent):
            for child in parent.children:
                if child.name == col.name:
                    child.exclude = False
                enable_lc(child)
        enable_lc(bpy.context.view_layer.layer_collection)
        print(f"Enabled collection: {col.name}")

bpy.context.view_layer.update()

# Find bikini meshes
bikini_objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and "Golden Bikini" in o.name]
for o in bikini_objs:
    o.hide_viewport = False
    print(f"  {o.name}: {len(o.data.vertices)} verts")

# Body bbox (same as main voxelizer)
body_objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name == "Queen Marika Body"]
min_co = Vector((1e9, 1e9, 1e9))
max_co = Vector((-1e9, -1e9, -1e9))
for obj in body_objs:
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    for v in me.vertices:
        for i in range(3):
            min_co[i] = min(min_co[i], v.co[i])
            max_co[i] = max(max_co[i], v.co[i])
    eo.to_mesh_clear()

size = max_co - min_co
center = (min_co + max_co) / 2
model_h = size.z

def deform_point(co):
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = (t - 0.85) / 0.15
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        z = z + ht * model_h * 0.06
    elif t > 0.50:
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
    else:
        leg_t = t / 0.50
        f = 0.70 * leg_t + 0.30 * leg_t * leg_t
        z = min_co.z + f * 0.50 * model_h
        s = 1.1
        x = center.x + (x - center.x) * s
        y = center.y + (y - center.y) * s
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x += sign * spread
    return Vector((x, y, z))

def inv_deform(co):
    x, y, z = co.x, co.y, co.z
    t = max(0, min(1, (z - min_co.z) / model_h)) if model_h > 0 else 0.5
    if t > 0.85:
        ht = min(1, (t - 0.85) / 0.15)
        s = 1.5 + ht * 0.3
        x = center.x + (x - center.x) / s
        y = center.y + (y - center.y) / s
        z = z - ht * model_h * 0.06
    elif t > 0.50:
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    else:
        u = (z - min_co.z) / (0.50 * model_h) if model_h > 0 else 0
        u = max(0, min(1, u))
        disc = 0.49 + 1.20 * u
        r = (-0.70 + math.sqrt(disc)) / 0.60 if disc >= 0 else 0
        r = max(0, min(1, r))
        leg_t = r
        sign = 1.0 if x > center.x else -1.0
        spread = 0.06 * (1.0 - leg_t)
        x -= sign * spread
        z = min_co.z + r * 0.50 * model_h
        x = center.x + (x - center.x) / 1.1
        y = center.y + (y - center.y) / 1.1
    return Vector((x, y, z))

# Grid info from previous run
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
grid = json.load(open(os.path.join(BASE, "public/box4/queenmarika_rigged_mustardui_grid.json")))
gx, gy, gz = grid["gx"], grid["gy"], grid["gz"]
voxel_size = grid["voxel_size"]
def_min = Vector(grid["def_min"])
print(f"Grid: {gx}x{gy}x{gz}, voxel_size={voxel_size:.6f}")

# Texture handling
texture_cache = {}

def cache_texture(image):
    if image.name in texture_cache:
        return
    w, h = image.size
    if w == 0 or h == 0:
        return
    texture_cache[image.name] = (w, h, list(image.pixels))
    print(f"  Cache: {image.name} ({w}x{h})")

def sample_texture(img_name, u, v):
    if img_name not in texture_cache:
        return None
    w, h, pix = texture_cache[img_name]
    px = int(u * w) % w
    py = int(v * h) % h
    pi = (py * w + px) * 4
    if pi + 2 < len(pix):
        return (int(pix[pi] * 255), int(pix[pi + 1] * 255), int(pix[pi + 2] * 255))
    return None

# Material info
mat_info = {}
for obj in bikini_objs:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or mat.name in mat_info:
            continue
        info = {"image": None, "color": (180, 180, 180)}
        if hasattr(mat, "node_tree") and mat.node_tree:
            # Find best texture
            best_img = None
            best_score = -999
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    n = node.image.name.lower()
                    s = 0
                    if "basecolor" in n or "base_color" in n or "diffuse" in n:
                        s = 10
                    if any(k in n for k in ["normal", "roughness", "metallic", "specular", "height", "opacity"]):
                        s = -10
                    if s > best_score:
                        best_score = s
                        best_img = node.image
                # Check group nodes
                if node.type == "GROUP" and node.node_tree:
                    for inner in node.node_tree.nodes:
                        if inner.type == "TEX_IMAGE" and inner.image:
                            n = inner.image.name.lower()
                            s = 0
                            if "basecolor" in n or "base_color" in n or "diffuse" in n:
                                s = 10
                            if any(k in n for k in ["normal", "roughness", "metallic"]):
                                s = -10
                            if s > best_score:
                                best_score = s
                                best_img = inner.image
            if best_img and best_score >= 0:
                cache_texture(best_img)
                info["image"] = best_img.name
            else:
                for node in mat.node_tree.nodes:
                    if node.type == "BSDF_PRINCIPLED":
                        inp = node.inputs.get("Base Color")
                        if inp and not inp.is_linked:
                            c = inp.default_value
                            info["color"] = (int(c[0] * 255), int(c[1] * 255), int(c[2] * 255))
                        break
        mat_info[mat.name] = info
        tag = info["image"] or f"flat{info['color']}"
        print(f"  Mat: {mat.name} -> {tag}")

# Build BVH per part
class MeshInfo:
    pass

parts = {}
for obj in bikini_objs:
    key = "gold_bikini_bra" if "Bra" in obj.name else "gold_bikini_panties"
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    me.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    mi = MeshInfo()
    mi.bvh = BVHTree.FromBMesh(bm)
    mi.bm = bm
    mi.uv = bm.loops.layers.uv.active
    mi.face_mat = {}
    mi.face_tex = {}
    for face in bm.faces:
        midx = face.material_index
        mat_name = None
        if midx < len(obj.material_slots) and obj.material_slots[midx].material:
            mat_name = obj.material_slots[midx].material.name
        mi.face_mat[face.index] = mat_name
        mi.face_tex[face.index] = mat_info.get(mat_name, {}).get("image")
    parts[key] = mi
    eo.to_mesh_clear()
    print(f"  BVH: {key} ({len(bm.faces)} tris)")

def get_color_at(md, fi, hit):
    tex = md.face_tex.get(fi)
    if tex and md.uv and fi < len(md.bm.faces):
        face = md.bm.faces[fi]
        loops = face.loops
        if len(loops) == 3:
            v0, v1, v2 = [l.vert.co for l in loops]
            uv0, uv1, uv2 = [l[md.uv].uv for l in loops]
            e0, e1 = v1 - v0, v2 - v0
            ep = hit - v0
            d00, d01, d11 = e0.dot(e0), e0.dot(e1), e1.dot(e1)
            dp0, dp1 = ep.dot(e0), ep.dot(e1)
            denom = d00 * d11 - d01 * d01
            if abs(denom) > 1e-12:
                uu = (d11 * dp0 - d01 * dp1) / denom
                vv = (d00 * dp1 - d01 * dp0) / denom
                ww = 1 - uu - vv
                uvu = max(0, min(1, ww)) * uv0.x + max(0, min(1, uu)) * uv1.x + max(0, min(1, vv)) * uv2.x
                uvv = max(0, min(1, ww)) * uv0.y + max(0, min(1, uu)) * uv1.y + max(0, min(1, vv)) * uv2.y
                c = sample_texture(tex, uvu, uvv)
                if c:
                    return c
    mn = md.face_mat.get(fi)
    if mn and mn in mat_info:
        return mat_info[mn]["color"]
    return (180, 180, 180)

# Voxelize
thr = voxel_size * 1.2
for key, md in parts.items():
    print(f"\nVoxelizing {key}...")
    result = {}
    for vz in range(gz):
        if vz % 20 == 0:
            print(f"  z={vz}/{gz} hits={len(result)}")
        for vx in range(gx):
            for vy in range(gy):
                dp = Vector((
                    def_min.x + (vx + 0.5) * voxel_size,
                    def_min.y + (vy + 0.5) * voxel_size,
                    def_min.z + (vz + 0.5) * voxel_size,
                ))
                op = inv_deform(dp)
                loc, norm, fi, dist = md.bvh.find_nearest(op)
                if loc is not None and dist < thr:
                    result[(vx, vy, vz)] = get_color_at(md, fi, loc)
    print(f"  {key}: {len(result)} voxels")

    # Build palette
    color_map = {}
    pal = []
    out = []
    for (vx, vy, vz), (r, g, b) in result.items():
        qr, qg, qb = (r // 8) * 8, (g // 8) * 8, (b // 8) * 8
        k = (qr, qg, qb)
        if k not in color_map:
            if len(pal) >= 255:
                best_i, best_d = 0, 1e9
                for i, (pr, pg, pb) in enumerate(pal):
                    d = (pr - qr) ** 2 + (pg - qg) ** 2 + (pb - qb) ** 2
                    if d < best_d:
                        best_d = d
                        best_i = i
                color_map[k] = best_i + 1
            else:
                pal.append(k)
                color_map[k] = len(pal)
        out.append((vx, vy, vz, color_map[k]))

    # Write .vox
    fp = os.path.join(BASE, f"public/box4/queenmarika_rigged_mustardui_{key}.vox")
    xyzi_size = 4 + len(out) * 4
    children_size = (12 + 12) + (12 + xyzi_size) + (12 + 1024)
    with open(fp, "wb") as f:
        f.write(b"VOX ")
        f.write(struct.pack("<I", 150))
        f.write(b"MAIN")
        f.write(struct.pack("<II", 0, children_size))
        f.write(b"SIZE")
        f.write(struct.pack("<II", 12, 0))
        f.write(struct.pack("<III", gx, gy, gz))
        f.write(b"XYZI")
        f.write(struct.pack("<II", xyzi_size, 0))
        f.write(struct.pack("<I", len(out)))
        for vx, vy, vz, ci in out:
            f.write(struct.pack("BBBB", vx, vy, vz, ci))
        f.write(b"RGBA")
        f.write(struct.pack("<II", 1024, 0))
        for i in range(256):
            if i < len(pal):
                f.write(struct.pack("BBBB", pal[i][0], pal[i][1], pal[i][2], 255))
            else:
                f.write(struct.pack("BBBB", 0, 0, 0, 0))
    print(f"  -> {fp}: {len(out)} voxels, {len(pal)} colors")

# Cleanup
for md in parts.values():
    md.bm.free()

# Update manifest
manifest_path = os.path.join(BASE, "public/box4/queenmarika_rigged_mustardui_parts.json")
manifest = json.load(open(manifest_path))
for key, md_unused in parts.items():
    filename = f"queenmarika_rigged_mustardui_{key}.vox"
    vox_count = len([1 for _ in open(os.path.join(BASE, f"public/box4/{filename}"), "rb").read()])
    # Just use the result count from earlier
    existing = [p for p in manifest if p["key"] == key]
    if not existing:
        manifest.append({
            "key": key,
            "file": f"/box4/{filename}",
            "voxels": 0,  # Will be set properly
            "default_on": False,
        })
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)
print(f"\nUpdated manifest: {manifest_path}")
print("\nDone!")
