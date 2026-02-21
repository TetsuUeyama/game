import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes } from "@/GamePlay/GameSystem/CharacterMove/Utils/MotionUtils";

/**
 * ボールキャッチモーション
 *
 * ボールが来た方向へ両手を伸ばし、両手のひらを合わせに行くキャッチ動作。
 * IKSystem と組み合わせ、ベースポーズ（キーフレーム）＋ IK追従のハイブリッド方式。
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 100ms = 0.1秒（構え完了）
 * - activeTime: 400ms = 0.4秒（キャッチ判定有効）
 *
 * キーフレーム構成：
 * - T0 (0.0s): ニュートラル姿勢
 * - T1 (0.1s): 両腕を前方に伸ばす（構え完了 = startupTime）
 * - T2 (0.3s): 両手を合わせる動き（キャッチ完了）
 * - T3 (0.5s): ボール引き寄せ（リカバリー）
 */

// ==============================
// ボールキャッチ（正面キャッチ）
// ==============================

const BALL_CATCH_T0 = 0.0;
const BALL_CATCH_T1 = 0.1;    // startupTime（構え完了）
const BALL_CATCH_T2 = 0.3;    // キャッチ完了（両手を合わせる）
const BALL_CATCH_T3 = 0.5;    // リカバリー（ボール引き寄せ）

const BALL_CATCH_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：軽い前傾（ボールに向かう自然な動き）
  upperBodyX: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 10, [BALL_CATCH_T2]: 15, [BALL_CATCH_T3]: 5},
  upperBodyY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  upperBodyZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  lowerBodyX: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  lowerBodyY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  lowerBodyZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  headX: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 5, [BALL_CATCH_T2]: 8, [BALL_CATCH_T3]: 0},
  headY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  headZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  // 右腕：前方に伸ばし→キャッチ位置→引き寄せ
  rightShoulderX: {[BALL_CATCH_T0]: -45, [BALL_CATCH_T1]: -75, [BALL_CATCH_T2]: -80, [BALL_CATCH_T3]: -50},
  rightShoulderY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: -10, [BALL_CATCH_T2]: -15, [BALL_CATCH_T3]: -5},
  rightShoulderZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  rightElbowX: {[BALL_CATCH_T0]: -90, [BALL_CATCH_T1]: -40, [BALL_CATCH_T2]: -25, [BALL_CATCH_T3]: -70},
  rightElbowY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  rightElbowZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  // 左腕：前方に伸ばし→キャッチ位置→引き寄せ（右腕とミラー）
  leftShoulderX: {[BALL_CATCH_T0]: -45, [BALL_CATCH_T1]: -75, [BALL_CATCH_T2]: -80, [BALL_CATCH_T3]: -50},
  leftShoulderY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 10, [BALL_CATCH_T2]: 15, [BALL_CATCH_T3]: 5},
  leftShoulderZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  leftElbowX: {[BALL_CATCH_T0]: -90, [BALL_CATCH_T1]:-40, [BALL_CATCH_T2]: -25, [BALL_CATCH_T3]: -70},
  leftElbowY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  leftElbowZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  // 脚：軽くしゃがむ（安定姿勢）
  leftHipX: {[BALL_CATCH_T0]: -20, [BALL_CATCH_T1]: -28, [BALL_CATCH_T2]: -30, [BALL_CATCH_T3]: -22},
  leftHipY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  leftHipZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  rightHipX: {[BALL_CATCH_T0]: -20, [BALL_CATCH_T1]: -28, [BALL_CATCH_T2]: -30, [BALL_CATCH_T3]: -22},
  rightHipY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  rightHipZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  leftKneeX: {[BALL_CATCH_T0]: 30, [BALL_CATCH_T1]: 42, [BALL_CATCH_T2]: 45, [BALL_CATCH_T3]: 33},
  leftKneeY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  leftKneeZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},

  rightKneeX: {[BALL_CATCH_T0]: 30, [BALL_CATCH_T1]: 42, [BALL_CATCH_T2]: 45, [BALL_CATCH_T3]: 33},
  rightKneeY: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
  rightKneeZ: {[BALL_CATCH_T0]: 0, [BALL_CATCH_T1]: 0, [BALL_CATCH_T2]: 0, [BALL_CATCH_T3]: 0},
};

export const BALL_CATCH_MOTION: MotionData = {
  name: "ball_catch",
  duration: BALL_CATCH_T3,
  loop: false,
  keyframes: buildKeyframes(BALL_CATCH_JOINT_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
    { jointName: "upperBody", priority: 8 },
  ],
};

export const BALL_CATCH_MOTION_CONFIG: MotionConfig = {
  motionData: BALL_CATCH_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 38,
  interruptible: true,
};

// ==============================
// エクスポート
// ==============================

/**
 * ボールキャッチモーションマップ
 */
export const BALL_CATCH_MOTIONS = {
  ball_catch: BALL_CATCH_MOTION,
};

/**
 * ボールキャッチモーションコンフィグマップ
 */
export const BALL_CATCH_MOTION_CONFIGS = {
  ball_catch: BALL_CATCH_MOTION_CONFIG,
};
