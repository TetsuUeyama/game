/**
 * MediumAttacks - 中攻撃（キック系）
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';
import { ATTACK_STRENGTH_MAP, COOLDOWNS, AttackType } from '../../config/gameConfig';

/**
 * 中攻撃の基底クラス
 */
abstract class MediumAttackBase extends BaseAction {
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
 * 中攻撃（上段）
 */
export class MediumHighAttack extends MediumAttackBase {
  readonly name = 'mediumHigh';
  protected attackType: AttackType = 'mediumHigh';

  protected getMinorAction() {
    return 'high-attack' as const;
  }

  getPriority(context: ActionContext): number {
    const { opponent, fighter } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    if (opponent.isJumping && distance < 120) return 5;
    return 2;
  }
}

/**
 * 中攻撃（中段）
 */
export class MediumMidAttack extends MediumAttackBase {
  readonly name = 'mediumMid';
  protected attackType: AttackType = 'mediumMid';

  protected getMinorAction() {
    return 'mid-attack' as const;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 中距離で優先度が高い
    if (distance > 80 && distance < 150) {
      return 3;
    } else if (distance >= 150) {
      return 1;
    } else {
      return 2;
    }
  }
}

/**
 * 中攻撃（下段）
 */
export class MediumLowAttack extends MediumAttackBase {
  readonly name = 'mediumLow';
  protected attackType: AttackType = 'mediumLow';

  protected getMinorAction() {
    return 'low-attack' as const;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 近距離で優先度高
    return distance < 100 ? 3 : 2;
  }
}
