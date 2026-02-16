/**
 * ドリブル関連の設定を一元管理するファイル
 * 1on1バトル時のドリブル動作に関する定数とユーティリティメソッドを提供
 */

/**
 * ドリブル基本設定
 */
export const DRIBBLE_CONFIG = {
  // ドリブル移動速度
  BASE_MOVE_SPEED: 3.0,           // 基本移動速度

  // ドリブル突破設定
  BREAKTHROUGH_DURATION: 150,      // 突破継続時間（ミリ秒）
  BREAKTHROUGH_SPEED: 2.5,         // 突破時の速度倍率
  BREAKTHROUGH_CHANCE: 0.3,        // AIがドリブル突破を選択する確率（30%）
  BREAKTHROUGH_ANGLE: Math.PI / 4, // 突破角度（45度、左右）

  // ディレイ設定
  DEFAULT_DELAY_MS: 1000,          // デフォルトの反応遅延（ミリ秒）

  // フェイント設定
  FEINT_BASE_CHANCE: 0.2,          // 基本フェイント確率（20%）
  FEINT_SPEED_MULTIPLIER: 1.2,     // フェイント時のディフェンダー速度倍率
} as const;

/**
 * ドリブル関連のユーティリティメソッド
 */
export class DribbleUtils {
  /**
   * dribblingspeedステータスに基づいた移動速度を計算
   * @param dribblingspeed 選手のdribblingspeedステータス値
   * @returns 調整後の移動速度
   */
  public static calculateDribblingSpeed(dribblingspeed: number | undefined): number {
    if (dribblingspeed === undefined) {
      return DRIBBLE_CONFIG.BASE_MOVE_SPEED;
    }
    return DRIBBLE_CONFIG.BASE_MOVE_SPEED * (dribblingspeed / 100);
  }

  /**
   * quicknessに基づいた遅延時間を計算（動き直し時）
   * @param quickness 選手のquicknessステータス値
   * @returns 遅延時間（ミリ秒）
   */
  public static calculateQuicknessDelay(quickness: number | undefined): number {
    if (quickness === undefined) {
      return DRIBBLE_CONFIG.DEFAULT_DELAY_MS;
    }
    // (100 - quickness) * 10 ミリ秒
    return Math.max(0, (100 - quickness) * 10);
  }

  /**
   * reflexesに基づいた反応遅延時間を計算（初回動き出し時）
   * @param reflexes 選手のreflexesステータス値
   * @returns 遅延時間（ミリ秒）
   */
  public static calculateReflexesDelay(reflexes: number | undefined): number {
    if (reflexes === undefined) {
      return DRIBBLE_CONFIG.DEFAULT_DELAY_MS;
    }
    // 1000 - reflexes ミリ秒
    return Math.max(0, 1000 - reflexes);
  }

  /**
   * techniqueに基づいたフェイント確率を計算
   * @param technique 選手のtechniqueステータス値
   * @returns フェイント確率（0.0～1.0）
   */
  public static calculateFeintChance(technique: number | undefined): number {
    if (technique === undefined) {
      return DRIBBLE_CONFIG.FEINT_BASE_CHANCE;
    }
    // technique / 200
    return technique / 200;
  }

  /**
   * ドリブル突破時の速度を計算
   * @param baseSpeed 基準速度（CHARACTER_CONFIG.speed）
   * @param dribblingspeed 選手のdribblingspeedステータス値
   * @returns 突破時の速度
   */
  public static calculateBreakthroughSpeed(
    baseSpeed: number,
    dribblingspeed: number | undefined
  ): number {
    let dribblingSpeedMultiplier = 1.0;
    if (dribblingspeed !== undefined) {
      dribblingSpeedMultiplier = dribblingspeed / 100;
    }
    return baseSpeed * DRIBBLE_CONFIG.BREAKTHROUGH_SPEED * dribblingSpeedMultiplier;
  }

  /**
   * ドリブル突破が可能かどうかを判定
   * @param currentBallFace 現在のボール保持面番号
   * @param isInBreakthrough 既に突破中かどうか
   * @returns 突破可能な場合はtrue
   */
  public static canStartBreakthrough(
    currentBallFace: number,
    isInBreakthrough: boolean
  ): boolean {
    // 0番面（正面）かつ突破中でない場合のみ可能
    return currentBallFace === 0 && !isInBreakthrough;
  }

  /**
   * AIがドリブル突破を試みるかどうかを判定
   * @returns 突破を試みる場合はtrue
   */
  public static shouldAIAttemptBreakthrough(): boolean {
    return Math.random() < DRIBBLE_CONFIG.BREAKTHROUGH_CHANCE;
  }

  /**
   * 突破方向の角度を計算
   * @param characterRotation キャラクターの現在の向き（ラジアン）
   * @param direction 突破方向（'left' または 'right'）
   * @returns 突破角度（ラジアン）
   */
  public static calculateBreakthroughAngle(
    characterRotation: number,
    direction: 'left' | 'right'
  ): number {
    const angleOffset = direction === 'left'
      ? -DRIBBLE_CONFIG.BREAKTHROUGH_ANGLE
      : DRIBBLE_CONFIG.BREAKTHROUGH_ANGLE;
    return characterRotation + angleOffset;
  }
}
