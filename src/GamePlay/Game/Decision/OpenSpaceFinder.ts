import {
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
} from "../Config/FieldConfig";
import { TARGET_RANDOM_SPEED } from "../Config/EntityConfig";
import type { SimZone } from "../Config/FieldConfig";
import type { SimMover } from "../Types/TrackingSimTypes";
import { dist2d, normAngleDiff, moveWithFacing } from "../Movement/MovementCore";
import { isPhysicallyClose, fovHalfAtDist } from "./TrajectoryAnalysis";
import { scoreFieldPosition } from "./FieldPositionScorer";

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
      if (Math.abs(normAngleDiff(ob.neckFacing, angle)) > fovHalf) {
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

/** Zone-constrained open space finder */
export function findOpenSpaceInZone(
  zone: SimZone,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
  homeX: number,
  homeZ: number,
  samples = 20,
): { x: number; z: number } {
  let bestX = homeX;
  let bestZ = homeZ;
  let bestScore = -Infinity;

  for (let i = 0; i < samples; i++) {
    const px = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
    const pz = zone.zMin + Math.random() * (zone.zMax - zone.zMin);
    let score = 0;

    // Distance from obstacles
    let minObDist = Infinity;
    for (const ob of obstacles) {
      const d = dist2d(px, pz, ob.x, ob.z);
      minObDist = Math.min(minObDist, d);
      score += Math.min(d, 3.75);
    }
    score += minObDist * 2;

    // Pass lane clearance
    let pathClear = true;
    for (const ob of obstacles) {
      if (isPhysicallyClose(ob, launcher.x, launcher.z, px, pz)) {
        pathClear = false;
        break;
      }
    }
    if (pathClear) score += 2.25;

    // FOV avoidance
    for (const ob of obstacles) {
      const d = dist2d(px, pz, ob.x, ob.z);
      const fovHalf = fovHalfAtDist(d);
      const angle = Math.atan2(pz - ob.z, px - ob.x);
      if (Math.abs(normAngleDiff(ob.neckFacing, angle)) > fovHalf) {
        score += 1.5;
      }
    }

    // Field position value (goal proximity + center bonus + isolation)
    const allPlayers = [...obstacles, launcher, ...otherTargets];
    const fp = scoreFieldPosition(px, pz, allPlayers);
    score += fp.total * 5.0;

    // Proximity to home position (gentle pull — allow freedom within zone)
    const homeDist = dist2d(px, pz, homeX, homeZ);
    score -= homeDist * 0.3;

    // Teammate spacing (includes launcher to avoid clustering near ball handler)
    const SPREAD_MIN = 3.5;
    const teammates = [launcher, ...otherTargets];
    for (const mate of teammates) {
      const mateDist = dist2d(px, pz, mate.x, mate.z);
      if (mateDist < SPREAD_MIN) {
        score -= (SPREAD_MIN - mateDist) * 4;
      }
    }

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
