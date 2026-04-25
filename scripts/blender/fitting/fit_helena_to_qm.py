"""Helena の衣装を QM body へフィッティングし、ARP アーマチュアへ付け替えた blend を出力する。

手順:
  1. QM blend を開く (base)
  2. Helena blend から body / 目的衣装 / armature を append
  3. Helena body に Shrinkwrap modifier (target=QM body, 無効状態)
  4. 衣装に Mesh Deform modifier (cage=Helena body) → bind
  5. Shrinkwrap を有効化 → Helena body が QM shape に変形 → 衣装も追従
  6. Mesh Deform / Shrinkwrap を順次 apply (焼き付け)
  7. 衣装の Armature modifier を QM rig へ差し替え、vertex group を QM 骨名にリネーム
  8. Helena armature / body を削除
  9. 新 blend として保存

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm.py -- \
    <helena.blend> <helena_body_name> <helena_dress_name> <qm_body_name> \
    <qm_armature_name> <out_blend_path>

例:
  blender --background "E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend" \
    --python scripts/blender/fitting/fit_helena_to_qm.py -- \
    "E:/Helena_Douglas_1.10.blend" "Body" "Helena Default - Dress" \
    "Queen Marika Body" "QueenMarika_rig" "E:/MOdel/Helena_to_QM_fitted.blend"
"""
import bpy
import sys
import os

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

if len(args) < 6:
    print(__doc__); sys.exit(1)

HELENA_BLEND   = args[0]
HELENA_BODY    = args[1]
HELENA_DRESS   = args[2]
QM_BODY        = args[3]
QM_ARMATURE    = args[4]
OUT_BLEND      = args[5]

print(f"\n=== fit_helena_to_qm ===")
print(f"  Helena blend : {HELENA_BLEND}")
print(f"  Helena body  : {HELENA_BODY}")
print(f"  Helena dress : {HELENA_DRESS}")
print(f"  QM body      : {QM_BODY}")
print(f"  QM armature  : {QM_ARMATURE}")
print(f"  output blend : {OUT_BLEND}")

# ========================================================================
# Helena → QM bone name mapping (retarget_clothing_voxel.py から抜粋)
# ========================================================================
SRC_TO_TGT_BONE = {
    'DEF-spine':       'c_root_bend.x',
    'DEF-spine.001':   'c_spine_01_bend.x',
    'DEF-spine.002':   'c_spine_02_bend.x',
    'DEF-spine.003':   'c_spine_03_bend.x',
    'DEF-spine.004':   'neck.x',
    'DEF-spine.005':   'neck.x',
    'DEF-spine.006':   'head.x',
    'DEF-neck':        'neck.x',
    'DEF-head':        'head.x',
    'DEF-breast.L':    'breast_l',
    'DEF-breast.R':    'breast_r',
    'DEF-shoulder.L':  'shoulder.l',
    'DEF-shoulder.R':  'shoulder.r',
    'DEF-upper_arm.L':     'c_arm_stretch.l',
    'DEF-upper_arm.L.001': 'c_arm_stretch.l',
    'DEF-upper_arm.R':     'c_arm_stretch.r',
    'DEF-upper_arm.R.001': 'c_arm_stretch.r',
    'DEF-forearm.L':       'c_forearm_stretch.l',
    'DEF-forearm.L.001':   'c_forearm_stretch.l',
    'DEF-forearm.R':       'c_forearm_stretch.r',
    'DEF-forearm.R.001':   'c_forearm_stretch.r',
    'DEF-hand.L':      'hand.l',
    'DEF-hand.R':      'hand.r',
    'DEF-thigh.L':         'c_thigh_stretch.l',
    'DEF-thigh.L.001':     'c_thigh_stretch.l',
    'DEF-thigh.R':         'c_thigh_stretch.r',
    'DEF-thigh.R.001':     'c_thigh_stretch.r',
    'DEF-shin.L':          'c_leg_stretch.l',
    'DEF-shin.L.001':      'c_leg_stretch.l',
    'DEF-shin.R':          'c_leg_stretch.r',
    'DEF-shin.R.001':      'c_leg_stretch.r',
    'DEF-foot.L':      'foot.l',
    'DEF-foot.R':      'foot.r',
    'DEF-toe.L':       'c_toes_middle1.l',
    'DEF-toe.R':       'c_toes_middle1.r',
    'DEF-pelvis.L':    'c_root_bend.x',
    'DEF-pelvis.R':    'c_root_bend.x',
}

