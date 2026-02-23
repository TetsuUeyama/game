import type { SolverConfig } from "@/SimulationPlay/TargetTrackingAccuracySystem";
import { S } from "./FieldConfig";

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

export const INIT_LAUNCHER = { x: -4.2, z: 0 };
export const INIT_TARGETS = [
  { x: 0.25, z: -3.0 },   // SG / SECOND_HANDLER - Wing right
  { x: 0.25, z: 3.0 },    // SF / SLASHER - Wing left
  { x: 1.5, z: 0 },       // C  / SCREENER - High post
  { x: 4.2, z: -1.5 },    // PF / DUNKER - Low post
  { x: 4.5, z: 3.25 },    // SG / SPACER - Corner
];
export const INIT_OBSTACLES = [
  { x: px2x(350), z: px2z(300) },  // A
  { x: px2x(200), z: px2z(350) },  // B
  { x: px2x(550), z: px2z(200) },  // C
  { x: px2x(600), z: px2z(400) },  // D
  { x: px2x(300), z: px2z(150) },  // E
];
