/**
 * Attack definitions: timing, damage, hitboxes.
 * Each attack maps to a motion clip and defines which bones carry the hitbox.
 *
 * Attack naming: {side}_{type}_{height}
 *   side:   r (right) / l (left)
 *   type:   punch / kick
 *   height: upper / mid / lower
 */

export interface AttackDef {
  name: string;
  motionFile: string;        // path to .motion.json
  damage: number;
  /** Bones whose world positions form the attack hitbox during active phase */
  hitBones: string[];
  hitRadius: number;         // detection radius around hitbox bones (viewer units)
  timing: {
    startup: number;         // seconds before hit can connect
    active: number;          // seconds hitbox is active
    recovery: number;        // seconds after active (vulnerable)
  };
  blockStun: number;         // seconds opponent is stunned when blocked
  hitStun: number;           // seconds opponent is stunned on hit
  knockback: number;         // push distance on hit (viewer units)
  lunge: number;             // forward movement during startup (viewer units)
  canChainInto?: string[];   // attack names this can cancel into during recovery
}

// ===== Custom attack motions =====

export const ATTACKS: Record<string, AttackDef> = {

  // ---- RIGHT PUNCHES ----
  r_punch_upper: {
    name: 'r_punch_upper',
    motionFile: '/models/character-motion/right_punch_upper.motion.json',
    damage: 8,
    hitBones: ['RightHand', 'RightForeArm'],
    hitRadius: 0.14,
    timing: { startup: 0.1, active: 0.12, recovery: 0.15 },
    blockStun: 0.12,
    hitStun: 0.3,
    knockback: 0.08,
    lunge: 0.15,
    canChainInto: ['l_punch_mid', 'l_punch_upper', 'r_kick_mid'],
  },
  r_punch_mid: {
    name: 'r_punch_mid',
    motionFile: '/models/character-motion/right_punch_mid.motion.json',
    damage: 6,
    hitBones: ['RightHand', 'RightForeArm'],
    hitRadius: 0.14,
    timing: { startup: 0.06, active: 0.12, recovery: 0.12 },
    blockStun: 0.1,
    hitStun: 0.2,
    knockback: 0.05,
    lunge: 0.18,
    canChainInto: ['l_punch_mid', 'l_punch_upper', 'r_punch_upper', 'r_kick_mid'],
  },
  r_punch_lower: {
    name: 'r_punch_lower',
    motionFile: '/models/character-motion/right_punch_lower.motion.json',
    damage: 7,
    hitBones: ['RightHand', 'RightForeArm'],
    hitRadius: 0.14,
    timing: { startup: 0.08, active: 0.12, recovery: 0.15 },
    blockStun: 0.1,
    hitStun: 0.25,
    knockback: 0.06,
    lunge: 0.12,
    canChainInto: ['l_punch_mid', 'r_kick_lower'],
  },

  // ---- LEFT PUNCHES ----
  l_punch_upper: {
    name: 'l_punch_upper',
    motionFile: '/models/character-motion/left_punch_upper.motion.json',
    damage: 9,
    hitBones: ['LeftHand', 'LeftForeArm'],
    hitRadius: 0.14,
    timing: { startup: 0.12, active: 0.12, recovery: 0.2 },
    blockStun: 0.15,
    hitStun: 0.35,
    knockback: 0.1,
    lunge: 0.15,
    canChainInto: ['r_kick_upper', 'l_kick_mid'],
  },
  l_punch_mid: {
    name: 'l_punch_mid',
    motionFile: '/models/character-motion/left_punch_mid.motion.json',
    damage: 7,
    hitBones: ['LeftHand', 'LeftForeArm'],
    hitRadius: 0.14,
    timing: { startup: 0.08, active: 0.12, recovery: 0.15 },
    blockStun: 0.12,
    hitStun: 0.25,
    knockback: 0.06,
    lunge: 0.16,
    canChainInto: ['r_punch_mid', 'r_punch_upper', 'l_kick_mid'],
  },
  l_punch_lower: {
    name: 'l_punch_lower',
    motionFile: '/models/character-motion/left_punch_lower.motion.json',
    damage: 8,
    hitBones: ['LeftHand', 'LeftForeArm'],
    hitRadius: 0.14,
    timing: { startup: 0.1, active: 0.12, recovery: 0.18 },
    blockStun: 0.1,
    hitStun: 0.28,
    knockback: 0.07,
    lunge: 0.12,
    canChainInto: ['r_punch_lower', 'r_kick_lower'],
  },

  // ---- RIGHT KICKS ----
  r_kick_upper: {
    name: 'r_kick_upper',
    motionFile: '/models/character-motion/right_kick_upper.motion.json',
    damage: 18,
    hitBones: ['RightFoot', 'RightLeg', 'RightToeBase'],
    hitRadius: 0.16,
    timing: { startup: 0.25, active: 0.18, recovery: 0.35 },
    blockStun: 0.25,
    hitStun: 0.5,
    knockback: 0.2,
    lunge: 0.1,
  },
  r_kick_mid: {
    name: 'r_kick_mid',
    motionFile: '/models/character-motion/right_kick_mid.motion.json',
    damage: 14,
    hitBones: ['RightFoot', 'RightLeg'],
    hitRadius: 0.16,
    timing: { startup: 0.18, active: 0.18, recovery: 0.3 },
    blockStun: 0.2,
    hitStun: 0.4,
    knockback: 0.15,
    lunge: 0.12,
    canChainInto: ['l_kick_mid'],
  },
  r_kick_lower: {
    name: 'r_kick_lower',
    motionFile: '/models/character-motion/right_kick_lower.motion.json',
    damage: 10,
    hitBones: ['RightFoot', 'RightLeg'],
    hitRadius: 0.15,
    timing: { startup: 0.12, active: 0.15, recovery: 0.2 },
    blockStun: 0.15,
    hitStun: 0.3,
    knockback: 0.08,
    lunge: 0.08,
    canChainInto: ['r_kick_mid', 'l_kick_lower'],
  },

  // ---- LEFT KICKS ----
  l_kick_upper: {
    name: 'l_kick_upper',
    motionFile: '/models/character-motion/left_kick_upper.motion.json',
    damage: 20,
    hitBones: ['LeftFoot', 'LeftLeg', 'LeftToeBase'],
    hitRadius: 0.17,
    timing: { startup: 0.28, active: 0.2, recovery: 0.4 },
    blockStun: 0.28,
    hitStun: 0.55,
    knockback: 0.22,
    lunge: 0.1,
  },
  l_kick_mid: {
    name: 'l_kick_mid',
    motionFile: '/models/character-motion/left_kick_mid.motion.json',
    damage: 15,
    hitBones: ['LeftFoot', 'LeftLeg'],
    hitRadius: 0.16,
    timing: { startup: 0.2, active: 0.18, recovery: 0.32 },
    blockStun: 0.22,
    hitStun: 0.42,
    knockback: 0.16,
    lunge: 0.12,
    canChainInto: ['r_kick_mid'],
  },
  l_kick_lower: {
    name: 'l_kick_lower',
    motionFile: '/models/character-motion/left_kick_lower.motion.json',
    damage: 11,
    hitBones: ['LeftFoot', 'LeftLeg'],
    hitRadius: 0.15,
    timing: { startup: 0.14, active: 0.15, recovery: 0.22 },
    blockStun: 0.15,
    hitStun: 0.32,
    knockback: 0.09,
    lunge: 0.08,
    canChainInto: ['l_kick_mid', 'r_kick_lower'],
  },
};
