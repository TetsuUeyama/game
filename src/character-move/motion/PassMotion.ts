import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";

/**
 * パスモーション
 *
 * チェストパス、バウンスパス、オーバーヘッドパスの3種類
 * ActionControllerのタイミングに合わせてキーフレームを設計
 */

// ==============================
// チェストパス
// ==============================

/**
 * チェストパスモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 200ms = 0.2秒
 * - activeTime: 100ms = 0.1秒
 * - recoveryTime: 200ms = 0.2秒
 *
 * キーフレーム構成：
 * - T0: 構え
 * - T1: ボールを胸元に引く
 * - T2: パス直前（startupTime）
 * - T3: パスリリース（activeTime終了）
 * - T4: フォロースルー（recoveryTime終了）
 */
const PASS_CHEST_T0 = 0.0;
const PASS_CHEST_T1 = 0.1;
const PASS_CHEST_T2 = 0.2;    // startupTime
const PASS_CHEST_T3 = 0.3;    // activeTime終了
const PASS_CHEST_T4 = 0.5;    // recoveryTime終了

const PASS_CHEST_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：少し前傾
  upperBodyX: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 10, [PASS_CHEST_T2]: 15, [PASS_CHEST_T3]: 20, [PASS_CHEST_T4]: 0},
  upperBodyY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  upperBodyZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  lowerBodyX: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  lowerBodyY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  lowerBodyZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  headX: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  headY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  headZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  // 両腕：胸元から前方へ押し出す
  rightShoulderX: {[PASS_CHEST_T0]: -45, [PASS_CHEST_T1]: -60, [PASS_CHEST_T2]: -70, [PASS_CHEST_T3]: -80, [PASS_CHEST_T4]: -45},
  rightShoulderY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: -10, [PASS_CHEST_T2]: -15, [PASS_CHEST_T3]: -5, [PASS_CHEST_T4]: 0},
  rightShoulderZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  rightElbowX: {[PASS_CHEST_T0]: 90, [PASS_CHEST_T1]: 110, [PASS_CHEST_T2]: 100, [PASS_CHEST_T3]: 30, [PASS_CHEST_T4]: 90},
  rightElbowY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  rightElbowZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  leftShoulderX: {[PASS_CHEST_T0]: -45, [PASS_CHEST_T1]: -60, [PASS_CHEST_T2]: -70, [PASS_CHEST_T3]: -80, [PASS_CHEST_T4]: -45},
  leftShoulderY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 10, [PASS_CHEST_T2]: 15, [PASS_CHEST_T3]: 5, [PASS_CHEST_T4]: 0},
  leftShoulderZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  leftElbowX: {[PASS_CHEST_T0]: 90, [PASS_CHEST_T1]: 110, [PASS_CHEST_T2]: 100, [PASS_CHEST_T3]: 30, [PASS_CHEST_T4]: 90},
  leftElbowY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  leftElbowZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  // 脚：安定姿勢
  leftHipX: {[PASS_CHEST_T0]: -20, [PASS_CHEST_T1]: -25, [PASS_CHEST_T2]: -25, [PASS_CHEST_T3]: -25, [PASS_CHEST_T4]: -20},
  leftHipY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  leftHipZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  rightHipX: {[PASS_CHEST_T0]: -20, [PASS_CHEST_T1]: -25, [PASS_CHEST_T2]: -25, [PASS_CHEST_T3]: -25, [PASS_CHEST_T4]: -20},
  rightHipY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  rightHipZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  leftKneeX: {[PASS_CHEST_T0]: 30, [PASS_CHEST_T1]: 35, [PASS_CHEST_T2]: 35, [PASS_CHEST_T3]: 35, [PASS_CHEST_T4]: 30},
  leftKneeY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  leftKneeZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},

  rightKneeX: {[PASS_CHEST_T0]: 30, [PASS_CHEST_T1]: 35, [PASS_CHEST_T2]: 35, [PASS_CHEST_T3]: 35, [PASS_CHEST_T4]: 30},
  rightKneeY: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
  rightKneeZ: {[PASS_CHEST_T0]: 0, [PASS_CHEST_T1]: 0, [PASS_CHEST_T2]: 0, [PASS_CHEST_T3]: 0, [PASS_CHEST_T4]: 0},
};

export const PASS_CHEST_MOTION: MotionData = {
  name: "pass_chest",
  duration: PASS_CHEST_T4,
  loop: false,
  keyframes: buildKeyframes(PASS_CHEST_JOINT_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
    { jointName: "upperBody", priority: 8 },
  ],
};

export const PASS_CHEST_MOTION_CONFIG: MotionConfig = {
  motionData: PASS_CHEST_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 35,
  interruptible: true,
};

