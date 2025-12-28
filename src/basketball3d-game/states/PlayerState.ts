import {Player} from "../entities/Player";
import {Action, GameContext} from "../actions/Action";

/**
 * プレイヤー状態の列挙型
 */
export enum PlayerStateType {
  ON_BALL = "OnBall",                     // オンボール（自分がボール保持）
  OFF_BALL = "OffBall",                   // オフボール（味方がボール保持）
  ON_BALL_DEFENSE = "OnBallDefense",      // オンボールディフェンス（マーク対象がボール保持）
  OFF_BALL_DEFENSE = "OffBallDefense",    // オフボールディフェンス（マーク対象以外がボール保持）
  FREE_BALL = "FreeBall",                 // 両者ボールロスト（フリーボール）
}

/**
 * プレイヤー状態の抽象基底クラス
 */
export abstract class PlayerState {
  /**
   * 状態名
   */
  abstract readonly type: PlayerStateType;

  /**
   * この状態で利用可能なアクション一覧
   */
  protected abstract availableActions: Action[];

  /**
   * 状態の更新処理
   * @param player プレイヤー
   * @param context ゲームコンテキスト
   */
  abstract update(player: Player, context: GameContext): void;

  /**
   * この状態に入った時の処理
   * @param player プレイヤー
   * @param context ゲームコンテキスト
   */
  onEnter?(player: Player, context: GameContext): void;

  /**
   * この状態から出る時の処理
   * @param player プレイヤー
   * @param context ゲームコンテキスト
   */
  onExit?(player: Player, context: GameContext): void;

  /**
   * 最適なアクションを選択（AI意思決定）
   * @param player プレイヤー
   * @param context ゲームコンテキスト
   * @returns 選択されたアクション、またはnull
   */
  protected selectAction(player: Player, context: GameContext): Action | null {
    // 実行可能なアクションをフィルタリング
    const executableActions = this.availableActions.filter((action) =>
      action.canExecute(player, context)
    );

    if (executableActions.length === 0) {
      return null;
    }

    // サブクラスで優先度を決定
    return this.prioritizeActions(executableActions, player, context);
  }

  /**
   * アクションの優先度を決定（サブクラスでオーバーライド）
   * @param actions 実行可能なアクション一覧
   * @param player プレイヤー
   * @param context ゲームコンテキスト
   * @returns 最も優先度の高いアクション
   */
  protected abstract prioritizeActions(
    actions: Action[],
    player: Player,
    context: GameContext
  ): Action;

  /**
   * デバッグログを出力
   * @param player プレイヤー
   * @param message メッセージ
   */
  protected log(player: Player, message: string): void {
    console.log(`[State:${this.type}] Player ${player.id}: ${message}`);
  }
}
