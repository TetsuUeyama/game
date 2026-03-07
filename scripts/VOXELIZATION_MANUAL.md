# ボクセル化マニュアル

新キャラクターの衣装・装飾・顔パーツをボクセル化してビューアに追加する手順書。

---

## 基本方針

- **Body（体）は共通**: `public/box2/cyberpunk_elf_body_base.vox`（CE Body）を全キャラで使用
- **顔パーツ**: ears/eyes/nose/mouth は細分化済み（x2）でトグル可能
- **衣装・装飾**: キャラごとに異なる。Bodyの外側に配置（めり込み禁止）
- **1パーツずつ処理**: まとめて作らず、リストに沿って1つずつ確認しながら進める

---

## パイプライン概要

```
Step 0: Blenderで中間データエクスポート（モデルごとに1回だけ）
Step 1: 中間データからメッシュ一覧を確認
Step 2: ユーザーがパーツリストを確認・分類
Step 3: 1パーツずつボクセル化（Node.jsのみ、Body干渉チェック付き）
Step 4: ビューアに登録
```

---

## Step 0: 中間データエクスポート（Blenderは1回だけ）

### なぜ中間エクスポートするか

| | Blender都度起動 | 中間エクスポート方式 |
|---|---|---|
| 起動時間 | 毎回数秒〜十数秒 | 初回1回だけ |
| パーツ個別処理 | 毎回Blender再起動 | Node.jsで即座に処理 |
| 試行錯誤（閾値調整等） | 遅い | 高速 |
| 必要なもの | Blender + FBX/Blend | JSON + テクスチャPNG |

**Blenderを毎回起動するのは非効率。**
モデルごとに1回だけBlenderで中間データ（三角形メッシュ + UV + テクスチャ）をエクスポートし、
以降の全処理（ボクセル化、Body干渉修正、細分化等）はNode.jsだけで行う。

### コマンド
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/blender_export_mesh.py \
  -- <入力ファイル.fbx or .blend> <出力ディレクトリ>
```

### 出力されるもの
- `{model_name}_meshdata.json` — 全パーツのメッシュデータ（三角形頂点 + UV + マテリアル）
- `{model_name}_textures/` — テクスチャ画像（PNG）
- `{model_name}_info.json` — バウンディングボックス、chibi変形パラメータ、パーツ一覧

### 中間データの構造（meshdata.json）
```json
{
  "parts": {
    "body": {
      "triangles": [
        {
          "v0": [x, y, z], "v1": [x, y, z], "v2": [x, y, z],
          "uv0": [u, v], "uv1": [u, v], "uv2": [u, v],
          "material": "mat_name"
        }
      ]
    },
    "leotard": { "triangles": [...] },
    "hair": { "triangles": [...] }
  },
  "materials": {
    "mat_name": {
      "texture": "texture_filename.png",
      "color": [r, g, b]
    }
  },
  "bbox": {
    "min": [x, y, z], "max": [x, y, z],
    "center": [x, y, z], "model_h": 1.234
  }
}
```

### エクスポート後の作業フロー
```
1. meshdata.json を確認 → パーツ一覧が出る
2. ユーザーがパーツを分類（Step 2）
3. Node.jsでボクセル化（Blender不要）
4. Body干渉修正（Node.js）
5. ビューア登録
```

**Blenderの再起動が必要になるケース:**
- 元モデルのメッシュ構造を変更した場合（Blender側でパーツ分割等）
- テクスチャの差し替え
- 上記以外の通常作業ではNode.jsのみで完結

---

## Step 1: パーツ一覧確認

### 従来方式（Blender直接ボクセル化 — 小規模モデルや初回テスト用）

```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/blender_voxelize.py \
  -- <入力ファイル.fbx or .blend> <出力ディレクトリ> 100
