import {Action, GameContext} from "../Action";
import {Player, HandPose} from "../../entities/Player";

/**
 * シュートアクション
 * ゴールに向かってボールをシュートする
 * 腕のポーズをSHOOTに設定する
 */
export class ShootAction extends Action {
  readonly name = "Shoot";

  private minDistanceToGoal: number = 1.0; // ゴールへの最小距離（m）
  private maxDistanceToGoal: number = 15.0; // ゴールへの最大距離（m）

  canExecute(player: Player, context: GameContext): boolean {
    // ボールを持っている場合のみ
    if (!context.iHaveBall) {
      return false;
    }

    // ゴールまでの距離が適切な範囲内
    const distanceToGoal = Math.abs(player.getPosition().z - context.myGoalZ);
    return distanceToGoal >= this.minDistanceToGoal && distanceToGoal <= this.maxDistanceToGoal;
  }

  execute(player: Player, context: GameContext): void {
    // シュートの腕のポーズを設定
    this.setArmPose(player, HandPose.SHOOT);

    // ゴールを見上げる（首を傾ける）
    // この処理は既存のShootControllerで実装されているので、
    // ここでは腕のポーズのみ設定

    // 実際のシュート処理は既存のShootController.performShoot()に委譲
    // （Phase 2で完全に移行予定）
  }

  onStart(player: Player, context: GameContext): void {
    this.log(player, `Preparing to shoot at goal (distance: ${context.distanceToMyGoal.toFixed(1)}m)`);
  }
}
