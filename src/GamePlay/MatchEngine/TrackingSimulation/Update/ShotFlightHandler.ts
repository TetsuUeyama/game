/**
 * ShotFlightHandler - シュート飛行中の更新: ゴール到達判定 + ブロック判定 + ミス判定
 * TrackingSimulation3D.ts から抽出。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState } from "../Types/TrackingSimTypes";
import {
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
} from "../Config/FieldConfig";
import { BALL_TIMEOUT } from "../Config/BallTimingConfig";
import {
  GOAL_RIM_X,
  GOAL_RIM_Y,
  GOAL_RIM_Z,
  GOAL_RIM_RADIUS,
} from "../Config/ShootConfig";
import { updateTargetRoleMovements } from "./SimEntityUpdate";
import { checkObstacleDeflection } from "./BallCollision";

export interface ShotFlightResult {
  completed: boolean;
  scored: boolean;
  /** ショットがブロックされた（ルーズボール遷移用） */
  blocked: boolean;
  /** ブロック時の弾き方向 */
  blockDirection: Vector3 | null;
}

/**
 * シュート飛行中の更新: ターゲット移動 + ブロック判定 + ゴール到達判定 + ミス判定
 */
export function updateShotFlight(
  state: SimState,
  ballPos: Vector3,
  ballInFlight: boolean,
  dt: number,
  allHands?: { left: Vector3; right: Vector3 }[],
): ShotFlightResult {
  // Targets continue role movement during shot flight
  updateTargetRoleMovements(state, dt, -1);

  // ブロック判定: DF手によるショットブロック
  if (allHands) {
    const obStart = 1 + state.targets.length;
    const obstacleHands = allHands.slice(obStart, obStart + state.obstacles.length);

    // block アクション中のDFの手のみチェック
    const blockingHands: { left: Vector3; right: Vector3 }[] = [];
    const blockingCooldowns: number[] = [];
    for (let oi = 0; oi < state.obstacles.length; oi++) {
      const obEntityIdx = obStart + oi;
      const action = state.actionStates[obEntityIdx];
      if (action?.type === 'block' && (action.phase === 'startup' || action.phase === 'active')) {
        blockingHands.push(obstacleHands[oi]);
        blockingCooldowns.push(0); // ブロック判定にクールダウンなし
      } else {
        // ダミー: 遠方の手位置（判定に引っかからない）
        blockingHands.push({
          left: new Vector3(9999, 9999, 9999),
          right: new Vector3(9999, 9999, 9999),
        });
        blockingCooldowns.push(9999);
      }
    }

    const deflection = checkObstacleDeflection(
      ballPos.x, ballPos.y, ballPos.z,
      blockingHands, blockingCooldowns,
    );
    if (deflection.deflected) {
      return { completed: true, scored: false, blocked: true, blockDirection: deflection.direction };
    }
  }

  // ゴール判定: Y がリム高さを上→下に通過 & XZ距離がリム半径内
  const curBallY = ballPos.y;
  const crossedDown = state.prevBallY > GOAL_RIM_Y && curBallY <= GOAL_RIM_Y;
  const xzDist = Math.sqrt(
    (ballPos.x - GOAL_RIM_X) ** 2 + (ballPos.z - GOAL_RIM_Z) ** 2,
  );

  state.prevBallY = curBallY;

  if (crossedDown && xzDist < GOAL_RIM_RADIUS) {
    return { completed: true, scored: true, blocked: false, blockDirection: null };
  }

  // ミス判定: 着地 / OOB / タイムアウト
  const margin = SIM_MARGIN * 2;
  const isOOB = ballPos.x < -SIM_FIELD_X_HALF - margin || ballPos.x > SIM_FIELD_X_HALF + margin
    || ballPos.z < -SIM_FIELD_Z_HALF - margin || ballPos.z > SIM_FIELD_Z_HALF + margin;
  if ((!ballInFlight && state.ballAge > 1.0) || isOOB || state.ballAge > BALL_TIMEOUT) {
    return { completed: true, scored: false, blocked: false, blockDirection: null };
  }

  return { completed: false, scored: false, blocked: false, blockDirection: null };
}
