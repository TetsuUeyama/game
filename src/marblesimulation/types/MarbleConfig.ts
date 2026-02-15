/**
 * ビー玉物理パラメータ（全ビー玉共通）
 */
export interface MarbleParams {
  /** 質量(kg): ビー玉の重さ。大きいほど動かしにくく、衝突時の力が強い */
  mass: number;
  /** 半径(m): ビー玉の大きさ。描画サイズと物理判定サイズの両方に使用 */
  radius: number;
  /** 摩擦係数: 地面や壁との接触時の滑りにくさ(0=氷, 1=ゴム) */
  friction: number;
  /** 反発係数: 衝突時の跳ね返りの強さ(0=跳ねない, 1=完全弾性衝突) */
  restitution: number;
  /** 並進減衰: 移動速度が自然に減少する割合。空気抵抗に相当 */
  linearDamping: number;
  /** 回転減衰: 回転速度が自然に減少する割合。回転摩擦に相当 */
  angularDamping: number;
}

/**
 * 地面物理パラメータ
 */
export interface GroundParams {
  /** 地面の摩擦係数: ビー玉が地面上で滑る度合いを制御 */
  friction: number;
  /** 地面の反発係数: ビー玉が地面で跳ね返る強さを制御 */
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
  /** 表示ラベル: UIやメッシュ名に使用する識別名 */
  label: string;
  /** 質量(kg): このビー玉固有の重さ。MarbleParams.massを上書き */
  mass: number;
  /** RGB色: [R, G, B] 各0〜1。ビー玉の描画色 */
  color: [number, number, number];
  /** ジャンプ力: 着地時に加える上方向インパルスの大きさ(0=ジャンプなし) */
  jumpPower: number;
  /** 加速力: 移動方向に加える力の大きさ。大きいほど素早く加速 */
  accelerationPower: number;
  /** ブレーキ力: 停止時に加える逆方向の力。大きいほど素早く停止 */
  brakePower: number;
  /** 最大速度: この速度以上では加速力が適用されない */
  maxSpeed: number;
}

/** デフォルト重量プリセット（jumpPower の違いで跳ね方を比較） */
export const DEFAULT_WEIGHT_PRESETS: WeightPreset[] = [
  /** Blue: ジャンプなし。地面を滑走するのみ */
  { label: "Blue",   mass: 0.5, color: [0.3, 0.7, 1.0], jumpPower: 0,   accelerationPower: 50,  brakePower: 50,  maxSpeed: 50  },
  /** Green: 微弱ジャンプ。わずかに跳ねる */
  { label: "Green",  mass: 0.5, color: [0.3, 0.9, 0.4], jumpPower: 0.1,   accelerationPower: 50,  brakePower: 50,  maxSpeed: 50  },
  /** Orange: 中程度ジャンプ。適度に跳ねる */
  { label: "Orange", mass: 0.5, color: [1.0, 0.5, 0.2], jumpPower: 0.2,   accelerationPower: 50,  brakePower: 50,  maxSpeed: 50  },
  /** Red: 強いジャンプ。大きく跳ねる */
  { label: "Red",    mass: 0.5, color: [0.8, 0.2, 0.3], jumpPower: 0.3,   accelerationPower: 50,  brakePower: 50,  maxSpeed: 50  },
];

// ─── コースタイプ ───

/** シミュレーションで選択可能なコースの種類 */
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
  /** ゴールまでのZ方向距離(m): スタートからゴールラインまでの直線距離 */
  goalDistance: number;
  /** 全員ゴール後の待機秒数: この時間経過後にリセットされる */
  waitDuration: number;
}

/**
 * 反復横跳びコース設定
 * - shuttleWidth: 左右の跳び幅（中心からの片側距離）
 * - roundTrips: 往復回数
 * - waitDuration: 完了後の待機秒数
 */
