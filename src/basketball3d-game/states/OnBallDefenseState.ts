import {Vector3} from "@babylonjs/core";
import {PlayerState, PlayerStateType} from "./PlayerState";
import {Action, GameContext} from "../actions/Action";
import {Player, HandPose} from "../entities/Player";
import {MoveToTargetAction} from "../actions/movement/MoveToTargetAction";
import {DefendAction} from "../actions/defense/DefendAction";
import {BlockAction} from "../actions/defense/BlockAction";
import {DashAction} from "../actions/movement/DashAction";
import {PLAYER_CONFIG} from "../config/gameConfig";

/**
 * オンボールディフェンス状態
 * マーク対象がボールを保持している時の状態
 */
export class OnBallDefenseState extends PlayerState {
  readonly type = PlayerStateType.ON_BALL_DEFENSE;

  protected availableActions: Action[];

  // アクションインスタンス
  private moveAction: MoveToTargetAction;
  private defendAction: DefendAction;
  private blockAction: BlockAction;
  private dashAction: DashAction;

  constructor() {
    super();

    // アクションを初期化
    this.moveAction = new MoveToTargetAction(Vector3.Zero(), HandPose.DEFEND);
    this.defendAction = new DefendAction();
    this.blockAction = new BlockAction();
    this.dashAction = new DashAction(Vector3.Zero(), HandPose.DEFEND);

    // 利用可能なアクション一覧
    this.availableActions = [
      this.blockAction,    // 優先度1: ブロック
      this.defendAction,   // 優先度2: ディフェンス
      this.dashAction,     // 優先度3: ダッシュ
      this.moveAction,     // 優先度4: 移動
    ];
  }

  onEnter(player: Player, context: GameContext): void {
    this.log(player, "Entering ON_BALL_DEFENSE state - marking ball handler!");
  }

  update(player: Player, context: GameContext): void {
    if (!context.opponent) {
      return;
    }

    // 相手とゴールの間のディフェンス位置を計算
    const defensePosition = this.calculateDefensePosition(
      context.opponent.getPosition(),
      context.opponentGoalZ
    );

    // 移動目標を更新
    this.moveAction.setTarget(defensePosition);
    this.dashAction.setTarget(defensePosition);

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
    // 1. ブロック可能ならブロック
    // 2. ディフェンス姿勢
    // 3. ディフェンス位置への移動

    for (const action of actions) {
      if (action instanceof BlockAction && action.canExecute(player, context)) {
        return action;
      }
    }

    for (const action of actions) {
      if (action instanceof DefendAction && action.canExecute(player, context)) {
        return action;
      }
    }

    // デフォルトはディフェンス位置への移動
    return this.moveAction;
  }

  /**
   * ディフェンスの最適な位置を計算
   * @param offensePosition オフェンスの位置
   * @param goalZ 守るゴールのZ座標
   * @returns ディフェンスの位置
   */
  private calculateDefensePosition(offensePosition: Vector3, goalZ: number): Vector3 {
    // ゴールの位置
    const goalPosition = new Vector3(0, 0.95, goalZ);

    // オフェンスからゴールへの方向ベクトル
    const offenseToGoal = goalPosition.subtract(offensePosition);
    const horizontalDistance = Math.sqrt(
      offenseToGoal.x * offenseToGoal.x + offenseToGoal.z * offenseToGoal.z
    );

    // オフェンスとゴールの間に位置取る
    const defenseDistance = horizontalDistance * PLAYER_CONFIG.defenseBias;

    // 距離の制限を適用
    const clampedDistance = Math.max(
      PLAYER_CONFIG.defenseMinDistance,
      Math.min(PLAYER_CONFIG.defenseMaxDistance, defenseDistance)
    );

    // オフェンスからゴールへの方向を正規化
    const directionX = offenseToGoal.x / horizontalDistance;
    const directionZ = offenseToGoal.z / horizontalDistance;

    // ディフェンスの位置を計算
    return new Vector3(
      offensePosition.x + directionX * clampedDistance,
      0.95,
      offensePosition.z + directionZ * clampedDistance
    );
  }
}
