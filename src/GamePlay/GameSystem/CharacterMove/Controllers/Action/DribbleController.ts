import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";

/**
 * ドリブルアクションを管理するコントローラー
 * AI（条件判定）→ DribbleController（バリデーション+実行）→ ActionController（状態管理）
 */
export class DribbleController {
  private ball: Ball;

  constructor(ball: Ball) {
    this.ball = ball;
  }

  /**
   * ドリブル突破アクションを実行
   * @param character ドリブル突破を行うキャラクター
   * @returns 成功した場合true
   */
  public performDribbleBreakthrough(character: Character): boolean {
    // ボールを持っているか確認
    if (this.ball.getHolder() !== character) {
      return false;
    }

    // ActionControllerでドリブル突破アクションを開始
    const actionController = character.getActionController();
    const result = actionController.startAction('dribble_breakthrough');

    return result.success;
  }
}
