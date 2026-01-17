/**
 * シュート関連の設定を一元管理するファイル
 * シュートレンジ、精度、弾道に関する定数とユーティリティメソッドを提供
 */

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
 * シュート弾道設定（発射角度：度）
 */
export const SHOOT_LAUNCH_ANGLE = {
  THREE_POINT: 68,                  // 3Pシュート：68度（高い弾道）
  MIDRANGE: 63,                     // ミドルレンジ：63度
  LAYUP: 55,                        // レイアップ：55度（低め）
  DEFAULT: 60,                      // デフォルト：60度
} as const;

/**
 * シュート精度設定（ズレの最大値：メートル）
 */
export const SHOOT_ACCURACY = {
  // 3Pシュートの精度計算式の係数
  THREE_POINT_BASE_ERROR: 0.05,     // 基本誤差（3paccuracy=100でもこの誤差は残る）
  THREE_POINT_MAX_ERROR: 0.75,      // 最大追加誤差（3paccuracy=0の場合）

  // 固定精度
  MIDRANGE: 0.3,                    // ミドルレンジ：±0.3m
  LAYUP: 0.1,                       // レイアップ：±0.1m（高精度）
  DEFAULT: 0.3,                     // デフォルト：±0.3m
} as const;

/**
 * シュート物理設定
 */
export const SHOOT_PHYSICS = {
  RIM_BOUNCE_COEFFICIENT: 0.7,      // リム反発係数
  BACKBOARD_BOUNCE_COEFFICIENT: 0.7, // バックボード反発係数
  NET_FORCE_MULTIPLIER: 0.08,       // ネットへの力の倍率（速度の8%）
  NET_INFLUENCE_RADIUS: 1.5,        // ネットへの影響半径（ボール半径の倍数）
} as const;

/**
 * シュートクールダウン設定（秒）
 */
export const SHOOT_COOLDOWN = {
  AFTER_SHOT: 2.0,                  // シュート後のクールダウン（CharacterAI用）
  SHOOTER_CATCH: 0.5,               // シューター自身がボールをキャッチできない時間
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
   * シュートタイプに応じた発射角度を取得（ラジアン）
   * @param shootType シュートタイプ
   * @returns 発射角度（ラジアン）
   */
  public static getLaunchAngle(shootType: '3pt' | 'midrange' | 'layup' | 'out_of_range'): number {
    let degrees: number;
    switch (shootType) {
      case '3pt':
        degrees = SHOOT_LAUNCH_ANGLE.THREE_POINT;
        break;
      case 'midrange':
        degrees = SHOOT_LAUNCH_ANGLE.MIDRANGE;
        break;
      case 'layup':
        degrees = SHOOT_LAUNCH_ANGLE.LAYUP;
        break;
      default:
        degrees = SHOOT_LAUNCH_ANGLE.DEFAULT;
    }
    return (Math.PI * degrees) / 180;
  }

  /**
   * 3Pシュートの精度（最大誤差）を計算
   * @param accuracy3p 選手の3paccuracyステータス値（0-100）
   * @returns 最大誤差（メートル）
   */
  public static calculate3PAccuracy(accuracy3p: number | undefined): number {
    const accuracy = accuracy3p ?? 50;
    // 計算式: 0.05 + 0.75 × (100 - 3paccuracy) / 100
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
   * オフセット量からゴール可能性を判定
   * @param offsetX X方向のオフセット
   * @param offsetZ Z方向のオフセット
   * @param rimRadius リングの半径
   * @returns ゴール可能な場合true
   */
  public static willScoreByOffset(offsetX: number, offsetZ: number, rimRadius: number): boolean {
    const totalOffset = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
    return totalOffset <= rimRadius;
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
}
