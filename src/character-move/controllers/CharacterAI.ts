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
  private allCharacters: Character[];
  private field: Field;

  // 状態別AIインスタンス
  private looseBallAI: LooseBallAI;
  private onBallOffenseAI: OnBallOffenseAI;
  private onBallDefenseAI: OnBallDefenseAI;
  private offBallOffenseAI: OffBallOffenseAI;
  private offBallDefenseAI: OffBallDefenseAI;
  private throwInThrowerAI: ThrowInThrowerAI;
  private throwInReceiverAI: ThrowInReceiverAI;
  private throwInOtherAI: ThrowInOtherAI;

  // パス軌道可視化（外部から設定可能）
  private passTrajectoryVisualizer: PassTrajectoryVisualizer | null = null;

  // 前回の状態（状態遷移検出用）
  private previousState: CharacterState | null = null;

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field) {
    this.character = character;
    this.ball = ball;
    this.allCharacters = allCharacters;
    this.field = field;

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
   */
  public setPassTrajectoryVisualizer(visualizer: PassTrajectoryVisualizer): void {
    this.passTrajectoryVisualizer = visualizer;
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
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // オンボールオフェンスAIのクールダウンを更新
    this.onBallOffenseAI.updateCooldowns(deltaTime);

    const state = this.character.getState();

    // 状態遷移を検出してリセット処理を実行（アクション実行中でも行う）
    if (this.previousState !== null && this.previousState !== state) {
      this.handleStateTransition(this.previousState, state);
    }
    this.previousState = state;

    // アクション実行中（シュート等）は移動処理をスキップ
    const actionController = this.character.getActionController();
    const currentAction = actionController.getCurrentAction();
    const currentPhase = actionController.getCurrentPhase();
    if (currentAction !== null || currentPhase !== 'idle') {
      // アクション中は待機モーションも再生しない（アクションモーションが再生中）
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
   * 状態遷移時のリセット処理
   * @param fromState 遷移前の状態
   * @param toState 遷移後の状態
   */
  private handleStateTransition(fromState: CharacterState, toState: CharacterState): void {
    console.log(`[CharacterAI] 状態遷移: ${this.character.playerPosition} ${fromState} → ${toState}`);

    // アクションを強制リセット（defense_stance等の無限アクションを終了させる）
    const actionController = this.character.getActionController();
    actionController.forceResetAction();

    // キャラクターのモーションと移動状態をリセット
    // 前の状態のアクションが引き継がれないようにする
    this.character.stopMovement();
    this.character.playMotion(IDLE_MOTION);

    // 前の状態からのExit処理
    switch (fromState) {
      case CharacterState.ON_BALL_PLAYER:
        this.onBallOffenseAI.onExitState();
        break;
      case CharacterState.OFF_BALL_PLAYER:
        this.offBallOffenseAI.onExitState();
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
    }

    // 新しい状態へのEnter処理
    switch (toState) {
      case CharacterState.ON_BALL_PLAYER:
        this.onBallOffenseAI.onEnterState();
        break;
      case CharacterState.OFF_BALL_PLAYER:
        this.offBallOffenseAI.onEnterState();
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
