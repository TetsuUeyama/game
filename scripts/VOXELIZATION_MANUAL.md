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
| 顔パーツ | 細分化して取り替え可能に | eyes, ears, nose, mouth |
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

## 顔パーツの追加・変更

### 新しい顔パーツを作成する場合

1. **抽出**: `split_body_parts.js` のロジックで顔領域からパーツを抽出
   - 目: 非肌色ボクセル（色ベース抽出）
   - 耳: 頭部幅からの突出（形状ベース抽出）
   - 鼻: 前面突出層（形状ベース抽出）
   - 口: 非肌色ボクセル（色ベース抽出）

2. **ベースBody更新**: 抽出した位置を肌色で埋める（穴を防ぐ）
   - `brightSkin` 色で埋め、周辺の暗い肌も明るくする

3. **細分化**: `subdivide_face_parts.js` で2x2x2に分割
   - 入力: `cyberpunk_elf_body_{part}.vox`（ローレゾ）
   - 出力: `cyberpunk_elf_body_{part}_x2.vox`（細分化済み）

4. **ビューア設定**: `BODY_PARTS_DEF` に登録
   - `scale: SCALE / 2`（細分化パーツは半分のスケール）
   - `offset: FACE_FLOAT`（Zファイティング防止の浮かせオフセット）

### 顔パーツ関連の閾値（CE Body基準）

```
耳:  z=85〜93, x<33（左耳） or x>47（右耳）
目:  z=86〜92, y<=7, x=31〜49, 非肌色
鼻:  z=84〜87, y<=4, x=37〜43, 前面2層
口:  z=80〜84, y<=6, x=35〜45, 非肌色
```

### 肌色判定（CE Body）

```javascript
// 暖色系肌色
function isSkinColor(c) {
  const { r, g, b } = palette[c - 1];
  return r >= 150 && g >= 110 && b >= 90 && (r - b) >= 15 && (r - g) <= 60;
}
```

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
| `split_body_parts.js` | CE Body → base + 顔パーツ分離 |
| `subdivide_face_parts.js` | 顔パーツの2x2x2細分化 |
| `remap_shared_body.js` | CE Body → 別キャラgrid位置合わせ |
| `fix_leotard.js` | 衣装のBody干渉修正（テンプレート） |
| `generateVoxParts.js` | パーツ生成ユーティリティ |
| `generateVoxHQ.js` | 高品質パーツ生成 |

### 作業フロー別スクリプト使用順
```
新モデル追加:
  blender_export_mesh.py → voxelize_from_mesh.js → fix_leotard.js → ビューア登録

顔パーツ作成:
  split_body_parts.js → subdivide_face_parts.js → ビューア登録

衣装修正（めり込み修正）:
  fix_leotard.js（パラメータ変更して再実行）

別キャラにBody共有:
  remap_shared_body.js
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
2. **めり込み禁止**: 衣装ボクセルはBodyボクセルと同じ位置に配置しない
3. **1パーツずつ処理**: 作成→確認→修正→次のパーツ の順で進める
4. **位置合わせはtranslation only**: Bodyのサイズは変えない（拡大縮小禁止）
5. **顔パーツは浮かせる**: `FACE_FLOAT = [0, 0, 0.004]` でZファイティング防止
6. **パレット色は保持**: 細分化は元の色をそのまま使う（再ボクセル化しない）

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
