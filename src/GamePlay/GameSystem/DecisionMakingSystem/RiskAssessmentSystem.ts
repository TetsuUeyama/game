import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { DefenderStateUtils } from "@/GamePlay/GameSystem/DecisionMakingSystem/DefenderStateUtils";
import { RISK_ASSESSMENT_CONFIG } from "@/GamePlay/GameSystem/DecisionMakingSystem/RiskAssessmentConfig";
import {
  PassTrajectoryCalculator,
  TrajectoryResult,
  Vec3,
} from "@/GamePlay/Object/Physics/Trajectory/PassTrajectoryCalculator";
import {
  InterceptionRiskLevel,
  INTERCEPTION_RISK_COLORS,
  getInterceptionRiskLevel,
  PassType,
  PASS_TYPE_CONFIGS,
} from "@/GamePlay/GameSystem/TargetTrackingAccuracySystem/PassTrajectoryConfig";
import { getTeammates } from "@/GamePlay/GameSystem/Utils/TeamUtils";
import { getDistance2DSimple } from "@/GamePlay/Object/Physics/Spatial/SpatialUtils";

/**
 * リスクレベル
 */
export enum RiskLevel {
  SAFE = "SAFE",           // 0-30%: 安全
  CAUTION = "CAUTION",     // 30-60%: 注意
  DANGER = "DANGER",       // 60-80%: 危険
  HIGH_DANGER = "HIGH_DANGER", // 80-100%: 非常に危険
}

/**
 * リスク評価結果
 */
export interface RiskAssessment {
  /** リスク確率 (0.0-1.0) */
  probability: number;
  /** リスクレベル */
  riskLevel: RiskLevel;
  /** 最も危険なディフェンダー */
  primaryThreat: Character | null;
  /** ブロック/インターセプト可能位置 */
  threatPoint: Vector3 | null;
  /** 推奨アクション */
  recommendation: 'EXECUTE' | 'WAIT' | 'ABORT';
}

/**
 * パスリスク詳細
 */
export interface PassRiskDetail extends RiskAssessment {
  /** パスタイプ */
  passType: 'chest' | 'bounce' | 'overhead';
  /** 軌道上の危険ポイント */
  dangerPoints: { position: Vector3; defender: Character; arrivalTimeDiff: number }[];
}

/**
 * シュートリスク詳細
 */
export interface ShootRiskDetail extends RiskAssessment {
  /** シュートタイプ */
  shootType: '3pt' | 'midrange' | 'layup';
  /** ブロック可能なディフェンダーリスト */
  blockers: { defender: Character; blockProbability: number; canJump: boolean }[];
}

/**
 * 軌道ベースのインターセプトリスク（InterceptionAnalyzer互換）
 */
export interface TrajectoryInterceptionRisk {
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
 * 軌道リスク分析結果（InterceptionAnalyzer互換）
 */
export interface TrajectoryRiskAnalysisResult {
  /** 最大リスク */
  maxRisk: TrajectoryInterceptionRisk | null;
  /** 各ディフェンダーのリスク */
  defenderRisks: TrajectoryInterceptionRisk[];
  /** 総合危険度レベル */
  overallRiskLevel: InterceptionRiskLevel;
  /** 総合危険度の色 */
  overallRiskColor: { r: number; g: number; b: number };
}

/**
 * Vec3 を Vector3 に変換
 */
function vec3ToVector3(v: Vec3): Vector3 {
  return new Vector3(v.x, v.y, v.z);
}

/**
 * リスク判定システム
 */
export class RiskAssessmentSystem {
  private ball: Ball;
  private field: Field;
  private allCharacters: Character[];
  private trajectoryCalculator: PassTrajectoryCalculator;

  constructor(ball: Ball, field: Field, allCharacters: Character[]) {
    this.ball = ball;
    this.field = field;
    this.allCharacters = allCharacters;
    this.trajectoryCalculator = new PassTrajectoryCalculator();
  }

  /**
   * キャラクターリストを更新
   */
  setCharacters(characters: Character[]): void {
    this.allCharacters = characters;
  }

  /**
   * ボールを取得
   */
  getBall(): Ball {
    return this.ball;
  }

  // =====================================================
  // パスリスク判定
  // =====================================================

