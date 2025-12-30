import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";

/**
 * 前進（歩行）モーション
 *
 * キーフレーム構成：
 * - T0: 開始姿勢（直立）
 * - T1: 左足前、右腕前
 * - T2: 両足揃う（中間姿勢）
 * - T3: 右足前、左腕前
 * - T4: 両足揃う（ループ開始地点）
 */

// ===== WALK_FORWARD =====
const WF_T0 = 0.0;
const WF_T1 = 0.25;
const WF_T2 = 0.5;
const WF_T3 = 0.75;
const WF_T4 = 1.0;

const WF_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[WF_T0]: 2.5, [WF_T1]: 5, [WF_T2]: 0, [WF_T3]: 5, [WF_T4]: 0},
  upperBodyY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  upperBodyZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  lowerBodyX: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  lowerBodyY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  lowerBodyZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  headX: {[WF_T0]: -1.5, [WF_T1]: -3, [WF_T2]: 0, [WF_T3]: -3, [WF_T4]: 0},
  headY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  headZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  leftShoulderX: {[WF_T0]: 0, [WF_T1]: 35, [WF_T2]: 0, [WF_T3]: -35, [WF_T4]: 0},
  leftShoulderY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  leftShoulderZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  rightShoulderX: {[WF_T0]: -17.5, [WF_T1]: -35, [WF_T2]: 0, [WF_T3]: 35, [WF_T4]: 0},
  rightShoulderY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  rightShoulderZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  leftElbowX: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  leftElbowY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  leftElbowZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  rightElbowX: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  rightElbowY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  rightElbowZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  leftHipX: {[WF_T0]: -17.5, [WF_T1]: -35, [WF_T2]: 0, [WF_T3]: 25, [WF_T4]: 0},
  leftHipY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  leftHipZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  rightHipX: {[WF_T0]: 0, [WF_T1]: 25, [WF_T2]: 0, [WF_T3]: -35, [WF_T4]: 0},
  rightHipY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  rightHipZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  leftKneeX: {[WF_T0]: 2.5, [WF_T1]: 10, [WF_T2]: 0, [WF_T3]: 5, [WF_T4]: 0},
  leftKneeY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  leftKneeZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},

  rightKneeX: {[WF_T0]: 0, [WF_T1]: 5, [WF_T2]: 0, [WF_T3]: 10, [WF_T4]: 0},
  rightKneeY: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
  rightKneeZ: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
};

export const WALK_FORWARD_MOTION: MotionData = {
  name: "walk_forward",
  duration: WF_T4,
  loop: true,
  keyframes: buildKeyframes(WF_JOINT_ANIMATIONS),
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

export const WALK_FORWARD_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_FORWARD_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ===== WALK_BACKWARD =====
const WB_T0 = 0.0;
const WB_T1 = 0.25;
const WB_T2 = 0.5;
const WB_T3 = 0.75;
const WB_T4 = 1.0;

const WB_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[WB_T0]: -5, [WB_T1]: -5, [WB_T2]: -5, [WB_T3]: -5, [WB_T4]: -5},
  upperBodyY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  upperBodyZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  lowerBodyX: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  lowerBodyY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  lowerBodyZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  headX: {[WB_T0]: 3, [WB_T1]: 3, [WB_T2]: 3, [WB_T3]: 3, [WB_T4]: 3},
  headY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  headZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  leftShoulderX: {[WB_T0]: 0, [WB_T1]: -25, [WB_T2]: 0, [WB_T3]: 25, [WB_T4]: 0},
  leftShoulderY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  leftShoulderZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  rightShoulderX: {[WB_T0]: 0, [WB_T1]: 25, [WB_T2]: 0, [WB_T3]: -25, [WB_T4]: 0},
  rightShoulderY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  rightShoulderZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  leftElbowX: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  leftElbowY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  leftElbowZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  rightElbowX: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  rightElbowY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  rightElbowZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  leftHipX: {[WB_T0]: 0, [WB_T1]: -15, [WB_T2]: 0, [WB_T3]: 25, [WB_T4]: 0},
  leftHipY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  leftHipZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  rightHipX: {[WB_T0]: 0, [WB_T1]: 25, [WB_T2]: 0, [WB_T3]: -15, [WB_T4]: 0},
  rightHipY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  rightHipZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  leftKneeX: {[WB_T0]: 0, [WB_T1]: 5, [WB_T2]: 0, [WB_T3]: 5, [WB_T4]: 0},
  leftKneeY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  leftKneeZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},

  rightKneeX: {[WB_T0]: 0, [WB_T1]: 5, [WB_T2]: 0, [WB_T3]: 5, [WB_T4]: 0},
  rightKneeY: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
  rightKneeZ: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
};

