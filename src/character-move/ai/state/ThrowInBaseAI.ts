import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { PlayerStateManager } from "../../state";

/**
 * スローイン系AIの基底クラス
 *
 * IMPROVEMENT_PLAN.md: フェーズ3 - ThrowIn系AIクラスの統合
 *
 * 共通処理:
 * - 静止してアイドルモーションを再生
 * - 特定の方向を向く処理
 * - 位置への移動と向き調整
 *
 * サブクラス:
 * - ThrowInThrowerAI: スローインを投げる人
 * - ThrowInReceiverAI: スローインを受ける人
 * - ThrowInOtherAI: スローイン中の他プレイヤー
 */
export abstract class ThrowInBaseAI extends BaseStateAI {
  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field,
    playerState?: PlayerStateManager
  ) {
    super(character, ball, allCharacters, field, playerState);
  }

  /**
   * 状態に入った時のリセット（サブクラスでオーバーライド可能）
   */
  public onEnterState(): void {
    // デフォルトでは何もしない
  }

  /**
   * 状態から出る時のリセット（サブクラスでオーバーライド可能）
   */
  public onExitState(): void {
    // デフォルトでは何もしない
  }

  /**
   * 静止してアイドルモーションを再生
   * 共通処理としてサブクラスから呼び出す
   */
  protected stopAndIdle(): void {
    if (this.character.getCurrentMotionName() !== 'idle') {
      this.character.playMotion(IDLE_MOTION);
    }
    this.character.stopMovement();
  }

  /**
   * 指定した位置の方向を向く
   * 注意: 基底クラスのfaceTowards(Character)と区別するためfaceTowardsPositionに変更
   * @param targetPosition 向く方向の位置
   */
  protected faceTowardsPosition(targetPosition: Vector3): void {
    const myPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );
    if (direction.length() > 0.01) {
      const angle = Math.atan2(direction.x, direction.z);
      this.character.setRotation(angle);
    }
  }

  /**
   * キャラクターの方向を向く
   * @param targetCharacter 向く対象のキャラクター
   */
  protected faceTowardsCharacter(targetCharacter: Character | null): void {
    if (targetCharacter) {
      this.faceTowardsPosition(targetCharacter.getPosition());
    }
  }

  /**
   * ボールの方向を向く
   */
  protected faceTowardsBall(): void {
    this.faceTowardsPosition(this.ball.getPosition());
  }

  /**
   * 指定位置に移動し、到着したら向き調整
   * @param targetPosition 移動先の位置
   * @param deltaTime 経過時間
   * @param arrivalThreshold 到着判定距離（デフォルト: 0.5m）
   * @returns 到着したかどうか
   */
  protected moveToPositionAndFace(
    targetPosition: Vector3,
    deltaTime: number,
    arrivalThreshold: number = 0.5
  ): boolean {
    const myPos = this.character.getPosition();
    const distance = Vector3.Distance(myPos, targetPosition);

    if (distance > arrivalThreshold) {
      // まだ到着していない - 移動
      this.moveTowards(targetPosition, deltaTime, arrivalThreshold);
      return false;
    } else {
      // 到着 - 停止してアイドル
      this.stopAndIdle();
      return true;
    }
  }

  /**
   * AIの更新処理（サブクラスで実装必須）
   */
  public abstract update(deltaTime: number): void;
}
