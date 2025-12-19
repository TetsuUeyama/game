import {Vector3, Scene, MeshBuilder, StandardMaterial, Color3, Mesh} from "@babylonjs/core";
import {Player} from "./Player";
import {PLAYER_CONFIG} from "../config/gameConfig";

/**
 * 重心（Center of Mass）クラス
 * 力ベースの物理演算でプレイヤーの移動を管理
 */
class CenterOfMass {
  public position: Vector3; // 重心の位置
  public velocity: Vector3; // 重心の速度（m/s）
  public mass: number; // 質量（kg）
  public radius: number; // 重心球の半径（m）

  // 物理パラメータ
  private readonly frictionCoefficient: number = 0.8; // 摩擦係数（0-1、高いほど速く止まる）
  private readonly maxSpeed: number = PLAYER_CONFIG.speed * 1.5; // 最大速度（m/s）

  constructor(initialPosition: Vector3, mass: number, radius: number = 0.15) {
    this.position = initialPosition.clone();
    this.velocity = Vector3.Zero();
    this.mass = mass;
    this.radius = radius;
  }

  /**
   * 力を加える（F = ma）
   * @param force 力ベクトル（N = kg·m/s²）
   * @param deltaTime フレーム時間（秒）
   */
  applyForce(force: Vector3, deltaTime: number): void {
    // 加速度を計算（a = F/m）
    const acceleration = force.scale(1 / this.mass);

    // 速度を更新（v += a * dt）
    this.velocity.addInPlace(acceleration.scale(deltaTime));

    // 最大速度を制限
    const currentSpeed = this.velocity.length();
    if (currentSpeed > this.maxSpeed) {
      this.velocity.normalize().scaleInPlace(this.maxSpeed);
    }
  }

  /**
   * 摩擦力を適用（地面との摩擦で減速）
   * @param deltaTime フレーム時間（秒）
   */
  applyFriction(deltaTime: number): void {
    // 摩擦による減速（速度に比例）
    const frictionForce = this.velocity.scale(-this.frictionCoefficient * this.mass * 10);
    this.applyForce(frictionForce, deltaTime);

    // 速度が非常に小さくなったら停止
    if (this.velocity.length() < 0.01) {
      this.velocity = Vector3.Zero();
    }
  }

  /**
   * 位置を更新（p += v * dt）
   * @param deltaTime フレーム時間（秒）
   */
  updatePosition(deltaTime: number): void {
    this.position.addInPlace(this.velocity.scale(deltaTime));
  }

  /**
   * 地面との衝突判定（Y座標の制限）
   */
  constrainToGround(groundY: number): void {
    if (this.position.y < groundY) {
      this.position.y = groundY;
      // 垂直方向の速度をゼロに（地面に着地）
      this.velocity.y = 0;
    }
  }
}

/**
 * プレイヤーの移動を管理するクラス
 * 重心ベースの物理演算で自然な移動を実現
 */
export class PlayerMovement {
  private player: Player;
  private centerOfMass: CenterOfMass;

  // デバッグ表示用
  private debugMesh: Mesh | null = null; // 重心球の可視化メッシュ
  private debugMode: boolean = false; // デバッグ表示のON/OFF
  private reachableRangeMesh: Mesh | null = null; // 移動可能範囲の可視化メッシュ
  private showReachableRange: boolean = false; // 移動可能範囲の表示ON/OFF

  // 移動制御パラメータ
  private readonly baseMoveForce: number = 2400; // 基準移動力（N）- 全プレイヤー共通
  private readonly stopThreshold: number = 0.5; // 目標位置に十分近いと判定する距離（m）

  // 方向別の移動速度係数
  private readonly forwardSpeedMultiplier: number = 1.0; // 前方移動: 100%
  private readonly sidewaysSpeedMultiplier: number = 0.6; // 横移動: 60%
  private readonly backwardSpeedMultiplier: number = 0.5; // 後方移動: 50%

