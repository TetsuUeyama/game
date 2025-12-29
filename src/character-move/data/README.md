# モーション追加ガイド

このドキュメントでは、新しいモーションを簡単に追加する方法を説明します。

## 基本的な手順

### 1. モーションデータファイルを作成

`src/character-move/data/` ディレクトリに新しいモーションファイルを作成します。

例: `RunMotion.ts`（走るモーション）

```typescript
import { MotionData, MotionConfig } from "../types/MotionTypes";

/**
 * 走行モーション
 */
export const RUN_MOTION: MotionData = {
  name: "run",
  duration: 0.8, // 1サイクル0.8秒（歩行より速い）
  loop: true,
  keyframes: [
    // 開始姿勢
    {
      time: 0.0,
      joints: {
        upperBody: { x: 10, y: 0, z: 0 }, // 前傾姿勢
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -5, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
    // 中間姿勢1: 左足前、右腕前（歩行より大きく振る）
    {
      time: 0.2,
      joints: {
        upperBody: { x: 10, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -5, y: 0, z: 0 },
        leftHip: { x: -50, y: 0, z: 0 }, // 大きく前に
        leftKnee: { x: 20, y: 0, z: 0 },
        rightHip: { x: 40, y: 0, z: 0 }, // 大きく後ろに
        rightKnee: { x: 10, y: 0, z: 0 },
        leftShoulder: { x: 50, y: 0, z: 0 }, // 大きく後ろに
        leftElbow: { x: 20, y: 0, z: 0 },
        rightShoulder: { x: -50, y: 0, z: 0 }, // 大きく前に
        rightElbow: { x: 30, y: 0, z: 0 },
      },
    },
    // 中間姿勢2: 両足揃う
    {
      time: 0.4,
      joints: {
        upperBody: { x: 10, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -5, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
    // 中間姿勢3: 右足前、左腕前
    {
      time: 0.6,
      joints: {
        upperBody: { x: 10, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -5, y: 0, z: 0 },
        rightHip: { x: -50, y: 0, z: 0 },
        rightKnee: { x: 20, y: 0, z: 0 },
        leftHip: { x: 40, y: 0, z: 0 },
        leftKnee: { x: 10, y: 0, z: 0 },
        rightShoulder: { x: 50, y: 0, z: 0 },
        rightElbow: { x: 20, y: 0, z: 0 },
        leftShoulder: { x: -50, y: 0, z: 0 },
        leftElbow: { x: 30, y: 0, z: 0 },
      },
    },
    // 終了姿勢
    {
      time: 0.8,
      joints: {
        upperBody: { x: 10, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -5, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
  ],
  // 優先度設定
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    { jointName: "leftShoulder", priority: 8 },
    { jointName: "rightShoulder", priority: 8 },
    { jointName: "leftElbow", priority: 7 },
    { jointName: "rightElbow", priority: 7 },
    { jointName: "upperBody", priority: 6 },
    { jointName: "lowerBody", priority: 5 },
    { jointName: "head", priority: 4 },
  ],
};

/**
 * 走行モーションの設定
 */
export const RUN_MOTION_CONFIG: MotionConfig = {
  motionData: RUN_MOTION,
  isDefault: false, // デフォルトモーションではない
  blendDuration: 0.15, // 0.15秒でブレンド（素早く切り替え）
  priority: 20, // 歩行より高優先度
  interruptible: true, // 中断可能
};
```

### 2. InputControllerに登録

`src/character-move/controllers/InputController.ts` でモーションを登録します。

```typescript
import { RUN_MOTION_CONFIG } from "../data/RunMotion";

// コンストラクタ内
this.motionManager.registerMotions([
  IDLE_MOTION_CONFIG,
  WALK_MOTION_CONFIG,
  RUN_MOTION_CONFIG, // 追加
]);
```

### 3. トリガー条件を追加

同じく `InputController.ts` の `update` メソッドで、モーションのトリガー条件を追加します。

```typescript
public update(deltaTime: number): void {
  const moveDirection = this.calculateMoveDirection();
  const isMoving = moveDirection.length() > 0.01;

  if (isMoving) {
    moveDirection.normalize();
    this.character.move(moveDirection, deltaTime);

    // Shiftキーで走る
    if (this.inputState.shift) {
      this.motionManager.play("run");
    } else {
      this.motionManager.play("walk");
    }
  } else {
    // 停止時は自動的にデフォルトモーション（アイドル）に戻る
    this.motionManager.playDefault();
  }

  this.handleRotation(deltaTime);
}
```

## MotionConfig パラメータ説明

### motionData
モーションの実際のデータ（キーフレーム、優先度など）

### isDefault（オプション）
- `true`: デフォルトモーション（停止時に自動的に戻る）
- `false`: 通常のモーション
- デフォルト値: `false`

### blendDuration（オプション）
- モーション遷移時のブレンド時間（秒）
- 短いほど素早く切り替わる
- デフォルト値: `0.3`

### priority（オプション）
- モーションの優先度（値が大きいほど優先）
- 同時に複数のモーションがトリガーされた場合、優先度が高いものが選ばれる
- デフォルト値: `0`

### interruptible（オプション）
- `true`: 他のモーションで中断可能
- `false`: 最後まで再生される（強制的に切り替える場合は `force: true` が必要）
- デフォルト値: `true`

## 自動的にデフォルトモーションに戻る仕組み

1. **デフォルトモーションの設定**
   - `isDefault: true` を設定したモーションが、デフォルトモーションとして登録されます
   - 通常はアイドルモーション（立ちモーション）を設定します

2. **自動遷移**
   - `InputController` で条件が満たされなくなった時（例: ボタンを離した時）
   - `motionManager.playDefault()` を呼び出すだけで、自動的にデフォルトモーションにブレンドされます

## まとめ

新しいモーションを追加する際は：

1. モーションデータファイルを作成（キーフレームと設定を定義）
2. InputControllerに登録（`registerMotions` に追加）
3. トリガー条件を追加（`update` メソッド内で `motionManager.play("モーション名")` を呼ぶ）

これだけで、自動的に：
- ブレンディング
- デフォルトモーションへの自動遷移
- 優先度管理

が機能します！
