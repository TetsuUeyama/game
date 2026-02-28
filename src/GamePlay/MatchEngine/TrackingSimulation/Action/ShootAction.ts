/**
 * ShootAction - シュートアクションのタイミング、条件チェック、ターゲット計算
 *
 * シュートレンジはゴールからの距離ベース（最大 MAX_SHOOT_RANGE）。
 * 距離に応じてダンク/レイアップ/ジャンプシュートに自動分岐。
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
  SHOT_ARC_HEIGHT,
} from "../Config/ShootConfig";
import {
  DUNK_MAX_DIST,
  LAYUP_MAX_DIST,
  DUNK_JUMP_VY,
  LAYUP_JUMP_VY,
  JUMPSHOT_JUMP_VY,
  DUNK_ARC_HEIGHT,
  LAYUP_ARC_HEIGHT,
  DUNK_STARTUP,
  LAYUP_STARTUP,
  DUNK_RELEASE_Y_OFFSET,
  LAYUP_RELEASE_Y_OFFSET,
} from "../Config/JumpConfig";
import { ENTITY_HEIGHT } from "../Config/FieldConfig";
import { dist2d } from "../Movement/MovementCore";

/** シュート種別 */
export type ShotType = 'dunk' | 'layup' | 'jumpshot';

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

/** 距離からシュート種別を判定 */
export function classifyShotType(shooter: SimMover): ShotType {
  const d = dist2d(shooter.x, shooter.z, GOAL_RIM_X, GOAL_RIM_Z);
  if (d <= DUNK_MAX_DIST) return 'dunk';
  if (d <= LAYUP_MAX_DIST) return 'layup';
  return 'jumpshot';
}

/**
 * シュートタイミングを距離・種別に応じて計算
 *
 * - ダンク/レイアップ: charge = alignCharge のみ（距離チャージなし）
 * - ジャンプシュート: 距離チャージ + alignCharge
 * - startup: 種別ごとに異なる値
 */
export function computeShootTiming(shooter: SimMover, alignCharge?: number): ActionTiming {
  const shotType = classifyShotType(shooter);
  const d = dist2d(shooter.x, shooter.z, GOAL_RIM_X, GOAL_RIM_Z);

  let charge: number;
  if (shotType === 'jumpshot') {
    const distCharge = d <= SHOOT_CHARGE_DEAD_ZONE
      ? 0
      : (d - SHOOT_CHARGE_DEAD_ZONE) / (MAX_SHOOT_RANGE - SHOOT_CHARGE_DEAD_ZONE) * MAX_SHOOT_CHARGE;
    charge = alignCharge !== undefined ? Math.max(distCharge, alignCharge) : distCharge;
  } else {
    // ダンク/レイアップ: alignCharge のみ
    charge = alignCharge !== undefined ? Math.max(0, alignCharge) : 0;
  }

  let startup: number;
  switch (shotType) {
    case 'dunk': startup = DUNK_STARTUP; break;
    case 'layup': startup = LAYUP_STARTUP; break;
    default: startup = 0.3; break;
  }

  return {
    charge,
    startup,
    active: 0.2,     // リリース
    recovery: 0.5,   // フォロースルー
  };
}

/** シュート種別からジャンプ速度を返す */
export function getJumpVelocity(shotType: ShotType): number {
  switch (shotType) {
    case 'dunk': return DUNK_JUMP_VY;
    case 'layup': return LAYUP_JUMP_VY;
    case 'jumpshot': return JUMPSHOT_JUMP_VY;
  }
}

/** シュート種別からアーク高さを返す */
export function getArcHeight(shotType: ShotType): number {
  switch (shotType) {
    case 'dunk': return DUNK_ARC_HEIGHT;
    case 'layup': return LAYUP_ARC_HEIGHT;
    case 'jumpshot': return SHOT_ARC_HEIGHT;
  }
}

/** シュート種別からリリース高さオフセットを返す */
export function getReleaseYOffset(shotType: ShotType): number {
  switch (shotType) {
    case 'dunk': return DUNK_RELEASE_Y_OFFSET;
    case 'layup': return LAYUP_RELEASE_Y_OFFSET;
    case 'jumpshot': return ENTITY_HEIGHT + 0.3;
  }
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
