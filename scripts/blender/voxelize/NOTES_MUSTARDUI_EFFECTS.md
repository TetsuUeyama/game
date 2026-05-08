# NOTES: MustardUI エフェクトのボクセル再現

`E:\MOdel\要確認モデル\QueenMarika_Rigged_MustardUI.blend` の MustardUI スライダーをボクセル側で再現するための調査メモと実装方針。

調査日: 2026-05-04 / Blender 5.0.1 でシェーダーノードを実機ダンプして確認済み。

---

## 1. MustardUI で動かせる項目（このリグでの全量）

### Body セクション「エフェクト」（5 つ、すべて FLOAT スライダー）

カスタムプロパティは Armature `rig` 上に格納されている。
保存場所: `bpy.data.armatures['rig']["<name>"]`

| スライダー | データパス | 影響先 | 仕組み |
|---|---|---|---|
| **Tatoos** | `armatures['rig']["Tatoos"]` | Body の Base Color と Emission Color | `BaseColor_Tattoo.tga` を肌にブレンド + `Tattoo_Emissive` を発光ブレンド |
| **Cracked** | `armatures['rig']["Cracked"]` | Body / Head / Hair の Base Color, Roughness, Normal, Emission | `Stone_*.tga` 系テクスチャに切り替え（石化＋ヒビ） |
| **Wet** | `armatures['rig']["Wet"]` | Body / Head の Roughness | `WetnessMix` ノードグループで `Roughness` ↔ `Roughness_Wet` ↔ `Roughness_Wetter` を補間 |
| **Emission（放射）** | `armatures['rig']["Emission"]` | Body / Head の Principled BSDF `Emission Strength` | 単独では効果なし。**Tatoos か Cracked が >0 のときのみ発光** |
| **Blush** | `armatures['rig']["Blush"]` | Head の Base Color | `Head_BaseColor` ↔ `Head_BaseColor_Blush.tga` をブレンド |

### Outfit セクション

| 項目 | スコープ | 種類 | 内容 |
|---|---|---|---|
| **Texture Number** | Default outfit (Dress) | Int (1〜3 想定) | Dress の Base Color を切替: `BaseColor` / `BaseColor_Red.tga` / `BaseColor_White.tga` |
| **Emission** | Default - Necklace | Float | Necklace の発光強度（`Dress_Emissive.tga` を Strength 倍率） |
| **Pressure** | Dress / Armband / Thigh Strap / Heels / Panties / Circlet | Float (0-1, FACTOR) | シェイプキー値（締め付け／圧着の度合い） |
| **Bikini** | Golden Bikini Bra | Float (0-1, FACTOR) | シェイプキー値（バリアント切替） |

### 色を直接 RGB で指定できる項目: **存在しない**

MustardUI の `MustardUI_CustomProperties` / `MustardUI_CustomPropertiesOutfit` を全件ダンプした結果、`is_color=True` や `subtype='COLOR'`、`array_length=3/4` の項目は **0 件**。

肌色やドレスの自由な色変更スライダーは無い。色変更は **Dress の "Texture Number" による 3 プリセット切替のみ**。

---

## 2. ボクセル側で必要な追加実装

対象: `scripts/blender/voxelize/voxelize_mustardui.py`（ベイク） + `src/app/qm-mustardui-preview/page.tsx`（実行時）

### 2.1 ベイクすべき追加テクスチャ

現在 `voxelize_mustardui.py` は `find_texture_for_mat(mat)` で **マテリアル 1 個につき 1 枚の Base Color テクスチャ** だけサンプリングしている。エフェクト再現のためには、同じ voxel の UV から **追加テクスチャも並行サンプル** して別ファイルに出力する必要がある。

| エフェクト | サンプルすべき画像 | 出力先（案） |
|---|---|---|
| Tatoo（色） | `QueenMarika_Body_BaseColor_Tattoo.tga` | `body.tattoo_color.json`（per-voxel `[r,g,b,a]`） |
| Tatoo（発光） | `QueenMarika_Body_Tattoo_Emissive` | `body.tattoo_emissive.json` |
| Blush | `QueenMarika_Head_BaseColor_Blush.tga` | `body.blush_color.json`（Head 部分の voxel のみ非ゼロ） |
| Texture Number=2 | `QueenMarika_Dress_BaseColor_Red.tga` | `dress.color_red.json` |
| Texture Number=3 | `QueenMarika_Dress_BaseColor_White.tga` | `dress.color_white.json` |

