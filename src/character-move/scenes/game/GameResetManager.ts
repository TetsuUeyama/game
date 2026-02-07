/**
 * ゲームリセットマネージャー
 * ゴール後、アウトオブバウンズ、シュートクロック違反等のリセット処理を管理
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { CharacterState } from "../../types/CharacterState";
import { CENTER_CIRCLE, JUMP_BALL_POSITIONS } from "../../config/JumpBallConfig";
import { FIELD_CONFIG, GOAL_CONFIG } from "../../config/gameConfig";
import { ShotClockController } from "../../controllers/ShotClockController";
import { FormationUtils } from "../../config/FormationConfig";

/**
 * ゲームリセット用コンテキスト
 */
export interface GameResetContext {
  ball: Ball;
  shotClockController?: ShotClockController;

  // キャラクター取得
  getAllyCharacters: () => Character[];
  getEnemyCharacters: () => Character[];
  getCharacterAIs: () => { forceInitialize: () => void }[];

  // コールバック
  onScoreUpdate?: (allyScore: number, enemyScore: number) => void;
  onWinner?: (winner: 'ally' | 'enemy') => void;
  onRequestJumpBall?: () => void;
  onRequestThrowIn?: (offendingTeam: 'ally' | 'enemy', position: Vector3) => void;
  onClearThrowInState?: () => void;
  onResetOneOnOneBattle?: () => void;
}

/**
 * ゲームリセットマネージャー
 */
export class GameResetManager {
  private context: GameResetContext;

  // スコア
  private allyScore: number = 0;
  private enemyScore: number = 0;
  private readonly winningScore: number = 5;
  private winner: 'ally' | 'enemy' | null = null;

  // ゴール後リセット
  private pendingGoalReset: boolean = false;
  private pendingGoalScoringTeam: 'ally' | 'enemy' | null = null;
  private goalResetTimer: number = 0;
  private readonly goalResetDelay: number = 3.0;

  // アウトオブバウンズ後リセット
  private pendingOutOfBoundsReset: boolean = false;
  private outOfBoundsResetTimer: number = 0;
  private outOfBoundsBallPosition: Vector3 | null = null;
  private readonly outOfBoundsResetDelay: number = 1.5;

  // シュートクロック違反後リセット
  private pendingShotClockViolationReset: boolean = false;
  private shotClockViolationResetTimer: number = 0;
  private shotClockViolatingTeam: 'ally' | 'enemy' | null = null;
  private readonly shotClockViolationResetDelay: number = 1.5;

  // アウトオブバウンズ判定用
  private previousBallPosition: Vector3 | null = null;
  private readonly outOfBoundsMargin: number = 0.5; // 50cmのマージン

  constructor(context: GameResetContext) {
    this.context = context;
  }

  /**
   * コンテキストを更新
   */
  public updateContext(context: Partial<GameResetContext>): void {
    this.context = { ...this.context, ...context };
  }

  // =============================================================================
  // ゴール後リセット
  // =============================================================================

  /**
   * ゴール後のリセット処理を開始
   */
  public startGoalReset(scoringTeam: 'ally' | 'enemy'): void {
    if (this.winner) return;
    if (this.pendingGoalReset) return;

    // スコア更新
    if (scoringTeam === 'ally') {
      this.allyScore++;
    } else {
      this.enemyScore++;
    }

    this.pendingGoalReset = true;
    this.pendingGoalScoringTeam = scoringTeam;
    this.goalResetTimer = this.goalResetDelay;

    // 勝利判定
    if (this.allyScore >= this.winningScore) {
      this.winner = 'ally';
      if (this.context.onWinner) {
        this.context.onWinner('ally');
      }
    } else if (this.enemyScore >= this.winningScore) {
      this.winner = 'enemy';
      if (this.context.onWinner) {
        this.context.onWinner('enemy');
      }
    }

    if (this.context.onScoreUpdate) {
      this.context.onScoreUpdate(this.allyScore, this.enemyScore);
    }
  }

  /**
   * ゴール後リセットを更新
   */
  public updateGoalReset(deltaTime: number): boolean {
    if (!this.pendingGoalReset) return false;

    // ボールが床でバウンドするまで待つか、タイムアウト
    const ballVelocity = this.context.ball.getVelocity();
    const ballHeight = this.context.ball.getPosition().y;
    const isBallBounced = ballHeight < 0.5 && Math.abs(ballVelocity.y) < 1.0;

    this.goalResetTimer -= deltaTime;

    if (isBallBounced || this.goalResetTimer <= 0) {
      this.executeGoalReset();
      return true;
    }

    return true;
  }

