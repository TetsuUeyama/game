# OnBallDefenseAI リファクタリング解説

## 概要

オンボールディフェンダーのAIを改修し、行動原理を「オフェンスをゴールから遠ざける」に変更しました。

---

## 変更前の問題点

### 旧コード（58-65行）の問題

```typescript
// オフェンスの動きに合わせて横移動（ミラーリング）
const offenseVelocity = onBallPlayer.velocity;
if (offenseVelocity && offenseVelocity.length() > 0.1) {
  // オフェンスが動いている場合、追従
  const lateralDir = new Vector3(offenseVelocity.x, 0, offenseVelocity.z).normalize();
  this.character.move(lateralDir, deltaTime);
  return;
}
```

**問題点：**
- コメントは「横移動」と書いてあるが、実際は全方向（X成分とZ成分両方）に追従
- オフェンスが前進すると、ディフェンダーも同じ方向に動く = **後退してしまう**
- これが「ディフェンスが一方的に押される」原因の一つだった

---

## 変更後の行動原理

### 新しい行動原理

```
┌─────────────────────────────────────────────────────────┐
│           OnBallDefenseAI 行動原理                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  【最優先】シュートブロック判定                           │
│      ↓ シュートモーション検知時                          │
│      └→ tryBlockShot() 実行                             │
│                                                         │
│  【1on1接触時】オフェンスをゴールから遠ざける             │
│      ↓                                                  │
│      ・ゴール方向に立ちはだかる                          │
│      ・ゴールの反対方向に押し返す（プレッシャー）        │
│      ・横移動はミラーリングで追従                        │
│                                                         │
│  【非接触時】ポジショニング                              │
│      ↓                                                  │
│      └→ オフェンスとゴールの間に位置取り                │
│                                                         │
│  【機会的】スティール試行                                │
│      ↓ 1on1状態で一定確率                               │
│      └→ tryDefensiveAction() 実行                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 変更したファイル

### 1. config/DefenseConfig.ts

#### 追加した設定: `DEFENSE_PRESSURE`

```typescript
export const DEFENSE_PRESSURE = {
  BASE_PUSH_STRENGTH: 0.6,      // 押し返しの基本強度
  STAT_MULTIPLIER: 0.01,        // defense値による強度ボーナス係数
  MAX_PUSH_STRENGTH: 1.0,       // 最大押し返し強度
  MIN_PUSH_STRENGTH: 0.2,       // 最小押し返し強度
  LATERAL_MIRROR_STRENGTH: 0.8, // 横移動ミラーリングの強度
  STEAL_ATTEMPT_CHANCE: 0.02,   // スティール試行確率（毎フレーム2%）
  DEFENSE_STANCE_CHANCE: 0.4,   // ディフェンス構え確率
} as const;
```

**各設定の意味：**

| 設定名 | 値 | 説明 |
|--------|-----|------|
| `BASE_PUSH_STRENGTH` | 0.6 | 基本の押し返し強度。1.0で全力 |
| `STAT_MULTIPLIER` | 0.01 | defense値50を基準に、1ポイントあたり±0.01の補正 |
| `MAX_PUSH_STRENGTH` | 1.0 | これ以上強くならない上限 |
| `MIN_PUSH_STRENGTH` | 0.2 | これ以下にならない下限 |
| `LATERAL_MIRROR_STRENGTH` | 0.8 | オフェンスの横移動に対する追従強度 |
| `STEAL_ATTEMPT_CHANCE` | 0.02 | 毎フレーム2%でスティール判定 |
| `DEFENSE_STANCE_CHANCE` | 0.4 | アクション選択時40%でディフェンス構え |

#### 追加したユーティリティメソッド

```typescript
// DefenseUtils クラスに追加
public static calculatePushStrength(defenseValue: number | undefined): number
public static shouldAttemptSteal(): boolean
public static selectDefensiveAction(): 'steal' | 'stance'
```

---

### 2. ai/state/OnBallDefenseAI.ts

#### 全体構造の変更

**旧構造：**
```
update()
├── tryBlockShot()
├── 1on1判定
│   └── オフェンスの速度をそのままコピーして移動
└── 非接触時の移動
```

**新構造：**
```
update()
├── tryBlockShot()                    // 変更なし
├── handle1on1State()                 // 新規メソッド
│   ├── 対面向きを維持
│   ├── 押し返し強度を計算（defense値ベース）
│   ├── 縦移動: ゴールの反対方向に押す
│   ├── 横移動: ミラーリングで追従
│   └── スティール試行
└── handleApproachState()             // 新規メソッド
    └── オフェンスとゴールの間に位置取り
```

#### 核心部分: handle1on1State()

```typescript
private handle1on1State(
  onBallPlayer: Character,
  offenseToGoal: Vector3,
  deltaTime: number
): void {
  // 押し返し強度を計算（defense値に基づく）
  const defenseValue = this.character.playerData?.stats?.defense;
  const pushStrength = DefenseUtils.calculatePushStrength(defenseValue);

  // 【核心】オフェンスをゴールから遠ざける方向に押す
  const pushDirection = offenseToGoal.scale(-1);

  // オフェンスの速度を「横方向」と「縦方向」に分解
  const offenseVelocity = onBallPlayer.velocity;
  if (offenseVelocity && offenseVelocity.length() > 0.1) {
    // 縦方向 = ゴールへの方向
    const forwardComponent = Vector3.Dot(offenseVelocity, offenseToGoal);
    // 横方向 = それに垂直な方向
    const lateralVelocity = offenseVelocity.subtract(offenseToGoal.scale(forwardComponent));

    if (lateralVelocity.length() > 0.1) {
      // 横移動はミラーリング、縦移動は押し返し
      const combinedDirection = pushDirection.scale(pushStrength)
        .add(lateralDir.scale(lateralStrength));
      this.character.move(combinedDirection, deltaTime);
    }
  }
}
```

**ポイント：**

1. **速度ベクトルの分解**: オフェンスの速度を「ゴールへの方向（縦）」と「それに垂直な方向（横）」に分解
2. **縦移動への対応**: ゴールの反対方向に押し返す（後退しない）
3. **横移動への対応**: ミラーリングで追従（ゴール前に留まる）

---

## 押し返し強度の計算

```
押し返し強度 = BASE_PUSH_STRENGTH + (defense - 50) * STAT_MULTIPLIER

