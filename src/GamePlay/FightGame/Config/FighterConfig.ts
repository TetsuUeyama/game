/**
 * Fighter configuration: physics, movement, and hitzone definitions.
 */

/** Hitzone: defines a damageable area on the body */
export interface HitzoneConfig {
  bones: string[];         // bones that form this hitzone
  radius: number;          // hit detection radius around bone (viewer units)
  damageMultiplier: number; // damage multiplier for hits to this zone
  label: string;
}

/** Per-fighter stats */
export interface FighterStats {
  maxHp: number;
  moveSpeed: number;       // units/sec (viewer space)
  jumpVelocity: number;    // units/sec upward
  gravity: number;         // units/sec²
  blockDamageRatio: number; // blocked damage = damage × this (e.g. 0.1 = 10%)
  maxGuard: number;        // guard gauge max value
  guardRegenRate: number;  // guard regen per second (while not blocking)
  guardRegenDelay: number; // seconds after last block before regen starts
}

export const DEFAULT_FIGHTER_STATS: FighterStats = {
  maxHp: 100,
  moveSpeed: 0.8,
  jumpVelocity: 1.8,
  gravity: 5.0,
  blockDamageRatio: 0.1,
  maxGuard: 100,
  guardRegenRate: 15,
  guardRegenDelay: 1.0,
};

/** Standard hitzones — radius values tuned for voxel character scale (~0.02 per voxel) */
export const HITZONES: HitzoneConfig[] = [
  { bones: ['Head', 'Neck'],                                         radius: 0.12, damageMultiplier: 1.5, label: 'Head' },
  { bones: ['Spine', 'Spine1', 'Spine2', 'Hips'],                   radius: 0.15, damageMultiplier: 1.0, label: 'Body' },
  { bones: ['LeftArm', 'LeftForeArm', 'LeftHand',
            'RightArm', 'RightForeArm', 'RightHand'],               radius: 0.08, damageMultiplier: 0.8, label: 'Arms' },
  { bones: ['LeftUpLeg', 'LeftLeg', 'LeftFoot',
            'RightUpLeg', 'RightLeg', 'RightFoot'],                 radius: 0.10, damageMultiplier: 0.8, label: 'Legs' },
];

/** Fight stage settings */
export const STAGE_CONFIG = {
  arenaRadius: 2.5,        // circular arena radius (viewer units)
  groundY: 0,              // ground level
  cameraDistance: 4.0,
  cameraHeight: 0.8,
  roundTime: 60,           // seconds
  roundsToWin: 2,
  hitstopFrames: 3,        // frames to freeze on hit
};

/** Player spawn positions (viewer XZ) */
export const P1_SPAWN = { x: -0.6, z: 0 };
export const P2_SPAWN = { x: 0.6, z: 0 };
