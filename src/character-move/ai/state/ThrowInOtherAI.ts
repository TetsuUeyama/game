import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { ThrowInBaseAI } from "./ThrowInBaseAI";
import { PlayerStateManager } from "../../state";
import { Formation, FormationUtils, PlayerPosition } from "../../config/FormationConfig";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";

/**
 * スローイン中の他プレイヤーAI
 * スローイン中に待機する人の動作を制御
 *
 * IMPROVEMENT_PLAN.md: フェーズ3 - ThrowInBaseAIを継承してリファクタリング
 *
 * 責務:
 * - フォーメーション位置で待機
 * - ボールの方向を向く
 */
export class ThrowInOtherAI extends ThrowInBaseAI {
  // フォーメーション
  private currentFormation: Formation;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field,
    playerState?: PlayerStateManager
  ) {
    super(character, ball, allCharacters, field, playerState);
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
   * 現在未使用 - 将来の実装用に保持
   */
  public setTargetPosition(_position: Vector3): void {
    // 将来の実装用
  }

  /**
   * 状態に入った時のリセット
   */
  public override onEnterState(): void {
    // 将来の実装用
  }

  /**
   * 状態から出る時のリセット
   */
  public override onExitState(): void {
    // 将来の実装用
  }

  /**
   * AIの更新処理
   * 位置は既にGameScene.executeThrowInReset()で設定されているため、
   * ここではボールの方向を向いて静止するだけ
   *
   * ただし、パスターゲットになった場合はパスを受ける準備をする
   */
  public update(_deltaTime: number): void {
    // パスターゲットの場合、パスを受ける準備をする
    const passTarget = this.ball.getPassTarget();
    if (passTarget === this.character) {
      this.handlePassReceive();
      return;
    }

    // 静止してアイドルモーション（基底クラスの共通処理）
    this.stopAndIdle();

    // ボールの方向を向く（基底クラスの共通処理）
    this.faceTowardsBall();
  }

  /**
   * パスを受け取るための処理
   * パスターゲットになった場合、ボールの方向を向いて待機
   * ボールが近づいてきたら微調整して捕球しやすい位置に移動
   */
  private handlePassReceive(): void {
    const myPosition = this.character.getPosition();
    const ballPosition = this.ball.getPosition();

    // ボールの方向を向く
    const toBall = new Vector3(
      ballPosition.x - myPosition.x,
      0,
      ballPosition.z - myPosition.z
    );
    const distanceToBall = toBall.length();

    if (distanceToBall > 0.01) {
      const ballAngle = Math.atan2(toBall.x, toBall.z);
      this.character.setRotation(ballAngle);
    }

    // ボールが非常に近い場合（1.5m以内）、ボールに向かって少し移動
    if (distanceToBall < 1.5 && distanceToBall > 0.3) {
      toBall.normalize();
      const moveSpeed = 2.0;
      this.character.velocity = new Vector3(
        toBall.x * moveSpeed,
        0,
        toBall.z * moveSpeed
      );

      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    } else {
      // 停止してボールを待つ
      this.stopAndIdle();
    }
  }

  /**
   * フォーメーション位置を取得
   */
  public getFormationPosition(): { x: number; z: number } | null {
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
