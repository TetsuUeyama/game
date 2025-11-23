import * as Phaser from 'phaser';
import { Fighter } from '../entities/Fighter';
import { InputSystem } from '../systems/InputSystem';
import { UISystem } from '../systems/UISystem';
import { AIController } from '../systems/AIController';
import { CONTROLS, GAME_STATES, PLAYER_CONFIG, ATTACK_TYPES } from '../config/gameConfig';

type GameState = typeof GAME_STATES[keyof typeof GAME_STATES];

export class FightScene extends Phaser.Scene {
  private player1!: Fighter;
  private player2!: Fighter;
  private inputSystem!: InputSystem;
  private uiSystem!: UISystem;
  private ai1!: AIController;
  private ai2!: AIController;
  private gameState: GameState;
  private currentRound: number;
  private player1Wins: number;
  private player2Wins: number;
  private ground!: Phaser.GameObjects.Rectangle;
  private isAIMode: boolean;

  constructor() {
    super({ key: 'FightScene' });
    this.gameState = GAME_STATES.READY;
    this.currentRound = 1;
    this.player1Wins = 0;
    this.player2Wins = 0;
    this.isAIMode = true; // AI対AI自動対戦モード
  }

  preload(): void {
    this.load.setBaseURL('/assets/fighting-game');

    this.createPlaceholderSprites();
  }

  private createPlaceholderSprites(): void {
    // Player 1 (緑のアクセント)
    const canvas1 = document.createElement('canvas');
    canvas1.width = 32;
    canvas1.height = 54;
    const ctx1 = canvas1.getContext('2d');

    if (ctx1) {
      // 黒いキャラクター本体のみ
      ctx1.fillStyle = '#000000';
      ctx1.fillRect(4, 0, 24, 24);  // 頭
      ctx1.fillRect(0, 24, 32, 30);  // 体

      // 緑のアクセント（識別用）
      ctx1.fillStyle = '#00ff00';
      ctx1.fillRect(12, 6, 8, 8);  // 顔の部分

      this.textures.addCanvas('player1', canvas1);
    }

    // Player 2 (赤のアクセント)
    const canvas2 = document.createElement('canvas');
    canvas2.width = 32;
    canvas2.height = 54;
    const ctx2 = canvas2.getContext('2d');

    if (ctx2) {
      // 黒いキャラクター本体のみ
      ctx2.fillStyle = '#000000';
      ctx2.fillRect(4, 0, 24, 24);  // 頭
      ctx2.fillRect(0, 24, 32, 30);  // 体

      // 赤のアクセント（識別用）
      ctx2.fillStyle = '#ff0000';
      ctx2.fillRect(12, 6, 8, 8);  // 顔の部分

      this.textures.addCanvas('player2', canvas2);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#87CEEB');

    this.ground = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height - 50,
      this.cameras.main.width,
      100,
      0x228B22
    );
    this.physics.add.existing(this.ground, true);

    this.inputSystem = new InputSystem(this);
    this.inputSystem.registerControls([CONTROLS.player1, CONTROLS.player2]);

    this.player1 = new Fighter(
      this,
      200,
      this.cameras.main.height - 200,
      'player1',
      CONTROLS.player1,
      1
    );

    this.player2 = new Fighter(
      this,
      this.cameras.main.width - 200,
      this.cameras.main.height - 200,
      'player2',
      CONTROLS.player2,
      2
    );

    this.physics.add.collider(this.player1, this.ground);
    this.physics.add.collider(this.player2, this.ground);

    // プレイヤー同士の衝突判定を追加
    this.physics.add.collider(this.player1, this.player2);

    this.uiSystem = new UISystem(this);

    // AIコントローラーの初期化
    if (this.isAIMode) {
      this.ai1 = new AIController(this.player1, this.player2, this, 'medium');
      this.ai2 = new AIController(this.player2, this.player1, this, 'medium');
    }

    this.createAnimations();
    this.startRound();
  }

