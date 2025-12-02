/**
 * JumpActions - ジャンプアクション
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';

/**
 * 垂直ジャンプ（小）
 */
export class SmallVerticalJump extends BaseAction {
  readonly name = 'smallVerticalJump';
  readonly category = 'movement' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing || fighter.isBlocking) return false;

    // 地上にいる必要がある
    const body = fighter.body as Phaser.Physics.Arcade.Body;
    if (!body.touching.down) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('jump', 'vertical-jump');
    }

    fighter.performNormalJump(0, 'small'); // direction=0: 垂直

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {};
  }

  getCooldown(): number {
    return 500;
  }

  getPriority(context: ActionContext): number {
    const { opponent } = context;

    // 相手が飛び道具を撃っている場合、優先度高
    if (opponent.isAttacking) {
      return 4;
    }

    return 2;
  }
}

/**
 * 前方ジャンプ（中）
 */
export class MediumForwardJump extends BaseAction {
  readonly name = 'mediumForwardJump';
  readonly category = 'movement' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing || fighter.isBlocking) return false;

    const body = fighter.body as Phaser.Physics.Arcade.Body;
    if (!body.touching.down) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter, opponent } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('jump', 'forward-jump');
    }

    const direction = fighter.x < opponent.x ? 1 : -1;
    fighter.performNormalJump(direction, 'medium');

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {};
  }

  getCooldown(): number {
    return 600;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 中距離で優先度高
    if (distance > 150 && distance < 280) {
      return 4;
    }

    return 2;
  }
}

/**
 * 前方ジャンプ（大）
 */
export class LargeForwardJump extends BaseAction {
  readonly name = 'largeForwardJump';
  readonly category = 'movement' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing || fighter.isBlocking) return false;

    const body = fighter.body as Phaser.Physics.Arcade.Body;
    if (!body.touching.down) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter, opponent } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('jump', 'forward-jump');
    }

    const direction = fighter.x < opponent.x ? 1 : -1;
    fighter.performNormalJump(direction, 'large');

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {};
  }

  getCooldown(): number {
    return 700;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);

    // 遠距離で優先度高
    if (distance > 250 && distance < 400) {
      return 5;
    }

    return 2;
  }
}

/**
 * 後方ジャンプ（回避用）
 */
export class BackwardJump extends BaseAction {
  readonly name = 'backwardJump';
  readonly category = 'movement' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing || fighter.isBlocking) return false;

    const body = fighter.body as Phaser.Physics.Arcade.Body;
    if (!body.touching.down) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter, opponent } = context;

    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('jump', 'back-jump');
    }

    const direction = fighter.x < opponent.x ? -1 : 1;
    fighter.performNormalJump(direction, 'medium');

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {};
  }

  getCooldown(): number {
    return 600;
  }

  getPriority(context: ActionContext): number {
    const { fighter, opponent } = context;
    const distance = Math.abs(fighter.x - opponent.x);
    const healthPercent = fighter.health / fighter.maxHealth;

    // 体力少＆近距離なら優先度高
    if (healthPercent < 0.3 && distance < 120) {
      return 6;
    }

    return 3;
  }
}
