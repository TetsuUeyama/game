
import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes, createDerivedMotion } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionUtils";
import {
  WF_JOINT_ANIMATIONS, WF_T0, WF_T1, WF_T2, WF_T3, WF_T4,
  WB_JOINT_ANIMATIONS, WB_T0, WB_T1, WB_T2, WB_T3, WB_T4,
  WL_JOINT_ANIMATIONS, WL_T0, WL_T1, WL_T2, WL_T3, WL_T4,
  WR_JOINT_ANIMATIONS, WR_T0, WR_T1, WR_T2, WR_T3, WR_T4,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/WalkMotion";

/**
 * 前進ダッシュモーション
 * WALK_FORWARDをベースに、より大きな動きを追加
 */

const DF_T0 = 0.0;
const DF_T1 = 0.2;
const DF_T2 = 0.4;
const DF_T3 = 0.6;
const DF_T4 = 0.8;

// 歩行モーションに加算する値（配列のインデックスは T0, T1, T2, T3, T4 に対応）
// Walk修正後の新ベースに合わせて再計算。upperBodyX大幅削減、hipXで太もも駆動を強化
const DF_ADDITIONS = {
  upperBodyX: [8, 9, 3, 9, 3],
  upperBodyY: [0, 0, 0, 0, 0],
  upperBodyZ: [0, 0, 0, 0, 0],

  lowerBodyX: [-5, -7, -3, -7, -3],
  lowerBodyY: [0, 0, 0, 0, 0],
  lowerBodyZ: [0, 0, 0, 0, 0],

  headX: [-4, -5, -1, -5, -1],
  headY: [0, 0, 0, 0, 0],
  headZ: [0, 0, 0, 0, 0],

  leftShoulderX: [0, 10, 0, -10, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, 0, 0, 0, 0],

  rightShoulderX: [0, -10, 0, 10, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, 0, 0, 0, 0],

  leftElbowX: [0, -15, 0, 5, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 0, 0, 0, 0],

  rightElbowX: [0, 5, 0, -15, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 0, 0, 0, 0],

  leftHipX: [-20, -20, -5, 10, -20],
  leftHipY: [0, 0, 0, 0, 0],
  leftHipZ: [0, 0, 0, 0, 0],

  rightHipX: [-20, 10, -5, -20, -20],
  rightHipY: [0, 0, 0, 0, 0],
  rightHipZ: [0, 0, 0, 0, 0],

  leftKneeX: [47.5, 20, 57.5, 20, 57.5],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [0, 0, 0, 0, 0],

  rightKneeX: [20, 55, 20, 55, 20],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [0, 0, 0, 0, 0],
};

const DF_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[DF_T0]: 0, [DF_T1]: 0, [DF_T2]: 0, [DF_T3]: 0, [DF_T4]: 0},
};

/**1111
 * ダッシュゲージのパーセンテージに応じた前進ダッシュモーションを生成
 * @param dashPercentage ダッシュゲージの溜まり具合 (0.0～1.0)
 * @returns 前進ダッシュモーションデータ
 */
export function createDashForwardMotion(dashPercentage: number): MotionData {
  // ダッシュゲージに応じて追加値をスケール
  const scaledAdditions: Record<string, number[]> = {};
  for (const jointName in DF_ADDITIONS) {
    scaledAdditions[jointName] = (DF_ADDITIONS as Record<string, number[]>)[jointName].map(value => value * dashPercentage);
  }

  const jointAnimations = createDerivedMotion(
    WF_JOINT_ANIMATIONS,
    [WF_T0, WF_T1, WF_T2, WF_T3, WF_T4],
    [DF_T0, DF_T1, DF_T2, DF_T3, DF_T4],
    scaledAdditions
  );

  return {
    name: "dash_forward",
    duration: DF_T4,
    loop: true,
    keyframes: buildKeyframes(jointAnimations, DF_POSITION_ANIMATIONS),
  };
}

// 100%の時のデフォルトモーション（後方互換性のため）
export const DASH_FORWARD_MOTION: MotionData = createDashForwardMotion(1.0);

export const DASH_FORWARD_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_FORWARD_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 後退ダッシュモーション
 * WALK_BACKWARDをベースに、より大きな動きを追加
 */

const DB_T0 = 0.0;
const DB_T1 = 0.2;
const DB_T2 = 0.4;
const DB_T3 = 0.6;
const DB_T4 = 0.8;

