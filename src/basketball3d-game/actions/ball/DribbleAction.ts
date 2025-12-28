import {Action, GameContext} from "../Action";
import {Player, HandPose} from "../../entities/Player";

/**
 * ドリブルアクション
 * ボールを保持しながら移動する際のアクション
 * 腕のポーズをDRIBBLEに設定する
 */
export class DribbleAction extends Action {
  readonly name = "Dribble";

  canExecute(player: Player, context: GameContext): boolean {
    // ボールを持っている場合のみ実行可能
    return context.iHaveBall;
  }

  execute(player: Player, context: GameContext): void {
    // ドリブルの腕のポーズを設定
    this.setArmPose(player, HandPose.DRIBBLE);

    // ドリブル状態を更新（既存のPlayer.updateDribble()を使用）
    const shouldBounce = player.updateDribble(context.deltaTime);

    // デバッグログ（10%の確率で出力）
    if (shouldBounce && Math.random() < 0.1) {
      this.log(player, "Dribbling the ball");
    }
  }

  onStart(player: Player, context: GameContext): void {
    this.log(player, "Started dribbling");
  }

  onEnd(player: Player, context: GameContext): void {
    this.log(player, "Stopped dribbling");
  }
}
