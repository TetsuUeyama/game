import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { Field } from "../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../motion/DashMotion";

/**
 * オフボールディフェンダー時のAI
 * ボールを持っていない相手をマークする
 */
export class OffBallDefenseAI extends BaseStateAI {
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
   * 相手チームのセンター（またはオフボールプレイヤー）をマークする
   * シュート時はリバウンドポジションへ移動
   */
  public update(deltaTime: number): void {
    // ボールが飛行中（シュート中）の場合はリバウンドポジションへ
    if (this.ball.isInFlight()) {
      this.handleReboundPosition(deltaTime, false); // false = ディフェンス側
      return;
    }

    // オンボールプレイヤーがシュートアクション中の場合もリバウンドポジションへ
    const onBallPlayer = this.findOnBallPlayer();
    if (onBallPlayer) {
      const actionController = onBallPlayer.getActionController();
      const currentAction = actionController.getCurrentAction();
      if (currentAction && currentAction.startsWith('shoot_')) {
        this.handleReboundPosition(deltaTime, false);
        return;
      }
    }

    // マークする相手を探す（センター優先、なければオフボールプレイヤー）
    const markTarget = this.findMarkTarget();
    if (!markTarget) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    const targetPosition = markTarget.getPosition();
    const myPosition = this.character.getPosition();
    const distanceToTarget = Vector3.Distance(myPosition, targetPosition);

    // マーク距離（相手との距離）
    const markDistance = 1.0;

    // 相手に十分近い場合は待機してマーク
    if (distanceToTarget <= markDistance) {
      this.faceTowards(markTarget);
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 相手に近づく（自チームのゴール方向からマーク）
    const defendingGoal = this.character.team === "ally" ? this.field.getGoal2Rim() : this.field.getGoal1Rim();
    const goalPosition = defendingGoal.position;

    // 相手からゴール方向へのベクトル
    const toGoal = new Vector3(
      goalPosition.x - targetPosition.x,
      0,
      goalPosition.z - targetPosition.z
    );

    if (toGoal.length() > 0.01) {
      toGoal.normalize();

      // 相手とゴールの間に位置取り
      const markPosition = new Vector3(
        targetPosition.x + toGoal.x * markDistance,
        myPosition.y,
        targetPosition.z + toGoal.z * markDistance
      );

      // マーク位置に向かって移動
      const direction = new Vector3(
        markPosition.x - myPosition.x,
        0,
        markPosition.z - myPosition.z
      );

      const distanceToMark = direction.length();

      if (distanceToMark > 0.3) {
        direction.normalize();

        const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

        if (adjustedDirection) {
          this.faceTowards(markTarget);
          this.character.move(adjustedDirection, deltaTime);

          if (distanceToMark > 3.0) {
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
        this.faceTowards(markTarget);
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
      }
    }
  }

  /**
   * マークする相手を探す（同ポジションマッチアップ）
   * ディフェンスは相手チームの同ポジションをマークする
   */
  private findMarkTarget(): Character | null {
    const opponentTeam = this.character.team === 'ally' ? 'enemy' : 'ally';
    const myPosition = this.character.playerPosition;

    // 同ポジションの相手を探す
    if (myPosition) {
      for (const char of this.allCharacters) {
        if (char.team === opponentTeam && char.playerPosition === myPosition) {
          return char;
        }
      }
    }

    // 同ポジションが見つからなければオフボールプレイヤーを探す
    return this.findOffBallPlayer();
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
