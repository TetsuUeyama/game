import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";

/**
 * 前進ダッシュモーション
 */

const DF_T0 = 0.0;
const DF_T1 = 0.2;
const DF_T2 = 0.4;

const DF_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[DF_T0]: 30, [DF_T1]: 35, [DF_T2]: 10},
  upperBodyY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  upperBodyZ: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},

  lowerBodyX: {[DF_T0]: -10, [DF_T1]: -15, [DF_T2]: -5},
  lowerBodyY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  lowerBodyZ: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},

  headX: {[DF_T0]: -10, [DF_T1]: -15, [DF_T2]: 0},
  headY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  headZ: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},

  leftShoulderX: {[DF_T0]: -40, [DF_T1]: 40, [DF_T2]: -20},
  leftShoulderY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  leftShoulderZ: {[DF_T0]: -30, [DF_T1]: -20, [DF_T2]: -15},

  rightShoulderX: {[DF_T0]: 40, [DF_T1]: -40, [DF_T2]: 20},
  rightShoulderY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  rightShoulderZ: {[DF_T0]: 20, [DF_T1]: 30, [DF_T2]: 15},

  leftElbowX: {[DF_T0]: 60, [DF_T1]: 60, [DF_T2]: 30},
  leftElbowY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  leftElbowZ: {[DF_T0]: -20, [DF_T1]: -20, [DF_T2]: -10},

  rightElbowX: {[DF_T0]: 60, [DF_T1]: 60, [DF_T2]: 30},
  rightElbowY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  rightElbowZ: {[DF_T0]: 20, [DF_T1]: 20, [DF_T2]: 10},

  leftHipX: {[DF_T0]: -50, [DF_T1]: 10, [DF_T2]: -20},
  leftHipY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  leftHipZ: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},

  rightHipX: {[DF_T0]: 10, [DF_T1]: -50, [DF_T2]: -5},
  rightHipY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  rightHipZ: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},

  leftKneeX: {[DF_T0]: 70, [DF_T1]: 20, [DF_T2]: 30},
  leftKneeY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  leftKneeZ: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},

  rightKneeX: {[DF_T0]: 20, [DF_T1]: 70, [DF_T2]: 10},
  rightKneeY: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  rightKneeZ: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
};

const DF_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  y: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0},
  z: {[DF_T0]: 0.5, [DF_T1]: 1.5, [DF_T2]: 3.0},
};

export const DASH_FORWARD_MOTION: MotionData = {
  name: "dash_forward",
  duration: DF_T2,
  loop: false,
  keyframes: buildKeyframes(DF_JOINT_ANIMATIONS, DF_POSITION_ANIMATIONS),
};

export const DASH_FORWARD_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_FORWARD_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 後退ダッシュモーション
 */

const DB_T0 = 0.0;
const DB_T1 = 0.2;
const DB_T2 = 0.4;

const DB_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[DB_T0]: -10, [DB_T1]: -15, [DB_T2]: -5},
  upperBodyY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  upperBodyZ: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},

  lowerBodyX: {[DB_T0]: 5, [DB_T1]: 10, [DB_T2]: 0},
  lowerBodyY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  lowerBodyZ: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},

  headX: {[DB_T0]: 5, [DB_T1]: 10, [DB_T2]: 0},
  headY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  headZ: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},

  leftShoulderX: {[DB_T0]: -30, [DB_T1]: -30, [DB_T2]: -15},
  leftShoulderY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  leftShoulderZ: {[DB_T0]: -20, [DB_T1]: -20, [DB_T2]: -10},

  rightShoulderX: {[DB_T0]: -30, [DB_T1]: -30, [DB_T2]: -15},
  rightShoulderY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  rightShoulderZ: {[DB_T0]: 20, [DB_T1]: 20, [DB_T2]: 10},

  leftElbowX: {[DB_T0]: 40, [DB_T1]: 40, [DB_T2]: 20},
  leftElbowY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  leftElbowZ: {[DB_T0]: -15, [DB_T1]: -15, [DB_T2]: -10},

  rightElbowX: {[DB_T0]: 40, [DB_T1]: 40, [DB_T2]: 20},
  rightElbowY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  rightElbowZ: {[DB_T0]: 15, [DB_T1]: 15, [DB_T2]: 10},

  leftHipX: {[DB_T0]: -30, [DB_T1]: -10, [DB_T2]: -5},
  leftHipY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  leftHipZ: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},

  rightHipX: {[DB_T0]: -10, [DB_T1]: -30, [DB_T2]: -10},
  rightHipY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  rightHipZ: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},

  leftKneeX: {[DB_T0]: 40, [DB_T1]: 15, [DB_T2]: 10},
  leftKneeY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  leftKneeZ: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},

  rightKneeX: {[DB_T0]: 15, [DB_T1]: 40, [DB_T2]: 15},
  rightKneeY: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  rightKneeZ: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
};

const DB_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  y: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0},
  z: {[DB_T0]: -0.5, [DB_T1]: -1.5, [DB_T2]: -3.0},
};

export const DASH_BACKWARD_MOTION: MotionData = {
  name: "dash_backward",
  duration: DB_T2,
  loop: false,
  keyframes: buildKeyframes(DB_JOINT_ANIMATIONS, DB_POSITION_ANIMATIONS),
};

export const DASH_BACKWARD_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_BACKWARD_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 左ダッシュモーション
 */

const DL_T0 = 0.0;
const DL_T1 = 0.2;
const DL_T2 = 0.4;

