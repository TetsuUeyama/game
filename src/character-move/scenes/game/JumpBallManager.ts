/**
 * ジャンプボールマネージャー
 * ジャンプボールに関するロジックを管理
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { CharacterState } from "../../types/CharacterState";
import {
  CENTER_CIRCLE,
  JUMP_BALL_POSITIONS,
  JUMP_BALL_TIMING,
  JumpBallInfo,
  DEFAULT_JUMP_BALL_INFO,
} from "../../config/JumpBallConfig";
import { FIELD_CONFIG } from "../../config/gameConfig";
import { ShotClockController } from "../../controllers/ShotClockController";
import { PhysicsConstants } from "../../../physics/PhysicsConfig";

/**
 * ルーズボール設定
 */
const LOOSE_BALL_CONFIG = {
  /** ルーズボール状態が続くとジャンプボールになる閾値（秒） */
  JUMP_BALL_THRESHOLD: 10.0,
} as const;

/**
 * ジャンプボール用コンテキスト
 */
export interface JumpBallContext {
  ball: Ball;
  shotClockController?: ShotClockController;

  // キャラクター取得
  getAllyCharacters: () => Character[];
  getEnemyCharacters: () => Character[];

  // AI初期化
  getCharacterAIs: () => { forceInitialize: () => void }[];
}

/**
 * ジャンプボールマネージャー
 */
export class JumpBallManager {
  private context: JumpBallContext;

  // ジャンプボール状態
  private jumpBallInfo: JumpBallInfo = { ...DEFAULT_JUMP_BALL_INFO };
  private jumpBallAllyJumper: Character | null = null;
  private jumpBallEnemyJumper: Character | null = null;
  private jumpBallTimer: number = 0;

  // キネマティックトス状態（物理エンジン不使用、手動計算）
  private tossActive: boolean = false;
  private tossStartY: number = 0;
  private tossVelocityY: number = 0;
  private tossElapsedTime: number = 0;

  // ルーズボールタイマー（誰もボールを保持していない状態のタイマー）
  private looseBallTimer: number = 0;

  constructor(context: JumpBallContext) {
    this.context = context;
  }

  /**
   * コンテキストを更新（依存関係の再設定用）
   */
  public updateContext(context: Partial<JumpBallContext>): void {
    this.context = { ...this.context, ...context };
  }

  // =============================================================================
  // ジャンプボールセットアップ
  // =============================================================================

  /**
   * ジャンプボールをセットアップ
   */
  public setup(): void {
    const allyCharacters = this.context.getAllyCharacters();
    const enemyCharacters = this.context.getEnemyCharacters();
    const allCharacters = [...allyCharacters, ...enemyCharacters];

    if (allCharacters.length < 2) {
      console.warn('[JumpBallManager] ジャンプボールに必要な選手が不足');
      return;
    }

    // ジャンパーを選択
    this.jumpBallAllyJumper = this.selectJumper(allyCharacters);
    this.jumpBallEnemyJumper = this.selectJumper(enemyCharacters);

    if (!this.jumpBallAllyJumper || !this.jumpBallEnemyJumper) {
      console.warn('[JumpBallManager] ジャンパーを選択できませんでした');
      return;
    }

    // ジャンパーをセンターサークル中央に配置
    const allyJumperPos = new Vector3(
      CENTER_CIRCLE.CENTER_X,
      this.jumpBallAllyJumper.config.physical.height / 2,
      CENTER_CIRCLE.CENTER_Z - JUMP_BALL_POSITIONS.JUMPER_OFFSET_Z
    );
    const enemyJumperPos = new Vector3(
      CENTER_CIRCLE.CENTER_X,
      this.jumpBallEnemyJumper.config.physical.height / 2,
      CENTER_CIRCLE.CENTER_Z + JUMP_BALL_POSITIONS.JUMPER_OFFSET_Z
    );

    this.jumpBallAllyJumper.setPosition(allyJumperPos);
    this.jumpBallEnemyJumper.setPosition(enemyJumperPos);

    // ジャンパーが向かい合うように設定
    this.jumpBallAllyJumper.lookAt(enemyJumperPos);
    this.jumpBallEnemyJumper.lookAt(allyJumperPos);

    // 他の選手をセンターサークル外側に配置
    this.positionOtherPlayers(allyCharacters, enemyCharacters);

    // 全選手にジャンプボール状態を設定
    this.setJumpBallStates(allCharacters);

    // ボールをセンターサークル上空に配置
    const ballStartPos = new Vector3(
      CENTER_CIRCLE.CENTER_X,
      JUMP_BALL_POSITIONS.BALL_START_HEIGHT,
      CENTER_CIRCLE.CENTER_Z
    );
    this.context.ball.setPosition(ballStartPos, true);
    this.context.ball.endFlight();

    // ジャンプボール情報を初期化
    this.jumpBallInfo = {
      phase: 'preparing',
      allyJumper: this.jumpBallAllyJumper.playerPosition || null,
      enemyJumper: this.jumpBallEnemyJumper.playerPosition || null,
      elapsedTime: 0,
      ballTipped: false,
    };
    this.jumpBallTimer = JUMP_BALL_TIMING.PREPARATION_TIME;

    // シュートクロックを停止
    if (this.context.shotClockController) {
      this.context.shotClockController.stop();
    }

    // 全AIを強制初期化（前回の行動や状態を完全にクリア）
    for (const ai of this.context.getCharacterAIs()) {
      ai.forceInitialize();
    }
  }

