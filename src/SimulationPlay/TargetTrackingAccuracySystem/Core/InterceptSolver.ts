import {
  Vec3,
  LaunchParams,
  InterceptSolution,
  SolverResult,
  SolverConfig,
  vec3Sub,
  vec3Length,
} from "../Types";
import { predictTargetPosition } from "./TargetPredictor";

/** デフォルトソルバー設定 */
export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  coarseStep: 0.05,
  fineStep: 0.005,
  minTime: 0.1,
  maxTime: 5.0,
  bisectIterations: 10,
};

/**
 * 指定飛行時間Tでの必要発射速度V0を計算
 *
 * ダンピングなし: V0 = (interceptPos - launchPos) / T - 0.5 * g * T * (0, -1, 0)
 * ダンピングあり: factor = (1 - e^(-kT)) / k, DeterministicTrajectoryと同じ解析式
 */
export function computeLaunchVelocity(
  launchPos: Vec3,
  interceptPos: Vec3,
  flightTime: number,
  gravity: number,
  damping: number,
): Vec3 {
  const diff = vec3Sub(interceptPos, launchPos);
  const T = flightTime;

  if (damping < 1e-9) {
    // ダンピングなし
    // ボール位置(T) = launchPos + V0*T + 0.5*g_vec*T²
    // g_vec = (0, -gravity, 0) なので y成分: y0 + vy*T - 0.5*g*T²
    // V0 = diff/T - 0.5*g_vec*T → vy = dy/T + 0.5*g*T
    return {
      x: diff.x / T,
      y: diff.y / T + 0.5 * gravity * T,
      z: diff.z / T,
    };
  }

  // ダンピングあり: DeterministicTrajectoryと同じ解析式
  const k = damping;
  const g = gravity;
  const expKT = Math.exp(-k * T);
  const factor = (1 - expKT) / k;

  return {
    x: diff.x / factor,
    y: (diff.y + g * T / k) / factor - g / k,
    z: diff.z / factor,
  };
}

/**
 * 飛行時間Tでの必要速度の大きさを計算
 */
function requiredSpeed(params: LaunchParams, T: number): number {
  const interceptPos = predictTargetPosition(params.target, T);
  const v0 = computeLaunchVelocity(
    params.launchPos,
    interceptPos,
    T,
    params.gravity,
    params.damping,
  );
  return vec3Length(v0);
}

/**
 * 飛行時間Tから InterceptSolution を構築
 */
function buildSolution(params: LaunchParams, T: number): InterceptSolution {
  const interceptPos = predictTargetPosition(params.target, T);
  const v0 = computeLaunchVelocity(
    params.launchPos,
    interceptPos,
    T,
    params.gravity,
    params.damping,
  );
  const speed = vec3Length(v0);
  return {
    launchVelocity: v0,
    interceptPos,
    flightTime: T,
    speed,
    valid: speed <= params.maxSpeed,
  };
}

/**
 * 二分法で有効区間の境界を精密化
 */
function bisectBoundary(
  params: LaunchParams,
  tValid: number,
  tInvalid: number,
  iterations: number,
): number {
  let lo = tValid;
  let hi = tInvalid;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (requiredSpeed(params, mid) <= params.maxSpeed) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** 有効区間（|V0| <= maxSpeed となるTの範囲） */
interface ValidInterval {
  start: number;
  end: number;
}

/**
 * 迎撃計算のメインソルバー
 *
 * アルゴリズム:
 * 1. 粗探索: minTime〜maxTime を coarseStep刻みで走査
 * 2. 有効区間検出: |V0| <= maxSpeed となる連続区間を検出（二分法で境界精密化）
 * 3. 密探索: 有効区間内を fineStep刻みで走査、最小速度Tと最小時間Tを記録
 * 4. 解構築: 重複除去→飛行時間順ソート→bestSolution選出
 */
export function solveIntercept(
  params: LaunchParams,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG,
): SolverResult {
  const { coarseStep, fineStep, minTime, maxTime, bisectIterations } = config;

  // --- Step 1 & 2: 粗探索 + 有効区間検出 ---
  const intervals: ValidInterval[] = [];
  let inValid = false;
  let intervalStart = 0;

  for (let T = minTime; T <= maxTime; T += coarseStep) {
    const speed = requiredSpeed(params, T);
    const isValid = speed <= params.maxSpeed;

    if (isValid && !inValid) {
      // 有効区間の開始
      if (T > minTime) {
        // 前のステップは無効だった → 二分法で境界精密化
        intervalStart = bisectBoundary(
          params,
          T,
          T - coarseStep,
          bisectIterations,
        );
      } else {
        intervalStart = T;
      }
      inValid = true;
    } else if (!isValid && inValid) {
      // 有効区間の終了
      const intervalEnd = bisectBoundary(
        params,
        T - coarseStep,
        T,
        bisectIterations,
      );
      intervals.push({ start: intervalStart, end: intervalEnd });
      inValid = false;
    }
  }
  // 最後まで有効だった場合
  if (inValid) {
    intervals.push({ start: intervalStart, end: maxTime });
  }

  if (intervals.length === 0) {
    return { solutions: [], bestSolution: null };
  }

  // --- Step 3: 密探索 ---
  let minSpeedT = -1;
  let minSpeedVal = Infinity;
  let minTimeT = Infinity;

  for (const interval of intervals) {
    // 区間内の最小時間Tを記録
    if (interval.start < minTimeT) {
      minTimeT = interval.start;
    }

    // 密探索: 最小速度のTを見つける
    for (let T = interval.start; T <= interval.end; T += fineStep) {
      const speed = requiredSpeed(params, T);
      if (speed < minSpeedVal) {
        minSpeedVal = speed;
        minSpeedT = T;
      }
    }
  }

  // --- Step 4: 解構築 ---
  const solutions: InterceptSolution[] = [];
  const addedTimes = new Set<number>();

  // 最小時間の解
  if (minTimeT < Infinity) {
    const rounded = Math.round(minTimeT * 1000) / 1000;
    solutions.push(buildSolution(params, minTimeT));
    addedTimes.add(rounded);
  }

  // 最小速度の解（重複でなければ）
  if (minSpeedT > 0) {
    const rounded = Math.round(minSpeedT * 1000) / 1000;
    if (!addedTimes.has(rounded)) {
      solutions.push(buildSolution(params, minSpeedT));
      addedTimes.add(rounded);
    }
  }

  // 各有効区間の境界も候補に追加
  for (const interval of intervals) {
    for (const T of [interval.start, interval.end]) {
      const rounded = Math.round(T * 1000) / 1000;
      if (!addedTimes.has(rounded)) {
        const sol = buildSolution(params, T);
        if (sol.valid) {
          solutions.push(sol);
          addedTimes.add(rounded);
        }
      }
    }
  }

  // 飛行時間順にソート
  solutions.sort((a, b) => a.flightTime - b.flightTime);

  // bestSolution: 最短飛行時間
  const bestSolution = solutions.length > 0 ? solutions[0] : null;

  return { solutions, bestSolution };
}
