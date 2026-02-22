import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, DynamicTexture } from "@babylonjs/core";

/**
 * ゲージ UI の基底クラス。
 * Babylon.js の Plane + DynamicTexture でキャラクター周辺に表示するゲージの
 * 共通セットアップ（メッシュ生成、マテリアル、ビルボード）と描画プリミティブを提供する。
 */
export abstract class BaseGauge {
  protected gaugeMesh: Mesh;
  protected material: StandardMaterial;
  protected texture: DynamicTexture;
  protected isVisible: boolean = false;

  protected readonly gaugeWidth: number;
  protected readonly gaugeHeight: number;

  constructor(
    scene: Scene,
    name: string,
    gaugeWidth: number,
    gaugeHeight: number,
  ) {
    this.gaugeWidth = gaugeWidth;
    this.gaugeHeight = gaugeHeight;

    this.gaugeMesh = MeshBuilder.CreatePlane(
      name,
      { width: gaugeWidth, height: gaugeHeight },
      scene,
    );
    this.gaugeMesh.isVisible = false;

    this.material = new StandardMaterial(`${name}Material`, scene);
    this.texture = new DynamicTexture(`${name}Texture`, { width: 512, height: 64 }, scene, false);
    this.material.diffuseTexture = this.texture;
    this.material.emissiveColor = new Color3(1, 1, 1);
    this.material.backFaceCulling = false;
    this.gaugeMesh.material = this.material;

    this.gaugeMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  }

  public show(): void {
    this.isVisible = true;
    this.gaugeMesh.isVisible = true;
  }

  public hide(): void {
    this.isVisible = false;
    this.gaugeMesh.isVisible = false;
  }

  public isShowing(): boolean {
    return this.isVisible;
  }

  public dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.gaugeMesh.dispose();
  }

  /** ゲージメッシュの位置を設定する */
  protected setPosition(x: number, y: number, z: number): void {
    this.gaugeMesh.position = new Vector3(x, y, z);
  }

  /**
   * ゲージバーを描画する共通ルーチン。
   * 枠線 → 背景 → ratio 分のカラーバー → オプションテキスト。
   */
  protected drawBar(ratio: number, barColor: string, text?: string): void {
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    const width = this.texture.getSize().width;
    const height = this.texture.getSize().height;

    ctx.clearRect(0, 0, width, height);

    // 外枠
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, width - 8, height - 8);

    // 背景
    ctx.fillStyle = "#333333";
    ctx.fillRect(8, 8, width - 16, height - 16);

    // バー
    const barWidth = (width - 16) * ratio;
    ctx.fillStyle = barColor;
    ctx.fillRect(8, 8, barWidth, height - 16);

    // テキスト
    if (text) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, width / 2, height / 2);
    }

    this.texture.update();
  }
}
