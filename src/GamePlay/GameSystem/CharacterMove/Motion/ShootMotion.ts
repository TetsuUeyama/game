import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionUtils";

/**
 * シュートモーション
 *
 * 3ポイントシュート、ミドルレンジシュート、レイアップの3種類
 * ActionControllerのタイミングに合わせてキーフレームを設計
 */

// ==============================
// 3ポイントシュート
// ==============================

/**
 * 3ポイントシュートモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 400ms = 0.4秒（構え〜リリース直前）
 * - activeTime: 300ms = 0.3秒（リリース〜フォロースルー）
 * - recoveryTime: 200ms = 0.2秒（元に戻る）
 *
 * キーフレーム構成：
 * - T0: 構え開始
 * - T1: ジャンプ開始、ボールを頭上へ
 * - T2: ジャンプ頂点、リリース直前
 * - T3: リリース、フォロースルー
 * - T4: 着地、元に戻る
 */
const SHOOT_3PT_T0 = 0.0;
const SHOOT_3PT_T1 = 0.2;   // 構え（startupの半分）
const SHOOT_3PT_T2 = 0.4;   // startupTime = リリース直前
const SHOOT_3PT_T3 = 0.7;   // activeTime終了
const SHOOT_3PT_T4 = 0.9;   // recoveryTime終了

const SHOOT_3PT_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：後ろに反ってから前に
  upperBodyX: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: -15, [SHOOT_3PT_T2]: -20, [SHOOT_3PT_T3]: 10, [SHOOT_3PT_T4]: 0},
  upperBodyY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  upperBodyZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  // 下半身：固定
  lowerBodyX: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  lowerBodyY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  lowerBodyZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  // 頭：上を向く
  headX: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: -10, [SHOOT_3PT_T2]: -20, [SHOOT_3PT_T3]: -10, [SHOOT_3PT_T4]: 0},
  headY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  headZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  // 右腕（シュートハンド）：ボールを持ち上げてリリース
  rightShoulderX: {[SHOOT_3PT_T0]: -30, [SHOOT_3PT_T1]: -120, [SHOOT_3PT_T2]: -160, [SHOOT_3PT_T3]: -170, [SHOOT_3PT_T4]: -30},
  rightShoulderY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  rightShoulderZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  rightElbowX: {[SHOOT_3PT_T0]: -30, [SHOOT_3PT_T1]: -90, [SHOOT_3PT_T2]: -110, [SHOOT_3PT_T3]: -20, [SHOOT_3PT_T4]: -30},
  rightElbowY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  rightElbowZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  // 左腕（ガイドハンド）：補助
  leftShoulderX: {[SHOOT_3PT_T0]: -30, [SHOOT_3PT_T1]: -90, [SHOOT_3PT_T2]: -120, [SHOOT_3PT_T3]: -60, [SHOOT_3PT_T4]: -30},
  leftShoulderY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 20, [SHOOT_3PT_T2]: 30, [SHOOT_3PT_T3]: 15, [SHOOT_3PT_T4]: 0},
  leftShoulderZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  leftElbowX: {[SHOOT_3PT_T0]: -30, [SHOOT_3PT_T1]: -60, [SHOOT_3PT_T2]: -80, [SHOOT_3PT_T3]: -40, [SHOOT_3PT_T4]: -30},
  leftElbowY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  leftElbowZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  // 脚：ジャンプ
  leftHipX: {[SHOOT_3PT_T0]: -30, [SHOOT_3PT_T1]: -60, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: -20, [SHOOT_3PT_T4]: -30},
  leftHipY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  leftHipZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  rightHipX: {[SHOOT_3PT_T0]: -30, [SHOOT_3PT_T1]: -60, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: -20, [SHOOT_3PT_T4]: -30},
  rightHipY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  rightHipZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  leftKneeX: {[SHOOT_3PT_T0]: 50, [SHOOT_3PT_T1]: 90, [SHOOT_3PT_T2]: 10, [SHOOT_3PT_T3]: 40, [SHOOT_3PT_T4]: 50},
  leftKneeY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  leftKneeZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},

  rightKneeX: {[SHOOT_3PT_T0]: 50, [SHOOT_3PT_T1]: 90, [SHOOT_3PT_T2]: 10, [SHOOT_3PT_T3]: 40, [SHOOT_3PT_T4]: 50},
  rightKneeY: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  rightKneeZ: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
};

