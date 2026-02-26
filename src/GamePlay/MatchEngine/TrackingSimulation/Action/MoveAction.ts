/**
 * MoveAction - 移動アクションのタイミング定義と硬直時間計算
 */

import type { ActionTiming } from "../Types/TrackingSimTypes";

/** 移動アクションのタイミング定義 */
export const MOVE_TIMING: ActionTiming = {
  charge: 0,       // チャージなし
  startup: 0.08,   // 移動準備（姿勢変更等）
  active: 10.0,    // イベント駆動（目的地到達まで）
  recovery: 0.15,  // ベース硬直（距離に応じて増加）
};

/** 移動硬直の計算係数 */
export const MOVE_RECOVERY_BASE = 0.15;
export const MOVE_RECOVERY_PER_UNIT = 0.04;

/** 移動距離に応じた硬直時間を計算 */
export function computeMoveRecovery(distanceTraveled: number): number {
  return MOVE_RECOVERY_BASE + MOVE_RECOVERY_PER_UNIT * distanceTraveled;
}
