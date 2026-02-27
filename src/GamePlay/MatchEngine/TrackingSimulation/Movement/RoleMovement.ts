import {
  ROLE_ASSIGNMENTS,
  LAUNCHER_EVAL_SAMPLES,
  SLASHER_VCUT_AMPLITUDE,
  SLASHER_VCUT_PERIOD,
  OPEN_THRESHOLD,
  SCREENER_OFFSET,
  DUNKER_SEAL_DIST,
} from "../Decision/OffenseRoleAssignment";
import type { SimZone } from "../Config/FieldConfig";
import { TARGET_RANDOM_SPEED, TARGET_INTERCEPT_SPEED } from "../Config/EntityConfig";
import type { SimMover, LauncherState, SlasherState, ScreenerState, DunkerState } from "../Types/TrackingSimTypes";
import { dist2d, moveWithFacing } from "../Movement/MovementCore";
import { isPhysicallyClose, isTrajectoryInFOV } from "../Decision/TrajectoryAnalysis";
import { findOpenSpaceInZone } from "../Decision/OpenSpaceFinder";

/**
 * Transit mode: move toward home position at jogging speed.
 * Returns true when player has entered their zone (transit complete).
 */
export function moveTransitToHome(m: SimMover, entityIdx: number, dt: number): boolean {
  const role = entityIdx === 0
    ? ROLE_ASSIGNMENTS.launcher
    : ROLE_ASSIGNMENTS.targets[entityIdx - 1];
  moveTowardDest(m, { x: role.homeX, z: role.homeZ }, TARGET_INTERCEPT_SPEED, dt);
  const z = role.zone;
  return m.x >= z.xMin && m.x <= z.xMax && m.z >= z.zMin && m.z <= z.zMax;
}

/** Clamp position to zone bounds */
function clampToZone(m: SimMover, zone: SimZone): void {
  const pad = 0.05;
  m.x = Math.max(zone.xMin + pad, Math.min(zone.xMax - pad, m.x));
  m.z = Math.max(zone.zMin + pad, Math.min(zone.zMax - pad, m.z));
}

/** Move toward a destination point */
function moveTowardDest(m: SimMover, dest: { x: number; z: number }, speed: number, dt: number): void {
  const dx = dest.x - m.x;
  const dz = dest.z - m.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 0.075) {
    m.vx = (dx / d) * speed;
    m.vz = (dz / d) * speed;
  } else {
    m.vx = 0;
    m.vz = 0;
  }
  moveWithFacing(m, speed, dt);
}

/**
 * PG / MAIN_HANDLER: evaluate zone positions for best pass lane coverage
 */
export function moveLauncherSmart(
  launcher: SimMover,
  state: LauncherState,
  targets: SimMover[],
  obstacles: SimMover[],
  dt: number,
): void {
  const role = ROLE_ASSIGNMENTS.launcher;
  state.reevalTimer -= dt;

  const atDest = state.dest && dist2d(launcher.x, launcher.z, state.dest.x, state.dest.z) < 0.3;
  if (state.reevalTimer <= 0 || !state.dest || atDest) {
    const zone = role.zone;
    let bestX = role.homeX;
    let bestZ = role.homeZ;
    let bestLanes = -1;

    for (let i = 0; i < LAUNCHER_EVAL_SAMPLES; i++) {
      const cx = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
      const cz = zone.zMin + Math.random() * (zone.zMax - zone.zMin);

      let clearLanes = 0;
      for (let ti = 0; ti < targets.length; ti++) {
        const tgt = targets[ti];
        let blocked = false;
        for (const ob of obstacles) {
          if (isPhysicallyClose(ob, cx, cz, tgt.x, tgt.z) ||
              isTrajectoryInFOV(ob, cx, cz, tgt.x, tgt.z)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) clearLanes++;
      }

      if (clearLanes > bestLanes) {
        bestLanes = clearLanes;
        bestX = cx;
        bestZ = cz;
        state.bestPassTargetIdx = 0;
      }
    }

    state.dest = { x: bestX, z: bestZ };
    state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
  }

  moveTowardDest(launcher, state.dest!, launcher.speed, dt);
  clampToZone(launcher, role.zone);
}

/**
 * SG / SECOND_HANDLER: wing positioning with pressure-based re-evaluation
 */
export function moveSecondHandler(
  tgt: SimMover,
  dest: { x: number; z: number } | null,
  reevalTimer: number,
  dt: number,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
): { dest: { x: number; z: number }; reevalTimer: number } {
  const role = ROLE_ASSIGNMENTS.targets[0];
  reevalTimer -= dt;

  // Pressure check: re-evaluate immediately if obstacle too close
  let underPressure = false;
  for (const ob of obstacles) {
    if (dist2d(tgt.x, tgt.z, ob.x, ob.z) < OPEN_THRESHOLD) {
      underPressure = true;
      break;
    }
  }

  const atDest = dest && dist2d(tgt.x, tgt.z, dest.x, dest.z) < 0.3;
  if (reevalTimer <= 0 || !dest || atDest || underPressure) {
    dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ);
    reevalTimer = role.reevalInterval + Math.random() * 0.5;
  }

  moveTowardDest(tgt, dest!, TARGET_RANDOM_SPEED * role.speedMult, dt);
  clampToZone(tgt, role.zone);
  return { dest, reevalTimer };
}

