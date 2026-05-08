# Body-Tight Clothing Pipeline (Source-Distance-Aware Deflate)

体に密着する衣類（コルセット、ドレス上半身、armor 等）用のフィッティングパイプライン。
Helena Witch Corset で確立 (2026-04-28)。

## 適用対象

- 体に密着する設計の衣類（corset, bodice, fitted dress 上半身）
- 一部に drape 要素（peplum, ruffle, decoration）を含む衣類
- voxel ごとに「密着すべき」「drape すべき」を区別したい場合

## 適用しない対象

- 主に drape する衣類（skirt, cape, robe）→ 別パイプラインで対応
- 完全な loose fit（oversized hoodie 等）→ 別パイプラインで対応

## パイプライン構成

```
[Helena .blend] → fit (v16) → [Fit blend]
                                ↓
                              voxelize (existing)
                                ↓
                              align_clothing_by_layer (push out body)
                                ↓
              ★ ここから body-tight 用の追加処理 ★
                                ↓
        Phase 1: bake_source_distance.py (Blender)
                                ↓
        Phase 2: build_voxel_distance_map.py (Python)
                                ↓
        Phase 3: deflate_to_source_distance.py (Python)
                                ↓
                            完成 voxel
```

## スクリプト

### Phase 1: Source distance bake

`scripts/blender/voxelize/bake_source_distance.py`

Helena 元モデルで「衣類頂点 → Helena body」の距離を計算し、fit 結果 .blend で対応する QM-fitted 頂点位置を取得して JSON 出力。

```bash
"C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background "E:/MOdel/Helena_to_QM_<garment>.blend" \
  --python scripts/blender/voxelize/bake_source_distance.py -- \
  "E:/Helena_Douglas_1.10.blend" \
  "Body" \
  "<helena_dress_name>" \
  "<fit_dress_name (with suffix '(fit QM v16)')>" \
  "tmp/source_distance/<prefix>.json"
```

出力: `tmp/source_distance/<prefix>.json` — 頂点ごとの `helena_pos`, `qm_pos`, `source_distance`

### Phase 2: Per-voxel target distance map

`scripts/blender/voxelize/build_voxel_distance_map.py`

各 voxel について QM 空間で半径 R 内の fitted vertex を集め、逆距離重み付け平均で source_distance を割り当てる。R 内に vertex がない voxel は `target=None` で deflate 対象外（drape 領域保護）。

```bash
python build_voxel_distance_map.py public/box5/<voxel_dir> <prefix> tmp/source_distance/<prefix>.json [<R_voxels>]
# R_voxels: 半径（voxel単位）。デフォルト 3、recommended 6（~42mm）
```

出力: weights.json に `source_body_distance` (per voxel) と `source_body_distance_confidence` を追記

### Phase 3: Source-distance-aware deflate

`scripts/blender/voxelize/deflate_to_source_distance.py`

各 voxel を「QM body 表面 + source_body_distance」位置に radial に移動。
移動量を ±MAX_MOVE voxel にクランプ。除外 bone 指定で leg/arm 領域を保護可能。

```bash
python deflate_to_source_distance.py \
  public/box5/<voxel_dir> body <prefix> \
  [<MAX_MOVE>] [<exclude_bones_csv>] [<exclude_thresh>]

# MAX_MOVE: 最大移動量 voxel数 (default 5 = ~35mm)
# exclude_bones_csv: 除外 bone（カンマ区切り）。これらへの合計 weight が exclude_thresh を超える voxel は deflate しない
# exclude_thresh: weight 閾値 (default 0.3)
```

## Helena Witch Corset の実行例

```bash
# Phase 1
"C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background "E:/MOdel/Helena_to_QM_witch_corset.blend" \
  --python scripts/blender/voxelize/bake_source_distance.py -- \
  "E:/Helena_Douglas_1.10.blend" "Body" "Helena Witch - Corset" \
  "Helena Witch - Corset (fit QM v16)" \
  "tmp/source_distance/helena_witch_corset.json"

# Phase 2 (R=6 voxels)
python scripts/blender/voxelize/build_voxel_distance_map.py \
  public/box5/qm_mustardui helena_witch_corset \
  tmp/source_distance/helena_witch_corset.json 6

# Phase 3 (MAX_MOVE=5, exclude thigh bones)
python scripts/blender/voxelize/deflate_to_source_distance.py \
  public/box5/qm_mustardui body helena_witch_corset 5 \
  "c_thigh_stretch.l,c_thigh_stretch.r,c_thigh_twist.l,c_thigh_twist.r" 0.3
```

## チューニング指針

| 症状 | 対処 |
|---|---|
| 密着部位がまだ浮く | MAX_MOVE 拡大 (5 → 8 → 10) |
| Drape 部位が引っ張られた | R 縮小 (6 → 4)、または除外 bone 追加 |
| Leg 領域に密着（peplum 等） | thigh bone 群を除外 |
| Arm 領域に密着 | arm bone 群を除外 (`c_arm_stretch.l/r`, `c_forearm_stretch.l/r`) |
| 隙間 / dedup 損失大 | MAX_MOVE 縮小、R 縮小（移動量を抑える） |

## 適用結果（Helena Witch Corset）

- 入力: 25,807 voxels (preSrcDeflate state)
- Phase 1 bake: 4,891 vertices, 距離分布 0-1cm 59% / >5cm 4%
- Phase 2 (R=6): 14,645 voxels assigned (56.7%), 11,162 unassigned (drape protected)
- Phase 3 (MAX_MOVE=5, exclude thigh×4):
  - moved 8,802 / skipped drape 11,162 / skipped thigh 4,606
  - 出力: 22,596 voxels (dedup loss 12%)
- 視覚評価: ✅ OK（密着部位 tight、leg drape 保持）

## バックアップ命名規則

衣類 prefix の前に処理段階を付加:
- `<prefix>.preAlign.bak.vox` — fit + voxelize 直後（align 前）
- `<prefix>.preDeflate.bak.vox` — align 直後（旧 deflate 試行前）
- `<prefix>.preSrcDeflate.bak.vox` — align 直後 / source-distance deflate 前
