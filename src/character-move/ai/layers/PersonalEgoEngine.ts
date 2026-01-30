/**
 * Layer 5: PersonalEgoEngine（個人意思）
 * 選手の個性・得意技・好みに基づく意思を計算する
 */

import { Character } from "../../entities/Character";
import {
  SituationContext,
  FieldAnalysis,
  ActionDesire,
  PlayerPersonality,
  DEFAULT_PERSONALITY,
} from "../config/AILayerTypes";
import type { PlayerStats } from "../../types/PlayerData";

/**
 * エゴエンジンの設定
 */
export const EGO_CONFIG = {
  // スタッツ閾値
  HIGH_STAT_THRESHOLD: 75,       // 高いスタッツとみなす閾値
  ELITE_STAT_THRESHOLD: 85,      // エリートとみなす閾値

  // 確信度計算
  OPEN_SHOT_CONFIDENCE_BONUS: 0.3,
  CONTESTED_SHOT_CONFIDENCE_PENALTY: 0.2,

  // 強度計算
  BASE_INTENSITY: 0.3,
  STAT_INTENSITY_MULTIPLIER: 0.007, // (stat - 50) * multiplier

  // 連続成功ボーナス（ホットハンド）
  HOT_HAND_MULTIPLIER: 1.3,
} as const;

/**
 * 個人意思エンジン
 */
export class PersonalEgoEngine {
  // ホットハンド状態を追跡（選手ごと）
  private hotHandStatus: Map<Character, { consecutiveSuccess: number; isHot: boolean }> = new Map();

  /**
   * 選手の意思を計算
   */
  calculate(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    personality?: PlayerPersonality
  ): ActionDesire {
    const stats = character.playerData?.stats;
    const actualPersonality = personality ?? this.inferPersonality(character);

    // 各アクションへの欲求を計算
    const desires: ActionDesire[] = [];

    // オフェンスフェーズの場合
    if (situation.phase === 'offense') {
      // 3ポイントシュート欲求
      const threePointDesire = this.calculate3PointDesire(
        character, situation, fieldAnalysis, stats, actualPersonality
      );
      if (threePointDesire) desires.push(threePointDesire);

      // ミッドレンジシュート欲求
      const midRangeDesire = this.calculateMidRangeDesire(
        character, situation, fieldAnalysis, stats, actualPersonality
      );
      if (midRangeDesire) desires.push(midRangeDesire);

      // ドライブ欲求
      const driveDesire = this.calculateDriveDesire(
        character, situation, fieldAnalysis, stats, actualPersonality
      );
      if (driveDesire) desires.push(driveDesire);

      // ポストアップ欲求
      const postUpDesire = this.calculatePostUpDesire(
        character, situation, fieldAnalysis, stats, actualPersonality
      );
      if (postUpDesire) desires.push(postUpDesire);

      // パスファースト傾向
      const passFirstDesire = this.calculatePassFirstDesire(
        character, situation, fieldAnalysis, stats, actualPersonality
      );
      if (passFirstDesire) desires.push(passFirstDesire);
    }

    // ディフェンスフェーズの場合
    if (situation.phase === 'defense') {
      // スティール欲求
      const stealDesire = this.calculateStealDesire(
        character, situation, fieldAnalysis, stats, actualPersonality
      );
      if (stealDesire) desires.push(stealDesire);

      // ブロック欲求
      const blockDesire = this.calculateBlockDesire(
        character, situation, fieldAnalysis, stats, actualPersonality
      );
      if (blockDesire) desires.push(blockDesire);
    }

    // リバウンド欲求（常に）
    const reboundDesire = this.calculateReboundDesire(
      character, situation, fieldAnalysis, stats, actualPersonality
    );
    if (reboundDesire) desires.push(reboundDesire);

    // 最も強い欲求を返す
    if (desires.length === 0) {
      return {
        action: 'none',
        intensity: 0,
        confidence: 0.5,
        reason: 'No strong desire',
      };
    }

    desires.sort((a, b) => b.intensity - a.intensity);
    return desires[0];
  }

