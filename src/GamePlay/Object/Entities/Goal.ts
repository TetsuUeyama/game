/**
 * ゴール設定（バスケットゴール）
 */

import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsMaterialCombineMode,
} from "@babylonjs/core";
import { Net } from "@/GamePlay/Object/Entities/Net";
import { PhysicsConstants } from "@/GamePlay/Object/Physics/PhysicsConfig";
import { FIELD_CONFIG } from "@/GamePlay/GameSystem/FieldSystem/FieldGridConfig";

// ゴール設定
export const GOAL_CONFIG = {
  // リム（リング）設定
  rimHeight: 3.05, // リムの高さ（m）
  rimDiameter: 0.45, // リムの内径（m）- 実際のサイズに近づける
  rimThickness: 0.02, // リムの太さ（m）
  rimColor: '#FF6600', // リムの色（オレンジ）

  // バックボード設定
  backboardHeight: 1.05, // バックボードの高さ（m）
  backboardWidth: 1.8, // バックボードの幅（m）
  backboardDepth: 0.05, // バックボードの厚さ（m）
  backboardDistance: 1.2, // エンドラインからバックボードまでの距離（m）
  rimOffset: 0.4, // バックボードからリム中心までの距離（m）

  // ネット設定
  netSegmentsVertical: 10, // ネットの縦方向セグメント数
  netSegmentsCircular: 16, // ネットの円周方向セグメント数
  netLength: 0.45, // ネットの長さ（m）
  netStiffness: 0.8, // ネットの硬さ（0-1）
  netDamping: 0.85, // ネットの減衰（0-1）
  netColor: '#FFFFFF', // ネットの色（白）
};

/**
 * バスケットゴールクラス
 * 1つのゴール（backboard + rim + net + targetMarker）を管理する
 */
export class Goal {
  private scene: Scene;
  private backboard: Mesh;
  private rim: Mesh;
  private net: Net;
  private targetMarker: Mesh;
  private backboardPhysics: PhysicsAggregate | null = null;
  private rimPhysics: PhysicsAggregate | null = null;

