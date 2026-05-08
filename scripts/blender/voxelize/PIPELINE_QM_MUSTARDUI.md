# PIPELINE: MustardUI/ARP モデルの Voxel 化 + Web 表示パイプライン

QueenMarika MustardUI モデルを `voxelize_mustardui.py` でベイクし、
`qm-mustardui-preview` ページで MustardUI スライダー相当を再現するまでの完全手順。
他モデル (DarkElfBlader 等) でも同じ流れで適用可能。

最終更新: 2026-05-04 (Phase 1〜3-A 完了時点)

---

## 0. 前提環境

- Blender: `C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`
- 出力先: `C:\Users\user\developsecond\contactform\public\box5\<model_id>\`
- 表示ページ: `src/app/qm-mustardui-preview/page.tsx` (URL: `/qm-mustardui-preview`)
- VOX_BASE: `/api/vox/...` 経由ではなく **静的 `/box5/...`** 直接読み (preview ページの場合)

---

## 1. Blender ファイル調査 (どんなメッシュ・マテリアル・スライダーがあるか)

### 1-1. 全体 inspect (メッシュ / カスタムプロパティ / MustardUI 検出)

```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background "<blend_path>" \
  --python "scripts/blender/inspect/inspect_mustardui_overview.py" 2>&1 | tee inspect_overview.log
```

確認すべき項目:
- `=== ALL OBJECTS ===` の MESH 一覧 (cs_*, cage- 除く) → Body / Hair / Eyes / 衣装パーツの正式名称
- `[BodyCandidate] ...` の `Materials:` → Body メッシュの material 名 (例: `QueenMarika_Body`, `QueenMarika_Head`)
- `--- Custom properties on Armatures ---` → MustardUI Body エフェクト (Tatoos / Cracked / Wet / Emission / Blush) と現在値
- `--- Search for target effect keys anywhere ---` → エフェクトキー所在
- `--- Drivers referencing target keys ---` → どの material がどのエフェクトを参照しているか

### 1-2. Body 内蔵パーツ (口腔/歯/舌) の vertex group 検索

```bash
"...blender.exe" --background "<blend_path>" \
  --python "scripts/blender/inspect/inspect_qm_body_internals.py" 2>&1 | tee inspect_internals.log
```

> ⚠ `inspect_qm_body_internals.py` は `body = bpy.data.objects.get('Queen Marika Body')` を **hardcode**。
> 他モデルではスクリプト冒頭の `'Queen Marika Body'` を該当 body オブジェクト名に書き換えるか、
> 引数化を行うこと。

確認:
- `=== Queen Marika Body: 181 vertex groups ===` で `<<< jaw/lip/teeth/cheek` マーク付き → 内蔵 vg リスト作成
- `Shape Keys` で `jawOpen`, `tongueOut` 等が 0 になっているか (ARKit 風 facial blendshape)

### 1-3. その他の inspect スクリプト (NOTES_MUSTARDUI_EFFECTS.md セクション 5 参照)

| スクリプト | 用途 |
|---|---|
| `inspect_mustardui_emission_trace.py` | Emission/Tatoos/Cracked/Wet/Blush 各 Value ノードの downstream 追跡 |
| `inspect_mustardui_emission_inputs.py` | Body/Head/Necklace の Principled BSDF Emission 入力 |
| `inspect_mustardui_effects.py` | 各エフェクトの Mix ノード + Body/Head の全 Image Texture 一覧 |
| `inspect_mustardui_customprops.py` | MustardUI_CustomProperties / Outfit を全件型付きで列挙 |
| `inspect_mustardui_texnum.py` | Texture Number ドライバ + Dress 系色バリアント検索 |

---

## 2. Voxelize (Body)

### 2-1. 必要オプション

| オプション | 用途 | 例 |
|---|---|---|
| `--scale-factor 3` | sub-grid 細粒化 (voxel_size 1/3) | shell の精度を上げる |
| `--no-interior` | Pass 2 (内部充填) skip | shell only、軽量化 |
| `--internal-vg "<patterns>"` | 内蔵パーツ検出 (fnmatch glob) | 口腔内の voxel face 描画 |
| `--internal-threshold 0.3` | 内蔵 vg 合計 weight 閾値 | default 0.3 |
| `--effect-bake <slot> <material> <image>` | エフェクトテクスチャベイク (複数可) | per-voxel rgba 出力 |

### 2-2. 重要: Cracked / Tatoos などのエフェクトは voxelize 時に **強制 0 リセット**される

`voxelize_mustardui.py` 起動時に以下が実行される (固定ロジック、無効化オプションなし):

```python
for _effect_key in ['Tatoos', 'Tattoos', 'Cracked', 'Wet', 'Emission', '放射', 'Blush']:
    arm['rig'][_effect_key] = 0.0
