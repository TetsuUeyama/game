"""ARP の具体的な operator を探す"""
import bpy
import os

print(f"\n=== Searching ARP operators ===")

# すべての bpy.ops モジュールをスキャンして arp/bind/retarget/remap/cloth を含む op を探す
keywords = ['bind', 'retarget', 'remap', 'cloth', 'smart', 'arp']
found_ops = []
for cat_name in dir(bpy.ops):
    cat = getattr(bpy.ops, cat_name)
    for op_name in dir(cat):
        full = f'bpy.ops.{cat_name}.{op_name}'
        low = full.lower()
        if any(k in low for k in keywords) and not low.startswith('bpy.ops.object.'):
            found_ops.append(full)

print(f"\nOperators matching keywords ({len(found_ops)}):")
for op in found_ops[:100]:
    print(f"  {op}")

# ARP addon の source を探す
print(f"\n\n=== ARP source files ===")
paths_to_check = [
    os.path.expanduser('~/AppData/Roaming/Blender Foundation/Blender/5.0/extensions/user_default/auto_rig_pro'),
    os.path.expanduser('~/AppData/Roaming/Blender Foundation/Blender/5.0/scripts/addons/auto_rig_pro'),
]
import sys
for p in sys.path:
    if 'auto_rig' in p.lower() or 'arp' in p.lower():
        print(f"  sys.path: {p}")

for root_path in paths_to_check:
    if os.path.exists(root_path):
        print(f"\n  ROOT: {root_path}")
        for item in sorted(os.listdir(root_path))[:30]:
            print(f"    {item}")

# operators モジュール
print(f"\n=== Try to import ARP modules directly ===")
try:
    import bl_ext
    for attr in dir(bl_ext):
        if 'user' in attr.lower() or 'auto' in attr.lower():
            print(f"  bl_ext.{attr}")
except ImportError:
    pass

try:
    from bl_ext.user_default import auto_rig_pro
    print(f"  Imported: {auto_rig_pro}")
    print(f"  Location: {auto_rig_pro.__file__ if hasattr(auto_rig_pro, '__file__') else '?'}")
    for attr in dir(auto_rig_pro):
        if not attr.startswith('_'):
            print(f"    {attr}")
except Exception as e:
    print(f"  Import error: {e}")