  /**
   * チームからジャンパーを選択
   */
  private selectJumper(team: Character[]): Character | null {
    if (team.length === 0) return null;

    // センターを探す
    const center = team.find(c => c.playerPosition === 'C');
    if (center) return center;

    // センターがいない場合は最も背の高い選手
    let tallest = team[0];
    for (const char of team) {
      if (char.config.physical.height > tallest.config.physical.height) {
        tallest = char;
      }
    }
    return tallest;
  }

  /**
   * ジャンプボール時に他の選手を配置
   */
  private positionOtherPlayers(
    allyCharacters: Character[],
    enemyCharacters: Character[]
  ): void {
    const minDistance = JUMP_BALL_POSITIONS.OTHER_PLAYER_MIN_DISTANCE;
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;

    // 味方チームの配置
    let allyCirclePlayerPlaced = false;
    for (const char of allyCharacters) {
      if (char === this.jumpBallAllyJumper) continue;

      let x: number, z: number;

      if (!allyCirclePlayerPlaced) {
        const angle = -Math.PI / 2;
        x = CENTER_CIRCLE.CENTER_X + minDistance * Math.cos(angle);
        z = CENTER_CIRCLE.CENTER_Z + minDistance * Math.sin(angle);
        allyCirclePlayerPlaced = true;
      } else {
        x = (Math.random() - 0.5) * (halfWidth * 1.5);
        z = -halfLength * 0.3 - Math.random() * (halfLength * 0.5);
      }

      char.setPosition(new Vector3(x, char.config.physical.height / 2, z));
      char.lookAt(new Vector3(CENTER_CIRCLE.CENTER_X, 0, CENTER_CIRCLE.CENTER_Z));
    }

    // 敵チームの配置
    let enemyCirclePlayerPlaced = false;
    for (const char of enemyCharacters) {
      if (char === this.jumpBallEnemyJumper) continue;

      let x: number, z: number;

      if (!enemyCirclePlayerPlaced) {
        const angle = Math.PI / 2;
        x = CENTER_CIRCLE.CENTER_X + minDistance * Math.cos(angle);
        z = CENTER_CIRCLE.CENTER_Z + minDistance * Math.sin(angle);
        enemyCirclePlayerPlaced = true;
      } else {
        x = (Math.random() - 0.5) * (halfWidth * 1.5);
        z = halfLength * 0.3 + Math.random() * (halfLength * 0.5);
      }

      char.setPosition(new Vector3(x, char.config.physical.height / 2, z));
      char.lookAt(new Vector3(CENTER_CIRCLE.CENTER_X, 0, CENTER_CIRCLE.CENTER_Z));
    }
  }

