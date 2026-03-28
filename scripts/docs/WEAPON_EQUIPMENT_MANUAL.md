# 武器・防具ボクセル化マニュアル

3Dモデルから武器・防具を個別にボクセル化し、ゲームアセットとして使用可能にする手順書。

---

## 基本方針

- **1アイテム = 1ファイル**: 複数の武器・防具を1ファイルにまとめない。個々で独立して使用できるようにする
- **モデル付属品は個別抽出**: モデルに付属している武器・防具はモデル本体とは別に、個別にボクセル化する
- **複数形式対応**: GLB / FBX / Blend など、入力形式を問わず対応する
- **専用フォルダに格納**: 完成した武器・防具はカテゴリ別フォルダに整理して格納する

---

## 出力先ディレクトリ

```
game-assets/wapons/
├── swords/           # 剣
├── greatswords/      # 大剣
├── katanas/          # 刀
├── daggers/          # 短剣
├── rapiers/          # レイピア
├── axes/             # 斧
├── spears/           # 槍
├── halberds/         # 薙刀・ハルバード
├── scythes/          # 鎌
├── bows/             # 弓
├── guns/             # 銃
├── shields/          # 盾
├── hammers/          # ハンマー
├── wands/            # 杖
├── armor/            # 防具（鎧・兜等）
└── other/            # その他
```

