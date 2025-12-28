import {Vector3} from "@babylonjs/core";
import {PlayerState, PlayerStateType} from "./PlayerState";
import {Action, GameContext} from "../actions/Action";
import {Player, HandPose} from "../entities/Player";
import {MoveToTargetAction} from "../actions/movement/MoveToTargetAction";

/**
 * オフボールディフェンス状態
 * マーク対象以外がボールを保持している時の状態
 *
 * 注: 現在は1on1なので、この状態は使用されません
 * 将来的にチームプレイを実装する際に使用されます
 */
export class OffBallDefenseState extends PlayerState {
  readonly type = PlayerStateType.OFF_BALL_DEFENSE;

  protected availableActions: Action[];

  // アクションインスタンス
  private moveAction: MoveToTargetAction;

  constructor() {
    super();

    // アクションを初期化
    this.moveAction = new MoveToTargetAction(Vector3.Zero(), HandPose.NEUTRAL);

    // 利用可能なアクション一覧
    this.availableActions = [
      this.moveAction,
    ];
  }

  onEnter(player: Player, context: GameContext): void {
    this.log(player, "Entering OFF_BALL_DEFENSE state - defending off-ball");
  }

  update(player: Player, context: GameContext): void {
    // TODO: Phase 2でチームプレイ時のヘルプディフェンスを実装
    // 現在は何もしない
  }

  protected prioritizeActions(
    actions: Action[],
    player: Player,
    context: GameContext
  ): Action {
    // デフォルトは移動
    return this.moveAction;
  }
}
