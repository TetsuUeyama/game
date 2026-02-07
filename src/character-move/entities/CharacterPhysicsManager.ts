/**
 * キャラクター物理マネージャー
 * Havok物理ボディの初期化・更新・破棄を管理
 */

import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsMotionType,
} from "@babylonjs/core";
import { PhysicsConstants } from "../../physics/PhysicsConfig";
import { CharacterConfig } from "../types/CharacterStats";

/**
 * 手の位置を取得する関数型
 */
export type HandPositionGetter = () => Vector3;

/**
 * キャラクター位置情報
 */
export interface CharacterPositionInfo {
  position: Vector3;
  rotation: number;
  leftHandPosition: Vector3;
  rightHandPosition: Vector3;
}

/**
 * キャラクター物理マネージャー
 */
export class CharacterPhysicsManager {
  private scene: Scene;
  private team: "ally" | "enemy";
  private config: CharacterConfig;

  // Havok物理ボディ（ボールとの衝突用）
  private bodyPhysicsMesh: Mesh | null = null;         // 胴体カプセル（不可視）
  private leftHandPhysicsMesh: Mesh | null = null;     // 左手球体（不可視）
  private rightHandPhysicsMesh: Mesh | null = null;    // 右手球体（不可視）
  private bodyPhysicsAggregate: PhysicsAggregate | null = null;
  private leftHandPhysicsAggregate: PhysicsAggregate | null = null;
  private rightHandPhysicsAggregate: PhysicsAggregate | null = null;
  private physicsInitialized: boolean = false;

  constructor(scene: Scene, team: "ally" | "enemy", config: CharacterConfig) {
    this.scene = scene;
    this.team = team;
    this.config = config;
  }

  /**
   * 設定を更新（身長変更時など）
   */
  public updateConfig(config: CharacterConfig): void {
    this.config = config;
  }

  /**
   * 物理ボディを初期化
   * GameSceneで物理エンジン初期化後に呼び出す
   */
  public initialize(): void {
    if (this.physicsInitialized) {
      return;
    }

    const height = this.config.physical.height;
    const bodyConfig = PhysicsConstants.CHARACTER;

    // 胴体用カプセルメッシュを作成（不可視）
    const capsuleHeight = height * bodyConfig.BODY_CAPSULE_HEIGHT_RATIO;
    this.bodyPhysicsMesh = MeshBuilder.CreateCapsule(
      `${this.team}_body_physics`,
      {
        radius: bodyConfig.BODY_CAPSULE_RADIUS,
        height: capsuleHeight,
        tessellation: 8,
        subdivisions: 1,
      },
      this.scene
    );
    this.bodyPhysicsMesh.isVisible = false;
    this.bodyPhysicsMesh.isPickable = false;

    // 左手用球体メッシュを作成（不可視）
    this.leftHandPhysicsMesh = MeshBuilder.CreateSphere(
      `${this.team}_leftHand_physics`,
      { diameter: bodyConfig.HAND_SPHERE_RADIUS * 2, segments: 8 },
      this.scene
    );
    this.leftHandPhysicsMesh.isVisible = false;
    this.leftHandPhysicsMesh.isPickable = false;

    // 右手用球体メッシュを作成（不可視）
    this.rightHandPhysicsMesh = MeshBuilder.CreateSphere(
      `${this.team}_rightHand_physics`,
      { diameter: bodyConfig.HAND_SPHERE_RADIUS * 2, segments: 8 },
      this.scene
    );
    this.rightHandPhysicsMesh.isVisible = false;
    this.rightHandPhysicsMesh.isPickable = false;

    // 胴体のPhysicsAggregateを作成（ANIMATED = キネマティック）
    this.bodyPhysicsAggregate = new PhysicsAggregate(
      this.bodyPhysicsMesh,
      PhysicsShapeType.CAPSULE,
      {
        mass: 0,  // 静的オブジェクト（ボールに押されない）
        restitution: bodyConfig.BODY_RESTITUTION,
        friction: bodyConfig.FRICTION,
      },
      this.scene
    );
    // キネマティックモードに設定（アニメーションで位置制御）
    this.bodyPhysicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.bodyPhysicsAggregate.body.disablePreStep = false;

    // 左手のPhysicsAggregateを作成
    this.leftHandPhysicsAggregate = new PhysicsAggregate(
      this.leftHandPhysicsMesh,
      PhysicsShapeType.SPHERE,
      {
        mass: 0,
        restitution: bodyConfig.HAND_RESTITUTION,
        friction: bodyConfig.FRICTION,
      },
      this.scene
    );
    this.leftHandPhysicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.leftHandPhysicsAggregate.body.disablePreStep = false;

    // 右手のPhysicsAggregateを作成
    this.rightHandPhysicsAggregate = new PhysicsAggregate(
      this.rightHandPhysicsMesh,
      PhysicsShapeType.SPHERE,
      {
        mass: 0,
        restitution: bodyConfig.HAND_RESTITUTION,
        friction: bodyConfig.FRICTION,
      },
      this.scene
    );
    this.rightHandPhysicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.rightHandPhysicsAggregate.body.disablePreStep = false;

    this.physicsInitialized = true;
  }