const SHOOT_3PT_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
  y: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0.8, [SHOOT_3PT_T3]: 0.3, [SHOOT_3PT_T4]: 0},
  z: {[SHOOT_3PT_T0]: 0, [SHOOT_3PT_T1]: 0, [SHOOT_3PT_T2]: 0, [SHOOT_3PT_T3]: 0, [SHOOT_3PT_T4]: 0},
};

export const SHOOT_3PT_MOTION: MotionData = {
  name: "shoot_3pt",
  duration: SHOOT_3PT_T4,
  loop: false,
  keyframes: buildKeyframes(SHOOT_3PT_JOINT_ANIMATIONS, SHOOT_3PT_POSITION_ANIMATIONS),
};

export const SHOOT_3PT_MOTION_CONFIG: MotionConfig = {
  motionData: SHOOT_3PT_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 40,
  interruptible: true,
};

// ==============================
// ミドルレンジシュート
// ==============================

/**
 * ミドルレンジシュートモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 350ms = 0.35秒
 * - activeTime: 250ms = 0.25秒
 * - recoveryTime: 200ms = 0.2秒
 */
const SHOOT_MID_T0 = 0.0;
const SHOOT_MID_T1 = 0.17;
const SHOOT_MID_T2 = 0.35;   // startupTime
const SHOOT_MID_T3 = 0.6;    // activeTime終了
const SHOOT_MID_T4 = 0.8;    // recoveryTime終了

const SHOOT_MIDRANGE_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: -10, [SHOOT_MID_T2]: -15, [SHOOT_MID_T3]: 5, [SHOOT_MID_T4]: 0},
  upperBodyY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  upperBodyZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  lowerBodyX: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  lowerBodyY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  lowerBodyZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  headX: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: -8, [SHOOT_MID_T2]: -15, [SHOOT_MID_T3]: -5, [SHOOT_MID_T4]: 0},
  headY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  headZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  rightShoulderX: {[SHOOT_MID_T0]: -30, [SHOOT_MID_T1]: -100, [SHOOT_MID_T2]: -150, [SHOOT_MID_T3]: -160, [SHOOT_MID_T4]: -30},
  rightShoulderY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  rightShoulderZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  rightElbowX: {[SHOOT_MID_T0]: -30, [SHOOT_MID_T1]: -80, [SHOOT_MID_T2]: -100, [SHOOT_MID_T3]: -15, [SHOOT_MID_T4]: -30},
  rightElbowY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  rightElbowZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  leftShoulderX: {[SHOOT_MID_T0]: -30, [SHOOT_MID_T1]: -80, [SHOOT_MID_T2]: -110, [SHOOT_MID_T3]: -50, [SHOOT_MID_T4]: -30},
  leftShoulderY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 15, [SHOOT_MID_T2]: 25, [SHOOT_MID_T3]: 10, [SHOOT_MID_T4]: 0},
  leftShoulderZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  leftElbowX: {[SHOOT_MID_T0]: -30, [SHOOT_MID_T1]: -50, [SHOOT_MID_T2]: -70, [SHOOT_MID_T3]: -35, [SHOOT_MID_T4]: -30},
  leftElbowY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  leftElbowZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  leftHipX: {[SHOOT_MID_T0]: -30, [SHOOT_MID_T1]: -50, [SHOOT_MID_T2]: -5, [SHOOT_MID_T3]: -15, [SHOOT_MID_T4]: -30},
  leftHipY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  leftHipZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  rightHipX: {[SHOOT_MID_T0]: -30, [SHOOT_MID_T1]: -50, [SHOOT_MID_T2]: -5, [SHOOT_MID_T3]: -15, [SHOOT_MID_T4]: -30},
  rightHipY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  rightHipZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  leftKneeX: {[SHOOT_MID_T0]: 50, [SHOOT_MID_T1]: 80, [SHOOT_MID_T2]: 15, [SHOOT_MID_T3]: 35, [SHOOT_MID_T4]: 50},
  leftKneeY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  leftKneeZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},

  rightKneeX: {[SHOOT_MID_T0]: 50, [SHOOT_MID_T1]: 80, [SHOOT_MID_T2]: 15, [SHOOT_MID_T3]: 35, [SHOOT_MID_T4]: 50},
  rightKneeY: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  rightKneeZ: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
};

