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
 * オフボールディフェンダー時のAI
 * 同じポジションのオフェンスプレイヤーをマンマークする
 * シュート時はリバウンドポジションへ移動
 */
export class OffBallDefenseAI extends BaseStateAI {
  private currentFormation: Formation;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
    this.currentFormation = FormationUtils.getDefaultDefenseFormation();
  }

  /**
   * フォーメーションを設定
   */
  public setFormation(formation: Formation): void {
    this.currentFormation = formation;
  }

  /**
   * フォーメーション名でフォーメーションを設定
   */
  public setFormationByName(name: string): boolean {
    const formation = FormationUtils.getDefenseFormation(name);
    if (formation) {
      this.currentFormation = formation;
      return true;
    }
    return false;
  }

  /**
   * AIの更新処理
   * 同じポジションのオフェンスプレイヤーをマンマークする
   * シュート時はリバウンドポジションへ移動
   * スローイン時は外側マスを避ける
   */
  public update(deltaTime: number): void {
    // ボールが飛行中（シュート中）の場合はリバウンドポジションへ
    if (this.ball.isInFlight()) {
      this.handleReboundPosition(deltaTime, false); // false = ディフェンス側
      return;
    }

    // オンボールプレイヤーを取得
    const onBallPlayer = this.findOnBallPlayer();

    // スローイン中かチェック（相手チームがスローインスロワーの場合）
    if (onBallPlayer && onBallPlayer.getIsThrowInThrower()) {
      // スローイン中はマンマークしつつ外側マスを避ける
      this.handleThrowInDefense(deltaTime);
      return;
    }

    if (onBallPlayer) {
      const actionController = onBallPlayer.getActionController();
      const currentAction = actionController.getCurrentAction();
      if (currentAction && currentAction.startsWith('shoot_')) {
        this.handleReboundPosition(deltaTime, false);
        return;
      }
    }

    // 同じポジションのオフェンスプレイヤーをマンマーク
    this.handleManToManDefense(deltaTime);
  }

  /**
   * スローイン時のディフェンス処理
   * 外側マスに入らないようにしながらマンマークする
   */
  private handleThrowInDefense(deltaTime: number): void {
    // マークする相手を探す
    const markTarget = this.findMarkTarget();

    if (!markTarget) {
      // マーク対象がいない場合はフォーメーション位置へ（外側を避ける）
      this.handleFormationPositionAvoidingEdge(deltaTime);
      return;
    }

    // マーク対象の位置を取得
    const targetPosition = markTarget.getPosition();
    const myPosition = this.character.getPosition();

    // 守るべきゴールの位置を取得
    const defendingGoal = this.getDefendingGoalPosition();

    // マーク対象とゴールの間に位置取り
    const targetToGoal = new Vector3(
      defendingGoal.x - targetPosition.x,
      0,
      defendingGoal.z - targetPosition.z
    );

    if (targetToGoal.length() > 0.01) {
      targetToGoal.normalize();
    }

    // マーク対象から1.5m程度ゴール側に位置取り
    const markDistance = 1.5;
    let idealX = targetPosition.x + targetToGoal.x * markDistance;
    let idealZ = targetPosition.z + targetToGoal.z * markDistance;

    // 外側マスを避ける（最外周1.5m以内に入らない）
    const safeMinX = -6.0;  // -7.5 + 1.5
    const safeMaxX = 6.0;   // 7.5 - 1.5
    const safeMinZ = -13.5; // -15 + 1.5
    const safeMaxZ = 13.5;  // 15 - 1.5

    idealX = Math.max(safeMinX, Math.min(safeMaxX, idealX));
    idealZ = Math.max(safeMinZ, Math.min(safeMaxZ, idealZ));

    const idealPosition = new Vector3(idealX, myPosition.y, idealZ);

    // 理想位置に向かって移動
    this.moveTowardsMarkPosition(idealPosition, markTarget, deltaTime);
  }

  /**
   * 外側マスを避けながらフォーメーション位置へ移動
   */
  private handleFormationPositionAvoidingEdge(deltaTime: number): void {
    const playerPosition = this.character.playerPosition as PlayerPosition;
    if (!playerPosition) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // フォーメーションから目標位置を取得
    const isAllyTeam = this.character.team === 'ally';
    const targetPos = FormationUtils.getTargetPosition(
      this.currentFormation,
      playerPosition,
      isAllyTeam
    );

    if (!targetPos) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 外側マスを避ける
    const safeMinX = -6.0;
    const safeMaxX = 6.0;
    const safeMinZ = -13.5;
    const safeMaxZ = 13.5;

    const safeX = Math.max(safeMinX, Math.min(safeMaxX, targetPos.x));
    const safeZ = Math.max(safeMinZ, Math.min(safeMaxZ, targetPos.z));

    const targetPosition = new Vector3(
      safeX,
      this.character.getPosition().y,
      safeZ
    );

    this.moveTowardsFormationPosition(targetPosition, deltaTime);
  }

  /**
   * マンツーマンディフェンス処理
   * 同じポジションのオフェンスプレイヤーをマークする
   */
  private handleManToManDefense(deltaTime: number): void {
    // マークする相手を探す
    const markTarget = this.findMarkTarget();

    if (!markTarget) {
      // マーク対象がいない場合はフォーメーション位置へ
      this.handleFormationPosition(deltaTime);
      return;
    }

    // マーク対象の位置を取得
    const targetPosition = markTarget.getPosition();
    const myPosition = this.character.getPosition();

    // 守るべきゴールの位置を取得
    const defendingGoal = this.getDefendingGoalPosition();

    // マーク対象とゴールの間に位置取り（マーク対象から少し離れた位置）
    const targetToGoal = new Vector3(
      defendingGoal.x - targetPosition.x,
      0,
      defendingGoal.z - targetPosition.z
    );

    if (targetToGoal.length() > 0.01) {
      targetToGoal.normalize();
    }

    // マーク対象から1.5m程度ゴール側に位置取り
    const markDistance = 1.5;
    const idealPosition = new Vector3(
      targetPosition.x + targetToGoal.x * markDistance,
      myPosition.y,
      targetPosition.z + targetToGoal.z * markDistance
    );

    // 理想位置に向かって移動
    this.moveTowardsMarkPosition(idealPosition, markTarget, deltaTime);
  }

  /**
   * 守るべきゴールの位置を取得
   */
  private getDefendingGoalPosition(): Vector3 {
    // allyチームはgoal1を攻める → goal2を守る
    // enemyチームはgoal2を攻める → goal1を守る
    return this.field.getDefendingGoalRim(this.character.team);
  }

  /**
   * フォーメーション位置への移動処理（フォールバック用）
   */
  private handleFormationPosition(deltaTime: number): void {
    const playerPosition = this.character.playerPosition as PlayerPosition;
    if (!playerPosition) {
      // ポジションが設定されていない場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // フォーメーションから目標位置を取得
    const isAllyTeam = this.character.team === 'ally';
    const targetPos = FormationUtils.getTargetPosition(
      this.currentFormation,
      playerPosition,
      isAllyTeam
    );

    if (!targetPos) {
      // 目標位置がない場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    const targetPosition = new Vector3(
      targetPos.x,
      this.character.getPosition().y,
      targetPos.z
    );

    // 目標位置に向かって移動
    this.moveTowardsFormationPosition(targetPosition, deltaTime);
  }

  /**
   * マーク位置に向かって移動（マーク対象を見ながら）
   */
  private moveTowardsMarkPosition(targetPosition: Vector3, markTarget: Character, deltaTime: number): void {
    const currentPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    const distanceToTarget = direction.length();

    // マーク対象の方を向く
    const targetPos = markTarget.getPosition();
    const toTarget = new Vector3(
      targetPos.x - currentPosition.x,
      0,
      targetPos.z - currentPosition.z
    );
    if (toTarget.length() > 0.01) {
      const angle = Math.atan2(toTarget.x, toTarget.z);
      this.character.setRotation(angle);
    }

    // 目標に近い場合は待機
    if (distanceToTarget < 0.5) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    direction.normalize();

    // 移動方向を決定（境界チェック・衝突チェック）
    let moveDirection = direction;
    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
    if (boundaryAdjusted) {
      const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
      if (adjustedDirection) {
        moveDirection = adjustedDirection;
      }
    }

    this.character.move(moveDirection, deltaTime);

    if (distanceToTarget > 3.0) {
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    }
  }

  /**
   * フォーメーション位置に向かって移動
   */
  private moveTowardsFormationPosition(targetPosition: Vector3, deltaTime: number): void {
    const currentPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    const distanceToTarget = direction.length();

    // 目標に近い場合は待機（ボールの方を向く）
    if (distanceToTarget < 0.5) {
      const ballPosition = this.ball.getPosition();
      const toBall = new Vector3(
        ballPosition.x - currentPosition.x,
        0,
        ballPosition.z - currentPosition.z
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
   * マークする相手を探す（同ポジションマッチアップ）
   * マンツーマン時に使用
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
