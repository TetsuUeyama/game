/**
 * シュート関連の設定を一元管理するファイル
 * シュートレンジ、精度に関する定数とユーティリティメソッドを提供
 */

import { ParabolaUtils, SHOOT_ARC_HEIGHT } from "../utils/parabolaUtils";

// parabolaUtilsから再エクスポート（既存コードとの互換性のため）
export { SHOOT_ARC_HEIGHT, ParabolaUtils };

/**
 * シュートレンジ設定（距離：メートル）
 */
export const SHOOT_RANGE = {
  // 3ポイントシュート
  THREE_POINT_LINE: 6.75,          // 3Pライン（NBA/FIBA基準）
  THREE_POINT_MAX: 10.0,           // 3Pシュート最大距離

  // ミドルレンジシュート
  MIDRANGE_MIN: 2.0,               // ミドルレンジ最小距離
  MIDRANGE_MAX: 6.75,              // ミドルレンジ最大距離（= 3Pライン）

  // レイアップ
  LAYUP_MIN: 0.5,                  // レイアップ最小距離（ゴール直下は打てない）
  LAYUP_MAX: 2.0,                  // レイアップ最大距離
} as const;

/**
 * シュート角度設定（ラジアン）
 * 0番面からゴール方向への許容角度範囲
 */
export const SHOOT_ANGLE = {
  THREE_POINT: Math.PI * 5 / 180,   // 3Pシュート：±5度（合計10度）
  MIDRANGE: Math.PI * 20 / 180,     // ミドルシュート：±20度（合計40度）
  LAYUP: Math.PI * 90 / 180,        // レイアップ：±90度（合計180度）
  FACING_GOAL: Math.PI / 4,         // ゴール方向判定：±45度
  DEFAULT: Math.PI / 6,             // デフォルト：±30度
} as const;

/**
 * シュート精度設定（ズレの最大値：メートル）
 */
export const SHOOT_ACCURACY = {
  // 3Pシュートの精度（現在は0に設定）
  THREE_POINT_BASE_ERROR: 0,        // 基本誤差
  THREE_POINT_MAX_ERROR: 0,         // 最大追加誤差

  // 固定精度
  MIDRANGE: 0.01,                   // ミドルレンジ：±0.01m
  LAYUP: 0.01,                      // レイアップ：±0.01m（高精度）
  DEFAULT: 0.3,                     // デフォルト：±0.3m
} as const;

/**
 * シュート物理設定
 * リム・バックボードの反発係数はHavok物理エンジン（PhysicsConfig.ts）で設定
 */
export const SHOOT_PHYSICS = {
  NET_FORCE_MULTIPLIER: 0.08,       // ネットへの力の倍率（速度の8%）
  NET_INFLUENCE_RADIUS: 1.5,        // ネットへの影響半径（ボール半径の倍数）
} as const;

/**
 * シュートクールダウン設定（秒）
 */
export const SHOOT_COOLDOWN = {
  AFTER_SHOT: 2.0,                  // シュート後のクールダウン（CharacterAI用）
} as const;

/**
 * シュート開始位置オフセット（メートル）
 */
export const SHOOT_START_OFFSET = {
  HEAD_OFFSET: 0.3,                 // 頭上からのオフセット（相手に取られないように）
} as const;

/**
 * シュート関連のユーティリティメソッド
 */
export class ShootingUtils {
  /**
   * シュートタイプを距離から判定
   * @param distance ゴールまでの距離（メートル）
   * @returns シュートタイプ
   */
  public static getShootTypeByDistance(distance: number): '3pt' | 'midrange' | 'layup' | 'out_of_range' {
    if (distance >= SHOOT_RANGE.THREE_POINT_LINE && distance <= SHOOT_RANGE.THREE_POINT_MAX) {
      return '3pt';
    } else if (distance >= SHOOT_RANGE.MIDRANGE_MIN && distance < SHOOT_RANGE.THREE_POINT_LINE) {
      return 'midrange';
    } else if (distance >= SHOOT_RANGE.LAYUP_MIN && distance < SHOOT_RANGE.LAYUP_MAX) {
      return 'layup';
    }
    return 'out_of_range';
  }

