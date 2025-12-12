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
  public velocity: Vector3 = Vector3.Zero(); // ボールの速度（m/s）

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
   * 速度を設定
   */
  setVelocity(velocity: Vector3): void {
    this.velocity = velocity.clone();
  }

  /**
   * 速度を取得
   */
  getVelocity(): Vector3 {
    return this.velocity.clone();
  }

  /**
   * 物理演算の更新（ボールの転がりと減速）
   * @param deltaTime フレーム時間（秒）
   */
  updatePhysics(deltaTime: number): void {
    // ボールが所持されている場合は物理演算しない
    if (this.owner !== null) {
      this.velocity = Vector3.Zero();
      return;
    }

    // 速度が非常に小さく、地面にいる場合は停止
    const speed = this.velocity.length();
    const currentPosition = this.getPosition();
    const isOnGround = currentPosition.y <= BALL_CONFIG.radius + 0.01;

    if (speed < 0.01 && isOnGround) {
      this.velocity = Vector3.Zero();
      return;
    }

    // 重力を適用（Y軸方向）
    const gravity = -9.81; // m/s²
    this.velocity.y += gravity * deltaTime;

    // 地面にいる場合は摩擦を適用
    if (isOnGround) {
      const frictionCoefficient = 0.9; // 1フレームあたりの速度維持率
      this.velocity.x *= Math.pow(frictionCoefficient, deltaTime * 60);
      this.velocity.z *= Math.pow(frictionCoefficient, deltaTime * 60);
    }

    // 位置を更新
    const movement = this.velocity.scale(deltaTime);
    const newPosition = this.getPosition().add(movement);
    this.setPosition(newPosition);

    // 地面との衝突（バウンド）
    if (newPosition.y <= BALL_CONFIG.radius && this.velocity.y < 0) {
      // バウンド（反発係数0.7）
      this.velocity.y = -this.velocity.y * BALL_CONFIG.bounciness;

      // 位置を地面に補正
      this.setPosition(new Vector3(newPosition.x, BALL_CONFIG.radius, newPosition.z));
    }
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.mesh.dispose();
  }
}