  /**
   * 物理ボディが初期化済みかどうか
   */
  public isInitialized(): boolean {
    return this.physicsInitialized;
  }

  /**
   * 物理ボディの位置を更新
   * キャラクターの位置・手の位置に物理メッシュを追従させる
   */
  public updatePositions(positionInfo: CharacterPositionInfo): void {
    if (!this.physicsInitialized) {
      return;
    }

    // 胴体の位置（キャラクター中心）
    if (this.bodyPhysicsMesh) {
      this.bodyPhysicsMesh.position = new Vector3(
        positionInfo.position.x,
        positionInfo.position.y,  // キャラクターの中心位置
        positionInfo.position.z
      );
      this.bodyPhysicsMesh.rotation.y = positionInfo.rotation;
    }

    // 左手の位置（ワールド座標）
    if (this.leftHandPhysicsMesh) {
      this.leftHandPhysicsMesh.position = positionInfo.leftHandPosition;
    }

    // 右手の位置（ワールド座標）
    if (this.rightHandPhysicsMesh) {
      this.rightHandPhysicsMesh.position = positionInfo.rightHandPosition;
    }
  }

  /**
   * 物理ボディの衝突を一時的に無効化/再有効化
   * ジャンプボール中のジャンパーなど、物理衝突を避けたい場合に使用
   * メッシュを遠くに移動して衝突を回避する
   */
  public setPhysicsEnabled(enabled: boolean): void {
    if (!this.physicsInitialized) return;

    if (!enabled) {
      // 物理メッシュを遠くに移動して衝突を回避
      const farAway = new Vector3(0, -100, 0);
      if (this.bodyPhysicsMesh) this.bodyPhysicsMesh.position = farAway;
      if (this.leftHandPhysicsMesh) this.leftHandPhysicsMesh.position = farAway;
      if (this.rightHandPhysicsMesh) this.rightHandPhysicsMesh.position = farAway;
    }
    // enabled=trueの場合は次のupdatePositions()で正しい位置に戻る
  }

  /**
   * パスレシーバーモードを設定
   * 反発係数を0にしてボールが弾かれないようにする
   * @param enabled true=レシーバーモード有効（反発なし）、false=通常モード
   */
  public setPassReceiverMode(enabled: boolean): void {
    if (!this.physicsInitialized) {
      return;
    }

    const restitution = enabled ? 0 : undefined;  // 0=反発なし、undefined=デフォルト値使用

    // 胴体の反発係数を設定
    if (this.bodyPhysicsAggregate?.shape?.material) {
      this.bodyPhysicsAggregate.shape.material.restitution = restitution ?? 0.5;
    }

    // 左手の反発係数を設定
    if (this.leftHandPhysicsAggregate?.shape?.material) {
      this.leftHandPhysicsAggregate.shape.material.restitution = restitution ?? 0.6;
    }

    // 右手の反発係数を設定
    if (this.rightHandPhysicsAggregate?.shape?.material) {
      this.rightHandPhysicsAggregate.shape.material.restitution = restitution ?? 0.6;
    }
  }

  /**
   * 物理ボディを破棄
   */
  public dispose(): void {
    if (this.bodyPhysicsAggregate) {
      this.bodyPhysicsAggregate.dispose();
      this.bodyPhysicsAggregate = null;
    }
    if (this.leftHandPhysicsAggregate) {
      this.leftHandPhysicsAggregate.dispose();
      this.leftHandPhysicsAggregate = null;
    }
    if (this.rightHandPhysicsAggregate) {
      this.rightHandPhysicsAggregate.dispose();
      this.rightHandPhysicsAggregate = null;
    }
    if (this.bodyPhysicsMesh) {
      this.bodyPhysicsMesh.dispose();
      this.bodyPhysicsMesh = null;
    }
    if (this.leftHandPhysicsMesh) {
      this.leftHandPhysicsMesh.dispose();
      this.leftHandPhysicsMesh = null;
    }
    if (this.rightHandPhysicsMesh) {
      this.rightHandPhysicsMesh.dispose();
      this.rightHandPhysicsMesh = null;
    }
    this.physicsInitialized = false;
  }
}
