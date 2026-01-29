import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsMotionType,
  PhysicsMaterialCombineMode,
  LinesMesh,
} from "@babylonjs/core";
import type { Character } from "./Character";
import { PhysicsConstants } from "../../physics/PhysicsConfig";
import { ParabolaUtils } from "../utils/parabolaUtils";

/**
 * 3Dバスケットボールエンティティ
 * Havok物理エンジンを使用した物理演算
 *
 * 物理特性（NBA規定準拠）:
 * - 重力: 9.81 m/s² (Havokが自動適用)
 * - 反発係数: 0.83 (1.8mから落として約1.25mバウンド)
 * - 質量: 0.62 kg
 * - 摩擦係数: 0.6 (ゴム表面)
 */
export class Ball {
  private scene: Scene;
  public mesh: Mesh;
  private holder: Character | null = null;

  // 物理ボディ
  private physicsAggregate: PhysicsAggregate | null = null;

  // 物理モード管理
  private isKinematicMode: boolean = true;

  // 飛行中の状態管理
  private inFlight: boolean = false;
  private flightTime: number = 0;
  private targetPosition: Vector3 = Vector3.Zero();

  // シューターのクールダウン
  private lastShooter: Character | null = null;
  private shooterCooldown: number = 0;
  private static readonly SHOOTER_COOLDOWN_TIME = 3.0;
  private lastShootTime: number = 0;
  private static readonly SHOOTER_COOLDOWN_MS = 3000;

  // ブロック後のオフェンスチームクールダウン
  private blockedOffenseTeam: "ally" | "enemy" | null = null;
  private blockCooldown: number = 0;
  private static readonly BLOCK_COOLDOWN_TIME = 0.8;

  // 弾き後のクールダウン
  private deflectionCooldown: number = 0;
  private static readonly DEFLECTION_COOLDOWN_TIME = 0.3;
  private lastDeflectionTime: number = 0;
  private static readonly DEFLECTION_COOLDOWN_MS = 300;

  // 最後にボールに触れた選手
  private lastToucher: Character | null = null;