  /**
   * 3ポイントシュート欲求
   */
  private calculate3PointDesire(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    stats: PlayerStats | undefined,
    personality: PlayerPersonality
  ): ActionDesire | null {
    // 3ポイント圏内でなければスキップ
    if (!situation.isInThreePointRange) return null;

    const threePointStat = stats?.['3paccuracy'] ?? 50;
    if (threePointStat < 50) return null; // 苦手な場合はスキップ

    // 基本強度
    let intensity = EGO_CONFIG.BASE_INTENSITY +
      (threePointStat - 50) * EGO_CONFIG.STAT_INTENSITY_MULTIPLIER;

    // エリートシューターはより強い欲求
    if (threePointStat >= EGO_CONFIG.ELITE_STAT_THRESHOLD) {
      intensity += 0.2;
    }

    // ホットハンドボーナス
    const hotHand = this.hotHandStatus.get(character);
    if (hotHand?.isHot) {
      intensity *= EGO_CONFIG.HOT_HAND_MULTIPLIER;
    }

    // エゴレベルで調整
    intensity *= (0.5 + personality.egoLevel * 0.5);

    // 確信度計算
    let confidence = threePointStat / 100;
    if (fieldAnalysis.myShootingLane) {
      confidence *= fieldAnalysis.myShootingLane.openness;
      if (fieldAnalysis.myShootingLane.openness > 0.7) {
        confidence += EGO_CONFIG.OPEN_SHOT_CONFIDENCE_BONUS;
      } else if (fieldAnalysis.myShootingLane.openness < 0.4) {
        confidence -= EGO_CONFIG.CONTESTED_SHOT_CONFIDENCE_PENALTY;
      }
    }

    return {
      action: 'shoot_3pt',
      intensity: Math.min(1, intensity),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: `3PT skill: ${threePointStat}${hotHand?.isHot ? ' (hot hand)' : ''}`,
    };
  }

  /**
   * ミッドレンジシュート欲求
   */
  private calculateMidRangeDesire(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    stats: PlayerStats | undefined,
    personality: PlayerPersonality
  ): ActionDesire | null {
    // ミッドレンジでなければスキップ
    if (situation.courtZone !== 'mid_range') return null;

    const midRangeStat = stats?.shootccuracy ?? 50;
    if (midRangeStat < 50) return null;

    let intensity = EGO_CONFIG.BASE_INTENSITY +
      (midRangeStat - 50) * EGO_CONFIG.STAT_INTENSITY_MULTIPLIER;

    if (midRangeStat >= EGO_CONFIG.ELITE_STAT_THRESHOLD) {
      intensity += 0.15;
    }

    // ホットハンドボーナス
    const hotHand = this.hotHandStatus.get(character);
    if (hotHand?.isHot) {
      intensity *= EGO_CONFIG.HOT_HAND_MULTIPLIER;
    }

    intensity *= (0.5 + personality.egoLevel * 0.5);

    let confidence = midRangeStat / 100;
    if (fieldAnalysis.myShootingLane) {
      confidence *= fieldAnalysis.myShootingLane.openness;
    }

    return {
      action: 'shoot_mid',
      intensity: Math.min(1, intensity),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: `Mid-range skill: ${midRangeStat}`,
    };
  }

  /**
   * ドライブ欲求
   */
  private calculateDriveDesire(
    _character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    stats: PlayerStats | undefined,
    personality: PlayerPersonality
  ): ActionDesire | null {
    // ペイント内ならドライブ不要
    if (situation.isInPaint) return null;

    const dribblingStat = stats?.dribblingspeed ?? 50;
    const speedStat = stats?.speed ?? 50;
    const combinedStat = (dribblingStat + speedStat) / 2;

    if (combinedStat < 50) return null;

    let intensity = EGO_CONFIG.BASE_INTENSITY +
      (combinedStat - 50) * EGO_CONFIG.STAT_INTENSITY_MULTIPLIER;

    // アグレッシブな性格はドライブ志向
    intensity *= (0.5 + personality.aggression * 0.5);
    intensity *= (0.5 + personality.riskTolerance * 0.5);

    // オープンスペースがあれば欲求増加
    if (fieldAnalysis.bestOpenSpace?.zone === 'paint') {
      intensity += 0.2;
    }

    // マッチアップ有利なら欲求増加
    if (fieldAnalysis.myMatchup?.mismatch === 'offense_advantage' &&
        fieldAnalysis.myMatchup.mismatchReason === 'speed') {
      intensity += 0.25;
    }

    let confidence = combinedStat / 100;
    // ペイント混雑で確信度低下
    confidence *= (1 - fieldAnalysis.paintCongestion * 0.5);

    return {
      action: 'drive',
      intensity: Math.min(1, intensity),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: `Dribbling: ${dribblingStat}, Speed: ${speedStat}`,
    };
  }

