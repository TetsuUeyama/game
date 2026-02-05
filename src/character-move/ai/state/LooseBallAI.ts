import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";

/** ルーズボール追跡者の最大人数 */
const MAX_CHASERS_PER_TEAM = 2;

/** 自陣に戻る際のZ座標（守備エリア） */
const DEFENSIVE_ZONE_Z = {
  ALLY: -8.0,   // ally チームの守備エリア（goal2側）
  ENEMY: 8.0,   // enemy チームの守備エリア（goal1側）
};

/**
 * ルーズボール時のAI
 * ボールが誰にも保持されていない状態での行動を制御
 *
 * 改善: チームで1-2名のみがボールを追い、残りは自陣に戻る
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

    // 通常のルーズボール処理
    // チーム内で到達時間が早い1-2名のみがボールを追う
    const shouldChase = this.shouldChaseBall();

    if (shouldChase) {
      // 追跡者はボールを取りに行く
      this.moveTowardsBall(deltaTime);
    } else {
      // それ以外は自陣に戻る（相手ボールに備える）
      this.returnToDefensiveZone(deltaTime);
    }
  }

  /**
   * この選手がボールを追うべきかどうかを判定
   * チーム内で到達時間が早い順に1-2名のみがtrue
   */
  private shouldChaseBall(): boolean {
    const ballPosition = this.ball.getPosition();
    const myTeam = this.character.team;

    // 同じチームの選手をフィルタリング
    const teammates = this.allCharacters.filter(char => char.team === myTeam);

    // 各チームメイトの到達時間を計算
    const arrivalTimes: { character: Character; time: number }[] = teammates.map(char => {
      const distance = Vector3.Distance(char.getPosition(), ballPosition);
      // スピードを考慮した到達時間（スピードが高いほど早く到達）
      const speed = char.playerData?.stats.speed ?? 50;
      // スピード50で基準速度、100で1.5倍速として計算
      const speedMultiplier = 0.5 + (speed / 100);
      const baseSpeed = 5.0; // 基準移動速度 (m/s)
      const effectiveSpeed = baseSpeed * speedMultiplier;
      const time = distance / effectiveSpeed;
      return { character: char, time };
    });

    // 到達時間でソート（早い順）
    arrivalTimes.sort((a, b) => a.time - b.time);

    // 自分が上位MAX_CHASERS_PER_TEAM名以内かどうかをチェック
    const chaserCount = Math.min(MAX_CHASERS_PER_TEAM, arrivalTimes.length);
    for (let i = 0; i < chaserCount; i++) {
      if (arrivalTimes[i].character === this.character) {
        return true;
      }
    }

    return false;
  }

  /**
   * 自陣（守備エリア）に戻る
   */
  private returnToDefensiveZone(deltaTime: number): void {
    const myPosition = this.character.getPosition();
    const myTeam = this.character.team;

    // 自陣のZ座標を決定
    const defensiveZ = myTeam === 'ally' ? DEFENSIVE_ZONE_Z.ALLY : DEFENSIVE_ZONE_Z.ENEMY;

    // X座標はポジションに応じて分散（ペイントエリア周辺）
    // ポジションに基づいてX座標を決定
    let targetX = 0;
    const position = this.character.playerPosition;
    switch (position) {
      case 'PG':
        targetX = 0;      // 中央
        break;
      case 'SG':
        targetX = -3.0;   // 左サイド
        break;
      case 'SF':
        targetX = 3.0;    // 右サイド
        break;
      case 'PF':
        targetX = -1.5;   // 左インサイド
        break;
      case 'C':
        targetX = 1.5;    // 右インサイド
        break;
      default:
        targetX = (Math.random() - 0.5) * 6; // ランダム
    }

    const targetPosition = new Vector3(targetX, myPosition.y, defensiveZ);
    const distanceToTarget = Vector3.Distance(myPosition, targetPosition);

    // 既に守備エリアに近い場合はボール方向を見て待機
    if (distanceToTarget < 1.5) {
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

    // 守備エリアに向かって移動
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    ).normalize();

    const angle = Math.atan2(direction.x, direction.z);
    this.character.setRotation(angle);

    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    if (adjustedDirection) {
      this.character.move(adjustedDirection, deltaTime);

      // 距離が遠い場合はダッシュ
      if (distanceToTarget > 5.0) {
        if (this.character.getCurrentMotionName() !== 'dash_forward') {
          this.character.playMotion(DASH_FORWARD_MOTION);
        }
      } else {
        if (this.character.getCurrentMotionName() !== 'walk_forward') {
          this.character.playMotion(WALK_FORWARD_MOTION);
        }
      }
    } else {
      // 代替方向を試す
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