  // 軌道可視化用メッシュ
  private trajectoryLineMesh: LinesMesh | null = null;
  private trajectoryParabolaMesh: LinesMesh | null = null;
  private trajectoryVisible: boolean = true;

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.mesh = this.createBall(position);
    this.initializePhysics();
  }

  /**
   * ボールメッシュを作成
   */
  private createBall(position: Vector3): Mesh {
    const ball = MeshBuilder.CreateSphere(
      "ball",
      {
        diameter: PhysicsConstants.BALL.RADIUS * 2,
        segments: 32,
      },
      this.scene
    );

    ball.position = position;

    const material = new StandardMaterial("ball-material", this.scene);
    material.diffuseColor = new Color3(1, 0.4, 0);
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    material.emissiveColor = new Color3(0.5, 0.2, 0);
    ball.material = material;

    return ball;
  }

  /**
   * 物理ボディを初期化
   * Havok物理エンジンでボールの物理特性を設定
   */
  private initializePhysics(): void {
    // シーンに物理エンジンが有効化されているか確認
    // Havok物理エンジンは非同期で初期化されるため、後でreinitializePhysics()が呼ばれる
    if (!this.scene.getPhysicsEngine()) {
      console.log("[Ball] Havok physics engine not yet initialized, waiting for reinitializePhysics()");
      return;
    }

    try {
      // PhysicsAggregateを作成（Havok用）
      // 重力はシーンレベルで設定されているため、DYNAMICモードで自動適用される
      this.physicsAggregate = new PhysicsAggregate(
        this.mesh,
        PhysicsShapeType.SPHERE,
        {
          mass: PhysicsConstants.BALL.MASS,           // 0.62kg
          restitution: PhysicsConstants.BALL.RESTITUTION, // 0.83 (NBA規定)
          friction: PhysicsConstants.BALL.FRICTION,   // 0.6
        },
        this.scene
      );

      // マテリアル設定: 反発係数を両オブジェクトの積で計算
      // これにより、リム(0.7) × ボール(0.83) = 0.581 で反発する
      this.physicsAggregate.shape.material = {
        restitution: PhysicsConstants.BALL.RESTITUTION,
        restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
        friction: PhysicsConstants.BALL.FRICTION,
        frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      };

      // ダンピング（空気抵抗・回転減衰）を設定
      this.physicsAggregate.body.setLinearDamping(PhysicsConstants.BALL.LINEAR_DAMPING);
      this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

      // 初期状態はANIMATED（キネマティック）モード
      // 保持されている間は手動で位置を制御
      this.isKinematicMode = true;
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.physicsAggregate.body.disablePreStep = false;

    } catch (error) {
      console.warn("[Ball] Failed to initialize physics:", error);
      this.physicsAggregate = null;
    }
  }

  /**
   * キネマティックモードを設定（物理演算を無効/有効）
   * @param isKinematic true=ANIMATED（手動制御）、false=DYNAMIC（物理エンジン制御）
   */
  private setKinematic(isKinematic: boolean): void {
    this.isKinematicMode = isKinematic;

    if (!this.physicsAggregate) return;

    if (isKinematic) {
      // ANIMATEDモード: メッシュ位置を物理ボディに同期
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.physicsAggregate.body.disablePreStep = false;
    } else {
      // DYNAMICモード: 物理エンジンが位置を制御（重力・衝突が適用される）
      // 重要: disablePreStep = false のまま DYNAMIC に切り替える
      // 速度設定後に finalizeDynamicMode() を呼ぶ必要がある
      this.physicsAggregate.body.disablePreStep = false;
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    }
  }

  /**
   * DYNAMICモードの最終化（速度設定後に呼ぶ）
   * 物理エンジンが位置を制御するようにする
   */
  private finalizeDynamicMode(): void {
    if (this.physicsAggregate && !this.isKinematicMode) {
      this.physicsAggregate.body.disablePreStep = true;
    }
  }

  /**
   * 外部から力を加える（継続的な力、例: 風）
   * Havok物理エンジンを使用
   * @param force 力ベクトル（ニュートン）
   * @param point 力を加える点（省略時は重心）
   */
  public applyForce(force: Vector3, point?: Vector3): void {
    if (!this.physicsAggregate) {
      console.warn("[Ball] Havok physics required for applyForce");
      return;
    }

    // DYNAMICモードでのみ力を適用
    if (!this.isKinematicMode) {
      const applyPoint = point ?? this.physicsAggregate.body.getObjectCenterWorld();
      this.physicsAggregate.body.applyForce(force, applyPoint);
    }
  }

  /**
   * 外部からインパルス（衝撃）を加える（瞬間的な力、例: 衝突、シュート）
   * Havok物理エンジンを使用
   * @param impulse インパルスベクトル（kg·m/s = N·s）
   * @param point インパルスを加える点（省略時は重心）
   */
  public applyImpulse(impulse: Vector3, point?: Vector3): void {
    if (!this.physicsAggregate) {
      console.warn("[Ball] Havok physics required for applyImpulse");
      return;
    }

    // DYNAMICモードでのみインパルスを適用
    if (!this.isKinematicMode) {
      const applyPoint = point ?? this.physicsAggregate.body.getObjectCenterWorld();
      this.physicsAggregate.body.applyImpulse(impulse, applyPoint);
    }
  }

  /**
   * 角運動量（回転インパルス）を加える
   * @param angularImpulse 角運動量ベクトル（kg·m²/s）
   */
  public applyAngularImpulse(angularImpulse: Vector3): void {
    if (!this.physicsAggregate || this.isKinematicMode) return;

    // 現在の角速度を取得して加算
    const currentAngular = this.physicsAggregate.body.getAngularVelocity();
    const newAngular = currentAngular.add(angularImpulse);
    this.physicsAggregate.body.setAngularVelocity(newAngular);
  }

  /**
   * 物理演算を有効化してダイナミックモードに切り替え
   * 重力・衝突・外部力が適用されるようになる
   */
  public enablePhysics(): void {
    this.setKinematic(false);
  }

  /**
   * 物理演算を無効化してキネマティックモードに切り替え
   * 手動で位置を制御する
   */
  public disablePhysics(): void {
    this.setKinematic(true);
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
      this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * 物理エンジンが有効（DYNAMICモード）かどうか
   */
  public isPhysicsEnabled(): boolean {
    return !this.isKinematicMode;
  }

  /**
   * 位置を取得
   * DYNAMICモードでは物理ボディの位置を返す
   */
  getPosition(): Vector3 {
    // DYNAMICモードで物理ボディがある場合は物理ボディの位置を使用
    if (!this.isKinematicMode && this.physicsAggregate) {
      const transformNode = this.physicsAggregate.transformNode;
      if (transformNode) {
        return transformNode.position.clone();
      }
    }
    return this.mesh.position.clone();
  }

  /**
   * 位置を設定
   * @param position 新しい位置
   * @param resetVelocity 速度をリセットするかどうか（デフォルト: false）
   */
  setPosition(position: Vector3, resetVelocity: boolean = false): void {
    if (this.holder) return;

    const minY = PhysicsConstants.BALL.RADIUS;
    const clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, minY),
      position.z
    );

    this.mesh.position = clampedPosition;

    // 物理ボディの位置も更新
    if (this.physicsAggregate) {
      this.physicsAggregate.body.disablePreStep = false;

      if (resetVelocity) {
        this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
        this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
      }
    }
  }

  /**
   * ボールが保持されているかどうか
   */
  isHeld(): boolean {
    return this.holder !== null;
  }

  /**
   * ボールの保持者を設定
   * @param character 新しい保持者（nullで解放）
   */
  setHolder(character: Character | null): void {
    this.holder = character;

    if (character !== null) {
      this.lastToucher = character;
      // ボールサイズを元に戻す
      this.mesh.scaling = Vector3.One();
    }

    if (character !== null && this.inFlight) {
      this.inFlight = false;
      // 物理演算を停止（ANIMATEDモードに切り替え）
      this.setKinematic(true);
      if (this.physicsAggregate) {
        this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
        this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
      }
    }
  }

  /**
   * ボールの保持者を取得
   */
  getHolder(): Character | null {
    return this.holder;
  }

  /**
   * 更新処理
   * @param deltaTime フレーム間の経過時間（秒）
   */
  update(deltaTime: number): void {
    // クールダウン更新
    if (this.shooterCooldown > 0) {
      this.shooterCooldown -= deltaTime;
    }

    if (this.lastShooter !== null) {
      const elapsedMs = Date.now() - this.lastShootTime;
      if (elapsedMs >= Ball.SHOOTER_COOLDOWN_MS) {
        this.lastShooter = null;
      }
    }

    if (this.deflectionCooldown > 0) {
      this.deflectionCooldown -= deltaTime;
    }

    if (this.holder) {
      // 保持者に追従（ANIMATEDモード）
      const ballHoldingPosition = this.holder.getBallHoldingPosition();
      this.mesh.position = ballHoldingPosition;

      // 物理ボディの位置も更新
      if (this.physicsAggregate) {
        this.physicsAggregate.body.disablePreStep = false;
      }
    } else if (this.inFlight) {
      // 飛行中の物理処理
      this.flightTime += deltaTime;
      this.updateFlightPhysics(deltaTime);
    }
  }

  /**
   * 飛行中の物理処理
   * Havok物理エンジンが衝突・重力・減衰を自動処理
   */
  private updateFlightPhysics(_deltaTime: number): void {
    if (!this.physicsAggregate) {
      // Havok物理エンジンが必須
      console.error("[Ball] Havok physics engine required but not available");
      this.inFlight = false;
      return;
    }

    const velocity = this.physicsAggregate.body.getLinearVelocity();
    const position = this.getPosition();
    const speed = velocity.length();
    const isOnGround = position.y <= PhysicsConstants.BALL.RADIUS + 0.05;

    // 地面で速度が十分小さい場合は飛行終了
    if (isOnGround && speed < 0.5 && Math.abs(velocity.y) < PhysicsConstants.BALL.MIN_BOUNCE_VELOCITY) {
      this.inFlight = false;
      this.setKinematic(true);
      this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
      this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * シュートを開始
   * @param targetPosition 目標位置
   * @param launchAngle 発射角度（ラジアン）
   * @param overrideStartPosition 開始位置のオーバーライド
   * @param curveValue シューターのcurve値（0-99、バックスピンの強さに影響）
   */
  public shoot(
    targetPosition: Vector3,
    launchAngle: number = Math.PI * 55 / 180,
    overrideStartPosition?: Vector3,
    curveValue: number = 50
  ): boolean {
    if (this.inFlight) return false;

    const previousHolder = this.holder;
    this.holder = null;

    if (previousHolder) {
      this.lastToucher = previousHolder;
    }

    const startPosition = overrideStartPosition
      ? overrideStartPosition.clone()
      : this.mesh.position.clone();

    // メッシュの位置を設定
    this.mesh.position = startPosition.clone();
    this.targetPosition = targetPosition.clone();

    // 初速度を計算
    const velocity = this.calculateInitialVelocity(startPosition, targetPosition, launchAngle);

    // バックスピンを計算
    // curve値が高いほど強いバックスピン（5〜25 rad/s）
    const backspinStrength = 5 + (curveValue / 99) * 20;
    const angularVelocity = this.calculateBackspin(startPosition, targetPosition, backspinStrength);

    // Havok物理エンジンが必須
    if (this.physicsAggregate) {
      // 物理ボディを一度破棄して新しい位置で再作成
      this.physicsAggregate.dispose();
      this.mesh.position = startPosition.clone();

      // 新しい物理ボディを作成（DYNAMIC）
      this.physicsAggregate = new PhysicsAggregate(
        this.mesh,
        PhysicsShapeType.SPHERE,
        {
          mass: PhysicsConstants.BALL.MASS,
          restitution: PhysicsConstants.BALL.RESTITUTION,
          friction: PhysicsConstants.BALL.FRICTION,
        },
        this.scene
      );

      // マテリアル設定: 反発係数を両オブジェクトの積で計算
      // これにより、リム(0.7) × ボール(0.83) = 0.581 で反発する
      this.physicsAggregate.shape.material = {
        restitution: PhysicsConstants.BALL.RESTITUTION,
        restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
        friction: PhysicsConstants.BALL.FRICTION,
        frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      };

      // ダンピングを設定
      this.physicsAggregate.body.setLinearDamping(PhysicsConstants.BALL.LINEAR_DAMPING);
      this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

      // 速度を設定
      this.physicsAggregate.body.setLinearVelocity(velocity);
      this.physicsAggregate.body.setAngularVelocity(angularVelocity);

      // 重要: disablePreStep = true で物理エンジンがボールの位置を完全に制御
      // false のままだとメッシュ位置が物理ボディに同期され続け、軌道が正しく計算されない
      this.physicsAggregate.body.disablePreStep = true;

      this.isKinematicMode = false;
    } else {
      // 物理エンジンなしの場合はエラー
      console.error("[Ball] Havok physics engine required for shoot");
      return false;
    }

    this.inFlight = true;
    this.flightTime = 0;

    // クールダウン設定
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME;
    this.lastShootTime = Date.now();

    return true;
  }

  /**
   * シュートを開始（アーチ高さベースの新しい放物線計算）
   *
   * 放物線: Y = 4h × t × (1 - t)
   * 発射位置と目標位置を結ぶ直線を基準軸とし、
   * その直線からの最大垂直距離がアーチ高さ h となる放物線
   *
   * @param targetPosition 目標位置（リング中央上）
   * @param arcHeight アーチ高さ（直線からの最大高さ、メートル）
   * @param overrideStartPosition 開始位置のオーバーライド
   * @param curveValue シューターのcurve値（0-99、バックスピンの強さに影響）
   * @param radiusAdjust ボール半径の調整値（正の値で小さくなる）
   */
  public shootWithArcHeight(
    targetPosition: Vector3,
    arcHeight: number,
    overrideStartPosition?: Vector3,
    curveValue: number = 50,
    radiusAdjust: number = 0
  ): boolean {
    if (this.inFlight) return false;

    const previousHolder = this.holder;
    this.holder = null;

    if (previousHolder) {
      this.lastToucher = previousHolder;
    }

    const startPosition = overrideStartPosition
      ? overrideStartPosition.clone()
      : this.mesh.position.clone();

    // メッシュの位置を設定
    this.mesh.position = startPosition.clone();
    this.targetPosition = targetPosition.clone();

    // 新しい放物線計算: アーチ高さから初速度を計算
    const velocityResult = ParabolaUtils.calculateVelocityFromArcHeight(
      startPosition.x,
      startPosition.y,
      startPosition.z,
      targetPosition.x,
      targetPosition.y,
      targetPosition.z,
      arcHeight,
      PhysicsConstants.GRAVITY_MAGNITUDE
    );

    const velocity = new Vector3(
      velocityResult.vx,
      velocityResult.vy,
      velocityResult.vz
    );

    // 軌道を可視化
    this.visualizeTrajectory(startPosition, targetPosition, arcHeight);

    // バックスピンを計算
    // curve値が高いほど強いバックスピン（5〜25 rad/s）
    const backspinStrength = 5 + (curveValue / 99) * 20;
    const angularVelocity = this.calculateBackspin(startPosition, targetPosition, backspinStrength);

    // Havok物理エンジンが必須
    if (this.physicsAggregate) {
      // 物理ボディを一度破棄して新しい位置で再作成
      this.physicsAggregate.dispose();
      this.mesh.position = startPosition.clone();

      // ボールサイズの調整（選手データに基づく）
      const baseRadius = PhysicsConstants.BALL.RADIUS;
      const adjustedRadius = Math.max(baseRadius - radiusAdjust, baseRadius * 0.5); // 最小で元の50%
      const scale = adjustedRadius / baseRadius;
      this.mesh.scaling = new Vector3(scale, scale, scale);

      // 新しい物理ボディを作成（DYNAMIC）
      this.physicsAggregate = new PhysicsAggregate(
        this.mesh,
        PhysicsShapeType.SPHERE,
        {
          mass: PhysicsConstants.BALL.MASS,
          restitution: PhysicsConstants.BALL.RESTITUTION,
          friction: PhysicsConstants.BALL.FRICTION,
        },
        this.scene
      );

      // マテリアル設定: 反発係数を両オブジェクトの積で計算
      this.physicsAggregate.shape.material = {
        restitution: PhysicsConstants.BALL.RESTITUTION,
        restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
        friction: PhysicsConstants.BALL.FRICTION,
        frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      };

      // ダンピングを設定
      this.physicsAggregate.body.setLinearDamping(PhysicsConstants.BALL.LINEAR_DAMPING);
      this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

      // 速度を設定
      this.physicsAggregate.body.setLinearVelocity(velocity);
      this.physicsAggregate.body.setAngularVelocity(angularVelocity);

      // 重要: disablePreStep = true で物理エンジンがボールの位置を完全に制御
      this.physicsAggregate.body.disablePreStep = true;

      this.isKinematicMode = false;
    } else {
      // 物理エンジンなしの場合はエラー
      console.error("[Ball] Havok physics engine required for shoot");
      return false;
    }

    this.inFlight = true;
    this.flightTime = 0;

    // クールダウン設定
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME;
    this.lastShootTime = Date.now();

    return true;
  }

  /**
   * バックスピンの角速度を計算
   * シュート方向に対して逆回転（進行方向と逆向きに回転）
   * @param start 開始位置
   * @param target 目標位置
   * @param strength 回転の強さ（rad/s）
   */
  private calculateBackspin(start: Vector3, target: Vector3, strength: number): Vector3 {
    // シュート方向（水平成分のみ）
    const direction = new Vector3(
      target.x - start.x,
      0,
      target.z - start.z
    );

    if (direction.length() < 0.01) {
      // 真上へのシュートの場合、X軸周りのバックスピン
      return new Vector3(-strength, 0, 0);
    }

    direction.normalize();

    // バックスピンの回転軸は進行方向に対して垂直（右手方向）
    // 進行方向が(dx, 0, dz)の場合、回転軸は(-dz, 0, dx)を90度回転
    // バックスピンは進行方向の反対側に回転するので、
    // 回転軸はシュート方向を左に90度回転した方向
    const rotationAxis = new Vector3(-direction.z, 0, direction.x);

    // バックスピンは上から見て時計回りに回転（進行方向に対して後ろ側が上がる）
    // これにより、着地時にボールが後ろに戻る効果がある
    return rotationAxis.scale(strength);
  }

  /**
   * 目標位置に到達するための初速度を計算
   * 放物線公式: v₀² = (g * x²) / (2 * cos²(θ) * (x * tan(θ) - y))
   */
  private calculateInitialVelocity(start: Vector3, target: Vector3, angle: number): Vector3 {
    const dx = target.x - start.x;
    const dz = target.z - start.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    const dy = target.y - start.y;

    const g = PhysicsConstants.GRAVITY_MAGNITUDE;
    const tanAngle = Math.tan(angle);
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    // 水平距離がほぼ0の場合（真上にシュート）
    if (horizontalDistance < 0.01) {
      const vVertical = dy > 0 ? Math.sqrt(2 * g * dy) * 1.5 : 5;
      return new Vector3(0, vVertical, 0);
    }

    // 放物線の公式で初速度を計算
    const numerator = g * horizontalDistance * horizontalDistance;
    const denominator = 2 * cosAngle * cosAngle * (horizontalDistance * tanAngle - dy);

    let v0: number;
    if (denominator <= 0) {
      // 分母が負または0の場合、フォールバック計算
      v0 = Math.sqrt(horizontalDistance * horizontalDistance + dy * dy) * 2;
    } else {
      v0 = Math.sqrt(numerator / denominator);
    }

    // NaN/Infinityチェック
    if (!isFinite(v0) || isNaN(v0)) {
      v0 = 10;
    }

    // 速度を成分に分解
    const vHorizontal = v0 * cosAngle;
    const vVertical = v0 * sinAngle;

    // 水平方向の単位ベクトル
    const directionXZ = new Vector3(dx, 0, dz);
    const dirLength = directionXZ.length();
    if (dirLength > 0) {
      directionXZ.scaleInPlace(1 / dirLength);
    }

    const velocity = new Vector3(
      directionXZ.x * vHorizontal,
      vVertical,
      directionXZ.z * vHorizontal
    );

    // デバッグ: 計算された初速度をログ出力
    console.log(`[BallDebug] v0: ${v0.toFixed(4)} m/s, velocity: (${velocity.x.toFixed(4)}, ${velocity.y.toFixed(4)}, ${velocity.z.toFixed(4)})`);

    return velocity;
  }

  /**
   * 飛行中かどうかを取得
   */
  public isInFlight(): boolean {
    return this.inFlight;
  }

  /**
   * 飛行を終了
   * 物理演算を停止し、ANIMATEDモードに切り替え
   */
  public endFlight(): void {
    this.inFlight = false;
    this.setKinematic(true);
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
      this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * 飛行を開始/再開
   * 物理演算を有効化し、DYNAMICモードに切り替え
   */
  public startFlight(): void {
    this.inFlight = true;
    this.setKinematic(false);
    this.finalizeDynamicMode();
  }

  /**
   * パスを実行
   * @param targetPosition 目標位置
   * @param targetCharacter パス先のキャラクター（ログ用）
   */
  public pass(targetPosition: Vector3, _targetCharacter?: Character): boolean {
    if (!this.holder) return false;
    if (this.inFlight) return false;

    const previousHolder = this.holder;
    const startPosition = this.mesh.position.clone();
    this.holder = null;

    const passAngle = Math.PI / 12; // 15度
    const velocity = this.calculateInitialVelocity(startPosition, targetPosition, passAngle);

    // Havok物理エンジンで速度を設定
    this.setKinematic(false);
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(velocity);
      this.finalizeDynamicMode();
    } else {
      console.warn("[Ball] Havok physics required for pass");
      return false;
    }

    this.inFlight = true;
    this.flightTime = 0;
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME * 0.5;

    return true;
  }

  /**
   * 現在の速度を取得
   * Havok物理エンジンから取得
   */
  public getVelocity(): Vector3 {
    if (this.physicsAggregate && !this.isKinematicMode) {
      return this.physicsAggregate.body.getLinearVelocity();
    }
    // Havok物理エンジンが必須
    return Vector3.Zero();
  }

  /**
   * 速度を設定
   * Havok物理エンジンを使用
   */
  public setVelocity(velocity: Vector3): void {
    if (!this.physicsAggregate) {
      console.warn("[Ball] Havok physics required for setVelocity");
      return;
    }
    this.physicsAggregate.body.setLinearVelocity(velocity);
  }

  /**
   * 角速度を取得
   */
  public getAngularVelocity(): Vector3 {
    if (this.physicsAggregate && !this.isKinematicMode) {
      return this.physicsAggregate.body.getAngularVelocity();
    }
    return Vector3.Zero();
  }

  /**
   * 角速度を設定
   */
  public setAngularVelocity(angularVelocity: Vector3): void {
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setAngularVelocity(angularVelocity);
    }
  }

  /**
   * ボールの半径を取得
   */
  public getRadius(): number {
    return PhysicsConstants.BALL.RADIUS;
  }

  /**
   * 指定したキャラクターがボールをキャッチできるかどうか
   */
  public canBeCaughtBy(character: Character): boolean {
    if (this.deflectionCooldown > 0) {
      return false;
    }

    if (this.lastDeflectionTime > 0) {
      const elapsedSinceDeflection = Date.now() - this.lastDeflectionTime;
      if (elapsedSinceDeflection < Ball.DEFLECTION_COOLDOWN_MS) {
        return false;
      }
    }

    if (this.lastShooter === character && this.shooterCooldown > 0) {
      return false;
    }

    if (this.lastShooter === character) {
      const elapsedMs = Date.now() - this.lastShootTime;
      if (elapsedMs < Ball.SHOOTER_COOLDOWN_MS) {
        return false;
      }
    }

    return true;
  }

  /**
   * 弾き後のクールダウンを設定
   */
  public setDeflectionCooldown(): void {
    this.deflectionCooldown = Ball.DEFLECTION_COOLDOWN_TIME;
    this.lastDeflectionTime = Date.now();
  }

  /**
   * 最後にボールに触れた選手を取得
   */
  public getLastToucher(): Character | null {
    return this.lastToucher;
  }

  /**
   * 最後にボールに触れた選手をリセット
   */
  public clearLastToucher(): void {
    this.lastToucher = null;
  }

  /**
   * 物理エンジンを再初期化
   * Havokが後から有効になった場合に呼び出す
   */
  public reinitializePhysics(): void {
    // 既存の物理ボディがあれば破棄
    if (this.physicsAggregate) {
      this.physicsAggregate.dispose();
      this.physicsAggregate = null;
    }

    // ボールサイズを元に戻す
    this.mesh.scaling = Vector3.One();

    // 物理エンジンを再初期化
    this.initializePhysics();
  }

  // ==================== 軌道可視化 ====================

  /**
   * 軌道の可視化を作成
   * @param start 発射位置
   * @param target 目標位置
   * @param arcHeight アーチ高さ
   */
  private visualizeTrajectory(start: Vector3, target: Vector3, arcHeight: number): void {
    // 既存の可視化を削除
    this.clearTrajectoryVisualization();

    if (!this.trajectoryVisible) return;

    // 直線（発射位置→目標位置）
    const linePoints = [start.clone(), target.clone()];
    this.trajectoryLineMesh = MeshBuilder.CreateLines(
      "trajectory-line",
      { points: linePoints },
      this.scene
    );
    this.trajectoryLineMesh.color = new Color3(1, 1, 0); // 黄色

    // 放物線（ParabolaUtilsを使用）
    const parabolaPoints: Vector3[] = [];
    const segments = 50;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pos = ParabolaUtils.getPositionOnParabola(start, target, arcHeight, t);
      parabolaPoints.push(new Vector3(pos.x, pos.y, pos.z));
    }
    this.trajectoryParabolaMesh = MeshBuilder.CreateLines(
      "trajectory-parabola",
      { points: parabolaPoints },
      this.scene
    );
    this.trajectoryParabolaMesh.color = new Color3(0, 1, 1); // シアン
  }

  /**
   * 軌道の可視化を削除
   */
  private clearTrajectoryVisualization(): void {
    if (this.trajectoryLineMesh) {
      this.trajectoryLineMesh.dispose();
      this.trajectoryLineMesh = null;
    }
    if (this.trajectoryParabolaMesh) {
      this.trajectoryParabolaMesh.dispose();
      this.trajectoryParabolaMesh = null;
    }
  }

  /**
   * 軌道可視化の表示/非表示を設定
   */
  public setTrajectoryVisible(visible: boolean): void {
    this.trajectoryVisible = visible;
    if (!visible) {
      this.clearTrajectoryVisualization();
    }
  }

  /**
   * 軌道可視化の表示/非表示を切り替え
   */
  public toggleTrajectoryVisible(): void {
    this.setTrajectoryVisible(!this.trajectoryVisible);
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.clearTrajectoryVisualization();
    if (this.physicsAggregate) {
      this.physicsAggregate.dispose();
    }
    this.mesh.dispose();
  }
}