  /**
   * 全チームメイトへのパスレーンリスクを一括評価
   * チェストパスとバウンスパスの両方を計算し、低い方のリスクを返す
   * @param passer パスを出すキャラクター
   * @returns 各チームメイトへのリスク情報の配列
   */
  assessAllPassLanes(
    passer: Character
  ): Array<{ teammate: Character; risk: number }> {
    const myPos = passer.getPosition();
    const myHeight = passer.config.physical.height;
    const passerVec: Vec3 = {
      x: myPos.x,
      y: myPos.y + myHeight * 0.15,
      z: myPos.z,
    };

    const teammates = getTeammates(this.allCharacters, passer);
    const results: Array<{ teammate: Character; risk: number }> = [];

    for (const teammate of teammates) {
      const teammatePos = teammate.getPosition();
      const teammateHeight = teammate.config.physical.height;
      const receiverVec: Vec3 = {
        x: teammatePos.x,
        y: teammatePos.y + teammateHeight * 0.15,
        z: teammatePos.z,
      };

      const distance = getDistance2DSimple(receiverVec, passerVec);

      const chestConfig = PASS_TYPE_CONFIGS[PassType.CHEST];
      const bounceConfig = PASS_TYPE_CONFIGS[PassType.BOUNCE];

      const inChestRange = distance >= chestConfig.minDistance && distance <= chestConfig.maxDistance;
      const inBounceRange = distance >= bounceConfig.minDistance && distance <= bounceConfig.maxDistance;

      if (!inChestRange && !inBounceRange) {
        results.push({ teammate, risk: 1.0 });
        continue;
      }

      let minRisk = 1.0;

      if (inChestRange) {
        const chestTrajectory = this.trajectoryCalculator.calculateTrajectory(passerVec, receiverVec, PassType.CHEST, 20);
        if (chestTrajectory) {
          const analysis = this.assessTrajectoryRisk(chestTrajectory, passer.team);
          minRisk = Math.min(minRisk, analysis.maxRisk?.probability ?? 0);
        }
      }

      if (inBounceRange) {
        const bounceTrajectory = this.trajectoryCalculator.calculateTrajectory(passerVec, receiverVec, PassType.BOUNCE, 20);
        if (bounceTrajectory) {
          const analysis = this.assessTrajectoryRisk(bounceTrajectory, passer.team);
          minRisk = Math.min(minRisk, analysis.maxRisk?.probability ?? 0);
        }
      }

      results.push({ teammate, risk: minRisk });
    }

    return results;
  }

  /**
   * パスのリスク評価
   * @param passer パサー
   * @param receiver レシーバー
   * @param passType パスタイプ
   * @returns リスク評価結果
   */
  assessPassRisk(
    passer: Character,
    receiver: Character,
    passType: 'chest' | 'bounce' | 'overhead' = 'chest'
  ): PassRiskDetail {
    const defenders = this.allCharacters.filter(c => c.team !== passer.team);

    // 軌道を計算
    const trajectory = this.calculatePassTrajectory(passer, receiver, passType);

    // 各ディフェンダーのインターセプトリスクを計算
    const dangerPoints: PassRiskDetail['dangerPoints'] = [];
    let maxRisk = 0;
    let primaryThreat: Character | null = null;
    let threatPoint: Vector3 | null = null;

    for (const defender of defenders) {
      const risk = this.calculateDefenderInterceptionRisk(
        defender,
        trajectory,
        passType === 'bounce'
      );

      if (risk.probability > maxRisk) {
        maxRisk = risk.probability;
        primaryThreat = defender;
        threatPoint = risk.interceptPoint;
      }

      if (risk.probability > 0.1) {
        dangerPoints.push({
          position: risk.interceptPoint,
          defender,
          arrivalTimeDiff: risk.timeDiff,
        });
      }
    }

    return {
      probability: maxRisk,
      riskLevel: this.getRiskLevel(maxRisk),
      primaryThreat,
      threatPoint,
      recommendation: this.getRecommendation(maxRisk),
      passType,
      dangerPoints,
    };
  }

  // =====================================================
  // シュートリスク判定
  // =====================================================

  /**
   * シュートのリスク評価
   * @param shooter シューター
   * @param shootType シュートタイプ
   * @returns リスク評価結果
   */
  assessShootRisk(
    shooter: Character,
    shootType: '3pt' | 'midrange' | 'layup' = 'midrange'
  ): ShootRiskDetail {
    const defenders = this.allCharacters.filter(c => c.team !== shooter.team);

    // シュート軌道を計算
    const shooterPos = shooter.getPosition();
    const goalPos = this.field.getAttackingGoalRim(shooter.team);

    // 各ディフェンダーのブロックリスクを計算
    const blockers: ShootRiskDetail['blockers'] = [];
    let maxRisk = 0;
    let primaryThreat: Character | null = null;
    let threatPoint: Vector3 | null = null;

    for (const defender of defenders) {
      const blockRisk = this.calculateDefenderBlockRisk(
        shooter,
        defender,
        shootType,
        shooterPos,
        goalPos
      );

      if (blockRisk.probability > 0.1) {
        blockers.push({
          defender,
          blockProbability: blockRisk.probability,
          canJump: DefenderStateUtils.canJumpNow(defender),
        });
      }

      if (blockRisk.probability > maxRisk) {
        maxRisk = blockRisk.probability;
        primaryThreat = defender;
        threatPoint = blockRisk.blockPoint;
      }
    }

    return {
      probability: maxRisk,
      riskLevel: this.getRiskLevel(maxRisk),
      primaryThreat,
      threatPoint,
      recommendation: this.getRecommendation(maxRisk),
      shootType,
      blockers,
    };
  }

