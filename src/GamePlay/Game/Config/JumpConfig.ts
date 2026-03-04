import { ENTITY_HEIGHT } from "./FieldConfig";

// --- Jump physics ---
export const GRAVITY = 9.81;

// --- Shot type distance thresholds ---
export const DUNK_MAX_DIST = 1.5;
export const LAYUP_MAX_DIST = 3.0;

// --- Shot-type jump velocities (m/s) ---
export const DUNK_JUMP_VY = 5.0;
export const LAYUP_JUMP_VY = 3.8;
export const JUMPSHOT_JUMP_VY = 4.2;

// --- Shot-type arc heights ---
export const DUNK_ARC_HEIGHT = 0.5;
export const LAYUP_ARC_HEIGHT = 1.2;
// JUMPSHOT uses existing SHOT_ARC_HEIGHT = 2.5

// --- Shot-type startup times ---
export const DUNK_STARTUP = 0.2;
export const LAYUP_STARTUP = 0.25;
// JUMPSHOT uses existing 0.3

// --- Shot-type release Y offsets ---
export const DUNK_RELEASE_Y_OFFSET = ENTITY_HEIGHT + 0.3;
export const LAYUP_RELEASE_Y_OFFSET = ENTITY_HEIGHT * 0.7;
// JUMPSHOT uses ENTITY_HEIGHT + 0.3 (same as dunk, existing value)

// --- Block ---
export const BLOCK_JUMP_VY = 4.5;
export const BLOCK_TRIGGER_DIST = 2.5;
export const BLOCK_REACTION_DELAY = 0.1;
export const BLOCK_ATTEMPT_PROB = 0.7;

// --- Airborne physics ---
export const JUMP_HORIZONTAL_MULT = 0.3;

// --- Sprint cooldown (速度ベースの停止リカバリー) ---
export const SPRINT_COOLDOWN_SPEED_MIN = 1.0;    // この速度以下はリカバリー増加なし (m/s)
export const SPRINT_COOLDOWN_PER_SPEED = 0.12;   // 速度1m/sあたりの追加リカバリー (秒)
export const SPRINT_COOLDOWN_MAX = 0.5;           // 最大リカバリー (秒)

// --- Jump momentum (慣性ジャンプ) ---
export const JUMP_MOMENTUM_CARRY = 0.85;          // ジャンプ開始時の速度維持率
