/**
 * 決定論的軌道計算システム
 *
 * 2レイヤー構造:
 * 1. BaseTrajectory - 完全決定的な基準軌道（解析解）
 * 2. NoiseLayer - seed付き乱数による揺らぎ
 *
 * 設計原則:
 * - 同じ入力なら常に同じ出力
 * - フレーム積分を使わない（解析解のみ）
 * - Math.random() を使わない（seeded PRNG）
 * - 浮動小数点累積誤差なし
 */

// ============================================================
// 型定義
// ============================================================

/**
 * 3次元ベクトル
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 軌道パラメータ（イミュータブル）
 */
export interface TrajectoryParams {
  readonly start: Vec3;
  readonly target: Vec3;
  readonly arcHeight: number;
  readonly gravity: number;
  readonly damping: number;
}

/**
 * 軌道上の点
 */
export interface TrajectoryPoint {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly time: number;
}

/**
 * ノイズパラメータ
 */
export interface NoiseParams {
  readonly seed: number;
  readonly positionAmplitude: Vec3;  // 位置ノイズの振幅 (m)
  readonly velocityAmplitude: Vec3;  // 速度ノイズの振幅 (m/s)
  readonly frequency: number;         // ノイズの周波数
}

// ============================================================
// Seeded PRNG (Mulberry32)
// ============================================================

/**
 * Mulberry32 - 高速で高品質なseeded PRNG
 * 同じseedなら常に同じ乱数列を生成
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // seedを32bit整数に変換
    this.state = seed >>> 0;
  }

  /**
   * 0-1の範囲の乱数を生成
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * 指定範囲の乱数を生成
   */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * 正規分布に近い乱数（Box-Muller変換）
   */
  public gaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * 現在の状態を取得（復元用）
   */
  public getState(): number {
    return this.state;
  }

  /**
   * 状態を設定（復元用）
   */
  public setState(state: number): void {
    this.state = state >>> 0;
  }
}

// ============================================================
// BaseTrajectory - 決定論的基準軌道
// ============================================================

/**
 * 基準軌道クラス
 * 解析解のみを使用、数値積分なし
 */
export class BaseTrajectory {
  private readonly params: TrajectoryParams;
  private readonly initialVelocity: Vec3;
  private readonly flightTime: number;

  constructor(params: TrajectoryParams) {
    this.params = Object.freeze({ ...params });

    // 初速度と飛行時間を解析的に計算
    const result = this.computeInitialConditions();
    this.initialVelocity = Object.freeze(result.velocity);
    this.flightTime = result.flightTime;
  }

  /**
   * 初期条件を解析的に計算
   */
  private computeInitialConditions(): { velocity: Vec3; flightTime: number } {
    const { start, target, arcHeight, gravity, damping } = this.params;

    // 飛行時間: T = √(8h/g)
    const T = Math.sqrt((8 * arcHeight) / gravity);

    if (damping < 1e-9) {
      // ダンピングなし: 単純な放物線
      const vx = (target.x - start.x) / T;
      const vy = (target.y - start.y + 4 * arcHeight) / T;
      const vz = (target.z - start.z) / T;
      return { velocity: { x: vx, y: vy, z: vz }, flightTime: T };
    }

    // ダンピングあり: 解析解から逆算
    const k = damping;
    const g = gravity;
    const expKT = Math.exp(-k * T);
    const factor = (1 - expKT) / k;

    const vx = (target.x - start.x) / factor;
    const vz = (target.z - start.z) / factor;
    const vy = (target.y - start.y + g * T / k) / factor - g / k;

    return { velocity: { x: vx, y: vy, z: vz }, flightTime: T };
  }

  /**
   * 時刻 t における位置を取得（解析解）
   * @param t 時刻 (秒)
   */
  public getPosition(t: number): Vec3 {
    const { start, gravity, damping } = this.params;
    const v = this.initialVelocity;

    // 時刻を [0, flightTime] にクランプ
    const clampedT = Math.max(0, Math.min(t, this.flightTime));

    if (damping < 1e-9) {
      // ダンピングなし: y = y₀ + v₀t - 0.5gt²
      return {
        x: start.x + v.x * clampedT,
        y: start.y + v.y * clampedT - 0.5 * gravity * clampedT * clampedT,
        z: start.z + v.z * clampedT,
      };
    }

    // ダンピングあり: 解析解
    const k = damping;
    const g = gravity;
    const expKT = Math.exp(-k * clampedT);
    const factor = (1 - expKT) / k;

    return {
      x: start.x + v.x * factor,
      y: start.y + (v.y + g / k) * factor - g * clampedT / k,
      z: start.z + v.z * factor,
    };
  }

