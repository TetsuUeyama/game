"""Voxel パーツを左右ミラーする (standalone, no Blender)。

片側のみ生成された装飾 (thigh strap, armband, bracelet 等) を左右対称に
展開する。X 座標はグリッド中央で反転、ボーン名は .l↔.r / _l↔_r を相互置換。

Usage:
  # Mode A: 既存ファイルに合算 (両側を1パーツ扱い)
  python mirror_part_lr.py <out_dir> <prefix>

  # Mode B: ミラー結果を別ファイルに出力 (左右独立パーツ扱い、推奨)
  python mirror_part_lr.py <out_dir> <source_prefix> --output <mirror_prefix>
    例: <source_prefix>=thigh_strap_l, <mirror_prefix>=thigh_strap_r
"""
import sys, os, json, struct

if len(sys.argv) < 3:
    print("Usage: python mirror_part_lr.py <out_dir> <prefix> [--output <mirror_prefix>]")
    sys.exit(1)

OUT_DIR = sys.argv[1]
PREFIX = sys.argv[2]
OUTPUT_PREFIX = None  # None なら append モード (同じファイルに合算)
for i, a in enumerate(sys.argv):
    if a == '--output' and i + 1 < len(sys.argv):
        OUTPUT_PREFIX = sys.argv[i + 1]; break