// ==============================
// バウンスパス
// ==============================

/**
 * バウンスパスモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 250ms = 0.25秒
 * - activeTime: 100ms = 0.1秒
 * - recoveryTime: 200ms = 0.2秒
 */
const PASS_BOUNCE_T0 = 0.0;
const PASS_BOUNCE_T1 = 0.12;
const PASS_BOUNCE_T2 = 0.25;   // startupTime
const PASS_BOUNCE_T3 = 0.35;   // activeTime終了
const PASS_BOUNCE_T4 = 0.55;   // recoveryTime終了

const PASS_BOUNCE_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：前傾して下方向へ
  upperBodyX: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 20, [PASS_BOUNCE_T2]: 35, [PASS_BOUNCE_T3]: 40, [PASS_BOUNCE_T4]: 0},
  upperBodyY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  upperBodyZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  lowerBodyX: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  lowerBodyY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  lowerBodyZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  headX: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 10, [PASS_BOUNCE_T2]: 15, [PASS_BOUNCE_T3]: 10, [PASS_BOUNCE_T4]: 0},
  headY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  headZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  // 両腕：下方向へ押し出す
  rightShoulderX: {[PASS_BOUNCE_T0]: -30, [PASS_BOUNCE_T1]: -20, [PASS_BOUNCE_T2]: -10, [PASS_BOUNCE_T3]: 20, [PASS_BOUNCE_T4]: -30},
  rightShoulderY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: -15, [PASS_BOUNCE_T2]: -20, [PASS_BOUNCE_T3]: -10, [PASS_BOUNCE_T4]: 0},
  rightShoulderZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  rightElbowX: {[PASS_BOUNCE_T0]: 60, [PASS_BOUNCE_T1]: 80, [PASS_BOUNCE_T2]: 70, [PASS_BOUNCE_T3]: 20, [PASS_BOUNCE_T4]: 60},
  rightElbowY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  rightElbowZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  leftShoulderX: {[PASS_BOUNCE_T0]: -30, [PASS_BOUNCE_T1]: -20, [PASS_BOUNCE_T2]: -10, [PASS_BOUNCE_T3]: 20, [PASS_BOUNCE_T4]: -30},
  leftShoulderY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 15, [PASS_BOUNCE_T2]: 20, [PASS_BOUNCE_T3]: 10, [PASS_BOUNCE_T4]: 0},
  leftShoulderZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  leftElbowX: {[PASS_BOUNCE_T0]: 60, [PASS_BOUNCE_T1]: 80, [PASS_BOUNCE_T2]: 70, [PASS_BOUNCE_T3]: 20, [PASS_BOUNCE_T4]: 60},
  leftElbowY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  leftElbowZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  // 脚：しゃがみ姿勢
  leftHipX: {[PASS_BOUNCE_T0]: -30, [PASS_BOUNCE_T1]: -50, [PASS_BOUNCE_T2]: -60, [PASS_BOUNCE_T3]: -55, [PASS_BOUNCE_T4]: -30},
  leftHipY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  leftHipZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  rightHipX: {[PASS_BOUNCE_T0]: -30, [PASS_BOUNCE_T1]: -50, [PASS_BOUNCE_T2]: -60, [PASS_BOUNCE_T3]: -55, [PASS_BOUNCE_T4]: -30},
  rightHipY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  rightHipZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  leftKneeX: {[PASS_BOUNCE_T0]: 50, [PASS_BOUNCE_T1]: 80, [PASS_BOUNCE_T2]: 100, [PASS_BOUNCE_T3]: 90, [PASS_BOUNCE_T4]: 50},
  leftKneeY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  leftKneeZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},

  rightKneeX: {[PASS_BOUNCE_T0]: 50, [PASS_BOUNCE_T1]: 80, [PASS_BOUNCE_T2]: 100, [PASS_BOUNCE_T3]: 90, [PASS_BOUNCE_T4]: 50},
  rightKneeY: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  rightKneeZ: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
};

const PASS_BOUNCE_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
  y: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: -0.2, [PASS_BOUNCE_T2]: -0.4, [PASS_BOUNCE_T3]: -0.3, [PASS_BOUNCE_T4]: 0},
  z: {[PASS_BOUNCE_T0]: 0, [PASS_BOUNCE_T1]: 0, [PASS_BOUNCE_T2]: 0, [PASS_BOUNCE_T3]: 0, [PASS_BOUNCE_T4]: 0},
};

export const PASS_BOUNCE_MOTION: MotionData = {
  name: "pass_bounce",
  duration: PASS_BOUNCE_T4,
  loop: false,
  keyframes: buildKeyframes(PASS_BOUNCE_JOINT_ANIMATIONS, PASS_BOUNCE_POSITION_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
    { jointName: "upperBody", priority: 8 },
  ],
};

