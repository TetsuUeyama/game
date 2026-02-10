import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";

/**
 * ディフェンスモーション
 *
 * シュートブロック、スティール、パスカット、ディフェンス構えの4種類
 * ActionControllerのタイミングに合わせてキーフレームを設計
 */

// ==============================
// シュートブロック
// ==============================

/**
 * シュートブロックモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 100ms = 0.1秒（手を上げる）
 * - activeTime: 500ms = 0.5秒（判定継続）
 * - recoveryTime: 300ms = 0.3秒（硬直）
 *
 * キーフレーム構成：
 * - T0: 構え
 * - T1: 手を上げ始める（startupTime）
 * - T2: 最高点（activeTime中盤）
 * - T3: 手を下げ始める（activeTime終了）
 * - T4: 元に戻る（recoveryTime終了）
 */
const BLOCK_T0 = 0.0;
const BLOCK_T1 = 0.1;    // startupTime
const BLOCK_T2 = 0.35;   // activeTime中盤
const BLOCK_T3 = 0.6;    // activeTime終了
const BLOCK_T4 = 0.9;    // recoveryTime終了

const BLOCK_SHOT_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：やや前傾
  upperBodyX: {[BLOCK_T0]: 0, [BLOCK_T1]: -5, [BLOCK_T2]: -10, [BLOCK_T3]: -10, [BLOCK_T4]: 0},
  upperBodyY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  upperBodyZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},

  lowerBodyX: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  lowerBodyY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  lowerBodyZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},

  headX: {[BLOCK_T0]: 0, [BLOCK_T1]: -15, [BLOCK_T2]: -25, [BLOCK_T3]: -20, [BLOCK_T4]: 0},
  headY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  headZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},

  // 両腕：真上に伸ばす
  rightShoulderX: {[BLOCK_T0]: -30, [BLOCK_T1]: -150, [BLOCK_T2]: -175, [BLOCK_T3]: -170, [BLOCK_T4]: -30},
  rightShoulderY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  rightShoulderZ: {[BLOCK_T0]: 0, [BLOCK_T1]: -15, [BLOCK_T2]: -20, [BLOCK_T3]: -15, [BLOCK_T4]: 0},

  rightElbowX: {[BLOCK_T0]: 30, [BLOCK_T1]: 15, [BLOCK_T2]: 5, [BLOCK_T3]: 10, [BLOCK_T4]: 30},
  rightElbowY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  rightElbowZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},

  leftShoulderX: {[BLOCK_T0]: -30, [BLOCK_T1]: -150, [BLOCK_T2]: -175, [BLOCK_T3]: -170, [BLOCK_T4]: -30},
  leftShoulderY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  leftShoulderZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 15, [BLOCK_T2]: 20, [BLOCK_T3]: 15, [BLOCK_T4]: 0},

  leftElbowX: {[BLOCK_T0]: 30, [BLOCK_T1]: 15, [BLOCK_T2]: 5, [BLOCK_T3]: 10, [BLOCK_T4]: 30},
  leftElbowY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  leftElbowZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},

  // 脚：ジャンプ
  leftHipX: {[BLOCK_T0]: -30, [BLOCK_T1]: -50, [BLOCK_T2]: 0, [BLOCK_T3]: -10, [BLOCK_T4]: -30},
  leftHipY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  leftHipZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},

  rightHipX: {[BLOCK_T0]: -30, [BLOCK_T1]: -50, [BLOCK_T2]: 0, [BLOCK_T3]: -10, [BLOCK_T4]: -30},
  rightHipY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  rightHipZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},

  leftKneeX: {[BLOCK_T0]: 50, [BLOCK_T1]: 80, [BLOCK_T2]: 20, [BLOCK_T3]: 35, [BLOCK_T4]: 50},
  leftKneeY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  leftKneeZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},

  rightKneeX: {[BLOCK_T0]: 50, [BLOCK_T1]: 80, [BLOCK_T2]: 20, [BLOCK_T3]: 35, [BLOCK_T4]: 50},
  rightKneeY: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  rightKneeZ: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
};

