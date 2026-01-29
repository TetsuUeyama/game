# モーション追加ガイド

このドキュメントでは、新しいモーションを簡単に追加する方法を説明します。

## モーションデータの書き方

このプロジェクトでは、モーションデータを**時系列データ形式**で定義します。
この形式により、各関節の動きが時間軸で一目で分かりやすくなっています。

## 基本的な手順

### 1. モーションデータファイルを作成

`src/character-move/data/` ディレクトリに新しいモーションファイルを作成します。

例: `RunMotion.ts`（走るモーション）

```typescript
import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";

/**
 * 走行モーション
 */

// ステップ1: 時間定数を定義
const T0 = 0.0;  // 開始
const T1 = 0.2;  // 左足前、右腕前
const T2 = 0.4;  // 両足揃う
const T3 = 0.6;  // 右足前、左腕前
const T4 = 0.8;  // 終了（ループ開始位置）

// ステップ2: 関節アニメーションデータを軸ごとに定義
const JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身（前傾姿勢を維持）
  upperBodyX: {[T0]: 10, [T1]: 10, [T2]: 10, [T3]: 10, [T4]: 10},
  upperBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  upperBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  lowerBodyX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  lowerBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  lowerBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  // 頭部（下向き）
  headX: {[T0]: -5, [T1]: -5, [T2]: -5, [T3]: -5, [T4]: -5},
  headY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  headZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  // 腕（歩行より大きく振る）
  leftShoulderX: {[T0]: 0, [T1]: 50, [T2]: 0, [T3]: -50, [T4]: 0},
  leftShoulderY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftShoulderZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  rightShoulderX: {[T0]: 0, [T1]: -50, [T2]: 0, [T3]: 50, [T4]: 0},
  rightShoulderY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightShoulderZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  leftElbowX: {[T0]: 0, [T1]: 20, [T2]: 0, [T3]: 30, [T4]: 0},
  leftElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftElbowZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  rightElbowX: {[T0]: 0, [T1]: 30, [T2]: 0, [T3]: 20, [T4]: 0},
  rightElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightElbowZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  // 脚（歩行より大きく動かす）
  leftHipX: {[T0]: 0, [T1]: -50, [T2]: 0, [T3]: 40, [T4]: 0},
  leftHipY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftHipZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  rightHipX: {[T0]: 0, [T1]: 40, [T2]: 0, [T3]: -50, [T4]: 0},
  rightHipY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightHipZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  leftKneeX: {[T0]: 0, [T1]: 20, [T2]: 0, [T3]: 10, [T4]: 0},
  leftKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftKneeZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  rightKneeX: {[T0]: 0, [T1]: 10, [T2]: 0, [T3]: 20, [T4]: 0},
  rightKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightKneeZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
};

// ステップ3: モーションデータをエクスポート
export const RUN_MOTION: MotionData = {
  name: "run",
  duration: T4, // 1サイクル0.8秒（歩行より速い）
  loop: true,
  keyframes: buildKeyframes(JOINT_ANIMATIONS), // ユーティリティ関数で自動生成
  // 優先度設定（オプション）
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

### 時系列データ形式の利点

**従来の形式**（キーフレームごとに全関節を定義）:
```typescript
{
  time: 0.0,
  joints: {
    upperBody: { x: 10, y: 0, z: 0 },
    lowerBody: { x: 0, y: 0, z: 0 },
    head: { x: -5, y: 0, z: 0 },
    // ... 各キーフレームで全関節を繰り返し定義
  }
}
```

**新しい形式**（軸ごとに時系列で定義）:
```typescript
upperBodyX: {[T0]: 10, [T1]: 10, [T2]: 10, [T3]: 10, [T4]: 10},
headX: {[T0]: -5, [T1]: -5, [T2]: -5, [T3]: -5, [T4]: -5},
```

利点:
- ✅ 各軸の時間変化が一目で分かる
- ✅ コードの重複が大幅に削減
- ✅ 時間調整が簡単（定数を変更するだけ）
- ✅ 値のコピペミスが減る

### 位置移動を伴うモーション

ダッシュやジャンプなど、キャラクターの位置が移動するモーションの場合:

```typescript
// 位置アニメーションデータを追加
const POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[T0]: 0, [T1]: 0, [T2]: 0},
  y: {[T0]: 0, [T1]: 0.5, [T2]: 0},  // ジャンプで上昇
  z: {[T0]: 0, [T1]: 1.0, [T2]: 2.0}, // 前方に移動
};

// buildKeyframesの第2引数に渡す
export const MOTION: MotionData = {
  name: "motion_name",
  duration: T2,
  loop: false,
  keyframes: buildKeyframes(JOINT_ANIMATIONS, POSITION_ANIMATIONS),
};
```

### 2. InputControllerに登録

`src/character-move/controllers/InputController.ts` でモーションを登録します。

```typescript
import { RUN_MOTION_CONFIG } from "../motion/RunMotion";

// コンストラクタ内
this.motionController.registerMotions([
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
      this.motionController.playByName("run");
    } else {
      this.motionController.playByName("walk");
    }
  } else {
    // 停止時は自動的にデフォルトモーション（アイドル）に戻る
    this.motionController.playDefault();
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
   - `motionController.playDefault()` を呼び出すだけで、自動的にデフォルトモーションにブレンドされます

## まとめ

新しいモーションを追加する際は：

1. モーションデータファイルを作成（キーフレームと設定を定義）
2. InputControllerに登録（`registerMotions` に追加）
3. トリガー条件を追加（`update` メソッド内で `motionController.playByName("モーション名")` を呼ぶ）

これだけで、自動的に：
- ブレンディング
- デフォルトモーションへの自動遷移
- 優先度管理

が機能します！
