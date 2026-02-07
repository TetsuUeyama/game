import {Vector3} from "@babylonjs/core";
import {Character} from "../../entities/Character";
import {Ball} from "../../entities/Ball";
import {Field} from "../../entities/Field";
import {BaseStateAI} from "./BaseStateAI";
import {PlayerStateManager} from "../../state";
import {ShootingController} from "../../controllers/action/ShootingController";
import {FeintController} from "../../controllers/action/FeintController";
import {ShotClockController} from "../../controllers/ShotClockController";
import {ShootingUtils} from "../../config/action/ShootingConfig";
import {DefenseUtils} from "../../config/DefenseConfig";
import {PassUtils} from "../../config/PassConfig";
import {IDLE_MOTION} from "../../motion/IdleMotion";
import {DRIBBLE_STANCE_MOTION} from "../../motion/DribbleMotion";
import {DASH_FORWARD_MOTION} from "../../motion/DashMotion";
import {PassTrajectoryCalculator, Vec3} from "../../physics/PassTrajectoryCalculator";
import {InterceptionAnalyzer} from "../analysis/InterceptionAnalyzer";
import {PassType, PASS_TYPE_CONFIGS} from "../../config/PassTrajectoryConfig";
import { normalizeAngle, getDistance2D, getDistance2DSimple } from "../../utils/CollisionUtils";
import { getTeammates, getOpponents } from "../../utils/TeamUtils";
import { isInPaintArea } from "../../config/TacticalZoneConfig";
import {
  PositionBehaviorParams,
  getPositionBehavior,
  getShootAggressiveness,
  get1on1ActionProbabilities,
} from "../config/PositionBehaviorConfig";
import { PlayerPosition } from "../../config/FormationConfig";

/**
 * パス実行時のコールバック型
 */
export type PassCallback = (passer: Character, target: Character, passType: "pass_chest" | "pass_bounce" | "pass_overhead") => {success: boolean; message: string};

/**
 * パスクールダウンチェック用コールバック型
 */
export type PassCanCheckCallback = (passer: Character) => boolean;

/**
 * パスクールダウンリセット用コールバック型
 */
export type PassResetCallback = (character: Character) => void;

/**
 * オンボールオフェンス時のAI
 * ボール保持者として攻撃を組み立てる
 */
export class OnBallOffenseAI extends BaseStateAI {
  private shootingController: ShootingController | null = null;
  private feintController: FeintController | null = null;
  private shotClockController: ShotClockController | null = null;
  private passCallback: PassCallback | null = null;
  private passCanCheckCallback: PassCanCheckCallback | null = null;
  private passResetCallback: PassResetCallback | null = null;

  // シュートクロック残り時間の閾値（この秒数以下でシュート優先）
  private readonly SHOT_CLOCK_URGENT_THRESHOLD: number = 5.0;

  // 目標位置オーバーライド（設定時はゴールではなくこの位置に向かう）
  private targetPositionOverride: Vector3 | null = null;

  // パスレーン分析用
  private trajectoryCalculator: PassTrajectoryCalculator;
  private interceptionAnalyzer: InterceptionAnalyzer;
  private readonly maxPassLaneRisk: number = 0.5; // この確率以下なら安全とみなす
  private passLaneAdjustmentTarget: Vector3 | null = null;
  private passLaneAdjustmentTimer: number = 0;
  private readonly passLaneReevaluateInterval: number = 0.5; // 0.5秒ごとに再評価

  // 周囲確認フェーズ（ボール受け取り直後）
  private surveyPhase: "none" | "look_left" | "look_right" | "face_goal" = "none";
  private surveyTimer: number = 0;
  private surveyTotalTimer: number = 0; // 周囲確認の総経過時間（安全チェック用）
  private surveyStartRotation: number = 0;
  private readonly SURVEY_LOOK_DURATION: number = 0.25; // 左右を見る時間（秒）
  private readonly SURVEY_FACE_GOAL_DURATION: number = 0.2; // ゴール方向を向く時間（秒）
  private readonly SURVEY_LOOK_ANGLE: number = Math.PI / 3; // 左右を見る角度（60度）
  private readonly SURVEY_MAX_TOTAL_TIME: number = 3.0; // 周囲確認の最大時間（秒）- これを超えると強制終了

