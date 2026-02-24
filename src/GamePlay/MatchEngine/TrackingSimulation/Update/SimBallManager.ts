/**
 * SimBallManager - ボールのライフサイクル管理
 * TrackingSimulation3D から抽出。Ball (Babylon.js) はパラメータとして受け取る。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState } from "../Types/TrackingSimTypes";
import { createIdleAction, startAction } from "../Action/ActionCore";
import { PASS_TIMING } from "../Action/PassAction";
import { MOVE_TIMING } from "../Action/MoveAction";
import { OBSTACLE_REACT_TIMING } from "../Action/ObstacleReactAction";
import { computeObstacleReactions } from "../Action/PassAction";
import { dist2d, restoreRandom } from "../Movement/MovementCore";
import {
  TARGET_RANDOM_SPEED,
  OB_A_IDLE_SPEED,
  OB_C_IDLE_SPEED,
  OB_D_IDLE_SPEED,
  OB_E_IDLE_SPEED,
  SOLVER_CFG_3D,
} from "../Config/EntityConfig";
import { ENTITY_HEIGHT } from "../Config/FieldConfig";
import type { Ball } from "@/GamePlay/Object/Entities/Ball";

/** Ball launch/target Y height (upper portion of entity boxes) */
const BALL_LAUNCH_Y = ENTITY_HEIGHT * 0.7;

/** Obstacle intercept speeds (shared index) */
import {
  OB_A_INTERCEPT_SPEED,
  OB_B_CHASE_SPEED,
  OB_C_INTERCEPT_SPEED,
  OB_D_INTERCEPT_SPEED,
  OB_E_INTERCEPT_SPEED,
} from "../Config/EntityConfig";

const OB_INT_SPEEDS = [
  OB_A_INTERCEPT_SPEED, OB_B_CHASE_SPEED, OB_C_INTERCEPT_SPEED,
  OB_D_INTERCEPT_SPEED, OB_E_INTERCEPT_SPEED,
];

/** ボールを非アクティブにする */
export function deactivateBall(state: SimState, ball: Ball, ballTrailPositions: Vector3[]): void {
  if (ball.isInFlight()) {
    ball.endFlight();
  }
  ball.mesh.setEnabled(false);
  state.ballActive = false;
  state.ballAge = 0;
  ballTrailPositions.length = 0;
}

/** アーク軌道でボールを発射 */
export function fireBallArc(
  state: SimState, ball: Ball,
  startX: number, startZ: number, targetX: number, targetZ: number,
): boolean {
  const startPos = new Vector3(startX, BALL_LAUNCH_Y, startZ);
  const targetPos = new Vector3(targetX, BALL_LAUNCH_Y, targetZ);
  const distance = dist2d(startX, startZ, targetX, targetZ);
  const arcHeight = Math.max(0.3, distance * 0.10);

  ball.mesh.setEnabled(true);
  const success = ball.shootWithArcHeight(targetPos, arcHeight, startPos);
  if (success) {
    state.ballActive = true;
    state.ballAge = 0;
  }
  return success;
}

/** startup完了後にボールを実際に発射 */
export function executePendingFire(state: SimState, ball: Ball): void {
  if (!state.pendingFire) return;
  const sol = state.pendingFire;
  state.pendingFire = null;

  const success = fireBallArc(state, ball, state.launcher.x, state.launcher.z, sol.interceptX, sol.interceptZ);
  if (!success) {
    // 発射失敗 → アイドルに戻す
    state.actionStates[0] = createIdleAction();
    state.cooldown = 0.3;
    return;
  }

  state.interceptPt = { x: sol.interceptX, z: sol.interceptZ };
  state.selectedTargetIdx = sol.targetIdx;
  state.preFire = null;

  // ターゲット速度設定 & 即座にmove activeに（intercept地点への移動）
  const tgt = state.targets[sol.targetIdx];
  tgt.vx = sol.targetVelocity.vx;
  tgt.vz = sol.targetVelocity.vz;
  state.actionStates[1 + sol.targetIdx] = { type: 'move', phase: 'active', elapsed: 0, timing: MOVE_TIMING };
  state.moveDistAccum[1 + sol.targetIdx] = 0;

  // 障害物リアクション
  const bPos = ball.getPosition();
  const bVel = ball.getVelocity();
  const reactions = computeObstacleReactions(
    state.obstacles, OB_INT_SPEEDS, sol.obInFOVs,
    bPos.x, bPos.z, bVel.x, bVel.z, SOLVER_CFG_3D,
  );
  const reactingObs = [false, false, false, false, false];
  for (const r of reactions) {
    reactingObs[r.obstacleIdx] = r.reacting;
    if (r.reacting) {
      state.obstacles[r.obstacleIdx].vx = r.vx;
      state.obstacles[r.obstacleIdx].vz = r.vz;
      // 障害物アクション: active（インターセプト）
      state.actionStates[6 + r.obstacleIdx] = startAction('obstacle_react', OBSTACLE_REACT_TIMING);
    }
  }
  state.obReacting = reactingObs;
}

/** ボール結果後の状態リセット */
export function resetAfterResult(state: SimState): void {
  state.interceptPt = null;
  state.obReacting = [false, false, false, false, false];
  for (let ti = 0; ti < state.targets.length; ti++) state.targetDests[ti] = null;
  for (const t of state.targets) restoreRandom(t, TARGET_RANDOM_SPEED);
  restoreRandom(state.obstacles[0], OB_A_IDLE_SPEED);
  restoreRandom(state.obstacles[2], OB_C_IDLE_SPEED);
  restoreRandom(state.obstacles[3], OB_D_IDLE_SPEED);
  restoreRandom(state.obstacles[4], OB_E_IDLE_SPEED);

  // Reset role states
  state.launcherState = { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 };
  state.slasherState = { dest: null, reevalTimer: 0, vcutPhase: state.slasherState.vcutPhase, vcutActive: false };
  state.screenerState = { dest: null, reevalTimer: 0, screenSet: false, holdTimer: 0 };
  state.dunkerState = { dest: null, reevalTimer: 0, sealing: false };
}

// Re-export for orchestrator convenience
export { OB_INT_SPEEDS, PASS_TIMING };
