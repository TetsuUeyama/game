/**
 * GuardActions - ガードアクション
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';
import { GUARD_STAMINA_COSTS, GuardType } from '../../config/gameConfig';

/**
 * ガードの基底クラス
 */
abstract class GuardActionBase extends BaseAction {
  readonly category = 'defense' as const;
  protected abstract guardType: GuardType;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking || fighter.isJumping || fighter.isDashing) return false;

    // 地上にいる必要がある
    const body = fighter.body as Phaser.Physics.Arcade.Body;
    if (!body.touching.down) return false;

    // ガードスタミナチェック
    if (fighter.guardStamina < 5) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    if (fighter.isAIControlled && this.guardType) {
      fighter.actionIntent.setIntent('guard', this.getMinorAction());
    }

    if (this.guardType) {
      fighter.block(this.guardType);
    }

    return {
      success: true
    };
  }

  getCost(context: ActionContext): ActionCost {
    if (!this.guardType) return {};

    return {
      guardStamina: GUARD_STAMINA_COSTS[this.guardType]
    };
  }

  getCooldown(): number {
    return 0; // ガードにクールダウンなし
  }

  protected abstract getMinorAction(): 'high-guard' | 'mid-guard' | 'low-guard' | 'highmid-guard' | 'midlow-guard' | 'all-guard';
}

/**
 * 上段ガード
 */
export class HighGuardAction extends GuardActionBase {
  readonly name = 'highGuard';
  protected guardType: GuardType = 'high';

  protected getMinorAction() {
    return 'high-guard' as const;
  }

  getPriority(context: ActionContext): number {
    const { opponent } = context;

    // 相手がジャンプ中なら優先度高
    if (opponent.isJumping) return 5;

    return 2;
  }
}

/**
 * 中段ガード
 */
export class MidGuardAction extends GuardActionBase {
  readonly name = 'midGuard';
  protected guardType: GuardType = 'mid';

  protected getMinorAction() {
    return 'mid-guard' as const;
  }

  getPriority(context: ActionContext): number {
    return 3; // デフォルトガード
  }
}

/**
 * 下段ガード
 */
export class LowGuardAction extends GuardActionBase {
  readonly name = 'lowGuard';
  protected guardType: GuardType = 'low';

  protected getMinorAction() {
    return 'low-guard' as const;
  }

  getPriority(context: ActionContext): number {
    return 2;
  }
}

/**
 * 上中段ガード
 */
export class HighMidGuardAction extends GuardActionBase {
  readonly name = 'highMidGuard';
  protected guardType: GuardType = 'highMid';

  protected getMinorAction() {
    return 'highmid-guard' as const;
  }

  getPriority(context: ActionContext): number {
    const { fighter } = context;
    const staminaPercent = (fighter.guardStamina / fighter.maxGuardStamina) * 100;

    // スタミナ十分なら優先度高
    return staminaPercent > 60 ? 4 : 2;
  }
}

/**
 * 中下段ガード
 */
export class MidLowGuardAction extends GuardActionBase {
  readonly name = 'midLowGuard';
  protected guardType: GuardType = 'midLow';

  protected getMinorAction() {
    return 'midlow-guard' as const;
  }

  getPriority(context: ActionContext): number {
    const { fighter } = context;
    const staminaPercent = (fighter.guardStamina / fighter.maxGuardStamina) * 100;

    // スタミナ十分なら優先度高
    return staminaPercent > 60 ? 4 : 2;
  }
}

/**
 * 全段ガード
 */
export class AllGuardAction extends GuardActionBase {
  readonly name = 'allGuard';
  protected guardType: GuardType = 'all';

  protected getMinorAction() {
    return 'all-guard' as const;
  }

  getPriority(context: ActionContext): number {
    const { fighter } = context;
    const staminaPercent = (fighter.guardStamina / fighter.maxGuardStamina) * 100;

    // スタミナ十分なら優先度高（最も安全なガード）
    return staminaPercent > 70 ? 5 : 1;
  }
}
