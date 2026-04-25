"""Helena → QM 衣装フィッティング V2。

V1 との違い:
  - Shrinkwrap 前に LBS retarget で Helena body / dress を QM rest pose に変形
  - これによりポーズ差 (Rigify rest pose vs ARP rest pose) を吸収
  - その後 Shrinkwrap でプロポーション微調整
  - Mesh Deform で dress に伝達

手順:
  [0] QM blend を開いている状態 (base scene)
  [1] Helena blend から body / dress / armature を append
  [2] 原点位置を QM に揃える
  [3] LBS retarget: Helena 両メッシュの頂点を QM rest pose へ移動
      (SRC_TO_TGT_BONE + 同名ボーン + 親骨 fallback)
  [4] Helena body に Shrinkwrap (NEAREST_SURFACEPOINT) 追加 (無効状態)
  [5] Dress に Mesh Deform (cage=Helena body) bind
  [6] Shrinkwrap を有効化 → body が QM shape に収束
  [7] Mesh Deform apply → dress 追従
  [8] Dress を QM armature に再 parent + VG rename
  [9] Helena armature / body 削除
  [10] 保存

Usage:
  blender --background <qm.blend> --python fit_helena_to_qm_v2.py -- \
    <helena.blend> <helena_body_name> <helena_dress_name> \
    <qm_body_name> <qm_armature_name> <out_blend_path>
"""
import bpy
import bmesh
import sys
import os
import mathutils
from mathutils import Matrix, Vector

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

print(f"\n=== fit_helena_to_qm V2 ===")
print(f"  Helena blend : {HELENA_BLEND}")
print(f"  Helena body  : {HELENA_BODY}")
print(f"  Helena dress : {HELENA_DRESS}")
print(f"  QM body      : {QM_BODY}")
print(f"  QM armature  : {QM_ARMATURE}")
print(f"  output blend : {OUT_BLEND}")

# ========================================================================
# Helena → QM bone name mapping
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
# [0] QM scene 確認
# ========================================================================
print(f"\n[0] QM scene objects:")
qm_body_obj = bpy.data.objects.get(QM_BODY)
qm_arm_obj  = bpy.data.objects.get(QM_ARMATURE)
if qm_body_obj is None or qm_arm_obj is None:
    print(f"  ERROR: QM body or armature not found")
    sys.exit(1)
print(f"  QM body OK: {qm_body_obj.name}  arm OK: {qm_arm_obj.name}")

# ========================================================================
# [1] Helena append
# ========================================================================
print(f"\n[1] Append Helena objects")
with bpy.data.libraries.load(HELENA_BLEND, link=False) as (src, dst):
    want = {HELENA_BODY, HELENA_DRESS}
    dst.objects = [n for n in src.objects if n in want]

helena_body = None; helena_dress = None
for o in dst.objects:
    if o is None: continue
    bpy.context.scene.collection.objects.link(o)
    if o.name == HELENA_BODY: helena_body = o
    if o.name == HELENA_DRESS: helena_dress = o

if helena_body is None or helena_dress is None:
    print(f"  ERROR: Failed to append"); sys.exit(1)

helena_arm = None
for m in list(helena_body.modifiers) + list(helena_dress.modifiers):
    if m.type == 'ARMATURE' and m.object is not None:
        helena_arm = m.object; break
print(f"  Helena body={helena_body.name} dress={helena_dress.name} arm={helena_arm.name if helena_arm else None}")

# ========================================================================
# [2] bbox center を揃える (armature の子なので armature のみ translate)
# ========================================================================
print(f"\n[2] Align Helena to QM origin")
def world_bbox_center(obj):
    mw = obj.matrix_world
    coords = [mw @ v.co for v in obj.data.vertices]
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    return Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))

qm_c = world_bbox_center(qm_body_obj)
h_c  = world_bbox_center(helena_body)
delta = qm_c - h_c
print(f"  QM center: {tuple(round(c,3) for c in qm_c)}")
print(f"  Helena center: {tuple(round(c,3) for c in h_c)}")
print(f"  Delta: {tuple(round(c,3) for c in delta)}")

