import {Vector3} from "@babylonjs/core";
import {Character} from "../../entities/Character";
import {Ball} from "../../entities/Ball";
import {Field} from "../../entities/Field";
import {BaseStateAI} from "./BaseStateAI";
import {PlayerStateManager} from "../../state";
import {ShootingController} from "../../controllers/action/ShootingController";
import {FeintController} from "../../controllers/action/FeintController";
import {ShotClockController} from "../../controllers/ShotClockController";
import {ShootingUtils, SHOOT_RANGE} from "../../config/action/ShootingConfig";
import {PassUtils} from "../../config/PassConfig";
import {DRIBBLE_STANCE_MOTION} from "../../motion/DribbleMotion";
import {DASH_FORWARD_MOTION} from "../../motion/DashMotion";
import {RiskAssessmentSystem} from "../../systems/RiskAssessmentSystem";
import { normalizeAngle, getDistance2D } from "../../utils/CollisionUtils";
import { getTeammates, getOpponents } from "../../utils/TeamUtils";
import { isInPaintArea } from "../../config/TacticalZoneConfig";
import { OffenseRole } from "../../state/PlayerStateTypes";
import { PassController } from "../../controllers/action/PassController";
import { DribbleController } from "../../controllers/action/DribbleController";
import { PositionBehaviorParams, getPositionBehavior, getShootAggressiveness } from "../../config/PositionBehaviorConfig";
import { PlayerPosition } from "../../config/FormationConfig";

/**
 * OnBallOffenseAIのベースクラス
 * 設定・ユーティリティ・アクション実装を提供
 * 判断の条件分岐はOnBallOffenseAI（サブクラス）に残る
 */
export abstract class OnBallOffenseAISub extends BaseStateAI {
  protected shootingController: ShootingController | null = null;
  protected feintController: FeintController | null = null;
  private shotClockController: ShotClockController | null = null;
  protected passController: PassController | null = null;
  private dribbleController: DribbleController | null = null;

  // 目標位置オーバーライド（設定時はゴールではなくこの位置に向かう）
  protected targetPositionOverride: Vector3 | null = null;

  // パスレーン分析用
  private riskAssessment: RiskAssessmentSystem | null = null;
  private readonly maxPassLaneRisk: number = 0.5;
  protected passLaneAdjustmentTarget: Vector3 | null = null;
  protected passLaneAdjustmentTimer: number = 0;
  private readonly passLaneReevaluateInterval: number = 0.5;

  // 周囲確認フェーズ（ボール受け取り直後）
  protected surveyPhase: "none" | "look_left" | "look_right" | "face_goal" = "none";
  protected surveyTimer: number = 0;
  protected surveyTotalTimer: number = 0;
  protected surveyStartRotation: number = 0;
  private readonly SURVEY_LOOK_DURATION: number = 0.25;
  private readonly SURVEY_FACE_GOAL_DURATION: number = 0.2;
  private readonly SURVEY_LOOK_ANGLE: number = Math.PI / 3;
  private readonly SURVEY_MAX_TOTAL_TIME: number = 3.0;

  // アイドル時間追跡（静止状態が続いた場合に強制行動）
  protected idleTimer: number = 0;
  protected lastPosition: Vector3 | null = null;
  protected readonly IDLE_FORCE_ACTION_THRESHOLD: number = 3.0;
  private readonly IDLE_POSITION_THRESHOLD: number = 0.1;

