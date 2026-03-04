/**
 * BlockAction - ディフェンスのジャンプブロックアクション
 */

import type { ActionTiming, SimMover } from "../Types/TrackingSimTypes";
import { BLOCK_TRIGGER_DIST, BLOCK_ATTEMPT_PROB, BLOCK_REACTION_DELAY } from "../Config/JumpConfig";
import { dist2d } from "../Movement/MovementCore";

/** ブロックアクションのタイミング定義 */
export const BLOCK_TIMING: ActionTiming = {
  charge: BLOCK_REACTION_DELAY,  // 反応遅延
  startup: 0.05,                  // 予備動作
  active: 1.5,                    // 空中（着地で強制recovery）
  recovery: 0.3,                  // 着地硬直
};

/** ブロック可能条件: 距離 + 地上 */
export function canBlock(defender: SimMover, shooter: SimMover): boolean {
  if (defender.y > 0.001) return false; // 既に空中
  const d = dist2d(defender.x, defender.z, shooter.x, shooter.z);
  return d <= BLOCK_TRIGGER_DIST;
}

/** ブロック試行確率判定 */
export function shouldAttemptBlock(defender: SimMover, shooter: SimMover): boolean {
  if (!canBlock(defender, shooter)) return false;
  return Math.random() < BLOCK_ATTEMPT_PROB;
}