  // ダッシュ関連
  private isDashing: boolean = false; // ダッシュ中か
  private dashTimeRemaining: number = 0; // ダッシュ残り時間（秒）
  private dashCooldown: number = 0; // ダッシュクールダウン（秒）
  private readonly DASH_DURATION: number = 0.5; // ダッシュ持続時間（秒）
  private readonly DASH_COOLDOWN: number = 2.0; // ダッシュクールダウン（秒）
  private readonly DASH_FORCE_MULTIPLIER: number = 2.5; // ダッシュ時の移動力倍率

  constructor(player: Player) {
    this.player = player;

    // 重心を初期化（プレイヤーの足元より少し上）
    const initialPosition = player.getPosition().clone();
    initialPosition.y = PLAYER_CONFIG.height / 2 - 0.3; // 中心からやや下

    // プレイヤーのステータスから体重を取得
    const playerWeight = player.stats.weight;
    this.centerOfMass = new CenterOfMass(initialPosition, playerWeight);

    console.log(`[PlayerMovement] Player ${player.id} - Weight: ${playerWeight}kg, Mass initialized`);
  }

  /**
   * デバッグ表示の設定
   */
  setDebugMode(enabled: boolean, scene?: Scene): void {
    this.debugMode = enabled;

    if (enabled && scene && !this.debugMesh) {
      // デバッグ球を作成
      this.debugMesh = MeshBuilder.CreateSphere(
        `centerOfMass_player${this.player.id}`,
        {diameter: this.centerOfMass.radius * 2},
        scene
      );

      const material = new StandardMaterial(`comMaterial_player${this.player.id}`, scene);
      material.diffuseColor = new Color3(1, 1, 0); // 黄色
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
      const debugPosition = this.centerOfMass.position.clone();
      // Y座標はプレイヤーの実際の高さに合わせる（ジャンプ時も追従）
      debugPosition.y = this.player.getPosition().y;
      this.debugMesh.position = debugPosition;
    }
  }

