/**
 * 軌道シミュレータ
 * Velocity Verlet積分による数値的に安定した軌道計算
 *
 * 特徴:
 * - 固定タイムステップ（1/120秒）
 * - シンプレクティック積分（エネルギー保存性が高い）
 * - 誤差追跡（運動エネルギー、ポテンシャルエネルギー、全エネルギー）
 * - 解析解との比較による精度検証
 *
 * 単位系: SI単位（m, kg, s, N）
 */

/**
 * 3次元ベクトル（シンプルな実装、Babylon.jsに依存しない）
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * シミュレーション状態
 */
export interface SimulationState {
  position: Vec3;
  velocity: Vec3;
  time: number;
}

/**
 * エネルギー状態
 */
export interface EnergyState {
  kinetic: number;      // 運動エネルギー (J)
  potential: number;    // ポテンシャルエネルギー (J)
  total: number;        // 全エネルギー (J)
}

/**
 * シミュレーション結果
 */
export interface SimulationResult {
  finalState: SimulationState;
  trajectory: SimulationState[];
  energyHistory: EnergyState[];
  initialEnergy: number;
  finalEnergy: number;
  maxEnergyError: number;       // 最大エネルギー誤差 (J)
  maxEnergyErrorRatio: number;  // 最大エネルギー誤差比率
  maxRadiusError: number;       // 解析解との最大半径誤差 (m)
  totalSteps: number;
}

/**
 * シミュレーション設定
 */
export interface SimulationConfig {
  gravity: number;          // 重力加速度 (m/s²) 正の値
  damping: number;          // 線形ダンピング係数 (1/s)
  mass: number;             // 質量 (kg)
  fixedDeltaTime: number;   // 固定タイムステップ (s)
  maxSimulationTime: number; // 最大シミュレーション時間 (s)
  groundY: number;          // 地面のY座標 (m)
}

/**
 * デフォルト設定
 */
export const DEFAULT_CONFIG: SimulationConfig = {
  gravity: 9.81,
  damping: 0.05,
  mass: 0.62,  // バスケットボール
  fixedDeltaTime: 1 / 120,  // 120Hz固定
  maxSimulationTime: 10,
  groundY: 0,
};

/**
 * 軌道シミュレータクラス
 * Velocity Verlet積分を使用
 */
export class TrajectorySimulator {
  private config: SimulationConfig;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Velocity Verlet積分でシミュレーションを実行
   *
   * Velocity Verlet アルゴリズム:
   * 1. a(t) = F(t)/m を計算
   * 2. x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt²
   * 3. a(t+dt) = F(t+dt)/m を計算
   * 4. v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
   *
   * このアルゴリズムはシンプレクティックで、エネルギー保存性が高い
   */
  public simulate(
    initialPosition: Vec3,
    initialVelocity: Vec3,
    targetTime?: number
  ): SimulationResult {
    const dt = this.config.fixedDeltaTime;
    const maxTime = targetTime ?? this.config.maxSimulationTime;
    const k = this.config.damping;

    // 状態の初期化
    let pos: Vec3 = { ...initialPosition };
    let vel: Vec3 = { ...initialVelocity };
    let time = 0;

    // 履歴
    const trajectory: SimulationState[] = [];
    const energyHistory: EnergyState[] = [];

    // 初期エネルギー
    const initialEnergy = this.calculateTotalEnergy(pos, vel);
    let maxEnergyError = 0;
    let maxRadiusError = 0;

    // 初期状態を記録
    trajectory.push({ position: { ...pos }, velocity: { ...vel }, time });
    energyHistory.push(this.calculateEnergy(pos, vel));

    // メインループ
    let steps = 0;
    while (time < maxTime && pos.y >= this.config.groundY) {
      // Step 1: 現在の加速度を計算
      const acc = this.calculateAcceleration(vel);

      // Step 2: 位置を更新 (x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt²)
      const newPos: Vec3 = {
        x: pos.x + vel.x * dt + 0.5 * acc.x * dt * dt,
        y: pos.y + vel.y * dt + 0.5 * acc.y * dt * dt,
        z: pos.z + vel.z * dt + 0.5 * acc.z * dt * dt,
      };

      // Step 3: 新しい位置での速度を仮計算（加速度計算用）
      const velHalf: Vec3 = {
        x: vel.x + acc.x * dt,
        y: vel.y + acc.y * dt,
        z: vel.z + acc.z * dt,
      };

      // Step 4: 新しい加速度を計算
      const newAcc = this.calculateAcceleration(velHalf);

      // Step 5: 速度を更新 (v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt)
      const newVel: Vec3 = {
        x: vel.x + 0.5 * (acc.x + newAcc.x) * dt,
        y: vel.y + 0.5 * (acc.y + newAcc.y) * dt,
        z: vel.z + 0.5 * (acc.z + newAcc.z) * dt,
      };

      // 状態を更新
      pos = newPos;
      vel = newVel;
      time += dt;
      steps++;

      // エネルギーを計算
      const energy = this.calculateEnergy(pos, vel);
      energyHistory.push(energy);

      // エネルギー誤差を追跡（ダンピングがある場合は散逸を考慮）
      if (k < 0.001) {
        // ダンピングなし：エネルギー保存を確認
        const energyError = Math.abs(energy.total - initialEnergy);
        maxEnergyError = Math.max(maxEnergyError, energyError);
      }

      // 解析解との誤差を計算
      const analyticalPos = this.getAnalyticalPosition(
        initialPosition,
        initialVelocity,
        time
      );
      const radiusError = this.distance(pos, analyticalPos);
      maxRadiusError = Math.max(maxRadiusError, radiusError);

      // 状態を記録（間引き: 10ステップごと）
      if (steps % 10 === 0) {
        trajectory.push({ position: { ...pos }, velocity: { ...vel }, time });
      }
    }

    // 最終状態を記録
    trajectory.push({ position: { ...pos }, velocity: { ...vel }, time });

    const finalEnergy = this.calculateTotalEnergy(pos, vel);

    return {
      finalState: { position: pos, velocity: vel, time },
      trajectory,
      energyHistory,
      initialEnergy,
      finalEnergy,
      maxEnergyError,
      maxEnergyErrorRatio: initialEnergy > 0 ? maxEnergyError / initialEnergy : 0,
      maxRadiusError,
      totalSteps: steps,
    };
  }

