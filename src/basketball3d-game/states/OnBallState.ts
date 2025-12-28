import {Vector3} from "@babylonjs/core";
import {PlayerState, PlayerStateType} from "./PlayerState";
import {Action, GameContext} from "../actions/Action";
import {Player, HandPose} from "../entities/Player";
import {MoveToTargetAction} from "../actions/movement/MoveToTargetAction";
import {DribbleAction} from "../actions/ball/DribbleAction";
import {ShootAction} from "../actions/ball/ShootAction";
import {DashAction} from "../actions/movement/DashAction";

/**
 * オンボール状態
 * 自分がボールを保持している時の状態
 */
export class OnBallState extends PlayerState {
  readonly type = PlayerStateType.ON_BALL;

  protected availableActions: Action[];

  // アクションインスタンス
  private moveAction: MoveToTargetAction;
  private dribbleAction: DribbleAction;
  private shootAction: ShootAction;
  private dashAction: DashAction;

  constructor() {
    super();

    // アクションを初期化
    this.moveAction = new MoveToTargetAction(Vector3.Zero(), HandPose.DRIBBLE);
    this.dribbleAction = new DribbleAction();
    this.shootAction = new ShootAction();
    this.dashAction = new DashAction(Vector3.Zero(), HandPose.DRIBBLE);

    // 利用可能なアクション一覧
    this.availableActions = [
      this.shootAction,    // 優先度1: シュート
      this.dribbleAction,  // 優先度2: ドリブル
      this.dashAction,     // 優先度3: ダッシュ
      this.moveAction,     // 優先度4: 移動
    ];
  }

  onEnter(player: Player, context: GameContext): void {
    this.log(player, "Entering ON_BALL state - I have the ball!");
  }

  update(player: Player, context: GameContext): void {
    // ゴールへの移動目標を設定
    const goalPosition = new Vector3(0, player.getPosition().y, context.myGoalZ);
    this.moveAction.setTarget(goalPosition);
    this.dashAction.setTarget(goalPosition);

    // アクションを選択して実行
    const action = this.selectAction(player, context);
    if (action && action.canExecute(player, context)) {
      action.execute(player, context);
    }
  }

  protected prioritizeActions(
    actions: Action[],
    player: Player,
    context: GameContext
  ): Action {
    // 優先順位:
    // 1. シュート可能ならシュート
    // 2. ドリブル
    // 3. ゴールへの移動

    for (const action of actions) {
      if (action instanceof ShootAction && action.canExecute(player, context)) {
        return action;
      }
    }

    for (const action of actions) {
      if (action instanceof DribbleAction && action.canExecute(player, context)) {
        return action;
      }
    }

    // デフォルトは移動
    return this.moveAction;
  }
}