const SHOOT_MIDRANGE_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
  y: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0.6, [SHOOT_MID_T3]: 0.2, [SHOOT_MID_T4]: 0},
  z: {[SHOOT_MID_T0]: 0, [SHOOT_MID_T1]: 0, [SHOOT_MID_T2]: 0, [SHOOT_MID_T3]: 0, [SHOOT_MID_T4]: 0},
};

export const SHOOT_MIDRANGE_MOTION: MotionData = {
  name: "shoot_midrange",
  duration: SHOOT_MID_T4,
  loop: false,
  keyframes: buildKeyframes(SHOOT_MIDRANGE_JOINT_ANIMATIONS, SHOOT_MIDRANGE_POSITION_ANIMATIONS),
};

export const SHOOT_MIDRANGE_MOTION_CONFIG: MotionConfig = {
  motionData: SHOOT_MIDRANGE_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 40,
  interruptible: true,
};

// ==============================
// レイアップ
// ==============================

/**
 * レイアップモーション
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 250ms = 0.25秒
 * - activeTime: 300ms = 0.3秒
 * - recoveryTime: 300ms = 0.3秒
 */
const SHOOT_LAYUP_T0 = 0.0;
const SHOOT_LAYUP_T1 = 0.12;
const SHOOT_LAYUP_T2 = 0.25;   // startupTime
const SHOOT_LAYUP_T3 = 0.55;   // activeTime終了
const SHOOT_LAYUP_T4 = 0.85;   // recoveryTime終了

const SHOOT_LAYUP_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[SHOOT_LAYUP_T0]: 10, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: -10, [SHOOT_LAYUP_T3]: 5, [SHOOT_LAYUP_T4]: 10},
  upperBodyY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  upperBodyZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  lowerBodyX: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  lowerBodyY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  lowerBodyZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  headX: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: -10, [SHOOT_LAYUP_T2]: -20, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  headY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  headZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  // 右腕：ボールを持ち上げて上方へリリース
  rightShoulderX: {[SHOOT_LAYUP_T0]: -45, [SHOOT_LAYUP_T1]: -130, [SHOOT_LAYUP_T2]: -170, [SHOOT_LAYUP_T3]: -150, [SHOOT_LAYUP_T4]: -45},
  rightShoulderY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  rightShoulderZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  rightElbowX: {[SHOOT_LAYUP_T0]: -45, [SHOOT_LAYUP_T1]: -70, [SHOOT_LAYUP_T2]: -30, [SHOOT_LAYUP_T3]: -10, [SHOOT_LAYUP_T4]: -45},
  rightElbowY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  rightElbowZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  leftShoulderX: {[SHOOT_LAYUP_T0]: -30, [SHOOT_LAYUP_T1]: -90, [SHOOT_LAYUP_T2]: -100, [SHOOT_LAYUP_T3]: -60, [SHOOT_LAYUP_T4]: -30},
  leftShoulderY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 10, [SHOOT_LAYUP_T2]: 20, [SHOOT_LAYUP_T3]: 10, [SHOOT_LAYUP_T4]: 0},
  leftShoulderZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  leftElbowX: {[SHOOT_LAYUP_T0]: -30, [SHOOT_LAYUP_T1]: -50, [SHOOT_LAYUP_T2]: -60, [SHOOT_LAYUP_T3]: -40, [SHOOT_LAYUP_T4]: -30},
  leftElbowY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  leftElbowZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  // 脚：片足ジャンプ（右足を上げる）
  leftHipX: {[SHOOT_LAYUP_T0]: -40, [SHOOT_LAYUP_T1]: -70, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: -20, [SHOOT_LAYUP_T4]: -40},
  leftHipY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  leftHipZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  rightHipX: {[SHOOT_LAYUP_T0]: -30, [SHOOT_LAYUP_T1]: -60, [SHOOT_LAYUP_T2]: -80, [SHOOT_LAYUP_T3]: -50, [SHOOT_LAYUP_T4]: -30},
  rightHipY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  rightHipZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  leftKneeX: {[SHOOT_LAYUP_T0]: 60, [SHOOT_LAYUP_T1]: 100, [SHOOT_LAYUP_T2]: 10, [SHOOT_LAYUP_T3]: 40, [SHOOT_LAYUP_T4]: 60},
  leftKneeY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  leftKneeZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},

  rightKneeX: {[SHOOT_LAYUP_T0]: 40, [SHOOT_LAYUP_T1]: 80, [SHOOT_LAYUP_T2]: 90, [SHOOT_LAYUP_T3]: 60, [SHOOT_LAYUP_T4]: 40},
  rightKneeY: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  rightKneeZ: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
};

