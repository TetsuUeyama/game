/**
 * パスチェックコントローラー
 * パサーとレシーバーを配置し、パスの成功率をテスト
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { FieldGridUtils } from "../../config/FieldGridConfig";
import { DEFAULT_CHARACTER_CONFIG } from "../../types/CharacterStats";
import { CharacterState } from "../../types/CharacterState";
import { PassType } from "../../config/PassTrajectoryConfig";
import { DRIBBLE_STANCE_MOTION } from "../../motion/DribbleMotion";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { DEFENSE_STANCE_MOTION } from "../../motion/DefenseMotion";
import {
  PASS_CHECK_TIMING,
  PASS_CHECK_DISTANCE,
  DefenderPlacement,
  PassCheckResult,
  PassCheckConfig,
  PassCheckState,
  PassCheckProgress,
} from "../../config/check/PassCheckConfig";

// 型をre-export
export type { DefenderPlacement, PassCheckResult, PassCheckConfig, PassCheckState, PassCheckProgress };

/**
 * パスチェックコントローラー
 * パサーとレシーバーを配置し、パスの成功率をテスト
 */
export class PassCheckController {
  private passer: Character;
  private receiver: Character;
  private defenders: Character[] = [];
  private ball: Ball;
  private field: Field;

  // 設定
  private config: PassCheckConfig;

  // 状態
  private state: PassCheckState = 'idle';
  private currentTrialNumber: number = 0;
  private trialStartTime: number = 0;
  private trialElapsedTime: number = 0;
  private trialCompleted: boolean = false;
  private passStarted: boolean = false;
  private passStartDelayTimer: number = 0;

  // パス情報
  private currentPassType: PassType | null = null;
  private passFlightStartTime: number = 0;

  // 結果
  private results: PassCheckResult[] = [];

  // コールバック
  private onProgressCallback: ((progress: PassCheckProgress) => void) | null = null;
  private onTrialCompleteCallback: ((result: PassCheckResult) => void) | null = null;
  private onCompleteCallback: ((results: PassCheckResult[]) => void) | null = null;

  constructor(
    passer: Character,
    receiver: Character,
    ball: Ball,
    field: Field,
    config: PassCheckConfig
  ) {
    this.passer = passer;
    this.receiver = receiver;
    this.ball = ball;
    this.field = field;
    this.config = {
      ...config,
      trialsPerConfig: config.trialsPerConfig ?? PASS_CHECK_TIMING.DEFAULT_TRIALS_PER_CONFIG,
      timeoutSeconds: config.timeoutSeconds ?? PASS_CHECK_TIMING.DEFAULT_TIMEOUT_SECONDS,
    };
  }

  /**
   * ディフェンダーを設定
   */
  public setDefenders(defenders: Character[]): void {
    this.defenders = defenders;
  }

  /**
   * パスチェックを開始
   */
  public start(): void {
    if (this.state === 'running') return;

    this.state = 'running';
    this.currentTrialNumber = 0;
    this.results = [];

    // 最初の試行を開始
    this.startNextTrial();
  }

  /**
   * 次の試行を開始
   */
  private startNextTrial(): void {
    if (this.state !== 'running') return;

    this.currentTrialNumber++;

    if (this.currentTrialNumber > this.config.trialsPerConfig) {
      // すべての試行が完了
      this.state = 'completed';
      if (this.onCompleteCallback) {
        this.onCompleteCallback(this.results);
      }
      return;
    }

    // 試行完了フラグをリセット
    this.trialCompleted = false;
    this.passStarted = false;
    this.passStartDelayTimer = 0;
    this.currentPassType = null;

    // キャラクターを配置
    this.setupCharacters();

    // 試行開始時間を記録
    this.trialStartTime = Date.now();
    this.trialElapsedTime = 0;

    this.reportProgress();
  }

