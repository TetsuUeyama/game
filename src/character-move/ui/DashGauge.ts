

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, DynamicTexture } from "@babylonjs/core";

/**
 * ダッシュゲージ
 * キャラクターの頭上に表示されるゲージ
 */
export class DashGauge {
  private scene: Scene;
  private gaugeMesh: Mesh;
  private material: StandardMaterial;
  private texture: DynamicTexture;
  private isVisible: boolean = false;

  // ゲージのサイズ
  private readonly gaugeWidth: number = 1.2;
  private readonly gaugeHeight: number = 0.15;

  // ダッシュ加速パラメータ
  private readonly maxAccelerationTime: number = 1.0; // 最高速度到達までの時間（秒）

  constructor(scene: Scene) {
    this.scene = scene;

    // ゲージメッシュを作成（平面）
    this.gaugeMesh = MeshBuilder.CreatePlane(
      "dashGauge",
      { width: this.gaugeWidth, height: this.gaugeHeight },
      scene
    );

    // 初期状態では非表示
    this.gaugeMesh.isVisible = false;

    // マテリアルとテクスチャを作成
    this.material = new StandardMaterial("dashGaugeMaterial", scene);
    this.texture = new DynamicTexture("dashGaugeTexture", { width: 512, height: 64 }, scene, false);
    this.material.diffuseTexture = this.texture;
    this.material.emissiveColor = new Color3(1, 1, 1); // 自発光で見やすく
    this.material.backFaceCulling = false; // 両面表示
    this.gaugeMesh.material = this.material;

    // ビルボード設定（常にカメラの方を向く）
    this.gaugeMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  }

  /**
   * ゲージを表示
   */
  public show(): void {
    this.isVisible = true;
    this.gaugeMesh.isVisible = true;
  }

  /**
   * ゲージを非表示
   */
  public hide(): void {
    this.isVisible = false;
    this.gaugeMesh.isVisible = false;
  }

  /**
   * ゲージの位置を更新
   * @param characterPosition キャラクターの位置
   */
  public updatePosition(characterPosition: Vector3): void {
    // キャラクターの頭上に配置
    this.gaugeMesh.position = new Vector3(
      characterPosition.x,
      characterPosition.y + 2.5, // 頭上
      characterPosition.z
    );
  }

  /**
   * ダッシュ加速度を更新
   * @param accelerationTime ダッシュ継続時間（秒）
   */
  public updateAcceleration(accelerationTime: number): void {
    // 加速割合を計算（0.0 ~ 1.0）
    const accelerationRatio = Math.min(accelerationTime / this.maxAccelerationTime, 1.0);

    // 速度に応じて色を変化
    let barColor: string;

    if (accelerationRatio < 0.3) {
      barColor = "#FFFF00"; // 黄色（加速開始）
    } else if (accelerationRatio < 0.7) {
      barColor = "#FFA500"; // オレンジ（加速中）
    } else if (accelerationRatio < 1.0) {
      barColor = "#FF4500"; // 濃いオレンジ（高速）
    } else {
      barColor = "#FF0000"; // 赤（最高速度）
    }

    // テクスチャを描画
    this.drawGauge(accelerationRatio, barColor);
  }

  /**
   * ゲージを描画
   * @param ratio 加速割合（0.0 ~ 1.0）
   * @param barColor バーの色
   */
  private drawGauge(ratio: number, barColor: string): void {
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    const width = this.texture.getSize().width;
    const height = this.texture.getSize().height;

    // 背景をクリア
    ctx.clearRect(0, 0, width, height);

    // 外枠を描画
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, width - 8, height - 8);

    // 背景（空の部分）を描画
    ctx.fillStyle = "#333333";
    ctx.fillRect(8, 8, width - 16, height - 16);

    // ダッシュバーを描画
    const barWidth = (width - 16) * ratio;
    ctx.fillStyle = barColor;
    ctx.fillRect(8, 8, barWidth, height - 16);

    // 最高速度の場合はテキストを表示
    if (ratio >= 1.0) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("MAX SPEED!", width / 2, height / 2);
    }

    // テクスチャを更新
    this.texture.update();
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.gaugeMesh.dispose();
  }

  /**
   * ゲージが表示中かどうか
   */
  public isShowing(): boolean {
    return this.isVisible;
  }
}
