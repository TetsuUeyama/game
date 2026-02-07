/**
 * スローインマネージャー
 * スローインに関するロジックを管理
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { CharacterState } from "../../types/CharacterState";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { FIELD_CONFIG } from "../../config/gameConfig";
import { FieldGridUtils, CellCoord } from "../../config/FieldGridConfig";
import { FormationUtils } from "../../config/FormationConfig";
import { ShotClockController } from "../../controllers/ShotClockController";

/**
 * スローイン用コンテキスト
 */
export interface ThrowInContext {
  ball: Ball;
  shotClockController?: ShotClockController;

  // キャラクター取得
  getAllyCharacters: () => Character[];
  getEnemyCharacters: () => Character[];

  // AI初期化
  getCharacterAIs: () => { forceInitialize: () => void }[];

  // コールバック
  onThrowInComplete?: () => void;
  onThrowInViolation?: (violatingTeam: 'ally' | 'enemy', position: Vector3) => void;
}

/**
 * スローインマネージャー
 */
export class ThrowInManager {
  private context: ThrowInContext;

  // スローイン状態
  private isThrowInPending: boolean = false;
  private throwInTimer: number = 0;
  private throwInThrower: Character | null = null;
  private throwInPosition: Vector3 | null = null;
  private throwInBallThrown: boolean = false;

  // 5秒ルール
  private throwInViolationTimer: number = 0;
  private isThrowInViolationTimerRunning: boolean = false;

  // 設定
  private readonly throwInDelay: number = 3.0;
  private readonly throwInTimeLimit: number = 5.0;

  constructor(context: ThrowInContext) {
    this.context = context;
  }

  /**
   * コンテキストを更新
   */
  public updateContext(context: Partial<ThrowInContext>): void {
    this.context = { ...this.context, ...context };
  }

  // =============================================================================
  // スローインセットアップ
  // =============================================================================

  /**
   * スローインリセットを実行
   */
  public executeReset(offendingTeam: 'ally' | 'enemy', ballPosition: Vector3): void {
    this.context.ball.endFlight();

    const allyCharacters = this.context.getAllyCharacters();
    const enemyCharacters = this.context.getEnemyCharacters();

    const throwingTeam = offendingTeam === 'ally' ? enemyCharacters : allyCharacters;
    const defendingTeam = offendingTeam === 'ally' ? allyCharacters : enemyCharacters;

    if (throwingTeam.length < 2) {
      console.warn('[ThrowInManager] スローインに必要な選手が不足しています');
      return;
    }

    // スローイン位置を計算
    const { throwInPosition, receiverPosition } = this.calculateThrowInPosition(ballPosition);

    // スローイン担当者（PGを優先）
    const thrower = throwingTeam.find(c => c.playerPosition === 'PG') || throwingTeam[0];
    const receiver = throwingTeam.find(c => c !== thrower) || throwingTeam[1];

    // スローイン担当者を配置
    const throwerPos = new Vector3(
      throwInPosition.x,
      thrower.config.physical.height / 2,
      throwInPosition.z
    );
    thrower.setPosition(throwerPos, true);

    // レシーバーを配置
    const receiverPos = new Vector3(
      receiverPosition.x,
      receiver.config.physical.height / 2,
      receiverPosition.z
    );
    receiver.setPosition(receiverPos);

    // 向きを設定
    thrower.lookAt(receiverPos);
    receiver.lookAt(throwerPos);

    // 他のオフェンスメンバーをフォーメーション位置に配置
    const offenseFormation = FormationUtils.getDefaultOffenseFormation();
    const isThrowingTeamAlly = offendingTeam === 'enemy';
    for (const teammate of throwingTeam) {
      if (teammate === thrower || teammate === receiver) continue;
      if (!teammate.playerPosition) continue;

      const targetPos = FormationUtils.getTargetPosition(
        offenseFormation,
        teammate.playerPosition,
        isThrowingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, teammate.config.physical.height / 2, targetPos.z);
        teammate.setPosition(pos);
        teammate.lookAt(receiverPos);
      }
    }

