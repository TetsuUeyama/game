"""ANNA blend を「Body のみ」状態にクリーンアップして別ファイルに保存する。

残すもの:
  - armature: Anna_rig (QM と同じ ARP 命名)
  - mesh:     Anna Body
  - cs_* :    Anna_rig の bone custom shape (描画用、削除しても可だが副作用回避)

削除するもの:
  - 他 armature: Rig (Tekken 元 rig)、Hair*、Bazooka/Pbullet/Ebullet/Gbullet rig
  - 他 mesh:    全衣装、髪、装飾、Eyes/Eyebrows/Eyelashes/Teeth/Tongue 等
  - GZM_*:      face control gizmo (curve 等)、Anna_rig 内で参照されているが描画用のみ

Usage:
  blender --background <input.blend> \\
    --python scripts/blender/fitting/cleanup_anna_body_only.py -- <out.blend> \\
    [--texture-dir <abs path to PNG folder>]

ANNA の場合: 元 blend のテクスチャ参照は `//textures\...` だが実体は別フォルダ
(`E:/ANNA/textures_6UxANFw/textures/`)。--texture-dir 指定で全 image の
filepath を再マップし、pack_all で blend 内へ埋め込む。これで以後の
transplant + shrinkwrap + voxelize が正しく色を読める。
"""
import bpy
import sys
import os

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

# Optional flags
TEXTURE_DIR = None
EXTRA_KEEP_MESHES = []
EXTRA_KEEP_ARMATURES = []
PRIMARY_ARMATURE = "Anna_rig"   # overridable via --armature-name
PRIMARY_MESH = "Anna Body"      # overridable via --primary-mesh
filtered = []
i = 0
while i < len(args):
    if args[i] == "--texture-dir" and i + 1 < len(args):
        TEXTURE_DIR = os.path.abspath(args[i + 1]); i += 2; continue
    if args[i] == "--keep-mesh" and i + 1 < len(args):
        EXTRA_KEEP_MESHES.append(args[i + 1]); i += 2; continue
    if args[i] == "--keep-armature" and i + 1 < len(args):
        EXTRA_KEEP_ARMATURES.append(args[i + 1]); i += 2; continue
    if args[i] == "--armature-name" and i + 1 < len(args):
        PRIMARY_ARMATURE = args[i + 1]; i += 2; continue
    if args[i] == "--primary-mesh" and i + 1 < len(args):
        PRIMARY_MESH = args[i + 1]; i += 2; continue
    filtered.append(args[i]); i += 1
args = filtered

if len(args) < 1:
    print(__doc__)
    sys.exit(1)
OUT_BLEND = os.path.abspath(args[0])
print(f"\n=== cleanup_anna_body_only ===")
print(f"  out: {OUT_BLEND}")
print(f"  texture_dir: {TEXTURE_DIR}")
print(f"  primary armature: {PRIMARY_ARMATURE}")
print(f"  primary mesh:    {PRIMARY_MESH}")
print(f"  extra keep meshes: {EXTRA_KEEP_MESHES}")
print(f"  extra keep armatures: {EXTRA_KEEP_ARMATURES}")

KEEP_ARMATURE = PRIMARY_ARMATURE
KEEP_MESH = PRIMARY_MESH
KEEP_CS_PREFIX = ("cs_",)  # bone custom shapes used by ARP rigs
KEEP_MESH_SET = set([KEEP_MESH] + EXTRA_KEEP_MESHES)
KEEP_ARMATURE_SET = set([KEEP_ARMATURE] + EXTRA_KEEP_ARMATURES)

n_before = len(bpy.data.objects)
print(f"  objects before: {n_before}")

# ---- collect targets ----
to_delete = []
kept = {"armatures": [], "meshes": [], "cs": 0, "other_kept": 0}

for o in bpy.data.objects:
    if o.type == "ARMATURE":
        if o.name in KEEP_ARMATURE_SET:
            kept["armatures"].append(o.name)
        else:
            to_delete.append(o)
    elif o.type == "MESH":
        if o.name in KEEP_MESH_SET:
            kept["meshes"].append(o.name)
        elif o.name.startswith(KEEP_CS_PREFIX):
            kept["cs"] += 1
        else:
            to_delete.append(o)
    elif o.type in ("CURVE", "EMPTY", "LATTICE"):
        # GZM_*/face control gizmos are typically curves/empties.
        # Keep cs_-prefixed ones (bone custom shapes), drop the rest.
        if o.name.startswith(KEEP_CS_PREFIX):
            kept["cs"] += 1
        else:
            to_delete.append(o)
    else:
        to_delete.append(o)

print(f"  to delete: {len(to_delete)}")
print(f"  kept armatures: {kept['armatures']}")
print(f"  kept meshes:    {kept['meshes']}")
print(f"  kept cs_*:      {kept['cs']}")

# ---- delete ----
for o in list(to_delete):
    try:
        bpy.data.objects.remove(o, do_unlink=True)
    except RuntimeError as e:
        print(f"  WARN: failed to remove {o.name}: {e}")

# ---- purge orphan datablocks ----
bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True,
                                do_recursive=True)

n_after = len(bpy.data.objects)
print(f"  objects after:  {n_after} (removed {n_before - n_after})")

