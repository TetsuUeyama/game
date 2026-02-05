/**
 * インターセプト分析クラス
 * ディフェンダーのパスインターセプト確率を計算する
 *
 * @deprecated このクラスは非推奨です。代わりに RiskAssessmentSystem を使用してください。
 * - assessTrajectoryRisk() - TrajectoryResult を使用した詳細分析
 * - selectSafestTrajectory() - 最も安全な軌道を選択
 *
 * RiskAssessmentSystem は DefenderStateUtils を使用し、重心状態を考慮した
 * より正確なリスク判定を提供します。
 */

import { Character } from "../../entities/Character";
import {
  InterceptionRiskLevel,
  INTERCEPTION_CONFIG,
  INTERCEPTION_RISK_COLORS,
  getInterceptionRiskLevel,
  PassType,
} from "../../config/PassTrajectoryConfig";
import {
  TrajectoryResult,
  Vec3,
} from "../../physics/PassTrajectoryCalculator";

/**
 * インターセプトリスク情報
 */
export interface InterceptionRisk {
  /** インターセプト確率（0-1） */
  probability: number;
  /** 最も近いディフェンダー */
  closestDefender: Character;
  /** 軌道上の最も近い点 */
  closestPointOnTrajectory: Vec3;
  /** インターセプトまでの時間（秒） */
  timeToIntercept: number;
  /** 危険度レベル */
  riskLevel: InterceptionRiskLevel;
  /** 危険度の色 */
  riskColor: { r: number; g: number; b: number };
}

/**
 * 全ディフェンダーのリスク計算結果
 */
export interface TrajectoryRiskAnalysis {
  /** 最大リスク */
  maxRisk: InterceptionRisk | null;
  /** 各ディフェンダーのリスク */
  defenderRisks: InterceptionRisk[];
  /** 総合危険度レベル */
  overallRiskLevel: InterceptionRiskLevel;
  /** 総合危険度の色 */
  overallRiskColor: { r: number; g: number; b: number };
}

/**
 * インターセプト分析クラス
 * @deprecated 代わりに RiskAssessmentSystem を使用してください
 */
export class InterceptionAnalyzer {
  constructor() {
    // 将来の軌道計算拡張用にPassTrajectoryCalculatorを使用予定
  }

  /**
   * 単一ディフェンダーのインターセプトリスクを計算
   * @deprecated 代わりに RiskAssessmentSystem.assessTrajectoryRisk() を使用してください
   *
   * アルゴリズム:
   * 1. ディフェンダーの反応時間 = BASE_REACTION_TIME * (100 / quickness)
   * 2. 到達時間 = 反応時間 + (距離 - インターセプト半径) / 速度
   * 3. タイミングマージン = ディフェンダー到達時間 - ボール到達時間
   *    - 負: ディフェンダーが先に到達（危険）
   *    - 正: ボールが先に到達（安全）
   * 4. マージンに基づき確率を算出
   */
  public calculateSingleDefenderRisk(
    trajectory: TrajectoryResult,
    defender: Character,
    passerTeam: 'ally' | 'enemy'
  ): InterceptionRisk | null {
    // 同チームはスキップ
    if (defender.team === passerTeam) {
      return null;
    }

    const defenderPos = defender.getPosition();
    const defenderVec: Vec3 = { x: defenderPos.x, y: defenderPos.y, z: defenderPos.z };

    // ディフェンダーのステータスを取得
    const playerData = defender.playerData;
    const quickness = playerData?.stats?.quickness ?? 50;
    const speed = playerData?.stats?.speed ?? 50;

    // 反応時間を計算
    const reactionTime = INTERCEPTION_CONFIG.BASE_REACTION_TIME * (100 / quickness);

    // ディフェンダーの移動速度を計算
    const defenderSpeed = INTERCEPTION_CONFIG.BASE_DEFENDER_SPEED * (speed / 50);

    // バウンスパスの場合、バウンド前はインターセプト不可
    // バウンドポイントの時間を計算
    let bounceTime = 0;
    if (trajectory.passType === PassType.BOUNCE && trajectory.bouncePoint) {
      // バウンドポイントまでの時間を推定（軌道の半分くらい）
      bounceTime = trajectory.flightTime * 0.5;
    }

    // 軌道上の各点に対してインターセプト可能性をチェック
    let closestPointOnTrajectory: Vec3 | null = null;
    let minTimeDiff = Infinity;
    let closestPointTime = 0;
    let closestDistance = Infinity;

    for (const point of trajectory.points) {
      // バウンスパスの場合、バウンド前の点はスキップ（インターセプト不可）
      if (trajectory.passType === PassType.BOUNCE && point.time < bounceTime) {
        continue;
      }

      // ディフェンダーからこの点までの距離
      const dx = point.position.x - defenderVec.x;
      const dy = point.position.y - defenderVec.y;
      const dz = point.position.z - defenderVec.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // ディフェンダーがこの点に到達するまでの時間
      const effectiveDistance = Math.max(0, distance - INTERCEPTION_CONFIG.INTERCEPT_RADIUS);
      const timeToReachPoint = reactionTime + (effectiveDistance / defenderSpeed);

      // ボールがこの点に到達する時間
      const ballArrivalTime = point.time;

      // タイミング差（ディフェンダー到達時間 - ボール到達時間）
      // 正 = ボールが先に到達（安全）、負 = ディフェンダーが先に到達（危険）
      const timeDiff = timeToReachPoint - ballArrivalTime;

      // ディフェンダーがボールより先に到達できる（またはほぼ同時）点を探す
      if (Math.abs(timeDiff) < Math.abs(minTimeDiff) || distance < closestDistance) {
        minTimeDiff = timeDiff;
        closestPointOnTrajectory = point.position;
        closestPointTime = point.time;
        closestDistance = distance;
      }
    }

    if (!closestPointOnTrajectory) {
      return null;
    }

    // インターセプト確率を計算
    // timeDiff = ディフェンダー到達時間 - ボール到達時間
    // timeDiff < 0: ディフェンダーが先に到達（危険）
    // timeDiff > 0: ボールが先に到達（安全）
    let probability: number;

    if (minTimeDiff <= -0.3) {
      // ディフェンダーが0.3秒以上早く到達 → 90-100%（非常に危険）
      probability = 0.9 + Math.min(0.1, Math.abs(minTimeDiff) * 0.1);
    } else if (minTimeDiff <= 0) {
      // ディフェンダーが0-0.3秒早く到達 → 60-90%（危険）
      probability = 0.6 + Math.abs(minTimeDiff) * 1.0;
    } else if (minTimeDiff <= 0.2) {
      // ボールが0-0.2秒早く到達 → 30-60%（やや危険）
      probability = 0.3 + (0.2 - minTimeDiff) * 1.5;
    } else if (minTimeDiff <= 0.5) {
      // ボールが0.2-0.5秒早く到達 → 10-30%（やや安全）
      probability = 0.1 + (0.5 - minTimeDiff) * 0.67;
    } else {
      // ボールが0.5秒以上早く到達 → 0-10%（安全）
      probability = Math.max(0, 0.1 - (minTimeDiff - 0.5) * 0.1);
    }

    // 距離による補正（近いほど確率上昇）
    if (closestDistance < 2.0) {
      probability = Math.min(1.0, probability * 1.2);
    } else if (closestDistance > 5.0) {
      probability *= 0.8;
    }

    probability = Math.max(0, Math.min(1, probability));

    const riskLevel = getInterceptionRiskLevel(probability);
    const riskColor = INTERCEPTION_RISK_COLORS[riskLevel];

    return {
      probability,
      closestDefender: defender,
      closestPointOnTrajectory,
      timeToIntercept: closestPointTime,
      riskLevel,
      riskColor,
    };
  }

