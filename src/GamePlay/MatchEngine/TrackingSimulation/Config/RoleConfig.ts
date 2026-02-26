// --- Offense role types ---
export type SimPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type SimOffenseRole = 'MAIN_HANDLER' | 'SECOND_HANDLER' | 'SCREENER' | 'DUNKER' | 'SLASHER';
export interface SimZone { xMin: number; xMax: number; zMin: number; zMax: number; }
export interface SimRoleAssignment {
  position: SimPosition; role: SimOffenseRole;
  zone: SimZone; homeX: number; homeZ: number;
  speedMult: number; reevalInterval: number;
}

// --- Offense zones (court: 15m x 30m, goal1: +Z side Z≈13.4, attack: +Z) ---
// PG (Top of Key): 3Pアーク頂点 (Z≈6.2)
export const ZONE_PG: SimZone         = { xMin: -3.0, xMax: 3.0,  zMin: 4.5,  zMax: 7.5 };
// SG (Right Wing): 右ウィング (X≈5.1, Z≈8.3)
export const ZONE_SG_WING: SimZone    = { xMin: 3.0,  xMax: 7.0,  zMin: 6.5,  zMax: 10.5 };
// SF (Left Wing): 左ウィング (X≈-5.1, Z≈8.3)
export const ZONE_SF_WING: SimZone    = { xMin: -7.0, xMax: -3.0, zMin: 6.5,  zMax: 10.5 };
// C (High Post): ハイポスト/FTライン付近 (Z≈8.8)
export const ZONE_C_POST: SimZone     = { xMin: -2.5, xMax: 2.5,  zMin: 7.5,  zMax: 11.0 };
// PF (Low Post): ローポスト右 (X≈2.4, Z≈13.0)
export const ZONE_PF_LOW: SimZone     = { xMin: -0.5, xMax: 5.5,  zMin: 11.0, zMax: 14.5 };

// --- Role assignment table ---
export const ROLE_ASSIGNMENTS: {
  launcher: SimRoleAssignment;
  targets: SimRoleAssignment[];
} = {
  launcher: {
    position: 'PG', role: 'MAIN_HANDLER',
    zone: ZONE_PG, homeX: 0, homeZ: 6.2,
    speedMult: 1.0, reevalInterval: 1.5,
  },
  targets: [
    { position: 'SG', role: 'SECOND_HANDLER', zone: ZONE_SG_WING, homeX: 5.1, homeZ: 8.3, speedMult: 1.0, reevalInterval: 1.5 },
    { position: 'SF', role: 'SLASHER', zone: ZONE_SF_WING, homeX: -5.1, homeZ: 8.3, speedMult: 1.1, reevalInterval: 1.2 },
    { position: 'C',  role: 'SCREENER', zone: ZONE_C_POST, homeX: 0, homeZ: 8.8, speedMult: 0.9, reevalInterval: 2.0 },
    { position: 'PF', role: 'DUNKER', zone: ZONE_PF_LOW, homeX: 2.4, homeZ: 13.0, speedMult: 0.95, reevalInterval: 1.8 },
  ],
};

// --- Spawn area: red paint area (goal2, -Z side) ---
export const SPAWN_PAINT_X_HALF = 2.44;   // レーン半幅
export const SPAWN_PAINT_Z_MIN = -14.8;   // ベースライン寄り（壁衝突回避）
export const SPAWN_PAINT_Z_MAX = -8.83;   // FTライン
export const SPAWN_BASELINE_Z = -14.5;    // ボールホルダー開始位置

// --- Role-specific constants ---
export const LAUNCHER_EVAL_SAMPLES = 12;
export const SLASHER_VCUT_AMPLITUDE = 1.5;
export const SLASHER_VCUT_PERIOD = 3.0;
export const OPEN_THRESHOLD = 1.2;
export const SCREENER_OFFSET = 1.0;
export const DUNKER_SEAL_DIST = 0.8;
