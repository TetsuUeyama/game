import {
  PHYSICAL_MARGIN,
  OB_FOV_HALF_NEAR,
  OB_FOV_HALF_FAR,
  FOV_NARROW_DIST,
} from "../Config/FieldConfig";
import type { SimMover } from "../Types/TrackingSimTypes";
import { normAngleDiff, dist2d, dirSpeedMult } from "../Movement/MovementCore";

/** FOV half-angle at distance (wider near, narrower far) */
export function fovHalfAtDist(dist: number): number {
  const t = Math.min(dist / FOV_NARROW_DIST, 1);
  return OB_FOV_HALF_NEAR + (OB_FOV_HALF_FAR - OB_FOV_HALF_NEAR) * t;
}

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

/** Is a point within obstacle FOV? (uses neckFacing = gaze direction) */
export function isPointInFOV(m: SimMover, px: number, pz: number): boolean {
  const d = dist2d(m.x, m.z, px, pz);
  const fovHalf = fovHalfAtDist(d);
  const angle = Math.atan2(pz - m.z, px - m.x);
  return Math.abs(normAngleDiff(m.neckFacing, angle)) <= fovHalf;
}

/** Search FOV (no distance narrowing, uses neckFacing) */
export function isPointInSearchFOV(m: SimMover, px: number, pz: number): boolean {
  const angle = Math.atan2(pz - m.z, px - m.x);
  return Math.abs(normAngleDiff(m.neckFacing, angle)) <= OB_FOV_HALF_NEAR;
}

/** Is trajectory within obstacle FOV? (uses neckFacing) */
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
    if (Math.abs(normAngleDiff(m.neckFacing, angle)) <= fovHalf) return true;
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