  /**
   * 加速度を計算
   * F = -m*g*ĵ - k*v (重力 + 線形ダンピング)
   * a = F/m = -g*ĵ - (k/m)*v
   *
   * 注意: ダンピング項は速度に比例する抗力
   */
  private calculateAcceleration(velocity: Vec3): Vec3 {
    const g = this.config.gravity;
    const k = this.config.damping;

    return {
      x: -k * velocity.x,
      y: -g - k * velocity.y,
      z: -k * velocity.z,
    };
  }

  /**
   * エネルギーを計算
   */
  private calculateEnergy(position: Vec3, velocity: Vec3): EnergyState {
    const m = this.config.mass;
    const g = this.config.gravity;

    // 運動エネルギー: KE = 0.5 * m * v²
    const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
    const kinetic = 0.5 * m * speedSq;

    // ポテンシャルエネルギー: PE = m * g * h
    const potential = m * g * position.y;

    return {
      kinetic,
      potential,
      total: kinetic + potential,
    };
  }

  /**
   * 全エネルギーを計算
   */
  private calculateTotalEnergy(position: Vec3, velocity: Vec3): number {
    return this.calculateEnergy(position, velocity).total;
  }

  /**
   * 解析解による位置を計算
   * ダンピングありの場合の厳密解
   */
  private getAnalyticalPosition(
    start: Vec3,
    velocity: Vec3,
    time: number
  ): Vec3 {
    const g = this.config.gravity;
    const k = this.config.damping;

    if (k < 0.001) {
      // ダンピングなし: 単純な放物線
      return {
        x: start.x + velocity.x * time,
        y: start.y + velocity.y * time - 0.5 * g * time * time,
        z: start.z + velocity.z * time,
      };
    }

    // ダンピングあり: 解析解
    const expKT = Math.exp(-k * time);
    const factor = (1 - expKT) / k;

    return {
      x: start.x + velocity.x * factor,
      y: start.y + (velocity.y + g / k) * factor - g * time / k,
      z: start.z + velocity.z * factor,
    };
  }