```

出力:
- `{model_name}.vox` — 全パーツ結合
- `{model_name}_{part}.vox` — パーツ別ファイル
- `{model_name}_parts.json` — パーツマニフェスト
- `{model_name}_grid.json` — グリッド情報（位置合わせ用）

### 中間データ方式（推奨 — 繰り返し作業用）

Step 0 で出力された `{model_name}_meshdata.json` を確認:
```bash
node -e "const d=require('./<出力dir>/<model>_meshdata.json'); console.log(Object.keys(d.parts).map(k => k + ': ' + d.parts[k].triangles.length + ' tris').join('\n'))"
```

### 確認すべき情報
- 各メッシュ名と三角形数（ボクセル化前の規模感）
- パーツの分類（body / 衣装 / 装飾 / 顔パーツ）
- bbox情報（Body位置合わせ用）

---

## Step 2: パーツリスト作成

分析結果をもとに、各パーツを以下のカテゴリに分類:

| カテゴリ | 説明 | 例 |
|---------|------|-----|
| body | 共通Body使用のため不要 | Body mesh |
| 耳 | モデルから抽出、細分化して切り替え可能 | ears |
| 顔（目・眉・口） | モデルから読み込み不要、ボクセルアートで手動作成 | face |
| 衣装（体表面沿い） | Bodyラインに沿って配置 | レオタード、ブーツ、手袋 |
| 衣装（自由形状） | 独自の形状を持つ | マント、翼、スカート |
| 装飾品 | Bodyの上に載せる | ネクタイ、肩パッド、ベルト |

### 衣装の配置タイプ

衣装をボクセル化する際、Bodyのどの部分に沿って配置するか指定する:

| 配置タイプ | 対象Body部位 | Z範囲（ボクセル座標） |
|-----------|-------------|---------------------|
| 全身 | Body全体 | z=0〜102 |
| 上半身 | 胴体+腕 | z=50〜80 |
| 下半身 | 脚 | z=0〜50 |
| 腕 | 両腕 | z=55〜75, x<30 or x>50 |
| 足 | 両脚 | z=0〜50 |
| 頭 | 頭部 | z=80〜102 |

---

## Step 3: パーツ個別ボクセル化

### 3-1. ボクセル化

#### 方式A: 中間データからNode.jsでボクセル化（推奨）

```bash
node scripts/voxelize_from_mesh.js <meshdata.json> <パーツ名> <出力.vox> [resolution]
```

- Blender不要、高速に試行錯誤可能
- 閾値やパラメータ調整時にBlender再起動が不要
- `meshdata.json` からパーツ名を指定して個別にボクセル化

#### 方式B: Blender直接ボクセル化（従来方式）

```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/blender_voxelize.py \
  -- <入力ファイル> public/<出力dir> 100
```

- 全パーツ一括で処理される
- 初回テストや小規模モデル向き

### 3-2. Body干渉チェック・修正

衣装がBodyにめり込まないよう修正する。`fix_leotard.js` をベースにしたロジック:

#### 原則
1. **Bodyボクセル位置をSetで保持**
2. **衣装ボクセルがBody内部にある場合** → Body表面の外側に押し出す
3. **Body表面の外側にシェルを生成** → 衣装がBody外側を覆う形にする

#### スクリプト: `fix_leotard.js` の仕組み

```
入力: 衣装.vox + body.vox
処理:
  1. Body全ボクセル位置をSetに登録
  2. 衣装ボクセルを分類:
     - Body外側にあるもの → そのまま保持
     - Body内部にあるもの → 除外
  3. Body表面ボクセル（空きセルと隣接するBody内ボクセル）に対して:
     - 衣装のZ/X範囲内にあれば、外側の空きセルに衣装ボクセルを追加
     - 色は最寄りの元衣装ボクセルから取得
出力: 修正済み衣装.vox
```

#### 新しい衣装用に fix_leotard.js を複製する場合の変更箇所

```javascript
// 変更が必要な箇所:
const DIR = 'public/<新しいディレクトリ>';
const PREFIX = '<モデル名>';

// 衣装の読み込み:
const leotard = readVox(path.join(BASE, DIR, `${PREFIX}_<パーツ名>.vox`));
const body = readVox(path.join(BASE, DIR, `${PREFIX}_body.vox`));

// 出力先:
const dstPath = path.join(BASE, DIR, `${PREFIX}_<パーツ名>.vox`);
```

### 3-3. 衣装のBody部位沿い配置

「足に沿ったズボン」「腕に沿った長袖」など、Bodyの特定部位に沿って配置する場合:

#### ロジック
1. Bodyボクセルを対象部位（Z範囲、X範囲）でフィルタリング
2. 対象部位の**表面ボクセル**（空きセルと隣接）を特定
3. 表面ボクセルの外側1〜2層に衣装ボクセルを生成
4. 色は元の衣装テクスチャまたは指定色から取得

```
例: ズボン（足に沿って配置）
  Body部位: z=0〜50（脚領域）
  表面検出: 各Body表面ボクセルの6方向隣接をチェック
  衣装生成: Body外側の空きセルに衣装色のボクセルを配置
  めり込み: Bodyボクセルと同じ位置には配置しない
