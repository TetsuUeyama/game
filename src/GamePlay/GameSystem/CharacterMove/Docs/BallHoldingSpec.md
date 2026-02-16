# ボール保持システム仕様書

## Phase 1: BallHoldingConfig.ts 新規作成

### 保持方向と使用する手のマッピング

**右利きの場合:**
| 方向 | 説明 | 使用する手 |
|------|------|-----------|
| 0 | 正面 | 右手 |
| 1 | 右前 | 右手 |
| 2 | 右 | 右手 |
| 6 | 左 | 左手 |
| 7 | 左前 | 左手 |

**左利きの場合:** 上記の逆

### 持ち替えルール
- 右手から左手（またはその逆）へのボールの持ち替えは、**正面（方向0）でのみ可能**

---

## Phase 2: Character.ts の改修

### 1. ボール保持位置計算を手の位置に変更
- `getBallHoldingPosition()` を改修
- 現在の保持方向から使用する手を決定（BallHoldingConfigのマッピングを使用）
- その手のワールド座標を返す

### 2. 腕の角度制御追加
- 保持方向に応じて肩・肘の回転を制御
- ボールを持つ手が8角形の対応する面の方向を向くようにする

---

## Phase 3: 非利き腕の使用判定

### oppositefrequency（頻度）: 値の範囲 1〜8
- **8:** ほぼ半々（50%）の確率で非利き腕でも持つ
- **1:** ほぼ非利き腕では持たない（利き腕を強く優先）

**頻度が低いキャラクターの挙動:**
- 利き腕側にボールを持ち替えようとする頻度を**上げる**
- 非利き腕側に持ち替える頻度を**下げる**
- （持ち替えは正面でのみ可能なので、正面時に利き腕側へ戻そうとする傾向が強まる）

### oppositeaccuracy（精度）: 値の範囲 1〜8
- **8:** 利き腕とそん色ないクオリティで非利き腕を使える
- **1:** 非利き腕使用時は約50%程度のクオリティに低下

---

## Q&A まとめ

### Q1: 正面（方向0）の保持
- **A) 利き腕で持つ**

### Q2: パラメータの解釈
- 選手データの値の範囲は1〜8
- 上記Phase 3参照

### Q3: oppositeaccuracy の影響範囲

**影響を受けるアクション:**
- ドリブル（非利き腕で保持中）
- 片手で打つパス（非利き腕で保持中）
- 3Pシュート（非利き腕で保持中、持ち替え不可）
- ミドルシュート（非利き腕で保持中、持ち替え不可）

**影響を受けないアクション:**
- レイアップ・ダンク → シュートモーションで持ち替えるため、利き腕で打つ
- 両手で打つパス → 利き腕のクオリティで実行

### Q4: 腕のアニメーション
- **B) 滑らかに補間**（例：0.2秒かけて移動）
- 保持方向を変更する際、腕の動きは滑らかに補間して自然な動きを実現

### Q6: 腕の位置変更の実装方法
- **案1: 既存MotionControllerを使用**を採用
  - `motion/BallHoldingMotion.ts` を新規作成
  - 各保持方向ごとのキーフレームを定義
  - 既存のブレンディング・優先度システムを活用

**選定理由:**
- 他のモーション（ドリブル、パス等）と同じ仕組みで管理でき整合性が高い
- 既存の補間システム（0.1〜0.3秒）をそのまま利用可能
- 優先度競合解決が自動で行われる
- 将来アニメーションファイルへの置き換えが自然にできる

**ファイル構成:**
```
src/character-move/
├── motion/
│   └── BallHoldingMotion.ts    # 新規作成：保持方向ごとのキーフレーム定義
├── config/
│   └── BallHoldingConfig.ts    # 新規作成：方向→手のマッピング、パラメータ
└── ...
```

**適用タイミング:**
- アイドル/歩行/ダッシュ時にボール保持モーションを適用
- ドリブル/パス/シュート中はそれぞれのモーションが腕を制御（保持モーションは適用しない）

### Q5: ボールの保持高さ
- **A) 腰の高さ**（現状に近い）

---

## 実装完了内容

### 作成したファイル

1. **config/BallHoldingConfig.ts**
   - 利き腕の型定義（`DominantHand`, `HoldingHand`）
   - 右利き/左利きの方向→手のマッピング
   - `BallHoldingUtils` クラス
     - `getHoldingHand()`: 保持方向から使用する手を取得
     - `isOppositeHandDirection()`: 非利き腕方向の判定
     - `canSwitchHand()`: 持ち替え可能かの判定（正面のみ可）
     - `calculateOppositeHandProbability()`: 非利き腕への持ち替え確率
     - `calculateDominantHandPreference()`: 利き腕への持ち替え優先度
     - `calculateOppositeHandAccuracy()`: 非利き腕精度係数
     - `adjustAccuracyForHand()`: アクション精度の調整
     - `shouldSwitchHandAtFront()`: 正面での持ち替え判定

2. **motion/BallHoldingMotion.ts**
   - 各保持方向（0,1,2,6,7）ごとの腕のキーフレーム定義
   - 右利き用モーション（`BALL_HOLDING_MOTIONS_RIGHT`）
   - 左利き用モーション（`BALL_HOLDING_MOTIONS_LEFT`）
   - `getBallHoldingMotion()`: 利き腕と方向からモーションを取得

### Character.ts の改修内容