実装イメージ:
```
--effect-bake <slot_name> <image_name>
  例: --effect-bake tattoo_color QueenMarika_Body_BaseColor_Tattoo.tga
```
voxel ループ内で `sample_texture(image_name, u, v)` を追加で呼んで、結果を `<prefix>.<slot_name>.json` に書き出す。

### 2.1.1 実装済 (Phase 2-A, 2026-05-04)

`voxelize_mustardui.py` に以下追加:
- `--internal-vg <patterns>` (fnmatch glob、カンマ区切り) → 内蔵パーツ判定 → `<prefix>.internal_voxels.json` 出力 (sub-grid 座標 sparse 配列)
- `--internal-threshold <float>` (default 0.3)
- `--effect-bake <slot> <material> <image>` (複数指定可) → 該当 material UV から RGBA サンプル → `<prefix>.<slot>.json` 出力 (sub-grid 座標 + RGBA sparse 配列)
- 起動時に MustardUI Body エフェクト (Tatoos/Cracked/Wet/Emission/Blush) を **全て 0 に強制リセット** → 動的色変化を防止
- `score_image` を改修: バリアントテクスチャ (Tattoo/Stone/Blush/Wet/Cracked/Emissive 等) を penalize して **素の BaseColor を優先選択**

実例 (QM body):
```
--internal-vg "c_lips_*,c_teeth_*,c_jawbone.x,jawbone.x,jaw_ret_bone.x"
--effect-bake blush_color QueenMarika_Head QueenMarika_Head_BaseColor_Blush.tga
--effect-bake tattoo_color QueenMarika_Body QueenMarika_Body_BaseColor_Tattoo.tga
--effect-bake tattoo_emissive QueenMarika_Body QueenMarika_Body_Tattoo_Emissive
```

### 2.1.2 viewer 側 (Phase 1-X, Phase 2-C)

`vox-mesh.ts:buildExteriorOracle` に `internalVoxelWorldCenters` 追加 → 内蔵 voxel 隣接 cell を exterior seed → 閉じた口腔 cavity 描画

`qm-mustardui-preview/page.tsx` body 構築:
- `partGrid.grid_origin` から chunk オフセット計算 → 各 vertex の sub-grid 座標 (Int32Array) を ref 保存
- base colors (Float32Array) を ref 保存
- `vd.applyToMesh(mesh, true)` で updatable buffer に
- Blush/Tattoo slider useEffect で頂点色 lerp 再計算 → `mesh.setVerticesData(VertexBuffer.ColorKind, newColors, true)`

### 2.2 実行時（Babylon 側）の合成

ボクセルのレンダリングは `MeshBuilder` で頂点色を持つ単一メッシュにしているので（`page.tsx` 参照）、スライダー変更時に **頂点色配列を再計算 → setVerticesData** で差し替えれば反映できるはず。

```ts
// 例（Tatoo / Blush / Dress 色切替）
const baseR = baseColors[i].r;
const tatR  = tattooColors[i]?.r ?? baseR;
const tatA  = tattooColors[i]?.a ?? 0;  // タトゥー部分のマスクとして使う
const r = baseR * (1 - tatSlider * tatA) + tatR * (tatSlider * tatA);
```

### 2.3 エフェクト別の再現性評価

| エフェクト | 再現可否 | 備考 |
|---|---|---|
| **Tatoo（色）** | ◎ | UV サンプル → 頂点色 lerp。実装は素直 |
| **Tatoo（発光）** | △ | 現状の StandardMaterial では per-voxel emissive が直接出ない。タトゥー部分のボクセルを別サブメッシュ化＋専用 emissive マテリアル＋Bloom が必要 |
| **Wet** | × | 効果が Roughness のみ → StandardMaterial では再現不可。色を暗めにする近似はできるが本物ではない。**PBRMaterial への切替を検討する場合のみ実装意義あり** |
| **Blush** | ◎ | Head 部分の voxel に blush color を lerp で乗せるだけ |
| **Cracked** | △ | 影響範囲が広い（色・法線・発光すべて差し替わる）。色差し替えだけなら Tatoo と同方式で可。法線変化や Stone 化の質感まで出すには複数チャンネル対応が必要 |
| **Emission（単独）** | △ | Tatoo/Cracked と組み合わせて使うブースター。発光と一緒に実装すれば自然に使える |
| **Texture Number（Dress 色）** | ◎ | 3 プリセットの色配列を切替えるだけ |

### 2.4 想定される注意点（要検証）

