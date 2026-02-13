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
} from "./types";
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
} from "./types";

// コア: ターゲット予測 + 迎撃ソルバー
export {
  predictTargetPosition,
  predictTargetVelocity,
  computeLaunchVelocity,
  solveIntercept,
  DEFAULT_SOLVER_CONFIG,
} from "./core";

// 戦略
export type { LaunchStrategy } from "./strategies";
export { MinTimeLaunch, createArcLaunch } from "./strategies";

// 評価器
export { evaluateAccuracy } from "./evaluators";
