/**
 * ThreatAssessment - ディフェンス脅威推定（観察ベース）
 *
 * オフェンスの内部スコアは読まず、位置・オープン度・ゴール方向のみで
 * 各オフェンスプレイヤーの脅威度を推定する。
 *
 * ※ 今回はファイル作成のみ。updateObstacleMovements への統合は後続タスク。
 */

import type { SimState } from "../Types/TrackingSimTypes";
import type { ThreatEntry, ThreatAssessmentResult } from "../Types/ActionScorerTypes";
import { dist2d } from "../Movement/MovementCore";
import { GOAL_RIM_X, GOAL_RIM_Z } from "../Config/FieldConfig";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * 全オフェンスプレイヤーの脅威度を推定する（観察ベース）。
 *
 * - positionScore (0-1): ゴールまでの距離 + ペイント内ボーナス
 * - opennessScore (0-1): 最寄りDFまでの距離 / 5.0
 * - facingScore (0-1): ゴール方向を向いているか (cos 正規化)
 * - threat = position * 0.5 + openness * 0.35 + facing * 0.15
 */
export function computeThreatAssessment(state: SimState): ThreatAssessmentResult {
  const allOffense = [state.launcher, ...state.targets];
  const entries: ThreatEntry[] = [];

  for (let i = 0; i < allOffense.length; i++) {
    const mover = allOffense[i];

    // positionScore: ゴールまでの距離（近いほど高い）+ ペイント内ボーナス
    const goalDist = dist2d(mover.x, mover.z, GOAL_RIM_X, GOAL_RIM_Z);
    const distScore = clamp(1 - goalDist / 15, 0, 1);
    const inPaint = Math.abs(mover.x) <= 2.5 && mover.z >= 10 && mover.z <= 14;
    const positionScore = clamp(distScore + (inPaint ? 0.2 : 0), 0, 1);

    // opennessScore: 最寄りDFまでの距離
    let minDefDist = Infinity;
    for (const ob of state.obstacles) {
      const d = dist2d(mover.x, mover.z, ob.x, ob.z);
      if (d < minDefDist) minDefDist = d;
    }
    const opennessScore = clamp(minDefDist / 5.0, 0, 1);

    // facingScore: ゴール方向を向いているか (cos 正規化)
    const toGoalX = GOAL_RIM_X - mover.x;
    const toGoalZ = GOAL_RIM_Z - mover.z;
    const toGoalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ) || 1;
    const facingCos = Math.cos(mover.facing) * (toGoalX / toGoalDist)
                    + Math.sin(mover.facing) * (toGoalZ / toGoalDist);
    const facingScore = clamp((facingCos + 1) / 2, 0, 1);

    const threat = positionScore * 0.5 + opennessScore * 0.35 + facingScore * 0.15;

    entries.push({
      entityIdx: i,
      threat,
      positionScore,
      opennessScore,
      facingScore,
    });
  }

  // Find most threatening
  let mostThreatening = 0;
  let maxThreat = -1;
  for (const entry of entries) {
    if (entry.threat > maxThreat) {
      maxThreat = entry.threat;
      mostThreatening = entry.entityIdx;
    }
  }

  return { entries, mostThreatening };
}
