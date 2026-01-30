/**
 * BalanceController（重心コントローラー）
 *
 * キャラクターの重心球（ビー玉）の状態を管理する。
 * 物理計算はutils/BalancePhysicsに委譲。
 */

import { Vector3 } from "@babylonjs/core";
import {
  BALANCE_PHYSICS,
  BALANCE_THRESHOLD,
  ACTION_FORCES,
  ACTION_TYPE_FORCES,
} from "../config/BalanceConfig";
import type { ActionType } from "../config/action/ActionConfig";
import {
  BalanceSphereState,
  PlayerPhysicsParams,
  CollisionResult,
  calculatePlayerPhysics,
  calculateAgility,
  calculateStability,
  calculatePushPower,
  calculateSpringDamperForce,
  integrateMotion,
  clampPosition,
  calculateCollision,
  canTransition,
  isNeutral,
  estimateRecoveryTime,
  getHorizontalOffset,
  getWeightForceFactor,
  clamp,
} from "../utils/BalancePhysics";

// 型をre-export
export type { BalanceSphereState, CollisionResult };

/**
 * 重心コントローラー
 */
export class BalanceController {
  private state: BalanceSphereState;
  private physicsParams: PlayerPhysicsParams;

  /** 選手の体重・身長 */
  private weight: number = BALANCE_PHYSICS.BASE_WEIGHT;
  private height: number = BALANCE_PHYSICS.BASE_HEIGHT;

  /** 現在適用中の外部力 */
  private externalForce: Vector3 = Vector3.Zero();
  private forceEndTime: number = 0;

  constructor() {
    this.physicsParams = calculatePlayerPhysics(this.weight, this.height);
    this.state = this.createInitialState();
  }

  /**
   * 初期状態を作成
   */
  private createInitialState(): BalanceSphereState {
    const restPos = new Vector3(0, this.physicsParams.restHeight, 0);
    return {
      position: restPos.clone(),
      velocity: Vector3.Zero(),
      mass: this.physicsParams.mass,
      radius: this.physicsParams.radius,
      restPosition: restPos,
      isLocked: false,
      isGrounded: true,
    };
  }

  /**
   * 選手データを設定
   */
  setPlayerData(weight: number, height: number): void {
    this.weight = clamp(weight, 50, 150);
    this.height = clamp(height, 1.6, 2.3);
    this.physicsParams = calculatePlayerPhysics(this.weight, this.height);

    // 状態を更新
    this.state.mass = this.physicsParams.mass;
    this.state.radius = this.physicsParams.radius;
    this.state.restPosition = new Vector3(0, this.physicsParams.restHeight, 0);
    // 位置もリセット（restPositionと同じ位置に）
    this.state.position = this.state.restPosition.clone();
    this.state.velocity = Vector3.Zero();
  }

  // ==========================================================================
  // 状態取得
  // ==========================================================================

  /**
   * 現在の状態を取得
   */
  getState(): BalanceSphereState {
    return {
      ...this.state,
      position: this.state.position.clone(),
      velocity: this.state.velocity.clone(),
      restPosition: this.state.restPosition.clone(),
    };
  }

  /**
   * 重心位置を取得
   */
  getPosition(): Vector3 {
    return this.state.position.clone();
  }

  /**
   * 重心のオフセット（基準位置からのずれ）を取得
   */
  getOffset(): Vector3 {
    return this.state.position.subtract(this.state.restPosition);
  }

  /**
   * 水平方向のオフセット距離を取得
   */
  getHorizontalOffset(): number {
    return getHorizontalOffset(this.state.position, this.state.restPosition);
  }

  /**
   * 次のアクションに遷移可能か判定
   */
  canTransition(): boolean {
    return canTransition(this.state);
  }

  /**
   * ニュートラル状態か判定
   */
  isNeutral(): boolean {
    return isNeutral(this.state);
  }

