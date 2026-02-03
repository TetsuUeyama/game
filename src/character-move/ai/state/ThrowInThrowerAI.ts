import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";

/**
 * スローインを投げる人用のコールバック
 */
export type ThrowInExecuteCallback = (
  thrower: Character,
  receiver: Character
) => void;

/**
 * スローインスローワーAI
 * スローインを投げる人の動作を制御
 * - コート外の指定位置で静止
 * - レシーバーの方向を向く
 * - パス実行を待つ
 */
export class ThrowInThrowerAI extends BaseStateAI {
  // スローイン位置（外部から設定）
  private throwInPosition: Vector3 | null = null;
  // スローインレシーバー（外部から設定）
  private receiver: Character | null = null;
  // スローイン実行コールバック
  private executeCallback: ThrowInExecuteCallback | null = null;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
  }

  /**
   * スローイン位置を設定
   */
  public setThrowInPosition(position: Vector3): void {
    this.throwInPosition = position;
  }

  /**
   * レシーバーを設定
   */
  public setReceiver(receiver: Character): void {
    this.receiver = receiver;
  }

  /**
   * スローイン実行コールバックを設定
   */
  public setExecuteCallback(callback: ThrowInExecuteCallback): void {
    this.executeCallback = callback;
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
    this.throwInPosition = null;
    this.receiver = null;
    this.executeCallback = null;
  }

  /**
   * AIの更新処理
   * スローイン位置は既にGameScene.executeThrowInReset()で設定されているため、
   * ここでは静止してレシーバーの方向を向くだけ
   */
  public update(_deltaTime: number): void {
    // 静止してアイドルモーションを再生
    if (this.character.getCurrentMotionName() !== 'idle') {
      this.character.playMotion(IDLE_MOTION);
    }
    this.character.stopMovement();

    // レシーバーの方向を向く
    if (this.receiver) {
      const myPosition = this.character.getPosition();
      const receiverPosition = this.receiver.getPosition();
      const toReceiver = new Vector3(
        receiverPosition.x - myPosition.x,
        0,
        receiverPosition.z - myPosition.z
      );
      if (toReceiver.length() > 0.01) {
        const angle = Math.atan2(toReceiver.x, toReceiver.z);
        this.character.setRotation(angle);
      }
    }
  }

  /**
   * スローインを実行（外部から呼び出し）
   */
  public executeThrowIn(): boolean {
    if (!this.receiver || !this.executeCallback) {
      return false;
    }
    this.executeCallback(this.character, this.receiver);
    return true;
  }
}
