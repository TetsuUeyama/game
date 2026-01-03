import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes, createDerivedMotion } from "../utils/MotionUtils";
import { IDLE_JOINT_ANIMATIONS, T0 as IDLE_T0, T1 as IDLE_T1, T2 as IDLE_T2, T3 as IDLE_T3, T4 as IDLE_T4 } from "./IdleMotion";

/**
 * 前進（歩行）モーション
 * IDLE_MOTIONをベースに、歩行の動きを追加
 *
 * キーフレーム構成：
 * - T0: 開始姿勢（直立）
 * - T1: 左足前、右腕前
 * - T2: 両足揃う（中間姿勢）
 * - T3: 右足前、左腕前
 * - T4: 両足揃う（ループ開始地点）
 */

// ===== WALK_FORWARD =====
export const WF_T0 = 0.0;
export const WF_T1 = 0.25;
export const WF_T2 = 0.5;
export const WF_T3 = 0.75;
export const WF_T4 = 1.0;

// アイドリングモーション（T0）からの追加値
const WF_ADDITIONS = {
  upperBodyX: [2.5, 5, 0, 5, 0],
  upperBodyY: [0, -10, 0, 10, 0],
  upperBodyZ: [0, 0, 0, 0, 0],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [0, 0, 0, 0, 0],
  lowerBodyZ: [0, 0, 0, 0, 0],

  headX: [-1.5, -3, 0, -3, 0],
  headY: [0, 10, 0, -10, 0],
  headZ: [0, 0, 0, 0, 0],

  leftShoulderX: [0, 35, 0, -35, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, 0, 0, 0, 0],

  rightShoulderX: [-17.5, -35, 0, 35, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, 0, 0, 0, 0],

  leftElbowX: [0, -10, 0, -10, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 0, 0, 0, 0],

  rightElbowX: [0, -10, 0, -10, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 0, 0, 0, 0],

  leftHipX: [-17.5, -35, 0, 25, 0],
  leftHipY: [15, 15, 15, 15, 15],
  leftHipZ: [8, 8, 8, 8, 8],

  rightHipX: [0, 25, 0, -35, 0],
  rightHipY: [-15, -15, -15, -15, -15],
  rightHipZ: [-8, -8, -8, -8, -8],

  leftKneeX: [9, 18, -5, 18, 0],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [-5, -5, -5, -5, -5],

  rightKneeX: [9, 18, -5, 18, 0],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [5, 5, 5, 5, 5],
};

// アイドリングモーションの各キーフレーム姿勢に追加値を加算したジョイントアニメーション
export const WF_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS,
  [IDLE_T0, IDLE_T1, IDLE_T2, IDLE_T3, IDLE_T4],
  [WF_T0, WF_T1, WF_T2, WF_T3, WF_T4],
  WF_ADDITIONS
);

const WF_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WF_T0]: 0, [WF_T1]: -0.05, [WF_T2]: 0, [WF_T3]: -0.05, [WF_T4]: 0},
};

export const WALK_FORWARD_MOTION: MotionData = {
  name: "walk_forward",
  duration: WF_T4,
  loop: true,
  keyframes: buildKeyframes(WF_JOINT_ANIMATIONS, WF_POSITION_ANIMATIONS),
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
export const WB_T0 = 0.0;
export const WB_T1 = 0.25;
export const WB_T2 = 0.5;
export const WB_T3 = 0.75;
export const WB_T4 = 1.0;

// アイドリングモーション（T0）からの追加値
const WB_ADDITIONS = {
  upperBodyX: [5, 5, 5, 5, 5],
  upperBodyY: [0, 0, 0, 0, 0],
  upperBodyZ: [0, 0, 0, 0, 0],

  lowerBodyX: [-5, -5, -5, -5, -5],
  lowerBodyY: [0, 0, 0, 0, 0],
  lowerBodyZ: [0, 0, 0, 0, 0],

  headX: [3, 3, 3, 3, 3],
  headY: [0, 0, 0, 0, 0],
  headZ: [0, 0, 0, 0, 0],

  leftShoulderX: [0, 25, 0, -25, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, 0, 0, 0, 0],

  rightShoulderX: [0, -25, 0, 25, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, 0, 0, 0, 0],

  leftElbowX: [0, -10, 0, -10, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 0, 0, 0, 0],

  rightElbowX: [0, -10, 0, -10, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 0, 0, 0, 0],

  leftHipX: [0, -15, 0, 25, 0],
  leftHipY: [15, 15, 15, 15, 15],
  leftHipZ: [8, 8, 8, 8, 8],

  rightHipX: [0, 25, 0, -15, 0],
  rightHipY: [-15, -15, -15, -15, -15],
  rightHipZ: [-8, -8, -8, -8, -8],

  leftKneeX: [-5, 18 -5, 18, -5],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [-5, -5, -5, -5, -5],

  rightKneeX: [-5, 18, -5, 18, -5],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [5, 5, 5, 5, 5],
};

// アイドリングモーションの各キーフレーム姿勢に追加値を加算したジョイントアニメーション
export const WB_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS,
  [IDLE_T0, IDLE_T1, IDLE_T2, IDLE_T3, IDLE_T4],
  [WB_T0, WB_T1, WB_T2, WB_T3, WB_T4],
  WB_ADDITIONS
);

