import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";

/**
 * ルーズボール確保モーション
 *
 * スティールモーションを参考に低姿勢のダイブ動作
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 100ms = 0.1秒（身を低くする）
 * - activeTime: 400ms = 0.4秒（確保判定が有効な時間）
 *
 * キーフレーム構成：
 * - T0(0.0): 構え
 * - T1(0.1): 身を低くする（startupTime）
 * - T2(0.3): 最低点で前方に手を伸ばす（active中盤）
 * - T3(0.5): active終了
 * - T4(0.8): 起き上がり
 */
const LB_T0 = 0.0;
const LB_T1 = 0.1;    // startupTime
const LB_T2 = 0.3;    // active中盤（最低点）
const LB_T3 = 0.5;    // active終了
const LB_T4 = 0.8;    // 起き上がり完了

const LOOSE_BALL_SCRAMBLE_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：大きく前傾（35-45度）
  upperBodyX: {[LB_T0]: 0, [LB_T1]: 25, [LB_T2]: 45, [LB_T3]: 40, [LB_T4]: 0},
  upperBodyY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  upperBodyZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},

  lowerBodyX: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  lowerBodyY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  lowerBodyZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},

  headX: {[LB_T0]: 0, [LB_T1]: 10, [LB_T2]: 15, [LB_T3]: 10, [LB_T4]: 0},
  headY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  headZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},

  // 両腕：前方低位に伸ばす（ボールを掴みに行く）
  rightShoulderX: {[LB_T0]: -45, [LB_T1]: -80, [LB_T2]: -100, [LB_T3]: -90, [LB_T4]: -45},
  rightShoulderY: {[LB_T0]: 0, [LB_T1]: -10, [LB_T2]: -15, [LB_T3]: -10, [LB_T4]: 0},
  rightShoulderZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},

  rightElbowX: {[LB_T0]: 45, [LB_T1]: 20, [LB_T2]: 10, [LB_T3]: 15, [LB_T4]: 45},
  rightElbowY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  rightElbowZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},

  leftShoulderX: {[LB_T0]: -45, [LB_T1]: -80, [LB_T2]: -100, [LB_T3]: -90, [LB_T4]: -45},
  leftShoulderY: {[LB_T0]: 0, [LB_T1]: 10, [LB_T2]: 15, [LB_T3]: 10, [LB_T4]: 0},
  leftShoulderZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},

  leftElbowX: {[LB_T0]: 45, [LB_T1]: 20, [LB_T2]: 10, [LB_T3]: 15, [LB_T4]: 45},
  leftElbowY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  leftElbowZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},

  // 脚：深くしゃがみ込む
  leftHipX: {[LB_T0]: -30, [LB_T1]: -60, [LB_T2]: -80, [LB_T3]: -70, [LB_T4]: -30},
  leftHipY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  leftHipZ: {[LB_T0]: 0, [LB_T1]: -5, [LB_T2]: -10, [LB_T3]: -5, [LB_T4]: 0},

  rightHipX: {[LB_T0]: -30, [LB_T1]: -60, [LB_T2]: -80, [LB_T3]: -70, [LB_T4]: -30},
  rightHipY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  rightHipZ: {[LB_T0]: 0, [LB_T1]: 5, [LB_T2]: 10, [LB_T3]: 5, [LB_T4]: 0},

  leftKneeX: {[LB_T0]: 50, [LB_T1]: 90, [LB_T2]: 120, [LB_T3]: 100, [LB_T4]: 50},
  leftKneeY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  leftKneeZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},

  rightKneeX: {[LB_T0]: 50, [LB_T1]: 90, [LB_T2]: 120, [LB_T3]: 100, [LB_T4]: 50},
  rightKneeY: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  rightKneeZ: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
};

const LOOSE_BALL_SCRAMBLE_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[LB_T0]: 0, [LB_T1]: 0, [LB_T2]: 0, [LB_T3]: 0, [LB_T4]: 0},
  y: {[LB_T0]: 0, [LB_T1]: -0.2, [LB_T2]: -0.4, [LB_T3]: -0.3, [LB_T4]: 0},  // 低い姿勢
  z: {[LB_T0]: 0, [LB_T1]: 0.15, [LB_T2]: 0.3, [LB_T3]: 0.2, [LB_T4]: 0},    // 前方に突き出す
};

export const LOOSE_BALL_SCRAMBLE_MOTION: MotionData = {
  name: "loose_ball_scramble",
  duration: LB_T4,
  loop: false,
  keyframes: buildKeyframes(LOOSE_BALL_SCRAMBLE_JOINT_ANIMATIONS, LOOSE_BALL_SCRAMBLE_POSITION_ANIMATIONS),
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
    { jointName: "upperBody", priority: 8 },
  ],
};

export const LOOSE_BALL_SCRAMBLE_MOTION_CONFIG: MotionConfig = {
  motionData: LOOSE_BALL_SCRAMBLE_MOTION,
  isDefault: false,
  blendDuration: 0.05,   // 素早いブレンド
  priority: 45,
  interruptible: false,
};

/**
 * ルーズボールモーションマップ
 */
export const LOOSE_BALL_MOTIONS = {
  loose_ball_scramble: LOOSE_BALL_SCRAMBLE_MOTION,
};

/**
 * ルーズボールモーションコンフィグマップ
 */
export const LOOSE_BALL_MOTION_CONFIGS = {
  loose_ball_scramble: LOOSE_BALL_SCRAMBLE_MOTION_CONFIG,
};