export const WALK_BACKWARD_MOTION: MotionData = {
  name: "walk_backward",
  duration: WB_T4,
  loop: true,
  keyframes: buildKeyframes(WB_JOINT_ANIMATIONS),
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    { jointName: "leftShoulder", priority: 8 },
    { jointName: "rightShoulder", priority: 8 },
    { jointName: "upperBody", priority: 6 },
    { jointName: "head", priority: 4 },
  ],
};

export const WALK_BACKWARD_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_BACKWARD_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ===== WALK_LEFT =====
const WL_T0 = 0.0;
const WL_T1 = 0.5;
const WL_T2 = 1.0;

const WL_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  upperBodyY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  upperBodyZ: {[WL_T0]: -5, [WL_T1]: -8, [WL_T2]: -5},

  lowerBodyX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  lowerBodyY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  lowerBodyZ: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},

  headX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  headY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  headZ: {[WL_T0]: 3, [WL_T1]: 5, [WL_T2]: 3},

  leftShoulderX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  leftShoulderY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  leftShoulderZ: {[WL_T0]: 0, [WL_T1]: 10, [WL_T2]: 0},

  rightShoulderX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  rightShoulderY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  rightShoulderZ: {[WL_T0]: 0, [WL_T1]: -10, [WL_T2]: 0},

  leftElbowX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  leftElbowY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  leftElbowZ: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},

  rightElbowX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  rightElbowY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  rightElbowZ: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},

  leftHipX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  leftHipY: {[WL_T0]: 0, [WL_T1]: -15, [WL_T2]: 0},
  leftHipZ: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},

  rightHipX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  rightHipY: {[WL_T0]: 0, [WL_T1]: 10, [WL_T2]: 0},
  rightHipZ: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},

  leftKneeX: {[WL_T0]: 0, [WL_T1]: 5, [WL_T2]: 0},
  leftKneeY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  leftKneeZ: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},

  rightKneeX: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  rightKneeY: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
  rightKneeZ: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0},
};

export const WALK_LEFT_MOTION: MotionData = {
  name: "walk_left",
  duration: WL_T2,
  loop: true,
  keyframes: buildKeyframes(WL_JOINT_ANIMATIONS),
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    { jointName: "upperBody", priority: 6 },
    { jointName: "head", priority: 4 },
  ],
};

export const WALK_LEFT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_LEFT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ===== WALK_RIGHT =====
const WR_T0 = 0.0;
const WR_T1 = 0.5;
const WR_T2 = 1.0;

const WR_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  upperBodyY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  upperBodyZ: {[WR_T0]: 5, [WR_T1]: 8, [WR_T2]: 5},

  lowerBodyX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  lowerBodyY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  lowerBodyZ: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},

  headX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  headY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  headZ: {[WR_T0]: -3, [WR_T1]: -5, [WR_T2]: -3},

  leftShoulderX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  leftShoulderY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  leftShoulderZ: {[WR_T0]: 0, [WR_T1]: 10, [WR_T2]: 0},

  rightShoulderX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  rightShoulderY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  rightShoulderZ: {[WR_T0]: 0, [WR_T1]: -10, [WR_T2]: 0},

  leftElbowX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  leftElbowY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  leftElbowZ: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},

  rightElbowX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  rightElbowY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  rightElbowZ: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},

  leftHipX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  leftHipY: {[WR_T0]: 0, [WR_T1]: -10, [WR_T2]: 0},
  leftHipZ: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},

  rightHipX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  rightHipY: {[WR_T0]: 0, [WR_T1]: 15, [WR_T2]: 0},
  rightHipZ: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},

  leftKneeX: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  leftKneeY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  leftKneeZ: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},

  rightKneeX: {[WR_T0]: 0, [WR_T1]: 5, [WR_T2]: 0},
  rightKneeY: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
  rightKneeZ: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0},
};

export const WALK_RIGHT_MOTION: MotionData = {
  name: "walk_right",
  duration: WR_T2,
  loop: true,
  keyframes: buildKeyframes(WR_JOINT_ANIMATIONS),
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    { jointName: "upperBody", priority: 6 },
    { jointName: "head", priority: 4 },
  ],
};

export const WALK_RIGHT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_RIGHT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};
