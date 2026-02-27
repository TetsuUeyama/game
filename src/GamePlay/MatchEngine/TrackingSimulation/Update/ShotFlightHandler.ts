/**
 * ShotFlightHandler - シュート飛行中の更新: ゴール到達判定 + ミス判定
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

export interface ShotFlightResult {
  completed: boolean;
  scored: boolean;
}

/**
 * シュート飛行中の更新: ターゲット移動 + ゴール到達判定 + ミス判定
 */
export function updateShotFlight(
  state: SimState,
  ballPos: Vector3,
  ballInFlight: boolean,
  dt: number,
): ShotFlightResult {
  // Targets continue role movement during shot flight
  updateTargetRoleMovements(state, dt, -1);

  // ゴール判定: Y がリム高さを上→下に通過 & XZ距離がリム半径内
  const curBallY = ballPos.y;
  const crossedDown = state.prevBallY > GOAL_RIM_Y && curBallY <= GOAL_RIM_Y;
  const xzDist = Math.sqrt(
    (ballPos.x - GOAL_RIM_X) ** 2 + (ballPos.z - GOAL_RIM_Z) ** 2,
  );

  state.prevBallY = curBallY;

  if (crossedDown && xzDist < GOAL_RIM_RADIUS) {
    return { completed: true, scored: true };
  }

  // ミス判定: 着地 / OOB / タイムアウト
  const margin = SIM_MARGIN * 2;
  const isOOB = ballPos.x < -SIM_FIELD_X_HALF - margin || ballPos.x > SIM_FIELD_X_HALF + margin
    || ballPos.z < -SIM_FIELD_Z_HALF - margin || ballPos.z > SIM_FIELD_Z_HALF + margin;
  if ((!ballInFlight && state.ballAge > 1.0) || isOOB || state.ballAge > BALL_TIMEOUT) {
    return { completed: true, scored: false };
  }

  return { completed: false, scored: false };
}
