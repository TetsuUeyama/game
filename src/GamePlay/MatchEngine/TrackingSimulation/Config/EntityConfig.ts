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
];

// --- Solver ---
export const SOLVER_CFG_3D: SolverConfig = {
  coarseStep: 0.05,
  fineStep: 0.005,
  minTime: 0.05,
  maxTime: 10.0,
  bisectIterations: 10,
};

// --- Initial positions (metres, basketball court: goal1 at +Z≈13.4) ---
export const INIT_LAUNCHER = { x: 0, z: 6.2 };     // PG - Top of Key
export const INIT_TARGETS = [
  { x: 5.1,  z: 8.3 },   // SG / SECOND_HANDLER - Right Wing
  { x: -5.1, z: 8.3 },   // SF / SLASHER - Left Wing
  { x: 0,    z: 8.8 },   // C  / SCREENER - High Post
  { x: 2.4,  z: 13.0 },  // PF / DUNKER - Low Post Right
];
export const INIT_OBSTACLES = [
  { x: 0,    z: 5.5 },   // A - guards PG (near Top)
  { x: -4.5, z: 7.5 },   // B - guards SF (near Left Wing)
  { x: 4.5,  z: 7.5 },   // C - guards SG (near Right Wing)
  { x: 3.0,  z: 12.0 },  // D - guards PF (near Low Post)
  { x: 0.5,  z: 8.0 },   // E - guards C (near High Post)
];