  /**
   * シュートタイプが有効なレンジ内かどうかを判定
   * @param distance ゴールまでの距離（メートル）
   * @returns 有効なレンジ内の場合true
   */
  public static isInShootRange(distance: number): boolean {
    return this.getShootTypeByDistance(distance) !== 'out_of_range';
  }

  /**
   * シュートタイプに応じた角度範囲を取得
   * @param shootType シュートタイプ
   * @returns 角度範囲（ラジアン）
   */
  public static getAngleRangeByShootType(shootType: '3pt' | 'midrange' | 'layup' | 'out_of_range'): number {
    switch (shootType) {
      case '3pt':
        return SHOOT_ANGLE.THREE_POINT;
      case 'midrange':
        return SHOOT_ANGLE.MIDRANGE;
      case 'layup':
        return SHOOT_ANGLE.LAYUP;
      default:
        return SHOOT_ANGLE.DEFAULT;
    }
  }

  /**
   * 3Pシュートの精度（最大誤差）を計算
   */
  private static calculate3PAccuracy(accuracy3p: number | undefined): number {
    const accuracy = accuracy3p ?? 100;
    return SHOOT_ACCURACY.THREE_POINT_BASE_ERROR +
      SHOOT_ACCURACY.THREE_POINT_MAX_ERROR * (100 - accuracy) / 100;
  }

  /**
   * シュートタイプに応じた精度（最大誤差）を取得
   * @param shootType シュートタイプ
   * @param accuracy3p 3Pシュートの場合の精度ステータス
   * @returns 最大誤差（メートル）
   */
  public static getAccuracyByShootType(
    shootType: '3pt' | 'midrange' | 'layup' | 'out_of_range',
    accuracy3p?: number
  ): number {
    switch (shootType) {
      case '3pt':
        return this.calculate3PAccuracy(accuracy3p);
      case 'midrange':
        return SHOOT_ACCURACY.MIDRANGE;
      case 'layup':
        return SHOOT_ACCURACY.LAYUP;
      default:
        return SHOOT_ACCURACY.DEFAULT;
    }
  }

  /**
   * ランダムなシュートオフセットを生成
   * @param accuracy 最大誤差（メートル）
   * @returns {x, z} オフセット値
   */
  public static generateRandomOffset(accuracy: number): { x: number; z: number } {
    return {
      x: (Math.random() - 0.5) * 2 * accuracy,
      z: (Math.random() - 0.5) * 2 * accuracy,
    };
  }

  /**
   * シュートタイプの日本語名を取得
   * @param shootType シュートタイプ
   * @returns 日本語名
   */
  public static getShootTypeName(shootType: '3pt' | 'midrange' | 'layup' | 'out_of_range'): string {
    switch (shootType) {
      case '3pt':
        return '3ポイント';
      case 'midrange':
        return 'ミドルレンジ';
      case 'layup':
        return 'レイアップ';
      default:
        return '不明';
    }
  }

  /**
   * シュートタイプに応じたアーチ高さを取得
   * @deprecated ParabolaUtils.getArcHeight を使用してください
   */
  public static getArcHeight(
    shootType: '3pt' | 'midrange' | 'layup' | 'out_of_range',
    distance?: number
  ): number {
    return ParabolaUtils.getArcHeight(shootType, distance);
  }

  /**
   * アーチ高さから初速度を計算
   * @deprecated ParabolaUtils.calculateVelocityFromArcHeight を使用してください
   */
  public static calculateVelocityFromArcHeight(
    startX: number,
    startY: number,
    startZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    arcHeight: number,
    gravity: number = 9.81
  ): { vx: number; vy: number; vz: number; flightTime: number } {
    return ParabolaUtils.calculateVelocityFromArcHeight(
      startX, startY, startZ,
      targetX, targetY, targetZ,
      arcHeight, gravity
    );
  }
}
