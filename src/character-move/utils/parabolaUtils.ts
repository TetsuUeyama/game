/**
 * 放物線計算ユーティリティ
 * シュートの弾道計算に関する定数とメソッドを提供
 */

/**
 * シュートタイプ
 */
export type ShootType = '3pt' | 'midrange' | 'layup' | 'out_of_range';

/**
 * シュートアーチ高さ設定（メートル）
 * 発射位置と目標位置を結ぶ直線からの最大高さ
 * 放物線: Y = 4h × t × (1 - t) で、t=0.5（中間点）でY=hとなる
 */
export const SHOOT_ARC_HEIGHT = {
  THREE_POINT: 2.2,           // 3Pシュート：2.2m（高めのアーチ）
  MIDRANGE: 1.5,              // ミドルレンジ：1.5m
  LAYUP: 0.8,                 // レイアップ：0.8m（低めのアーチ）
  LAYUP_CLOSE: 0.5,           // レイアップ（近距離）：0.5m
  DEFAULT: 1.2,               // デフォルト：1.2m
  LAYUP_CLOSE_DISTANCE: 1.2,  // レイアップ近距離判定閾値（m）
} as const;

/**
 * 放物線の速度計算結果
 */
export interface ParabolaVelocity {
  vx: number;
  vy: number;
  vz: number;
  flightTime: number;
}

/**
 * 放物線上の位置
 */
export interface ParabolaPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * 放物線計算ユーティリティクラス
 */
export class ParabolaUtils {
  /**
   * シュートタイプに応じたアーチ高さを取得
   * @param shootType シュートタイプ
   * @param distance ゴールまでの距離（レイアップ時の調整用）
   * @returns アーチ高さ（メートル）
   */
  public static getArcHeight(
    shootType: ShootType,
    distance?: number
  ): number {
    switch (shootType) {
      case '3pt':
        return SHOOT_ARC_HEIGHT.THREE_POINT;
      case 'midrange':
        return SHOOT_ARC_HEIGHT.MIDRANGE;
      case 'layup':
        if (distance !== undefined && distance < SHOOT_ARC_HEIGHT.LAYUP_CLOSE_DISTANCE) {
          return SHOOT_ARC_HEIGHT.LAYUP_CLOSE;
        }
        return SHOOT_ARC_HEIGHT.LAYUP;
      default:
        return SHOOT_ARC_HEIGHT.DEFAULT;
    }
  }

  /**
   * アーチ高さから初速度を計算
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
   * @param arcHeight アーチ高さ h（直線からの最大高さ）
   * @param gravity 重力加速度
   * @returns 初速度と飛行時間
   */
  public static calculateVelocityFromArcHeight(
    startX: number,
    startY: number,
    startZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    arcHeight: number,
    gravity: number
  ): ParabolaVelocity {
    // 飛行時間: T = √(8h/g)
    const flightTime = Math.sqrt((8 * arcHeight) / gravity);

    // 各成分の速度
    const vx = (targetX - startX) / flightTime;
    const vy = (targetY - startY + 4 * arcHeight) / flightTime;
    const vz = (targetZ - startZ) / flightTime;

    return { vx, vy, vz, flightTime };
  }

  /**
   * Vector3版：アーチ高さから初速度を計算
   * @param start 発射位置
   * @param target 目標位置
   * @param arcHeight アーチ高さ
   * @param gravity 重力加速度
   * @returns 初速度と飛行時間
   */
  public static calculateVelocity(
    start: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    arcHeight: number,
    gravity: number
  ): ParabolaVelocity {
    return this.calculateVelocityFromArcHeight(
      start.x, start.y, start.z,
      target.x, target.y, target.z,
      arcHeight, gravity
    );
  }

  /**
   * 放物線上の位置を計算
   * @param start 発射位置
   * @param target 目標位置
   * @param arcHeight アーチ高さ
   * @param t 進行度（0〜1）
   * @returns 放物線上の位置
   */
  public static getPositionOnParabola(
    start: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    arcHeight: number,
    t: number
  ): ParabolaPosition {
    // 直線上の基準位置
    const baseX = start.x + t * (target.x - start.x);
    const baseY = start.y + t * (target.y - start.y);
    const baseZ = start.z + t * (target.z - start.z);

    // 放物線によるY方向オフセット: 4h × t × (1 - t)
    const yOffset = 4 * arcHeight * t * (1 - t);

    return {
      x: baseX,
      y: baseY + yOffset,
      z: baseZ,
    };
  }

  /**
   * 水平距離を計算
   * @param start 開始位置
   * @param target 目標位置
   * @returns 水平距離（メートル）
   */
  public static getHorizontalDistance(
    start: { x: number; z: number },
    target: { x: number; z: number }
  ): number {
    return Math.sqrt(
      Math.pow(target.x - start.x, 2) +
      Math.pow(target.z - start.z, 2)
    );
  }
}