1. **新規プロパティ追加**
   - `dominantHand`: 利き腕（デフォルト: 'right'）
   - `currentHoldingHand`: 現在ボールを持っている手
   - `oppositeFrequency`: 非利き腕使用頻度（1〜8）
   - `oppositeAccuracy`: 非利き腕精度（1〜8）

2. **改修メソッド**
   - `getBallHoldingPosition()`: 手の位置を返すように変更
   - `setBallHoldingPositionIndex()`: モーション再生を追加

3. **新規メソッド追加**
   - `updateBallHoldingMotion()`: ボール保持モーションを更新
   - `setDominantHand()` / `getDominantHand()`: 利き腕の設定/取得
   - `getCurrentHoldingHand()`: 現在の手を取得
   - `setOppositeFrequency()` / `getOppositeFrequency()`: 頻度の設定/取得
   - `setOppositeAccuracy()` / `getOppositeAccuracy()`: 精度の設定/取得
   - `isUsingOppositeHand()`: 非利き腕使用中かの判定
   - `getHandAccuracyMultiplier()`: 精度係数を取得
   - `getBallHoldingPositionLegacy()`: 互換性のための旧実装

4. **setPlayerData() の改修**
   - PlayerDataから利き腕（`dominanthand`）を読み込み
   - PlayerDataから`oppositefrequency`と`oppositeaccuracy`を読み込み

### 今後の拡張

- ドリブル/パス/シュートの精度に`getHandAccuracyMultiplier()`を適用
- 非利き腕使用時のアニメーション調整（必要に応じて）

---

## Phase 4: 1対1有利/不利システム

### 概要
1対1状態の際、一定時間でサイコロ勝負を行い、勝敗と差を次のサイコロ勝負まで保持する。
サイコロ勝負の結果はオフェンス・ディフェンスの有利/不利状態として各アクションに影響する。

### Q&A

#### Q1: サイコロへの能力値反映
- **A) 純粋なランダム（1-6）**
- サイコロ自体は能力値に影響されない

#### Q2: 差の段階
- 差が大きいほど大有利
- 例：差1 = 微有利、差2 = 小有利、差3 = 中有利、差4 = 有利、差5 = 大有利

#### Q3: 影響度合い
- 具体的な数値は微調整可能にする
- 影響度のパラメータを設定ファイルに外出し
- **ドリブルチェックモードで調整・確認できるようにする**

#### Q4: 非利き腕の扱い
- サイコロ結果には非利き腕のペナルティは**反映しない**
- 非利き腕の影響は各アクションの精度に別途適用

### 有利/不利の影響範囲

**オフェンス有利時:**
- ドリブル突破成功率UP
- シュート成功率UP
- フェイント成功率UP
- スティール/ブロックされにくい
- 競り合いで相手を押し込みやすい

**ディフェンス有利時:**
- 上記の逆

### AI連携
- AIの状況判断にも有利/不利状態を組み込む
- 有利時は積極的な行動を選択しやすくなる

---

## Phase 4 実装完了内容

### OneOnOneBattleConfig.ts の追加

1. **型定義**
   - `AdvantageState`: 'offense' | 'defense' | 'neutral'
   - `AdvantageStatus`: state, difference, multiplier

2. **設定パラメータ（ADVANTAGE_CONFIG）**
   - `MULTIPLIER_BY_DIFFERENCE`: 差ごとの基本影響係数（1=5%, 2=10%, 3=15%, 4=20%, 5=25%）
   - `ACTION_FACTORS`: 各アクションへの影響係数
     - DRIBBLE_BREAKTHROUGH, SHOOT_ACCURACY, FEINT_SUCCESS, PUSH_POWER
     - STEAL_SUCCESS, BLOCK_SUCCESS, CONTEST_POWER
   - `MAX_MULTIPLIER`: 最大影響係数（30%）

3. **ユーティリティクラス（AdvantageUtils）**
   - `calculateMultiplier()`: 差から影響係数を計算
   - `adjustSuccessRate()`: アクション成功率を調整
   - `adjustPushPower()`: 競り合いの力を調整

### OneOnOneBattleController.ts の改修

1. **有利/不利状態の管理**
   - `advantageStatus`プロパティ追加
   - サイコロ勝負後に有利/不利状態を計算・保存
   - 1on1状態解除時にリセット

2. **取得メソッド追加**
   - `getAdvantageStatus()`: 現在の有利/不利状態を取得
   - `isOffenseAdvantaged()`: オフェンス有利か判定
   - `isDefenseAdvantaged()`: ディフェンス有利か判定

3. **有利/不利の適用**
   - ドリブル突破を試みる確率に適用
   - フェイント成功率に適用

### Character.ts の改修

1. **プロパティ追加**
   - `advantageStatus`: 1対1有利/不利状態

2. **メソッド追加**
   - `setAdvantageStatus()`: 有利/不利状態を設定
   - `getAdvantageStatus()`: 有利/不利状態を取得
   - `getAdjustedSuccessRate()`: 有利/不利を考慮した成功率を計算

3. **calculatePushback()の改修**
   - 競り合いの押し込み力に有利/不利を適用

### ShootingController.ts の改修

- シュート精度に有利/不利を適用（3P/ミドルのみ）

### GameScene.ts の改修

- 有利/不利状態をオンボールプレイヤーとディフェンダーに反映

### 今後の拡張

- スティール/ブロック成功率への適用
- AI判断への有利/不利状態の組み込み
- ドリブルチェックモードでの影響度調整UI
