// --- Scale ---
export const S = 0.015;               // 速度・距離の変換用

// --- Field (basketball court) ---
export const SIM_FIELD_X_HALF = 7.5;  // コート幅 15m / 2
export const SIM_FIELD_Z_HALF = 15.0; // コート長さ 30m / 2
export const SIM_MARGIN = 30 * S;      // 0.45 m

// --- Entity size ---
export const ENTITY_HEIGHT = 1.0;      // m
export const BASE_HEIGHT_CM = 150;     // scale=1.0 に対応する身長 (cm)
export const LAUNCHER_SIZE = 0.6;      // m (box width/depth)
export const TARGET_SIZE = 0.5;        // m
export const OBSTACLE_SIZE = 0.44;     // m
export const BALL_DIAMETER = 0.3;      // m

// --- Movement thresholds ---
export const TARGET_STOP_DIST = 0.075;  // 5 * S = 0.075 m — target stops when within this distance

// --- Offense zones (court: 15m x 30m, goal1: +Z side) ---
export interface SimZone { xMin: number; xMax: number; zMin: number; zMax: number; }
export const ZONE_PG: SimZone         = { xMin: -3.0, xMax: 3.0,  zMin: 4.5,  zMax: 9.5 };
export const ZONE_SG_WING: SimZone    = { xMin: 3.0,  xMax: 7.0,  zMin: 6.5,  zMax: 12.5 };
export const ZONE_SF_WING: SimZone    = { xMin: -7.0, xMax: -3.0, zMin: 6.5,  zMax: 12.5 };
export const ZONE_C_POST: SimZone     = { xMin: -2.5, xMax: 2.5,  zMin: 7.5,  zMax: 13.5 };
export const ZONE_PF_LOW: SimZone     = { xMin: -0.5, xMax: 5.5,  zMin: 11.0, zMax: 14.5 };

// --- Spawn area: red paint area (goal2, -Z side) ---
export const SPAWN_PAINT_X_HALF = 2.44;
export const SPAWN_PAINT_Z_MIN = -14.8;
export const SPAWN_PAINT_Z_MAX = -8.83;
export const SPAWN_BASELINE_Z = -14.5;
