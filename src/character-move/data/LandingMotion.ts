import {MotionData, MotionConfig} from "../types/MotionTypes";
import {buildKeyframes} from "../utils/MotionUtils";

/**
 * 着地硬直モーション（中ジャンプ用）
 */

const L_T0 = 0.0;
const L_T1 = 0.15;
const L_T2 = 0.3;

const L_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[L_T0]: 5, [L_T1]: 3, [L_T2]: 0},
  upperBodyY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  upperBodyZ: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},

  lowerBodyX: {[L_T0]: -5, [L_T1]: -3, [L_T2]: 0},
  lowerBodyY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  lowerBodyZ: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},

  headX: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  headY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  headZ: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},

  leftShoulderX: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  leftShoulderY: {[L_T0]: -15, [L_T1]: -10, [L_T2]: 0},
  leftShoulderZ: {[L_T0]: -20, [L_T1]: -15, [L_T2]: -10},

  rightShoulderX: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  rightShoulderY: {[L_T0]: 15, [L_T1]: 10, [L_T2]: 0},
  rightShoulderZ: {[L_T0]: 20, [L_T1]: 15, [L_T2]: 10},

  leftElbowX: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  leftElbowY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  leftElbowZ: {[L_T0]: -30, [L_T1]: -20, [L_T2]: -10},

  rightElbowX: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  rightElbowY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  rightElbowZ: {[L_T0]: 30, [L_T1]: 20, [L_T2]: 10},

  leftHipX: {[L_T0]: -60, [L_T1]: -40, [L_T2]: -5},
  leftHipY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  leftHipZ: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},

  rightHipX: {[L_T0]: -60, [L_T1]: -40, [L_T2]: -5},
  rightHipY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  rightHipZ: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},

  leftKneeX: {[L_T0]: 70, [L_T1]: 50, [L_T2]: 10},
  leftKneeY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  leftKneeZ: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},

  rightKneeX: {[L_T0]: 70, [L_T1]: 50, [L_T2]: 10},
  rightKneeY: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  rightKneeZ: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
};

const L_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
  y: {[L_T0]: -0.3, [L_T1]: -0.15, [L_T2]: 0},
  z: {[L_T0]: 0, [L_T1]: 0, [L_T2]: 0},
};

export const LANDING_MOTION: MotionData = {
  name: "landing",
  duration: L_T2,
  loop: false,
  keyframes: buildKeyframes(L_JOINT_ANIMATIONS, L_POSITION_ANIMATIONS),
};

export const LANDING_MOTION_CONFIG: MotionConfig = {
  motionData: LANDING_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 5,
  interruptible: false,
};

/**
 * 小ジャンプ用の短い着地硬直モーション
 */

const LS_T0 = 0.0;
const LS_T1 = 0.1;

const LS_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[LS_T0]: 3, [LS_T1]: 0},
  upperBodyY: {[LS_T0]: 0, [LS_T1]: 0},
  upperBodyZ: {[LS_T0]: 0, [LS_T1]: 0},

  lowerBodyX: {[LS_T0]: -3, [LS_T1]: 0},
  lowerBodyY: {[LS_T0]: 0, [LS_T1]: 0},
  lowerBodyZ: {[LS_T0]: 0, [LS_T1]: 0},

  headX: {[LS_T0]: 0, [LS_T1]: 0},
  headY: {[LS_T0]: 0, [LS_T1]: 0},
  headZ: {[LS_T0]: 0, [LS_T1]: 0},

  leftShoulderX: {[LS_T0]: 0, [LS_T1]: 0},
  leftShoulderY: {[LS_T0]: -10, [LS_T1]: 0},
  leftShoulderZ: {[LS_T0]: -15, [LS_T1]: -10},

  rightShoulderX: {[LS_T0]: 0, [LS_T1]: 0},
  rightShoulderY: {[LS_T0]: 10, [LS_T1]: 0},
  rightShoulderZ: {[LS_T0]: 15, [LS_T1]: 10},

  leftElbowX: {[LS_T0]: 0, [LS_T1]: 0},
  leftElbowY: {[LS_T0]: 0, [LS_T1]: 0},
  leftElbowZ: {[LS_T0]: -20, [LS_T1]: -10},

  rightElbowX: {[LS_T0]: 0, [LS_T1]: 0},
  rightElbowY: {[LS_T0]: 0, [LS_T1]: 0},
  rightElbowZ: {[LS_T0]: 20, [LS_T1]: 10},

  leftHipX: {[LS_T0]: -40, [LS_T1]: -5},
  leftHipY: {[LS_T0]: 0, [LS_T1]: 0},
  leftHipZ: {[LS_T0]: 0, [LS_T1]: 0},

  rightHipX: {[LS_T0]: -40, [LS_T1]: -5},
  rightHipY: {[LS_T0]: 0, [LS_T1]: 0},
  rightHipZ: {[LS_T0]: 0, [LS_T1]: 0},

  leftKneeX: {[LS_T0]: 50, [LS_T1]: 10},
  leftKneeY: {[LS_T0]: 0, [LS_T1]: 0},
  leftKneeZ: {[LS_T0]: 0, [LS_T1]: 0},

  rightKneeX: {[LS_T0]: 50, [LS_T1]: 10},
  rightKneeY: {[LS_T0]: 0, [LS_T1]: 0},
  rightKneeZ: {[LS_T0]: 0, [LS_T1]: 0},
};

