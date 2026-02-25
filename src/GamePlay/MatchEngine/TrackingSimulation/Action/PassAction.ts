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
  HAND_CATCH_RADIUS,
  HAND_BLOCK_RADIUS,
  BALL_TIMEOUT,
} from "../Config/FieldConfig";
import type { ROLE_ASSIGNMENTS } from "../Config/RoleConfig";

import { Vector3 } from "@babylonjs/core";

// =========================================================================
// Pass action timing
// =========================================================================

/** パスアクションのタイミング定義 */
export const PASS_TIMING: ActionTiming = {
  startup: 0.15,   // パスモーション予備動作（腕を引く等）
  active: 0.2,     // パスモーション実行時間（投げ動作）
  recovery: 0.4,   // パス後の硬直（フォロースルー）
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

/** 3D distance between ball and hand position */
function dist3d(bx: number, by: number, bz: number, h: Vector3): number {
  const dx = bx - h.x;
  const dy = by - h.y;
  const dz = bz - h.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Check block → hit → miss in priority order (hand-based 3D collision) */
export function detectBallResult(
  ballPosX: number,
  ballPosY: number,
  ballPosZ: number,
  ballInFlight: boolean,
  ballAge: number,
  targets: SimMover[],
  obstacles: SimMover[],
  targetHandPositions: { left: Vector3; right: Vector3 }[],
  obstacleHandPositions: { left: Vector3; right: Vector3 }[],
): BallResultDetection {
  const none: BallResultDetection = { result: 'none' as BallResultType, cooldownTime: 0 };

  // Block check: each obstacle's left/right hand
  for (let oi = 0; oi < obstacles.length; oi++) {
    const hands = obstacleHandPositions[oi];
    if (!hands) continue;
    if (dist3d(ballPosX, ballPosY, ballPosZ, hands.left) < HAND_BLOCK_RADIUS
      || dist3d(ballPosX, ballPosY, ballPosZ, hands.right) < HAND_BLOCK_RADIUS) {
      return { result: 'block', cooldownTime: 1.0 };
    }
  }

  // Hit check: each target's left/right hand
  for (let ti = 0; ti < targets.length; ti++) {
    const hands = targetHandPositions[ti];
    if (!hands) continue;
    if (dist3d(ballPosX, ballPosY, ballPosZ, hands.left) < HAND_CATCH_RADIUS
      || dist3d(ballPosX, ballPosY, ballPosZ, hands.right) < HAND_CATCH_RADIUS) {
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