const SHOOT_LAYUP_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 0, [SHOOT_LAYUP_T3]: 0, [SHOOT_LAYUP_T4]: 0},
  y: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0, [SHOOT_LAYUP_T2]: 1.0, [SHOOT_LAYUP_T3]: 0.5, [SHOOT_LAYUP_T4]: 0},
  z: {[SHOOT_LAYUP_T0]: 0, [SHOOT_LAYUP_T1]: 0.1, [SHOOT_LAYUP_T2]: 0.3, [SHOOT_LAYUP_T3]: 0.2, [SHOOT_LAYUP_T4]: 0},
};

export const SHOOT_LAYUP_MOTION: MotionData = {
  name: "shoot_layup",
  duration: SHOOT_LAYUP_T4,
  loop: false,
  keyframes: buildKeyframes(SHOOT_LAYUP_JOINT_ANIMATIONS, SHOOT_LAYUP_POSITION_ANIMATIONS),
};

export const SHOOT_LAYUP_MOTION_CONFIG: MotionConfig = {
  motionData: SHOOT_LAYUP_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 40,
  interruptible: true,
};

// ==============================
// ダンク
// ==============================

/**
 * ダンクモーション
 *
 * 前進しながらジャンプしてゴールに叩き込む迫力のあるダンク
 * しゃがみ→前方ジャンプ→空中で前進→叩きつけ→着地
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 350ms = 0.35秒（しゃがみ〜ジャンプピーク）
 * - activeTime: 200ms = 0.2秒（叩きつけ動作）
 *
 * キーフレーム構成：
 * - T0: 構え
 * - T1: しゃがみ完了、ジャンプ直前
 * - T2: ジャンプピーク、ボール振り上げ（startupTime）、前方移動中
 * - T3: 叩きつけ、ボールリリース、最大前方位置
 * - T4: 下降中
 * - T5: 着地
 */
const SHOOT_DUNK_T0 = 0.0;
const SHOOT_DUNK_T1 = 0.15;  // しゃがみ完了
const SHOOT_DUNK_T2 = 0.35;  // startupTime = ジャンプピーク
const SHOOT_DUNK_T3 = 0.55;  // 叩きつけ完了
const SHOOT_DUNK_T4 = 0.7;   // 下降中
const SHOOT_DUNK_T5 = 0.85;  // 着地

