/**
 * PassAction - Pure functions for pass evaluation, execution, and result detection.
 * No Babylon.js side effects; the orchestrator (TrackingSimulation3D) handles fireBallArc/deactivateBall.
 */

import type { SolverConfig } from "@/SimulationPlay/TargetTrackingAccuracySystem";
import type {
  SimMover,
  SimPreFireInfo,
  BallFireContext,
  PreFireEvalResult,
  ObstacleReaction,
  FireAttemptResult,
  BallResultType,
  BallResultDetection,
  ActionTiming,
  ActionState,
} from "../Types/TrackingSimTypes";

import { dist2d, randFire } from "../Movement/MovementCore";
import {
  isTrajectoryInFOV,
  canReachTrajectory,
  isPhysicallyClose,
  canTargetReach,
} from "../Decision/TrajectoryAnalysis";
import { canObIntercept, solveLaunch } from "../Decision/LaunchSolver";

import { BALL_SPEED, TARGET_INTERCEPT_SPEED } from "../Config/EntityConfig";
import {
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  HIT_RADIUS,
  BLOCK_RADIUS,
  BALL_TIMEOUT,
  ENTITY_HEIGHT,
} from "../Config/FieldConfig";
import type { ROLE_ASSIGNMENTS } from "../Config/RoleConfig";

const BALL_COLLISION_Y_MAX = ENTITY_HEIGHT + 0.5;

// =========================================================================
// Pass action timing
// =========================================================================

/** パスアクションのタイミング定義 */
export const PASS_TIMING: ActionTiming = {
  startup: 0.15,   // パスモーション予備動作（腕を引く等）
  active: 0.0,     // ボール飛行時間は動的（solveLaunchで決定）のため0
  recovery: 0.4,   // パス後の硬直（フォロースルー）
};

/** 障害物リアクションのタイミング定義 */
export const OBSTACLE_REACT_TIMING: ActionTiming = {
  startup: 0.0,    // 即座にリアクション
  active: 10.0,    // イベント駆動（ボール結果まで）
  recovery: 0.3,   // リアクション後の硬直
};

/** ターゲット受け取りのタイミング定義 */
export const TARGET_RECEIVE_TIMING: ActionTiming = {
  startup: 0.0,    // 即座にキャッチ体勢
  active: 10.0,    // イベント駆動（ボール結果まで）
  recovery: 0.3,   // キャッチ後の硬直
};

// =========================================================================
// evaluatePreFire
// =========================================================================

/** Score all targets and pick the best one for a pass */
export function evaluatePreFire(
  ctx: BallFireContext,
  roleAssignments: typeof ROLE_ASSIGNMENTS,
): PreFireEvalResult {
  const { launcher, targets, obstacles, obIntSpeeds } = ctx;

  let bestIdx = 0;
  let bestScore = -Infinity;
  let bestPF: SimPreFireInfo | null = null;

  for (let ti = 0; ti < targets.length; ti++) {
    const tgt = targets[ti];
    const estDist = dist2d(launcher.x, launcher.z, tgt.x, tgt.z);
    const estFT = Math.max(0.3, estDist / BALL_SPEED);
    const estIPx = tgt.x + tgt.vx * estFT;
    const estIPz = tgt.z + tgt.vz * estFT;

    const obReaches = obstacles.map((_, oi) => obIntSpeeds[oi] * estFT);
    const targetReach = TARGET_INTERCEPT_SPEED * estFT;
    const tgtCanReach = canTargetReach(tgt, estIPx, estIPz, targetReach);

    const obInFOVs = obstacles.map(ob => isTrajectoryInFOV(ob, launcher.x, launcher.z, estIPx, estIPz));
    const obBlocks = obstacles.map((ob, oi) =>
      (obInFOVs[oi] && canReachTrajectory(ob, launcher.x, launcher.z, estIPx, estIPz, obReaches[oi]))
      || isPhysicallyClose(ob, launcher.x, launcher.z, estIPx, estIPz));

    const blocked = obBlocks.some(b => b) || !tgtCanReach;
    const blockerCount = obBlocks.filter(b => b).length;
    const rolePriority: Record<string, number> = {
      DUNKER: 3.0, SECOND_HANDLER: 2.0, SLASHER: 1.5, SPACER: 1.0, SCREENER: 0.5,
    };
    const roleBonus = rolePriority[roleAssignments.targets[ti].role] ?? 0;
    const score = -blockerCount * 10 + (tgtCanReach ? 5 : 0) - estDist * 0.01 + roleBonus;

    const pf: SimPreFireInfo = {
      targetIdx: ti, estFlightTime: estFT, estIPx, estIPz,
      obReaches, obInFOVs, obBlocks,
      targetReach, targetCanReach: tgtCanReach, blocked,
    };

    if (score > bestScore) {
      bestScore = score;
      bestIdx = ti;
      bestPF = pf;
    }
  }

  return { selectedTargetIdx: bestIdx, preFire: bestPF };
}