```

---

## Step 4: ビューアに登録

### 4-1. パーツマニフェスト

`public/<dir>/<model>_parts.json` を作成/更新:

```json
[
  {
    "key": "armor",
    "file": "/box4/new_char_armor.vox",
    "voxels": 1234,
    "default_on": true
  },
  {
    "key": "cape",
    "file": "/box4/new_char_cape.vox",
    "voxels": 567,
    "default_on": true
  }
]
```

- `key`: パーツ識別子（英小文字、スネークケース）
- `file`: publicからの相対パス
- `voxels`: ボクセル数
- `default_on`: 初期表示するか

### 4-2. 顔パーツのバリアント登録

モデルに顔パーツ（eyes, ears, nose, mouth）がある場合、**衣装ではなく顔パーツバリアント**として登録する。
マニフェスト（parts.json）に `eyes` 等のキーがあっても、ビューアは自動的に衣装から除外し、Body Partsセクションで管理する。

`src/app/vox-viewer2/page.tsx` の `FACE_PARTS` にバリアントを追加:

```typescript
// FACE_PARTS 配列内の該当スロットに variants を追加
{
  key: 'eyes', label: 'Eyes',
  variants: [
    { source: 'CE', file: '/box2/cyberpunk_elf_body_eyes_x2.vox', scale: SCALE / 2, offset: FACE_FLOAT },
    { source: 'QM', file: '/box4/queenmarika_rigged_mustardui_eyes.vox', scale: SCALE, offset: [-0.002, -0.006, 0.011] },
    // ↓ 新キャラの目を追加
    { source: 'NEW', file: '/box5/newchar_eyes.vox', scale: SCALE, offset: [ox, oy, oz + 0.004] },
  ],
},
```

**ルール:**
- `source`: UIに表示される短いラベル（2〜3文字推奨）
- `offset`: キャラのgrid offset + FACE_FLOAT(0.004) を加算（Zファイティング防止）
- `scale`: CE細分化パーツは `SCALE/2`、通常ボクセル化パーツは `SCALE`
- マニフェストの `eyes` 等は残しておいてOK（ビューアが自動フィルタ）
- UIでは各スロット（Ears/Eyes/Nose/Mouth）ごとに CE / QM / OFF ボタンで切り替え

**新モデルに顔パーツがある場合の手順:**
1. Blenderボクセル化で `eyes` 等のパーツが出力される
2. `FACE_PARTS` の該当スロットに `variants` を追加
3. `offset` はそのキャラの衣装offset + 0.004（Z方向）

### 4-3. キャラクター設定追加

`src/app/vox-viewer2/page.tsx` の `CHARACTERS` に追加:

```typescript
const CHARACTERS: Record<string, CharacterConfig> = {
  cyberpunk: {
    label: 'CyberpunkElf',
    manifest: '/box2/cyberpunk_elf_parts.json',
    offset: [0, 0, 0],
  },
  priestess: {
    label: 'HighPriestess',
    manifest: '/box3-new/highpriestess_blender_rigged_parts.json',
    offset: [0.179, -0.022, -0.100],
  },
  // ↓ 新キャラ追加
  newchar: {
    label: 'NewCharacter',
    manifest: '/box4/new_char_parts.json',
    offset: [x, y, z],  // Step 4-3で計算
  },
};
```

### 4-4. offset計算

CE Bodyとのグリッド位置差分を計算する:

```javascript
// remap_shared_body.js の centroid計算ロジックを参照
// CE grid: public/box2-new/cyberpunkelf_grid.json
// 新キャラ grid: public/<dir>/<model>_grid.json

