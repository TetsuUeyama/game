import {Vector3} from "@babylonjs/core";
import {Character} from "../../entities/Character";
import {Ball} from "../../entities/Ball";
import {Field} from "../../entities/Field";
import {BaseStateAI} from "./BaseStateAI";
import {ShootingController} from "../../controllers/action/ShootingController";
import {FeintController} from "../../controllers/action/FeintController";
import {SHOOT_COOLDOWN, ShootingUtils} from "../../config/action/ShootingConfig";
import {DefenseUtils} from "../../config/DefenseConfig";
import {PASS_COOLDOWN, PassUtils} from "../../config/PassConfig";
import {IDLE_MOTION} from "../../motion/IdleMotion";
import {DRIBBLE_STANCE_MOTION} from "../../motion/DribbleMotion";
import {DASH_FORWARD_MOTION} from "../../motion/DashMotion";
import {PassTrajectoryCalculator, Vec3} from "../../physics/PassTrajectoryCalculator";
import {InterceptionAnalyzer} from "../analysis/InterceptionAnalyzer";
import {PassType, PASS_TYPE_CONFIGS} from "../../config/PassTrajectoryConfig";

/**
 * パス実行時のコールバック型
 */
export type PassCallback = (passer: Character, target: Character, passType: "pass_chest" | "pass_bounce" | "pass_overhead") => {success: boolean; message: string};

/**
 * オンボールオフェンス時のAI
 * ボール保持者として攻撃を組み立てる
 */
export class OnBallOffenseAI extends BaseStateAI {
  private shootingController: ShootingController | null = null;
  private feintController: FeintController | null = null;
  private passCallback: PassCallback | null = null;