```

これにより Body BaseColor が Stone/Tattoo 等のバリアントに切り替わるのを防ぎ、
**素のベース色がベイクされる** (= Cracked=0 固定状態でのボクセル化)。

スライダー対応用の variant テクスチャは **`--effect-bake`** で別ファイルに出力する。

### 2-3. score_image 改善 (2026-05-04 適用済)

`find_texture_for_mat` の image 選択ロジック:

```python
# MustardUI バリアントテクスチャを penalize
if any(k in n for k in ['tattoo', 'tatoo', 'stone', 'cracked', 'wet', 'wetter',
                          'blush', 'emission', 'emissive',
                          '_red.', '_white.', '_red_', '_white_']):
    score -= 6
```

**素の `BaseColor` を優先選択** (`BaseColor_Tattoo` などのバリアントを後回し)。

### 2-4. QM 実行例

```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background "E:/MOdel/要確認モデル/QueenMarika_Rigged_MustardUI.blend" \
  --python "scripts/blender/voxelize/voxelize_mustardui.py" -- \
    "C:/Users/user/developsecond/contactform/public/box5/qm_mustardui" \
    "Queen Marika Body" body \
    --scale-factor 3 --no-interior \
    --internal-vg "c_lips_*,c_teeth_*,c_jawbone.x,jawbone.x,jaw_ret_bone.x" \
    --effect-bake blush_color    QueenMarika_Head QueenMarika_Head_BaseColor_Blush.tga \
    --effect-bake tattoo_color   QueenMarika_Body QueenMarika_Body_BaseColor_Tattoo.tga \
    --effect-bake tattoo_emissive QueenMarika_Body QueenMarika_Body_Tattoo_Emissive
```

### 2-5. 出力ファイル (body)

| ファイル | 内容 |
|---|---|
| `body.vox` (or `body_c1.vox` ... `body_cN.vox`) | voxel 本体。256 上限超えなら chunk 分割 |
| `body.grid.json` | sub-grid メタ + chunks 配列 |
| `body.weights.json` | per-voxel bone weights (max 4 bones) |
| `body.internal_voxels.json` | 内蔵 voxel sub-grid 座標 sparse 配列 |
| `body.<slot>.json` | per-voxel rgba sparse (各エフェクトベイク) |

---

## 3. Voxelize (衣装パーツ)

衣装は薄物がほとんどなので **`--no-interior` 推奨**。サブグリッド化は精度要求次第。

### 3-1. 衣装の effect bake (Texture Number 等)

Dress に Texture Number 切替 (3 プリセット) がある場合:

```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background "<blend>" \
  --python "scripts/blender/voxelize/voxelize_mustardui.py" -- \
    "<out_dir>" "Queen Marika Default - Dress" dress \
    --no-interior \
    --effect-bake dress_color_red   QueenMarika_Dress QueenMarika_Dress_BaseColor_Red.tga \
    --effect-bake dress_color_white QueenMarika_Dress QueenMarika_Dress_BaseColor_White.tga
