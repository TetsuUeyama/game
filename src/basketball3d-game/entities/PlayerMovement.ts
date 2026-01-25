import { Vector3, Scene, MeshBuilder, StandardMaterial, Color3, Mesh } from "@babylonjs/core";
import { Player } from "./Player";
import { PhysicsConstants } from "../../physics/PhysicsConfig";

/**
 * プレイヤーの移動を管理するクラス
 * 物理ベースの移動制御（Babylon.js標準API使用）
 */
export class PlayerMovement {
  private player: Player;

  // 移動状態
  private velocity: Vector3 = Vector3.Zero();
  private mass: number;

  // デバッグ表示用
  private debugMesh: Mesh | null = null;
  private debugMode: boolean = false;
  private reachableRangeMesh: Mesh | null = null;
  private showReachableRange: boolean = false;

  // 移動制御パラメータ
  private readonly baseMoveForce: number = PhysicsConstants.PLAYER.MOVE_FORCE;
  private readonly stopThreshold: number = 0.5;
  private readonly maxSpeed: number = PhysicsConstants.PLAYER.MAX_SPEED;
  private readonly frictionCoefficient: number = PhysicsConstants.PLAYER.FRICTION;

  // 方向別の移動速度係数
  private readonly forwardSpeedMultiplier: number = 1.0;
  private readonly sidewaysSpeedMultiplier: number = 0.6;
  private readonly backwardSpeedMultiplier: number = 0.5;

  // ダッシュ関連
  private isDashing: boolean = false;
  private dashTimeRemaining: number = 0;
  private dashCooldown: number = 0;
  private readonly DASH_DURATION: number = 0.5;
  private readonly DASH_COOLDOWN: number = 2.0;
  private readonly DASH_FORCE_MULTIPLIER: number = 2.5;

  constructor(player: Player) {
    this.player = player;
    this.mass = player.stats.weight;
    console.log(`[PlayerMovement] Player ${player.id} - Weight: ${this.mass}kg`);
  }

  /**
   * デバッグ表示の設定
   */
  setDebugMode(enabled: boolean, scene?: Scene): void {
    this.debugMode = enabled;

    if (enabled && scene && !this.debugMesh) {
      this.debugMesh = MeshBuilder.CreateSphere(
        `centerOfMass_player${this.player.id}`,
        { diameter: 0.3 },
        scene
      );

      const material = new StandardMaterial(`comMaterial_player${this.player.id}`, scene);
      material.diffuseColor = new Color3(1, 1, 0);
      material.alpha = 0.5;
      this.debugMesh.material = material;
    }

    if (this.debugMesh) {
      this.debugMesh.setEnabled(enabled);
    }
  }

  /**
   * デバッグメッシュの位置を更新
   */
  public updateDebugMesh(): void {
    if (this.debugMesh && this.debugMode) {
      this.debugMesh.position = this.player.getPosition();
    }
  }

  /**
   * ダッシュを開始
   */
  startDash(): boolean {
    if (this.dashCooldown > 0 || this.isDashing) {
      return false;
    }

    this.isDashing = true;
    this.dashTimeRemaining = this.DASH_DURATION;
    this.dashCooldown = this.DASH_COOLDOWN;
    console.log(`[DASH] Player ${this.player.id} started dash!`);
    return true;
  }

  /**
   * ダッシュ状態を更新
   */
  updateDash(deltaTime: number): void {
    if (this.isDashing) {
      this.dashTimeRemaining -= deltaTime;
      if (this.dashTimeRemaining <= 0) {
        this.isDashing = false;
        console.log(`[DASH] Player ${this.player.id} dash ended`);
      }
    }

    if (this.dashCooldown > 0) {
      this.dashCooldown -= deltaTime;
    }
  }

  /**
   * ダッシュ中かどうかを取得
   */
  getIsDashing(): boolean {
    return this.isDashing;
  }

  /**
   * ダッシュクールダウンを取得
   */
  getDashCooldown(): number {
    return this.dashCooldown;
  }

  /**
   * 力を加える（F = ma を使用）
   */
  private applyForce(force: Vector3, deltaTime: number): void {
    // 加速度を計算（a = F/m）
    const acceleration = force.scale(1 / this.mass);

    // 速度を更新（v += a * dt）- Babylon.js Scalar使用
    this.velocity.addInPlace(acceleration.scale(deltaTime));

    // 最大速度を制限
    const currentSpeed = this.velocity.length();
    if (currentSpeed > this.maxSpeed) {
      this.velocity.normalize().scaleInPlace(this.maxSpeed);
    }
  }

  /**
   * 摩擦を適用
   */
  private applyFriction(deltaTime: number): void {
    const frictionForce = this.velocity.scale(-this.frictionCoefficient * this.mass * 10);
    this.applyForce(frictionForce, deltaTime);

    // 速度が非常に小さくなったら停止
    if (this.velocity.length() < 0.01) {
      this.velocity = Vector3.Zero();
    }
  }

