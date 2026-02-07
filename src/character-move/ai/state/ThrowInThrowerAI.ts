import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { ThrowInBaseAI } from "./ThrowInBaseAI";
import { PlayerStateManager } from "../../state";

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
 *
 * IMPROVEMENT_PLAN.md: フェーズ3 - ThrowInBaseAIを継承してリファクタリング
 *
 * 責務:
 * - コート外の指定位置で静止
 * - レシーバーの方向を向く
 * - パス実行を待つ
 */
export class ThrowInThrowerAI extends ThrowInBaseAI {
  // スローインレシーバー（外部から設定）
  private receiver: Character | null = null;
  // スローイン実行コールバック
  private executeCallback: ThrowInExecuteCallback | null = null;

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
   * スローイン位置を設定
   * 現在未使用 - 将来の実装用に保持
   */
  public setThrowInPosition(_position: Vector3): void {
    // 将来の実装用
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
   * 状態から出る時のリセット
   */
  public override onExitState(): void {
    this.receiver = null;
    this.executeCallback = null;
  }

  /**
   * AIの更新処理
   * スローイン位置は既にGameScene.executeThrowInReset()で設定されているため、
   * ここでは静止してレシーバーの方向を向くだけ
   */
  public update(_deltaTime: number): void {
    // 静止してアイドルモーション（基底クラスの共通処理）
    this.stopAndIdle();

    // レシーバーの方向を向く（基底クラスの共通処理）
    this.faceTowardsCharacter(this.receiver);
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