  /**
   * ジャンプボール状態を設定
   */
  private setJumpBallStates(allCharacters: Character[]): void {
    if (this.jumpBallAllyJumper) {
      this.jumpBallAllyJumper.setState(CharacterState.JUMP_BALL_JUMPER);
    }
    if (this.jumpBallEnemyJumper) {
      this.jumpBallEnemyJumper.setState(CharacterState.JUMP_BALL_JUMPER);
    }

    for (const char of allCharacters) {
      if (char !== this.jumpBallAllyJumper && char !== this.jumpBallEnemyJumper) {
        char.setState(CharacterState.JUMP_BALL_OTHER);
      }
    }
  }

  // =============================================================================
  // ジャンプボール更新
  // =============================================================================

  /**
   * ジャンプボールを更新（毎フレーム呼び出し）
   */
  public update(deltaTime: number): void {
    if (this.jumpBallInfo.phase === 'idle' || this.jumpBallInfo.phase === 'completed') {
      return;
    }

    this.jumpBallInfo.elapsedTime += deltaTime;

    switch (this.jumpBallInfo.phase) {
      case 'preparing':
        this.jumpBallTimer -= deltaTime;
        if (this.jumpBallTimer <= 0) {
          this.executeToss();
        }
        break;

      case 'tossing':
        this.updateKinematicToss(deltaTime);
        {
          const ballHeight = this.context.ball.getPosition().y;
          // ボールが地面付近まで落下したらジャンプボール完了
          if (ballHeight <= 1.0) {
            this.jumpBallInfo.phase = 'jumping';
            this.jumpBallInfo.ballTipped = true;
            this.complete();
          }
        }
        break;

      case 'jumping':
        if (this.context.ball.isHeld()) {
          this.complete();
        } else if (this.jumpBallInfo.ballTipped) {
          const currentBallHeight = this.context.ball.getPosition().y;
          if (currentBallHeight < 1.0) {
            this.complete();
          }
        }
        break;
    }
  }

  /**
   * キネマティックトス更新（物理エンジン不使用）
   *
   * 運動方程式 y = y0 + v0*t - 0.5*g*t² でボール位置を手動計算。
   * Havok物理エンジンのDYNAMICモードを使うと、disablePreStep の問題で
   * ボールが透明な壁に当たったように見えるため、ANIMATEDモードのまま
   * 位置を直接制御する。
   */
  private updateKinematicToss(deltaTime: number): void {
    if (!this.tossActive) return;

    this.tossElapsedTime += deltaTime;
    const g = PhysicsConstants.GRAVITY_MAGNITUDE;
    const y = this.tossStartY
      + this.tossVelocityY * this.tossElapsedTime
      - 0.5 * g * this.tossElapsedTime * this.tossElapsedTime;

    // ボール位置をセンター(0, y, 0)に設定（ANIMATEDモードなので安全）
    this.context.ball.setPosition(new Vector3(0, y, 0), false);
  }

  /**
   * ボール投げ上げを実行
   *
   * 物理エンジンを使わず、キネマティック（手動計算）でトスを実行。
   * ボールはANIMATEDモードのまま、updateKinematicToss()で位置を制御する。
   * チップ時に tipBall() がDYNAMICモードに切り替える。
   */
  private executeToss(): void {
    // ジャンパーの物理ボディを無効化（手の物理球体がボールと衝突するのを防ぐ）
    this.jumpBallAllyJumper?.setPhysicsEnabled(false);
    this.jumpBallEnemyJumper?.setPhysicsEnabled(false);

    // ボールをセンターに配置（ANIMATEDモードのまま）
    const startY = JUMP_BALL_POSITIONS.BALL_START_HEIGHT;
    this.context.ball.setPosition(new Vector3(0, startY, 0), true);
    this.context.ball.endFlight();

    // キネマティックトスのパラメータを設定
    // v0 = sqrt(2*g*h) で目標高さに到達する初速度を計算
    const g = PhysicsConstants.GRAVITY_MAGNITUDE;
    const height = JUMP_BALL_POSITIONS.BALL_TOSS_HEIGHT;
    this.tossStartY = startY;
    this.tossVelocityY = Math.sqrt(2 * g * height);
    this.tossElapsedTime = 0;
    this.tossActive = true;

    this.jumpBallInfo.phase = 'tossing';
  }