    // ディフェンスチームをフォーメーション位置に配置
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
        defender.lookAt(receiverPos);
      }
    }

    // ボールをスローイン担当者に渡す
    this.context.ball.setHolder(thrower);

    // スローイン状態を設定
    this.isThrowInPending = true;
    this.throwInTimer = this.throwInDelay;
    this.throwInThrower = thrower;
    this.throwInBallThrown = false;
    this.throwInPosition = throwerPos.clone();

    // キャラクター状態を設定
    this.setThrowInStates(thrower, throwingTeam, defendingTeam);

    // 全AIを強制初期化（前回の行動や状態を完全にクリア）
    for (const ai of this.context.getCharacterAIs()) {
      ai.forceInitialize();
    }

    // シュートクロックを停止
    if (this.context.shotClockController) {
      this.context.shotClockController.stop();
    }
  }

  /**
   * スローイン位置を計算
   */
  private calculateThrowInPosition(ballPosition: Vector3): {
    throwInPosition: Vector3;
    throwInCell: CellCoord;
    receiverPosition: Vector3;
  } {
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;

    const throwInCell = FieldGridUtils.getThrowInCell(ballPosition.x, ballPosition.z);
    const throwInWorldPos = FieldGridUtils.outerCellToWorld(throwInCell.col, throwInCell.row);

    if (!throwInWorldPos) {
      const outsideOffset = 0.5;
      const throwInX = ballPosition.x >= 0 ? halfWidth + outsideOffset : -halfWidth - outsideOffset;
      const throwInZ = Math.max(-halfLength, Math.min(halfLength, ballPosition.z));
      return {
        throwInPosition: new Vector3(throwInX, 0, throwInZ),
        throwInCell,
        receiverPosition: new Vector3(throwInX >= 0 ? throwInX - 2.5 : throwInX + 2.5, 0, throwInZ),
      };
    }

    const receiverDistance = 4.0;
    let receiverX: number;
    let receiverZ: number;
    let adjustedThrowInX = throwInWorldPos.x;
    const adjustedThrowInZ = throwInWorldPos.z;

    if (throwInCell.col === '@') {
      receiverX = throwInWorldPos.x + receiverDistance;
      receiverZ = throwInWorldPos.z;
    } else if (throwInCell.col === 'P') {
      receiverX = throwInWorldPos.x - receiverDistance;
      receiverZ = throwInWorldPos.z;
    } else if (throwInCell.row === 0) {
      const goalAvoidanceOffset = 3.0;
      adjustedThrowInX = throwInWorldPos.x >= 0
        ? Math.max(throwInWorldPos.x, goalAvoidanceOffset)
        : Math.min(throwInWorldPos.x, -goalAvoidanceOffset);
      receiverX = adjustedThrowInX;
      receiverZ = throwInWorldPos.z - receiverDistance;
    } else if (throwInCell.row === 31) {
      const goalAvoidanceOffset = 3.0;
      adjustedThrowInX = throwInWorldPos.x >= 0
        ? Math.max(throwInWorldPos.x, goalAvoidanceOffset)
        : Math.min(throwInWorldPos.x, -goalAvoidanceOffset);
      receiverX = adjustedThrowInX;
      receiverZ = throwInWorldPos.z + receiverDistance;
    } else {
      console.warn(`[ThrowInManager] デフォルト分岐 - col=${throwInCell.col}, row=${throwInCell.row}`);
      receiverX = throwInWorldPos.x;
      receiverZ = throwInWorldPos.z;
    }

    const throwInPosition = new Vector3(adjustedThrowInX, 0, adjustedThrowInZ);

    receiverX = Math.max(-halfWidth + 0.5, Math.min(halfWidth - 0.5, receiverX));
    receiverZ = Math.max(-halfLength + 0.5, Math.min(halfLength - 0.5, receiverZ));

    return { throwInPosition, throwInCell, receiverPosition: new Vector3(receiverX, 0, receiverZ) };
  }

  /**
   * スローイン状態を設定
   */
  private setThrowInStates(
    thrower: Character,
    throwingTeam: Character[],
    defendingTeam: Character[]
  ): void {
    const allChars = [...throwingTeam, ...defendingTeam];
    for (const char of allChars) {
      char.stopMovement();
      char.playMotion(IDLE_MOTION);
      const actionController = char.getActionController();
      if (actionController) {
        actionController.cancelAction();
      }
      char.setAsThrowInThrower(null);
    }

    thrower.setState(CharacterState.ON_BALL_PLAYER);
    thrower.setAsThrowInThrower(this.throwInPosition!);

    for (const char of throwingTeam) {
      if (char !== thrower) {
        char.setState(CharacterState.OFF_BALL_PLAYER);
      }
    }

    const throwerPos = thrower.getPosition();
    let closestDefender: Character | null = null;
    let closestDist = Infinity;
    for (const char of defendingTeam) {
      const dist = Vector3.Distance(char.getPosition(), throwerPos);
      if (dist < closestDist) {
        closestDist = dist;
        closestDefender = char;
      }
    }

    for (const char of defendingTeam) {
      if (char === closestDefender) {
        char.setState(CharacterState.ON_BALL_DEFENDER);
      } else {
        char.setState(CharacterState.OFF_BALL_DEFENDER);
      }
    }

    this.context.ball.clearThrowInLock();
  }

  // =============================================================================
  // スローイン更新
  // =============================================================================

  /**
   * スローイン状態を更新（毎フレーム呼び出し）
   */
  public update(deltaTime: number): void {
    if (!this.isActive()) return;

    // スローイン完了チェック
    const currentHolder = this.context.ball.getHolder();
    if (this.throwInThrower && currentHolder && currentHolder !== this.throwInThrower) {
      this.complete();
      return;
    }

    // 投げた後のチェック
    const lastToucher = this.context.ball.getLastToucher();
    if (this.throwInThrower && !currentHolder && !this.context.ball.isInFlight()) {
      if (lastToucher === this.throwInThrower && this.context.ball.getPassTarget()) {
        // パスが進行中
      }
    }

    // 位置強制
    this.enforcePositions();

    // スローイン実行待機
    if (this.isThrowInPending) {
      if (this.throwInThrower && this.throwInPosition) {
        this.throwInThrower.setPosition(this.throwInPosition, true);

        const holder = this.context.ball.getHolder();
        const throwerAlreadyThrew = lastToucher === this.throwInThrower && holder !== this.throwInThrower;

        if (holder !== this.throwInThrower && !throwerAlreadyThrew) {
          this.context.ball.setHolder(this.throwInThrower);
        }
      }

      this.throwInTimer -= deltaTime;
      if (this.throwInTimer <= 0) {
        this.execute();
      }
    } else if (this.throwInThrower && this.throwInPosition) {
      const throwerHasBall = this.context.ball.getHolder() === this.throwInThrower;
      const throwerHasThrown = lastToucher === this.throwInThrower && !throwerHasBall;

      if (throwerHasThrown) {
        if (!this.throwInBallThrown) {
          this.throwInBallThrown = true;
          this.throwInThrower.setAsThrowInThrower(null);
        }
      } else {
        this.throwInThrower.setPosition(this.throwInPosition, true);
        this.throwInThrower.stopMovement();
      }

      // 5秒ルールチェック
      if (!throwerHasThrown && this.isThrowInViolationTimerRunning) {
        this.throwInViolationTimer -= deltaTime;
        if (this.throwInViolationTimer <= 0) {
          this.handleViolation();
        }
      }
    }
  }

  /**
   * スローインを実行
   */
  private execute(): void {
    if (!this.throwInThrower || !this.throwInPosition) {
      this.clear();
      return;
    }

    const holder = this.context.ball.getHolder();
    const lastToucher = this.context.ball.getLastToucher();
    const ballAlreadyThrown = holder === null &&
      (this.context.ball.isInFlight() || lastToucher === this.throwInThrower);

    if (holder !== this.throwInThrower && !ballAlreadyThrown) {
      this.clear();
      return;
    }

    this.throwInThrower.setPosition(this.throwInPosition, true);

    // 5秒ルール開始
    this.throwInViolationTimer = this.throwInTimeLimit;
    this.isThrowInViolationTimerRunning = true;

    this.context.ball.clearThrowInLock();

    this.isThrowInPending = false;
    this.throwInTimer = 0;
  }

  /**
   * スローイン位置を強制
   */
  private enforcePositions(): void {
    if (this.throwInBallThrown) {
      return;
    }

    if (this.isThrowInPending) {
      if (this.throwInThrower && this.throwInPosition) {
        this.throwInThrower.setPosition(this.throwInPosition, true);
      }
    } else if (this.throwInThrower && this.throwInPosition) {
      this.throwInThrower.setPosition(this.throwInPosition, true);
      this.throwInThrower.stopMovement();
    }
  }

  /**
   * 5秒ルール違反処理
   */
  private handleViolation(): void {
    if (!this.throwInThrower) return;

    const violatingTeam = this.throwInThrower.team;
    const position = this.throwInPosition?.clone() || this.context.ball.getPosition().clone();

    this.throwInThrower.setAsThrowInThrower(null);

    this.isThrowInViolationTimerRunning = false;
    this.throwInViolationTimer = 0;
    this.clear();

    if (this.context.onThrowInViolation) {
      this.context.onThrowInViolation(violatingTeam, position);
    }
  }

  /**
   * スローイン完了
   */
  private complete(): void {
    this.isThrowInViolationTimerRunning = false;
    this.throwInViolationTimer = 0;

    this.isThrowInPending = false;
    this.throwInTimer = 0;

    if (this.throwInThrower) {
      this.throwInThrower.setAsThrowInThrower(null);
    }
    this.throwInThrower = null;
    this.throwInPosition = null;

    this.clearAllThrowInCharacterStates();

    if (this.context.onThrowInComplete) {
      this.context.onThrowInComplete();
    }
  }

  /**
   * スローイン状態をクリア
   */
  public clear(): void {
    this.isThrowInPending = false;
    this.throwInTimer = 0;
    this.throwInThrower = null;
    this.throwInPosition = null;
    this.throwInBallThrown = false;

    this.isThrowInViolationTimerRunning = false;
    this.throwInViolationTimer = 0;

    this.context.ball.clearThrowInLock();
    this.clearAllThrowInCharacterStates();
  }

  /**
   * 全キャラクターのスローイン状態をクリア
   */
  private clearAllThrowInCharacterStates(): void {
    const allCharacters = [
      ...this.context.getAllyCharacters(),
      ...this.context.getEnemyCharacters()
    ];

    for (const char of allCharacters) {
      char.setAsThrowInThrower(null);
    }
  }

  // =============================================================================
  // パブリックAPI
  // =============================================================================

  /**
   * スローインがアクティブかどうか
   */
  public isActive(): boolean {
    return this.isThrowInPending || this.throwInThrower !== null;
  }

  /**
   * スローイン待機中かどうか
   */
  public isPending(): boolean {
    return this.isThrowInPending;
  }

  /**
   * スロワーを取得
   */
  public getThrower(): Character | null {
    return this.throwInThrower;
  }

  /**
   * スローイン位置を取得
   */
  public getPosition(): Vector3 | null {
    return this.throwInPosition?.clone() || null;
  }

  /**
   * 残り時間を取得
   */
  public getRemainingTime(): number {
    return Math.max(0, this.throwInViolationTimer);
  }

  /**
   * タイマーが動作中かどうか
   */
  public isTimerRunning(): boolean {
    return this.isThrowInViolationTimerRunning;
  }

  /**
   * ボールが投げられたかどうか
   */
  public hasBallBeenThrown(): boolean {
    return this.throwInBallThrown;
  }
}
