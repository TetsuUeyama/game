import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes, createDerivedMotion } from "@/GamePlay/GameSystem/CharacterMove/Utils/MotionUtils";
import { expandBasePose } from "@/GamePlay/GameSystem/CharacterMove/Motion/BaseMotion";

/**
 * アイドル（直立）モーション
 *
 * BaseMotion（静的な基本姿勢）に呼吸デルタを加算して生成。
 *
 * キーフレーム構成：
 * - T0: 直立姿勢（= BASE_POSE）
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

const IDLE_TIMES = [T0, T1, T2, T3, T4];

// 呼吸による差分のみ定義（BASE_POSE からの変位）
const IDLE_ADDITIONS: Record<string, number[]> = {
  upperBodyX: [0, 2, 0, 0, 0],
  lowerBodyY: [0, 5, 0, -5, 0],
  headX: [0, -1, 0, 0, 0],
  leftShoulderX: [0, 5, 0, -5, 0],
  rightShoulderX: [0, -5, 0, 5, 0],
};

// BASE_POSE を全タイムポイントに展開し、呼吸デルタを加算
export const IDLE_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  expandBasePose(IDLE_TIMES),
  IDLE_TIMES,
  IDLE_TIMES,
  IDLE_ADDITIONS
);

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
