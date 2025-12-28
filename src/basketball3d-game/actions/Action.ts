import {Player, HandPose} from "../entities/Player";
import {Ball} from "../entities/Ball";

/**
 * ゲームコンテキスト
 * アクション実行時に必要な情報を集約
 */
export interface GameContext {
  // 基本情報
  ball: Ball;
  opponent: Player | null;
  deltaTime: number;

  // ゲーム状態
  isPlayer2Enabled: boolean;

  // ゴール情報
  myGoalZ: number; // 自分が狙うゴールのZ座標
  opponentGoalZ: number; // 相手が守るゴールのZ座標

  // 距離情報（計算済み）
  distanceToOpponent: number;
  distanceToBall: number;
  distanceToMyGoal: number;

  // ボール所持状態
  iHaveBall: boolean;
  opponentHasBall: boolean;
  isBallFree: boolean;
}

/**
 * アクションの抽象基底クラス
 * すべてのプレイヤーアクションはこのクラスを継承する
 */
export abstract class Action {
  /**
   * アクション名（デバッグ用）
   */
  abstract readonly name: string;

  /**
   * アクションを実行可能か判定
   * @param player 実行するプレイヤー
   * @param context ゲームコンテキスト
   * @returns true: 実行可能, false: 実行不可
   */
  abstract canExecute(player: Player, context: GameContext): boolean;

  /**
   * アクションを実行
   * @param player 実行するプレイヤー
   * @param context ゲームコンテキスト
   */
  abstract execute(player: Player, context: GameContext): void;

  /**
   * アクション開始時の処理（オプション）
   * @param player 実行するプレイヤー
   * @param context ゲームコンテキスト
   */
  onStart?(player: Player, context: GameContext): void;

  /**
   * アクション終了時の処理（オプション）
   * @param player 実行するプレイヤー
   * @param context ゲームコンテキスト
   */
  onEnd?(player: Player, context: GameContext): void;

  /**
   * 腕のポーズを設定（ヘルパーメソッド）
   * @param player プレイヤー
   * @param pose ポーズ
   */
  protected setArmPose(player: Player, pose: HandPose): void {
    player.setHandPose(pose);
  }

  /**
   * デバッグログを出力（ヘルパーメソッド）
   * @param player プレイヤー
   * @param message メッセージ
   */
  protected log(player: Player, message: string): void {
    console.log(`[Action:${this.name}] Player ${player.id}: ${message}`);
  }
}