  /**
   * 遷移可能になるまでの推定時間を取得（秒）
   */
  getEstimatedRecoveryTime(): number {
    return estimateRecoveryTime(this.state, this.physicsParams.damping);
  }

  /**
   * 切り返しの素早さを取得（0-1）
   */
  getAgilityFactor(): number {
    return calculateAgility(this.weight, this.height);
  }

  /**
   * 押し込み力を取得
   */
  getPushPower(): number {
    return calculatePushPower(this.state.mass, this.state.velocity);
  }

  /**
   * 安定性を取得（0-1）
   */
  getStability(): number {
    return calculateStability(
      this.height,
      this.getHorizontalOffset(),
      this.state.velocity.length(),
      this.state.isGrounded
    );
  }

  // ==========================================================================
  // 力の適用
  // ==========================================================================

  /**
   * アクションによる力を適用（汎用アクション名）
   */
  applyActionForce(actionName: string): void {
    const config = ACTION_FORCES[actionName];
    if (!config) return;

    // 体重による力の調整
    const weightFactor = getWeightForceFactor(this.weight);
    this.externalForce = config.force.scale(weightFactor);
    this.forceEndTime = Date.now() + config.duration * 1000;

    // ロック設定
    if (config.lock) {
      this.state.isLocked = true;
      this.state.isGrounded = false;
    }
  }

  /**
   * ActionTypeによる力を適用（recoveryTime/cooldownTimeの代替）
   * アクション実行時に呼び出し、重心にアクション固有の力を加える
   */
  applyActionTypeForce(actionType: ActionType): void {
    const config = ACTION_TYPE_FORCES[actionType];
    if (!config) {
      console.warn(`[BalanceController] No force config for action type: ${actionType}`);
      return;
    }

    // 体重による力の調整
    const weightFactor = getWeightForceFactor(this.weight);
    this.externalForce = config.force.scale(weightFactor);
    this.forceEndTime = Date.now() + config.duration * 1000;

    // ロック設定（ジャンプ系アクション）
    if (config.lock) {
      this.state.isLocked = true;
      this.state.isGrounded = false;
    }
  }

  /**
   * 指定したアクションが実行可能かどうか判定
   * 重心が安定していて、ロック中でなければ実行可能
   */
  canPerformAction(_actionType: ActionType): boolean {
    // ロック中は不可
    if (this.state.isLocked) {
      return false;
    }

    // 重心が安定しているか
    return this.canTransition();
  }

  /**
   * カスタム力を適用
   */
  applyForce(force: Vector3, duration: number = 0.1): void {
    const weightFactor = getWeightForceFactor(this.weight);
    this.externalForce = force.scale(weightFactor);
    this.forceEndTime = Date.now() + duration * 1000;
  }

  /**
   * 衝撃を与える（瞬間的な速度変化）
   */
  applyImpulse(impulse: Vector3): void {
    const velocityChange = impulse.scale(1 / this.state.mass);
    this.state.velocity = this.state.velocity.add(velocityChange);
  }

  // ==========================================================================
  // 衝突処理
  // ==========================================================================

  /**
   * 他のキャラクターとの衝突処理
   */
  collideWith(other: BalanceController, contactNormal: Vector3): CollisionResult {
    const result = calculateCollision(
      this.state,
      other.getState(),
      this.height,
      other.height,
      contactNormal
    );

    if (result.occurred) {
      // 自分の速度を更新
      this.state.velocity = this.state.velocity.add(result.velocityChangeA);
    }

    return {
      occurred: result.occurred,
      velocityChangeA: result.velocityChangeA,
      velocityChangeB: result.velocityChangeB,
      impulseMagnitude: result.impulseMagnitude,
      destabilizedA: result.destabilizedA,
      destabilizedB: result.destabilizedB,
      knockedBackA: result.knockedBackA,
      knockedBackB: result.knockedBackB,
    };
  }

  // ==========================================================================
  // ロック制御
  // ==========================================================================

