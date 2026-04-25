"""薄いパーツの voxel を body 表面に "同居" させる (push_outward と異なり外に出さない)。

body 内部に食い込んでいる voxel を、最寄りの body 表面 voxel 位置に移動する。
表面 voxel = body voxel のうち少なくとも 1 つの 6方向隣接が空いているもの。

push_outward との違い:
  - push_outward: body の外側 (1 voxel 分外) に押す → 厚み・突起感が出る
  - snap_to_surface: body 表面と同じ位置に置く → 薄いパーツを body にペタッと貼る

preview 側で clothing voxel 位置の body voxel を非表示にすれば (別途対応)、
厚み 0 で body 表面の肌がクロージングに置き換わる理想的な表現になる。

Usage:
  python snap_to_surface.py <out_dir> <prefix> [--body body] [--max-step 20]

処理後:
  - <prefix>.vox / <prefix>.weights.json 上書き (voxel が表面に snap)
"""
import sys, os, json, struct, math

def parse_args():
    if len(sys.argv) < 3:
        print("Usage: python snap_to_surface.py <out_dir> <prefix> [--body body] [--max-step 20]")
        sys.exit(1)
    out_dir = sys.argv[1]; prefix = sys.argv[2]
    body_prefix = 'body'; max_step = 20
    i = 3
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--body' and i+1 < len(sys.argv): body_prefix = sys.argv[i+1]; i += 2; continue
        if a == '--max-step' and i+1 < len(sys.argv): max_step = int(sys.argv[i+1]); i += 2; continue
        i += 1
    return out_dir, prefix, body_prefix, max_step

OUT_DIR, PREFIX, BODY_PREFIX, MAX_STEP = parse_args()

VOX_PATH = os.path.join(OUT_DIR, f"{PREFIX}.vox")
WEIGHTS_PATH = os.path.join(OUT_DIR, f"{PREFIX}.weights.json")
BODY_VOX_PATH = os.path.join(OUT_DIR, f"{BODY_PREFIX}.vox")

for p in (VOX_PATH, WEIGHTS_PATH, BODY_VOX_PATH):
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

part_voxels, gx, gy, gz, part_palette = parse_vox(VOX_PATH)
body_voxels, _, _, _, _ = parse_vox(BODY_VOX_PATH)
print(f"  part: {len(part_voxels)} voxels, {gx}x{gy}x{gz}")

with open(WEIGHTS_PATH, encoding='utf-8') as f:
    weights_obj = json.load(f)
weights_list = weights_obj['weights']
assert len(weights_list) == len(part_voxels)

# body set + body surface set
body_set = set((x, y, z) for (x, y, z, _) in body_voxels)
DIRS6 = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
body_surface_set = set()
for (x, y, z) in body_set:
    for (dx, dy, dz) in DIRS6:
        if (x+dx, y+dy, z+dz) not in body_set:
            body_surface_set.add((x, y, z)); break
print(f"  body: {len(body_set)} voxels, surface: {len(body_surface_set)}")

cx = sum(x for (x, _, _) in body_set) / len(body_set)
cy = sum(y for (_, y, _) in body_set) / len(body_set)

# snap: 内部 voxel を最寄りの body surface voxel に移動
moved = 0; not_snapped = 0; kept_outside = 0
new_voxels = []; new_weights = []
occupied_new = set()

for (v, wl) in zip(part_voxels, weights_list):
    x, y, z, ci = v
    if (x, y, z) in body_surface_set:
        # 既に body 表面上にある (理想的) → そのまま
        if (x, y, z) not in occupied_new:
            occupied_new.add((x, y, z))
            new_voxels.append(v); new_weights.append(wl)
        continue
    if (x, y, z) not in body_set:
        # body 外部 → そのまま (thin なら body 表面に snap したい場合もあるが、
        # ここでは "内部のみ修正" で OK: 外部は後から単に body 隣接で問題ない)
        if (x, y, z) not in occupied_new:
            occupied_new.add((x, y, z))
            new_voxels.append(v); new_weights.append(wl)
        kept_outside += 1
        continue
    # body 内部 (非表面) → 最寄りの surface voxel を XY 放射方向で探索
    dx = x - cx; dy = y - cy
    length = math.sqrt(dx*dx + dy*dy)
    if length < 0.5: ux, uy = 1.0, 0.0
    else: ux, uy = dx/length, dy/length
    snapped = False
    for step in range(1, MAX_STEP + 1):
        nx = x + int(round(ux * step)); ny = y + int(round(uy * step))
        if nx < 0 or nx >= gx or ny < 0 or ny >= gy: break
        target = (nx, ny, z)
        if target in body_surface_set and target not in occupied_new:
            new_voxels.append((nx, ny, z, ci)); new_weights.append(wl)
            occupied_new.add(target); moved += 1; snapped = True; break
        if target in body_surface_set:  # 既占有だったら次
            continue
    if not snapped:
        # 放射方向で snap できなかった → 3D 最寄り body 表面を探す fallback
        best = None; best_d2 = 1e18
        # 近傍 ±R で探索 (R=15 voxel 程度)
        R = 15
        for sx_ in range(max(0, x - R), min(gx, x + R + 1)):
            for sy_ in range(max(0, y - R), min(gy, y + R + 1)):
                for sz_ in range(max(0, z - R), min(gz, z + R + 1)):
                    sp = (sx_, sy_, sz_)
                    if sp not in body_surface_set: continue
                    if sp in occupied_new: continue
                    dx_ = sx_ - x; dy_ = sy_ - y; dz_ = sz_ - z
                    d2 = dx_*dx_ + dy_*dy_ + dz_*dz_
                    if d2 < best_d2:
                        best_d2 = d2; best = sp
        if best is not None:
            new_voxels.append((best[0], best[1], best[2], ci))
            new_weights.append(wl)
            occupied_new.add(best)
            moved += 1
        else:
            # 完全に脱出不可 (近傍に空き表面なし) → 元位置残す
            if (x, y, z) not in occupied_new:
                occupied_new.add((x, y, z))
                new_voxels.append(v); new_weights.append(wl)
            not_snapped += 1

print(f"  moved to surface: {moved}")
print(f"  already outside body: {kept_outside}")
print(f"  not snapped (kept in place): {not_snapped}")
print(f"  total output: {len(new_voxels)} voxels")

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

write_vox(VOX_PATH, gx, gy, gz, new_voxels, part_palette)
weights_obj['weights'] = new_weights
weights_obj['voxel_count'] = len(new_voxels)
with open(WEIGHTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(weights_obj, f, ensure_ascii=False, indent=0)
print(f"  -> {VOX_PATH}")
print(f"  -> {WEIGHTS_PATH}")
