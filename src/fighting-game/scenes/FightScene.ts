import * as Phaser from 'phaser';
import { Fighter } from '../entities/Fighter';
import { InputSystem } from '../systems/InputSystem';
import { UISystem } from '../systems/UISystem';
import { AIController } from '../systems/AIController';
import { ProjectileEntity } from '../entities/ProjectileEntity';
import { CONTROLS, GAME_STATES, ATTACK_TYPES, ATTACK_STRENGTH_MAP } from '../config/gameConfig';
import { ActionExecutor } from '../systems/ActionExecutor';
import { registerAllActions } from '../actions/ActionRegistry';

type GameState = typeof GAME_STATES[keyof typeof GAME_STATES];

export class FightScene extends Phaser.Scene {
  // プレイヤーエンティティ
  private player1!: Fighter;  // プレイヤー1（左側・緑）
  private player2!: Fighter;  // プレイヤー2（右側・赤）

  // システム
  private inputSystem!: InputSystem;  // キー入力管理
  private uiSystem!: UISystem;  // UI表示管理（体力バー、必殺技ゲージなど）
  private ai1!: AIController;  // プレイヤー1のAI制御
  private ai2!: AIController;  // プレイヤー2のAI制御

  // ゲーム状態
  private gameState: GameState;  // 現在のゲーム状態（READY, FIGHTING, ROUND_END, GAME_OVER）
  private currentRound: number;  // 現在のラウンド番号
  private player1Wins: number;  // プレイヤー1の勝利数
  private player2Wins: number;  // プレイヤー2の勝利数

  // 環境オブジェクト
  private ground!: Phaser.GameObjects.Rectangle;  // 地面（静的な物理オブジェクト）

  // モード設定
  private isAIMode: boolean;  // AI対AI自動対戦モード（true = AI同士、false = 手動操作可能）

  // 飛び道具管理
  private projectiles: ProjectileEntity[] = [];  // 発射された全飛び道具の配列

  // アクション実行システム（Command Pattern実装）
  public actionExecutor!: ActionExecutor;  // 全アクション（攻撃・移動・防御）を統括管理

  // 行動意図表示UI（読みゲージシステム）
  private player1IntentText!: Phaser.GameObjects.Text;  // P1の行動意図テキスト
  private player2IntentText!: Phaser.GameObjects.Text;  // P2の行動意図テキスト
  private player1GaugeBar!: Phaser.GameObjects.Rectangle;  // P1の読みゲージバー
  private player2GaugeBar!: Phaser.GameObjects.Rectangle;  // P2の読みゲージバー
  private _player1GaugeBackground!: Phaser.GameObjects.Rectangle;  // P1ゲージ背景（表示のみ）
  private _player2GaugeBackground!: Phaser.GameObjects.Rectangle;  // P2ゲージ背景（表示のみ）

  constructor() {
    super({ key: 'FightScene' });
    // 初期ゲーム状態の設定
    this.gameState = GAME_STATES.READY;  // ラウンド開始前の準備状態
    this.currentRound = 1;  // 第1ラウンドから開始
    this.player1Wins = 0;  // 勝利数リセット
    this.player2Wins = 0;  // 勝利数リセット
    this.isAIMode = true;  // AI対AI自動対戦モード（falseで手動操作可能）
  }

