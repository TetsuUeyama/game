import * as Phaser from 'phaser';
import { Fighter } from './Fighter';

export type ProjectileType = 'projectileBase' | 'projectileLight' | 'projectileMedium' | 'projectileHeavy' | 'projectileSpecial' | 'projectileSuper';

export interface ProjectileData {
  damage: number;
  speed: number;
  size: number;
  color: number;
  name: string;
}

export class ProjectileEntity extends Phaser.GameObjects.Rectangle {
  public projectileType: ProjectileType;
  public damage: number;
  public speed: number;
  public hasHit: boolean;
  public owner: Fighter;
  private direction: number; // 1 = 右, -1 = 左

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    projectileType: ProjectileType,
    projectileData: ProjectileData,
    owner: Fighter,
    facingRight: boolean
  ) {
    super(
      scene,
      x,
      y,
      projectileData.size,
      projectileData.size,
      projectileData.color,
      0.8
    );

    this.projectileType = projectileType;

    // 特攻補正を適用（飛び道具の威力を上げる、数値を倍率に変換）
    const specialAttackStat = owner.stats?.specialAttack || 100;
    const specialAttackMultiplier = specialAttackStat / 100;
    this.damage = projectileData.damage * specialAttackMultiplier;

    this.speed = projectileData.speed;
    this.hasHit = false;
    this.owner = owner;
    this.direction = facingRight ? 1 : -1;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setAllowGravity(false);
      body.setVelocityX(this.speed * this.direction);
    }

    this.setDepth(5);
  }

  update(): void {
    // 画面外に出たら削除
    if (this.x < -50 || this.x > this.scene.cameras.main.width + 50) {
      this.destroy();
    }
  }

  onHit(): void {
    this.hasHit = true;
    // ヒットエフェクト（簡易的に拡大して消える）
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        this.destroy();
      }
    });
  }
}