  /**
   * 時刻 t における速度を取得（解析解）
   * @param t 時刻 (秒)
   */
  public getVelocity(t: number): Vec3 {
    const { gravity, damping } = this.params;
    const v = this.initialVelocity;

    const clampedT = Math.max(0, Math.min(t, this.flightTime));

    if (damping < 1e-9) {
      // ダンピングなし: vy = v₀y - gt
      return {
        x: v.x,
        y: v.y - gravity * clampedT,
        z: v.z,
      };
    }

    // ダンピングあり: v(t) = v₀ * e^(-kt) （水平）
    //                 v(t) = (v₀ + g/k) * e^(-kt) - g/k （垂直）
    const k = damping;
    const g = gravity;
    const expKT = Math.exp(-k * clampedT);

    return {
      x: v.x * expKT,
      y: (v.y + g / k) * expKT - g / k,
      z: v.z * expKT,
    };
  }

  /**
   * 時刻 t における軌道点を取得
   */
  public getPoint(t: number): TrajectoryPoint {
    return {
      position: this.getPosition(t),
      velocity: this.getVelocity(t),
      time: Math.max(0, Math.min(t, this.flightTime)),
    };
  }

  /**
   * 軌道全体を等間隔でサンプリング
   * @param segments 分割数
   */
  public sample(segments: number): TrajectoryPoint[] {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * this.flightTime;
      points.push(this.getPoint(t));
    }
    return points;
  }

  /**
   * 飛行時間を取得
   */
  public getFlightTime(): number {
    return this.flightTime;
  }

  /**
   * 初速度を取得
   */
  public getInitialVelocity(): Vec3 {
    return this.initialVelocity;
  }

  /**
   * パラメータを取得
   */
  public getParams(): TrajectoryParams {
    return this.params;
  }
}

// ============================================================
// NoiseLayer - 決定論的ノイズレイヤー
// ============================================================

/**
 * ノイズレイヤークラス
 * seeded PRNGを使用した決定論的ノイズ
 */
export class NoiseLayer {
  private readonly params: NoiseParams;
  private readonly rng: SeededRandom;

  // 事前計算されたノイズ係数
  private readonly noiseCoefficients: {
    readonly posX: number[];
    readonly posY: number[];
    readonly posZ: number[];
    readonly velX: number[];
    readonly velY: number[];
    readonly velZ: number[];
  };

  constructor(params: NoiseParams, harmonics: number = 8) {
    this.params = Object.freeze({ ...params });
    this.rng = new SeededRandom(params.seed);

    // ノイズ係数を事前生成（フーリエ級数的アプローチ）
    this.noiseCoefficients = this.generateNoiseCoefficients(harmonics);
  }

  /**
   * ノイズ係数を事前生成
   */
  private generateNoiseCoefficients(harmonics: number): {
    posX: number[];
    posY: number[];
    posZ: number[];
    velX: number[];
    velY: number[];
    velZ: number[];
  } {
    const generate = (): number[] => {
      const coeffs: number[] = [];
      for (let i = 0; i < harmonics * 2; i++) {
        coeffs.push(this.rng.gaussian(0, 1 / (i + 1)));
      }
      return coeffs;
    };

    return {
      posX: generate(),
      posY: generate(),
      posZ: generate(),
      velX: generate(),
      velY: generate(),
      velZ: generate(),
    };
  }

  /**
   * 時刻 t におけるノイズ値を計算（決定論的）
   */
  private computeNoise(t: number, coefficients: number[]): number {
    const freq = this.params.frequency;
    let value = 0;
    const n = coefficients.length / 2;

    for (let i = 0; i < n; i++) {
      const phase = (i + 1) * freq * t * 2 * Math.PI;
      value += coefficients[i * 2] * Math.sin(phase);
      value += coefficients[i * 2 + 1] * Math.cos(phase);
    }

    return value;
  }

  /**
   * 時刻 t における位置ノイズを取得
   */
  public getPositionNoise(t: number): Vec3 {
    const { positionAmplitude } = this.params;
    return {
      x: this.computeNoise(t, this.noiseCoefficients.posX) * positionAmplitude.x,
      y: this.computeNoise(t, this.noiseCoefficients.posY) * positionAmplitude.y,
      z: this.computeNoise(t, this.noiseCoefficients.posZ) * positionAmplitude.z,
    };
  }

  /**
   * 時刻 t における速度ノイズを取得
   */
  public getVelocityNoise(t: number): Vec3 {
    const { velocityAmplitude } = this.params;
    return {
      x: this.computeNoise(t, this.noiseCoefficients.velX) * velocityAmplitude.x,
      y: this.computeNoise(t, this.noiseCoefficients.velY) * velocityAmplitude.y,
      z: this.computeNoise(t, this.noiseCoefficients.velZ) * velocityAmplitude.z,
    };
  }

  /**
   * パラメータを取得
   */
  public getParams(): NoiseParams {
    return this.params;
  }
}

// ============================================================
// DeterministicTrajectory - 統合クラス
// ============================================================

/**
 * 軌道計算の入力パラメータ
 */
export interface TrajectoryInput {
  readonly start: Vec3;
  readonly target: Vec3;
  readonly arcHeight: number;
  readonly gravity: number;
  readonly damping: number;
  readonly noiseSeed?: number;          // 省略時はノイズなし
  readonly noiseAmplitude?: number;     // ノイズの全体振幅（m）
}

/**
 * 決定論的軌道計算クラス
 * BaseTrajectory + NoiseLayer を統合
 */