// Walk修正後の新ベースに合わせて再計算。upperBodyX削減、太もも駆動
const DB_ADDITIONS = {
  upperBodyX: [-3, -4, -1, -4, -1],
  upperBodyY: [0, 0, 0, 0, 0],
  upperBodyZ: [0, 0, 0, 0, 0],

  lowerBodyX: [-3, -5, -2, -5, -2],
  lowerBodyY: [0, 0, 0, 0, 0],
  lowerBodyZ: [0, 0, 0, 0, 0],

  headX: [1, 1, 0, 1, 0],
  headY: [0, 0, 0, 0, 0],
  headZ: [0, 0, 0, 0, 0],

  // 腕振り増幅（後退走りの力強い腕振り）
  leftShoulderX: [0, -7, 0, 7, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, 0, 0, 0, 0],

  rightShoulderX: [0, 7, 0, -7, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, 0, 0, 0, 0],

  leftElbowX: [0, -3, 0, 2, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 0, 0, 0, 0],

  rightElbowX: [0, 2, 0, -3, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 0, 0, 0, 0],

  // 脚の動き増幅（速い後退ステップ: 太もも駆動）
  leftHipX: [0, 12, 0, -5, 0],
  leftHipY: [0, 0, 0, 0, 0],
  leftHipZ: [0, 0, 0, 0, 0],

  rightHipX: [0, -5, 0, 12, 0],
  rightHipY: [0, 0, 0, 0, 0],
  rightHipZ: [0, 0, 0, 0, 0],

  // 膝の曲げ増幅（素早いバックペダル）
  leftKneeX: [10, 12, 10, 12, 10],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [0, 0, 0, 0, 0],

  rightKneeX: [10, 12, 10, 12, 10],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [0, 0, 0, 0, 0],
};

const DB_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[DB_T0]: 0, [DB_T1]: 0, [DB_T2]: 0, [DB_T3]: 0, [DB_T4]: 0},
};

/**
 * ダッシュゲージのパーセンテージに応じた後退ダッシュモーションを生成
 * @param dashPercentage ダッシュゲージの溜まり具合 (0.0～1.0)
 * @returns 後退ダッシュモーションデータ
 */
export function createDashBackwardMotion(dashPercentage: number): MotionData {
  // ダッシュゲージに応じて追加値をスケール
  const scaledAdditions: Record<string, number[]> = {};
  for (const jointName in DB_ADDITIONS) {
    scaledAdditions[jointName] = (DB_ADDITIONS as Record<string, number[]>)[jointName].map(value => value * dashPercentage);
  }

  const jointAnimations = createDerivedMotion(
    WB_JOINT_ANIMATIONS,
    [WB_T0, WB_T1, WB_T2, WB_T3, WB_T4],
    [DB_T0, DB_T1, DB_T2, DB_T3, DB_T4],
    scaledAdditions
  );

  return {
    name: "dash_backward",
    duration: DB_T4,
    loop: true,
    keyframes: buildKeyframes(jointAnimations, DB_POSITION_ANIMATIONS),
  };
}

// 100%の時のデフォルトモーション（後方互換性のため）
export const DASH_BACKWARD_MOTION: MotionData = createDashBackwardMotion(1.0);

export const DASH_BACKWARD_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_BACKWARD_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 左ダッシュモーション
 * WALK_LEFTをベースに、より大きな動きを追加
 */

const DL_T0 = 0.0;
const DL_T1 = 0.2;
const DL_T2 = 0.4;
const DL_T3 = 0.6;
const DL_T4 = 0.8;

const DL_ADDITIONS = {
  upperBodyX: [5, 5, 0, 5, 0],
  upperBodyY: [0, 0, 0, 0, 0],
  upperBodyZ: [-17, -21, -7, -21, -7],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [0, 0, 0, 0, 0],
  lowerBodyZ: [7, 13, 2, 13, 2],

  headX: [0, 0, 0, 0, 0],
  headY: [0, 0, 0, 0, 0],
  headZ: [7, 10, 2, 10, 2],

  leftShoulderX: [-20, -10, 0, -10, 0],
  leftShoulderY: [-20, -20, -10, -20, -10],
  leftShoulderZ: [-19, -9, -9, -9, -9],

  rightShoulderX: [-10, -20, 0, -20, 0],
  rightShoulderY: [20, 20, 10, 20, 10],
  rightShoulderZ: [9, 9, 4, 9, 4],

  leftElbowX: [0, 0, 0, 0, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 0, 0, 0, 0],

  rightElbowX: [0, 0, 0, 0, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 0, 0, 0, 0],

  leftHipX: [-40, 10, -10, -20, -10],
  leftHipY: [0, 15, 0, 15, 0],
  leftHipZ: [17, 7, 17, 7, 17],

  rightHipX: [-10, -50, -5, -20, -5],
  rightHipY: [0, -10, 0, -10, 0],
  rightHipZ: [-13, 0, -13, 0, -13],

  leftKneeX: [50, 15, 20, 15, 20],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [-8, -8, -8, -8, -8],

  rightKneeX: [20, 50, 10, 50, 10],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [8, 8, 8, 8, 8],
};

const DL_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[DL_T0]: 0, [DL_T1]: 0, [DL_T2]: 0, [DL_T3]: 0, [DL_T4]: 0},
};

/**
 * ダッシュゲージのパーセンテージに応じた左ダッシュモーションを生成
 * @param dashPercentage ダッシュゲージの溜まり具合 (0.0～1.0)
 * @returns 左ダッシュモーションデータ
 */