  constructor(scene: Scene, goalNumber: 1 | 2) {
    this.scene = scene;
    const fieldHalfLength = FIELD_CONFIG.length / 2;

    // ゴール1は+Z側（奥）、ゴール2は-Z側（手前）
    const zSign = goalNumber === 1 ? 1 : -1;
    const zPosition = zSign * (fieldHalfLength - GOAL_CONFIG.backboardDistance);

    // バックボード
    this.backboard = MeshBuilder.CreateBox(
      `backboard-${goalNumber}`,
      {
        width: GOAL_CONFIG.backboardWidth,
        height: GOAL_CONFIG.backboardHeight,
        depth: GOAL_CONFIG.backboardDepth,
      },
      this.scene
    );

    this.backboard.position = new Vector3(
      0,
      GOAL_CONFIG.rimHeight + GOAL_CONFIG.backboardHeight / 2,
      zPosition
    );

    const backboardMaterial = new StandardMaterial(
      `backboard-material-${goalNumber}`,
      this.scene
    );
    // goal1（+Z側）は青チームが攻める → 青色
    // goal2（-Z側）は赤チームが攻める → 赤色
    if (goalNumber === 1) {
      backboardMaterial.diffuseColor = new Color3(0.3, 0.5, 1); // 青
      backboardMaterial.emissiveColor = new Color3(0.05, 0.1, 0.3);
    } else {
      backboardMaterial.diffuseColor = new Color3(1, 0.3, 0.3); // 赤
      backboardMaterial.emissiveColor = new Color3(0.3, 0.05, 0.05);
    }
    backboardMaterial.alpha = 0.6;
    this.backboard.material = backboardMaterial;

    // リム（輪）
    this.rim = MeshBuilder.CreateTorus(
      `rim-${goalNumber}`,
      {
        diameter: GOAL_CONFIG.rimDiameter,
        thickness: GOAL_CONFIG.rimThickness,
        tessellation: 32,
      },
      this.scene
    );

    // リムの位置：バックボードからrimOffset分だけコート内側に配置
    this.rim.position = new Vector3(
      0,
      GOAL_CONFIG.rimHeight,
      zPosition - zSign * GOAL_CONFIG.rimOffset
    );

    const rimMaterial = new StandardMaterial(`rim-material-${goalNumber}`, this.scene);
    rimMaterial.diffuseColor = Color3.FromHexString(GOAL_CONFIG.rimColor);
    rimMaterial.emissiveColor = Color3.FromHexString(GOAL_CONFIG.rimColor).scale(0.3);
    this.rim.material = rimMaterial;

    // シュート目標マーカー（リム中心の、ボール半径分高い位置）
    this.targetMarker = MeshBuilder.CreateSphere(
      `target-marker-${goalNumber}`,
      {
        diameter: 0.08, // 小さな点（直径8cm）
        segments: 8,
      },
      this.scene
    );
    this.targetMarker.position = new Vector3(
      0,
      GOAL_CONFIG.rimHeight + 10 * PhysicsConstants.BALL.RADIUS, // リム高さ + ボール半径
      zPosition - zSign * GOAL_CONFIG.rimOffset // リムと同じZ位置
    );
    const markerMaterial = new StandardMaterial(`marker-material-${goalNumber}`, this.scene);
    markerMaterial.diffuseColor = new Color3(1, 1, 0); // 黄色
    markerMaterial.emissiveColor = new Color3(1, 1, 0); // 発光
    this.targetMarker.material = markerMaterial;
    this.targetMarker.isPickable = false; // クリック判定なし

    // ネット
    const rimCenter = this.rim.position.clone();
    this.net = new Net(this.scene, rimCenter, goalNumber === 1 ? "goal1" : "goal2");
  }

  // 公開アクセサ

  getBackboard(): Mesh {
    return this.backboard;
  }

  getRim(): Mesh {
    return this.rim;
  }

  getNet(): Net {
    return this.net;
  }

  getTargetMarker(): Mesh {
    return this.targetMarker;
  }

  getRimPosition(): Vector3 {
    return this.rim.position.clone();
  }

  getBackboardPosition(): Vector3 {
    return this.backboard.position.clone();
  }

  // ライフサイクル

  /**
   * Havok物理エンジンでバックボード・リムの物理ボディを初期化
   */
  initializePhysics(): void {
    // バックボードの静的物理ボディ
    this.backboardPhysics = new PhysicsAggregate(
      this.backboard,
      PhysicsShapeType.BOX,
      {
        mass: 0,
        restitution: PhysicsConstants.BACKBOARD.RESTITUTION,
        friction: PhysicsConstants.BACKBOARD.FRICTION,
      },
      this.scene
    );

    // リムの静的物理ボディ（トーラス形状はMESHで近似）
    this.rimPhysics = new PhysicsAggregate(
      this.rim,
      PhysicsShapeType.MESH,
      {
        mass: 0,
        restitution: PhysicsConstants.RIM.RESTITUTION,
        friction: PhysicsConstants.RIM.FRICTION,
      },
      this.scene
    );
    // マテリアル設定: 反発係数を両オブジェクトの積で計算
    this.rimPhysics.shape.material = {
      restitution: PhysicsConstants.RIM.RESTITUTION,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: PhysicsConstants.RIM.FRICTION,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };

    // ネットの物理を初期化
    this.net.initializePhysics();
  }

  /**
   * 更新（ネットの物理シミュレーション）
   */
  update(deltaTime: number): void {
    this.net.update(deltaTime);
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.backboardPhysics?.dispose();
    this.rimPhysics?.dispose();
    this.backboard.dispose();
    this.rim.dispose();
    this.net.dispose();
    this.targetMarker.dispose();
  }
}