# ---- verify Anna_rig and Anna Body still linked ----
arm = bpy.data.objects.get(KEEP_ARMATURE)
mesh = bpy.data.objects.get(KEEP_MESH)
if arm is None or mesh is None:
    print(f"  ERROR: KEEP target missing arm={arm} mesh={mesh}")
    sys.exit(1)
arm_mods = [m for m in mesh.modifiers if m.type == "ARMATURE"]
print(f"  Anna Body armature mods: {[m.object.name if m.object else None for m in arm_mods]}")
print(f"  Anna Body verts={len(mesh.data.vertices)} vgroups={len(mesh.vertex_groups)} "
      f"shape_keys={len(mesh.data.shape_keys.key_blocks) if mesh.data.shape_keys else 0}")

# ---- remove internal-cavity faces from body mesh ----
# Anna Body 自体に「口腔内」「涙腺内側」等の内部キャビティ用 material が
# 同居している。これらは voxelize 時に表面サンプリングされて顔/上半身に
# 不正な voxel を生成する (口腔内が顔表面まで張り出す等)。
# 該当 material が付いた face を mesh から削除し、後続の voxelize から
# 完全に除外する。眼/歯/舌の別メッシュが scene にいない (=cleanup で削除済み)
# でも顔が崩れない設計。
CAVITY_KEYWORDS = (
    "mouth",     # 'Anna Mouth' = T_CH_fac_inner_mouth (口腔内)
    "tearline",  # 'Anna_tearline' = T_CH_kgr_fac_tear (涙腺内側)
    "cornea",    # 透明角膜 (眼が無いと貫通する)
    "eye_inner", "inner_eye",
    "_interior", "_cavity",
    "eyemoisture",  # DAZ G8F 涙腺
    "eyesocket",    # DAZ G8F 眼窩内側
    "rectum",       # DAZ G8F GP_Rectum (直腸内側)
    "labia minora", # DAZ G8F GP_Labia Minora (薄皮内側)
)
mesh_obj = bpy.data.objects.get(KEEP_MESH)
if mesh_obj is not None and mesh_obj.type == "MESH":
    import bmesh
    cavity_idx = set()
    for mi, slot in enumerate(mesh_obj.material_slots):
        if slot.material and any(kw in slot.material.name.lower()
                                  for kw in CAVITY_KEYWORDS):
            cavity_idx.add(mi)
            print(f"  cavity material: '{slot.material.name}' (slot {mi})")
    if cavity_idx:
        bm = bmesh.new()
        bm.from_mesh(mesh_obj.data)
        bm.faces.ensure_lookup_table()
        to_del = [f for f in bm.faces if f.material_index in cavity_idx]
        bmesh.ops.delete(bm, geom=to_del, context="FACES")
        bm.to_mesh(mesh_obj.data)
        bm.free()
        mesh_obj.data.update()
        print(f"  removed {len(to_del)} cavity faces from {KEEP_MESH}")
    else:
        print(f"  no cavity materials found")

# ---- remap + pack textures ----
# voxelize_mustardui の cache_texture は image.pixels を読む。image.size==(0,0)
# のまま (= 実体未ロード) だと色サンプリングが効かず palette 1 色に縮退する。
if TEXTURE_DIR:
    if not os.path.isdir(TEXTURE_DIR):
        print(f"  ERROR: texture-dir not found: {TEXTURE_DIR}")
        sys.exit(1)
    n_remap = 0
    n_load = 0
    n_skip_packed = 0
    n_skip_no_basename = 0
    n_pack_ok = 0
    # Build recursive basename → fullpath index (BW etc. nest textures under Outfits/).
    basename_index = {}
    for root, _, files in os.walk(TEXTURE_DIR):
        for f in files:
            basename_index.setdefault(f.lower(), os.path.join(root, f))
    for img in bpy.data.images:
        if img.packed_file:
            n_skip_packed += 1
            continue
        if not img.filepath:
            continue
        # bpy.path.basename handles Blender's "//<rel>" syntax that os.path
        # mishandles on Windows (returns '' for '//textures\\foo.png').
        basename = bpy.path.basename(img.filepath)
        if not basename:
            n_skip_no_basename += 1
            continue
        cand = os.path.join(TEXTURE_DIR, basename)
        if not os.path.isfile(cand):
            cand = basename_index.get(basename.lower())
            if not cand:
                continue
        img.filepath = cand
        img.filepath_raw = cand
        try:
            img.reload()
        except Exception as e:
            print(f"  WARN: reload {img.name}: {e}")
            continue
        # Force pixel load by touching image.pixels (image.size only updates
        # after the image is actually accessed).
        try:
            _ = img.pixels[0] if len(img.pixels) > 0 else None
            if img.size[0] > 0 and img.size[1] > 0:
                n_load += 1
        except Exception:
            pass
        n_remap += 1
        # Pack this image individually (pack_all() chokes on first bad image).
        try:
            img.pack()
            n_pack_ok += 1
        except Exception as e:
            print(f"  WARN: pack {img.name}: {e}")
    print(f"  texture remap: remapped={n_remap} loaded_ok={n_load} "
          f"packed={n_pack_ok} already_packed={n_skip_packed} "
          f"no_basename={n_skip_no_basename}")

# ---- save ----
out_dir = os.path.dirname(OUT_BLEND)
if out_dir and not os.path.exists(out_dir):
    os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  saved -> {OUT_BLEND}")
print("\n=== DONE ===")