  /**
   * キャラクターを配置
   */
  private setupCharacters(): void {
    // パサーをリセット・配置
    this.resetCharacterState(this.passer);
    const passerWorldPos = FieldGridUtils.cellToWorld(
      this.config.passerCell.col,
      this.config.passerCell.row
    );
    if (passerWorldPos) {
      const passerHeight = this.passer.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
      this.passer.setPosition(new Vector3(passerWorldPos.x, passerHeight / 2, passerWorldPos.z));
    }

    // レシーバーをリセット・配置
    this.resetCharacterState(this.receiver);
    const receiverWorldPos = FieldGridUtils.cellToWorld(
      this.config.receiverCell.col,
      this.config.receiverCell.row
    );
    if (receiverWorldPos) {
      const receiverHeight = this.receiver.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
      this.receiver.setPosition(new Vector3(receiverWorldPos.x, receiverHeight / 2, receiverWorldPos.z));
    }

    // パサーをレシーバー方向に向ける
    this.passer.lookAt(this.receiver.getPosition());

    // レシーバーをパサー方向に向ける
    this.receiver.lookAt(this.passer.getPosition());

    // ディフェンダーを配置
    this.setupDefenders();

    // ボールをパサーに持たせる
    this.ball.setHolder(this.passer);

    // チーム設定
    const offenseTeam = this.config.targetGoal === 'goal1' ? 'ally' : 'enemy';
    const defenseTeam = this.config.targetGoal === 'goal1' ? 'enemy' : 'ally';

    this.passer.team = offenseTeam;
    this.receiver.team = offenseTeam;

    for (const defender of this.defenders) {
      defender.team = defenseTeam;
    }

    // 状態を設定
    this.passer.setState(CharacterState.ON_BALL_PLAYER);
    this.receiver.setState(CharacterState.OFF_BALL_PLAYER);

    // モーションを適用（チェックモード中はCharacterAIが動かないため手動で設定）
    this.passer.playMotion(DRIBBLE_STANCE_MOTION);
    this.receiver.playMotion(IDLE_MOTION);
  }

  /**
   * ディフェンダーを配置
   */
  private setupDefenders(): void {
    if (!this.config.defenders || this.defenders.length === 0) {
      return;
    }

    for (let i = 0; i < this.defenders.length && i < this.config.defenders.length; i++) {
      const defender = this.defenders[i];
      const placement = this.config.defenders[i];

      this.resetCharacterState(defender);

      const defenderWorldPos = FieldGridUtils.cellToWorld(
        placement.cell.col,
        placement.cell.row
      );

      if (defenderWorldPos) {
        const defenderHeight = defender.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
        defender.setPosition(new Vector3(defenderWorldPos.x, defenderHeight / 2, defenderWorldPos.z));

        // ディフェンダーのタイプに応じて向きを設定
        if (placement.type === 'on_ball') {
          // オンボールディフェンダーはパサーを向く
          defender.lookAt(this.passer.getPosition());
          defender.setState(CharacterState.ON_BALL_DEFENDER);
        } else {
          // オフボールディフェンダーはパスレーンを向く（パサーとレシーバーの中間点）
          const midPoint = this.passer.getPosition().add(this.receiver.getPosition()).scale(0.5);
          defender.lookAt(midPoint);
          defender.setState(CharacterState.OFF_BALL_DEFENDER);
        }

        // ディフェンダーのモーションを適用（チェックモード中はCharacterAIが動かないため手動で設定）
        defender.playMotion(DEFENSE_STANCE_MOTION);
      }
    }
  }

  /**
   * キャラクターの状態をリセット
   */
  private resetCharacterState(character: Character): void {
    // アクションコントローラーをリセット
    const actionController = character.getActionController();
    if (actionController) {
      actionController.forceEndAction();
    }

    // 移動を停止
    character.velocity = Vector3.Zero();
    character.stopMotion();
  }

