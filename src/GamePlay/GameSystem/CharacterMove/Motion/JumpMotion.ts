import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes } from "@/GamePlay/GameSystem/CharacterMove/Utils/MotionUtils";

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
  y: {[T0]: 0, [T1]: 0.5, [T2]: 1.5, [T3]: 0.5, [T4]: 0},
  z: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
};

export const JUMP_MOTION: MotionData = {
  name: "jump",
  duration: T4,
  loop: false,
  keyframes: buildKeyframes(JOINT_ANIMATIONS, POSITION_ANIMATIONS),
  jumpPhysics: {
    liftoffTime: 0.0,
    peakTime: 0.18,     // 30% 地点で頂点 → 素早い上昇
    landingTime: 0.6,
    peakHeight: 1.5,
  },
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

// ==============================
// ジャンプボールモーション
// ==============================

/**
 * ジャンプボールモーション
 *
 * ジャンプボールでボールをチップするための動作
 * BlockShotモーションを参考に、両手を上に伸ばしてジャンプする
 *
 * タイミング（ActionConfigより）:
 * - startupTime: 200ms = 0.2秒（ジャンプ開始まで）
 * - activeTime: 500ms = 0.5秒（空中時間）
 *
 * キーフレーム構成：
 * - JB_T0: 構え
 * - JB_T1: かがみ始める
 * - JB_T2: ジャンプ開始（startupTime）
 * - JB_T3: 最高点（チップポイント）
 * - JB_T4: 下降開始
 * - JB_T5: 着地、元に戻る
 */

// タイミング定数
const JB_T0 = 0.0;
const JB_T1 = 0.1;    // かがみ
const JB_T2 = 0.2;    // startupTime = ジャンプ開始
const JB_T3 = 0.45;   // 最高点
const JB_T4 = 0.65;   // 下降
const JB_T5 = 0.9;    // 着地

const JUMP_BALL_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身：やや前傾してからやや後傾
  upperBodyX: {[JB_T0]: 0, [JB_T1]: 10, [JB_T2]: -5, [JB_T3]: -15, [JB_T4]: -10, [JB_T5]: 0},
  upperBodyY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  upperBodyZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},

  // 下半身：固定
  lowerBodyX: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  lowerBodyY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  lowerBodyZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},

  // 頭：上を向く
  headX: {[JB_T0]: 0, [JB_T1]: 5, [JB_T2]: -20, [JB_T3]: -35, [JB_T4]: -25, [JB_T5]: 0},
  headY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  headZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},

  // 右腕：真上に伸ばす
  rightShoulderX: {[JB_T0]: -30, [JB_T1]: -60, [JB_T2]: -140, [JB_T3]: -175, [JB_T4]: -160, [JB_T5]: -30},
  rightShoulderY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  rightShoulderZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: -10, [JB_T3]: -15, [JB_T4]: -10, [JB_T5]: 0},

  rightElbowX: {[JB_T0]: 30, [JB_T1]: 40, [JB_T2]: 15, [JB_T3]: 5, [JB_T4]: 10, [JB_T5]: 30},
  rightElbowY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  rightElbowZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},

  // 左腕：真上に伸ばす（右腕と対称）
  leftShoulderX: {[JB_T0]: -30, [JB_T1]: -60, [JB_T2]: -140, [JB_T3]: -175, [JB_T4]: -160, [JB_T5]: -30},
  leftShoulderY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  leftShoulderZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 10, [JB_T3]: 15, [JB_T4]: 10, [JB_T5]: 0},

  leftElbowX: {[JB_T0]: 30, [JB_T1]: 40, [JB_T2]: 15, [JB_T3]: 5, [JB_T4]: 10, [JB_T5]: 30},
  leftElbowY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  leftElbowZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},

  // 脚：ジャンプ動作
  leftHipX: {[JB_T0]: -30, [JB_T1]: -60, [JB_T2]: -50, [JB_T3]: 0, [JB_T4]: -10, [JB_T5]: -30},
  leftHipY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  leftHipZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},

  rightHipX: {[JB_T0]: -30, [JB_T1]: -60, [JB_T2]: -50, [JB_T3]: 0, [JB_T4]: -10, [JB_T5]: -30},
  rightHipY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  rightHipZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},

  leftKneeX: {[JB_T0]: 50, [JB_T1]: 90, [JB_T2]: 70, [JB_T3]: 20, [JB_T4]: 35, [JB_T5]: 50},
  leftKneeY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  leftKneeZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},

  rightKneeX: {[JB_T0]: 50, [JB_T1]: 90, [JB_T2]: 70, [JB_T3]: 20, [JB_T4]: 35, [JB_T5]: 50},
  rightKneeY: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  rightKneeZ: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
};

// 位置アニメーション（ジャンプ高さ約1.0m）
const JUMP_BALL_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0, [JB_T3]: 0, [JB_T4]: 0, [JB_T5]: 0},
  y: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0.2, [JB_T3]: 1.0, [JB_T4]: 0.6, [JB_T5]: 0},
  z: {[JB_T0]: 0, [JB_T1]: 0, [JB_T2]: 0.05, [JB_T3]: 0.1, [JB_T4]: 0.05, [JB_T5]: 0},
};

/**
 * ジャンプボールモーションデータ
 */
export const JUMP_BALL_MOTION: MotionData = {
  name: "jump_ball",
  duration: JB_T5,
  loop: false,
  keyframes: buildKeyframes(JUMP_BALL_JOINT_ANIMATIONS, JUMP_BALL_POSITION_ANIMATIONS),
  jumpPhysics: {
    liftoffTime: 0.1,
    peakTime: 0.30,     // 地上フェーズ後、素早く頂点へ
    landingTime: 0.9,
    peakHeight: 1.0,
  },
  priorities: [
    { jointName: "rightShoulder", priority: 10 },
    { jointName: "leftShoulder", priority: 10 },
    { jointName: "rightElbow", priority: 9 },
    { jointName: "leftElbow", priority: 9 },
    { jointName: "head", priority: 8 },
  ],
};

/**
 * ジャンプボールモーションコンフィグ
 */
export const JUMP_BALL_MOTION_CONFIG: MotionConfig = {
  motionData: JUMP_BALL_MOTION,
  isDefault: false,
  blendDuration: 0.05,   // 素早いブレンド
  priority: 50,
  interruptible: false,
};

/**
 * ジャンプボールモーションマップ
 */
export const JUMP_BALL_MOTIONS = {
  jump_ball: JUMP_BALL_MOTION,
};
