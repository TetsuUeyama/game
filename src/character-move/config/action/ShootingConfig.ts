/**
 * シュート関連の設定を一元管理するファイル
 * シュートレンジ、精度に関する定数とユーティリティメソッドを提供
 */

import { ParabolaUtils, SHOOT_ARC_HEIGHT } from "@/physics/trajectory/ParabolaUtils";

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
  LAYUP_MIN: 0.0,                  // レイアップ最小距離（ゴール直下でも打てる）
  LAYUP_MAX: 2.0,                  // レイアップ最大距離

  // ダンク（ジャンプ中のみ）
  DUNK_MIN: 0.0,                   // ダンク最小距離
  DUNK_MAX: 1.5,                   // ダンク最大距離（リムに届く範囲）- 基準値（jump=50時）
  DUNK_MAX_EXTENDED: 3.5,         // ダンク最大距離（jump=100時）
  DUNK_JUMP_BASE: 50,              // ジャンプ基準値（この値でDUNK_MAX）
  DUNK_JUMP_MAX: 100,              // ジャンプ最大値（この値でDUNK_MAX_EXTENDED）
} as const;

/**
 * シュート角度設定（ラジアン）
 * 0番面からゴール方向への許容角度範囲
 */
export const SHOOT_ANGLE = {
  THREE_POINT: Math.PI * 5 / 180,   // 3Pシュート：±5度（合計10度）
  MIDRANGE: Math.PI * 20 / 180,     // ミドルシュート：±20度（合計40度）
  LAYUP: Math.PI * 90 / 180,        // レイアップ：±90度（合計180度）
  DUNK: Math.PI * 60 / 180,         // ダンク：±60度（合計120度）
  FACING_GOAL: Math.PI / 4,         // ゴール方向判定：±45度
  DEFAULT: Math.PI / 6,             // デフォルト：±30度
} as const;

/**
 * シュート精度設定
 * 3Pとミドルはステータス判定で外れた場合にXYZブレを適用
 * レイアップ・ダンクは従来通りの固定精度
 */
