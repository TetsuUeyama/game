import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { ThrowInBaseAI } from "./ThrowInBaseAI";

/**
 * スローインレシーバーAI
 * スローインを受ける人の動作を制御
 *
 * IMPROVEMENT_PLAN.md: フェーズ3 - ThrowInBaseAIを継承してリファクタリング
 *
 * 責務:
 * - 指定位置で待機
 * - スローワーの方向を向く
 * - ボールを受け取る準備
 */
export class ThrowInReceiverAI extends ThrowInBaseAI {
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
   * 現在未使用 - 将来の実装用に保持
   */
  public setWaitPosition(_position: Vector3): void {
    // 将来の実装用
  }

  /**
   * スローワーを設定
   */
  public setThrower(thrower: Character): void {
    this.thrower = thrower;
  }

  /**
   * 状態から出る時のリセット
   */
  public override onExitState(): void {
    this.thrower = null;
  }

  /**
   * AIの更新処理
   * 待機位置は既にGameScene.executeThrowInReset()で設定されているため、
   * ここでは静止してスローワーの方向を向くだけ
   */
  public update(_deltaTime: number): void {
    // 静止してアイドルモーション（基底クラスの共通処理）
    this.stopAndIdle();

    // スローワーの方向を向く（基底クラスの共通処理）
    this.faceTowardsCharacter(this.thrower);
  }
}
