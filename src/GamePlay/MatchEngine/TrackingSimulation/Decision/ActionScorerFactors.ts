/**
 * ActionScorerFactors - 初期スコア要素群
 *
 * 各要素は evaluate() で 0〜1 を返し、weight で重み付けされる。
 * 新要素追加はこのファイルに関数を追加 + ActionScorer.ts で registerFactor() するだけ。
 */

import type { ScoreFactor, ActionScorerContext } from "../Types/ActionScorerTypes";
import { canShoot } from "../Action/ShootAction";
import { dist2d } from "../Movement/MovementCore";

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

/** ペイントエリア内にいればシュート可能 → 1.0 */
export const shootZone: ScoreFactor = {
  id: 'shoot:zone',
  action: 'shoot',
  weight: 10.0,
  evaluate(ctx: ActionScorerContext): number {
    return canShoot(ctx.mover) ? 1.0 : 0.0;
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
  weight: 8.0,
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
  passSituational,
  holdSafety,
  holdSituational,
];
