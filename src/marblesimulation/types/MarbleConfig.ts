/**
 * ビー玉物理パラメータ（全ビー玉共通）
 */
export interface MarbleParams {
  mass: number;
  radius: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
}

/**
 * 地面物理パラメータ
 */
export interface GroundParams {
  friction: number;
  restitution: number;
}

/**
 * 重量・性能プリセット（ビー玉ごとに個別設定）
 *
 * - jumpPower: 着地時に加える上方向インパルスの大きさ
 *   0 = ジャンプなし（地面を滑走）
 *   同じ jumpPower でも重いビー玉は低く、軽いビー玉は高く跳ねる（F=ma）
 */
export interface WeightPreset {
  label: string;
  mass: number;
  color: [number, number, number];
  jumpPower: number;
  accelerationPower: number;
  brakePower: number;
  maxSpeed: number;
}

/** デフォルト重量プリセット（jumpPower の違いで跳ね方を比較） */
export const DEFAULT_WEIGHT_PRESETS: WeightPreset[] = [
  { label: "Blue",   mass: 0.5, color: [0.3, 0.7, 1.0], jumpPower: 0,   accelerationPower: 50,  brakePower: 50,  maxSpeed: 50  },
  { label: "Green",  mass: 0.5, color: [0.3, 0.9, 0.4], jumpPower: 0.1,   accelerationPower: 50,  brakePower: 50,  maxSpeed: 50  },
  { label: "Orange", mass: 0.5, color: [1.0, 0.5, 0.2], jumpPower: 0.2,   accelerationPower: 50,  brakePower: 50,  maxSpeed: 50  },
  { label: "Red",    mass: 0.5, color: [0.8, 0.2, 0.3], jumpPower: 0.3,   accelerationPower: 50,  brakePower: 50,  maxSpeed: 50  },
];

// ─── コースタイプ ───

export enum CourseType {
  /** 直線コース: まっすぐゴールを目指す */
  STRAIGHT = "straight",
  /** 反復横跳びコース: 左右のラインを往復 */
  LATERAL_SHUTTLE = "lateralShuttle",
  /** 衝突実験コース: 2つのビー玉を対向発射して衝突させる */
  COLLISION = "collision",
  /** ランダム移動コース: フィールド内をランダムに動き回り衝突し合う */
  RANDOM = "random",
}

// ─── コース別設定 ───

/**
 * 直線コース設定
 * - goalDistance: ゴールまでのZ距離
 * - waitDuration: 全員ゴール後の待機秒数
 */
export interface StraightConfig {
  goalDistance: number;
  waitDuration: number;
}

/**
 * 反復横跳びコース設定
 * - shuttleWidth: 左右の跳び幅（中心からの片側距離）
 * - roundTrips: 往復回数
 * - waitDuration: 完了後の待機秒数
 */
export interface LateralShuttleConfig {
  shuttleWidth: number;
  roundTrips: number;
  waitDuration: number;
}

/**
 * 衝突実験コース設定
 * - startDistance: 対向ビー玉間の距離
 * - waitDuration: 衝突後全停止からの待機秒数
 *
 * ビー玉はペアで対向配置:
 *   preset[0] vs preset[1] → レーン0
 *   preset[2] vs preset[3] → レーン1
 */
export interface CollisionConfig {
  startDistance: number;
  waitDuration: number;
}

/**
 * ランダム移動コース設定
 * - areaSize: ビー玉が配置・動き回る範囲の一辺（地面より小さく設定）
 * - minInterval: 方向転換の最小間隔(秒)
 * - maxInterval: 方向転換の最大間隔(秒)
 */
export interface RandomConfig {
  areaSize: number;
  minInterval: number;
  maxInterval: number;
}

// ─── シミュレーション全体設定 ───

export interface SimulationConfig {
  marble: MarbleParams;
  ground: GroundParams;
  weightPresets: WeightPreset[];
  courseType: CourseType;
  straight: StraightConfig;
  lateralShuttle: LateralShuttleConfig;
  collision: CollisionConfig;
  random: RandomConfig;
  groundSize: number;
  wallHeight: number;
}

/** デフォルトシミュレーション設定 */
export const DEFAULT_CONFIG: SimulationConfig = {
  marble: {
    mass: 0.1,
    radius: 0.5,
    friction: 0.3,
    restitution: 0,
    linearDamping: 0.5,
    angularDamping: 0.3,
  },
  ground: {
    friction: 0.5,
    restitution: 0,
  },
  weightPresets: DEFAULT_WEIGHT_PRESETS,
  courseType: CourseType.STRAIGHT,
  straight: {
    goalDistance: 80,
    waitDuration: 3.0,
  },
  lateralShuttle: {
    shuttleWidth: 4,
    roundTrips: 5,
    waitDuration: 3.0,
  },
  collision: {
    startDistance: 40,
    waitDuration: 4.0,
  },
  random: {
    areaSize: 20,
    minInterval: 1.0,
    maxInterval: 3.0,
  },
  groundSize: 120,
  wallHeight: 4,
};
