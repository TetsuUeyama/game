"""2 つの voxel ファイルを union してマージする (layered armor 用)。

Usage:
  python union_vox.py <out_dir> <prefix_a> <prefix_b> <out_prefix>

  prefix_a が優先 (同位置なら a の色/weight を採用)
"""
import sys, os, json, struct

if len(sys.argv) < 5:
    print(__doc__); sys.exit(1)
OUT_DIR = sys.argv[1]; A = sys.argv[2]; B = sys.argv[3]; OUT = sys.argv[4]

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

def write_vox(path, sx, sy, sz, voxels, pal):
    def chunk(tag, data):
        return tag.encode() + struct.pack('<II', len(data), 0) + data
    sd = struct.pack('<III', sx, sy, sz)
    xd = struct.pack('<I', len(voxels))
    for v in voxels: xd += struct.pack('<BBBB', v[0], v[1], v[2], v[3])
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

a_vox, gx, gy, gz, a_pal = parse_vox(os.path.join(OUT_DIR, f"{A}.vox"))
b_vox, _, _, _, b_pal = parse_vox(os.path.join(OUT_DIR, f"{B}.vox"))
with open(os.path.join(OUT_DIR, f"{A}.weights.json"), encoding='utf-8') as f: a_w = json.load(f)
with open(os.path.join(OUT_DIR, f"{B}.weights.json"), encoding='utf-8') as f: b_w = json.load(f)

# A 優先で union (同位置は A)
# パレットは別なので、A パレットにマッピングし直すのが正確だが、簡易には A のパレットを使い色が近い index を保持
# 今回は b_pal を使うと a の色が崩れるので、a_pal を主、b 側で色が無い場合は a にマップ
# 簡易: 同位置 A 優先、A に無い b は b の ci を a_pal の最寄り色にマッピング
# ここでは簡便に: 出力パレットを a_pal にして、b のみに存在する voxel は b_pal の色→a_pal 最寄り

def nearest_palette_idx(rgb, pal):
    best_i = 1; best_d = 1e18
    for i, p in enumerate(pal):
        if i == 0: continue
        dr = rgb[0]-p[0]; dg = rgb[1]-p[1]; db = rgb[2]-p[2]
        d = dr*dr + dg*dg + db*db
        if d < best_d: best_d = d; best_i = i
    return best_i

a_pos = {(v[0], v[1], v[2]): (v[3], idx) for idx, v in enumerate(a_vox)}
b_pos = {(v[0], v[1], v[2]): (v[3], idx) for idx, v in enumerate(b_vox)}

merged = {}
a_bones = a_w.get('bones', []); b_bones = b_w.get('bones', [])
a_weights = a_w.get('weights', []); b_weights = b_w.get('weights', [])

all_bones = []; bi_map = {}
def map_bone_list(bn_list, wl):
    out = []
    for (bi, w) in wl:
        bn = bn_list[bi] if bi < len(bn_list) else None
        if bn is None: continue
        if bn not in bi_map:
            bi_map[bn] = len(all_bones); all_bones.append(bn)
        out.append([bi_map[bn], w])
    return out

# A を先に入れる
for (pos, (ci, idx)) in a_pos.items():
    wl = map_bone_list(a_bones, a_weights[idx]) if idx < len(a_weights) else []
    merged[pos] = (ci, wl, 'a')

# B の voxel: A に無ければ追加 (色を a_pal の最寄りに変換)
for (pos, (ci, idx)) in b_pos.items():
    if pos in merged: continue
    # b の色を a_pal の最寄りに変換
    if ci <= len(b_pal):
        b_rgb = b_pal[ci-1] if ci > 0 else (128,128,128,255)
        a_ci = nearest_palette_idx(b_rgb, a_pal)
    else:
        a_ci = 1
    wl = map_bone_list(b_bones, b_weights[idx]) if idx < len(b_weights) else []
    merged[pos] = (a_ci, wl, 'b')

a_count = sum(1 for v in merged.values() if v[2]=='a')
b_count = sum(1 for v in merged.values() if v[2]=='b')
print(f"  A ({A}): {len(a_pos)} voxels")
print(f"  B ({B}): {len(b_pos)} voxels")
print(f"  merged: {len(merged)} ({a_count} from A, {b_count} from B only)")

sorted_keys = sorted(merged.keys())
new_voxels = [(k[0], k[1], k[2], merged[k][0]) for k in sorted_keys]
new_weights = [merged[k][1] for k in sorted_keys]

out_vox_path = os.path.join(OUT_DIR, f"{OUT}.vox")
out_w_path = os.path.join(OUT_DIR, f"{OUT}.weights.json")
write_vox(out_vox_path, gx, gy, gz, new_voxels, a_pal)
with open(out_w_path, 'w', encoding='utf-8') as f:
    json.dump({
        'mesh': f'union({A}, {B})',
        'bones': all_bones,
        'voxel_count': len(new_voxels),
        'weights': new_weights,
    }, f, ensure_ascii=False, indent=0)
print(f"  -> {out_vox_path}")
