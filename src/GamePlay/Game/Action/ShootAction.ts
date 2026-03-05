/**
 * ShootAction - シュートアクションのタイミング、条件チェック、ターゲット計算
 *
 * シュートレンジはゴールからの距離ベース（最大 MAX_SHOOT_RANGE）。
 * 距離に応じてダンク/レイアップ/ジャンプシュートに自動分岐。
 */

import type { ActionTiming, SimMover } from "../Types/TrackingSimTypes";
import {
  MAX_SHOOT_RANGE,
  MIN_SHOOT_Z,
  MAX_SHOOT_CHARGE,
  SHOOT_CHARGE_DEAD_ZONE,
  SHOT_ARC_HEIGHT,
} from "../Config/ShootConfig";
import { GOAL_RIM_Y } from "../Config/GoalConfig";
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

/** 動的ゴール座標（state.attackGoalX/Z をセッション開始時に設定） */
let _goalX = 0;
let _goalZ = 13.4;
let _zSign: 1 | -1 = 1;

/** 現在の攻撃ゴール座標を設定（possession切替時に呼ばれる） */
export function setShootGoal(goalX: number, goalZ: number, zSign: 1 | -1): void {
  _goalX = goalX;
  _goalZ = goalZ;
  _zSign = zSign;
}

/** 現在の攻撃ゴールX座標を取得 */
export function getGoalX(): number { return _goalX; }
/** 現在の攻撃ゴールZ座標を取得 */
export function getGoalZ(): number { return _goalZ; }

/**
 * シュート可能条件チェック（距離ベース）
 * - ゴールから MAX_SHOOT_RANGE (8.5m) 以内
 * - バックコート防止: zSign=+1 → z >= MIN_SHOOT_Z, zSign=-1 → z <= -MIN_SHOOT_Z
 */
export function canShoot(shooter: SimMover): boolean {
  if (_zSign === 1) {
    if (shooter.z < MIN_SHOOT_Z) return false;
  } else {
    if (shooter.z > -MIN_SHOOT_Z) return false;
  }
  const d = dist2d(shooter.x, shooter.z, _goalX, _goalZ);
  return d <= MAX_SHOOT_RANGE;
}

/** 距離からシュート種別を判定 */
export function classifyShotType(shooter: SimMover): ShotType {
  const d = dist2d(shooter.x, shooter.z, _goalX, _goalZ);
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
  const d = dist2d(shooter.x, shooter.z, _goalX, _goalZ);

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
    x: _goalX + offsetX,
    y: GOAL_RIM_Y,
    z: _goalZ + offsetZ,
  };
}