  /**
   * パスを実行
   */
  private executePass(): void {
    if (this.passStarted) return;

    this.passStarted = true;
    this.passFlightStartTime = Date.now();

    // パスタイプを決定
    const passType = this.config.passType ?? PassType.CHEST;
    this.currentPassType = passType;

    // レシーバーの位置を取得
    // キャラクターのposition.yはheight/2にあるため、胸の高さ(height*0.65)までのオフセットはheight*0.15
    const receiverPos = this.receiver.getPosition();
    const receiverHeight = this.receiver.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
    const targetPosition = new Vector3(
      receiverPos.x,
      receiverPos.y + receiverHeight * 0.15, // 胸の高さ
      receiverPos.z
    );

    // パスを実行
    const passTypeMap: Record<PassType, 'chest' | 'bounce' | 'overhead'> = {
      [PassType.CHEST]: 'chest',
      [PassType.BOUNCE]: 'bounce',
      [PassType.LOB]: 'overhead',
      [PassType.LONG]: 'chest',
      [PassType.ONE_HAND]: 'chest',
    };

    this.ball.passWithArc(targetPosition, this.receiver, passTypeMap[passType]);

    console.log(`[PassCheckController] パス実行: ${passType} -> ${this.receiver.playerPosition}`);
  }

  /**
   * 一時停止
   */
  public pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
    }
  }

  /**
   * 再開
   */
  public resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
    }
  }

  /**
   * 中断
   */
  public abort(): void {
    this.state = 'aborted';
    if (this.onCompleteCallback) {
      this.onCompleteCallback(this.results);
    }
  }

  /**
   * 更新処理（毎フレーム呼び出し）
   */
  public update(deltaTime: number): void {
    if (this.state !== 'running') return;

    // 経過時間を更新
    this.trialElapsedTime = (Date.now() - this.trialStartTime) / 1000;

    // パス開始遅延を処理
    if (!this.passStarted) {
      this.passStartDelayTimer += deltaTime * 1000;
      if (this.passStartDelayTimer >= PASS_CHECK_TIMING.PASS_START_DELAY_MS) {
        this.executePass();
      }
    }

    // 試行結果をチェック
    this.checkTrialResult();

    // 進捗を報告
    this.reportProgress();
  }

  /**
   * 試行結果をチェック
   */
  private checkTrialResult(): void {
    // 既に試行が完了している場合はスキップ
    if (this.trialCompleted) {
      return;
    }

    // パスがまだ開始されていない場合はスキップ
    if (!this.passStarted) {
      return;
    }

    const holder = this.ball.getHolder();

    // レシーバーがキャッチした場合
    if (holder === this.receiver) {
      const flightTime = (Date.now() - this.passFlightStartTime) / 1000;
      this.completeTrial({
        trialNumber: this.currentTrialNumber,
        success: true,
        passType: this.currentPassType,
        flightTime,
        intercepted: false,
        reason: 'caught',
      });
      return;
    }

    // ディフェンダーがインターセプトした場合
    for (const defender of this.defenders) {
      if (holder === defender) {
        const flightTime = (Date.now() - this.passFlightStartTime) / 1000;
        this.completeTrial({
          trialNumber: this.currentTrialNumber,
          success: false,
          passType: this.currentPassType,
          flightTime,
          intercepted: true,
          reason: 'intercepted',
          interceptedBy: defender.playerPosition ?? 'unknown',
        });
        return;
      }
    }

    // ボールが飛行中でなく、誰も持っていない場合（ミス）
    if (!this.ball.isInFlight() && holder === null) {
      const ballPos = this.ball.getPosition();
      const receiverPos = this.receiver.getPosition();
      const distance = Vector3.Distance(
        new Vector3(ballPos.x, 0, ballPos.z),
        new Vector3(receiverPos.x, 0, receiverPos.z)
      );

      // レシーバー付近に落ちた場合はキャッチ失敗
      if (distance <= PASS_CHECK_DISTANCE.CATCH_SUCCESS_DISTANCE * 2) {
        this.completeTrial({
          trialNumber: this.currentTrialNumber,
          success: false,
          passType: this.currentPassType,
          flightTime: null,
          intercepted: false,
          reason: 'missed',
        });
        return;
      }

      // コート外に出た場合
      if (
        Math.abs(ballPos.x) > PASS_CHECK_DISTANCE.FIELD_HALF_WIDTH + PASS_CHECK_DISTANCE.OUT_OF_BOUNDS_MARGIN ||
        Math.abs(ballPos.z) > PASS_CHECK_DISTANCE.FIELD_HALF_LENGTH + PASS_CHECK_DISTANCE.OUT_OF_BOUNDS_MARGIN
      ) {
        this.completeTrial({
          trialNumber: this.currentTrialNumber,
          success: false,
          passType: this.currentPassType,
          flightTime: null,
          intercepted: false,
          reason: 'out_of_bounds',
        });
        return;
      }
    }

    // タイムアウトチェック
    if (this.trialElapsedTime >= this.config.timeoutSeconds) {
      this.completeTrial({
        trialNumber: this.currentTrialNumber,
        success: false,
        passType: this.currentPassType,
        flightTime: null,
        intercepted: false,
        reason: 'timeout',
      });
      return;
    }
  }

  /**
   * 試行を完了
   */
  private completeTrial(result: PassCheckResult): void {
    // 既に完了している場合は無視
    if (this.trialCompleted) {
      return;
    }

    // 完了フラグを立てる
    this.trialCompleted = true;

    this.results.push(result);

    if (this.onTrialCompleteCallback) {
      this.onTrialCompleteCallback(result);
    }

    // 少し遅延を入れて次の試行へ
    setTimeout(() => {
      if (this.state === 'running') {
        this.startNextTrial();
      }
    }, PASS_CHECK_TIMING.TRIAL_INTERVAL_DELAY_MS);
  }

  /**
   * 進捗を報告
   */
  private reportProgress(): void {
    if (this.onProgressCallback) {
      this.onProgressCallback({
        totalTrials: this.config.trialsPerConfig,
        completedTrials: this.results.length,
        currentTrialNumber: this.currentTrialNumber,
        elapsedTime: this.trialElapsedTime,
        state: this.state,
        waitingForPass: !this.passStarted,
      });
    }
  }

  /**
   * 進捗コールバックを設定
   */
  public setOnProgressCallback(callback: (progress: PassCheckProgress) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * 試行完了コールバックを設定
   */
  public setOnTrialCompleteCallback(callback: (result: PassCheckResult) => void): void {
    this.onTrialCompleteCallback = callback;
  }

  /**
   * 完了コールバックを設定
   */
  public setOnCompleteCallback(callback: (results: PassCheckResult[]) => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * 現在の状態を取得
   */
  public getState(): PassCheckState {
    return this.state;
  }

  /**
   * 結果を取得
   */
  public getResults(): PassCheckResult[] {
    return [...this.results];
  }

  /**
   * 統計情報を取得
   */
  public getStatistics(): {
    totalTrials: number;
    successCount: number;
    successRate: number;
    averageFlightTime: number | null;
    interceptedCount: number;
    missedCount: number;
    timeoutCount: number;
  } {
    const successResults = this.results.filter(r => r.success);
    const successCount = successResults.length;
    const interceptedCount = this.results.filter(r => r.reason === 'intercepted').length;
    const missedCount = this.results.filter(r => r.reason === 'missed').length;
    const timeoutCount = this.results.filter(r => r.reason === 'timeout').length;

    const flightTimes = successResults
      .filter(r => r.flightTime !== null)
      .map(r => r.flightTime as number);

    const averageFlightTime = flightTimes.length > 0
      ? flightTimes.reduce((sum, t) => sum + t, 0) / flightTimes.length
      : null;

    return {
      totalTrials: this.results.length,
      successCount,
      successRate: this.results.length > 0 ? (successCount / this.results.length) * 100 : 0,
      averageFlightTime,
      interceptedCount,
      missedCount,
      timeoutCount,
    };
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.state = 'idle';
    this.defenders = [];
    this.results = [];
  }
}
