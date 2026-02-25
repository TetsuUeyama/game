import {
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  TURN_RATE,
  TURN_MIN,
  TURN_MAX,
  FIRE_MIN,
  FIRE_MAX,
  NECK_MAX_ANGLE,
  TORSO_MAX_ANGLE,
} from "../Config/FieldConfig";
import type { SimMover } from "../Types/TrackingSimTypes";

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

export function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx; const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
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

/** Turn neck toward target angle, clamped to ±NECK_MAX_ANGLE from body facing */
export function turnNeckToward(
  bodyFacing: number, currentNeck: number, targetAngle: number, maxDelta: number,
): number {
  const turned = turnToward(currentNeck, targetAngle, maxDelta);
  // Clamp relative to body facing
  let rel = normAngleDiff(bodyFacing, turned);
  if (rel > NECK_MAX_ANGLE) rel = NECK_MAX_ANGLE;
  if (rel < -NECK_MAX_ANGLE) rel = -NECK_MAX_ANGLE;
  return bodyFacing + rel;
}

/** Turn torso toward target angle, clamped to ±TORSO_MAX_ANGLE from lower body facing */
export function turnTorsoToward(
  bodyFacing: number, currentTorso: number, targetAngle: number, maxDelta: number,
): number {
  const turned = turnToward(currentTorso, targetAngle, maxDelta);
  let rel = normAngleDiff(bodyFacing, turned);
  if (rel > TORSO_MAX_ANGLE) rel = TORSO_MAX_ANGLE;
  if (rel < -TORSO_MAX_ANGLE) rel = -TORSO_MAX_ANGLE;
  return bodyFacing + rel;
}

// ============================================================================
// Mover creation / helpers
// ============================================================================

export function makeMover(x: number, z: number, speed: number): SimMover {
  const a = randAngle();
  return {
    x, z,
    vx: Math.cos(a) * speed, vz: Math.sin(a) * speed,
    speed, facing: a, torsoFacing: a, neckFacing: a, nextTurn: randTurn(),
  };
}

export function makeScanMemory(lx: number, lz: number, tx: number, tz: number) {
  return {
    lastSeenLauncherX: lx, lastSeenLauncherZ: lz,
    lastSeenTargetX: tx, lastSeenTargetZ: tz,
    searching: false, searchSweep: 0, searchDir: 1 as const,
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

/** Separate overlapping entities by pushing them apart */
export function separateEntities(
  all: { mover: SimMover; radius: number }[],
): void {
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const dx = b.mover.x - a.mover.x;
      const dz = b.mover.z - a.mover.z;
      const distSq = dx * dx + dz * dz;
      const minDist = a.radius + b.radius;
      if (distSq >= minDist * minDist || distSq < 0.0001) continue;
      const dist = Math.sqrt(distSq);
      const overlap = (minDist - dist) / 2;
      const nx = dx / dist;
      const nz = dz / dist;
      a.mover.x -= nx * overlap;
      a.mover.z -= nz * overlap;
      b.mover.x += nx * overlap;
      b.mover.z += nz * overlap;
    }
  }
  // bounce で場外に出た分を補正
  for (const { mover } of all) {
    bounce(mover);
  }
}
