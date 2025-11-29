import * as Phaser from 'phaser';
import { MovementEntity } from './MovementEntity';
import { Fighter } from './Fighter';
import { MOVEMENT_CONFIG } from '../config/gameConfig';

export type JumpType = 'normal' | 'dash';
export type JumpHeight = 'small' | 'medium' | 'large';

/**
 * JumpEntity - ジャンプ移動
 *
 * 通常ジャンプとダッシュジャンプを管理
 * ダッシュジャンプは慣性がつき、軌道が変化する
 *
 * ジャンプの高さ:
 * - small: 50%の高さ、着地硬直10フレーム
 * - medium: 65%の高さ、着地硬直15フレーム
 * - large: 100%の高さ、着地硬直20フレーム
 */
export class JumpEntity extends MovementEntity {
  private jumpType: JumpType;
  private jumpHeight: JumpHeight;
  private initialVelocityX: number;
  private initialVelocityY: number;
  private hasLanded: boolean;
  private gravityMultiplier: number; // 重力倍率（速度100以上で適用）
  private landingLag: number; // 着地硬直時間（ミリ秒）

  constructor(
    scene: Phaser.Scene,
    owner: Fighter,
    jumpType: JumpType = 'normal',
    dashVelocityX: number = 0,
    jumpHeight: JumpHeight = 'large'
  ) {
    super(scene, owner, jumpType === 'dash' ? 'dashJump' : 'jump', 0);

    this.jumpType = jumpType;
    this.jumpHeight = jumpHeight;
    this.hasLanded = false;

    // ジャンプの高さによる倍率と着地硬直時間を設定
    let jumpHeightMultiplier: number;
    switch (jumpHeight) {
      case 'small':
        jumpHeightMultiplier = 0.5;  // 50%の高さ
        this.landingLag = 10 * (1000 / 60); // 10フレーム = 約167ms
        break;
      case 'medium':
        jumpHeightMultiplier = 0.65; // 65%の高さ
        this.landingLag = 15 * (1000 / 60); // 15フレーム = 約250ms
        break;
      case 'large':
      default:
        jumpHeightMultiplier = 1.0;  // 100%の高さ
        this.landingLag = 20 * (1000 / 60); // 20フレーム = 約333ms
        break;
    }

    // 速度補正を適用
    // 100以下: 高さが変わる（基礎値 × (0.5 + パラメータ / 100)）
    // 100以上: 高さは固定（speed=100と同じ高さ = 倍率1.5）、ジャンプ速度（重力倍率）のみ速くなる
    const speedStat = owner.stats?.speed || 100;
    let heightMultiplier: number;

    if (speedStat <= 100) {
      // 100以下は高さが変わる
      heightMultiplier = (0.5 + (speedStat / 100)) * jumpHeightMultiplier;
      this.gravityMultiplier = 1.0;
    } else {
      // 100以上は高さ固定（speed=100と同じ高さ = 倍率1.5）
      heightMultiplier = 1.5 * jumpHeightMultiplier;
      // 重力倍率で上昇・下降を速くする（100を超えた分だけ倍率追加）
      this.gravityMultiplier = 1.0 + ((speedStat - 100) / 50);
    }

    if (jumpType === 'dash') {
      // ダッシュジャンプ: 高く飛び、横慣性が強い
      // ジャンプの高さに応じて横移動距離も変化
      this.initialVelocityY = MOVEMENT_CONFIG.dashJumpVelocityY * heightMultiplier;
      this.initialVelocityX = dashVelocityX * jumpHeightMultiplier; // 横移動距離もジャンプの高さに応じて変化
      this.hasMomentum = true;

      // console.log(`[Jump] ダッシュジャンプ(${jumpHeight}): 速度値=${speedStat}, 高さ倍率=${heightMultiplier}x, 重力倍率=${this.gravityMultiplier}x, VelocityX=${this.initialVelocityX}, VelocityY=${this.initialVelocityY}, 着地硬直=${this.landingLag.toFixed(0)}ms`);
    } else {
      // 通常ジャンプ: 標準の高さ、慣性なし
      this.initialVelocityY = MOVEMENT_CONFIG.normalJumpVelocity * heightMultiplier;
      this.initialVelocityX = 0;
      this.hasMomentum = false;

      // console.log(`[Jump] 通常ジャンプ(${jumpHeight}): 速度値=${speedStat}, 高さ倍率=${heightMultiplier}x, 重力倍率=${this.gravityMultiplier}x, VelocityY=${this.initialVelocityY}, 着地硬直=${this.landingLag.toFixed(0)}ms`);
    }

    this.velocityX = this.initialVelocityX;
    this.velocityY = this.initialVelocityY;

    this.start();
  }

