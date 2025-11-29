import * as Phaser from 'phaser';
import { MovementEntity } from './MovementEntity';
import { Fighter } from './Fighter';
import { MOVEMENT_CONFIG } from '../config/gameConfig';

/**
 * DashEntity - ダッシュ移動
 *
 * 高速移動で素早く間合いを詰める/離す
 * ダッシュ中にジャンプすると慣性がつく
 */
export class DashEntity extends MovementEntity {
  private direction: number; // 1: 右, -1: 左
  private dashSpeed: number;

  constructor(
    scene: Phaser.Scene,
    owner: Fighter,
    direction: number
  ) {
    super(scene, owner, 'dash', MOVEMENT_CONFIG.dashDuration);

    this.direction = direction;
    // 速度補正を適用（基礎値 × (0.5 + パラメータ / 100)）
    const speedStat = owner.stats?.speed || 100;
    const speedMultiplier = 0.5 + (speedStat / 100);
    this.dashSpeed = MOVEMENT_CONFIG.dashSpeed * speedMultiplier;
    this.hasMomentum = true; // ダッシュは慣性を持つ

    // console.log(`[Dash] 初期化: 速度値=${speedStat}, 倍率=${speedMultiplier}x, 基準速度=${MOVEMENT_CONFIG.dashSpeed}, 最終速度=${this.dashSpeed}`);

    this.start();
  }

  start(): void {
    // console.log(`[Dash] 開始: Player${this.owner.playerNumber}, 方向=${this.direction > 0 ? '右' : '左'}, 速度=${this.velocityX}`);

    // ダッシュ速度を設定
    this.velocityX = this.dashSpeed * this.direction;
    this.velocityY = 0;

    // オーナーの速度を即座に適用
    this.owner.setVelocityX(this.velocityX);
  }

  update(): boolean {
    // 時間切れまたは非アクティブなら終了
    if (!this.isActive || this.isExpired()) {
      this.terminate();
      return true;
    }

    // ダッシュ速度を維持
    this.owner.setVelocityX(this.velocityX);

    return false;
  }

  end(): void {
    // console.log(`[Dash] 終了`);

    // ダッシュ速度と終了時刻を記録（慣性ジャンプ用）
    (this.owner as any).lastDashVelocity = this.velocityX;
    (this.owner as any).lastDashEndTime = Date.now();

    // ダッシュ終了時、慣性を少し残す（地上摩擦で自然減速）
    const body = this.owner.body as Phaser.Physics.Arcade.Body;
    if (body.touching.down) {
      // 地上なら速度を緩やかに減速
      this.owner.setVelocityX(this.velocityX * 0.5);
    }
    // 空中なら慣性維持（空気抵抗で自然減速）
  }

  /**
   * ダッシュの現在速度を取得（ダッシュジャンプ用）
   */
  public getDashVelocity(): number {
    return this.velocityX;
  }
}