- **解像度の壁**: 現状 `RESOLUTION=250` だと細いタトゥー線は 1 voxel に収まらず潰れる可能性。タトゥー再現を優先するなら Body だけサブグリッド化や解像度引き上げを検討
- **per-voxel emissive 実装の動作確認は未実施**: サブメッシュ分割＋Bloom が綺麗に動く保証はないため、実装前に最小 PoC が必要
- **データ量**: per-voxel の追加色配列は voxel 数 × 4byte 程度。body voxel 数次第だがおそらく数十〜数百 KB 級。問題ない見込みだが要確認

---

## 3. 実装着手の推奨順

リスクと工数を踏まえた順序：

1. **Blush**（Head のみ・色 lerp のみ・小スコープで頂点色差し替えパスを確立）
2. **Texture Number / Dress 色切替**（プリセット切替なので lerp 不要、最も簡単）
3. **Tatoo（色）**（同じパターンの拡張）
4. **Tatoo（発光）**（emissive サブメッシュ＋Bloom の実装パスを開拓）
5. **Cracked / Wet**（影響範囲大／材質根本変更が必要なため後回し）

---

## 4. 参考: 確認済み事実（再調査時のショートカット）

- スライダー値の保存先は **Armature `rig` 上のカスタムプロパティ**（Object ではない点に注意）
- マテリアル側は `bpy.data.materials['QueenMarika_*'].node_tree.animation_data.drivers` 経由で `armatures['rig']["<name>"]` を参照
- Body マテリアルの BaseColor 終端は `Mix.008`、Emission Color 終端は `Mix.002`
- Head マテリアルの BaseColor 終端は `Mix.007`、Emission Color 終端は `Mix.006`
- Wet 用ノードグループは `WetnessMix`（`Default` / `Wet` / `Wetter` の 3 入力を `Fac` で補間）

---

## 5. 調査用スクリプト

このメモの内容は実機でシェーダーノードを Python ダンプして確認した結果。同じ調査を別モデルでも再現できるよう、スクリプト一式は `scripts/blender/inspect/` に配置済み。

実行例:
```
"C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" -b <blend_path> \
  -P scripts/blender/inspect/inspect_mustardui_overview.py
```

| スクリプト | 用途 |
|---|---|
| `inspect_mustardui_overview.py` | Object/Armature/Mesh の全カスタムプロパティ列挙、MustardUI 検出、Body メッシュのモディファイア／マテリアル一覧、エフェクトキー（Tatoos/Cracked/Wet/Emission/Blush）の所在検索、ドライバ参照の検出 |
| `inspect_mustardui_emission_trace.py` | 指定マテリアルの Emission/Tatoos/Cracked/Wet/Blush 各 Value ノードから downstream をたどってシェーダー終端まで表示。NodeGroup 内部もダンプ |
| `inspect_mustardui_emission_inputs.py` | Body/Head/Dress_Necklace の Principled BSDF の Emission Color/Strength 入力と、Mix.002（Body）/Mix.006（Head）の A/B 入力（接続テクスチャ含む）を表示 |
| `inspect_mustardui_effects.py` | Tatoos / Wet / Blush の各チェーンに含まれる Mix ノードと WetnessMix グループの内部リンク、Body/Head の全 Image Texture 一覧を表示 |
| `inspect_mustardui_customprops.py` | Armature の MustardUI_CustomProperties / MustardUI_CustomPropertiesOutfit を全件型付きで列挙し、`is_color`/`subtype='COLOR'`/`array_length=3,4` の **色プロパティ存在チェック** を実施 |
| `inspect_mustardui_texnum.py` | `Texture Number` カスタムプロパティを参照しているドライバを全マテリアルから検索し、Dress 系マテリアルに含まれる色バリアントテクスチャを列挙 |
| `inspect_qm_body_internals.py` | QM Body の vertex group / shape key / material face count + 口腔関連 (jaw/tongue/teeth/lips/cheek/mouth) キーワード検索。内蔵パーツ識別用 |

対象 .blend ファイル例: `E:\MOdel\要確認モデル\QueenMarika_Rigged_MustardUI.blend`（500MB、ロードに数分）

ハードコード箇所: `inspect_mustardui_emission_*.py` と `inspect_mustardui_effects.py` はマテリアル名 `QueenMarika_Body` / `QueenMarika_Head` / `QueenMarika_Dress_Necklace` を直書き。別モデルで使う場合は冒頭の定数を書き換える必要あり。