  /**
   * ダッシュを開始
   */
  startDash(): boolean {
    // クールダウン中またはダッシュ中の場合は開始できない
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
    // ダッシュ時間を減らす
    if (this.isDashing) {
      this.dashTimeRemaining -= deltaTime;
      if (this.dashTimeRemaining <= 0) {
        this.isDashing = false;
        console.log(`[DASH] Player ${this.player.id} dash ended`);
      }
    }

    // クールダウンを減らす
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
   * 物理演算を更新
   * @param deltaTime フレーム時間（秒）
   */
  updatePhysics(deltaTime: number): void {
    // ダッシュ状態を更新
    this.updateDash(deltaTime);

    // 摩擦を適用
    this.centerOfMass.applyFriction(deltaTime);

    // 位置を更新
    this.centerOfMass.updatePosition(deltaTime);

    // 地面との衝突判定
    const groundY = PLAYER_CONFIG.height / 2 - 0.3;
    this.centerOfMass.constrainToGround(groundY);

    // プレイヤーメッシュを重心位置に追従させる
    const playerPosition = this.centerOfMass.position.clone();
    playerPosition.y = this.player.getPosition().y; // Y座標はジャンプ管理に任せる
    this.player.setPosition(playerPosition);

    // デバッグ表示を更新
    this.updateDebugMesh();

    // 移動可能範囲表示を更新
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
   * @param direction 移動方向（"left" または "right"）
   * @param deltaTime フレーム時間（秒）
   */
  moveSideways(direction: "left" | "right", deltaTime: number): void {
    const currentDirection = this.player.direction;

    // 左右方向の角度を計算
    const sidewaysAngle = direction === "left"
      ? currentDirection - Math.PI / 2  // 左 = 向き - 90度
      : currentDirection + Math.PI / 2; // 右 = 向き + 90度

    // 横方向の単位ベクトル
    const directionX = Math.sin(sidewaysAngle);
    const directionZ = Math.cos(sidewaysAngle);

    // 現在の速度を取得
    const currentVelocity = this.centerOfMass.velocity;

    // 横方向の現在速度を計算（プレイヤーの座標系）
    const forwardX = Math.sin(currentDirection);
    const forwardZ = Math.cos(currentDirection);
    const leftX = -forwardZ;
    const leftZ = forwardX;
    const currentSidewaysVelocity = currentVelocity.x * leftX + currentVelocity.z * leftZ;

    // 切り返し判定（現在の横速度と目標方向が逆）
    const isChangingDirection =
      (direction === "left" && currentSidewaysVelocity < -0.5) ||
      (direction === "right" && currentSidewaysVelocity > 0.5);

    // 切り返し時には追加の力を加える
    const changeDirMultiplier = isChangingDirection ? 1.5 : 1.0;

    // 横移動の力を計算
    const sidewaysForce = this.baseMoveForce * this.sidewaysSpeedMultiplier * changeDirMultiplier;
    const force = new Vector3(directionX * sidewaysForce, 0, directionZ * sidewaysForce);

    // 力を加える
    this.centerOfMass.applyForce(force, deltaTime);

    // デバッグログ
    if (this.debugMode && Math.random() < 0.05) {
      console.log(
        `[Strafe] P${this.player.id} ${direction}, Changing: ${isChangingDirection}, Velocity: ${currentSidewaysVelocity.toFixed(2)}`
      );
    }

    // 物理演算を更新
    this.updatePhysics(deltaTime);
  }

  /**
   * 体の向きに対する移動方向から速度係数を計算
   * @param angleDifference プレイヤーの向きと移動方向の角度差（ラジアン、-π ~ π）
   * @returns 移動速度係数（0.5 ~ 1.0）
   */
  private calculateSpeedMultiplier(angleDifference: number): number {
    // 角度差を絶対値に変換（0 ~ π）
    const absAngle = Math.abs(angleDifference);

    // 段階的に係数を決定
    // 前方（0 ~ 45度）: 1.0
    if (absAngle < Math.PI / 4) {
      return this.forwardSpeedMultiplier;
    }
    // 横（45 ~ 135度）: 0.6
    else if (absAngle < (Math.PI * 3) / 4) {
      return this.sidewaysSpeedMultiplier;
    }
    // 後方（135 ~ 180度）: 0.5
    else {
      return this.backwardSpeedMultiplier;
    }
  }

  /**
   * 2つの角度の差を計算（-π ~ π の範囲に正規化）
   */
  private normalizeAngleDifference(angle1: number, angle2: number): number {
    let diff = angle2 - angle1;
    // -π ~ π の範囲に収める
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  /**
   * ターゲット位置に向かって移動する（力ベース）
   * @param targetPosition 目標位置
   * @param deltaTime フレーム時間（秒）
   * @returns 移動したかどうか
   */
  moveTowards(targetPosition: Vector3, deltaTime: number): boolean {
    const currentPosition = this.centerOfMass.position.clone();

    // 水平方向（XZ平面）のみの方向ベクトルを計算
    const dx = targetPosition.x - currentPosition.x;
    const dz = targetPosition.z - currentPosition.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // すでに十分近い場合は移動しない
    if (horizontalDistance < this.stopThreshold) {
      return false;
    }

    // 目標方向の単位ベクトル
    const directionX = dx / horizontalDistance;
    const directionZ = dz / horizontalDistance;

    // 移動方向の角度を計算
    const moveAngle = Math.atan2(directionX, directionZ);

    // プレイヤーの現在の向きと移動方向の角度差を計算
    const currentDirection = this.player.direction;
    const angleDifference = this.normalizeAngleDifference(currentDirection, moveAngle);

    // 角度差に基づいて移動速度係数を計算
    const speedMultiplier = this.calculateSpeedMultiplier(angleDifference);

    // 目標方向への力を加える
    // 基準移動力は全プレイヤー共通（2400N）
    // 重い選手: 加速度が小さい (a = F/m が小さい) → 加速が遅い、慣性が大きい
    // 軽い選手: 加速度が大きい (a = F/m が大きい) → 加速が速い、素早く動ける
    // 方向係数: 前方(1.0)、横(0.6)、後方(0.5)
    // ダッシュ係数: ダッシュ中は2.5倍
    const dashMultiplier = this.isDashing ? this.DASH_FORCE_MULTIPLIER : 1.0;
    const adjustedForce = this.baseMoveForce * speedMultiplier * dashMultiplier;
    const force = new Vector3(directionX * adjustedForce, 0, directionZ * adjustedForce);
    this.centerOfMass.applyForce(force, deltaTime);

    // デバッグログ（開発時のみ）
    if (this.debugMode && Math.random() < 0.01) {
      // 1%の確率でログ出力
      const angleDeg = (angleDifference * 180) / Math.PI;
      console.log(
        `[PlayerMovement] P${this.player.id} AngleDiff: ${angleDeg.toFixed(0)}°, Multiplier: ${speedMultiplier.toFixed(2)}`
      );
    }

    // 物理演算を更新
    // 注意: 向きは変えない（setDirection()を呼ばない）
    this.updatePhysics(deltaTime);

    return true;
  }

  /**
   * 重心の位置を取得
   */
  getCenterOfMassPosition(): Vector3 {
    return this.centerOfMass.position.clone();
  }

  /**
   * 重心の速度を取得
   */
  getCenterOfMassVelocity(): Vector3 {
    return this.centerOfMass.velocity.clone();
  }

  /**
   * プレイヤーの質量を取得
   */
  getMass(): number {
    return this.centerOfMass.mass;
  }

  /**
   * 次の1秒間に移動可能な範囲を計算（物理シミュレーション）
   * @param timeHorizon 予測時間（秒）デフォルト1秒
   * @returns 前方、横、後方の到達可能距離（m）
   */
  private calculateReachableRange(timeHorizon: number = 1.0): {
    forward: number;
    sideways: number;
    backward: number;
  } {
    const currentVelocity = this.centerOfMass.velocity.clone();
    const playerDirection = this.player.direction;

    // 各方向をシミュレーション
    const forwardDistance = this.simulateMovementInDirection(
      currentVelocity,
      playerDirection,
      0, // 前方（角度差0）
      timeHorizon
    );

    const sidewaysDistance = this.simulateMovementInDirection(
      currentVelocity,
      playerDirection,
      Math.PI / 2, // 横方向（角度差90度）
      timeHorizon
    );

    const backwardDistance = this.simulateMovementInDirection(
      currentVelocity,
      playerDirection,
      Math.PI, // 後方（角度差180度）
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
   * @param initialVelocity 初期速度
   * @param playerDirection プレイヤーの向き
   * @param moveAngleOffset 移動方向のオフセット（プレイヤーの向きからの角度差）
   * @param duration シミュレーション時間（秒）
   * @returns 到達可能距離（m）
   */
  private simulateMovementInDirection(
    initialVelocity: Vector3,
    playerDirection: number,
    moveAngleOffset: number,
    duration: number
  ): number {
    const dt = 0.05; // 50msごとにシミュレーション
    const steps = Math.floor(duration / dt);
    const mass = this.centerOfMass.mass;

    // 移動方向の単位ベクトル
    const moveDirection = playerDirection + moveAngleOffset;
    const moveDirX = Math.sin(moveDirection);
    const moveDirZ = Math.cos(moveDirection);

    // 初期状態
    const velocity = initialVelocity.clone();
    let totalDistance = 0;

    // 各タイムステップでシミュレーション
    for (let i = 0; i < steps; i++) {
      // 速度係数を計算（プレイヤーの向きと移動方向の角度差）
      const speedMultiplier = this.calculateSpeedMultiplier(moveAngleOffset);

      // 移動方向への力を計算
      const force = this.baseMoveForce * speedMultiplier;
      const forceX = moveDirX * force;
      const forceZ = moveDirZ * force;

      // 加速度を計算（a = F/m）
      const accelerationX = forceX / mass;
      const accelerationZ = forceZ / mass;

      // 速度を更新（v += a * dt）
      velocity.x += accelerationX * dt;
      velocity.z += accelerationZ * dt;

      // 摩擦を適用
      const frictionCoefficient = 0.8;
      const frictionForceX = -velocity.x * frictionCoefficient * mass * 10;
      const frictionForceZ = -velocity.z * frictionCoefficient * mass * 10;
      velocity.x += (frictionForceX / mass) * dt;
      velocity.z += (frictionForceZ / mass) * dt;

      // 最大速度を制限
      const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      const maxSpeed = PLAYER_CONFIG.speed * 1.5;
      if (currentSpeed > maxSpeed) {
        const scale = maxSpeed / currentSpeed;
        velocity.x *= scale;
        velocity.z *= scale;
      }

      // 速度が非常に小さくなったら停止
      if (Math.abs(velocity.x) < 0.01 && Math.abs(velocity.z) < 0.01) {
        velocity.x = 0;
        velocity.z = 0;
      }

      // 移動距離を計算（移動方向への投影）
      const distanceThisStep = (velocity.x * moveDirX + velocity.z * moveDirZ) * dt;

      // 正の方向のみカウント（逆方向は無視）
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

    // 移動可能範囲を計算
    const range = this.calculateReachableRange();

    // 楕円の半径を決定（前後で非対称）
    const radiusForward = range.forward;
    const radiusBackward = range.backward;
    const radiusSideways = range.sideways;

    // 平均半径を計算（楕円の長軸・短軸）
    const radiusX = radiusSideways; // 横方向
    const radiusZ = (radiusForward + radiusBackward) / 2; // 前後方向の平均

    // 既存のメッシュを破棄
    if (this.reachableRangeMesh) {
      this.reachableRangeMesh.dispose();
    }

    // 楕円ディスクを作成
    this.reachableRangeMesh = MeshBuilder.CreateDisc(
      `reachableRange_player${this.player.id}`,
      {
        radius: 1, // 後でスケーリング
        tessellation: 64,
      },
      scene
    );

    // 楕円形にスケーリング
    this.reachableRangeMesh.scaling.x = radiusX;
    this.reachableRangeMesh.scaling.z = radiusZ;

    // 地面に配置（Y軸で90度回転して水平に）
    this.reachableRangeMesh.rotation.x = Math.PI / 2;

    // プレイヤーの向きに合わせて回転
    this.reachableRangeMesh.rotation.y = this.player.direction;

    // プレイヤーの位置に配置（やや浮かせる）
    const playerPos = this.player.getPosition();
    this.reachableRangeMesh.position = new Vector3(playerPos.x, 0.02, playerPos.z);

    // 前後の非対称性を中心オフセットで表現
    const centerOffset = (radiusForward - radiusBackward) / 2;
    const offsetX = Math.sin(this.player.direction) * centerOffset;
    const offsetZ = Math.cos(this.player.direction) * centerOffset;
    this.reachableRangeMesh.position.x += offsetX;
    this.reachableRangeMesh.position.z += offsetZ;

    // マテリアル設定
    const material = new StandardMaterial(`reachableMaterial_player${this.player.id}`, scene);
    material.diffuseColor = this.player.id === 1 ? new Color3(0, 0.5, 1) : new Color3(1, 0.2, 0); // プレイヤーカラー
    material.alpha = 0.3; // 半透明
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

  /**
   * 将来的な拡張メソッドの例：
   *
   * - sprint(deltaTime: number): void
   *   スプリント（baseMoveForceを増やす）
   *
   * - applyImpulse(impulse: Vector3): void
   *   瞬間的な力を加える（ダッシュ、ノックバックなど）
   *   衝突時の押し合い実装例：
   *   ```
   *   // プレイヤー同士の衝突時
   *   const relativeVelocity = player1Velocity - player2Velocity;
   *   const impulse = relativeVelocity * (mass1 * mass2) / (mass1 + mass2);
   *   player1.movement.applyImpulse(-impulse);
   *   player2.movement.applyImpulse(impulse);
   *   // 重い選手は軽い選手を押し飛ばしやすい
   *   ```
   *
   * - setMaxSpeed(speed: number): void
   *   最大速度を変更（疲労、状態異常など）
   *
   * - applyDrag(coefficient: number): void
   *   空気抵抗を適用
   *
   * - handlePlayerCollision(otherPlayer: PlayerMovement): void
   *   プレイヤー同士の衝突処理（質量差による押し合い）
   */
}