例：
- defense = 50 → 0.6 + 0 * 0.01 = 0.6
- defense = 80 → 0.6 + 30 * 0.01 = 0.9
- defense = 30 → 0.6 + (-20) * 0.01 = 0.4

上限: MAX_PUSH_STRENGTH (1.0)
下限: MIN_PUSH_STRENGTH (0.2)
```

---

## 動作の違い

### 旧動作

| オフェンスの動き | ディフェンスの動き |
|-----------------|-------------------|
| 前進（ゴール方向） | 同じ方向に移動（後退） |
| 後退 | 同じ方向に移動（前進） |
| 横移動 | 同じ方向に移動 |

### 新動作

| オフェンスの動き | ディフェンスの動き |
|-----------------|-------------------|
| 前進（ゴール方向） | **反対方向に押し返す** |
| 後退 | 押し返し続ける |
| 横移動 | ミラーリングで追従 |

---

## 今後の調整ポイント

`DEFENSE_PRESSURE` の値を調整することで、ディフェンスの強さを変更できます：

1. **ディフェンスをより強くしたい場合**
   - `BASE_PUSH_STRENGTH` を上げる（例: 0.8）
   - `STAT_MULTIPLIER` を上げる（例: 0.015）

2. **ディフェンスをより弱くしたい場合**
   - `BASE_PUSH_STRENGTH` を下げる（例: 0.4）
   - `MIN_PUSH_STRENGTH` を下げる（例: 0.1）

3. **横移動の追従を強くしたい場合**
   - `LATERAL_MIRROR_STRENGTH` を上げる（例: 1.0）

4. **スティールの頻度を変えたい場合**
   - `STEAL_ATTEMPT_CHANCE` を変更

---

## 他システムとの連携

### ContestController との関係

- `ContestController` はキャラクター同士のサークルが重なった時の押し合い（offense/defense値ベース）を処理
- `OnBallDefenseAI` の押し返しは「移動方向の決定」であり、実際の位置変更は `ContestController` と併用される
- 両方が動くことで、より自然な1on1の競り合いが実現

### OneOnOneBattleController との関係

- `OneOnOneBattleController` はサイコロ勝負と有利/不利状態を管理
- 有利/不利状態は別途各アクションの成功率に影響
- `OnBallDefenseAI` の押し返しとは独立して動作

---

---

## 追加修正: handleApproachState の衝突回避問題

### 問題

旧実装では`handleApproachState`で`moveTowards()`を使用していたが、このメソッドには衝突回避ロジック（`adjustDirectionForCollision`）が含まれており、ディフェンダーがオフェンスを**迂回**して通過してしまっていた。

### 修正内容

`handleApproachState`を以下のように変更：

**旧:**
```typescript
// 理想的な位置（オフェンスとゴールの間）に向かって移動
this.moveTowards(idealPosition, deltaTime, 0.1);  // ← 衝突回避あり
```

**新:**
```typescript
// オフェンスに向かって直接移動（衝突回避なし）
const toOffense = offensePosition.subtract(myPosition).normalize();
this.character.move(toOffense, deltaTime);  // ← 直接移動
// 衝突判定はCollisionHandler/ContestControllerに任せる
```

### 動作の違い

| 状況 | 旧動作 | 新動作 |
|------|--------|--------|
| オフェンスに接近 | 衝突回避で迂回 | 直接向かう |
| 衝突時 | 回避して通過 | CollisionHandler/ContestControllerで処理 |

---

---

## 追加修正: ドリブルチェックモードでの衝突判定問題

### 問題

ドリブルチェックモードでディフェンダーがオフェンスをすり抜けてしまう。

### 原因

`DribbleCheckModePanel.tsx`が独自の更新ループを持っており、その中で以下が更新されていなかった：
- CollisionHandler（キャラクター同士の衝突判定）
- ContestController（押し合い処理）
- OneOnOneBattleController（1on1状態管理）

また、GameSceneの更新ループと二重に動作していたため、処理順序が不整合だった。

### 修正内容

#### 1. GameScene.ts に `updateCollisionSystems()` メソッドを追加

```typescript
public updateCollisionSystems(deltaTime: number): void {
  if (this.collisionHandler) {
    this.collisionHandler.update(deltaTime);
  }
  if (this.contestController) {
    this.contestController.update(deltaTime);
  }
  if (this.oneOnOneBattleController) {
    this.oneOnOneBattleController.check1on1Battle();
    this.oneOnOneBattleController.update1on1Movement(deltaTime);
  }
}
```

#### 2. DribbleCheckModePanel.tsx の修正

- ドリブルチェック開始時に `gameScene.pause()` を呼び出し
- 更新ループ内で `gameScene.updateCollisionSystems(deltaTime)` を呼び出し
- クリーンアップ時に `gameScene.resume()` を呼び出し

---

## 変更日時

- **日付**: 2026-02-01
- **変更者**: Claude Code
- **バージョン**: 1.2.0（ドリブルチェックモード衝突判定修正）
