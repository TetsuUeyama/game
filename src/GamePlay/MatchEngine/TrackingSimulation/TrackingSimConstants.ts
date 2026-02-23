import type { SolverConfig } from "@/SimulationPlay/TargetTrackingAccuracySystem";

// --- Scale ---
// 2D Board: 800x600 px  ->  3D Court XZ plane: 12m x 9m
// SCALE_FACTOR = 0.015 m/px
const S = 0.015;

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
export const PHYSICAL_MARGIN = 35 * S; // 0.525 m

// --- Speed (m/s) ---
export const LAUNCHER_SPEED = 60 * S;               // 0.90
export const TARGET_RANDOM_SPEED = 80 * S;           // 1.20
export const TARGET_INTERCEPT_SPEED = 180 * S;       // 2.70
export const OB_A_IDLE_SPEED = 70 * S;               // 1.05
export const OB_A_INTERCEPT_SPEED = 160 * S;         // 2.40
export const OB_B_CHASE_SPEED = 65 * S;              // 0.975
export const OB_C_IDLE_SPEED = 70 * S;               // 1.05
export const OB_C_INTERCEPT_SPEED = 150 * S;         // 2.25
export const OB_D_IDLE_SPEED = 65 * S;               // 0.975
export const OB_D_INTERCEPT_SPEED = 155 * S;         // 2.325
export const OB_E_IDLE_SPEED = 75 * S;               // 1.125
export const OB_E_INTERCEPT_SPEED = 145 * S;         // 2.175
export const BALL_SPEED = 250 * S;                   // 3.75

// --- Hover radius (m) ---
export const OB_A_HOVER_RADIUS = 60 * S;  // 0.90
export const OB_B_HOVER_RADIUS = 50 * S;  // 0.75
export const OB_C_HOVER_RADIUS = 50 * S;  // 0.75
export const OB_D_HOVER_RADIUS = 55 * S;  // 0.825
export const OB_E_HOVER_RADIUS = 60 * S;  // 0.90

// --- Facing / FOV ---
export const TURN_RATE = 4.0;                        // rad/s
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

// --- Timing ---
export const FIRE_MIN = 1.5;
export const FIRE_MAX = 3.0;
export const TURN_MIN = 1.0;
export const TURN_MAX = 3.0;
export const BALL_TIMEOUT = 6.0;

// --- Target 4 area (A1-B2) ---
export const T4_X1 = (0 - 400) * S;     // -6.0
export const T4_Z1 = (0 - 300) * S;     // -4.5
export const T4_X2 = (80 - 400) * S;    // -4.8
export const T4_Z2 = (80 - 300) * S;    // -3.3

// --- Target 5 area (S1-T2) ---
export const T5_X1 = (720 - 400) * S;   // 4.8
export const T5_Z1 = (0 - 300) * S;     // -4.5
export const T5_X2 = (800 - 400) * S;   // 6.0
export const T5_Z2 = (80 - 300) * S;    // -3.3

// --- Colors ---
export const TARGET_COLORS_3D = [
  { r: 0.8, g: 0.27, b: 0.27 },  // red
  { r: 0.8, g: 0.47, b: 0.0 },   // orange
  { r: 0.13, g: 0.53, b: 0.67 }, // cyan
  { r: 0.4, g: 0.6, b: 0.0 },    // yellow-green
  { r: 0.67, g: 0.27, b: 0.53 }, // pink
];

// --- Solver ---
export const SOLVER_CFG_3D: SolverConfig = {
  coarseStep: 0.05,
  fineStep: 0.005,
  minTime: 0.05,
  maxTime: 10.0,
  bisectIterations: 10,
};

// --- Initial positions (converted from 2D px) ---
function px2x(px: number): number { return (px - 400) * S; }
function px2z(pz: number): number { return (pz - 300) * S; }

export const INIT_LAUNCHER = { x: px2x(80), z: px2z(300) };
export const INIT_TARGETS = [
  { x: px2x(600), z: px2z(150) },
  { x: px2x(650), z: px2z(450) },
  { x: px2x(500), z: px2z(80) },
  { x: px2x(40), z: px2z(40) },
  { x: px2x(760), z: px2z(40) },
];
export const INIT_OBSTACLES = [
  { x: px2x(350), z: px2z(300) },  // A
  { x: px2x(200), z: px2z(350) },  // B
  { x: px2x(550), z: px2z(200) },  // C
  { x: px2x(600), z: px2z(400) },  // D
  { x: px2x(300), z: px2z(150) },  // E
];
