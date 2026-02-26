import {
  NECK_TURN_RATE,
  TORSO_TURN_RATE,
  FOV_FOCUS_SPEED,
  SEARCH_SWEEP_SPEED,
  SEARCH_SWEEP_MAX,
} from "../Config/FieldConfig";
import type { SimMover, SimBall, SimScanMemory, ScanResult } from "../Types/TrackingSimTypes";
import { dist2d, normAngleDiff, turnNeckToward, turnTorsoToward } from "../Movement/MovementCore";
import { isPointInFOV, isPointInSearchFOV } from "./TrajectoryAnalysis";

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
    // 上半身→首をボール方向に向ける
    const angleToBall = Math.atan2(ball.z - ob.z, ball.x - ob.x);
    ob.torsoFacing = turnTorsoToward(ob.facing, ob.torsoFacing, angleToBall, TORSO_TURN_RATE * dt);
    ob.neckFacing = turnNeckToward(ob.torsoFacing, ob.neckFacing, angleToBall, NECK_TURN_RATE * dt);
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
      timer = 0.6 + Math.random() * 0.4;
    }
    const lookAngle1 = Math.atan2(lookEntity.z - ob.z, lookEntity.x - ob.x);
    ob.torsoFacing = turnTorsoToward(ob.facing, ob.torsoFacing, lookAngle1, TORSO_TURN_RATE * dt);
    ob.neckFacing = turnNeckToward(ob.torsoFacing, ob.neckFacing, lookAngle1, NECK_TURN_RATE * dt);
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
      const lookAngle2 = Math.atan2(lookEntity.z - ob.z, lookEntity.x - ob.x);
      ob.torsoFacing = turnTorsoToward(ob.facing, ob.torsoFacing, lookAngle2, TORSO_TURN_RATE * dt);
      ob.neckFacing = turnNeckToward(ob.torsoFacing, ob.neckFacing, lookAngle2, NECK_TURN_RATE * dt);
      const ld = dist2d(ob.x, ob.z, lookEntity.x, lookEntity.z);
      const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
      focusDist += Math.sign(ld - focusDist) * delta;
    } else {
      const angleToLast = Math.atan2(lastZ - ob.z, lastX - ob.x);

      if (mem.searchSweep === 0 && Math.abs(normAngleDiff(ob.neckFacing, angleToLast)) >= 0.1) {
        ob.torsoFacing = turnTorsoToward(ob.facing, ob.torsoFacing, angleToLast, TORSO_TURN_RATE * dt);
        ob.neckFacing = turnNeckToward(ob.torsoFacing, ob.neckFacing, angleToLast, NECK_TURN_RATE * dt);
      } else {
        mem.searchSweep += mem.searchDir * SEARCH_SWEEP_SPEED * dt;
        if (Math.abs(mem.searchSweep) > SEARCH_SWEEP_MAX) {
          mem.searchDir = (mem.searchDir * -1) as 1 | -1;
          mem.searchSweep = Math.sign(mem.searchSweep) * SEARCH_SWEEP_MAX;
        }
        const sweepAngle = angleToLast + mem.searchSweep;
        ob.torsoFacing = turnTorsoToward(ob.facing, ob.torsoFacing, sweepAngle, TORSO_TURN_RATE * dt);
        ob.neckFacing = turnNeckToward(ob.torsoFacing, ob.neckFacing, sweepAngle, NECK_TURN_RATE * dt);
      }

      const ld = dist2d(ob.x, ob.z, lastX, lastZ);
      const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
      focusDist += Math.sign(ld - focusDist) * delta;

      timer -= dt;
      if (timer <= 0) {
        atLauncher = !atLauncher;
        mem.searching = false;
        mem.searchSweep = 0;
        timer = 0.6 + Math.random() * 0.4;
      }
    }
  }

  return { atLauncher, timer, focusDist };
}