  // シュートクールダウン（連続シュート防止）
  private shootCooldown: number = 0;
  // フェイントクールダウン（連続フェイント防止）
  private feintCooldown: number = 0;
  // パスクールダウン（連続パス防止）
  private passCooldown: number = 0;

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

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field) {
    super(character, ball, allCharacters, field);
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
   * パスコールバックを設定
   */
  public setPassCallback(callback: PassCallback): void {
    this.passCallback = callback;
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

    // 周囲確認フェーズを開始（ボールを受け取った直後）
    this.surveyPhase = "look_left";
    this.surveyTimer = 0;
    this.surveyTotalTimer = 0;
    this.surveyStartRotation = this.character.getRotation();
    console.log(`[OnBallOffenseAI] 周囲確認開始: 初期回転=${((this.surveyStartRotation * 180) / Math.PI).toFixed(1)}°`);
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
      console.warn(`[OnBallOffenseAI] 周囲確認が${this.SURVEY_MAX_TOTAL_TIME}秒を超えたため強制終了`);
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
            console.log(`[OnBallOffenseAI] 周囲確認: 左確認完了、右を確認`);
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
            console.log(`[OnBallOffenseAI] 周囲確認: 右確認完了、ゴール方向を向く`);
          }
        }
        break;

      case "face_goal":
        // ゴール方向を向く
        {
          const progress = Math.min(this.surveyTimer / this.SURVEY_FACE_GOAL_DURATION, 1.0);
          const startAngle = this.surveyStartRotation - this.SURVEY_LOOK_ANGLE;
          // 角度の差分を正規化して最短経路で回転
          let angleDiff = goalAngle - startAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          const currentAngle = startAngle + angleDiff * progress;
          this.character.setRotation(currentAngle);

          if (this.surveyTimer >= this.SURVEY_FACE_GOAL_DURATION) {
            this.surveyPhase = "none";
            this.surveyTimer = 0;
            // 最終的にゴール方向を確実に向く
            this.character.setRotation(goalAngle);
            console.log(`[OnBallOffenseAI] 周囲確認完了: ゴール方向=${((goalAngle * 180) / Math.PI).toFixed(1)}°`);
          }
        }
        break;
    }
  }

  /**
   * クールダウンを更新
   */
  public updateCooldowns(deltaTime: number): void {
    if (this.shootCooldown > 0) {
      this.shootCooldown -= deltaTime;
    }
    if (this.feintCooldown > 0) {
      this.feintCooldown -= deltaTime;
    }
    if (this.passCooldown > 0) {
      this.passCooldown -= deltaTime;
    }
  }

  /**
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // デバッグログ: 現在の状態を出力
    const currentRotation = this.character.getRotation();
    const myPos = this.character.getPosition();
    console.log(`[OnBallOffenseAI] update開始: pos=(${myPos.x.toFixed(2)}, ${myPos.z.toFixed(2)}), rotation=${((currentRotation * 180) / Math.PI).toFixed(1)}°`);

    // 周囲確認フェーズの処理（ボールを受け取った直後）
    if (this.surveyPhase !== "none") {
      console.log(`[OnBallOffenseAI] サーベイフェーズ中: ${this.surveyPhase}, timer=${this.surveyTimer.toFixed(2)}, totalTimer=${this.surveyTotalTimer.toFixed(2)}`);
      this.updateSurveyPhase(deltaTime);
      return; // 周囲確認中は他の行動をしない
    } else {
      console.log(`[OnBallOffenseAI] サーベイ完了後の通常処理`);
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

    console.log(`[OnBallOffenseAI] 目標位置: (${targetPosition.x.toFixed(2)}, ${targetPosition.z.toFixed(2)})`);

    // 【最優先】常にゴール方向を向く
    const toGoal = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);
    if (toGoal.length() > 0.01) {
      const goalAngle = Math.atan2(toGoal.x, toGoal.z);
      console.log(`[OnBallOffenseAI] ゴール方向に回転: ${((goalAngle * 180) / Math.PI).toFixed(1)}°`);
      this.character.setRotation(goalAngle);
    } else {
      console.log(`[OnBallOffenseAI] 目標が近すぎて回転不要: toGoal.length()=${toGoal.length()}`);
    }

    // 目の前にディフェンダーがいるかチェック
    const onBallDefender = this.findOnBallDefender();

    if (onBallDefender) {
      const defenderPosition = onBallDefender.getPosition();
      const distToDefender = Vector3.Distance(myPosition, defenderPosition);
      console.log(`[OnBallOffenseAI] ディフェンダー検出: ${onBallDefender.playerPosition}, 距離=${distToDefender.toFixed(2)}m`);

      // 視野ベースで1on1状態を判定
      // オフェンスプレイヤーの視野内にディフェンダーがいるかどうか
      const isDefenderInFOV = DefenseUtils.is1on1StateByFieldOfView({x: myPosition.x, z: myPosition.z}, this.character.getRotation(), {x: defenderPosition.x, z: defenderPosition.z});

      console.log(`[OnBallOffenseAI] ディフェンダー視野内判定: ${isDefenderInFOV}`);

      if (isDefenderInFOV) {
        // ========================================
        // 1on1状態（ディフェンダーが視野内）
        // ========================================
        console.log(`[OnBallOffenseAI] handle1on1State呼び出し`);
        this.handle1on1State(targetPosition, deltaTime);
        return;
      } else {
        // ========================================
        // ディフェンダーが視野外に外れた瞬間
        // → ダッシュでゴールへ向かう OR シュートを狙う
        // ========================================
        console.log(`[OnBallOffenseAI] handleDefenderOutOfFOV呼び出し`);
        this.handleDefenderOutOfFOV(targetPosition, deltaTime);
        return;
      }
    }

    // ディフェンダーがいない場合
    console.log(`[OnBallOffenseAI] ディフェンダーなし、シュート/パス/移動を試行`);

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

    // 目標位置に向かって移動（境界チェック付き、向きはゴール方向を維持）
    const stopDistance = this.targetPositionOverride ? 0.5 : 2.0; // オーバーライド時は目標近くまで行く
    console.log(`[OnBallOffenseAI] moveTowardsWithBoundary呼び出し: stopDistance=${stopDistance}`);
    this.moveTowardsWithBoundary(targetPosition, deltaTime, stopDistance, true); // keepRotation=true
  }

  /**
   * 1on1状態（ディフェンダーが視野内）の処理
   * ドリブルモーションを使用し、アクションを実行
   * パスレーンが塞がれている場合は移動してパスコースを作る
   */
  private handle1on1State(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();
    console.log(`[OnBallOffenseAI] handle1on1State: myPos=(${myPosition.x.toFixed(2)}, ${myPosition.z.toFixed(2)})`);

    // 1on1時は常にドリブル構えモーションを再生（歩行・アイドル共通）
    if (this.character.getCurrentMotionName() !== "dribble_stance") {
      this.character.playMotion(DRIBBLE_STANCE_MOTION);
    }

    // 目標への方向ベクトル（update()で既に向きは設定済み）
    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    // 1on1状態: まずパスを試みる（ポジションに応じた判定）
    // ただし目標位置オーバーライド時はパスしない（1on1テスト用）
    if (!this.targetPositionOverride && this.tryPass()) {
      console.log(`[OnBallOffenseAI] handle1on1State: パス実行`);
      return;
    }

    // パスレーンが塞がれている場合、移動してパスコースを作る
    if (!this.targetPositionOverride && this.moveToCreatePassLane(deltaTime)) {
      console.log(`[OnBallOffenseAI] handle1on1State: パスレーン確保のため移動`);
      return;
    }

    // アクションをランダムに選択
    // シュートレンジ内かどうかで確率を調整
    const rangeInfo = this.shootingController?.getShootRangeInfo(this.character);
    const inShootRange = rangeInfo?.inRange ?? false;

    const actionChoice = Math.random();

    if (inShootRange) {
      // シュートレンジ内：シュート優先（50%）
      if (actionChoice < 0.5) {
        if (!this.targetPositionOverride && this.tryShoot()) {
          console.log(`[OnBallOffenseAI] handle1on1State: シュート実行（レンジ内優先）`);
          return;
        }
      } else if (actionChoice < 0.7) {
        // 20%: フェイント
        if (this.tryFeint()) {
          console.log(`[OnBallOffenseAI] handle1on1State: フェイント実行`);
          return;
        }
      } else if (actionChoice < 0.85) {
        // 15%: ドリブル突破
        if (this.tryDribbleMove()) {
          console.log(`[OnBallOffenseAI] handle1on1State: ドリブル突破実行`);
          return;
        }
      }
      // 15%: 様子見
    } else {
      // シュートレンジ外：移動優先
      if (actionChoice < 0.2) {
        // 20%: フェイント
        if (this.tryFeint()) {
          console.log(`[OnBallOffenseAI] handle1on1State: フェイント実行`);
          return;
        }
      } else if (actionChoice < 0.45) {
        // 25%: ドリブル突破
        if (this.tryDribbleMove()) {
          console.log(`[OnBallOffenseAI] handle1on1State: ドリブル突破実行`);
          return;
        }
      }
      // 55%: 移動（ゴールに近づく）
    }

    // 1on1中も少し動く（目標方向に向かいながら）
    const distanceToTarget = toTarget.length();
    console.log(`[OnBallOffenseAI] handle1on1State: 目標距離=${distanceToTarget.toFixed(2)}m`);

    if (distanceToTarget > 0.5) {
      const direction = toTarget.normalize();
      // 境界チェック・衝突チェックを試みるが、失敗しても移動する
      let moveDirection = direction;
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
      console.log(`[OnBallOffenseAI] handle1on1State: boundaryAdjusted=${boundaryAdjusted ? `(${boundaryAdjusted.x.toFixed(2)}, ${boundaryAdjusted.z.toFixed(2)})` : "null"}`);

      if (boundaryAdjusted) {
        const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
        console.log(`[OnBallOffenseAI] handle1on1State: collisionAdjusted=${adjustedDirection ? `(${adjustedDirection.x.toFixed(2)}, ${adjustedDirection.z.toFixed(2)})` : "null"}`);
        if (adjustedDirection) {
          moveDirection = adjustedDirection;
        }
      }
      // ゆっくり移動（通常速度の50%）
      console.log(`[OnBallOffenseAI] handle1on1State: move(${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)}) * 0.5`);
      this.character.move(moveDirection.scale(0.5), deltaTime);
    } else {
      console.log(`[OnBallOffenseAI] handle1on1State: 目標に近いので移動スキップ`);
    }
  }

  /**
   * ディフェンダーが視野外に外れた時の処理
   * ダッシュでゴールへ向かうか、シュートレンジならシュート
   */
  private handleDefenderOutOfFOV(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();
    console.log(`[OnBallOffenseAI] handleDefenderOutOfFOV: myPos=(${myPosition.x.toFixed(2)}, ${myPosition.z.toFixed(2)})`);

    // 目標位置オーバーライド時以外は、まずシュートを試みる
    if (!this.targetPositionOverride && this.tryShoot()) {
      return;
    }

    // ダッシュで目標に向かう（向きはupdate()で既に設定済み）
    const toTarget = new Vector3(targetPosition.x - myPosition.x, 0, targetPosition.z - myPosition.z);

    const distanceToTarget = toTarget.length();
    console.log(`[OnBallOffenseAI] 目標への距離: ${distanceToTarget.toFixed(2)}m`);

    if (distanceToTarget > 0.5) {
      // ダッシュモーションに切り替え
      if (this.character.getCurrentMotionName() !== "dash_forward") {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }

      // 移動方向を決定（境界チェック・衝突チェックを試みるが、失敗しても移動する）
      const direction = toTarget.normalize();
      let moveDirection = direction;
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
      console.log(`[OnBallOffenseAI] boundaryAdjusted: ${boundaryAdjusted ? `(${boundaryAdjusted.x.toFixed(2)}, ${boundaryAdjusted.z.toFixed(2)})` : "null"}`);

      if (boundaryAdjusted) {
        const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
        console.log(`[OnBallOffenseAI] collisionAdjusted: ${adjustedDirection ? `(${adjustedDirection.x.toFixed(2)}, ${adjustedDirection.z.toFixed(2)})` : "null"}`);
        if (adjustedDirection) {
          moveDirection = adjustedDirection;
        }
      }
      // 全速力でダッシュ
      console.log(`[OnBallOffenseAI] move呼び出し: direction=(${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)})`);
      this.character.move(moveDirection, deltaTime);
    } else {
      // 目標に近い場合はアイドル
      console.log(`[OnBallOffenseAI] 目標に近いのでアイドル`);
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
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Backboard() : this.field.getGoal2Backboard();
    return attackingGoal.position;
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

    // クールダウン中はスキップ
    if (this.shootCooldown > 0) {
      return false;
    }

    // ゴールまでの距離を計算（向きに関係なく）
    // 攻めるべきゴールを取得（allyは+Z側のgoal1、enemyは-Z側のgoal2）
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Rim() : this.field.getGoal2Rim();
    const goalPosition = attackingGoal.position;
    const myPos = this.character.getPosition();
    const dx = goalPosition.x - myPos.x;
    const dz = goalPosition.z - myPos.z;
    const distanceToGoal = Math.sqrt(dx * dx + dz * dz);

    // ShootingUtilsを使用してレンジ判定
    if (!ShootingUtils.isInShootRange(distanceToGoal)) {
      return false;
    }

    // シュートレンジ内に入ったらゴール方向を向く
    const angle = Math.atan2(dx, dz);
    this.character.setRotation(angle);

    // 向きを変えた後、正式にチェック
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character);

    if (!rangeInfo.inRange || !rangeInfo.facingGoal) {
      return false;
    }

    // シュートタイプに応じた処理（rangeInfo.shootTypeを使用）
    let shouldShoot = false;

    switch (rangeInfo.shootType) {
      case "3pt":
      case "midrange":
      case "layup":
        shouldShoot = true;
        break;
    }

    if (shouldShoot) {
      // シュート実行（ActionController経由でアニメーション付き）
      const result = this.shootingController.startShootAction(this.character);
      if (result.success) {
        // SHOOT_COOLDOWN.AFTER_SHOTを使用してクールダウンを設定
        this.shootCooldown = SHOOT_COOLDOWN.AFTER_SHOT;
        return true;
      }
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

    // フェイントクールダウン中は実行不可
    if (this.feintCooldown > 0) {
      return false;
    }

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

    // フェイント実行
    const result = this.feintController.performShootFeint(this.character);
    if (result && result.success) {
      // フェイントクールダウンを設定
      this.feintCooldown = 2.0; // 2秒間フェイント不可
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

    // パスクールダウン中は実行不可
    if (this.passCooldown > 0) {
      return false;
    }

    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    const myPos = this.character.getPosition();

    // 攻めるべきゴールを取得
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Rim() : this.field.getGoal2Rim();
    const goalPosition = attackingGoal.position;

    // 自分がゴール下にいる場合はパスより得点を優先（パスしない）
    const amINearGoal = PassUtils.isNearGoal({x: myPos.x, z: myPos.z}, {x: goalPosition.x, z: goalPosition.z});
    if (amINearGoal) {
      return false;
    }

    // チームメイトを取得
    const teammates = this.allCharacters.filter((c) => c.team === this.character.team && c !== this.character);

    // パス候補を評価
    const passLaneAnalysis = this.analyzeAllPassLanes();
    const passableCandidates: Array<{
      teammate: Character;
      risk: number;
      distanceToGoal: number;
      isNearGoal: boolean;
    }> = [];

    for (const analysis of passLaneAnalysis) {
      const teammatePos = analysis.teammate.getPosition();
      const distance = Vector3.Distance(myPos, teammatePos);

      // パス可能距離かチェック
      if (!PassUtils.isPassableDistance(distance)) {
        continue;
      }

      // パスレーンのリスクが高すぎる場合はスキップ
      if (analysis.risk > 0.7) {
        continue;
      }

      const distanceToGoal = Vector3.Distance(teammatePos, goalPosition);
      const isNearGoal = PassUtils.isNearGoal({x: teammatePos.x, z: teammatePos.z}, {x: goalPosition.x, z: goalPosition.z});

      passableCandidates.push({
        teammate: analysis.teammate,
        risk: analysis.risk,
        distanceToGoal,
        isNearGoal,
      });
    }

    if (passableCandidates.length === 0) {
      return false;
    }

    // パス先を選択（優先順位: ゴール下 > 低リスク > ゴールに近い）
    let passTarget: Character | null = null;

    // 1. ゴール下にいるチームメイトを優先
    const nearGoalCandidates = passableCandidates.filter((c) => c.isNearGoal);
    if (nearGoalCandidates.length > 0) {
      // 最もリスクが低いものを選択
      nearGoalCandidates.sort((a, b) => a.risk - b.risk);
      passTarget = nearGoalCandidates[0].teammate;
    }

    // 2. ゴール下にいなければ、低リスクでゴールに近いチームメイト
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
    const result = this.passCallback(this.character, passTarget, "pass_chest");
    if (result.success) {
      this.passCooldown = PASS_COOLDOWN.AFTER_PASS;
      console.log(`[OnBallOffenseAI] パス実行: ${this.character.playerPosition} → ${passTarget.playerPosition}`);
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

    const teammates = this.allCharacters.filter((c) => c.team === this.character.team && c !== this.character);

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
      const dx = receiverVec.x - passerVec.x;
      const dz = receiverVec.z - passerVec.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

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
    const defenders = this.allCharacters.filter((c) => c.team !== this.character.team);

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
}
