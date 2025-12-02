
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

  // 先端の攻撃判定エリア（5px幅）
  public hitboxTip?: Phaser.GameObjects.Rectangle;

  // モーション本体部分（ヒットボックス扱い）
  public motionBody?: Phaser.GameObjects.Rectangle;

  // 攻撃の伸び率（0.0 = 完全に縮んでいる、1.0 = 完全に伸びている）
  private extensionRatio: number = 0;

  // 攻撃の最大射程
  private maxRange: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    attackType: AttackType,
    owner: Phaser.Physics.Arcade.Sprite,
    facingRight: boolean
  ) {
    const attackData = ATTACK_TYPES[attackType];

    // 対空攻撃の特殊処理（斜め上45度を攻撃）
    const isAntiAir = attackType === 'antiAir';

    // 空中攻撃の特殊処理（斜め下45度を攻撃）
    const isAirAttack = attackType === 'airAttackDown';

    // 攻撃要素を作成（向きに応じて位置を調整）
    const offsetX = facingRight ? attackData.range / 2 : -attackData.range / 2;

    // 攻撃レベルに応じて縦位置と高さを調整
    // キャラクターの全体高さを108ピクセル（54*2スケール）と仮定
    const characterHeight = 108;
    const segmentHeight = characterHeight / 3; // 各段が36ピクセル
    let offsetY = 0;
    let height = segmentHeight;

    // 対空攻撃と空中攻撃は設定されたhitboxHeightを使用し、発生位置を調整
    if (isAntiAir) {
      // 対空攻撃: 上段攻撃と同じ発生位置
      height = attackData.hitboxHeight;
      offsetY = -characterHeight / 2 + segmentHeight / 2;
    } else if (isAirAttack) {
      // 空中攻撃: 下段攻撃と同じ発生位置
      height = attackData.hitboxHeight;
      offsetY = characterHeight / 2 - segmentHeight / 2;
    } else {
      // 通常攻撃の配置
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

    // 最大射程を保存
    this.maxRange = attackData.hitboxWidth;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setAllowGravity(false);
      body.setImmovable(true);
    }

    // 深度を設定して見やすくする
    this.setDepth(10);

    // 対空攻撃は真上（90度）、空中攻撃は斜め下45度に回転
    // 向きに応じて回転方向を反転
    if (isAntiAir) {
      this.setRotation(facingRight ? -Math.PI / 2 : Math.PI / 2); // 真上
    } else if (isAirAttack) {
      this.setRotation(facingRight ? Math.PI / 4 : -Math.PI / 4); // 斜め下45度
    }

    // 必殺技以外（上段・中段・下段攻撃）の場合、モーション本体と先端判定を作成
    const isSpecialAttack = attackType.includes('special') || attackType.includes('Special');
    if (!isSpecialAttack) {
      // モーション本体部分（ヒットボックス扱い）
      // 先端5pxを除いた部分（全ての攻撃で同じサイズ、回転のみ異なる）
      const bodyWidth = attackData.hitboxWidth - 5;
      const bodyHeight = height;

      // 対空・空中攻撃の場合は、回転を考慮した位置計算
      let bodyOffsetX: number;
      let bodyOffsetYAdjust = 0;

      if (isAntiAir || isAirAttack) {
        // 回転攻撃の場合、モーション本体は短辺の中心から伸びるように配置
        bodyOffsetX = facingRight ? bodyWidth / 2 : -bodyWidth / 2;

        if (isAirAttack) {
          // 空中攻撃: モーション本体をキャラクター底辺に移動
          // 現在のoffsetYは下段の中心 = characterHeight/2 - segmentHeight/2
          // キャラクター底辺 = characterHeight/2
          // 差分 = segmentHeight/2 だけ下に移動
          const segmentHeight = characterHeight / 3;
          bodyOffsetYAdjust = segmentHeight / 2;
        } else {
          bodyOffsetYAdjust = 0;
        }
      } else {
        bodyOffsetX = facingRight ? offsetX - 2.5 : offsetX + 2.5;
      }

      // 所有者のプレイヤー番号に応じて色を設定
      const fighterOwner = owner as Fighter;
      const hurtboxColor = fighterOwner.playerNumber === 1 ? 0x00ff00 : 0xff0000;

      this.motionBody = scene.add.rectangle(
        x + bodyOffsetX,
        y + offsetY + bodyOffsetYAdjust,
        bodyWidth,
        bodyHeight,
        hurtboxColor, // キャラクター本体と同じ色
        0.3 // キャラクター本体と同じ透明度
      );
      scene.physics.add.existing(this.motionBody);
      const motionBodyPhysics = this.motionBody.body as Phaser.Physics.Arcade.Body;
      if (motionBodyPhysics) {
        motionBodyPhysics.setAllowGravity(false);
        motionBodyPhysics.setImmovable(true);
      }
      this.motionBody.setDepth(10);

      // 対空攻撃・空中攻撃の場合は回転（向きに応じて反転）
      if (isAntiAir) {
        this.motionBody.setRotation(facingRight ? -Math.PI / 2 : Math.PI / 2);
      } else if (isAirAttack) {
        this.motionBody.setRotation(facingRight ? Math.PI / 4 : -Math.PI / 4);
      }

      // 先端の攻撃判定エリア（5px幅）
      let tipOffsetX: number;
      let tipOffsetYAdjust = 0;

      if (isAntiAir || isAirAttack) {
        // 回転攻撃の先端判定
        tipOffsetX = facingRight ? bodyWidth + 2.5 : -(bodyWidth + 2.5);

        if (isAirAttack) {
          // Y方向: モーション本体と同じ補正
          const segmentHeight = characterHeight / 3;
          tipOffsetYAdjust = segmentHeight / 2;
        } else {
          tipOffsetYAdjust = 0;
        }
      } else {
        tipOffsetX = facingRight
          ? offsetX + attackData.hitboxWidth / 2 - 2.5
          : offsetX - attackData.hitboxWidth / 2 + 2.5;
      }

      // 先端判定のサイズ（全ての攻撃で同じ: 縦長の矩形）
      const tipWidth = 5;
      const tipHeight = height;

      this.hitboxTip = scene.add.rectangle(
        x + tipOffsetX,
        y + offsetY + tipOffsetYAdjust,
        tipWidth,
        tipHeight,
        0xff0000, // 赤（攻撃判定）
        0
      );
      scene.physics.add.existing(this.hitboxTip);
      const tipBody = this.hitboxTip.body as Phaser.Physics.Arcade.Body;
      if (tipBody) {
        tipBody.setAllowGravity(false);
        tipBody.setImmovable(true);
      }
      this.hitboxTip.setDepth(11);

      // 対空攻撃・空中攻撃の場合は回転（向きに応じて反転）
      if (isAntiAir) {
        this.hitboxTip.setRotation(facingRight ? -Math.PI / 2 : Math.PI / 2);
      } else if (isAirAttack) {
        this.hitboxTip.setRotation(facingRight ? Math.PI / 4 : -Math.PI / 4);
      }
    }

    this.updateVisuals();
  }

  updateFrame(): boolean {
    this.currentFrame++;

    // フェーズの更新と伸び率の計算
    if (this.currentFrame <= this.startupFrames) {
      this.phase = 'startup';
      this.isActive = false;
      // startup: 0 → 1.0 まで伸びる
      this.extensionRatio = this.currentFrame / this.startupFrames;
    } else if (this.currentFrame <= this.startupFrames + this.activeFrames) {
      this.phase = 'active';
      this.isActive = true;
      // active: 1.0 を維持
      this.extensionRatio = 1.0;
    } else if (this.currentFrame <= this.totalFrames) {
      this.phase = 'recovery';
      this.isActive = false;
      // recovery: 1.0 → 0 まで縮む
      const recoveryProgress = (this.currentFrame - this.startupFrames - this.activeFrames) / this.recoveryFrames;
      this.extensionRatio = 1.0 - recoveryProgress;
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

    // 特殊攻撃の判定
    const isSpecialAttack = this.attackType.includes('special') || this.attackType.includes('Special');

    // 攻撃レベルに応じてY軸のオフセットを計算
    const characterHeight = 108;
    const segmentHeight = characterHeight / 3;
    let offsetY = 0;

    // 対空攻撃と空中攻撃の発生位置
    if (this.attackType === 'antiAir') {
      // 対空攻撃: 上段攻撃と同じ発生位置
      offsetY = -characterHeight / 2 + segmentHeight / 2;
    } else if (this.attackType === 'airAttackDown') {
      // 空中攻撃: 下段攻撃と同じ発生位置
      offsetY = characterHeight / 2 - segmentHeight / 2;
    } else {
      // 通常攻撃のオフセット
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
    }

    if (isSpecialAttack) {
      // 必殺技は従来通り
      const offsetX = facingRight ? attackData.range / 2 : -attackData.range / 2;
      this.setPosition(this.owner.x + offsetX, this.owner.y + offsetY);
    } else {
      // 通常攻撃：伸び率に応じてサイズと位置を調整
      const currentWidth = this.maxRange * this.extensionRatio;
      const bodyWidth = Math.max(0, currentWidth - 5);
      const tipWidth = currentWidth > 5 ? 5 : currentWidth;

      // 対空・空中攻撃かどうか
      const isAntiAir = this.attackType === 'antiAir';
      const isAirAttack = this.attackType === 'airAttackDown';

      // モーション本体の位置とサイズを更新
      if (this.motionBody) {
        if (bodyWidth > 0) {
          const bodyOffsetX = facingRight ? bodyWidth / 2 : -bodyWidth / 2;

          // 空中攻撃の場合、モーション本体をキャラクター底辺に配置
          let bodyOffsetYAdjust = 0;
          if (isAirAttack) {
            const segmentHeight = characterHeight / 3;
            bodyOffsetYAdjust = segmentHeight / 2;
          }

          this.motionBody.setPosition(this.owner.x + bodyOffsetX, this.owner.y + offsetY + bodyOffsetYAdjust);
          this.motionBody.setSize(bodyWidth, this.motionBody.height);
          this.motionBody.setVisible(true);

          // 回転を維持（向きに応じて反転）
          if (isAntiAir) {
            this.motionBody.setRotation(facingRight ? -Math.PI / 2 : Math.PI / 2);
          } else if (isAirAttack) {
            this.motionBody.setRotation(facingRight ? Math.PI / 4 : -Math.PI / 4);
          }
        } else {
          this.motionBody.setVisible(false);
        }
      }

      // 先端判定の位置とサイズを更新
      if (this.hitboxTip) {
        if (tipWidth > 0 && this.isActive) {
          let tipOffsetX: number;
          let tipOffsetYAdjust = 0;

          if (isAirAttack) {
            // 空中攻撃: 先端判定を矩形の先端に配置
            tipOffsetX = facingRight
              ? currentWidth - tipWidth / 2
              : -(currentWidth - tipWidth / 2);
            // Y方向: モーション本体と同じ補正
            const segmentHeight = characterHeight / 3;
            tipOffsetYAdjust = segmentHeight / 2;
          } else {
            tipOffsetX = facingRight
              ? currentWidth - tipWidth / 2
              : -(currentWidth - tipWidth / 2);
          }

          this.hitboxTip.setPosition(this.owner.x + tipOffsetX, this.owner.y + offsetY + tipOffsetYAdjust);

          // 通常攻撃のみサイズを更新（対空・空中攻撃はコンストラクタで設定済み）
          if (!isAntiAir && !isAirAttack) {
            this.hitboxTip.setSize(tipWidth, this.hitboxTip.height);
          }
          this.hitboxTip.setVisible(true);

          // 回転を維持（向きに応じて反転）
          if (isAntiAir) {
            this.hitboxTip.setRotation(facingRight ? -Math.PI / 2 : Math.PI / 2);
          } else if (isAirAttack) {
            this.hitboxTip.setRotation(facingRight ? Math.PI / 4 : -Math.PI / 4);
          }
        } else {
          this.hitboxTip.setVisible(false);
        }
      }

      // ベースの矩形は非表示
      this.setVisible(false);
    }
  }

  private updateVisuals(): void {
    const isSpecialAttack = this.attackType.includes('special') || this.attackType.includes('Special');

    if (isSpecialAttack) {
      // 必殺技は従来通り
      switch (this.phase) {
        case 'startup':
          this.setFillStyle(0xffff00, 0.6);
          break;
        case 'active':
          this.setFillStyle(0xff0000, 0.8);
          break;
        case 'recovery':
          this.setFillStyle(0x0000ff, 0.5);
          break;
      }
    } else {
      // 上段・中段・下段攻撃: 色は常に一定（伸び縮みで状態を表現）
      const fighterOwner = this.owner as Fighter;
      const hurtboxColor = fighterOwner.playerNumber === 1 ? 0x00ff00 : 0xff0000;

      // モーション本体は常にキャラクター色
      if (this.motionBody) {
        this.motionBody.setFillStyle(hurtboxColor, 0.3);
      }

      // 先端判定は常に赤（activeフェーズのみ表示）
      if (this.hitboxTip) {
        this.hitboxTip.setFillStyle(0xff0000, 0.8);
      }
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
