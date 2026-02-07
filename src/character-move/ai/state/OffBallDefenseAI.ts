import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";
import { Formation, FormationUtils, PlayerPosition } from "../../config/FormationConfig";
import { SAFE_BOUNDARY_CONFIG } from "../../config/gameConfig";

/**
 * オフボールディフェンダー時のAI
 * 同じポジションのオフェンスプレイヤーをマンマークする
 * シュート時はリバウンドポジションへ移動
 */
export class OffBallDefenseAI extends BaseStateAI {
  private currentFormation: Formation;
  private decisionTimer: number = 0;
  private cachedTargetPosition: { x: number; z: number; markTarget: Character | null } | null = null;

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
    // ボールが飛行中（シュート中）の場合はその場でボールを見守る
    // シュート結果が出るまで動かない
    if (this.ball.isInFlight()) {
      this.handleWatchShot();
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
        // シュートモーション中もボールを見守る
        this.handleWatchShot();
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
    // 判断タイマーを更新
    this.decisionTimer += deltaTime;

    // 判断間隔に達したら目標位置を再計算
    if (this.decisionTimer >= this.getDecisionInterval() || this.cachedTargetPosition === null) {
      this.decisionTimer = 0;
      this.recalculateThrowInMarkPosition();
    }

    // キャッシュされた目標がない場合はフォーメーション位置へ
    if (!this.cachedTargetPosition || !this.cachedTargetPosition.markTarget) {
      this.handleFormationPositionAvoidingEdge(deltaTime);
      return;
    }

    const myPosition = this.character.getPosition();
    const idealPosition = new Vector3(
      this.cachedTargetPosition.x,
      myPosition.y,
      this.cachedTargetPosition.z
    );

    // 理想位置に向かって移動
    this.moveTowardsMarkPosition(idealPosition, this.cachedTargetPosition.markTarget, deltaTime);
  }

  /**
   * スローイン時のマーク位置を再計算してキャッシュ
   */
  private recalculateThrowInMarkPosition(): void {
    // マークする相手を探す
    const markTarget = this.findMarkTarget();

    if (!markTarget) {
      this.cachedTargetPosition = null;
      return;
    }

    // マーク対象の位置を取得
    const targetPosition = markTarget.getPosition();

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

    // 外側マスを避ける（最外周マージン以内に入らない）
    idealX = Math.max(SAFE_BOUNDARY_CONFIG.minX, Math.min(SAFE_BOUNDARY_CONFIG.maxX, idealX));
    idealZ = Math.max(SAFE_BOUNDARY_CONFIG.minZ, Math.min(SAFE_BOUNDARY_CONFIG.maxZ, idealZ));

    this.cachedTargetPosition = {
      x: idealX,
      z: idealZ,
      markTarget: markTarget,
    };
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
    const safeX = Math.max(SAFE_BOUNDARY_CONFIG.minX, Math.min(SAFE_BOUNDARY_CONFIG.maxX, targetPos.x));
    const safeZ = Math.max(SAFE_BOUNDARY_CONFIG.minZ, Math.min(SAFE_BOUNDARY_CONFIG.maxZ, targetPos.z));

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
    // 判断タイマーを更新
    this.decisionTimer += deltaTime;

    // 判断間隔に達したら目標位置を再計算
    if (this.decisionTimer >= this.getDecisionInterval() || this.cachedTargetPosition === null) {
      this.decisionTimer = 0;
      this.recalculateMarkPosition();
    }

    // キャッシュされた目標がない場合はフォーメーション位置へ
    if (!this.cachedTargetPosition || !this.cachedTargetPosition.markTarget) {
      this.handleFormationPosition(deltaTime);
      return;
    }

    const myPosition = this.character.getPosition();
    const idealPosition = new Vector3(
      this.cachedTargetPosition.x,
      myPosition.y,
      this.cachedTargetPosition.z
    );

    // 理想位置に向かって移動
    this.moveTowardsMarkPosition(idealPosition, this.cachedTargetPosition.markTarget, deltaTime);
  }

  /**
   * マーク位置を再計算してキャッシュ
   */
  private recalculateMarkPosition(): void {
    // マークする相手を探す
    const markTarget = this.findMarkTarget();

    if (!markTarget) {
      this.cachedTargetPosition = null;
      return;
    }

    // マーク対象の位置を取得
    const targetPosition = markTarget.getPosition();

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
    this.cachedTargetPosition = {
      x: targetPosition.x + targetToGoal.x * markDistance,
      z: targetPosition.z + targetToGoal.z * markDistance,
      markTarget: markTarget,
    };
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
}
