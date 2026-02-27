/**
 * ActionScorer - ScoreFactor レジストリ + コンテキスト構築 + 評価
 *
 * shoot/pass/hold を拡張可能なスコア要素で評価し最適行動を選択する。
 */

import type {
  ScoreFactor,
  ScoreableAction,
  ActionScorerContext,
  ActionScorerResult,
  ActionScoreDetail,
  OffBallIntentEntry,
} from "../Types/ActionScorerTypes";
import type {
  SimState,
  SimMover,
  SimPreFireInfo,
  BallFireContext,
} from "../Types/TrackingSimTypes";
import { DEFAULT_FACTORS } from "./ActionScorerFactors";
import { evaluatePreFire } from "./PassEvaluation";
import { ROLE_ASSIGNMENTS } from "./OffenseRoleAssignment";
import { OB_CONFIGS } from "./ObstacleRoleAssignment";

// OB_INT_SPEEDS derived locally to avoid cross-module dependency
const OB_INT_SPEEDS = OB_CONFIGS.map(cfg => cfg.interceptSpeed);

// =========================================================================
// Registry
// =========================================================================

const factorRegistry: ScoreFactor[] = [];

export function registerFactor(factor: ScoreFactor): void {
  factorRegistry.push(factor);
}

export function unregisterFactor(id: string): void {
  const idx = factorRegistry.findIndex(f => f.id === id);
  if (idx >= 0) factorRegistry.splice(idx, 1);
}

function registerDefaults(): void {
  for (const f of DEFAULT_FACTORS) {
    if (!factorRegistry.some(existing => existing.id === f.id)) {
      factorRegistry.push(f);
    }
  }
}

// Initialize defaults on module load
registerDefaults();

// =========================================================================
// Context builders
// =========================================================================

/** IntentProvider interface to avoid circular dependency with OffBallIntentManager */
interface IntentProvider {
  getIntent(entityIdx: number): OffBallIntentEntry | null;
}

/** 実際のオンボール用（precomputed な evaluatePreFire 結果を受け取る） */
export function buildOnBallContext(
  state: SimState,
  preFire: SimPreFireInfo | null,
  bestPassTargetIdx: number,
  receiverEntityIndices: number[],
  receiverRoles: string[],
  fireCtx: BallFireContext,
  intentProvider: IntentProvider,
): ActionScorerContext {
  const allOffense = [state.launcher, ...state.targets];
  const offBallIntents = receiverEntityIndices.map(ei => intentProvider.getIntent(ei));

  return {
    entityIdx: state.onBallEntityIdx,
    mover: allOffense[state.onBallEntityIdx],
    allOffense,
    obstacles: state.obstacles,
    obIntSpeeds: OB_INT_SPEEDS,
    actualOnBallEntityIdx: state.onBallEntityIdx,
    receiverRoles,
    preFire,
    fireCtx,
    bestPassTargetIdx,
    receiverEntityIndices,
    anyInTransit: state.offenseInTransit.some(t => t),
    offBallIntents,
  };
}

/** オフボール仮想用（内部で evaluatePreFire を呼ぶ） */
export function buildHypotheticalContext(
  state: SimState,
  hypotheticalEntityIdx: number,
): ActionScorerContext {
  const allOffense = [state.launcher, ...state.targets];
  const allRoles = [
    ROLE_ASSIGNMENTS.launcher.role,
    ...ROLE_ASSIGNMENTS.targets.map(t => t.role),
  ];
  const mover = allOffense[hypotheticalEntityIdx];

  // Build receivers (all offense except hypothetical entity)
  const receivers: SimMover[] = [];
  const receiverEntityIndices: number[] = [];
  const receiverRoles: string[] = [];
  for (let i = 0; i < allOffense.length; i++) {
    if (i !== hypotheticalEntityIdx) {
      receivers.push(allOffense[i]);
      receiverEntityIndices.push(i);
      receiverRoles.push(allRoles[i]);
    }
  }

  const fireCtx: BallFireContext = {
    launcher: mover,
    targets: receivers,
    obstacles: state.obstacles,
    obIntSpeeds: OB_INT_SPEEDS,
  };

  const evalResult = evaluatePreFire(fireCtx, receiverRoles);

  return {
    entityIdx: hypotheticalEntityIdx,
    mover,
    allOffense,
    obstacles: state.obstacles,
    obIntSpeeds: OB_INT_SPEEDS,
    actualOnBallEntityIdx: state.onBallEntityIdx,
    receiverRoles,
    preFire: evalResult.preFire,
    fireCtx,
    bestPassTargetIdx: evalResult.selectedTargetIdx,
    receiverEntityIndices,
    anyInTransit: false,
    offBallIntents: receivers.map(() => null),
  };
}

// =========================================================================
// Evaluation
// =========================================================================

export function evaluateActions(ctx: ActionScorerContext): ActionScorerResult {
  const actions: ScoreableAction[] = ['shoot', 'pass', 'hold'];
  const scores: ActionScoreDetail[] = [];

  for (const action of actions) {
    const factors = factorRegistry.filter(f => f.action === action);
    const factorScores = factors.map(f => {
      const raw = f.evaluate(ctx);
      return { factorId: f.id, raw, weighted: raw * f.weight };
    });
    const totalScore = factorScores.reduce((sum, fs) => sum + fs.weighted, 0);
    scores.push({ action, totalScore, factorScores });
  }

  scores.sort((a, b) => b.totalScore - a.totalScore);

  return {
    bestAction: scores[0].action,
    scores,
    bestPassReceiverEntityIdx: ctx.receiverEntityIndices[ctx.bestPassTargetIdx] ?? 0,
    preFire: ctx.preFire,
  };
}