const DL_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[DL_T0]: 5, [DL_T1]: 5, [DL_T2]: 0},
  upperBodyY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  upperBodyZ: {[DL_T0]: -20, [DL_T1]: -25, [DL_T2]: -10},

  lowerBodyX: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  lowerBodyY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  lowerBodyZ: {[DL_T0]: 10, [DL_T1]: 15, [DL_T2]: 5},

  headX: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  headY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  headZ: {[DL_T0]: 10, [DL_T1]: 15, [DL_T2]: 5},

  leftShoulderX: {[DL_T0]: -20, [DL_T1]: -10, [DL_T2]: 0},
  leftShoulderY: {[DL_T0]: -20, [DL_T1]: -20, [DL_T2]: -10},
  leftShoulderZ: {[DL_T0]: -25, [DL_T1]: -20, [DL_T2]: -15},

  rightShoulderX: {[DL_T0]: -10, [DL_T1]: -20, [DL_T2]: 0},
  rightShoulderY: {[DL_T0]: 20, [DL_T1]: 20, [DL_T2]: 10},
  rightShoulderZ: {[DL_T0]: 20, [DL_T1]: 25, [DL_T2]: 15},

  leftElbowX: {[DL_T0]: 50, [DL_T1]: 30, [DL_T2]: 10},
  leftElbowY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  leftElbowZ: {[DL_T0]: -20, [DL_T1]: -15, [DL_T2]: -10},

  rightElbowX: {[DL_T0]: 30, [DL_T1]: 50, [DL_T2]: 10},
  rightElbowY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  rightElbowZ: {[DL_T0]: 15, [DL_T1]: 20, [DL_T2]: 10},

  leftHipX: {[DL_T0]: -40, [DL_T1]: -10, [DL_T2]: -10},
  leftHipY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  leftHipZ: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},

  rightHipX: {[DL_T0]: -10, [DL_T1]: -40, [DL_T2]: -5},
  rightHipY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  rightHipZ: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},

  leftKneeX: {[DL_T0]: 50, [DL_T1]: 20, [DL_T2]: 20},
  leftKneeY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  leftKneeZ: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},

  rightKneeX: {[DL_T0]: 20, [DL_T1]: 50, [DL_T2]: 10},
  rightKneeY: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  rightKneeZ: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
};

const DL_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[DL_T0]: -0.5, [DL_T1]: -1.5, [DL_T2]: -3.0},
  y: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
  z: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0},
};

export const DASH_LEFT_MOTION: MotionData = {
  name: "dash_left",
  duration: DL_T2,
  loop: false,
  keyframes: buildKeyframes(DL_JOINT_ANIMATIONS, DL_POSITION_ANIMATIONS),
};

export const DASH_LEFT_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_LEFT_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 右ダッシュモーション
 */

const DR_T0 = 0.0;
const DR_T1 = 0.2;
const DR_T2 = 0.4;

const DR_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[DR_T0]: 5, [DR_T1]: 5, [DR_T2]: 0},
  upperBodyY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  upperBodyZ: {[DR_T0]: 20, [DR_T1]: 25, [DR_T2]: 10},

  lowerBodyX: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  lowerBodyY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  lowerBodyZ: {[DR_T0]: -10, [DR_T1]: -15, [DR_T2]: -5},

  headX: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  headY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  headZ: {[DR_T0]: -10, [DR_T1]: -15, [DR_T2]: -5},

  leftShoulderX: {[DR_T0]: -10, [DR_T1]: -20, [DR_T2]: 0},
  leftShoulderY: {[DR_T0]: -20, [DR_T1]: -20, [DR_T2]: -10},
  leftShoulderZ: {[DR_T0]: -20, [DR_T1]: -25, [DR_T2]: -15},

  rightShoulderX: {[DR_T0]: -20, [DR_T1]: -10, [DR_T2]: 0},
  rightShoulderY: {[DR_T0]: 20, [DR_T1]: 20, [DR_T2]: 10},
  rightShoulderZ: {[DR_T0]: 25, [DR_T1]: 20, [DR_T2]: 15},

  leftElbowX: {[DR_T0]: 30, [DR_T1]: 50, [DR_T2]: 10},
  leftElbowY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  leftElbowZ: {[DR_T0]: -15, [DR_T1]: -20, [DR_T2]: -10},

  rightElbowX: {[DR_T0]: 50, [DR_T1]: 30, [DR_T2]: 10},
  rightElbowY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  rightElbowZ: {[DR_T0]: 20, [DR_T1]: 15, [DR_T2]: 10},

  leftHipX: {[DR_T0]: -10, [DR_T1]: -40, [DR_T2]: -5},
  leftHipY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  leftHipZ: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},

  rightHipX: {[DR_T0]: -40, [DR_T1]: -10, [DR_T2]: -10},
  rightHipY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  rightHipZ: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},

  leftKneeX: {[DR_T0]: 20, [DR_T1]: 50, [DR_T2]: 10},
  leftKneeY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  leftKneeZ: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},

  rightKneeX: {[DR_T0]: 50, [DR_T1]: 20, [DR_T2]: 20},
  rightKneeY: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  rightKneeZ: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
};

const DR_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[DR_T0]: 0.5, [DR_T1]: 1.5, [DR_T2]: 3.0},
  y: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
  z: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0},
};

export const DASH_RIGHT_MOTION: MotionData = {
  name: "dash_right",
  duration: DR_T2,
  loop: false,
  keyframes: buildKeyframes(DR_JOINT_ANIMATIONS, DR_POSITION_ANIMATIONS),
};

export const DASH_RIGHT_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_RIGHT_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};
