/**
 * WalkActions - 歩行アクション
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';
import { MOVEMENT_CONFIG } from '../../config/gameConfig';

/**
 * 前進
 */
export class WalkForwardAction extends BaseAction {
  readonly name = 'walkForward';
  readonly category = 'movement' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('move', 'walk-forward');
    }

    const direction = fighter.facingRight ? 1 : -1;
    const walkSpeed = MOVEMENT_CONFIG.walkSpeed;
    fighter.setVelocityX(walkSpeed * direction);
    fighter.state = 'walking';

    return {
      success: true
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {};
  }

  getCooldown(): number {
    return 0;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 遠距離なら優先度高
    return distance > 200 ? 3 : 1;
  }
}

/**
 * 後退
 */
export class WalkBackwardAction extends BaseAction {
  readonly name = 'walkBackward';
  readonly category = 'movement' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('move', 'retreat');
    }

    const direction = fighter.facingRight ? -1 : 1;
    const walkSpeed = MOVEMENT_CONFIG.walkSpeed;
    fighter.setVelocityX(walkSpeed * direction * 0.7); // 後退は少し遅い
    fighter.state = 'walking';

    return {
      success: true
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {};
  }

  getCooldown(): number {
    return 0;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);
    const healthPercent = fighter.health / fighter.maxHealth;

    // 体力が少ない＆近距離なら優先度高
    if (healthPercent < 0.3 && distance < 150) {
      return 5;
    }

    return distance < 100 ? 3 : 1;
  }
}