  private createAnimations(): void {
    const animTypes = ['idle', 'walk', 'jump', 'punch', 'kick', 'special', 'block', 'hit', 'defeat'];

    ['player1', 'player2'].forEach((textureKey) => {
      animTypes.forEach((animType) => {
        if (!this.anims.exists(`${textureKey}_${animType}`)) {
          this.anims.create({
            key: `${textureKey}_${animType}`,
            frames: [{ key: textureKey, frame: 0 }],
            frameRate: 8,
            repeat: animType === 'idle' || animType === 'walk' ? -1 : 0,
          });
        }
      });
    });
  }

  private startRound(): void {
    this.gameState = GAME_STATES.READY;

    this.player1.reset(200, this.cameras.main.height - 200);
    this.player2.reset(this.cameras.main.width - 200, this.cameras.main.height - 200);

    this.uiSystem.updateRound(this.currentRound);
    this.uiSystem.resetTimer();
    this.uiSystem.showMessage('FIGHT!', 1000);

    this.time.delayedCall(1000, () => {
      this.gameState = GAME_STATES.FIGHTING;
      this.uiSystem.startTimer(() => this.handleTimeUp());
    });
  }

  private handleTimeUp(): void {
    this.gameState = GAME_STATES.ROUND_END;

    if (this.player1.health > this.player2.health) {
      this.handleRoundEnd(1);
    } else if (this.player2.health > this.player1.health) {
      this.handleRoundEnd(2);
    } else {
      this.uiSystem.showMessage('DRAW!', 2000);
      this.time.delayedCall(2000, () => {
        this.currentRound++;
        this.startRound();
      });
    }
  }

  private handleRoundEnd(winner: number): void {
    this.gameState = GAME_STATES.ROUND_END;

    if (winner === 1) {
      this.player1Wins++;
      this.uiSystem.showMessage('PLAYER 1 WINS!', 2000);
    } else {
      this.player2Wins++;
      this.uiSystem.showMessage('PLAYER 2 WINS!', 2000);
    }

    this.uiSystem.updateWins(this.player1Wins, this.player2Wins);

    if (this.player1Wins >= 2 || this.player2Wins >= 2) {
      this.gameState = GAME_STATES.GAME_OVER;
      this.time.delayedCall(2000, () => {
        this.uiSystem.showMessage(
          `PLAYER ${winner} WINS THE MATCH!`,
          3000
        );
        this.time.delayedCall(3000, () => {
          this.resetGame();
        });
      });
    } else {
      this.time.delayedCall(2000, () => {
        this.currentRound++;
        this.startRound();
      });
    }
  }

  private resetGame(): void {
    this.player1Wins = 0;
    this.player2Wins = 0;
    this.currentRound = 1;
    this.uiSystem.updateWins(0, 0);
    this.startRound();
  }

  update(time: number): void {
    if (this.gameState !== GAME_STATES.FIGHTING) return;

    const keys = this.inputSystem.getKeys();

    // AIモードの場合、AIコントローラーを更新
    if (this.isAIMode) {
      this.ai1.update(time, keys);
      this.ai2.update(time, keys);
    }

    this.player1.update(keys);
    this.player2.update(keys);

    // 攻撃要素のフレーム更新
    this.player1.updateAttack();
    this.player2.updateAttack();

    this.checkAttackCollisions();

    this.uiSystem.updateHealthBars(this.player1, this.player2);
    this.uiSystem.updateSpecialBars(this.player1, this.player2);

    if (this.player1.health <= 0 || this.player2.health <= 0) {
      this.uiSystem.stopTimer();
      const winner = this.player1.health > 0 ? 1 : 2;
      this.handleRoundEnd(winner);
    }

    const distance = Math.abs(this.player1.x - this.player2.x);
    if (distance > 100) {
      this.player1.facingRight = this.player1.x < this.player2.x;
      this.player2.facingRight = this.player2.x < this.player1.x;
      this.player1.setFlipX(!this.player1.facingRight);
      this.player2.setFlipX(!this.player2.facingRight);
    }
  }

