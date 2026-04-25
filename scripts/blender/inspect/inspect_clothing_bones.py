"""Blend ファイルの衣装ボーン設定を調査する。

メッシュ・アーマチュア一覧、各メッシュの armature modifier / vertex group /
主要ボーン割当を出力し、結果を JSON にも保存する。

Usage:
  blender --background --python inspect_clothing_bones.py -- <blend> <out.json>
"""
import bpy
import sys
import os
import json

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]

BLEND_PATH = args[0]
OUT_JSON = args[1] if len(args) > 1 else None

print(f"\n=== Inspect clothing bones ===")
print(f"  File: {BLEND_PATH}")

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)

# ===== Armatures =====
armatures = []
for o in bpy.data.objects:
    if o.type != 'ARMATURE':
        continue
    bones_info = []
    for b in o.data.bones:
        h = o.matrix_world @ b.head_local
        t = o.matrix_world @ b.tail_local
        bones_info.append({
            'name': b.name,
            'parent': b.parent.name if b.parent else None,
            'use_deform': bool(b.use_deform),
            'head_world': [round(h.x, 4), round(h.y, 4), round(h.z, 4)],
            'tail_world': [round(t.x, 4), round(t.y, 4), round(t.z, 4)],
        })
    # T-ポーズ判定: 左右の肩〜手のボーンが水平 (Z 差小) になっているかざっくりチェック
    def _find(name_substrs):
        for b in bones_info:
            low = b['name'].lower()
            if all(s in low for s in name_substrs):
                return b
        return None
    shoulder_l = _find(['shoulder', 'l']) or _find(['shoulder_l']) or _find(['shoulder.l'])
    hand_l     = _find(['hand', 'l']) or _find(['hand_l']) or _find(['hand.l'])
    if not shoulder_l:
        shoulder_l = _find(['clavicle', 'l']) or _find(['upper', 'arm', 'l'])
    t_pose = None
    if shoulder_l and hand_l:
        dz = abs(shoulder_l['head_world'][2] - hand_l['head_world'][2])
        dx = abs(shoulder_l['head_world'][0] - hand_l['head_world'][0])
        t_pose = dz < 0.15 and dx > 0.2  # 肩と手の Z 差が小さく X 差が大きい = T
    armatures.append({
        'name': o.name,
        'bone_count': len(bones_info),
        'deform_bone_count': sum(1 for b in bones_info if b['use_deform']),
        't_pose_estimate': t_pose,
        'bones': bones_info,
    })

print(f"\n=== Armatures: {len(armatures)} ===")
for a in armatures:
    print(f"  {a['name']}: bones={a['bone_count']} deform={a['deform_bone_count']} T-pose={a['t_pose_estimate']}")

# ===== Meshes =====
meshes = []
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    if not o.visible_get():
        # 非表示メッシュは記録だけする（skip フラグ付き）
        pass
    me = o.data
    tri_count = sum(1 for p in me.polygons if len(p.vertices) == 3) + \
                sum(1 for p in me.polygons if len(p.vertices) == 4) * 2

    # Armature modifier
    arm_mods = []
    for m in o.modifiers:
        if m.type == 'ARMATURE':
            arm_mods.append({
                'name': m.name,
                'object': m.object.name if m.object else None,
                'use_vertex_groups': bool(m.use_vertex_groups),
                'show_viewport': bool(m.show_viewport),
            })

    # Vertex groups + weight 合計
    vg_names = [vg.name for vg in o.vertex_groups]
    vg_weight_sum = {}
    for v in me.vertices:
        for g in v.groups:
            vgn = vg_names[g.group] if g.group < len(vg_names) else f'?{g.group}'
            vg_weight_sum[vgn] = vg_weight_sum.get(vgn, 0.0) + g.weight
    # 上位 8 ボーンだけに絞って表示
    top_bones = sorted(vg_weight_sum.items(), key=lambda x: -x[1])[:8]

    # parent 情報（Armature 親かどうか）
    parent_info = None
    if o.parent:
        parent_info = {'name': o.parent.name, 'type': o.parent.type}

    has_rig = len(arm_mods) > 0 and any(m['use_vertex_groups'] for m in arm_mods) and len(top_bones) > 0

    mesh_info = {
        'name': o.name,
        'visible': bool(o.visible_get()),
        'vert_count': len(me.vertices),
        'tri_count_est': tri_count,
        'has_rig': has_rig,
        'armature_modifiers': arm_mods,
        'parent': parent_info,
        'vertex_group_count': len(vg_names),
        'top_bones_by_weight': [[n, round(w, 2)] for n, w in top_bones],
    }
    meshes.append(mesh_info)

# print サマリ
print(f"\n=== Meshes: {len(meshes)} ===")
print(f"  {'name':40s}  {'vis':4s} {'verts':>7s} {'tris':>7s} {'rig':3s} {'armMod':6s} {'vgs':>4s}")
for m in meshes:
    print(f"  {m['name'][:40]:40s}  "
          f"{'Y' if m['visible'] else '-':4s} "
          f"{m['vert_count']:>7d} "
          f"{m['tri_count_est']:>7d} "
          f"{'Y' if m['has_rig'] else '-':3s} "
          f"{len(m['armature_modifiers']):>6d} "
          f"{m['vertex_group_count']:>4d}")

# 衣装候補の rig 詳細
print(f"\n=== Rig details (rig=Y のメッシュのみ) ===")
for m in meshes:
    if not m['has_rig']:
        continue
    print(f"\n  [{m['name']}]")
    for am in m['armature_modifiers']:
        print(f"    ArmatureMod: {am['name']} -> {am['object']} (use_vg={am['use_vertex_groups']})")
    print(f"    top bones by weight-sum:")
    for n, w in m['top_bones_by_weight']:
        print(f"      {n}: {w}")

# rig 無しメッシュ
print(f"\n=== Meshes without rig ===")
for m in meshes:
    if m['has_rig']:
        continue
    print(f"  {m['name']}  (vg={m['vertex_group_count']}, armMod={len(m['armature_modifiers'])})")

# JSON 出力
if OUT_JSON:
    os.makedirs(os.path.dirname(OUT_JSON) or '.', exist_ok=True)
    out = {'blend': BLEND_PATH, 'armatures': armatures, 'meshes': meshes}
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\n  -> Saved: {OUT_JSON}")
