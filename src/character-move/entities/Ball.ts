import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
} from "@babylonjs/core";
import type { Character } from "./Character";

/**
 * バスケットボール半径（m）= 直径50cm
 */
const BALL_RADIUS = 0.15;

/**
 * ボールを保持した時の頭上からの高さ（m）
 */
const HELD_HEIGHT_OFFSET = 2.0; // キャラクターの位置（足元）からの高さ

/**
 * 3Dバスケットボールエンティティ
 */
export class Ball {
  private scene: Scene;
  public mesh: Mesh;
  private holder: Character | null = null; // ボールを保持しているキャラクター

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.mesh = this.createBall(position);
  }

  /**
   * ボールメッシュを作成
   */
  private createBall(position: Vector3): Mesh {
    const ball = MeshBuilder.CreateSphere(
      "ball",
      {
        diameter: BALL_RADIUS * 2,
        segments: 32,
      },
      this.scene
    );

    ball.position = position;

    // マテリアル（オレンジ色のバスケットボール）
    const material = new StandardMaterial("ball-material", this.scene);
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
    // 保持中の場合は位置を直接設定できない
    if (this.holder) {
      return;
    }

    // ボールの最小Y座標（地面に接する高さ）
    // 球体の中心から底までの距離 = radius
    const minY = BALL_RADIUS;

    // Y座標が地面より下にならないように制限
    const clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, minY),
      position.z
    );

    this.mesh.position = clampedPosition;
  }

  /**
   * ボールが保持されているかどうか
   */
  isHeld(): boolean {
    return this.holder !== null;
  }

  /**
   * ボールの保持者を設定
   */
  setHolder(character: Character | null): void {
    this.holder = character;
  }

  /**
   * ボールの保持者を取得
   */
  getHolder(): Character | null {
    return this.holder;
  }

  /**
   * 更新処理（保持中はキャラクターに追従）
   */
  update(_deltaTime: number): void {
    if (this.holder) {
      // 保持者の位置を取得
      const holderPosition = this.holder.getPosition();

      // 頭上に配置
      this.mesh.position = new Vector3(
        holderPosition.x,
        holderPosition.y + HELD_HEIGHT_OFFSET,
        holderPosition.z
      );
    }
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.mesh.dispose();
  }
}