def is_descendant_of(obj, ancestor):
    cur = obj.parent
    while cur is not None:
        if cur == ancestor: return True
        cur = cur.parent
    return False

if helena_arm:
    helena_arm.location = helena_arm.location + delta
    for obj in [helena_body, helena_dress]:
        if not is_descendant_of(obj, helena_arm):
            obj.location = obj.location + delta
else:
    for obj in [helena_body, helena_dress]:
        obj.location = obj.location + delta

bpy.context.view_layer.update()
print(f"  Helena center after: {tuple(round(c,3) for c in world_bbox_center(helena_body))}")

# ========================================================================
# [3] LBS retarget: Helena body / dress を QM rest pose に変形
# ========================================================================
print(f"\n[3] LBS retarget Helena meshes to QM rest pose")

if helena_arm is None:
    print(f"  WARN: no Helena armature found, skipping LBS retarget")
else:
    # 各 Helena deform bone に対して、対応 QM bone の world matrix を計算
    qm_bone_world = {}
    for b in qm_arm_obj.data.bones:
        qm_bone_world[b.name] = qm_arm_obj.matrix_world @ b.matrix_local

    helena_bone_world = {}
    for b in helena_arm.data.bones:
        helena_bone_world[b.name] = helena_arm.matrix_world @ b.matrix_local

    def find_qm_name(h_name):
        # 1) 明示的マッピング
        q = SRC_TO_TGT_BONE.get(h_name)
        if q and q in qm_bone_world: return q
        # 2) 同名
        if h_name in qm_bone_world: return h_name
        # 3) DEF- プレフィックス除去で探す
        if h_name.startswith('DEF-'):
            base = h_name[4:]
            if base in qm_bone_world: return base
        # 4) 親方向 fallback (親ボーンが DEF-* なら再帰)
        h_bone = helena_arm.data.bones.get(h_name)
        if h_bone and h_bone.parent:
            return find_qm_name(h_bone.parent.name)
        return None

    # 各 Helena bone に対する transform = qm_bone_world @ helena_bone_world^-1
    bone_transforms = {}
    for h_name in helena_bone_world:
        q_name = find_qm_name(h_name)
        if q_name:
            bone_transforms[h_name] = qm_bone_world[q_name] @ helena_bone_world[h_name].inverted()

    # 同定できたボーン数
    print(f"  bone transforms: {len(bone_transforms)}/{len(helena_bone_world)}")

    def lbs_retarget(obj):
        """obj の頂点を bone_transforms の加重平均で変形"""
        vg_by_idx = {vg.index: vg.name for vg in obj.vertex_groups}
        mw = obj.matrix_world
        mw_inv = mw.inverted()
        unmapped_count = 0
        zero_weight_count = 0
        for v in obj.data.vertices:
            total_w = 0.0
            blended = Matrix(((0,0,0,0),(0,0,0,0),(0,0,0,0),(0,0,0,0)))
            for g in v.groups:
                name = vg_by_idx.get(g.group)
                if name in bone_transforms and g.weight > 1e-6:
                    mat = bone_transforms[name]
                    for r in range(4):
                        for c in range(4):
                            blended[r][c] = blended[r][c] + mat[r][c] * g.weight
                    total_w += g.weight
            if total_w < 1e-6:
                zero_weight_count += 1
                continue
            s = 1.0 / total_w
            for r in range(4):
                for c in range(4):
                    blended[r][c] = blended[r][c] * s
            world_pos = mw @ v.co
            new_world = blended @ world_pos
            v.co = mw_inv @ new_world
        obj.data.update()
        print(f"    {obj.name}: retargeted ({zero_weight_count} verts had no mapped weights)")

    lbs_retarget(helena_body)
    lbs_retarget(helena_dress)

# ========================================================================
# [4] Helena body に Shrinkwrap (無効で追加)
# ========================================================================
print(f"\n[4] Add Shrinkwrap on Helena body (disabled)")
for m in helena_body.modifiers:
    m.show_viewport = False