// =========================================================================
// attemptFire
// =========================================================================

/** Try each target in priority order and return the first viable launch solution */
export function attemptFire(
  ctx: BallFireContext,
  bestTargetIdx: number,
  solverCfg: SolverConfig,
): FireAttemptResult {
  const { launcher, targets, obstacles, obIntSpeeds } = ctx;

  const order = targets.map((_, i) => i).sort((a, b) => {
    if (a === bestTargetIdx) return -1;
    if (b === bestTargetIdx) return 1;
    return 0;
  });

  const fieldXMin = -SIM_FIELD_X_HALF + SIM_MARGIN;
  const fieldXMax = SIM_FIELD_X_HALF - SIM_MARGIN;
  const fieldZMin = -SIM_FIELD_Z_HALF + SIM_MARGIN;
  const fieldZMax = SIM_FIELD_Z_HALF - SIM_MARGIN;

  for (const ti of order) {
    const tgt = targets[ti];
    const sol = solveLaunch(
      launcher.x, launcher.z,
      tgt.x, tgt.z, tgt.vx, tgt.vz,
      BALL_SPEED, solverCfg,
    );

    const ipInField = sol?.valid
      && sol.interceptPos.x >= fieldXMin && sol.interceptPos.x <= fieldXMax
      && sol.interceptPos.z >= fieldZMin && sol.interceptPos.z <= fieldZMax;

    if (!sol?.valid || !ipInField) continue;

    const bvx = sol.launchVelocity.x;
    const bvz = sol.launchVelocity.z;
    const ft = sol.flightTime;
    const ipx = sol.interceptPos.x;
    const ipz = sol.interceptPos.z;

    const tReach = TARGET_INTERCEPT_SPEED * ft;
    const tCanReach = canTargetReach(tgt, ipx, ipz, tReach);

    const obFOVs = obstacles.map(ob => isTrajectoryInFOV(ob, launcher.x, launcher.z, ipx, ipz));
    let anyBlock = false;
    for (let oi = 0; oi < obstacles.length; oi++) {
      const canBlock = (obFOVs[oi] && canObIntercept(obstacles[oi], launcher.x, launcher.z, bvx, bvz, obIntSpeeds[oi], ft))
        || isPhysicallyClose(obstacles[oi], launcher.x, launcher.z, ipx, ipz);
      if (canBlock) { anyBlock = true; break; }
    }

    if (anyBlock || !tCanReach) continue;

    // Compute target velocity toward intercept point
    const tdx = ipx - tgt.x;
    const tdz = ipz - tgt.z;
    const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
    let tvx: number, tvz: number;
    if (tdist < 5 * 0.015) {
      tvx = 0; tvz = 0;
    } else {
      tvx = (tdx / tdist) * TARGET_INTERCEPT_SPEED;
      tvz = (tdz / tdist) * TARGET_INTERCEPT_SPEED;
    }

    return {
      fired: true,
      solution: {
        targetIdx: ti,
        interceptX: ipx,
        interceptZ: ipz,
        flightTime: ft,
        targetVelocity: { vx: tvx, vz: tvz },
        obInFOVs: obFOVs,
      },
      newCooldown: randFire(),
    };
  }

  return { fired: false, solution: null, newCooldown: 0.3 };
}

// =========================================================================
// computeObstacleReactions
// =========================================================================

