/**
 * HeavyAttacks - 強攻撃
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';
import { ATTACK_STRENGTH_MAP, COOLDOWNS, AttackType } from '../../config/gameConfig';

/**
 * 強攻撃の基底クラス
 */
abstract class HeavyAttackBase extends BaseAction {
  readonly category = 'attack' as const;
  protected abstract attackType: AttackType;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isBlocking || fighter.isJumping) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      const minorAction = this.getMinorAction();
      fighter.actionIntent.setIntent('attack', minorAction);
    }

    fighter.performAttack(this.attackType);

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return { stamina: 0 };
  }

  getCooldown(): number {
    const attackStrength = ATTACK_STRENGTH_MAP[this.attackType];
    return COOLDOWNS[attackStrength];
  }

  protected abstract getMinorAction(): 'high-attack' | 'mid-attack' | 'low-attack';
}

/**
 * 強攻撃（上段）
 */
export class HeavyHighAttack extends HeavyAttackBase {
  readonly name = 'heavyHigh';
  protected attackType: AttackType = 'heavyHigh';

  protected getMinorAction() {
    return 'high-attack' as const;
  }

  getPriority(context: ActionContext): number {
    const { opponent, fighter } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    if (opponent.isJumping && distance < 150) return 6;
    return 3;
  }
}

/**
 * 強攻撃（中段）
 */
export class HeavyMidAttack extends HeavyAttackBase {
  readonly name = 'heavyMid';
  protected attackType: AttackType = 'heavyMid';

  protected getMinorAction() {
    return 'mid-attack' as const;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 中距離で優先度が高い（ダメージが大きいため）
    if (distance > 100 && distance < 160) {
      return 4;
    }
    return 3;
  }
}

/**
 * 強攻撃（下段）
 */
export class HeavyLowAttack extends HeavyAttackBase {
  readonly name = 'heavyLow';
  protected attackType: AttackType = 'heavyLow';

  protected getMinorAction() {
    return 'low-attack' as const;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 近距離で優先度高
    return distance < 120 ? 4 : 3;
  }
}
