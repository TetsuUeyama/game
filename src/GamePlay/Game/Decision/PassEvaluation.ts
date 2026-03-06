/**
 * PassEvaluation - パス判断・評価ロジック
 * evaluatePreFire (パス先スコアリング), attemptFire (発射解計算),
 * computeObstacleReactions (DF反応速度計算)
 */

import type { SolverConfig } from "@/SimulationPlay/TargetTrackingAccuracySystem";
import type {
  SimMover,
  SimPreFireInfo,
  BallFireContext,
  PreFireEvalResult,
  ObstacleReaction,
  FireAttemptResult,
} from "../Types/TrackingSimTypes";

import { dist2d, randFire } from "../Movement/MovementCore";
import {
  isTrajectoryInFOV,
  canReachTrajectory,
  isPhysicallyClose,
  canTargetReach,
} from "../Decision/TrajectoryAnalysis";
import { canObIntercept, solveLaunch } from "../Decision/LaunchSolver";
import { OB_CONFIGS } from "./ObstacleRoleAssignment";

import { BALL_SPEED, TARGET_INTERCEPT_SPEED } from "../Config/EntityConfig";
import {
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  TARGET_STOP_DIST,
} from "../Config/FieldConfig";

// --- Pass arc trajectory constants ---
// These must match fireBallArc / DeterministicTrajectory parameters
const PASS_GRAVITY = 9.81;
const PASS_DAMPING = 0.05;
const PASS_MIN_ARC = 0.3;
const PASS_ARC_RATIO = 0.10;  // arcHeight = distance * PASS_ARC_RATIO

/**
 * Compute the effective horizontal ball speed for the arc trajectory.
 * fireBallArc uses DeterministicTrajectory with arcHeight = max(0.3, D*0.10).
 * Flight time: T = sqrt(8*arcHeight/g). Ball must cover distance D in time T.
 * This function returns the horizontal speed the ball actually flies at.
 */
export function computeArcBallSpeed(distance: number): number {
  const arcHeight = Math.max(PASS_MIN_ARC, distance * PASS_ARC_RATIO);
  const T = Math.sqrt((8 * arcHeight) / PASS_GRAVITY);
  if (T < 0.001) return BALL_SPEED; // fallback
  const factor = (1 - Math.exp(-PASS_DAMPING * T)) / PASS_DAMPING;
  return distance / factor;
}

// =========================================================================
// evaluatePreFire
// =========================================================================

/** Score all targets and pick the best one for a pass */
export function evaluatePreFire(
  ctx: BallFireContext,
  receiverRoles: string[],
): PreFireEvalResult {
  const { launcher, targets, obstacles, obIntSpeeds } = ctx;

  let bestIdx = 0;
  let bestScore = -Infinity;
  let bestPF: SimPreFireInfo | null = null;

  for (let ti = 0; ti < targets.length; ti++) {
    const tgt = targets[ti];
    const estDist = dist2d(launcher.x, launcher.z, tgt.x, tgt.z);
    const estArcHeight = Math.max(PASS_MIN_ARC, estDist * PASS_ARC_RATIO);
    const estFT = Math.max(0.3, Math.sqrt((8 * estArcHeight) / PASS_GRAVITY));
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
      MAIN_HANDLER: 1.5, DUNKER: 3.0, SECOND_HANDLER: 2.0, SLASHER: 1.5, SCREENER: 0.5,
    };
    const roleBonus = rolePriority[receiverRoles[ti]] ?? 0;
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
    // Use arc-trajectory-based ball speed so solver's flight time matches actual trajectory
    const passDist = dist2d(launcher.x, launcher.z, tgt.x, tgt.z);
    const effBallSpeed = computeArcBallSpeed(passDist);
    const sol = solveLaunch(
      launcher.x, launcher.z,
      tgt.x, tgt.z, tgt.vx, tgt.vz,
      effBallSpeed, solverCfg,
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
    if (tdist < TARGET_STOP_DIST) {
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
    if (!OB_CONFIGS[oi].reactive) {
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