  // NOTE: triggerJumperJumps() と tryTipBall() は一時的に削除（デバッグ中）
  // ジャンプボールのトス・チップ機能を復元する際にgit履歴から復元すること

  /**
   * ジャンプボールを完了
   */
  private complete(): void {
    this.jumpBallInfo.phase = 'completed';
    this.jumpBallInfo.ballTipped = true;

    // キネマティックトスを停止
    this.tossActive = false;

    // ジャンパーの物理ボディを再有効化（executeTossで無効化した分）
    this.jumpBallAllyJumper?.setPhysicsEnabled(true);
    this.jumpBallEnemyJumper?.setPhysicsEnabled(true);

    this.clearStates();

    // 全AIを強制初期化（ジャンプボール状態から通常状態への移行）
    for (const ai of this.context.getCharacterAIs()) {
      ai.forceInitialize();
    }

    const holder = this.context.ball.getHolder();
    if (holder && this.context.shotClockController) {
      this.context.shotClockController.reset(holder.team);
    }

    this.jumpBallAllyJumper = null;
    this.jumpBallEnemyJumper = null;
  }

  /**
   * ジャンプボール状態をクリア
   */
  private clearStates(): void {
    const allCharacters = [
      ...this.context.getAllyCharacters(),
      ...this.context.getEnemyCharacters()
    ];

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === CharacterState.JUMP_BALL_JUMPER ||
          state === CharacterState.JUMP_BALL_OTHER) {
        char.setState(CharacterState.BALL_LOST);
      }
    }
  }

  // =============================================================================
  // ルーズボール管理
  // =============================================================================

  /**
   * ルーズボールタイマーを更新
   * 誰もボールを保持していない状態が続くとジャンプボールを開始する
   * @param deltaTime 経過時間
   * @param isResetPending リセット待機中かどうか（ゴール後、アウトオブバウンズ後など）
   * @returns ジャンプボールを開始した場合true
   */
  public updateLooseBallTimer(deltaTime: number, isResetPending: boolean): boolean {
    // ジャンプボール中は更新しない
    if (this.isActive()) {
      this.looseBallTimer = 0;
      return false;
    }

    // リセット待機中はタイマーをリセット
    if (isResetPending) {
      this.looseBallTimer = 0;
      return false;
    }

    const ball = this.context.ball;
    const currentBallHolder = ball.getHolder();

    // ボールを誰も持っておらず、飛行中でもない場合
    if (!currentBallHolder && !ball.isInFlight()) {
      this.looseBallTimer += deltaTime;
      if (this.looseBallTimer >= LOOSE_BALL_CONFIG.JUMP_BALL_THRESHOLD) {
        this.looseBallTimer = 0;
        this.setup();
        return true;
      }
    } else {
      this.looseBallTimer = 0;
    }

    return false;
  }

  /**
   * ルーズボールタイマーをリセット
   */
  public resetLooseBallTimer(): void {
    this.looseBallTimer = 0;
  }

  // =============================================================================
  // パブリックAPI
  // =============================================================================

  /**
   * ジャンプボールがアクティブかどうか
   */
  public isActive(): boolean {
    return this.jumpBallInfo.phase !== 'idle' && this.jumpBallInfo.phase !== 'completed';
  }

  /**
   * ジャンプボール情報を取得
   */
  public getInfo(): JumpBallInfo {
    return { ...this.jumpBallInfo };
  }

  /**
   * ジャンプボール情報をリセット
   */
  public reset(): void {
    this.jumpBallInfo = { ...DEFAULT_JUMP_BALL_INFO };
    this.jumpBallAllyJumper = null;
    this.jumpBallEnemyJumper = null;
    this.jumpBallTimer = 0;
    this.tossActive = false;
  }
}
