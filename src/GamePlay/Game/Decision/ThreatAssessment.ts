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
import { GOAL_RIM_X, GOAL_RIM_Z } from "../Config/ShootConfig";
import { scoreFieldPosition } from "./FieldPositionScorer";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * 全オフェンスプレイヤーの脅威度を推定する（観察ベース）。
 *
 * - positionScore (0-1): ゴールまでの距離 + ペイント内ボーナス
 * - opennessScore (0-1): 最寄りDFまでの距離 / 5.0
 * - facingScore (0-1): ゴール方向を向いているか (cos 正規化)
 * - threat = position * 0.40 + openness * 0.30 + facing * 0.30
 */
export function computeThreatAssessment(state: SimState): ThreatAssessmentResult {
  const allOffense = [state.launcher, ...state.targets];
  const entries: ThreatEntry[] = [];

  for (let i = 0; i < allOffense.length; i++) {
    const mover = allOffense[i];

    // positionScore + opennessScore: FieldPositionScorer で統一評価
    const others = state.obstacles.map(ob => ({ x: ob.x, z: ob.z }));
    const fp = scoreFieldPosition(mover.x, mover.z, others);
    // goalProximity + centerBonus → positionScore, isolation → opennessScore
    const positionScore = clamp(fp.goalProximity * 0.7 + fp.centerBonus * 0.3, 0, 1);
    const opennessScore = fp.isolation;

    // facingScore: ゴール方向を向いているか (cos 正規化)
    const toGoalX = GOAL_RIM_X - mover.x;
    const toGoalZ = GOAL_RIM_Z - mover.z;
    const toGoalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ) || 1;
    const facingCos = Math.cos(mover.facing) * (toGoalX / toGoalDist)
                    + Math.sin(mover.facing) * (toGoalZ / toGoalDist);
    const facingScore = clamp((facingCos + 1) / 2, 0, 1);

    const threat = positionScore * 0.40 + opennessScore * 0.30 + facingScore * 0.30;

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