# ========================================================================
# 0. 現在の QM scene を確認
# ========================================================================
print(f"\n[0] QM scene objects:")
qm_body_obj = bpy.data.objects.get(QM_BODY)
qm_arm_obj  = bpy.data.objects.get(QM_ARMATURE)
if qm_body_obj is None or qm_arm_obj is None:
    print(f"  ERROR: QM body or armature not found")
    print(f"  Available objects:")
    for o in bpy.data.objects:
        print(f"    {o.name} ({o.type})")
    sys.exit(1)
print(f"  QM body OK: {qm_body_obj.name} verts={len(qm_body_obj.data.vertices)}")
print(f"  QM armature OK: {qm_arm_obj.name}")
print(f"  QM armature location: {qm_arm_obj.location[:]}")
print(f"  QM body location: {qm_body_obj.location[:]}")

# ========================================================================
# 1. Helena blend から必要オブジェクトを append
# ========================================================================
print(f"\n[1] Append Helena objects from {HELENA_BLEND}")
with bpy.data.libraries.load(HELENA_BLEND, link=False) as (src, dst):
    # 欲しいものだけ append (他キャラの衣装は不要)
    want = {HELENA_BODY, HELENA_DRESS}
    dst.objects = [n for n in src.objects if n in want]
    # armature は name が重複しないよう後で扱う
    # 衣装の armature_modifier が参照する Helena armature も必要
print(f"  Loaded objects: {[o.name for o in dst.objects if o is not None]}")

helena_body = None
helena_dress = None
for o in dst.objects:
    if o is None: continue
    # append しただけではシーンに入らないので collection へ link
    bpy.context.scene.collection.objects.link(o)
    if o.name == HELENA_BODY: helena_body = o
    if o.name == HELENA_DRESS: helena_dress = o

if helena_body is None or helena_dress is None:
    print(f"  ERROR: Failed to append {HELENA_BODY} or {HELENA_DRESS}")
    sys.exit(1)
print(f"  Helena body: {helena_body.name} verts={len(helena_body.data.vertices)}")
print(f"  Helena dress: {helena_dress.name} verts={len(helena_dress.data.vertices)}")

# 衣装 / body の armature modifier からアーマチュア参照を取得
helena_arm = None
for m in list(helena_body.modifiers) + list(helena_dress.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        helena_arm = m.object
        break
if helena_arm is None:
    print(f"  WARN: Helena armature not found via modifier; will skip armature re-link")
else:
    print(f"  Helena armature reference: {helena_arm.name}")

# ========================================================================
# 2. 座標系を合わせる (両 body の world 中心を origin に)
# ========================================================================
print(f"\n[2] Align Helena body/dress to QM origin")
# Helena body/dress の world bbox center と QM body の world bbox center を比較し、
# Helena 側を translate して合わせる (scale は触らない)
def world_bbox_center(obj):
    import mathutils
    mw = obj.matrix_world
    coords = [mw @ v.co for v in obj.data.vertices]
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    return mathutils.Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))

qm_center = world_bbox_center(qm_body_obj)
helena_center = world_bbox_center(helena_body)
delta = qm_center - helena_center
print(f"  QM body center: {tuple(round(c,3) for c in qm_center)}")
print(f"  Helena body center: {tuple(round(c,3) for c in helena_center)}")
print(f"  Delta: {tuple(round(c,3) for c in delta)}")

# armature の child は自動追従するので、parent 関係を確認してから個別移動
def is_descendant_of(obj, ancestor):
    cur = obj.parent
    while cur is not None:
        if cur == ancestor: return True
        cur = cur.parent
    return False

