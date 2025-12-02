/**
 * SpecialAttacks - 必殺技・超必殺技
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';
import { ATTACK_STRENGTH_MAP, COOLDOWNS, AttackType } from '../../config/gameConfig';

/**
 * 必殺技（上中段）
 */
export class SpecialHighMidAttack extends BaseAction {
  readonly name = 'specialHighMid';
  readonly category = 'attack' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isBlocking || fighter.isJumping) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('attack', 'special1');
    }

    fighter.performAttack('specialHighMid');

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return { stamina: 0 };
  }

  getCooldown(): number {
    const attackStrength = ATTACK_STRENGTH_MAP['specialHighMid'];
    return COOLDOWNS[attackStrength];
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 中距離で優先度が高い
    if (distance > 100 && distance < 200) {
      return 5;
    }
    return 3;
  }
}

/**
 * 必殺技（中下段）
 */
export class SpecialMidLowAttack extends BaseAction {
  readonly name = 'specialMidLow';
  readonly category = 'attack' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isBlocking || fighter.isJumping) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('attack', 'special2');
    }

    fighter.performAttack('specialMidLow');

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return { stamina: 0 };
  }

  getCooldown(): number {
    const attackStrength = ATTACK_STRENGTH_MAP['specialMidLow'];
    return COOLDOWNS[attackStrength];
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 近～中距離で優先度が高い
    if (distance > 80 && distance < 180) {
      return 5;
    }
    return 3;
  }
}

/**
 * 超必殺技
 */
export class SuperSpecialAttack extends BaseAction {
  readonly name = 'superSpecial';
  readonly category = 'special' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isBlocking || fighter.isJumping) return false;

    // 必殺技ゲージが100必要
    if (fighter.specialMeter < 100) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('attack', 'super-special');
    }

    fighter.performAttack('superSpecial');

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {
      stamina: 0,
      specialMeter: 100 // ゲージ全消費
    };
  }

  getCooldown(): number {
    const attackStrength = ATTACK_STRENGTH_MAP['superSpecial'];
    return COOLDOWNS[attackStrength];
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);
    const opponentHealthPercent = opponent.health / opponent.maxHealth;

    // 相手の体力が少ない場合、優先度を大幅に上げる
    if (opponentHealthPercent < 0.3 && distance < 250) {
      return 10; // 最高優先度
    }

    // 中距離で優先度高
    if (distance > 100 && distance < 220) {
      return 7;
    }

    return 5;
  }
}
