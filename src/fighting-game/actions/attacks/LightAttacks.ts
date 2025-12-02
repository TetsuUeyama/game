/**
 * LightAttacks - 弱攻撃（パンチ系）
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';
import { ATTACK_STRENGTH_MAP, COOLDOWNS, AttackType } from '../../config/gameConfig';

/**
 * 弱攻撃の基底クラス
 */
abstract class LightAttackBase extends BaseAction {
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
 * 弱攻撃（上段）
 */
export class LightHighAttack extends LightAttackBase {
  readonly name = 'lightHigh';
  protected attackType: AttackType = 'lightHigh';

  protected getMinorAction() {
    return 'high-attack' as const;
  }

  getPriority(context: ActionContext): number {
    const { opponent } = context;
    // 相手がジャンプ中なら優先度高
    return opponent.isJumping ? 4 : 2;
  }
}

/**
 * 弱攻撃（中段）
 */
export class LightMidAttack extends LightAttackBase {
  readonly name = 'lightMid';
  protected attackType: AttackType = 'lightMid';

  protected getMinorAction() {
    return 'mid-attack' as const;
  }

  getPriority(context: ActionContext): number {
    return 2;
  }
}

/**
 * 弱攻撃（下段）
 */
export class LightLowAttack extends LightAttackBase {
  readonly name = 'lightLow';
  protected attackType: AttackType = 'lightLow';

  protected getMinorAction() {
    return 'low-attack' as const;
  }

  getPriority(context: ActionContext): number {
    return 2;
  }
}
