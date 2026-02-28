/**
 * SimBallManager - ボールのライフサイクル管理
 * TrackingSimulation3D から抽出。Ball (Babylon.js) はパラメータとして受け取る。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState } from "../Types/TrackingSimTypes";
import { createIdleAction, startAction } from "../Action/ActionCore";
import { MOVE_TIMING } from "../Action/MoveAction";
import { OBSTACLE_REACT_TIMING } from "../Action/ObstacleReactAction";
import { computeObstacleReactions } from "../Decision/PassEvaluation";
import { dist2d, restoreRandom } from "../Movement/MovementCore";
import {
  TARGET_RANDOM_SPEED,
  SOLVER_CFG_3D,
} from "../Config/EntityConfig";
import { OB_CONFIGS, OBSTACLE_COUNT } from "../Decision/ObstacleRoleAssignment";
import { ENTITY_HEIGHT } from "../Config/FieldConfig";
import { classifyShotType, getArcHeight, getReleaseYOffset } from "../Action/ShootAction";
import type { SimMover } from "../Types/TrackingSimTypes";
import {
  SPAWN_PAINT_X_HALF,
  SPAWN_PAINT_Z_MIN,
  SPAWN_PAINT_Z_MAX,
  SPAWN_BASELINE_Z,
} from "../Config/FieldConfig";
import type { Ball } from "@/GamePlay/Object/Entities/Ball";

/** Ball launch/target Y height (upper portion of entity boxes) */
const BALL_LAUNCH_Y = ENTITY_HEIGHT * 0.7;

/** Obstacle intercept speeds (derived from OB_CONFIGS) */
const OB_INT_SPEEDS = OB_CONFIGS.map(cfg => cfg.interceptSpeed);

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
  yOffset: number = 0,
): boolean {
  const startPos = new Vector3(startX, BALL_LAUNCH_Y + yOffset, startZ);
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
export function executePendingFire(state: SimState, ball: Ball, passerMover: SimMover): void {
  if (!state.pendingFire) return;
  const sol = state.pendingFire;
  state.pendingFire = null;

  // パスのstart位置にジャンプ高さを反映（将来のジャンプパス対応）
  const success = fireBallArc(state, ball, passerMover.x, passerMover.z, sol.interceptX, sol.interceptZ, passerMover.y);
  if (!success) {
    // 発射失敗 → アイドルに戻す
    state.actionStates[state.onBallEntityIdx] = createIdleAction();
    state.cooldown = 0.3;
    return;
  }

  state.interceptPt = { x: sol.interceptX, z: sol.interceptZ };
  state.selectedReceiverEntityIdx = sol.targetIdx;
  state.preFire = null;

  // レシーバー速度設定 & 即座にmove activeに（intercept地点への移動）
  const receiverMover = sol.targetIdx === 0 ? state.launcher : state.targets[sol.targetIdx - 1];
  receiverMover.vx = sol.targetVelocity.vx;
  receiverMover.vz = sol.targetVelocity.vz;
  state.actionStates[sol.targetIdx] = { type: 'move', phase: 'active', elapsed: 0, timing: MOVE_TIMING };
  state.moveDistAccum[sol.targetIdx] = 0;

  // 障害物リアクション
  const bPos = ball.getPosition();
  const bVel = ball.getVelocity();
  const reactions = computeObstacleReactions(
    state.obstacles, OB_INT_SPEEDS, sol.obInFOVs,
    bPos.x, bPos.z, bVel.x, bVel.z, SOLVER_CFG_3D,
  );
  const reactingObs = Array.from({ length: OBSTACLE_COUNT }, () => false);
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
  state.obReacting = Array.from({ length: OBSTACLE_COUNT }, () => false);
  for (let ti = 0; ti < state.targets.length; ti++) state.targetDests[ti] = null;
  for (const t of state.targets) restoreRandom(t, TARGET_RANDOM_SPEED);
  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    if (OB_CONFIGS[oi].restoreRandomOnReset) {
      restoreRandom(state.obstacles[oi], OB_CONFIGS[oi].idleSpeed);
    }
  }

  // Reset role states
  state.launcherState = { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 };
  state.slasherState = { dest: null, reevalTimer: 0, vcutPhase: state.slasherState.vcutPhase, vcutActive: false };
  state.screenerState = { dest: null, reevalTimer: 0, screenSet: false, holdTimer: 0 };
  state.dunkerState = { dest: null, reevalTimer: 0, sealing: false };
}

/** Move offense to backcourt spawn positions and enable transit mode.
 *  Ball holder → baseline (goal line), other 4 → random in red paint area. */
export function resetOffenseToBackcourt(state: SimState): void {
  const allOffense = [state.launcher, ...state.targets];
  for (let i = 0; i < allOffense.length; i++) {
    if (i === state.onBallEntityIdx) {
      // ボールホルダー: ゴールライン（ベースライン）中央からスタート
      allOffense[i].x = 0;
      allOffense[i].z = SPAWN_BASELINE_Z;
    } else {
      // その他: 赤ペイントエリア内のランダム位置
      allOffense[i].x = (Math.random() * 2 - 1) * SPAWN_PAINT_X_HALF;
      allOffense[i].z = SPAWN_PAINT_Z_MIN + Math.random() * (SPAWN_PAINT_Z_MAX - SPAWN_PAINT_Z_MIN);
    }
    allOffense[i].vx = 0;
    allOffense[i].vz = 0;
  }
  for (let i = 0; i < state.offenseInTransit.length; i++) {
    state.offenseInTransit[i] = true;
  }
}

/** シュート発射: シュート種別に応じたリリース高さ・アークで放物線 */
export function executePendingShot(
  state: SimState,
  ball: Ball,
  shooterMover: SimMover,
): void {
  if (!state.pendingShot) return;
  const target = state.pendingShot;
  state.pendingShot = null;

  const shotType = classifyShotType(shooterMover);
  const releaseY = getReleaseYOffset(shotType) + shooterMover.y;
  const arcHeight = getArcHeight(shotType);

  const startPos = new Vector3(shooterMover.x, releaseY, shooterMover.z);
  const targetPos = new Vector3(target.x, target.y, target.z);

  ball.mesh.setEnabled(true);
  const success = ball.shootWithArcHeight(targetPos, arcHeight, startPos);
  if (success) {
    state.ballActive = true;
    state.ballAge = 0;
    state.prevBallY = startPos.y;
  }
}

export { OB_INT_SPEEDS };
