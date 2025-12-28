import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh, AbstractMesh } from "@babylonjs/core";
import { CHARACTER_CONFIG } from "../config/gameConfig";

/**
 * 3Dキャラクターエンティティ
 */
export class Character {
  public scene: Scene;
  public mesh: Mesh; // ルートメッシュ（カプセルまたは3Dモデル）
  public model: AbstractMesh | null = null; // 読み込んだ3Dモデル

  public position: Vector3; // 位置
  public rotation: number = 0; // Y軸周りの回転（ラジアン）
  public velocity: Vector3 = Vector3.Zero(); // 速度ベクトル

  private groundY: number = CHARACTER_CONFIG.height / 2; // 地面のY座標

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.position = position.clone();

    // 初期状態では仮のカプセルメッシュを作成
    this.mesh = this.createPlaceholderMesh();
  }

  /**
   * 仮のメッシュを作成（3Dモデルロード前の表示用）
   */
  private createPlaceholderMesh(): Mesh {
    // カプセル形状でキャラクターを表現
    const capsule = MeshBuilder.CreateCapsule(
      "character-placeholder",
      {
        radius: CHARACTER_CONFIG.radius,
        height: CHARACTER_CONFIG.height,
        tessellation: 16,
      },
      this.scene
    );

    capsule.position = this.position;

    // マテリアル
    const material = new StandardMaterial("character-material", this.scene);
    material.diffuseColor = new Color3(0.3, 0.6, 0.9); // 青色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    capsule.material = material;

    return capsule;
  }

  /**
   * 3Dモデルを設定
   * @param model ロードした3Dモデル
   */
  public setModel(model: AbstractMesh): void {
    // 既存の仮メッシュを非表示に
    if (this.mesh) {
      this.mesh.isVisible = false;
    }

    // モデルをルートメッシュの子として追加
    this.model = model;
    this.model.parent = this.mesh;

    // モデルの位置をルートメッシュの中心に配置
    // （3Dモデルの原点がキャラクターの足元にある場合は調整が必要）
    this.model.position = new Vector3(0, -CHARACTER_CONFIG.height / 2, 0);
  }

  /**
   * 位置を取得
   */
  public getPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  /**
   * 位置を設定
   */
  public setPosition(position: Vector3): void {
    // Y座標が地面より下にならないように制限
    const clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, this.groundY),
      position.z
    );

    this.mesh.position = clampedPosition;
    this.position = clampedPosition;
  }

  /**
   * 向きを設定（ラジアン）
   */
  public setRotation(angle: number): void {
    this.rotation = angle;
    this.mesh.rotation.y = angle;
  }

  /**
   * 向きを取得（ラジアン）
   */
  public getRotation(): number {
    return this.rotation;
  }

  /**
   * 前方方向ベクトルを取得
   */
  public getForwardDirection(): Vector3 {
    return new Vector3(
      Math.sin(this.rotation),
      0,
      Math.cos(this.rotation)
    );
  }

  /**
   * 右方向ベクトルを取得
   */
  public getRightDirection(): Vector3 {
    return new Vector3(
      Math.cos(this.rotation),
      0,
      -Math.sin(this.rotation)
    );
  }

  /**
   * 指定方向に移動
   * @param direction 移動方向ベクトル（正規化済み）
   * @param deltaTime フレーム時間（秒）
   */
  public move(direction: Vector3, deltaTime: number): void {
    // 速度を計算
    const speed = CHARACTER_CONFIG.speed;
    this.velocity = direction.scale(speed);

    // 新しい位置を計算
    const newPosition = this.mesh.position.add(this.velocity.scale(deltaTime));

    // 位置を更新
    this.setPosition(newPosition);
  }

  /**
   * ターゲット位置を向く
   * @param targetPosition ターゲット位置
   */
  public lookAt(targetPosition: Vector3): void {
    const direction = targetPosition.subtract(this.mesh.position);
    direction.y = 0; // Y軸は無視（水平面での回転のみ）

    if (direction.length() > 0.01) {
      const angle = Math.atan2(direction.x, direction.z);
      this.setRotation(angle);
    }
  }

  /**
   * スムーズに回転（補間）
   * @param targetRotation ターゲット回転（ラジアン）
   * @param deltaTime フレーム時間（秒）
   */
  public rotateTowards(targetRotation: number, deltaTime: number): void {
    const rotationSpeed = CHARACTER_CONFIG.rotationSpeed;

    // 角度差を計算（-π から π の範囲に正規化）
    let diff = targetRotation - this.rotation;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // 回転量を計算（速度を考慮）
    const maxRotation = rotationSpeed * deltaTime;
    const rotation = Math.max(-maxRotation, Math.min(maxRotation, diff));

    // 回転を適用
    this.setRotation(this.rotation + rotation);
  }

  /**
   * 更新
   * @param deltaTime フレーム時間（秒）
   */
  public update(deltaTime: number): void {
    // 現在は特に処理なし
    // 将来的にアニメーション更新などを追加可能
  }

  /**
   * 破棄
   */
  public dispose(): void {
    if (this.model) {
      this.model.dispose();
    }
    if (this.mesh) {
      this.mesh.dispose();
    }
  }
}
