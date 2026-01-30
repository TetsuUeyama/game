import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";

/**
 * オフボールオフェンス時のAI
 * ボールを持っていないオフェンスプレイヤーの動きを制御
 */
export class OffBallOffenseAI extends BaseStateAI {
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
   * センター(C)はゴール下に陣取る、それ以外はオンボールプレイヤーの周囲に留まる
   * シュート時はリバウンドポジションへ移動
   */
  public update(deltaTime: number): void {
    // ボールが飛行中（シュート中）の場合はリバウンドポジションへ
    if (this.ball.isInFlight()) {
      this.handleReboundPosition(deltaTime, true); // true = オフェンス側
      return;
    }

    // オンボールプレイヤーがシュートアクション中の場合もリバウンドポジションへ
    const onBallPlayer = this.findOnBallPlayer();
    if (onBallPlayer) {
      const actionController = onBallPlayer.getActionController();
      const currentAction = actionController.getCurrentAction();
      if (currentAction && currentAction.startsWith('shoot_')) {
        this.handleReboundPosition(deltaTime, true);
        return;
      }
    }

    // センターポジションはゴール下に陣取る
    if (this.character.playerPosition === 'C') {
      this.handleCenterOffense(deltaTime);
      return;
    }

    // オンボールプレイヤーがいない場合は待機
    if (!onBallPlayer) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    const onBallPosition = onBallPlayer.getPosition();
    const currentPosition = this.character.getPosition();
    const currentDistance = Vector3.Distance(currentPosition, onBallPosition);

    const minDistance = 2.0;
    const maxDistance = 5.0;
    const targetDistance = 4.0;

    // 近すぎる場合は離れる
    if (currentDistance < minDistance) {
      const awayDirection = new Vector3(
        currentPosition.x - onBallPosition.x,
        0,
        currentPosition.z - onBallPosition.z
      );

      if (awayDirection.length() > 0.01) {
        awayDirection.normalize();
        const adjustedDirection = this.adjustDirectionForCollision(awayDirection, deltaTime);

        if (adjustedDirection) {
          this.faceTowards(onBallPlayer);
          this.character.move(adjustedDirection, deltaTime);

          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        }
        return;
      }
    }

    // 適正距離内は待機
    if (currentDistance >= minDistance && currentDistance <= maxDistance) {
      this.faceTowards(onBallPlayer);
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 遠すぎる場合は近づく
    if (currentDistance > maxDistance) {
      const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Backboard() : this.field.getGoal2Backboard();
      const goalPosition = attackingGoal.position;

      const toGoalDirection = new Vector3(
        goalPosition.x - onBallPosition.x,
        0,
        goalPosition.z - onBallPosition.z
      );

      if (toGoalDirection.length() > 0.01) {
        toGoalDirection.normalize();

        const targetPosition = new Vector3(
          onBallPosition.x + toGoalDirection.x * targetDistance,
          onBallPosition.y,
          onBallPosition.z + toGoalDirection.z * targetDistance
        );

        this.moveTowardsPosition(targetPosition, onBallPlayer, deltaTime);
      }
    }
  }

  /**
   * センターオフェンスの処理（ゴール下に陣取る）
   */
  private handleCenterOffense(deltaTime: number): void {
    // 攻めるべきゴールを決定
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Rim() : this.field.getGoal2Rim();
    const goalPosition = attackingGoal.position;

    // ゴール下の目標位置（ゴールから2m手前）
    const zOffset = this.character.team === "ally" ? -2.0 : 2.0;
    const targetPosition = new Vector3(
      goalPosition.x,
      this.character.getPosition().y,
      goalPosition.z + zOffset
    );

    const currentPosition = this.character.getPosition();
    const distanceToTarget = Vector3.Distance(currentPosition, targetPosition);

    // 目標位置に近い場合は待機（ボール保持者の方を向く）
    if (distanceToTarget < 0.5) {
      const onBallPlayer = this.findOnBallPlayer();
      if (onBallPlayer) {
        this.faceTowards(onBallPlayer);
      }
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 目標位置に向かって移動
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    direction.normalize();

    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    if (adjustedDirection) {
      // 移動方向を向く
      const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
      this.character.setRotation(angle);

      this.character.move(adjustedDirection, deltaTime);

      if (distanceToTarget > 3.0) {
        if (this.character.getCurrentMotionName() !== 'dash_forward') {
          this.character.playMotion(DASH_FORWARD_MOTION);
        }
      } else {
        if (this.character.getCurrentMotionName() !== 'walk_forward') {
          this.character.playMotion(WALK_FORWARD_MOTION);
        }
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * 目標位置に向かって移動（オンボールプレイヤーを見ながら）
   */
  private moveTowardsPosition(targetPosition: Vector3, lookAtTarget: Character, deltaTime: number): void {
    const currentPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    const distanceToTarget = direction.length();

    if (distanceToTarget > 0.3) {
      direction.normalize();

      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
      if (!boundaryAdjusted) {
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
        return;
      }

      const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);

      if (adjustedDirection) {
        this.faceTowards(lookAtTarget);
        this.character.move(adjustedDirection, deltaTime);

        if (distanceToTarget > 3.0) {
          if (this.character.getCurrentMotionName() !== 'dash_forward') {
            this.character.playMotion(DASH_FORWARD_MOTION);
          }
        } else {
          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        }
      } else {
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
      }
    } else {
      this.faceTowards(lookAtTarget);
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * リバウンドポジションへ移動（シュート時）
   * @param deltaTime 経過時間
   * @param isOffense オフェンス側かどうか
   */
  private handleReboundPosition(deltaTime: number, isOffense: boolean): void {
    // ボールの速度からシュートが打たれたゴールを判定
    const ballVelocity = this.ball.getVelocity();
    const isGoal1 = ballVelocity.z > 0; // +Z方向ならgoal1

    // シュートが打たれたゴールに向かう
    const targetGoal = isGoal1 ? this.field.getGoal1Rim() : this.field.getGoal2Rim();

    const goalPosition = targetGoal.position;
    const myPosition = this.character.getPosition();

    // リバウンドポジション（ゴールから2〜3m手前、少し左右にずらす）
    const zOffset = isGoal1 ? -2.5 : 2.5;
    // オフェンスとディフェンスで左右にずらす
    const xOffset = isOffense ? -1.0 : 1.0;

    const reboundPosition = new Vector3(
      goalPosition.x + xOffset,
      myPosition.y,
      goalPosition.z + zOffset
    );

    const distanceToRebound = Vector3.Distance(myPosition, reboundPosition);

    // リバウンドポジションに近い場合はボールを見て待機
    if (distanceToRebound < 0.5) {
      // ボールの方を向く
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

    // リバウンドポジションに向かってダッシュ
    const direction = new Vector3(
      reboundPosition.x - myPosition.x,
      0,
      reboundPosition.z - myPosition.z
    );
    direction.normalize();

    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    if (adjustedDirection) {
      // 移動方向を向く
      const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
      this.character.setRotation(angle);

      this.character.move(adjustedDirection, deltaTime);

      // ダッシュで移動
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }
}