  /**
   * ロックを解除（着地時など）
   */
  unlock(): void {
    this.state.isLocked = false;
    this.state.isGrounded = true;

    // 着地時の衝撃
    if (this.state.velocity.y < -2) {
      const landingImpact = Math.abs(this.state.velocity.y) * 0.1;
      this.state.velocity.x *= (1 + landingImpact);
      this.state.velocity.z *= (1 + landingImpact);
    }
    this.state.velocity.y = 0;

    // 位置のY座標を基準位置にリセット（着地したので地面に戻る）
    this.state.position.y = this.state.restPosition.y;
  }

  /**
   * ロック状態を取得
   */
  isLocked(): boolean {
    return this.state.isLocked;
  }

  // ==========================================================================
  // 更新処理
  // ==========================================================================

  /**
   * 毎フレーム更新
   */
  update(deltaTime: number): void {
    const now = Date.now();

    // ロック中は限定的な更新のみ
    if (this.state.isLocked) {
      if (!this.state.isGrounded) {
        // 空中では重力のみ適用
        this.state.velocity.y -= BALANCE_PHYSICS.GRAVITY * deltaTime * 0.1;
      }
      const newPosition = this.state.position.add(this.state.velocity.scale(deltaTime));
      // ロック中でも位置は制限する（無限に落下しないように）
      this.state.position = clampPosition(newPosition, this.state.restPosition);
      return;
    }

    // 力の計算
    let totalForce = Vector3.Zero();

    // 1. 外部力
    if (now < this.forceEndTime) {
      totalForce = totalForce.add(this.externalForce);
    } else {
      this.externalForce = Vector3.Zero();
    }

    // 2. バネ-ダンパー力
    const springDamperForce = calculateSpringDamperForce(
      this.state.position,
      this.state.velocity,
      this.state.restPosition,
      this.physicsParams.springConstant,
      this.physicsParams.damping
    );
    totalForce = totalForce.add(springDamperForce);

    // 3. 運動方程式を積分
    const { position, velocity } = integrateMotion(
      this.state.position,
      this.state.velocity,
      totalForce,
      this.state.mass,
      deltaTime
    );

    this.state.velocity = velocity;
    this.state.position = clampPosition(position, this.state.restPosition);

    // ニュートラル状態への収束
    if (this.state.velocity.length() < 0.01 &&
        this.getOffset().length() < BALANCE_THRESHOLD.NEUTRAL) {
      this.state.velocity = Vector3.Zero();
      this.state.position = this.state.restPosition.clone();
    }
  }

  /**
   * 強制リセット
   */
  reset(): void {
    this.state.position = this.state.restPosition.clone();
    this.state.velocity = Vector3.Zero();
    this.state.isLocked = false;
    this.state.isGrounded = true;
    this.externalForce = Vector3.Zero();
    this.forceEndTime = 0;
  }

  // ==========================================================================
  // デバッグ
  // ==========================================================================

  /**
   * デバッグ情報を取得
   */
  getDebugInfo(): {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    offset: number;
    speed: number;
    mass: number;
    radius: number;
    canTransition: boolean;
    isNeutral: boolean;
    isLocked: boolean;
    stability: number;
    agility: number;
    pushPower: number;
    estimatedRecoveryTime: number;
    springConstant: number;
    damping: number;
  } {
    const pos = this.state.position;
    const vel = this.state.velocity;
    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      velocity: { x: vel.x, y: vel.y, z: vel.z },
      offset: this.getHorizontalOffset(),
      speed: vel.length(),
      mass: this.state.mass,
      radius: this.state.radius,
      canTransition: this.canTransition(),
      isNeutral: this.isNeutral(),
      isLocked: this.state.isLocked,
      stability: this.getStability(),
      agility: this.getAgilityFactor(),
      pushPower: this.getPushPower(),
      estimatedRecoveryTime: this.getEstimatedRecoveryTime(),
      springConstant: this.physicsParams.springConstant,
      damping: this.physicsParams.damping,
    };
  }
}
