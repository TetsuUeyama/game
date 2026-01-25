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
} from "@babylonjs/core";
import type { Character } from "./Character";
import { PhysicsConstants } from "../../physics/PhysicsConfig";

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

  // フォールバック用速度（物理エンジンがない場合）
  private fallbackVelocity: Vector3 = Vector3.Zero();

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
    if (!this.scene.getPhysicsEngine()) {
      console.warn("[Ball] Physics engine not enabled on scene, will use fallback physics");
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
   * @param force 力ベクトル（ニュートン）
   * @param point 力を加える点（省略時は重心）
   */
  public applyForce(force: Vector3, point?: Vector3): void {
    if (!this.physicsAggregate) {
      // フォールバック: 力を加速度に変換して速度に反映
      // F = ma より a = F/m
      const acceleration = force.scale(1 / PhysicsConstants.BALL.MASS);
      // 1フレーム分の速度変化として近似（deltaTime=1/60秒）
      this.fallbackVelocity.addInPlace(acceleration.scale(1 / 60));
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
   * @param impulse インパルスベクトル（kg·m/s = N·s）
   * @param point インパルスを加える点（省略時は重心）
   */
  public applyImpulse(impulse: Vector3, point?: Vector3): void {
    if (!this.physicsAggregate) {
      // フォールバック: インパルスを速度変化に変換
      // J = m·Δv より Δv = J/m
      const deltaVelocity = impulse.scale(1 / PhysicsConstants.BALL.MASS);
      this.fallbackVelocity.addInPlace(deltaVelocity);
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
    this.fallbackVelocity = Vector3.Zero();
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
        this.fallbackVelocity = Vector3.Zero();
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
    }

    if (character !== null && this.inFlight) {
      this.inFlight = false;
      // 物理演算を停止（ANIMATEDモードに切り替え）
      this.setKinematic(true);
      this.fallbackVelocity = Vector3.Zero();
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
   * Havokがある場合は衝突判定のみ、ない場合はフォールバック処理
   */
  private updateFlightPhysics(deltaTime: number): void {
    if (!this.physicsAggregate) {
      // 物理エンジンなしのフォールバック
      this.updatePhysicsFallback(deltaTime);
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
   * 物理エンジンなしのフォールバック物理処理
   * 重力・反発係数・摩擦を手動で計算
   */
  private updatePhysicsFallback(deltaTime: number): void {
    const velocity = this.fallbackVelocity;
    const currentPos = this.mesh.position;
    const radius = PhysicsConstants.BALL.RADIUS;

    // 重力を適用 (a = g)
    velocity.y -= PhysicsConstants.GRAVITY_MAGNITUDE * deltaTime;

    // 空気抵抗は飛行中は適用しない（室内バスケでは無視できるレベル）
    // 地面での転がり時のみ摩擦を適用（後述）

    // 位置を更新
    const newPosition = new Vector3(
      currentPos.x + velocity.x * deltaTime,
      currentPos.y + velocity.y * deltaTime,
      currentPos.z + velocity.z * deltaTime
    );

    // 地面との衝突判定（バウンド）
    if (newPosition.y <= radius && velocity.y < 0) {
      newPosition.y = radius;

      // 反発係数を適用（NBA規定: 0.83）
      const bounceVelocityY = -velocity.y * PhysicsConstants.BALL.RESTITUTION;

      // バウンド時の摩擦（水平速度の減衰）
      const frictionFactor = 1 - PhysicsConstants.BALL.FRICTION * 0.3;
      velocity.x *= frictionFactor;
      velocity.z *= frictionFactor;

      // 最小バウンド速度以下なら停止
      if (Math.abs(bounceVelocityY) < PhysicsConstants.BALL.MIN_BOUNCE_VELOCITY) {
        velocity.y = 0;

        // 水平速度も小さければ完全停止
        const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        if (horizontalSpeed < 0.1) {
          this.inFlight = false;
          velocity.x = 0;
          velocity.z = 0;
              }
      } else {
        velocity.y = bounceVelocityY;
      }
    }

    // 地面上での摩擦（転がり）
    if (newPosition.y <= radius + 0.01 && velocity.y >= 0) {
      const groundFriction = 1 - PhysicsConstants.BALL.FRICTION * deltaTime * 2;
      velocity.x *= groundFriction;
      velocity.z *= groundFriction;
    }

    this.mesh.position = newPosition;
    this.fallbackVelocity = velocity;
  }

  /**
   * シュートを開始
   * @param targetPosition 目標位置
   * @param launchAngle 発射角度（ラジアン）
   * @param overrideStartPosition 開始位置のオーバーライド
   */
  public shoot(
    targetPosition: Vector3,
    launchAngle: number = Math.PI * 55 / 180,
    overrideStartPosition?: Vector3
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

    this.mesh.position = startPosition.clone();
    this.targetPosition = targetPosition.clone();

    // 初速度を計算
    const velocity = this.calculateInitialVelocity(startPosition, targetPosition, launchAngle);

    // フォールバック用にも速度を保存
    this.fallbackVelocity = velocity.clone();

    // 物理エンジンで飛行（DYNAMICモードに切り替え）
    this.setKinematic(false);

    if (this.physicsAggregate) {
      // 速度を設定
      this.physicsAggregate.body.setLinearVelocity(velocity);

      // 回転を追加（バックスピン）
      this.physicsAggregate.body.setAngularVelocity(new Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 5
      ));

      // 速度設定後にDYNAMICモードを最終化
      this.finalizeDynamicMode();
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

    return new Vector3(
      directionXZ.x * vHorizontal,
      vVertical,
      directionXZ.z * vHorizontal
    );
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
    this.fallbackVelocity = Vector3.Zero();
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

    // フォールバック用にも速度を保存
    this.fallbackVelocity = velocity.clone();

    // DYNAMICモードに切り替えて物理演算を有効化
    this.setKinematic(false);
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(velocity);
      this.finalizeDynamicMode();
    }

    this.inFlight = true;
    this.flightTime = 0;
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME * 0.5;

    return true;
  }

  /**
   * 現在の速度を取得
   */
  public getVelocity(): Vector3 {
    if (this.physicsAggregate && !this.isKinematicMode) {
      return this.physicsAggregate.body.getLinearVelocity();
    }
    return this.fallbackVelocity.clone();
  }

  /**
   * 速度を設定
   * 物理ボディとフォールバック両方に設定
   */
  public setVelocity(velocity: Vector3): void {
    // フォールバック用にも保存
    this.fallbackVelocity = velocity.clone();

    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(velocity);
    }
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
   * 破棄
   */
  dispose(): void {
    if (this.physicsAggregate) {
      this.physicsAggregate.dispose();
    }
    this.mesh.dispose();
  }
}