  /**
   * 物理演算を更新
   */
  updatePhysics(deltaTime: number): void {
    this.updateDash(deltaTime);
    this.applyFriction(deltaTime);

    // 位置を更新（p += v * dt）
    const movement = this.velocity.scale(deltaTime);
    const currentPosition = this.player.getPosition();
    const newPosition = currentPosition.add(movement);
    newPosition.y = currentPosition.y; // Y座標はジャンプ管理に任せる

    this.player.setPosition(newPosition);
    this.updateDebugMesh();

    if (this.showReachableRange && this.player.scene) {
      this.updateReachableRangeMesh(this.player.scene);
    }
  }

  /**
   * 向きを設定（ラジアン）
   */
  setDirection(angle: number): void {
    this.player.direction = angle;
    this.player.mesh.rotation.y = angle;
  }

  /**
   * 左右に移動（ストレイフ）
   */
  moveSideways(direction: "left" | "right", deltaTime: number): void {
    const currentDirection = this.player.direction;

    const sidewaysAngle = direction === "left"
      ? currentDirection - Math.PI / 2
      : currentDirection + Math.PI / 2;

    const directionX = Math.sin(sidewaysAngle);
    const directionZ = Math.cos(sidewaysAngle);

    // 切り返し判定
    const forwardX = Math.sin(currentDirection);
    const forwardZ = Math.cos(currentDirection);
    const leftX = -forwardZ;
    const leftZ = forwardX;
    const currentSidewaysVelocity = this.velocity.x * leftX + this.velocity.z * leftZ;

    const isChangingDirection =
      (direction === "left" && currentSidewaysVelocity < -0.5) ||
      (direction === "right" && currentSidewaysVelocity > 0.5);

    const changeDirMultiplier = isChangingDirection ? 1.5 : 1.0;
    const sidewaysForce = this.baseMoveForce * this.sidewaysSpeedMultiplier * changeDirMultiplier;
    const force = new Vector3(directionX * sidewaysForce, 0, directionZ * sidewaysForce);

    this.applyForce(force, deltaTime);
    this.updatePhysics(deltaTime);
  }

  /**
   * 体の向きに対する移動方向から速度係数を計算
   */
  private calculateSpeedMultiplier(angleDifference: number): number {
    const absAngle = Math.abs(angleDifference);

    if (absAngle < Math.PI / 4) {
      return this.forwardSpeedMultiplier;
    } else if (absAngle < (Math.PI * 3) / 4) {
      return this.sidewaysSpeedMultiplier;
    } else {
      return this.backwardSpeedMultiplier;
    }
  }