sw = helena_body.modifiers.new(name='SW_QM', type='SHRINKWRAP')
sw.target = qm_body_obj
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.show_viewport = False
print(f"  SW added")

# ========================================================================
# [5] Dress に Mesh Deform bind
# ========================================================================
print(f"\n[5] Mesh Deform on dress, bind")
# shape key 削除
if helena_dress.data.shape_keys:
    n = len(helena_dress.data.shape_keys.key_blocks)
    helena_dress.shape_key_clear()
    print(f"  cleared {n} shape keys")

dress_arm_mod = None
for m in helena_dress.modifiers:
    if m.type == 'ARMATURE':
        dress_arm_mod = m; m.show_viewport = False

md = helena_dress.modifiers.new(name='MD_HelenaBody', type='MESH_DEFORM')
md.object = helena_body
md.precision = 5

bpy.context.view_layer.objects.active = helena_dress
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
try:
    bpy.ops.object.meshdeform_bind(modifier=md.name)
    print(f"  bind ok. is_bound={md.is_bound}")
except Exception as e:
    print(f"  ERROR bind: {e}"); sys.exit(1)
if not md.is_bound:
    print(f"  ERROR: MeshDeform not bound"); sys.exit(1)

# ========================================================================
# [6] Shrinkwrap を有効化
# ========================================================================
print(f"\n[6] Enable Shrinkwrap")
sw.show_viewport = True
bpy.context.view_layer.update()

# ========================================================================
# [7] Mesh Deform apply
# ========================================================================
print(f"\n[7] Apply Mesh Deform on dress")
bpy.context.view_layer.objects.active = helena_dress
for o in bpy.context.selected_objects: o.select_set(False)
helena_dress.select_set(True)
while helena_dress.modifiers[0].name != md.name:
    bpy.ops.object.modifier_move_up(modifier=md.name)
try:
    bpy.ops.object.modifier_apply(modifier=md.name)
    print(f"  applied")
except Exception as e:
    print(f"  ERROR apply: {e}"); sys.exit(1)

if dress_arm_mod is not None:
    dress_arm_mod.show_viewport = True

# ========================================================================
# [8] Dress を QM armature に再 parent + VG rename
# ========================================================================
print(f"\n[8] Re-bind dress to QM armature")
if dress_arm_mod is not None:
    dress_arm_mod.object = qm_arm_obj
else:
    am = helena_dress.modifiers.new(name='Armature_QM', type='ARMATURE')
    am.object = qm_arm_obj; am.use_vertex_groups = True

qm_bone_names = set(b.name for b in qm_arm_obj.data.bones)
renamed = 0; removed = 0; kept = 0; merged = 0
for vg in list(helena_dress.vertex_groups):
    src = vg.name
    if src in qm_bone_names:
        kept += 1; continue
    tgt = SRC_TO_TGT_BONE.get(src)
    if tgt and tgt in qm_bone_names:
        if tgt in helena_dress.vertex_groups:
            src_idx = vg.index
            tgt_vg = helena_dress.vertex_groups[tgt]
            for v in helena_dress.data.vertices:
                for g in v.groups:
                    if g.group == src_idx:
                        tgt_vg.add([v.index], g.weight, 'ADD')
            helena_dress.vertex_groups.remove(vg)
            merged += 1
        else:
            vg.name = tgt; renamed += 1
    else:
        helena_dress.vertex_groups.remove(vg); removed += 1
print(f"  VG: kept={kept} renamed={renamed} merged={merged} removed={removed}")

# ========================================================================
# [9] cleanup
# ========================================================================
print(f"\n[9] Cleanup")
if helena_arm is not None:
    bpy.data.objects.remove(helena_arm, do_unlink=True)
bpy.data.objects.remove(helena_body, do_unlink=True)
helena_dress.parent = qm_arm_obj
helena_dress.matrix_parent_inverse = qm_arm_obj.matrix_world.inverted()
helena_dress.name = f"{HELENA_DRESS} (fit QM v2)"
print(f"  dress renamed: {helena_dress.name}")

# ========================================================================
# [10] 保存
# ========================================================================
print(f"\n[10] Save")
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f"\n=== DONE ===")
