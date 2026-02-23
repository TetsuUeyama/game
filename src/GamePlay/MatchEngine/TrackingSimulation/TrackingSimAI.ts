/**
 * TrackingSimAI - Pure logic for tracking simulation (no Babylon.js dependency)
 * Ported from 2D page.tsx: y -> z coordinate mapping
 */

import {
  MinTimeLaunch,
  type SolverConfig,
} from "@/SimulationPlay/TargetTrackingAccuracySystem";

import {
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  PHYSICAL_MARGIN,
  TURN_RATE,
  OB_FOV_HALF_NEAR,
  OB_FOV_HALF_FAR,
  FOV_NARROW_DIST,
  SEARCH_SWEEP_SPEED,
  SEARCH_SWEEP_MAX,
  FOV_FOCUS_SPEED,
  TURN_MIN,
  TURN_MAX,
  FIRE_MIN,
  FIRE_MAX,
  TARGET_RANDOM_SPEED,
  SOLVER_CFG_3D,
} from "./TrackingSimConstants";

// ============================================================================
// Types
// ============================================================================

export interface SimMover {
  x: number; z: number;
  vx: number; vz: number;
  speed: number;
  facing: number;
  nextTurn: number;
}

export interface SimBall {
  active: boolean;
  x: number; z: number;
  vx: number; vz: number;
  age: number;
}

export interface SimScanMemory {
  lastSeenLauncherX: number;
  lastSeenLauncherZ: number;
  lastSeenTargetX: number;
  lastSeenTargetZ: number;
  searching: boolean;
  searchSweep: number;
  searchDir: 1 | -1;
}

export interface SimPreFireInfo {
  targetIdx: number;
  estFlightTime: number;
  estIPx: number;
  estIPz: number;
  obReaches: number[];
  obInFOVs: boolean[];
  obBlocks: boolean[];
  targetReach: number;
  targetCanReach: boolean;
  blocked: boolean;
}

export interface TrackingSimScore {
  hit: number;
  block: number;
  miss: number;
}

// ============================================================================
// Utility functions
// ============================================================================

export function randAngle(): number {
  return Math.random() * Math.PI * 2;
}

export function randTurn(): number {
  return TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN);
}

export function randFire(): number {
  return FIRE_MIN + Math.random() * (FIRE_MAX - FIRE_MIN);
}

/** Normalize angle difference to [-PI, PI] */
export function normAngleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** FOV half-angle at distance (wider near, narrower far) */
export function fovHalfAtDist(dist: number): number {
  const t = Math.min(dist / FOV_NARROW_DIST, 1);
  return OB_FOV_HALF_NEAR + (OB_FOV_HALF_FAR - OB_FOV_HALF_NEAR) * t;
}

/**
 * Speed multiplier based on facing vs move direction
 * front(0)=1.0, side(90)=0.7, back(180)=0.5
 */
export function dirSpeedMult(facing: number, moveAngle: number): number {
  const cosA = Math.cos(normAngleDiff(facing, moveAngle));
  return cosA >= 0 ? 0.7 + 0.3 * cosA : 0.7 + 0.2 * cosA;
}