  start(): void {
    // ジャンプ速度を適用
    this.owner.setVelocityY(this.velocityY);

    if (this.jumpType === 'dash') {
      // ダッシュジャンプの場合、横方向の速度も設定
      this.owner.setVelocityX(this.velocityX);
    }

    // 重力倍率を適用（速度100以上の場合）
    if (this.gravityMultiplier > 1.0) {
      const body = this.owner.body as Phaser.Physics.Arcade.Body;
      body.setGravityY(1000 * (this.gravityMultiplier - 1.0));
    }
  }

  update(): boolean {
    if (!this.isActive) {
      return true;
    }

    const body = this.owner.body as Phaser.Physics.Arcade.Body;

    // 着地判定
    if (body.touching.down && !this.hasLanded) {
      this.hasLanded = true;
      this.terminate();
      return true;
    }

    // 空中制御
    if (!body.touching.down) {
      this.applyAirControl();
    }

    // 空気抵抗による減速（ダッシュジャンプの横慣性）
    if (this.jumpType === 'dash' && Math.abs(body.velocity.x) > 0) {
      const resistance = MOVEMENT_CONFIG.airResistance;
      const newVelocityX = body.velocity.x * (1 - resistance);

      // 慣性が十分小さくなったら停止
      if (Math.abs(newVelocityX) < 10) {
        this.owner.setVelocityX(0);
      } else {
        this.owner.setVelocityX(newVelocityX);
      }
    }

    return false;
  }

  /**
   * 空中制御 - ジャンプ中の左右移動
   */
  private applyAirControl(): void {
    // 空中制御は外部入力で行うため、ここでは慣性の維持のみ
    // Fighter.update()で入力処理時に空中制御を適用
  }

  end(): void {
    // console.log(`[Jump] 着地: ${this.jumpHeight}ジャンプ、硬直=${this.landingLag.toFixed(0)}ms`);

    // 着地時、地上摩擦を適用
    const body = this.owner.body as Phaser.Physics.Arcade.Body;

    // 重力をリセット
    if (this.gravityMultiplier > 1.0) {
      body.setGravityY(0);
    }

    if (this.jumpType === 'dash' && Math.abs(body.velocity.x) > 50) {
      // ダッシュジャンプの着地時、速度を減速
      const friction = MOVEMENT_CONFIG.groundFriction;
      this.owner.setVelocityX(body.velocity.x * (1 - friction));
    } else {
      // 通常ジャンプの着地時、速度をリセット
      this.owner.setVelocityX(0);
    }

    // 着地硬直を適用
    this.applyLandingLag();
  }

  /**
   * 着地硬直を適用
   */
  private applyLandingLag(): void {
    // Fighterに着地硬直を設定
    (this.owner as any).landingLag = this.landingLag;
    (this.owner as any).landingLagEndTime = Date.now() + this.landingLag;

    // console.log(`[Jump] 着地硬直開始: ${this.landingLag.toFixed(0)}ms`);
  }

  /**
   * ジャンプタイプを取得
   */
  public getJumpType(): JumpType {
    return this.jumpType;
  }

  /**
   * 空中制御の入力を適用
   * @param direction -1: 左, 0: なし, 1: 右
   */
  public applyAirInput(direction: number): void {
    const body = this.owner.body as Phaser.Physics.Arcade.Body;

    if (direction !== 0) {
      // 速度補正を適用（基礎値 × (0.5 + パラメータ / 100)）
      const speedStat = this.owner.stats?.speed || 100;
      const speedMultiplier = 0.5 + (speedStat / 100);

      const airControl = MOVEMENT_CONFIG.airControlFactor;
      const controlSpeed = MOVEMENT_CONFIG.walkSpeed * speedMultiplier * airControl;

      // 空中制御: 通常速度の30%で左右移動可能
      const targetVelocityX = controlSpeed * direction;

      // ダッシュジャンプの慣性と空中制御を合成
      if (this.jumpType === 'dash') {
        // 慣性方向と同じ方向なら加速、逆方向なら減速
        const currentVelocity = body.velocity.x;
        const blendedVelocity = currentVelocity + (targetVelocityX * 0.1);
        this.owner.setVelocityX(blendedVelocity);
      } else {
        // 通常ジャンプは素直に空中制御
        this.owner.setVelocityX(targetVelocityX);
      }
    }
  }
}
