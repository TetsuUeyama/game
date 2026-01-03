import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, DynamicTexture } from "@babylonjs/core";

/**
 * クールダウンゲージ
 * ダッシュ停止後や着地後の硬直時間を表示
 * キャラクターの頭上に表示される
 */
export class CooldownGauge {
  private scene: Scene;
  private gaugeMesh: Mesh;
  private material: StandardMaterial;
  private texture: DynamicTexture;
  private isVisible: boolean = false;

  // ゲージのサイズ
  private readonly gaugeWidth: number = 1.0;
  private readonly gaugeHeight: number = 0.1;

  // クールダウン時間管理
  private currentTime: number = 0; // 現在経過時間
  private totalDuration: number = 0; // クールダウン総時間

  constructor(scene: Scene) {
    this.scene = scene;

    // ゲージメッシュを作成（平面）
    this.gaugeMesh = MeshBuilder.CreatePlane(
      "cooldownGauge",
      { width: this.gaugeWidth, height: this.gaugeHeight },
      scene
    );

    // 初期状態では非表示
    this.gaugeMesh.isVisible = false;

    // マテリアルとテクスチャを作成
    this.material = new StandardMaterial("cooldownGaugeMaterial", scene);
    this.texture = new DynamicTexture("cooldownGaugeTexture", { width: 512, height: 64 }, scene, false);
    this.material.diffuseTexture = this.texture;
    this.material.emissiveColor = new Color3(1, 1, 1); // 自発光で見やすく
    this.material.backFaceCulling = false; // 両面表示
    this.gaugeMesh.material = this.material;

    // ビルボード設定（常にカメラの方を向く）
    this.gaugeMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  }

  /**
   * クールダウンを開始
   * @param duration クールダウン時間（秒）
   */
  public start(duration: number): void {
    this.totalDuration = duration;
    this.currentTime = 0;
    this.isVisible = true;
    this.gaugeMesh.isVisible = true;
  }

  /**
   * ゲージを非表示
   */
  public hide(): void {
    this.isVisible = false;
    this.gaugeMesh.isVisible = false;
    this.currentTime = 0;
    this.totalDuration = 0;
  }

  /**
   * ゲージの位置を更新
   * @param characterPosition キャラクターの位置
   */
  public updatePosition(characterPosition: Vector3): void {
    // キャラクターの頭上に配置
    this.gaugeMesh.position = new Vector3(
      characterPosition.x,
      characterPosition.y + 1.5, // 頭上1.5m
      characterPosition.z
    );
  }

  /**
   * クールダウンを更新
   * @param deltaTime フレーム時間（秒）
   * @returns クールダウンが完了したかどうか
   */
  public update(deltaTime: number): boolean {
    if (!this.isVisible) {
      return true; // 既に完了している
    }

    this.currentTime += deltaTime;

    // クールダウン完了チェック
    if (this.currentTime >= this.totalDuration) {
      this.hide();
      return true;
    }

    // 残り割合を計算（1.0 → 0.0）
    const remainingRatio = 1.0 - (this.currentTime / this.totalDuration);
    const remainingTime = this.totalDuration - this.currentTime;

    // ゲージを描画
    this.drawGauge(remainingRatio, remainingTime);

    return false;
  }

  /**
   * ゲージを描画
   * @param ratio 残り割合（1.0 → 0.0）
   * @param remainingTime 残り時間（秒）
   */
  private drawGauge(ratio: number, remainingTime: number): void {
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

    // 残り時間に応じて色を決定（赤 → 黄色 → 緑）
    let barColor: string;
    if (ratio < 0.3) {
      // 残り30%未満: 緑（もうすぐ動ける）
      barColor = "#00FF00";
    } else if (ratio < 0.7) {
      // 残り30%～70%: 黄色
      barColor = "#FFFF00";
    } else {
      // 残り70%以上: 赤（まだ動けない）
      barColor = "#FF0000";
    }

    // クールダウンバーを描画（右から左に減少）
    const barWidth = (width - 16) * ratio;
    ctx.fillStyle = barColor;
    ctx.fillRect(8, 8, barWidth, height - 16);

    // 残り時間テキストを描画
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${remainingTime.toFixed(2)}s`, width / 2, height / 2);

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

  /**
   * クールダウンが完了しているかどうか
   */
  public isComplete(): boolean {
    return !this.isVisible || this.currentTime >= this.totalDuration;
  }
}
