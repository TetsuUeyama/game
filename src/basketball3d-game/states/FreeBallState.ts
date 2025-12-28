import {PlayerState, PlayerStateType} from "./PlayerState";
import {Action, GameContext} from "../actions/Action";
import {Player, HandPose} from "../entities/Player";
import {MoveToTargetAction} from "../actions/movement/MoveToTargetAction";

/**
 * フリーボール状態
 * 両者がボールを失っている時の状態
 */
export class FreeBallState extends PlayerState {
  readonly type = PlayerStateType.FREE_BALL;

  protected availableActions: Action[] = [];

  // 現在実行中のアクション
  private currentAction: MoveToTargetAction | null = null;

  constructor() {
    super();
    // アクションを初期化（ボールの位置は毎フレーム更新される）
    this.currentAction = new MoveToTargetAction(
      this.currentAction?.["targetPosition"] || { x: 0, y: 0, z: 0 } as any,
      HandPose.NEUTRAL
    );
    this.availableActions = [this.currentAction];
  }

  onEnter(player: Player, _context: GameContext): void {
    this.log(player, "Entering FREE_BALL state - going for the ball!");
  }

  update(player: Player, context: GameContext): void {
    // ボールの位置を目標に設定
    const ballPosition = context.ball.getPosition();

    // MoveToTargetActionの目標を更新
    if (this.currentAction) {
      this.currentAction.setTarget(ballPosition);
    }

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
    // フリーボール状態では常にボールへの移動を優先
    return actions[0];
  }
}
