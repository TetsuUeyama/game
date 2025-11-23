import * as Phaser from 'phaser';
import { ATTACK_TYPES } from '../config/gameConfig';
import { AttackType } from './Fighter';

type AttackPhase = 'startup' | 'active' | 'recovery';

export class AttackEntity extends Phaser.GameObjects.Rectangle {
  public attackType: AttackType;
  public currentFrame: number;
  public phase: AttackPhase;
  public hasHit: boolean;
  public owner: Phaser.Physics.Arcade.Sprite;
  private startupFrames: number;
  private activeFrames: number;
  private recoveryFrames: number;
  private totalFrames: number;
  public damage: number;
  public knockback: number;
  public isActive: boolean; // 攻撃判定が有効かどうか

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    attackType: AttackType,
    owner: Phaser.Physics.Arcade.Sprite,
    facingRight: boolean
  ) {
    const attackData = ATTACK_TYPES[attackType];

    // 攻撃要素を作成（向きに応じて位置を調整）
    const offsetX = facingRight ? attackData.range / 2 : -attackData.range / 2;

    super(
      scene,
      x + offsetX,
      y,
      attackData.hitboxWidth,
      attackData.hitboxHeight,
      0xffffff,
      0
    );

    this.attackType = attackType;
    this.owner = owner;
    this.currentFrame = 0;
    this.phase = 'startup';
    this.hasHit = false;
    this.damage = attackData.damage;
    this.knockback = attackData.knockback;
    this.isActive = false;

    this.startupFrames = attackData.startupFrames;
    this.activeFrames = attackData.activeFrames;
    this.recoveryFrames = attackData.recoveryFrames;
    this.totalFrames = this.startupFrames + this.activeFrames + this.recoveryFrames;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setAllowGravity(false);
      body.setImmovable(true);
    }

    // 深度を設定して見やすくする
    this.setDepth(10);
    this.updateVisuals();
  }

  updateFrame(): boolean {
    this.currentFrame++;

    // フェーズの更新
    if (this.currentFrame <= this.startupFrames) {
      this.phase = 'startup';
      this.isActive = false;
    } else if (this.currentFrame <= this.startupFrames + this.activeFrames) {
      this.phase = 'active';
      this.isActive = true;
    } else if (this.currentFrame <= this.totalFrames) {
      this.phase = 'recovery';
      this.isActive = false;
    }

    // 攻撃要素をキャラクターに追従させる
    this.followOwner();
    this.updateVisuals();

    // 全フレームが終了したらtrue
    return this.currentFrame >= this.totalFrames;
  }

  private followOwner(): void {
    // キャラクターの向きを取得
    const fighter = this.owner as any;
    const facingRight = fighter.facingRight;
    const attackData = ATTACK_TYPES[this.attackType];
    const offsetX = facingRight ? attackData.range / 2 : -attackData.range / 2;

    // キャラクターに追従
    this.setPosition(this.owner.x + offsetX, this.owner.y);
  }

  private updateVisuals(): void {
    // フェーズに応じて色と透明度を変更（よりはっきり見えるように）
    switch (this.phase) {
      case 'startup':
        // 発生前: 黄色、やや透明
        this.setFillStyle(0xffff00, 0.6);
        break;
      case 'active':
        // 攻撃判定中: 赤、不透明
        this.setFillStyle(0xff0000, 0.8);
        break;
      case 'recovery':
        // スキフレーム: 青、やや透明
        this.setFillStyle(0x0000ff, 0.5);
        break;
    }
  }

  getTotalFrames(): number {
    return this.totalFrames;
  }

  getFrameDuration(): number {
    // 60fpsで1フレーム = 16.67ms
    return this.totalFrames * 16.67;
  }
}
