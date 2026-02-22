import { Vector3 } from "@babylonjs/core";
import { IDLE_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/IdleMotion";
import { DRIBBLE_STANCE_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/DribbleMotion";
import { DASH_FORWARD_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/DashMotion";
import { DefenseUtils } from "@/GamePlay/GameSystem/DecisionMakingSystem/DefenseConfig";
import { OnBallOffenseAISub } from "@/GamePlay/GameSystem/DecisionMakingSystem/AI/State/OnBallOffenseAISub";
import { getShootAggressiveness, get1on1ActionProbabilities } from "@/GamePlay/GameSystem/DecisionMakingSystem/PositionBehaviorConfig";
import { CourtZone, ShotClockPhase, detectCourtZone, getShotClockPhase } from "@/GamePlay/GameSystem/DecisionMakingSystem/CourtZoneConfig";
import { OffenseRole } from "@/GamePlay/GameSystem/StatusCheckSystem/PlayerStateTypes";
import { getOpponents } from "@/GamePlay/GameSystem/Utils/TeamUtils";

/**
 * オンボールオフェンス時のAI
 * ボール保持者として攻撃を組み立てる
 *
 * コートゾーン × ショットクロックフェーズの2軸で判断を構造化。
 * 設定・ユーティリティ・アクション実装はOnBallOffenseAISub（親クラス）に委譲。
 */
export class OnBallOffenseAI extends OnBallOffenseAISub {

  /** フロントコート3P外での1on1継続時間（秒） */
  private frontcourt1on1Timer: number = 0;
  private readonly FRONTCOURT_1ON1_PASS_THRESHOLD: number = 5.0;

  public override onEnterState(): void {
    super.onEnterState();
    this.frontcourt1on1Timer = 0;
    this.currentHoldingRestriction = "default";
  }

  public override onExitState(): void {
    super.onExitState();
    this.frontcourt1on1Timer = 0;
    // 状態離脱時にデフォルトに戻す
    this.character.setBallHoldingFaces([0, 1, 2, 6, 7]);
    this.currentHoldingRestriction = "default";
    this.character.setUpperBodyYawOffset(0);
  }

  public override forceReset(): void {
    super.forceReset();
    this.frontcourt1on1Timer = 0;
    this.character.setBallHoldingFaces([0, 1, 2, 6, 7]);
    this.currentHoldingRestriction = "default";
    this.character.setUpperBodyYawOffset(0);
  }

  /**
   * AIの更新処理
   * コートゾーン × ショットクロックフェーズで判断をディスパッチ
   */
  public update(deltaTime: number): void {
    // ========================================
    // 1. ボール飛行中 → 見守る
    // ========================================
    if (this.ball.isInFlight()) {
      this.handleWatchShot();
      return;
    }

    // ========================================
    // 1.5. ショットクロック残り3秒以下 → 強制シュート最優先
    //      ポジション・優先度・ゾーンに関係なく即座にシュート
    // ========================================
    if (this.getShotClockRemainingTime() <= 3.0) {
      if (this.tryShoot(1.0)) return;
      this.advanceTowardGoal(deltaTime);
      return;
    }

    // ========================================
    // 2. 周囲確認フェーズ（ボール受取直後）
    // ========================================
    if (this.surveyPhase !== "none") {
      this.updateSurveyPhase(deltaTime);
      return;
    }

    // ========================================
    // 3. アイドル時間追跡（常に実行）
    // ========================================
    this.updateIdleTracking(deltaTime);

    // ========================================
    // 4. フェイント突破ウィンドウ
    // ========================================
    if (this.feintController?.isInBreakthroughWindow(this.character) && this.tryBreakthroughAfterFeint()) {
      return;
    }

    // ========================================
    // 5. 長時間静止 → 強制行動
    // ========================================
    if (this.idleTimer >= this.IDLE_FORCE_ACTION_THRESHOLD && this.tryForceActionWhenIdle()) {
      this.idleTimer = 0;
      return;
    }

    // ========================================
    // 6. targetPositionOverride → 目標位置への移動
    // ========================================
    if (this.targetPositionOverride) {
      this.handleTargetOverrideMovement(deltaTime);
      return;
    }

    // ========================================
    // 7. ゾーン判定 + ゴール方向を向く
    // ========================================
    const targetPosition = this.getTargetPosition();
    const myPosition = this.character.getPosition();
    const toGoal = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    if (toGoal.length() > 0.01) {
      this.character.setRotation(Math.atan2(toGoal.x, toGoal.z));
    }

    const zone = detectCourtZone({ x: myPosition.x, z: myPosition.z }, this.character.team);
    const remainingTime = this.getShotClockRemainingTime();
    const phase = getShotClockPhase(zone, remainingTime);

    // ========================================
    // 7.5. ゾーンに応じたボール保持面の制限
    // ========================================
    this.applyZoneBallHoldingRestriction(zone);

    // ========================================
    // 8. ゾーン別ハンドラーへディスパッチ
    // ========================================
    switch (zone) {
      case CourtZone.BACKCOURT:
        this.handleBackcourt(deltaTime, phase);
        break;
      case CourtZone.FRONTCOURT_OUTSIDE_3P:
        this.handleFrontcourtOutside3P(deltaTime, phase);
        break;
      case CourtZone.INSIDE_3P:
        this.handleInside3P(deltaTime, phase);
        break;
      case CourtZone.PAINT_AREA:
        this.handlePaintArea(deltaTime, phase);
        break;
      case CourtZone.BEHIND_GOAL:
        this.handleBehindGoal(deltaTime, phase);
        break;
    }
  }

  // ==============================
  // ゾーン別ハンドラー
  // ==============================

  /**
   * バックコート: ボールを前に運ぶのが最優先
   */
  private handleBackcourt(deltaTime: number, phase: ShotClockPhase): void {
    // ダブルチーム検出 → 即パス
    if (this.isDoubleteamed() && this.tryPass()) return;

    switch (phase) {
      case ShotClockPhase.EARLY:
        if (this.character.offenseRole !== OffenseRole.MAIN_HANDLER) {
          if (this.tryRoleBasedPassToMainHandler()) return;
        }
        this.advanceTowardGoal(deltaTime);
        break;

      case ShotClockPhase.MID:
        if (this.tryPass()) return;
        this.advanceTowardGoal(deltaTime);
        break;

      case ShotClockPhase.LATE:
        if (this.tryPass()) return;
        this.advanceTowardGoal(deltaTime);
        break;

      case ShotClockPhase.CRITICAL:
        if (this.tryShoot(1.0)) return;
        if (this.tryPass()) return;
        this.advanceTowardGoal(deltaTime);
        break;
    }
  }

  /**
   * フロントコート3P外: オフェンス組立
   */
  private handleFrontcourtOutside3P(deltaTime: number, phase: ShotClockPhase): void {
    // ダブルチーム検出 → 即パス
    if (this.isDoubleteamed() && this.tryPass()) return;

    // 1on1継続タイマー: ディフェンダーが経路上にいれば加算、いなければリセット
    const targetPosition = this.getTargetPosition();
    const defenderInPath = this.findDefenderInPathToGoal(targetPosition);

    if (defenderInPath) {
      this.frontcourt1on1Timer += deltaTime;
    } else {
      this.frontcourt1on1Timer = 0;
    }

    // 1on1が5秒以上続いたら強制パス
    if (this.frontcourt1on1Timer >= this.FRONTCOURT_1ON1_PASS_THRESHOLD) {
      if (this.tryPass()) {
        this.frontcourt1on1Timer = 0;
        return;
      }
    }

    switch (phase) {
      case ShotClockPhase.EARLY:
        if (this.tryRoleBasedPassToMainHandler()) return;
        if (this.tryShotPriorityAction()) return;
        this.handleDefenderBasedAction(deltaTime);
        break;

      case ShotClockPhase.MID:
        if (this.tryShotPriorityAction()) return;
        if (this.tryPass()) return;
        this.handleDefenderBasedAction(deltaTime);
        break;

      case ShotClockPhase.LATE:
        if (this.tryPass()) return;
        if (this.tryDribbleMove()) return;
        if (this.tryFeint()) return;
        this.advanceTowardGoal(deltaTime);
        break;

      case ShotClockPhase.CRITICAL:
        if (this.tryShoot(0.3)) return;
        if (this.tryPass()) return;
        if (this.tryDribbleMove()) return;
        this.advanceTowardGoal(deltaTime);
        break;
    }
  }

  /**
   * 3Pアーク内: 主要得点ゾーン、1on1 + シュート中心
   * shotPriority（1=ファーストチョイス）に応じてシュート積極性を変化
   */
  private handleInside3P(deltaTime: number, phase: ShotClockPhase): void {
    const isFirstChoice = this.character.shotPriority === 1;

    switch (phase) {
      case ShotClockPhase.EARLY:
        if (isFirstChoice) {
          // ファーストチョイス: シュート最優先
          if (this.tryShoot()) return;
          if (this.tryFeint()) return;
          this.handleDefenderBasedAction(deltaTime);
        } else {
          // それ以外: ファーストチョイスへ展開優先
          if (this.tryShotPriorityAction()) return;
          if (this.tryPass()) return;
          if (this.tryShoot()) return;
          this.handleDefenderBasedAction(deltaTime);
        }
        break;

      case ShotClockPhase.MID:
        if (isFirstChoice) {
          if (this.tryShoot(0.2)) return;
          if (this.tryFeint()) return;
          this.handleDefenderBasedAction(deltaTime);
        } else {
          if (this.tryShotPriorityAction()) return;
          if (this.tryPass()) return;
          if (this.tryShoot()) return;
          this.handleDefenderBasedAction(deltaTime);
        }
        break;

      case ShotClockPhase.LATE:
        if (isFirstChoice) {
          if (this.tryShoot(0.3)) return;
          if (this.tryDribbleMove()) return;
          this.advanceTowardGoal(deltaTime);
        } else {
          if (this.tryPass()) return;
          if (this.tryShoot(0.15)) return;
          if (this.tryDribbleMove()) return;
          this.advanceTowardGoal(deltaTime);
        }
        break;

      case ShotClockPhase.CRITICAL:
        if (this.tryShoot(1.0)) return;
        if (this.tryPass()) return;
        this.advanceTowardGoal(deltaTime);
        break;
    }
  }

  /**
   * ペイントエリア: ゴール下、常にシュート最優先
   * ドライブ中（ダッシュ加速70%以上 or ドリブル突破中）はジャンプシュートを最優先
   */
  private handlePaintArea(deltaTime: number, phase: ShotClockPhase): void {
    // ドライブ→ジャンプシュート判定（ダッシュ加速中 or ドリブル突破中に最優先）
    if (this.tryDriveJumpShoot(deltaTime)) return;

    switch (phase) {
      case ShotClockPhase.EARLY:
        if (this.tryPaintAreaShot(deltaTime)) return;
        if (this.tryPass()) return;
        if (this.tryFeint()) return;
        this.advanceTowardGoal(deltaTime);
        break;

      case ShotClockPhase.MID:
        if (this.tryPaintAreaShot(deltaTime)) return;
        if (this.tryFeint()) return;
        if (this.tryPass()) return;
        this.advanceTowardGoal(deltaTime);
        break;

      case ShotClockPhase.LATE:
        if (this.tryPaintAreaShot(deltaTime)) return;
        if (this.tryShoot()) return;
        if (this.tryPass()) return;
        this.advanceTowardGoal(deltaTime);
        break;

      case ShotClockPhase.CRITICAL:
        if (this.tryPaintAreaShot(deltaTime)) return;
        if (this.tryShoot(1.0)) return;
        if (this.tryPass()) return;
        this.advanceTowardGoal(deltaTime);
        break;
    }
  }

  /**
   * ゴール裏: 脱出最優先
   */
  private handleBehindGoal(deltaTime: number, phase: ShotClockPhase): void {
    if (phase === ShotClockPhase.CRITICAL) {
      if (this.tryPass()) return;
      if (this.tryShoot(1.0)) return;
      this.moveBackTowardCourt(deltaTime);
    } else {
      if (this.tryPass()) return;
      this.moveBackTowardCourt(deltaTime);
    }
  }

  // ==============================
  // 共通ヘルパーメソッド
  // ==============================

  /** 現在適用中のボール保持面制限 */
  private currentHoldingRestriction: "default" | "inside3p" | "paint" = "default";

  /**
   * ゾーンに応じてボール保持面を制限
   * - ペイントエリア: 正面(0)のみ
   * - 3Pアーク内: 正面(0) + 斜め前(1,7)
   * - それ以外: デフォルト(0,1,2,6,7)
   */
  private applyZoneBallHoldingRestriction(zone: CourtZone): void {
    if (zone === CourtZone.PAINT_AREA) {
      if (this.currentHoldingRestriction !== "paint") {
        this.character.setBallHoldingFaces([0]);
        this.currentHoldingRestriction = "paint";
      }
    } else if (zone === CourtZone.INSIDE_3P) {
      if (this.currentHoldingRestriction !== "inside3p") {
        this.character.setBallHoldingFaces([0, 1, 7]);
        this.currentHoldingRestriction = "inside3p";
      }
    } else {
      if (this.currentHoldingRestriction !== "default") {
        this.character.setBallHoldingFaces([0, 1, 2, 6, 7]);
        this.currentHoldingRestriction = "default";
      }
    }
  }

  /**
   * 近くに相手が2人以上いるかどうかを判定
   * @param radius 検出半径（デフォルト3.0m）
   * @returns 2人以上いればtrue
   */
  private isDoubleteamed(radius: number = 3.0): boolean {
    const myPos = this.character.getPosition();
    const opponents = getOpponents(this.allCharacters, this.character);
    let count = 0;

    for (const opponent of opponents) {
      const opPos = opponent.getPosition();
      const dx = opPos.x - myPos.x;
      const dz = opPos.z - myPos.z;
      if (dx * dx + dz * dz <= radius * radius) {
        count++;
        if (count >= 2) return true;
      }
    }
    return false;
  }

  /**
   * ゴール方向に前進（境界チェック付き）
   * ディフェンダーが正面にいる場合はドリブル構え+低速、いなければダッシュ
   */
  private advanceTowardGoal(deltaTime: number): void {
    const targetPosition = this.getTargetPosition();
    const myPosition = this.character.getPosition();
    const toGoal = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);
    const distanceToGoal = toGoal.length();

    if (distanceToGoal > 1.0) {
      // ディフェンダーが正面にいるかチェック
      const defenderInPath = this.findDefenderInPathToGoal(targetPosition);
      const hasDefenderInFront = defenderInPath !== null && DefenseUtils.is1on1StateByFieldOfView(
        { x: myPosition.x, z: myPosition.z },
        this.character.getRotation(),
        { x: defenderInPath.getPosition().x, z: defenderInPath.getPosition().z }
      );

      if (hasDefenderInFront) {
        // ディフェンダーが正面 → ドリブル構え+低速前進
        if (this.character.getMotionController().getCurrentMotionName() !== "dribble_stance") {
          this.character.getMotionController().play(DRIBBLE_STANCE_MOTION);
        }
      } else {
        // ディフェンダーなし or 抜き去った → ダッシュ
        if (this.character.getMotionController().getCurrentMotionName() !== "dash_forward") {
          this.character.getMotionController().play(DASH_FORWARD_MOTION);
        }
      }

      const direction = toGoal.normalize();
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

      if (boundaryAdjusted) {
        const adjusted = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime) || boundaryAdjusted;
        this.character.move(hasDefenderInFront ? adjusted.scale(0.6) : adjusted, deltaTime);
      } else {
        this.character.move(hasDefenderInFront ? direction.scale(0.6) : direction, deltaTime);
      }
    } else if (this.tryShoot()) {
      // 目標到達 → シュート再試行
    } else {
      if (this.character.getMotionController().getCurrentMotionName() !== "idle") {
        this.character.getMotionController().play(IDLE_MOTION);
      }
    }
  }

  /**
   * ディフェンダー状況に応じた行動
   * findDefenderInPathToGoal → 1on1 or ダッシュ
   */
  private handleDefenderBasedAction(deltaTime: number): void {
    const targetPosition = this.getTargetPosition();
    const myPosition = this.character.getPosition();
    const defenderInPath = this.findDefenderInPathToGoal(targetPosition);

    if (defenderInPath) {
      const defenderPosition = defenderInPath.getPosition();
      const isDefenderInFOV = DefenseUtils.is1on1StateByFieldOfView(
        { x: myPosition.x, z: myPosition.z },
        this.character.getRotation(),
        { x: defenderPosition.x, z: defenderPosition.z }
      );

      if (isDefenderInFOV) {
        this.handle1on1State(targetPosition, deltaTime);
      } else {
        this.handleDefenderOutOfFOV(targetPosition, deltaTime);
      }
    } else {
      // ディフェンダーなし → ゴールへドライブ
      this.advanceTowardGoal(deltaTime);
    }
  }

  /**
   * ゴール裏からコート内へ移動（FTライン方向へダッシュ）
   */
  private moveBackTowardCourt(deltaTime: number): void {
    const myPosition = this.character.getPosition();
    // FTライン付近の位置を目標にする（コート中央、ゴール前方向）
    const isAlly = this.character.team === "ally";
    // ゴール裏からFTライン方向（コート内側）へ戻る
    const targetZ = isAlly ? 9.0 : -9.0;
    const targetPosition = new Vector3(0, 0, targetZ);

    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    if (toTarget.length() > 0.5) {
      if (this.character.getMotionController().getCurrentMotionName() !== "dash_forward") {
        this.character.getMotionController().play(DASH_FORWARD_MOTION);
      }

      const direction = toTarget.normalize();
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

      if (boundaryAdjusted) {
        const adjusted = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime) || boundaryAdjusted;
        this.character.move(adjusted, deltaTime);
      } else {
        this.character.move(direction, deltaTime);
      }
    } else {
      if (this.character.getMotionController().getCurrentMotionName() !== "idle") {
        this.character.getMotionController().play(IDLE_MOTION);
      }
    }
  }

  /**
   * targetPositionOverrideへの移動処理
   */
  private handleTargetOverrideMovement(deltaTime: number): void {
    const targetPosition = this.targetPositionOverride!;
    const myPosition = this.character.getPosition();
    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    // ゴール方向を向く
    if (toTarget.length() > 0.01) {
      this.character.setRotation(Math.atan2(toTarget.x, toTarget.z));
    }

    const distanceToTarget = toTarget.length();

    if (distanceToTarget > 0.5) {
      if (this.character.getMotionController().getCurrentMotionName() !== "dash_forward") {
        this.character.getMotionController().play(DASH_FORWARD_MOTION);
      }
      const direction = toTarget.normalize();
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
      this.character.move(boundaryAdjusted || direction, deltaTime);
    } else {
      // 到着 → アイドル
      if (this.character.getMotionController().getCurrentMotionName() !== "idle") {
        this.character.getMotionController().play(IDLE_MOTION);
      }
    }
  }

  // ==============================
  // 既存の1on1 / ディフェンダー外ハンドラー（内部利用）
  // ==============================

  /**
   * 1on1状態（ディフェンダーが視野内）の処理
   * ドリブルモーションを使用し、確率ベースでアクションを選択
   */
  private handle1on1State(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();

    // 1on1時は常にドリブル構えモーション
    if (this.character.getMotionController().getCurrentMotionName() !== "dribble_stance") {
      this.character.getMotionController().play(DRIBBLE_STANCE_MOTION);
    }

    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    if (this.tryPass()) {
      return;
    }

    if (this.moveToCreatePassLane(deltaTime)) {
      return;
    }

    // 確率ベースアクション選択 + 前進
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
      if (actionChoice < shootAggressiveness && this.tryShoot()) {
        actionTaken = true;
      } else {
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
      }
    } else {
      if (actionChoice < actionProbs.drive) {
        if (this.tryDribbleMove()) {
          actionTaken = true;
        }
      } else if (actionChoice < actionProbs.drive + actionProbs.feint) {
        if (this.tryFeint()) {
          actionTaken = true;
        }
      }
    }

    // アクション未実行 → 前進
    if (!actionTaken) {
      const distanceToTarget = toTarget.length();

      if (distanceToTarget > 0.5) {
        const direction = toTarget.normalize();
        let moveDirection = direction;
        const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

        if (boundaryAdjusted) {
          moveDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime) || boundaryAdjusted;
        }

        const moveSpeed = inShootRange ? 0.6 : 0.9;
        this.character.move(moveDirection.scale(moveSpeed), deltaTime);
      } else if (this.tryShoot()) {
        // 目標至近距離 → シュート再試行
      }
    }
  }

  /**
   * ディフェンダーが視野外に外れた時の処理
   * ダッシュでゴールへ向かうか、シュートレンジならシュート
   */
  private handleDefenderOutOfFOV(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();

    if (this.tryShoot()) {
      return;
    }

    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);
    const distanceToTarget = toTarget.length();

    if (distanceToTarget > 0.5) {
      if (this.character.getMotionController().getCurrentMotionName() !== "dash_forward") {
        this.character.getMotionController().play(DASH_FORWARD_MOTION);
      }

      const direction = toTarget.normalize();
      let moveDirection = direction;
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

      if (boundaryAdjusted) {
        moveDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime) || boundaryAdjusted;
      }

      this.character.move(moveDirection, deltaTime);
    } else if (this.tryShoot()) {
      // 目標至近距離 → シュート再試行
    } else {
      if (this.character.getMotionController().getCurrentMotionName() !== "idle") {
        this.character.getMotionController().play(IDLE_MOTION);
      }
    }
  }
}
