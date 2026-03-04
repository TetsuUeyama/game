/**
 * MoveAction - 移動アクションのタイミング定義と硬直時間計算
 */

import type { ActionTiming } from "../Types/TrackingSimTypes";
import {
  SPRINT_COOLDOWN_SPEED_MIN,
  SPRINT_COOLDOWN_PER_SPEED,
  SPRINT_COOLDOWN_MAX,
} from "../Config/JumpConfig";

/** 移動アクションのタイミング定義 */
export const MOVE_TIMING: ActionTiming = {
  charge: 0,       // チャージなし
  startup: 0.08,   // 移動準備（姿勢変更等）
  active: 10.0,    // イベント駆動（目的地到達まで）
  recovery: 0.15,  // ベース硬直（速度に応じて増加）
};

/** 移動硬直のベース値 */
export const MOVE_RECOVERY_BASE = 0.15;

/** 速度に応じた硬直時間を計算 */
export function computeMoveRecovery(lastSpeed: number): number {
  if (lastSpeed <= SPRINT_COOLDOWN_SPEED_MIN) return MOVE_RECOVERY_BASE;
  const cd = SPRINT_COOLDOWN_PER_SPEED * (lastSpeed - SPRINT_COOLDOWN_SPEED_MIN);
  return Math.min(Math.max(MOVE_RECOVERY_BASE, cd), SPRINT_COOLDOWN_MAX);
}