  // スローインスロワー用の初期化フラグ
  private throwInInitialized: boolean = false;
  // スローインサーベイ完了フラグ（一度完了したら再実行しない）
  private throwInSurveyCompleted: boolean = false;

  // アイドル時間追跡（静止状態が続いた場合に強制行動）
  private idleTimer: number = 0;
  private lastPosition: Vector3 | null = null;
  private readonly IDLE_FORCE_ACTION_THRESHOLD: number = 3.0; // 3秒以上静止で強制行動
  private readonly IDLE_POSITION_THRESHOLD: number = 0.1; // この距離以下の移動は静止とみなす

  // ポジション別行動パラメータ（キャッシュ）
  private cachedPositionBehavior: PositionBehaviorParams | null = null;
  private cachedPlayerPosition: PlayerPosition | undefined = undefined;

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field, playerState?: PlayerStateManager) {
    super(character, ball, allCharacters, field, playerState);
    this.trajectoryCalculator = new PassTrajectoryCalculator();
    this.interceptionAnalyzer = new InterceptionAnalyzer();
  }

  /**
   * ShootingControllerを設定
   */
  public setShootingController(controller: ShootingController): void {
    this.shootingController = controller;
  }

  /**
   * FeintControllerを設定
   */
  public setFeintController(controller: FeintController): void {
    this.feintController = controller;
  }

  /**
   * ShotClockControllerを設定
   */
  public setShotClockController(controller: ShotClockController): void {
    this.shotClockController = controller;
  }

  /**
   * パスコールバックを設定
   */
  public setPassCallback(callback: PassCallback): void {
    this.passCallback = callback;
  }

  /**
   * パスクールダウンチェック用コールバックを設定
   */
  public setPassCanCheckCallback(callback: PassCanCheckCallback): void {
    this.passCanCheckCallback = callback;
  }

  /**
   * パスクールダウンリセット用コールバックを設定
   */
  public setPassResetCallback(callback: PassResetCallback): void {
    this.passResetCallback = callback;
  }

  /**
   * 目標位置オーバーライドを設定
   * 設定するとゴールではなくこの位置に向かい、シュートは行わない
   */
  public setTargetPositionOverride(position: Vector3 | null): void {
    this.targetPositionOverride = position;
  }

  /**
   * 目標位置オーバーライドをクリア
   */
  public clearTargetPositionOverride(): void {
    this.targetPositionOverride = null;
  }

  /**
   * 状態遷移時のリセット処理
   * ON_BALL_PLAYERになった時に呼ばれる
   */
  public onEnterState(): void {
    // targetPositionOverrideは外部から明示的に設定されるのでリセットしない
    // パスレーン調整状態をリセット
    this.passLaneAdjustmentTarget = null;
    this.passLaneAdjustmentTimer = 0;

    // クールダウンをリセット（各Controller側）
    this.shootingController?.resetCooldown(this.character);
    this.feintController?.resetCooldown(this.character);
    if (this.passResetCallback) {
      this.passResetCallback(this.character);
    }

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
   * ポジション別行動パラメータを取得（キャッシュ付き）
   */
  private getPositionBehaviorParams(): PositionBehaviorParams {
    const currentPosition = this.character.playerPosition as PlayerPosition | undefined;

    // ポジションが変わっていなければキャッシュを返す
    if (this.cachedPositionBehavior && this.cachedPlayerPosition === currentPosition) {
      return this.cachedPositionBehavior;
    }

    // 新しいパラメータを取得してキャッシュ
    this.cachedPlayerPosition = currentPosition;
    this.cachedPositionBehavior = getPositionBehavior(currentPosition);
    return this.cachedPositionBehavior;
  }

  /**
   * 全内部状態を強制リセット
   * リセット処理（センターサークル再開等）で使用
   */
  public forceReset(): void {
    // クールダウンをリセット（各Controller側）
    this.shootingController?.resetCooldown(this.character);
    this.feintController?.resetCooldown(this.character);
    if (this.passResetCallback) {
      this.passResetCallback(this.character);
    }

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

    // スローイン関連をリセット
    this.throwInInitialized = false;
    this.throwInSurveyCompleted = false;

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

  /**
   * 周囲確認フェーズの更新
   * ボールを受け取った直後に左右を確認し、最後にゴール方向を向く
   */
  private updateSurveyPhase(deltaTime: number): void {
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
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // スローインスロワーの場合は特別な処理
    if (this.character.getIsThrowInThrower()) {
      this.updateThrowInThrower(deltaTime);
      return;
    } else if (this.throwInInitialized) {
      // スローインが終了した場合、フラグをリセット
      this.throwInInitialized = false;
      this.throwInSurveyCompleted = false;
    }

    // シュート後、ボールが飛行中の場合はその場でボールを見守る
    if (this.ball.isInFlight()) {
      this.handleWatchShot();
      return;
    }

    // 周囲確認フェーズの処理（ボールを受け取った直後）
    if (this.surveyPhase !== "none") {
      this.updateSurveyPhase(deltaTime);
      return; // 周囲確認中は他の行動をしない
    }

    // ペイントエリア内の場合、レイアップ/ダンクを最優先
    if (!this.targetPositionOverride && this.tryPaintAreaShot(deltaTime)) {
      return;
    }

    // アイドル時間追跡の更新
    this.updateIdleTracking(deltaTime);

    // 3秒以上静止状態の場合は強制行動
    if (this.idleTimer >= this.IDLE_FORCE_ACTION_THRESHOLD) {
      if (this.tryForceActionWhenIdle()) {
        this.idleTimer = 0; // 行動後はリセット
        return;
      }
    }

    // フェイント成功後のドリブル突破ウィンドウ内ならドリブル突破を試みる
    if (this.feintController && this.feintController.isInBreakthroughWindow(this.character)) {
      if (this.tryBreakthroughAfterFeint()) {
        return;
      }
    }

    // 目標位置を決定（オーバーライドがあればそれを使用、なければゴール）
    const targetPosition = this.getTargetPosition();
    const myPosition = this.character.getPosition();


    // 【最優先】常にゴール方向を向く
    const toGoal = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);
    if (toGoal.length() > 0.01) {
      const goalAngle = Math.atan2(toGoal.x, toGoal.z);
      this.character.setRotation(goalAngle);
    }

    // シュートクロック残り時間が少ない場合は最優先でシュートを試みる
    if (!this.targetPositionOverride && this.isShotClockUrgent()) {
      if (this.tryShoot()) {
        return;
      }
    }

    // ゴール方向にディフェンダーがいるかチェック
    const defenderInPath = this.findDefenderInPathToGoal(targetPosition);

    if (defenderInPath) {
      const defenderPosition = defenderInPath.getPosition();

      // 視野ベースで1on1状態を判定
      // オフェンスプレイヤーの視野内にディフェンダーがいるかどうか
      const isDefenderInFOV = DefenseUtils.is1on1StateByFieldOfView({x: myPosition.x, z: myPosition.z}, this.character.getRotation(), {x: defenderPosition.x, z: defenderPosition.z});

      if (isDefenderInFOV) {
        // ========================================
        // 1on1状態（ディフェンダーが視野内）
        // ========================================
        this.handle1on1State(targetPosition, deltaTime);
        return;
      } else {
        // ========================================
        // ディフェンダーが視野外に外れた瞬間
        // → ダッシュでゴールへ向かう OR シュートを狙う
        // ========================================
        this.handleDefenderOutOfFOV(targetPosition, deltaTime);
        return;
      }
    }

    // ディフェンダーがゴール方向にいない場合 → 積極的にゴールへドライブ

    // まずシュートを試みる（ディフェンダーなしでシュートレンジ内なら打つ）
    // 目標位置オーバーライド時はシュートしない
    if (!this.targetPositionOverride && this.tryShoot()) {
      return;
    }

    // シュートできない場合、パスを試みる
    // 目標位置オーバーライド時はパスしない
    if (!this.targetPositionOverride && this.tryPass()) {
      return;
    }

    // ディフェンダーがいないので、積極的に前進（衝突チェックなしで移動）
    const distanceToTarget = toGoal.length();
    const stopDistance = this.targetPositionOverride ? 0.5 : 1.0; // ゴールにより近づく

    if (distanceToTarget > stopDistance) {
      // ダッシュモーションで前進
      if (this.character.getCurrentMotionName() !== "dash_forward") {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }

      // 境界チェックのみ行う（他キャラクターとの衝突はチェックしない）
      const direction = toGoal.normalize();
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

      // 境界調整後の方向で移動、調整できなくても元の方向で移動を試みる
      const moveDirection = boundaryAdjusted || direction;
      this.character.move(moveDirection, deltaTime);
    } else {
      // 目標に非常に近い場合、再度シュートを試みる
      if (!this.targetPositionOverride && this.tryShoot()) {
        return;
      }
      // それでもシュートできない場合はアイドル
      if (this.character.getCurrentMotionName() !== "idle") {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * 1on1状態（ディフェンダーが視野内）の処理
   * ドリブルモーションを使用し、アクションを実行
   * パスレーンが塞がれている場合は移動してパスコースを作る
   */
  private handle1on1State(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();

    // 1on1時は常にドリブル構えモーションを再生（歩行・アイドル共通）
    if (this.character.getCurrentMotionName() !== "dribble_stance") {
      this.character.playMotion(DRIBBLE_STANCE_MOTION);
    }

    // 目標への方向ベクトル（update()で既に向きは設定済み）
    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    // シュートクロック残り時間が少ない場合は最優先でシュートを試みる
    if (!this.targetPositionOverride && this.isShotClockUrgent()) {
      if (this.tryShoot()) {
        return;
      }
    }

    // 1on1状態: まずパスを試みる（ポジションに応じた判定）
    // ただし目標位置オーバーライド時はパスしない（1on1テスト用）
    if (!this.targetPositionOverride && this.tryPass()) {
      return;
    }

    // パスレーンが塞がれている場合、移動してパスコースを作る
    if (!this.targetPositionOverride && this.moveToCreatePassLane(deltaTime)) {
      return;
    }

    // ポジション別行動パラメータを取得
    const positionBehavior = this.getPositionBehaviorParams();
    const actionProbs = get1on1ActionProbabilities(positionBehavior);

    // シュートレンジ情報を取得
    const rangeInfo = this.shootingController?.getShootRangeInfo(this.character);
    const inShootRange = rangeInfo?.inRange ?? false;
    const shootType = rangeInfo?.shootType;

    // シュートの積極性を取得（シュートタイプに応じて）
    const shootAggressiveness = shootType
      ? getShootAggressiveness(positionBehavior, shootType)
      : positionBehavior.midRangeAggressiveness;

    const actionChoice = Math.random();

    if (inShootRange) {
      // シュートレンジ内：ポジション別の積極性に基づいてシュート判断
      // シュート確率 = shootAggressiveness（ポジション別）
      if (actionChoice < shootAggressiveness) {
        if (!this.targetPositionOverride && this.tryShoot()) {
          return;
        }
      }

      // シュートしなかった場合、残りのアクションを選択
      const remainingChoice = Math.random();
      const normalizedProbs = {
        feint: actionProbs.feint / (actionProbs.feint + actionProbs.drive + actionProbs.wait),
        drive: actionProbs.drive / (actionProbs.feint + actionProbs.drive + actionProbs.wait),
      };

      if (remainingChoice < normalizedProbs.feint) {
        if (this.tryFeint()) {
          return;
        }
      } else if (remainingChoice < normalizedProbs.feint + normalizedProbs.drive) {
        if (this.tryDribbleMove()) {
          return;
        }
      }
      // 残り: 様子見
    } else {
      // シュートレンジ外：ポジション別のアクション確率に基づいて行動
      // ドライブ優先のポジション（SF, PF）は積極的に突破
      if (actionChoice < actionProbs.drive) {
        if (this.tryDribbleMove()) {
          return;
        }
      } else if (actionChoice < actionProbs.drive + actionProbs.feint) {
        if (this.tryFeint()) {
          return;
        }
      }
      // 残り: 積極的に前進（相手を押し下げる）
    }

    // 1on1中も積極的に前進（目標方向に向かいながら相手を押し下げる）
    const distanceToTarget = toTarget.length();

    if (distanceToTarget > 0.5) {
      const direction = toTarget.normalize();
      // 境界チェック・衝突チェックを試みるが、失敗しても移動する
      let moveDirection = direction;
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

      if (boundaryAdjusted) {
        const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
        if (adjustedDirection) {
          moveDirection = adjustedDirection;
        } else {
          // 衝突調整が失敗しても境界調整された方向で移動
          moveDirection = boundaryAdjusted;
        }
      }
      // シュートレンジ内外で速度を変える
      // シュートレンジ外：積極的に前進（通常速度の90%）
      // シュートレンジ内：やや控えめ（通常速度の60%）
      const moveSpeed = inShootRange ? 0.6 : 0.9;
      this.character.move(moveDirection.scale(moveSpeed), deltaTime);
    } else {
      // 目標に非常に近い場合、シュートを試みる
      if (!this.targetPositionOverride && this.tryShoot()) {
        return;
      }
    }
  }

  /**
   * ディフェンダーが視野外に外れた時の処理
   * ダッシュでゴールへ向かうか、シュートレンジならシュート
   */
  private handleDefenderOutOfFOV(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();

    // 目標位置オーバーライド時以外は、まずシュートを試みる
    if (!this.targetPositionOverride && this.tryShoot()) {
      return;
    }

    // ダッシュで目標に向かう（向きはupdate()で既に設定済み）
    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    const distanceToTarget = toTarget.length();

    if (distanceToTarget > 0.5) {
      // ダッシュモーションに切り替え
      if (this.character.getCurrentMotionName() !== "dash_forward") {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }

      // 移動方向を決定（境界チェック・衝突チェックを試みるが、失敗しても移動する）
      const direction = toTarget.normalize();
      let moveDirection = direction;
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);

      if (boundaryAdjusted) {
        const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
        if (adjustedDirection) {
          moveDirection = adjustedDirection;
        } else {
          // 衝突調整が失敗しても境界調整された方向で移動
          moveDirection = boundaryAdjusted;
        }
      }
      // 全速力でダッシュ
      this.character.move(moveDirection, deltaTime);
    } else {
      // 目標に非常に近い場合、シュートを試みる
      if (!this.targetPositionOverride && this.tryShoot()) {
        return;
      }
      // それでもシュートできない場合はアイドル
      if (this.character.getCurrentMotionName() !== "idle") {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * 目標位置を取得（オーバーライドがあればそれを、なければゴール位置を返す）
   */
  private getTargetPosition(): Vector3 {
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
  private findDefenderInPathToGoal(targetPosition: Vector3): Character | null {
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
   * シュートを試みる
   * @returns シュートを打った場合true
   */
  private tryShoot(): boolean {
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
    const shootAggressiveness = rangeInfo.shootType
      ? getShootAggressiveness(positionBehavior, rangeInfo.shootType)
      : 0.5;

    // シュートタイプに応じた処理（rangeInfo.shootTypeを使用）
    // ポジション別の積極性に基づいてシュートするかどうかを判断
    let shouldShoot = false;

    switch (rangeInfo.shootType) {
      case "3pt":
      case "midrange":
        // 外からのシュートはポジション別の積極性に基づいて判断
        // 積極性が低いポジション（C等）は外からは打ちにくい
        shouldShoot = Math.random() < shootAggressiveness;
        break;
      case "layup":
      case "dunk":
        // インサイドシュートは積極性を高めに設定
        // ゴール下では全ポジションが積極的にシュート
        shouldShoot = Math.random() < Math.max(shootAggressiveness, 0.8);
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
   * ペイントエリア内でのシュート（レイアップ/ダンク）を試みる
   * ペイントエリアに侵入したら積極的にシュートを狙う
   * @param deltaTime フレーム経過時間
   * @returns シュートを打った場合true
   */
  private tryPaintAreaShot(deltaTime: number): boolean {
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
  private tryFeint(): boolean {
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
  private tryBreakthroughAfterFeint(): boolean {
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
  private tryDribbleMove(): boolean {
    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    // ドリブル突破アクションを実行
    const actionController = this.character.getActionController();
    const result = actionController.startAction("dribble_breakthrough");

    return result.success;
  }

  /**
   * パスを試みる
   * 優先順位:
   * 1. ゴール下にいるチームメイト（得点チャンス）
   * 2. フリーのチームメイト（パスレーンが安全）
   * 3. 最もゴールに近いチームメイト
   * @returns パスを実行した場合true
   */
  private tryPass(): boolean {
    // パスコールバックがない場合は実行不可
    if (!this.passCallback) {
      return false;
    }

    // パスクールダウン中は実行不可（PlayerActionFacade側でチェック）
    if (this.passCanCheckCallback && !this.passCanCheckCallback(this.character)) {
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
    const passLaneAnalysis = this.analyzeAllPassLanes();
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

    // パス実行（コールバック経由）
    // クールダウンはPlayerActionFacade.performPass内で自動記録
    const result = this.passCallback(this.character, passTarget, "pass_chest");
    if (result.success) {
      return true;
    }

    return false;
  }

  /**
   * 全チームメイトへのパスレーンリスクを計算
   * @returns 各チームメイトへのリスク情報の配列
   */
  private analyzeAllPassLanes(): Array<{
    teammate: Character;
    risk: number;
    hasGoodLane: boolean;
  }> {
    const myPos = this.character.getPosition();
    const myHeight = this.character.config.physical.height;
    const passerVec: Vec3 = {
      x: myPos.x,
      y: myPos.y + myHeight * 0.15,
      z: myPos.z,
    };

    const teammates = getTeammates(this.allCharacters, this.character);

    const results: Array<{
      teammate: Character;
      risk: number;
      hasGoodLane: boolean;
    }> = [];

    for (const teammate of teammates) {
      const teammatePos = teammate.getPosition();
      const teammateHeight = teammate.config.physical.height;
      const receiverVec: Vec3 = {
        x: teammatePos.x,
        y: teammatePos.y + teammateHeight * 0.15,
        z: teammatePos.z,
      };

      // 距離チェック
      const distance = getDistance2DSimple(receiverVec, passerVec);

      const chestConfig = PASS_TYPE_CONFIGS[PassType.CHEST];
      const bounceConfig = PASS_TYPE_CONFIGS[PassType.BOUNCE];

      // パス可能な距離かチェック
      const inChestRange = distance >= chestConfig.minDistance && distance <= chestConfig.maxDistance;
      const inBounceRange = distance >= bounceConfig.minDistance && distance <= bounceConfig.maxDistance;

      if (!inChestRange && !inBounceRange) {
        results.push({teammate, risk: 1.0, hasGoodLane: false});
        continue;
      }

      // チェストパスとバウンスパスのリスクを計算
      let minRisk = 1.0;

      if (inChestRange) {
        const chestTrajectory = this.trajectoryCalculator.calculateTrajectory(passerVec, receiverVec, PassType.CHEST, 20);
        if (chestTrajectory) {
          const analysis = this.interceptionAnalyzer.analyzeTrajectoryRisk(chestTrajectory, this.allCharacters, this.character.team);
          minRisk = Math.min(minRisk, analysis.maxRisk?.probability ?? 0);
        }
      }

      if (inBounceRange) {
        const bounceTrajectory = this.trajectoryCalculator.calculateTrajectory(passerVec, receiverVec, PassType.BOUNCE, 20);
        if (bounceTrajectory) {
          const analysis = this.interceptionAnalyzer.analyzeTrajectoryRisk(bounceTrajectory, this.allCharacters, this.character.team);
          minRisk = Math.min(minRisk, analysis.maxRisk?.probability ?? 0);
        }
      }

      results.push({
        teammate,
        risk: minRisk,
        hasGoodLane: minRisk <= this.maxPassLaneRisk,
      });
    }

    return results;
  }

  /**
   * パスレーンを作るための移動方向を計算
   * @returns 移動すべき方向（パスレーンが良好なら null）
   */
  private calculatePassLaneAdjustmentDirection(): Vector3 | null {
    const passLaneAnalysis = this.analyzeAllPassLanes();

    // いずれかのチームメイトに良いパスレーンがあるか確認
    const hasAnyGoodLane = passLaneAnalysis.some((p) => p.hasGoodLane);

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

  /**
   * スローインスロワー用の更新処理
   * 移動はできないが、向きの変更とパスは可能
   * 4人のチームメイト全員がパス対象
   */
  private updateThrowInThrower(deltaTime: number): void {
    const myPos = this.character.getPosition();

    // 移動を完全に停止
    this.character.stopMovement();
    this.character.clearAIMovement();

    // スローイン用の初期化（初回のみ）
    if (!this.throwInInitialized) {
      this.throwInInitialized = true;
      this.surveyPhase = "look_left";
      this.surveyTimer = 0;
      this.surveyTotalTimer = 0;
      this.surveyStartRotation = this.character.getRotation();
      // パスクールダウンをリセット
      if (this.passResetCallback) {
        this.passResetCallback(this.character);
      }
    }

    // 周囲確認フェーズの処理（スロー前に周囲を確認）
    // サーベイ完了済みの場合はスキップ（onEnterStateでsurveyPhaseがリセットされても再実行しない）
    if (this.surveyPhase !== "none" && !this.throwInSurveyCompleted) {
      this.updateThrowInSurveyPhase(deltaTime);
      return;
    }

    // サーベイ完了後、パス先を探す

    // ドリブル構えモーションを維持
    if (this.character.getCurrentMotionName() !== "dribble_stance") {
      this.character.playMotion(DRIBBLE_STANCE_MOTION);
    }

    // パスレーン分析を行い、最も良いパス先を探す
    const passLaneAnalysis = this.analyzeAllPassLanes();
    const passableCandidates: Array<{
      teammate: Character;
      risk: number;
      distanceToGoal: number;
    }> = [];

    const goalPosition = this.field.getAttackingGoalRim(this.character.team);

    for (const analysis of passLaneAnalysis) {
      const teammatePos = analysis.teammate.getPosition();
      const distance = Vector3.Distance(myPos, teammatePos);

      // パス可能距離かチェック（デバッグログ付き）
      const isPassable = PassUtils.isPassableDistance(distance);

      if (!isPassable) {
        continue;
      }

      // パスレーンのリスクが高すぎる場合でも候補には入れる（最悪でもパスする必要があるため）
      const distanceToGoal = Vector3.Distance(teammatePos, goalPosition);

      passableCandidates.push({
        teammate: analysis.teammate,
        risk: analysis.risk,
        distanceToGoal,
      });
    }

    if (passableCandidates.length === 0) {
      return;
    }

    // パス先を選択（優先順位: 低リスク > ゴールに近い）
    passableCandidates.sort((a, b) => {
      if (Math.abs(a.risk - b.risk) < 0.1) {
        return a.distanceToGoal - b.distanceToGoal;
      }
      return a.risk - b.risk;
    });

    const bestTarget = passableCandidates[0];

    // ターゲットの方を向く
    const targetPos = bestTarget.teammate.getPosition();
    const toTarget = new Vector3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
    if (toTarget.length() > 0.01) {
      const angle = Math.atan2(toTarget.x, toTarget.z);
      this.character.setRotation(angle);
    }

    // パスクールダウンが終わっていればパスを実行（PlayerActionFacade側でチェック）
    const canPass = this.passCanCheckCallback ? this.passCanCheckCallback(this.character) : true;

    if (canPass && this.passCallback) {
      // スローイン時は重心をリセットしてからパスを実行
      // （立ち止まっていても小さな揺れでパスできないことを防ぐ）
      const balanceController = this.character.getBalanceController();
      if (balanceController) {
        balanceController.reset();
      }

      // クールダウンはPlayerActionFacade.performPass内で自動記録
      const result = this.passCallback(this.character, bestTarget.teammate, "pass_chest");
      if (result.success) {
        // スロワーフラグはCollisionHandlerのupdateCharacterStates()で
        // レシーバーがキャッチした時点で自動的にクリアされる
      }
    }
  }

  /**
   * スローインスロワー用の周囲確認フェーズ
   * 通常のサーベイと同じだが、最後はゴールではなくコート内を向く
   */
  private updateThrowInSurveyPhase(deltaTime: number): void {
    this.surveyTimer += deltaTime;
    this.surveyTotalTimer += deltaTime;

    // ドリブル構えモーションを維持
    if (this.character.getCurrentMotionName() !== "dribble_stance") {
      this.character.playMotion(DRIBBLE_STANCE_MOTION);
    }

    // 安全チェック: 周囲確認が最大時間を超えた場合は強制終了
    if (this.surveyTotalTimer >= this.SURVEY_MAX_TOTAL_TIME) {
      this.surveyPhase = "none";
      this.surveyTimer = 0;
      this.surveyTotalTimer = 0;
      this.throwInSurveyCompleted = true; // サーベイ完了をマーク
      return;
    }

    switch (this.surveyPhase) {
      case "look_left":
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
        // スローインの場合はゴールではなくコート中央方向を向く
        {
          const myPos = this.character.getPosition();
          // コート中央方向（0, 0）を向く
          const toCourt = new Vector3(-myPos.x, 0, -myPos.z);
          const courtAngle = toCourt.length() > 0.01 ? Math.atan2(toCourt.x, toCourt.z) : 0;

          const progress = Math.min(this.surveyTimer / this.SURVEY_FACE_GOAL_DURATION, 1.0);
          const startAngle = this.surveyStartRotation - this.SURVEY_LOOK_ANGLE;
          const angleDiff = normalizeAngle(courtAngle - startAngle);
          const currentAngle = startAngle + angleDiff * progress;
          this.character.setRotation(currentAngle);

          if (this.surveyTimer >= this.SURVEY_FACE_GOAL_DURATION) {
            this.surveyPhase = "none";
            this.surveyTimer = 0;
            this.throwInSurveyCompleted = true; // サーベイ完了をマーク
            this.character.setRotation(courtAngle);
          }
        }
        break;
    }
  }

  /**
   * パスレーン確保のための移動を実行
   */
  private moveToCreatePassLane(deltaTime: number): boolean {
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

  /**
   * シュートクロック残り時間が少ないかどうかを判定
   * @returns 残り時間が閾値以下ならtrue
   */
  private isShotClockUrgent(): boolean {
    if (!this.shotClockController) {
      return false;
    }

    const remainingTime = this.shotClockController.getRemainingTime();
    return remainingTime <= this.SHOT_CLOCK_URGENT_THRESHOLD;
  }

  /**
   * アイドル時間追跡の更新
   * 位置がほぼ変わっていない場合にアイドル時間を加算
   */
  private updateIdleTracking(deltaTime: number): void {
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

  /**
   * 3秒以上静止状態の場合に強制的に行動を選択
   * 優先順位: シュート > パス > ドリブル突破
   * @returns 行動を実行した場合true
   */
  private tryForceActionWhenIdle(): boolean {
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
}
