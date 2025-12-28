import {Action, GameContext} from "../Action";
import {Player, HandPose} from "../../entities/Player";

/**
 * ブロックアクション
 * ジャンプして両手を真上に伸ばし、相手のシュートをブロックする
 * 腕のポーズをBLOCKに設定する
 */
export class BlockAction extends Action {
  readonly name = "Block";

  private maxBlockDistance: number = 3.0; // ブロック可能な最大距離（m）

  canExecute(player: Player, context: GameContext): boolean {
    // 相手がいて、ジャンプしていない場合
    if (!context.opponent || player.isJumping) {
      return false;
    }

    // 相手が十分近い場合のみ
    if (context.distanceToOpponent > this.maxBlockDistance) {
      return false;
    }

    // 相手がボールを持っている場合（シュートの可能性がある）
    return context.opponentHasBall;
  }

  execute(player: Player, context: GameContext): void {
    // ブロックの腕のポーズを設定
    this.setArmPose(player, HandPose.BLOCK);

    // ジャンプを開始
    if (!player.isJumping) {
      player.startJump();
      this.log(player, "Jumping to block shot!");
    }
  }

  onStart(player: Player, context: GameContext): void {
    this.log(player, "Attempting block");
  }
}
