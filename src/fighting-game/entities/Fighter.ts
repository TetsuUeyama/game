import * as Phaser from 'phaser';
import { PLAYER_CONFIG, ATTACK_TYPES, AttackLevel, COOLDOWNS, ATTACK_STRENGTH_MAP, AttackStrength, GUARD_STAMINA_COSTS } from '../config/gameConfig';
import { AttackEntity } from './AttackEntity';
import { GuardEntity } from './GuardEntity';

export type AttackType = keyof typeof ATTACK_TYPES;
export type GuardType = 'high' | 'mid' | 'low' | 'highMid' | 'midLow' | 'all' | null;

export type FighterState = 'idle' | 'walking' | 'jumping' | 'attacking' | 'blocking' | 'hit' | 'defeated';

export interface FighterControls {
  left: string;
  right: string;
  up: string;
  down: string;
  punch: string;   // 弱攻撃
  kick: string;    // 中攻撃
  heavy: string;   // 強攻撃
  special: string;
  block: string;
}

export class Fighter extends Phaser.Physics.Arcade.Sprite {
  public health: number;
  public maxHealth: number;
  public guardStamina: number;  // ガード用スタミナ
  public maxGuardStamina: number;
  public state: FighterState;
  public facingRight: boolean;
  public isAttacking: boolean;
  public isBlocking: boolean;
  public currentGuardType: GuardType; // 現在のガードの種類
  public attackHitbox: Phaser.GameObjects.Rectangle | null; // 後方互換性のため残す
  public currentAttackEntity: AttackEntity | null; // 新しい攻撃要素
  public currentGuardEntity: GuardEntity | null; // ガード要素
  public controls: FighterControls;
  public playerNumber: number;
  public specialMeter: number;
  public currentAttack: AttackType | null;
  public lastAttackTime: number;
  private canMove: boolean;
  public isInHitstun: boolean; // ヒットストップ中かどうか
  private lastGuardStaminaDrain: number; // ガードスタミナ消費用
  private hurtboxVisual: Phaser.GameObjects.Rectangle | null; // 当たり判定の可視化
  private lastSpecialMeterGain: number; // 必殺技ゲージの時間増加用

  // クールタイム管理（攻撃のみ）
  public cooldowns: Record<AttackStrength, number>;

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
    this.guardStamina = PLAYER_CONFIG.maxGuardStamina;
    this.maxGuardStamina = PLAYER_CONFIG.maxGuardStamina;
    this.state = 'idle';
    this.facingRight = playerNumber === 1;
    this.isAttacking = false;
    this.isBlocking = false;
    this.currentGuardType = null;
    this.attackHitbox = null;
    this.currentAttackEntity = null;
    this.currentGuardEntity = null;
    this.controls = controls;
    this.specialMeter = 0;
    this.currentAttack = null;
    this.lastAttackTime = 0;
    this.canMove = true;
    this.isInHitstun = false;
    this.lastGuardStaminaDrain = 0;
    this.lastSpecialMeterGain = Date.now();
    this.hurtboxVisual = null;

    // クールタイムを初期化（攻撃のみ）
    this.cooldowns = {
      light: 0,
      medium: 0,
      heavy: 0,
      special: 0,
    };

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setBounce(0);
    this.setScale(2);

