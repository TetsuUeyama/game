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
  MOVEMENT_BALANCE,
} from "@/GamePlay/Object/Physics/Balance/BalanceConfig";
import type { ActionType } from "@/GamePlay/GameSystem/CharacterMove/Config/Action/ActionConfig";
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
} from "@/GamePlay/Object/Physics/Balance/BalancePhysics";

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
   * ActionTypeによる力をスケール付きで適用
   * Y成分（垂直方向）にスケールを掛けてジャンプ高さを調整する
   * @param actionType アクションタイプ
   * @param yScale Y成分のスケール倍率（1.0が標準）
   */
  applyActionTypeForceWithScale(actionType: ActionType, yScale: number): void {
    const config = ACTION_TYPE_FORCES[actionType];
    if (!config) {
      console.warn(`[BalanceController] No force config for action type: ${actionType}`);
      return;
    }

    // Y成分のみスケール（ジャンプ高さ）
    const scaledForce = new Vector3(
      config.force.x,
      config.force.y * yScale,
      config.force.z
    );

    // 体重による力の調整
    const weightFactor = getWeightForceFactor(this.weight);
    this.externalForce = scaledForce.scale(weightFactor);
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
   * ただしシュートアクションは重心チェックを緩和（キャッチ&シュート対応）
   */
  canPerformAction(actionType: ActionType): boolean {
    // ロック中は不可
    if (this.state.isLocked) {
      return false;
    }

    // シュートアクションは重心チェックをスキップ（レイアップは走りながら、他は止まった瞬間に打てる）
    if (actionType === 'shoot_layup' || actionType === 'shoot_3pt' || actionType === 'shoot_midrange') {
      return true;
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
  // 移動による重心力
  // ==========================================================================

  /**
   * 移動による重心力を適用
   * @param movementDirection 移動方向（正規化済み）
   * @param speed 移動速度（m/s）
   * @param isRunning 走行中かどうか
   * @param isDashing ダッシュ中かどうか
   */
  applyMovementForce(
    movementDirection: Vector3,
    speed: number,
    isRunning: boolean = false,
    isDashing: boolean = false
  ): void {
    // ロック中は適用しない
    if (this.state.isLocked) return;

    // 基本の力を決定
    let baseForce: number;
    if (isDashing) {
      baseForce = MOVEMENT_BALANCE.DASH_FORCE;
    } else if (isRunning) {
      baseForce = MOVEMENT_BALANCE.RUN_FORCE;
    } else {
      baseForce = MOVEMENT_BALANCE.WALK_FORCE;
    }

    // 速度に応じた追加の力
    const speedBonus = speed * MOVEMENT_BALANCE.SPEED_FORCE_SCALE;
    const totalForce = baseForce + speedBonus;

    // 進行方向に力を適用（重心が進行方向に傾く）
    const force = new Vector3(
      movementDirection.x * totalForce,
      -totalForce * 0.1, // 少し下向きの力（重心を低く）
      movementDirection.z * totalForce
    );

    // 体重による調整
    const weightFactor = getWeightForceFactor(this.weight);
    this.externalForce = force.scale(weightFactor);
    this.forceEndTime = Date.now() + 50; // 継続的な力（短い間隔で更新）
  }

  /**
   * 方向転換による重心力を適用
   * @param previousDirection 前の移動方向（正規化済み）
   * @param newDirection 新しい移動方向（正規化済み）
   * @param speed 現在の移動速度（m/s）
   */
  applyDirectionChangeForce(
    previousDirection: Vector3,
    newDirection: Vector3,
    speed: number
  ): void {
    // ロック中は適用しない
    if (this.state.isLocked) return;

    // 方向変化の角度を計算
    const dot = previousDirection.x * newDirection.x + previousDirection.z * newDirection.z;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))); // 0 ～ π

    // 角度に応じた力を決定
    let force: number;
    if (angle >= Math.PI * 0.9) {
      // ほぼ180度転換
      force = MOVEMENT_BALANCE.REVERSE_TURN_FORCE;
    } else if (angle >= MOVEMENT_BALANCE.SHARP_TURN_THRESHOLD) {
      // 急な方向転換（90度以上）
      force = MOVEMENT_BALANCE.SHARP_TURN_FORCE;
    } else if (angle >= MOVEMENT_BALANCE.LIGHT_TURN_THRESHOLD) {
      // 軽い方向転換（30～90度）
      const t = (angle - MOVEMENT_BALANCE.LIGHT_TURN_THRESHOLD) /
                (MOVEMENT_BALANCE.SHARP_TURN_THRESHOLD - MOVEMENT_BALANCE.LIGHT_TURN_THRESHOLD);
      force = MOVEMENT_BALANCE.LIGHT_TURN_FORCE +
              (MOVEMENT_BALANCE.SHARP_TURN_FORCE - MOVEMENT_BALANCE.LIGHT_TURN_FORCE) * t;
    } else {
      // 微小な方向変化は無視
      return;
    }

    // 速度が速いほど力が大きい
    const speedMultiplier = Math.max(1.0, speed / 3.0);
    force *= speedMultiplier;

    // 力の方向を計算（前の慣性方向に引っ張られる）
    // 新しい方向に対して前の方向の成分を力として加える
    const forceDirection = new Vector3(
      previousDirection.x - newDirection.x,
      0,
      previousDirection.z - newDirection.z
    );

    if (forceDirection.length() > 0.01) {
      forceDirection.normalize();
      const forceVector = new Vector3(
        forceDirection.x * force,
        -force * 0.05, // 少し下向き
        forceDirection.z * force
      );

      // 体重による調整
      const weightFactor = getWeightForceFactor(this.weight);
      this.externalForce = forceVector.scale(weightFactor);
      this.forceEndTime = Date.now() + MOVEMENT_BALANCE.TURN_FORCE_DURATION * 1000;
    }
  }

  /**
   * 急停止による重心力を適用
   * @param previousDirection 停止前の移動方向（正規化済み）
   * @param speed 停止前の速度（m/s）
   */
  applySuddenStopForce(previousDirection: Vector3, speed: number): void {
    // ロック中は適用しない
    if (this.state.isLocked) return;

    // 速度が閾値未満なら適用しない
    if (speed < MOVEMENT_BALANCE.SUDDEN_STOP_VELOCITY_THRESHOLD) {
      return;
    }

    // 速度に応じた力（速いほど前のめり）
    const speedMultiplier = speed / MOVEMENT_BALANCE.SUDDEN_STOP_VELOCITY_THRESHOLD;
    const force = MOVEMENT_BALANCE.SUDDEN_STOP_FORCE * speedMultiplier;

    // 進行方向に前のめりになる力
    const forceVector = new Vector3(
      previousDirection.x * force,
      force * 0.1, // 少し上向き（つんのめる感じ）
      previousDirection.z * force
    );

    // 体重による調整
    const weightFactor = getWeightForceFactor(this.weight);
    this.externalForce = forceVector.scale(weightFactor);
    this.forceEndTime = Date.now() + MOVEMENT_BALANCE.STOP_FORCE_DURATION * 1000;
  }

  /**
   * 移動開始による重心力を適用
   * @param startDirection 移動開始方向（正規化済み）
   */
  applyMovementStartForce(startDirection: Vector3): void {
    // ロック中は適用しない
    if (this.state.isLocked) return;

    const force = MOVEMENT_BALANCE.START_FORCE;

    // 移動方向の逆向きの力（慣性で後ろに引っ張られる）
    const forceVector = new Vector3(
      -startDirection.x * force,
      -force * 0.05,
      -startDirection.z * force
    );

    // 体重による調整
    const weightFactor = getWeightForceFactor(this.weight);
    this.externalForce = forceVector.scale(weightFactor);
    this.forceEndTime = Date.now() + MOVEMENT_BALANCE.START_FORCE_DURATION * 1000;
  }

  // ==========================================================================
  // 回転速度制限
  // ==========================================================================

  /**
   * 重心状態に基づく回転速度係数を取得（0〜1）
   *
   * 重心が安定していれば1.0（フル回転速度）、
   * 不安定なほど回転が遅くなる。
   */
  getTurnSpeedFactor(): number {
    // ロック中（空中）は制限なし
    if (this.state.isLocked) return 1.0;

    // 水平オフセット（基準位置からのずれ）
    const hOffset = this.getHorizontalOffset();
    // 水平速度
    const hSpeed = Math.sqrt(
      this.state.velocity.x * this.state.velocity.x +
      this.state.velocity.z * this.state.velocity.z
    );

    // オフセットが大きいほど回転が遅い（TRANSITION閾値の4倍で最大制限）
    const offsetPenalty = Math.min(1.0, hOffset / (BALANCE_THRESHOLD.TRANSITION * 4));
    // 速度が大きいほど回転が遅い（VELOCITY閾値の4倍で最大制限）
    const speedPenalty = Math.min(1.0, hSpeed / (BALANCE_THRESHOLD.VELOCITY * 4));

    // 大きい方のペナルティを採用
    const penalty = Math.max(offsetPenalty, speedPenalty);

    return Math.max(MOVEMENT_BALANCE.TURN_MIN_FACTOR, 1.0 - penalty);
  }

  /**
   * 回転による重心力を適用
   *
   * 体を回すと慣性で重心が横にずれる。
   * 回転量が大きいほど大きな力が加わる。
   *
   * @param turnAmount 実際に回転した量（ラジアン、符号付き）
   * @param characterRotation 回転後のキャラクター向き（ラジアン）
   */
  applyTurnForce(turnAmount: number, characterRotation: number): void {
    if (this.state.isLocked) return;
    if (Math.abs(turnAmount) < 0.001) return;

    const forceMagnitude = Math.abs(turnAmount) * MOVEMENT_BALANCE.TURN_FORCE_PER_RAD;

    // 回転の逆方向（慣性で体が振られる方向）に力を加える
    // 右回転(+) → 左方向に力、左回転(-) → 右方向に力
    const lateralAngle = characterRotation + (turnAmount > 0 ? -Math.PI / 2 : Math.PI / 2);
    const forceVector = new Vector3(
      Math.sin(lateralAngle) * forceMagnitude,
      -forceMagnitude * 0.05, // わずかに下向き
      Math.cos(lateralAngle) * forceMagnitude
    );

    const weightFactor = getWeightForceFactor(this.weight);
    this.externalForce = forceVector.scale(weightFactor);
    this.forceEndTime = Date.now() + 50; // 短い持続
  }

  // ==========================================================================
  // 移動方向制限
  // ==========================================================================

  /**
   * 移動方向に対する速度係数を取得（0〜1）
   *
   * 重心ボールが進行方向に動いていれば1.0（フルスピード）、
   * 違う方向に動いていれば低い値を返す。
   * ボールの慣性を止めて→新しい方向へ向ける必要があるため。
   *
   * @param intendedDirection 意図する移動方向（正規化済み）
   * @returns 速度係数 0〜1
   */
  getMovementSpeedFactor(intendedDirection: Vector3): number {
    // ロック中（空中）は制限なし
    if (this.state.isLocked) return 1.0;

    // 重心ボールの水平速度を取得
    const ballVelX = this.state.velocity.x;
    const ballVelZ = this.state.velocity.z;
    const ballSpeed = Math.sqrt(ballVelX * ballVelX + ballVelZ * ballVelZ);

    // ボールがほぼ静止 → 制限なし（静止からの発進を妨げない）
    if (ballSpeed < MOVEMENT_BALANCE.DIRECTION_RESTRICT_SPEED_THRESHOLD) {
      return 1.0;
    }

    // ボール速度方向と意図する移動方向の一致度（-1〜1）
    const alignment = (ballVelX * intendedDirection.x + ballVelZ * intendedDirection.z) / ballSpeed;

    // alignment: 1.0=同方向, 0=直角, -1=逆方向
    // rawFactor: 同方向=1.0, 直角以下=0
    const rawFactor = Math.max(0, alignment);

    // ボール速度が速いほど制限が強い（0=制限なし, 1=フル制限）
    const restrictionStrength = Math.min(
      1.0,
      (ballSpeed - MOVEMENT_BALANCE.DIRECTION_RESTRICT_SPEED_THRESHOLD) /
      (MOVEMENT_BALANCE.DIRECTION_RESTRICT_FULL_SPEED - MOVEMENT_BALANCE.DIRECTION_RESTRICT_SPEED_THRESHOLD)
    );

    // 最終係数: 制限なし(1.0)とrawFactorをブレンド
    const factor = 1.0 - restrictionStrength * (1.0 - rawFactor);

    return Math.max(MOVEMENT_BALANCE.DIRECTION_RESTRICT_MIN_FACTOR, factor);
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
