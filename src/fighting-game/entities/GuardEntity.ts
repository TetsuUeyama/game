import * as Phaser from 'phaser';
import { GuardType, Fighter } from './Fighter';

type GuardPhase = 'startup' | 'active' | 'recovery';

export class GuardEntity extends Phaser.GameObjects.Rectangle {
  public guardType: GuardType;
  public owner: Phaser.Physics.Arcade.Sprite;
  public currentFrame: number;
  public phase: GuardPhase;
  public isActive: boolean; // ガード判定が有効かどうか
  private startupFrames: number;
  private activeFrames: number;
  private recoveryFrames: number;
  private totalFrames: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    guardType: GuardType,
    owner: Phaser.Physics.Arcade.Sprite,
    facingRight: boolean
  ) {
    // ガードの位置とサイズを設定
    const offsetX = facingRight ? 40 : -40; // キャラクターの前方に配置
    const guardWidth = 10; // 横幅（薄く）

    // キャラクターの高さを108ピクセル（54*2スケール）、各段を36ピクセルと定義
    const characterHeight = 108;
    const segmentHeight = characterHeight / 3; // 36ピクセル
    const guardMargin = 3; // 境界との余裕（3px×2 = 6px縮小）
    let offsetY = 0;
    let guardHeight = segmentHeight - guardMargin * 2; // 30ピクセル（境界を避ける）

    // ガードタイプに応じて位置とサイズを調整
    switch (guardType) {
      case 'high':
        // 上段のみ: キャラクターの上1/3
        offsetY = -characterHeight / 2 + segmentHeight / 2;
        guardHeight = segmentHeight;
        break;
      case 'mid':
        // 中段のみ: キャラクターの中央1/3
        offsetY = 0;
        guardHeight = segmentHeight;
        break;
      case 'low':
        // 下段のみ: キャラクターの下1/3
        offsetY = characterHeight / 2 - segmentHeight / 2;
        guardHeight = segmentHeight;
        break;
      case 'highMid':
        // 上段+中段: キャラクターの上2/3（境界余裕あり）
        offsetY = -segmentHeight / 2;
        guardHeight = segmentHeight * 2 - guardMargin * 2;
        break;
      case 'midLow':
        // 中段+下段: キャラクターの下2/3（境界余裕あり）
        offsetY = segmentHeight / 2;
        guardHeight = segmentHeight * 2 - guardMargin * 2;
        break;
      case 'all':
        // 全面ガード: キャラクター全体（境界余裕あり）
        offsetY = 0;
        guardHeight = characterHeight - guardMargin * 2;
        break;
    }

    const guardY = y + offsetY;

    super(
      scene,
      x + offsetX,
      guardY,
      guardWidth,
      guardHeight,
      0x00ffff, // シアン色
      0.7 // 透明度
    );

    this.guardType = guardType;
    this.owner = owner;
    this.currentFrame = 0;
    this.phase = 'startup';
    this.isActive = false;

    // ガードのフレーム設定
    // 発生: 3フレーム（攻撃より短い）
    // 持続: 40フレーム（約667ms、長めに維持）
    // 硬直: 20フレーム（約333ms、攻撃より長い）
    this.startupFrames = 3;
    this.activeFrames = 40;
    this.recoveryFrames = 20;
    this.totalFrames = this.startupFrames + this.activeFrames + this.recoveryFrames;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setAllowGravity(false);
      body.setImmovable(true);
    }

    // 深度を設定（攻撃要素より少し手前）
    this.setDepth(11);
    this.updateVisuals();
  }

  update(): void {
    // フレームを進める
    this.updateFrame();
    // ガード要素をキャラクターに追従させる
    this.followOwner();
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

    this.updateVisuals();

    // 全フレームが終了したらtrue
    return this.currentFrame >= this.totalFrames;
  }

  getTotalFrames(): number {
    return this.totalFrames;
  }

  private followOwner(): void {
    const fighter = this.owner as Fighter;
    const facingRight = fighter.facingRight;
    const offsetX = facingRight ? 40 : -40;

    // キャラクターの高さを108ピクセル、各段を36ピクセルと定義
    const characterHeight = 108;
    const segmentHeight = characterHeight / 3;
    let offsetY = 0;

    // ガードタイプに応じて位置を調整
    switch (this.guardType) {
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

    this.setPosition(this.owner.x + offsetX, this.owner.y + offsetY);
  }

  private updateVisuals(): void {
    // フェーズに応じて透明度を変更
    let alpha = 0.7;
    if (this.phase === 'startup') {
      alpha = 0.4; // 発生中は薄く
    } else if (this.phase === 'active') {
      alpha = 0.9; // 持続中は濃く
    } else if (this.phase === 'recovery') {
      alpha = 0.3; // 硬直中は薄く
    }

    // ガードタイプに応じて色を変更
    switch (this.guardType) {
      case 'high':
        // 上段のみ: 明るい青
        this.setFillStyle(0x00bfff, alpha);
        break;
      case 'mid':
        // 中段のみ: シアン
        this.setFillStyle(0x00ffff, alpha);
        break;
      case 'low':
        // 下段のみ: 緑がかった青
        this.setFillStyle(0x00ff99, alpha);
        break;
      case 'highMid':
        // 上段+中段: 紫
        this.setFillStyle(0x9966ff, alpha);
        break;
      case 'midLow':
        // 中段+下段: 黄緑
        this.setFillStyle(0x99ff66, alpha);
        break;
      case 'all':
        // 全面ガード: 金色
        this.setFillStyle(0xffd700, alpha);
        break;
    }

    // 枠線を追加してより見やすく
    this.setStrokeStyle(3, 0xffffff, 0.9);
  }
}
