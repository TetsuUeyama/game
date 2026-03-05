/**
 * ActionScorerFactors - 初期スコア要素群
 *
 * 各要素は evaluate() で 0〜1 を返し、weight で重み付けされる。
 * 新要素追加はこのファイルに関数を追加 + DEFAULT_FACTORS に追加するだけ。
 */

import type { ScoreFactor, ActionScorerContext } from "../Types/ActionScorerTypes";
import { canShoot, getGoalX, getGoalZ } from "../Action/ShootAction";
import { dist2d } from "../Movement/MovementCore";
import { MAX_SHOOT_RANGE } from "../Config/ShootConfig";
import { scoreFieldPosition } from "./FieldPositionScorer";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** 全DFの中で単純に最も近い距離（hold用） */
function nearestDefenderDist(ctx: ActionScorerContext): number {
  let minDist = Infinity;
  for (const ob of ctx.obstacles) {
    const d = dist2d(ctx.mover.x, ctx.mover.z, ob.x, ob.z);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/** シュートコース幅: この範囲内のDFのみ脅威と見なす */
const SHOT_THREAT_LANE_WIDTH = 2.0;

/**
 * シューター→ゴール経路上にいる脅威DFまでの最短距離を返す。
 * 「経路上」= シューターとゴールの間に射影があり、レーン幅内にいるDF。
 * 経路上にDFがいなければ Infinity を返す（= ドフリー）。
 */
function nearestThreatDefenderDist(ctx: ActionScorerContext): number {
  const toGoalX = getGoalX() - ctx.mover.x;
  const toGoalZ = getGoalZ() - ctx.mover.z;
  const toGoalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ);
  if (toGoalDist < 0.01) return Infinity;
  const dirX = toGoalX / toGoalDist;
  const dirZ = toGoalZ / toGoalDist;

  let minDist = Infinity;
  for (const ob of ctx.obstacles) {
    const dx = ob.x - ctx.mover.x;
    const dz = ob.z - ctx.mover.z;
    // DF がシューターとゴールの間にいるか（射影が正かつゴール距離以内）
    const proj = dx * dirX + dz * dirZ;
    if (proj <= 0 || proj > toGoalDist) continue;
    // シュートラインからの垂直距離
    const perpDist = Math.abs(-dirZ * dx + dirX * dz);
    if (perpDist > SHOT_THREAT_LANE_WIDTH) continue;
    // 脅威DF → ユークリッド距離を記録
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * DFのゴール方向への向き度合い。
 * 1 = ゴール正面を向いている（高い警戒 = OF にとってリスク大）
 * 0 = ゴールと反対を向いている（低い警戒 = OF にとってチャンス）
 */
function goalFacingAwareness(ob: { x: number; z: number; facing: number }): number {
  const toGoalX = getGoalX() - ob.x;
  const toGoalZ = getGoalZ() - ob.z;
  const toGoalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ) || 1;
  const cos = Math.cos(ob.facing) * (toGoalX / toGoalDist)
            + Math.sin(ob.facing) * (toGoalZ / toGoalDist);
  return clamp((cos + 1) / 2, 0, 1);
}

// =========================================================================
// Shoot factors
// =========================================================================

/**
 * シュート期待値（距離ベース）
 *
 * レイアップ(0-1m)=1.0, 中距離(4m)≈0.6, 3P(7.2m)≈0.28, 最長(8.5m)≈0.15
 * レンジ外 = 0
 */
export const shootZone: ScoreFactor = {
  id: 'shoot:zone',
  action: 'shoot',
  weight: 10.0,
  evaluate(ctx: ActionScorerContext): number {
    if (!canShoot(ctx.mover)) return 0;
    const d = dist2d(ctx.mover.x, ctx.mover.z, getGoalX(), getGoalZ());
    return clamp(1.0 - d * 0.1, 0.15, 1.0);
  },
};

/** ドライブ不要とみなすゴール近接距離 (m) — レイアップ圏内 */
const DRIVE_UNNECESSARY_DIST = 2.0;

/**
 * シュートコース上の脅威DFが遠いほどシュートしやすい。
 *
 * 脅威DFあり: DFが遠いほど高スコア（従来通り）
 * 脅威DFなし（完全フリー）: ゴールに近いほど高スコア。
 *   レイアップ圏内(≤2m)なら 1.0、遠ければ低スコア → ドライブを促す。
 */
export const shootDefenderProximity: ScoreFactor = {
  id: 'shoot:defenderProximity',
  action: 'shoot',
  weight: 3.0,
  evaluate(ctx: ActionScorerContext): number {
    if (!canShoot(ctx.mover)) return 0;
    const threatDist = nearestThreatDefenderDist(ctx);
    if (threatDist !== Infinity) {
      // 脅威DFあり → DFが遠いほど高スコア
      return clamp(threatDist / 3.0, 0, 1);
    }
    // 完全フリー → ゴール距離に応じたスコア（近い = 高い）
    const goalDist = dist2d(ctx.mover.x, ctx.mover.z, getGoalX(), getGoalZ());
    if (goalDist <= DRIVE_UNNECESSARY_DIST) return 1.0;
    // 2m以遠は二次関数で急落（6m→0.11, 4m→0.25）
    const ratio = DRIVE_UNNECESSARY_DIST / goalDist;
    return ratio * ratio;
  },
};

/**
 * シュートコース上の最寄り脅威DFがゴールから逆を向いているほどシュートしやすい。
 * 脅威DFなし → 0（警戒すべき相手がいないので評価対象外）。
 */
export const shootDefenderAwareness: ScoreFactor = {
  id: 'shoot:defenderAwareness',
  action: 'shoot',
  weight: 2.5,
  evaluate(ctx: ActionScorerContext): number {
    if (!canShoot(ctx.mover)) return 0;

    const toGoalX = getGoalX() - ctx.mover.x;
    const toGoalZ = getGoalZ() - ctx.mover.z;
    const toGoalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ);
    if (toGoalDist < 0.01) return 1;
    const dirX = toGoalX / toGoalDist;
    const dirZ = toGoalZ / toGoalDist;

    let minDist = Infinity;
    let nearestAwareness = -1; // -1 = コース上にDFなし
    for (const ob of ctx.obstacles) {
      const dx = ob.x - ctx.mover.x;
      const dz = ob.z - ctx.mover.z;
      const proj = dx * dirX + dz * dirZ;
      if (proj <= 0 || proj > toGoalDist) continue;
      const perpDist = Math.abs(-dirZ * dx + dirX * dz);
      if (perpDist > SHOT_THREAT_LANE_WIDTH) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < minDist) {
        minDist = d;
        nearestAwareness = goalFacingAwareness(ob);
      }
    }
    // 脅威DFなし → 0（評価対象外、ドライブすべき）
    if (nearestAwareness < 0) return 0;
    // 脅威DFあり → ゴールから逆向きならシュートチャンス
    return 1 - nearestAwareness;
  },
};