  /**
   * ポストアップ欲求
   */
  private calculatePostUpDesire(
    character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    stats: PlayerStats | undefined,
    personality: PlayerPersonality
  ): ActionDesire | null {
    const position = character.playerData?.basic?.PositionMain;
    // ビッグマン以外はスキップ
    if (position !== 'C' && position !== 'PF') return null;

    const postStat = stats?.power ?? 50;
    if (postStat < 50) return null;

    let intensity = EGO_CONFIG.BASE_INTENSITY +
      (postStat - 50) * EGO_CONFIG.STAT_INTENSITY_MULTIPLIER;

    // 身長アドバンテージがあれば欲求増加
    if (fieldAnalysis.myMatchup?.mismatch === 'offense_advantage' &&
        fieldAnalysis.myMatchup.mismatchReason === 'height') {
      intensity += 0.3;
    }

    intensity *= (0.5 + personality.egoLevel * 0.5);

    let confidence = postStat / 100;
    // ペイント混雑で確信度低下
    confidence *= (1 - fieldAnalysis.paintCongestion * 0.3);

    return {
      action: 'post_up',
      intensity: Math.min(1, intensity),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: `Post skill: ${postStat}`,
    };
  }

  /**
   * パスファースト傾向
   */
  private calculatePassFirstDesire(
    _character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    stats: PlayerStats | undefined,
    personality: PlayerPersonality
  ): ActionDesire | null {
    const passStat = stats?.passaccuracy ?? 50;

    // チームプレイヤー傾向が高いほどパスファースト
    let intensity = EGO_CONFIG.BASE_INTENSITY +
      (passStat - 50) * EGO_CONFIG.STAT_INTENSITY_MULTIPLIER;

    intensity *= (0.5 + personality.teamPlayer * 0.5);
    // エゴが低いほどパスファースト
    intensity *= (1.5 - personality.egoLevel * 0.5);

    // オープンな味方がいれば欲求増加
    if (fieldAnalysis.openPassLanes.length > 0) {
      const bestOption = fieldAnalysis.bestPassOption;
      if (bestOption && bestOption.receiverOpenness > 0.7) {
        intensity += 0.2;
      }
    }

    let confidence = passStat / 100;
    confidence *= (1 - fieldAnalysis.turnoverRisk);

    return {
      action: 'pass_first',
      intensity: Math.min(1, intensity),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: `Pass skill: ${passStat}, Team player: ${Math.round(personality.teamPlayer * 100)}%`,
    };
  }

  /**
   * スティール欲求
   */
  private calculateStealDesire(
    _character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    stats: PlayerStats | undefined,
    personality: PlayerPersonality
  ): ActionDesire | null {
    const stealStat = stats?.defense ?? 50;
    if (stealStat < 50) return null;

    let intensity = EGO_CONFIG.BASE_INTENSITY +
      (stealStat - 50) * EGO_CONFIG.STAT_INTENSITY_MULTIPLIER;

    intensity *= (0.5 + personality.aggression * 0.5);
    intensity *= (0.5 + personality.riskTolerance * 0.5);

    // ボール保持者に近ければ欲求増加
    if (fieldAnalysis.ballHolder) {
      const distance = fieldAnalysis.self.distanceToBall;
      if (distance < 2.0) {
        intensity += 0.3;
      } else if (distance < 3.0) {
        intensity += 0.15;
      }
    }

    const confidence = stealStat / 100;

    return {
      action: 'steal',
      intensity: Math.min(1, intensity),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: `Defense skill: ${stealStat}`,
    };
  }