/** Turn facing toward target angle by at most maxDelta */
export function turnToward(current: number, target: number, maxDelta: number): number {
  const diff = normAngleDiff(current, target);
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

export function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx; const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// ============================================================================
// Mover creation / helpers
// ============================================================================

export function makeMover(x: number, z: number, speed: number): SimMover {
  const a = randAngle();
  return {
    x, z,
    vx: Math.cos(a) * speed, vz: Math.sin(a) * speed,
    speed, facing: a, nextTurn: randTurn(),
  };
}

export function makeScanMemory(lx: number, lz: number, tx: number, tz: number): SimScanMemory {
  return {
    lastSeenLauncherX: lx, lastSeenLauncherZ: lz,
    lastSeenTargetX: tx, lastSeenTargetZ: tz,
    searching: false, searchSweep: 0, searchDir: 1,
  };
}

/** Bounce off field boundaries */
export function bounce(m: { x: number; z: number; vx: number; vz: number }): void {
  const xMin = -SIM_FIELD_X_HALF + SIM_MARGIN;
  const xMax = SIM_FIELD_X_HALF - SIM_MARGIN;
  const zMin = -SIM_FIELD_Z_HALF + SIM_MARGIN;
  const zMax = SIM_FIELD_Z_HALF - SIM_MARGIN;
  if (m.x < xMin) { m.x = xMin; m.vx = Math.abs(m.vx); }
  if (m.x > xMax) { m.x = xMax; m.vx = -Math.abs(m.vx); }
  if (m.z < zMin) { m.z = zMin; m.vz = Math.abs(m.vz); }
  if (m.z > zMax) { m.z = zMax; m.vz = -Math.abs(m.vz); }
}

/** Move with facing (facing rotates toward movement direction) */
export function moveWithFacing(m: SimMover, baseSpeed: number, dt: number): void {
  const len = Math.sqrt(m.vx * m.vx + m.vz * m.vz);
  if (len < 0.01) return;
  const moveAngle = Math.atan2(m.vz, m.vx);
  m.facing = turnToward(m.facing, moveAngle, TURN_RATE * dt);
  const mult = dirSpeedMult(m.facing, moveAngle);
  const effSpeed = baseSpeed * mult;
  m.x += (m.vx / len) * effSpeed * dt;
  m.z += (m.vz / len) * effSpeed * dt;
  bounce(m);
}

/** Move without changing facing (facing controlled externally) */
export function moveKeepFacing(m: SimMover, baseSpeed: number, dt: number): void {
  const len = Math.sqrt(m.vx * m.vx + m.vz * m.vz);
  if (len < 0.01) return;
  const moveAngle = Math.atan2(m.vz, m.vx);
  const mult = dirSpeedMult(m.facing, moveAngle);
  const effSpeed = baseSpeed * mult;
  m.x += (m.vx / len) * effSpeed * dt;
  m.z += (m.vz / len) * effSpeed * dt;
  bounce(m);
}

/** Set chaser velocity (chase or hover) */
export function setChaserVelocity(
  m: SimMover, tx: number, tz: number, chaseSpeed: number, hoverR: number, dt: number,
): void {
  const dx = tx - m.x;
  const dz = tz - m.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > hoverR) {
    m.vx = (dx / d) * chaseSpeed;
    m.vz = (dz / d) * chaseSpeed;
  } else {
    m.nextTurn -= dt;
    if (m.nextTurn <= 0) {
      const a = randAngle();
      m.vx = Math.cos(a) * chaseSpeed * 0.4;
      m.vz = Math.sin(a) * chaseSpeed * 0.4;
      m.nextTurn = 0.5 + Math.random() * 1.0;
    }
  }
}

export function stepMover(m: SimMover, dt: number): void {
  m.nextTurn -= dt;
  if (m.nextTurn <= 0) {
    const a = randAngle();
    m.vx = Math.cos(a) * m.speed;
    m.vz = Math.sin(a) * m.speed;
    m.nextTurn = randTurn();
  }
  moveWithFacing(m, m.speed, dt);
}

export function restoreRandom(m: SimMover, speed: number): void {
  const a = randAngle();
  m.vx = Math.cos(a) * speed;
  m.vz = Math.sin(a) * speed;
  m.speed = speed;
  m.nextTurn = randTurn();
}

// ============================================================================
// Segment / FOV / reach helpers
// ============================================================================

function v3(bx: number, bz: number) { return { x: bx, y: 0, z: bz }; }

/** Closest point on segment */
export function segClosestPoint(
  x1: number, z1: number, x2: number, z2: number, px: number, pz: number,
): { cx: number; cz: number } {
  const dx = x2 - x1; const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return { cx: x1, cz: z1 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
  return { cx: x1 + t * dx, cz: z1 + t * dz };
}

/** Is obstacle physically close to trajectory? */
export function isPhysicallyClose(
  ob: SimMover, x1: number, z1: number, x2: number, z2: number,
): boolean {
  const { cx, cz } = segClosestPoint(x1, z1, x2, z2, ob.x, ob.z);
  return dist2d(cx, cz, ob.x, ob.z) < PHYSICAL_MARGIN;
}

/** Is a point within obstacle FOV? */
export function isPointInFOV(m: SimMover, px: number, pz: number): boolean {
  const d = dist2d(m.x, m.z, px, pz);
  const fovHalf = fovHalfAtDist(d);
  const angle = Math.atan2(pz - m.z, px - m.x);
  return Math.abs(normAngleDiff(m.facing, angle)) <= fovHalf;
}

/** Search FOV (no distance narrowing) */
export function isPointInSearchFOV(m: SimMover, px: number, pz: number): boolean {
  const angle = Math.atan2(pz - m.z, px - m.x);
  return Math.abs(normAngleDiff(m.facing, angle)) <= OB_FOV_HALF_NEAR;
}

/** Is trajectory within obstacle FOV? */
export function isTrajectoryInFOV(
  m: SimMover, x1: number, z1: number, x2: number, z2: number,
): boolean {
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const pz = z1 + (z2 - z1) * t;
    const d = dist2d(m.x, m.z, px, pz);
    const fovHalf = fovHalfAtDist(d);
    const angle = Math.atan2(pz - m.z, px - m.x);
    if (Math.abs(normAngleDiff(m.facing, angle)) <= fovHalf) return true;
  }
  return false;
}

