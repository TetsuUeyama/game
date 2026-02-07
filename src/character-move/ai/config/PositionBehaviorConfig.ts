/**
 * ポジション別行動設定
 * OnBallOffenseAIでの行動決定に使用するパラメータを定義
 */

import { PlayerPosition } from "../../config/FormationConfig";

/**
 * ポジション別行動パラメータ
 */
export interface PositionBehaviorParams {
  // === シュート関連 ===
  /** 3ptシュートの積極性 (0-1) - 3ptレンジ内でのシュート確率に影響 */
  threePointAggressiveness: number;
  /** ミッドレンジシュートの積極性 (0-1) */
  midRangeAggressiveness: number;
  /** インサイドシュート（レイアップ/ダンク）の積極性 (0-1) */
  insideAggressiveness: number;

  // === パス関連 ===
  /** パス優先度 (0-1) - 高いほどパスを選択しやすい */
  passPriority: number;
  /** ゴール下へのパス優先度 (0-1) - インサイドプレイヤーへの展開 */
  insidePassPriority: number;

  // === 1on1関連 ===
  /** ドライブ（ドリブル突破）の確率 (0-1) */
  driveProbability: number;
  /** プルアップジャンパー（ドリブルからのシュート）の確率 (0-1) */
  pullUpProbability: number;
  /** フェイントの使用確率 (0-1) */
  feintProbability: number;
  /** ポストアップ（背を向けて押し込み）の確率 (0-1) */
  postUpProbability: number;

  // === 移動・ドリブル関連 ===
  /** ゴールへの直接的なアプローチの積極性 (0-1) */
  directApproachAggressiveness: number;
  /** パスレーン確保のための動きの頻度 (0-1) */
  passLaneMovementFrequency: number;

  // === リスク許容度 ===
  /** シュートを打つ最大許容リスク（ディフェンダーの近さ等） */
  maxShootRiskTolerance: number;
  /** パスを出す最大許容リスク（インターセプト確率） */
  maxPassRiskTolerance: number;
}

/**
 * デフォルトのポジション別行動パラメータ
 */
export const POSITION_BEHAVIOR_DEFAULTS: Record<PlayerPosition, PositionBehaviorParams> = {
  // ポイントガード: パスファースト、ゲームメイキング重視
  PG: {
    threePointAggressiveness: 0.4,
    midRangeAggressiveness: 0.5,
    insideAggressiveness: 0.6,
    passPriority: 0.8,           // パス優先
    insidePassPriority: 0.7,     // インサイドへの展開も意識
    driveProbability: 0.5,
    pullUpProbability: 0.3,
    feintProbability: 0.4,
    postUpProbability: 0.05,     // ほぼポストアップしない
    directApproachAggressiveness: 0.5,
    passLaneMovementFrequency: 0.7,
    maxShootRiskTolerance: 0.4,
    maxPassRiskTolerance: 0.5,
  },

  // シューティングガード: シュート重視、得点力
  SG: {
    threePointAggressiveness: 0.8,  // 3pt積極的
    midRangeAggressiveness: 0.75,
    insideAggressiveness: 0.6,
    passPriority: 0.4,
    insidePassPriority: 0.5,
    driveProbability: 0.4,
    pullUpProbability: 0.6,        // プルアップジャンパー得意
    feintProbability: 0.5,
    postUpProbability: 0.1,
    directApproachAggressiveness: 0.6,
    passLaneMovementFrequency: 0.4,
    maxShootRiskTolerance: 0.6,    // ある程度タフショットも打つ
    maxPassRiskTolerance: 0.4,
  },

  // スモールフォワード: バランス型、オールラウンド
  SF: {
    threePointAggressiveness: 0.5,
    midRangeAggressiveness: 0.6,
    insideAggressiveness: 0.7,
    passPriority: 0.5,
    insidePassPriority: 0.5,
    driveProbability: 0.6,         // ドライブ得意
    pullUpProbability: 0.4,
    feintProbability: 0.5,
    postUpProbability: 0.2,
    directApproachAggressiveness: 0.7,
    passLaneMovementFrequency: 0.5,
    maxShootRiskTolerance: 0.5,
    maxPassRiskTolerance: 0.5,
  },

  // パワーフォワード: インサイド重視、ポストプレー
  PF: {
    threePointAggressiveness: 0.3,
    midRangeAggressiveness: 0.5,
    insideAggressiveness: 0.85,    // インサイド得意
    passPriority: 0.4,
    insidePassPriority: 0.3,       // 自分がインサイドなので外に展開
    driveProbability: 0.4,
    pullUpProbability: 0.2,
    feintProbability: 0.4,
    postUpProbability: 0.5,        // ポストアップ得意
    directApproachAggressiveness: 0.7,
    passLaneMovementFrequency: 0.3,
    maxShootRiskTolerance: 0.7,    // ゴール下でのコンタクト許容
    maxPassRiskTolerance: 0.5,
  },

  // センター: ゴール下特化、ポストプレー最重視
  C: {
    threePointAggressiveness: 0.1,  // 3ptほぼ打たない
    midRangeAggressiveness: 0.2,
    insideAggressiveness: 0.95,     // インサイド最優先
    passPriority: 0.3,
    insidePassPriority: 0.2,        // 自分がゴール下
    driveProbability: 0.2,
    pullUpProbability: 0.1,
    feintProbability: 0.3,
    postUpProbability: 0.7,         // ポストアップ最重視
    directApproachAggressiveness: 0.8,
    passLaneMovementFrequency: 0.2,
    maxShootRiskTolerance: 0.8,     // タフショット許容
    maxPassRiskTolerance: 0.6,
  },
};

