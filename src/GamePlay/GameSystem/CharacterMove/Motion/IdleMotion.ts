import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes } from "@/GamePlay/GameSystem/CharacterMove/Utils/MotionUtils";

/**
 * アイドル（直立）モーション
 *
 * キーフレーム構成：
 * - T0: 直立姿勢
 * - T1: わずかな呼吸の動き
 * - T2: 直立姿勢（元に戻る）
 * - T3: わずかな呼吸の動き（逆方向）
 * - T4: 直立姿勢（元に戻る）
 */

// 時間定義
export const T0 = 0.0;  // 開始
export const T1 = 0.5;  // 第1キーフレーム
export const T2 = 1.0;  // 第2キーフレーム
export const T3 = 1.5;  // 第3キーフレーム
export const T4 = 2.0;  // 終了

// 各部位の軸ごとの時系列データ（時間: 角度）
export const IDLE_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身
  upperBodyX: {[T0]: 0, [T1]: 2, [T2]: 0, [T3]: 0, [T4]: 0},
  upperBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  upperBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  lowerBodyX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  lowerBodyY: {[T0]: 0, [T1]: 5, [T2]: 0, [T3]: -5, [T4]: 0},
  lowerBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  headX: {[T0]: 0, [T1]: -1, [T2]: 0, [T3]: 0, [T4]: 0},
  headY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  headZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},

  // 腕
  leftShoulderX: {[T0]: 0, [T1]: 5, [T2]: 0, [T3]: -5, [T4]: 0},
  leftShoulderY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftShoulderZ: {[T0]: -6, [T1]: -6, [T2]: -6, [T3]: -6, [T4]: -6},

  rightShoulderX: {[T0]: 0, [T1]: -5, [T2]: 0, [T3]: 5, [T4]: 0},
  rightShoulderY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightShoulderZ: {[T0]: 6, [T1]: 6, [T2]: 6, [T3]: 6, [T4]: 6},

  leftElbowX: {[T0]: -10, [T1]: -10, [T2]: -10, [T3]: -10, [T4]: -10},
  leftElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftElbowZ: {[T0]: 6, [T1]: 6, [T2]: 6, [T3]: 6, [T4]: 6},

  rightElbowX: {[T0]: -10, [T1]: -10, [T2]: -10, [T3]: -10, [T4]: -10},
  rightElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightElbowZ: {[T0]: -6, [T1]: -6, [T2]: -6, [T3]: -6, [T4]: -6},

  // 脚
  leftHipX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftHipY: {[T0]: -15, [T1]: -15, [T2]: -15, [T3]: -15, [T4]: -15},
  leftHipZ: {[T0]: -8, [T1]: -8, [T2]: -8, [T3]: -8, [T4]: -8},

  rightHipX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightHipY: {[T0]: 15, [T1]: 15, [T2]: 15, [T3]: 15, [T4]: 15},
  rightHipZ: {[T0]: 8, [T1]: 8, [T2]: 8, [T3]: 8, [T4]: 8},

  leftKneeX: {[T0]: 5, [T1]: 5, [T2]: 5, [T3]: 5, [T4]: 5},
  leftKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  leftKneeZ: {[T0]: 5, [T1]: 5, [T2]: 5, [T3]: 5, [T4]: 5},

  rightKneeX: {[T0]: 5, [T1]: 5, [T2]: 5, [T3]: 5, [T4]: 5},
  rightKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
  rightKneeZ: {[T0]: -5, [T1]: -5, [T2]: -5, [T3]: -5, [T4]: -5},
};

const POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0, [T4]: 0},
};

export const IDLE_MOTION: MotionData = {
  name: "idle",
  duration: T4, // 1サイクル: T4秒
  loop: true,
  keyframes: buildKeyframes(IDLE_JOINT_ANIMATIONS, POSITION_ANIMATIONS),
  // 優先度設定（全体的に低め）
  priorities: [
    {jointName: "upperBody", priority: 5},
    {jointName: "head", priority: 4},
    {jointName: "lowerBody", priority: 3},
  ],
};

/**
 * アイドルモーションの設定
 */
export const IDLE_MOTION_CONFIG: MotionConfig = {
  motionData: IDLE_MOTION,
  isDefault: true, // デフォルトモーション
  blendDuration: 0.3, // 0.3秒でブレンド
  priority: 0, // 最低優先度
  interruptible: true, // 中断可能
};
