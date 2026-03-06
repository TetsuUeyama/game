/**
 * SimBallManager - ボールのライフサイクル管理
 * TrackingSimulation3D から抽出。Ball (Babylon.js) はパラメータとして受け取る。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState } from "../Types/TrackingSimTypes";
import { createIdleAction, startAction } from "../Action/ActionCore";
import { MOVE_TIMING } from "../Action/MoveAction";
import { OBSTACLE_REACT_TIMING } from "../Config/ObstacleReactAction";
import { computeObstacleReactions, computeArcBallSpeed } from "../Decision/PassEvaluation";
import { solveLaunch } from "../Decision/LaunchSolver";
import { canTargetReach } from "../Decision/TrajectoryAnalysis";
import { dist2d, restoreRandom } from "../Movement/MovementCore";
import {
  TARGET_RANDOM_SPEED,
  TARGET_INTERCEPT_SPEED,
  SOLVER_CFG_3D,
} from "../Config/EntityConfig";
import { OB_CONFIGS, OBSTACLE_COUNT } from "../Decision/ObstacleRoleAssignment";
import {
  ENTITY_HEIGHT,
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  TARGET_STOP_DIST,
} from "../Config/FieldConfig";
import { classifyShotType, getArcHeight, getReleaseYOffset } from "../Action/ShootAction";
import type { SimMover } from "../Types/TrackingSimTypes";
// SPAWN_PAINT_X_HALF, SPAWN_PAINT_Z_MIN, SPAWN_PAINT_Z_MAX, SPAWN_BASELINE_Z
// removed — resetOffenseToBackcourt no longer teleports players
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

/** startup完了後にボールを実際に発射 — 発射時点の位置で軌道を再計算 */
export function executePendingFire(state: SimState, ball: Ball, passerMover: SimMover): void {
  if (!state.pendingFire) return;
  const sol = state.pendingFire;
  state.pendingFire = null;

  // 発射時点のレシーバー位置で再計算（charge+startup中にパッサー・レシーバーが移動しているため）
  const receiverMover = sol.targetIdx === 0 ? state.launcher : state.targets[sol.targetIdx - 1];
  const passDist = dist2d(passerMover.x, passerMover.z, receiverMover.x, receiverMover.z);
  const effBallSpeed = computeArcBallSpeed(passDist);
  const reSol = solveLaunch(
    passerMover.x, passerMover.z,
    receiverMover.x, receiverMover.z, receiverMover.vx, receiverMover.vz,
    effBallSpeed, SOLVER_CFG_3D,
  );

  // 再計算成功 → 新しいインターセプトポイントを使用
  let ipx: number, ipz: number, ft: number;
  if (reSol?.valid) {
    ipx = reSol.interceptPos.x;
    ipz = reSol.interceptPos.z;
    ft = reSol.flightTime;

    // フィールド外チェック
    const margin = SIM_MARGIN;
    if (ipx < -SIM_FIELD_X_HALF + margin || ipx > SIM_FIELD_X_HALF - margin
      || ipz < -SIM_FIELD_Z_HALF + margin || ipz > SIM_FIELD_Z_HALF - margin) {
      // フィールド外 → 元のインターセプトポイントにフォールバック
      ipx = sol.interceptX;
      ipz = sol.interceptZ;
      ft = 0;
    }
  } else {
    // 再計算失敗 → 元のインターセプトポイントにフォールバック
    ipx = sol.interceptX;
    ipz = sol.interceptZ;
    ft = 0;
  }

  const success = fireBallArc(state, ball, passerMover.x, passerMover.z, ipx, ipz, passerMover.y);
  if (!success) {
    state.actionStates[state.offenseBase + state.onBallEntityIdx] = createIdleAction();
    state.cooldown = 0.3;
    return;
  }

  state.interceptPt = { x: ipx, z: ipz };
  state.selectedReceiverEntityIdx = sol.targetIdx;
  state.preFire = null;

  // レシーバー速度: 新しいインターセプトポイントへの方向で再計算
  const tdx = ipx - receiverMover.x;
  const tdz = ipz - receiverMover.z;
  const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
  if (tdist > TARGET_STOP_DIST) {
    receiverMover.vx = (tdx / tdist) * TARGET_INTERCEPT_SPEED;
    receiverMover.vz = (tdz / tdist) * TARGET_INTERCEPT_SPEED;
  } else {
    receiverMover.vx = 0;
    receiverMover.vz = 0;
  }
  state.actionStates[state.offenseBase + sol.targetIdx] = { type: 'move', phase: 'active', elapsed: 0, timing: MOVE_TIMING };
  state.moveDistAccum[sol.targetIdx] = 0;

  // レシーバー到達可能性チェック: 到達不能ならフォールバックで直接レシーバー位置に発射
  if (ft > 0) {
    const tReach = TARGET_INTERCEPT_SPEED * ft;
    if (!canTargetReach(receiverMover, ipx, ipz, tReach)) {
      // 到達不能 → レシーバーの現在位置を目標に直接パス
      // ボールは既に発射済みなのでインターセプトポイントだけ補正
      state.interceptPt = { x: receiverMover.x, z: receiverMover.z };
      receiverMover.vx = 0;
      receiverMover.vz = 0;
    }
  }

  // 障害物リアクション
  const onBallDefOi = OB_CONFIGS.findIndex(c => c.markTargetEntityIdx === state.onBallEntityIdx);
  const bPos = ball.getPosition();
  const bVel = ball.getVelocity();
  // 再計算した軌道に対するFOV判定
  const obInFOVs = reSol?.valid ? sol.obInFOVs : sol.obInFOVs;
  const reactions = computeObstacleReactions(
    state.obstacles, OB_INT_SPEEDS, obInFOVs,
    bPos.x, bPos.z, bVel.x, bVel.z, SOLVER_CFG_3D,
  );
  const reactingObs = Array.from({ length: OBSTACLE_COUNT }, () => false);
  for (const r of reactions) {
    if (r.obstacleIdx === onBallDefOi) continue;
    reactingObs[r.obstacleIdx] = r.reacting;
    if (r.reacting) {
      state.obstacles[r.obstacleIdx].vx = r.vx;
      state.obstacles[r.obstacleIdx].vz = r.vz;
      state.actionStates[state.defenseBase + r.obstacleIdx] = startAction('obstacle_react', OBSTACLE_REACT_TIMING);
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
  state.onBallTargetState = { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 };
  state.slasherState = { dest: null, reevalTimer: 0, vcutPhase: state.slasherState.vcutPhase, vcutActive: false };
  state.screenerState = { dest: null, reevalTimer: 0, screenSet: false, holdTimer: 0 };
  state.dunkerState = { dest: null, reevalTimer: 0, sealing: false };
}

/** トランジットモードを有効にしてホームポジションへ自然に走らせる。
 *  位置を直接上書きしない — moveTransitToHome() が毎フレーム移動を処理する。 */
export function resetOffenseToBackcourt(state: SimState): void {
  const allOffense = [state.launcher, ...state.targets];
  for (let i = 0; i < allOffense.length; i++) {
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