// offset = (CE body centroid) - (新キャラ body centroid) をビューア座標系で算出
// ビューア座標系: x = (vx - cx) * SCALE, y = vz * SCALE, z = -(vy - cy) * SCALE
```

---

## 顔パーツの方針

### 基本ルール

- **顔（目・眉・鼻・口）はモデルから読み込まない**。手動でボクセルアートとして作成する
- **耳のみモデルから読み込む**。耳はキャラごとに形状が異なるため、モデルから抽出して使用する
- **ベースBodyの顔は「のっぺらぼう」**（目・鼻・口なし）。顔パーツは体表面に貼り付ける形で配置する

### 耳の追加手順（モデルから読み込み）

1. **抽出**: `split_body_parts.js` のロジックで耳領域を抽出
   - 耳: 頭部幅からの突出（形状ベース抽出）
   - CE基準の閾値: z=85〜93, x<33（左耳） or x>47（右耳）

2. **細分化**: 2x2x2に分割してx2ボクセルを作成

3. **ビューア設定**: `BODY_PARTS` の `ears` スロットにバリアントを追加
   - `scale: SCALE / 2`（細分化パーツ）
   - `offset: FACE_FLOAT`

### 顔パーツの作成手順（ボクセルアート）

顔の目・眉・口はPNG参照写真をもとに `scripts/create_face_voxels.js` で手動デザインする。

#### 仕組み

1. CE体の前面サーフェスY座標を読み取る（各(x,z)の最小Y = 前面表面）
2. 顔の中心X座標は体の顔領域（x=33〜47）の中点から算出
3. パターン文字列で対称的にボクセルを配置（中心から外側への記法）
4. 体表面の1ピクセル手前（surfaceY - 1）に1層のみ配置

#### パターン記法

- `drawSymRow(z_body, z_sub, pattern, charMap)`: 顔中心で左右対称にミラー
  - i=0 は中心ペア（cx2 と cx2-1）に配置
  - i=1以降は±方向に展開
  - 例: `'LLc'` → c,L,L,L,L,c（6px）

- `drawEyeRow(z_body, z_sub, eyeOffset, pattern, charMap)`: 左右の目それぞれの中心で内側ミラー
  - i=0 は各目の中心ピクセル
  - 例: `'PioWL'` → L,W,o,i,P,i,o,W,L（9px、瞳が中心）

- 手動配置: `featureVoxels.push({ x2, z2, color })` で非対称・特殊配置

#### 調整のポイント

- 位置（z_body値）で上下移動
- パターン文字数で幅調整
- 色はPALETTESオブジェクトで管理
- 角度付き配置は手動ループでz2にオフセットを加算

#### 出力設定

- グリッド: 170x68x204（CE x2グリッド、耳と同じ座標系）
- ビューア: `scale: SCALE / 2`, `offset: FACE_FLOAT`

### 新キャラの顔を追加する場合

1. PNG参照写真を `public/image/face/` に配置
2. `create_face_voxels.js` のPALETTESに新キャラの色を追加
3. パターンを調整（目の形、口の大きさ等）
4. `BODY_PARTS` の `face` スロットにバリアントを追加

---

## スクリプト一覧

### Blender（初回1回だけ実行）
| ファイル | 用途 |
|---------|------|
| `blender_export_mesh.py` | FBX/Blend → 中間データ（JSON+PNG）エクスポート **（推奨）** |
| `blender_voxelize.py` | FBX/Blend → .vox 全パーツ一括変換（従来方式） |
| `voxelize_body_only.py` | Body単体のボクセル化 |

### Node.js（繰り返し実行・試行錯誤用）
| ファイル | 用途 |
|---------|------|
| `voxelize_from_mesh.js` | 中間データ → パーツ個別ボクセル化 **（推奨）** |
| `split_body_parts.js` | CE Body → base + 耳抽出 |
| `subdivide_face_parts.js` | 耳パーツの2x2x2細分化 |
| `create_face_voxels.js` | 顔ボクセルアート作成（目・眉・口をCE体表面に配置） |
| `remap_shared_body.js` | CE Body → 別キャラgrid位置合わせ |
| `fix_leotard.js` | 衣装のBody干渉修正（テンプレート） |
| `shift_parts_de.js` | パーツ位置シフト（オリジナルからシフト、累積しない） |
| `dilate_parts_de.js` | 体を覆うパーツの膨張+シフト（透け防止） |
| `shift_mask_de.js` | マスクの個別位置シフト |
| `fix_suit_bra_de.js` | suit_braのBody突起干渉解消 |
| `fix_hair_shape_de.js` | 髪の形状修正（crown拡大・前髪・細化・色調整・シフト） |
| `fix_clothing_de.js` | 衣装のBody干渉修正（DE用） |
| `generateVoxParts.js` | パーツ生成ユーティリティ |
| `generateVoxHQ.js` | 高品質パーツ生成 |

### 作業フロー別スクリプト使用順
```
新モデル追加（全パイプライン）:
  1. blender_voxelize.py（ボクセル化）
  2. remap_shared_body_XX.js（Body リマップ）
  3. dilate_parts_XX.js（衣装膨張+シフト）
  4. shift_mask_XX.js等（個別パーツ位置調整）
  5. fix_suit_bra_XX.js等（突起干渉解消）
  6. fix_hair_shape_XX.js（髪の形状・色修正）
  7. ビューアで確認 → 問題あれば該当Stepに戻る