/** 将来の点差ボーナス枠 */
export const shootSituational: ScoreFactor = {
  id: 'shoot:situational',
  action: 'shoot',
  weight: 0.0,
  evaluate(): number {
    return 0;
  },
};

// =========================================================================
// Pass factors
// =========================================================================

/** パスレーンの開放度: ブロッカー数 + レシーバー到達可能性 */
export const passLaneOpen: ScoreFactor = {
  id: 'pass:laneOpen',
  action: 'pass',
  weight: 5.0,
  evaluate(ctx: ActionScorerContext): number {
    if (!ctx.preFire) return 0;
    const blockers = ctx.preFire.obBlocks.filter(b => b).length;
    const reachBonus = ctx.preFire.targetCanReach ? 0.2 : -1.0;
    return clamp((1 - blockers / 5) + reachBonus, 0, 1);
  },
};

/** レシーバーの intent スコアが高いほどパス価値が上がる */
export const passReceiverIntent: ScoreFactor = {
  id: 'pass:receiverIntent',
  action: 'pass',
  weight: 3.0,
  evaluate(ctx: ActionScorerContext): number {
    const intent = ctx.offBallIntents[ctx.bestPassTargetIdx];
    if (!intent) return 0;
    return clamp(intent.score / 13, 0, 1);
  },
};

