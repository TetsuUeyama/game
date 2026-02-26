import type { SolverConfig } from "@/SimulationPlay/TargetTrackingAccuracySystem";
import { S } from "./FieldConfig";

// --- Speed (m/s) ---
export const LAUNCHER_SPEED = 60 * S;               // 0.90
export const TARGET_RANDOM_SPEED = 80 * S;           // 1.20
export const TARGET_INTERCEPT_SPEED = 180 * S;       // 2.70
export const BALL_SPEED = 250 * S;                   // 3.75

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
