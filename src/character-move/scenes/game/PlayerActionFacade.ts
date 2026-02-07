/**
 * プレイヤーアクションファサード
 * シュート、パス、ドリブル突破、フェイントなどのプレイヤーアクションを管理
 */

import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { OneOnOneBattleController } from "../../controllers/action/OneOnOneBattleController";
import { ShootingController } from "../../controllers/action/ShootingController";
import { FeintController } from "../../controllers/action/FeintController";
import { PASS_COOLDOWN } from "../../config/PassConfig";

/**
 * プレイヤーアクションファサード用コンテキスト
 */
export interface PlayerActionFacadeContext {
  ball: Ball;
  oneOnOneBattleController?: OneOnOneBattleController;
  shootingController?: ShootingController;
  feintController?: FeintController;

  // キャラクター取得
  getAllyCharacters: () => Character[];
  getEnemyCharacters: () => Character[];
}

/**
 * プレイヤーアクションファサード
 */
export class PlayerActionFacade {
  private context: PlayerActionFacadeContext;

  // パスクールダウン管理（キャラクター別）
  private lastPassTime: Map<Character, number> = new Map();

  constructor(context: PlayerActionFacadeContext) {
    this.context = context;
  }

  /**
   * コンテキストを更新
   */
  public updateContext(context: Partial<PlayerActionFacadeContext>): void {
    this.context = { ...this.context, ...context };
  }

  // =============================================================================
  // ドリブル突破
  // =============================================================================

  /**
   * ドリブル突破を実行
   * @param direction 突破方向（'left' = 左前、'right' = 右前）
   * @returns 突破を開始できた場合はtrue
   */
  public performDribbleBreakthrough(direction: 'left' | 'right'): boolean {
    return this.context.oneOnOneBattleController?.performDribbleBreakthrough(direction) ?? false;
  }

  /**
   * ドリブル突破可能かどうかをチェック
   * @returns 突破可能な場合はtrue
   */
  public canPerformDribbleBreakthrough(): boolean {
    return this.context.oneOnOneBattleController?.canPerformDribbleBreakthrough() ?? false;
  }

  // =============================================================================
  // シュート
  // =============================================================================

  /**
   * シュートを実行（アクションシステム経由）
   * @param shooter シュートを打つキャラクター（省略時はオンボールプレイヤー）
   * @returns シュート結果
   */
  public performShoot(shooter?: Character): { success: boolean; shootType: string; distance: number; message: string } | null {
    if (!this.context.shootingController) {
      return null;
    }

    // シューターが指定されていない場合、オンボールプレイヤーを取得
    const targetShooter = shooter ?? this.context.shootingController.findOnBallPlayer();
    if (!targetShooter) {
      return {
        success: false,
        shootType: 'none',
        distance: 0,
        message: 'シューターが見つかりません',
      };
    }

    // ActionController経由でシュートを開始（アニメーション付き）
    return this.context.shootingController.startShootAction(targetShooter);
  }

  /**
   * シュート可能かどうかをチェック
   * @param shooter チェック対象のキャラクター（省略時はオンボールプレイヤー）
   */
  public canShoot(shooter?: Character): boolean {
    if (!this.context.shootingController) {
      return false;
    }

    const targetShooter = shooter ?? this.context.shootingController.findOnBallPlayer();
    if (!targetShooter) {
      return false;
    }

    return this.context.shootingController.canShoot(targetShooter);
  }

  /**
   * 現在のシュートレンジ情報を取得
   * @param shooter 対象キャラクター（省略時はオンボールプレイヤー）
   */
  public getShootRangeInfo(shooter?: Character): { shootType: string; distance: number; inRange: boolean; facingGoal: boolean } | null {
    if (!this.context.shootingController) {
      return null;
    }

    const targetShooter = shooter ?? this.context.shootingController.findOnBallPlayer();
    if (!targetShooter) {
      return null;
    }

    return this.context.shootingController.getShootRangeInfo(targetShooter);
  }

