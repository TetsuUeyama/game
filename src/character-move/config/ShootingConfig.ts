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
 * ※レガシー設定：新しいアーチ高さ設定を使用する場合は SHOOT_ARC_HEIGHT を参照
 */
export const SHOOT_LAUNCH_ANGLE = {
  THREE_POINT: 60,                  // 3Pシュート：60度（高めの弾道）
  MIDRANGE: 55,                     // ミドルレンジ：55度（やや高めの弾道）
  LAYUP: 70,                        // レイアップ：70度（基本の高弾道）
  LAYUP_CLOSE: 80,                  // レイアップ（近距離）：80度（より優しい弾道）
  DEFAULT: 50,                      // デフォルト：50度
} as const;

/**
 * レイアップ距離による角度調整設定
 * ※レガシー設定：新しいアーチ高さ設定を使用する場合は SHOOT_ARC_HEIGHT を参照
 */
export const LAYUP_DISTANCE_ADJUSTMENT = {
  // 距離閾値（この距離以下でより高い角度を使用）
  CLOSE_DISTANCE: 1.2,              // 1.2m以下で近距離扱い
  // 角度補間（距離に応じて線形補間）
  MIN_DISTANCE: 0.5,                // 最小距離
  MAX_DISTANCE: 2.0,                // 最大距離（レイアップ範囲）
  MIN_ANGLE: 80,                    // 最小距離での角度（度）
  MAX_ANGLE: 70,                    // 最大距離での角度（度）
} as const;

/**
 * シュートアーチ高さ設定（メートル）
 * 発射位置と目標位置を結ぶ直線からの最大高さ
 * 放物線: Y = 4h × t × (1 - t) で、t=0.5（中間点）でY=hとなる
 */
export const SHOOT_ARC_HEIGHT = {
  // 基本アーチ高さ（シュートタイプ別）
  THREE_POINT: 2.8,                 // 3Pシュート：1.8m（高めのアーチ）
  MIDRANGE: 1.5,                    // ミドルレンジ：1.5m
  LAYUP: 0.8,                       // レイアップ：0.8m（低めのアーチ）
  LAYUP_CLOSE: 0.5,                 // レイアップ（近距離）：0.5m
  DEFAULT: 1.2,                     // デフォルト：1.2m
} as const;

/**
 * シュート精度設定（ズレの最大値：メートル）
 */