耳の追加:
  split_body_parts.js（耳のみ抽出） → subdivide（x2） → ビューア登録

顔パーツ作成（目・眉・口）:
  PNG参照写真を用意 → create_face_voxels.js でデザイン → ビューア登録

衣装修正（めり込み修正）:
  fix_leotard.js（パラメータ変更して再実行）

別キャラにBody共有:
  remap_shared_body.js

Blender再ボクセル化後:
  originals/ が上書きされるため、後処理パイプライン全体（Step 1〜6）を再実行
```

**注意**: `blender_export_mesh.py` と `voxelize_from_mesh.js` は今後作成予定。
作成されるまでは `blender_voxelize.py`（従来方式）を使用する。

---

## ディレクトリ構造

```
public/
├── box2/                          # CE（CyberpunkElf）ローレゾ
│   ├── cyberpunk_elf_body.vox         # 元Body（分離前）
│   ├── cyberpunk_elf_body_base.vox    # Body本体（肌色穴埋め済み）
│   ├── cyberpunk_elf_body_ears.vox    # 耳（ローレゾ）
│   ├── cyberpunk_elf_body_ears_x2.vox # 耳（細分化済み）
│   ├── cyberpunk_elf_body_eyes.vox    # 目（ローレゾ）
│   ├── cyberpunk_elf_body_eyes_x2.vox # 目（細分化済み）
│   ├── cyberpunk_elf_body_nose.vox    # 鼻（ローレゾ）
│   ├── cyberpunk_elf_body_nose_x2.vox # 鼻（細分化済み）
│   ├── cyberpunk_elf_body_mouth.vox   # 口（ローレゾ）
│   ├── cyberpunk_elf_body_mouth_x2.vox# 口（細分化済み）
│   └── cyberpunk_elf_parts.json       # CEパーツマニフェスト
├── box2-new/                      # CE 新ボクセル化（grid.json あり）
├── box3-new/                      # HP（HighPriestess）
│   ├── highpriestess_blender_rigged_body.vox
│   ├── highpriestess_blender_rigged_leotard.vox
│   └── highpriestess_blender_rigged_parts.json
└── box4/ (例)                     # 新キャラ出力先
```

---

## 重要ルール

1. **Bodyは変更しない**: `cyberpunk_elf_body_base.vox` は全キャラ共通の基盤
2. **着衣優先**: 衣装とBodyが重なる箇所は衣装を優先表示する（ビューアで `clothingMat.zOffset = -2` を使用）
3. **1パーツずつ処理**: 作成→確認→修正→次のパーツ の順で進める
4. **位置合わせはtranslation only**: Bodyのサイズは変えない（拡大縮小禁止）
5. **顔パーツは浮かせる**: `FACE_FLOAT = [0, 0, 0.004]` でZファイティング防止
6. **パレット色は保持**: 細分化は元の色をそのまま使う（再ボクセル化しない）

---

## パーツ後処理（ボクセル化後の必須手順）

ボクセル化直後のパーツはBodyとの位置ずれや透け問題があるため、以下の後処理パイプラインを**必ず順番通り**実行する。

### ビューア座標系（全後処理の前提知識）

```
voxel → viewer 変換:
  viewer_x = (voxel.x - cx) * scale
  viewer_y = voxel.z * scale      ← Z増加 = 上、Z減少 = 下
  viewer_z = -(voxel.y - cy) * scale  ← Y増加 = 後ろ（奥）、Y減少 = 前（手前）

スクリプト引数の意味:
  dz: Z方向シフト (- = 下, + = 上)
  dy: Y方向シフト (+ = 後ろ, - = 前)
```

### originals/ バックアップシステム

後処理スクリプトは**常に `originals/` ディレクトリから元データを読み込む**。
これにより何度実行しても変換が累積しない。

```
初回実行時:
  originals/ に元ファイルがなければ、現在のファイルを自動バックアップ
  → originals/ から読み込み → 処理 → 出力先（元の場所）に書き出し

