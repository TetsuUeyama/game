"""衣装 voxel の隙間を埋める (retarget/push で生じた 1-voxel 幅のホール対策)。

空セルの 26 方向 (面+辺+角) 隣接 clothing voxel が THRESHOLD 以上なら埋める。
色 / weight は隣接 clothing voxel の多数決 (最頻色) から継承 — 近傍に複数色が
混在する場合も破綻しにくい。

Usage:
  python fill_gaps.py <out_dir> <prefix> [--threshold 6] [--passes 3] [--body body] [--face-only]

  --threshold N: 26 隣接中 N 以上が clothing な場合に埋める (default 6)
                 (face-only 時は 6 隣接中 N 以上、default 2)
  --passes K: K パス繰り返す (default 3)
  --body <prefix>: 指定された body.vox 内部には埋めない (衣装は body の外のみ)
  --face-only: 6 方向のみ参照 (従来方式)
"""
import sys, os, json, struct

def parse_args():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    threshold = None; passes = 3; body_prefix = None; face_only = False
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--threshold' and i+1 < len(sys.argv): threshold = int(sys.argv[i+1]); i += 2; continue
        if a == '--passes' and i+1 < len(sys.argv): passes = int(sys.argv[i+1]); i += 2; continue
        if a == '--body' and i+1 < len(sys.argv): body_prefix = sys.argv[i+1]; i += 2; continue
        if a == '--face-only': face_only = True; i += 1; continue
        i += 1
    if threshold is None:
        threshold = 2 if face_only else 6
    return out_dir, prefix, threshold, passes, body_prefix, face_only

OUT_DIR, PREFIX, THRESHOLD, PASSES, BODY_PREFIX, FACE_ONLY = parse_args()

VOX_PATH = os.path.join(OUT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(OUT_DIR, f"{PREFIX}.weights.json")
for p in (VOX_PATH, WEIGHTS_PATH):
    if not os.path.exists(p): print(f"ERROR: {p} not found"); sys.exit(1)

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

part_voxels, gx, gy, gz, palette = parse_vox(VOX_PATH)
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']
print(f"  part: {len(part_voxels)} voxels, {gx}x{gy}x{gz}")

# body (optional collision mask)
body_set = set()
if BODY_PREFIX:
    body_path = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")
    if os.path.exists(body_path):
        body_v, _, _, _, _ = parse_vox(body_path)
        body_set = set((x, y, z) for (x, y, z, _) in body_v)
        print(f"  body (collision mask): {len(body_set)} voxels")

# --- 空間マップ (位置 → ci, weight_index) ---
pos_to_data = {}  # (x,y,z) -> (ci, weight_idx)
for idx, (x, y, z, ci) in enumerate(part_voxels):
    pos_to_data[(x, y, z)] = (ci, idx)

DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
# 3 opposite pairs for "挟まれ" 判定
PAIRS = [((1,0,0),(-1,0,0)), ((0,1,0),(0,-1,0)), ((0,0,1),(0,0,-1))]
# Ray 探索の最大距離 (voxel) — 挟まれ判定で両側 N voxel 内に clothing があれば fill
RAY_MAX = 4

print(f"  method: opposite-pair ray (max {RAY_MAX} voxels each direction)")

def has_clothing_within(x, y, z, dx, dy, dz, occ, bd, maxlen):
    """(x,y,z) から direction 方向に maxlen voxel 以内 clothing あり? body blocker check も。"""
    for k in range(1, maxlen + 1):
        p = (x + dx*k, y + dy*k, z + dz*k)
        if p in occ: return True
        if p in bd: return False  # body が先に当たる → 挟まれていない
    return False

filled_total = 0
for pass_i in range(PASSES):
    candidates_fill = {}  # (x,y,z) -> seed_pos (色/weight 継承元)
    # 既存 clothing voxel から 1 voxel 広げた近傍を候補にする
    to_check = set()
    for (x, y, z) in pos_to_data.keys():
        for (dx, dy, dz) in DIRS6:
            nb = (x+dx, y+dy, z+dz)
            if nb in pos_to_data: continue
            if nb in body_set: continue
            if nb[0] < 0 or nb[0] >= gx or nb[1] < 0 or nb[1] >= gy or nb[2] < 0 or nb[2] >= gz: continue
            to_check.add(nb)

    filled_this_pass = 0
    for nb in to_check:
        # 3 軸ペアのうち THRESHOLD 個以上が「両側 clothing」なら埋める
        pair_hits = 0
        contributing = []
        for (pa, pb) in PAIRS:
            if has_clothing_within(nb[0], nb[1], nb[2], pa[0], pa[1], pa[2], pos_to_data, body_set, RAY_MAX) and \
               has_clothing_within(nb[0], nb[1], nb[2], pb[0], pb[1], pb[2], pos_to_data, body_set, RAY_MAX):
                pair_hits += 1
                contributing.append(pa); contributing.append(pb)
        if pair_hits < THRESHOLD: continue
        # 色: 最寄り clothing voxel から継承
        seed_pos = None; best_d = 1e9
        for (dx, dy, dz) in DIRS6:
            for k in range(1, RAY_MAX + 1):
                p = (nb[0] + dx*k, nb[1] + dy*k, nb[2] + dz*k)
                if p in pos_to_data:
                    if k < best_d:
                        best_d = k; seed_pos = p
                    break
                if p in body_set: break
        if seed_pos is None: continue
        ci_i, idx_i = pos_to_data[seed_pos]
        pos_to_data[nb] = (ci_i, idx_i)
        filled_this_pass += 1
    print(f"  pass {pass_i+1}: filled {filled_this_pass} voxels (pair-threshold={THRESHOLD}/3)")
    filled_total += filled_this_pass
    if filled_this_pass == 0: break

print(f"  total filled: {filled_total} voxels (final: {len(pos_to_data)})")

# --- 再構築 ---
# voxel 順をソートして出力。weight は pos_to_data の idx 経由で継承
sorted_keys = sorted(pos_to_data.keys())
new_voxels = []
new_weights = []
for k in sorted_keys:
    ci, widx = pos_to_data[k]
    new_voxels.append((k[0], k[1], k[2], ci))
    new_weights.append(weights_list[widx])

write_vox(VOX_PATH, gx, gy, gz, new_voxels, palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}")
print(f"  -> {WEIGHTS_PATH}")
