import {Action, GameContext} from "../Action";
import {Player, HandPose} from "../../entities/Player";

/**
 * ディフェンスアクション
 * ディフェンス姿勢を取り、両手を前に伸ばしてスティールを狙う
 * 腕のポーズをDEFENDに設定する
 */
export class DefendAction extends Action {
  readonly name = "Defend";

  canExecute(player: Player, context: GameContext): boolean {
    // 相手がいて、かつ自分はボールを持っていない場合
    return context.opponent !== null && !context.iHaveBall;
  }

  execute(player: Player, context: GameContext): void {
    // ディフェンスの腕のポーズを設定
    this.setArmPose(player, HandPose.DEFEND);

    // 相手の方を向く
    if (context.opponent) {
      const opponentPos = context.opponent.getPosition();
      const playerPos = player.getPosition();
      const angleToOpponent = Math.atan2(
        opponentPos.x - playerPos.x,
        opponentPos.z - playerPos.z
      );
      player.setDirection(angleToOpponent);
    }

    // デバッグログ（5%の確率で出力）
    if (Math.random() < 0.05) {
      this.log(player, `Defending (distance to opponent: ${context.distanceToOpponent.toFixed(1)}m)`);
    }
  }

  onStart(player: Player, context: GameContext): void {
    this.log(player, "Entering defense stance");
  }

  onEnd(player: Player, context: GameContext): void {
    this.log(player, "Exiting defense stance");
  }
}
