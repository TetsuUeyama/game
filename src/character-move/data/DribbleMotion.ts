import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";

/**
 * ドリブル突破モーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 100ms = 0.1秒（素早い開始）
 * - activeTime: 500ms = 0.5秒（突破時間）
 * - recoveryTime: 200ms = 0.2秒
 *
 * キーフレーム構成：
 * - T0: 構え
 * - T1: 突破開始（startupTime）
 * - T2: 突破中盤
 * - T3: 突破終了（activeTime終了）
 * - T4: 元に戻る（recoveryTime終了）
 */
const DRIBBLE_T0 = 0.0;
const DRIBBLE_T1 = 0.1;    // startupTime
const DRIBBLE_T2 = 0.35;   // activeTime中盤
const DRIBBLE_T3 = 0.6;    // activeTime終了
const DRIBBLE_T4 = 0.8;    // recoveryTime終了

const DRIBBLE_BREAKTHROUGH_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：前傾して勢いをつける
  upperBodyX: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 25, [DRIBBLE_T2]: 35, [DRIBBLE_T3]: 30, [DRIBBLE_T4]: 0},
  upperBodyY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  upperBodyZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  lowerBodyX: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  lowerBodyY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  lowerBodyZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  headX: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 10, [DRIBBLE_T2]: 15, [DRIBBLE_T3]: 10, [DRIBBLE_T4]: 0},
  headY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  headZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  // 腕：ドリブルの動き
  rightShoulderX: {[DRIBBLE_T0]: -30, [DRIBBLE_T1]: -45, [DRIBBLE_T2]: -60, [DRIBBLE_T3]: -50, [DRIBBLE_T4]: -30},
  rightShoulderY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: -20, [DRIBBLE_T2]: -30, [DRIBBLE_T3]: -25, [DRIBBLE_T4]: 0},
  rightShoulderZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  rightElbowX: {[DRIBBLE_T0]: -45, [DRIBBLE_T1]: -60, [DRIBBLE_T2]: -80, [DRIBBLE_T3]: -70, [DRIBBLE_T4]: -45},
  rightElbowY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  rightElbowZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  // 左腕：バランス
  leftShoulderX: {[DRIBBLE_T0]: -30, [DRIBBLE_T1]: -50, [DRIBBLE_T2]: -70, [DRIBBLE_T3]: -55, [DRIBBLE_T4]: -30},
  leftShoulderY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 20, [DRIBBLE_T2]: 30, [DRIBBLE_T3]: 25, [DRIBBLE_T4]: 0},
  leftShoulderZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  leftElbowX: {[DRIBBLE_T0]: -45, [DRIBBLE_T1]: -50, [DRIBBLE_T2]: -40, [DRIBBLE_T3]: -45, [DRIBBLE_T4]: -45},
  leftElbowY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  leftElbowZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  // 脚：走る動き
  leftHipX: {[DRIBBLE_T0]: -30, [DRIBBLE_T1]: -60, [DRIBBLE_T2]: -20, [DRIBBLE_T3]: -50, [DRIBBLE_T4]: -30},
  leftHipY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  leftHipZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  rightHipX: {[DRIBBLE_T0]: -30, [DRIBBLE_T1]: -20, [DRIBBLE_T2]: -60, [DRIBBLE_T3]: -30, [DRIBBLE_T4]: -30},
  rightHipY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  rightHipZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  leftKneeX: {[DRIBBLE_T0]: 50, [DRIBBLE_T1]: 80, [DRIBBLE_T2]: 30, [DRIBBLE_T3]: 70, [DRIBBLE_T4]: 50},
  leftKneeY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  leftKneeZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},

  rightKneeX: {[DRIBBLE_T0]: 50, [DRIBBLE_T1]: 30, [DRIBBLE_T2]: 80, [DRIBBLE_T3]: 40, [DRIBBLE_T4]: 50},
  rightKneeY: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  rightKneeZ: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
};

const DRIBBLE_BREAKTHROUGH_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
  y: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: -0.1, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: -0.05, [DRIBBLE_T4]: 0},
  z: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0.1, [DRIBBLE_T2]: 0.3, [DRIBBLE_T3]: 0.2, [DRIBBLE_T4]: 0},
};

export const DRIBBLE_BREAKTHROUGH_MOTION: MotionData = {
  name: "dribble_breakthrough",
  duration: DRIBBLE_T4,
  loop: false,
  keyframes: buildKeyframes(DRIBBLE_BREAKTHROUGH_JOINT_ANIMATIONS, DRIBBLE_BREAKTHROUGH_POSITION_ANIMATIONS),
  priorities: [
    { jointName: "upperBody", priority: 10 },
    { jointName: "leftHip", priority: 9 },
    { jointName: "rightHip", priority: 9 },
    { jointName: "leftKnee", priority: 8 },
    { jointName: "rightKnee", priority: 8 },
  ],
};

export const DRIBBLE_BREAKTHROUGH_MOTION_CONFIG: MotionConfig = {
  motionData: DRIBBLE_BREAKTHROUGH_MOTION,
  isDefault: false,
  blendDuration: 0.05,
  priority: 45,
  interruptible: false,
};

/**
 * ドリブルモーションマップ
 */
export const DRIBBLE_MOTIONS = {
  dribble_breakthrough: DRIBBLE_BREAKTHROUGH_MOTION,
};

/**
 * ドリブルモーションコンフィグマップ
 */
export const DRIBBLE_MOTION_CONFIGS = {
  dribble_breakthrough: DRIBBLE_BREAKTHROUGH_MOTION_CONFIG,
};