const BLOCK_SHOT_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[BLOCK_T0]: 0, [BLOCK_T1]: 0, [BLOCK_T2]: 0, [BLOCK_T3]: 0, [BLOCK_T4]: 0},
  y: {[BLOCK_T0]: 0, [BLOCK_T1]: -0.2, [BLOCK_T2]: 1.0, [BLOCK_T3]: 0.6, [BLOCK_T4]: 0},
  z: {[BLOCK_T0]: 0, [BLOCK_T1]: 0.1, [BLOCK_T2]: 0.2, [BLOCK_T3]: 0.15, [BLOCK_T4]: 0},
};

export const BLOCK_SHOT_MOTION: MotionData = {
  name: "block_shot",
  duration: BLOCK_T4,
  loop: false,
  keyframes: buildKeyframes(BLOCK_SHOT_JOINT_ANIMATIONS, BLOCK_SHOT_POSITION_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
    { jointName: "head", priority: 8 },
  ],
};

export const BLOCK_SHOT_MOTION_CONFIG: MotionConfig = {
  motionData: BLOCK_SHOT_MOTION,
  isDefault: false,
  blendDuration: 0.05,   // 素早いブレンド
  priority: 50,
  interruptible: false,
};

// ==============================
// スティール
// ==============================

/**
 * スティールモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 150ms = 0.15秒
 * - activeTime: 200ms = 0.2秒
 * - recoveryTime: 400ms = 0.4秒（失敗リスク）
 */
const STEAL_T0 = 0.0;
const STEAL_T1 = 0.08;
const STEAL_T2 = 0.15;   // startupTime
const STEAL_T3 = 0.35;   // activeTime終了
const STEAL_T4 = 0.75;   // recoveryTime終了

const STEAL_ATTEMPT_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：前に伸ばす
  upperBodyX: {[STEAL_T0]: 0, [STEAL_T1]: 15, [STEAL_T2]: 30, [STEAL_T3]: 35, [STEAL_T4]: 0},
  upperBodyY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  upperBodyZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  lowerBodyX: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  lowerBodyY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  lowerBodyZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  headX: {[STEAL_T0]: 0, [STEAL_T1]: 5, [STEAL_T2]: 10, [STEAL_T3]: 5, [STEAL_T4]: 0},
  headY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  headZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  // 右腕：前方に伸ばしてスワイプ
  rightShoulderX: {[STEAL_T0]: -45, [STEAL_T1]: -70, [STEAL_T2]: -80, [STEAL_T3]: -60, [STEAL_T4]: -45},
  rightShoulderY: {[STEAL_T0]: 0, [STEAL_T1]: -30, [STEAL_T2]: -45, [STEAL_T3]: -30, [STEAL_T4]: 0},
  rightShoulderZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  rightElbowX: {[STEAL_T0]: 45, [STEAL_T1]: 25, [STEAL_T2]: 15, [STEAL_T3]: 20, [STEAL_T4]: 45},
  rightElbowY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  rightElbowZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  // 左腕：バランス
  leftShoulderX: {[STEAL_T0]: -30, [STEAL_T1]: -40, [STEAL_T2]: -50, [STEAL_T3]: -45, [STEAL_T4]: -30},
  leftShoulderY: {[STEAL_T0]: 0, [STEAL_T1]: 15, [STEAL_T2]: 20, [STEAL_T3]: 15, [STEAL_T4]: 0},
  leftShoulderZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  leftElbowX: {[STEAL_T0]: 45, [STEAL_T1]: 60, [STEAL_T2]: 70, [STEAL_T3]: 60, [STEAL_T4]: 45},
  leftElbowY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  leftElbowZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  // 脚：踏み込み
  leftHipX: {[STEAL_T0]: -30, [STEAL_T1]: -50, [STEAL_T2]: -60, [STEAL_T3]: -50, [STEAL_T4]: -30},
  leftHipY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  leftHipZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  rightHipX: {[STEAL_T0]: -30, [STEAL_T1]: -20, [STEAL_T2]: -10, [STEAL_T3]: -15, [STEAL_T4]: -30},
  rightHipY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  rightHipZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  leftKneeX: {[STEAL_T0]: 50, [STEAL_T1]: 80, [STEAL_T2]: 100, [STEAL_T3]: 80, [STEAL_T4]: 50},
  leftKneeY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  leftKneeZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},

  rightKneeX: {[STEAL_T0]: 50, [STEAL_T1]: 35, [STEAL_T2]: 25, [STEAL_T3]: 35, [STEAL_T4]: 50},
  rightKneeY: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  rightKneeZ: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
};