  /**
   * 2つの角度の差を計算（-π ~ π の範囲に正規化）
   */
  private normalizeAngleDifference(angle1: number, angle2: number): number {
    let diff = angle2 - angle1;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  /**
   * ターゲット位置に向かって移動する
   */
  moveTowards(targetPosition: Vector3, deltaTime: number): boolean {
    const currentPosition = this.player.getPosition();

    const dx = targetPosition.x - currentPosition.x;
    const dz = targetPosition.z - currentPosition.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    if (horizontalDistance < this.stopThreshold) {
      return false;
    }

    const directionX = dx / horizontalDistance;
    const directionZ = dz / horizontalDistance;
    const moveAngle = Math.atan2(directionX, directionZ);

    const currentDirection = this.player.direction;
    const angleDifference = this.normalizeAngleDifference(currentDirection, moveAngle);
    const speedMultiplier = this.calculateSpeedMultiplier(angleDifference);

    const dashMultiplier = this.isDashing ? this.DASH_FORCE_MULTIPLIER : 1.0;
    const adjustedForce = this.baseMoveForce * speedMultiplier * dashMultiplier;
    const force = new Vector3(directionX * adjustedForce, 0, directionZ * adjustedForce);

    this.applyForce(force, deltaTime);
    this.updatePhysics(deltaTime);

    return true;
  }

  /**
   * 現在の位置を取得
   */
  getCenterOfMassPosition(): Vector3 {
    return this.player.getPosition().clone();
  }

  /**
   * 現在の速度を取得
   */
  getCenterOfMassVelocity(): Vector3 {
    return this.velocity.clone();
  }

  /**
   * プレイヤーの質量を取得
   */
  getMass(): number {
    return this.mass;
  }

  /**
   * 次の1秒間に移動可能な範囲を計算
   */
  private calculateReachableRange(timeHorizon: number = 1.0): {
    forward: number;
    sideways: number;
    backward: number;
  } {
    const playerDirection = this.player.direction;

    const forwardDistance = this.simulateMovementInDirection(
      this.velocity.clone(),
      playerDirection,
      0,
      timeHorizon
    );

    const sidewaysDistance = this.simulateMovementInDirection(
      this.velocity.clone(),
      playerDirection,
      Math.PI / 2,
      timeHorizon
    );

    const backwardDistance = this.simulateMovementInDirection(
      this.velocity.clone(),
      playerDirection,
      Math.PI,
      timeHorizon
    );

    return {
      forward: forwardDistance,
      sideways: sidewaysDistance,
      backward: backwardDistance,
    };
  }

  /**
   * 特定方向への移動をシミュレーション
   */
  private simulateMovementInDirection(
    initialVelocity: Vector3,
    playerDirection: number,
    moveAngleOffset: number,
    duration: number
  ): number {
    const dt = 0.05;
    const steps = Math.floor(duration / dt);

    const moveDirection = playerDirection + moveAngleOffset;
    const moveDirX = Math.sin(moveDirection);
    const moveDirZ = Math.cos(moveDirection);

    const velocity = initialVelocity.clone();
    let totalDistance = 0;

    for (let i = 0; i < steps; i++) {
      const speedMultiplier = this.calculateSpeedMultiplier(moveAngleOffset);
      const force = this.baseMoveForce * speedMultiplier;

      // 加速度計算
      const accelerationX = (moveDirX * force) / this.mass;
      const accelerationZ = (moveDirZ * force) / this.mass;

      velocity.x += accelerationX * dt;
      velocity.z += accelerationZ * dt;

      // 摩擦
      const frictionForceX = -velocity.x * this.frictionCoefficient * this.mass * 10;
      const frictionForceZ = -velocity.z * this.frictionCoefficient * this.mass * 10;
      velocity.x += (frictionForceX / this.mass) * dt;
      velocity.z += (frictionForceZ / this.mass) * dt;

      // 最大速度制限
      const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      if (currentSpeed > this.maxSpeed) {
        const scale = this.maxSpeed / currentSpeed;
        velocity.x *= scale;
        velocity.z *= scale;
      }

      if (Math.abs(velocity.x) < 0.01 && Math.abs(velocity.z) < 0.01) {
        velocity.x = 0;
        velocity.z = 0;
      }

      const distanceThisStep = (velocity.x * moveDirX + velocity.z * moveDirZ) * dt;
      if (distanceThisStep > 0) {
        totalDistance += distanceThisStep;
      }
    }

    return Math.max(0, totalDistance);
  }

  /**
   * 移動可能範囲メッシュを作成/更新
   */
  private updateReachableRangeMesh(scene: Scene): void {
    if (!this.showReachableRange) {
      if (this.reachableRangeMesh) {
        this.reachableRangeMesh.dispose();
        this.reachableRangeMesh = null;
      }
      return;
    }

    const range = this.calculateReachableRange();
    const radiusX = range.sideways;
    const radiusZ = (range.forward + range.backward) / 2;

    if (this.reachableRangeMesh) {
      this.reachableRangeMesh.dispose();
    }

    this.reachableRangeMesh = MeshBuilder.CreateDisc(
      `reachableRange_player${this.player.id}`,
      { radius: 1, tessellation: 64 },
      scene
    );

    this.reachableRangeMesh.scaling.x = radiusX;
    this.reachableRangeMesh.scaling.z = radiusZ;
    this.reachableRangeMesh.rotation.x = Math.PI / 2;
    this.reachableRangeMesh.rotation.y = this.player.direction;

    const playerPos = this.player.getPosition();
    this.reachableRangeMesh.position = new Vector3(playerPos.x, 0.02, playerPos.z);

    const centerOffset = (range.forward - range.backward) / 2;
    const offsetX = Math.sin(this.player.direction) * centerOffset;
    const offsetZ = Math.cos(this.player.direction) * centerOffset;
    this.reachableRangeMesh.position.x += offsetX;
    this.reachableRangeMesh.position.z += offsetZ;

    const material = new StandardMaterial(`reachableMaterial_player${this.player.id}`, scene);
    material.diffuseColor = this.player.id === 1 ? new Color3(0, 0.5, 1) : new Color3(1, 0.2, 0);
    material.alpha = 0.3;
    material.emissiveColor = material.diffuseColor.scale(0.5);
    this.reachableRangeMesh.material = material;
  }

  /**
   * 移動可能範囲表示の設定
   */
  setReachableRangeVisible(enabled: boolean, scene?: Scene): void {
    this.showReachableRange = enabled;
    if (enabled && scene) {
      this.updateReachableRangeMesh(scene);
    } else if (this.reachableRangeMesh) {
      this.reachableRangeMesh.dispose();
      this.reachableRangeMesh = null;
    }
  }

  /**
   * デバッグメッシュを破棄
   */
  dispose(): void {
    if (this.debugMesh) {
      this.debugMesh.dispose();
      this.debugMesh = null;
    }
    if (this.reachableRangeMesh) {
      this.reachableRangeMesh.dispose();
      this.reachableRangeMesh = null;
    }
  }
}
