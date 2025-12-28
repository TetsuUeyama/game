import {Vector3} from "@babylonjs/core";
import {Player} from "../entities/Player";
import {Ball} from "../entities/Ball";
import {GameContext} from "./Action";

/**
 * GameContextを作成するヘルパークラス
 */
export class GameContextHelper {
  /**
   * GameContextを作成
   * @param player 対象プレイヤー
   * @param opponent 相手プレイヤー
   * @param ball ボール
   * @param myGoalZ 自分が狙うゴールのZ座標
   * @param opponentGoalZ 相手が守るゴールのZ座標
   * @param deltaTime フレーム時間
   * @param isPlayer2Enabled Player2が有効か
   * @returns GameContext
   */
  static create(
    player: Player,
    opponent: Player | null,
    ball: Ball,
    myGoalZ: number,
    opponentGoalZ: number,
    deltaTime: number,
    isPlayer2Enabled: boolean
  ): GameContext {
    const playerPos = player.getPosition();
    const ballPos = ball.getPosition();

    // 距離計算
    const distanceToBall = Vector3.Distance(playerPos, ballPos);
    const distanceToMyGoal = Math.abs(playerPos.z - myGoalZ);
    const distanceToOpponent = opponent
      ? Vector3.Distance(playerPos, opponent.getPosition())
      : Infinity;

    // ボール所持状態
    const iHaveBall = player.hasBall;
    const opponentHasBall = opponent ? opponent.hasBall : false;
    const isBallFree = ball.isPickupable() && !iHaveBall && !opponentHasBall;

    return {
      ball,
      opponent,
      deltaTime,
      isPlayer2Enabled,
      myGoalZ,
      opponentGoalZ,
      distanceToOpponent,
      distanceToBall,
      distanceToMyGoal,
      iHaveBall,
      opponentHasBall,
      isBallFree,
    };
  }
}