moved_set = []
if helena_arm is not None:
    helena_arm.location = helena_arm.location + delta
    moved_set.append(helena_arm)
    for obj in [helena_body, helena_dress]:
        if is_descendant_of(obj, helena_arm):
            print(f"  {obj.name} is child of armature → skip (follows via parent)")
        else:
            obj.location = obj.location + delta
            moved_set.append(obj)
else:
    for obj in [helena_body, helena_dress]:
        obj.location = obj.location + delta
        moved_set.append(obj)
for o in moved_set:
    print(f"  moved {o.name} by delta")

bpy.context.view_layer.update()
helena_center_after = world_bbox_center(helena_body)
print(f"  Helena body center after: {tuple(round(c,3) for c in helena_center_after)}")

# ========================================================================
# 3. Helena body に Shrinkwrap modifier (無効化状態で追加)
# ========================================================================
print(f"\n[3] Add Shrinkwrap on Helena body (disabled initially)")
# Helena body の既存 modifier を一旦 disable (armature を介した変形が bind に影響しないよう)
saved_modifier_states = {}
for m in helena_body.modifiers:
    saved_modifier_states[m.name] = m.show_viewport
    m.show_viewport = False
print(f"  Disabled {len(saved_modifier_states)} existing modifiers on Helena body")

sw = helena_body.modifiers.new(name='SW_QM', type='SHRINKWRAP')
sw.target = qm_body_obj
sw.wrap_method = 'NEAREST_SURFACEPOINT'  # 最近傍点: 腕や足の表面にも素直にマップ
sw.show_viewport = False  # bind 時は無効
print(f"  Added Shrinkwrap: target={sw.target.name}, method={sw.wrap_method}")

# ========================================================================
# 4. Dress に Mesh Deform modifier (cage=Helena body) → bind
# ========================================================================
print(f"\n[4] Add Mesh Deform on dress and bind")
# dress の shape key が apply を妨げるので削除 (Mesh Deform 焼き付け用なので rest pose 形状だけで十分)
if helena_dress.data.shape_keys:
    n = len(helena_dress.data.shape_keys.key_blocks)
    helena_dress.shape_key_clear()
    print(f"  Cleared {n} shape keys from dress")

# dress の既存 armature modifier を一旦無効化 (bind 時は T-pose 状態で行いたい)
dress_arm_mod = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE':
        dress_arm_mod = m
        m.show_viewport = False
        print(f"  Disabled dress armature mod: {m.name}")

md = helena_dress.modifiers.new(name='MD_HelenaBody', type='MESH_DEFORM')
md.object = helena_body
md.precision = 5   # 精度 (高くすると bind が重い、低くすると変形が粗い)
md.use_dynamic_bind = False
print(f"  Added MeshDeform: cage={md.object.name}, precision={md.precision}")

# bind 実行 — bpy.ops.object.meshdeform_bind でバインド開始
# バインドは非同期じゃなく background では即完了する
bpy.context.view_layer.objects.active = helena_dress
# dress のみ選択状態に
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
print(f"  Binding MeshDeform (this may take a while)...")
try:
    bpy.ops.object.meshdeform_bind(modifier=md.name)
    print(f"  Bind done. is_bound={md.is_bound}")
except Exception as e:
    print(f"  ERROR: meshdeform_bind failed: {e}")
    sys.exit(1)

if not md.is_bound:
    print(f"  ERROR: MeshDeform bind did not succeed. Dress may be outside cage.")
    sys.exit(1)

# ========================================================================
# 5. Shrinkwrap を有効化 + Helena body の他 modifier を復元 (ただし armature は無効のまま)
# ========================================================================
print(f"\n[5] Enable Shrinkwrap on Helena body")
sw.show_viewport = True
# armature modifier は rest pose 前提で無効のまま
# （apply 時に armature deform を含めると T-pose 以外で焼き付くので危険）
print(f"  SW_QM enabled. Body now deforms to QM shape.")

bpy.context.view_layer.update()

