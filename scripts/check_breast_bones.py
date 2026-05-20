import bpy
import sys

# Load Helena_Douglas_1.10.blend then append QM to compare
helena_arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and o.name == 'Helena':
        helena_arm = o
        break
if helena_arm:
    h_l = helena_arm.data.bones.get('DEF-breast.L')
    h_r = helena_arm.data.bones.get('DEF-breast.R')
    if h_l:
        print(f"Helena DEF-breast.L: head={list(h_l.head_local)} tail={list(h_l.tail_local)} length={h_l.length:.4f}m")
    if h_r:
        print(f"Helena DEF-breast.R: length={h_r.length:.4f}m")

# Check QM breast bones via append
import os
QM = "E:/MOdel/QueenMarika_Rigged_MustardUI.blend"
existing = {o.name for o in bpy.data.objects}
with bpy.data.libraries.load(QM, link=False) as (df, dt):
    dt.objects = ['QueenMarika_rig']
qm = None
for o in bpy.data.objects:
    if o.name in existing: continue
    if 'QueenMarika' in o.name:
        qm = o; break

if qm:
    bL = qm.data.bones.get('breast_l')
    bR = qm.data.bones.get('breast_r')
    if bL:
        print(f"QM breast_l: length={bL.length:.4f}m")
    if bR:
        print(f"QM breast_r: length={bR.length:.4f}m")