export const SHOOT_ACCURACY = {
  // 3Pシュートのブレ幅（ステータス判定で外れた場合に適用）
  THREE_POINT_ERROR_X: 0.3,         // X軸（左右）最大ブレ幅（m）
  THREE_POINT_ERROR_Y: 0.15,        // Y軸（高さ）最大ブレ幅（m）
  THREE_POINT_ERROR_Z: 0.3,         // Z軸（前後）最大ブレ幅（m）

  // ミドルシュートのブレ幅（ステータス判定で外れた場合に適用）
  MIDRANGE_ERROR_X: 0.2,            // X軸（左右）最大ブレ幅（m）
  MIDRANGE_ERROR_Y: 0.1,            // Y軸（高さ）最大ブレ幅（m）
  MIDRANGE_ERROR_Z: 0.2,            // Z軸（前後）最大ブレ幅（m）

  // 固定精度（レイアップ・ダンク等）
  LAYUP: 0.01,                      // レイアップ：±0.01m（高精度）
  DUNK: 0,                          // ダンク：誤差なし（ボールを直接リムに置く）
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
   * ジャンプステータスに応じたダンク最大距離を計算
   * @param jumpStat ジャンプステータス値（0-100）
   * @returns ダンク最大距離（メートル）
   */
  public static getDunkMaxRange(jumpStat: number): number {
    // ジャンプ値を0-100の範囲にクランプ
    const clampedJump = Math.max(0, Math.min(100, jumpStat));

    // 線形補間: jump=50 → 1.5m, jump=100 → 3.5m
    // jump < 50 の場合も対応（ただしDUNK_MINより小さくはしない）
    const jumpRange = SHOOT_RANGE.DUNK_JUMP_MAX - SHOOT_RANGE.DUNK_JUMP_BASE;
    const distanceRange = SHOOT_RANGE.DUNK_MAX_EXTENDED - SHOOT_RANGE.DUNK_MAX;

    // jump=50を基準に線形補間
    const jumpOffset = clampedJump - SHOOT_RANGE.DUNK_JUMP_BASE;
    const maxRange = SHOOT_RANGE.DUNK_MAX + (distanceRange * jumpOffset / jumpRange);

    // 最小値を保証
    return Math.max(SHOOT_RANGE.DUNK_MIN, maxRange);
  }

  /**
   * シュートタイプを距離から判定
   * @param distance ゴールまでの距離（メートル）
   * @param isJumping ジャンプ中かどうか（通常のダンク判定用）
   * @param forceDunk ダンクレンジ内で強制的にダンクを返す（シュートチェックモード用）
   * @param jumpStat ジャンプステータス値（ダンク距離計算用、省略時は50）
   * @returns シュートタイプ
   */
  public static getShootTypeByDistance(
    distance: number,
    isJumping: boolean = false,
    forceDunk: boolean = false,
    jumpStat: number = 50
  ): '3pt' | 'midrange' | 'layup' | 'dunk' | 'out_of_range' {
    // ダンクレンジ内でダンクを返す条件:
    // - forceDunk=true（シュートチェックモード）の場合: ジャンプ不要（モーションにジャンプ含む）
    // - 通常: ジャンプ中のみ
    const dunkMaxRange = this.getDunkMaxRange(jumpStat);
    if ((forceDunk || isJumping) && distance >= SHOOT_RANGE.DUNK_MIN && distance <= dunkMaxRange) {
      return 'dunk';
    }
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
  public static getAngleRangeByShootType(shootType: '3pt' | 'midrange' | 'layup' | 'dunk' | 'out_of_range'): number {
    switch (shootType) {
      case '3pt':
        return SHOOT_ANGLE.THREE_POINT;
      case 'midrange':
        return SHOOT_ANGLE.MIDRANGE;
      case 'layup':
        return SHOOT_ANGLE.LAYUP;
      case 'dunk':
        return SHOOT_ANGLE.DUNK;
      default:
        return SHOOT_ANGLE.DEFAULT;
    }
  }

  /**
   * シュートタイプに応じた精度（最大誤差）を取得
   * ※ 3pt/midrangeは新しいisAccurateShot + generateRandomOffset3Dフローを使用
   *   このメソッドはレイアップ・ダンク等の従来フロー用に残す
   * @param shootType シュートタイプ
   * @returns 最大誤差（メートル）
   */
  public static getAccuracyByShootType(
    shootType: '3pt' | 'midrange' | 'layup' | 'dunk' | 'out_of_range'
  ): number {
    switch (shootType) {
      case 'layup':
        return SHOOT_ACCURACY.LAYUP;
      case 'dunk':
        return SHOOT_ACCURACY.DUNK;
      default:
        return SHOOT_ACCURACY.DEFAULT;
    }
  }

  /**
   * ステータス値に基づいてシュートがブレるかを判定
   * @param statValue 精度ステータス（0-100）= 完璧な軌道になる確率(%)
   * @returns true: ブレなし（完璧）、false: ブレあり
   */
  public static isAccurateShot(statValue: number): boolean {
    const clampedStat = Math.max(0, Math.min(100, statValue));
    return Math.random() * 100 < clampedStat;
  }

  /**
   * 3Dランダムオフセットを生成（XYZ軸それぞれにブレを適用）
   * @param errorX X軸（左右）最大ブレ幅
   * @param errorY Y軸（高さ）最大ブレ幅
   * @param errorZ Z軸（前後）最大ブレ幅
   * @returns {x, y, z} オフセット値
   */
  public static generateRandomOffset3D(
    errorX: number, errorY: number, errorZ: number
  ): { x: number; y: number; z: number } {
    return {
      x: (Math.random() - 0.5) * 2 * errorX,
      y: (Math.random() - 0.5) * 2 * errorY,
      z: (Math.random() - 0.5) * 2 * errorZ,
    };
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
  public static getShootTypeName(shootType: '3pt' | 'midrange' | 'layup' | 'dunk' | 'out_of_range'): string {
    switch (shootType) {
      case '3pt':
        return '3ポイント';
      case 'midrange':
        return 'ミドルレンジ';
      case 'layup':
        return 'レイアップ';
      case 'dunk':
        return 'ダンク';
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
