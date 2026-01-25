import {
  Scene,
  Vector3,
  PhysicsAggregate,
  PhysicsShapeType,
  Mesh,
  Observable,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

/**
 * 物理パラメータの設定
 */
export interface PhysicsConfig {
  gravity?: Vector3;
  defaultRestitution?: number;
  defaultFriction?: number;
}

/**
 * 物理ボディ作成オプション
 */
export interface PhysicsBodyOptions {
  mass: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  angularDamping?: number;
}

/**
 * 衝突イベント情報
 */
export interface CollisionEvent {
  bodyA: PhysicsAggregate;
  bodyB: PhysicsAggregate;
  point: Vector3;
  normal: Vector3;
  impulse: number;
}

/**
 * 物理エンジンマネージャー
 * Havok物理エンジンのシングルトン管理クラス
 */
export class PhysicsManager {
  private static instance: PhysicsManager | null = null;
  private scene: Scene | null = null;
  private havokPlugin: HavokPlugin | null = null;
  private isInitialized: boolean = false;

  // 物理パラメータ
  public static readonly DEFAULT_GRAVITY = new Vector3(0, -9.81, 0);
  public static readonly BALL_MASS = 0.62; // バスケットボールの質量(kg)
  public static readonly BALL_RESTITUTION = 0.7; // 反発係数
  public static readonly BALL_FRICTION = 0.5;
  public static readonly PLAYER_MASS = 80; // デフォルトプレイヤー質量(kg)
  public static readonly GROUND_FRICTION = 0.8;

  // 衝突イベントのObservable
  public onCollision: Observable<CollisionEvent> = new Observable();

  private constructor() {}

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): PhysicsManager {
    if (!PhysicsManager.instance) {
      PhysicsManager.instance = new PhysicsManager();
    }
    return PhysicsManager.instance;
  }

  /**
   * 物理エンジンを初期化
   */
  public async initialize(scene: Scene, config?: PhysicsConfig): Promise<void> {
    if (this.isInitialized && this.scene === scene) {
      console.log("[PhysicsManager] Already initialized for this scene");
      return;
    }

    this.scene = scene;

    try {
      // Havokインスタンスを作成
      const havokInstance = await HavokPhysics();

      // HavokPluginを作成
      this.havokPlugin = new HavokPlugin(true, havokInstance);

      // 重力を設定してシーンに物理を有効化
      const gravity = config?.gravity ?? PhysicsManager.DEFAULT_GRAVITY;
      scene.enablePhysics(gravity, this.havokPlugin);

      this.isInitialized = true;
      console.log("[PhysicsManager] Initialized with Havok physics engine");
    } catch (error) {
      console.error("[PhysicsManager] Failed to initialize Havok:", error);
      throw error;
    }
  }

  /**
   * 初期化済みかどうかを確認
   */
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * 球体の物理ボディを作成
   */
  public createSphereBody(
    mesh: Mesh,
    options: PhysicsBodyOptions
  ): PhysicsAggregate {
    if (!this.isInitialized || !this.scene) {
      throw new Error("[PhysicsManager] Not initialized");
    }

    const aggregate = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.SPHERE,
      {
        mass: options.mass,
        restitution: options.restitution ?? PhysicsManager.BALL_RESTITUTION,
        friction: options.friction ?? PhysicsManager.BALL_FRICTION,
      },
      this.scene
    );

    // ダンピングを設定
    if (options.linearDamping !== undefined) {
      aggregate.body.setLinearDamping(options.linearDamping);
    }
    if (options.angularDamping !== undefined) {
      aggregate.body.setAngularDamping(options.angularDamping);
    }

    return aggregate;
  }

  /**
   * ボックスの物理ボディを作成
   */
  public createBoxBody(
    mesh: Mesh,
    options: PhysicsBodyOptions
  ): PhysicsAggregate {
    if (!this.isInitialized || !this.scene) {
      throw new Error("[PhysicsManager] Not initialized");
    }

    return new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      {
        mass: options.mass,
        restitution: options.restitution ?? 0.3,
        friction: options.friction ?? PhysicsManager.GROUND_FRICTION,
      },
      this.scene
    );
  }

  /**
   * カプセルの物理ボディを作成（プレイヤー用）
   */
  public createCapsuleBody(
    mesh: Mesh,
    options: PhysicsBodyOptions
  ): PhysicsAggregate {
    if (!this.isInitialized || !this.scene) {
      throw new Error("[PhysicsManager] Not initialized");
    }

    return new PhysicsAggregate(
      mesh,
      PhysicsShapeType.CAPSULE,
      {
        mass: options.mass,
        restitution: options.restitution ?? 0.1,
        friction: options.friction ?? PhysicsManager.GROUND_FRICTION,
      },
      this.scene
    );
  }

  /**
   * 静的な地面を作成
   */
  public createStaticGround(mesh: Mesh): PhysicsAggregate {
    if (!this.isInitialized || !this.scene) {
      throw new Error("[PhysicsManager] Not initialized");
    }

    return new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      {
        mass: 0, // 静的オブジェクト
        restitution: 0.5,
        friction: PhysicsManager.GROUND_FRICTION,
      },
      this.scene
    );
  }

  /**
   * 物理ボディに力を加える
   */
  public applyForce(
    aggregate: PhysicsAggregate,
    force: Vector3,
    point?: Vector3
  ): void {
    if (point) {
      aggregate.body.applyForce(force, point);
    } else {
      aggregate.body.applyForce(force, aggregate.body.getObjectCenterWorld());
    }
  }

  /**
   * 物理ボディにインパルスを加える（瞬間的な力）
   */
  public applyImpulse(
    aggregate: PhysicsAggregate,
    impulse: Vector3,
    point?: Vector3
  ): void {
    if (point) {
      aggregate.body.applyImpulse(impulse, point);
    } else {
      aggregate.body.applyImpulse(impulse, aggregate.body.getObjectCenterWorld());
    }
  }

  /**
   * 物理ボディの速度を設定
   */
  public setLinearVelocity(aggregate: PhysicsAggregate, velocity: Vector3): void {
    aggregate.body.setLinearVelocity(velocity);
  }

  /**
   * 物理ボディの速度を取得
   */
  public getLinearVelocity(aggregate: PhysicsAggregate): Vector3 {
    return aggregate.body.getLinearVelocity();
  }

  /**
   * 物理ボディの角速度を設定
   */
  public setAngularVelocity(aggregate: PhysicsAggregate, velocity: Vector3): void {
    aggregate.body.setAngularVelocity(velocity);
  }

  /**
   * 物理シミュレーションをステップ実行
   * 注意: 通常はBabylon.jsが自動でステップを実行するため、手動呼び出しは不要
   */
  public step(_deltaTime: number): void {
    // Babylon.jsは内部でステップを管理するため、通常は不要
    // 必要な場合のみ使用
  }

  /**
   * 物理エンジンを破棄
   */
  public dispose(): void {
    if (this.scene) {
      this.scene.disablePhysicsEngine();
    }
    this.havokPlugin = null;
    this.scene = null;
    this.isInitialized = false;
    PhysicsManager.instance = null;
    console.log("[PhysicsManager] Disposed");
  }

  /**
   * 現在のシーンを取得
   */
  public getScene(): Scene | null {
    return this.scene;
  }
}