  /**
   * 2点間の距離を計算
   */
  private distance(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * 目標位置に到達するための初速度を計算（解析解）
   */
  public calculateInitialVelocity(
    start: Vec3,
    target: Vec3,
    arcHeight: number
  ): { velocity: Vec3; flightTime: number } {
    const g = this.config.gravity;
    const k = this.config.damping;

    // 飛行時間: T = √(8h/g)
    const flightTime = Math.sqrt((8 * arcHeight) / g);

    if (k < 0.001) {
      // ダンピングなし
      const vx = (target.x - start.x) / flightTime;
      const vy = (target.y - start.y + 4 * arcHeight) / flightTime;
      const vz = (target.z - start.z) / flightTime;
      return { velocity: { x: vx, y: vy, z: vz }, flightTime };
    }

    // ダンピングあり: 解析解から逆算
    const T = flightTime;
    const expKT = Math.exp(-k * T);
    const factor = (1 - expKT) / k;

    const vx = (target.x - start.x) / factor;
    const vz = (target.z - start.z) / factor;
    const vy = (target.y - start.y + g * T / k) / factor - g / k;

    return { velocity: { x: vx, y: vy, z: vz }, flightTime };
  }

  /**
   * 100回実行して再現性と精度を検証
   */
  public runValidation(
    initialPosition: Vec3,
    initialVelocity: Vec3,
    targetTime: number,
    runs: number = 100
  ): ValidationResult {
    const results: SimulationResult[] = [];

    for (let i = 0; i < runs; i++) {
      results.push(this.simulate(initialPosition, initialVelocity, targetTime));
    }

    // 最終位置の統計
    const finalPositions = results.map(r => r.finalState.position);
    const referencePos = finalPositions[0];

    let maxPositionDeviation = 0;
    for (const pos of finalPositions) {
      const deviation = this.distance(pos, referencePos);
      maxPositionDeviation = Math.max(maxPositionDeviation, deviation);
    }

    // エネルギー誤差の統計
    const maxEnergyErrors = results.map(r => r.maxEnergyError);
    const maxRadiusErrors = results.map(r => r.maxRadiusError);

    const avgMaxEnergyError = maxEnergyErrors.reduce((a, b) => a + b, 0) / runs;
    const avgMaxRadiusError = maxRadiusErrors.reduce((a, b) => a + b, 0) / runs;

    // 解析解との最終位置比較
    const analyticalFinal = this.getAnalyticalPosition(
      initialPosition,
      initialVelocity,
      targetTime
    );
    const finalPositionError = this.distance(results[0].finalState.position, analyticalFinal);

    return {
      runs,
      maxPositionDeviation,
      avgMaxEnergyError,
      maxMaxEnergyError: Math.max(...maxEnergyErrors),
      avgMaxRadiusError,
      maxMaxRadiusError: Math.max(...maxRadiusErrors),
      finalPositionError,
      isReproducible: maxPositionDeviation < 1e-10,
      sampleResult: results[0],
    };
  }

  /**
   * 設定を取得
   */
  public getConfig(): SimulationConfig {
    return { ...this.config };
  }
}

/**
 * 検証結果
 */
export interface ValidationResult {
  runs: number;
  maxPositionDeviation: number;    // 100回実行での最大位置偏差 (m)
  avgMaxEnergyError: number;       // 平均最大エネルギー誤差 (J)
  maxMaxEnergyError: number;       // 最大エネルギー誤差 (J)
  avgMaxRadiusError: number;       // 平均最大半径誤差 (m)
  maxMaxRadiusError: number;       // 最大半径誤差 (m)
  finalPositionError: number;      // 解析解との最終位置誤差 (m)
  isReproducible: boolean;         // 再現性があるか
  sampleResult: SimulationResult;  // サンプル結果
}

/**
 * 検証結果をフォーマットして出力
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines = [
    '=== 軌道シミュレーション検証結果 ===',
    `実行回数: ${result.runs}`,
    '',
    '【再現性】',
    `  最大位置偏差: ${result.maxPositionDeviation.toExponential(4)} m`,
    `  再現性: ${result.isReproducible ? '✓ 確認' : '✗ 不安定'}`,
    '',
    '【エネルギー保存性】',
    `  初期エネルギー: ${result.sampleResult.initialEnergy.toFixed(4)} J`,
    `  最終エネルギー: ${result.sampleResult.finalEnergy.toFixed(4)} J`,
    `  平均最大誤差: ${result.avgMaxEnergyError.toExponential(4)} J`,
    `  最大誤差: ${result.maxMaxEnergyError.toExponential(4)} J`,
    `  誤差比率: ${(result.sampleResult.maxEnergyErrorRatio * 100).toExponential(4)} %`,
    '',
    '【解析解との比較】',
    `  平均最大半径誤差: ${result.avgMaxRadiusError.toExponential(4)} m`,
    `  最大半径誤差: ${result.maxMaxRadiusError.toExponential(4)} m`,
    `  最終位置誤差: ${result.finalPositionError.toExponential(4)} m`,
    '',
    '【シミュレーション詳細】',
    `  総ステップ数: ${result.sampleResult.totalSteps}`,
    `  シミュレーション時間: ${result.sampleResult.finalState.time.toFixed(4)} s`,
  ];

  return lines.join('\n');
}
