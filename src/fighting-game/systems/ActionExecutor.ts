/**
 * ActionExecutor - アクション実行管理システム
 *
 * 戦闘行動の登録・実行・管理を行う
 */

import type { Action, ActionContext, ActionResult } from '../actions/Action';

/**
 * アクションのクールダウン情報
 */
interface CooldownInfo {
  actionName: string;
  endTime: number;
}

/**
 * アクション実行管理システム
 */
export class ActionExecutor {
  /** 登録されたアクションのマップ */
  private actions: Map<string, Action> = new Map();

  /** ファイターごとのクールダウン情報 */
  private cooldowns: Map<number, Map<string, number>> = new Map();

  /**
   * アクションを登録
   * @param action 登録するアクション
   */
  register(action: Action): void {
    if (this.actions.has(action.name)) {
      console.warn(`[ActionExecutor] Action "${action.name}" is already registered. Overwriting.`);
    }
    this.actions.set(action.name, action);
  }

  /**
   * 複数のアクションを一括登録
   * @param actions 登録するアクション配列
   */
  registerAll(actions: Action[]): void {
    actions.forEach(action => this.register(action));
  }

  /**
   * アクションを実行
   * @param actionName アクション名
   * @param context アクションコンテキスト
   * @returns 実行結果
   */
  execute(actionName: string, context: ActionContext): ActionResult {
    const action = this.actions.get(actionName);

    // アクションが登録されていない
    if (!action) {
      return {
        success: false,
        reason: `Action "${actionName}" not found`
      };
    }

    // クールダウン中チェック
    if (this.isOnCooldown(context.fighter.playerNumber, actionName)) {
      return {
        success: false,
        reason: `Action "${actionName}" is on cooldown`
      };
    }

    // 実行可能チェック
    if (!action.canExecute(context)) {
      return {
        success: false,
        reason: `Action "${actionName}" cannot be executed (conditions not met)`
      };
    }

    // アクション実行
    const result = action.execute(context);

    // 実行成功時、クールダウンを設定
    if (result.success) {
      const cooldown = result.cooldown ?? action.getCooldown();
      if (cooldown > 0) {
        this.setCooldown(context.fighter.playerNumber, actionName, cooldown);
      }
    }

    return result;
  }

  /**
   * アクションがクールダウン中かチェック
   * @param playerNumber プレイヤー番号
   * @param actionName アクション名
   * @returns クールダウン中の場合 true
   */
  isOnCooldown(playerNumber: number, actionName: string): boolean {
    const playerCooldowns = this.cooldowns.get(playerNumber);
    if (!playerCooldowns) return false;

    const endTime = playerCooldowns.get(actionName);
    if (!endTime) return false;

    const now = Date.now();
    if (now >= endTime) {
      // クールダウン終了
      playerCooldowns.delete(actionName);
      return false;
    }

    return true;
  }

  /**
   * クールダウンを設定
   * @param playerNumber プレイヤー番号
   * @param actionName アクション名
   * @param duration クールダウン時間（ミリ秒）
   */
  private setCooldown(playerNumber: number, actionName: string, duration: number): void {
    let playerCooldowns = this.cooldowns.get(playerNumber);
    if (!playerCooldowns) {
      playerCooldowns = new Map();
      this.cooldowns.set(playerNumber, playerCooldowns);
    }

    const endTime = Date.now() + duration;
    playerCooldowns.set(actionName, endTime);
  }

  /**
   * アクションが実行可能かチェック（クールダウンと条件の両方）
   * @param actionName アクション名
   * @param context アクションコンテキスト
   * @returns 実行可能な場合 true
   */
  canExecute(actionName: string, context: ActionContext): boolean {
    const action = this.actions.get(actionName);
    if (!action) return false;

    if (this.isOnCooldown(context.fighter.playerNumber, actionName)) {
      return false;
    }

    return action.canExecute(context);
  }

  /**
   * カテゴリ別に実行可能なアクションを取得
   * @param category アクションカテゴリ
   * @param context アクションコンテキスト
   * @returns 実行可能なアクション配列（優先度順）
   */
  getAvailableActions(
    category: 'attack' | 'movement' | 'defense' | 'special',
    context: ActionContext
  ): Action[] {
    const available: Action[] = [];

    for (const action of this.actions.values()) {
      if (action.category === category && this.canExecute(action.name, context)) {
        available.push(action);
      }
    }

    // 優先度順にソート
    available.sort((a, b) => {
      const priorityA = a.getPriority?.(context) ?? 1;
      const priorityB = b.getPriority?.(context) ?? 1;
      return priorityB - priorityA; // 降順
    });

    return available;
  }

  /**
   * 全てのクールダウンをクリア（ラウンド開始時などに使用）
   * @param playerNumber プレイヤー番号（省略時は全プレイヤー）
   */
  clearCooldowns(playerNumber?: number): void {
    if (playerNumber !== undefined) {
      this.cooldowns.delete(playerNumber);
    } else {
      this.cooldowns.clear();
    }
  }

  /**
   * 登録されているアクション名の一覧を取得
   * @returns アクション名の配列
   */
  getRegisteredActionNames(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * アクションを取得
   * @param actionName アクション名
   * @returns アクション（存在しない場合 undefined）
   */
  getAction(actionName: string): Action | undefined {
    return this.actions.get(actionName);
  }
}
