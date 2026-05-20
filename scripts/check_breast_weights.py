"""Body の各 vertex の bone weight 分布を確認、特に breast 関連の頂点。"""
import bpy

body = bpy.data.objects.get("Body") or bpy.data.objects.get("Helena_Base")
if not body:
    print("ERROR: Body not found"); exit()

vg_idx_to_name = {vg.index: vg.name for vg in body.vertex_groups}

# Find breast vgroups (any name containing 'breast')
breast_idx = {idx: name for idx, name in vg_idx_to_name.items()
              if 'breast' in name.lower()}
print(f"Breast vgroups: {breast_idx}")

# Count verts with breast weight at various thresholds
counts = {0.01: 0, 0.05: 0, 0.1: 0, 0.2: 0, 0.5: 0, 0.8: 0}
dominant_breast = 0  # verts where breast is dominant (max weight)
dominant_other = 0   # verts with breast weight > 0.2 but other dominant
non_breast = 0

for v in body.data.vertices:
    breast_weights = {}
    other_max_w = 0.0
    other_max_name = None
    breast_max_w = 0.0
    for g in v.groups:
        if g.weight <= 0:
            continue
        if g.group in breast_idx:
            breast_weights[breast_idx[g.group]] = g.weight
            if g.weight > breast_max_w:
                breast_max_w = g.weight
        else:
            if g.weight > other_max_w:
                other_max_w = g.weight
                other_max_name = vg_idx_to_name.get(g.group, '?')
    if breast_max_w == 0:
        non_breast += 1
        continue
    for thr in counts:
        if breast_max_w >= thr:
            counts[thr] += 1
    if breast_max_w > other_max_w:
        dominant_breast += 1
    elif breast_max_w >= 0.2:
        dominant_other += 1

print(f"\nVert counts by breast max weight threshold:")
for thr, c in sorted(counts.items()):
    print(f"  weight >= {thr:.2f}: {c}")
print(f"\nBreast dominant: {dominant_breast}")
print(f"Breast secondary (other dominant): {dominant_other}")
print(f"No breast weight: {non_breast}")
print(f"Total: {len(body.data.vertices)}")