const STEAL_ATTEMPT_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[STEAL_T0]: 0, [STEAL_T1]: 0, [STEAL_T2]: 0, [STEAL_T3]: 0, [STEAL_T4]: 0},
  y: {[STEAL_T0]: 0, [STEAL_T1]: -0.1, [STEAL_T2]: -0.15, [STEAL_T3]: -0.1, [STEAL_T4]: 0},
  z: {[STEAL_T0]: 0, [STEAL_T1]: 0.15, [STEAL_T2]: 0.3, [STEAL_T3]: 0.25, [STEAL_T4]: 0},
};

export const STEAL_ATTEMPT_MOTION: MotionData = {
  name: "steal_attempt",
  duration: STEAL_T4,
  loop: false,
  keyframes: buildKeyframes(STEAL_ATTEMPT_JOINT_ANIMATIONS, STEAL_ATTEMPT_POSITION_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "upperBody", priority: 8 },
  ],
};

export const STEAL_ATTEMPT_MOTION_CONFIG: MotionConfig = {
  motionData: STEAL_ATTEMPT_MOTION,
  isDefault: false,
  blendDuration: 0.05,
  priority: 45,
  interruptible: false,
};

// ==============================
// パスカット
// ==============================

/**
 * パスカットモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 100ms = 0.1秒
 * - activeTime: 800ms = 0.8秒（カット可能時間）
 * - recoveryTime: 200ms = 0.2秒
 */
const INTERCEPT_T0 = 0.0;
const INTERCEPT_T1 = 0.1;    // startupTime
const INTERCEPT_T2 = 0.5;    // activeTime中盤
const INTERCEPT_T3 = 0.9;    // activeTime終了
const INTERCEPT_T4 = 1.1;    // recoveryTime終了

const PASS_INTERCEPT_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：やや前傾、構え
  upperBodyX: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 10, [INTERCEPT_T2]: 15, [INTERCEPT_T3]: 15, [INTERCEPT_T4]: 0},
  upperBodyY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  upperBodyZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},

  lowerBodyX: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  lowerBodyY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  lowerBodyZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},

  headX: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 5, [INTERCEPT_T2]: 5, [INTERCEPT_T3]: 5, [INTERCEPT_T4]: 0},
  headY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  headZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},

  // 両腕：広げて構える
  rightShoulderX: {[INTERCEPT_T0]: -45, [INTERCEPT_T1]: -70, [INTERCEPT_T2]: -75, [INTERCEPT_T3]: -75, [INTERCEPT_T4]: -45},
  rightShoulderY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: -40, [INTERCEPT_T2]: -50, [INTERCEPT_T3]: -50, [INTERCEPT_T4]: 0},
  rightShoulderZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: -30, [INTERCEPT_T2]: -35, [INTERCEPT_T3]: -35, [INTERCEPT_T4]: 0},

  rightElbowX: {[INTERCEPT_T0]: 45, [INTERCEPT_T1]: 30, [INTERCEPT_T2]: 25, [INTERCEPT_T3]: 25, [INTERCEPT_T4]: 45},
  rightElbowY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  rightElbowZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},

  leftShoulderX: {[INTERCEPT_T0]: -45, [INTERCEPT_T1]: -70, [INTERCEPT_T2]: -75, [INTERCEPT_T3]: -75, [INTERCEPT_T4]: -45},
  leftShoulderY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 40, [INTERCEPT_T2]: 50, [INTERCEPT_T3]: 50, [INTERCEPT_T4]: 0},
  leftShoulderZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 30, [INTERCEPT_T2]: 35, [INTERCEPT_T3]: 35, [INTERCEPT_T4]: 0},

  leftElbowX: {[INTERCEPT_T0]: 45, [INTERCEPT_T1]: 30, [INTERCEPT_T2]: 25, [INTERCEPT_T3]: 25, [INTERCEPT_T4]: 45},
  leftElbowY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  leftElbowZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},

  // 脚：低い構え
  leftHipX: {[INTERCEPT_T0]: -30, [INTERCEPT_T1]: -50, [INTERCEPT_T2]: -55, [INTERCEPT_T3]: -55, [INTERCEPT_T4]: -30},
  leftHipY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  leftHipZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: -10, [INTERCEPT_T2]: -15, [INTERCEPT_T3]: -15, [INTERCEPT_T4]: 0},

  rightHipX: {[INTERCEPT_T0]: -30, [INTERCEPT_T1]: -50, [INTERCEPT_T2]: -55, [INTERCEPT_T3]: -55, [INTERCEPT_T4]: -30},
  rightHipY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  rightHipZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 10, [INTERCEPT_T2]: 15, [INTERCEPT_T3]: 15, [INTERCEPT_T4]: 0},

  leftKneeX: {[INTERCEPT_T0]: 50, [INTERCEPT_T1]: 80, [INTERCEPT_T2]: 90, [INTERCEPT_T3]: 90, [INTERCEPT_T4]: 50},
  leftKneeY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  leftKneeZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},

  rightKneeX: {[INTERCEPT_T0]: 50, [INTERCEPT_T1]: 80, [INTERCEPT_T2]: 90, [INTERCEPT_T3]: 90, [INTERCEPT_T4]: 50},
  rightKneeY: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  rightKneeZ: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
};