const LS_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[LS_T0]: 0, [LS_T1]: 0},
  y: {[LS_T0]: -0.15, [LS_T1]: 0},
  z: {[LS_T0]: 0, [LS_T1]: 0},
};

export const LANDING_SMALL_MOTION: MotionData = {
  name: "landing_small",
  duration: LS_T1,
  loop: false,
  keyframes: buildKeyframes(LS_JOINT_ANIMATIONS, LS_POSITION_ANIMATIONS),
};

export const LANDING_SMALL_MOTION_CONFIG: MotionConfig = {
  motionData: LANDING_SMALL_MOTION,
  isDefault: false,
  blendDuration: 0.05,
  priority: 5,
  interruptible: false,
};

/**
 * 大ジャンプ用の長い着地硬直モーション
 */

const LL_T0 = 0.0;
const LL_T1 = 0.1;
const LL_T2 = 0.2;
const LL_T3 = 0.3;

const LL_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[LL_T0]: 10, [LL_T1]: 8, [LL_T2]: 3, [LL_T3]: 0},
  upperBodyY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  upperBodyZ: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},

  lowerBodyX: {[LL_T0]: -10, [LL_T1]: -8, [LL_T2]: -3, [LL_T3]: 0},
  lowerBodyY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  lowerBodyZ: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},

  headX: {[LL_T0]: 5, [LL_T1]: 3, [LL_T2]: 0, [LL_T3]: 0},
  headY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  headZ: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},

  leftShoulderX: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  leftShoulderY: {[LL_T0]: -20, [LL_T1]: -15, [LL_T2]: -10, [LL_T3]: 0},
  leftShoulderZ: {[LL_T0]: -25, [LL_T1]: -20, [LL_T2]: -15, [LL_T3]: -10},

  rightShoulderX: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  rightShoulderY: {[LL_T0]: 20, [LL_T1]: 15, [LL_T2]: 10, [LL_T3]: 0},
  rightShoulderZ: {[LL_T0]: 25, [LL_T1]: 20, [LL_T2]: 15, [LL_T3]: 10},

  leftElbowX: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  leftElbowY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  leftElbowZ: {[LL_T0]: -40, [LL_T1]: -30, [LL_T2]: -20, [LL_T3]: -10},

  rightElbowX: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  rightElbowY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  rightElbowZ: {[LL_T0]: 40, [LL_T1]: 30, [LL_T2]: 20, [LL_T3]: 10},

  leftHipX: {[LL_T0]: -70, [LL_T1]: -60, [LL_T2]: -40, [LL_T3]: -5},
  leftHipY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  leftHipZ: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},

  rightHipX: {[LL_T0]: -70, [LL_T1]: -60, [LL_T2]: -40, [LL_T3]: -5},
  rightHipY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  rightHipZ: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},

  leftKneeX: {[LL_T0]: 80, [LL_T1]: 70, [LL_T2]: 50, [LL_T3]: 10},
  leftKneeY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  leftKneeZ: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},

  rightKneeX: {[LL_T0]: 80, [LL_T1]: 70, [LL_T2]: 50, [LL_T3]: 10},
  rightKneeY: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  rightKneeZ: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
};

const LL_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
  y: {[LL_T0]: -0.5, [LL_T1]: -0.3, [LL_T2]: -0.15, [LL_T3]: 0},
  z: {[LL_T0]: 0, [LL_T1]: 0, [LL_T2]: 0, [LL_T3]: 0},
};

export const LANDING_LARGE_MOTION: MotionData = {
  name: "landing_large",
  duration: LL_T3,
  loop: false,
  keyframes: buildKeyframes(LL_JOINT_ANIMATIONS, LL_POSITION_ANIMATIONS),
};

export const LANDING_LARGE_MOTION_CONFIG: MotionConfig = {
  motionData: LANDING_LARGE_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 5,
  interruptible: false,
};
