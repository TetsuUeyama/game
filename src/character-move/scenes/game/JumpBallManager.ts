/**
 * ジャンプボールマネージャー
 * ジャンプボールに関するロジックを管理
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { CharacterState } from "../../types/CharacterState";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { JUMP_BALL_MOTION } from "../../motion/JumpMotion";
import {
  CENTER_CIRCLE,
  JUMP_BALL_POSITIONS,
  JUMP_BALL_TIMING,
  JUMP_BALL_PHYSICS,
  JumpBallInfo,
  DEFAULT_JUMP_BALL_INFO,
} from "../../config/JumpBallConfig";
import { FIELD_CONFIG } from "../../config/gameConfig";
import { getDistance2D } from "../../utils/CollisionUtils";
import { ShotClockController } from "../../controllers/ShotClockController";

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
    for (const char of allCharacters) {
      char.stopMovement();
      char.playMotion(IDLE_MOTION);
      const actionController = char.getActionController();
      if (actionController) {
        actionController.cancelAction();
      }
    }

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
        this.enforceVerticalBallMotion();
        const ballHeight = this.context.ball.getPosition().y;
        if (ballHeight >= JUMP_BALL_TIMING.TIP_ENABLED_MIN_HEIGHT) {
          this.jumpBallInfo.phase = 'jumping';
          this.triggerJumperJumps();
        }
        break;

      case 'jumping':
        if (!this.jumpBallInfo.ballTipped) {
          this.enforceVerticalBallMotion();
          this.tryTipBall();
        }
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
   * ボールを垂直運動に強制
   */
  private enforceVerticalBallMotion(): void {
    const ballPos = this.context.ball.getPosition();
    const ballVel = this.context.ball.getVelocity();

    if (Math.abs(ballPos.x) > 0.01 || Math.abs(ballPos.z) > 0.01) {
      this.context.ball.setPosition(new Vector3(0, ballPos.y, 0), false);
    }

    if (Math.abs(ballVel.x) > 0.01 || Math.abs(ballVel.z) > 0.01) {
      this.context.ball.setVelocity(new Vector3(0, ballVel.y, 0));
    }
  }

  /**
   * ボール投げ上げを実行
   */
  private executeToss(): void {
    const tossPosition = new Vector3(
      CENTER_CIRCLE.CENTER_X,
      JUMP_BALL_POSITIONS.BALL_START_HEIGHT,
      CENTER_CIRCLE.CENTER_Z
    );
    this.context.ball.tossForJumpBall(tossPosition, JUMP_BALL_POSITIONS.BALL_TOSS_HEIGHT);
    this.jumpBallInfo.phase = 'tossing';
  }

  /**
   * ジャンパーにジャンプを指示
   */
  private triggerJumperJumps(): void {
    if (this.jumpBallAllyJumper) {
      const actionController = this.jumpBallAllyJumper.getActionController();
      if (actionController) {
        actionController.startAction('jump_ball');
      }
      this.jumpBallAllyJumper.playMotion(JUMP_BALL_MOTION);
    }

    if (this.jumpBallEnemyJumper) {
      const actionController = this.jumpBallEnemyJumper.getActionController();
      if (actionController) {
        actionController.startAction('jump_ball');
      }
      this.jumpBallEnemyJumper.playMotion(JUMP_BALL_MOTION);
    }
  }

  /**
   * ボールをチップできるか試行
   */
  private tryTipBall(): void {
    const ballPos = this.context.ball.getPosition();
    const ballHeight = ballPos.y;

    if (ballHeight < JUMP_BALL_TIMING.TIP_ENABLED_MIN_HEIGHT ||
        ballHeight > JUMP_BALL_TIMING.TIP_ENABLED_MAX_HEIGHT) {
      return;
    }

    if (!this.jumpBallAllyJumper || !this.jumpBallEnemyJumper) {
      return;
    }

    const allyPos = this.jumpBallAllyJumper.getPosition();
    const enemyPos = this.jumpBallEnemyJumper.getPosition();

    const allyHorizontalDist = getDistance2D(ballPos, allyPos);
    const enemyHorizontalDist = getDistance2D(ballPos, enemyPos);

    const reachRange = 1.5;

    const allyCanReach = allyHorizontalDist <= reachRange;
    const enemyCanReach = enemyHorizontalDist <= reachRange;

    if (!allyCanReach && !enemyCanReach) {
      return;
    }

    let winner: 'ally' | 'enemy';
    if (allyCanReach && !enemyCanReach) {
      winner = 'ally';
    } else if (!allyCanReach && enemyCanReach) {
      winner = 'enemy';
    } else {
      const allyHeight = this.jumpBallAllyJumper.config.physical.height;
      const enemyHeight = this.jumpBallEnemyJumper.config.physical.height;
      const heightAdvantage = (allyHeight - enemyHeight) * 0.1;
      const randomFactor = Math.random() - 0.5;
      winner = (heightAdvantage + randomFactor) > 0 ? 'ally' : 'enemy';
    }

    const tipDirection = new Vector3(
      (Math.random() - 0.5) * JUMP_BALL_PHYSICS.TIP_HORIZONTAL_RATIO,
      JUMP_BALL_PHYSICS.TIP_VERTICAL_RATIO,
      winner === 'ally'
        ? -JUMP_BALL_PHYSICS.TIP_HORIZONTAL_RATIO
        : JUMP_BALL_PHYSICS.TIP_HORIZONTAL_RATIO
    ).normalize();

    this.context.ball.tipBall(tipDirection, JUMP_BALL_PHYSICS.TIP_BALL_SPEED);
    this.jumpBallInfo.ballTipped = true;
  }

  /**
   * ジャンプボールを完了
   */
  private complete(): void {
    this.jumpBallInfo.phase = 'completed';
    this.jumpBallInfo.ballTipped = true;

    this.clearStates();

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
  }
}
