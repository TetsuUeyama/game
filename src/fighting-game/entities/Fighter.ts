import * as Phaser from 'phaser';
import { PLAYER_CONFIG, ANIMATIONS, ATTACK_TYPES, AttackLevel } from '../config/gameConfig';
import { AttackEntity } from './AttackEntity';

export type AttackType = keyof typeof ATTACK_TYPES;
export type GuardType = 'high' | 'mid' | 'low' | null;

export type FighterState = 'idle' | 'walking' | 'jumping' | 'attacking' | 'blocking' | 'hit' | 'defeated';

export interface FighterControls {
  left: string;
  right: string;
  up: string;
  down: string;
  punch: string;
  kick: string;
  special: string;
  block: string;
}

export class Fighter extends Phaser.Physics.Arcade.Sprite {
  public health: number;
  public maxHealth: number;
  public state: FighterState;
  public facingRight: boolean;
  public isAttacking: boolean;
  public isBlocking: boolean;
  public currentGuardType: GuardType; // 現在のガードの種類
  public attackHitbox: Phaser.GameObjects.Rectangle | null; // 後方互換性のため残す
  public currentAttackEntity: AttackEntity | null; // 新しい攻撃要素
  public controls: FighterControls;
  public playerNumber: number;
  public specialMeter: number;
  public currentAttack: AttackType | null;
  public lastAttackTime: number;
  private canMove: boolean;
  public isInHitstun: boolean; // ヒットストップ中かどうか

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    controls: FighterControls,
    playerNumber: number
  ) {
    super(scene, x, y, texture);

    this.playerNumber = playerNumber;
    this.health = PLAYER_CONFIG.maxHealth;
    this.maxHealth = PLAYER_CONFIG.maxHealth;
    this.state = 'idle';
    this.facingRight = playerNumber === 1;
    this.isAttacking = false;
    this.isBlocking = false;
    this.currentGuardType = null;
    this.attackHitbox = null;
    this.currentAttackEntity = null;
    this.controls = controls;
    this.specialMeter = 0;
    this.currentAttack = null;
    this.lastAttackTime = 0;
    this.canMove = true;
    this.isInHitstun = false;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setBounce(0);
    this.setScale(2);

    // 衝突判定用のボディサイズを設定
    // スプライトは32x54で、実際のキャラクター本体のサイズに合わせる
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(28, 50); // キャラクター本体全体
      body.setOffset(2, 2); // わずかなマージン
      body.setImmovable(false);
      body.setMass(1);
      body.pushable = true; // 押し合いを有効化
    }
  }

  update(cursors: Map<string, Phaser.Input.Keyboard.Key>): void {
    if (!this.canMove || this.state === 'defeated') return;

    const onGround = (this.body as Phaser.Physics.Arcade.Body).touching.down;

    // ヒットストップ中または攻撃中は移動不可
    if (this.isInHitstun || this.isAttacking) {
      this.setVelocityX(0);
      return;
    }

    const leftKey = cursors.get(this.controls.left);
    const rightKey = cursors.get(this.controls.right);
    const upKey = cursors.get(this.controls.up);
    const downKey = cursors.get(this.controls.down);
    const blockKey = cursors.get(this.controls.block);
    const punchKey = cursors.get(this.controls.punch);
    const kickKey = cursors.get(this.controls.kick);
    const specialKey = cursors.get(this.controls.special);

    // ガード処理（地上のみ）
    if (blockKey?.isDown && onGround) {
      // 上下キーでガードの種類を変える
      if (upKey?.isDown) {
        this.block('high');  // 上段ガード
      } else if (downKey?.isDown) {
        this.block('low');   // 下段ガード
      } else {
        this.block('mid');   // 中段ガード（デフォルト）
      }
      return;
    }

    this.isBlocking = false;
    this.currentGuardType = null;

    if (Phaser.Input.Keyboard.JustDown(punchKey as Phaser.Input.Keyboard.Key)) {
      this.punch();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(kickKey as Phaser.Input.Keyboard.Key)) {
      this.kick();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(specialKey as Phaser.Input.Keyboard.Key) && this.specialMeter >= 100) {
      this.specialAttack();
      return;
    }

    if (leftKey?.isDown) {
      this.setVelocityX(-PLAYER_CONFIG.speed);
      this.facingRight = false;
      this.setFlipX(true);
      if (onGround) this.state = 'walking';
    } else if (rightKey?.isDown) {
      this.setVelocityX(PLAYER_CONFIG.speed);
      this.facingRight = true;
      this.setFlipX(false);
      if (onGround) this.state = 'walking';
    } else {
      this.setVelocityX(0);
      if (onGround) this.state = 'idle';
    }

    if (Phaser.Input.Keyboard.JustDown(upKey as Phaser.Input.Keyboard.Key) && onGround) {
      this.jump();
    }

    if (!onGround && this.state !== 'attacking') {
      this.state = 'jumping';
    }
  }

  jump(): void {
    this.setVelocityY(PLAYER_CONFIG.jumpVelocity);
    this.state = 'jumping';
    this.play(`${this.texture.key}_jump`, true);
  }

  // 汎用攻撃メソッド（フレームベース）
  performAttack(attackType: AttackType): void {
    const attackData = ATTACK_TYPES[attackType];

    // 攻撃中は新しい攻撃を出せない
    if (this.isAttacking) {
      return;
    }

    // 必殺技はゲージチェック
    if (attackType === 'special' && this.specialMeter < 100) {
      return;
    }

    if (attackType === 'special') {
      this.specialMeter = 0;
    }

    // 攻撃状態を設定
    this.isAttacking = true;
    this.state = 'attacking';
    this.currentAttack = attackType;
    this.setVelocityX(0);

    // アニメーション
    const animKey = attackType.includes('Punch') ? 'punch' :
                    attackType.includes('Kick') ? 'kick' :
                    'special';
    this.play(`${this.texture.key}_${animKey}`, true);

    // AttackEntityを生成
    this.currentAttackEntity = new AttackEntity(
      this.scene,
      this.x,
      this.y,
      attackType,
      this,
      this.facingRight
    );

    // 後方互換性のため attackHitbox も設定
    this.attackHitbox = this.currentAttackEntity;
  }

  // フレーム更新を行うメソッド（FightSceneから呼ばれる）
  updateAttack(): void {
    if (this.currentAttackEntity) {
      const isFinished = this.currentAttackEntity.updateFrame();

      if (isFinished) {
        // 全フレーム終了したら攻撃要素を破棄
        this.currentAttackEntity.destroy();
        this.currentAttackEntity = null;
        this.attackHitbox = null;
        this.isAttacking = false;
        this.currentAttack = null;

        if ((this.body as Phaser.Physics.Arcade.Body).touching.down) {
          this.state = 'idle';
        }
      }
    }
  }

  // 便利メソッド
  punch(): void { this.performAttack('mediumPunch'); }
  kick(): void { this.performAttack('mediumKick'); }
  specialAttack(): void { this.performAttack('special'); }

  block(guardType: GuardType = 'mid'): void {
    this.isBlocking = true;
    this.currentGuardType = guardType;
    this.state = 'blocking';
    this.setVelocityX(0);
    this.play(`${this.texture.key}_block`, true);
  }

  takeDamage(damage: number, knockback: number = 100, attackLevel?: AttackLevel): void {
    let canGuard = false;

    // ガード成功判定
    if (this.isBlocking && attackLevel && this.currentGuardType) {
      // 攻撃レベルとガードレベルが一致すればガード成功
      canGuard = attackLevel === this.currentGuardType;
    }

    if (canGuard) {
      // ガード成功：ダメージとノックバックを大幅に軽減
      damage = Math.floor(damage * 0.1);
      knockback = Math.floor(knockback * 0.2);
      console.log(`ガード成功！(${this.currentGuardType})`);
    }

    this.health = Math.max(0, this.health - damage);

    if (!canGuard) {
      // ガード失敗または非ガード時
      this.state = 'hit';
      this.isInHitstun = true; // ヒットストップ開始
      this.play(`${this.texture.key}_hit`, true);

      // ノックバック（既に方向付きの値として渡される）
      this.setVelocityX(knockback);

      // ダメージに応じてヒットストップ時間を調整（より長く）
      const hitStopTime = Math.min(800, 300 + damage * 15);

      this.scene.time.delayedCall(hitStopTime, () => {
        this.isInHitstun = false; // ヒットストップ終了
        if (this.health > 0) {
          this.state = 'idle';
          this.setVelocityX(0);
        }
      });
    } else {
      // ガード成功時は軽いノックバックのみ
      this.setVelocityX(knockback);
      this.scene.time.delayedCall(200, () => {
        this.setVelocityX(0);
      });
    }

    if (this.health <= 0) {
      this.defeat();
    } else {
      // ダメージに応じて必殺技ゲージ増加
      this.specialMeter = Math.min(100, this.specialMeter + Math.floor(damage / 2));
    }
  }

  defeat(): void {
    this.state = 'defeated';
    this.canMove = false;
    this.setVelocityX(0);
    this.play(`${this.texture.key}_defeat`, true);
  }

  reset(x: number, y: number): void {
    this.setPosition(x, y);
    this.health = this.maxHealth;
    this.specialMeter = 0;
    this.state = 'idle';
    this.canMove = true;
    this.isAttacking = false;
    this.isBlocking = false;
    this.isInHitstun = false;
    this.currentGuardType = null;
    this.setVelocity(0, 0);

    // 攻撃要素をクリーンアップ
    if (this.currentAttackEntity) {
      this.currentAttackEntity.destroy();
      this.currentAttackEntity = null;
    }
    this.attackHitbox = null;
    this.currentAttack = null;
  }
}
