/**
 * BallCollision - ボール衝突検出
 * detectBallResult (パス到達判定), checkObstacleDeflection (DF弾き判定)
 */

import { Vector3 } from "@babylonjs/core";

import type {
  BallResultType,
  BallResultDetection,
} from "../Types/TrackingSimTypes";

import {
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  BALL_DIAMETER,
} from "../Config/FieldConfig";
import {
  HAND_CATCH_RADIUS,
  HAND_BLOCK_RADIUS,
} from "../Config/CollisionConfig";
import { BALL_TIMEOUT } from "../Config/BallTimingConfig";

const BALL_RADIUS = BALL_DIAMETER / 2;

// =========================================================================
// dist3d
// =========================================================================

/** 3D distance between ball and hand position */
function dist3d(bx: number, by: number, bz: number, h: Vector3): number {
  const dx = bx - h.x;
  const dy = by - h.y;
  const dz = bz - h.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// =========================================================================
// detectBallResult
// =========================================================================

/** Check hit → miss in priority order (hand-based 3D collision) */
export function detectBallResult(
  ballPosX: number,
  ballPosY: number,
  ballPosZ: number,
  ballInFlight: boolean,
  ballAge: number,
  targetHandPositions: { left: Vector3; right: Vector3 }[],
): BallResultDetection {
  const none: BallResultDetection = { result: 'none' as BallResultType, cooldownTime: 0 };

  // Hit check: each target's left/right hand (ball surface to hand)
  for (let ti = 0; ti < targetHandPositions.length; ti++) {
    const hands = targetHandPositions[ti];
    if (!hands) continue;
    if (dist3d(ballPosX, ballPosY, ballPosZ, hands.left) < HAND_CATCH_RADIUS + BALL_RADIUS
      || dist3d(ballPosX, ballPosY, ballPosZ, hands.right) < HAND_CATCH_RADIUS + BALL_RADIUS) {
      return { result: 'hit', cooldownTime: 1.5 };
    }
  }

  // OOB / timeout → miss (攻守交替)
  const margin = SIM_MARGIN * 2;
  const out = ballPosX < -SIM_FIELD_X_HALF - margin || ballPosX > SIM_FIELD_X_HALF + margin
    || ballPosZ < -SIM_FIELD_Z_HALF - margin || ballPosZ > SIM_FIELD_Z_HALF + margin;
  if (out || ballAge > BALL_TIMEOUT) {
    return { result: 'miss', cooldownTime: 1.0 };
  }

  // Ball landed (ground contact) → ルーズボールへ移行（即時攻守交替ではない）
  if (!ballInFlight) {
    return { result: 'landed', cooldownTime: 0 };
  }

  return none;
}

// =========================================================================
// checkObstacleDeflection
// =========================================================================

/** 弾き判定の結果 */
export interface DeflectionResult {
  deflected: boolean;
  obstacleIdx: number;
  direction: Vector3;  // 手→ボール中心への正規化方向
}

/** 障害物の手によるボール弾き判定 */
export function checkObstacleDeflection(
  ballPosX: number,
  ballPosY: number,
  ballPosZ: number,
  obstacleHandPositions: { left: Vector3; right: Vector3 }[],
  deflectCooldowns: number[],
): DeflectionResult {
  const noDeflection: DeflectionResult = { deflected: false, obstacleIdx: -1, direction: Vector3.Zero() };

  for (let oi = 0; oi < obstacleHandPositions.length; oi++) {
    if (deflectCooldowns[oi] > 0) continue;

    const hands = obstacleHandPositions[oi];
    if (!hands) continue;

    const distL = dist3d(ballPosX, ballPosY, ballPosZ, hands.left);
    const distR = dist3d(ballPosX, ballPosY, ballPosZ, hands.right);
    const threshold = HAND_BLOCK_RADIUS + BALL_RADIUS;

    let contactHand: Vector3 | null = null;
    if (distL < threshold && distR < threshold) {
      contactHand = distL <= distR ? hands.left : hands.right;
    } else if (distL < threshold) {
      contactHand = hands.left;
    } else if (distR < threshold) {
      contactHand = hands.right;
    }

    if (contactHand) {
      const dx = ballPosX - contactHand.x;
      const dy = ballPosY - contactHand.y;
      const dz = ballPosZ - contactHand.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      return {
        deflected: true,
        obstacleIdx: oi,
        direction: new Vector3(dx / len, dy / len, dz / len),
      };
    }
  }

  return noDeflection;
}