const PASS_INTERCEPT_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
  y: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: -0.2, [INTERCEPT_T2]: -0.3, [INTERCEPT_T3]: -0.3, [INTERCEPT_T4]: 0},
  z: {[INTERCEPT_T0]: 0, [INTERCEPT_T1]: 0, [INTERCEPT_T2]: 0, [INTERCEPT_T3]: 0, [INTERCEPT_T4]: 0},
};

export const PASS_INTERCEPT_MOTION: MotionData = {
  name: "pass_intercept",
  duration: INTERCEPT_T4,
  loop: false,
  keyframes: buildKeyframes(PASS_INTERCEPT_JOINT_ANIMATIONS, PASS_INTERCEPT_POSITION_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
  ],
};

export const PASS_INTERCEPT_MOTION_CONFIG: MotionConfig = {
  motionData: PASS_INTERCEPT_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 40,
  interruptible: true,
};

// ==============================
// ディフェンス構え
// ==============================

/**
 * ディフェンス構えモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 100ms = 0.1秒
 * - activeTime: -1（継続）
 * - recoveryTime: 150ms = 0.15秒
 *
 * ループモーションとして設計
 */
const STANCE_T0 = 0.0;
const STANCE_T1 = 0.1;    // startupTime（構え完了）
const STANCE_T2 = 0.5;    // 揺れ（小さな動き）
const STANCE_T3 = 1.0;    // ループポイント