各武器は **カテゴリ/武器名/** のサブフォルダに格納:
```
swords/
├── Iron_Sword/
│   ├── Iron_Sword.vox
│   └── grid.json
├── Fire_Blade/
│   ├── Fire_Blade.vox
│   └── grid.json
```

長い武器（槍・薙刀等）は分割:
```
spears/
├── Long_Spear/
│   ├── Long_Spear_handle.vox
│   ├── Long_Spear_blade.vox
│   ├── parts.json
│   └── grid.json
```

---

## ケース1: 独立した武器モデルからのボクセル化

武器単体のGLBファイルなど、モデルが武器そのものである場合。

### 手順

#### Step 1: モデルの確認

入力モデルの構造を確認する:
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/inspect_weapon_structure.py \
  -- <入力ファイル.glb>
```

確認事項:
- メッシュ名、マテリアル構成
- バウンディングボックス（サイズ感）
- テクスチャの有無

#### Step 2: ボクセル化

**通常の武器（256ボクセル以内に収まるもの）:**
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/voxelize_weapon.py \
  -- <入力ファイル.glb> <出力ディレクトリ> [voxel_size] [scale]
```

- `voxel_size`: デフォルト 0.007m（1ボクセル = 0.7cm）
- `scale`: オプション（0.5 = 半分のサイズ等）

**長い武器（256ボクセルを超えるもの）:**
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/voxelize_weapon_split.py \
  -- <入力ファイル.glb> <出力ディレクトリ> [voxel_size] [scale]
```

- 自動で柄（handle）と刃（blade）に分割
- マテリアル情報から分割点を自動検出
- 2ボクセルのオーバーラップで繋ぎ目を維持

#### Step 3: サイズ確認

```bash
node scripts/list_weapon_sizes.js
```

- グリッド寸法と物理サイズ（cm）を確認
- キャラクター身長（約179cm = 256ボクセル）との比率を確認
- 大きすぎる/小さすぎる場合は `scale` パラメータで再実行

#### Step 4: ビューアで目視確認

ブラウザのビューアで形状・色を確認し、問題があればパラメータを調整して再実行。

---

## ケース2: モデル付属の武器・防具を個別抽出してボクセル化

キャラクターモデルに武器・盾・兜などが付属している場合。

### 重要ルール

- **モデル本体のボクセル化とは完全に分離して作業する**
- **付属品が複数ある場合、それぞれを個別の.voxファイルとして作成する**
  - 例: 剣 + 盾 + 兜 が付属 → `sword.vox`, `shield.vox`, `helmet.vox` の3ファイル
- **理由: 1ファイルに複数アイテムをまとめると、使用時に不要なモデルが一緒に付いてきて、個々で独立して使いたいときに不便**

### 手順

#### Step 1: モデルのメッシュ一覧を確認

```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/blender_export_mesh.py \
  -- <入力ファイル.fbx or .blend> <出力ディレクトリ>
```

出力された `{model}_meshdata.json` からパーツ一覧を確認:
```bash
node -e "const d=require('./<出力dir>/<model>_meshdata.json'); console.log(Object.keys(d.parts).join('\n'))"
```

#### Step 2: 武器・防具パーツを特定

パーツ一覧から武器・防具に該当するメッシュを特定する。

分類の目安:
| 分類 | 該当パーツ例 |
|------|------------|
| 武器 | sword, blade, axe, bow, staff, weapon |
| 盾 | shield, buckler |
| 兜・ヘルメット | helmet, helm, headgear |
| 鎧・胸当て | armor, chestplate, breastplate |
| 手甲・籠手 | gauntlet, bracer, glove |
| 脛当て | greave, shin_guard |
| 肩当て | pauldron, shoulder_pad |

**ユーザーに確認**: 特定したパーツリストを提示し、どれを武器・防具として個別ボクセル化するか確認を取る。

#### Step 3: 1アイテムずつボクセル化

**中間データ方式（meshdata.jsonがある場合）:**
```bash
node scripts/voxelize_from_mesh.js <meshdata.json> <パーツ名> <出力.vox> [resolution]
```

**Blender直接方式（個別メッシュを指定してボクセル化）:**
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/voxelize_weapon.py \
  -- <入力ファイル> <出力ディレクトリ> [voxel_size] [scale]
```

- **必ず1パーツずつ処理する**
- 各パーツのボクセル化後、ビューアで目視確認
- ユーザーOKなら次のパーツへ進む

#### Step 4: カテゴリフォルダに格納

完成した各.voxファイルを適切なカテゴリフォルダに配置:
```
game-assets/wapons/swords/Model_Name_Sword/Model_Name_Sword.vox
game-assets/wapons/shields/Model_Name_Shield/Model_Name_Shield.vox
game-assets/wapons/armor/Model_Name_Helmet/Model_Name_Helmet.vox
```

---

## 命名規則

| 項目 | ルール | 例 |
|------|--------|-----|
| フォルダ名 | PascalCase or snake_case | `Iron_Sword/` |
| ファイル名 | フォルダ名と一致 | `Iron_Sword.vox` |
| スペース | アンダースコアに置換 | `Adventurer's Spear` → `Adventurers_Spear` |
| アポストロフィ | 削除 | `King's Blade` → `Kings_Blade` |
| ドット | アンダースコアに置換 | `Sword V.2` → `Sword_V_2` |
| 分割パーツ | `_handle` / `_blade` サフィックス | `Long_Spear_handle.vox` |

---

## パラメータリファレンス

| パラメータ | デフォルト値 | 説明 |
|-----------|------------|------|
| `voxel_size` | 0.007m | 1ボクセルの物理サイズ（0.7cm）。256ボクセル ≈ 179cm |
| `scale` | 1.0 | モデルのスケーリング倍率 |
| `threshold` | 0.8 × voxel_size | 表面判定距離。大きくすると穴が埋まるが太くなる |
| `color_palette` | ≤ 255色 | VOXファイルの色数制限。超過時は自動量子化 |
| 分割オーバーラップ | 2ボクセル | handle/blade分割時の繋ぎ目重複幅 |

---

## 品質チェックリスト

ボクセル化後、以下を確認:

- [ ] 1アイテムが1ファイルになっているか（複数アイテムの混在なし）
- [ ] グリッド寸法が256以内か（超える場合は分割 or スケール調整）
- [ ] 色・テクスチャが正しく再現されているか
- [ ] 穴や欠損がないか
- [ ] キャラクター身長との比率が自然か
- [ ] 適切なカテゴリフォルダに格納されているか
- [ ] grid.json / parts.json が正しく出力されているか

---

## スクリプト一覧

### Blender Python スクリプト
| ファイル | 用途 |
|---------|------|
| `voxelize_weapon.py` | 武器モデル → .vox 変換（単体） |
| `voxelize_weapon_split.py` | 長い武器 → handle/blade 分割ボクセル化 |
| `inspect_weapon_structure.py` | 武器モデルの構造分析（事前確認用） |

### Node.js スクリプト
| ファイル | 用途 |
|---------|------|
| `list_weapon_sizes.js` | 全武器のサイズ一覧表示 |
| `rescale_weapons.js` | カテゴリ単位でのリスケール |
| `check_remaining_256.js` | 256超過武器の検出 |
| `check_truncated.js` | 切り詰められた武器の検出 |
| `fix_failed_weapons.js` | ファイル名問題の修正 |

### バッチスクリプト
| ファイル | 用途 |
|---------|------|
| `batch_voxelize_weapons.sh` | 武器パック一括ボクセル化 |

---

## Blenderパス

```
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe"
```

## 対応入力形式

| 形式 | 拡張子 | 備考 |
|------|--------|------|
| glTF Binary | `.glb` | 最も一般的。テクスチャ内蔵 |
| FBX | `.fbx` | キャラクターモデルに多い |
| Blender | `.blend` | Blender直接読み込み |
| glTF | `.gltf` | テクスチャ外部参照の場合あり |