# ========================================================================
# 6. Apply modifiers: Mesh Deform on dress (先), Shrinkwrap on body は apply せずとも良いが cleanup
# ========================================================================
print(f"\n[6] Apply Mesh Deform on dress")
bpy.context.view_layer.objects.active = helena_dress
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
# Mesh Deform を stack の top に移動 (apply order 警告回避)
while helena_dress.modifiers[0].name != md.name:
    bpy.ops.object.modifier_move_up(modifier=md.name)
print(f"  MeshDeform moved to top of stack")
try:
    bpy.ops.object.modifier_apply(modifier=md.name)
    print(f"  MeshDeform applied on dress. Dress is now fitted to QM body shape.")
except Exception as e:
    print(f"  ERROR: modifier_apply failed: {e}")
    sys.exit(1)

# 復元 dress の armature modifier
if dress_arm_mod is not None:
    dress_arm_mod.show_viewport = True

# ========================================================================
# 7. Dress の Armature modifier を QM armature に差し替え + vertex group rename
# ========================================================================
print(f"\n[7] Re-bind dress to QM armature")
if dress_arm_mod is not None:
    dress_arm_mod.object = qm_arm_obj
    print(f"  Armature modifier object set to {qm_arm_obj.name}")
else:
    # armature modifier が無かった場合は追加
    am = helena_dress.modifiers.new(name='Armature_QM', type='ARMATURE')
    am.object = qm_arm_obj
    am.use_vertex_groups = True
    print(f"  Added new armature modifier -> {qm_arm_obj.name}")

# vertex group rename (Helena bone name → QM bone name)
qm_bone_names = set(b.name for b in qm_arm_obj.data.bones)
renamed = 0; removed = 0; kept = 0
for vg in list(helena_dress.vertex_groups):
    src_name = vg.name
    if src_name in qm_bone_names:
        kept += 1
        continue
    tgt_name = SRC_TO_TGT_BONE.get(src_name)
    if tgt_name and tgt_name in qm_bone_names:
        # 既に同名 VG がある場合は統合しないと rename 失敗するので残す
        if tgt_name in helena_dress.vertex_groups:
            # 既存 VG に weight を merge
            # (頂点ごとに src VG の weight を tgt VG に追加)
            src_idx = vg.index
            tgt_vg = helena_dress.vertex_groups[tgt_name]
            for v in helena_dress.data.vertices:
                for g in v.groups:
                    if g.group == src_idx:
                        tgt_vg.add([v.index], g.weight, 'ADD')
            helena_dress.vertex_groups.remove(vg)
            renamed += 1
        else:
            vg.name = tgt_name
            renamed += 1
    else:
        # 削除 (未解決の骨は deform に寄与しない)
        helena_dress.vertex_groups.remove(vg)
        removed += 1
print(f"  VG: kept(same name)={kept}, renamed={renamed}, removed(unmapped)={removed}")

# ========================================================================
# 8. Helena armature / body を削除 + dress を QM armature の子に
# ========================================================================
print(f"\n[8] Cleanup: remove Helena armature and body")
if helena_arm is not None:
    bpy.data.objects.remove(helena_arm, do_unlink=True)
    print(f"  Removed Helena armature")
bpy.data.objects.remove(helena_body, do_unlink=True)
print(f"  Removed Helena body")

# dress を QM armature の子として parent
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
print(f"  Dress parented to {qm_arm_obj.name}")

# ========================================================================
# 9. 名前を衝突回避形にリネーム (QM 既存の Dress と区別)
# ========================================================================
# Helena の衣装名をそのまま残すと後段 voxelize でどれか判らないので renaming
fitted_name = f"Helena {helena_dress.name.split(' ', 1)[1] if ' ' in helena_dress.name else helena_dress.name} (fit QM)"
# 元々 "Helena Default - Dress" なので "Helena Default - Dress (fit QM)" 系
fitted_name = f"{helena_dress.name} (fit QM)"
helena_dress.name = fitted_name
print(f"  Dress renamed: {fitted_name}")

# ========================================================================
# 10. 保存
# ========================================================================
print(f"\n[9] Save as {OUT_BLEND}")
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"  Saved.")
print(f"\n=== DONE ===")
