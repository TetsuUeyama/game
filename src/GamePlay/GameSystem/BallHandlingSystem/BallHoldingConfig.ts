/**
 * ボール保持関連の設定を一元管理するファイル
 * 保持方向と使用する手のマッピング、非利き腕使用の判定ロジックを提供
 */

/**
 * 利き腕の型定義
 */
export type DominantHand = 'right' | 'left';

/**
 * 使用する手の型定義
 */
export type HoldingHand = 'right' | 'left';

/**
 * 保持方向と使用する手のマッピング（右利きの場合）
 * 方向番号は8角形の面番号に対応
 * - 0: 正面
 * - 1: 右前
 * - 2: 右
 * - 6: 左
 * - 7: 左前
 */
const RIGHT_HANDED_MAPPING: Record<number, HoldingHand> = {
  0: 'right',  // 正面 → 右手（利き腕）
  1: 'right',  // 右前 → 右手
  2: 'right',  // 右 → 右手
  6: 'left',   // 左 → 左手
  7: 'left',   // 左前 → 左手
};

/**
 * 保持方向と使用する手のマッピング（左利きの場合）
 */
const LEFT_HANDED_MAPPING: Record<number, HoldingHand> = {
  0: 'left',   // 正面 → 左手（利き腕）
  1: 'right',  // 右前 → 右手（非利き腕）
  2: 'right',  // 右 → 右手（非利き腕）
  6: 'left',   // 左 → 左手
  7: 'left',   // 左前 → 左手
};

/**
 * ボール保持設定
 */
export const BALL_HOLDING_CONFIG = {
  // 持ち替えが可能な方向（正面のみ）
  SWITCH_HAND_ALLOWED_FACE: 0,

  // 腕アニメーションのブレンド時間（秒）
  ARM_BLEND_DURATION: 0.2,

  // oppositefrequency/oppositeaccuracyの範囲
  STAT_MIN: 1,
  STAT_MAX: 8,

  // 非利き腕使用確率の計算係数
  // frequency=8 → 50%、frequency=1 → 約6%
  OPPOSITE_FREQUENCY_BASE: 0.5,

  // 非利き腕精度の計算係数
  // accuracy=8 → 100%、accuracy=1 → 50%
  OPPOSITE_ACCURACY_MIN: 0.5,
  OPPOSITE_ACCURACY_MAX: 1.0,
} as const;

/**
 * ボール保持関連のユーティリティメソッド
 */
export class BallHoldingUtils {
  /**
   * 保持方向から使用する手を取得
   * @param faceIndex 保持方向（面番号）
   * @param dominantHand 利き腕
   * @returns 使用する手
   */
  public static getHoldingHand(faceIndex: number, dominantHand: DominantHand): HoldingHand {
    const mapping = dominantHand === 'right' ? RIGHT_HANDED_MAPPING : LEFT_HANDED_MAPPING;
    return mapping[faceIndex] ?? dominantHand;
  }

  /**
   * 指定した方向が非利き腕を使用する方向かどうかを判定
   * @param faceIndex 保持方向（面番号）
   * @param dominantHand 利き腕
   * @returns 非利き腕を使用する場合はtrue
   */
  public static isOppositeHandDirection(faceIndex: number, dominantHand: DominantHand): boolean {
    const holdingHand = this.getHoldingHand(faceIndex, dominantHand);
    return holdingHand !== dominantHand;
  }

  /**
   * 非利き腕側の方向一覧を取得
   * @param dominantHand 利き腕
   * @returns 非利き腕を使用する方向の配列
   */
  public static getOppositeHandDirections(dominantHand: DominantHand): number[] {
    if (dominantHand === 'right') {
      return [6, 7]; // 左側の方向
    } else {
      return [1, 2]; // 右側の方向
    }
  }

  /**
   * 利き腕側の方向一覧を取得
   * @param dominantHand 利き腕
   * @returns 利き腕を使用する方向の配列
   */
  public static getDominantHandDirections(dominantHand: DominantHand): number[] {
    if (dominantHand === 'right') {
      return [0, 1, 2]; // 正面と右側の方向
    } else {
      return [0, 6, 7]; // 正面と左側の方向
    }
  }

  /**
   * 持ち替えが可能かどうかを判定
   * @param currentFaceIndex 現在の保持方向
   * @returns 持ち替え可能な場合はtrue
   */
  public static canSwitchHand(currentFaceIndex: number): boolean {
    return currentFaceIndex === BALL_HOLDING_CONFIG.SWITCH_HAND_ALLOWED_FACE;
  }