  /**
   * ブロック欲求
   */
  private calculateBlockDesire(
    _character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    stats: PlayerStats | undefined,
    personality: PlayerPersonality
  ): ActionDesire | null {
    const blockStat = stats?.power ?? 50;
    if (blockStat < 50) return null;

    let intensity = EGO_CONFIG.BASE_INTENSITY +
      (blockStat - 50) * EGO_CONFIG.STAT_INTENSITY_MULTIPLIER;

    intensity *= (0.5 + personality.aggression * 0.5);

    // シュート中の敵が近くにいれば欲求増加
    if (fieldAnalysis.ballHolder &&
        fieldAnalysis.ballHolder.currentAction?.startsWith('shoot_')) {
      const distance = fieldAnalysis.self.distanceToBall;
      if (distance < 2.5) {
        intensity += 0.4;
      }
    }

    const confidence = blockStat / 100;

    return {
      action: 'block',
      intensity: Math.min(1, intensity),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: `Power skill: ${blockStat}`,
    };
  }

  /**
   * リバウンド欲求
   */
  private calculateReboundDesire(
    character: Character,
    situation: SituationContext,
    _fieldAnalysis: FieldAnalysis,
    stats: PlayerStats | undefined,
    _personality: PlayerPersonality
  ): ActionDesire | null {
    const reboundStat = stats?.jump ?? 50;
    const position = character.playerData?.basic?.PositionMain;

    // ビッグマンは基本的にリバウンド欲求が高い
    const baseIntensity = position === 'C' || position === 'PF' ? 0.4 : 0.2;

    let intensity = baseIntensity +
      (reboundStat - 50) * EGO_CONFIG.STAT_INTENSITY_MULTIPLIER;

    // シュート後やトランジション時は欲求増加
    if (situation.phase === 'transition' || situation.ballRelation === 'loose_ball') {
      intensity += 0.3;
    }

    const confidence = reboundStat / 100;

    return {
      action: 'rebound',
      intensity: Math.min(1, intensity),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: `Jump skill: ${reboundStat}`,
    };
  }

  /**
   * スタッツから性格を推測
   */
  private inferPersonality(character: Character): PlayerPersonality {
    const stats = character.playerData?.stats;
    if (!stats) return DEFAULT_PERSONALITY;

    // スタッツから性格を推測
    const avgOffensiveStat = (
      (stats['3paccuracy'] ?? 50) +
      (stats.shootccuracy ?? 50) +
      (stats.dribblingspeed ?? 50)
    ) / 3;

    const avgDefensiveStat = (
      (stats.defense ?? 50) +
      (stats.power ?? 50) +
      (stats.reflexes ?? 50)
    ) / 3;

    return {
      egoLevel: Math.min(1, avgOffensiveStat / 100),
      teamPlayer: Math.min(1, (stats.passaccuracy ?? 50) / 100),
      clutchMentality: 0.5, // デフォルト
      aggression: Math.min(1, (avgDefensiveStat - 30) / 70),
      riskTolerance: Math.min(1, (stats.dribblingspeed ?? 50) / 100),
    };
  }

  /**
   * シュート成功を記録（ホットハンド用）
   */
  recordShotSuccess(character: Character): void {
    let status = this.hotHandStatus.get(character);
    if (!status) {
      status = { consecutiveSuccess: 0, isHot: false };
      this.hotHandStatus.set(character, status);
    }

    status.consecutiveSuccess++;
    if (status.consecutiveSuccess >= 3) {
      status.isHot = true;
    }
  }

  /**
   * シュート失敗を記録（ホットハンド用）
   */
  recordShotFailure(character: Character): void {
    let status = this.hotHandStatus.get(character);
    if (!status) {
      status = { consecutiveSuccess: 0, isHot: false };
      this.hotHandStatus.set(character, status);
    }

    status.consecutiveSuccess = 0;
    status.isHot = false;
  }

  /**
   * ホットハンド状態を取得
   */
  isHotHand(character: Character): boolean {
    return this.hotHandStatus.get(character)?.isHot ?? false;
  }

  /**
   * リセット
   */
  reset(): void {
    this.hotHandStatus.clear();
  }
}
