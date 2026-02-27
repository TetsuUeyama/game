// --- Collision radii ---
import { S, LAUNCHER_SIZE, TARGET_SIZE, OBSTACLE_SIZE } from "./FieldConfig";

export const HIT_RADIUS = 24 * S;     // 0.36 m
export const BLOCK_RADIUS = 20 * S;   // 0.30 m
export const HAND_CATCH_RADIUS = 0.15;   // キャッチ判定半径（手中心から）
export const HAND_BLOCK_RADIUS = 0.12;   // ブロック判定半径（手中心から）
export const PHYSICAL_MARGIN = 35 * S; // 0.525 m

// --- Entity collision radii (half of box size) ---
export const LAUNCHER_RADIUS = LAUNCHER_SIZE / 2;  // 0.30 m
export const TARGET_RADIUS = TARGET_SIZE / 2;       // 0.25 m
export const OBSTACLE_RADIUS = OBSTACLE_SIZE / 2;   // 0.22 m