  /**
   * プレイヤー設定を取得（window.getPlayerConfigsまたはデフォルト値）
   * 設定の読み込みを一元管理（常に最新の値を取得）
   */
  private getPlayerConfigs() {
    // window.getPlayerConfigs関数が存在すれば実行（React側の最新値を取得）
    if (typeof window !== 'undefined' && window.getPlayerConfigs) {
      return window.getPlayerConfigs();
    }

    // デフォルト設定を返す（スタンドアロン動作時）
    return {
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
    // 背景色設定（空色）
    this.cameras.main.setBackgroundColor('#87CEEB');

    // 地面の作成（画面下部の緑の矩形）
    this.ground = this.add.rectangle(
      this.cameras.main.width / 2,  // X座標: 画面中央
      this.cameras.main.height - 50,  // Y座標: 画面下部から50px上
      this.cameras.main.width,  // 幅: 画面全体
      100,  // 高さ: 100px
      0x228B22  // 色: 緑
    );
    this.physics.add.existing(this.ground, true);  // 物理エンジンに静的オブジェクトとして追加

    // アクション実行システムの初期化（Command Pattern）
    this.actionExecutor = new ActionExecutor();  // アクション実行エンジン作成
    registerAllActions(this.actionExecutor);  // 全26個のアクション（攻撃12 + 移動8 + 防御6）を登録
    console.log(`[FightScene] ActionExecutor initialized with ${this.actionExecutor.getRegisteredActionNames().length} actions`);

    // 入力システムの初期化
    this.inputSystem = new InputSystem(this);  // キーボード入力管理システム
    this.inputSystem.registerControls([CONTROLS.player1, CONTROLS.player2]);  // 両プレイヤーのキー設定登録

    // プレイヤー設定の読み込み（一元管理された関数から取得）
    const playerConfigs = this.getPlayerConfigs();

    // プレイヤー1の生成（左側スタート）
    this.player1 = new Fighter(
      this,  // シーンインスタンス
      200,  // 初期X座標（左寄り）
      this.cameras.main.height - 200,  // 初期Y座標
      'player1',  // テクスチャキー
      CONTROLS.player1,  // 操作キー設定
      1,  // プレイヤー番号
      playerConfigs.player1.stats  // ステータス
    );

    // プレイヤー2の生成（右側スタート）
    this.player2 = new Fighter(
      this,
      this.cameras.main.width - 200,  // 初期X座標（右寄り）
      this.cameras.main.height - 200,
      'player2',
      CONTROLS.player2,
      2,
      playerConfigs.player2.stats
    );

    // 物理衝突判定の設定
    this.physics.add.collider(this.player1, this.ground);  // P1と地面
    this.physics.add.collider(this.player2, this.ground);  // P2と地面
    this.physics.add.collider(this.player1, this.player2);  // P1とP2の押し合い

    // 攻撃判定は毎フレームupdate()内で動的にチェック
    // （AttackEntityが動的に生成・破棄されるため、ここでは設定しない）

    // 初回のボディサイズを強制的に設定（テクスチャロード後に確実に適用）
    this.time.delayedCall(10, () => {
      const _body1 = this.player1.body as Phaser.Physics.Arcade.Body;
      const _body2 = this.player2.body as Phaser.Physics.Arcade.Body;
      if (_body1 && _body2) {
        this.player1.setBodySize(32, 54, true);  // キャラクター当たり判定サイズ
        this.player2.setBodySize(32, 54, true);
      }
    });

    // UIシステムの初期化（体力バー、ゲージ、タイマーなど）
    this.uiSystem = new UISystem(this);

    // AIコントローラーの初期化
    if (this.isAIMode) {
      // AIモードの場合、両キャラクターをAI制御に設定
      this.player1.isAIControlled = true;
      this.player2.isAIControlled = true;

      // AI1: player1を制御、player2を対戦相手として認識
      this.ai1 = new AIController(this.player1, this.player2, this, 'medium', playerConfigs.player1.aiCustomization);
      // AI2: player2を制御、player1を対戦相手として認識
      this.ai2 = new AIController(this.player2, this.player1, this, 'medium', playerConfigs.player2.aiCustomization);
    }

    this.createAnimations();  // アニメーション定義作成
    this.createIntentUI();  // 行動意図表示UIの作成

    // UI設定変更イベントのリスナー登録
    this.setupConfigUpdateListener();

    this.startRound();  // ラウンド開始
  }

  /**
   * UI設定変更イベントのリスナーを登録
   * React側から設定変更が通知されたらリアルタイム反映
   */
  private setupConfigUpdateListener(): void {
    if (typeof window === 'undefined') return;

    // カスタムイベントリスナー
    const handleConfigUpdate = () => {
      const configs = this.getPlayerConfigs();

      // ステータス更新
      this.player1.updateStats(configs.player1.stats);
      this.player2.updateStats(configs.player2.stats);

      // AIカスタマイズ更新
      if (this.ai1) {
        this.ai1.updateCustomization(configs.player1.aiCustomization);
      }
      if (this.ai2) {
        this.ai2.updateCustomization(configs.player2.aiCustomization);
      }

      console.log('[FightScene] 設定をリアルタイム反映しました');
    };

    window.addEventListener('playerConfigsUpdated', handleConfigUpdate);

    // クリーンアップ用（シーン破棄時）
    this.events.on('shutdown', () => {
      window.removeEventListener('playerConfigsUpdated', handleConfigUpdate);
    });
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

  /**
   * 行動意図表示UIの初期化
   */
  private createIntentUI(): void {
    const screenWidth = this.cameras.main.width;

    // Player1の読みゲージ（左上）
    this._player1GaugeBackground = this.add.rectangle(20, 180, 120, 12, 0x333333).setOrigin(0, 0).setDepth(1000);
    this.player1GaugeBar = this.add.rectangle(20, 180, 120, 12, 0x00ff00).setOrigin(0, 0).setDepth(1001);

    // Player1の表示（ゲージの下）
    this.player1IntentText = this.add.text(20, 198, '', {
      fontSize: '14px',
      color: '#00ff00',
      fontStyle: 'bold',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setDepth(1000);

    // Player2の読みゲージ（右上）
    this._player2GaugeBackground = this.add.rectangle(screenWidth - 140, 180, 120, 12, 0x333333).setOrigin(0, 0).setDepth(1000);
    this.player2GaugeBar = this.add.rectangle(screenWidth - 140, 180, 120, 12, 0xff0000).setOrigin(0, 0).setDepth(1001);

    // Player2の表示（ゲージの下）
    this.player2IntentText = this.add.text(screenWidth - 20, 198, '', {
      fontSize: '14px',
      color: '#ff0000',
      fontStyle: 'bold',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setOrigin(1, 0).setDepth(1000);
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
          // マッチ終了イベントを発火してキャラクター選択画面に戻る
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('matchEnd'));
          }
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
    // FIGHTING状態以外では更新処理をスキップ
    if (this.gameState !== GAME_STATES.FIGHTING) return;

    // キー入力状態の取得
    const keys = this.inputSystem.getKeys();

    // AIモードの場合、AIコントローラーを更新
    if (this.isAIMode) {
      this.ai1.update(time, keys);  // AI1の行動決定・実行
      this.ai2.update(time, keys);  // AI2の行動決定・実行
    }

    // Fighterの状態更新（クールタイム、スタミナ回復など）
    // AI制御の場合、Fighter内部で入力処理はスキップされる
    this.player1.update(keys);
    this.player2.update(keys);

    // 攻撃エンティティのフレーム更新（startup→active→recoveryのフェーズ管理）
    this.player1.updateAttack();
    this.player2.updateAttack();

    // ガードエンティティの更新
    this.player1.updateGuard();
    this.player2.updateGuard();

    // ハートボックス（やられ判定）の可視化更新
    this.player1.updateHurtbox();
    this.player2.updateHurtbox();

    // 攻撃ヒット判定チェック
    this.checkAttackCollisions();

    // 飛び道具の移動・寿命管理と衝突判定
    this.updateProjectiles();
    this.checkProjectileCollisions();

    // UIの更新（体力、必殺技ゲージ、ガードスタミナ、クールダウン）
    this.uiSystem.updateHealthBars(this.player1, this.player2);
    this.uiSystem.updateSpecialBars(this.player1, this.player2);
    this.uiSystem.updateGuardStaminaBars(this.player1, this.player2);
    this.uiSystem.updateCooldownBars(this.player1, this.player2);

    // KO判定
    if (this.player1.health <= 0 || this.player2.health <= 0) {
      this.uiSystem.stopTimer();
      const winner = this.player1.health > 0 ? 1 : 2;
      this.handleRoundEnd(winner);
    }

    // キャラクターの向き自動更新（常に相手の方を向く）
    this.player1.facingRight = this.player1.x < this.player2.x;
    this.player2.facingRight = this.player2.x < this.player1.x;
    this.player1.setFlipX(!this.player1.facingRight);  // スプライトの反転
    this.player2.setFlipX(!this.player2.facingRight);

    // 行動意図UI（読みゲージ・意図テキスト）の更新
    this.updateIntentUI();

    // キャラクター同士の重なり防止処理
    this.preventCharacterOverlap();
  }

  /**
   * 行動意図UIの更新（読みゲージシステム）
   */
  private updateIntentUI(): void {
    // Player1の行動意図を表示（Player2から見た読み取りレベルに応じて詳細度が変わる）
    const p1ReadLevel = this.player2.readabilityGauge.getDisplayLevel();  // P2の読み能力
    const p1Intent = this.player1.actionIntent.getDisplayText(p1ReadLevel);  // P1の意図取得
    this.player1IntentText.setText(`P1: ${p1Intent.major}\n${p1Intent.minor}`);  // 大分類・小分類

    // Player2の行動意図を表示（Player1から見た読み取りレベルに応じて詳細度が変わる）
    const p2ReadLevel = this.player1.readabilityGauge.getDisplayLevel();  // P1の読み能力
    const p2Intent = this.player2.actionIntent.getDisplayText(p2ReadLevel);  // P2の意図取得
    this.player2IntentText.setText(`P2: ${p2Intent.major}\n${p2Intent.minor}`);

    // ゲージバーの幅を更新（ゲージ量に応じて伸縮）
    const p1GaugeRatio = this.player1.readabilityGauge.getGauge() / this.player1.readabilityGauge.getMaxGauge();
    const p2GaugeRatio = this.player2.readabilityGauge.getGauge() / this.player2.readabilityGauge.getMaxGauge();

    this.player1GaugeBar.setScale(p1GaugeRatio, 1);  // 横方向スケール調整
    this.player2GaugeBar.setScale(p2GaugeRatio, 1);
  }

  private preventCharacterOverlap(): void {
    // プレイヤーが初期化されているかチェック
    if (!this.player1 || !this.player2) return;

    const body1 = this.player1.body as Phaser.Physics.Arcade.Body;
    const body2 = this.player2.body as Phaser.Physics.Arcade.Body;

    if (!body1 || !body2) return;

    // 相手の上に乗っているかチェック（判定のみ、行動は別で処理）
    // 将来的にAIなどで使用するため判定を実行（現在は結果を保持のみ）
    const _p1OnP2 = this.isStandingOnOpponent(this.player1, this.player2, body1, body2);
    const _p2OnP1 = this.isStandingOnOpponent(this.player2, this.player1, body2, body1);

    // デバッグ用（必要に応じてコメントアウト解除）
    // if (_p1OnP2) console.log('[Overlap] Player1が相手の上に乗っている');
    // if (_p2OnP1) console.log('[Overlap] Player2が相手の上に乗っている');

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
   * キャラクターが相手の上に乗っているか判定（判定のみ、行動処理なし）
   * @returns 乗っている場合true
   */
  private isStandingOnOpponent(
    topPlayer: Fighter,
    bottomPlayer: Fighter,
    topBody: Phaser.Physics.Arcade.Body,
    bottomBody: Phaser.Physics.Arcade.Body
  ): boolean {
    // 上のキャラクターが地上にいるかチェック（相手の上に立っている状態）
    if (!topBody.touching.down) return false;

    // 水平方向の重なり
    const horizontalDistance = Math.abs(topPlayer.x - bottomPlayer.x);
    const horizontalOverlap = horizontalDistance < (topBody.width + bottomBody.width) / 2;
    if (!horizontalOverlap) return false;

    // 垂直方向の位置関係（topPlayerが上にいるか）
    const topPlayerBottom = topPlayer.y + topBody.height / 2;
    const bottomPlayerTop = bottomPlayer.y - bottomBody.height / 2;
    const verticalOverlap = Math.abs(topPlayerBottom - bottomPlayerTop) < 10; // 許容誤差10px

    return verticalOverlap;
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

        // 必殺技か通常攻撃かで判定エリアを選択
        const isSpecialAttack = this.player1.currentAttack.includes('special') || this.player1.currentAttack.includes('Special');
        const hitboxToCheck = isSpecialAttack ? attackEntity : attackEntity.hitboxTip;

        // 先端判定が存在しない（必殺技など）、または先端判定がある場合のみ処理
        if (hitboxToCheck) {
          // まず、ガードとの重なりをチェック
          let isGuarded = false;
          if (this.player2.currentGuardEntity) {
            this.physics.overlap(hitboxToCheck, this.player2.currentGuardEntity, () => {
              // ガードエリアと攻撃が物理的に重なっている
              const guardEntity = this.player2.currentGuardEntity!;

              // ガードがactiveフェーズでなければ無効
              if (!guardEntity.isActive) {
                console.log(`P2 ガード失敗！ ガードが${guardEntity.phase}フェーズ（activeではない）`);
                return;
              }

              // 物理的に重なっている時点でガード成功（ガードエリアは攻撃レベルに応じた位置に生成済み）
              isGuarded = true;
              console.log(`P2 ガード成功！ ${attackData.name} (${attackData.level}) を ${guardEntity.guardType}ガードで防御 [物理判定]`);

              // ガード成功時の処理（削りダメージとノックバック軽減）
              const chipDamage = Math.floor(attackEntity.damage * 0.1);
              const reducedKnockback = Math.floor(attackEntity.knockback * 0.25);
              const knockbackDirection = this.player1.facingRight ? reducedKnockback : -reducedKnockback;

              this.player2.takeDamage(chipDamage, knockbackDirection, attackData.level, ATTACK_STRENGTH_MAP[attackEntity.attackType]);

              // 攻撃を受けた側の読みゲージを消費
              const p1Intent = this.player1.actionIntent.getCurrentIntent();
              if (p1Intent) {
                this.player2.consumeGaugeOnHit({ major: p1Intent.major, minor: p1Intent.minor });
              }

              attackEntity.hasHit = true; // ガードされたので攻撃終了
            });
          }

          // ガードされていない場合のみ、プレイヤーへのヒット判定
          if (!isGuarded) {
            this.physics.overlap(hitboxToCheck, this.player2, () => {
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

                // 攻撃を受けた側の読みゲージを消費
                const p1Intent = this.player1.actionIntent.getCurrentIntent();
                if (p1Intent) {
                  this.player2.consumeGaugeOnHit({ major: p1Intent.major, minor: p1Intent.minor });
                }

                // 1回の攻撃で複数回ヒットしないようにフラグを立てる
                attackEntity.hasHit = true;
              }
            });
          }
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

        // 必殺技か通常攻撃かで判定エリアを選択
        const isSpecialAttack = this.player2.currentAttack.includes('special') || this.player2.currentAttack.includes('Special');
        const hitboxToCheck = isSpecialAttack ? attackEntity : attackEntity.hitboxTip;

        // 先端判定が存在しない（必殺技など）、または先端判定がある場合のみ処理
        if (hitboxToCheck) {
          // まず、ガードとの重なりをチェック
          let isGuarded = false;
          if (this.player1.currentGuardEntity) {
            this.physics.overlap(hitboxToCheck, this.player1.currentGuardEntity, () => {
              // ガードエリアと攻撃が物理的に重なっている
              const guardEntity = this.player1.currentGuardEntity!;

              // ガードがactiveフェーズでなければ無効
              if (!guardEntity.isActive) {
                console.log(`P1 ガード失敗！ ガードが${guardEntity.phase}フェーズ（activeではない）`);
                return;
              }

              // 物理的に重なっている時点でガード成功（ガードエリアは攻撃レベルに応じた位置に生成済み）
              isGuarded = true;
              console.log(`P1 ガード成功！ ${attackData.name} (${attackData.level}) を ${guardEntity.guardType}ガードで防御 [物理判定]`);

              // ガード成功時の処理（削りダメージとノックバック軽減）
              const chipDamage = Math.floor(attackEntity.damage * 0.1);
              const reducedKnockback = Math.floor(attackEntity.knockback * 0.25);
              const knockbackDirection = this.player2.facingRight ? reducedKnockback : -reducedKnockback;

              this.player1.takeDamage(chipDamage, knockbackDirection, attackData.level, ATTACK_STRENGTH_MAP[attackEntity.attackType]);

              // 攻撃を受けた側の読みゲージを消費
              const p2Intent = this.player2.actionIntent.getCurrentIntent();
              if (p2Intent) {
                this.player1.consumeGaugeOnHit({ major: p2Intent.major, minor: p2Intent.minor });
              }

              attackEntity.hasHit = true; // ガードされたので攻撃終了
            });
          }

          // ガードされていない場合のみ、プレイヤーへのヒット判定
          if (!isGuarded) {
            this.physics.overlap(hitboxToCheck, this.player1, () => {
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

                // 攻撃を受けた側の読みゲージを消費
                const p2Intent = this.player2.actionIntent.getCurrentIntent();
                if (p2Intent) {
                  this.player1.consumeGaugeOnHit({ major: p2Intent.major, minor: p2Intent.minor });
                }

                // 1回の攻撃で複数回ヒットしないようにフラグを立てる
                attackEntity.hasHit = true;
              }
            });
          }
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
          // ガードエリアと飛び道具が物理的に重なっている
          const guardEntity = target.currentGuardEntity!;

          // ガードがactiveフェーズでなければ無効
          if (!guardEntity.isActive) {
            console.log(`飛び道具ガード失敗！ ガードが${guardEntity.phase}フェーズ（activeではない）`);
            return;
          }

          // 物理的に重なっている時点でガード成功（飛び道具は中段、ガードエリアは適切な位置に生成済み）
          isGuarded = true;
          console.log(`飛び道具ガード成功！ガードタイプ: ${guardEntity.guardType} [物理判定]`);

          // ガード成功時の処理（削りダメージ）
          const chipDamage = Math.floor(projectile.damage * 0.1);
          target.takeDamage(chipDamage, 0, 'mid', 'light');

          // 攻撃を受けた側の読みゲージを消費
          const ownerIntent = projectile.owner.actionIntent.getCurrentIntent();
          if (ownerIntent) {
            target.consumeGaugeOnHit({ major: ownerIntent.major, minor: ownerIntent.minor });
          }

          // 飛び道具を消滅させる
          projectile.onHit();
        });
      }

      // ガードされていない場合のみ、プレイヤーへのヒット判定（物理演算ベース）
      if (!isGuarded && !projectile.hasHit) {
        this.physics.overlap(projectile, target, () => {
          console.log(`飛び道具ヒット！ダメージ: ${projectile.damage} [物理判定]`);
          target.takeDamage(projectile.damage, 0, 'mid', 'light');

          // 攻撃を受けた側の読みゲージを消費
          const ownerIntent = projectile.owner.actionIntent.getCurrentIntent();
          if (ownerIntent) {
            target.consumeGaugeOnHit({ major: ownerIntent.major, minor: ownerIntent.minor });
          }

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
