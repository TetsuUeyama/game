import {
  Vec3,
  MovingTarget,
  BallFlightState,
  AccuracyResult,
  vec3Sub,
  vec3Distance,
} from "../Types";
import { predictTargetPosition } from "../Core/TargetPredictor";

/** デフォルト基準半径: バスケットボール直径 (m) */
const DEFAULT_REFERENCE_RADIUS = 0.24;

/**
 * ボールの飛行位置を解析的に計算（DeterministicTrajectoryと同じ式）
 */
function getBallPosition(flight: BallFlightState, t: number): Vec3 {
  const { startPos, launchVelocity: v, gravity, damping } = flight;

  if (damping < 1e-9) {
    return {
      x: startPos.x + v.x * t,
      y: startPos.y + v.y * t - 0.5 * gravity * t * t,
      z: startPos.z + v.z * t,
    };
  }

  const k = damping;
  const g = gravity;
  const expKT = Math.exp(-k * t);
  const factor = (1 - expKT) / k;

  return {
    x: startPos.x + v.x * factor,
    y: startPos.y + (v.y + g / k) * factor - g * t / k,
    z: startPos.z + v.z * factor,
  };
}

/**
 * ボールとターゲットの距離を時刻tで計算
 */
function distanceAtTime(
  flight: BallFlightState,
  target: MovingTarget,
  t: number,
): number {
  const ballPos = getBallPosition(flight, t);
  const targetPos = predictTargetPosition(target, t);
  return vec3Distance(ballPos, targetPos);
}

/**
 * 黄金分割探索で最接近時刻を精密化
 */
function goldenSectionSearch(
  flight: BallFlightState,
  target: MovingTarget,
  lo: number,
  hi: number,
  iterations: number,
): number {
  const phi = (1 + Math.sqrt(5)) / 2;
  const resphi = 2 - phi;

  let a = lo;
  let b = hi;

  let x1 = a + resphi * (b - a);
  let x2 = b - resphi * (b - a);
  let f1 = distanceAtTime(flight, target, x1);
  let f2 = distanceAtTime(flight, target, x2);

  for (let i = 0; i < iterations; i++) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = a + resphi * (b - a);
      f1 = distanceAtTime(flight, target, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = b - resphi * (b - a);
      f2 = distanceAtTime(flight, target, x2);
    }
  }

  return (a + b) / 2;
}

/**
 * 命中精度を評価
 *
 * 1. 時間サンプリング（200点）で大まかな最接近区間を特定
 * 2. 黄金分割探索で最接近時刻を精密化
 * 3. 意図した迎撃時刻での偏差を計算
 * 4. スコア: max(0, 1 - closestDistance / referenceRadius)
 */
export function evaluateAccuracy(
  ballFlight: BallFlightState,
  target: MovingTarget,
  interceptTime: number,
  referenceRadius: number = DEFAULT_REFERENCE_RADIUS,
): AccuracyResult {
  const sampleCount = 200;
  const dt = interceptTime / sampleCount;

  // Step 1: 時間サンプリングで最接近区間を特定
  let bestSampleIdx = 0;
  let bestSampleDist = Infinity;

  for (let i = 0; i <= sampleCount; i++) {
    const t = i * dt;
    const dist = distanceAtTime(ballFlight, target, t);
    if (dist < bestSampleDist) {
      bestSampleDist = dist;
      bestSampleIdx = i;
    }
  }

  // Step 2: 黄金分割探索で精密化
  const searchLo = Math.max(0, (bestSampleIdx - 1) * dt);
  const searchHi = Math.min(interceptTime, (bestSampleIdx + 1) * dt);
  const closestTime = goldenSectionSearch(
    ballFlight,
    target,
    searchLo,
    searchHi,
    30,
  );
  const closestDistance = distanceAtTime(ballFlight, target, closestTime);

  // Step 3: 意図した迎撃時刻での偏差
  const ballAtIntercept = getBallPosition(ballFlight, interceptTime);
  const targetAtIntercept = predictTargetPosition(target, interceptTime);
  const deviationAtIntercept = vec3Sub(ballAtIntercept, targetAtIntercept);

  // Step 4: スコア計算
  const score = Math.max(0, 1 - closestDistance / referenceRadius);

  return {
    score,
    closestDistance,
    closestTime,
    deviationAtIntercept,
  };
}