  /**
   * ゴール後リセットを実行
   */
  private executeGoalReset(): void {
    if (!this.pendingGoalReset || !this.pendingGoalScoringTeam) {
      return;
    }

    const scoringTeam = this.pendingGoalScoringTeam;
    this.pendingGoalReset = false;
    this.pendingGoalScoringTeam = null;

    // 得点したチームの自陣ゴール下から再開
    this.executeGoalUnderReset(scoringTeam);
  }

  // =============================================================================
  // アウトオブバウンズリセット
  // =============================================================================

  /**
   * ボールがコート外に出たか判定
   * 内側から外側に出た場合のみtrueを返す
   * @returns コート外に出た場合true
   */
  public checkOutOfBounds(): boolean {
    const ballPosition = this.context.ball.getPosition();
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 14m

    // 現在のボール位置がコート外かチェック（マージン込み）
    const isCurrentlyOutX = Math.abs(ballPosition.x) > halfWidth + this.outOfBoundsMargin;
    const isCurrentlyOutZ = Math.abs(ballPosition.z) > halfLength + this.outOfBoundsMargin;
    const isCurrentlyOut = isCurrentlyOutX || isCurrentlyOutZ;

    // 現在コート内ならアウトオブバウンズではない
    if (!isCurrentlyOut) {
      return false;
    }

    // 前フレームの位置がない場合（初回）はアウトオブバウンズとしない
    if (!this.previousBallPosition) {
      return false;
    }

    // 前フレームの位置がコート内だったかチェック（マージンありで判定）
    const wasPreviouslyInX = Math.abs(this.previousBallPosition.x) <= halfWidth + this.outOfBoundsMargin;
    const wasPreviouslyInZ = Math.abs(this.previousBallPosition.z) <= halfLength + this.outOfBoundsMargin;
    const wasPreviouslyIn = wasPreviouslyInX && wasPreviouslyInZ;

    // 内側から外側に出た場合のみアウトオブバウンズ
    return wasPreviouslyIn && isCurrentlyOut;
  }

  /**
   * 前フレームのボール位置を更新（毎フレーム呼び出す）
   */
  public updatePreviousBallPosition(): void {
    this.previousBallPosition = this.context.ball.getPosition().clone();
  }

  /**
   * 前フレームのボール位置をクリア
   */
  public clearPreviousBallPosition(): void {
    this.previousBallPosition = null;
  }

  /**
   * アウトオブバウンズリセットを開始
   */
  public startOutOfBoundsReset(ballPosition: Vector3): void {
    this.pendingOutOfBoundsReset = true;
    this.outOfBoundsResetTimer = this.outOfBoundsResetDelay;
    this.outOfBoundsBallPosition = ballPosition.clone();
  }

  /**
   * アウトオブバウンズリセットを更新
   */
  public updateOutOfBoundsReset(deltaTime: number): boolean {
    if (!this.pendingOutOfBoundsReset) return false;

    this.outOfBoundsResetTimer -= deltaTime;
    if (this.outOfBoundsResetTimer <= 0) {
      this.executeOutOfBoundsReset();
      return false;
    }

    return true;
  }

  /**
   * アウトオブバウンズリセットを実行
   */
  private executeOutOfBoundsReset(): void {
    this.pendingOutOfBoundsReset = false;

    // 最後に触った選手のチームからスローイン
    const lastToucher = this.context.ball.getLastToucher();
    const offendingTeam = lastToucher?.team || 'ally';

    if (this.context.onRequestThrowIn && this.outOfBoundsBallPosition) {
      this.context.onRequestThrowIn(offendingTeam, this.outOfBoundsBallPosition);
    }

    this.outOfBoundsBallPosition = null;
  }

  // =============================================================================
  // シュートクロック違反リセット
  // =============================================================================

  /**
   * シュートクロック違反を処理
   */
  public handleShotClockViolation(offendingTeam: 'ally' | 'enemy', _ballPosition: Vector3): void {
    if (this.pendingShotClockViolationReset || this.pendingGoalReset || this.pendingOutOfBoundsReset) {
      return;
    }

    // ルーズボール状態の場合
    let actualOffendingTeam = offendingTeam;
    if (!this.context.ball.getHolder()) {
      const lastToucher = this.context.ball.getLastToucher();
      if (lastToucher) {
        actualOffendingTeam = lastToucher.team;
      }
    }

    this.pendingShotClockViolationReset = true;
    this.shotClockViolationResetTimer = this.shotClockViolationResetDelay;
    this.shotClockViolatingTeam = actualOffendingTeam;
  }

  /**
   * シュートクロック違反リセットを更新
   */
  public updateShotClockViolationReset(deltaTime: number): boolean {
    if (!this.pendingShotClockViolationReset) return false;

    this.shotClockViolationResetTimer -= deltaTime;
    if (this.shotClockViolationResetTimer <= 0) {
      this.executeShotClockViolationReset();
      return false;
    }

    return true;
  }

