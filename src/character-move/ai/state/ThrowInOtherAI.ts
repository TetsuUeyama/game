import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { Formation, FormationUtils, PlayerPosition } from "../../config/FormationConfig";

/**
 * スローイン中の他プレイヤーAI
 * スローイン中に待機する人の動作を制御
 * - フォーメーション位置で待機
 * - ボールの方向を向く
 */
export class ThrowInOtherAI extends BaseStateAI {
  // フォーメーション
  private currentFormation: Formation;
  // 目標位置（外部から設定可能）
  private targetPosition: Vector3 | null = null;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
    // チームに応じてデフォルトフォーメーションを設定
    if (character.team === 'ally') {
      this.currentFormation = FormationUtils.getDefaultOffenseFormation();
    } else {
      this.currentFormation = FormationUtils.getDefaultDefenseFormation();
    }
  }

  /**
   * フォーメーションを設定
   */
  public setFormation(formation: Formation): void {
    this.currentFormation = formation;
  }

  /**
   * 目標位置を直接設定（フォーメーション位置の代わり）
   */
  public setTargetPosition(position: Vector3): void {
    this.targetPosition = position;
  }

  /**
   * 状態に入った時のリセット
   */
  public onEnterState(): void {
    this.targetPosition = null;
  }

  /**
   * 状態から出る時のリセット
   */
  public onExitState(): void {
    this.targetPosition = null;
  }

  /**
   * AIの更新処理
   * 位置は既にGameScene.executeThrowInReset()で設定されているため、
   * ここではボールの方向を向いて静止するだけ
   */
  public update(_deltaTime: number): void {
    // ボールの方向を向いて静止
    this.faceBallandIdle();
  }

  /**
   * ボールの方向を向いて静止
   */
  private faceBallandIdle(): void {
    if (this.character.getCurrentMotionName() !== 'idle') {
      this.character.playMotion(IDLE_MOTION);
    }
    this.character.stopMovement();

    // ボールの方向を向く
    const ballPosition = this.ball.getPosition();
    const myPosition = this.character.getPosition();
    const toBall = new Vector3(
      ballPosition.x - myPosition.x,
      0,
      ballPosition.z - myPosition.z
    );
    if (toBall.length() > 0.01) {
      const angle = Math.atan2(toBall.x, toBall.z);
      this.character.setRotation(angle);
    }
  }

  /**
   * フォーメーション位置を取得
   */
  private getFormationPosition(): { x: number; z: number } | null {
    const playerPosition = this.character.playerPosition;
    if (!playerPosition) {
      return null;
    }

    // チームに応じてフォーメーション位置を取得
    const isAlly = this.character.team === 'ally';
    return FormationUtils.getTargetPosition(
      this.currentFormation,
      playerPosition as PlayerPosition,
      isAlly
    );
  }
}
