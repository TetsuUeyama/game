# オフェンス側の攻撃戦術の使い方

## 概要

オフェンス側のキャラクターに攻撃戦術を設定し、ボール保持位置を制御する機能を実装しました。

## 攻撃戦術の種類

以下の3つの戦術があります：

### 1. BALL_KEEP（ボールキープ）
- **説明**: 攻め急がずにボールを安全に保持する戦術
- **使用する面**: 2と6
- **用途**: 守備的な場面や時間稼ぎをしたい場合

### 2. DRIBBLE_BREAKTHROUGH（ドリブル突破）
- **説明**: ドリブルで相手を抜くつもりの戦術
- **使用する面**: 1と7
- **用途**: 積極的に攻撃したい場合

### 3. HIGH_RISK（ハイリスク）
- **説明**: 相手のスティールを誘う危険な戦術
- **使用する面**: 0のみ
- **用途**: リスクを犯して相手を誘い出したい場合

## 使用方法

### 戦術の設定

```typescript
import { OffenseStrategy } from "../types/OffenseStrategy";

// ボールキープ戦術を設定
character.setOffenseStrategy(OffenseStrategy.BALL_KEEP);

// ドリブル突破戦術を設定
character.setOffenseStrategy(OffenseStrategy.DRIBBLE_BREAKTHROUGH);

// ハイリスク戦術を設定
character.setOffenseStrategy(OffenseStrategy.HIGH_RISK);
```

戦術を設定すると、以下が自動的に実行されます：
1. 戦術に対応したボール保持面が設定される
2. ボール保持位置がランダムに初期化される

### サイコロを振ってボール位置を変更

```typescript
// 現在設定されている戦術の範囲内でランダムにボール位置を変更
character.randomizeBallPosition();
```

### 現在の戦術を取得

```typescript
const currentStrategy = character.getOffenseStrategy();
console.log(`現在の戦術: ${currentStrategy}`);
```

### ボール保持位置を取得

```typescript
const ballPosition = character.getBallHoldingPosition();
console.log(`ボール位置: (${ballPosition.x}, ${ballPosition.y}, ${ballPosition.z})`);
```

## 実装例

```typescript
// キャラクターを作成
const character = new Character(scene, new Vector3(0, 0, 0));

// 攻撃側の状態に設定
character.setState(CharacterState.ON_BALL_PLAYER);

// ボールキープ戦術を選択
character.setOffenseStrategy(OffenseStrategy.BALL_KEEP);
// → 面2と6が使用され、ランダムにどちらかが選択される

// サイコロを振って位置を変更
character.randomizeBallPosition();
// → 面2または面6のどちらかにランダムに切り替わる

// ドリブル突破に切り替え
character.setOffenseStrategy(OffenseStrategy.DRIBBLE_BREAKTHROUGH);
// → 面1と7が使用され、ランダムにどちらかが選択される
```

## 8角形の面番号について

キャラクターの足元に8角形の円があり、各面には番号が振られています：

```
上から見た図（キャラクターが上向き）:
       7   0
      /     \
     6       1
     |       |
     5       2
      \     /
       4   3
```

- **面0**: 正面（キャラクターの前方中央）
- **面1**: 右前
- **面2**: 右側
- **面3**: 右後ろ（背面右）
- **面4**: 背面（後ろ中央）
- **面5**: 左後ろ（背面左）
- **面6**: 左側
- **面7**: 左前

## 内部実装の詳細

### OffenseStrategy.ts
攻撃戦術の enum と各戦術で使用する面の番号を定義しています。

### Character.ts に追加されたメソッド
- `setOffenseStrategy(strategy)`: 戦術を設定
- `getOffenseStrategy()`: 現在の戦術を取得
- `randomizeBallPosition()`: サイコロを振ってボール位置をランダム化

## デバッグ

面の位置を視覚的に確認したい場合は、以下のメソッドを使用できます：

```typescript
// 8角形の面を色分けして表示
character.showOctagonVertexNumbers();

// 非表示にする
character.hideOctagonVertexNumbers();
```

各面が色分けされて表示されます：
- 0: 赤
- 1: オレンジ
- 2: 黄色
- 3: 緑
- 4: シアン
- 5: 青
- 6: 紫
- 7: マゼンタ