export function createDashLeftMotion(dashPercentage: number): MotionData {
  // ダッシュゲージに応じて追加値をスケール
  const scaledAdditions: Record<string, number[]> = {};
  for (const jointName in DL_ADDITIONS) {
    scaledAdditions[jointName] = (DL_ADDITIONS as Record<string, number[]>)[jointName].map(value => value * dashPercentage);
  }

  const jointAnimations = createDerivedMotion(
    WL_JOINT_ANIMATIONS,
    [WL_T0, WL_T1, WL_T2, WL_T3, WL_T4],
    [DL_T0, DL_T1, DL_T2, DL_T3, DL_T4],
    scaledAdditions
  );

  return {
    name: "dash_left",
    duration: DL_T4,
    loop: true,
    keyframes: buildKeyframes(jointAnimations, DL_POSITION_ANIMATIONS),
  };
}

// 100%の時のデフォルトモーション（後方互換性のため）
export const DASH_LEFT_MOTION: MotionData = createDashLeftMotion(1.0);

export const DASH_LEFT_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_LEFT_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 右ダッシュモーション
 * WALK_RIGHTをベースに、より大きな動きを追加
 */

const DR_T0 = 0.0;
const DR_T1 = 0.2;
const DR_T2 = 0.4;
const DR_T3 = 0.6;
const DR_T4 = 0.8;

// 左ダッシュのミラー（左右反転: left↔right入替、Y/Z符号反転）
const DR_ADDITIONS = {
  upperBodyX: [5, 5, 0, 5, 0],
  upperBodyY: [0, 0, 0, 0, 0],
  upperBodyZ: [17, 21, 7, 21, 7],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [0, 0, 0, 0, 0],
  lowerBodyZ: [-7, -13, -2, -13, -2],

  headX: [0, 0, 0, 0, 0],
  headY: [0, 0, 0, 0, 0],
  headZ: [-7, -10, -2, -10, -2],

  // 左腕 = 左ダッシュの右腕ミラー
  leftShoulderX: [-10, -20, 0, -20, 0],
  leftShoulderY: [-20, -20, -10, -20, -10],
  leftShoulderZ: [-9, -9, -4, -9, -4],

  // 右腕 = 左ダッシュの左腕ミラー
  rightShoulderX: [-20, -10, 0, -10, 0],
  rightShoulderY: [20, 20, 10, 20, 10],
  rightShoulderZ: [19, 9, 9, 9, 9],

  leftElbowX: [0, 0, 0, 0, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 0, 0, 0, 0],

  rightElbowX: [0, 0, 0, 0, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 0, 0, 0, 0],

  // 左脚 = 左ダッシュの右脚ミラー
  leftHipX: [-10, -50, -5, -20, -5],
  leftHipY: [0, 10, 0, 10, 0],
  leftHipZ: [13, 0, 13, 0, 13],

  // 右脚 = 左ダッシュの左脚ミラー
  rightHipX: [-40, 10, -10, -20, -10],
  rightHipY: [0, -15, 0, -15, 0],
  rightHipZ: [-17, -7, -17, -7, -17],

  // 左膝 = 左ダッシュの右膝ミラー
  leftKneeX: [20, 50, 10, 50, 10],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [-8, -8, -8, -8, -8],

  // 右膝 = 左ダッシュの左膝ミラー
  rightKneeX: [50, 15, 20, 15, 20],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [8, 8, 8, 8, 8],
};

const DR_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[DR_T0]: 0, [DR_T1]: 0, [DR_T2]: 0, [DR_T3]: 0, [DR_T4]: 0},
};

/**
 * ダッシュゲージのパーセンテージに応じた右ダッシュモーションを生成
 * @param dashPercentage ダッシュゲージの溜まり具合 (0.0～1.0)
 * @returns 右ダッシュモーションデータ
 */
export function createDashRightMotion(dashPercentage: number): MotionData {
  // ダッシュゲージに応じて追加値をスケール
  const scaledAdditions: Record<string, number[]> = {};
  for (const jointName in DR_ADDITIONS) {
    scaledAdditions[jointName] = (DR_ADDITIONS as Record<string, number[]>)[jointName].map(value => value * dashPercentage);
  }

  const jointAnimations = createDerivedMotion(
    WR_JOINT_ANIMATIONS,
    [WR_T0, WR_T1, WR_T2, WR_T3, WR_T4],
    [DR_T0, DR_T1, DR_T2, DR_T3, DR_T4],
    scaledAdditions
  );

  return {
    name: "dash_right",
    duration: DR_T4,
    loop: true,
    keyframes: buildKeyframes(jointAnimations, DR_POSITION_ANIMATIONS),
  };
}

// 100%の時のデフォルトモーション（後方互換性のため）
export const DASH_RIGHT_MOTION: MotionData = createDashRightMotion(1.0);

export const DASH_RIGHT_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_RIGHT_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};