/**
 * ポジションに応じた行動パラメータを取得
 * @param position プレイヤーのポジション
 * @returns 行動パラメータ（ポジションが不明な場合はSFのパラメータを返す）
 */
export function getPositionBehavior(position: PlayerPosition | undefined): PositionBehaviorParams {
  if (!position || !(position in POSITION_BEHAVIOR_DEFAULTS)) {
    // デフォルトはSF（バランス型）
    return POSITION_BEHAVIOR_DEFAULTS.SF;
  }
  return POSITION_BEHAVIOR_DEFAULTS[position];
}

/**
 * シュートタイプに応じた積極性を取得
 * @param params 行動パラメータ
 * @param shootType シュートタイプ
 * @returns 積極性 (0-1)
 */
export function getShootAggressiveness(
  params: PositionBehaviorParams,
  shootType: "3pt" | "midrange" | "layup" | "dunk" | "out_of_range"
): number {
  switch (shootType) {
    case "3pt":
      return params.threePointAggressiveness;
    case "midrange":
      return params.midRangeAggressiveness;
    case "layup":
    case "dunk":
      return params.insideAggressiveness;
    case "out_of_range":
      return 0; // レンジ外はシュートしない
    default:
      return 0.5;
  }
}

/**
 * 1on1時のアクション選択確率を正規化して取得
 * @param params 行動パラメータ
 * @returns 各アクションの確率 (合計1.0)
 */
export function get1on1ActionProbabilities(params: PositionBehaviorParams): {
  drive: number;
  pullUp: number;
  feint: number;
  postUp: number;
  wait: number;
} {
  const total =
    params.driveProbability +
    params.pullUpProbability +
    params.feintProbability +
    params.postUpProbability;

  // 合計が0の場合は均等に
  if (total === 0) {
    return { drive: 0.2, pullUp: 0.2, feint: 0.2, postUp: 0.2, wait: 0.2 };
  }

  // 10%は様子見（wait）として確保
  const actionScale = 0.9 / total;

  return {
    drive: params.driveProbability * actionScale,
    pullUp: params.pullUpProbability * actionScale,
    feint: params.feintProbability * actionScale,
    postUp: params.postUpProbability * actionScale,
    wait: 0.1,
  };
}
