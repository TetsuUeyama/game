import { PlayerPosition } from "@/GamePlay/GameSystem/CharacterMove/Config/FormationConfig";

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
const POSITION_BEHAVIOR_DEFAULTS: Record<PlayerPosition, PositionBehaviorParams> = {
  // ポイントガード: パスファースト、ゲームメイキング重視
  PG: {
    threePointAggressiveness: 0.4,
    midRangeAggressiveness: 0.5,
    insideAggressiveness: 0.6,
    passPriority: 0.8,
    insidePassPriority: 0.7,
    driveProbability: 0.5,
    pullUpProbability: 0.3,
    feintProbability: 0.4,
    postUpProbability: 0.05,
    directApproachAggressiveness: 0.5,
    passLaneMovementFrequency: 0.7,
    maxShootRiskTolerance: 0.4,
    maxPassRiskTolerance: 0.5,
  },
  // シューティングガード: シュート重視、得点力
  SG: {
    threePointAggressiveness: 0.8,
    midRangeAggressiveness: 0.75,
    insideAggressiveness: 0.6,
    passPriority: 0.4,
    insidePassPriority: 0.5,
    driveProbability: 0.4,
    pullUpProbability: 0.6,
    feintProbability: 0.5,
    postUpProbability: 0.1,
    directApproachAggressiveness: 0.6,
    passLaneMovementFrequency: 0.4,
    maxShootRiskTolerance: 0.6,
    maxPassRiskTolerance: 0.4,
  },
  // スモールフォワード: バランス型、オールラウンド
  SF: {
    threePointAggressiveness: 0.5,
    midRangeAggressiveness: 0.6,
    insideAggressiveness: 0.7,
    passPriority: 0.5,
    insidePassPriority: 0.5,
    driveProbability: 0.6,
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
    insideAggressiveness: 0.85,
    passPriority: 0.4,
    insidePassPriority: 0.3,
    driveProbability: 0.4,
    pullUpProbability: 0.2,
    feintProbability: 0.4,
    postUpProbability: 0.5,
    directApproachAggressiveness: 0.7,
    passLaneMovementFrequency: 0.3,
    maxShootRiskTolerance: 0.7,
    maxPassRiskTolerance: 0.5,
  },
  // センター: ゴール下特化、ポストプレー最重視
  C: {
    threePointAggressiveness: 0.1,
    midRangeAggressiveness: 0.2,
    insideAggressiveness: 0.95,
    passPriority: 0.3,
    insidePassPriority: 0.2,
    driveProbability: 0.2,
    pullUpProbability: 0.1,
    feintProbability: 0.3,
    postUpProbability: 0.7,
    directApproachAggressiveness: 0.8,
    passLaneMovementFrequency: 0.2,
    maxShootRiskTolerance: 0.8,
    maxPassRiskTolerance: 0.6,
  },
};

/**
 * ポジションに対応する行動パラメータを取得
 * 未設定の場合はSF（バランス型）をデフォルトとして返す
 */
export function getPositionBehavior(position: PlayerPosition | undefined): PositionBehaviorParams {
  if (!position || !(position in POSITION_BEHAVIOR_DEFAULTS)) {
    return POSITION_BEHAVIOR_DEFAULTS.SF;
  }
  return POSITION_BEHAVIOR_DEFAULTS[position];
}

/**
 * シュートタイプに対応する積極性パラメータを取得
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
      return 0;
    default:
      return 0.5;
  }
}

/**
 * 1on1時のアクション確率を取得
 * 各確率の合計を0.9に正規化し、残り0.1を様子見に割り当て
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

  if (total === 0) {
    return { drive: 0.2, pullUp: 0.2, feint: 0.2, postUp: 0.2, wait: 0.2 };
  }

  const actionScale = 0.9 / total;

  return {
    drive: params.driveProbability * actionScale,
    pullUp: params.pullUpProbability * actionScale,
    feint: params.feintProbability * actionScale,
    postUp: params.postUpProbability * actionScale,
    wait: 0.1,
  };
}
