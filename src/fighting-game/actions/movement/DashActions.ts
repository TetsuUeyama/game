/**
 * DashActions - ダッシュアクション
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';

/**
 * 前ダッシュ
 */
export class ForwardDashAction extends BaseAction {
  readonly name = 'forwardDash';
  readonly category = 'movement' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing || fighter.isBlocking) return false;

    // 地上にいる必要がある
    const body = fighter.body as Phaser.Physics.Arcade.Body;
    if (!body.touching.down) return false;

    // スタミナチェック
    if (fighter.stamina < 10) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('dash', 'forward-dash');
    }

    const direction = fighter.facingRight ? 1 : -1;
    fighter.performDash(direction);

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {
      stamina: 10
    };
  }

  getCooldown(): number {
    return 800; // 800ms
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 中～遠距離で優先度高
    if (distance > 150 && distance < 300) {
      return 4;
    }

    return 2;
  }
}

/**
 * 後ダッシュ
 */
export class BackwardDashAction extends BaseAction {
  readonly name = 'backwardDash';
  readonly category = 'movement' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing || fighter.isBlocking) return false;

    // 地上にいる必要がある
    const body = fighter.body as Phaser.Physics.Arcade.Body;
    if (!body.touching.down) return false;

    // スタミナチェック
    if (fighter.stamina < 10) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('dash', 'backward-dash');
    }

    const direction = fighter.facingRight ? -1 : 1;
    fighter.performDash(direction);

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {
      stamina: 10
    };
  }

  getCooldown(): number {
    return 800; // 800ms
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);
    const healthPercent = fighter.health / fighter.maxHealth;

    // 体力が少ない＆近距離なら優先度高
    if (healthPercent < 0.4 && distance < 120) {
      return 5;
    }

    return distance < 100 ? 4 : 2;
  }
}
