"""Deep inspect of Queen Marika Body mesh + look for oral cavity geometry.

- All visible/hidden objects
- bpy.data.meshes (orphan datablocks)
- Queen Marika Body: vertex groups, material face counts, all bone names from VG
- Search for jaw/tongue/teeth/lip/mouth keywords across vertex groups, bones, materials
"""
import bpy

print("=" * 70)
print("Blender file:", bpy.data.filepath)
print("=" * 70)

print("\n=== ALL OBJECTS (visible + hidden) ===")
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    name = o.name
    if name.startswith('cs_') or name.startswith('cage-'):
        continue
    print(f"  {name!r:50s}  hide_viewport={o.hide_viewport}  hide_render={o.hide_render}  visible_get={o.visible_get()}")

print("\n=== ALL MESH DATABLOCKS (incl. orphan with users=0) ===")
for m in bpy.data.meshes:
    name = m.name
    if name.startswith('cs_') or name.startswith('cage-'):
        continue
    print(f"  {name!r:50s}  users={m.users}  vertices={len(m.vertices)}")

# --- Queen Marika Body deep dive ---
body = bpy.data.objects.get('Queen Marika Body')
if body:
    print("\n=== Queen Marika Body: Material face counts ===")
    for i, slot in enumerate(body.material_slots):
        mat_name = slot.material.name if slot.material else "(empty)"
        count = sum(1 for p in body.data.polygons if p.material_index == i)
        verts_in_mat = set()
        for p in body.data.polygons:
            if p.material_index == i:
                for v in p.vertices:
                    verts_in_mat.add(v)
        print(f"  slot {i}: {mat_name!r:35s}  faces={count}  unique_verts={len(verts_in_mat)}")

    print(f"\n=== Queen Marika Body: {len(body.vertex_groups)} vertex groups ===")
    # Show all VGs sorted, marking interesting ones
    vgs_sorted = sorted([vg.name for vg in body.vertex_groups])
    interesting_keywords = ['jaw', 'tongue', 'teeth', 'lip', 'mouth', 'oral', 'gum', 'cheek', 'palate', 'inner', 'inside']
    for vg in vgs_sorted:
        marker = ''
        ln = vg.lower()
        for kw in interesting_keywords:
            if kw in ln:
                marker = f' <<< {kw}'
                break
        print(f"  {vg}{marker}")

    print(f"\n=== Queen Marika Body: Shape Keys ===")
    if body.data.shape_keys:
        for sk in body.data.shape_keys.key_blocks:
            print(f"  {sk.name!r}  value={sk.value:.3f}")
    else:
        print("  (no shape keys)")

# --- Search bones for oral cavity bones ---
arm = bpy.data.armatures.get('rig')
if arm:
    print(f"\n=== Armature 'rig': bones containing keywords ===")
    interesting_keywords = ['jaw', 'tongue', 'teeth', 'lip', 'mouth', 'oral', 'gum', 'cheek', 'palate']
    matched = []
    for b in arm.bones:
        ln = b.name.lower()
        for kw in interesting_keywords:
            if kw in ln:
                matched.append((b.name, kw))
                break
    print(f"  {len(matched)} bones matched")
    for name, kw in matched:
        print(f"    {name}  <<< {kw}")

# --- Materials with mouth-related keywords ---
print("\n=== Materials matching mouth-related keywords ===")
interesting_keywords = ['jaw', 'tongue', 'teeth', 'lip', 'mouth', 'oral', 'gum', 'inner']
for mat in bpy.data.materials:
    ln = mat.name.lower()
    for kw in interesting_keywords:
        if kw in ln:
            print(f"  {mat.name}  <<< {kw}")
            break

# --- Scenes / collections ---
print("\n=== Scenes & Collections ===")
for s in bpy.data.scenes:
    print(f"  Scene {s.name!r}: {len(s.objects)} objects")
for c in bpy.data.collections:
    print(f"  Collection {c.name!r}: {len(c.objects)} objects, hide_viewport={c.hide_viewport if hasattr(c, 'hide_viewport') else '?'}")
