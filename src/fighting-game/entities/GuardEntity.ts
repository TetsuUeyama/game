import * as Phaser from 'phaser';
import { GuardType, Fighter } from './Fighter';

export class GuardEntity extends Phaser.GameObjects.Rectangle {
  public guardType: GuardType;
  public owner: Phaser.Physics.Arcade.Sprite;

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
    const guardWidth = 30; // 横幅

    // キャラクターの高さを108ピクセル（54*2スケール）、各段を36ピクセルと定義
    const characterHeight = 108;
    const segmentHeight = characterHeight / 3; // 36ピクセル
    let offsetY = 0;
    let guardHeight = segmentHeight;

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
        // 上段+中段: キャラクターの上2/3
        offsetY = -segmentHeight / 2;
        guardHeight = segmentHeight * 2;
        break;
      case 'midLow':
        // 中段+下段: キャラクターの下2/3
        offsetY = segmentHeight / 2;
        guardHeight = segmentHeight * 2;
        break;
      case 'all':
        // 全面ガード: キャラクター全体
        offsetY = 0;
        guardHeight = characterHeight;
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
    // ガード要素をキャラクターに追従させる
    this.followOwner();
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
    // ガードタイプに応じて色を変更
    switch (this.guardType) {
      case 'high':
        // 上段のみ: 明るい青
        this.setFillStyle(0x00bfff, 0.7);
        break;
      case 'mid':
        // 中段のみ: シアン
        this.setFillStyle(0x00ffff, 0.7);
        break;
      case 'low':
        // 下段のみ: 緑がかった青
        this.setFillStyle(0x00ff99, 0.7);
        break;
      case 'highMid':
        // 上段+中段: 紫
        this.setFillStyle(0x9966ff, 0.7);
        break;
      case 'midLow':
        // 中段+下段: 黄緑
        this.setFillStyle(0x99ff66, 0.7);
        break;
      case 'all':
        // 全面ガード: 金色
        this.setFillStyle(0xffd700, 0.8);
        break;
    }

    // 枠線を追加してより見やすく
    this.setStrokeStyle(3, 0xffffff, 0.9);
  }
}
