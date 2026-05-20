"""Anna Body の modifier 一覧と mesh.vertices bbox を調べる。
Blender ファイルをロードして、voxelize/shrinkwrap が見ているのと
同じ raw state を確認する。

Usage:
  blender --background <blend> --python inspect_anna_mesh_state.py -- <mesh_name>
"""
import bpy
import sys
from mathutils import Vector

argv = sys.argv
idx = argv.index("--") if "--" in argv else len(argv)
args = argv[idx + 1:]
MESH_NAME = args[0] if args else "Anna Body"

print(f"\n=== inspect_anna_mesh_state ===")
print(f"  blend: {bpy.data.filepath}")
print(f"  mesh:  {MESH_NAME}")

obj = bpy.data.objects.get(MESH_NAME)
if obj is None:
    print(f"ERROR: mesh '{MESH_NAME}' not found")
    print(f"  Available meshes: {[o.name for o in bpy.data.objects if o.type == 'MESH']}")
    sys.exit(1)

print(f"\n[Modifiers on {obj.name}]")
for m in obj.modifiers:
    state = []
    if m.show_viewport: state.append("VIEWPORT")
    if m.show_render:   state.append("RENDER")
    if not state: state.append("DISABLED")
    extra = ""
    if m.type == "ARMATURE":
        extra = f" target={m.object.name if m.object else None}"
    print(f"  {m.type:20s} {m.name:30s} [{','.join(state)}]{extra}")

print(f"\n[Shape keys]")
sk = obj.data.shape_keys
if sk:
    for kb in sk.key_blocks:
        print(f"  {kb.name} value={kb.value}")
else:
    print(f"  none")

# Raw mesh bbox (data.vertices, no modifiers)
mesh = obj.data
n = len(mesh.vertices)
print(f"\n[Raw mesh stats]  verts={n}")
if n == 0:
    sys.exit(0)
mn = Vector(( 1e9,  1e9,  1e9))
mx = Vector((-1e9, -1e9, -1e9))
world = obj.matrix_world
for v in mesh.vertices:
    p = world @ v.co
    for i in range(3):
        if p[i] < mn[i]: mn[i] = p[i]
        if p[i] > mx[i]: mx[i] = p[i]
size = mx - mn
print(f"  raw bbox min: ({mn.x:+.3f}, {mn.y:+.3f}, {mn.z:+.3f})")
print(f"  raw bbox max: ({mx.x:+.3f}, {mx.y:+.3f}, {mx.z:+.3f})")
print(f"  raw size W*D*H: {size.x*1000:.0f} x {size.y*1000:.0f} x {size.z*1000:.0f} mm")

# Evaluated mesh bbox (with modifiers, what voxelize sees)
print(f"\n[Evaluated mesh stats (with active modifiers)]")
dg = bpy.context.evaluated_depsgraph_get()
eo = obj.evaluated_get(dg)
me = eo.to_mesh()
ne = len(me.vertices)
mne = Vector(( 1e9,  1e9,  1e9))
mxe = Vector((-1e9, -1e9, -1e9))
for v in me.vertices:
    p = world @ v.co
    for i in range(3):
        if p[i] < mne[i]: mne[i] = p[i]
        if p[i] > mxe[i]: mxe[i] = p[i]
sze = mxe - mne
print(f"  eval verts: {ne}")
print(f"  eval bbox min: ({mne.x:+.3f}, {mne.y:+.3f}, {mne.z:+.3f})")
print(f"  eval bbox max: ({mxe.x:+.3f}, {mxe.y:+.3f}, {mxe.z:+.3f})")
print(f"  eval size W*D*H: {sze.x*1000:.0f} x {sze.y*1000:.0f} x {sze.z*1000:.0f} mm")
diff_w = (sze.x - size.x) * 1000
diff_d = (sze.y - size.y) * 1000
diff_h = (sze.z - size.z) * 1000
print(f"  delta (eval - raw): {diff_w:+.1f} x {diff_d:+.1f} x {diff_h:+.1f} mm")
eo.to_mesh_clear()

print(f"\n=== DONE ===")