/**
 * SF / SLASHER: V-cut movement (zone <-> goal direction oscillation)
 */
export function moveSlasher(
  tgt: SimMover,
  state: SlasherState,
  dt: number,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
): void {
  const role = ROLE_ASSIGNMENTS.targets[1];
  state.vcutPhase += (dt / SLASHER_VCUT_PERIOD) * Math.PI * 2;
  if (state.vcutPhase > Math.PI * 2) state.vcutPhase -= Math.PI * 2;

  state.reevalTimer -= dt;

  const sinVal = Math.sin(state.vcutPhase);
  if (sinVal > 0.5) {
    // Cut phase: move toward basket (+Z direction)
    state.vcutActive = true;
    const cutX = role.homeX;
    const cutZ = role.homeZ + SLASHER_VCUT_AMPLITUDE;
    state.dest = { x: cutX, z: cutZ };
  } else {
    // Reset phase: return to open space in zone
    if (state.vcutActive || state.reevalTimer <= 0 || !state.dest) {
      state.dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ);
      state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
    }
    state.vcutActive = false;
  }

  const speed = TARGET_RANDOM_SPEED * role.speedMult * (state.vcutActive ? 1.3 : 1.0);
  moveTowardDest(tgt, state.dest!, speed, dt);
  // During V-cut, allow movement beyond zone toward basket (+Z)
  if (!state.vcutActive) {
    clampToZone(tgt, role.zone);
  } else {
    // Extended zone during cut (expand toward basket)
    const extZone: SimZone = {
      xMin: role.zone.xMin,
      xMax: role.zone.xMax,
      zMin: role.zone.zMin,
      zMax: role.zone.zMax + SLASHER_VCUT_AMPLITUDE + 0.5,
    };
    clampToZone(tgt, extZone);
  }
}

/**
 * C / SCREENER: screen position -> pick & pop
 */
export function moveScreener(
  tgt: SimMover,
  state: ScreenerState,
  dt: number,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
): void {
  const role = ROLE_ASSIGNMENTS.targets[2];
  state.reevalTimer -= dt;

  if (!state.screenSet) {
    // Phase 1: move to screen position (between launcher and basket +Z)
    const screenX = launcher.x;
    const screenZ = launcher.z + SCREENER_OFFSET;
    state.dest = { x: screenX, z: screenZ };

    const distToScreen = dist2d(tgt.x, tgt.z, screenX, screenZ);
    if (distToScreen < 0.3) {
      state.screenSet = true;
      state.holdTimer = 1.5 + Math.random() * 1.0;
    }
  } else if (state.holdTimer > 0) {
    // Hold screen position
    state.holdTimer -= dt;
    tgt.vx = 0;
    tgt.vz = 0;
    moveWithFacing(tgt, 0, dt);
    return;
  } else {
    // Phase 2: pop to open space (pick & pop)
    if (state.reevalTimer <= 0 || !state.dest) {
      state.dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ);
      state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
      state.screenSet = false; // Reset cycle
    }
  }

  moveTowardDest(tgt, state.dest!, TARGET_RANDOM_SPEED * role.speedMult, dt);
  clampToZone(tgt, role.zone);
}

/**
 * PF / DUNKER: post-up with seal against nearest defender
 */
export function moveDunker(
  tgt: SimMover,
  state: DunkerState,
  dt: number,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
): void {
  const role = ROLE_ASSIGNMENTS.targets[3];
  state.reevalTimer -= dt;

  // Find nearest obstacle near zone
  let nearestOb: SimMover | null = null;
  let nearestDist = Infinity;
  for (const ob of obstacles) {
    const d = dist2d(tgt.x, tgt.z, ob.x, ob.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearestOb = ob;
    }
  }

  if (nearestOb && nearestDist < OPEN_THRESHOLD * 2) {
    // Seal: position between defender and basket (+Z direction)
    state.sealing = true;
    const dx = nearestOb.x - tgt.x;
    const dz = nearestOb.z - tgt.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    // Position at SEAL_DIST toward +Z (basket) from the defender
    const sealX = nearestOb.x + (dx / d) * DUNKER_SEAL_DIST * 0.3;
    const sealZ = nearestOb.z + DUNKER_SEAL_DIST;
    state.dest = { x: sealX, z: sealZ };
  } else {
    state.sealing = false;
    if (state.reevalTimer <= 0 || !state.dest) {
      state.dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ);
      state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
    }
  }

  moveTowardDest(tgt, state.dest!, TARGET_RANDOM_SPEED * role.speedMult, dt);
  clampToZone(tgt, role.zone);
}

