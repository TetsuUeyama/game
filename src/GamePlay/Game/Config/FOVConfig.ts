// --- Facing / FOV ---
import { S, SIM_FIELD_X_HALF, SIM_FIELD_Z_HALF } from "./FieldConfig";

export const OB_FOV_HALF_NEAR = Math.PI / 4;         // 45deg
export const OB_FOV_HALF_FAR = Math.PI / 9;          // 20deg
export const FOV_NARROW_DIST = 500 * S;              // 7.5 m
export const FOV_FULL_LEN = Math.sqrt(
  (SIM_FIELD_X_HALF * 2) ** 2 + (SIM_FIELD_Z_HALF * 2) ** 2,
);                                                    // ~33.5m
export const FOV_WINDOW_LEN = 220 * S;               // 3.3 m
export const FOV_FOCUS_SPEED = 400 * S;              // 6.0 m/s
export const SEARCH_SWEEP_SPEED = 8.0;               // rad/s（見失い時に素早く首を振る）
export const SEARCH_SWEEP_MAX = Math.PI * 0.85;      // 153deg（ほぼ後方まで首振り）
