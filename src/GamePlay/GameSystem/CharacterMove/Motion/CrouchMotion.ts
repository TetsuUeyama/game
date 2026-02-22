import {MotionData, MotionConfig} from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import {buildKeyframes} from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionUtils";

/**
 * しゃがみ込みモーション
 * ジャンプ前の溜めモーションとして使用
 * 押下時間が長いほど深くしゃがむ
 */

const T0 = 0.0;
const T1 = 0.05;
const T2 = 0.15;
const T3 = 0.3;

const JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[T0]: 0, [T1]: 5, [T2]: 10, [T3]: 15},
  upperBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  upperBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

  lowerBodyX: {[T0]: 0, [T1]: -5, [T2]: -10, [T3]: -15},
  lowerBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  lowerBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

  headX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 5},
  headY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  headZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

  leftShoulderX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  leftShoulderY: {[T0]: 0, [T1]: -5, [T2]: -10, [T3]: -15},
  leftShoulderZ: {[T0]: -10, [T1]: -15, [T2]: -20, [T3]: -25},

  rightShoulderX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  rightShoulderY: {[T0]: 0, [T1]: 5, [T2]: 10, [T3]: 15},
  rightShoulderZ: {[T0]: 10, [T1]: 15, [T2]: 20, [T3]: 25},

  leftElbowX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  leftElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  leftElbowZ: {[T0]: -10, [T1]: -20, [T2]: -30, [T3]: -40},

  rightElbowX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  rightElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  rightElbowZ: {[T0]: 10, [T1]: 20, [T2]: 30, [T3]: 40},

  leftHipX: {[T0]: -5, [T1]: -30, [T2]: -50, [T3]: -70},
  leftHipY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  leftHipZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

  rightHipX: {[T0]: -5, [T1]: -30, [T2]: -50, [T3]: -70},
  rightHipY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  rightHipZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

  leftKneeX: {[T0]: 10, [T1]: 40, [T2]: 60, [T3]: 80},
  leftKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  leftKneeZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

  rightKneeX: {[T0]: 10, [T1]: 40, [T2]: 60, [T3]: 80},
  rightKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  rightKneeZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
};

// position.y: 自動接地が代替するため全て0（以前は -0.2〜-0.3 で手動補正していた）
const POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  y: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  z: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
};

export const CROUCH_MOTION: MotionData = {
  name: "crouch",
  duration: T3,
  loop: false,
  keyframes: buildKeyframes(JOINT_ANIMATIONS, POSITION_ANIMATIONS),
};

export const CROUCH_MOTION_CONFIG: MotionConfig = {
  motionData: CROUCH_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 25,
  interruptible: true,
};
