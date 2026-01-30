/**
 * AIBlender
 * 戦術的行動（Layer 4）と個人意思（Layer 5）をブレンドして最終決定を生成
 */

import { Character } from "../entities/Character";
import {
  SituationContext,
  TacticalAction,
  ActionDesire,
  FinalDecision,
  PlayerPersonality,
  DEFAULT_PERSONALITY,
  TacticalActionType,
} from "./config/AILayerTypes";

/**
 * ブレンド設定
 */
export const BLEND_CONFIG = {
  // エゴ影響度の基本範囲
  BASE_EGO_INFLUENCE: 0.3,       // 基本のエゴ影響度
  MAX_EGO_INFLUENCE: 0.6,        // 最大エゴ影響度

  // 状況による補正
  LOW_SHOT_CLOCK_THRESHOLD: 5,   // ショットクロック残り少ない判定
  LOW_SHOT_CLOCK_EGO_PENALTY: 0.7, // ショットクロック少ない時のエゴ抑制

  // オーバーライド閾値
  EGO_OVERRIDE_THRESHOLD: 0.7,   // エゴが戦術をオーバーライドする閾値

  // アクションマッピング（エゴのアクションから戦術アクションへ）
  ACTION_MAPPING: {
    'shoot_3pt': 'shoot',
    'shoot_mid': 'shoot',
    'drive': 'drive',
    'post_up': 'post_up',
    'pass_first': 'pass',
    'steal': 'steal',
    'block': 'block',
    'rebound': 'rebound',
    'none': 'wait',
  } as Record<string, TacticalActionType>,
} as const;

/**
 * AIブレンダー
 */
export class AIBlender {
  /**
   * 戦術的行動とエゴをブレンド
   */
  blend(
    tactical: TacticalAction,
    ego: ActionDesire,
    character: Character,
    situation: SituationContext,
    personality?: PlayerPersonality
  ): FinalDecision {
    const actualPersonality = personality ?? DEFAULT_PERSONALITY;

    // エゴの影響度を計算
    const egoInfluence = this.calculateEgoInfluence(
      ego,
      actualPersonality,
      situation
    );

    // エゴがオーバーライドするか判定
    const shouldOverride = this.shouldEgoOverride(
      tactical,
      ego,
      egoInfluence
    );

    if (shouldOverride) {
      // エゴに基づく行動に変更
      const egoAction = this.convertEgoToTactical(ego, tactical);
      return {
        action: egoAction,
        egoInfluence,
        blendedFrom: { tactical, ego },
        overrideReason: `Ego override: ${ego.reason}`,
      };
    }

    // 戦術優先だが、エゴで微調整する可能性
    const blendedAction = this.blendActions(tactical, ego, egoInfluence);

    return {
      action: blendedAction,
      egoInfluence,
      blendedFrom: { tactical, ego },
      overrideReason: null,
    };
  }

  /**
   * エゴの影響度を計算
   */
  private calculateEgoInfluence(
    ego: ActionDesire,
    personality: PlayerPersonality,
    situation: SituationContext
  ): number {
    // 基本影響度
    let influence = BLEND_CONFIG.BASE_EGO_INFLUENCE;

    // 性格によるエゴ影響度の調整
    influence += (personality.egoLevel - 0.5) * 0.3;

    // 確信度が高いとエゴ増加
    influence *= (0.7 + ego.confidence * 0.3);

    // 状況による補正

    // ショットクロック残り少ない：戦術優先
    if (situation.shotClockRemaining < BLEND_CONFIG.LOW_SHOT_CLOCK_THRESHOLD) {
      influence *= BLEND_CONFIG.LOW_SHOT_CLOCK_EGO_PENALTY;
    }

    // トランジション時：本能的（エゴ増加）
    if (situation.isTransition) {
      influence *= 1.2;
    }

    // 境界付近：慎重に（エゴ抑制）
    if (situation.isNearBoundary) {
      influence *= 0.8;
    }

    // 範囲を制限
    return Math.max(0, Math.min(BLEND_CONFIG.MAX_EGO_INFLUENCE, influence));
  }

  /**
   * エゴが戦術をオーバーライドすべきか判定
   */
  private shouldEgoOverride(
    tactical: TacticalAction,
    ego: ActionDesire,
    egoInfluence: number
  ): boolean {
    // エゴの強度が低い場合はオーバーライドしない
    if (ego.intensity < 0.5) return false;

    // エゴ影響度が閾値未満ならオーバーライドしない
    if (egoInfluence < 0.3) return false;

    // エゴの強度 × 影響度 が戦術の優先度を上回るか
    const egoScore = ego.intensity * egoInfluence;
    const tacticalScore = tactical.priority * (1 - egoInfluence);

    // エゴスコアが閾値を超え、かつ戦術スコアを上回る場合
    return egoScore > BLEND_CONFIG.EGO_OVERRIDE_THRESHOLD * 0.5 &&
           egoScore > tacticalScore;
  }

  /**
   * エゴを戦術的行動に変換
   */
  private convertEgoToTactical(ego: ActionDesire, fallback: TacticalAction): TacticalAction {
    const actionType = BLEND_CONFIG.ACTION_MAPPING[ego.action] ?? 'wait';

    return {
      type: actionType,
      priority: ego.intensity,
      targetPosition: fallback.targetPosition,
      targetPlayer: fallback.targetPlayer,
      reason: `Ego-driven: ${ego.reason}`,
      expectedOutcome: `Following personal preference`,
      alternativeActions: [fallback], // 元の戦術を代替として保持
    };
  }

  /**
   * 戦術とエゴをブレンド（微調整）
   */
  private blendActions(
    tactical: TacticalAction,
    ego: ActionDesire,
    egoInfluence: number
  ): TacticalAction {
    // 同じ系統のアクションなら優先度を上げる
    const egoActionType = BLEND_CONFIG.ACTION_MAPPING[ego.action];

    if (this.areActionsSimilar(tactical.type, egoActionType)) {
      // エゴと戦術が一致：優先度を上げる
      return {
        ...tactical,
        priority: Math.min(1, tactical.priority + ego.intensity * egoInfluence * 0.2),
        reason: `${tactical.reason} (ego-aligned)`,
      };
    }

    // 異なるアクション：そのまま戦術を返す（エゴは代替として）
    const egoAlternative = this.convertEgoToTactical(ego, tactical);

    return {
      ...tactical,
      alternativeActions: [
        egoAlternative,
        ...tactical.alternativeActions,
      ],
    };
  }

  /**
   * アクションが類似しているか判定
   */
  private areActionsSimilar(a: TacticalActionType, b: TacticalActionType | undefined): boolean {
    if (!b) return false;
    if (a === b) return true;

    // シュート系
    const shootActions: TacticalActionType[] = ['shoot'];
    if (shootActions.includes(a) && shootActions.includes(b)) return true;

    // ドライブ/移動系
    const moveActions: TacticalActionType[] = ['drive', 'move_to_space', 'cut'];
    if (moveActions.includes(a) && moveActions.includes(b)) return true;

    // ディフェンス系
    const defenseActions: TacticalActionType[] = ['guard', 'steal', 'block', 'contest'];
    if (defenseActions.includes(a) && defenseActions.includes(b)) return true;

    return false;
  }
}
