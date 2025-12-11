import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
} from '@babylonjs/core';
import { BALL_CONFIG } from '../config/gameConfig';

/**
 * 3Dバスケットボールエンティティ
 */
export class Ball {
  private scene: Scene;
  public mesh: Mesh;
  public owner: number | null = null; // 所持者のプレイヤーID（null = フリー）

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.mesh = this.createBall(position);
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

    // マテリアル（オレンジ色のバスケットボール）
    const material = new StandardMaterial('ball-material', this.scene);
    material.diffuseColor = new Color3(1, 0.4, 0); // オレンジ
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    material.emissiveColor = new Color3(0.5, 0.2, 0); // より明るく光らせる
    ball.material = material;

    return ball;
  }

  /**
   * 位置を取得
   */
  getPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  /**
   * 位置を設定
   */
  setPosition(position: Vector3): void {
    // ボールの最小Y座標（地面に接する高さ）
    // 球体の中心から底までの距離 = radius
    const minY = BALL_CONFIG.radius;

    // Y座標が地面より下にならないように制限
    const clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, minY),
      position.z
    );

    this.mesh.position = clampedPosition;
  }

  /**
   * ボールがフリー（所持されていない）か
   */
  isFree(): boolean {
    return this.owner === null;
  }

  /**
   * ボールを取得
   */
  pickUp(playerId: number): void {
    this.owner = playerId;
  }

  /**
   * ボールを手放す
   */
  release(): void {
    this.owner = null;
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.mesh.dispose();
  }
}