VOX_PATH = os.path.join(OUT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(OUT_DIR, f"{PREFIX}.weights.json")

if not os.path.exists(VOX_PATH):
    print(f"ERROR: {VOX_PATH} not found"); sys.exit(1)
if not os.path.exists(WEIGHTS_PATH):
    print(f"ERROR: {WEIGHTS_PATH} not found"); sys.exit(1)

# ---- .vox 読み込み ----
def parse_vox(path):
    with open(path, 'rb') as f: data = f.read()
    sx = sy = sz = 0; voxels = []; palette = []
    def parse_chunks(start, end):
        nonlocal sx, sy, sz
        off = start
        while off < end:
            if off + 12 > end: break
            cid = data[off:off+4].decode('ascii', errors='replace')
            csz = struct.unpack_from('<I', data, off+4)[0]
            chz = struct.unpack_from('<I', data, off+8)[0]
            cs = off + 12
            if cid == 'MAIN': parse_chunks(cs+csz, cs+csz+chz)
            elif cid == 'SIZE': sx, sy, sz = struct.unpack_from('<III', data, cs)
            elif cid == 'XYZI':
                count = struct.unpack_from('<I', data, cs)[0]
                for i in range(count):
                    x, y, z, ci = struct.unpack_from('<BBBB', data, cs+4+i*4)
                    voxels.append((x, y, z, ci))
            elif cid == 'RGBA':
                for i in range(256):
                    r, g, b, a = struct.unpack_from('<BBBB', data, cs+i*4)
                    palette.append((r, g, b, a))
            off += 12 + csz + chz
    parse_chunks(8, len(data))
    return voxels, sx, sy, sz, palette

voxels, gx, gy, gz, palette = parse_vox(VOX_PATH)
print(f"  Loaded {VOX_PATH}: {len(voxels)} voxels, {gx}x{gy}x{gz}")

# ---- weights 読み込み ----
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
bones = list(weights_obj['bones'])
weights = weights_obj['weights']
assert len(weights) == len(voxels), f"weights ({len(weights)}) != voxels ({len(voxels)})"

# ---- ボーン名の .l / .r 入れ替え ----
def swap_side(name):
    # ARP 命名: c_thigh_twist.l, butt_l, shoulder.r, vagina_01.r 等
    if name.endswith('.l'): return name[:-2] + '.r'
    if name.endswith('.r'): return name[:-2] + '.l'
    if name.endswith('_l'): return name[:-2] + '_r'
    if name.endswith('_r'): return name[:-2] + '_l'
    # 中間にある場合 (例: hair_braid_01.l_end)
    if '.l.' in name: return name.replace('.l.', '.r.', 1)
    if '.r.' in name: return name.replace('.r.', '.l.', 1)
    if '_l_' in name: return name.replace('_l_', '_r_', 1)
    if '_r_' in name: return name.replace('_r_', '_l_', 1)
    return name  # center bone (例: .x)

# mirror 側の bones 名
mirrored_bone_names = [swap_side(n) for n in bones]
# 新しい統合 bones 配列を構築 (元 + 追加の mirror 名)
combined_bones = list(bones)
bone_to_idx = {n: i for i, n in enumerate(combined_bones)}
for mn in mirrored_bone_names:
    if mn not in bone_to_idx:
        bone_to_idx[mn] = len(combined_bones)
        combined_bones.append(mn)

# mirror weight の local bone index 変換
mirror_weights = []
for wl in weights:
    mw = []
    for bi, w in wl:
        orig_name = bones[bi]
        mirrored_name = swap_side(orig_name)
        mw.append([bone_to_idx[mirrored_name], w])
    mirror_weights.append(mw)

# 元 weight も新 bone index に合わせる（元ボーンは同じ位置なので変わらない想定）
# → 既に同じ順序で combined_bones の先頭に残っているので OK

# ---- voxel を X ミラー ----
# グリッド中心で反転: x' = gx - 1 - x
mirror_voxels = []
swap_side_cache = set()
for (x, y, z, ci) in voxels:
    mirror_voxels.append((gx - 1 - x, y, z, ci))

# 重複排除 (中心ボーン付近で元とミラーが同位置の場合)
existing = set((x, y, z) for (x, y, z, _) in voxels)
unique_mirror = []
unique_mirror_weights = []
for (v, mw) in zip(mirror_voxels, mirror_weights):
    key = (v[0], v[1], v[2])
    if key in existing: continue
    unique_mirror.append(v)
    unique_mirror_weights.append(mw)
print(f"  Mirror voxels: {len(unique_mirror)} (skipped {len(mirror_voxels)-len(unique_mirror)} overlapping)")

# ---- Mode B: ミラーのみを別ファイルに出力 ----
if OUTPUT_PREFIX:
    # ミラー側のみを出力。元ファイルは触らない。
    out_vox = os.path.join(OUT_DIR, f"{OUTPUT_PREFIX}.vox")
    out_weights = os.path.join(OUT_DIR, f"{OUTPUT_PREFIX}.weights.json")
    # ミラーの weights は、新 bones 配列 (combined_bones) のうち実際使われるものだけに絞る
    used_indices = set()
    for wl in mirror_weights:
        for bi, _ in wl: used_indices.add(bi)
    used_sorted = sorted(used_indices)
    remap = {old: new for new, old in enumerate(used_sorted)}
    mirror_bones_local = [combined_bones[i] for i in used_sorted]
    mirror_weights_local = [[[remap[bi], w] for bi, w in wl] for wl in mirror_weights]
    # mirror_voxels には重複排除前のが入ってる → unique_mirror を使う
    # unique_mirror は mirror_voxels と mirror_weights を zip して重複除去した結果
    # unique_mirror_weights は既に local index じゃないので remap し直す
    unique_mirror_weights_local = [[[remap[bi], w] for bi, w in wl] for wl in unique_mirror_weights]

    def write_vox_file(path, sx, sy, sz, voxels, pal):
        def chunk(tag, data):
            return tag.encode() + struct.pack('<II', len(data), 0) + data
        sd = struct.pack('<III', sx, sy, sz)
        xd = struct.pack('<I', len(voxels))
        for v in voxels:
            xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
        rd = b''
        for i in range(256):
            if i < len(pal):
                rd += struct.pack('<BBBB', pal[i][0], pal[i][1], pal[i][2], pal[i][3])
            else:
                rd += struct.pack('<BBBB', 0, 0, 0, 255)
        children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
        main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
        with open(path, 'wb') as f:
            f.write(b'VOX ' + struct.pack('<I', 150) + main)

    write_vox_file(out_vox, gx, gy, gz, unique_mirror, palette)
    print(f"  -> {out_vox}: {len(unique_mirror)} voxels (mirrored only)")

    mirror_weights_obj = {
        'mesh': weights_obj.get('mesh', '') + ' (mirrored)',
        'bones': mirror_bones_local,
        'voxel_count': len(unique_mirror),
        'weights': unique_mirror_weights_local,
    }
    with open(out_weights, 'w', encoding='utf-8') as f:
        json.dump(mirror_weights_obj, f, ensure_ascii=False, indent=0)
    print(f"  -> {out_weights}: {len(mirror_bones_local)} unique bones")
    sys.exit(0)

# ---- Mode A: 合算 (append) ----
combined_voxels = list(voxels) + unique_mirror
combined_weights = list(weights) + unique_mirror_weights

# ---- .vox 書き出し ----
def write_vox(path, sx, sy, sz, voxels, pal):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels:
        xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
    rd = b''
    for i in range(256):
        if i < len(pal):
            rd += struct.pack('<BBBB', pal[i][0], pal[i][1], pal[i][2], pal[i][3])
        else:
            rd += struct.pack('<BBBB', 0, 0, 0, 255)
    children = chunk('SIZE', sd) + chunk('XYZI', xd) + chunk('RGBA', rd)
    main = b'MAIN' + struct.pack('<II', 0, len(children)) + children
    with open(path, 'wb') as f:
        f.write(b'VOX ' + struct.pack('<I', 150) + main)

write_vox(VOX_PATH, gx, gy, gz, combined_voxels, palette)
print(f"  -> {VOX_PATH}: {len(combined_voxels)} voxels (was {len(voxels)})")

# ---- weights 書き出し ----
weights_obj['bones'] = combined_bones
weights_obj['weights'] = combined_weights
weights_obj['voxel_count'] = len(combined_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {WEIGHTS_PATH}: {len(combined_bones)} unique bones")
