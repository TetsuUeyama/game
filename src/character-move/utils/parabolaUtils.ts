/**
 * 放物線計算ユーティリティ
 * シュートの弾道計算に関する定数とメソッドを提供

*
 * 設計方針:
 * - 解析解（閉形式）を使用して浮動小数点誤差の蓄積を回避
 * - 魔法係数・経験補正は一切使用しない
 * - 単位系: SI単位（m, kg, s）
 *
 * 数値シミュレーションが必要な場合は TrajectorySimulator を使用
 */

/**
 * シュートタイプ
 */
export type ShootType = '3pt' | 'midrange' | 'layup' | 'dunk' | 'out_of_range';

/**
 * シュートアーチ高さ設定（メートル）
 * 発射位置と目標位置を結ぶ直線からの最大高さ
 */
export const SHOOT_ARC_HEIGHT = {
  THREE_POINT: 2.4,           // 3Pシュート：2.4m（高めのアーチ）
  MIDRANGE: 1.5,              // ミドルレンジ：1.5m
  LAYUP: 0.8,                 // レイアップ：0.8m（低めのアーチ）
  LAYUP_CLOSE: 0.6,           // レイアップ（近距離）：0.6m（リムに確実に届く最小値）
  DUNK: 0.01,                 // ダンク：0.01m（ほぼ直線、上から叩き込む）
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
 *
 * すべての計算は解析解（閉形式）を使用
 * 数値積分は行わないため、浮動小数点誤差の蓄積が発生しない
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
      case 'dunk':
        // ダンクはほぼ直線（上から叩き込む低い軌道）
        return SHOOT_ARC_HEIGHT.DUNK;
      default:
        return SHOOT_ARC_HEIGHT.DEFAULT;
    }
  }

  /**
   * 空気抵抗を考慮した初速度を計算（解析解）
   *
   * 線形ダンピング（空気抵抗）を考慮した運動方程式の厳密解:
   *
   * 運動方程式:
   *   水平方向: dv/dt = -k*v
   *   垂直方向: dv/dt = -g - k*v
   *
   * 解析解（厳密解）:
   *   水平方向: x(t) = x₀ + v₀ * (1 - e^(-k*t)) / k
   *   垂直方向: y(t) = y₀ + (v₀ + g/k) * (1 - e^(-k*t)) / k - g*t/k
   *
   * この関数は解析解を逆算して、目標位置に到達するための初速度を計算
   *
   * @param startX 発射位置X (m)
   * @param startY 発射位置Y (m)
   * @param startZ 発射位置Z (m)
   * @param targetX 目標位置X (m)
   * @param targetY 目標位置Y (m)
   * @param targetZ 目標位置Z (m)
   * @param arcHeight アーチ高さ (m) - 飛行時間の計算に使用
   * @param gravity 重力加速度 (m/s²)
   * @param damping 線形ダンピング係数 (1/s)
   * @returns 初速度 (m/s) と飛行時間 (s)
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
    // ダンピングが0または非常に小さい場合は、ダンピングなしの計算を使用
    if (damping < 1e-6) {
      return this.calculateVelocityFromArcHeight(
        startX, startY, startZ,
        targetX, targetY, targetZ,
        arcHeight, gravity
      );
    }

    // 飛行時間: T = √(8h/g)
    // これはダンピングなしの放物線の頂点到達時間×2から導出
    const flightTime = Math.sqrt((8 * arcHeight) / gravity);
    const k = damping;
    const T = flightTime;
    const g = gravity;

    // e^(-k*T) を計算
    const expKT = Math.exp(-k * T);
    // (1 - e^(-k*T)) / k: 積分因子
    const factor = (1 - expKT) / k;

    // 水平方向の初速度（解析解から逆算）
    // x_target = x₀ + v₀_x * factor
    // v₀_x = (x_target - x₀) / factor
    const vx = (targetX - startX) / factor;
    const vz = (targetZ - startZ) / factor;

    // 垂直方向の初速度（解析解から逆算）
    // y_target = y₀ + (v₀_y + g/k) * factor - g*T/k
    // v₀_y = (y_target - y₀ + g*T/k) / factor - g/k
    const vy = (targetY - startY + g * T / k) / factor - g / k;

    return { vx, vy, vz, flightTime };
  }

  /**
   * 空気抵抗を考慮した軌道上の位置を計算（解析解）
   *
   * @param start 発射位置 (m)
   * @param velocity 初速度 (m/s)
   * @param gravity 重力加速度 (m/s²)
   * @param damping 線形ダンピング係数 (1/s)
   * @param time 経過時間 (s)
   * @returns 位置 (m)
   */
  public static getPositionWithDamping(
    start: { x: number; y: number; z: number },
    velocity: { vx: number; vy: number; vz: number },
    gravity: number,
    damping: number,
    time: number
  ): ParabolaPosition {
    // ダンピングが0の場合は通常の放物線
    if (damping < 1e-6) {
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

    // 解析解
    // 水平方向: x(t) = x₀ + v₀ * (1 - e^(-k*t)) / k
    const x = start.x + velocity.vx * factor;
    const z = start.z + velocity.vz * factor;

    // 垂直方向: y(t) = y₀ + (v₀ + g/k) * (1 - e^(-k*t)) / k - g*t/k
    const y = start.y + (velocity.vy + g / k) * factor - g * t / k;

    return { x, y, z };
  }

  /**
   * アーチ高さから初速度を計算（ダンピングなし、解析解）
   *
   * 放物線: y = y₀ + v₀_y*t - 0.5*g*t²
   * 頂点時刻: t_peak = v₀_y / g
   * アーチ高さ: h = v₀_y² / (2g) = v₀_y * t_peak / 2
   *
   * 飛行時間 T とアーチ高さ h の関係:
   *   t_peak = T/2 (対称な放物線を仮定)
   *   h = v₀_y * (T/2) / 2 = v₀_y * T / 4
   *   v₀_y = 4h / T
   *
   * T = √(8h/g) を代入すると:
   *   v₀_y = 4h / √(8h/g) = 4h * √(g/(8h)) = √(2gh)
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
   * 放物線上の位置を計算（ダンピングなし、進行度ベース）
   *
   * @param start 開始位置
   * @param target 目標位置
   * @param arcHeight アーチ高さ
   * @param t 進行度 (0-1)
   */
  public static getPositionOnParabola(
    start: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    arcHeight: number,
    t: number
  ): ParabolaPosition {
    // 線形補間
    const baseX = start.x + t * (target.x - start.x);
    const baseY = start.y + t * (target.y - start.y);
    const baseZ = start.z + t * (target.z - start.z);

    // 放物線のY成分オフセット: 4h*t*(1-t)
    // t=0.5 で最大値 h に達する
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
    const dx = target.x - start.x;
    const dz = target.z - start.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
