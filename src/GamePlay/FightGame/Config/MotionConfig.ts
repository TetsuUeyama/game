/**
 * Action ↔ Motion mapping.
 * Maps fighter actions/attacks to motion clip files.
 * Missing motions use null (fighter stays in rest pose).
 */

export interface MotionDef {
  file: string | null;    // path to .motion.json, or null if not yet available
  loop: boolean;          // loop playback
  speed: number;          // playback speed multiplier
  blendIn: number;        // cross-fade blend-in duration (seconds)
}

/**
 * Action motions: played based on FighterAction state.
 * These are non-attack motions (idle, walk, block, etc.)
 */
export const ACTION_MOTIONS: Record<string, MotionDef> = {
  idle: {
    file: null,  // TODO: Add Mixamo "Idle" motion
    loop: true,
    speed: 1.0,
    blendIn: 0.2,
  },
  walk_fwd: {
    file: null,  // TODO: Add Mixamo "Walking" motion
    loop: true,
    speed: 1.0,
    blendIn: 0.15,
  },
  walk_back: {
    file: null,  // TODO: Add Mixamo "Walking" motion (reverse playback)
    loop: true,
    speed: -0.7,  // negative = reverse
    blendIn: 0.15,
  },
  strafe: {
    file: null,  // TODO: Add Mixamo "Strafe" motion
    loop: true,
    speed: 1.0,
    blendIn: 0.15,
  },
  jump: {
    file: '/models/character-motion/Jump.motion.json',
    loop: false,
    speed: 1.0,
    blendIn: 0.1,
  },
  block: {
    file: null,  // TODO: Add Mixamo "Block" pose
    loop: true,
    speed: 1.0,
    blendIn: 0.1,
  },
  hitstun: {
    file: null,  // TODO: Add Mixamo "Hit Reaction" motion
    loop: false,
    speed: 1.0,
    blendIn: 0.05,
  },
  knockdown: {
    file: '/models/character-motion/brutal_assassination.motion.json',
    loop: false,
    speed: 1.0,
    blendIn: 0.1,
  },
  knockdown_fwd: {
    file: '/models/character-motion/brutal_assassination.motion.json',
    loop: false,
    speed: 1.0,
    blendIn: 0.1,
  },
  // Grapple attacker motions (selected dynamically by grapple name)
  grapple: { file: null, loop: false, speed: 1.0, blendIn: 0.1 },
  grapple_takedown_atk: { file: '/models/character-motion/takedown_atk.motion.json', loop: false, speed: 1.0, blendIn: 0.1 },
  grapple_hip_throw_atk: { file: '/models/character-motion/hip_throw_atk.motion.json', loop: false, speed: 1.0, blendIn: 0.1 },
  // Grapple defender motions
  grappled: { file: null, loop: false, speed: 1.0, blendIn: 0.1 },
  grapple_takedown_def: { file: '/models/character-motion/takedown_def.motion.json', loop: false, speed: 1.0, blendIn: 0.1 },
  grapple_hip_throw_def: { file: '/models/character-motion/hip_throw_def.motion.json', loop: false, speed: 1.0, blendIn: 0.1 },
};

/**
 * Attack motions: played when attack action starts.
 * Keyed by attack name (from AttackConfig).
 */
export const ATTACK_MOTIONS: Record<string, MotionDef> = {
  // Right punches
  r_punch_upper: { file: '/models/character-motion/right_punch_upper.motion.json', loop: false, speed: 1.3, blendIn: 0.04 },
  r_punch_mid:   { file: '/models/character-motion/right_punch_mid.motion.json',   loop: false, speed: 1.4, blendIn: 0.03 },
  r_punch_lower: { file: '/models/character-motion/right_punch_lower.motion.json', loop: false, speed: 1.3, blendIn: 0.04 },
  // Left punches
  l_punch_upper: { file: '/models/character-motion/left_punch_upper.motion.json', loop: false, speed: 1.2, blendIn: 0.04 },
  l_punch_mid:   { file: '/models/character-motion/left_punch_mid.motion.json',   loop: false, speed: 1.3, blendIn: 0.04 },
  l_punch_lower: { file: '/models/character-motion/left_punch_lower.motion.json', loop: false, speed: 1.2, blendIn: 0.04 },
  // Right kicks
  r_kick_upper: { file: '/models/character-motion/right_kick_upper.motion.json', loop: false, speed: 1.0, blendIn: 0.06 },
  r_kick_mid:   { file: '/models/character-motion/right_kick_mid.motion.json',   loop: false, speed: 1.1, blendIn: 0.05 },
  r_kick_lower: { file: '/models/character-motion/right_kick_lower.motion.json', loop: false, speed: 1.2, blendIn: 0.05 },
  // Left kicks
  l_kick_upper: { file: '/models/character-motion/left_kick_upper.motion.json', loop: false, speed: 1.0, blendIn: 0.06 },
  l_kick_mid:   { file: '/models/character-motion/left_kick_mid.motion.json',   loop: false, speed: 1.1, blendIn: 0.05 },
  l_kick_lower: { file: '/models/character-motion/left_kick_lower.motion.json', loop: false, speed: 1.2, blendIn: 0.05 },
};

/**
 * Get the motion def for a fighter's current state.
 * @param knockdownVariant - optional: 'knockdown' or 'knockdown_fwd'
 * @param grappleMotionKey - optional: e.g. 'grapple_takedown_atk'
 */
export function getMotionForAction(
  action: string,
  attackName?: string,
  knockdownVariant?: string,
  grappleMotionKey?: string | null,
): MotionDef | null {
  if (action === 'attack' && attackName) {
    return ATTACK_MOTIONS[attackName] ?? null;
  }
  if (action === 'knockdown' && knockdownVariant) {
    return ACTION_MOTIONS[knockdownVariant] ?? ACTION_MOTIONS['knockdown'];
  }
  if ((action === 'grapple' || action === 'grappled') && grappleMotionKey) {
    return ACTION_MOTIONS[grappleMotionKey] ?? ACTION_MOTIONS[action];
  }
  return ACTION_MOTIONS[action] ?? null;
}
