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
  type BallFireContext,
  type PreFireEvalResult,
  type FireSolution,
  type ObstacleReaction,
  type FireAttemptResult,
  type BallResultType,
  type BallResultDetection,
  type ActionPhase,
  type ActionType,
  type ActionTiming,
  type ActionState,
  type SimState,
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

export {
  createIdleAction,
  startAction,
  tickActionState,
  forceRecovery,
} from "./Action/ActionCore";

export {
  PASS_TIMING,
  evaluatePreFire,
  attemptFire,
  computeObstacleReactions,
  detectBallResult,
} from "./Action/PassAction";

export {
  MOVE_TIMING,
  MOVE_RECOVERY_BASE,
  MOVE_RECOVERY_PER_UNIT,
  computeMoveRecovery,
} from "./Action/MoveAction";

export {
  CATCH_TIMING,
} from "./Action/CatchAction";

export {
  OBSTACLE_REACT_TIMING,
  TARGET_RECEIVE_TIMING,
} from "./Action/ObstacleReactAction";
