// 型定義 + Vec3ユーティリティ
export type {
  Vec3,
  MovingTarget,
  LaunchParams,
  InterceptSolution,
  SolverResult,
  SolverConfig,
  ArcLaunchConfig,
  AccuracyResult,
  BallFlightState,
} from "./Types";
export {
  VEC3_ZERO,
  VEC3_GRAVITY,
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Dot,
  vec3Length,
  vec3LengthSq,
  vec3Normalize,
  vec3Distance,
} from "./Types";

// コア: ターゲット予測 + 迎撃ソルバー
export {
  predictTargetPosition,
  predictTargetVelocity,
  computeLaunchVelocity,
  solveIntercept,
  DEFAULT_SOLVER_CONFIG,
} from "./Core";

// 戦略
export type { LaunchStrategy } from "./Strategies";
export { MinTimeLaunch, createArcLaunch } from "./Strategies";

// 評価器
export { evaluateAccuracy } from "./Evaluators";