  /**
   * 全ディフェンダーのインターセプトリスクを分析
   * @deprecated 代わりに RiskAssessmentSystem.assessTrajectoryRisk() を使用してください
   */
  public analyzeTrajectoryRisk(
    trajectory: TrajectoryResult,
    allCharacters: Character[],
    passerTeam: 'ally' | 'enemy'
  ): TrajectoryRiskAnalysis {
    const defenderRisks: InterceptionRisk[] = [];
    let maxRisk: InterceptionRisk | null = null;

    // 全キャラクターをチェック
    for (const character of allCharacters) {
      // 同チームはスキップ
      if (character.team === passerTeam) {
        continue;
      }

      const risk = this.calculateSingleDefenderRisk(trajectory, character, passerTeam);
      if (risk) {
        defenderRisks.push(risk);

        // 最大リスクを更新
        if (!maxRisk || risk.probability > maxRisk.probability) {
          maxRisk = risk;
        }
      }
    }

    // 総合危険度を決定
    const maxProbability = maxRisk?.probability ?? 0;
    const overallRiskLevel = getInterceptionRiskLevel(maxProbability);
    const overallRiskColor = INTERCEPTION_RISK_COLORS[overallRiskLevel];

    return {
      maxRisk,
      defenderRisks,
      overallRiskLevel,
      overallRiskColor,
    };
  }

  /**
   * 複数の軌道オプションの中から最も安全なものを選択
   * @deprecated 代わりに RiskAssessmentSystem.selectSafestTrajectory() を使用してください
   */
  public selectSafestOption(
    trajectories: TrajectoryResult[],
    allCharacters: Character[],
    passerTeam: 'ally' | 'enemy'
  ): { trajectory: TrajectoryResult; analysis: TrajectoryRiskAnalysis } | null {
    let safestTrajectory: TrajectoryResult | null = null;
    let safestAnalysis: TrajectoryRiskAnalysis | null = null;
    let lowestRisk = Infinity;

    for (const trajectory of trajectories) {
      const analysis = this.analyzeTrajectoryRisk(trajectory, allCharacters, passerTeam);
      const maxProbability = analysis.maxRisk?.probability ?? 0;

      if (maxProbability < lowestRisk) {
        lowestRisk = maxProbability;
        safestTrajectory = trajectory;
        safestAnalysis = analysis;
      }
    }

    if (safestTrajectory && safestAnalysis) {
      return { trajectory: safestTrajectory, analysis: safestAnalysis };
    }

    return null;
  }
}