/** パス距離が短いほどスコアが高い */
export const passDistance: ScoreFactor = {
  id: 'pass:distance',
  action: 'pass',
  weight: 1.0,
  evaluate(ctx: ActionScorerContext): number {
    if (ctx.receiverEntityIndices.length === 0) return 0;
    const receiverEntityIdx = ctx.receiverEntityIndices[ctx.bestPassTargetIdx];
    const receiver = ctx.allOffense[receiverEntityIdx];
    if (!receiver) return 0;
    const d = dist2d(ctx.mover.x, ctx.mover.z, receiver.x, receiver.z);
    return 1 - clamp(d / 15, 0, 1);
  },
};

/** レシーバーのフィールド位置価値（ゴール近接 + センター + 孤立度） */
export const passReceiverPosition: ScoreFactor = {
  id: 'pass:receiverPosition',
  action: 'pass',
  weight: 2.0,
  evaluate(ctx: ActionScorerContext): number {
    if (ctx.receiverEntityIndices.length === 0) return 0;
    const receiverEntityIdx = ctx.receiverEntityIndices[ctx.bestPassTargetIdx];
    const receiver = ctx.allOffense[receiverEntityIdx];
    if (!receiver) return 0;
    const others = ctx.obstacles.map(o => ({ x: o.x, z: o.z }));
    return scoreFieldPosition(receiver.x, receiver.z, others).total;
  },
};

/**
 * ポジション優位性: レシーバーが保持者よりゴールに近いほど高スコア。
 *
 * 0.5 = 同距離（中立）、1.0 = レシーバーが大幅に近い、0.0 = 保持者の方が近い。
 * 自分がゴール前にいるのに遠くの味方にパスする行為を抑制する。
 */
export const passPositionAdvantage: ScoreFactor = {
  id: 'pass:positionAdvantage',
  action: 'pass',
  weight: 3.0,
  evaluate(ctx: ActionScorerContext): number {
    if (ctx.receiverEntityIndices.length === 0) return 0;
    const receiverEntityIdx = ctx.receiverEntityIndices[ctx.bestPassTargetIdx];
    const receiver = ctx.allOffense[receiverEntityIdx];
    if (!receiver) return 0;
    const passerGoalDist = dist2d(ctx.mover.x, ctx.mover.z, getGoalX(), getGoalZ());
    const receiverGoalDist = dist2d(receiver.x, receiver.z, getGoalX(), getGoalZ());
    // positive = receiver is closer to goal than passer
    const advantage = (passerGoalDist - receiverGoalDist) / MAX_SHOOT_RANGE;
    return clamp(0.5 + advantage, 0, 1);
  },
};

/** レシーバー付近のDFがゴールから逆を向いているほどパスが通りやすい */
export const passDefenderAwareness: ScoreFactor = {
  id: 'pass:defenderAwareness',
  action: 'pass',
  weight: 2.0,
  evaluate(ctx: ActionScorerContext): number {
    if (ctx.receiverEntityIndices.length === 0) return 0;
    const receiverEntityIdx = ctx.receiverEntityIndices[ctx.bestPassTargetIdx];
    const receiver = ctx.allOffense[receiverEntityIdx];
    if (!receiver) return 0;
    // レシーバー最寄りDFの awareness
    let minDist = Infinity;
    let nearestAwareness = 1;
    for (const ob of ctx.obstacles) {
      const d = dist2d(receiver.x, receiver.z, ob.x, ob.z);
      if (d < minDist) {
        minDist = d;
        nearestAwareness = goalFacingAwareness(ob);
      }
    }
    // DF がゴールから逆向き → awareness 低 → パス成功しやすい
    return 1 - nearestAwareness;
  },
};

