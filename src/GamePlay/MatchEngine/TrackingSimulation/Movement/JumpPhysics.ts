/**
 * JumpPhysics - 垂直方向のジャンプ物理（重力ベース放物線）
 */

import type { SimMover } from "../Types/TrackingSimTypes";
import { GRAVITY } from "../Config/JumpConfig";

/** 重力適用、y更新、地面クランプ */
export function tickJumpPhysics(mover: SimMover, dt: number): void {
  if (mover.y <= 0 && mover.vy <= 0) return;

  mover.vy -= GRAVITY * dt;
  mover.y += mover.vy * dt;

  // 地面クランプ
  if (mover.y <= 0) {
    mover.y = 0;
    mover.vy = 0;
  }
}

/** ジャンプ開始（地上のみ） */
export function startJump(mover: SimMover, initialVy: number): void {
  if (mover.y > 0.001) return; // 既に空中
  mover.vy = initialVy;
}

/** 空中判定 */
export function isAirborne(mover: SimMover): boolean {
  return mover.y > 0.001;
}
