/**
 * 放物線計算ユーティリティ
 * シュートの弾道計算に関する定数とメソッドを提供
 * 空気抵抗（線形ダンピング）を考慮した計算をサポート
 */

/**
 * シュートタイプ
 */
export type ShootType = '3pt' | 'midrange' | 'layup' | 'out_of_range';

/**
 * シュートアーチ高さ設定（メートル）
 * 発射位置と目標位置を結ぶ直線からの最大高さ
 */
export const SHOOT_ARC_HEIGHT = {
  THREE_POINT: 2.4,           // 3Pシュート：2.2m（高めのアーチ）
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
   * 空気抵抗を考慮した初速度を計算
   *
   * 線形ダンピング（空気抵抗）を考慮した運動方程式の解析解を使用
   *
   * 水平方向: dv/dt = -k*v
   *   位置: x(t) = x₀ + v₀ * (1 - e^(-k*t)) / k
   *
   * 垂直方向: dv/dt = -g - k*v
   *   位置: y(t) = y₀ + (v₀ + g/k) * (1 - e^(-k*t)) / k - g*t/k
   *
   * @param startX 発射位置X
   * @param startY 発射位置Y
   * @param startZ 発射位置Z
   * @param targetX 目標位置X
   * @param targetY 目標位置Y
   * @param targetZ 目標位置Z
   * @param arcHeight アーチ高さ（飛行時間の計算に使用）
   * @param gravity 重力加速度
   * @param damping 線形ダンピング係数（空気抵抗）
   * @returns 初速度と飛行時間
   */
  public static calculateVelocityWithDamping(
    startX: number,
    startY: number,
    startZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    arcHeight: number,
    gravity: number,
    damping: number
  ): ParabolaVelocity {
    // ダンピングが0または非常に小さい場合は、通常の計算を使用
    if (damping < 0.001) {
      return this.calculateVelocityFromArcHeight(
        startX, startY, startZ,
        targetX, targetY, targetZ,
        arcHeight, gravity
      );
    }

    // 飛行時間: ダンピングなしの場合と同じ値を使用
    const flightTime = Math.sqrt((8 * arcHeight) / gravity);
    const k = damping;
    const T = flightTime;
    const g = gravity;

    // e^(-k*T) を計算
    const expKT = Math.exp(-k * T);
    // (1 - e^(-k*T)) / k
    const factor = (1 - expKT) / k;

    // 水平方向の初速度
    // x_target = x₀ + v₀_x * (1 - e^(-k*T)) / k
    // v₀_x = (x_target - x₀) / factor
    const vx = (targetX - startX) / factor;
    const vz = (targetZ - startZ) / factor;

    // 垂直方向の初速度
    // y_target = y₀ + (v₀_y + g/k) * factor - g*T/k
    // (v₀_y + g/k) * factor = y_target - y₀ + g*T/k
    // v₀_y = (y_target - y₀ + g*T/k) / factor - g/k
    const vy = (targetY - startY + g * T / k) / factor - g / k;

    return { vx, vy, vz, flightTime };
  }

  /**
   * 空気抵抗を考慮した軌道上の位置を計算
   *
   * @param start 発射位置
   * @param velocity 初速度
   * @param gravity 重力加速度
   * @param damping 線形ダンピング係数
   * @param time 経過時間
   * @returns 位置
   */
  public static getPositionWithDamping(
    start: { x: number; y: number; z: number },
    velocity: { vx: number; vy: number; vz: number },
    gravity: number,
    damping: number,
    time: number
  ): ParabolaPosition {
    // ダンピングが0の場合は通常の放物線
    if (damping < 0.001) {
      return {
        x: start.x + velocity.vx * time,
        y: start.y + velocity.vy * time - 0.5 * gravity * time * time,
        z: start.z + velocity.vz * time,
      };
    }

    const k = damping;
    const g = gravity;
    const t = time;
    const expKT = Math.exp(-k * t);
    const factor = (1 - expKT) / k;

    // 水平方向: x(t) = x₀ + v₀ * (1 - e^(-k*t)) / k
    const x = start.x + velocity.vx * factor;
    const z = start.z + velocity.vz * factor;

    // 垂直方向: y(t) = y₀ + (v₀ + g/k) * (1 - e^(-k*t)) / k - g*t/k
    const y = start.y + (velocity.vy + g / k) * factor - g * t / k;

    return { x, y, z };
  }

  /**
   * アーチ高さから初速度を計算（ダンピングなし版）
   * @deprecated calculateVelocityWithDamping を使用してください
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
   * 放物線上の位置を計算（ダンピングなし版、進行度ベース）
   */
  public static getPositionOnParabola(
    start: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    arcHeight: number,
    t: number
  ): ParabolaPosition {
    const baseX = start.x + t * (target.x - start.x);
    const baseY = start.y + t * (target.y - start.y);
    const baseZ = start.z + t * (target.z - start.z);
    const yOffset = 4 * arcHeight * t * (1 - t);

    return {
      x: baseX,
      y: baseY + yOffset,
      z: baseZ,
    };
  }

  /**
   * 水平距離を計算
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