  // =====================================================
  // 軌道ベースリスク判定（InterceptionAnalyzer互換）
  // =====================================================

  /**
   * TrajectoryResult を使用した詳細なリスク分析
   * InterceptionAnalyzer.analyzeTrajectoryRisk() と互換性あり
   * @param trajectory 軌道計算結果
   * @param passerTeam パサーのチーム
   * @returns 軌道リスク分析結果
   */
  assessTrajectoryRisk(
    trajectory: TrajectoryResult,
    passerTeam: 'ally' | 'enemy'
  ): TrajectoryRiskAnalysisResult {
    const defenderRisks: TrajectoryInterceptionRisk[] = [];
    let maxRisk: TrajectoryInterceptionRisk | null = null;

    // 全キャラクターをチェック
    for (const character of this.allCharacters) {
      // 同チームはスキップ
      if (character.team === passerTeam) {
        continue;
      }

      const risk = this.calculateTrajectoryInterceptionRisk(trajectory, character);
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
   * 単一ディフェンダーの軌道インターセプトリスクを計算
   * DefenderStateUtils を使用して重心状態を考慮
   */
  private calculateTrajectoryInterceptionRisk(
    trajectory: TrajectoryResult,
    defender: Character
  ): TrajectoryInterceptionRisk | null {
    const defenderPos = defender.getPosition();
    const defenderVec: Vec3 = { x: defenderPos.x, y: defenderPos.y, z: defenderPos.z };

    // DefenderStateUtils を使用して反応時間と速度を取得
    const reactionTime = DefenderStateUtils.getReactionTime(defender);
    const baseSpeed = RISK_ASSESSMENT_CONFIG.PASS.BASE_DEFENDER_SPEED;
    const speedStat = defender.playerData?.stats?.speed ?? 50;
    const defenderSpeed = baseSpeed * (speedStat / 50);
    const interceptRadius = RISK_ASSESSMENT_CONFIG.PASS.INTERCEPT_RADIUS;

    // バウンスパスの場合、バウンド前はインターセプト不可
    let bounceTime = 0;
    if (trajectory.passType === PassType.BOUNCE && trajectory.bouncePoint) {
      bounceTime = trajectory.flightTime * 0.5;
    }

    // 軌道上の各点に対してインターセプト可能性をチェック
    let closestPointOnTrajectory: Vec3 | null = null;
    let minTimeDiff = Infinity;
    let closestPointTime = 0;
    let closestDistance = Infinity;

    for (const point of trajectory.points) {
      // バウンスパスの場合、バウンド前の点はスキップ
      if (trajectory.passType === PassType.BOUNCE && point.time < bounceTime) {
        continue;
      }

      // ディフェンダーからこの点までの距離
      const dx = point.position.x - defenderVec.x;
      const dy = point.position.y - defenderVec.y;
      const dz = point.position.z - defenderVec.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // 重心状態を考慮した移動予測
      const pointVector = vec3ToVector3(point.position);
      const predictedPos = DefenderStateUtils.predictPosition(defender, point.time);
      const predictedDistance = Vector3.Distance(predictedPos, pointVector);

      // 実効距離（現在位置と予測位置の小さい方）
      const effectiveDistance = Math.min(distance, predictedDistance);

      // ディフェンダーがこの点に到達するまでの時間
      const timeToReachPoint = reactionTime + Math.max(0, effectiveDistance - interceptRadius) / defenderSpeed;

      // ボールがこの点に到達する時間
      const ballArrivalTime = point.time;

      // タイミング差
      const timeDiff = timeToReachPoint - ballArrivalTime;

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

    // インターセプト確率を計算（InterceptionAnalyzer互換ロジック）
    let probability: number;

    if (minTimeDiff <= -0.3) {
      probability = 0.9 + Math.min(0.1, Math.abs(minTimeDiff) * 0.1);
    } else if (minTimeDiff <= 0) {
      probability = 0.6 + Math.abs(minTimeDiff) * 1.0;
    } else if (minTimeDiff <= 0.2) {
      probability = 0.3 + (0.2 - minTimeDiff) * 1.5;
    } else if (minTimeDiff <= 0.5) {
      probability = 0.1 + (0.5 - minTimeDiff) * 0.67;
    } else {
      probability = Math.max(0, 0.1 - (minTimeDiff - 0.5) * 0.1);
    }

    // 距離による補正
    if (closestDistance < 2.0) {
      probability = Math.min(1.0, probability * 1.2);
    } else if (closestDistance > 5.0) {
      probability *= 0.8;
    }

    // 重心状態による追加調整（ジャンプできない場合はインターセプト確率低下）
    if (!DefenderStateUtils.canJumpNow(defender)) {
      probability *= 0.7;
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
   * 複数の軌道オプションの中から最も安全なものを選択
   * InterceptionAnalyzer.selectSafestOption() と互換性あり
   */
  selectSafestTrajectory(
    trajectories: TrajectoryResult[],
    passerTeam: 'ally' | 'enemy'
  ): { trajectory: TrajectoryResult; analysis: TrajectoryRiskAnalysisResult } | null {
    let safestTrajectory: TrajectoryResult | null = null;
    let safestAnalysis: TrajectoryRiskAnalysisResult | null = null;
    let lowestRisk = Infinity;

    for (const trajectory of trajectories) {
      const analysis = this.assessTrajectoryRisk(trajectory, passerTeam);
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

  /**
   * ディフェンダーのブロックリスクを計算
   */
  private calculateDefenderBlockRisk(
    shooter: Character,
    defender: Character,
    shootType: '3pt' | 'midrange' | 'layup',
    shooterPos: Vector3,
    _goalPos: Vector3
  ): { probability: number; blockPoint: Vector3 } {
    const defenderPos = defender.getPosition();

    // シューターとディフェンダーの距離
    const distanceToShooter = Vector3.Distance(shooterPos, defenderPos);

    // シュートタイプ別のブロック可能距離
    const blockDistanceThresholds = {
      'layup': RISK_ASSESSMENT_CONFIG.SHOOT.LAYUP_BLOCK_DISTANCE,
      'midrange': RISK_ASSESSMENT_CONFIG.SHOOT.MIDRANGE_BLOCK_DISTANCE,
      '3pt': RISK_ASSESSMENT_CONFIG.SHOOT.THREE_PT_BLOCK_DISTANCE,
    };

    const blockThreshold = blockDistanceThresholds[shootType];

    // 距離が遠すぎる場合はブロック不可
    if (distanceToShooter > blockThreshold * 2) {
      return { probability: 0, blockPoint: defenderPos };
    }

    // ディフェンダーの有効ブロック高さ
    const effectiveHeight = DefenderStateUtils.getEffectiveBlockHeight(
      defender,
      RISK_ASSESSMENT_CONFIG.SHOOT.BASE_JUMP_HEIGHT
    );

    // シューターのリリース高さ（概算）
    const shooterHeight = shooter.config.physical.height;
    const releaseHeight = shooterHeight * 0.9 + 0.3; // 頭上でリリース

    // 高さによるブロック可能性
    const heightDiff = effectiveHeight - releaseHeight;
    let heightFactor = 0;
    if (heightDiff >= 0.3) {
      heightFactor = 1.0; // 完全にブロック可能
    } else if (heightDiff >= 0) {
      heightFactor = 0.7; // ギリギリブロック可能
    } else if (heightDiff >= -0.2) {
      heightFactor = 0.3; // 難しいがチャンスあり
    }

    // 距離による調整
    let distanceFactor = 0;
    if (distanceToShooter <= blockThreshold) {
      distanceFactor = 1.0;
    } else if (distanceToShooter <= blockThreshold * 1.5) {
      distanceFactor = 0.5;
    } else {
      distanceFactor = 0.2;
    }

    // 移動予測（シューターがシュートモーション中にディフェンダーが近づける）
    const shootMotionTime = RISK_ASSESSMENT_CONFIG.SHOOT.SHOOT_MOTION_TIME;
    const predictedPos = DefenderStateUtils.predictPosition(defender, shootMotionTime);
    const predictedDistance = Vector3.Distance(shooterPos, predictedPos);

    if (predictedDistance < distanceToShooter) {
      // 近づいている場合、距離ファクターを調整
      distanceFactor = Math.min(1.0, distanceFactor + 0.2);
    }

    // 重心状態による調整（ジャンプできない場合はリスク低下）
    let balanceFactor = 1.0;
    if (!DefenderStateUtils.canJumpNow(defender)) {
      balanceFactor = 0.3; // ジャンプできないのでブロック確率大幅低下
    }

    const probability = Math.min(1.0, heightFactor * distanceFactor * balanceFactor);

    return {
      probability,
      blockPoint: predictedPos,
    };
  }

  // =====================================================
  // 共通ヘルパー
  // =====================================================

  /**
   * パス軌道を計算（簡易版）
   */
  private calculatePassTrajectory(
    passer: Character,
    receiver: Character,
    _passType: 'chest' | 'bounce' | 'overhead'
  ): { points: Vector3[]; times: number[] } {
    const start = passer.getPosition();
    const end = receiver.getPosition();
    const points: Vector3[] = [];
    const times: number[] = [];

    const segments = 20;
    const distance = Vector3.Distance(start, end);
    const speed = RISK_ASSESSMENT_CONFIG.PASS.BASE_PASS_SPEED;
    const totalTime = distance / speed;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = Vector3.Lerp(start, end, t);
      points.push(point);
      times.push(t * totalTime);
    }

    return { points, times };
  }

  /**
   * ディフェンダーのインターセプトリスクを計算
   */
  private calculateDefenderInterceptionRisk(
    defender: Character,
    trajectory: { points: Vector3[]; times: number[] },
    isBouncePass: boolean
  ): { probability: number; interceptPoint: Vector3; timeDiff: number } {
    const reactionTime = DefenderStateUtils.getReactionTime(defender);
    const baseSpeed = RISK_ASSESSMENT_CONFIG.PASS.BASE_DEFENDER_SPEED;
    const speedStat = defender.playerData?.stats?.speed ?? 50;
    const defenderSpeed = baseSpeed * (speedStat / 50);
    const interceptRadius = RISK_ASSESSMENT_CONFIG.PASS.INTERCEPT_RADIUS;

    let maxProbability = 0;
    let bestInterceptPoint = trajectory.points[0];
    let bestTimeDiff = Infinity;

    const startIndex = isBouncePass ? Math.floor(trajectory.points.length / 2) : 0;

    for (let i = startIndex; i < trajectory.points.length; i++) {
      const point = trajectory.points[i];
      const ballTime = trajectory.times[i];

      const defenderPos = defender.getPosition();
      const distance = Vector3.Distance(defenderPos, point);

      // 移動予測を考慮
      const predictedPos = DefenderStateUtils.predictPosition(defender, ballTime);
      const predictedDistance = Vector3.Distance(predictedPos, point);
      const effectiveDistance = Math.min(distance, predictedDistance);

      const defenderTime = reactionTime + Math.max(0, effectiveDistance - interceptRadius) / defenderSpeed;
      const timeDiff = defenderTime - ballTime;

      let probability = 0;
      if (timeDiff <= -0.3) {
        probability = 0.9 + (Math.abs(timeDiff) - 0.3) * 0.2;
      } else if (timeDiff <= 0) {
        probability = 0.6 + Math.abs(timeDiff) / 0.3 * 0.3;
      } else if (timeDiff <= 0.2) {
        probability = 0.3 + (0.2 - timeDiff) / 0.2 * 0.3;
      } else if (timeDiff <= 0.5) {
        probability = 0.1 + (0.5 - timeDiff) / 0.3 * 0.2;
      } else {
        probability = Math.max(0, 0.1 - (timeDiff - 0.5) * 0.1);
      }

      probability = Math.min(1.0, Math.max(0, probability));

      if (probability > maxProbability) {
        maxProbability = probability;
        bestInterceptPoint = point;
        bestTimeDiff = timeDiff;
      }
    }

    return {
      probability: maxProbability,
      interceptPoint: bestInterceptPoint,
      timeDiff: bestTimeDiff,
    };
  }

  /**
   * リスクレベルを取得
   */
  private getRiskLevel(probability: number): RiskLevel {
    if (probability < RISK_ASSESSMENT_CONFIG.THRESHOLDS.SAFE) return RiskLevel.SAFE;
    if (probability < RISK_ASSESSMENT_CONFIG.THRESHOLDS.CAUTION) return RiskLevel.CAUTION;
    if (probability < RISK_ASSESSMENT_CONFIG.THRESHOLDS.DANGER) return RiskLevel.DANGER;
    return RiskLevel.HIGH_DANGER;
  }

  /**
   * 推奨アクションを取得
   */
  private getRecommendation(probability: number): 'EXECUTE' | 'WAIT' | 'ABORT' {
    if (probability < RISK_ASSESSMENT_CONFIG.THRESHOLDS.SAFE) return 'EXECUTE';
    if (probability < 0.7) return 'WAIT';
    return 'ABORT';
  }
}
