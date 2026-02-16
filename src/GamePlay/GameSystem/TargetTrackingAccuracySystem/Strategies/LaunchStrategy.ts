import {
  InterceptSolution,
  LaunchParams,
  SolverConfig,
  ArcLaunchConfig,
} from "../Types";
import {
  solveIntercept,
  DEFAULT_SOLVER_CONFIG,
  computeLaunchVelocity,
} from "../Core/InterceptSolver";
import { predictTargetPosition } from "../Core/TargetPredictor";
import { vec3Length } from "../Types";

/** 発射戦略インターフェース */
export interface LaunchStrategy {
  readonly type: string;
  solve(
    params: LaunchParams,
    config?: SolverConfig,
  ): InterceptSolution | null;
}

/**
 * 最短時間発射戦略
 * solveIntercept の結果から最短飛行時間の解を選択
 */
export const MinTimeLaunch: LaunchStrategy = {
  type: "min-time",
  solve(
    params: LaunchParams,
    config: SolverConfig = DEFAULT_SOLVER_CONFIG,
  ): InterceptSolution | null {
    const result = solveIntercept(params, config);
    return result.bestSolution;
  },
};

/**
 * アーク指定発射戦略
 * 指定アーク高さHから理想飛行時間 T = √(8H/g) を算出
 * 有効なら採用、無効なら solveIntercept で最も近いTの解にフォールバック
 */
export function createArcLaunch(arcConfig: ArcLaunchConfig): LaunchStrategy {
  return {
    type: "arc",
    solve(
      params: LaunchParams,
      config: SolverConfig = DEFAULT_SOLVER_CONFIG,
    ): InterceptSolution | null {
      const { arcHeight } = arcConfig;
      const g = params.gravity;

      // 理想飛行時間: T = √(8H/g) （ParabolaUtils / DeterministicTrajectory と同じ式）
      const idealT = Math.sqrt((8 * arcHeight) / g);

      // idealTで解が有効か試す
      const interceptPos = predictTargetPosition(params.target, idealT);
      const v0 = computeLaunchVelocity(
        params.launchPos,
        interceptPos,
        idealT,
        params.gravity,
        params.damping,
      );
      const speed = vec3Length(v0);

      if (speed <= params.maxSpeed) {
        return {
          launchVelocity: v0,
          interceptPos,
          flightTime: idealT,
          speed,
          valid: true,
        };
      }

      // フォールバック: solveIntercept で最もidealTに近い解を選択
      const result = solveIntercept(params, config);
      if (result.solutions.length === 0) return null;

      let closest = result.solutions[0];
      let closestDiff = Math.abs(closest.flightTime - idealT);

      for (let i = 1; i < result.solutions.length; i++) {
        const diff = Math.abs(result.solutions[i].flightTime - idealT);
        if (diff < closestDiff) {
          closest = result.solutions[i];
          closestDiff = diff;
        }
      }

      return closest;
    },
  };
}
