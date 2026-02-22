import { Scene, Vector3 } from "@babylonjs/core";
import { BaseGauge } from "./BaseGauge";

/**
 * クールダウンゲージ
 * ダッシュ停止後や着地後の硬直時間を表示
 * キャラクターの頭上に表示される
 */
export class CooldownGauge extends BaseGauge {
  private currentTime: number = 0;
  private totalDuration: number = 0;

  constructor(scene: Scene) {
    super(scene, "cooldownGauge", 1.0, 0.1);
  }

  /** クールダウンを開始 */
  public start(duration: number): void {
    this.totalDuration = duration;
    this.currentTime = 0;
    this.show();
  }

  public override hide(): void {
    super.hide();
    this.currentTime = 0;
    this.totalDuration = 0;
  }

  /** ゲージの位置を更新 */
  public updatePosition(characterPosition: Vector3): void {
    this.setPosition(characterPosition.x, characterPosition.y + 1.5, characterPosition.z);
  }

  /**
   * クールダウンを更新
   * @returns クールダウンが完了したかどうか
   */
  public update(deltaTime: number): boolean {
    if (!this.isVisible) return true;

    this.currentTime += deltaTime;

    if (this.currentTime >= this.totalDuration) {
      this.hide();
      return true;
    }

    const remainingRatio = 1.0 - (this.currentTime / this.totalDuration);
    const remainingTime = this.totalDuration - this.currentTime;

    // 残り時間に応じて色を決定（赤 → 黄色 → 緑）
    let barColor: string;
    if (remainingRatio < 0.3) {
      barColor = "#00FF00"; // 残り30%未満: 緑（もうすぐ動ける）
    } else if (remainingRatio < 0.7) {
      barColor = "#FFFF00"; // 残り30%～70%: 黄色
    } else {
      barColor = "#FF0000"; // 残り70%以上: 赤（まだ動けない）
    }

    this.drawBar(remainingRatio, barColor, `${remainingTime.toFixed(2)}s`);
    return false;
  }

  /** クールダウンが完了しているかどうか */
  public isComplete(): boolean {
    return !this.isVisible || this.currentTime >= this.totalDuration;
  }
}