/** Compute intercept velocity for each obstacle reacting to the ball */
export function computeObstacleReactions(
  obstacles: SimMover[],
  obIntSpeeds: number[],
  obInFOVs: boolean[],
  ballPosX: number,
  ballPosZ: number,
  ballVelX: number,
  ballVelZ: number,
  solverCfg: SolverConfig,
): ObstacleReaction[] {
  const reactions: ObstacleReaction[] = [];

  for (let oi = 0; oi < obstacles.length; oi++) {
    if (oi === 1) {
      // obB is not reactive
      reactions.push({ obstacleIdx: oi, reacting: false, vx: 0, vz: 0 });
      continue;
    }
    if (!obInFOVs[oi]) {
      reactions.push({ obstacleIdx: oi, reacting: false, vx: 0, vz: 0 });
      continue;
    }

    const ob = obstacles[oi];
    const obSol = solveLaunch(
      ob.x, ob.z,
      ballPosX, ballPosZ, ballVelX, ballVelZ,
      obIntSpeeds[oi], solverCfg,
    );

    let vx: number, vz: number;
    if (obSol?.valid) {
      vx = obSol.launchVelocity.x;
      vz = obSol.launchVelocity.z;
    } else {
      const dx = ballPosX - ob.x;
      const dz = ballPosZ - ob.z;
      const dd = Math.sqrt(dx * dx + dz * dz) || 1;
      vx = (dx / dd) * obIntSpeeds[oi];
      vz = (dz / dd) * obIntSpeeds[oi];
    }

    reactions.push({ obstacleIdx: oi, reacting: true, vx, vz });
  }

  return reactions;
}

// =========================================================================
// detectBallResult
// =========================================================================

/** Check block → hit → miss in priority order */
export function detectBallResult(
  ballPosX: number,
  ballPosY: number,
  ballPosZ: number,
  ballInFlight: boolean,
  ballAge: number,
  targets: SimMover[],
  obstacles: SimMover[],
): BallResultDetection {
  const none: BallResultDetection = { result: 'none' as BallResultType, cooldownTime: 0 };

  // Block check
  for (const ob of obstacles) {
    if (dist2d(ballPosX, ballPosZ, ob.x, ob.z) < BLOCK_RADIUS && ballPosY < BALL_COLLISION_Y_MAX) {
      return { result: 'block', cooldownTime: 1.0 };
    }
  }

  // Hit check
  for (const tgt of targets) {
    if (dist2d(ballPosX, ballPosZ, tgt.x, tgt.z) < HIT_RADIUS && ballPosY < BALL_COLLISION_Y_MAX) {
      return { result: 'hit', cooldownTime: 1.5 };
    }
  }

  // Miss check: landed, out of bounds, or timeout
  const ballLanded = !ballInFlight;
  const margin = SIM_MARGIN * 2;
  const out = ballPosX < -SIM_FIELD_X_HALF - margin || ballPosX > SIM_FIELD_X_HALF + margin
    || ballPosZ < -SIM_FIELD_Z_HALF - margin || ballPosZ > SIM_FIELD_Z_HALF + margin;
  if (ballLanded || out || ballAge > BALL_TIMEOUT) {
    return { result: 'miss', cooldownTime: 1.0 };
  }

  return none;
}

// =========================================================================
// Action state utilities
// =========================================================================

/** アクションなし（アイドル状態） */
export function createIdleAction(): ActionState {
  return { phase: 'idle', elapsed: 0, timing: null };
}

/** 新しいアクションを開始 */
export function startAction(timing: ActionTiming): ActionState {
  if (timing.startup > 0) return { phase: 'startup', elapsed: 0, timing };
  if (timing.active > 0) return { phase: 'active', elapsed: 0, timing };
  if (timing.recovery > 0) return { phase: 'recovery', elapsed: 0, timing };
  return createIdleAction();
}

/**
 * アクション状態を dt 分進める
 * - startup → active: 自動遷移（タイマー）
 * - active → recovery: 手動遷移（forceRecovery で明示的に）
 * - recovery → idle: 自動遷移（タイマー）
 */
export function tickActionState(state: ActionState, dt: number): ActionState {
  if (state.phase === 'idle' || !state.timing) return state;

  const t = state.timing;
  let phase = state.phase;
  let elapsed = state.elapsed + dt;

  // startup → active（自動遷移）
  if (phase === 'startup' && elapsed >= t.startup) {
    elapsed -= t.startup;
    phase = 'active';
  }
  // recovery → idle（自動遷移）
  if (phase === 'recovery' && elapsed >= t.recovery) {
    return createIdleAction();
  }

  return { phase, elapsed, timing: t };
}

/** 強制的にリカバリーフェーズへ遷移 */
export function forceRecovery(state: ActionState, recoveryDuration?: number): ActionState {
  if (!state.timing) return createIdleAction();
  const timing = recoveryDuration !== undefined
    ? { ...state.timing, recovery: recoveryDuration }
    : state.timing;
  return { phase: 'recovery', elapsed: 0, timing };
}
