/**
 * FieldPositionScorer - フィールド位置価値の統一評価
 *
 * 3要素で任意の座標をスコアリングする:
 *   1. goalProximity : ゴールに近いほど高い
 *   2. centerBonus   : サイドよりセンターが高い
 *   3. isolation     : 周囲に選手がいないほど高い
 *
 * 純粋関数。SimState への依存なし。
 */

import { SIM_FIELD_X_HALF } from "../Config/FieldConfig";
import { getGoalX, getGoalZ } from "../Action/ShootAction";

export interface FieldPositionScore {
  goalProximity: number;  // 0-1
  centerBonus: number;    // 0-1
  isolation: number;      // 0-1
  total: number;          // 加重合計
}

export interface FieldScoreWeights {
  goal: number;
  center: number;
  isolation: number;
}

/** デフォルト重み */
export const DEFAULT_FIELD_WEIGHTS: FieldScoreWeights = {
  goal: 0.45,
  center: 0.20,
  isolation: 0.35,
};

/** isolation が最大になる距離 (m) */
const ISOLATION_CAP = 4.0;

/** goalProximity の正規化に使うコート対角線近似 (m) */
const MAX_COURT_DIST = 28.0;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * フィールド上の任意座標をスコアリングする。
 *
 * @param x          評価座標 X
 * @param z          評価座標 Z
 * @param others     自分以外の全選手座標 (味方・敵問わず)
 * @param weights    3要素の重み (省略時 DEFAULT_FIELD_WEIGHTS)
 */
export function scoreFieldPosition(
  x: number,
  z: number,
  others: ReadonlyArray<{ x: number; z: number }>,
  weights: FieldScoreWeights = DEFAULT_FIELD_WEIGHTS,
): FieldPositionScore {
  // 1. goalProximity: ゴールまでの距離 → 近いほど 1
  const dx = x - getGoalX();
  const dz = z - getGoalZ();
  const distToGoal = Math.sqrt(dx * dx + dz * dz);
  const goalProximity = clamp01(1 - distToGoal / MAX_COURT_DIST);

  // 2. centerBonus: |X| が 0 なら 1、サイドライン際なら 0
  const centerBonus = clamp01(1 - Math.abs(x) / SIM_FIELD_X_HALF);

  // 3. isolation: 最寄り選手までの距離 (CAP 以上なら 1)
  let nearestDist = Infinity;
  for (const p of others) {
    const ddx = x - p.x;
    const ddz = z - p.z;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d < nearestDist) nearestDist = d;
  }
  const isolation = others.length === 0
    ? 1.0
    : clamp01(nearestDist / ISOLATION_CAP);

  const total =
    goalProximity * weights.goal +
    centerBonus * weights.center +
    isolation * weights.isolation;

  return { goalProximity, centerBonus, isolation, total };
}
