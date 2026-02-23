import {
  MinTimeLaunch,
  type SolverConfig,
} from "@/SimulationPlay/TargetTrackingAccuracySystem";
import { SOLVER_CFG_3D } from "../Config/EntityConfig";
import type { SimMover } from "../Types/TrackingSimTypes";
import { dirSpeedMult } from "../Movement/MovementCore";

function v3(bx: number, bz: number) { return { x: bx, y: 0, z: bz }; }

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