  // ポジション別行動パラメータ（キャッシュ）
  private cachedPositionBehavior: PositionBehaviorParams | null = null;
  private cachedPlayerPosition: PlayerPosition | undefined = undefined;

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field, playerState?: PlayerStateManager) {
    super(character, ball, allCharacters, field, playerState);
  }

  // ==============================
  // パブリックセッター
  // ==============================

  public setRiskAssessmentSystem(system: RiskAssessmentSystem): void {
    this.riskAssessment = system;
  }

  public setShootingController(controller: ShootingController): void {
    this.shootingController = controller;
  }

  public setFeintController(controller: FeintController): void {
    this.feintController = controller;
  }

  public setShotClockController(controller: ShotClockController): void {
    this.shotClockController = controller;
  }

  public setPassController(controller: PassController): void {
    this.passController = controller;
  }

  public setDribbleController(controller: DribbleController): void {
    this.dribbleController = controller;
  }

  public setTargetPositionOverride(position: Vector3 | null): void {
    this.targetPositionOverride = position;
  }

  public clearTargetPositionOverride(): void {
    this.targetPositionOverride = null;
  }

  // ==============================
  // ライフサイクル（状態遷移時のリセット）
  // ==============================

  /**
   * 状態遷移時のリセット処理
   * ON_BALL_PLAYERになった時に呼ばれる
   */
  public onEnterState(): void {
    // targetPositionOverrideは外部から明示的に設定されるのでリセットしない
    // パスレーン調整状態をリセット
    this.passLaneAdjustmentTarget = null;
    this.passLaneAdjustmentTimer = 0;

    // 周囲確認フェーズを開始（ボールを受け取った直後）
    this.surveyPhase = "look_left";
    this.surveyTimer = 0;
    this.surveyTotalTimer = 0;
    this.surveyStartRotation = this.character.getRotation();

    // アイドル時間追跡をリセット
    this.idleTimer = 0;
    this.lastPosition = null;
  }

  /**
   * 全内部状態を強制リセット
   * リセット処理（センターサークル再開等）で使用
   */
  public forceReset(): void {
    // 目標位置オーバーライドをクリア
    this.targetPositionOverride = null;

    // パスレーン調整状態をリセット
    this.passLaneAdjustmentTarget = null;
    this.passLaneAdjustmentTimer = 0;

    // 周囲確認フェーズを完全にリセット
    this.surveyPhase = "none";
    this.surveyTimer = 0;
    this.surveyTotalTimer = 0;
    this.surveyStartRotation = 0;

    // アイドル時間追跡をリセット
    this.idleTimer = 0;
    this.lastPosition = null;
  }

  /**
   * 状態から離れる時のリセット処理
   * ON_BALL_PLAYERから別の状態になる時に呼ばれる
   */
  public onExitState(): void {
    // 目標位置オーバーライドをクリア（スローイン等の一時的な設定をリセット）
    this.targetPositionOverride = null;
    // パスレーン調整状態をリセット
    this.passLaneAdjustmentTarget = null;
    this.passLaneAdjustmentTimer = 0;
    // 周囲確認フェーズをリセット
    this.surveyPhase = "none";
    this.surveyTimer = 0;
    this.surveyTotalTimer = 0;
    // アイドル時間追跡をリセット
    this.idleTimer = 0;
    this.lastPosition = null;
  }

  // ==============================
  // ユーティリティメソッド
  // ==============================

  /**
   * shotPriority に応じたシュート積極性の減衰係数を返す
   * 1（ファーストチョイス）=1.0, 5（フィフスチョイス）=0.15
   */
  private getShotPriorityDampening(): number {
    switch (this.character.shotPriority) {
      case 1:  return 1.0;
      case 2:  return 0.7;
      case 3:  return 0.5;
      case 4:  return 0.3;
      case 5:  return 0.15;
      default: return 0.5; // null・未設定
    }
  }

  /**
   * ポジション別行動パラメータを取得（キャッシュ付き）
   */
  protected getPositionBehaviorParams(): PositionBehaviorParams {
    const currentPosition = this.character.playerPosition as PlayerPosition | undefined;

    if (this.cachedPositionBehavior && this.cachedPlayerPosition === currentPosition) {
      return this.cachedPositionBehavior;
    }

    this.cachedPlayerPosition = currentPosition;
    this.cachedPositionBehavior = getPositionBehavior(currentPosition);
    return this.cachedPositionBehavior;
  }

  /**
   * 目標位置を取得（オーバーライドがあればそれを、なければゴール位置を返す）
   */
  protected getTargetPosition(): Vector3 {
    if (this.targetPositionOverride) {
      return this.targetPositionOverride;
    }
    return this.field.getAttackingBackboard(this.character.team);
  }

  /**
   * ゴール方向の経路上にディフェンダーがいるかチェック
   * ボールハンドラーとゴールの間にいるディフェンダーのみを検出
   * @param targetPosition ゴール位置
   * @returns 経路上のディフェンダー（いなければnull）
   */
  protected findDefenderInPathToGoal(targetPosition: Vector3): Character | null {
    const myPosition = this.character.getPosition();
    const toGoal = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );
    const distanceToGoal = toGoal.length();

    if (distanceToGoal < 0.1) {
      return null;
    }

    const goalDirection = toGoal.normalize();

    // 相手チームの選手を取得
    const opponents = getOpponents(this.allCharacters, this.character);

    let closestDefender: Character | null = null;
    let closestDistance = Infinity;

    // 経路の幅（この範囲内にいるディフェンダーをチェック）
    const pathWidth = 2.5; // メートル

    for (const opponent of opponents) {
      const opponentPos = opponent.getPosition();
      const toOpponent = new Vector3(
        opponentPos.x - myPosition.x,
        0,
        opponentPos.z - myPosition.z
      );

      // ゴール方向への射影距離（前方にいるかどうか）
      const forwardDistance = Vector3.Dot(toOpponent, goalDirection);

      // 前方にいない（後ろにいる）ならスキップ
      if (forwardDistance < 0.5) {
        continue;
      }

      // ゴールより遠くにいるならスキップ
      if (forwardDistance > distanceToGoal) {
        continue;
      }

      // 経路からの横方向の距離を計算
      const lateralDistance = Math.abs(
        toOpponent.x * (-goalDirection.z) + toOpponent.z * goalDirection.x
      );

      // 経路幅の範囲内にいるかチェック
      if (lateralDistance > pathWidth) {
        continue;
      }

      // 最も近いディフェンダーを記録
      if (forwardDistance < closestDistance) {
        closestDistance = forwardDistance;
        closestDefender = opponent;
      }
    }

    return closestDefender;
  }

  /**
   * ショットクロック残り時間を取得
   * @returns 残り秒数（コントローラー未設定時は24.0）
   */
  protected getShotClockRemainingTime(): number {
    return this.shotClockController?.getRemainingTime() ?? 24.0;
  }

  /**
   * 周囲確認フェーズの更新
   * ボールを受け取った直後に左右を確認し、最後にゴール方向を向く
   */
  protected updateSurveyPhase(deltaTime: number): void {
    this.surveyTimer += deltaTime;
    this.surveyTotalTimer += deltaTime;

    // 安全チェック: 周囲確認が最大時間を超えた場合は強制終了
    if (this.surveyTotalTimer >= this.SURVEY_MAX_TOTAL_TIME) {
      // 強制終了時もゴール方向を向く
      const targetPosition = this.getTargetPosition();
      const myPosition = this.character.getPosition();
      const toGoal = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);
      if (toGoal.length() > 0.01) {
        const goalAngle = Math.atan2(toGoal.x, toGoal.z);
        this.character.setRotation(goalAngle);
      }
      this.surveyPhase = "none";
      this.surveyTimer = 0;
      this.surveyTotalTimer = 0;
      return;
    }

    // ドリブル構えモーションを維持
    if (this.character.getCurrentMotionName() !== "dribble_stance") {
      this.character.playMotion(DRIBBLE_STANCE_MOTION);
    }
    // AI移動をクリア（OneOnOneBattleController等との競合を防ぐ）
    this.character.clearAIMovement();
    // 移動を停止
    this.character.stopMovement();

    const targetPosition = this.getTargetPosition();
    const myPosition = this.character.getPosition();

    // ゴール方向の角度を計算
    const toGoal = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);
    const goalAngle = toGoal.length() > 0.01 ? Math.atan2(toGoal.x, toGoal.z) : this.surveyStartRotation;

    switch (this.surveyPhase) {
      case "look_left":
        // 左を見る（開始回転から左に回転）
        {
          const progress = Math.min(this.surveyTimer / this.SURVEY_LOOK_DURATION, 1.0);
          const targetAngle = this.surveyStartRotation + this.SURVEY_LOOK_ANGLE;
          const currentAngle = this.surveyStartRotation + (targetAngle - this.surveyStartRotation) * progress;
          this.character.setRotation(currentAngle);

          if (this.surveyTimer >= this.SURVEY_LOOK_DURATION) {
            this.surveyPhase = "look_right";
            this.surveyTimer = 0;
          }
        }
        break;

      case "look_right":
        // 右を見る（左からさらに右へ大きく回転）
        {
          const progress = Math.min(this.surveyTimer / this.SURVEY_LOOK_DURATION, 1.0);
          const startAngle = this.surveyStartRotation + this.SURVEY_LOOK_ANGLE;
          const targetAngle = this.surveyStartRotation - this.SURVEY_LOOK_ANGLE;
          const currentAngle = startAngle + (targetAngle - startAngle) * progress;
          this.character.setRotation(currentAngle);

          if (this.surveyTimer >= this.SURVEY_LOOK_DURATION) {
            this.surveyPhase = "face_goal";
            this.surveyTimer = 0;
          }
        }
        break;

      case "face_goal":
        // ゴール方向を向く
        {
          const progress = Math.min(this.surveyTimer / this.SURVEY_FACE_GOAL_DURATION, 1.0);
          const startAngle = this.surveyStartRotation - this.SURVEY_LOOK_ANGLE;
          // 角度の差分を正規化して最短経路で回転
          const angleDiff = normalizeAngle(goalAngle - startAngle);
          const currentAngle = startAngle + angleDiff * progress;
          this.character.setRotation(currentAngle);

          if (this.surveyTimer >= this.SURVEY_FACE_GOAL_DURATION) {
            this.surveyPhase = "none";
            this.surveyTimer = 0;
            // 最終的にゴール方向を確実に向く
            this.character.setRotation(goalAngle);
          }
        }
        break;
    }
  }

  /**
   * アイドル時間追跡の更新
   * 位置がほぼ変わっていない場合にアイドル時間を加算
   */
  protected updateIdleTracking(deltaTime: number): void {
    const currentPosition = this.character.getPosition();

    if (this.lastPosition) {
      const distance = Vector3.Distance(currentPosition, this.lastPosition);
      if (distance < this.IDLE_POSITION_THRESHOLD) {
        // 静止状態
        this.idleTimer += deltaTime;
      } else {
        // 移動中
        this.idleTimer = 0;
      }
    }

    // 現在位置を記録
    this.lastPosition = currentPosition.clone();
  }

  // ==============================
  // アクション実行メソッド
  // ==============================

  /**
   * シュートを試みる
   * @param aggressivenessBoost 積極性ブースト（0.0〜1.0、CRITICAL時に1.0で確率無視）
   * @returns シュートを打った場合true
   */
  protected tryShoot(aggressivenessBoost: number = 0): boolean {
    // ShootingControllerがない場合はスキップ
    if (!this.shootingController) {
      return false;
    }

    // クールダウン中はスキップ（ShootingController側でチェック）
    if (!this.shootingController.canShoot(this.character)) {
      return false;
    }

    // ゴールまでの距離を計算（向きに関係なく）
    // 攻めるべきゴールを取得（allyは+Z側のgoal1、enemyは-Z側のgoal2）
    const goalPosition = this.field.getAttackingGoalRim(this.character.team);
    const myPos = this.character.getPosition();
    const distanceToGoal = getDistance2D(myPos, goalPosition);

    // ShootingUtilsを使用してレンジ判定
    if (!ShootingUtils.isInShootRange(distanceToGoal)) {
      return false;
    }

    // シュートレンジ内に入ったらゴール方向を向く
    const angle = Math.atan2(goalPosition.x - myPos.x, goalPosition.z - myPos.z);
    this.character.setRotation(angle);

    // ダンクレンジ内かどうかを確認（forceDunk=true で確認）
    const isDunkRange = distanceToGoal <= 3.5; // DUNK_MAX_EXTENDED

    // 向きを変えた後、正式にチェック（ダンクレンジ内ならforceDunk=true）
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character, isDunkRange);

    if (!rangeInfo.inRange || !rangeInfo.facingGoal) {
      return false;
    }

    // ポジション別行動パラメータを取得
    const positionBehavior = this.getPositionBehaviorParams();

    // シュートタイプに応じたポジション別積極性を取得
    const baseAggressiveness = rangeInfo.shootType
      ? getShootAggressiveness(positionBehavior, rangeInfo.shootType)
      : 0.5;

    // shotPriority に応じた減衰係数を適用（1=ファースト→1.0, 5=フィフス→0.15）
    const priorityDampening = this.getShotPriorityDampening();
    const shootAggressiveness = baseAggressiveness * priorityDampening;

    // 減衰後の積極性 + ブースト（CRITICAL時のboost=1.0で全員シュート可能）
    const boostedAggressiveness = Math.min(shootAggressiveness + aggressivenessBoost, 1.0);
    let shouldShoot = false;

    switch (rangeInfo.shootType) {
      case "3pt":
      case "midrange":
        // 外からのシュートはポジション別の積極性に基づいて判断
        // 積極性が低いポジション（C等）は外からは打ちにくい
        shouldShoot = Math.random() < boostedAggressiveness;
        break;
      case "layup":
      case "dunk":
        // インサイドシュートは積極性を高めに設定
        // ゴール下では全ポジションが積極的にシュート
        shouldShoot = Math.random() < Math.max(boostedAggressiveness, 0.8);
        break;
    }

    if (shouldShoot) {
      // シュート実行（ダンクレンジ内ならforceDunk=true）
      // クールダウンはShootingController.startShootAction内で自動記録
      const result = this.shootingController.startShootAction(this.character, isDunkRange);
      if (result.success) {
        return true;
      }
    }

    return false;
  }

  /**
   * ロール別行動: メインハンドラー以外が3Pライン外でボールを持った場合、
   * 高確率でメインハンドラーにパスを返す
   * @returns パスを実行した場合true
   */
  protected tryRoleBasedPassToMainHandler(): boolean {
    // メインハンドラー自身は対象外
    if (this.character.offenseRole === OffenseRole.MAIN_HANDLER) {
      return false;
    }

    // PassControllerがない場合は実行不可
    if (!this.passController) {
      return false;
    }

    // パスクールダウン中は実行不可
    if (!this.passController.canPass(this.character)) {
      return false;
    }

    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    // 3Pライン外かチェック（ゴールからの距離）
    const myPos = this.character.getPosition();
    const goalPosition = this.field.getAttackingGoalRim(this.character.team);
    const distanceToGoal = getDistance2D(myPos, goalPosition);

    if (distanceToGoal <= SHOOT_RANGE.THREE_POINT_LINE) {
      return false; // 3Pライン内なので通常行動
    }

    // 90%の確率でメインハンドラーにパスを返す
    if (Math.random() > 0.9) {
      return false; // 10%は通常行動へ
    }

    // PlayerStateManagerからメインハンドラーを探す
    if (this.playerState) {
      const mainHandler = this.playerState.getMainHandler(this.character.team);
      if (mainHandler && mainHandler.character !== this.character) {
        // パスレーンの安全性チェック
        const teammatePos = mainHandler.character.getPosition();
        const distance = Vector3.Distance(myPos, teammatePos);

        if (PassUtils.isPassableDistance(distance)) {
          // メインハンドラーの方を向く
          const toTarget = new Vector3(teammatePos.x - myPos.x, 0, teammatePos.z - myPos.z);
          if (toTarget.length() > 0.01) {
            const angle = Math.atan2(toTarget.x, toTarget.z);
            this.character.setRotation(angle);
          }

          const result = this.passController.performPass(this.character, mainHandler.character, "pass_chest");
          if (result.success) {
            return true;
          }
        }
      }
    }

    // PlayerStateManagerがない場合やメインハンドラーが見つからない場合、
    // allCharactersからメインハンドラーを探す
    const teammates = getTeammates(this.allCharacters, this.character);
    for (const teammate of teammates) {
      if (teammate.offenseRole === OffenseRole.MAIN_HANDLER) {
        const teammatePos = teammate.getPosition();
        const distance = Vector3.Distance(myPos, teammatePos);

        if (PassUtils.isPassableDistance(distance)) {
          // メインハンドラーの方を向く
          const toTarget = new Vector3(teammatePos.x - myPos.x, 0, teammatePos.z - myPos.z);
          if (toTarget.length() > 0.01) {
            const angle = Math.atan2(toTarget.x, toTarget.z);
            this.character.setRotation(angle);
          }

          const result = this.passController.performPass(this.character, teammate, "pass_chest");
          if (result.success) {
            return true;
          }
        }
        break; // メインハンドラーは1人なので見つかったら終了
      }
    }

    return false;
  }

  /**
   * 3Pエリア付近でのショットプライオリティベースのアクション
   * shotPriority順（1=ファーストチョイス）にパスを試み、
   * 自分がファーストチョイスの場合はシュートを試みる
   * @returns アクションを実行した場合true
   */
  protected tryShotPriorityAction(): boolean {
    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    // 3Pエリア付近かチェック（ゴールからの距離）
    const myPos = this.character.getPosition();
    const goalPosition = this.field.getAttackingGoalRim(this.character.team);
    const distanceToGoal = getDistance2D(myPos, goalPosition);

    // 3Pエリア付近の範囲（3Pライン手前1.5m〜3P最大距離）
    const threePointNearMin = SHOOT_RANGE.THREE_POINT_LINE - 1.5;
    if (distanceToGoal < threePointNearMin || distanceToGoal > SHOOT_RANGE.THREE_POINT_MAX) {
      return false;
    }

    const myShotPriority = this.character.shotPriority;

    // 自分がファーストチョイスの場合はシュートを試みる
    if (myShotPriority === 1) {
      return this.tryShoot();
    }

    // PassControllerがない場合は実行不可
    if (!this.passController) {
      return false;
    }

    // パスクールダウン中は実行不可
    if (!this.passController.canPass(this.character)) {
      return false;
    }

    // パスレーン分析
    const passLaneAnalysis = this.riskAssessment!.assessAllPassLanes(this.character);

    // チームメイトをshotPriority順にソート（1=最優先、null=末尾）
    const teammates = getTeammates(this.allCharacters, this.character);
    const sortedTeammates = [...teammates].sort((a, b) => {
      const pa = a.shotPriority ?? 999;
      const pb = b.shotPriority ?? 999;
      return pa - pb;
    });

    // shotPriority順にパスを試みる
    for (const teammate of sortedTeammates) {
      // shotPriorityが未設定の選手はスキップ
      if (teammate.shotPriority == null) {
        continue;
      }

      const teammatePos = teammate.getPosition();
      const distance = Vector3.Distance(myPos, teammatePos);

      // パス可能距離かチェック
      if (!PassUtils.isPassableDistance(distance)) {
        continue;
      }

      // パスレーンのリスクチェック
      const laneInfo = passLaneAnalysis.find(a => a.teammate === teammate);
      if (laneInfo && laneInfo.risk > this.maxPassLaneRisk + 0.3) {
        continue;
      }

      // パスターゲットの方を向く
      const toTarget = new Vector3(teammatePos.x - myPos.x, 0, teammatePos.z - myPos.z);
      if (toTarget.length() > 0.01) {
        const angle = Math.atan2(toTarget.x, toTarget.z);
        this.character.setRotation(angle);
      }

      // パス実行
      const result = this.passController.performPass(this.character, teammate, "pass_chest");
      if (result.success) {
        return true;
      }
    }

    return false;
  }

  /**
   * ペイントエリア内でのシュート（レイアップ/ダンク）を試みる
   * ペイントエリアに侵入したら積極的にシュートを狙う
   * @param deltaTime フレーム経過時間
   * @returns シュートを打った場合true
   */
  protected tryPaintAreaShot(deltaTime: number): boolean {
    // ShootingControllerがない場合はスキップ
    if (!this.shootingController) {
      return false;
    }

    // クールダウン中はスキップ（ShootingController側でチェック）
    if (!this.shootingController.canShoot(this.character)) {
      return false;
    }

    // 自分の位置を取得
    const myPos = this.character.getPosition();

    // 攻めるべきゴールの方向を確認（allyは+Z側を攻める）
    const isAttackingPositiveZ = this.character.team === "ally";

    // ペイントエリア内かチェック（攻めている側のペイントエリア）
    if (!isInPaintArea({ x: myPos.x, z: myPos.z }, isAttackingPositiveZ)) {
      return false;
    }

    // ペイントエリア内にいる - レイアップ/ダンクを狙う
    const goalPosition = this.field.getAttackingGoalRim(this.character.team);

    // ゴール方向を向く
    const angle = Math.atan2(goalPosition.x - myPos.x, goalPosition.z - myPos.z);
    this.character.setRotation(angle);

    // シュート情報を取得（forceDunk=true でダンクも検出）
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character, true);

    // レイアップ/ダンクレンジ内ならシュート
    if (rangeInfo.inRange && rangeInfo.facingGoal) {
      // forceDunk=true でダンクモーションを含めて実行
      // クールダウンはShootingController.startShootAction内で自動記録
      const result = this.shootingController.startShootAction(this.character, true);
      if (result.success) {
        return true;
      }
    }

    // シュートレンジ内でなくても、ペイントエリア内ならゴールに向かって突進
    // （ゴールに近づいてレイアップレンジに入る）
    const toGoal = new Vector3(goalPosition.x - myPos.x, 0, goalPosition.z - myPos.z);
    const distanceToGoal = toGoal.length();

    if (distanceToGoal > 0.5) {
      // ダッシュモーションで突進
      if (this.character.getCurrentMotionName() !== "dash_forward") {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }

      // 境界チェックのみ行い、全速力でゴールへ
      const direction = toGoal.normalize();
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

      if (boundaryAdjusted) {
        this.character.move(boundaryAdjusted, deltaTime);
      } else {
        this.character.move(direction, deltaTime);
      }
      return true;
    }

    return false;
  }

  /**
   * シュートフェイントを試みる
   * 条件: ボールが0面にある、シュートレンジ内（または目標位置オーバーライド時）、フェイントクールダウン終了
   * 条件合致時に確率でフェイントを選択
   * @returns フェイントを実行した場合true
   */
  protected tryFeint(): boolean {
    // FeintControllerがない場合は実行不可
    if (!this.feintController) {
      return false;
    }

    // フェイントクールダウンはFeintController側でチェック済み

    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    // ボールが0面にあるか確認
    const currentBallFace = this.character.getCurrentBallFace();
    if (currentBallFace !== 0) {
      return false;
    }

    // 目標位置オーバーライド時はシュートレンジチェックをスキップ
    if (!this.targetPositionOverride) {
      // シュートレンジ内か確認
      if (!this.shootingController) {
        return false;
      }

      const rangeInfo = this.shootingController.getShootRangeInfo(this.character);
      if (!rangeInfo || !rangeInfo.inRange) {
        return false;
      }
    }

    // 条件が揃った場合、確率でフェイントを選択
    // 目標位置オーバーライド時は30%、通常時は50%
    const feintChance = this.targetPositionOverride ? 0.3 : 0.5;
    if (Math.random() > feintChance) {
      return false; // フェイントを選択しなかった
    }

    // フェイント実行（クールダウンはFeintController側で自動管理）
    const result = this.feintController.performShootFeint(this.character);
    if (result && result.success) {
      return true;
    }

    return false;
  }

  /**
   * フェイント成功後のドリブル突破を試みる
   * @returns ドリブル突破を実行した場合true
   */
  protected tryBreakthroughAfterFeint(): boolean {
    if (!this.feintController) {
      return false;
    }

    // ドリブル突破方向をランダムに決定（左か右）
    const direction = Math.random() < 0.5 ? "left" : "right";

    return this.feintController.performBreakthroughAfterFeint(this.character, direction);
  }

  /**
   * ドリブルムーブを試みる
   * @returns ドリブルムーブを実行した場合true
   */
  protected tryDribbleMove(): boolean {
    if (!this.dribbleController) {
      return false;
    }

    return this.dribbleController.performDribbleBreakthrough(this.character);
  }

  /**
   * パスを試みる
   * 優先順位:
   * 1. ゴール下にいるチームメイト（得点チャンス）
   * 2. フリーのチームメイト（パスレーンが安全）
   * 3. 最もゴールに近いチームメイト
   * @returns パスを実行した場合true
   */
  protected tryPass(): boolean {
    // PassControllerがない場合は実行不可
    if (!this.passController) {
      return false;
    }

    // パスクールダウン中は実行不可
    if (!this.passController.canPass(this.character)) {
      return false;
    }

    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    // ポジション別行動パラメータを取得
    const positionBehavior = this.getPositionBehaviorParams();

    // パス優先度に基づいてパスするかどうかを判断
    // passPriority が低いポジション（SG等）はパスを控える傾向
    // ただし、良いパスチャンスがあれば実行する
    const passCheckRoll = Math.random();
    const shouldAttemptPass = passCheckRoll < positionBehavior.passPriority + 0.3; // +0.3で最低限のチャンス確保

    if (!shouldAttemptPass) {
      return false;
    }

    const myPos = this.character.getPosition();

    // 攻めるべきゴールを取得
    const goalPosition = this.field.getAttackingGoalRim(this.character.team);

    // 自分がゴール下にいる場合はパスより得点を優先（パスしない）
    const amINearGoal = PassUtils.isNearGoal({x: myPos.x, z: myPos.z}, {x: goalPosition.x, z: goalPosition.z});
    if (amINearGoal) {
      return false;
    }

    // パスリスク許容度を取得
    const maxRiskTolerance = positionBehavior.maxPassRiskTolerance;

    // パス候補を評価
    const passLaneAnalysis = this.riskAssessment!.assessAllPassLanes(this.character);
    const passableCandidates: Array<{
      teammate: Character;
      risk: number;
      distanceToGoal: number;
      isNearGoal: boolean;
      isInsidePlayer: boolean;
    }> = [];

    for (const analysis of passLaneAnalysis) {
      const teammatePos = analysis.teammate.getPosition();
      const distance = Vector3.Distance(myPos, teammatePos);

      // パス可能距離かチェック
      if (!PassUtils.isPassableDistance(distance)) {
        continue;
      }

      // パスレーンのリスクが許容度を超える場合はスキップ
      if (analysis.risk > maxRiskTolerance + 0.2) {
        continue;
      }

      const distanceToGoal = Vector3.Distance(teammatePos, goalPosition);
      const isNearGoal = PassUtils.isNearGoal({x: teammatePos.x, z: teammatePos.z}, {x: goalPosition.x, z: goalPosition.z});

      // インサイドプレイヤー（PF, C）かどうか
      const teammatePosition = analysis.teammate.playerPosition as PlayerPosition | undefined;
      const isInsidePlayer = teammatePosition === "PF" || teammatePosition === "C";

      passableCandidates.push({
        teammate: analysis.teammate,
        risk: analysis.risk,
        distanceToGoal,
        isNearGoal,
        isInsidePlayer,
      });
    }

    if (passableCandidates.length === 0) {
      return false;
    }

    // パス先を選択（優先順位: ゴール下 > インサイドプレイヤー > 低リスク > ゴールに近い）
    let passTarget: Character | null = null;

    // 1. ゴール下にいるチームメイトを優先
    const nearGoalCandidates = passableCandidates.filter((c) => c.isNearGoal);
    if (nearGoalCandidates.length > 0) {
      // 最もリスクが低いものを選択
      nearGoalCandidates.sort((a, b) => a.risk - b.risk);
      passTarget = nearGoalCandidates[0].teammate;
    }

    // 2. インサイドプレイヤーへのパスを優先（insidePassPriorityに基づく）
    if (!passTarget && positionBehavior.insidePassPriority > 0.5) {
      const insideCandidates = passableCandidates.filter((c) => c.isInsidePlayer);
      if (insideCandidates.length > 0) {
        // リスクでソート
        insideCandidates.sort((a, b) => a.risk - b.risk);
        // insidePassPriority確率でインサイドを選択
        if (Math.random() < positionBehavior.insidePassPriority) {
          passTarget = insideCandidates[0].teammate;
        }
      }
    }

    // 3. それでも決まらなければ、低リスクでゴールに近いチームメイト
    if (!passTarget) {
      // リスクでソート、同じならゴールに近い方
      passableCandidates.sort((a, b) => {
        if (Math.abs(a.risk - b.risk) < 0.1) {
          return a.distanceToGoal - b.distanceToGoal;
        }
        return a.risk - b.risk;
      });
      passTarget = passableCandidates[0].teammate;
    }

    if (!passTarget) {
      return false;
    }

    // パスターゲットの方を向く
    const targetPos = passTarget.getPosition();
    const toTarget = new Vector3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
    if (toTarget.length() > 0.01) {
      const angle = Math.atan2(toTarget.x, toTarget.z);
      this.character.setRotation(angle);
    }

    // パス実行（PassController経由）
    // クールダウンはPassController.performPass内で自動記録
    const result = this.passController.performPass(this.character, passTarget, "pass_chest");
    if (result.success) {
      return true;
    }

    return false;
  }

  /**
   * 3秒以上静止状態の場合に強制的に行動を選択
   * 優先順位: シュート > パス > ドリブル突破
   * @returns 行動を実行した場合true
   */
  protected tryForceActionWhenIdle(): boolean {
    // シュートを試みる（目標位置オーバーライド時以外）
    if (!this.targetPositionOverride && this.tryShoot()) {
      return true;
    }

    // パスを試みる（目標位置オーバーライド時以外）
    if (!this.targetPositionOverride && this.tryPass()) {
      return true;
    }

    // ドリブル突破を試みる
    if (this.tryDribbleMove()) {
      return true;
    }

    // どの行動も実行できなかった場合、目標に向かってダッシュ
    const targetPosition = this.getTargetPosition();
    const myPosition = this.character.getPosition();
    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    if (toTarget.length() > 0.5) {
      // ダッシュモーションで前進
      if (this.character.getCurrentMotionName() !== "dash_forward") {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }

      const direction = toTarget.normalize();
      this.character.move(direction, 0.016); // 1フレーム分移動
      return true;
    }

    return false;
  }

  /**
   * パスレーン確保のための移動を実行
   */
  protected moveToCreatePassLane(deltaTime: number): boolean {
    // 再評価タイマーを更新
    this.passLaneAdjustmentTimer += deltaTime;

    if (this.passLaneAdjustmentTimer >= this.passLaneReevaluateInterval) {
      this.passLaneAdjustmentTimer = 0;
      const adjustmentDir = this.calculatePassLaneAdjustmentDirection();

      if (adjustmentDir) {
        const myPos = this.character.getPosition();
        this.passLaneAdjustmentTarget = myPos.add(adjustmentDir.scale(1.5));
      } else {
        this.passLaneAdjustmentTarget = null;
      }
    }

    if (!this.passLaneAdjustmentTarget) {
      return false;
    }

    const myPos = this.character.getPosition();
    const toTarget = this.passLaneAdjustmentTarget.subtract(myPos);
    toTarget.y = 0;

    if (toTarget.length() < 0.3) {
      this.passLaneAdjustmentTarget = null;
      return false;
    }

    // 移動方向を調整
    const direction = toTarget.normalize();
    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

    if (boundaryAdjusted) {
      const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
      if (adjustedDirection) {
        this.character.move(adjustedDirection.scale(0.6), deltaTime);
        return true;
      }
    }

    return false;
  }

  // ==============================
  // プライベートヘルパーメソッド
  // ==============================

  /**
   * パスレーンを作るための移動方向を計算
   * @returns 移動すべき方向（パスレーンが良好なら null）
   */
  private calculatePassLaneAdjustmentDirection(): Vector3 | null {
    const passLaneAnalysis = this.riskAssessment!.assessAllPassLanes(this.character);

    // いずれかのチームメイトに良いパスレーンがあるか確認
    const hasAnyGoodLane = passLaneAnalysis.some((p) => p.risk <= this.maxPassLaneRisk);

    if (hasAnyGoodLane) {
      return null; // 調整不要
    }

    // 全員のパスレーンが塞がれている場合、移動して開く
    // 最もリスクの低いチームメイトを見つける
    const bestOption = passLaneAnalysis.reduce((best, current) => (current.risk < best.risk ? current : best));

    if (!bestOption || bestOption.risk >= 1.0) {
      return null;
    }

    const myPos = this.character.getPosition();
    const teammatePos = bestOption.teammate.getPosition();

    // パスレーンを塞いでいるディフェンダーを見つける
    const defenders = getOpponents(this.allCharacters, this.character);

    // パスライン上で最も近いディフェンダーを見つける
    let closestDefenderOnLine: Character | null = null;
    let minDistToLine = Infinity;

    for (const defender of defenders) {
      const defPos = defender.getPosition();
      // パスライン上への距離を計算（簡易版）
      const lineDir = new Vector3(teammatePos.x - myPos.x, 0, teammatePos.z - myPos.z).normalize();

      const toDefender = new Vector3(defPos.x - myPos.x, 0, defPos.z - myPos.z);

      // ディフェンダーがパスラインの手前にいるかチェック
      const projLength = Vector3.Dot(toDefender, lineDir);
      if (projLength > 0 && projLength < Vector3.Distance(myPos, teammatePos)) {
        const perpDist = Math.abs(toDefender.x * -lineDir.z + toDefender.z * lineDir.x);

        if (perpDist < 2.0 && perpDist < minDistToLine) {
          minDistToLine = perpDist;
          closestDefenderOnLine = defender;
        }
      }
    }

    if (!closestDefenderOnLine) {
      return null;
    }

    // ディフェンダーの反対側に移動してパスレーンを開く
    const defPos = closestDefenderOnLine.getPosition();
    const toDefender = new Vector3(defPos.x - myPos.x, 0, defPos.z - myPos.z);

    // ディフェンダーと垂直な方向に移動
    const perpDir = new Vector3(-toDefender.z, 0, toDefender.x).normalize();

    // どちらの方向がゴールに近いかで決定
    const goalPos = this.getTargetPosition();
    const testPos1 = myPos.add(perpDir.scale(1.0));
    const testPos2 = myPos.add(perpDir.scale(-1.0));

    const dist1 = Vector3.Distance(testPos1, goalPos);
    const dist2 = Vector3.Distance(testPos2, goalPos);

    return dist1 < dist2 ? perpDir : perpDir.scale(-1);
  }
}