const DEFENSE_STANCE_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：やや前傾、左右に小さく揺れる
  upperBodyX: {[STANCE_T0]: 0, [STANCE_T1]: 15, [STANCE_T2]: 17, [STANCE_T3]: 15},
  upperBodyY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 3, [STANCE_T3]: 0},
  upperBodyZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  lowerBodyX: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  lowerBodyY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  lowerBodyZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  headX: {[STANCE_T0]: 0, [STANCE_T1]: 5, [STANCE_T2]: 7, [STANCE_T3]: 5},
  headY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: -3, [STANCE_T3]: 0},
  headZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  // 両腕：広げて構える、小さく揺れる
  rightShoulderX: {[STANCE_T0]: -45, [STANCE_T1]: -60, [STANCE_T2]: -65, [STANCE_T3]: -60},
  rightShoulderY: {[STANCE_T0]: 0, [STANCE_T1]: -30, [STANCE_T2]: -32, [STANCE_T3]: -30},
  rightShoulderZ: {[STANCE_T0]: 0, [STANCE_T1]: 20, [STANCE_T2]: 22, [STANCE_T3]: 20},

  rightElbowX: {[STANCE_T0]: 45, [STANCE_T1]: 60, [STANCE_T2]: 65, [STANCE_T3]: 60},
  rightElbowY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  rightElbowZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  leftShoulderX: {[STANCE_T0]: -45, [STANCE_T1]: -60, [STANCE_T2]: -62, [STANCE_T3]: -60},
  leftShoulderY: {[STANCE_T0]: 0, [STANCE_T1]: 30, [STANCE_T2]: 28, [STANCE_T3]: 30},
  leftShoulderZ: {[STANCE_T0]: 0, [STANCE_T1]: -20, [STANCE_T2]: -18, [STANCE_T3]: -20},

  leftElbowX: {[STANCE_T0]: 45, [STANCE_T1]: 60, [STANCE_T2]: 62, [STANCE_T3]: 60},
  leftElbowY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  leftElbowZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  // 脚：低い構え、小さく揺れる
  leftHipX: {[STANCE_T0]: -30, [STANCE_T1]: -55, [STANCE_T2]: -57, [STANCE_T3]: -55},
  leftHipY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  leftHipZ: {[STANCE_T0]: 0, [STANCE_T1]: -15, [STANCE_T2]: -17, [STANCE_T3]: -15},

  rightHipX: {[STANCE_T0]: -30, [STANCE_T1]: -55, [STANCE_T2]: -53, [STANCE_T3]: -55},
  rightHipY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  rightHipZ: {[STANCE_T0]: 0, [STANCE_T1]: 15, [STANCE_T2]: 13, [STANCE_T3]: 15},

  leftKneeX: {[STANCE_T0]: 50, [STANCE_T1]: 90, [STANCE_T2]: 95, [STANCE_T3]: 90},
  leftKneeY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  leftKneeZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  rightKneeX: {[STANCE_T0]: 50, [STANCE_T1]: 90, [STANCE_T2]: 85, [STANCE_T3]: 90},
  rightKneeY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  rightKneeZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
};

const DEFENSE_STANCE_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0.03, [STANCE_T3]: 0},
  y: {[STANCE_T0]: 0, [STANCE_T1]: -0.35, [STANCE_T2]: -0.37, [STANCE_T3]: -0.35},
  z: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
};

export const DEFENSE_STANCE_MOTION: MotionData = {
  name: "defense_stance",
  duration: STANCE_T3,
  loop: true,  // ループモーション
  keyframes: buildKeyframes(DEFENSE_STANCE_JOINT_ANIMATIONS, DEFENSE_STANCE_POSITION_ANIMATIONS),
  priorities: [
    { jointName: "leftHip", priority: 9 },
    { jointName: "rightHip", priority: 9 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    { jointName: "rightShoulder", priority: 8 },
    { jointName: "leftShoulder", priority: 8 },
    { jointName: "upperBody", priority: 7 },
  ],
};

export const DEFENSE_STANCE_MOTION_CONFIG: MotionConfig = {
  motionData: DEFENSE_STANCE_MOTION,
  isDefault: false,
  blendDuration: 0.15,
  priority: 20,
  interruptible: true,
};

// ==============================
// エクスポート
// ==============================

/**
 * ディフェンスモーションマップ
 */
export const DEFENSE_MOTIONS = {
  block_shot: BLOCK_SHOT_MOTION,
  steal_attempt: STEAL_ATTEMPT_MOTION,
  pass_intercept: PASS_INTERCEPT_MOTION,
  defense_stance: DEFENSE_STANCE_MOTION,
};

/**
 * ディフェンスモーションコンフィグマップ
 */
export const DEFENSE_MOTION_CONFIGS = {
  block_shot: BLOCK_SHOT_MOTION_CONFIG,
  steal_attempt: STEAL_ATTEMPT_MOTION_CONFIG,
  pass_intercept: PASS_INTERCEPT_MOTION_CONFIG,
  defense_stance: DEFENSE_STANCE_MOTION_CONFIG,
};
