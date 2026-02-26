/**
 * ActionScorerTypes - ActionScoring + OffBallIntent システムの型定義
 */

import type { SimMover, SimPreFireInfo, BallFireContext } from "./TrackingSimTypes";

// --- スコア対象行動 ---
export type ScoreableAction = 'shoot' | 'pass' | 'hold';

// --- スコア評価コンテキスト ---
export interface ActionScorerContext {
  entityIdx: number;             // 評価対象(仮想ボール保持者)
  mover: SimMover;
  allOffense: SimMover[];        // [launcher, ...targets]
  obstacles: SimMover[];
  obIntSpeeds: number[];
  actualOnBallEntityIdx: number; // 実際の保持者
  receiverRoles: string[];
  preFire: SimPreFireInfo | null;
  fireCtx: BallFireContext | null;
  bestPassTargetIdx: number;     // receiver 配列内 index
  receiverEntityIndices: number[];
  anyInTransit: boolean;
  offBallIntents: (OffBallIntentEntry | null)[]; // レシーバーの intent 参照用
}

// --- ScoreFactor (拡張ポイント) ---
export interface ScoreFactor {
  readonly id: string;
  readonly action: ScoreableAction;
  readonly weight: number;
  /** 0.0〜1.0 の正規化スコアを返す */
  evaluate(ctx: ActionScorerContext): number;
}

// --- 結果 ---
export interface ActionScoreDetail {
  action: ScoreableAction;
  totalScore: number;
  factorScores: { factorId: string; raw: number; weighted: number }[];
}

export interface ActionScorerResult {
  bestAction: ScoreableAction;
  scores: ActionScoreDetail[];
  bestPassReceiverEntityIdx: number;
  preFire: SimPreFireInfo | null;
}

// --- OffBallIntent ---
export interface OffBallIntentEntry {
  entityIdx: number;
  intendedAction: ScoreableAction;
  score: number;
  passTargetEntityIdx: number | null;
  age: number;
  evalX: number;
  evalZ: number;
}

// --- ThreatAssessment ---
export interface ThreatEntry {
  entityIdx: number;
  threat: number;            // 0-1
  positionScore: number;
  opennessScore: number;
  facingScore: number;
}

export interface ThreatAssessmentResult {
  entries: ThreatEntry[];
  mostThreatening: number;
}
