import { Vector3 } from "@babylonjs/core";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { DRIBBLE_STANCE_MOTION } from "../../motion/DribbleMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";
import { DefenseUtils } from "../../config/DefenseConfig";
import { OnBallOffenseAISub } from "./OnBallOffenseAISub";
import { getShootAggressiveness, get1on1ActionProbabilities } from "../../config/PositionBehaviorConfig";

/**
 * オンボールオフェンス時のAI
 * ボール保持者として攻撃を組み立てる
 *
 * このクラスは判断の条件分岐のみを含む。
 * 設定・ユーティリティ・アクション実装はOnBallOffenseAISub（親クラス）に委譲。
 */
export class OnBallOffenseAI extends OnBallOffenseAISub {

  /**
   * AIの更新処理
   * 1つの大きなif-else条件分岐で判断フローを表現
   */
  public update(deltaTime: number): void {
    if (this.ball.isInFlight()) {
      // ========================================
      // ボール飛行中 → 見守る
      // ========================================
      this.handleWatchShot();

    } else if (this.surveyPhase !== "none") {
      // ========================================
      // 周囲確認フェーズ（ボール受取直後）
      // ========================================
      this.updateSurveyPhase(deltaTime);

    } else if (!this.targetPositionOverride && this.tryRoleBasedPassToMainHandler()) {
      // ========================================
      // ロール別パス → メインハンドラーへ返す
      // ========================================

    } else if (!this.targetPositionOverride && this.tryPaintAreaShot(deltaTime)) {
      // ========================================
      // ペイントエリア内 → レイアップ/ダンク最優先
      // ========================================

    } else if (!this.targetPositionOverride && this.tryShotPriorityAction()) {
      // ========================================
      // 3Pエリア付近 → shotPriority順にパス
      // ========================================

    } else {
      // ========================================
      // メイン判断フェーズ
      // ========================================
      this.updateIdleTracking(deltaTime);

      if (this.idleTimer >= this.IDLE_FORCE_ACTION_THRESHOLD && this.tryForceActionWhenIdle()) {
        // 長時間静止 → 強制行動
        this.idleTimer = 0;

      } else if (this.feintController?.isInBreakthroughWindow(this.character) && this.tryBreakthroughAfterFeint()) {
        // フェイント成功後 → ドリブル突破

      } else {
        // === ゴール方向を向く ===
        const targetPosition = this.getTargetPosition();
        const myPosition = this.character.getPosition();
        const toGoal = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

        if (toGoal.length() > 0.01) {
          this.character.setRotation(Math.atan2(toGoal.x, toGoal.z));
        }

        if (!this.targetPositionOverride && this.isShotClockUrgent() && this.tryShoot()) {
          // ========================================
          // ショットクロック緊急 → 最優先シュート
          // ========================================

        } else {
          // === ディフェンダー状況に応じた分岐 ===
          const defenderInPath = this.findDefenderInPathToGoal(targetPosition);

          if (defenderInPath) {
            const defenderPosition = defenderInPath.getPosition();
            const isDefenderInFOV = DefenseUtils.is1on1StateByFieldOfView(
              { x: myPosition.x, z: myPosition.z },
              this.character.getRotation(),
              { x: defenderPosition.x, z: defenderPosition.z }
            );

            if (isDefenderInFOV) {
              // ========================================
              // 1on1状態（ディフェンダーが視野内）
              // ========================================
              this.handle1on1State(targetPosition, deltaTime);

            } else {
              // ========================================
              // ディフェンダーが視野外 → ダッシュ/シュート
              // ========================================
              this.handleDefenderOutOfFOV(targetPosition, deltaTime);
            }

          } else if (!this.targetPositionOverride && this.tryShoot()) {
            // ========================================
            // ディフェンダーなし + シュートレンジ → シュート
            // ========================================

          } else if (!this.targetPositionOverride && this.tryPass()) {
            // ========================================
            // ディフェンダーなし + パス試行
            // ========================================

          } else {
            // ========================================
            // ディフェンダーなし → ゴールへドライブ
            // ========================================
            const distanceToTarget = toGoal.length();
            const stopDistance = this.targetPositionOverride ? 0.5 : 1.0;

            if (distanceToTarget > stopDistance) {
              // ダッシュでゴールへ前進
              if (this.character.getCurrentMotionName() !== "dash_forward") {
                this.character.playMotion(DASH_FORWARD_MOTION);
              }
              const direction = toGoal.normalize();
              const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
              this.character.move(boundaryAdjusted || direction, deltaTime);

            } else if (!this.targetPositionOverride && this.tryShoot()) {
              // 目標到達 → シュート再試行

            } else {
              // アイドル
              if (this.character.getCurrentMotionName() !== "idle") {
                this.character.playMotion(IDLE_MOTION);
              }
            }
          }
        }
      }
    }
  }

