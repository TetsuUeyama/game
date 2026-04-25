"""skeleton.json の ARP ボーン名をパターンマッチして bone_map.json
(bone_name → region_name) を自動生成する。

voxelize_clothing_v3.py の --source_bone_mapping 引数で使う。

Usage:
  python generate_bone_map.py <skeleton.json> <output_bone_map.json>
"""
import sys, json, re

if len(sys.argv) < 3:
    print("Usage: python generate_bone_map.py <skeleton.json> <output>")
    sys.exit(1)

SKEL_JSON = sys.argv[1]
OUT_JSON = sys.argv[2]

with open(SKEL_JSON, encoding='utf-8') as f:
    skel = json.load(f)

# 側判定: .l / .r / _l / _r / .x (center)
def side(name):
    n = name.lower()
    # 明確な末尾判定を優先
    if n.endswith('.l') or n.endswith('_l'): return 'l'
    if n.endswith('.r') or n.endswith('_r'): return 'r'
    # 中間に .l. / .r. / _l_ / _r_
    if re.search(r'[._]l[._]', n): return 'l'
    if re.search(r'[._]r[._]', n): return 'r'
    return 'x'

# region 判定: 特徴語 → region
# 先頭マッチでヒットした順序で決定 (優先順序重要: 顔 > 首 > 胴体 > 腕 > 脚)
def classify(name):
    n = name.lower()
    # 髪 (hair_braid / hair_ponytail など) → 'head' リージョン扱い (揺れボーンだが anchor 用)
    if 'hair' in n: return 'head'
    # 衣装揺れボーン群は body region に属さないので 'unknown' (後段で anchor fallback)
    if any(kw in n for kw in ['armor_cape', 'armor_clavice', 'beltcape',
                                'armor_belt_outer_back', 'armor_belt_plates',
                                'dress_front', 'dress_back', 'belt_tail',
                                'necklace', 'armor_shoulder_0', 'armor_hip_front']):
        return 'unknown'
    # 顔・頭 (forearm に 'ear' が含まれるので forearm を先に除外)
    if 'forearm' not in n and any(kw in n for kw in [
        'head.x', 'jawbone', 'skull', 'chin', 'cheek', 'nose', 'ear',
        'eye', 'eyebrow', 'eyelid', 'lips', 'teeth', 'tongue',
        'forehead', 'temple', 'jaw', 'lid.t', 'lid.b', 'lip.t', 'lip.b',
        'brow.t', 'brow.b',
    ]):
        return 'head'
    # Rigify の DEF-head は 'head' を含むが forearm 除外は上の not で済む
    if n == 'def-head' or n.endswith('.head'):
        return 'head'
    # Rigify head (spine.006 は頭部)
    if 'spine.006' in n: return 'head'
    # 首 (Rigify: spine.004 / spine.005 は頚部扱い、 ARP: neck)
    if 'neck' in n or 'spine.004' in n or 'spine.005' in n: return 'neck'
    # 肩 (shoulder はここで処理)
    if 'shoulder' in n:
        s = side(name)
        return f'shoulder_{s}' if s in ('l', 'r') else 'upper_torso'
    # 胸 / 乳 / 体幹上 (ARP: spine_03/04, Rigify: spine.002 / .003)
    if 'breast' in n or 'nipple' in n or 'spine_03' in n or 'spine_04' in n \
            or 'spine.002' in n or 'spine.003' in n:
        return 'upper_torso'
    # 体幹下 (ARP: spine_00/01/02, Rigify: spine / spine.001)
    if 'spine_01' in n or 'spine_02' in n or 'spine_00' in n \
            or n == 'def-spine' or 'spine.001' in n or n.endswith('spine'):
        return 'lower_torso'
    # 腰・尻・股 (hair_ponytail の 'tail' は既に早期で hair 判定済みなので OK)
    if any(kw in n for kw in ['root_bend', 'butt', 'genital', 'vagina', 'pelvis']):
        return 'hips'
    # 腕
    s = side(name)
    if 'forearm' in n:
        return f'forearm_{s}' if s in ('l','r') else 'forearm_l'
    if 'upper_arm' in n or 'arm_twist' in n or 'arm_stretch' in n or 'elbow' in n or 'arm_bendy' in n:
        return f'upper_arm_{s}' if s in ('l','r') else 'upper_arm_l'
    # 手指 (Rigify: f_index, f_middle, f_ring, f_pinky, thumb.01 / .02 / .03)
    if any(kw in n for kw in ['hand', 'finger', 'f_index', 'f_middle', 'f_ring', 'f_pinky',
                                'index', 'middle', 'ring', 'pinky', 'thumb', 'palm']) \
            and not n.startswith('c_toes') and not n.startswith('toes_') and 'toes' not in n:
        return f'hand_{s}' if s in ('l','r') else 'hand_l'
    # 脚
    if 'thigh' in n:
        return f'thigh_{s}' if s in ('l','r') else 'thigh_l'
    if 'shin' in n or 'leg_twist' in n or 'leg_stretch' in n or 'knee' in n or 'leg_bendy' in n:
        return f'shin_{s}' if s in ('l','r') else 'shin_l'
    # 足・足指 (Rigify: DEF-foot.L / DEF-toe.L)
    if 'foot' in n or 'toes' in n or 'toe.' in n or 'toe_' in n or n.startswith('toes_') or n.startswith('c_toes'):
        return f'foot_{s}' if s in ('l','r') else 'foot_l'
    return 'unknown'

bone_map = {}
stats = {}
for b in skel['bones']:
    if not b.get('use_deform'): continue
    name = b['name']
    r = classify(name)
    bone_map[name] = r
    stats[r] = stats.get(r, 0) + 1

# 統計出力
print(f"skeleton: {skel.get('armature', '?')} ({len(skel['bones'])} deform bones)")
print(f"\nclassified {sum(v for k,v in stats.items() if k != 'unknown')} bones → regions:")
for k in sorted(stats.keys()):
    marker = 'WARN ' if k == 'unknown' else '     '
    print(f"  {marker}{k:16s}: {stats[k]}")

# 未分類ボーン一覧 (確認用)
unknowns = [b['name'] for b in skel['bones'] if b.get('use_deform') and bone_map[b['name']] == 'unknown']
if unknowns:
    print(f"\nUnclassified bones (go to 'unknown' - usually swing/accessory bones):")
    for u in unknowns[:50]:
        print(f"    {u}")
    if len(unknowns) > 50:
        print(f"    ... and {len(unknowns)-50} more")

# 出力
with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump({'bone_map': bone_map}, f, ensure_ascii=False, indent=1)
print(f"\n-> {OUT_JSON}")
