// --- Scale ---
// 2D Board: 800x600 px  ->  3D Court XZ plane: 12m x 9m
// SCALE_FACTOR = 0.015 m/px
export const S = 0.015;

// --- Field ---
export const SIM_FIELD_X_HALF = 6.0;   // m  (800 * 0.015 / 2)
export const SIM_FIELD_Z_HALF = 4.5;   // m  (600 * 0.015 / 2)
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
export const OB_FOV_HALF_NEAR = Math.PI / 6;         // 30deg
export const OB_FOV_HALF_FAR = Math.PI / 18;         // 10deg
export const FOV_NARROW_DIST = 500 * S;              // 7.5 m
export const FOV_FULL_LEN = Math.sqrt(
  (800 * S) * (800 * S) + (600 * S) * (600 * S),
);                                                    // ~15m
export const FOV_WINDOW_LEN = 220 * S;               // 3.3 m
export const FOV_FOCUS_SPEED = 400 * S;              // 6.0 m/s
export const SEARCH_SWEEP_SPEED = 1.5;               // rad/s
export const SEARCH_SWEEP_MAX = Math.PI / 3;         // 60deg
export const NECK_TURN_RATE = 6.0;                    // rad/s (faster than body TURN_RATE)
export const NECK_MAX_ANGLE = Math.PI / 2;            // ±90deg from body facing
export const TORSO_TURN_RATE = 4.5;                   // rad/s（NECK_TURN_RATE より遅い）
export const TORSO_MAX_ANGLE = Math.PI / 2;           // ±90° from lower body facing
export const TORSO_VISUAL_LERP_SPEED = 8.0;           // 視覚補間速度（NECK=12.0 より遅い）

// --- Visual interpolation ---
export const ARM_LERP_SPEED = 10.0;          // 腕の補間速度
export const NECK_VISUAL_LERP_SPEED = 12.0;  // 首の視覚補間速度

// --- Timing ---
export const FIRE_MIN = 1.5;
export const FIRE_MAX = 3.0;
export const TURN_MIN = 1.0;
export const TURN_MAX = 3.0;
export const BALL_TIMEOUT = 6.0;

// --- Deflection ---
export const DEFLECT_IMPULSE = 1.2;    // 弾きインパルス強度 (kg·m/s)
export const DEFLECT_COOLDOWN = 0.3;   // 同一障害物の連続弾き防止 (秒)