  /**
   * oppositefrequencyに基づいて非利き腕側への持ち替え確率を計算
   * @param oppositeFrequency 非利き腕使用頻度（1〜8）
   * @returns 非利き腕側に持ち替える確率（0.0〜0.5）
   */
  public static calculateOppositeHandProbability(oppositeFrequency: number): number {
    const normalizedFreq = Math.max(BALL_HOLDING_CONFIG.STAT_MIN,
      Math.min(BALL_HOLDING_CONFIG.STAT_MAX, oppositeFrequency));
    // frequency=8 → 0.5 (50%)、frequency=1 → 0.5/8 ≈ 0.0625 (6.25%)
    return (normalizedFreq / BALL_HOLDING_CONFIG.STAT_MAX) * BALL_HOLDING_CONFIG.OPPOSITE_FREQUENCY_BASE;
  }

  /**
   * oppositefrequencyに基づいて利き腕側への持ち替え優先度を計算
   * 頻度が低いほど利き腕側に戻そうとする傾向が強まる
   * @param oppositeFrequency 非利き腕使用頻度（1〜8）
   * @returns 利き腕側に持ち替える確率（0.5〜1.0）
   */
  public static calculateDominantHandPreference(oppositeFrequency: number): number {
    const normalizedFreq = Math.max(BALL_HOLDING_CONFIG.STAT_MIN,
      Math.min(BALL_HOLDING_CONFIG.STAT_MAX, oppositeFrequency));
    // frequency=1 → 1.0 (常に利き腕へ)、frequency=8 → 0.5 (半々)
    return 1.0 - (normalizedFreq / BALL_HOLDING_CONFIG.STAT_MAX) * 0.5;
  }

  /**
   * oppositeaccuracyに基づいて非利き腕使用時の精度係数を計算
   * @param oppositeAccuracy 非利き腕精度（1〜8）
   * @returns 精度係数（0.5〜1.0）
   */
  public static calculateOppositeHandAccuracy(oppositeAccuracy: number): number {
    const normalizedAcc = Math.max(BALL_HOLDING_CONFIG.STAT_MIN,
      Math.min(BALL_HOLDING_CONFIG.STAT_MAX, oppositeAccuracy));
    // accuracy=8 → 1.0 (100%)、accuracy=1 → 0.5 (50%)
    const range = BALL_HOLDING_CONFIG.OPPOSITE_ACCURACY_MAX - BALL_HOLDING_CONFIG.OPPOSITE_ACCURACY_MIN;
    return BALL_HOLDING_CONFIG.OPPOSITE_ACCURACY_MIN +
      ((normalizedAcc - 1) / (BALL_HOLDING_CONFIG.STAT_MAX - 1)) * range;
  }

  /**
   * 非利き腕使用時のアクション精度を計算
   * @param baseAccuracy 基本精度（利き腕使用時の値）
   * @param oppositeAccuracy 非利き腕精度ステータス（1〜8）
   * @param isUsingOppositeHand 非利き腕を使用中かどうか
   * @returns 調整後の精度
   */
  public static adjustAccuracyForHand(
    baseAccuracy: number,
    oppositeAccuracy: number,
    isUsingOppositeHand: boolean
  ): number {
    if (!isUsingOppositeHand) {
      return baseAccuracy;
    }
    const accuracyMultiplier = this.calculateOppositeHandAccuracy(oppositeAccuracy);
    return baseAccuracy * accuracyMultiplier;
  }

  /**
   * 正面で持ち替えを行うかどうかを判定
   * @param currentHand 現在ボールを持っている手
   * @param dominantHand 利き腕
   * @param oppositeFrequency 非利き腕使用頻度（1〜8）
   * @param targetDirection 目標の保持方向（省略時はランダム判定）
   * @returns 持ち替えを行う場合の目標の手、行わない場合はnull
   */
  public static shouldSwitchHandAtFront(
    currentHand: HoldingHand,
    dominantHand: DominantHand,
    oppositeFrequency: number,
    targetDirection?: number
  ): HoldingHand | null {
    const isCurrentlyUsingOpposite = currentHand !== dominantHand;

    // 目標方向が指定されている場合
    if (targetDirection !== undefined) {
      const targetHand = this.getHoldingHand(targetDirection, dominantHand);
      if (targetHand !== currentHand) {
        return targetHand;
      }
      return null;
    }

    // 目標方向が指定されていない場合の自動判定
    if (isCurrentlyUsingOpposite) {
      // 非利き腕で持っている場合、利き腕に戻す確率
      const switchToDominantProb = this.calculateDominantHandPreference(oppositeFrequency);
      if (Math.random() < switchToDominantProb) {
        return dominantHand;
      }
    } else {
      // 利き腕で持っている場合、非利き腕に持ち替える確率
      const switchToOppositeProb = this.calculateOppositeHandProbability(oppositeFrequency);
      if (Math.random() < switchToOppositeProb) {
        return dominantHand === 'right' ? 'left' : 'right';
      }
    }

    return null;
  }
}
