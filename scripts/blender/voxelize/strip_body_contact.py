"""衣装 voxel を QM body 表面位置に合わせる: body 表面と同位置の voxel のみを残す。

想定フロー:
  1. scale_body_to_match.py (3x3x3 fallback 付き) で分厚い衣装を作成 → 穴なし
  2. 本スクリプトで body 表面位置の voxel だけ残す (body の体積を大きくしない)

各 voxel 判定:
  - body 内部 (非表面): 削除 (見えない)
  - body 表面 (body_set に含まれ、少なくとも 1 方向が空): KEEP (clothing が body を置換)
  - body 外部 (body_set に含まれない): 削除 (体積増加の原因)

preview 側で body のその voxel は clothing 側に置き換えて表示される (既存機構)。

Usage:
  python strip_body_contact.py <out_dir> <prefix> [--body body] [--mode MODE]

  --mode replace (default): body 表面位置のみ残す (薄い密着、body 体積変わらず)
  --mode shell: body 外側 1 層のみ残す (body+1 voxel 大)
  --mode armor: body 深層のみ除去、表面+外側全保持 (厚み保持、armor 用)
"""
import sys, os, json, struct

def parse_args():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    body_prefix = 'body'; mode = 'replace'
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--body' and i+1 < len(sys.argv): body_prefix = sys.argv[i+1]; i += 2; continue
        if a == '--mode' and i+1 < len(sys.argv): mode = sys.argv[i+1]; i += 2; continue
        if a == '--strict': mode = 'shell_strict'; i += 1; continue  # legacy
        i += 1
    return out_dir, prefix, body_prefix, mode

OUT_DIR, PREFIX, BODY_PREFIX, MODE = parse_args()

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

VOX_PATH = os.path.join(OUT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(OUT_DIR, f"{PREFIX}.weights.json")
BODY_VOX_PATH = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")

part_voxels, gx, gy, gz, palette = parse_vox(VOX_PATH)
body_voxels, _, _, _, _ = parse_vox(BODY_VOX_PATH)
with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']

body_set = set((x, y, z) for (x, y, z, _) in body_voxels)
print(f"  part: {len(part_voxels)} voxels, body: {len(body_set)} voxels")

DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]

# body surface set (body_set のうち 1 つでも empty 隣接がある voxel)
body_surface_set = set()
for (x, y, z) in body_set:
    for (dx, dy, dz) in DIRS6:
        if (x+dx, y+dy, z+dz) not in body_set:
            body_surface_set.add((x, y, z)); break
print(f"  body surface: {len(body_surface_set)} voxels")

kept_voxels = []; kept_weights = []
removed_interior = 0; removed_outside = 0; removed_extra = 0
for (v, wl) in zip(part_voxels, weights_list):
    x, y, z, ci = v
    pos = (x, y, z)
    if MODE == 'replace':
        # body 表面位置のみ残す
        if pos in body_surface_set:
            kept_voxels.append(v); kept_weights.append(wl)
        elif pos in body_set:
            removed_interior += 1
        else:
            removed_outside += 1
    elif MODE == 'shell':
        # 旧挙動: body 外 1 層 (body 内部と body 表面は削除、外側のみ残す)
        if pos in body_set:
            removed_interior += 1; continue
        adjacent = any((pos[0]+dx, pos[1]+dy, pos[2]+dz) in body_set for (dx,dy,dz) in DIRS6)
        if adjacent:
            removed_outside += 1; continue
        kept_voxels.append(v); kept_weights.append(wl)
    elif MODE == 'armor':
        # armor 用: body 深層のみ除去、body 表面 + 外側すべて保持 (厚み保存)
        if pos in body_set and pos not in body_surface_set:
            removed_interior += 1; continue  # 深層だけ invisible なので除去
        kept_voxels.append(v); kept_weights.append(wl)
    else:  # shell_strict
        if pos in body_set:
            removed_interior += 1; continue
        adjacent = any((pos[0]+dx, pos[1]+dy, pos[2]+dz) in body_set for (dx,dy,dz) in DIRS6)
        if adjacent: removed_outside += 1; continue
        adj2 = False
        for (dx, dy, dz) in DIRS6:
            for (dx2, dy2, dz2) in DIRS6:
                if (pos[0]+dx+dx2, pos[1]+dy+dy2, pos[2]+dz+dz2) in body_set:
                    adj2 = True; break
            if adj2: break
        if adj2: removed_extra += 1; continue
        kept_voxels.append(v); kept_weights.append(wl)

print(f"  mode: {MODE}")
print(f"  removed (interior of body): {removed_interior}")
print(f"  removed (outside/adjacent): {removed_outside}")
if MODE == 'shell_strict': print(f"  removed (2-layer strict): {removed_extra}")
print(f"  kept: {len(kept_voxels)}")

write_vox(VOX_PATH, gx, gy, gz, kept_voxels, palette)
weights_obj['weights'] = kept_weights
weights_obj['voxel_count'] = len(kept_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}")