やり直し:
  originals/ のファイルはそのまま → スクリプト再実行で上書き
```

**重要**: Blenderで再ボクセル化した場合、originals/ も上書きされるため、後処理パイプライン全体を再実行する必要がある。

---

### 後処理パイプライン（実行順序）

```
Step 1: Body リマップ（CE Body → キャラgrid）
Step 2: 衣装パーツの膨張 + 位置シフト
Step 3: マスク等の個別位置シフト
Step 4: 突起干渉の解消（suit_bra等）
Step 5: 髪の形状修正・色調整・位置シフト
Step 6: ビューアで目視確認 → 問題あれば該当Stepに戻る
```

---

### Step 1: Body リマップ

CE Body を新キャラのグリッドに合わせてリマップする。

```bash
node scripts/remap_shared_body_de.js
```

パラメータ（remap_shared_body_de.js内）:
- `BODY_EXTRA_Y` / `BODY_EXTRA_Z`: 体幹・腕・脚の位置オフセット
- `HEAD_EXTRA_Y` / `HEAD_EXTRA_Z`: 頭部の位置オフセット
- `NECK_Z` / `HEAD_Z`: 首→頭の遷移ゾーン

---

### Step 2: 衣装パーツの膨張 + 位置シフト

#### なぜ膨張が必要か

衣装パーツはBodyにジャストフィットする形で作成されるが、Bodyと重なる箇所でBodyが表示されてしまう（透け問題）。解決策:
1. **着衣優先レンダリング**: `clothingMat.zOffset = -2` で衣装をBody手前に描画
2. **パーツ膨張**: 角度によっては1ボクセルの隙間から透けるため、パーツ自体を膨張させる

#### 膨張対象の分類

| カテゴリ | 対象パーツ例 | 処理 |
|---------|------------|------|
| 体を覆うパーツ | suit, suit_bra, suit_plates, arms, legs, shoulders, shoulders_clavice | 膨張 + シフト |
| 自由形状パーツ | belt_inner, belt_outer, belt_cape, belt_scabbards, cape | シフトのみ |

#### 膨張パラメータ

```
体を覆うパーツ:
  第1パス: 6方向（±X, ±Y, ±Z）に1ボクセル膨張
  第2パス: Y方向のみさらに1ボクセル膨張
  → 合計: XZ方向+1, Y方向+2
```

#### 実行コマンド

```bash
node scripts/dilate_parts_de.js <dz> [dy]
# 例: node scripts/dilate_parts_de.js -5 -1
```

#### 位置シフト値の決め方

1. まず `shift_parts_de.js` でシフトのみ適用し、ビューアで確認
2. 位置が合ったら同じ値で `dilate_parts_de.js` を実行
3. シフト値を1ずつ調整して微調整

```bash
# シフトのみで位置確認（膨張なし）
node scripts/shift_parts_de.js <dz> [dy]

# 位置確定後、膨張+シフト（本番）
node scripts/dilate_parts_de.js <dz> [dy]
```

---

### Step 3: マスク等の個別位置シフト

マスクなど衣装とは異なる位置調整が必要なパーツは個別スクリプトで処理する。

```bash
node scripts/shift_mask_de.js
# スクリプト内にシフト値をハードコード（DZ, DY）
```

---

### Step 4: 突起干渉の解消

suit_bra等でBodyの突起（胸部等）が衣装を貫通する場合、重なるボクセルをBodyの前面に押し出す。

```bash
node scripts/fix_suit_bra_de.js
```

```
処理ロジック:
1. Body全ボクセルのSetを構築
2. 衣装ボクセルがBodyと同じ位置にある場合:
   → Y方向に最大3ステップ前面（Y-1）に押し出し
   → Bodyと重ならない最初の空き位置に配置
3. 重複を排除して出力
```

---

### Step 5: 髪の形状修正・色調整

髪はボクセル化後に以下の修正が**ほぼ必ず必要**になる。

#### 5-1. 髪のボクセル化パラメータ

```python
# blender_voxelize.py 内
if 'hair' in key:
    part_voxels[key] = voxelize_layer(mesh_list, threshold_mult=3.0, head_scale_override=1.0)