  private checkAttackCollisions(): void {
    // 攻撃同士の相殺チェック
    if (this.player1.currentAttackEntity && this.player2.currentAttackEntity) {
      const attack1 = this.player1.currentAttackEntity;
      const attack2 = this.player2.currentAttackEntity;

      // 両方がactiveフレームの時、相殺判定
      if (attack1.isActive && attack2.isActive && !attack1.hasHit && !attack2.hasHit) {
        const distance = Math.abs(this.player1.x - this.player2.x);

        // 攻撃要素が重なっている場合、相殺
        if (distance < 150) {
          console.log('攻撃相殺！');

          // 両者をノックバック
          const knockbackForce = 150;
          this.player1.setVelocityX(this.player1.facingRight ? -knockbackForce : knockbackForce);
          this.player2.setVelocityX(this.player2.facingRight ? -knockbackForce : knockbackForce);

          // 両方の攻撃にヒットフラグを立てて無効化
          attack1.hasHit = true;
          attack2.hasHit = true;

          // ノックバックを停止
          this.time.delayedCall(200, () => {
            this.player1.setVelocityX(0);
            this.player2.setVelocityX(0);
          });

          return; // 相殺したので通常のヒット判定はスキップ
        }
      }
    }

    // Player1の攻撃がPlayer2に当たったか
    if (this.player1.currentAttackEntity && this.player1.currentAttack) {
      const attackEntity = this.player1.currentAttackEntity;

      // activeフレームの時のみ攻撃判定を行う
      if (attackEntity.isActive && !attackEntity.hasHit) {
        const distance = Math.abs(this.player1.x - this.player2.x);
        const verticalDistance = Math.abs(this.player1.y - this.player2.y);
        const attackData = ATTACK_TYPES[this.player1.currentAttack];

        // 攻撃の範囲で判定
        if (distance < attackData.range + 30 && verticalDistance < 60) {
          // 向きも確認
          const isHitting = this.player1.facingRight
            ? this.player1.x < this.player2.x
            : this.player1.x > this.player2.x;

          if (isHitting) {
            console.log(`P1 Hit! ${attackData.name} (${attackData.level}) Frame:${attackEntity.currentFrame} Phase:${attackEntity.phase} Damage:${attackEntity.damage} Knockback:${attackEntity.knockback}`);

            // ノックバック方向を攻撃者の向きに基づいて設定
            const knockbackDirection = this.player1.facingRight ? attackEntity.knockback : -attackEntity.knockback;
            this.player2.takeDamage(attackEntity.damage, knockbackDirection, attackData.level);

            // 1回の攻撃で複数回ヒットしないようにフラグを立てる
            attackEntity.hasHit = true;
          }
        }
      }
    }

    // Player2の攻撃がPlayer1に当たったか
    if (this.player2.currentAttackEntity && this.player2.currentAttack) {
      const attackEntity = this.player2.currentAttackEntity;

      // activeフレームの時のみ攻撃判定を行う
      if (attackEntity.isActive && !attackEntity.hasHit) {
        const distance = Math.abs(this.player1.x - this.player2.x);
        const verticalDistance = Math.abs(this.player1.y - this.player2.y);
        const attackData = ATTACK_TYPES[this.player2.currentAttack];

        // 攻撃の範囲で判定
        if (distance < attackData.range + 30 && verticalDistance < 60) {
          // 向きも確認
          const isHitting = this.player2.facingRight
            ? this.player2.x < this.player1.x
            : this.player2.x > this.player1.x;

          if (isHitting) {
            console.log(`P2 Hit! ${attackData.name} (${attackData.level}) Frame:${attackEntity.currentFrame} Phase:${attackEntity.phase} Damage:${attackEntity.damage} Knockback:${attackEntity.knockback}`);

            // ノックバック方向を攻撃者の向きに基づいて設定
            const knockbackDirection = this.player2.facingRight ? attackEntity.knockback : -attackEntity.knockback;
            this.player1.takeDamage(attackEntity.damage, knockbackDirection, attackData.level);

            // 1回の攻撃で複数回ヒットしないようにフラグを立てる
            attackEntity.hasHit = true;
          }
        }
      }
    }
  }
}
