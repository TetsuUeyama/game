/**
 * 基本姿勢（ベースポーズ）
 *
 * 全モーションの基準となる静的な直立姿勢を定義。
 * IdleMotion はこれに呼吸デルタを加算し、
 * WalkMotion 等は IdleMotion（= ベース＋呼吸）をさらにベースにする。
 */

import { MotionData } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes } from "@/GamePlay/GameSystem/CharacterMove/Utils/MotionUtils";

/** 各関節の静的な基本角度（IdleMotion T0 から抽出） */
export const BASE_POSE: Record<string, number> = {
  // 上半身
  upperBodyX: 0, upperBodyY: 0, upperBodyZ: 0,
  lowerBodyX: 0, lowerBodyY: 0, lowerBodyZ: 0,
  headX: 0, headY: 0, headZ: 0,

  // 腕
  leftShoulderX: -75, leftShoulderY: -75, leftShoulderZ: 75,
  rightShoulderX: -75, rightShoulderY: -75, rightShoulderZ: 75,
  leftElbowX: -10, leftElbowY: 0, leftElbowZ: 0,
  rightElbowX: -10, rightElbowY: 0, rightElbowZ: 0,

  // 脚
  leftHipX: 0, leftHipY: -15, leftHipZ: -8,
  rightHipX: 0, rightHipY: 15, rightHipZ: 8,
  leftKneeX: 5, leftKneeY: 0, leftKneeZ: 5,
  rightKneeX: 5, rightKneeY: 0, rightKneeZ: -5,
  leftFootX: 0, leftFootY: 0, leftFootZ: 0,
  rightFootX: 0, rightFootY: 0, rightFootZ: 0,
};

/**
 * BASE_POSE を指定した時間配列で展開する。
 * 全タイムポイントで同じ値を持つ Record<string, Record<number, number>> を返す。
 */
export function expandBasePose(times: number[]): Record<string, Record<number, number>> {
  const result: Record<string, Record<number, number>> = {};
  for (const [joint, value] of Object.entries(BASE_POSE)) {
    result[joint] = {};
    for (const t of times) {
      result[joint][t] = value;
    }
  }
  return result;
}

/** 静的な基本姿勢を MotionData として公開（モーションチェック用） */
export const BASE_MOTION: MotionData = {
  name: "base_pose",
  duration: 1.0,
  loop: true,
  keyframes: buildKeyframes(expandBasePose([0, 1.0])),
};
