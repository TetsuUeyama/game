import * as Phaser from 'phaser';
import { Fighter } from '../entities/Fighter';
import { InputSystem } from '../systems/InputSystem';
import { UISystem } from '../systems/UISystem';
import { AIController } from '../systems/AIController';
import { ProjectileEntity } from '../entities/ProjectileEntity';
import { CONTROLS, GAME_STATES, ATTACK_TYPES, ATTACK_STRENGTH_MAP } from '../config/gameConfig';

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
  private projectiles: ProjectileEntity[] = [];

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

    // window.playerConfigsから設定を読み込む（型安全）
    // console.log('[FightScene] window.playerConfigs:', typeof window !== 'undefined' ? window.playerConfigs : 'undefined');
    const playerConfigs = (typeof window !== 'undefined' && window.playerConfigs) ? window.playerConfigs : {
      player1: {
        characterId: 1,
        stats: { hp: 100, attack: 100, attackSpeed: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 },
        aiCustomization: {
          preferredDistance: 200,
          closeRangeAggression: 0.7,
          longRangeAggression: 0.5,
          jumpFrequency: 0.3,
          dashFrequency: 0.5,
          specialMeterThreshold: 80,
          specialMeterReserve: 30,
          staminaThreshold: 30,
          staminaReserve: 10,
        },
      },
      player2: {
        characterId: 2,
        stats: { hp: 100, attack: 100, attackSpeed: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 },
        aiCustomization: {
          preferredDistance: 200,
          closeRangeAggression: 0.7,
          longRangeAggression: 0.5,
          jumpFrequency: 0.3,
          dashFrequency: 0.5,
          specialMeterThreshold: 80,
          specialMeterReserve: 30,
          staminaThreshold: 30,
          staminaReserve: 10,
        },
      },
    };

    this.player1 = new Fighter(
      this,
      200,
      this.cameras.main.height - 200,
      'player1',
      CONTROLS.player1,
      1,
      playerConfigs.player1.stats
    );

    this.player2 = new Fighter(
      this,
      this.cameras.main.width - 200,
      this.cameras.main.height - 200,
      'player2',
      CONTROLS.player2,
      2,
      playerConfigs.player2.stats
    );

    this.physics.add.collider(this.player1, this.ground);
    this.physics.add.collider(this.player2, this.ground);

    // プレイヤー同士の衝突判定を追加
    this.physics.add.collider(this.player1, this.player2);

    // 攻撃判定のオーバーラップは毎フレームupdateで動的にチェック
    // （AttackEntityが動的に生成・破棄されるため、ここでは設定しない）

    // 初回のボディサイズを強制的に設定（テクスチャロード後に確実に設定）
    this.time.delayedCall(10, () => {
      const _body1 = this.player1.body as Phaser.Physics.Arcade.Body;
      const _body2 = this.player2.body as Phaser.Physics.Arcade.Body;
      if (_body1 && _body2) {
        this.player1.setBodySize(32, 54, true);
        this.player2.setBodySize(32, 54, true);
        // console.log(`[FightScene Create] 初回ボディサイズ強制設定: Player1=${_body1.width}x${_body1.height}, Player2=${_body2.width}x${_body2.height}`);
      }
    });

    this.uiSystem = new UISystem(this);

    // AIコントローラーの初期化
    if (this.isAIMode) {
      // AIモードの場合、両キャラクターをAI制御に設定
      this.player1.isAIControlled = true;
      this.player2.isAIControlled = true;

      this.ai1 = new AIController(this.player1, this.player2, this, 'medium', playerConfigs.player1.aiCustomization);
      this.ai2 = new AIController(this.player2, this.player1, this, 'medium', playerConfigs.player2.aiCustomization);
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

    // console.log(`[FightScene] ラウンド${this.currentRound}開始`);

    this.player1.reset(200, this.cameras.main.height - 200);
    this.player2.reset(this.cameras.main.width - 200, this.cameras.main.height - 200);

    // ボディサイズを確認
    const _body1 = this.player1.body as Phaser.Physics.Arcade.Body;
    const _body2 = this.player2.body as Phaser.Physics.Arcade.Body;
    // console.log(`[FightScene] ラウンド${this.currentRound} Player1 ボディサイズ: ${_body1?.width}x${_body1?.height}`);
    // console.log(`[FightScene] ラウンド${this.currentRound} Player2 ボディサイズ: ${_body2?.width}x${_body2?.height}`);

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

    // Fighter.update()でクールタイムやスタミナ回復を実行
    // AI制御の場合は、Fighter内部で入力処理をスキップする
    this.player1.update(keys);
    this.player2.update(keys);

    // 攻撃要素のフレーム更新
    this.player1.updateAttack();
    this.player2.updateAttack();

    // ガード要素の更新
    this.player1.updateGuard();
    this.player2.updateGuard();

    // 当たり判定の可視化を更新
    this.player1.updateHurtbox();
    this.player2.updateHurtbox();

    this.checkAttackCollisions();

    // 飛び道具の更新と衝突判定
    this.updateProjectiles();
    this.checkProjectileCollisions();

    this.uiSystem.updateHealthBars(this.player1, this.player2);
    this.uiSystem.updateSpecialBars(this.player1, this.player2);
    this.uiSystem.updateGuardStaminaBars(this.player1, this.player2);
    this.uiSystem.updateCooldownBars(this.player1, this.player2);

    if (this.player1.health <= 0 || this.player2.health <= 0) {
      this.uiSystem.stopTimer();
      const winner = this.player1.health > 0 ? 1 : 2;
      this.handleRoundEnd(winner);
    }

    // 常に相手の方向を向くように更新（距離に関係なく）
    this.player1.facingRight = this.player1.x < this.player2.x;
    this.player2.facingRight = this.player2.x < this.player1.x;
    this.player1.setFlipX(!this.player1.facingRight);
    this.player2.setFlipX(!this.player2.facingRight);

    // キャラクター同士の重なりを防ぐ
    this.preventCharacterOverlap();
  }

  private preventCharacterOverlap(): void {
    // プレイヤーが初期化されているかチェック
    if (!this.player1 || !this.player2) return;

    const body1 = this.player1.body as Phaser.Physics.Arcade.Body;
    const body2 = this.player2.body as Phaser.Physics.Arcade.Body;

    if (!body1 || !body2) return;

    // 相手の上に乗っているかチェック
    this.checkAndHandleStandingOnOpponent(this.player1, this.player2, body1, body2);
    this.checkAndHandleStandingOnOpponent(this.player2, this.player1, body2, body1);

    // 水平方向の距離をチェック
    const distance = Math.abs(this.player1.x - this.player2.x);
    const minDistance = (body1.width + body2.width) / 2;

    // キャラクターが重なっている場合（地上での水平方向の重なり）
    if (distance < minDistance && body1.touching.down && body2.touching.down) {
      const pushDistance = (minDistance - distance) / 2;

      // 両キャラクターを反対方向に押し出す
      if (this.player1.x < this.player2.x) {
        // player1が左側
        this.player1.x -= pushDistance;
        this.player2.x += pushDistance;
      } else {
        // player1が右側
        this.player1.x += pushDistance;
        this.player2.x -= pushDistance;
      }

      // 画面端チェック（押し出した結果、画面外に出ないようにする）
      const screenWidth = this.cameras.main.width;
      const halfWidth1 = body1.width / 2;
      const halfWidth2 = body2.width / 2;

      this.player1.x = Phaser.Math.Clamp(this.player1.x, halfWidth1, screenWidth - halfWidth1);
      this.player2.x = Phaser.Math.Clamp(this.player2.x, halfWidth2, screenWidth - halfWidth2);
    }
  }

  /**
   * キャラクターが相手の上に乗っているかチェックし、乗っていたらジャンプして背後に回り込む
   */
  private checkAndHandleStandingOnOpponent(
    topPlayer: Fighter,
    bottomPlayer: Fighter,
    topBody: Phaser.Physics.Arcade.Body,
    bottomBody: Phaser.Physics.Arcade.Body
  ): void {
    // 上のキャラクターが地上にいるかチェック（相手の上に立っている状態）
    if (!topBody.touching.down) return;

    // 水平方向の距離
    const horizontalDistance = Math.abs(topPlayer.x - bottomPlayer.x);
    const horizontalOverlap = horizontalDistance < (topBody.width + bottomBody.width) / 2;

    if (!horizontalOverlap) return;

    // 垂直方向の位置関係（topPlayerが上にいるか）
    const topPlayerBottom = topPlayer.y + topBody.height / 2;
    const bottomPlayerTop = bottomPlayer.y - bottomBody.height / 2;
    const verticalOverlap = Math.abs(topPlayerBottom - bottomPlayerTop) < 10; // 許容誤差10px

    // 相手の上に乗っている場合
    if (verticalOverlap) {
      // console.log(`[Overlap] ${topPlayer === this.player1 ? 'Player1' : 'Player2'}が相手の上に乗っている - ジャンプして回り込む`);

      // ジャンプ
      topPlayer.setVelocityY(-400);

      // 相手の反対側に移動（背後に回り込む）
      const moveDirection = topPlayer.x < bottomPlayer.x ? -1 : 1;
      topPlayer.setVelocityX(moveDirection * -200); // 相手の反対方向に移動
    }
  }

  private checkAttackCollisions(): void {
    // 攻撃同士の相殺チェック（物理エンジンベース）
    if (this.player1.currentAttackEntity && this.player2.currentAttackEntity) {
      const attack1 = this.player1.currentAttackEntity;
      const attack2 = this.player2.currentAttackEntity;

      // 両方がactiveフレームの時、相殺判定
      if (attack1.isActive && attack2.isActive && !attack1.hasHit && !attack2.hasHit) {
        // 物理エンジンで攻撃同士の重なりをチェック（コールバック形式）
        this.physics.overlap(attack1, attack2, () => {
          console.log('攻撃相殺！（物理判定）');

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
        });

        // 相殺が起きた場合は通常のヒット判定をスキップ
        if (attack1.hasHit || attack2.hasHit) {
          return;
        }
      }
    }

    // Player1の攻撃がPlayer2に当たったか（物理エンジンベース）
    if (this.player1.currentAttackEntity && this.player1.currentAttack) {
      const attackEntity = this.player1.currentAttackEntity;

      // activeフレームの時のみ攻撃判定を行う
      // 回避アクション（roll, jumpDodge）はダメージを与えないのでスキップ
      if (attackEntity.isActive && !attackEntity.hasHit && attackEntity.damage > 0) {
        const attackData = ATTACK_TYPES[this.player1.currentAttack];

        // まず、ガードとの重なりをチェック
        let isGuarded = false;
        if (this.player2.currentGuardEntity) {
          this.physics.overlap(attackEntity, this.player2.currentGuardEntity, () => {
            // ガードエリアと攻撃が重なっている
            isGuarded = true;
            console.log(`P2 ガード成功！ ${attackData.name} (${attackData.level}) をガード [物理判定]`);

            // ガード成功時の処理（削りダメージとノックバック軽減）
            const chipDamage = Math.floor(attackEntity.damage * 0.1);
            const reducedKnockback = Math.floor(attackEntity.knockback * 0.25);
            const knockbackDirection = this.player1.facingRight ? reducedKnockback : -reducedKnockback;

            this.player2.takeDamage(chipDamage, knockbackDirection, attackData.level, ATTACK_STRENGTH_MAP[attackEntity.attackType]);
            attackEntity.hasHit = true; // ガードされたので攻撃終了
          });
        }

        // ガードされていない場合のみ、プレイヤーへのヒット判定
        if (!isGuarded) {
          this.physics.overlap(attackEntity, this.player2, () => {
            // 向きも確認（攻撃者が相手の方を向いているか）
            const isHitting = this.player1.facingRight
              ? this.player1.x < this.player2.x
              : this.player1.x > this.player2.x;

            if (isHitting) {
              console.log(`P1 Hit! ${attackData.name} (${attackData.level}) Frame:${attackEntity.currentFrame} Phase:${attackEntity.phase} Damage:${attackEntity.damage} Knockback:${attackEntity.knockback} [物理判定]`);

              // ノックバック方向を攻撃者の向きに基づいて設定
              const knockbackDirection = this.player1.facingRight ? attackEntity.knockback : -attackEntity.knockback;

              // 攻撃の強さを取得
              const attackStrength = ATTACK_STRENGTH_MAP[attackEntity.attackType];
              this.player2.takeDamage(attackEntity.damage, knockbackDirection, attackData.level, attackStrength);

              // 1回の攻撃で複数回ヒットしないようにフラグを立てる
              attackEntity.hasHit = true;
            }
          });
        }
      }
    }

    // Player2の攻撃がPlayer1に当たったか（物理エンジンベース）
    if (this.player2.currentAttackEntity && this.player2.currentAttack) {
      const attackEntity = this.player2.currentAttackEntity;

      // activeフレームの時のみ攻撃判定を行う
      // 回避アクション（roll, jumpDodge）はダメージを与えないのでスキップ
      if (attackEntity.isActive && !attackEntity.hasHit && attackEntity.damage > 0) {
        const attackData = ATTACK_TYPES[this.player2.currentAttack];

        // まず、ガードとの重なりをチェック
        let isGuarded = false;
        if (this.player1.currentGuardEntity) {
          this.physics.overlap(attackEntity, this.player1.currentGuardEntity, () => {
            // ガードエリアと攻撃が重なっている
            isGuarded = true;
            console.log(`P1 ガード成功！ ${attackData.name} (${attackData.level}) をガード [物理判定]`);

            // ガード成功時の処理（削りダメージとノックバック軽減）
            const chipDamage = Math.floor(attackEntity.damage * 0.1);
            const reducedKnockback = Math.floor(attackEntity.knockback * 0.25);
            const knockbackDirection = this.player2.facingRight ? reducedKnockback : -reducedKnockback;

            this.player1.takeDamage(chipDamage, knockbackDirection, attackData.level, ATTACK_STRENGTH_MAP[attackEntity.attackType]);
            attackEntity.hasHit = true; // ガードされたので攻撃終了
          });
        }

        // ガードされていない場合のみ、プレイヤーへのヒット判定
        if (!isGuarded) {
          this.physics.overlap(attackEntity, this.player1, () => {
            // 向きも確認（攻撃者が相手の方を向いているか）
            const isHitting = this.player2.facingRight
              ? this.player2.x < this.player1.x
              : this.player2.x > this.player1.x;

            if (isHitting) {
              console.log(`P2 Hit! ${attackData.name} (${attackData.level}) Frame:${attackEntity.currentFrame} Phase:${attackEntity.phase} Damage:${attackEntity.damage} Knockback:${attackEntity.knockback} [物理判定]`);

              // ノックバック方向を攻撃者の向きに基づいて設定
              const knockbackDirection = this.player2.facingRight ? attackEntity.knockback : -attackEntity.knockback;

              // 攻撃の強さを取得
              const attackStrength = ATTACK_STRENGTH_MAP[attackEntity.attackType];
              this.player1.takeDamage(attackEntity.damage, knockbackDirection, attackData.level, attackStrength);

              // 1回の攻撃で複数回ヒットしないようにフラグを立てる
              attackEntity.hasHit = true;
            }
          });
        }
      }
    }
  }

  private updateProjectiles(): void {
    // 破壊された飛び道具を配列から削除
    this.projectiles = this.projectiles.filter(p => p.active);

    // 全ての飛び道具を更新
    this.projectiles.forEach(projectile => {
      projectile.update();
    });
  }

  private checkProjectileCollisions(): void {
    this.projectiles.forEach(projectile => {
      if (projectile.hasHit) return;

      // 発射者以外のプレイヤーとの衝突判定
      const target = projectile.owner === this.player1 ? this.player2 : this.player1;

      // まず、ガードとの重なりをチェック（物理演算ベース）
      let isGuarded = false;
      if (target.currentGuardEntity) {
        this.physics.overlap(projectile, target.currentGuardEntity, () => {
          // ガードエリアと飛び道具が重なっている
          isGuarded = true;
          console.log(`飛び道具ガード成功！ガードタイプ: ${target.currentGuardType} [物理判定]`);

          // ガード成功時の処理（削りダメージ）
          const chipDamage = Math.floor(projectile.damage * 0.1);
          target.takeDamage(chipDamage, 0, 'mid', 'light');

          // 飛び道具を消滅させる
          projectile.onHit();
        });
      }

      // ガードされていない場合のみ、プレイヤーへのヒット判定（物理演算ベース）
      if (!isGuarded && !projectile.hasHit) {
        this.physics.overlap(projectile, target, () => {
          console.log(`飛び道具ヒット！ダメージ: ${projectile.damage} [物理判定]`);
          target.takeDamage(projectile.damage, 0, 'mid', 'light');

          // 飛び道具を消滅させる
          projectile.onHit();
        });
      }
    });
  }

  // AIや手動で飛び道具を発射するためのヘルパーメソッド
  public addProjectile(projectile: ProjectileEntity): void {
    this.projectiles.push(projectile);
  }

  // 飛び道具の配列を取得
  public getProjectiles(): ProjectileEntity[] {
    return this.projectiles;
  }
}
