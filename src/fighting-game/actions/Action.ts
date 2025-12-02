/**
 * Action - 戦闘行動の基底インターフェース
 *
 * 全ての戦闘行動（攻撃、移動、防御など）はこのインターフェースを実装する
 */

import type { Fighter } from '../entities/Fighter';
import type { FightScene } from '../scenes/FightScene';

/**
 * アクション実行時のコンテキスト情報
 */
export interface ActionContext {
  /** アクションを実行するファイター */
  fighter: Fighter;

  /** 対戦相手のファイター */
  opponent: Fighter;

  /** 戦闘シーン */
  scene: FightScene;

  /** キー入力（オプション、主に手動操作時に使用） */
  keys?: Map<string, Phaser.Input.Keyboard.Key>;

  /** 追加パラメータ（アクション固有の設定） */
  params?: Record<string, any>;
}

/**
 * アクションのコスト情報
 */
export interface ActionCost {
  /** スタミナコスト */
  stamina?: number;

  /** 必殺技ゲージコスト */
  specialMeter?: number;

  /** ガードスタミナコスト */
  guardStamina?: number;
}

/**
 * アクションの実行結果
 */
export interface ActionResult {
  /** 実行が成功したか */
  success: boolean;

  /** 失敗理由（失敗時のみ） */
  reason?: string;

  /** 実行後のクールダウン時間（ミリ秒） */
  cooldown?: number;
}

/**
 * 戦闘行動の基底インターフェース
 */
export interface Action {
  /** アクションの一意な名前 */
  readonly name: string;

  /** アクションのカテゴリ（attack, movement, defense など） */
  readonly category: 'attack' | 'movement' | 'defense' | 'special';

  /**
   * アクションが実行可能かチェック
   * @param context アクションコンテキスト
   * @returns 実行可能な場合 true
   */
  canExecute(context: ActionContext): boolean;

  /**
   * アクションを実行
   * @param context アクションコンテキスト
   * @returns 実行結果
   */
  execute(context: ActionContext): ActionResult;

  /**
   * アクションのコストを取得
   * @param context アクションコンテキスト
   * @returns コスト情報
   */
  getCost(context: ActionContext): ActionCost;

  /**
   * アクションのクールダウン時間を取得（ミリ秒）
   * @returns クールダウン時間
   */
  getCooldown(): number;

  /**
   * アクションの優先度を取得（AIの行動選択時に使用）
   * @param context アクションコンテキスト
   * @returns 優先度（数値が大きいほど優先）
   */
  getPriority?(context: ActionContext): number;
}

/**
 * アクションの抽象基底クラス
 * 共通処理を提供
 */
export abstract class BaseAction implements Action {
  abstract readonly name: string;
  abstract readonly category: 'attack' | 'movement' | 'defense' | 'special';

  abstract canExecute(context: ActionContext): boolean;
  abstract execute(context: ActionContext): ActionResult;

  getCost(context: ActionContext): ActionCost {
    return {}; // デフォルトはコストなし
  }

  getCooldown(): number {
    return 0; // デフォルトはクールダウンなし
  }

  getPriority(context: ActionContext): number {
    return 1; // デフォルト優先度
  }

  /**
   * 基本的な実行可能チェック（共通条件）
   */
  protected basicCanExecute(context: ActionContext): boolean {
    const { fighter } = context;

    // ヒットストップ中は行動不可
    if (fighter.isInHitstun) {
      return false;
    }

    // 敗北状態では行動不可
    if (fighter.state === 'defeated') {
      return false;
    }

    return true;
  }

  /**
   * コストが支払えるかチェック
   */
  protected canAffordCost(context: ActionContext): boolean {
    const { fighter } = context;
    const cost = this.getCost(context);

    if (cost.stamina && fighter.stamina < cost.stamina) {
      return false;
    }

    if (cost.specialMeter && fighter.specialMeter < cost.specialMeter) {
      return false;
    }

    if (cost.guardStamina && fighter.guardStamina < cost.guardStamina) {
      return false;
    }

    return true;
  }
}
