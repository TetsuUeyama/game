import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { CharacterState } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { PlayerStateManager } from "@/GamePlay/GameSystem/StatusCheckSystem";
import { ShootingController } from "@/GamePlay/GameSystem/ShootingSystem/ShootingController";
import { FeintController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/FeintController";
import { PassController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/PassController";
import { DribbleController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/DribbleController";
import { DefenseActionController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/DefenseActionController";
import { LooseBallController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/LooseBallController";
import { ShotClockController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/ShotClockController";
import { FieldGridUtils } from "@/GamePlay/GameSystem/FieldSystem/FieldGridConfig";
import { IDLE_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/IdleMotion";
import { DribbleBreakthroughUtils } from "@/GamePlay/GameSystem/CharacterMove/Config/DribbleBreakthroughConfig";
import {
  LooseBallAI,
  OnBallOffenseAI,
  OnBallDefenseAI,
  OffBallOffenseAI,
  OffBallDefenseAI,
} from "@/GamePlay/GameSystem/DecisionMakingSystem/AI";
import { PassTrajectoryVisualizer } from "@/GamePlay/GameSystem/CharacterMove/Visualization/PassTrajectoryVisualizer";
import { LooseBallDecisionSystem } from "@/GamePlay/GameSystem/LooseBallSystem/LooseBallDecisionSystem";
import { RiskAssessmentSystem } from "@/GamePlay/GameSystem/DecisionMakingSystem/RiskAssessmentSystem";
import { ACTION_DEFINITIONS } from "@/GamePlay/GameSystem/CharacterMove/Config/ActionConfig";

/**
 * キャラクターAI状態管理
 * キャラクターの状態に応じて適切なAIに処理を委譲する
 */
export class CharacterAI {
  private character: Character;
  private ball: Ball;

  // 状態別AIインスタンス
  private looseBallAI: LooseBallAI;
  private onBallOffenseAI: OnBallOffenseAI;
  private onBallDefenseAI: OnBallDefenseAI;
  private offBallOffenseAI: OffBallOffenseAI;
  private offBallDefenseAI: OffBallDefenseAI;


  // 前回の状態（状態遷移検出用）
  private previousState: CharacterState | null = null;

  // 前回のボール保持状態（ボールを受け取った時の検出用）
  private wasBallHolder: boolean = false;

  // 状態遷移後の反応遅延タイマー（秒）
  // reflexesに基づいて計算され、この時間中はアイドル状態でボールを見る
  private stateTransitionReactionTimer: number = 0;

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field, playerState?: PlayerStateManager) {
    this.character = character;
    this.ball = ball;

    // 状態別AIを初期化
    this.looseBallAI = new LooseBallAI(character, ball, allCharacters, field, playerState);
    this.onBallOffenseAI = new OnBallOffenseAI(character, ball, allCharacters, field, playerState);
    this.onBallDefenseAI = new OnBallDefenseAI(character, ball, allCharacters, field, playerState);
    this.offBallOffenseAI = new OffBallOffenseAI(character, ball, allCharacters, field, playerState);
    this.offBallDefenseAI = new OffBallDefenseAI(character, ball, allCharacters, field, playerState);

  }

  /**
   * 対象キャラクターを取得
   */
  public getCharacter(): Character {
    return this.character;
  }

  /**
   * LooseBallDecisionSystemを設定
   */
  public setLooseBallDecisionSystem(system: LooseBallDecisionSystem): void {
    this.looseBallAI.setDecisionSystem(system);
  }

  /**
   * RiskAssessmentSystemを設定
   */
  public setRiskAssessmentSystem(system: RiskAssessmentSystem): void {
    this.onBallOffenseAI.setRiskAssessmentSystem(system);
    this.offBallOffenseAI.setRiskAssessmentSystem(system);
  }

  /**
   * ShootingControllerを設定
   */
  public setShootingController(controller: ShootingController): void {
    this.onBallOffenseAI.setShootingController(controller);
  }

  /**
   * FeintControllerを設定
   */
  public setFeintController(controller: FeintController): void {
    this.onBallOffenseAI.setFeintController(controller);
  }

  /**
   * ShotClockControllerを設定
   */
  public setShotClockController(controller: ShotClockController): void {
    this.onBallOffenseAI.setShotClockController(controller);
  }

  /**
   * PassControllerを設定
   */
  public setPassController(controller: PassController): void {
    this.onBallOffenseAI.setPassController(controller);
  }

  /**
   * DribbleControllerを設定
   */
  public setDribbleController(controller: DribbleController): void {
    this.onBallOffenseAI.setDribbleController(controller);
  }

  /**
   * DefenseActionControllerを設定
   */
  public setDefenseActionController(controller: DefenseActionController): void {
    this.onBallDefenseAI.setDefenseActionController(controller);
  }

  /**
   * LooseBallControllerを設定
   */
  public setLooseBallController(controller: LooseBallController): void {
    this.looseBallAI.setLooseBallController(controller);
  }

  /**
   * 目標位置オーバーライドを設定
   * 設定するとゴールではなくこの位置に向かい、シュート・パスは行わない
   */
  public setTargetPositionOverride(position: Vector3 | null): void {
    this.onBallOffenseAI.setTargetPositionOverride(position);
  }


  /**
   * パス軌道可視化を設定
   * 現在未使用 - 将来の実装用に保持
   */
  public setPassTrajectoryVisualizer(_visualizer: PassTrajectoryVisualizer): void {
    // 将来の実装用
  }

  /**
   * オフボールオフェンスAIを取得（パス軌道可視化用）
   */
  public getOffBallOffenseAI(): OffBallOffenseAI {
    return this.offBallOffenseAI;
  }

  /**
   * AIとキャラクター状態を強制的に初期化
   * リセット処理（センターサークル再開、ゴール後再開等）で使用
   * 前回の行動や状態を完全にクリアして新しい状態で開始
   */
  public forceInitialize(): void {
    // 追跡変数をBALL_LOST状態にリセット
    // 次のupdate()で実際の状態（ON_BALL_PLAYER等）との差異が検出され、
    // handleStateTransition() → onEnterState() が呼ばれる
    // これにより、オンボールプレイヤーのサーベイ等の初期化処理が正しく実行される
    this.previousState = CharacterState.BALL_LOST;
    this.wasBallHolder = false;
    this.stateTransitionReactionTimer = 0;

    // キャラクターの物理状態をリセット
    this.character.resetBalance();
    this.character.velocity = Vector3.Zero();

    // アクションを強制リセット
    this.character.getActionController().forceResetAction();

    // AI移動をクリア
    this.character.clearAIMovement();

    // 移動を停止
    this.character.stopMovement();

    // モーションをアイドルに
    this.character.playMotion(IDLE_MOTION);

    // 各状態AIの内部状態をリセット
    // 次フレームでonEnterState()が呼ばれ、サーベイ等の初期化処理が実行される
    this.onBallOffenseAI.forceReset();
    this.offBallOffenseAI.forceReset();
  }

  /**
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    const state = this.character.getState();

    // 状態遷移を検出してリセット処理を実行（アクション実行中でも行う）
    let stateTransitionedToOnBall = false;
    if (this.previousState !== null && this.previousState !== state) {
      this.handleStateTransition(this.previousState, state);
      if (state === CharacterState.ON_BALL_PLAYER) {
        stateTransitionedToOnBall = true;
      }
    } else if (this.previousState === null && state === CharacterState.ON_BALL_PLAYER) {
      // 最初のフレームでON_BALL_PLAYERの場合も初期化が必要
    }
    this.previousState = state;

    // ボールを受け取った瞬間を検出（状態遷移とは別に）
    // スローイン、ルーズボール、リフレクション等でボールを保持した時に周囲確認を開始
    // ※状態遷移でonEnterStateが呼ばれた場合は二重呼び出しを防ぐ
    const isBallHolder = this.ball.getHolder() === this.character;


    if (isBallHolder && !this.wasBallHolder && state === CharacterState.ON_BALL_PLAYER && !stateTransitionedToOnBall) {
      // ボールを受け取った瞬間（状態変化なし）：前の行動をリセットして周囲確認を開始

      // アクションを強制リセット（前の状態の行動を停止）
      const actionCtrl = this.character.getActionController();
      actionCtrl.forceResetAction();

      // AI移動をクリア（OneOnOneBattleController等との競合を防ぐ）
      this.character.clearAIMovement();

      // 移動とモーションをリセット
      this.character.stopMovement();
      this.character.playMotion(IDLE_MOTION);

      // 周囲確認を開始
      this.onBallOffenseAI.onEnterState();
    }
    this.wasBallHolder = isBallHolder;

    // アクション実行中（シュート等）は移動処理をスキップ
    const actionController = this.character.getActionController();
    const currentAction = actionController.getCurrentAction();
    const currentPhase = actionController.getCurrentPhase();

    // 安全チェック: currentActionがnullなのにphaseがidleでない場合は異常状態
    // これを検出して修正する（本来は発生しないはずだが、念のため）
    if (currentAction === null && currentPhase !== 'idle') {
      console.warn(`[CharacterAI] 異常状態を検出: ${this.character.playerPosition} - action=null but phase=${currentPhase}. 強制リセットします。`);
      actionController.forceResetAction();
    }

    if (currentAction !== null || currentPhase !== 'idle') {
      // アクション中でも allowReflexes が有効なら反射行動のみ評価
      if (currentAction !== null && ACTION_DEFINITIONS[currentAction].allowReflexes) {
        this.evaluateReflexes();
      }
      return;
    }

    // 状態遷移後の反応遅延中はボールを見てアイドル状態を維持
    // 以下の状態は反応遅延をスキップ：
    // - ON_BALL_PLAYER: 独自のサーベイ処理がある
    // - BALL_LOST: リバウンド等、全員が即座に反応すべき
    const skipReactionDelay =
      state === CharacterState.ON_BALL_PLAYER ||
      state === CharacterState.BALL_LOST;

    if (this.stateTransitionReactionTimer > 0 && !skipReactionDelay) {
      this.stateTransitionReactionTimer -= deltaTime;

      // ボール方向を向く
      this.faceBall();

      // 反応遅延中はAI処理をスキップ
      if (this.stateTransitionReactionTimer > 0) {
        return;
      }

      // 反応遅延が終了したらonEnterStateを呼び出し
      this.callOnEnterState(state);
    }

    // ========================================
    // 反射行動の評価（状態AIより先に実行）
    // ========================================
    if (this.evaluateReflexes()) {
      return;
    }

    switch (state) {
      case CharacterState.BALL_LOST:
        // ボールが誰にも保持されていない場合は、全員がボールを取りに行く
        this.looseBallAI.update(deltaTime);
        break;
      case CharacterState.ON_BALL_PLAYER:
        // ボール保持者は動く
        this.onBallOffenseAI.update(deltaTime);
        break;
      case CharacterState.ON_BALL_DEFENDER:
        // ボール保持者に最も近いディフェンダーは動く
        this.onBallDefenseAI.update(deltaTime);
        break;
      case CharacterState.OFF_BALL_PLAYER:
        // オフボールオフェンス（センターはゴール下へ）
        this.offBallOffenseAI.update(deltaTime);
        break;
      case CharacterState.OFF_BALL_DEFENDER:
        // オフボールディフェンス（同ポジションマッチアップ）
        this.offBallDefenseAI.update(deltaTime);
        break;
    }
  }

  /**
   * ボール方向を向く
   */
  private faceBall(): void {
    const characterPos = this.character.getPosition();
    const ballPos = this.ball.getPosition();

    const dirToBall = ballPos.subtract(characterPos);
    if (dirToBall.length() > 0.1) {
      const targetRotation = Math.atan2(dirToBall.x, dirToBall.z);
      this.character.setRotation(targetRotation);
    }
  }

  /**
   * 指定された状態のonEnterStateを呼び出す
   */
  private callOnEnterState(state: CharacterState): void {
    switch (state) {
      case CharacterState.BALL_LOST:
        this.looseBallAI.onEnterState();
        break;
      case CharacterState.ON_BALL_PLAYER:
        this.onBallOffenseAI.onEnterState();
        break;
      case CharacterState.OFF_BALL_PLAYER:
        this.offBallOffenseAI.onEnterState();
        break;
      case CharacterState.ON_BALL_DEFENDER:
        this.onBallDefenseAI.onEnterState();
        break;
      case CharacterState.OFF_BALL_DEFENDER:
        this.offBallDefenseAI.onEnterState();
        break;
    }
  }

  /**
   * 反射行動を評価・実行
   * 状態別AIの判断より先に、条件が揃えば自動的にアクションを発動する。
   * @returns 反射行動を実行した場合true（状態AI処理をスキップ）
   */
  private evaluateReflexes(): boolean {
    // ボールが保持されている場合は反射不要
    if (this.ball.isHeld()) return false;

    // ボールが飛行中でない場合は反射不要
    if (!this.ball.isInFlight()) return false;

    // アクション実行可能かチェック（この時点でcurrentAction===nullは保証済み）
    const actionController = this.character.getActionController();

    // 1. ボールキャッチ反射（自分に向かってくるボールをキャッチ）
    if (this.tryReflexCatch(actionController)) return true;

    // 2. リバウンドキャッチ反射（頭上で下降中のボールにジャンプ）
    if (this.tryReflexRebound(actionController)) return true;

    return false;
  }

  /**
   * ボールキャッチ反射
   * 自分の方向に飛んでくるボールを検知して pass_receive を自動発動
   */
  private tryReflexCatch(actionController: ReturnType<Character['getActionController']>): boolean {
    const ballPos = this.ball.getPosition();
    const ballVel = this.ball.getVelocity();
    const myPos = this.character.getPosition();

    // ボールの速度が十分あるか（ゆっくりなら反射不要）
    const speed = ballVel.length();
    if (speed < 2.0) return false;

    // 自分からボールへのベクトル
    const toBall = new Vector3(ballPos.x - myPos.x, 0, ballPos.z - myPos.z);
    const horizDist = toBall.length();

    // 遠すぎる場合はスキップ（5m以内）
    if (horizDist > 5.0) return false;

    // 近すぎる場合はスキップ（BallCatchSystemに任せる）
    if (horizDist < 1.0) return false;

    // ボールの水平速度方向
    const ballDirXZ = new Vector3(ballVel.x, 0, ballVel.z);
    if (ballDirXZ.length() < 0.1) return false;
    ballDirXZ.normalize();

    // ボールから自分への方向
    const ballToMe = new Vector3(myPos.x - ballPos.x, 0, myPos.z - ballPos.z);
    ballToMe.normalize();

    // ボールの進行方向と「ボール→自分」の方向の内積
    // 1.0に近いほどまっすぐ自分に向かっている
    const dot = Vector3.Dot(ballDirXZ, ballToMe);
    if (dot < 0.7) return false; // 約45度以内

    // ボールの方を向く
    if (toBall.length() > 0.01) {
      const angle = Math.atan2(toBall.x, toBall.z);
      this.character.setRotation(angle);
    }

    // pass_receive アクション発動
    const result = actionController.startAction('pass_receive');
    return result.success;
  }

  /**
   * リバウンドキャッチ反射
   * 頭上付近で下降中のボールにジャンプして確保
   */
  private tryReflexRebound(actionController: ReturnType<Character['getActionController']>): boolean {
    const ballPos = this.ball.getPosition();
    const ballVel = this.ball.getVelocity();
    const myPos = this.character.getPosition();

    // ボールが下降中でなければスキップ
    if (ballVel.y >= 0) return false;

    // ボールとの水平距離（2m以内）
    const horizDistSq =
      (ballPos.x - myPos.x) ** 2 + (ballPos.z - myPos.z) ** 2;
    if (horizDistSq > 2.0 * 2.0) return false;

    const height = this.character.config.physical.height;

    // ジャンプ頂点到達時のボール予測高さで判断
    // startup(0.15s) + 上昇時間(~0.30s) = 約0.45s後にジャンプ頂点
    const TIME_TO_JUMP_PEAK = 0.45;
    const GRAVITY = 9.81;
    const predictedBallY = ballPos.y
      + ballVel.y * TIME_TO_JUMP_PEAK
      - 0.5 * GRAVITY * TIME_TO_JUMP_PEAK * TIME_TO_JUMP_PEAK;

    // 立ったまま手が届く高さ → ジャンプ不要
    const standingReach = height * 1.1;
    if (predictedBallY <= standingReach) return false;

    // ジャンプでも届かない → 無駄ジャンプ防止
    const maxJumpReach = height + 1.5;
    if (predictedBallY > maxJumpReach) return false;

    // ボールの方を向く
    const toBall = new Vector3(ballPos.x - myPos.x, 0, ballPos.z - myPos.z);
    if (toBall.length() > 0.01) {
      const angle = Math.atan2(toBall.x, toBall.z);
      this.character.setRotation(angle);
    }

    // rebound_jump アクション発動
    const result = actionController.startAction('rebound_jump');
    return result.success;
  }

  /**
   * 状態遷移時のリセット処理
   * @param fromState 遷移前の状態
   * @param toState 遷移後の状態
   */
  private handleStateTransition(fromState: CharacterState, toState: CharacterState): void {

    // アクションを強制リセット（defense_stance等の無限アクションを終了させる）
    const actionController = this.character.getActionController();
    actionController.forceResetAction();

    // AI移動をクリア（OneOnOneBattleController等との競合を防ぐ）
    this.character.clearAIMovement();

    // キャラクターのモーションと移動状態をリセット
    // 前の状態のアクションが引き継がれないようにする
    this.character.stopMovement();
    this.character.playMotion(IDLE_MOTION);

    // ボール方向を向く
    this.faceBall();

    // 前の状態からのExit処理
    switch (fromState) {
      case CharacterState.BALL_LOST:
        this.looseBallAI.onExitState();
        break;
      case CharacterState.ON_BALL_PLAYER:
        this.onBallOffenseAI.onExitState();
        break;
      case CharacterState.OFF_BALL_PLAYER:
        this.offBallOffenseAI.onExitState();
        break;
      case CharacterState.ON_BALL_DEFENDER:
        this.onBallDefenseAI.onExitState();
        break;
      case CharacterState.OFF_BALL_DEFENDER:
        this.offBallDefenseAI.onExitState();
        break;
      // JUMP_BALL_JUMPER, JUMP_BALL_OTHER はGameSceneで管理
    }

    // reflexesに基づいた反応遅延を計算
    // 以下の状態は即座にonEnterStateを呼び出す（反応遅延なし）：
    // - ON_BALL_PLAYER: 独自のサーベイ処理がある
    // - BALL_LOST: リバウンド等、全員が即座に反応すべき
    const skipReactionDelay =
      toState === CharacterState.ON_BALL_PLAYER ||
      toState === CharacterState.BALL_LOST;

    if (skipReactionDelay) {
      this.stateTransitionReactionTimer = 0;
      this.callOnEnterState(toState);
    } else {
      // 他の状態はreflexesに基づいて反応遅延を設定
      const reflexes = this.character.playerData?.stats.reflexes;
      const delayMs = DribbleBreakthroughUtils.calculateReflexesDelay(reflexes);
      this.stateTransitionReactionTimer = delayMs / 1000; // ミリ秒→秒

      // 遅延が0の場合は即座にonEnterStateを呼び出す
      if (this.stateTransitionReactionTimer <= 0) {
        this.callOnEnterState(toState);
      }
      // 遅延がある場合はupdate()で遅延後にonEnterStateが呼び出される
    }
  }

  /**
   * 現在位置の座標情報を取得（デバッグ用）
   */
  public getCurrentCellInfo(): { cell: string; block: string } | null {
    const pos = this.character.getPosition();
    const cell = FieldGridUtils.worldToCell(pos.x, pos.z);
    const block = FieldGridUtils.worldToBlock(pos.x, pos.z);

    if (cell && block) {
      return {
        cell: `${cell.col}${cell.row}`,
        block: `${block.col}${block.row}`,
      };
    }
    return null;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 必要に応じてクリーンアップ処理を追加
  }
}