const SHOOT_DUNK_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：しゃがみで前傾→ジャンプで後傾→叩きつけで大きく前傾
  upperBodyX: {[SHOOT_DUNK_T0]: 5, [SHOOT_DUNK_T1]: 20, [SHOOT_DUNK_T2]: -15, [SHOOT_DUNK_T3]: 40, [SHOOT_DUNK_T4]: 20, [SHOOT_DUNK_T5]: 5},
  upperBodyY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  upperBodyZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  // 下半身：固定
  lowerBodyX: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  lowerBodyY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  lowerBodyZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  // 頭：リムを見つめる→叩きつけ時に下を見る
  headX: {[SHOOT_DUNK_T0]: -5, [SHOOT_DUNK_T1]: 5, [SHOOT_DUNK_T2]: -25, [SHOOT_DUNK_T3]: 25, [SHOOT_DUNK_T4]: 10, [SHOOT_DUNK_T5]: 0},
  headY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  headZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  // 右腕：構え→大きく振り上げ→力強く叩きつけ
  rightShoulderX: {[SHOOT_DUNK_T0]: -50, [SHOOT_DUNK_T1]: -70, [SHOOT_DUNK_T2]: -180, [SHOOT_DUNK_T3]: -70, [SHOOT_DUNK_T4]: -50, [SHOOT_DUNK_T5]: -45},
  rightShoulderY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  rightShoulderZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: -15, [SHOOT_DUNK_T3]: 10, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  rightElbowX: {[SHOOT_DUNK_T0]: -50, [SHOOT_DUNK_T1]: -80, [SHOOT_DUNK_T2]: -20, [SHOOT_DUNK_T3]: -40, [SHOOT_DUNK_T4]: -45, [SHOOT_DUNK_T5]: -45},
  rightElbowY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  rightElbowZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  // 左腕：補助→叩きつけ後は下ろす
  leftShoulderX: {[SHOOT_DUNK_T0]: -50, [SHOOT_DUNK_T1]: -65, [SHOOT_DUNK_T2]: -170, [SHOOT_DUNK_T3]: -60, [SHOOT_DUNK_T4]: -50, [SHOOT_DUNK_T5]: -45},
  leftShoulderY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  leftShoulderZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 15, [SHOOT_DUNK_T3]: -10, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  leftElbowX: {[SHOOT_DUNK_T0]: -50, [SHOOT_DUNK_T1]: -75, [SHOOT_DUNK_T2]: -25, [SHOOT_DUNK_T3]: -35, [SHOOT_DUNK_T4]: -45, [SHOOT_DUNK_T5]: -45},
  leftElbowY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  leftElbowZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  // 脚：力強いジャンプ→空中で膝を上げる（ダイナミックな姿勢）
  leftHipX: {[SHOOT_DUNK_T0]: -30, [SHOOT_DUNK_T1]: -80, [SHOOT_DUNK_T2]: -40, [SHOOT_DUNK_T3]: -20, [SHOOT_DUNK_T4]: -50, [SHOOT_DUNK_T5]: -30},
  leftHipY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  leftHipZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  // 右脚：ジャンプ時に膝を高く上げる（片足ジャンプ風）
  rightHipX: {[SHOOT_DUNK_T0]: -30, [SHOOT_DUNK_T1]: -75, [SHOOT_DUNK_T2]: -70, [SHOOT_DUNK_T3]: -50, [SHOOT_DUNK_T4]: -55, [SHOOT_DUNK_T5]: -30},
  rightHipY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  rightHipZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  leftKneeX: {[SHOOT_DUNK_T0]: 50, [SHOOT_DUNK_T1]: 110, [SHOOT_DUNK_T2]: 50, [SHOOT_DUNK_T3]: 30, [SHOOT_DUNK_T4]: 70, [SHOOT_DUNK_T5]: 50},
  leftKneeY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  leftKneeZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},

  // 右膝：空中で高く曲げる
  rightKneeX: {[SHOOT_DUNK_T0]: 50, [SHOOT_DUNK_T1]: 105, [SHOOT_DUNK_T2]: 90, [SHOOT_DUNK_T3]: 70, [SHOOT_DUNK_T4]: 80, [SHOOT_DUNK_T5]: 50},
  rightKneeY: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  rightKneeZ: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
};

// ダンクモーション位置アニメーション
// XZ方向の実際の移動はShootCheckControllerで制御するため、ここではわずかな微調整のみ
const SHOOT_DUNK_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
  // 高くジャンプ（リム高さ3.05mに届くように）
  y: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 1.5, [SHOOT_DUNK_T3]: 1.2, [SHOOT_DUNK_T4]: 0.5, [SHOOT_DUNK_T5]: 0},
  // Z方向は実際のキャラクター移動で制御、モーションでは微調整のみ
  z: {[SHOOT_DUNK_T0]: 0, [SHOOT_DUNK_T1]: 0, [SHOOT_DUNK_T2]: 0, [SHOOT_DUNK_T3]: 0, [SHOOT_DUNK_T4]: 0, [SHOOT_DUNK_T5]: 0},
};

export const SHOOT_DUNK_MOTION: MotionData = {
  name: "shoot_dunk",
  duration: SHOOT_DUNK_T5,
  loop: false,
  keyframes: buildKeyframes(SHOOT_DUNK_JOINT_ANIMATIONS, SHOOT_DUNK_POSITION_ANIMATIONS),
};

export const SHOOT_DUNK_MOTION_CONFIG: MotionConfig = {
  motionData: SHOOT_DUNK_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 45,          // 他のシュートより高い優先度
  interruptible: false,
};

// ==============================
// シュートフェイント
// ==============================

/**
 * シュートフェイントモーション
 *
 * 実際にはジャンプせず、飛ぶ振りだけ
 * タイミング（ActionConfigより）:
 * - startupTime: 100ms = 0.1秒
 * - activeTime: 150ms = 0.15秒
 * - recoveryTime: 200ms = 0.2秒
 */
const SHOOT_FEINT_T0 = 0.0;
const SHOOT_FEINT_T1 = 0.1;   // startup終了（膝を曲げる）
const SHOOT_FEINT_T2 = 0.25;  // active終了（腕を上げかけて止める）
const SHOOT_FEINT_T3 = 0.45;  // recovery終了（元に戻る）

