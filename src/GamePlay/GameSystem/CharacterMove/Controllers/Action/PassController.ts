import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { PASS_COOLDOWN } from "@/SimulationPlay/TargetTrackingAccuracySystem/PassConfig";

// ── パスレーン分析ユーティリティ ──────────────────────────

/**
 * パスレーン上のディフェンダー位置を分析し、最適なカーブ方向を返す
 *
 * @param passer パスを出すキャラクター
 * @param receiver パスを受けるキャラクター
 * @param opponents 相手チームの全キャラクター
 * @returns -1（左カーブ）、0（直線）、+1（右カーブ）
 */
function determineCurveDirection(
  passer: Character,
  receiver: Character,
  opponents: Character[]
): number {
  const passerPos = passer.getPosition();
  const receiverPos = receiver.getPosition();

  // パス方向の水平ベクトル
  const passVec = new Vector3(
    receiverPos.x - passerPos.x, 0,
    receiverPos.z - passerPos.z
  );
  const passDistance = passVec.length();
  if (passDistance < 0.01) return 0;

  const passDir = passVec.normalize();

  // 横方向（右手法則: passDir × Y_up）
  const lateralDir = new Vector3(passDir.z, 0, -passDir.x);

  // パスライン付近のディフェンダーを検出し、横オフセットを集計
  const LANE_WIDTH = 2.0; // パスラインからの検出幅（m）
  let weightedOffset = 0;
  let hasBlocker = false;

  for (const opponent of opponents) {
    const opponentPos = opponent.getPosition();
    const toOpponent = new Vector3(
      opponentPos.x - passerPos.x, 0,
      opponentPos.z - passerPos.z
    );

    // パス方向への射影（前方距離）
    const forwardDist = Vector3.Dot(toOpponent, passDir);

    // パサーとレシーバーの間にいるか確認（少しマージンを持たせる）
    if (forwardDist < 0.5 || forwardDist > passDistance - 0.5) continue;

    // パスラインからの横方向距離
    const lateralDist = Vector3.Dot(toOpponent, lateralDir);

    // パスライン付近にいるか確認
    if (Math.abs(lateralDist) > LANE_WIDTH) continue;

    hasBlocker = true;

    // 近いディフェンダーほど重みを大きくする（パスラインに近いほど重要）
    const proximityWeight = 1.0 - Math.abs(lateralDist) / LANE_WIDTH;
    weightedOffset += lateralDist * proximityWeight;
  }

  if (!hasBlocker) return 0;

  // ディフェンダーが右寄りなら左にカーブ（-1）、左寄りなら右にカーブ（+1）
  return weightedOffset > 0 ? -1 : 1;
}

/**
 * パスレーン上にディフェンダーが直接立ちはだかっているか判定
 * determineCurveDirectionより厳しい判定（幅1.0m以内）で、
 * チェストパスが通らないレベルのブロックを検出する。
 *
 * @param passer パスを出すキャラクター
 * @param receiver パスを受けるキャラクター
 * @param opponents 相手チームの全キャラクター
 * @returns true: パスレーンがブロックされている
 */
function isPassLaneBlocked(
  passer: Character,
  receiver: Character,
  opponents: Character[]
): boolean {
  const passerPos = passer.getPosition();
  const receiverPos = receiver.getPosition();

  const passVec = new Vector3(
    receiverPos.x - passerPos.x, 0,
    receiverPos.z - passerPos.z
  );
  const passDistance = passVec.length();
  if (passDistance < 0.01) return false;

  const passDir = passVec.normalize();
  const lateralDir = new Vector3(passDir.z, 0, -passDir.x);

  const BLOCK_WIDTH = 1.0; // ブロック判定幅（m）

  for (const opponent of opponents) {
    const opponentPos = opponent.getPosition();
    const toOpponent = new Vector3(
      opponentPos.x - passerPos.x, 0,
      opponentPos.z - passerPos.z
    );

    // パサーとレシーバーの間にいるか確認
    const forwardDist = Vector3.Dot(toOpponent, passDir);
    if (forwardDist < 0.5 || forwardDist > passDistance - 0.5) continue;

    // パスラインからの横方向距離
    const lateralDist = Math.abs(Vector3.Dot(toOpponent, lateralDir));

    if (lateralDist <= BLOCK_WIDTH) {
      return true;
    }
  }

  return false;
}

// ── PassController ──────────────────────────────────────

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

            // レシーバーにball_catchアクションを開始させる
            const receiverActionController = passTarget.getActionController();
            receiverActionController.startAction('ball_catch');
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
