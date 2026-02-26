// --- Scale ---
export const S = 0.015;               // 速度・距離の変換用

// --- Field (basketball court) ---
export const SIM_FIELD_X_HALF = 7.5;  // コート幅 15m / 2
export const SIM_FIELD_Z_HALF = 15.0; // コート長さ 30m / 2
export const SIM_MARGIN = 30 * S;      // 0.45 m

// --- Entity size ---
export const ENTITY_HEIGHT = 1.0;      // m
export const LAUNCHER_SIZE = 0.6;      // m (box width/depth)
export const TARGET_SIZE = 0.5;        // m
export const OBSTACLE_SIZE = 0.44;     // m
export const BALL_DIAMETER = 0.3;      // m

// --- Collision ---
export const HIT_RADIUS = 24 * S;     // 0.36 m
export const BLOCK_RADIUS = 20 * S;   // 0.30 m
export const HAND_CATCH_RADIUS = 0.15;   // キャッチ判定半径（手中心から）
export const HAND_BLOCK_RADIUS = 0.12;   // ブロック判定半径（手中心から）
export const PHYSICAL_MARGIN = 35 * S; // 0.525 m

// --- Entity collision radii (half of box size) ---
export const LAUNCHER_RADIUS = LAUNCHER_SIZE / 2;  // 0.30 m
export const TARGET_RADIUS = TARGET_SIZE / 2;       // 0.25 m
export const OBSTACLE_RADIUS = OBSTACLE_SIZE / 2;   // 0.22 m

// --- Facing / FOV ---
export const TURN_RATE = 3.0;                        // rad/s
export const OB_FOV_HALF_NEAR = Math.PI / 4;         // 45deg
export const OB_FOV_HALF_FAR = Math.PI / 9;          // 20deg
export const FOV_NARROW_DIST = 500 * S;              // 7.5 m
export const FOV_FULL_LEN = Math.sqrt(
  (SIM_FIELD_X_HALF * 2) ** 2 + (SIM_FIELD_Z_HALF * 2) ** 2,
);                                                    // ~33.5m
export const FOV_WINDOW_LEN = 220 * S;               // 3.3 m
export const FOV_FOCUS_SPEED = 400 * S;              // 6.0 m/s
export const SEARCH_SWEEP_SPEED = 6.0;               // rad/s
export const SEARCH_SWEEP_MAX = Math.PI / 2;         // 90deg
export const NECK_TURN_RATE = 6.0;                    // rad/s (faster than body TURN_RATE)
export const NECK_MAX_ANGLE = Math.PI / 2;            // ±90deg from body facing
export const TORSO_TURN_RATE = 4.5;                   // rad/s（NECK_TURN_RATE より遅い）
export const TORSO_MAX_ANGLE = Math.PI / 2;           // ±90° from lower body facing
export const TORSO_VISUAL_LERP_SPEED = 8.0;           // 視覚補間速度（NECK=12.0 より遅い）

// --- Visual interpolation ---
export const ARM_LERP_SPEED = 10.0;          // 腕の補間速度
export const NECK_VISUAL_LERP_SPEED = 12.0;  // 首の視覚補間速度

// --- Movement thresholds ---
export const TARGET_STOP_DIST = 0.075;  // 5 * S = 0.075 m — target stops when within this distance

// --- Timing ---
export const FIRE_MIN = 1.5;
export const FIRE_MAX = 3.0;
export const TURN_MIN = 1.0;
export const TURN_MAX = 3.0;
export const BALL_TIMEOUT = 6.0;

// --- Deflection ---
export const DEFLECT_IMPULSE = 1.2;    // 弾きインパルス強度 (kg·m/s)
export const DEFLECT_COOLDOWN = 0.3;   // 同一障害物の連続弾き防止 (秒)

// --- On-ball movement ---
export const ON_BALL_SPEED_MULT = 0.75;  // ボール保持時の移動速度倍率
export const ONBALL_BLOCK_RADIUS = 1.2;  // ディフェンダーが進路を塞ぐ距離 (m)

// --- Defense engage threshold ---
export const DEFENSE_ENGAGE_Z = 6.0;  // 3Pアーク頂点付近（マーク対象がこのZ以上で追跡開始）

// --- On-ball defense ---
export const ONBALL_MARK_DISTANCE = 1.3;   // オンボールディフェンス時のマーク距離 (m)
export const ONBALL_MARK_HOVER = 0.15;     // オンボールディフェンス時のホバー半径 (m)

// --- Hand Push Obstruction ---
export const PUSH_ACTIVATION_DIST = 1.2;   // プッシュ発動距離 — ディナイモード切替 (m)
export const PUSH_SPEED_MULT = 0.55;       // 被プッシュ時の速度倍率
export const PUSH_HAND_REACH = 0.6;        // 手が届く距離（速度減衰が発生する距離）
export const PUSH_DENY_OFFSET = 0.4;       // ターゲットからパッサー方向へのディナイ位置オフセット (m)
export const PUSH_DENY_HOVER = 0.1;        // ディナイ時のホバー半径 (m)（密着に近い）

// --- Loose ball ---
export const LOOSE_BALL_PICKUP_RADIUS = 0.5;  // ルーズボール地面回収半径 (m)
export const LOOSE_BALL_GRACE_PERIOD = 0.6;   // ルーズボール突入後の回収不可時間 (秒)

// --- Shoot ---
export const SHOOT_ZONE_X_HALF = 2.44;     // シュート可能エリア X半幅 (ペイント幅)
export const SHOOT_ZONE_Z_MIN = 10.0;      // シュート可能エリア Z下限
export const SHOOT_ZONE_Z_MAX = 14.0;      // シュート可能エリア Z上限
export const GOAL_RIM_X = 0;
export const GOAL_RIM_Y = 3.05;            // リム高さ
export const GOAL_RIM_Z = 13.4;            // Goal1 リム中央 Z
export const GOAL_RIM_RADIUS = 0.23;       // リム半径 (m)
export const SHOT_ARC_HEIGHT = 2.5;        // シュートの放物線高さ (m)
