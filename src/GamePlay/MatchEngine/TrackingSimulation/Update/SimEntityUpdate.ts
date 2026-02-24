/**
 * SimEntityUpdate - ターゲット/障害物の移動とスキャン更新（重複除去の核心）
 * ball-active / ball-not-active で重複していたロジックを統一する。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState, SimMover, SimBall } from "../Types/TrackingSimTypes";
import {
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
} from "../Movement/MovementCore";
import {
  moveSecondHandler,
  moveSlasher,
  moveScreener,
  moveDunker,
  moveSpacer,
} from "../Movement/RoleMovement";
import { updateScan } from "../Decision/ScanSystem";
import { canEntityMove, applyMoveAction } from "./SimActionManager";
import {
  OB_A_IDLE_SPEED,
  OB_A_INTERCEPT_SPEED,
  OB_C_IDLE_SPEED,
  OB_C_INTERCEPT_SPEED,
  OB_D_IDLE_SPEED,
  OB_D_INTERCEPT_SPEED,
  OB_E_IDLE_SPEED,
  OB_E_INTERCEPT_SPEED,
  OB_A_HOVER_RADIUS,
  OB_C_HOVER_RADIUS,
  OB_D_HOVER_RADIUS,
  OB_E_HOVER_RADIUS,
} from "../Config/EntityConfig";

/** 障害物idle時のチェイスターゲット: [A→midpoint, B→skip, C→target0, D→target3, E→target4] */
const OB_CHASE_TARGETS = [null, null, 0, 3, 4] as const;
const OB_IDLE_SPEEDS = [OB_A_IDLE_SPEED, 0, OB_C_IDLE_SPEED, OB_D_IDLE_SPEED, OB_E_IDLE_SPEED];
const OB_INT_SPEEDS_LOCAL = [OB_A_INTERCEPT_SPEED, 0, OB_C_INTERCEPT_SPEED, OB_D_INTERCEPT_SPEED, OB_E_INTERCEPT_SPEED];
const OB_HOVER_RADII = [OB_A_HOVER_RADIUS, 0, OB_C_HOVER_RADIUS, OB_D_HOVER_RADIUS, OB_E_HOVER_RADIUS];

/**
 * ターゲットのロール別移動を実行（重複除去）
 * @param skipIdx ball-active時に選択ターゲットをスキップする場合のインデックス（-1で全て実行）
 */
export function updateTargetRoleMovements(state: SimState, dt: number, skipIdx: number): void {
  const { launcher, targets, obstacles } = state;
  const getOtherTargets = (ti: number): SimMover[] =>
    targets.filter((_, i) => i !== ti);

  for (let ti = 0; ti < targets.length; ti++) {
    if (ti === skipIdx) continue;
    const entityIdx = 1 + ti;
    if (!canEntityMove(state.actionStates, entityIdx)) {
      applyMoveAction(state, entityIdx, targets[ti], dt);
      continue;
    }

    const others = getOtherTargets(ti);
    switch (ti) {
      case 0: {
        const res = moveSecondHandler(
          targets[0], state.targetDests[0], state.targetReevalTimers[0],
          dt, launcher, obstacles, others,
        );
        state.targetDests[0] = res.dest;
        state.targetReevalTimers[0] = res.reevalTimer;
        break;
      }
      case 1:
        moveSlasher(targets[1], state.slasherState, dt, launcher, obstacles, others);
        break;
      case 2:
        moveScreener(targets[2], state.screenerState, dt, launcher, obstacles, others);
        break;
      case 3:
        moveDunker(targets[3], state.dunkerState, dt, launcher, obstacles, others);
        break;
      case 4: {
        const res = moveSpacer(
          targets[4], state.targetDests[4], state.targetReevalTimers[4],
          dt, launcher, obstacles, others,
        );
        state.targetDests[4] = res.dest;
        state.targetReevalTimers[4] = res.reevalTimer;
        break;
      }
    }
    applyMoveAction(state, entityIdx, targets[ti], dt);
  }
}

/**
 * 障害物 A/C/D/E の移動を統一（OB_B は別処理のためスキップ）
 * obReacting[i] が true ならインターセプト移動、false ならアイドル移動。
 */
export function updateObstacleMovements(state: SimState, dt: number): void {
  const { launcher, targets, obstacles } = state;
  // 選択ターゲット（OB_A の midpoint 計算用）
  const selTarget = targets[state.selectedTargetIdx];

  for (const oi of [0, 2, 3, 4]) {
    if (state.obReacting[oi]) {
      moveWithFacing(obstacles[oi], OB_INT_SPEEDS_LOCAL[oi], dt);
    } else if (!state.obMems[oi].searching) {
      let chaseX: number;
      let chaseZ: number;
      if (oi === 0) {
        // OB_A: midpoint of launcher and selected target
        chaseX = (launcher.x + selTarget.x) / 2;
        chaseZ = (launcher.z + selTarget.z) / 2;
      } else {
        const tgtIdx = OB_CHASE_TARGETS[oi]!;
        chaseX = targets[tgtIdx].x;
        chaseZ = targets[tgtIdx].z;
      }
      setChaserVelocity(obstacles[oi], chaseX, chaseZ, OB_IDLE_SPEEDS[oi], OB_HOVER_RADII[oi], dt);
      moveKeepFacing(obstacles[oi], OB_IDLE_SPEEDS[oi], dt);
    }
  }
}

/**
 * 5障害物のスキャン状態を更新
 */
export function updateScans(state: SimState, ballActive: boolean, ballPosition: Vector3, dt: number): void {
  const { launcher, targets, obstacles } = state;
  const scanBallPos = ballActive ? ballPosition : Vector3.Zero();
  const simBall: SimBall = {
    active: ballActive,
    x: scanBallPos.x, z: scanBallPos.z,
    vx: 0, vz: 0, age: state.ballAge,
  };
  const watchTargets = [targets[0], targets[0], targets[0], targets[3], targets[4]];

  for (let oi = 0; oi < 5; oi++) {
    const result = updateScan(
      obstacles[oi], state.obScanAtLauncher[oi], state.obScanTimers[oi],
      state.obFocusDists[oi], state.obReacting[oi], state.obMems[oi],
      watchTargets[oi], launcher, simBall, dt,
    );
    state.obScanAtLauncher[oi] = result.atLauncher;
    state.obScanTimers[oi] = result.timer;
    state.obFocusDists[oi] = result.focusDist;
  }
}
