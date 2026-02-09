import { Character } from "../../entities/Character";

/**
 * ディフェンスアクションを管理するコントローラー
 * AI（条件判定）→ DefenseActionController（バリデーション+実行）→ ActionController（状態管理）
 */
export class DefenseActionController {
  /**
   * シュートブロックアクションを実行
   * @param blocker ブロックを行うディフェンダー
   * @param shooter シューター（ブロックジャンプのターゲット）
   * @returns 成功した場合true
   */
  public performBlockShot(blocker: Character, shooter: Character): boolean {
    const actionController = blocker.getActionController();
    const result = actionController.startAction('block_shot');

    if (result.success) {
      // ブロックジャンプ情報を設定（シューターの方向に飛ぶ）
      blocker.setBlockJumpTarget(shooter);
      return true;
    }

    return false;
  }

  /**
   * ディフェンシブアクションを実行（スティール、ディフェンススタンス等）
   * @param defender ディフェンダー
   * @param actionType アクションの種類
   * @returns 成功した場合true
   */
  public performDefensiveAction(
    defender: Character,
    actionType: 'steal_attempt' | 'defense_stance'
  ): boolean {
    const actionController = defender.getActionController();
    const result = actionController.startAction(actionType);

    return result.success;
  }
}
