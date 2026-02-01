import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import { Field } from "../entities/Field";
import { ShootingController } from "./action/ShootingController";
import { FeintController } from "./action/FeintController";
import { FieldGridUtils } from "../config/FieldGridConfig";
import { BALL_HOLDING_CONFIG } from "../config/CharacterAIConfig";
import {
  LooseBallAI,
  OnBallOffenseAI,
  OnBallDefenseAI,
  OffBallOffenseAI,
  OffBallDefenseAI
} from "../ai";
import { PassCallback } from "../ai/state/OnBallOffenseAI";
import { Formation } from "../config/FormationConfig";

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
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // オンボールオフェンスAIのクールダウンを更新
    this.onBallOffenseAI.updateCooldowns(deltaTime);

    // アクション実行中（シュート等）は移動処理をスキップ
    const actionController = this.character.getActionController();
    const currentAction = actionController.getCurrentAction();
    const currentPhase = actionController.getCurrentPhase();
    if (currentAction !== null || currentPhase !== 'idle') {
      // アクション中は待機モーションも再生しない（アクションモーションが再生中）
      return;
    }

    const state = this.character.getState();

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
