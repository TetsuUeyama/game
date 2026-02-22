import { Scene, Vector3 } from "@babylonjs/core";
import { BaseGauge } from "./BaseGauge";

/**
 * ジャンプチャージゲージ
 * キャラクターの足元に表示されるゲージ
 */
export class JumpChargeGauge extends BaseGauge {
  private readonly smallJumpThreshold: number = 0.05;
  private readonly mediumJumpThreshold: number = 0.2;
  private readonly maxChargeTime: number = 0.3;

  constructor(scene: Scene) {
    super(scene, "jumpChargeGauge", 1.0, 0.1);
  }

  /** ゲージの位置を更新 */
  public updatePosition(characterPosition: Vector3): void {
    this.setPosition(characterPosition.x, 0.05, characterPosition.z - 0.5);
  }

  /** チャージ量を更新 */
  public updateCharge(chargeTime: number): void {
    const chargeRatio = Math.min(chargeTime / this.maxChargeTime, 1.0);

    // チャージレベルに応じて色を決定
    let barColor: string;
    let levelText: string | undefined;

    if (chargeTime < this.smallJumpThreshold) {
      barColor = "#888888"; // グレー（チャージ不足）
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

    this.drawBar(chargeRatio, barColor, levelText);
  }
}