/** Can obstacle reach trajectory considering facing? */
export function canReachTrajectory(
  m: SimMover, x1: number, z1: number, x2: number, z2: number, baseReach: number,
): boolean {
  const { cx, cz } = segClosestPoint(x1, z1, x2, z2, m.x, m.z);
  const angle = Math.atan2(cz - m.z, cx - m.x);
  const reach = baseReach * dirSpeedMult(m.facing, angle);
  return dist2d(m.x, m.z, cx, cz) < reach;
}

/** Can target reach intercept point? */
export function canTargetReach(m: SimMover, ipx: number, ipz: number, baseReach: number): boolean {
  const angle = Math.atan2(ipz - m.z, ipx - m.x);
  const reach = baseReach * dirSpeedMult(m.facing, angle);
  return dist2d(m.x, m.z, ipx, ipz) <= reach;
}

/** Can obstacle intercept ball trajectory using solver? */
export function canObIntercept(
  ob: SimMover, ballStartX: number, ballStartZ: number,
  ballVx: number, ballVz: number, obMaxSpeed: number, maxTime: number,
): boolean {
  const angleToBall = Math.atan2(ballStartZ - ob.z, ballStartX - ob.x);
  const effMaxSpeed = obMaxSpeed * dirSpeedMult(ob.facing, angleToBall);
  const sol = MinTimeLaunch.solve(
    {
      launchPos: v3(ob.x, ob.z),
      target: { position: v3(ballStartX, ballStartZ), velocity: v3(ballVx, ballVz) },
      maxSpeed: effMaxSpeed,
      gravity: 0,
      damping: 0,
    },
    { ...SOLVER_CFG_3D, maxTime },
  );
  return sol !== null && sol.valid;
}

/** Find open space on field */
export function findOpenSpace(
  launcher: SimMover, obstacles: SimMover[],
): { x: number; z: number } {
  const xMin = -SIM_FIELD_X_HALF + SIM_MARGIN;
  const xMax = SIM_FIELD_X_HALF - SIM_MARGIN;
  const zMin = -SIM_FIELD_Z_HALF + SIM_MARGIN;
  const zMax = SIM_FIELD_Z_HALF - SIM_MARGIN;

  let bestX = 0;
  let bestZ = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < 30; i++) {
    const px = xMin + Math.random() * (xMax - xMin);
    const pz = zMin + Math.random() * (zMax - zMin);
    let score = 0;

    let minObDist = Infinity;
    for (const ob of obstacles) {
      const d = dist2d(px, pz, ob.x, ob.z);
      minObDist = Math.min(minObDist, d);
      score += Math.min(d, 250 * 0.015); // 3.75m cap
    }
    score += minObDist * 2;

    for (const ob of obstacles) {
      const d = dist2d(px, pz, ob.x, ob.z);
      const fovHalf = fovHalfAtDist(d);
      const angle = Math.atan2(pz - ob.z, px - ob.x);
      if (Math.abs(normAngleDiff(ob.facing, angle)) > fovHalf) {
        score += 100 * 0.015; // scaled
      }
    }

    let pathClear = true;
    for (const ob of obstacles) {
      if (isPhysicallyClose(ob, launcher.x, launcher.z, px, pz)) {
        pathClear = false;
        break;
      }
    }
    if (pathClear) score += 150 * 0.015;

    const ld = dist2d(px, pz, launcher.x, launcher.z);
    if (ld > 150 * 0.015) score += 50 * 0.015;

    if (score > bestScore) {
      bestScore = score;
      bestX = px;
      bestZ = pz;
    }
  }
  return { x: bestX, z: bestZ };
}

/** Move target toward open space */
export function moveTargetToOpenSpace(
  tgt: SimMover,
  dest: { x: number; z: number } | null,
  reevalTimer: number,
  dt: number,
  launcher: SimMover,
  allObs: SimMover[],
): { dest: { x: number; z: number }; reevalTimer: number } {
  reevalTimer -= dt;
  const atDest = dest && dist2d(tgt.x, tgt.z, dest.x, dest.z) < 20 * 0.015;
  if (reevalTimer <= 0 || !dest || atDest) {
    dest = findOpenSpace(launcher, allObs);
    reevalTimer = 1.5 + Math.random();
  }
  const dx = dest.x - tgt.x;
  const dz = dest.z - tgt.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 5 * 0.015) {
    tgt.vx = (dx / d) * TARGET_RANDOM_SPEED;
    tgt.vz = (dz / d) * TARGET_RANDOM_SPEED;
  } else {
    tgt.vx = 0;
    tgt.vz = 0;
  }
  moveWithFacing(tgt, TARGET_RANDOM_SPEED, dt);
  return { dest, reevalTimer };
}