export class DeterministicTrajectory {
  private readonly base: BaseTrajectory;
  private readonly noise: NoiseLayer | null;

  constructor(input: TrajectoryInput) {
    // 基準軌道を作成
    this.base = new BaseTrajectory({
      start: input.start,
      target: input.target,
      arcHeight: input.arcHeight,
      gravity: input.gravity,
      damping: input.damping,
    });

    // ノイズレイヤーを作成（seedが指定されている場合のみ）
    if (input.noiseSeed !== undefined) {
      const amplitude = input.noiseAmplitude ?? 0.01;
      this.noise = new NoiseLayer({
        seed: input.noiseSeed,
        positionAmplitude: { x: amplitude, y: amplitude, z: amplitude },
        velocityAmplitude: { x: amplitude * 2, y: amplitude * 2, z: amplitude * 2 },
        frequency: 2.0,
      });
    } else {
      this.noise = null;
    }
  }

  /**
   * 時刻 t における位置を取得
   */
  public getPosition(t: number): Vec3 {
    const basePos = this.base.getPosition(t);

    if (!this.noise) {
      return basePos;
    }

    const noisePos = this.noise.getPositionNoise(t);
    return {
      x: basePos.x + noisePos.x,
      y: basePos.y + noisePos.y,
      z: basePos.z + noisePos.z,
    };
  }

  /**
   * 時刻 t における速度を取得
   */
  public getVelocity(t: number): Vec3 {
    const baseVel = this.base.getVelocity(t);

    if (!this.noise) {
      return baseVel;
    }

    const noiseVel = this.noise.getVelocityNoise(t);
    return {
      x: baseVel.x + noiseVel.x,
      y: baseVel.y + noiseVel.y,
      z: baseVel.z + noiseVel.z,
    };
  }

  /**
   * 時刻 t における軌道点を取得
   */
  public getPoint(t: number): TrajectoryPoint {
    return {
      position: this.getPosition(t),
      velocity: this.getVelocity(t),
      time: Math.max(0, Math.min(t, this.getFlightTime())),
    };
  }

  /**
   * 軌道全体をサンプリング
   */
  public sample(segments: number): TrajectoryPoint[] {
    const flightTime = this.getFlightTime();
    const points: TrajectoryPoint[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * flightTime;
      points.push(this.getPoint(t));
    }

    return points;
  }

  /**
   * 飛行時間を取得
   */
  public getFlightTime(): number {
    return this.base.getFlightTime();
  }

  /**
   * 初速度を取得
   */
  public getInitialVelocity(): Vec3 {
    const baseVel = this.base.getInitialVelocity();

    if (!this.noise) {
      return baseVel;
    }

    const noiseVel = this.noise.getVelocityNoise(0);
    return {
      x: baseVel.x + noiseVel.x,
      y: baseVel.y + noiseVel.y,
      z: baseVel.z + noiseVel.z,
    };
  }

  /**
   * 基準軌道を取得（ノイズなし）
   */
  public getBaseTrajectory(): BaseTrajectory {
    return this.base;
  }
}

// ============================================================
// ユーティリティ関数
// ============================================================

/**
 * ベクトル加算
 */
export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * ベクトル減算
 */
export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * ベクトルスカラー倍
 */
export function scaleVec3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * ベクトルの長さ
 */
export function lengthVec3(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * 2点間の距離
 */
export function distanceVec3(a: Vec3, b: Vec3): number {
  return lengthVec3(subVec3(a, b));
}

// ============================================================
// 検証用関数
// ============================================================

/**
 * 決定性の検証
 * 同じ入力で100回実行し、出力が完全に一致することを確認
 */
export function verifyDeterminism(input: TrajectoryInput, runs: number = 100): {
  isDeterministic: boolean;
  maxPositionDeviation: number;
  maxVelocityDeviation: number;
} {
  const trajectories: DeterministicTrajectory[] = [];

  // 同じ入力でN回インスタンス化
  for (let i = 0; i < runs; i++) {
    trajectories.push(new DeterministicTrajectory(input));
  }

  // 基準となる軌道
  const reference = trajectories[0];
  const flightTime = reference.getFlightTime();
  const sampleCount = 100;

  let maxPositionDeviation = 0;
  let maxVelocityDeviation = 0;

  // 各時刻で比較
  for (let i = 0; i <= sampleCount; i++) {
    const t = (i / sampleCount) * flightTime;
    const refPos = reference.getPosition(t);
    const refVel = reference.getVelocity(t);

    for (let j = 1; j < runs; j++) {
      const pos = trajectories[j].getPosition(t);
      const vel = trajectories[j].getVelocity(t);

      const posDev = distanceVec3(pos, refPos);
      const velDev = distanceVec3(vel, refVel);

      maxPositionDeviation = Math.max(maxPositionDeviation, posDev);
      maxVelocityDeviation = Math.max(maxVelocityDeviation, velDev);
    }
  }

  return {
    isDeterministic: maxPositionDeviation === 0 && maxVelocityDeviation === 0,
    maxPositionDeviation,
    maxVelocityDeviation,
  };
}
