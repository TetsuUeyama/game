/**
 * JumpPhysics - 垂直方向のジャンプ物理（重力ベース放物線）
 */

import type { SimMover } from "../Types/TrackingSimTypes";
import { GRAVITY, JUMP_MOMENTUM_CARRY } from "../Config/JumpConfig";
import { bounce } from "../Movement/MovementCore";

/** 重力適用、y更新、空中慣性移動、地面クランプ */
export function tickJumpPhysics(mover: SimMover, dt: number): void {
  if (mover.y <= 0 && mover.vy <= 0) return;

  mover.vy -= GRAVITY * dt;
  mover.y += mover.vy * dt;

  // 空中慣性による水平移動
  mover.x += mover.momentumVx * dt;
  mover.z += mover.momentumVz * dt;
  bounce(mover);

  // 地面クランプ + 慣性クリア
  if (mover.y <= 0) {
    mover.y = 0;
    mover.vy = 0;
    mover.momentumVx = 0;
    mover.momentumVz = 0;
  }
}

/** ジャンプ開始（地上のみ）+ 慣性スナップショット */
export function startJump(mover: SimMover, initialVy: number): void {
  if (mover.y > 0.001) return; // 既に空中
  mover.vy = initialVy;
  // 慣性スナップショット: facing 方向に lastSpeed × JUMP_MOMENTUM_CARRY
  const ms = mover.lastSpeed * JUMP_MOMENTUM_CARRY;
  mover.momentumVx = Math.cos(mover.facing) * ms;
  mover.momentumVz = Math.sin(mover.facing) * ms;
}

/** 空中判定 */
export function isAirborne(mover: SimMover): boolean {
  return mover.y > 0.001;
}