const WB_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WB_T0]: 0, [WB_T1]: -0.05, [WB_T2]: 0, [WB_T3]: -0.05, [WB_T4]: 0},
};

export const WALK_BACKWARD_MOTION: MotionData = {
  name: "walk_backward",
  duration: WB_T4,
  loop: true,
  keyframes: buildKeyframes(WB_JOINT_ANIMATIONS, WB_POSITION_ANIMATIONS),
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
export const WL_T0 = 0.0;
export const WL_T1 = 0.25;
export const WL_T2 = 0.5;
export const WL_T3 = 0.75;
export const WL_T4 = 1.0;

// アイドリングモーション（T0）からの追加値
const WL_ADDITIONS = {
  upperBodyX: [0, 0, 0, 0, 0],
  upperBodyY: [0, 0, 0, 0, 0],
  upperBodyZ: [-3, -4, -3, -4, -3],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [0, 0, 0, 0, 0],
  lowerBodyZ: [3, 2, 3, 2, 2],

  headX: [0, 0, 0, 0, 0],
  headY: [0, 0, 0, 0, 0],
  headZ: [3, 5, 3, 5, 3],

  leftShoulderX: [0, 0, 0, 0, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, -5, 0, -5, 0],

  rightShoulderX: [0, 0, 0, 0, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [5, 10, 5, 10, 5],

  leftElbowX: [2, -4, 2, -4, 2],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [2, 19, 2, 19, 2],

  rightElbowX: [2, -4, 2, 2, -4],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [-5, -9, -5, -9, -5],

  leftHipX: [0, 0, 0, 0, 0],
  leftHipY: [15, 0, 15, 15, 15],
  leftHipZ: [-9, 1, -9, 1, -9],

  rightHipX: [0, 0, 0, 0, 0],
  rightHipY: [-15, -5, -15, -15, -15],
  rightHipZ: [5, 0, 5, 0, 5],

  leftKneeX: [-5, 0, -5, -5, -5],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [3, 3, 3, 3, 3],

  rightKneeX: [-5, -5, -5, -5, -5],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [-3, -3, -3, -3, -3],
};

// アイドリングモーションの各キーフレーム姿勢に追加値を加算したジョイントアニメーション
export const WL_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS,
  [IDLE_T0, IDLE_T1, IDLE_T2, IDLE_T3, IDLE_T4],
  [WL_T0, WL_T1, WL_T2, WL_T3, WL_T4],
  WL_ADDITIONS
);

const WL_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WL_T0]: 0, [WL_T1]: -0.05, [WL_T2]: 0, [WL_T3]: -0.05, [WL_T4]: 0},
};

export const WALK_LEFT_MOTION: MotionData = {
  name: "walk_left",
  duration: WL_T2,
  loop: true,
  keyframes: buildKeyframes(WL_JOINT_ANIMATIONS, WL_POSITION_ANIMATIONS),
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
export const WR_T0 = 0.0;
export const WR_T1 = 0.25;
export const WR_T2 = 0.5;
export const WR_T3 = 0.75;
export const WR_T4 = 1.0;

// アイドリングモーション（T0）からの追加値
const WR_ADDITIONS = {
  upperBodyX: [0, 0, 0, 0, 0],
  upperBodyY: [0, 0, 0, 0, 0],
  upperBodyZ: [3, 4, 3, 4, 3],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [0, 0, 0, 0, 0],
  lowerBodyZ: [-3, -2, -3, -2, -2],

  headX: [0, 0, 0, 0, 0],
  headY: [0, 0, 0, 0, 0],
  headZ: [-3, -5, -3, -5, -3],

  leftShoulderX: [0, 0, 0, 0, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [-5, -10, -5, -10, -5],


  rightShoulderX: [0, 0, 0, 0, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, 5, 0, 5, 0],

  leftElbowX: [2, -4, 2, 2, -4],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [5, 9, 5, 9, 5],

  rightElbowX: [2, -4, 2, -4, 2],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [-2, -19, -2, -19, -2],

  leftHipX: [0, 0, 0, 0, 0],
  leftHipY: [15, 5, 15, 15, 15],
  leftHipZ: [-5, 0, -5, 0, -5],

  rightHipX: [0, 0, 0, 0, 0],
  rightHipY: [-15, 0, -15, -15, -15],
  rightHipZ: [9, -1, 9, -1, 9],

  leftKneeX: [-5, -5, -5, -5, -5],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [3, 3, 3, 3, 3],

  rightKneeX: [-5, 0, -5, -5, -5],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [-3, -3, -3, -3, -3],
};

// アイドリングモーションの各キーフレーム姿勢に追加値を加算したジョイントアニメーション
export const WR_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS,
  [IDLE_T0, IDLE_T1, IDLE_T2, IDLE_T3, IDLE_T4],
  [WR_T0, WR_T1, WR_T2, WR_T3, WR_T4],
  WR_ADDITIONS
);

const WR_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WR_T0]: 0, [WR_T1]: -0.05, [WR_T2]: 0, [WR_T3]: -0.05, [WR_T4]: 0},
};

export const WALK_RIGHT_MOTION: MotionData = {
  name: "walk_right",
  duration: WR_T2,
  loop: true,
  keyframes: buildKeyframes(WR_JOINT_ANIMATIONS, WR_POSITION_ANIMATIONS),
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