// ============================================================================
// Scan update (ported from 2D inline closure)
// ============================================================================

export interface ScanResult {
  atLauncher: boolean;
  timer: number;
  focusDist: number;
}

export function updateScan(
  ob: SimMover,
  atLauncher: boolean,
  timer: number,
  focusDist: number,
  reacting: boolean,
  mem: SimScanMemory,
  watchTarget: SimMover,
  launcher: SimMover,
  ball: SimBall,
  dt: number,
): ScanResult {
  if (ball.active && reacting) {
    mem.searching = false;
    const bd = dist2d(ob.x, ob.z, ball.x, ball.z);
    const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(bd - focusDist));
    focusDist += Math.sign(bd - focusDist) * delta;
    return { atLauncher, timer, focusDist };
  }

  const lookEntity = atLauncher ? launcher : watchTarget;
  const lastX = atLauncher ? mem.lastSeenLauncherX : mem.lastSeenTargetX;
  const lastZ = atLauncher ? mem.lastSeenLauncherZ : mem.lastSeenTargetZ;

  const normalVisible = isPointInFOV(ob, lookEntity.x, lookEntity.z);

  if (normalVisible) {
    if (atLauncher) {
      mem.lastSeenLauncherX = lookEntity.x;
      mem.lastSeenLauncherZ = lookEntity.z;
    } else {
      mem.lastSeenTargetX = lookEntity.x;
      mem.lastSeenTargetZ = lookEntity.z;
    }
    mem.searching = false;
    mem.searchSweep = 0;

    timer -= dt;
    if (timer <= 0) {
      atLauncher = !atLauncher;
      timer = 1.5 + Math.random();
    }
    ob.facing = turnToward(ob.facing,
      Math.atan2(lookEntity.z - ob.z, lookEntity.x - ob.x), TURN_RATE * dt);
    const ld = dist2d(ob.x, ob.z, lookEntity.x, lookEntity.z);
    const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
    focusDist += Math.sign(ld - focusDist) * delta;
  } else {
    if (!mem.searching) {
      mem.searching = true;
      mem.searchSweep = 0;
      mem.searchDir = 1;
    }

    const searchVisible = isPointInSearchFOV(ob, lookEntity.x, lookEntity.z);

    if (searchVisible) {
      if (atLauncher) {
        mem.lastSeenLauncherX = lookEntity.x;
        mem.lastSeenLauncherZ = lookEntity.z;
      } else {
        mem.lastSeenTargetX = lookEntity.x;
        mem.lastSeenTargetZ = lookEntity.z;
      }
      mem.searchSweep = 0;
      ob.facing = turnToward(ob.facing,
        Math.atan2(lookEntity.z - ob.z, lookEntity.x - ob.x), TURN_RATE * dt);
      const ld = dist2d(ob.x, ob.z, lookEntity.x, lookEntity.z);
      const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
      focusDist += Math.sign(ld - focusDist) * delta;
    } else {
      const angleToLast = Math.atan2(lastZ - ob.z, lastX - ob.x);

      if (mem.searchSweep === 0 && Math.abs(normAngleDiff(ob.facing, angleToLast)) >= 0.1) {
        ob.facing = turnToward(ob.facing, angleToLast, TURN_RATE * dt);
      } else {
        mem.searchSweep += mem.searchDir * SEARCH_SWEEP_SPEED * dt;
        if (Math.abs(mem.searchSweep) > SEARCH_SWEEP_MAX) {
          mem.searchDir = (mem.searchDir * -1) as 1 | -1;
          mem.searchSweep = Math.sign(mem.searchSweep) * SEARCH_SWEEP_MAX;
        }
        ob.facing = turnToward(ob.facing, angleToLast + mem.searchSweep, TURN_RATE * dt);
      }

      const ld = dist2d(ob.x, ob.z, lastX, lastZ);
      const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
      focusDist += Math.sign(ld - focusDist) * delta;

      timer -= dt;
      if (timer <= 0) {
        atLauncher = !atLauncher;
        mem.searching = false;
        mem.searchSweep = 0;
        timer = 1.5 + Math.random();
      }
    }
  }

  return { atLauncher, timer, focusDist };
}

/** Solve launch toward target */
export function solveLaunch(
  launcherX: number, launcherZ: number,
  tgtX: number, tgtZ: number, tgtVx: number, tgtVz: number,
  maxSpeed: number, cfg: SolverConfig,
) {
  return MinTimeLaunch.solve(
    {
      launchPos: v3(launcherX, launcherZ),
      target: { position: v3(tgtX, tgtZ), velocity: v3(tgtVx, tgtVz) },
      maxSpeed,
      gravity: 0,
      damping: 0,
    },
    cfg,
  );
}
