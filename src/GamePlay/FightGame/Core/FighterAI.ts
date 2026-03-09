/**
 * Simple fighting game AI.
 * Evaluates distance, opponent state, and own state to decide actions.
 *
 * Behaviors:
 *   - Approach when too far, retreat when too close
 *   - Attack when in range, choosing appropriate height
 *   - Block when opponent is attacking
 *   - Strafe occasionally to vary approach angle
 *   - Chain combos when landing hits
 */

import type { FighterInput } from '@/GamePlay/FightGame/Core/InputHandler';
import type { FighterState } from '@/GamePlay/FightGame/Fighter/Fighter';
import { ATTACKS } from '@/GamePlay/FightGame/Config/AttackConfig';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

interface AIConfig {
  /** Reaction time: min seconds between decisions */
  reactionTime: number;
  /** Probability to block when opponent attacks (0-1) */
  blockChance: number;
  /** Probability to attempt attack when in range (0-1) */
  attackChance: number;
  /** Probability to combo after landing a hit (0-1) */
  comboChance: number;
  /** Preferred engagement distance */
  preferredDist: number;
  /** Probability to strafe instead of walking straight (0-1) */
  strafeChance: number;
  /** Probability to attempt grapple at close range (0-1) */
  grappleChance: number;
  /** Mash speed during grapple escape (inputs per decision) */
  escapeMashRate: number;
}

const AI_CONFIGS: Record<AIDifficulty, AIConfig> = {
  easy: {
    reactionTime: 0.5,
    blockChance: 0.2,
    attackChance: 0.3,
    comboChance: 0.15,
    preferredDist: 0.5,
    strafeChance: 0.1,
    grappleChance: 0.05,
    escapeMashRate: 1,
  },
  normal: {
    reactionTime: 0.25,
    blockChance: 0.45,
    attackChance: 0.5,
    comboChance: 0.4,
    preferredDist: 0.45,
    strafeChance: 0.25,
    grappleChance: 0.12,
    escapeMashRate: 2,
  },
  hard: {
    reactionTime: 0.1,
    blockChance: 0.7,
    attackChance: 0.7,
    comboChance: 0.65,
    preferredDist: 0.4,
    strafeChance: 0.35,
    grappleChance: 0.2,
    escapeMashRate: 3,
  },
};

// Available attack pools by type
const PUNCH_ATTACKS = ['r_punch_mid', 'l_punch_mid', 'r_punch_upper', 'l_punch_upper', 'r_punch_lower', 'l_punch_lower'];
const KICK_ATTACKS = ['r_kick_mid', 'l_kick_mid', 'r_kick_upper', 'l_kick_upper', 'r_kick_lower', 'l_kick_lower'];

export class FighterAI {
  private config: AIConfig;
  private decisionTimer = 0;
  private currentDecision: FighterInput;
  private lastAttackName: string | null = null;

  constructor(difficulty: AIDifficulty = 'normal') {
    this.config = AI_CONFIGS[difficulty];
    this.currentDecision = this.emptyInput();
  }

  setDifficulty(difficulty: AIDifficulty): void {
    this.config = AI_CONFIGS[difficulty];
  }

  /**
   * Generate input for this AI-controlled fighter.
   */
  update(self: FighterState, opponent: FighterState, dt: number): FighterInput {
    this.decisionTimer -= dt;

    // Only make new decisions at reaction-time intervals
    if (this.decisionTimer > 0) {
      // Clear one-shot inputs (attack) after first frame
      const out = { ...this.currentDecision };
      this.currentDecision.attack = null;
      this.currentDecision.jump = false;
      return out;
    }

    this.decisionTimer = this.config.reactionTime * (0.7 + Math.random() * 0.6);
    this.currentDecision = this.decide(self, opponent);

    // Track attack for combo purposes
    if (this.currentDecision.attack) {
      this.lastAttackName = this.currentDecision.attack;
    }

    return { ...this.currentDecision };
  }

  private decide(self: FighterState, opponent: FighterState): FighterInput {
    const input = this.emptyInput();

    // Can't act during stun/knockdown
    if (self.stunTimer > 0 || self.action === 'knockdown') {
      return input;
    }

    const dx = opponent.x - self.x;
    const dz = opponent.z - self.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const opponentAttacking = opponent.action === 'attack' &&
      (opponent.attackPhase === 'startup' || opponent.attackPhase === 'active');

    // === DEFENSIVE: Block when opponent attacks nearby ===
    if (opponentAttacking && dist < 0.8 && !self.guardBroken) {
      if (Math.random() < this.config.blockChance) {
        input.block = true;
        return input;
      }
    }

    // === GRAPPLE: Very close range ===
    const grappleRange = 0.4;
    const canGrapple = self.action === 'idle' || self.action === 'walk_fwd' ||
      self.action === 'strafe';

    if (dist < grappleRange && canGrapple && Math.random() < this.config.grappleChance) {
      input.grapple = Math.random() < 0.5 ? 'takedown' : 'hip_throw';
      return input;
    }

    // === ESCAPE: Mash when grappled ===
    if (self.action === 'grappled') {
      input.mash = Math.random() < 0.5; // random mashing per frame
      return input;
    }

    // === MOUNT PUNCH: Attack when grappling (mounted) ===
    if (self.action === 'grapple') {
      input.attack = 'r_punch_mid'; // mount punches
      return input;
    }

    // === ATTACK: When in range ===
    const attackRange = 0.65;
    const canAttack = self.action === 'idle' || self.action === 'walk_fwd' ||
      self.action === 'walk_back' || self.action === 'strafe';

    if (dist < attackRange && canAttack) {
      // Try combo chain if we just landed a hit
      if (self.action === 'attack' && self.attackPhase === 'recovery' && self.currentAttack?.canChainInto) {
        if (Math.random() < this.config.comboChance) {
          const chains = self.currentAttack.canChainInto;
          input.attack = chains[Math.floor(Math.random() * chains.length)];
          return input;
        }
      }

      if (Math.random() < this.config.attackChance) {
        input.attack = this.chooseAttack(dist);
        return input;
      }
    }

    // === MOVEMENT ===
    if (dist > this.config.preferredDist + 0.15) {
      // Too far — approach
      input.forward = true;

      // Sometimes strafe while approaching
      if (Math.random() < this.config.strafeChance) {
        if (Math.random() < 0.5) input.strafeLeft = true;
        else input.strafeRight = true;
      }
    } else if (dist < this.config.preferredDist - 0.1) {
      // Too close — back up slightly
      input.backward = true;
    } else {
      // In sweet spot — strafe or stand
      if (Math.random() < this.config.strafeChance * 2) {
        if (Math.random() < 0.5) input.strafeLeft = true;
        else input.strafeRight = true;
      }
    }

    return input;
  }

  private chooseAttack(dist: number): string {
    // Far range: prefer kicks (longer reach)
    // Close range: prefer punches (faster)
    const useKick = dist > 0.45 ? 0.7 : 0.3;
    const pool = Math.random() < useKick ? KICK_ATTACKS : PUNCH_ATTACKS;

    // If we just hit, try to chain
    if (this.lastAttackName) {
      const lastAttack = ATTACKS[this.lastAttackName];
      if (lastAttack?.canChainInto && lastAttack.canChainInto.length > 0 &&
          Math.random() < this.config.comboChance) {
        const chains = lastAttack.canChainInto;
        return chains[Math.floor(Math.random() * chains.length)];
      }
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  private emptyInput(): FighterInput {
    return {
      forward: false, backward: false,
      strafeLeft: false, strafeRight: false,
      jump: false, attack: null, block: false,
      grapple: null, mash: false,
    };
  }
}
