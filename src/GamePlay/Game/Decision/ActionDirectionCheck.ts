/**
 * ActionDirectionCheck - パス/シュート方向制約のロジック層ユーティリティ
 *
 * - ドリブルハンド判定（ArmRenderer と同じアルゴリズムをロジック層に抽出）
 * - パス/シュートコーン判定
 * - アラインメントチャージ時間計算
 * - 発射時アラインメント検証
 */

import type { SimMover } from "../Types/TrackingSimTypes";
import { normAngleDiff } from "../Movement/MovementCore";
import { TURN_RATE } from "../Config/BodyDynamicsConfig";
import {
  SHOOT_HALF_ANGLE,
  PASS_SIDE_ALLOW,
  PASS_FRONT_ALLOW,
  FIRE_ALIGNMENT_TOLERANCE,
} from "../Config/ActionDirectionConfig";

/** DF近接判定の半径（ArmRenderer.DRIBBLE_DEFENDER_RADIUS と同値） */
const DRIBBLE_DEFENDER_RADIUS = 2.0;

/**
 * ドリブルハンドを計算（ArmRenderer と同じロジック）。
 * 最も近いDFの位置から、DFと反対側の手でドリブルする。
 * DF不在時はデフォルト 'right'。
 */
export function computeDribbleHand(
  mover: SimMover,
  obstacles: SimMover[],
): 'left' | 'right' {
  let closestDist = Infinity;
  let defenderSide: 'left' | 'right' | null = null;

  for (const def of obstacles) {
    const dx = def.x - mover.x;
    const dz = def.z - mover.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < DRIBBLE_DEFENDER_RADIUS && dist < closestDist) {
      closestDist = dist;
      // torsoFacing に対してDFが右側か左側かを外積で判定
      const faceCos = Math.cos(mover.torsoFacing);
      const faceSin = Math.sin(mover.torsoFacing);
      const cross = faceCos * dz - faceSin * dx;
      defenderSide = cross >= 0 ? 'left' : 'right';
    }
  }

  // DFが右側 → 左手ドリブル、DFが左側 → 右手ドリブル、遠い → 右手
  return defenderSide === 'right' ? 'left' : 'right';
}

/**
 * パス方向がコーン内かチェック。
 * @param relAngle facing→target の相対角度（normAngleDiff 結果、正=左、負=右）
 * @param dribbleHand ボール保持手
 *
 * 右手: [-PASS_SIDE_ALLOW, +PASS_FRONT_ALLOW] — 右側に広い
 * 左手: [-PASS_FRONT_ALLOW, +PASS_SIDE_ALLOW] — 左側に広い
 */
export function isPassDirectionValid(
  relAngle: number,
  dribbleHand: 'left' | 'right',
): boolean {
  if (dribbleHand === 'right') {
    return relAngle >= -PASS_SIDE_ALLOW && relAngle <= PASS_FRONT_ALLOW;
  } else {
    return relAngle >= -PASS_FRONT_ALLOW && relAngle <= PASS_SIDE_ALLOW;
  }
}

/**
 * シュート方向がコーン内かチェック。
 * @param relAngle facing→goal の相対角度
 */
export function isShootDirectionValid(relAngle: number): boolean {
  return Math.abs(relAngle) <= SHOOT_HALF_ANGLE;
}

/**
 * パスのアラインメントチャージ時間を計算。
 * レシーバーがコーン内 → 0、コーン外 → コーン境界までの最小回転量 / TURN_RATE。
 */
export function computePassAlignCharge(
  passer: SimMover,
  receiverX: number,
  receiverZ: number,
  dribbleHand: 'left' | 'right',
): number {
  const targetAngle = Math.atan2(receiverZ - passer.z, receiverX - passer.x);
  const relAngle = normAngleDiff(passer.facing, targetAngle);

  if (isPassDirectionValid(relAngle, dribbleHand)) return 0;

  // コーン境界までの最小回転量を計算
  let rotation: number;
  if (dribbleHand === 'right') {
    // コーン: [-PASS_SIDE_ALLOW, +PASS_FRONT_ALLOW]
    if (relAngle < -PASS_SIDE_ALLOW) {
      rotation = -PASS_SIDE_ALLOW - relAngle;
    } else {
      rotation = relAngle - PASS_FRONT_ALLOW;
    }
  } else {
    // コーン: [-PASS_FRONT_ALLOW, +PASS_SIDE_ALLOW]
    if (relAngle < -PASS_FRONT_ALLOW) {
      rotation = -PASS_FRONT_ALLOW - relAngle;
    } else {
      rotation = relAngle - PASS_SIDE_ALLOW;
    }
  }

  return Math.abs(rotation) / TURN_RATE;
}

/**
 * シュートのアラインメントチャージ時間を計算。
 * ゴールがコーン内 → 0、コーン外 → コーン境界までの回転量 / TURN_RATE。
 */
export function computeShootAlignCharge(
  shooter: SimMover,
  goalX: number,
  goalZ: number,
): number {
  const targetAngle = Math.atan2(goalZ - shooter.z, goalX - shooter.x);
  const relAngle = normAngleDiff(shooter.facing, targetAngle);

  if (isShootDirectionValid(relAngle)) return 0;

  const rotation = Math.abs(relAngle) - SHOOT_HALF_ANGLE;
  return rotation / TURN_RATE;
}

/**
 * 発射時（startup→active 遷移）のアラインメント検証。
 * トルソー方向がターゲットに対してコーン+許容誤差内なら true。
 */
export function isAlignedForFire(
  mover: SimMover,
  targetX: number,
  targetZ: number,
  actionType: 'pass' | 'shoot',
  dribbleHand: 'left' | 'right',
): boolean {
  const targetAngle = Math.atan2(targetZ - mover.z, targetX - mover.x);
  const relAngle = normAngleDiff(mover.torsoFacing, targetAngle);

  if (actionType === 'shoot') {
    return Math.abs(relAngle) <= SHOOT_HALF_ANGLE + FIRE_ALIGNMENT_TOLERANCE;
  }

  // pass: コーン + 許容誤差
  if (dribbleHand === 'right') {
    return relAngle >= -(PASS_SIDE_ALLOW + FIRE_ALIGNMENT_TOLERANCE)
        && relAngle <= (PASS_FRONT_ALLOW + FIRE_ALIGNMENT_TOLERANCE);
  } else {
    return relAngle >= -(PASS_FRONT_ALLOW + FIRE_ALIGNMENT_TOLERANCE)
        && relAngle <= (PASS_SIDE_ALLOW + FIRE_ALIGNMENT_TOLERANCE);
  }
}