  /**
   * シュートクロック違反リセットを実行
   */
  private executeShotClockViolationReset(): void {
    if (!this.shotClockViolatingTeam) return;

    const offendingTeam = this.shotClockViolatingTeam;
    this.pendingShotClockViolationReset = false;
    this.shotClockViolatingTeam = null;

    // センターサークルから再開
    this.executeCenterCircleReset(offendingTeam);
  }

  /**
   * センターサークルからリセット
   */
  private executeCenterCircleReset(offendingTeam: 'ally' | 'enemy'): void {
    this.context.ball.endFlight();

    const allyCharacters = this.context.getAllyCharacters();
    const enemyCharacters = this.context.getEnemyCharacters();

    const receivingTeam = offendingTeam === 'ally' ? enemyCharacters : allyCharacters;
    const defendingTeam = offendingTeam === 'ally' ? allyCharacters : enemyCharacters;

    const ballHandler = receivingTeam.find(c => c.playerPosition === 'PG') || receivingTeam[0];
    if (!ballHandler) {
      console.warn('[GameResetManager] ボールハンドラーが見つかりません');
      return;
    }

    // ボールハンドラーを配置
    const halfLength = FIELD_CONFIG.length / 2;
    const ballHandlerZ = offendingTeam === 'ally'
      ? CENTER_CIRCLE.CENTER_Z + JUMP_BALL_POSITIONS.JUMPER_OFFSET_Z + 1.0
      : CENTER_CIRCLE.CENTER_Z - JUMP_BALL_POSITIONS.JUMPER_OFFSET_Z - 1.0;

    ballHandler.setPosition(new Vector3(
      CENTER_CIRCLE.CENTER_X,
      ballHandler.config.physical.height / 2,
      ballHandlerZ
    ));

    // 他のオフェンスを配置
    let offsetX = -3.0;
    for (const char of receivingTeam) {
      if (char === ballHandler) continue;

      const z = offendingTeam === 'ally'
        ? halfLength * 0.3
        : -halfLength * 0.3;

      char.setPosition(new Vector3(
        offsetX,
        char.config.physical.height / 2,
        z
      ));
      char.lookAt(ballHandler.getPosition());
      offsetX += 1.5;
    }

    // ディフェンスを配置
    offsetX = -3.0;
    for (const char of defendingTeam) {
      const z = offendingTeam === 'ally'
        ? -halfLength * 0.3
        : halfLength * 0.3;

      char.setPosition(new Vector3(
        offsetX,
        char.config.physical.height / 2,
        z
      ));
      char.lookAt(ballHandler.getPosition());
      offsetX += 1.5;
    }

    // ボールをリリースして足元に配置（ルーズボール状態で開始）
    this.context.ball.setHolder(null);
    this.context.ball.setPosition(new Vector3(
      ballHandler.getPosition().x,
      0.15, // BALL_RADIUS相当（地面レベル）
      ballHandler.getPosition().z
    ));

    // 全員をBALL_LOST状態に設定
    // 次フレームでBallCatchSystemがボールを拾い、自然に状態遷移が発生する
    for (const char of receivingTeam) {
      char.setState(CharacterState.BALL_LOST);
    }
    for (const char of defendingTeam) {
      char.setState(CharacterState.BALL_LOST);
    }

    // シュートクロックを開始
    if (this.context.shotClockController) {
      this.context.shotClockController.reset(offendingTeam === 'ally' ? 'enemy' : 'ally');
    }

    // AIを初期化
    for (const ai of this.context.getCharacterAIs()) {
      ai.forceInitialize();
    }
  }

  // =============================================================================
  // ゴール下リセット
  // =============================================================================

