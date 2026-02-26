// --- Offense role types ---
export type SimPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type SimOffenseRole = 'MAIN_HANDLER' | 'SECOND_HANDLER' | 'SCREENER' | 'DUNKER' | 'SLASHER';
export interface SimZone { xMin: number; xMax: number; zMin: number; zMax: number; }
export interface SimRoleAssignment {
  position: SimPosition; role: SimOffenseRole;
  zone: SimZone; homeX: number; homeZ: number;
  speedMult: number; reevalInterval: number;
}

// --- Offense zones (court: 12m x 9m, X:[-6,+6], Z:[-4.5,+4.5], goal: +X) ---
export const ZONE_PG: SimZone         = { xMin: -5.5, xMax: -3.0, zMin: -1.5, zMax: 1.5 };
export const ZONE_SG_WING: SimZone    = { xMin: -1.5, xMax: 2.0,  zMin: -4.0, zMax: -2.0 };
export const ZONE_SF_WING: SimZone    = { xMin: -1.5, xMax: 2.0,  zMin: 2.0,  zMax: 4.0 };
export const ZONE_C_POST: SimZone     = { xMin: 0.0,  xMax: 3.0,  zMin: -1.0, zMax: 1.0 };
export const ZONE_PF_LOW: SimZone     = { xMin: 3.0,  xMax: 5.5,  zMin: -2.5, zMax: -0.5 };

// --- Role assignment table ---
export const ROLE_ASSIGNMENTS: {
  launcher: SimRoleAssignment;
  targets: SimRoleAssignment[];
} = {
  launcher: {
    position: 'PG', role: 'MAIN_HANDLER',
    zone: ZONE_PG, homeX: -4.2, homeZ: 0,
    speedMult: 1.0, reevalInterval: 1.5,
  },
  targets: [
    { position: 'SG', role: 'SECOND_HANDLER', zone: ZONE_SG_WING, homeX: 0.25, homeZ: -3.0, speedMult: 1.0, reevalInterval: 1.5 },
    { position: 'SF', role: 'SLASHER', zone: ZONE_SF_WING, homeX: 0.25, homeZ: 3.0, speedMult: 1.1, reevalInterval: 1.2 },
    { position: 'C',  role: 'SCREENER', zone: ZONE_C_POST, homeX: 1.5, homeZ: 0, speedMult: 0.9, reevalInterval: 2.0 },
    { position: 'PF', role: 'DUNKER', zone: ZONE_PF_LOW, homeX: 4.2, homeZ: -1.5, speedMult: 0.95, reevalInterval: 1.8 },
  ],
};

// --- Role-specific constants ---
export const LAUNCHER_EVAL_SAMPLES = 12;
export const SLASHER_VCUT_AMPLITUDE = 1.5;
export const SLASHER_VCUT_PERIOD = 3.0;
export const OPEN_THRESHOLD = 1.2;
export const SCREENER_OFFSET = 1.0;
export const DUNKER_SEAL_DIST = 0.8;