export const PASS_BOUNCE_MOTION_CONFIG: MotionConfig = {
  motionData: PASS_BOUNCE_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 35,
  interruptible: true,
};

// ==============================
// オーバーヘッドパス
// ==============================

/**
 * オーバーヘッドパスモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 300ms = 0.3秒
 * - activeTime: 150ms = 0.15秒
 * - recoveryTime: 250ms = 0.25秒
 */
const PASS_OVERHEAD_T0 = 0.0;
const PASS_OVERHEAD_T1 = 0.15;
const PASS_OVERHEAD_T2 = 0.3;    // startupTime
const PASS_OVERHEAD_T3 = 0.45;   // activeTime終了
const PASS_OVERHEAD_T4 = 0.7;    // recoveryTime終了

const PASS_OVERHEAD_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：後ろに反ってから前へ
  upperBodyX: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: -15, [PASS_OVERHEAD_T2]: -20, [PASS_OVERHEAD_T3]: 15, [PASS_OVERHEAD_T4]: 0},
  upperBodyY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  upperBodyZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},

  lowerBodyX: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  lowerBodyY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  lowerBodyZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},

  headX: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: -15, [PASS_OVERHEAD_T2]: -20, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  headY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  headZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},

  // 両腕：頭上に持ち上げて前方へ投げる
  rightShoulderX: {[PASS_OVERHEAD_T0]: -60, [PASS_OVERHEAD_T1]: -150, [PASS_OVERHEAD_T2]: -170, [PASS_OVERHEAD_T3]: -90, [PASS_OVERHEAD_T4]: -60},
  rightShoulderY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  rightShoulderZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: -20, [PASS_OVERHEAD_T2]: -30, [PASS_OVERHEAD_T3]: -10, [PASS_OVERHEAD_T4]: 0},

  rightElbowX: {[PASS_OVERHEAD_T0]: 60, [PASS_OVERHEAD_T1]: 100, [PASS_OVERHEAD_T2]: 110, [PASS_OVERHEAD_T3]: 40, [PASS_OVERHEAD_T4]: 60},
  rightElbowY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  rightElbowZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},

  leftShoulderX: {[PASS_OVERHEAD_T0]: -60, [PASS_OVERHEAD_T1]: -150, [PASS_OVERHEAD_T2]: -170, [PASS_OVERHEAD_T3]: -90, [PASS_OVERHEAD_T4]: -60},
  leftShoulderY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  leftShoulderZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 20, [PASS_OVERHEAD_T2]: 30, [PASS_OVERHEAD_T3]: 10, [PASS_OVERHEAD_T4]: 0},

  leftElbowX: {[PASS_OVERHEAD_T0]: 60, [PASS_OVERHEAD_T1]: 100, [PASS_OVERHEAD_T2]: 110, [PASS_OVERHEAD_T3]: 40, [PASS_OVERHEAD_T4]: 60},
  leftElbowY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  leftElbowZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},

  // 脚：安定姿勢
  leftHipX: {[PASS_OVERHEAD_T0]: -20, [PASS_OVERHEAD_T1]: -25, [PASS_OVERHEAD_T2]: -25, [PASS_OVERHEAD_T3]: -20, [PASS_OVERHEAD_T4]: -20},
  leftHipY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  leftHipZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},

  rightHipX: {[PASS_OVERHEAD_T0]: -20, [PASS_OVERHEAD_T1]: -25, [PASS_OVERHEAD_T2]: -25, [PASS_OVERHEAD_T3]: -20, [PASS_OVERHEAD_T4]: -20},
  rightHipY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  rightHipZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},

  leftKneeX: {[PASS_OVERHEAD_T0]: 30, [PASS_OVERHEAD_T1]: 35, [PASS_OVERHEAD_T2]: 35, [PASS_OVERHEAD_T3]: 30, [PASS_OVERHEAD_T4]: 30},
  leftKneeY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  leftKneeZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},

  rightKneeX: {[PASS_OVERHEAD_T0]: 30, [PASS_OVERHEAD_T1]: 35, [PASS_OVERHEAD_T2]: 35, [PASS_OVERHEAD_T3]: 30, [PASS_OVERHEAD_T4]: 30},
  rightKneeY: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
  rightKneeZ: {[PASS_OVERHEAD_T0]: 0, [PASS_OVERHEAD_T1]: 0, [PASS_OVERHEAD_T2]: 0, [PASS_OVERHEAD_T3]: 0, [PASS_OVERHEAD_T4]: 0},
};

export const PASS_OVERHEAD_MOTION: MotionData = {
  name: "pass_overhead",
  duration: PASS_OVERHEAD_T4,
  loop: false,
  keyframes: buildKeyframes(PASS_OVERHEAD_JOINT_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
    { jointName: "upperBody", priority: 8 },
    { jointName: "head", priority: 7 },
  ],
};

