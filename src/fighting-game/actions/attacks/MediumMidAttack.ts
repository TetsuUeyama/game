/**
 * MediumMidAttack - 中攻撃（中段）
 *
 * キック攻撃による中段攻撃
 */

import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';
import { ATTACK_STRENGTH_MAP, COOLDOWNS } from '../../config/gameConfig';

export class MediumMidAttack extends BaseAction {
  readonly name = 'mediumMid';
  readonly category = 'attack' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    // 基本チェック
    if (!this.basicCanExecute(context)) {
      return false;
    }

    // 攻撃中またはガード中は実行不可
    if (fighter.isAttacking || fighter.isBlocking) {
      return false;
    }

    // ジャンプ中は実行不可
    if (fighter.isJumping) {
      return false;
    }

    // クールダウンチェックは ActionExecutor が行うため、ここでは不要

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    // 行動意図を設定（AIの場合のみ）
    if (fighter.isAIControlled) {
      fighter.actionIntent.setIntent('attack', 'mid-attack');
    }

    // Fighter の performAttack メソッドを呼び出し
    fighter.performAttack('mediumMid');

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {
      stamina: 0 // 通常攻撃はスタミナコストなし
    };
  }

  getCooldown(): number {
    const attackStrength = ATTACK_STRENGTH_MAP['mediumMid'];
    return COOLDOWNS[attackStrength];
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
