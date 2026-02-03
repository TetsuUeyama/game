import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";

/**
 * ルーズボール時のAI
 * ボールが誰にも保持されていない状態での行動を制御
 *
 * IMPROVEMENT_PLAN.md: バグ2修正 - 衝突時に代替方向を試す処理を追加
 */
export class LooseBallAI extends BaseStateAI {
  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
  }

  /**
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    const ballPosition = this.ball.getPosition();

    // ゴール近くでのリバウンド状況かチェック
    const goal1Position = this.field.getGoal1Rim().position;
    const goal2Position = this.field.getGoal2Rim().position;
    const distanceToGoal1 = Vector3.Distance(ballPosition, goal1Position);
    const distanceToGoal2 = Vector3.Distance(ballPosition, goal2Position);
    const isNearGoal = distanceToGoal1 < 5.0 || distanceToGoal2 < 5.0;

    // リバウンド状況の場合
    if (isNearGoal) {
      // ボールに最も近い選手かどうかをチェック
      const isClosestToBall = this.isClosestToBall();

      if (isClosestToBall) {
        // 最も近い選手はボールを取りに行く
        this.moveTowardsBall(deltaTime);
      } else {
        // その他の選手はゴール下で待機（リバウンドポジション）
        this.waitAtReboundPosition(deltaTime, distanceToGoal1 < distanceToGoal2);
      }
      return;
    }

    // 通常のボールロスト処理（全員がボールを取りに行く）
    this.moveTowardsBall(deltaTime);
  }

  /**
   * 自分がボールに最も近い選手かどうかをチェック
   */
  private isClosestToBall(): boolean {
    const ballPosition = this.ball.getPosition();
    const myDistance = Vector3.Distance(this.character.getPosition(), ballPosition);

    for (const char of this.allCharacters) {
      if (char === this.character) continue;
      const distance = Vector3.Distance(char.getPosition(), ballPosition);
      if (distance < myDistance) {
        return false;
      }
    }
    return true;
  }

  /**
   * ボールに向かって移動
   * IMPROVEMENT_PLAN.md: バグ2修正 - 衝突時に代替方向を試す
   */
  private moveTowardsBall(deltaTime: number): void {
    const ballPosition = this.ball.getPosition();
    const myPosition = this.character.getPosition();

    const direction = new Vector3(
      ballPosition.x - myPosition.x,
      0,
      ballPosition.z - myPosition.z
    );

    const distance = direction.length();

    if (distance > 0.01) {
      direction.normalize();

      const angle = Math.atan2(direction.x, direction.z);
      this.character.setRotation(angle);

      if (distance > 2.0) {
        const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

        if (adjustedDirection) {
          this.character.move(adjustedDirection, deltaTime);

          if (this.character.getCurrentMotionName() !== 'dash_forward') {
            this.character.playMotion(DASH_FORWARD_MOTION);
          }
        } else {
          // IMPROVEMENT_PLAN.md: バグ2修正 - 衝突で移動できない場合、代替方向を試す
          const alternativeDir = this.tryAlternativeDirection(direction, deltaTime);
          if (alternativeDir) {
            this.character.move(alternativeDir, deltaTime);
            if (this.character.getCurrentMotionName() !== 'walk_forward') {
              this.character.playMotion(WALK_FORWARD_MOTION);
            }
          } else {
            if (this.character.getCurrentMotionName() !== 'idle') {
              this.character.playMotion(IDLE_MOTION);
            }
          }
        }
      } else {
        const slowDirection = direction.scale(0.5);
        const adjustedDirection = this.adjustDirectionForCollision(slowDirection, deltaTime);

        if (adjustedDirection) {
          this.character.move(adjustedDirection, deltaTime);

          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        } else {
          // IMPROVEMENT_PLAN.md: バグ2修正 - 衝突で移動できない場合、代替方向を試す
          const alternativeDir = this.tryAlternativeDirection(direction, deltaTime);
          if (alternativeDir) {
            this.character.move(alternativeDir, deltaTime);
            if (this.character.getCurrentMotionName() !== 'walk_forward') {
              this.character.playMotion(WALK_FORWARD_MOTION);
            }
          } else {
            if (this.character.getCurrentMotionName() !== 'idle') {
              this.character.playMotion(IDLE_MOTION);
            }
          }
        }
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * 代替方向を試す
   * IMPROVEMENT_PLAN.md: バグ2修正 - 衝突時に複数の方向を試す
   * @param originalDirection 元の移動方向
   * @param deltaTime 経過時間
   * @returns 移動可能な方向、見つからない場合はnull
   */
  private tryAlternativeDirection(originalDirection: Vector3, deltaTime: number): Vector3 | null {
    // 複数の角度で代替方向を試す（左右に45度、90度、135度）
    const angles = [45, -45, 90, -90, 135, -135];

    for (const angleDeg of angles) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);

      // Y軸周りの回転を適用
      const altDirection = new Vector3(
        originalDirection.x * cos - originalDirection.z * sin,
        0,
        originalDirection.x * sin + originalDirection.z * cos
      );

      const adjusted = this.adjustDirectionForCollision(altDirection, deltaTime);
      if (adjusted) {
        return adjusted;
      }
    }

    // すべての方向がブロックされている場合
    return null;
  }

  /**
   * リバウンドポジションで待機
   */
  private waitAtReboundPosition(deltaTime: number, isGoal1: boolean): void {
    const targetGoal = isGoal1 ? this.field.getGoal1Rim() : this.field.getGoal2Rim();
    const goalPosition = targetGoal.position;
    const myPosition = this.character.getPosition();

    // ゴール下のリバウンドポジション
    const zOffset = isGoal1 ? -2.5 : 2.5;
    const xOffset = this.character.team === 'ally' ? -1.0 : 1.0;

    const reboundPosition = new Vector3(
      goalPosition.x + xOffset,
      myPosition.y,
      goalPosition.z + zOffset
    );

    const distanceToRebound = Vector3.Distance(myPosition, reboundPosition);

    // リバウンドポジションに近い場合はボールを見て待機
    if (distanceToRebound < 1.0) {
      const ballPosition = this.ball.getPosition();
      const toBall = new Vector3(
        ballPosition.x - myPosition.x,
        0,
        ballPosition.z - myPosition.z
      );
      if (toBall.length() > 0.01) {
        const angle = Math.atan2(toBall.x, toBall.z);
        this.character.setRotation(angle);
      }

      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // リバウンドポジションに移動
    const direction = new Vector3(
      reboundPosition.x - myPosition.x,
      0,
      reboundPosition.z - myPosition.z
    );
    direction.normalize();

    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    if (adjustedDirection) {
      const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
      this.character.setRotation(angle);

      this.character.move(adjustedDirection, deltaTime);

      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }
}