```

注意: material 名は **mesh の material slot 名** を inspect で確認すること。
`QueenMarika_Default_Dress` のような mesh 名そのままを指定すると一致せず sample 0 件。

### 3-2. その他衣装 (Bra, Belt, Panties, Heels, Armband, Bracelet, Necklace, Circlet, etc.)

各 mesh を順次 voxelize。エフェクトなしなら `--effect-bake` 不要。

```bash
... -- "<out_dir>" "Queen Marika Default - Belt" belt --no-interior
... -- "<out_dir>" "Queen Marika Default - Panties" panties --no-interior
... -- "<out_dir>" "Queen Marika Default - Heels" heels --no-interior
```

---

## 4. Voxelize (Hair, Eyes)

### 4-1. Hair

```bash
... -- "<out_dir>" "Queen Marika Hair" hair --no-interior
```

### 4-2. Eyes

```bash
... -- "<out_dir>" "Queen Marika Eyes" eyes --scale-factor 4 --no-interior
```

eyes は小さいので **scale-factor 4 推奨** (細かさ確保)。

---

## 5. Web 表示ページの設定 (`qm-mustardui-preview` 拡張)

### 5-1. UI 表示パーツリスト (`PART_GROUPS`)

`src/app/qm-mustardui-preview/page.tsx:32-77` の `PART_GROUPS` を更新:

```ts
const PART_GROUPS: Array<{ group: string; parts: Array<{ key: string; label: string; color: string }> }> = [
  { group: 'Body & Face',
    parts: [
      { key: 'body',  label: 'Body',  color: '#faa' },
      { key: 'hair',  label: 'Hair',  color: '#fa8' },
      { key: 'eyes',  label: 'Eyes',  color: '#fff' },
    ],
  },
  { group: 'Default Outfit',
    parts: [ ... ],
  },
  ...
];
```

### 5-2. Effect slots per part (`EFFECT_SLOTS_PER_PART`)

各 part が持つエフェクト slot を定義:

```ts
const EFFECT_SLOTS_PER_PART: Record<string, string[]> = {
  body: ['blush_color', 'tattoo_color', 'tattoo_emissive'],
  dress: ['dress_color_red', 'dress_color_white'],
  // 他の variant がある衣装も追加
};
```

これに登録した part は body 同様 `<part>.<slot>.json` が読み込まれ、updatable mesh + 頂点色 lerp/swap が機能する。

### 5-3. UI スライダー / ラジオの追加

`<h3>MustardUI Effects</h3>` セクション内 (`page.tsx:610` 付近) に追加:

- **連続値 (0-1) のエフェクト** (Blush, Tattoo, Wet, Pressure 等):
  ```ts
  const [xxxSlider, setXxxSlider] = useState(0);
  // useEffect で頂点色 lerp 再計算
  // <input type="range" min={0} max={1} step={0.01} ... />
  ```
- **離散切替** (Texture Number 1/2/3 等):
  ```ts
  const [xxxNum, setXxxNum] = useState(1);
  // useEffect で頂点色 全置換
  // <input type="radio" name="xxx" ... />
  ```

実装パターンは `body` の Blush/Tattoo (lerp) と `dress` の Texture Number (置換) を参照。

### 5-4. updatable mesh

build loop (`page.tsx:432`) で:

```ts
// effect 持ち part (EFFECT_SLOTS_PER_PART に登録) は updatable=true
vd.applyToMesh(mesh, hasEffects);
```

これがないと `setVerticesData(VertexBuffer.ColorKind, ...)` が反映されない。

### 5-5. 内蔵パーツ用 oracle (body 専用)

`body.internal_voxels.json` を fetch → world center 配列に変換 → `buildExteriorOracle(...)` の第 4 引数に渡す。
これで閉じた口腔 cavity の内蔵 voxel face が描画される (preview で実装済 `page.tsx:268`)。

---

## 6. 動作確認チェックリスト

1. ハードリロード `Ctrl+Shift+R`
2. 初期表示: Body / Hair / Eyes のみ ON、ボーン非表示
3. **Body の素肌色** (Tattoo / Stone 重畳なし)
4. shell 内側透けが消えている (flood fill 効果)
5. **目位置** が顔の眼窩にぴったり収まる (preview の `subGridForwardMm` slider で微調整可)
6. **MustardUI Effects スライダー / ラジオ**:
   - Blush 0→1 で頬がピンクに
   - Tattoo Color 0→1 で体にタトゥー
   - Dress Texture Number 1/2/3 で dress 色切替 (※ Dress を ON にしてから)
7. コンソールに各 part の effect samples 読み込みログ
8. 各衣装パーツ ON で正常表示

---

## 7. 既知の制限 / スキップ項目

| 項目 | 状況 | 理由 |
|---|---|---|
| Tattoo Emissive (per-voxel emissive) | Phase 2-D スキップ | サブメッシュ分離 + Bloom + 専用 emissive material 必要、PoC 必要 |
| Cracked / Wet | Phase 2-E スキップ | StandardMaterial では Roughness や Normal 切替不可、PBRMaterial 全面切替必要 |
| Pressure / Bikini (shape key 連続切替) | Phase 3-B スキップ | runtime 連続切替には複数 shape key 値で multi-state baking 必要 |

これらは将来別フェーズで実装予定 (`NOTES_MUSTARDUI_EFFECTS.md` 参照)。

---

## 8. トラブルシューティング

### 8-1. Blender が Pass 2 中にクラッシュ (EXCEPTION_ACCESS_VIOLATION)

- 原因: メモリ不足 (500MB blend + テクスチャキャッシュで RAM 圧迫)
- 対策: 残留 Blender process を `Stop-Process -Name blender -Force` で kill、他の重いプロセス (node 等) を一時停止
- 衣装 mesh は `--no-interior` で Pass 2 を skip すれば軽量化

### 8-2. Effect bake で `0 samples / N total voxels`

- material 名が間違っている。`--effect-bake` の第 2 引数は **mesh の material slot 名** (例: `QueenMarika_Body`)、mesh 名 (`Queen Marika Body`) や object 名と異なるので inspect で確認

### 8-3. Body の色が Tattoo っぽい / Stone っぽい

- voxelize 時に Cracked/Tatoos エフェクトが ON だった可能性
- → 既に強制リセットロジックが入っているので発生しないはずだが、ログで `Reset MustardUI effect: Tatoos: 1.0 -> 0.0` 等を確認
- score_image でバリアントが選ばれている可能性 → ログの `Mat 'X': Y_BaseColor` で素の BaseColor が選ばれているか確認

### 8-4. スライダーを動かしても色が変わらない

- mesh が updatable でない (`vd.applyToMesh(mesh, true)` が必要)
- effect samples が読み込まれていない (コンソールで `loaded N samples` ログ確認)
- voxel index が一致しない (sub-grid origin の chunk offset 計算ミス)

---

## 9. 次回新モデルのテンプレート手順

1. `inspect_mustardui_overview.py` 実行 → mesh 名・material 名・MustardUI key 一覧を取得
2. `inspect_qm_body_internals.py` の hardcode 名を新 body 名に変更 → 実行 → 内蔵 vg リスト取得
3. 出力先フォルダ作成: `public/box5/<model_id>/`
4. body voxelize (`--scale-factor 3 --no-interior --internal-vg ... --effect-bake ...`)
5. eyes voxelize (`--scale-factor 4 --no-interior`)
6. hair, 衣装の voxelize (各 `--no-interior`)
7. 必要なら `--effect-bake` で variant テクスチャをベイク
8. `qm-mustardui-preview/page.tsx` の以下を更新:
   - `BASE` 定数 (`/box5/<model_id>`)
   - `PART_GROUPS` (新パーツ追加)
   - `EFFECT_SLOTS_PER_PART` (variant スロット追加)
   - `INSIDE_BODY_PARTS` (eyes 等)
   - `PART_FORWARD_OFFSET` (eyes 位置補正)
   - `<h3>MustardUI Effects</h3>` UI に新スライダー / ラジオ追加 + useEffect
9. ハードリロードで動作確認 (チェックリスト §6)
