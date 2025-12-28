import {Player} from "../entities/Player";
import {GameContext} from "../actions/Action";
import {PlayerState, PlayerStateType} from "./PlayerState";
import {FreeBallState} from "./FreeBallState";
import {OnBallState} from "./OnBallState";
import {OffBallState} from "./OffBallState";
import {OnBallDefenseState} from "./OnBallDefenseState";
import {OffBallDefenseState} from "./OffBallDefenseState";
import {Color3} from "@babylonjs/core";

/**
 * プレイヤーの状態を管理するクラス
 * 状態の判定と遷移を担当
 */
export class StateManager {
  private currentState: PlayerState;
  private player: Player;

  // 各状態のインスタンス
  private freeBallState: FreeBallState;
  private onBallState: OnBallState;
  private offBallState: OffBallState;
  private onBallDefenseState: OnBallDefenseState;
  private offBallDefenseState: OffBallDefenseState;

  constructor(player: Player) {
    this.player = player;

    // 状態インスタンスを作成
    this.freeBallState = new FreeBallState();
    this.onBallState = new OnBallState();
    this.offBallState = new OffBallState();
    this.onBallDefenseState = new OnBallDefenseState();
    this.offBallDefenseState = new OffBallDefenseState();

    // 初期状態はフリーボール
    this.currentState = this.freeBallState;

    console.log(`[StateManager] Player ${player.id} initialized with state: ${this.currentState.type}`);

    // 初期状態のインジケーター色を設定
    this.updateStateIndicatorColor();
  }

  /**
   * 状態を更新
   * @param context ゲームコンテキスト
   */
  update(context: GameContext): void {
    // 現在の状態に応じた適切な状態を評価
    const newState = this.evaluateState(context);

    // 状態が変わった場合は遷移
    if (newState.type !== this.currentState.type) {
      this.transitionTo(newState, context);
    }

    // 現在の状態を更新
    this.currentState.update(this.player, context);
  }

  /**
   * 適切な状態を評価
   * @param context ゲームコンテキスト
   * @returns 新しい状態
   */
  private evaluateState(context: GameContext): PlayerState {
    // 1. フリーボール状態: 両者がボールを失っている
    if (context.isBallFree) {
      return this.freeBallState;
    }

    // 2. オンボール状態: 自分がボールを持っている
    if (context.iHaveBall) {
      return this.onBallState;
    }

    // 3. オンボールディフェンス: 相手がボールを持っている
    if (context.opponentHasBall) {
      return this.onBallDefenseState;
    }

    // 4. オフボール状態: 味方がボールを持っている（1on1では発生しない）
    // 将来的にチームプレイ実装時に使用

    // 5. オフボールディフェンス: 相手チームの別プレイヤーがボールを持っている（1on1では発生しない）
    // 将来的にチームプレイ実装時に使用

    // デフォルトはフリーボール
    return this.freeBallState;
  }

  /**
   * 状態を遷移
   * @param newState 新しい状態
   * @param context ゲームコンテキスト
   */
  private transitionTo(newState: PlayerState, context: GameContext): void {
    console.log(
      `[StateManager] Player ${this.player.id} transitioning: ${this.currentState.type} -> ${newState.type}`
    );

    // 現在の状態から退出
    if (this.currentState.onExit) {
      this.currentState.onExit(this.player, context);
    }

    // 新しい状態に入る
    this.currentState = newState;
    if (this.currentState.onEnter) {
      this.currentState.onEnter(this.player, context);
    }

    // 状態インジケーターの色を更新
    this.updateStateIndicatorColor();
  }

  /**
   * 状態インジケーターの色を更新
   */
  private updateStateIndicatorColor(): void {
    let color: Color3;

    switch (this.currentState.type) {
      case PlayerStateType.FREE_BALL:
        color = new Color3(0.7, 0.7, 0.7); // グレー
        break;
      case PlayerStateType.ON_BALL:
        color = new Color3(1.0, 0.8, 0.0); // 黄色
        break;
      case PlayerStateType.OFF_BALL:
        color = new Color3(0.0, 0.5, 1.0); // 青
        break;
      case PlayerStateType.ON_BALL_DEFENSE:
        color = new Color3(1.0, 0.0, 0.0); // 赤
        break;
      case PlayerStateType.OFF_BALL_DEFENSE:
        color = new Color3(1.0, 0.4, 0.8); // ピンク
        break;
      default:
        color = new Color3(0.5, 0.5, 0.5); // デフォルトはグレー
    }

    this.player.setStateIndicatorColor(color);
  }

  /**
   * 現在の状態を取得
   * @returns 現在の状態
   */
  getCurrentState(): PlayerState {
    return this.currentState;
  }

  /**
   * 現在の状態タイプを取得
   * @returns 現在の状態タイプ
   */
  getCurrentStateType(): PlayerStateType {
    return this.currentState.type;
  }
}