export const PASS_OVERHEAD_MOTION_CONFIG: MotionConfig = {
  motionData: PASS_OVERHEAD_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 35,
  interruptible: true,
};

// ==============================
// パスレシーブ
// ==============================

/**
 * パスレシーブモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 100ms = 0.1秒
 * - activeTime: 2000ms = 2.0秒
 *
 * 両手を前方に差し出すキャッチ構え
 * - 上半身: 軽い前傾（10-15度）
 * - 両肩: 前方に伸ばす（-60〜-70度）
 * - 両肘: 軽く曲げる（30-40度）
 * - 脚: 軽くしゃがむ安定姿勢
 */
const PASS_RECEIVE_T0 = 0.0;
const PASS_RECEIVE_T1 = 0.1;    // startupTime（構え完了）
const PASS_RECEIVE_T2 = 0.5;    // モーション終了（以降はキャッチ待ち）

const PASS_RECEIVE_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：軽い前傾
  upperBodyX: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 12, [PASS_RECEIVE_T2]: 12},
  upperBodyY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  upperBodyZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  lowerBodyX: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  lowerBodyY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  lowerBodyZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  headX: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 5, [PASS_RECEIVE_T2]: 5},
  headY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  headZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  // 両腕：前方に差し出すキャッチ構え
  rightShoulderX: {[PASS_RECEIVE_T0]: -45, [PASS_RECEIVE_T1]: -65, [PASS_RECEIVE_T2]: -65},
  rightShoulderY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: -10, [PASS_RECEIVE_T2]: -10},
  rightShoulderZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  rightElbowX: {[PASS_RECEIVE_T0]: 90, [PASS_RECEIVE_T1]: 35, [PASS_RECEIVE_T2]: 35},
  rightElbowY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  rightElbowZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  leftShoulderX: {[PASS_RECEIVE_T0]: -45, [PASS_RECEIVE_T1]: -65, [PASS_RECEIVE_T2]: -65},
  leftShoulderY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 10, [PASS_RECEIVE_T2]: 10},
  leftShoulderZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  leftElbowX: {[PASS_RECEIVE_T0]: 90, [PASS_RECEIVE_T1]: 35, [PASS_RECEIVE_T2]: 35},
  leftElbowY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  leftElbowZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  // 脚：軽くしゃがむ安定姿勢
  leftHipX: {[PASS_RECEIVE_T0]: -20, [PASS_RECEIVE_T1]: -25, [PASS_RECEIVE_T2]: -25},
  leftHipY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  leftHipZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  rightHipX: {[PASS_RECEIVE_T0]: -20, [PASS_RECEIVE_T1]: -25, [PASS_RECEIVE_T2]: -25},
  rightHipY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  rightHipZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  leftKneeX: {[PASS_RECEIVE_T0]: 30, [PASS_RECEIVE_T1]: 40, [PASS_RECEIVE_T2]: 40},
  leftKneeY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  leftKneeZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},

  rightKneeX: {[PASS_RECEIVE_T0]: 30, [PASS_RECEIVE_T1]: 40, [PASS_RECEIVE_T2]: 40},
  rightKneeY: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
  rightKneeZ: {[PASS_RECEIVE_T0]: 0, [PASS_RECEIVE_T1]: 0, [PASS_RECEIVE_T2]: 0},
};

export const PASS_RECEIVE_MOTION: MotionData = {
  name: "pass_receive",
  duration: PASS_RECEIVE_T2,
  loop: false,
  keyframes: buildKeyframes(PASS_RECEIVE_JOINT_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
    { jointName: "upperBody", priority: 8 },
  ],
};

export const PASS_RECEIVE_MOTION_CONFIG: MotionConfig = {
  motionData: PASS_RECEIVE_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 35,
  interruptible: true,
};

// ==============================
// エクスポート
// ==============================

/**
 * パスモーションマップ
 */
export const PASS_MOTIONS = {
  pass_chest: PASS_CHEST_MOTION,
  pass_bounce: PASS_BOUNCE_MOTION,
  pass_overhead: PASS_OVERHEAD_MOTION,
  pass_receive: PASS_RECEIVE_MOTION,
};

/**
 * パスモーションコンフィグマップ
 */
export const PASS_MOTION_CONFIGS = {
  pass_chest: PASS_CHEST_MOTION_CONFIG,
  pass_bounce: PASS_BOUNCE_MOTION_CONFIG,
  pass_overhead: PASS_OVERHEAD_MOTION_CONFIG,
  pass_receive: PASS_RECEIVE_MOTION_CONFIG,
};
