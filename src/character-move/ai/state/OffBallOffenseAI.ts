import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";
import { Formation, FormationUtils, PlayerPosition } from "../../config/FormationConfig";

/**
 * オフボールオフェンス時のAI
 * ボールを持っていないオフェンスプレイヤーの動きを制御
 * フォーメーションに従って指定位置に移動する（ヒートマップ方式）
 */
export class OffBallOffenseAI extends BaseStateAI {
  private currentFormation: Formation;

  // ヒートマップ式ポジショニング用
  private currentTargetPosition: { x: number; z: number } | null = null;
  private currentTargetCell: string | null = null;
  private positionReevaluateTimer: number = 0;
  private readonly positionReevaluateInterval: number = 1.0; // 1秒ごとに再評価
  private readonly centerWeight: number = 0.55; // 中心セルに55%の確率

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
    this.currentFormation = FormationUtils.getDefaultOffenseFormation();
  }

  /**
   * フォーメーションを設定
   */
  public setFormation(formation: Formation): void {
    this.currentFormation = formation;
    // フォーメーション変更時は目標位置をリセット
    this.resetTargetPosition();
  }

  /**
   * フォーメーション名でフォーメーションを設定
   */
  public setFormationByName(name: string): boolean {
    const formation = FormationUtils.getOffenseFormation(name);
    if (formation) {
      this.currentFormation = formation;
      // フォーメーション変更時は目標位置をリセット
      this.resetTargetPosition();
      return true;
    }
    return false;
  }

  /**
   * 目標位置をリセット（次のupdateで再選択される）
   */
  public resetTargetPosition(): void {
    this.currentTargetPosition = null;
    this.currentTargetCell = null;
    this.positionReevaluateTimer = this.positionReevaluateInterval; // 即座に再評価
  }

  /**
   * 現在の目標位置を取得（パス軌道可視化用）
   * @returns 現在の目標位置（設定されていない場合はnull）
   */
  public getCurrentTargetPosition(): { x: number; z: number } | null {
    return this.currentTargetPosition;
  }

  /**
   * AIの更新処理
   * フォーメーションに従って指定位置に移動
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

    // フォーメーションに従って移動
    this.handleFormationPosition(deltaTime, onBallPlayer);
  }

  /**
   * フォーメーション位置への移動処理（ヒートマップ方式）
   */
  private handleFormationPosition(deltaTime: number, onBallPlayer: Character | null): void {
    const playerPosition = this.character.playerPosition as PlayerPosition;
    if (!playerPosition) {
      // ポジションが設定されていない場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 位置の再評価タイマーを更新
    this.positionReevaluateTimer += deltaTime;

    // 目標位置がないか、再評価間隔を超えた場合は新しい位置を選択
    const isAllyTeam = this.character.team === 'ally';
    if (!this.currentTargetPosition || this.positionReevaluateTimer >= this.positionReevaluateInterval) {
      this.selectNewTargetPosition(playerPosition, isAllyTeam);
      this.positionReevaluateTimer = 0;
    }

    if (!this.currentTargetPosition) {
      // 目標位置がない場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    const targetPosition = new Vector3(
      this.currentTargetPosition.x,
      this.character.getPosition().y,
      this.currentTargetPosition.z
    );

    // 目標位置に向かって移動
    if (onBallPlayer) {
      this.moveTowardsPosition(targetPosition, onBallPlayer, deltaTime);
    } else {
      this.moveTowardsPositionWithoutLookAt(targetPosition, deltaTime);
    }
  }

  /**
   * ヒートマップ方式で新しい目標位置を選択
   */
  private selectNewTargetPosition(playerPosition: PlayerPosition, isAllyTeam: boolean): void {
    const heatmapResult = FormationUtils.getHeatmapTargetPosition(
      this.currentFormation,
      playerPosition,
      isAllyTeam,
      this.centerWeight
    );

    if (heatmapResult) {
      this.currentTargetPosition = { x: heatmapResult.x, z: heatmapResult.z };
      this.currentTargetCell = heatmapResult.cell;
    } else {
      // フォールバック: 通常の目標位置を使用
      const targetPos = FormationUtils.getTargetPosition(
        this.currentFormation,
        playerPosition,
        isAllyTeam
      );
      if (targetPos) {
        this.currentTargetPosition = targetPos;
        this.currentTargetCell = null;
      }
    }
  }

  /**
   * 目標位置に向かって移動（見る対象なし）
   */
  private moveTowardsPositionWithoutLookAt(targetPosition: Vector3, deltaTime: number): void {
    const currentPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    const distanceToTarget = direction.length();

    // 目標に近い場合は待機
    if (distanceToTarget < 0.5) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

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
