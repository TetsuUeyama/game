import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";

/**
 * ジャンプモーション
 *
 * キーフレーム構成：
 * - T0: しゃがむ姿勢（準備）
 * - T1: ジャンプ開始（腕を振り上げる）
 * - T2: 空中姿勢（ピーク）
 * - T3: 着地準備
 * - T4: 着地完了
 */

const T0 = 0.0;
const T1 = 0.15;
const T2 = 0.3;
const T3 = 0.45;
const T4 = 0.6;

const JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[T0]: 20, [T1]: -10, [T2]: 0, [T3]: 15, [T4]: 10},
  upperBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  upperBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  lowerBodyX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  lowerBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  lowerBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  headX: {[T0]: -10, [T1]: 5, [T2]: 0, [T3]: -10, [T4]: -5},
  headY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  headZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  leftShoulderX: {[T0]: -20, [T1]: -120, [T2]: -130, [T3]: -40, [T4]: 0},
  leftShoulderY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftShoulderZ: {[T0]: 0, [T1]: -20, [T2]: -30, [T3]: -20, [T4]: 0},

  rightShoulderX: {[T0]: -20, [T1]: -120, [T2]: -130, [T3]: -40, [T4]: 0},
  rightShoulderY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightShoulderZ: {[T0]: 0, [T1]: 20, [T2]: 30, [T3]: 20, [T4]: 0},

  leftElbowX: {[T0]: 10, [T1]: 30, [T2]: 20, [T3]: 30, [T4]: 0},
  leftElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftElbowZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  rightElbowX: {[T0]: 10, [T1]: 30, [T2]: 20, [T3]: 30, [T4]: 0},
  rightElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightElbowZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  leftHipX: {[T0]: -70, [T1]: -20, [T2]: 10, [T3]: -40, [T4]: -30},
  leftHipY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftHipZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  rightHipX: {[T0]: -70, [T1]: -20, [T2]: 10, [T3]: -40, [T4]: -30},
  rightHipY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightHipZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  leftKneeX: {[T0]: 100, [T1]: 30, [T2]: 40, [T3]: 70, [T4]: 50},
  leftKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftKneeZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  rightKneeX: {[T0]: 100, [T1]: 30, [T2]: 40, [T3]: 70, [T4]: 50},
  rightKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightKneeZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
};

const POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  y: {[T0]: -0.6, [T1]: 0.5, [T2]: 1.5, [T3]: 0.5, [T4]: 0},
  z: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
};

export const JUMP_MOTION: MotionData = {
  name: "jump",
  duration: T4,
  loop: false,
  keyframes: buildKeyframes(JOINT_ANIMATIONS, POSITION_ANIMATIONS),
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 10 },
    { jointName: "rightKnee", priority: 10 },
    { jointName: "leftShoulder", priority: 9 },
    { jointName: "rightShoulder", priority: 9 },
    { jointName: "leftElbow", priority: 8 },
    { jointName: "rightElbow", priority: 8 },
    { jointName: "upperBody", priority: 7 },
    { jointName: "lowerBody", priority: 6 },
    { jointName: "head", priority: 5 },
  ],
};

export const JUMP_MOTION_CONFIG: MotionConfig = {
  motionData: JUMP_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 30,
  interruptible: false,
};
