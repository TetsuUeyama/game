/**
 * 1on1バトル関連の設定を一元管理するファイル
 * OneOnOneBattleController用の定数と型定義を提供
 */

/**
 * 有利/不利の状態
 */
export type AdvantageState = 'offense' | 'defense' | 'neutral';

/**
 * 1on1バトルの結果
 */
export interface OneOnOneResult {
  winner: 'offense' | 'defense';
  offenseDice: number;
  defenseDice: number;
}

/**
 * 有利/不利状態の詳細
 */
export interface AdvantageStatus {
  state: AdvantageState;       // 有利/不利/中立
  difference: number;          // サイコロの差（0-5）
  multiplier: number;          // 影響係数（計算済み）
}

/**
 * 1on1バトル設定
 * 注：タイミング設定は DefenseConfig.ONE_ON_ONE_BATTLE を参照
 */
export const ONE_ON_ONE_BATTLE_CONFIG = {
  // サークル接触判定の余裕（m）
  CONTACT_MARGIN: 0.1,

  // ゴール方向（チーム別）
  ALLY_ATTACK_GOAL_Z: 25,
  ENEMY_ATTACK_GOAL_Z: -25,
  ALLY_DEFEND_GOAL_Z: -25,
  ENEMY_DEFEND_GOAL_Z: 25,

  // サイコロの面数
  DICE_SIDES: 6,

  // ドリブル突破のランダム選択確率（左右）
  BREAKTHROUGH_LEFT_CHANCE: 0.5,
} as const;

/**
 * 位置取り設定
 */
export const POSITIONING_CONFIG = {
  // 目標位置への接近閾値（m）
  TARGET_THRESHOLD: 0.05,

  // ディフェンダーの停止距離（m）
  DEFENDER_STOP_DISTANCE: 0.05,
} as const;

/**
 * 有利/不利の影響度設定
 * ドリブルチェックモードで調整可能
 */
export const ADVANTAGE_CONFIG = {
  // 差ごとの基本影響係数（差1〜5に対応）
  // 例: 差3の場合、MULTIPLIER_BY_DIFFERENCE[3] = 0.15 → 15%の影響
  MULTIPLIER_BY_DIFFERENCE: {
    1: 0.05,  // 差1: 微有利 → 5%
    2: 0.10,  // 差2: 小有利 → 10%
    3: 0.15,  // 差3: 中有利 → 15%
    4: 0.20,  // 差4: 有利 → 20%
    5: 0.25,  // 差5: 大有利 → 25%
  } as Record<number, number>,

  // 各アクションへの影響係数（基本影響係数に乗算）
  ACTION_FACTORS: {
    // オフェンス側のアクション
    DRIBBLE_BREAKTHROUGH: 1.0,  // ドリブル突破成功率
    SHOOT_ACCURACY: 0.5,        // シュート精度（控えめに影響）
    FEINT_SUCCESS: 1.0,         // フェイント成功率
    PUSH_POWER: 1.0,            // 競り合いの押し込み力

    // ディフェンス側のアクション
    STEAL_SUCCESS: 1.0,         // スティール成功率
    BLOCK_SUCCESS: 1.0,         // ブロック成功率
    CONTEST_POWER: 1.0,         // コンテスト（シュート妨害）
  },

  // 最大影響係数（上限）
  MAX_MULTIPLIER: 0.30,  // 30%を上限とする
} as const;

/**
 * 有利/不利のユーティリティ関数
 */
export class AdvantageUtils {
  /**
   * サイコロの差から影響係数を計算
   * @param difference サイコロの差（絶対値）
   * @returns 影響係数（0.0〜MAX_MULTIPLIER）
   */
  public static calculateMultiplier(difference: number): number {
    if (difference <= 0) return 0;
    const absDiff = Math.min(Math.abs(difference), 5);
    const baseMultiplier = ADVANTAGE_CONFIG.MULTIPLIER_BY_DIFFERENCE[absDiff] ?? 0;
    return Math.min(baseMultiplier, ADVANTAGE_CONFIG.MAX_MULTIPLIER);
  }

  /**
   * アクションの成功率を有利/不利で調整
   * @param baseRate 基本成功率（0.0〜1.0）
   * @param advantageStatus 有利/不利状態
   * @param actionType アクションの種類
   * @param isOffenseAction オフェンス側のアクションかどうか
   * @returns 調整後の成功率
   */
  public static adjustSuccessRate(
    baseRate: number,
    advantageStatus: AdvantageStatus,
    actionType: keyof typeof ADVANTAGE_CONFIG.ACTION_FACTORS,
    isOffenseAction: boolean
  ): number {
    if (advantageStatus.state === 'neutral') {
      return baseRate;
    }

    const actionFactor = ADVANTAGE_CONFIG.ACTION_FACTORS[actionType];
    const effectiveMultiplier = advantageStatus.multiplier * actionFactor;

    // オフェンス有利でオフェンスアクション → ボーナス
    // オフェンス有利でディフェンスアクション → ペナルティ
    // ディフェンス有利でオフェンスアクション → ペナルティ
    // ディフェンス有利でディフェンスアクション → ボーナス
    const isAdvantaged =
      (advantageStatus.state === 'offense' && isOffenseAction) ||
      (advantageStatus.state === 'defense' && !isOffenseAction);

    if (isAdvantaged) {
      // 有利側：成功率UP
      return Math.min(1.0, baseRate + effectiveMultiplier);
    } else {
      // 不利側：成功率DOWN
      return Math.max(0.0, baseRate - effectiveMultiplier);
    }
  }

  /**
   * 競り合いの力を有利/不利で調整
   * @param basePower 基本の力
   * @param advantageStatus 有利/不利状態
   * @param isOffense オフェンス側かどうか
   * @returns 調整後の力
   */
  public static adjustPushPower(
    basePower: number,
    advantageStatus: AdvantageStatus,
    isOffense: boolean
  ): number {
    if (advantageStatus.state === 'neutral') {
      return basePower;
    }

    const actionFactor = ADVANTAGE_CONFIG.ACTION_FACTORS.PUSH_POWER;
    const effectiveMultiplier = advantageStatus.multiplier * actionFactor;

    const isAdvantaged =
      (advantageStatus.state === 'offense' && isOffense) ||
      (advantageStatus.state === 'defense' && !isOffense);

    if (isAdvantaged) {
      return basePower * (1 + effectiveMultiplier);
    } else {
      return basePower * (1 - effectiveMultiplier);
    }
  }
}
