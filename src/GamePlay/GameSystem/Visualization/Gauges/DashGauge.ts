import { Scene, Vector3 } from "@babylonjs/core";
import { BaseGauge } from "./BaseGauge";

/**
 * ダッシュゲージ
 * キャラクターの頭上に表示されるゲージ
 */
export class DashGauge extends BaseGauge {
  private readonly maxAccelerationTime: number = 1.0;

  constructor(scene: Scene) {
    super(scene, "dashGauge", 1.2, 0.15);
  }

  /** ゲージの位置を更新 */
  public updatePosition(characterPosition: Vector3): void {
    this.setPosition(characterPosition.x, characterPosition.y + 2.5, characterPosition.z);
  }

  /** ダッシュ加速度を更新 */
  public updateAcceleration(accelerationTime: number): void {
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

    this.drawBar(
      accelerationRatio,
      barColor,
      accelerationRatio >= 1.0 ? "MAX SPEED!" : undefined,
    );
  }
}
