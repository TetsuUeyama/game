import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes } from "@/GamePlay/GameSystem/CharacterMove/Utils/MotionUtils";

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
  y: {[DRIBBLE_T0]: 0, [DRIBBLE_T1]: 0, [DRIBBLE_T2]: 0, [DRIBBLE_T3]: 0, [DRIBBLE_T4]: 0},
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
/**
 * ドリブル構えモーション（1on1時のオフェンス用）
 *
 * 軽く膝を曲げ、重心を低くした状態でドリブルを続ける
 * ループモーションで継続的に再生
 */
const STANCE_T0 = 0.0;
const STANCE_T1 = 0.3;  // ドリブル下
const STANCE_T2 = 0.6;  // ドリブル上
const STANCE_T3 = 0.9;  // ドリブル下（ループ）

const DRIBBLE_STANCE_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：軽く前傾
  upperBodyX: {[STANCE_T0]: 15, [STANCE_T1]: 18, [STANCE_T2]: 15, [STANCE_T3]: 18},
  upperBodyY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  upperBodyZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  lowerBodyX: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  lowerBodyY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  lowerBodyZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  headX: {[STANCE_T0]: -5, [STANCE_T1]: -5, [STANCE_T2]: -5, [STANCE_T3]: -5},
  headY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  headZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  // 右腕：ドリブルする腕（上下動）
  rightShoulderX: {[STANCE_T0]: -30, [STANCE_T1]: -50, [STANCE_T2]: -30, [STANCE_T3]: -50},
  rightShoulderY: {[STANCE_T0]: -30, [STANCE_T1]: -30, [STANCE_T2]: -30, [STANCE_T3]: -30},
  rightShoulderZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  rightElbowX: {[STANCE_T0]: -60, [STANCE_T1]: -80, [STANCE_T2]: -60, [STANCE_T3]: -80},
  rightElbowY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  rightElbowZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  // 左腕：ガード（ディフェンダーをブロック）
  leftShoulderX: {[STANCE_T0]: -40, [STANCE_T1]: -40, [STANCE_T2]: -40, [STANCE_T3]: -40},
  leftShoulderY: {[STANCE_T0]: 40, [STANCE_T1]: 40, [STANCE_T2]: 40, [STANCE_T3]: 40},
  leftShoulderZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  leftElbowX: {[STANCE_T0]: -70, [STANCE_T1]: -70, [STANCE_T2]: -70, [STANCE_T3]: -70},
  leftElbowY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  leftElbowZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  // 脚：膝を曲げた構え
  leftHipX: {[STANCE_T0]: -25, [STANCE_T1]: -25, [STANCE_T2]: -25, [STANCE_T3]: -25},
  leftHipY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  leftHipZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  rightHipX: {[STANCE_T0]: -25, [STANCE_T1]: -25, [STANCE_T2]: -25, [STANCE_T3]: -25},
  rightHipY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  rightHipZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  leftKneeX: {[STANCE_T0]: 45, [STANCE_T1]: 45, [STANCE_T2]: 45, [STANCE_T3]: 45},
  leftKneeY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  leftKneeZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},

  rightKneeX: {[STANCE_T0]: 45, [STANCE_T1]: 45, [STANCE_T2]: 45, [STANCE_T3]: 45},
  rightKneeY: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  rightKneeZ: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
};

const DRIBBLE_STANCE_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  y: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
  z: {[STANCE_T0]: 0, [STANCE_T1]: 0, [STANCE_T2]: 0, [STANCE_T3]: 0},
};

export const DRIBBLE_STANCE_MOTION: MotionData = {
  name: "dribble_stance",
  duration: STANCE_T3,
  loop: true,
  keyframes: buildKeyframes(DRIBBLE_STANCE_JOINT_ANIMATIONS, DRIBBLE_STANCE_POSITION_ANIMATIONS),
  priorities: [
    { jointName: "upperBody", priority: 10 },
    { jointName: "leftHip", priority: 9 },
    { jointName: "rightHip", priority: 9 },
    { jointName: "leftKnee", priority: 8 },
    { jointName: "rightKnee", priority: 8 },
    { jointName: "rightShoulder", priority: 8 },
    { jointName: "rightElbow", priority: 8 },
    { jointName: "leftShoulder", priority: 7 },
    { jointName: "leftElbow", priority: 7 },
  ],
};

export const DRIBBLE_STANCE_MOTION_CONFIG: MotionConfig = {
  motionData: DRIBBLE_STANCE_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 40,
  interruptible: true,
};

export const DRIBBLE_MOTIONS = {
  dribble_breakthrough: DRIBBLE_BREAKTHROUGH_MOTION,
  dribble_stance: DRIBBLE_STANCE_MOTION,
};

/**
 * ドリブルモーションコンフィグマップ
 */
export const DRIBBLE_MOTION_CONFIGS = {
  dribble_breakthrough: DRIBBLE_BREAKTHROUGH_MOTION_CONFIG,
  dribble_stance: DRIBBLE_STANCE_MOTION_CONFIG,
};