  /**
   * ゴール下から再開（ボール保持状態）
   * ゴール後やシュートクロック違反後に使用
   * @param offendingTeam 違反/得点したチーム（この相手チームがボールを保持）
   */
  public executeGoalUnderReset(offendingTeam: 'ally' | 'enemy'): void {
    // ボールの飛行を停止
    this.context.ball.endFlight();

    // スローイン状態をクリア
    if (this.context.onClearThrowInState) {
      this.context.onClearThrowInState();
    }

    const allyCharacters = this.context.getAllyCharacters();
    const enemyCharacters = this.context.getEnemyCharacters();

    // ボールを保持するチーム（offendingTeamの相手）
    const receivingTeam = offendingTeam === 'ally' ? enemyCharacters : allyCharacters;
    const defendingTeam = offendingTeam === 'ally' ? allyCharacters : enemyCharacters;

    // ゴール位置を計算
    // ally得点 → +Zゴール下（allyの攻撃ゴール）
    // enemy得点 → -Zゴール下（enemyの攻撃ゴール）
    const halfLength = FIELD_CONFIG.length / 2;
    const goalZ = offendingTeam === 'ally'
      ? halfLength - GOAL_CONFIG.backboardDistance - 1.0
      : -(halfLength - GOAL_CONFIG.backboardDistance - 1.0);

    // ボールを持つ選手（PGを優先）
    const ballHandler = receivingTeam.find(c => c.playerPosition === 'PG') || receivingTeam[0];
    if (!ballHandler) {
      console.warn('[GameResetManager] ボールハンドラーが見つかりません');
      return;
    }

    // ボールハンドラーをゴール下に配置
    const ballHandlerPos = new Vector3(0, ballHandler.config.physical.height / 2, goalZ);
    ballHandler.setPosition(ballHandlerPos);

    // ボールをリリースして足元に配置（ルーズボール状態で開始）
    this.context.ball.setHolder(null);
    this.context.ball.setPosition(new Vector3(
      ballHandlerPos.x,
      0.15, // BALL_RADIUS相当（地面レベル）
      ballHandlerPos.z
    ));

    // 他のオフェンス選手をフォーメーション位置に配置
    const offenseFormation = FormationUtils.getDefaultOffenseFormation();
    const isReceivingTeamAlly = offendingTeam === 'enemy';
    for (const teammate of receivingTeam) {
      if (teammate === ballHandler) continue;
      if (!teammate.playerPosition) continue;

      const targetPos = FormationUtils.getTargetPosition(
        offenseFormation,
        teammate.playerPosition,
        isReceivingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, teammate.config.physical.height / 2, targetPos.z);
        teammate.setPosition(pos);
        teammate.lookAt(ballHandlerPos);
      }
    }

    // ディフェンスチームをディフェンスフォーメーション位置に配置
    const defenseFormation = FormationUtils.getDefaultDefenseFormation();
    const isDefendingTeamAlly = offendingTeam === 'ally';
    for (const defender of defendingTeam) {
      if (!defender.playerPosition) continue;

      const targetPos = FormationUtils.getTargetPosition(
        defenseFormation,
        defender.playerPosition,
        isDefendingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, defender.config.physical.height / 2, targetPos.z);
        defender.setPosition(pos);
        defender.lookAt(ballHandlerPos);
      }
    }

    // シュートクロックをリセット
    if (this.context.shotClockController) {
      this.context.shotClockController.reset(ballHandler.team);
    }

    // 1on1バトルコントローラーをリセット（接触状態やバトル状態をクリア）
    if (this.context.onResetOneOnOneBattle) {
      this.context.onResetOneOnOneBattle();
    }

    // 全員をBALL_LOST状態に設定
    // 次フレームでBallCatchSystemがボールを拾い、自然に状態遷移が発生する
    for (const char of receivingTeam) {
      char.setState(CharacterState.BALL_LOST);
    }
    for (const char of defendingTeam) {
      char.setState(CharacterState.BALL_LOST);
    }

    // 全AIを強制初期化（前回の行動や状態を完全にクリア）
    for (const ai of this.context.getCharacterAIs()) {
      ai.forceInitialize();
    }
  }

  // =============================================================================
  // チェックモード用リセット
  // =============================================================================

  /**
   * チェックモード用の完全リセット
   */
  public resetForCheckMode(): void {
    this.allyScore = 0;
    this.enemyScore = 0;
    this.winner = null;

    this.pendingGoalReset = false;
    this.pendingGoalScoringTeam = null;
    this.goalResetTimer = 0;

    this.pendingOutOfBoundsReset = false;
    this.outOfBoundsResetTimer = 0;
    this.outOfBoundsBallPosition = null;

    this.pendingShotClockViolationReset = false;
    this.shotClockViolationResetTimer = 0;
    this.shotClockViolatingTeam = null;
  }

  // =============================================================================
  // パブリックAPI
  // =============================================================================

  /**
   * リセット待機中かどうか
   */
  public isAnyResetPending(): boolean {
    return this.pendingGoalReset ||
           this.pendingOutOfBoundsReset ||
           this.pendingShotClockViolationReset;
  }

  /**
   * ゴールリセット待機中かどうか
   */
  public isGoalResetPending(): boolean {
    return this.pendingGoalReset;
  }

  /**
   * アウトオブバウンズリセット待機中かどうか
   */
  public isOutOfBoundsResetPending(): boolean {
    return this.pendingOutOfBoundsReset;
  }

  /**
   * スコアを取得
   */
  public getScores(): { ally: number; enemy: number } {
    return { ally: this.allyScore, enemy: this.enemyScore };
  }

  /**
   * 勝者を取得
   */
  public getWinner(): 'ally' | 'enemy' | null {
    return this.winner;
  }

  /**
   * スコアをリセット
   */
  public resetScores(): void {
    this.allyScore = 0;
    this.enemyScore = 0;
    this.winner = null;
  }
}
