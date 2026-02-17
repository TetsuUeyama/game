import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { PASS_COOLDOWN } from "@/GamePlay/GameSystem/TargetTrackingAccuracySystem/PassConfig";
import { determineCurveDirection, isPassLaneBlocked } from "@/GamePlay/GameSystem/CharacterMove/Utils/CurvePassUtils";

/**
 * パスを管理するコントローラー
 * AI（条件判定）→ PassController（バリデーション+実行）→ ActionController（状態管理）
 */
export class PassController {
  private ball: Ball;
  private getAllyCharacters: () => Character[];
  private getEnemyCharacters: () => Character[];

  // パスクールダウン管理（キャラクター別）
  private lastPassTime: Map<Character, number> = new Map();

  constructor(
    ball: Ball,
    getAllyCharacters: () => Character[],
    getEnemyCharacters: () => Character[]
  ) {
    this.ball = ball;
    this.getAllyCharacters = getAllyCharacters;
    this.getEnemyCharacters = getEnemyCharacters;
  }

  /**
   * パスクールダウンが終了しているかチェック
   * @param passer チェック対象のキャラクター
   * @returns パス可能な場合true
   */
  public canPass(passer: Character): boolean {
    const now = Date.now() / 1000;
    const lastPass = this.lastPassTime.get(passer) ?? 0;
    return now - lastPass >= PASS_COOLDOWN.AFTER_PASS;
  }

  /**
   * パスクールダウンをリセット（状態遷移時に使用）
   */
  public resetPassCooldown(character: Character): void {
    this.lastPassTime.delete(character);
  }

  /**
   * パスを実行（ActionController経由）
   * @param passer パスを出すキャラクター
   * @param passTarget パス先のキャラクター
   * @param passType パスの種類
   * @returns 成功/失敗
   */
  public performPass(
    passer: Character,
    passTarget: Character,
    passType: 'pass_chest' | 'pass_bounce' | 'pass_overhead' = 'pass_chest'
  ): { success: boolean; message: string } {
    const ball = this.ball;

    // ボールを持っているか確認
    if (ball.getHolder() !== passer) {
      return { success: false, message: 'ボールを持っていません' };
    }

    // パスレーンがブロックされている場合、バウンスパスに切り替え
    const allyCharacters = this.getAllyCharacters();
    const enemyCharacters = this.getEnemyCharacters();
    const opponents = passer.team === 'ally' ? enemyCharacters : allyCharacters;

    let resolvedPassType = passType;
    if (passType !== 'pass_bounce' && isPassLaneBlocked(passer, passTarget, opponents)) {
      resolvedPassType = 'pass_bounce';
    }

    // ActionControllerでパスアクションを開始
    const actionController = passer.getActionController();
    const actionResult = actionController.startAction(resolvedPassType);

    if (!actionResult.success) {
      return { success: false, message: actionResult.message };
    }

    // activeフェーズに入ったらボールを投げるコールバックを設定
    actionController.setCallbacks({
      onActive: (action) => {
        // ボールを持っていない場合はパスしない
        if (ball.getHolder() !== passer) {
          return;
        }

        if (action.startsWith('pass_')) {
          if (passTarget) {
            const targetPosition = passTarget.getPosition();
            // パス実行直前に再度ディフェンダーチェック（リアルタイム位置）
            const currentOpponents = passer.team === 'ally'
              ? this.getEnemyCharacters()
              : this.getAllyCharacters();
            const curveDirection = determineCurveDirection(passer, passTarget, currentOpponents);

            // アクション名からボール側のパスタイプに変換
            const ballPassType = action === 'pass_bounce' ? 'bounce'
              : action === 'pass_overhead' ? 'overhead'
              : 'chest';
            ball.passWithArc(targetPosition, passTarget, ballPassType, curveDirection);

            // レシーバーにpass_receiveアクションを開始させる
            const receiverActionController = passTarget.getActionController();
            receiverActionController.startAction('pass_receive');
          }
        }
      },
      onComplete: (_action) => {
        // パス完了後に上半身回転をリセット
        passer.setUpperBodyYawOffset(0);
      },
    });

    // パスクールダウンを記録
    this.lastPassTime.set(passer, Date.now() / 1000);

    return { success: true, message: `${passType}開始` };
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.lastPassTime.clear();
  }
}
