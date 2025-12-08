

import * as Phaser from 'phaser';
import { PLAYER_CONFIG, ATTACK_TYPES, AttackLevel, COOLDOWNS, ATTACK_STRENGTH_MAP, AttackStrength, GUARD_STAMINA_COSTS, PROJECTILE_TYPES, MOVEMENT_CONFIG } from '../config/gameConfig';
import { AttackEntity } from './AttackEntity';
import { GuardEntity } from './GuardEntity';
import { ProjectileEntity, ProjectileType } from './ProjectileEntity';
import { MovementEntity } from './MovementEntity';
import { DashEntity } from './DashEntity';
import { JumpEntity } from './JumpEntity';
import { ReadabilityGauge } from '../systems/ReadabilityGauge';
import { ActionIntentDisplay, MajorAction, MinorAction } from '../systems/ActionIntent';

export type AttackType = keyof typeof ATTACK_TYPES;
export type ProjectileAttackType = ProjectileType;
export type GuardType = 'high' | 'mid' | 'low' | 'highMid' | 'midLow' | 'all' | null;

export type FighterState = 'idle' | 'walking' | 'jumping' | 'attacking' | 'blocking' | 'hit' | 'defeated' | 'dodging';

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

// 性能値の型定義（数値形式: 25～150）
export interface CharacterStats {
  hp: number;           // 体力 (25 ~ 150)
  attack: number;       // 攻撃力 (25 ~ 150)
  attackSpeed: number;  // 攻撃速度 (25 ~ 150)
  defense: number;      // 防御 (25 ~ 150)
  specialAttack: number; // 特攻 (25 ~ 150)
  specialDefense: number; // 特防 (25 ~ 150)
  speed: number;        // 速度 (25 ~ 150)
}

