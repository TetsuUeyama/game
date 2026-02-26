/**
 * ShootAction - シュートアクションのタイミング、条件チェック、ターゲット計算
 *
 * シュートレンジはゴールからの距離ベース（最大 MAX_SHOOT_RANGE）。
 * 距離が延びるほどチャージ時間が増加する。
 */

import type { ActionTiming, SimMover } from "../Types/TrackingSimTypes";
import {
  GOAL_RIM_X,
  GOAL_RIM_Y,
  GOAL_RIM_Z,
  MAX_SHOOT_RANGE,
  MIN_SHOOT_Z,
  MAX_SHOOT_CHARGE,
  SHOOT_CHARGE_DEAD_ZONE,
} from "../Config/FieldConfig";
import { dist2d } from "../Movement/MovementCore";

/**
 * シュート可能条件チェック（距離ベース）
 * - ゴールから MAX_SHOOT_RANGE (8.5m) 以内
 * - Z座標が MIN_SHOOT_Z (2.0) 以上（バックコート防止）
 */
export function canShoot(shooter: SimMover): boolean {
  if (shooter.z < MIN_SHOOT_Z) return false;
  const d = dist2d(shooter.x, shooter.z, GOAL_RIM_X, GOAL_RIM_Z);
  return d <= MAX_SHOOT_RANGE;
}

/**
 * シュートタイミングを距離に応じて計算
 *
 * - ゴール下 (d ≤ 1m): charge = 0（レイアップ）
 * - 中距離 (d ≈ 4m): charge ≈ 0.32s
 * - 3Pライン (d ≈ 7.2m): charge ≈ 0.66s
 * - 最大距離 (d = 8.5m): charge = 0.8s
 */
export function computeShootTiming(shooter: SimMover): ActionTiming {
  const d = dist2d(shooter.x, shooter.z, GOAL_RIM_X, GOAL_RIM_Z);
  const charge = d <= SHOOT_CHARGE_DEAD_ZONE
    ? 0
    : (d - SHOOT_CHARGE_DEAD_ZONE) / (MAX_SHOOT_RANGE - SHOOT_CHARGE_DEAD_ZONE) * MAX_SHOOT_CHARGE;
  return {
    charge,
    startup: 0.3,    // シュートフォーム準備
    active: 0.2,     // リリース
    recovery: 0.5,   // フォロースルー
  };
}

/** ランダムオフセット付きターゲット座標（ゴールリム付近） */
export function computeShotTarget(): { x: number; y: number; z: number } {
  const offsetX = (Math.random() * 2 - 1) * 0.15;
  const offsetZ = (Math.random() * 2 - 1) * 0.15;
  return {
    x: GOAL_RIM_X + offsetX,
    y: GOAL_RIM_Y,
    z: GOAL_RIM_Z + offsetZ,
  };
}
