# ⚠️ 2026-05-07 更新: 衣装転送 v6 (cloth-first) Phase 1 実装 + 初回テスト完了

新設計：**Cloth-First fitting (Anchor + PBD distance + Collision)**

📌 **必読**: `scripts/blender/fitting/CLOTHING_TRANSFER_DESIGN.md`

## v6 Phase 1 進捗 (2026-05-07)

- [x] `scripts/blender/fitting/cloth_first_retarget.py` 実装 (LBS init + Anchor PBD + collision guard + weight transfer)
- [x] Helena bodysuit で実走テスト
  - 3020 verts / 5905 edges
  - **anchors 93.3% / free 6.7%** (tight 衣装の典型値)
  - PBD avg stretch: 3.44mm → 3.17mm 収束
  - max stretch 90.73mm は両端 anchor edge のため不変（QM body 表面で固定）
- [x] voxelize → `helena_bodysuit_cf.vox` (9555 voxels, 27 bones)
- [x] qm-mustardui-preview ページに登録 (`helena_bodysuit_cf`, 色 #4cf)

## 確認手順

1. dev server: `npm run dev` (http://localhost:3001)
2. `http://localhost:3001/qm-mustardui-preview` で Ctrl+Shift+R
3. 表示比較:
   - Helena Bodysuit (LBS v4 dir+vol) 旧版 (#48c 青)
   - **Helena Bodysuit (cloth-first v6) 新版 (#4cf 水色)**

## 次のステップ候補

- Phase 1 結果が OK なら → 他 outfit (default dress, qipao 等) で batch 実走
- bodysuit で問題があれば → パラメータ調整 (CONTACT_THRESHOLD, MIN_OFFSET, COLLISION_OFFSET, N_ITER, STIFFNESS)
- Phase 2 (Anchor strength field, 連続値拘束) へ進む

---

# ⚠️ 2026-05-06 更新: 衣装転送 v2 設計確定 (旧情報)

新設計：**Offset 保存 Wrap + 3軸固定原則 (対応・座標系・スケール)**

旧 v16/v18/Hybrid/TPS 系は全て廃止予定。

---

# 作業ステータス (2026-04-26 ケース B 確定後) — 旧情報、参考用

## 現在地

ケース B 採択 (v18 fit は armpit は改善するが前腕浮遊と外側 push が NG だったため)。

| 衣装 | fit | voxelize | align | 状態 |
|---|---|---|---|---|
| Default Dress | v16 | 済 | 済 | **v16.bak から復元済** |
| Witch Corset  | v16 | 済 | **済 (今回)** | ビューア確認待ち |
| Witch Skirt   | v16 | 済 | **済 (今回)** | ビューア確認待ち |

### Witch Corset align 結果
- 25542 voxels, push 7798 (約 30%)
- push distance: d=1 が 4488 と多数、d=8 まで散発
- weights: c_spine_03_bend.x, c_root_bend.x, c_thigh_stretch.l/r, c_spine_02_bend.x, breast_l/r 他 12 bones

### Witch Skirt align 結果
- 47641 voxels, push 23944 (約 50%)
- push distance: d=11 まで広がる
- **weights が `c_spine_01_bend.x` 1個に集約** ← v16 fit の制約 (cloth swing bone 384個が捨てられている)

## 確認すべきこと (ユーザーが今これを見ている)

ブラウザで http://localhost:3001/qm-mustardui-preview を開いて **Ctrl+Shift+R**:
1. Helena Witch Corset (紫) — 胴体密着、armpit、突き抜けの有無
2. Helena Witch Skirt (薄紫) — スカートの広がり、脚との干渉
3. Helena Dress (オレンジ) — v16 戻し後の元状態

判断:
- **OK** → 確定。次は Witch の Top/Hat 等の他パーツ、または装備品 (剣など) へ
- **NG** → どの部位がどう NG か教えてください (push 強度や align パラメータで対応できる場合あり)

## バックアップ状態

```
public/box5/qm_mustardui/
  helena_default_dress.vox                           # v16 fit + align (復元済)
  helena_default_dress.weights.json                  # v16 weights
  helena_default_dress.v16.bak.vox                   # v16 fit + align (バックアップ)
  helena_default_dress.v16.bak.weights.json
  helena_default_dress.v18.bak.vox                   # v18 fit + align (将来検証用)
  helena_default_dress.v18.bak.weights.json
  helena_witch_corset.vox                            # v16 fit + align (今回出力)
  helena_witch_corset.weights.json
  helena_witch_corset.preAlign.bak.vox               # v16 fit + voxelize 直後 (align 前)
  helena_witch_corset.preAlign.bak.weights.json
  helena_witch_corset.bak.vox                        # 過去の何か (07:13)
  helena_witch_skirt.vox                             # v16 fit + align (今回出力)
  helena_witch_skirt.weights.json
  helena_witch_skirt.preAlign.bak.vox                # v16 fit + voxelize 直後 (align 前)
  helena_witch_skirt.preAlign.bak.weights.json
```

## 将来作業: v18 fit 修正計画 (優先度: 中)

v18 が NG だった原因と対策:

### Issue 1: 前腕浮遊 (bone length scale 未対応)
**原因**: `local_pos = h_mat^-1 @ wp; qm_pos = q_mat @ local_pos` が bone-local 座標を「平行移動」のみで再構成。Helena と QM の bone 長さが違うと bone 軸方向に飛び出る。

**対策**:
```python
h_bone = helena_arm.data.bones[bn]
q_bone = qm_arm_obj.data.bones[bone_map[bn]]
scale = q_bone.length / h_bone.length if h_bone.length > 1e-6 else 1.0

local_pos = h_mat.inverted() @ wp
local_pos.y *= scale  # bone axis is Y in Blender bone-local
qm_pos = q_mat @ local_pos
```

### Issue 2: 外側 Body への push が弱い
**原因**: MIN_OFFSET=5mm では足りない、`find_nearest` が二重 body の内殻側を返すケースあり。

**対策**:
```python
MIN_OFFSET = 0.015  # 5mm → 15mm
# find_nearest 後、外向き ray cast で確実に外殻へ
ray_origin = new_wp
ray_dir = n_q  # 表面 normal の外向き
hit_loc, hit_n, _, _ = qm_bvh.ray_cast(ray_origin, ray_dir, dist=0.5)
if hit_loc and (hit_loc - new_wp).length > MIN_OFFSET:
    new_wp = hit_loc + hit_n * MIN_OFFSET
```

### Issue 3: cloth swing bone のフォールバック (Witch Skirt 用)
v18 にはあるが v16 にはない機能。Skirt の weights が `c_spine_01_bend.x` 1個に集約される問題は v16 で発生中。

→ **v16 にも physics fallback を移植** すれば、Skirt のスカート bone がアニメで揺れるようになる。

### v18 修正後の検証手順
```bash
# 修正版 fit_helena_to_qm_v18.py を作成 (v18b 命名推奨)
BL="/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
"$BL" --background "E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend" \
  --python scripts/blender/fitting/fit_helena_to_qm_v18b.py -- \
  "E:/Helena_Douglas_1.10.blend" "Body" "Helena Default - Dress" \
  "Queen Marika Body" "QueenMarika_rig" \
  "E:/MOdel/Helena_to_QM_default_v18b.blend"

# voxelize → align は既存スクリプトのまま
```

判定指標:
- POST-fit inside % が v18 (0.6%) と同等以下
- ビューアで前腕に浮遊なし
- Body 突き抜けなし
- Skirt の weights が複数 cloth bone に分散

## 主要ファイル

### Fit スクリプト
- `scripts/blender/fitting/fit_helena_to_qm_v16.py` - **現行採用**
- `scripts/blender/fitting/fit_helena_to_qm_v18.py` - bone-local LBS (将来修正対象)

### Voxelize / Align
- `scripts/blender/voxelize/voxelize_mustardui.py` - Mesh → voxel
- `scripts/blender/voxelize/align_clothing_by_layer.py` - Voxel post-processing (push to safe_external)

### Pipeline
- `config/clothing_pipeline.json` - 6 衣装 + 4 preset 登録済み
- `scripts/blender/clothing_pipeline.py` - Orchestrator

## 環境メモ

- Blender: `/c/Program Files/Blender Foundation/Blender 5.0/blender.exe`
- Python: `/c/Program Files/Blender Foundation/Blender 5.0/5.0/python/bin/python.exe`
- Source blend: `E:/Helena_Douglas_1.10.blend`
- Target blend: `E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend`
- E ドライブは外付け、PC 起動後に再マウント確認必要
- Dev server: localhost:3001