// 数値を補正値に変換するヘルパー関数（100を基準に0.25～1.5倍）
function statToMultiplier(stat: number): number {
  // 25 → 0.25, 100 → 1.0, 150 → 1.5
  return stat / 100;
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
  public isAIControlled: boolean; // AI制御かどうか
  public currentAttack: AttackType | null;
  public lastAttackTime: number;
  private canMove: boolean;
  public isInHitstun: boolean; // ヒットストップ中かどうか
  private lastGuardStaminaDrain: number; // ガードスタミナ消費用
  private hurtboxVisual: Phaser.GameObjects.Rectangle | null; // 当たり判定の可視化
  private lastSpecialMeterGain: number; // 必殺技ゲージの時間増加用
  public isDodging: boolean; // 回避アクション中かどうか
  public currentDodgeType: AttackLevel | null; // 回避できる攻撃タイプ
  private dodgeStartX: number; // 回避開始時のX座標
  private dodgeTargetX: number; // 回避目標X座標

  // 移動エンティティ管理
  public currentMovement: MovementEntity | null; // 現在の移動アクション
  public isDashing: boolean; // ダッシュ中かどうか
  public isJumping: boolean; // ジャンプ中かどうか
  private dashCooldown: number; // ダッシュのクールタイム
  public landingLag: number; // 着地硬直時間（ミリ秒）
  public landingLagEndTime: number; // 着地硬直終了時刻
  public selectedJumpHeight: 'small' | 'medium' | 'large'; // 選択されたジャンプの高さ
  private lastJumpDirection: number; // ジャンプ時の最後の入力方向

  // クールタイム管理（攻撃のみ）
  public cooldowns: Record<AttackStrength, number>;

  // 性能値補正
  public stats: CharacterStats;

  // 読みゲージと行動意図表示
  public readabilityGauge: ReadabilityGauge;
  public actionIntent: ActionIntentDisplay;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    controls: FighterControls,
    playerNumber: number,
    stats?: CharacterStats
  ) {
    super(scene, x, y, texture);

    this.playerNumber = playerNumber;

    // 性能値を設定（デフォルトは100）
    this.stats = stats || {
      hp: 100,
      attack: 100,
      attackSpeed: 100,
      defense: 100,
      specialAttack: 100,
      specialDefense: 100,
      speed: 100,
    };

    // console.log(`[Fighter] Player${playerNumber} 性能値:`, this.stats);

    // HP補正を適用（数値を倍率に変換）
    this.maxHealth = PLAYER_CONFIG.maxHealth * statToMultiplier(this.stats.hp);
    this.health = this.maxHealth;
    // console.log(`[Fighter] Player${playerNumber} maxHealth: ${this.maxHealth} (基準値: ${PLAYER_CONFIG.maxHealth}, 補正: ${statToMultiplier(this.stats.hp)}x)`);
    this.guardStamina = PLAYER_CONFIG.maxGuardStamina;
    this.maxGuardStamina = PLAYER_CONFIG.maxGuardStamina;
    this.state = 'idle';
    this.facingRight = playerNumber === 1;
    this.isAttacking = false;
    this.isBlocking = false;
    this.isAIControlled = false; // デフォルトは人間プレイヤー
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
    this.isDodging = false;
    this.currentDodgeType = null;
    this.dodgeStartX = 0;
    this.dodgeTargetX = 0;

    // 移動エンティティを初期化
    this.currentMovement = null;
    this.isDashing = false;
    this.isJumping = false;
    this.dashCooldown = 0;
    this.landingLag = 0;
    this.landingLagEndTime = 0;
    this.selectedJumpHeight = 'large'; // デフォルトは大ジャンプ
    this.lastJumpDirection = 0;

    // 読みゲージと行動意図を初期化
    this.readabilityGauge = new ReadabilityGauge();
    this.actionIntent = new ActionIntentDisplay();

    // クールタイムを初期化（攻撃と回避）
    this.cooldowns = {
      light: 0,
      medium: 0,
      heavy: 0,
      special: 0,
      dodge: 0,
    };

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setBounce(0);

    // スケールを先に適用
    this.setScale(2);

    // 物理ボディを即座に設定
    this.setupPhysicsBody();

    // 当たり判定の可視化を作成
    this.createHurtboxVisual();
  }

  /**
   * 物理ボディのセットアップ（テクスチャロード後に実行）
   */
  private setupPhysicsBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // 元のスプライトサイズで設定（Phaserが自動的にスケールを適用）
      this.setBodySize(32, 54, true);
      body.setImmovable(false);
      body.setMass(1);
      body.pushable = true; // 押し合いを有効化
      // console.log(`[Fighter setupPhysicsBody] Player${this.playerNumber} ボディサイズ: width=${body.width}, height=${body.height}`);
    }
  }

  update(cursors: Map<string, Phaser.Input.Keyboard.Key>): void {
    if (!this.canMove || this.state === 'defeated') return;

    // クールタイムを減少
    this.updateCooldowns();

    // ダッシュクールタイムを減少
    this.updateDashCooldown();

    // 移動エンティティの更新
    this.updateMovement();

    // ガードスタミナの自然回復
    this.regenerateGuardStamina();

    // 必殺技ゲージの時間経過による増加
    this.regenerateSpecialMeter();

    // 読みゲージの回復（行動していない場合）
    // 60fps想定で約16.67ms
    const deltaTime = 1000 / 60;
    if (!this.isAttacking && !this.isJumping && !this.isDashing && !this.isBlocking) {
      this.readabilityGauge.recover(deltaTime);
    }

    // AI制御の場合、ここで入力処理を終了（クールタイムやスタミナ回復は上で完了済み）
    if (this.isAIControlled) {
      return;
    }

    const onGround = (this.body as Phaser.Physics.Arcade.Body).touching.down;

    // ヒットストップ中、攻撃中、回避中は入力を受け付けない（ノックバックは維持）
    if (this.isInHitstun || this.isAttacking || this.isDodging) {
      // ヒットストップ中はノックバックを維持するため、速度をリセットしない
      // 攻撃中・回避中は別処理で制御
      if (this.isAttacking && !this.isDodging) {
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
    // ダッシュ中は攻撃を受け付けない
    if (!this.isDashing) {
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
    }

    // ダッシュ入力（左右キー2度押し、またはShift+方向キー）
    // 簡易実装: Shift + 方向キーでダッシュ
    const shiftKey = cursors.get('SHIFT');
    const isDashInput = shiftKey?.isDown;

    // 着地硬直中は行動不能
    if (Date.now() < this.landingLagEndTime) {
      return; // 着地硬直中は何もできない
    }

    // ジャンプ入力（Phaserの標準的な方法：キーが押されている間に判定）
    // ガード中はジャンプできない
    if (Phaser.Input.Keyboard.JustDown(upKey as Phaser.Input.Keyboard.Key) && onGround && !this.isBlocking) {
      // ジャンプキーを押した瞬間に、左右の入力を確認
      let jumpDirection = 0;
      if (leftKey?.isDown) {
        jumpDirection = -1;
      } else if (rightKey?.isDown) {
        jumpDirection = 1;
      }

      // ジャンプの高さは選択されたものを使用
      const jumpHeight = this.selectedJumpHeight;

      console.log(`[Input] ジャンプ実行: ${jumpHeight}, 方向=${jumpDirection === 0 ? '垂直' : jumpDirection > 0 ? '右' : '左'}`);

      // 通常ジャンプを実行
      this.performNormalJump(jumpHeight, jumpDirection);
    }

    // 空中制御を無効化（放物線軌道を維持するため）
    // 角度付きジャンプは初期速度のまま横方向に等速移動し、縦方向のみ重力の影響を受けて放物線を描く

    // 地上移動（ダッシュ or 通常移動）
    // ジャンプ中は横方向の速度を変更しない（放物線軌道を維持）
    if (onGround && !this.isAttacking && !this.isDodging && !this.isJumping && !this.isBlocking) {
      if (leftKey?.isDown) {
        if (isDashInput && !this.isDashing) {
          // ダッシュ開始
          this.performDash(-1);
        } else if (!this.isDashing) {
          // 通常移動（速度補正を適用）
          const speed = MOVEMENT_CONFIG.walkSpeed * statToMultiplier(this.stats.speed);
          this.setVelocityX(-speed);
          // console.log(`[Fighter] Player${this.playerNumber} 移動速度: ${speed.toFixed(1)} (基準:${MOVEMENT_CONFIG.walkSpeed}, 速度値:${this.stats.speed}, 倍率:${statToMultiplier(this.stats.speed)}x)`);
          this.facingRight = false;
          this.setFlipX(true);
          this.state = 'walking';
        }
      } else if (rightKey?.isDown) {
        if (isDashInput && !this.isDashing) {
          // ダッシュ開始
          this.performDash(1);
        } else if (!this.isDashing) {
          // 通常移動（速度補正を適用）
          const speed = MOVEMENT_CONFIG.walkSpeed * statToMultiplier(this.stats.speed);
          this.setVelocityX(speed);
          // console.log(`[Fighter] Player${this.playerNumber} 移動速度: ${speed.toFixed(1)} (基準:${MOVEMENT_CONFIG.walkSpeed}, 速度値:${this.stats.speed}, 倍率:${statToMultiplier(this.stats.speed)}x)`);
          this.facingRight = true;
          this.setFlipX(false);
          this.state = 'walking';
        }
      } else if (!this.isDashing) {
        // キー入力なし & ダッシュ中でなければ停止
        this.setVelocityX(0);
        this.state = 'idle';
      }
    }

    // 空中状態の更新
    if (!onGround && this.state !== 'attacking' && this.state !== 'dodging') {
      this.state = 'jumping';
    }
  }

  // 旧互換性のため残す
  jump(): void {
    this.performNormalJump();
  }

  // ダッシュクールタイムの更新
  private updateDashCooldown(): void {
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - (1000 / 60));
    }
  }

  // 移動エンティティの更新
  private updateMovement(): void {
    if (this.currentMovement) {
      const isFinished = this.currentMovement.update();

      if (isFinished) {
        // 移動終了
        const movementType = this.currentMovement.movementType;
        this.currentMovement = null;

        if (movementType === 'dash') {
          this.isDashing = false;
        } else if (movementType === 'jump' || movementType === 'dashJump') {
          this.isJumping = false;
        }
      }
    }
  }

  // ダッシュを実行
  performDash(direction: number): boolean {
    // ダッシュクールタイムチェック
    if (this.dashCooldown > 0) {
      // console.log(`[Dash] クールタイム中: ${(this.dashCooldown / 1000).toFixed(1)}秒`);
      return false;
    }

    // スタミナチェック
    if (this.guardStamina < PLAYER_CONFIG.dashStaminaCost) {
      // console.log(`[Dash] スタミナ不足: ${this.guardStamina.toFixed(1)}/${PLAYER_CONFIG.dashStaminaCost}`);
      return false;
    }

    // 地上でのみダッシュ可能
    const onGround = (this.body as Phaser.Physics.Arcade.Body).touching.down;
    if (!onGround) {
      return false;
    }

    // スタミナ消費
    this.guardStamina = Math.max(0, this.guardStamina - PLAYER_CONFIG.dashStaminaCost);
    // console.log(`[Dash] スタミナ消費: -${PLAYER_CONFIG.dashStaminaCost} (残り: ${this.guardStamina.toFixed(1)})`);

    // 行動意図を設定（AIの場合のみ）
    if (this.isAIControlled) {
      this.setDashIntent(direction);
    }

    // 既存の移動エンティティを終了
    if (this.currentMovement) {
      this.currentMovement.terminate();
    }

    // ダッシュエンティティを生成
    this.currentMovement = new DashEntity(this.scene, this, direction);
    this.isDashing = true;
    this.dashCooldown = MOVEMENT_CONFIG.dashCooldown;

    // 向きを更新
    if (direction > 0) {
      this.facingRight = true;
      this.setFlipX(false);
    } else {
      this.facingRight = false;
      this.setFlipX(true);
    }

    return true;
  }

  // 通常ジャンプを実行
  performNormalJump(jumpHeight?: 'small' | 'medium' | 'large', inputDirection: number = 0): boolean {
    const onGround = (this.body as Phaser.Physics.Arcade.Body).touching.down;
    if (!onGround) {
      return false;
    }

    // スタミナチェック
    if (this.guardStamina < PLAYER_CONFIG.jumpStaminaCost) {
      // console.log(`[Jump] スタミナ不足: ${this.guardStamina.toFixed(1)}/${PLAYER_CONFIG.jumpStaminaCost}`);
      return false;
    }

    // スタミナ消費
    this.guardStamina = Math.max(0, this.guardStamina - PLAYER_CONFIG.jumpStaminaCost);
    // console.log(`[Jump] スタミナ消費: -${PLAYER_CONFIG.jumpStaminaCost} (残り: ${this.guardStamina.toFixed(1)})`);

    // 既存のジャンプエンティティを終了
    if (this.currentMovement instanceof JumpEntity) {
      this.currentMovement.terminate();
    }

    // ジャンプの高さを決定（指定がなければ選択された高さを使用）
    const height = jumpHeight || this.selectedJumpHeight;

    // 行動意図を設定（AIの場合のみ）
    if (this.isAIControlled) {
      this.setJumpIntent(height, inputDirection);
    }

    // ジャンプフラグを先に立てる（JumpEntity生成前に、FootworkEntityの干渉を防ぐ）
    this.isJumping = true;
    this.state = 'jumping';

    // 通常ジャンプエンティティを生成（入力方向を渡す）
    this.currentMovement = new JumpEntity(this.scene, this, height, inputDirection);
    this.play(`${this.texture.key}_jump`, true);

    return true;
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
  public isCooldownReady(type: AttackStrength | 'dash'): boolean {
    if (type === 'dash') {
      return this.dashCooldown <= 0;
    }
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

    // 攻撃中またはガード中は新しい攻撃を出せない
    if (this.isAttacking || this.isBlocking) {
      return;
    }

    // クールタイムチェック
    if (!this.isCooldownReady(attackStrength)) {
      const _remainingTime = (this.cooldowns[attackStrength] / 1000).toFixed(1);
      // console.log(`${attackStrength}攻撃はクールタイム中！ あと${_remainingTime}秒`);
      return;
    }

    // 超必殺技はゲージチェックとゲージ消費
    if (attackType === 'superSpecial') {
      if (this.specialMeter < 100) {
        return;
      }
      this.specialMeter = 0;  // ゲージを全消費
    }
    // 通常必殺技（specialHighMid, specialMidLow）はクールタイムのみで使用可能

    // 行動意図を設定（AIの場合のみ）
    if (this.isAIControlled) {
      this.setAttackIntent(attackType);
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

      // 回避アクション中の移動処理
      if (this.isDodging && this.currentAttackEntity.phase === 'active') {
        // activeフレーム中に移動
        const attackData = ATTACK_TYPES[this.currentAttackEntity.attackType];
        const totalFrames = attackData.activeFrames;
        // moveDistanceプロパティは回避アクション専用
        const moveDistance = 'moveDistance' in attackData ? attackData.moveDistance : 0;
        const movePerFrame = moveDistance / totalFrames;
        const moveDirection = this.facingRight ? 1 : -1;

        // 毎フレーム少しずつ移動
        this.x += movePerFrame * moveDirection;
      }

      if (isFinished) {
        // 全フレーム終了したら攻撃要素を破棄
        if (this.currentAttackEntity.motionBody) {
          this.currentAttackEntity.motionBody.destroy();
        }
        if (this.currentAttackEntity.hitboxTip) {
          this.currentAttackEntity.hitboxTip.destroy();
        }
        this.currentAttackEntity.destroy();
        this.currentAttackEntity = null;
        this.attackHitbox = null;
        this.isAttacking = false;
        this.currentAttack = null;

        // 回避アクション終了処理
        if (this.isDodging) {
          this.isDodging = false;
          this.currentDodgeType = null;
          // console.log(`回避アクション終了: 最終位置 ${this.x}`);
        }

        if ((this.body as Phaser.Physics.Arcade.Body).touching.down) {
          this.state = 'idle';
        }
      }
    }
  }

  // 便利メソッド（後方互換性のため残すが、新しい攻撃タイプに対応）
  punch(): void { this.performAttack('lightMid'); }
  kick(): void { this.performAttack('mediumMid'); }
  specialAttack(): void {
    // ゲージ100の場合は超必殺技、それ以外はクールダウン必殺技（ランダムで上中or中下）
    if (this.specialMeter >= 100 && this.isCooldownReady('special')) {
      this.performAttack('superSpecial');
    } else if (this.isCooldownReady('special')) {
      // ランダムで上中または中下の必殺技を選択
      const specialTypes: AttackType[] = ['specialHighMid', 'specialMidLow'];
      const randomSpecial = specialTypes[Math.floor(Math.random() * specialTypes.length)];
      this.performAttack(randomSpecial);
    }
  }

  // 前転（上段攻撃回避・相手の背後に回り込む）
  performRoll(): boolean {
    // 回避中、攻撃中、空中ではできない
    const onGround = (this.body as Phaser.Physics.Arcade.Body).touching.down;
    if (this.isDodging || this.isAttacking || !onGround) {
      return false;
    }

    // クールタイムチェック
    if (!this.isCooldownReady('dodge')) {
      const _remainingTime = (this.cooldowns.dodge / 1000).toFixed(1);
      // console.log(`回避アクションはクールタイム中！ あと${_remainingTime}秒`);
      return false;
    }

    // スタミナチェック
    if (this.guardStamina < PLAYER_CONFIG.dodgeStaminaCost) {
      // console.log(`[Roll] スタミナ不足: ${this.guardStamina.toFixed(1)}/${PLAYER_CONFIG.dodgeStaminaCost}`);
      return false;
    }

    // スタミナ消費
    this.guardStamina = Math.max(0, this.guardStamina - PLAYER_CONFIG.dodgeStaminaCost);
    // console.log(`[Roll] スタミナ消費: -${PLAYER_CONFIG.dodgeStaminaCost} (残り: ${this.guardStamina.toFixed(1)})`);

    // クールタイム開始
    this.setCooldown('dodge');

    // 回避状態を設定
    this.isDodging = true;
    this.state = 'dodging';
    this.currentDodgeType = 'high'; // 上段攻撃を回避
    this.setVelocityX(0);

    // 移動開始・目標位置を計算
    const attackData = ATTACK_TYPES.roll;
    this.dodgeStartX = this.x;
    const moveDirection = this.facingRight ? 1 : -1;
    const moveDistance = 'moveDistance' in attackData ? attackData.moveDistance : 150;
    this.dodgeTargetX = this.x + (moveDistance * moveDirection);

    // console.log(`前転開始: ${this.dodgeStartX} → ${this.dodgeTargetX}`);

    // AttackEntityを生成（当たり判定縮小のため）
    this.currentAttackEntity = new AttackEntity(
      this.scene,
      this.x,
      this.y,
      'roll',
      this,
      this.facingRight
    );

    // 後方互換性のため attackHitbox も設定
    this.attackHitbox = this.currentAttackEntity;

    return true;
  }

  // ジャンプ避け（下段攻撃回避・相手の背後に回り込む）
  performJumpDodge(): boolean {
    // 回避中、攻撃中、空中ではできない
    const onGround = (this.body as Phaser.Physics.Arcade.Body).touching.down;
    if (this.isDodging || this.isAttacking || !onGround) {
      return false;
    }

    // クールタイムチェック
    if (!this.isCooldownReady('dodge')) {
      const _remainingTime = (this.cooldowns.dodge / 1000).toFixed(1);
      // console.log(`回避アクションはクールタイム中！ あと${_remainingTime}秒`);
      return false;
    }

    // スタミナチェック
    if (this.guardStamina < PLAYER_CONFIG.dodgeStaminaCost) {
      // console.log(`[JumpDodge] スタミナ不足: ${this.guardStamina.toFixed(1)}/${PLAYER_CONFIG.dodgeStaminaCost}`);
      return false;
    }

    // スタミナ消費
    this.guardStamina = Math.max(0, this.guardStamina - PLAYER_CONFIG.dodgeStaminaCost);
    // console.log(`[JumpDodge] スタミナ消費: -${PLAYER_CONFIG.dodgeStaminaCost} (残り: ${this.guardStamina.toFixed(1)})`);

    // クールタイム開始
    this.setCooldown('dodge');

    // 回避状態を設定
    this.isDodging = true;
    this.state = 'dodging';
    this.currentDodgeType = 'low'; // 下段攻撃を回避
    this.setVelocityX(0);

    // 移動開始・目標位置を計算
    const attackData = ATTACK_TYPES.jumpDodge;
    this.dodgeStartX = this.x;
    const moveDirection = this.facingRight ? 1 : -1;
    const moveDistance = 'moveDistance' in attackData ? attackData.moveDistance : 140;
    this.dodgeTargetX = this.x + (moveDistance * moveDirection);

    // console.log(`ジャンプ避け開始: ${this.dodgeStartX} → ${this.dodgeTargetX}`);

    // AttackEntityを生成（当たり判定縮小のため）
    this.currentAttackEntity = new AttackEntity(
      this.scene,
      this.x,
      this.y,
      'jumpDodge',
      this,
      this.facingRight
    );

    // 後方互換性のため attackHitbox も設定
    this.attackHitbox = this.currentAttackEntity;

    return true;
  }

  // 飛び道具発射（ゲージ消費 + 各クールタイムで性能変化）
  shootProjectile(): ProjectileEntity | null {
    // 攻撃中は発射できない
    if (this.isAttacking) {
      return null;
    }

    let projectileType: ProjectileType;
    let usedCooldown: AttackStrength | null = null;

    // 優先度: 超必殺技ゲージ > 必殺技 > 強 > 中 > 弱 > 基本
    if (this.specialMeter >= 100) {
      projectileType = 'projectileSuper';
      this.specialMeter = 0;
    } else if (this.specialMeter >= 20 && this.isCooldownReady('special')) {
      projectileType = 'projectileSpecial';
      this.specialMeter -= 20;
      usedCooldown = 'special';
    } else if (this.specialMeter >= 20 && this.isCooldownReady('heavy')) {
      projectileType = 'projectileHeavy';
      this.specialMeter -= 20;
      usedCooldown = 'heavy';
    } else if (this.specialMeter >= 20 && this.isCooldownReady('medium')) {
      projectileType = 'projectileMedium';
      this.specialMeter -= 20;
      usedCooldown = 'medium';
    } else if (this.specialMeter >= 20 && this.isCooldownReady('light')) {
      projectileType = 'projectileLight';
      this.specialMeter -= 20;
      usedCooldown = 'light';
    } else if (this.specialMeter >= 20) {
      projectileType = 'projectileBase';
      this.specialMeter -= 20;
    } else {
      // ゲージ不足
      return null;
    }

    // クールタイム消費
    if (usedCooldown) {
      this.setCooldown(usedCooldown);
    }

    // 飛び道具を生成
    const projectileData = PROJECTILE_TYPES[projectileType];
    const offsetX = this.facingRight ? 50 : -50;
    const projectile = new ProjectileEntity(
      this.scene,
      this.x + offsetX,
      this.y,
      projectileType,
      projectileData,
      this,
      this.facingRight
    );

    // console.log(`飛び道具発射: ${projectileData.name} (威力:${projectileData.damage}, 速度:${projectileData.speed})`);
    return projectile;
  }

  /**
   * 攻撃の行動意図を設定
   */
  private setAttackIntent(attackType: AttackType): void {
    let major: MajorAction = 'attack';
    let minor: MinorAction;

    // 攻撃タイプに応じて小項目を設定
    switch (attackType) {
      case 'high':
        minor = 'high-attack';
        break;
      case 'mid':
        minor = 'mid-attack';
        break;
      case 'low':
        minor = 'low-attack';
        break;
      case 'special1':
      case 'specialHighMid':
        minor = 'special1';
        break;
      case 'special2':
      case 'specialMidLow':
        minor = 'special2';
        break;
      case 'superSpecial':
        minor = 'super-special';
        break;
      case 'antiAir':
        minor = 'antiair-attack';
        break;
      case 'airAttackDown':
        minor = 'air-attack';
        break;
      default:
        minor = 'mid-attack';
    }

    this.actionIntent.setIntent(major, minor);
  }

  /**
   * ジャンプの行動意図を設定
   */
  private setJumpIntent(height: 'small' | 'medium' | 'large', direction: number): void {
    const major: MajorAction = 'jump';
    let minor: MinorAction;

    if (direction === 0) {
      minor = 'vertical-jump';
    } else if (direction > 0) {
      minor = 'forward-jump';
    } else {
      minor = 'back-jump';
    }

    // 高さも情報に含める
    const heightSuffix = height === 'small' ? '小' : height === 'medium' ? '中' : '大';

    this.actionIntent.setIntent(major, minor);
  }

  /**
   * ダッシュの行動意図を設定
   */
  private setDashIntent(direction: number): void {
    const major: MajorAction = 'dash';
    const minor: MinorAction = direction > 0 ? 'forward-dash' : 'backward-dash';

    this.actionIntent.setIntent(major, minor);
  }

  /**
   * ガードの行動意図を設定
   */
  private setGuardIntent(guardType: GuardType): void {
    const major: MajorAction = 'guard';
    let minor: MinorAction;

    switch (guardType) {
      case 'high':
        minor = 'high-guard';
        break;
      case 'mid':
        minor = 'mid-guard';
        break;
      case 'low':
        minor = 'low-guard';
        break;
      case 'highMid':
        minor = 'highmid-guard';
        break;
      case 'midLow':
        minor = 'midlow-guard';
        break;
      case 'all':
        minor = 'all-guard';
        break;
      default:
        minor = 'mid-guard';
    }

    this.actionIntent.setIntent(major, minor);
  }

  /**
   * 攻撃を受けた際に読みゲージを消費
   * @param attackerIntent 攻撃者の行動意図
   */
  public consumeGaugeOnHit(attackerIntent: { major: string; minor: string }): void {
    // 攻撃者の行動意図に基づいてゲージを消費
    const actionKey = `${attackerIntent.major}-${attackerIntent.minor}`;
    this.readabilityGauge.consumeGauge(actionKey);
  }

  block(guardType: GuardType = 'mid'): void {
    // guardTypeがnullの場合は処理しない
    if (!guardType) return;

    // ガード開始時のスタミナチェック
    if (!this.isBlocking) {
      // 最低限のスタミナがないとガードできない
      if (this.guardStamina < 5) {
        // console.log(`ガードスタミナ不足！`);
        return;
      }
      this.lastGuardStaminaDrain = Date.now();
    } else {
      // ガード継続中のスタミナ消費（防御補正を適用）
      const now = Date.now();
      const timeSinceLastDrain = (now - this.lastGuardStaminaDrain) / 1000; // 秒単位

      if (timeSinceLastDrain >= 0.05) { // 50msごとにチェック
        // 防御補正を適用（値が高いほどスタミナ消費が少ない）
        const defensiveMultiplier = 1.0 / statToMultiplier(this.stats.defense);
        const drainAmount = GUARD_STAMINA_COSTS[guardType] * timeSinceLastDrain * defensiveMultiplier;

        if (this.guardStamina < drainAmount) {
          // スタミナ切れでガード解除
          // console.log('ガードスタミナ切れ！');
          this.stopBlocking();
          return;
        }

        this.guardStamina = Math.max(0, this.guardStamina - drainAmount);
        this.lastGuardStaminaDrain = now;
      }
    }

    // 行動意図を設定（AIの場合のみ、ガード開始時のみ）
    if (this.isAIControlled && !this.isBlocking) {
      this.setGuardIntent(guardType);
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
        console.log(`[Guard] P${this.playerNumber} ガード変更: ${this.currentGuardEntity.guardType} → ${guardType}`);
        this.currentGuardEntity.destroy();
      } else {
        console.log(`[Guard] P${this.playerNumber} 新規ガード作成: ${guardType}`);
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
    // 回避中の判定：特定の攻撃レベルを無効化
    if (this.isDodging && this.currentDodgeType && attackLevel) {
      // 前転（currentDodgeType='high'）は上段攻撃を回避
      // ジャンプ避け（currentDodgeType='low'）は下段攻撃を回避
      let dodgeSuccess = false;

      if (this.currentDodgeType === 'high' && (attackLevel === 'high' || attackLevel === 'highMid' || attackLevel === 'all')) {
        // 前転中：上段、上中、全レーン攻撃を回避
        dodgeSuccess = true;
        // console.log(`前転で${attackLevel}攻撃を回避！`);
      } else if (this.currentDodgeType === 'low' && (attackLevel === 'low' || attackLevel === 'midLow' || attackLevel === 'all')) {
        // ジャンプ避け中：下段、中下、全レーン攻撃を回避
        dodgeSuccess = true;
        // console.log(`ジャンプ避けで${attackLevel}攻撃を回避！`);
      }

      if (dodgeSuccess) {
        // 回避成功：ダメージなし、ノックバックなし
        return;
      }
      // 回避できない攻撃レベルの場合は通常通りダメージ処理へ
      // console.log(`回避失敗：${this.currentDodgeType}回避中だが${attackLevel}攻撃は防げない`);
    }

    // ガード判定は物理エンジンで行うため、ここでは削除
    // FightScene.tsで既にガード成功/失敗が判定され、適切なダメージ・ノックバックが渡される

    this.health = Math.max(0, this.health - damage);

    // 削りダメージかどうかを判定（ダメージが元の10%程度なら削りダメージ = ガード成功）
    const isChipDamage = damage <= 3; // 削りダメージは通常3以下

    if (!isChipDamage) {
      // 通常ヒット時
      this.state = 'hit';
      this.isInHitstun = true; // ヒットストップ開始
      this.play(`${this.texture.key}_hit`, true);

      // ノックバック（速度ベースで実装）
      // console.log(`ヒット！ knockback velocity: ${knockback}, damage: ${damage}`);

      // ダメージに応じてヒットストップ時間を調整
      const hitStopTime = Math.min(400, 150 + damage * 8);
      // console.log(`ヒットストップ時間: ${hitStopTime}ms`);

      // ノックバックを即座に適用し、継続的に維持
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(knockback);
      body.setAllowGravity(true);
      // console.log(`実際の速度: ${body.velocity.x}`);

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
      // console.log(`ガード knockback velocity: ${knockback}`);
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
      // console.log(`必殺技ゲージ増加: +${meterGain} (現在: ${this.specialMeter})`);
    }
  }

  defeat(): void {
    this.state = 'defeated';
    this.canMove = false;
    this.setVelocityX(0);
    this.play(`${this.texture.key}_defeat`, true);

    // ダウン演出: 後ろに倒れる
    this.performKnockoutAnimation();
  }

  /**
   * ノックアウト時のダウンアニメーション
   */
  private performKnockoutAnimation(): void {
    const knockbackDirection = this.facingRight ? -1 : 1; // 向いている方向の逆に飛ぶ
    const knockbackForce = 150;

    // 後ろに吹っ飛ぶ
    this.setVelocityX(knockbackDirection * knockbackForce);
    this.setVelocityY(-200); // 少し浮く

    // 回転しながら倒れる演出
    const rotationDirection = knockbackDirection > 0 ? 1 : -1;
    this.scene.tweens.add({
      targets: this,
      angle: rotationDirection * 90, // 90度回転して倒れる
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        // 回転完了後、物理ボディも回転させる（幅と高さを入れ替え）
        const body = this.body as Phaser.Physics.Arcade.Body;
        if (body) {
          const originalWidth = body.width;
          const originalHeight = body.height;

          // 90度回転した状態のボディサイズ（幅と高さを入れ替え）
          body.setSize(originalHeight, originalWidth);

          // オフセットも調整（中心を維持）
          const offsetX = (originalWidth - originalHeight) / 2;
          const offsetY = (originalHeight - originalWidth) / 2;
          body.setOffset(offsetX, offsetY);

          // console.log(`[Fighter] Player${this.playerNumber} 物理ボディ回転: ${originalWidth}x${originalHeight} → ${originalHeight}x${originalWidth}`);
        }
      }
    });

    // 地面に落ちたら停止
    const checkLanding = () => {
      const body = this.body as Phaser.Physics.Arcade.Body;
      if (body.touching.down) {
        // 速度を0に
        this.setVelocityX(0);
        this.setVelocityY(0);
        // console.log(`[Fighter] Player${this.playerNumber} ノックアウト - ダウン完了`);
      } else {
        this.scene.time.delayedCall(16, checkLanding);
      }
    };

    this.scene.time.delayedCall(16, checkLanding);
  }

  // ガード要素の更新（FightSceneから呼ばれる）
  updateGuard(): void {
    if (this.currentGuardEntity) {
      this.currentGuardEntity.update();
    }

    // ガード中は移動を完全に停止
    if (this.isBlocking) {
      this.setVelocityX(0);
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
    this.setAngle(0); // 回転角度をリセット
    this.health = this.maxHealth;
    this.guardStamina = this.maxGuardStamina;
    this.specialMeter = 0;
    this.state = 'idle';
    this.canMove = true;
    this.isAttacking = false;
    this.isBlocking = false;
    this.isInHitstun = false;
    this.isDodging = false;
    this.isDashing = false;
    this.isJumping = false;
    this.currentGuardType = null;
    this.currentDodgeType = null;
    this.lastGuardStaminaDrain = 0;
    this.lastSpecialMeterGain = Date.now();
    this.dodgeStartX = 0;
    this.dodgeTargetX = 0;
    this.dashCooldown = 0;
    this.setVelocity(0, 0);

    // 当たり判定のサイズを再設定（コンストラクタと同じ設定）
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // console.log(`[Fighter Reset] Player${this.playerNumber} ボディサイズ(リセット前): width=${body.width}, height=${body.height}`);
      // 元のスプライトサイズで設定（Phaserが自動的にスケールを適用）
      this.setBodySize(32, 54, true);
      // console.log(`[Fighter Reset] Player${this.playerNumber} ボディサイズ(リセット後): width=${body.width}, height=${body.height}`);
    }

    // 移動エンティティをクリーンアップ
    if (this.currentMovement) {
      this.currentMovement.terminate();
      this.currentMovement = null;
    }

    // クールタイムをリセット（攻撃と回避）
    this.cooldowns = {
      light: 0,
      medium: 0,
      heavy: 0,
      special: 0,
      dodge: 0,
    };

    // 攻撃要素をクリーンアップ
    if (this.currentAttackEntity) {
      if (this.currentAttackEntity.motionBody) {
        this.currentAttackEntity.motionBody.destroy();
      }
      if (this.currentAttackEntity.hitboxTip) {
        this.currentAttackEntity.hitboxTip.destroy();
      }
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

  /**
   * ステータス（性能値）をリアルタイム更新
   * UIからの変更を即座に反映
   */
  public updateStats(newStats: CharacterStats): void {
    // 最大体力の変更（現在体力の割合を維持）
    const healthRatio = this.health / this.maxHealth;
    const oldMaxHealth = this.maxHealth;
    this.maxHealth = PLAYER_CONFIG.maxHealth * statToMultiplier(newStats.hp);

    // 体力を割合維持して更新（ただし最大値は超えない）
    this.health = Math.min(this.maxHealth * healthRatio, this.maxHealth);

    // デバッグログ（最大体力が変更された場合のみ）
    if (oldMaxHealth !== this.maxHealth) {
      console.log(`[Fighter P${this.playerNumber}] HP更新: ${oldMaxHealth.toFixed(1)} → ${this.maxHealth.toFixed(1)} (現在: ${this.health.toFixed(1)})`);
    }

    // ステータスを更新
    this.stats = { ...newStats };
  }
}
