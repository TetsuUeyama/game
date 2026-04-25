"""Auto-Rig Pro addon が使えるか調査"""
import bpy
import sys

print(f"\n=== ARP Addon Check ===")

# 1. インストールされたアドオン一覧
print(f"\n[1] Enabled addons:")
prefs = bpy.context.preferences
for addon in prefs.addons.keys():
    if 'arp' in addon.lower() or 'auto' in addon.lower() or 'rig' in addon.lower():
        print(f"  ENABLED: {addon}")

# 2. ARP モジュールアクセス試行
print(f"\n[2] ARP module accessible?")
arp_candidates = ['auto_rig_pro', 'auto_rig_pro-master', 'auto_rig', 'auto_rig_pro-dev', 'arp_clean']
for cand in arp_candidates:
    try:
        mod = __import__(cand)
        print(f"  FOUND: {cand}")
        # Check for clothing-related functions
        for attr in dir(mod):
            low = attr.lower()
            if any(k in low for k in ['cloth', 'retarget', 'remap', 'bind', 'fit']):
                print(f"    {attr}")
    except ImportError:
        pass

# 3. Operator の存在チェック
print(f"\n[3] ARP operators in bpy.ops:")
for cat_name in dir(bpy.ops):
    if any(k in cat_name.lower() for k in ['arp', 'rig']):
        cat = getattr(bpy.ops, cat_name)
        ops = [o for o in dir(cat)]
        if ops:
            print(f"  {cat_name}: {ops[:20]}")

# 4. QM blend は ARP 情報を含む? Scene data チェック
print(f"\n[4] Scene ARP properties:")
scene = bpy.context.scene
for prop in dir(scene):
    if 'arp' in prop.lower():
        print(f"  scene.{prop}")

# 5. Blender scripts path (addon 検索)
print(f"\n[5] Addon scripts path:")
import os
script_paths = [
    bpy.utils.user_resource('SCRIPTS', path='addons'),
    bpy.utils.script_path_user(),
]
for p in script_paths:
    if p and os.path.exists(p):
        print(f"  {p}:")
        try:
            for item in sorted(os.listdir(p)):
                if 'arp' in item.lower() or 'auto' in item.lower():
                    print(f"    -> {item}")
        except Exception as e:
            print(f"    error: {e}")

# global add-ons dir
import sys as _sys
for p in _sys.path:
    if 'addons' in p.lower():
        print(f"  sys.path addon dir: {p}")
        if os.path.exists(p):
            for item in sorted(os.listdir(p)):
                if 'arp' in item.lower() or 'auto' in item.lower():
                    print(f"    -> {item}")
print()
