import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import { Field } from "../entities/Field";
import { ShootingController } from "./action/ShootingController";
import { FeintController } from "./action/FeintController";
import { FieldGridUtils } from "../config/FieldGridConfig";
import { BALL_HOLDING_CONFIG } from "../config/CharacterAIConfig";
import { IDLE_MOTION } from "../motion/IdleMotion";
import { DribbleUtils } from "../config/DribbleConfig";
import {
  LooseBallAI,
  OnBallOffenseAI,
  OnBallDefenseAI,
  OffBallOffenseAI,
  OffBallDefenseAI,
  ThrowInThrowerAI,
  ThrowInReceiverAI,
  ThrowInOtherAI
} from "../ai";
import { PassCallback } from "../ai/state/OnBallOffenseAI";
import { Formation } from "../config/FormationConfig";
import { PassTrajectoryVisualizer } from "../visualization/PassTrajectoryVisualizer";

/**
 * キャラクターAIコントローラー
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
  private throwInThrowerAI: ThrowInThrowerAI;
  private throwInReceiverAI: ThrowInReceiverAI;
  private throwInOtherAI: ThrowInOtherAI;


  // 前回の状態（状態遷移検出用）
  private previousState: CharacterState | null = null;

  // 前回のボール保持状態（ボールを受け取った時の検出用）
  private wasBallHolder: boolean = false;

  // 状態遷移後の反応遅延タイマー（秒）
  // reflexesに基づいて計算され、この時間中はアイドル状態でボールを見る
  private stateTransitionReactionTimer: number = 0;

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field) {
    this.character = character;
    this.ball = ball;

    // 状態別AIを初期化
    this.looseBallAI = new LooseBallAI(character, ball, allCharacters, field);
    this.onBallOffenseAI = new OnBallOffenseAI(character, ball, allCharacters, field);
    this.onBallDefenseAI = new OnBallDefenseAI(character, ball, allCharacters, field);
    this.offBallOffenseAI = new OffBallOffenseAI(character, ball, allCharacters, field);
    this.offBallDefenseAI = new OffBallDefenseAI(character, ball, allCharacters, field);
    this.throwInThrowerAI = new ThrowInThrowerAI(character, ball, allCharacters, field);
    this.throwInReceiverAI = new ThrowInReceiverAI(character, ball, allCharacters, field);
    this.throwInOtherAI = new ThrowInOtherAI(character, ball, allCharacters, field);

    // オフェンス側のボール保持位置を設定
    this.character.setBallHoldingFaces([...BALL_HOLDING_CONFIG.OFFENSE_HOLDING_FACES]);
  }

  /**
   * 対象キャラクターを取得
   */
  public getCharacter(): Character {
    return this.character;
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
   * パスコールバックを設定
   */
  public setPassCallback(callback: PassCallback): void {
    this.onBallOffenseAI.setPassCallback(callback);
  }

  /**
   * 目標位置オーバーライドを設定
   * 設定するとゴールではなくこの位置に向かい、シュート・パスは行わない
   */
  public setTargetPositionOverride(position: Vector3 | null): void {
    this.onBallOffenseAI.setTargetPositionOverride(position);
  }

  /**
   * オフェンスフォーメーションを設定
   */
  public setOffenseFormation(formation: Formation): void {
    this.offBallOffenseAI.setFormation(formation);
  }

  /**
   * オフェンスフォーメーションを名前で設定
   */
  public setOffenseFormationByName(name: string): boolean {
    return this.offBallOffenseAI.setFormationByName(name);
  }

  /**
   * ディフェンスフォーメーションを設定
   */
  public setDefenseFormation(formation: Formation): void {
    this.offBallDefenseAI.setFormation(formation);
  }

  /**
   * ディフェンスフォーメーションを名前で設定
   */
  public setDefenseFormationByName(name: string): boolean {
    return this.offBallDefenseAI.setFormationByName(name);
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
   * スローインスローワーAIを取得
   */
  public getThrowInThrowerAI(): ThrowInThrowerAI {
    return this.throwInThrowerAI;
  }

  /**
   * スローインレシーバーAIを取得
   */
  public getThrowInReceiverAI(): ThrowInReceiverAI {
    return this.throwInReceiverAI;
  }

  /**
   * スローイン中の他プレイヤーAIを取得
   */
  public getThrowInOtherAI(): ThrowInOtherAI {
    return this.throwInOtherAI;
  }

  /**
   * AIとキャラクター状態を強制的に初期化
   * リセット処理（センターサークル再開、ゴール後再開等）で使用
   * 前回の行動や状態を完全にクリアして新しい状態で開始
   */
  public forceInitialize(): void {
    const state = this.character.getState();

    // 追跡変数をリセット（次のupdateで状態遷移を検出しないようにする）
    this.previousState = state;
    this.wasBallHolder = this.ball.getHolder() === this.character;
    this.stateTransitionReactionTimer = 0;

    // アクションを強制リセット
    const actionController = this.character.getActionController();
    actionController.forceResetAction();

    // AI移動をクリア
    this.character.clearAIMovement();

    // 移動を停止
    this.character.stopMovement();

    // モーションをアイドルに
    this.character.playMotion(IDLE_MOTION);

    // 状態に応じた初期化を実行
    if (state === CharacterState.ON_BALL_PLAYER) {
      this.onBallOffenseAI.onEnterState();
    } else if (state === CharacterState.OFF_BALL_PLAYER) {
      // OFF_BALL_PLAYERは特別な初期化不要
    } else if (state === CharacterState.ON_BALL_DEFENDER) {
      // ON_BALL_DEFENDERは特別な初期化不要
    } else if (state === CharacterState.OFF_BALL_DEFENDER) {
      // OFF_BALL_DEFENDERは特別な初期化不要
    }
  }

  /**
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // オンボールオフェンスAIのクールダウンを更新
    this.onBallOffenseAI.updateCooldowns(deltaTime);

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
      // アクション中は待機モーションも再生しない（アクションモーションが再生中）
      return;
    }

    // 状態遷移後の反応遅延中はボールを見てアイドル状態を維持
    // 以下の状態は反応遅延をスキップ：
    // - ON_BALL_PLAYER: 独自のサーベイ処理がある
    // - THROW_IN_*: スローイン準備は即座に行う必要がある
    // - スローイン中のOFF_BALL_PLAYER: スロワーを見ながら位置取りが必要
    const isThrowInMode = this.ball.getHolder()?.getIsThrowInThrower() ?? false;
    const skipReactionDelay =
      state === CharacterState.ON_BALL_PLAYER ||
      state === CharacterState.THROW_IN_THROWER ||
      state === CharacterState.THROW_IN_RECEIVER ||
      state === CharacterState.THROW_IN_OTHER ||
      (state === CharacterState.OFF_BALL_PLAYER && isThrowInMode);

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
      case CharacterState.THROW_IN_THROWER:
        // スローインを投げる人
        this.throwInThrowerAI.update(deltaTime);
        break;
      case CharacterState.THROW_IN_RECEIVER:
        // スローインを受ける人
        this.throwInReceiverAI.update(deltaTime);
        break;
      case CharacterState.THROW_IN_OTHER:
        // スローイン中の他のプレイヤー
        this.throwInOtherAI.update(deltaTime);
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
      case CharacterState.THROW_IN_THROWER:
        this.throwInThrowerAI.onEnterState();
        break;
      case CharacterState.THROW_IN_RECEIVER:
        this.throwInReceiverAI.onEnterState();
        break;
      case CharacterState.THROW_IN_OTHER:
        this.throwInOtherAI.onEnterState();
        break;
    }
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
      case CharacterState.THROW_IN_THROWER:
        this.throwInThrowerAI.onExitState();
        break;
      case CharacterState.THROW_IN_RECEIVER:
        this.throwInReceiverAI.onExitState();
        break;
      case CharacterState.THROW_IN_OTHER:
        this.throwInOtherAI.onExitState();
        break;
      // JUMP_BALL_JUMPER, JUMP_BALL_OTHER はGameSceneで管理
    }

    // reflexesに基づいた反応遅延を計算
    // 以下の状態は即座にonEnterStateを呼び出す（反応遅延なし）：
    // - ON_BALL_PLAYER: 独自のサーベイ処理がある
    // - THROW_IN_*: スローイン準備は即座に行う必要がある
    const skipReactionDelay =
      toState === CharacterState.ON_BALL_PLAYER ||
      toState === CharacterState.THROW_IN_THROWER ||
      toState === CharacterState.THROW_IN_RECEIVER ||
      toState === CharacterState.THROW_IN_OTHER;

    if (skipReactionDelay) {
      this.stateTransitionReactionTimer = 0;
      this.callOnEnterState(toState);
    } else {
      // 他の状態はreflexesに基づいて反応遅延を設定
      const reflexes = this.character.playerData?.stats.reflexes;
      const delayMs = DribbleUtils.calculateReflexesDelay(reflexes);
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
