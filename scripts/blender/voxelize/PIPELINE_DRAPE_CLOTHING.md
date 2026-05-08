# Drape Clothing Pipeline (Cylindrical Silhouette Projection)

体から離れて drape する衣類（skirt, cape, robe, dress 下半身）用のパイプライン。
Helena Witch Skirt で確立 (2026-04-28)。

## 適用対象

- Skirt（ロング/ショート/フレア問わず）
- Cape, robe, hooded outer garment
- Dress 下半身（drape する部分）

## 適用しない対象

- 体に密着する衣類 → `PIPELINE_BODY_TIGHT_CLOTHING.md` を使う
- 装飾品（jewelry, belt buckle 等の固体）→ direct voxelize

## 設計思想

衣装の「体からの相対位置」を **円柱座標で抽出** し、体形差を吸収して QM 体に投影。
fit & deflate 方式と異なり、**生成的アプローチ** で drape 形状を完全保存する。

```
[Helena native voxel] (body + cloth)
        ↓
   per-Z 重心と per-(Z, angle) torso radius を計算（腕・手は除外）
        ↓
   各 Helena 衣装 voxel から (z, angle, body 軸からの offset) を抽出
        ↓
   World Z を Helena→QM に線形マップ (body bbox 基準)
        ↓
   QM body の対応 (z, angle) における torso radius を取得
        ↓
   QM voxel = (qm_body_radius + offset, angle, qm_z)
        ↓
[QM space drape voxel]
```

## パイプライン構成

### Phase 1: Helena 元空間で voxelize

`scripts/blender/voxelize/voxelize_helena_native.py`

Helena .blend を開いて Body と衣装を同一グリッドで surface voxelize。

```bash
"C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background "E:/Helena_Douglas_1.10.blend" \
  --python scripts/blender/voxelize/voxelize_helena_native.py -- \
  "Body" "<helena_cloth_name>" \
  "tmp/helena_native" "<prefix>" 0.01
# voxel_size = 0.01m (10mm) — Helena bbox を 256 voxel format に収めるため
```

出力:
- `tmp/helena_native/<prefix>_body.vox`
- `tmp/helena_native/<prefix>_cloth.vox`
- `tmp/helena_native/<prefix>_grid.json`

### Phase 2: 円柱投影

`scripts/blender/voxelize/project_drape_cylindrical.py`

Helena 衣装を Helena→QM に円柱投影。腕/手 は size-ratio フィルタで除外して torso radius を正確化。

```bash
python scripts/blender/voxelize/project_drape_cylindrical.py \
  tmp/helena_native <prefix> \
  public/box5/qm_mustardui body <qm_out_prefix> [<n_angle_bins>]
# n_angle_bins: 円周方向ビン数 (default 24)
```

出力:
- `public/box5/qm_mustardui/<qm_out_prefix>.vox`
- `public/box5/qm_mustardui/<qm_out_prefix>.weights.json` (uniform c_spine_01_bend.x weight)

## Helena Witch Skirt の実行例

```bash
# Phase 1
"C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background "E:/Helena_Douglas_1.10.blend" \
  --python scripts/blender/voxelize/voxelize_helena_native.py -- \
  "Body" "Helena Witch - Skirt" "tmp/helena_native" "witch_skirt" 0.01

# Phase 2
python scripts/blender/voxelize/project_drape_cylindrical.py \
  tmp/helena_native witch_skirt \
  public/box5/qm_mustardui body helena_witch_skirt
```

## チューニング指針

| 症状 | 対処 |
|---|---|
| 腕/手位置に voxel 生成 | size_ratio_threshold を 0.5 に上げて腕クラスター除外を強化 |
| 片足が削れた / 胸が削れた | size_ratio_threshold を 0.3 に下げてクラスター保持 |
| Drape が斜めに歪む | angular bin 数を 24 → 32 に増やして方向解像度を上げる |
| 腰の接続が緩い | Phase 1 voxel_size を 0.0085m 程度に縮小 (gz 256 制限内) |
| Voxel スカスカ | Phase 1 voxel_size 縮小 + Phase 2 N_SAMPLES（triangle sampling）増加 |
| 体に密着しすぎ | filter_torso_only の閾値調整、体形差吸収ロジック確認 |

## 重要な注意点

### 腕/手の除外

各 Z レイヤーで body voxel を 4-連結 connected components に分割し、
**最大 cluster サイズの 40% 以上の cluster のみ保持**。

これにより:
- 腕/手（torso より小さい cluster）→ 自動除外
- 両足（thigh Z で 2 つの同サイズ cluster）→ 両方維持
- 頭（cylindrical projection で関係する Z 範囲外）→ 影響なし

腕除外をしないと skirt voxel が「体半径 + offset」位置に生成されるが、
体半径が腕/手位置を含むため skirt が手先に飛び出す。

### Z mapping

Helena/QM の body bbox Z 範囲を線形マップ。skirt hem が body Z 下端を超える場合、
最近傍の body Z の centroid を使う（fallback）。

### 重み

現状一律 `c_spine_01_bend.x` weight 1.0。アニメーション対応には別途 cloth bone への
分散割り当てが必要（v18 fit の physics fallback ロジック移植が候補）。

## 適用結果（Helena Witch Skirt）

- 入力 Helena native: body 20,189 / cloth 10,995 voxels (0.01m grid)
- フィルタ後 body: 19,677（腕/手の 42 cluster 削除）
- 出力: **9,414 QM voxels**（dedup 込み）
- Skirt offset 分布: 0cm（waist）〜 44cm（hem）と自然な階調
- 視覚評価: ✅ OK（drape silhouette 保存、体形に自然フィット、手先誤生成なし）