const SHOOT_FEINT_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：少し後ろに反る（シュートの振り）
  upperBodyX: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: -8, [SHOOT_FEINT_T2]: -5, [SHOOT_FEINT_T3]: 0},
  upperBodyY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  upperBodyZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  // 下半身：固定
  lowerBodyX: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  lowerBodyY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  lowerBodyZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  // 頭：少し上を向く
  headX: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: -8, [SHOOT_FEINT_T2]: -5, [SHOOT_FEINT_T3]: 0},
  headY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  headZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  // 右腕（シュートハンド）：ボールを持ち上げかけて止める
  rightShoulderX: {[SHOOT_FEINT_T0]: -30, [SHOOT_FEINT_T1]: -80, [SHOOT_FEINT_T2]: -60, [SHOOT_FEINT_T3]: -30},
  rightShoulderY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  rightShoulderZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  rightElbowX: {[SHOOT_FEINT_T0]: -30, [SHOOT_FEINT_T1]: -60, [SHOOT_FEINT_T2]: -45, [SHOOT_FEINT_T3]: -30},
  rightElbowY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  rightElbowZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  // 左腕（ガイドハンド）：補助
  leftShoulderX: {[SHOOT_FEINT_T0]: -30, [SHOOT_FEINT_T1]: -60, [SHOOT_FEINT_T2]: -45, [SHOOT_FEINT_T3]: -30},
  leftShoulderY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 10, [SHOOT_FEINT_T2]: 5, [SHOOT_FEINT_T3]: 0},
  leftShoulderZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  leftElbowX: {[SHOOT_FEINT_T0]: -30, [SHOOT_FEINT_T1]: -45, [SHOOT_FEINT_T2]: -35, [SHOOT_FEINT_T3]: -30},
  leftElbowY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  leftElbowZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  // 脚：膝を曲げて飛ぶ振り（実際には飛ばない）
  leftHipX: {[SHOOT_FEINT_T0]: -30, [SHOOT_FEINT_T1]: -50, [SHOOT_FEINT_T2]: -40, [SHOOT_FEINT_T3]: -30},
  leftHipY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  leftHipZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  rightHipX: {[SHOOT_FEINT_T0]: -30, [SHOOT_FEINT_T1]: -50, [SHOOT_FEINT_T2]: -40, [SHOOT_FEINT_T3]: -30},
  rightHipY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  rightHipZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  leftKneeX: {[SHOOT_FEINT_T0]: 50, [SHOOT_FEINT_T1]: 70, [SHOOT_FEINT_T2]: 60, [SHOOT_FEINT_T3]: 50},
  leftKneeY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  leftKneeZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},

  rightKneeX: {[SHOOT_FEINT_T0]: 50, [SHOOT_FEINT_T1]: 70, [SHOOT_FEINT_T2]: 60, [SHOOT_FEINT_T3]: 50},
  rightKneeY: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  rightKneeZ: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
};

// フェイントはジャンプしない（y=0のまま）
const SHOOT_FEINT_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
  y: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0}, // 膝を曲げた分少し沈む
  z: {[SHOOT_FEINT_T0]: 0, [SHOOT_FEINT_T1]: 0, [SHOOT_FEINT_T2]: 0, [SHOOT_FEINT_T3]: 0},
};

export const SHOOT_FEINT_MOTION: MotionData = {
  name: "shoot_feint",
  duration: SHOOT_FEINT_T3,
  loop: false,
  keyframes: buildKeyframes(SHOOT_FEINT_JOINT_ANIMATIONS, SHOOT_FEINT_POSITION_ANIMATIONS),
};

export const SHOOT_FEINT_MOTION_CONFIG: MotionConfig = {
  motionData: SHOOT_FEINT_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 40,
  interruptible: true,
};

// ==============================
// エクスポート
// ==============================

/**
 * シュートモーションマップ
 */
export const SHOOT_MOTIONS = {
  shoot_3pt: SHOOT_3PT_MOTION,
  shoot_midrange: SHOOT_MIDRANGE_MOTION,
  shoot_layup: SHOOT_LAYUP_MOTION,
  shoot_dunk: SHOOT_DUNK_MOTION,
  shoot_feint: SHOOT_FEINT_MOTION,
};

/**
 * シュートモーションコンフィグマップ
 */
export const SHOOT_MOTION_CONFIGS = {
  shoot_3pt: SHOOT_3PT_MOTION_CONFIG,
  shoot_midrange: SHOOT_MIDRANGE_MOTION_CONFIG,
  shoot_layup: SHOOT_LAYUP_MOTION_CONFIG,
  shoot_dunk: SHOOT_DUNK_MOTION_CONFIG,
};
