import * as Phaser from 'phaser';
import { ATTACK_TYPES } from '../config/gameConfig';
import { AttackType, Fighter } from './Fighter';

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

    // 攻撃レベルに応じて縦位置と高さを調整
    // キャラクターの全体高さを108ピクセル（54*2スケール）と仮定
    const characterHeight = 108;
    const segmentHeight = characterHeight / 3; // 各段が36ピクセル
    let offsetY = 0;
    let height = segmentHeight;

    switch (attackData.level) {
      case 'high':
        // 上段: キャラクターの上1/3
        offsetY = -characterHeight / 2 + segmentHeight / 2;
        height = segmentHeight;
        break;
      case 'mid':
        // 中段: キャラクターの中央1/3
        offsetY = 0;
        height = segmentHeight;
        break;
      case 'low':
        // 下段: キャラクターの下1/3
        offsetY = characterHeight / 2 - segmentHeight / 2;
        height = segmentHeight;
        break;
      case 'highMid':
        // 上段+中段: キャラクターの上2/3
        offsetY = -segmentHeight / 2;
        height = segmentHeight * 2;
        break;
      case 'midLow':
        // 中段+下段: キャラクターの下2/3
        offsetY = segmentHeight / 2;
        height = segmentHeight * 2;
        break;
      case 'all':
        // 全レーン: キャラクター全体
        offsetY = 0;
        height = characterHeight;
        break;
    }

    super(
      scene,
      x + offsetX,
      y + offsetY,
      attackData.hitboxWidth,
      height,
      0xffffff,
      0
    );

    this.attackType = attackType;
    this.owner = owner;
    this.currentFrame = 0;
    this.phase = 'startup';
    this.hasHit = false;

    // 性能値補正を適用（数値を倍率に変換）
    const fighterOwner = owner as Fighter;
    const attackStat = fighterOwner.stats?.attack || 100;
    const attackSpeedStat = fighterOwner.stats?.attackSpeed || 100;

    // 数値を倍率に変換（25→0.25, 100→1.0, 150→1.5）
    const attackMultiplier = attackStat / 100;
    const attackSpeedMultiplier = attackSpeedStat / 100;

    // 攻撃力補正を適用
    this.damage = attackData.damage * attackMultiplier;
    this.knockback = attackData.knockback;
    this.isActive = false;

    // 攻撃速度補正を適用（値が大きいほど速くなる = フレーム数が少なくなる）
    this.startupFrames = Math.max(1, Math.round(attackData.startupFrames / attackSpeedMultiplier));
    this.activeFrames = Math.max(1, Math.round(attackData.activeFrames / attackSpeedMultiplier));
    this.recoveryFrames = Math.max(1, Math.round(attackData.recoveryFrames / attackSpeedMultiplier));
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
    const fighter = this.owner as Fighter;
    const facingRight = fighter.facingRight;
    const attackData = ATTACK_TYPES[this.attackType];
    const offsetX = facingRight ? attackData.range / 2 : -attackData.range / 2;

    // 攻撃レベルに応じてY軸のオフセットを計算
    const characterHeight = 108;
    const segmentHeight = characterHeight / 3;
    let offsetY = 0;

    switch (attackData.level) {
      case 'high':
        offsetY = -characterHeight / 2 + segmentHeight / 2;
        break;
      case 'mid':
        offsetY = 0;
        break;
      case 'low':
        offsetY = characterHeight / 2 - segmentHeight / 2;
        break;
      case 'highMid':
        offsetY = -segmentHeight / 2;
        break;
      case 'midLow':
        offsetY = segmentHeight / 2;
        break;
      case 'all':
        offsetY = 0;
        break;
    }

    // キャラクターに追従
    this.setPosition(this.owner.x + offsetX, this.owner.y + offsetY);
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
