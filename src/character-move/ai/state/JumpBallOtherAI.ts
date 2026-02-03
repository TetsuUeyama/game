import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";

/**
 * ジャンプボール待機選手AI
 * ジャンプボール中に参加しない選手の動作を制御
 *
 * 責務:
 * - センターサークル外側で待機
 * - ボールの方向を向く
 * - ジャンプボール終了まで静止
 */
export class JumpBallOtherAI extends BaseStateAI {
  /** 待機位置（センターサークル外） */
  private waitPosition: Vector3 | null = null;

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
   * 状態に入った時のリセット
   */
  public onEnterState(): void {
    this.waitPosition = null;
  }

  /**
   * 状態から出る時のリセット
   */
  public onExitState(): void {
    this.waitPosition = null;
  }

  /**
   * AIの更新処理
   */
  public update(_deltaTime: number): void {
    // 待機位置に移動（位置が設定されている場合）
    if (this.waitPosition) {
      const myPos = this.character.getPosition();
      const distanceToPosition = Vector3.Distance(
        new Vector3(myPos.x, 0, myPos.z),
        new Vector3(this.waitPosition.x, 0, this.waitPosition.z)
      );

      if (distanceToPosition > 0.5) {
        // 位置に向かって移動
        this.moveTowards(this.waitPosition, _deltaTime, 0.3);
        return;
      }
    }

    // 静止してアイドルモーション
    if (this.character.getCurrentMotionName() !== 'idle') {
      this.character.playMotion(IDLE_MOTION);
    }
    this.character.stopMovement();

    // ボールの方向を向く
    this.faceTowardsBall();
  }

  /**
   * ボールの方向を向く
   */
  private faceTowardsBall(): void {
    const ballPos = this.ball.getPosition();
    const myPos = this.character.getPosition();

    const direction = new Vector3(
      ballPos.x - myPos.x,
      0,
      ballPos.z - myPos.z
    );

    if (direction.length() > 0.01) {
      const angle = Math.atan2(direction.x, direction.z);
      this.character.setRotation(angle);
    }
  }

  /**
   * 待機位置を取得
   */
  public getWaitPosition(): Vector3 | null {
    return this.waitPosition;
  }
}
