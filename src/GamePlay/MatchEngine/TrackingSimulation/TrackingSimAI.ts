// Re-export barrel for backward compatibility
export {
  type SimMover,
  type SimBall,
  type SimScanMemory,
  type SimPreFireInfo,
  type TrackingSimScore,
  type LauncherState,
  type SlasherState,
  type ScreenerState,
  type DunkerState,
  type ScanResult,
} from "./Types/TrackingSimTypes";

export {
  randAngle,
  randTurn,
  randFire,
  normAngleDiff,
  dist2d,
  dirSpeedMult,
  turnToward,
  makeMover,
  makeScanMemory,
  bounce,
  moveWithFacing,
  moveKeepFacing,
  setChaserVelocity,
  stepMover,
  restoreRandom,
  separateEntities,
} from "./Movement/MovementCore";

export {
  fovHalfAtDist,
  segClosestPoint,
  isPhysicallyClose,
  isPointInFOV,
  isPointInSearchFOV,
  isTrajectoryInFOV,
  canReachTrajectory,
  canTargetReach,
} from "./Decision/TrajectoryAnalysis";

export {
  canObIntercept,
  solveLaunch,
} from "./Decision/LaunchSolver";

export {
  findOpenSpace,
  findOpenSpaceInZone,
  moveTargetToOpenSpace,
} from "./Decision/OpenSpaceFinder";

export {
  updateScan,
} from "./Decision/ScanSystem";

export {
  moveLauncherSmart,
  moveSecondHandler,
  moveSlasher,
  moveScreener,
  moveDunker,
  moveSpacer,
} from "./Movement/RoleMovement";
