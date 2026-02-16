import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, DynamicTexture } from "@babylonjs/core";

/**
 * ジャンプチャージゲージ
 * キャラクターの足元に表示されるゲージ
 */
export class JumpChargeGauge {
  private gaugeMesh: Mesh;
  private material: StandardMaterial;
  private texture: DynamicTexture;
  private isVisible: boolean = false;

  // ゲージのサイズ
  private readonly gaugeWidth: number = 1.0;
  private readonly gaugeHeight: number = 0.1;

  // チャージレベルの閾値（秒）
  private readonly smallJumpThreshold: number = 0.05;
  private readonly mediumJumpThreshold: number = 0.2;
  private readonly maxChargeTime: number = 0.3;

  constructor(scene: Scene) {
    // ゲージメッシュを作成（平面）
    this.gaugeMesh = MeshBuilder.CreatePlane(
      "jumpChargeGauge",
      { width: this.gaugeWidth, height: this.gaugeHeight },
      scene
    );

    // 初期状態では非表示
    this.gaugeMesh.isVisible = false;

    // マテリアルとテクスチャを作成
    this.material = new StandardMaterial("gaugeMateria", scene);
    this.texture = new DynamicTexture("gaugeTexture", { width: 512, height: 64 }, scene, false);
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
    // キャラクターの足元（地面）、カメラ側（手前）に配置
    this.gaugeMesh.position = new Vector3(
      characterPosition.x,
      0.05, // 地面から少しだけ浮かせて表示
      characterPosition.z - 0.5 // カメラ側（手前）にオフセット
    );
  }

  /**
   * チャージ量を更新
   * @param chargeTime チャージ時間（秒）
   */
  public updateCharge(chargeTime: number): void {
    // チャージ割合を計算（0.0 ~ 1.0）
    const chargeRatio = Math.min(chargeTime / this.maxChargeTime, 1.0);

    // チャージレベルに応じて色を決定
    let barColor: string;
    let levelText: string;

    if (chargeTime < this.smallJumpThreshold) {
      barColor = "#888888"; // グレー（チャージ不足）
      levelText = "";
    } else if (chargeTime < this.mediumJumpThreshold) {
      barColor = "#00FF00"; // 緑（小ジャンプ）
      levelText = "SMALL";
    } else if (chargeTime < this.maxChargeTime) {
      barColor = "#FFFF00"; // 黄色（中ジャンプ）
      levelText = "MEDIUM";
    } else {
      barColor = "#FF0000"; // 赤（大ジャンプ）
      levelText = "LARGE";
    }

    // テクスチャを描画
    this.drawGauge(chargeRatio, barColor, levelText);
  }

  /**
   * ゲージを描画
   * @param ratio チャージ割合（0.0 ~ 1.0）
   * @param barColor バーの色
   * @param levelText レベルテキスト
   */
  private drawGauge(ratio: number, barColor: string, levelText: string): void {
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

    // チャージバーを描画
    const barWidth = (width - 16) * ratio;
    ctx.fillStyle = barColor;
    ctx.fillRect(8, 8, barWidth, height - 16);

    // レベルテキストを描画
    if (levelText) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 32px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(levelText, width / 2, height / 2);
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