/** 将来枠 */
export const passSituational: ScoreFactor = {
  id: 'pass:situational',
  action: 'pass',
  weight: 0.0,
  evaluate(): number {
    return 0;
  },
};

// =========================================================================
// Hold factors
// =========================================================================

/** DF が近いほどホールド（ボール保護）の安全性スコアが上がる */
export const holdSafety: ScoreFactor = {
  id: 'hold:safety',
  action: 'hold',
  weight: 2.0,
  evaluate(ctx: ActionScorerContext): number {
    return 1 - clamp(nearestDefenderDist(ctx) / 5, 0, 1);
  },
};

/**
 * ドライブ機会: ゴールへの直線経路上にDFがいなければドリブルで前進する価値がある。
 *
 * 保持者→ゴールの直線上に障害物がどれだけ近いかを評価。
 * 幅 2m のドライブレーンが空いていれば 1.0。
 * すでにゴール付近（2m以内）にいる場合は 0（シュートすべき）。
 */
export const holdDriveOpportunity: ScoreFactor = {
  id: 'hold:driveOpportunity',
  action: 'hold',
  weight: 4.0,
  evaluate(ctx: ActionScorerContext): number {
    const toGoalX = getGoalX() - ctx.mover.x;
    const toGoalZ = getGoalZ() - ctx.mover.z;
    const toGoalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ);
    if (toGoalDist < 2.0) return 0; // ゴール付近 → シュートすべき

    const dirX = toGoalX / toGoalDist;
    const dirZ = toGoalZ / toGoalDist;

    // ドライブ経路上の最も近いDFまでの垂直距離を計算
    let minPerpDist = Infinity;
    for (const ob of ctx.obstacles) {
      const dx = ob.x - ctx.mover.x;
      const dz = ob.z - ctx.mover.z;
      // DF が保持者とゴールの間にいるかチェック（射影が正かつゴール距離以内）
      const proj = dx * dirX + dz * dirZ;
      if (proj <= 0 || proj > toGoalDist) continue;
      // ドライブラインからの垂直距離
      const perpDist = Math.abs(-dirZ * dx + dirX * dz);
      if (perpDist < minPerpDist) minPerpDist = perpDist;
    }

    // 幅 2m のレーンが空いていれば 1.0
    return clamp(minPerpDist / 2.0, 0, 1);
  },
};

/** 最寄りDFがゴールから逆を向いているほどドリブル/ホールドしやすい */
export const holdDefenderAwareness: ScoreFactor = {
  id: 'hold:defenderAwareness',
  action: 'hold',
  weight: 2.0,
  evaluate(ctx: ActionScorerContext): number {
    let minDist = Infinity;
    let nearestAwareness = 1;
    for (const ob of ctx.obstacles) {
      const d = dist2d(ctx.mover.x, ctx.mover.z, ob.x, ob.z);
      if (d < minDist) {
        minDist = d;
        nearestAwareness = goalFacingAwareness(ob);
      }
    }
    // DF がゴールから逆向き → awareness 低 → ドリブル突破しやすい
    return 1 - nearestAwareness;
  },
};

/** 将来枠 */
export const holdSituational: ScoreFactor = {
  id: 'hold:situational',
  action: 'hold',
  weight: 0.0,
  evaluate(): number {
    return 0;
  },
};

// =========================================================================
// Default factor collection
// =========================================================================

export const DEFAULT_FACTORS: ScoreFactor[] = [
  shootZone,
  shootDefenderProximity,
  shootDefenderAwareness,
  shootSituational,
  passLaneOpen,
  passReceiverIntent,
  passDistance,
  passReceiverPosition,
  passPositionAdvantage,
  passDefenderAwareness,
  passSituational,
  holdSafety,
  holdDriveOpportunity,
  holdDefenderAwareness,
  holdSituational,
];