```

**重要: `head_scale_override=1.0`（髪を頭部のチビデフォルメに合わせて拡大しない）**

理由:
- 頭部は1.5〜1.8倍にチビ拡大されるが、髪は**リアル頭身のままのサイズ**で配置する
- 髪を頭部と同じスケールで拡大すると太すぎる不自然な仕上がりになる
- 代わりに後処理で頭頂部のみX方向に拡大し、頭部を覆うようにする

#### 5-2. 髪の後処理（fix_hair_shape_de.js）

```bash
node scripts/fix_hair_shape_de.js
```

以下の処理を一括実行:

| 処理 | 内容 | パラメータ |
|------|------|----------|
| 頭頂部X拡大 | 頭頂（z>=80）の髪をX方向に拡大しチビ頭部を覆う | CROWN_SCALE_X = 1.5 |
| 遷移ゾーン | z=78-80で拡大率を1.0→1.5に線形補間 | CROWN_TRANSITION = 78 |
| 前髪生成 | おでこ前面に前髪を追加（Y方向手前に延長） | BANGS_Y_EXTEND = 7 |
| 垂れ髪の細化 | z<=65の垂れ髪から内部ボクセルを除去 | 4方向囲まれ+X幅5以上の内部を除去 |
| 左右垂れ髪の細化 | z=66-77の顔横の髪を薄くする | 外側2ボクセルのみ保持 |
| Y方向膨張 | 髪全体をY方向に±1ボクセル膨張 | 前後各1ボクセル |
| 色調整 | パレットを暗くする（バリエーション維持） | factor = 0.65 |
| Y+1シフト | 髪全体を後方にシフト | DY = 1 |

#### 5-3. 髪の調整ポイント

| 問題 | 対処 |
|------|------|
| 頭頂部が顔にめり込む | CROWN_SCALE_X を上げる（1.5 → 1.7等） |
| 前髪が足りない | BANGS_Y_EXTEND を増やす |
| 垂れ髪が太い | erosion条件を緩和（neighbors >= 3等） |
| 全体的にY方向が薄い | Y膨張パスを追加 |
| 色が明るすぎる/暗すぎる | factor を調整（0.5=暗い, 0.8=明るい） |
| 前後位置がずれている | DY を調整 |

---

### 後処理パイプライン実行例（DarkElfBlader）

```bash
# Step 1: Body リマップ
node scripts/remap_shared_body_de.js

# Step 2: 衣装膨張+シフト
node scripts/dilate_parts_de.js -5 -1

# Step 3: マスク個別シフト
node scripts/shift_mask_de.js

# Step 4: suit_bra突起干渉解消
node scripts/fix_suit_bra_de.js

# Step 5: 髪の形状修正・色調整
node scripts/fix_hair_shape_de.js

# Step 6: ブラウザで確認（Ctrl+Shift+R）
```

### DarkElfBlader の確定パラメータ

```
衣装膨張+シフト: node scripts/dilate_parts_de.js -5 -1
  - 体を覆うパーツ（7種）: 膨張(XZ+1, Y+2) + Z-5, Y-1
  - ベルト・ケープ等（5種）: Z-5, Y-1 のみ
マスク: Z-3, Y-1 シフト
suit_bra: 突起干渉解消処理あり
髪: head_scale=1.0, crown_scale=1.5x, bangs=7, color_factor=0.65, Y+1後方シフト, Y±1膨張
ビューアoffset: [-0.159, 0.017, -0.096]
```

---

### 新キャラ追加時のチェックリスト

後処理で以下を必ず確認すること:

- [ ] 衣装パーツがBodyにフィットしているか（位置シフト）
- [ ] 角度を変えて透けがないか（膨張 + clothingMat.zOffset）
- [ ] 突起部分（胸部等）で衣装が消えていないか（干渉解消）
- [ ] 髪が頭頂部を覆っているか（crown拡大）
- [ ] 前髪がおでこ前面にあるか（bangs生成）
- [ ] 髪の垂れ部分が太すぎないか（erosion）
- [ ] 髪の色がモデルの雰囲気に合っているか（パレット調整）
- [ ] マスク等の個別パーツの位置が正しいか

---

## Blenderパス

```
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
```

## モデルファイルの場所（既存）

```
CE: /c/Users/user/Downloads/CyberpunkElf.fbx
HP: /c/Users/user/Downloads/uploads_files_2600692_HighPriestess_Blender_Rigged.blend
```