export const SHOOT_ACCURACY = {
  // 3Pシュートの精度計算式の係数
  // THREE_POINT_BASE_ERROR: 0.05,     // 基本誤差（3paccuracy=100でもこの誤差は残る）
  // THREE_POINT_MAX_ERROR: 0.1,      // 最大追加誤差（3paccuracy=0の場合）
  THREE_POINT_BASE_ERROR: 0,     // 基本誤差（3paccuracy=100でもこの誤差は残る）
  THREE_POINT_MAX_ERROR: 0,      // 最大追加誤差（3paccuracy=0の場合）

  // 固定精度
  MIDRANGE: 0.01,                    // ミドルレンジ：±0.3m
  LAYUP: 0.01,                       // レイアップ：±0.1m（高精度）
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
   * 距離を考慮した発射角度を取得（ラジアン）
   * レイアップの場合、距離が近いほど高い角度（優しい弾道）になる
   * @param shootType シュートタイプ
   * @param distance ゴールまでの距離（メートル）
   * @returns 発射角度（ラジアン）
   */
  public static getLaunchAngleWithDistance(
    shootType: '3pt' | 'midrange' | 'layup' | 'out_of_range',
    distance: number
  ): number {
    // レイアップ以外は通常の角度を返す
    if (shootType !== 'layup') {
      return this.getLaunchAngle(shootType);
    }

    // レイアップ：距離に応じて角度を補間
    const { MIN_DISTANCE, MAX_DISTANCE, MIN_ANGLE, MAX_ANGLE } = LAYUP_DISTANCE_ADJUSTMENT;

    // 距離を範囲内にクランプ
    const clampedDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));

    // 線形補間（距離が近いほど角度が高い）
    // t = 0（最小距離）→ MIN_ANGLE（80度）
    // t = 1（最大距離）→ MAX_ANGLE（70度）
    const t = (clampedDistance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
    const degrees = MIN_ANGLE + t * (MAX_ANGLE - MIN_ANGLE);

    return (Math.PI * degrees) / 180;
  }

  /**
   * 3Pシュートの精度（最大誤差）を計算
   * @param accuracy3p 選手の3paccuracyステータス値（0-100）
   * @returns 最大誤差（メートル）
   */
  public static calculate3PAccuracy(accuracy3p: number | undefined): number {
    const accuracy = accuracy3p ?? 100;
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

  /**
   * シュートタイプに応じたアーチ高さを取得
   * @param shootType シュートタイプ
   * @param distance ゴールまでの距離（レイアップ時の調整用）
   * @returns アーチ高さ（メートル）
   */
  public static getArcHeight(
    shootType: '3pt' | 'midrange' | 'layup' | 'out_of_range',
    distance?: number
  ): number {
    switch (shootType) {
      case '3pt':
        return SHOOT_ARC_HEIGHT.THREE_POINT;
      case 'midrange':
        return SHOOT_ARC_HEIGHT.MIDRANGE;
      case 'layup':
        // レイアップは距離に応じて補間
        if (distance !== undefined && distance < LAYUP_DISTANCE_ADJUSTMENT.CLOSE_DISTANCE) {
          return SHOOT_ARC_HEIGHT.LAYUP_CLOSE;
        }
        return SHOOT_ARC_HEIGHT.LAYUP;
      default:
        return SHOOT_ARC_HEIGHT.DEFAULT;
    }
  }

  /**
   * アーチ高さから初速度を計算（新しい放物線計算方式）
   *
   * 放物線: Y = 4h × t × (1 - t)
   * ここで t は 0（発射位置）から 1（目標位置）の進行度
   * t = 0.5（中間点）で Y = h（最高到達点）
   *
   * 物理との対応:
   *   飛行時間 T = √(8h/g)
   *   vx = (x2 - x1) / T
   *   vy = (y2 - y1 + 4h) / T
   *   vz = (z2 - z1) / T
   *
   * @param startX 発射位置X
   * @param startY 発射位置Y
   * @param startZ 発射位置Z
   * @param targetX 目標位置X
   * @param targetY 目標位置Y
   * @param targetZ 目標位置Z
   * @param arcHeight アーチ高さ h（直線Lからの最大高さ）
   * @param gravity 重力加速度（デフォルト: 9.81）
   * @returns { vx, vy, vz, flightTime } 初速度と飛行時間
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
    // 飛行時間: T = √(8h/g)
    const flightTime = Math.sqrt((8 * arcHeight) / gravity);

    // 各成分の速度
    const vx = (targetX - startX) / flightTime;
    const vy = (targetY - startY + 4 * arcHeight) / flightTime;
    const vz = (targetZ - startZ) / flightTime;

    return { vx, vy, vz, flightTime };
  }

  /**
   * 放物線上の位置を計算（デバッグ・可視化用）
   * @param startX 発射位置X
   * @param startY 発射位置Y
   * @param startZ 発射位置Z
   * @param targetX 目標位置X
   * @param targetY 目標位置Y
   * @param targetZ 目標位置Z
   * @param arcHeight アーチ高さ
   * @param t 進行度（0〜1）
   * @returns { x, y, z } 放物線上の位置
   */
  public static getParabolaPosition(
    startX: number,
    startY: number,
    startZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    arcHeight: number,
    t: number
  ): { x: number; y: number; z: number } {
    // 直線上の基準位置
    const baseX = startX + t * (targetX - startX);
    const baseY = startY + t * (targetY - startY);
    const baseZ = startZ + t * (targetZ - startZ);

    // 放物線によるY方向オフセット: 4h × t × (1 - t)
    const yOffset = 4 * arcHeight * t * (1 - t);

    return {
      x: baseX,
      y: baseY + yOffset,
      z: baseZ,
    };
  }
}