  /**
   * 1on1状態（ディフェンダーが視野内）の処理
   * ドリブルモーションを使用し、確率ベースでアクションを選択
   */
  private handle1on1State(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();

    // 1on1時は常にドリブル構えモーション
    if (this.character.getCurrentMotionName() !== "dribble_stance") {
      this.character.playMotion(DRIBBLE_STANCE_MOTION);
    }

    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    if (!this.targetPositionOverride && this.isShotClockUrgent() && this.tryShoot()) {
      // ========================================
      // ショットクロック緊急 → シュート
      // ========================================

    } else if (!this.targetPositionOverride && this.tryPass()) {
      // ========================================
      // パス試行
      // ========================================

    } else if (!this.targetPositionOverride && this.moveToCreatePassLane(deltaTime)) {
      // ========================================
      // パスレーン作成移動
      // ========================================

    } else {
      // ========================================
      // 確率ベースアクション選択 + 前進
      // ========================================
      const positionBehavior = this.getPositionBehaviorParams();
      const actionProbs = get1on1ActionProbabilities(positionBehavior);
      const rangeInfo = this.shootingController?.getShootRangeInfo(this.character);
      const inShootRange = rangeInfo?.inRange ?? false;
      const shootType = rangeInfo?.shootType;
      const shootAggressiveness = shootType
        ? getShootAggressiveness(positionBehavior, shootType)
        : positionBehavior.midRangeAggressiveness;
      const actionChoice = Math.random();

      let actionTaken = false;

      if (inShootRange) {
        // --- シュートレンジ内 ---
        if (actionChoice < shootAggressiveness && !this.targetPositionOverride && this.tryShoot()) {
          actionTaken = true;

        } else {
          // シュートしなかった/できなかった → フェイント/ドライブ/様子見
          const remainingChoice = Math.random();
          const total = actionProbs.feint + actionProbs.drive + actionProbs.wait;
          const normalizedFeint = actionProbs.feint / total;
          const normalizedDrive = actionProbs.drive / total;

          if (remainingChoice < normalizedFeint) {
            if (this.tryFeint()) {
              actionTaken = true;
            }
          } else if (remainingChoice < normalizedFeint + normalizedDrive) {
            if (this.tryDribbleMove()) {
              actionTaken = true;
            }
          }
          // 残り: 様子見（actionTaken = false → 前進）
        }

      } else {
        // --- シュートレンジ外 ---
        if (actionChoice < actionProbs.drive) {
          if (this.tryDribbleMove()) {
            actionTaken = true;
          }
        } else if (actionChoice < actionProbs.drive + actionProbs.feint) {
          if (this.tryFeint()) {
            actionTaken = true;
          }
        }
        // 残り: 前進（actionTaken = false）
      }

      // アクション未実行 → 前進
      if (!actionTaken) {
        const distanceToTarget = toTarget.length();

        if (distanceToTarget > 0.5) {
          // 目標に向かって前進（衝突回避付き）
          const direction = toTarget.normalize();
          let moveDirection = direction;
          const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

          if (boundaryAdjusted) {
            moveDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime) || boundaryAdjusted;
          }

          const moveSpeed = inShootRange ? 0.6 : 0.9;
          this.character.move(moveDirection.scale(moveSpeed), deltaTime);

        } else if (!this.targetPositionOverride && this.tryShoot()) {
          // 目標至近距離 → シュート再試行
        }
      }
    }
  }

  /**
   * ディフェンダーが視野外に外れた時の処理
   * ダッシュでゴールへ向かうか、シュートレンジならシュート
   */
  private handleDefenderOutOfFOV(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();

    if (!this.targetPositionOverride && this.tryShoot()) {
      // ========================================
      // シュート試行
      // ========================================

    } else {
      // ========================================
      // ダッシュで目標に向かう
      // ========================================
      const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);
      const distanceToTarget = toTarget.length();

      if (distanceToTarget > 0.5) {
        // ダッシュモーションで全速力前進
        if (this.character.getCurrentMotionName() !== "dash_forward") {
          this.character.playMotion(DASH_FORWARD_MOTION);
        }

        const direction = toTarget.normalize();
        let moveDirection = direction;
        const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

        if (boundaryAdjusted) {
          moveDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime) || boundaryAdjusted;
        }

        this.character.move(moveDirection, deltaTime);

      } else if (!this.targetPositionOverride && this.tryShoot()) {
        // 目標至近距離 → シュート再試行

      } else {
        // アイドル
        if (this.character.getCurrentMotionName() !== "idle") {
          this.character.playMotion(IDLE_MOTION);
        }
      }
    }
  }
}
