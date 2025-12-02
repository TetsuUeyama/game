import * as Phaser from 'phaser';
import { MovementEntity } from './MovementEntity';
import { Fighter } from './Fighter';
import { MOVEMENT_CONFIG } from '../config/gameConfig';

/**
 * FootworkEntity - 小刻みな前後移動（フットワーク）
 *
 * キャラクターが1か所に留まらず、常に小刻みに動いている状態を再現
 * 戦略的な間合い調整の基礎となる動き
 */
export class FootworkEntity extends MovementEntity {
  private direction: number; // 1: 右, -1: 左, 0: ニュートラル
  private footworkSpeed: number;
  private oscillationTimer: number;
  private oscillationInterval: number; // 前後の切り替え間隔（ミリ秒）
  private opponent: Fighter | null; // 相手キャラクターの参照

  constructor(
    scene: Phaser.Scene,
    owner: Fighter,
    initialDirection: number = 0,
    opponent: Fighter | null = null
  ) {
    super(scene, owner, 'walk', 0); // 継続時間0 = 無限

    this.direction = initialDirection;

    // 速度補正を適用（基礎値 × (0.5 + パラメータ / 100)）
    const speedStat = owner.stats?.speed || 100;
    const speedMultiplier = 0.5 + (speedStat / 100);
    this.footworkSpeed = (MOVEMENT_CONFIG.footworkSpeed || MOVEMENT_CONFIG.walkSpeed * 0.5) * speedMultiplier;

    this.oscillationTimer = 0;
    // 200-400msごとに前後を切り替え（ランダムで自然な動き）
    this.oscillationInterval = 200 + Math.random() * 200;
    this.hasMomentum = false;
    this.opponent = opponent;

    // console.log(`[Footwork] 初期化: 基準速度=${MOVEMENT_CONFIG.footworkSpeed || MOVEMENT_CONFIG.walkSpeed * 0.5}, 速度値=${speedStat}, 倍率=${speedMultiplier}x, 最終速度=${this.footworkSpeed}`);

    this.start();
  }

  start(): void {
    // console.log(`[Footwork] 開始: 速度=${this.footworkSpeed}`);
    this.updateVelocity();
  }

  update(): boolean {
    if (!this.isActive) {
      return true;
    }

    const body = this.owner.body as Phaser.Physics.Arcade.Body;
    const onGround = body.touching.down;

    // 地上でのみフットワーク動作
    if (!onGround) {
      return false;
    }

    // ジャンプ中、攻撃中、ガード中はフットワークを停止
    if (this.owner.isJumping || this.owner.isAttacking || this.owner.isBlocking) {
      return false;
    }

    // 一定時間ごとに方向を変更（小刻みな動き）
    this.oscillationTimer += 16.67; // 約60fps想定

    if (this.oscillationTimer >= this.oscillationInterval) {
      this.oscillationTimer = 0;
      // より短い間隔で切り替え（200-400ms）でより小刻みに
      this.oscillationInterval = 200 + Math.random() * 200;

      // 相手の位置を基準に方向を決定
      let toOpponent = 1; // デフォルトは右
      if (this.opponent) {
        toOpponent = this.owner.x < this.opponent.x ? 1 : -1;
      }

      // ランダムに方向転換（前:45%, 後:45%, 停止:10%）
      // 常に動いている感じを出すため、停止確率を大幅に減らす
      const rand = Math.random();
      if (rand < 0.45) {
        // 相手方向に移動
        this.direction = toOpponent;
      } else if (rand < 0.9) {
        // 相手から離れる方向に移動
        this.direction = -toOpponent;
      } else {
        // 短時間停止（稀に）
        this.direction = 0;
      }

      this.updateVelocity();
      // console.log(`[Footwork] 方向転換: direction=${this.direction}, velocity=${this.velocityX}`);
    }

    // フットワーク速度を適用
    this.owner.setVelocityX(this.velocityX);

    return false;
  }

  /**
   * 外部から方向を指定（AI制御用）
   */
  public setDirection(direction: number): void {
    if (this.direction !== direction) {
      this.direction = direction;
      this.updateVelocity();
      this.oscillationTimer = 0; // タイマーリセット
    }
  }

  /**
   * 速度を更新
   */
  private updateVelocity(): void {
    this.velocityX = this.footworkSpeed * this.direction;
  }

  end(): void {
    // console.log(`[Footwork] 終了`);
    this.owner.setVelocityX(0);
  }

  /**
   * フットワークを一時停止（攻撃やガード時）
   */
  public pause(): void {
    this.owner.setVelocityX(0);
  }

  /**
   * フットワークを再開
   */
  public resume(): void {
    this.updateVelocity();
  }
}
