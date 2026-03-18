"""Detailed comparison: find bones that are likely the same but named differently."""
import bpy, sys

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

rigs = {}

for blend_path in args[:2]:
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    rig = max([o for o in bpy.data.objects if o.type == 'ARMATURE'],
              key=lambda o: len(o.data.bones))
    arm = rig.data
    label = blend_path.split('\\')[-1].split('/')[-1].replace('.blend','')

    deform = {}
    for b in arm.bones:
        if b.use_deform:
            parent = b.parent.name if b.parent else 'ROOT'
            deform[b.name] = parent
    rigs[label] = deform

labels = list(rigs.keys())
a_name, b_name = labels[0], labels[1]
a_bones, b_bones = rigs[a_name], rigs[b_name]

common = set(a_bones.keys()) & set(b_bones.keys())
only_a = sorted(set(a_bones.keys()) - set(b_bones.keys()))
only_b = sorted(set(b_bones.keys()) - set(a_bones.keys()))

print(f"=== {a_name}: {len(a_bones)} deform ===")
print(f"=== {b_name}: {len(b_bones)} deform ===")
print(f"Common: {len(common)}")
print(f"Only {a_name}: {len(only_a)}")
print(f"Only {b_name}: {len(only_b)}")

# Find likely matches by similar names
import re

def normalize(name):
    """Normalize bone name for comparison."""
    n = name.lower().strip()
    # Remove common prefixes/suffixes variations
    n = n.replace('_', '.').replace(' ', '.')
    return n

def base_name(name):
    """Extract base name ignoring .l/.r/.x suffix."""
    for suffix in ['.l', '.r', '.x', '.001', '.002']:
        if name.endswith(suffix):
            return name[:-len(suffix)]
    return name

print(f"\n=== LIKELY MATCHES (same role, different name) ===")
matches = []
used_b = set()

for a in only_a:
    a_norm = normalize(a)
    a_base = normalize(base_name(a))
    best_match = None
    best_score = 0

    for b in only_b:
        if b in used_b:
            continue
        b_norm = normalize(b)
        b_base = normalize(base_name(b))

        # Check suffix compatibility (.l/.r/.x)
        a_suffix = ''
        b_suffix = ''
        for s in ['.l', '.r', '.x']:
            if a.endswith(s): a_suffix = s
            if b.endswith(s): b_suffix = s
        if a_suffix and b_suffix and a_suffix != b_suffix:
            continue

        # Exact base match with different separator
        if a_base == b_base:
            score = 100
        # One contains the other
        elif a_base in b_base or b_base in a_base:
            score = 70
        # Common substring
        else:
            # Check for naming pattern differences like breast.l vs breast_l
            a_clean = a.replace('.', '_').replace(' ', '_').lower()
            b_clean = b.replace('.', '_').replace(' ', '_').lower()
            if a_clean == b_clean:
                score = 95
            elif a_clean.rstrip('_lrx0123') == b_clean.rstrip('_lrx0123'):
                score = 80
            else:
                # Check specific known patterns
                a_parts = set(re.split(r'[._]', a.lower()))
                b_parts = set(re.split(r'[._]', b.lower()))
                overlap = len(a_parts & b_parts)
                total = max(len(a_parts), len(b_parts))
                if total > 0 and overlap / total > 0.5:
                    score = int(60 * overlap / total)
                else:
                    score = 0

        if score > best_score:
            best_score = score
            best_match = b

    if best_match and best_score >= 50:
        matches.append((a, best_match, best_score))
        used_b.add(best_match)

# Sort by score
matches.sort(key=lambda x: -x[2])

if matches:
    for a, b, score in matches:
        a_parent = a_bones[a]
        b_parent = b_bones[b]
        parent_match = 'parent-match' if normalize(a_parent) == normalize(b_parent) or a_parent in common or b_parent in common else ''
        print(f"  {a:35s} <-> {b:35s} (score={score}) {parent_match}")
    print(f"\nTotal likely matches: {len(matches)}")
else:
    print("  None found")

# Show unmatched
unmatched_a = [a for a in only_a if a not in [m[0] for m in matches]]
unmatched_b = [b for b in only_b if b not in [m[1] for m in matches]]

print(f"\n=== UNMATCHED in {a_name} ({len(unmatched_a)}) ===")
for n in unmatched_a:
    print(f"  {n:35s} parent={a_bones[n]}")

print(f"\n=== UNMATCHED in {b_name} ({len(unmatched_b)}) ===")
for n in unmatched_b:
    print(f"  {n:35s} parent={b_bones[n]}")

print("\nDONE")
