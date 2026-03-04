import {
  type SimZone,
  ZONE_PG, ZONE_SG_WING, ZONE_SF_WING, ZONE_C_POST, ZONE_PF_LOW,
} from "../Config/FieldConfig";

// --- Offense role types ---
export type SimPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type SimOffenseRole = 'MAIN_HANDLER' | 'SECOND_HANDLER' | 'SCREENER' | 'DUNKER' | 'SLASHER';
export interface SimRoleAssignment {
  position: SimPosition; role: SimOffenseRole;
  zone: SimZone; homeX: number; homeZ: number;
  speedMult: number; reevalInterval: number;
}

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
    { position: 'C',  role: 'SCREENER', zone: ZONE_C_POST, homeX: 0, homeZ: 10.5, speedMult: 0.9, reevalInterval: 2.0 },
    { position: 'PF', role: 'DUNKER', zone: ZONE_PF_LOW, homeX: 2.4, homeZ: 13.0, speedMult: 0.95, reevalInterval: 1.8 },
  ],
};

// --- Role-specific constants ---
export const LAUNCHER_EVAL_SAMPLES = 12;
export const SLASHER_VCUT_AMPLITUDE = 1.5;
export const SLASHER_VCUT_PERIOD = 3.0;
export const OPEN_THRESHOLD = 1.2;
export const SCREENER_OFFSET = 1.0;
export const DUNKER_SEAL_DIST = 0.8;
