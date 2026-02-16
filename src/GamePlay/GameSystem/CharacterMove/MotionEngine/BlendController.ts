import { AnimationGroup } from "@babylonjs/core";
import { BlendInput, CharacterMotionConfig } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";

/**
 * AnimationGroup.weight を用いた Idle/Walk ブレンドコントローラー
 *
 * 全アニメーションを start(true) でループ再生し、
 * weight のみで滑らかに遷移させる。
 *
 * walkAnim.speedRatio で歩行速度と足の動きを同期させる。
 */
export class BlendController {
  private _idleAnim: AnimationGroup;
  private _walkAnim: AnimationGroup;
  private _config: CharacterMotionConfig;

  /** 現在の Idle ウェイト (0..1) */
  private _idleWeight = 1.0;
  /** 現在の Walk ウェイト (0..1) */
  private _walkWeight = 0.0;

  constructor(
    idleAnim: AnimationGroup,
    walkAnim: AnimationGroup,
    config: CharacterMotionConfig
  ) {
    this._idleAnim = idleAnim;
    this._walkAnim = walkAnim;
    this._config = config;

    // 全アニメをループ再生開始（weight=0 なら影響なし）
    this._idleAnim.start(true, 1.0, this._idleAnim.from, this._idleAnim.to, false);
    this._walkAnim.start(true, 1.0, this._walkAnim.from, this._walkAnim.to, false);

    this._idleAnim.setWeightForAllAnimatables(1.0);
    this._walkAnim.setWeightForAllAnimatables(0.0);
  }

  /**
   * 毎フレーム呼び出し。
   * input.speed に基づいて Idle ↔ Walk のウェイトを blendSharpness で遷移させる。
   */
  update(input: BlendInput, dt: number): void {
    const targetWalk = Math.min(Math.max(input.speed, 0), 1);
    const targetIdle = 1.0 - targetWalk;

    const sharpness = this._config.blendSharpness;
    const t = 1.0 - Math.exp(-sharpness * dt);

    this._idleWeight = this._idleWeight + (targetIdle - this._idleWeight) * t;
    this._walkWeight = this._walkWeight + (targetWalk - this._walkWeight) * t;

    // デッドゾーン: 微小ウェイトをスナップして歩行アニメーション漏れを防止
    const finalIdle = this._idleWeight > 0.99 ? 1.0 : this._idleWeight < 0.01 ? 0.0 : this._idleWeight;
    const finalWalk = this._walkWeight > 0.99 ? 1.0 : this._walkWeight < 0.01 ? 0.0 : this._walkWeight;

    this._idleAnim.setWeightForAllAnimatables(finalIdle);
    this._walkAnim.setWeightForAllAnimatables(finalWalk);

    // 歩行速度と足の動きを同期（walk停止時はspeedRatio更新不要）
    if (finalWalk > 0) {
      this._walkAnim.speedRatio = Math.max(input.speed, 0.1);
    }
  }

  dispose(): void {
    this._idleAnim.stop();
    this._walkAnim.stop();
  }
}
