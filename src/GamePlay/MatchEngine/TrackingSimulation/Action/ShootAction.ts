/**
 * ShootAction - シュートアクションのタイミング、条件チェック、ターゲット計算
 */

import type { ActionTiming, SimMover } from "../Types/TrackingSimTypes";
import {
  SHOOT_ZONE_X_HALF,
  SHOOT_ZONE_Z_MIN,
  SHOOT_ZONE_Z_MAX,
  GOAL_RIM_X,
  GOAL_RIM_Y,
  GOAL_RIM_Z,
} from "../Config/FieldConfig";

/** シュートアクションのタイミング定義 */
export const SHOOT_TIMING: ActionTiming = {
  startup: 0.3,    // シュートフォーム準備
  active: 0.2,     // リリース
  recovery: 0.5,   // フォロースルー
};

/**
 * シュート可能条件チェック
 * ペイントエリア内にいればシュート可能
 */
export function canShoot(shooter: SimMover): boolean {
  if (Math.abs(shooter.x) > SHOOT_ZONE_X_HALF) return false;
  if (shooter.z < SHOOT_ZONE_Z_MIN || shooter.z > SHOOT_ZONE_Z_MAX) return false;
  return true;
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
