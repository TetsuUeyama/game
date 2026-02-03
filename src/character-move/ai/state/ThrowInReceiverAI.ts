import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";

/**
 * スローインレシーバーAI
 * スローインを受ける人の動作を制御
 * - 指定位置で待機
 * - スローワーの方向を向く
 * - ボールを受け取る準備
 */
export class ThrowInReceiverAI extends BaseStateAI {
  // 待機位置（外部から設定）
  private waitPosition: Vector3 | null = null;
  // スローワー（外部から設定）
  private thrower: Character | null = null;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
  }

  /**
   * 待機位置を設定
   */
  public setWaitPosition(position: Vector3): void {
    this.waitPosition = position;
  }

  /**
   * スローワーを設定
   */
  public setThrower(thrower: Character): void {
    this.thrower = thrower;
  }

  /**
   * 状態に入った時のリセット
   */
  public onEnterState(): void {
    // 特に初期化なし
  }

  /**
   * 状態から出る時のリセット
   */
  public onExitState(): void {
    this.waitPosition = null;
    this.thrower = null;
  }

  /**
   * AIの更新処理
   * 待機位置は既にGameScene.executeThrowInReset()で設定されているため、
   * ここでは静止してスローワーの方向を向くだけ
   */
  public update(_deltaTime: number): void {
    // 静止してアイドルモーションを再生
    if (this.character.getCurrentMotionName() !== 'idle') {
      this.character.playMotion(IDLE_MOTION);
    }
    this.character.stopMovement();

    // スローワーの方向を向く
    if (this.thrower) {
      const myPosition = this.character.getPosition();
      const throwerPosition = this.thrower.getPosition();
      const toThrower = new Vector3(
        throwerPosition.x - myPosition.x,
        0,
        throwerPosition.z - myPosition.z
      );
      if (toThrower.length() > 0.01) {
        const angle = Math.atan2(toThrower.x, toThrower.z);
        this.character.setRotation(angle);
      }
    }
  }
}