    // 衝突判定用のボディサイズを設定
    // スプライトは32x54で、表示されているキャラクター全体を当たり判定とする
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // スプライトの元サイズ全体を使用（オフセットなし）
      body.setSize(32, 54);
      body.setOffset(0, 0);
      body.setImmovable(false);
      body.setMass(1);
      body.pushable = true; // 押し合いを有効化
    }

    // 当たり判定の可視化を作成
    this.createHurtboxVisual();
  }

  update(cursors: Map<string, Phaser.Input.Keyboard.Key>): void {
    if (!this.canMove || this.state === 'defeated') return;

    // クールタイムを減少
    this.updateCooldowns();

    // ガードスタミナの自然回復
    this.regenerateGuardStamina();

    // 必殺技ゲージの時間経過による増加
    this.regenerateSpecialMeter();

    const onGround = (this.body as Phaser.Physics.Arcade.Body).touching.down;

    // ヒットストップ中または攻撃中は入力を受け付けない（ノックバックは維持）
    if (this.isInHitstun || this.isAttacking) {
      // ヒットストップ中はノックバックを維持するため、速度をリセットしない
      // 攻撃中は静止
      if (this.isAttacking) {
        this.setVelocityX(0);
      }
      return;
    }

    const leftKey = cursors.get(this.controls.left);
    const rightKey = cursors.get(this.controls.right);
    const upKey = cursors.get(this.controls.up);
    const downKey = cursors.get(this.controls.down);
    const blockKey = cursors.get(this.controls.block);
    const punchKey = cursors.get(this.controls.punch);
    const kickKey = cursors.get(this.controls.kick);
    const heavyKey = cursors.get(this.controls.heavy);
    const specialKey = cursors.get(this.controls.special);

    // ガード処理（地上のみ）
    if (blockKey?.isDown && onGround) {
      // 上下キーでガードの種類を変える
      const upPressed = upKey?.isDown || false;
      const downPressed = downKey?.isDown || false;

      if (upPressed && downPressed) {
        this.block('all');  // 全面ガード（上+下）
      } else if (upPressed) {
        // 左右キーで上段のみか上段+中段かを選択
        const leftPressed = leftKey?.isDown || false;
        const rightPressed = rightKey?.isDown || false;
        if (leftPressed || rightPressed) {
          this.block('highMid');  // 上段+中段ガード（上+左右）
        } else {
          this.block('high');  // 上段のみガード
        }
      } else if (downPressed) {
        // 左右キーで下段のみか中段+下段かを選択
        const leftPressed = leftKey?.isDown || false;
        const rightPressed = rightKey?.isDown || false;
        if (leftPressed || rightPressed) {
          this.block('midLow');  // 中段+下段ガード（下+左右）
        } else {
          this.block('low');  // 下段のみガード
        }
      } else {
        this.block('mid');   // 中段のみガード（デフォルト）
      }
      return;
    }

    // ガード解除時、ガード要素を削除
    if (this.isBlocking || this.currentGuardEntity) {
      this.stopBlocking();
    }

    // 攻撃入力処理（方向キー + 攻撃ボタンで攻撃レベルを決定）
    const upPressed = upKey?.isDown || false;
    const downPressed = downKey?.isDown || false;

    // 必殺技（方向キー不問）
    if (Phaser.Input.Keyboard.JustDown(specialKey as Phaser.Input.Keyboard.Key) && this.specialMeter >= 100) {
      this.specialAttack();
      return;
    }

    // パンチ（弱攻撃）
    if (Phaser.Input.Keyboard.JustDown(punchKey as Phaser.Input.Keyboard.Key)) {
      if (upPressed) {
        this.performAttack('lightHigh');  // 上 + パンチ = 弱攻撃(上段)
      } else if (downPressed) {
        this.performAttack('lightLow');   // 下 + パンチ = 弱攻撃(下段)
      } else {
        this.performAttack('lightMid');   // パンチのみ = 弱攻撃(中段)
      }
      return;
    }

    // キック（中攻撃）
    if (Phaser.Input.Keyboard.JustDown(kickKey as Phaser.Input.Keyboard.Key)) {
      if (upPressed) {
        this.performAttack('mediumHigh'); // 上 + キック = 中攻撃(上段)
      } else if (downPressed) {
        this.performAttack('mediumLow');  // 下 + キック = 中攻撃(下段)
      } else {
        this.performAttack('mediumMid');  // キックのみ = 中攻撃(中段)
      }
      return;
    }

    // 強攻撃
    if (Phaser.Input.Keyboard.JustDown(heavyKey as Phaser.Input.Keyboard.Key)) {
      if (upPressed) {
        this.performAttack('heavyHigh');  // 上 + 強攻撃 = 強攻撃(上段)
      } else if (downPressed) {
        this.performAttack('heavyLow');   // 下 + 強攻撃 = 強攻撃(下段)
      } else {
        this.performAttack('heavyMid');   // 強攻撃のみ = 強攻撃(中段)
      }
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

  // クールタイムの更新（60fpsを想定）
  private updateCooldowns(): void {
    const deltaTime = 1000 / 60; // 約16.67ms

    (Object.keys(this.cooldowns) as Array<keyof typeof this.cooldowns>).forEach(key => {
      if (this.cooldowns[key] > 0) {
        this.cooldowns[key] = Math.max(0, this.cooldowns[key] - deltaTime);
      }
    });
  }

  // ガードスタミナの回復
  private regenerateGuardStamina(): void {
    if (this.guardStamina < this.maxGuardStamina && !this.isBlocking) {
      // 60fps想定で1フレームあたりの回復量を計算
      const regenPerFrame = PLAYER_CONFIG.guardStaminaRegenRate / 60;
      this.guardStamina = Math.min(this.maxGuardStamina, this.guardStamina + regenPerFrame);
    }
  }

  // 必殺技ゲージの時間経過による増加
  private regenerateSpecialMeter(): void {
    if (this.specialMeter < 100) {
      const now = Date.now();
      const timeSinceLastGain = (now - this.lastSpecialMeterGain) / 1000; // 秒単位

      // 1秒ごとにチェック（約60フレームごと）
      if (timeSinceLastGain >= 1) {
        // 1秒あたり5ゲージ増加（20秒で満タン）
        this.specialMeter = Math.min(100, this.specialMeter + 5);
        this.lastSpecialMeterGain = now;
      }
    }
  }

  // クールタイムをチェック
  public isCooldownReady(type: AttackStrength): boolean {
    return this.cooldowns[type] <= 0;
  }

  // クールタイムをセット
  private setCooldown(type: AttackStrength): void {
    this.cooldowns[type] = COOLDOWNS[type];
  }

  // クールタイム残り時間のパーセンテージ（0-1）
  public getCooldownPercent(type: AttackStrength): number {
    const maxCooldown = COOLDOWNS[type];
    return this.cooldowns[type] / maxCooldown;
  }

  // 汎用攻撃メソッド（フレームベース）
  performAttack(attackType: AttackType): void {
    const attackStrength = ATTACK_STRENGTH_MAP[attackType];

    // 攻撃中は新しい攻撃を出せない
    if (this.isAttacking) {
      return;
    }

    // クールタイムチェック
    if (!this.isCooldownReady(attackStrength)) {
      const remainingTime = (this.cooldowns[attackStrength] / 1000).toFixed(1);
      console.log(`${attackStrength}攻撃はクールタイム中！ あと${remainingTime}秒`);
      return;
    }

    // 必殺技はゲージチェック
    if (attackType === 'special' && this.specialMeter < 100) {
      return;
    }

    if (attackType === 'special') {
      this.specialMeter = 0;
    }

    // クールタイム開始
    this.setCooldown(attackStrength);

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

  // 便利メソッド（後方互換性のため残すが、新しい攻撃タイプに対応）
  punch(): void { this.performAttack('lightMid'); }
  kick(): void { this.performAttack('mediumMid'); }
  specialAttack(): void { this.performAttack('special'); }

  block(guardType: GuardType = 'mid'): void {
    // guardTypeがnullの場合は処理しない
    if (!guardType) return;

    // ガード開始時のスタミナチェック
    if (!this.isBlocking) {
      // 最低限のスタミナがないとガードできない
      if (this.guardStamina < 5) {
        console.log(`ガードスタミナ不足！`);
        return;
      }
      this.lastGuardStaminaDrain = Date.now();
    } else {
      // ガード継続中のスタミナ消費
      const now = Date.now();
      const timeSinceLastDrain = (now - this.lastGuardStaminaDrain) / 1000; // 秒単位

      if (timeSinceLastDrain >= 0.05) { // 50msごとにチェック
        const drainAmount = GUARD_STAMINA_COSTS[guardType] * timeSinceLastDrain;

        if (this.guardStamina < drainAmount) {
          // スタミナ切れでガード解除
          console.log('ガードスタミナ切れ！');
          this.stopBlocking();
          return;
        }

        this.guardStamina = Math.max(0, this.guardStamina - drainAmount);
        this.lastGuardStaminaDrain = now;
      }
    }

    this.isBlocking = true;
    this.currentGuardType = guardType;
    this.state = 'blocking';
    this.setVelocityX(0);
    this.play(`${this.texture.key}_block`, true);

    // ガード要素を作成（ガードタイプが変わったら再作成）
    if (!this.currentGuardEntity || this.currentGuardEntity.guardType !== guardType) {
      // 既存のガード要素を削除
      if (this.currentGuardEntity) {
        this.currentGuardEntity.destroy();
      }

      // 新しいガード要素を作成
      this.currentGuardEntity = new GuardEntity(
        this.scene,
        this.x,
        this.y,
        guardType,
        this,
        this.facingRight
      );
    }
  }

  stopBlocking(): void {
    this.isBlocking = false;
    this.currentGuardType = null;

    // ガード要素を削除
    if (this.currentGuardEntity) {
      this.currentGuardEntity.destroy();
      this.currentGuardEntity = null;
    }
  }

  takeDamage(damage: number, knockback: number = 100, attackLevel?: AttackLevel, attackStrength?: AttackStrength): void {
    let canGuard = false;
    let actualGuardedLevel: AttackLevel | null = null;

    // ガード成功判定
    if (this.isBlocking && attackLevel && this.currentGuardType) {
      // 残スタミナ割合で成功率を計算（0-100%）
      const staminaPercent = (this.guardStamina / this.maxGuardStamina) * 100;
      const guardSuccessRoll = Math.random() * 100;

      console.log(`ガード試行: スタミナ${staminaPercent.toFixed(1)}% vs ロール${guardSuccessRoll.toFixed(1)}`);

      // ガードタイプに応じて防御できる攻撃レベルをリストアップ
      let guardableLevels: AttackLevel[] = [];
      switch (this.currentGuardType) {
        case 'high':
          guardableLevels = ['high'];
          break;
        case 'mid':
          guardableLevels = ['mid'];
          break;
        case 'low':
          guardableLevels = ['low'];
          break;
        case 'highMid':
          guardableLevels = ['high', 'mid'];
          break;
        case 'midLow':
          guardableLevels = ['mid', 'low'];
          break;
        case 'all':
          guardableLevels = ['high', 'mid', 'low'];
          break;
      }

      // スタミナ割合がロールより高ければ成功
      if (guardSuccessRoll < staminaPercent) {
        // 意図したガードが成功
        if (guardableLevels.includes(attackLevel)) {
          canGuard = true;
          actualGuardedLevel = attackLevel;
          console.log(`ガード成功！狙った箇所: ${attackLevel}`);
        } else {
          // 意図した箇所ではない場合、ランダムに別の箇所をガード
          const otherLevels: AttackLevel[] = (['high', 'mid', 'low'] as AttackLevel[]).filter(
            (level: AttackLevel) => !guardableLevels.includes(level)
          );
          if (otherLevels.length > 0) {
            actualGuardedLevel = otherLevels[Math.floor(Math.random() * otherLevels.length)];
            canGuard = actualGuardedLevel === attackLevel;
            console.log(`ガード失敗→別箇所ガード: ${actualGuardedLevel} (攻撃: ${attackLevel})`);
          }
        }
      } else {
        // スタミナ不足でガード判定失敗 → ランダムに別の箇所をガード
        const otherLevels: AttackLevel[] = (['high', 'mid', 'low'] as AttackLevel[]).filter(
          (level: AttackLevel) => !guardableLevels.includes(level)
        );
        if (otherLevels.length > 0) {
          actualGuardedLevel = otherLevels[Math.floor(Math.random() * otherLevels.length)];
          canGuard = actualGuardedLevel === attackLevel;
          console.log(`スタミナ不足→別箇所ガード: ${actualGuardedLevel} (攻撃: ${attackLevel})`);
        }
      }
    }

    if (canGuard) {
      // ガード成功：ダメージとノックバックを大幅に軽減
      damage = Math.floor(damage * 0.1);
      knockback = Math.floor(knockback * 0.25);  // ヒット時の1/4
      console.log(`ガード成功！(${this.currentGuardType}) knockback: ${knockback}`);
    }

    this.health = Math.max(0, this.health - damage);

    if (!canGuard) {
      // ガード失敗または非ガード時
      this.state = 'hit';
      this.isInHitstun = true; // ヒットストップ開始
      this.play(`${this.texture.key}_hit`, true);

      // ノックバック（速度ベースで実装）
      console.log(`ヒット！ knockback velocity: ${knockback}, damage: ${damage}`);

      // ダメージに応じてヒットストップ時間を調整
      const hitStopTime = Math.min(400, 150 + damage * 8);
      console.log(`ヒットストップ時間: ${hitStopTime}ms`);

      // ノックバックを即座に適用し、継続的に維持
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(knockback);
      body.setAllowGravity(true);
      console.log(`実際の速度: ${body.velocity.x}`);

      // 攻撃の強さに応じて振動の振幅を決定
      let shakeAmplitude = 2; // デフォルト（弱攻撃）
      if (attackStrength === 'medium') {
        shakeAmplitude = 4; // 中攻撃
      } else if (attackStrength === 'heavy') {
        shakeAmplitude = 8; // 強攻撃
      } else if (attackStrength === 'special') {
        shakeAmplitude = 12; // 必殺技
      }

      // 横方向の振動エフェクトを開始
      this.startHitShake(shakeAmplitude, hitStopTime);

      this.scene.time.delayedCall(hitStopTime, () => {
        this.isInHitstun = false; // ヒットストップ終了
        if (this.health > 0) {
          this.state = 'idle';
          body.setVelocityX(0);
        }
      });
    } else {
      // ガード成功時は軽いノックバックと小さい振動
      console.log(`ガード knockback velocity: ${knockback}`);
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(knockback);

      // ガード時も軽い振動
      this.startHitShake(1, 150);

      this.scene.time.delayedCall(150, () => {
        body.setVelocityX(0);
      });
    }

    if (this.health <= 0) {
      this.defeat();
    } else {
      // ダメージに応じて必殺技ゲージ増加（ダメージの1.5倍）
      // ガード時も少し増える（軽減後のダメージに対して）
      const meterGain = Math.floor(damage * 1.5);
      this.specialMeter = Math.min(100, this.specialMeter + meterGain);
      console.log(`必殺技ゲージ増加: +${meterGain} (現在: ${this.specialMeter})`);
    }
  }

  defeat(): void {
    this.state = 'defeated';
    this.canMove = false;
    this.setVelocityX(0);
    this.play(`${this.texture.key}_defeat`, true);
  }

  // ガード要素の更新（FightSceneから呼ばれる）
  updateGuard(): void {
    if (this.currentGuardEntity) {
      this.currentGuardEntity.update();
    }
  }

  // 当たり判定の可視化を作成
  private createHurtboxVisual(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    // キャラクターの色に合わせた可視化（緑がかったシアン）
    const color = this.playerNumber === 1 ? 0x00ff00 : 0xff0000;

    this.hurtboxVisual = this.scene.add.rectangle(
      0,
      0,
      body.width,
      body.height,
      color,
      0.3  // 半透明
    );
    this.hurtboxVisual.setStrokeStyle(2, color, 0.8);
    this.hurtboxVisual.setDepth(5); // キャラクターより手前、攻撃要素より奥
  }

  // 当たり判定の可視化を更新（FightSceneから呼ばれる）
  updateHurtbox(): void {
    if (!this.hurtboxVisual) return;

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    // ボディの実際の位置に合わせて矩形を更新
    // body.x, body.y は左上の座標なので、中心に変換
    this.hurtboxVisual.setPosition(
      body.x + body.width / 2,
      body.y + body.height / 2
    );
  }

  // ヒット時の振動エフェクト（ノックバックと組み合わせ）
  private startHitShake(amplitude: number, duration: number): void {
    const shakeInterval = 30; // 振動の間隔（ミリ秒）
    const shakeCount = Math.floor(duration / shakeInterval);
    let currentShake = 0;
    let shakeOffsetX = 0; // 現在の横方向振動オフセット

    const shakeTimer = this.scene.time.addEvent({
      delay: shakeInterval,
      callback: () => {
        if (currentShake < shakeCount) {
          // 前回の振動オフセットを除去
          this.x -= shakeOffsetX;

          // 新しい振動オフセットを計算
          // 横方向: 左右交互
          shakeOffsetX = (currentShake % 2 === 0 ? 1 : -1) * amplitude;

          // 新しいオフセットを適用（ノックバックによる移動 + 振動）
          this.x += shakeOffsetX;
          currentShake++;
        } else {
          // 振動終了：最後の振動オフセットを除去
          this.x -= shakeOffsetX;
          shakeOffsetX = 0;
          shakeTimer.remove();
        }
      },
      loop: true
    });
  }

  reset(x: number, y: number): void {
    this.setPosition(x, y);
    this.health = this.maxHealth;
    this.guardStamina = this.maxGuardStamina;
    this.specialMeter = 0;
    this.state = 'idle';
    this.canMove = true;
    this.isAttacking = false;
    this.isBlocking = false;
    this.isInHitstun = false;
    this.currentGuardType = null;
    this.lastGuardStaminaDrain = 0;
    this.lastSpecialMeterGain = Date.now();
    this.setVelocity(0, 0);

    // クールタイムをリセット（攻撃のみ）
    this.cooldowns = {
      light: 0,
      medium: 0,
      heavy: 0,
      special: 0,
    };

    // 攻撃要素をクリーンアップ
    if (this.currentAttackEntity) {
      this.currentAttackEntity.destroy();
      this.currentAttackEntity = null;
    }
    this.attackHitbox = null;
    this.currentAttack = null;

    // ガード要素をクリーンアップ
    if (this.currentGuardEntity) {
      this.currentGuardEntity.destroy();
      this.currentGuardEntity = null;
    }

    // 当たり判定の可視化を再作成
    if (this.hurtboxVisual) {
      this.hurtboxVisual.destroy();
      this.hurtboxVisual = null;
    }
    this.createHurtboxVisual();
  }
}