export interface LateralShuttleConfig {
  /** 跳び幅(m): 中心から左右それぞれの距離 */
  shuttleWidth: number;
  /** 往復回数: 左右を何回往復するか */
  roundTrips: number;
  /** 完了後の待機秒数: 全員完了後にリセットされるまでの時間 */
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
  /** 対向ビー玉間の初期距離(m): 手前のビー玉(z=0)と奥のビー玉(z=startDistance)の間隔 */
  startDistance: number;
  /** 衝突後全停止からの待機秒数: この時間経過後にリセットされる */
  waitDuration: number;
}

/**
 * ランダム移動コース設定
 * - areaSize: ビー玉が配置・動き回る範囲の一辺（地面より小さく設定）
 * - minInterval: 方向転換の最小間隔(秒)
 * - maxInterval: 方向転換の最大間隔(秒)
 */
export interface RandomConfig {
  /** 移動範囲の一辺(m): ビー玉がランダム配置・移動する正方形エリアのサイズ */
  areaSize: number;
  /** 方向転換の最小間隔(秒): ランダムに方向を変える最短待機時間 */
  minInterval: number;
  /** 方向転換の最大間隔(秒): ランダムに方向を変える最長待機時間 */
  maxInterval: number;
}

// ─── シミュレーション全体設定 ───

/** シミュレーション全体の設定をまとめたインターフェース */
export interface SimulationConfig {
  /** ビー玉共通物理パラメータ */
  marble: MarbleParams;
  /** 地面の物理パラメータ */
  ground: GroundParams;
  /** 各ビー玉の重量・性能プリセット配列 */
  weightPresets: WeightPreset[];
  /** 現在選択されているコースタイプ */
  courseType: CourseType;
  /** 直線コースの設定 */
  straight: StraightConfig;
  /** 反復横跳びコースの設定 */
  lateralShuttle: LateralShuttleConfig;
  /** 衝突実験コースの設定 */
  collision: CollisionConfig;
  /** ランダム移動コースの設定 */
  random: RandomConfig;
  /** 地面の一辺のサイズ(m): 正方形の地面の幅と奥行き */
  groundSize: number;
  /** 壁の高さ(m): フィールドを囲む壁の高さ */
  wallHeight: number;
}

/** デフォルトシミュレーション設定 */
export const DEFAULT_CONFIG: SimulationConfig = {
  /** ビー玉共通物理パラメータのデフォルト値 */
  marble: {
    mass: 0.1,          // 質量0.1kg
    radius: 0.5,        // 半径0.5m
    friction: 0.3,      // 摩擦係数0.3
    restitution: 0,     // 反発係数0（跳ねない）
    linearDamping: 0.5, // 並進減衰0.5
    angularDamping: 0.3, // 回転減衰0.3
  },
  /** 地面の物理パラメータのデフォルト値 */
  ground: {
    friction: 0.5,      // 地面摩擦0.5
    restitution: 0,     // 地面反発0（跳ねない）
  },
  /** デフォルトの重量プリセット配列 */
  weightPresets: DEFAULT_WEIGHT_PRESETS,
  /** デフォルトコースタイプ: 直線 */
  courseType: CourseType.STRAIGHT,
  /** 直線コースのデフォルト設定 */
  straight: {
    goalDistance: 80,    // ゴールまで80m
    waitDuration: 3.0,   // 全員ゴール後3秒待機
  },
  /** 反復横跳びコースのデフォルト設定 */
  lateralShuttle: {
    shuttleWidth: 4,     // 中心から左右4m
    roundTrips: 5,       // 5往復
    waitDuration: 3.0,   // 完了後3秒待機
  },
  /** 衝突実験コースのデフォルト設定 */
  collision: {
    startDistance: 40,   // 対向40m間隔
    waitDuration: 4.0,   // 停止後4秒待機
  },
  /** ランダム移動コースのデフォルト設定 */
  random: {
    areaSize: 20,        // 20m四方のエリア
    minInterval: 1.0,    // 最短1秒で方向転換
    maxInterval: 3.0,    // 最長3秒で方向転換
  },
  /** 地面サイズ: 120m四方 */
  groundSize: 120,
  /** 壁の高さ: 4m */
  wallHeight: 4,
};
