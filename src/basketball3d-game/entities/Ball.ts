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
} from '@babylonjs/core';
import { BALL_CONFIG } from '../config/gameConfig';
import { PhysicsConstants } from '../../physics/PhysicsConfig';

/**
 * 3Dバスケットボールエンティティ
 * Havok物理エンジンを使用した物理演算
 */
export class Ball {
  private scene: Scene;
  public mesh: Mesh;
  public owner: number | null = null;
  public lastShooter: number | null = null;
  public timeSinceRelease: number = 0;
  public isPass: boolean = false;
  public isDribbling: boolean = false;

  // 物理ボディ
  private physicsAggregate: PhysicsAggregate | null = null;

  // フォールバック用の速度（物理エンジンがない場合に使用）
  private fallbackVelocity: Vector3 = Vector3.Zero();

  // 物理演算モード（true = キネマティック/ANIMATED、false = ダイナミック/DYNAMIC）
  private isKinematicMode: boolean = true;

  // 位置補正フラグ（DYNAMICモード中の衝突補正後に物理同期が必要）
  private needsPositionSync: boolean = false;

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
      'ball',
      {
        diameter: BALL_CONFIG.radius * 2,
        segments: 32,
      },
      this.scene
    );

    ball.position = position;

    const material = new StandardMaterial('ball-material', this.scene);
    material.diffuseColor = new Color3(1, 0.4, 0);
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    material.emissiveColor = new Color3(0.5, 0.2, 0);
    ball.material = material;

    return ball;
  }

  /**
   * 物理ボディを初期化
   */
  private initializePhysics(): void {
    if (!this.scene.getPhysicsEngine()) {
      console.warn("[Ball] Physics engine not enabled on scene, will use fallback physics");
      return;
    }

    try {
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

      // ダンピング値を設定
      this.physicsAggregate.body.setLinearDamping(PhysicsConstants.BALL.LINEAR_DAMPING);
      this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

      // 初期状態はANIMATED（キネマティック）モード
      this.isKinematicMode = true;
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.physicsAggregate.body.disablePreStep = false;

      console.log("[Ball] Physics body initialized with Havok (ANIMATED mode)");
    } catch (error) {
      console.warn("[Ball] Failed to initialize physics:", error);
      this.physicsAggregate = null;
    }
  }

  /**
   * キネマティックモードを設定
   * @param isKinematic true=ANIMATED（手動制御）、false=DYNAMIC（物理演算）
   */
  private setKinematic(isKinematic: boolean): void {
    this.isKinematicMode = isKinematic;

    if (!this.physicsAggregate) return;

    if (isKinematic) {
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      // ANIMATEDモードではメッシュ位置を物理ボディに同期
      this.physicsAggregate.body.disablePreStep = false;
    } else {
      // DYNAMICモードに切り替える前に、現在のメッシュ位置を物理ボディに設定
      this.physicsAggregate.body.disablePreStep = false;
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
      // DYNAMICモードでは物理エンジンが位置を制御
      this.physicsAggregate.body.disablePreStep = true;
    }
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
   * DYNAMICモードでは物理ボディの位置も更新（衝突補正用）
   */
  setPosition(position: Vector3): void {
    const minY = BALL_CONFIG.radius;
    const clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, minY),
      position.z
    );

    this.mesh.position = clampedPosition;

    if (this.physicsAggregate) {
      // メッシュ位置を物理ボディに同期するフラグを設定
      this.physicsAggregate.body.disablePreStep = false;

      if (!this.isKinematicMode) {
        // DYNAMICモード中の位置補正: 次のupdatePhysicsでDYNAMICに戻す
        this.needsPositionSync = true;
      }
    }
  }

  /**
   * ボールがフリー（所持されていない）か
   */
  isFree(): boolean {
    return this.owner === null;
  }

  /**
   * ボールがアクティブなシュート中かどうか
   */
  isActiveShot(): boolean {
    if (!this.isFree()) return false;
    if (this.isPass) return false;

    const speed = this.getVelocity().length();
    const height = this.mesh.position.y;

    return speed > 3.0 || height > 1.5;
  }

  /**
   * ボールが拾える状態かどうか
   */
  isPickupable(): boolean {
    if (!this.isFree()) return false;
    if (this.isActiveShot()) return false;
    return true;
  }

  /**
   * ボールを取得
   */
  pickUp(playerId: number): void {
    this.owner = playerId;
    this.lastShooter = null;
    this.timeSinceRelease = 0;
    this.isPass = false;
    this.fallbackVelocity = Vector3.Zero();

    // 物理を停止（ANIMATEDモードに切り替え）
    this.setKinematic(true);
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
      this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * ボールを手放す（シュート時）
   */
  release(isPass: boolean = false): void {
    this.lastShooter = this.owner;
    this.owner = null;
    this.timeSinceRelease = 0;
    this.isPass = isPass;
    this.isDribbling = false;

    // 物理を有効化（DYNAMICモードに切り替え）
    this.setKinematic(false);

    console.log(`[Ball] Released - isKinematicMode: ${this.isKinematicMode}, hasPhysicsAggregate: ${!!this.physicsAggregate}`);
  }

  /**
   * ドリブル開始
   */
  startDribble(): void {
    this.isDribbling = true;
  }

  /**
   * ドリブル停止
   */
  stopDribble(): void {
    this.isDribbling = false;
  }

  /**
   * 速度を設定
   */
  setVelocity(velocity: Vector3): void {
    // フォールバック用にも保存
    this.fallbackVelocity = velocity.clone();

    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(velocity);
      console.log(`[Ball] setVelocity on physics body: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`);
    } else {
      console.log(`[Ball] setVelocity fallback only: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`);
    }
  }

  /**
   * 速度を取得
   */
  getVelocity(): Vector3 {
    if (this.physicsAggregate && !this.isKinematicMode) {
      return this.physicsAggregate.body.getLinearVelocity();
    }
    return this.fallbackVelocity.clone();
  }

  /**
   * 物理演算の更新
   * Havok物理エンジンがDYNAMICモードで自動処理、なければフォールバック
   */
  updatePhysics(deltaTime: number): void {
    // 所持されている場合は物理演算しない（ドリブル中は例外）
    if (this.owner !== null && !this.isDribbling) {
      return;
    }

    // リリース後の経過時間をカウント
    this.timeSinceRelease += deltaTime;

    // 物理エンジンがない場合のフォールバック
    if (!this.physicsAggregate) {
      this.updatePhysicsFallback(deltaTime);
      return;
    }

    // 位置補正後の同期処理（DYNAMICモードに戻す）
    if (this.needsPositionSync && !this.isKinematicMode) {
      // 位置同期後、物理エンジンに制御を戻す
      this.physicsAggregate.body.disablePreStep = true;
      this.needsPositionSync = false;
    }

    // DYNAMICモードではHavokが自動で処理するため、停止判定のみ行う
    if (!this.isKinematicMode) {
      const velocity = this.getVelocity();
      const speed = velocity.length();
      const currentPosition = this.getPosition();
      const isOnGround = currentPosition.y <= BALL_CONFIG.radius + 0.05;

      // 地面で速度が小さい場合は停止（ANIMATEDモードに切り替え）
      if (speed < 0.1 && isOnGround && Math.abs(velocity.y) < 0.1) {
        this.setKinematic(true);
        this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
        this.fallbackVelocity = Vector3.Zero();
      }
    }
  }

  /**
   * 物理エンジンなしのフォールバック処理
   * PhysicsConstantsから重力・反発係数を使用
   */
  private updatePhysicsFallback(deltaTime: number): void {
    const velocity = this.getVelocity();
    const speed = velocity.length();
    const currentPosition = this.getPosition();
    const visualRadius = BALL_CONFIG.radius; // 視覚的なサイズ
    const isOnGround = currentPosition.y <= visualRadius + 0.01;

    if (speed < 0.01 && isOnGround) {
      return;
    }

    // PhysicsConstantsから重力を適用
    velocity.y -= PhysicsConstants.GRAVITY_MAGNITUDE * deltaTime;

    // 地面にいる場合は摩擦を適用
    if (isOnGround) {
      const frictionCoefficient = 1 - PhysicsConstants.BALL.FRICTION * 0.2;
      velocity.x *= Math.pow(frictionCoefficient, deltaTime * 60);
      velocity.z *= Math.pow(frictionCoefficient, deltaTime * 60);
    }

    // 位置を更新
    const movement = velocity.scale(deltaTime);
    const newPosition = currentPosition.add(movement);
    this.setPosition(newPosition);

    // 地面との衝突（バウンド）- PhysicsConstantsから反発係数を使用
    if (newPosition.y <= visualRadius && velocity.y < 0) {
      const bounceVelocityY = -velocity.y * PhysicsConstants.BALL.RESTITUTION;

      // 最小バウンド速度以下なら停止
      if (Math.abs(bounceVelocityY) < PhysicsConstants.BALL.MIN_BOUNCE_VELOCITY) {
        velocity.y = 0;
      } else {
        velocity.y = bounceVelocityY;
      }
      this.setPosition(new Vector3(newPosition.x, visualRadius, newPosition.z));
    }

    this.setVelocity(velocity);
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
