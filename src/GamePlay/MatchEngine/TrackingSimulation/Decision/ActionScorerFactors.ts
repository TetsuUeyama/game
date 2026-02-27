/**
 * ActionScorerFactors - 初期スコア要素群
 *
 * 各要素は evaluate() で 0〜1 を返し、weight で重み付けされる。
 * 新要素追加はこのファイルに関数を追加 + DEFAULT_FACTORS に追加するだけ。
 */

import type { ScoreFactor, ActionScorerContext } from "../Types/ActionScorerTypes";
import { canShoot } from "../Action/ShootAction";
import { dist2d } from "../Movement/MovementCore";
import { GOAL_RIM_X, GOAL_RIM_Z, MAX_SHOOT_RANGE } from "../Config/ShootConfig";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function nearestDefenderDist(ctx: ActionScorerContext): number {
  let minDist = Infinity;
  for (const ob of ctx.obstacles) {
    const d = dist2d(ctx.mover.x, ctx.mover.z, ob.x, ob.z);
    if (d < minDist) minDist = d;
  }
  return minDist;
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
    const d = dist2d(ctx.mover.x, ctx.mover.z, GOAL_RIM_X, GOAL_RIM_Z);
    return clamp(1.0 - d * 0.1, 0.15, 1.0);
  },
};

/** DF が遠いほどシュートしやすい（シュートレンジ外なら 0） */
export const shootDefenderProximity: ScoreFactor = {
  id: 'shoot:defenderProximity',
  action: 'shoot',
  weight: 3.0,
  evaluate(ctx: ActionScorerContext): number {
    if (!canShoot(ctx.mover)) return 0;
    return clamp(nearestDefenderDist(ctx) / 3.0, 0, 1);
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

/** レシーバーがゴールに近いほどパスの価値が上がる */
export const passReceiverPosition: ScoreFactor = {
  id: 'pass:receiverPosition',
  action: 'pass',
  weight: 2.0,
  evaluate(ctx: ActionScorerContext): number {
    if (ctx.receiverEntityIndices.length === 0) return 0;
    const receiverEntityIdx = ctx.receiverEntityIndices[ctx.bestPassTargetIdx];
    const receiver = ctx.allOffense[receiverEntityIdx];
    if (!receiver) return 0;
    const goalDist = dist2d(receiver.x, receiver.z, GOAL_RIM_X, GOAL_RIM_Z);
    return clamp(1 - goalDist / MAX_SHOOT_RANGE, 0, 1);
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
    const passerGoalDist = dist2d(ctx.mover.x, ctx.mover.z, GOAL_RIM_X, GOAL_RIM_Z);
    const receiverGoalDist = dist2d(receiver.x, receiver.z, GOAL_RIM_X, GOAL_RIM_Z);
    // positive = receiver is closer to goal than passer
    const advantage = (passerGoalDist - receiverGoalDist) / MAX_SHOOT_RANGE;
    return clamp(0.5 + advantage, 0, 1);
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
    const toGoalX = GOAL_RIM_X - ctx.mover.x;
    const toGoalZ = GOAL_RIM_Z - ctx.mover.z;
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
  shootSituational,
  passLaneOpen,
  passReceiverIntent,
  passDistance,
  passReceiverPosition,
  passPositionAdvantage,
  passSituational,
  holdSafety,
  holdDriveOpportunity,
  holdSituational,
];
