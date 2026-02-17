/**
 * ダッシュ速度・加速関連の設定
 * AI移動時のダッシュ加速挙動を制御する定数を提供
 */

export const DASH_SPEED_CONFIG = {
  /** ダッシュ開始時の速度（最高速度に対する比率、0.5 = 50%） */
  INITIAL_SPEED_RATIO: 0.5,

  /** トップスピードに到達するまでの時間（秒） */
  ACCELERATION_DURATION: 3.0,

  /** ダッシュ時の速度倍率（歩行速度に対する倍率） */
  DASH_SPEED_MULTIPLIER: 1.8,
} as const;

/**
 * ダッシュ加速ユーティリティ
 */
export class DashSpeedUtils {
  /**
   * 経過時間から加速率を計算（0.0〜1.0）
   * @param elapsedSeconds ダッシュ開始からの経過時間（秒）
   * @returns 加速率（0.0 = 開始直後、1.0 = トップスピード到達）
   */
  public static calculateAcceleration(elapsedSeconds: number): number {
    return Math.min(1.0, elapsedSeconds / DASH_SPEED_CONFIG.ACCELERATION_DURATION);
  }

  /**
   * 加速率から実効速度比率を計算
   * INITIAL_SPEED_RATIO からスタートし、1.0 まで線形に補間
   * @param acceleration 加速率（0.0〜1.0）
   * @returns 速度比率（INITIAL_SPEED_RATIO〜1.0）
   */
  public static calculateSpeedRatio(acceleration: number): number {
    const initial = DASH_SPEED_CONFIG.INITIAL_SPEED_RATIO;
    return initial + (1 - initial) * acceleration;
  }

  /**
   * 加速率から実効速度倍率を計算（歩行速度に対する倍率）
   * @param acceleration 加速率（0.0〜1.0）
   * @returns 速度倍率
   */
  public static calculateSpeedMultiplier(acceleration: number): number {
    return DASH_SPEED_CONFIG.DASH_SPEED_MULTIPLIER * DashSpeedUtils.calculateSpeedRatio(acceleration);
  }
}