  // =============================================================================
  // パス
  // =============================================================================

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
   * @param passType パスの種類
   * @param target パス先のキャラクター（省略時はチームメイトの最初の一人）
   * @returns 成功/失敗
   */
  public performPass(
    passer: Character,
    passType: 'pass_chest' | 'pass_bounce' | 'pass_overhead' = 'pass_chest',
    target?: Character
  ): { success: boolean; message: string } {
    const ball = this.context.ball;

    // ボールを持っているか確認
    if (ball.getHolder() !== passer) {
      return { success: false, message: 'ボールを持っていません' };
    }

    // ActionControllerでパスアクションを開始
    const actionController = passer.getActionController();
    const actionResult = actionController.startAction(passType);

    if (!actionResult.success) {
      return { success: false, message: actionResult.message };
    }

    // activeフェーズに入ったらボールを投げるコールバックを設定
    const allyCharacters = this.context.getAllyCharacters();
    const enemyCharacters = this.context.getEnemyCharacters();

    actionController.setCallbacks({
      onActive: (action) => {
        // ボールを持っていない場合はパスしない
        if (ball.getHolder() !== passer) {
          return;
        }

        if (action.startsWith('pass_')) {
          // パス先のキャラクターを決定
          let passTarget = target;
          if (!passTarget) {
            const teammates = passer.team === 'ally' ? allyCharacters : enemyCharacters;
            passTarget = teammates.find(c => c !== passer);
          }

          if (passTarget) {
            const targetPosition = passTarget.getPosition();
            ball.pass(targetPosition, passTarget);
          }
        }
      },
    });

    // パスクールダウンを記録
    this.lastPassTime.set(passer, Date.now() / 1000);

    return { success: true, message: `${passType}開始` };
  }

  // =============================================================================
  // ディフェンスアクション
  // =============================================================================

  /**
   * ディフェンスアクションを実行（ActionController経由）
   * @param defender ディフェンスするキャラクター
   * @param actionType ディフェンスアクションの種類
   * @returns 成功/失敗
   */
  public performDefenseAction(
    defender: Character,
    actionType: 'block_shot' | 'steal_attempt' | 'pass_intercept' | 'defense_stance'
  ): { success: boolean; message: string } {
    // ActionControllerでディフェンスアクションを開始
    const actionController = defender.getActionController();
    const actionResult = actionController.startAction(actionType);

    if (!actionResult.success) {
      return { success: false, message: actionResult.message };
    }

    // activeフェーズに入ったらディフェンス判定を行うコールバックを設定
    actionController.setCallbacks({
      onActive: (_action) => {
        // ここでブロック判定やスティール判定を行う
        // 実際の判定処理は後で追加
      },
    });

    return { success: true, message: `${actionType}開始` };
  }

  // =============================================================================
  // フェイント
  // =============================================================================

  /**
   * シュートフェイントを実行
   * @param feinter フェイントを行うキャラクター（省略時はボール保持者）
   * @returns フェイント結果
   */
  public performShootFeint(feinter?: Character): {
    success: boolean;
    defenderReacted: boolean;
    defender: Character | null;
    message: string;
  } | null {
    if (!this.context.feintController) {
      return null;
    }

    // フェイントするキャラクターを特定
    const targetFeinter = feinter ?? this.context.ball.getHolder();
    if (!targetFeinter) {
      return {
        success: false,
        defenderReacted: false,
        defender: null,
        message: 'フェイントを行うキャラクターが見つかりません',
      };
    }

    return this.context.feintController.performShootFeint(targetFeinter);
  }

  /**
   * フェイント成功後のドリブル突破を実行
   * @param character ドリブル突破を行うキャラクター（省略時はボール保持者）
   * @param direction 突破方向（'left' | 'right' | 'forward'）
   * @returns 成功した場合true
   */
  public performBreakthroughAfterFeint(
    character?: Character,
    direction: 'left' | 'right' | 'forward' = 'forward'
  ): boolean {
    if (!this.context.feintController) {
      return false;
    }

    const targetCharacter = character ?? this.context.ball.getHolder();
    if (!targetCharacter) {
      return false;
    }

    return this.context.feintController.performBreakthroughAfterFeint(targetCharacter, direction);
  }

  /**
   * フェイント成功後のドリブル突破ウィンドウ内かどうか
   * @param character チェックするキャラクター（省略時はボール保持者）
   */
  public isInBreakthroughWindow(character?: Character): boolean {
    if (!this.context.feintController) {
      return false;
    }

    const targetCharacter = character ?? this.context.ball.getHolder();
    if (!targetCharacter) {
      return false;
    }

    return this.context.feintController.isInBreakthroughWindow(targetCharacter);
  }
}
