import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { FieldGridUtils } from "@/GamePlay/GameSystem/CharacterMove/Config/FieldGridConfig";
import { DEFAULT_CHARACTER_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Types/CharacterStats";
import { CharacterState } from "@/GamePlay/GameSystem/CharacterMove/Types/CharacterState";
import { CharacterAI } from "@/GamePlay/GameSystem/DecisionMakingSystem/AI/CharacterAI";
import { FeintController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/FeintController";
import {
  DRIBBLE_CHECK_DISTANCE,
  DRIBBLE_CHECK_TIMING,
  DribbleCheckResult,
  DribbleCheckConfig,
  DribbleCheckState,
  DribbleCheckProgress,
} from "@/GamePlay/MatchEngine/CheckConfig/DribbleCheckConfig";

// サークル接触判定のコールバック型
type CirclesInContactCallback = () => boolean;

// 型をre-export
export type { DribbleCheckResult, DribbleCheckConfig, DribbleCheckState, DribbleCheckProgress };

/**
 * ドリブルチェックコントローラー
 * ドリブラーとディフェンダーを配置し、目標地点への到達をテスト
 */
export class DribbleCheckController {
  private dribbler: Character;
  private defender: Character;
  private ball: Ball;
  private field: Field;
  private dribblerAI: CharacterAI | null = null;
  private defenderAI: CharacterAI | null = null;
  private feintController: FeintController;

  // 設定
  private config: DribbleCheckConfig;

  // 状態
  private state: DribbleCheckState = 'idle';
  private currentTrialNumber: number = 0;
  private trialStartTime: number = 0;
  private trialElapsedTime: number = 0;
  private trialCompleted: boolean = false; // 現在の試行が完了したかどうか

  // 目標位置
  private targetPosition: Vector3 = Vector3.Zero();

  // 結果
  private results: DribbleCheckResult[] = [];

  // コールバック
  private onProgressCallback: ((progress: DribbleCheckProgress) => void) | null = null;
  private onTrialCompleteCallback: ((result: DribbleCheckResult) => void) | null = null;
  private onCompleteCallback: ((results: DribbleCheckResult[]) => void) | null = null;

  // getAllCharacters関数（AI用）
  private getAllCharacters: () => Character[];

  // サークル接触判定コールバック（試合モードと同じスキップ処理用）
  private isCirclesInContact: CirclesInContactCallback;

  constructor(
    dribbler: Character,
    defender: Character,
    ball: Ball,
    field: Field,
    getAllCharacters: () => Character[],
    config: DribbleCheckConfig,
    feintController: FeintController,
    isCirclesInContact?: CirclesInContactCallback
  ) {
    this.dribbler = dribbler;
    this.defender = defender;
    this.ball = ball;
    this.field = field;
    this.getAllCharacters = getAllCharacters;
    this.feintController = feintController;
    this.isCirclesInContact = isCirclesInContact ?? (() => false);
    this.config = {
      ...config,
      trialsPerConfig: config.trialsPerConfig ?? DRIBBLE_CHECK_TIMING.DEFAULT_TRIALS_PER_CONFIG,
      timeoutSeconds: config.timeoutSeconds ?? DRIBBLE_CHECK_TIMING.DEFAULT_TIMEOUT_SECONDS,
    };
  }

  /**
   * ドリブルチェックを開始
   */
  public start(): void {
    if (this.state === 'running') return;

    this.state = 'running';
    this.currentTrialNumber = 0;
    this.results = [];

    // 目標位置を計算
    const targetWorldPos = FieldGridUtils.cellToWorld(
      this.config.targetCell.col,
      this.config.targetCell.row
    );
    if (targetWorldPos) {
      this.targetPosition = new Vector3(targetWorldPos.x, 0, targetWorldPos.z);
    }

    // AIを初期化
    this.initializeAI();

    // 最初の試行を開始
    this.startNextTrial();
  }

  /**
   * AIを初期化
   */
  private initializeAI(): void {
    // ドリブラーのAI（攻撃側）- 試合モードと同じCharacterAIを使用
    this.dribblerAI = new CharacterAI(
      this.dribbler,
      this.ball,
      this.getAllCharacters(),
      this.field
    );
    // フェイントコントローラーを設定
    this.dribblerAI.setFeintController(this.feintController);
    // 目標位置オーバーライドを設定（シュート・パスを無効化し、この位置に向かう）
    this.dribblerAI.setTargetPositionOverride(this.targetPosition);

    // ディフェンダーのAI（守備側）- 試合モードと同じCharacterAIを使用
    this.defenderAI = new CharacterAI(
      this.defender,
      this.ball,
      this.getAllCharacters(),
      this.field
    );
    // ディフェンダーにもフェイントコントローラーを設定（フェイントに反応できるように）
    this.defenderAI.setFeintController(this.feintController);
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
    // キャラクターの状態をリセット
    this.resetCharacterState(this.dribbler);
    this.resetCharacterState(this.defender);

    // ドリブラーを配置
    const dribblerWorldPos = FieldGridUtils.cellToWorld(
      this.config.dribblerCell.col,
      this.config.dribblerCell.row
    );
    if (dribblerWorldPos) {
      const dribblerHeight = this.dribbler.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
      this.dribbler.setPosition(new Vector3(dribblerWorldPos.x, dribblerHeight / 2, dribblerWorldPos.z));

      // 目標方向を向く
      this.dribbler.lookAt(this.targetPosition);
    }

    // ディフェンダーを配置
    const defenderWorldPos = FieldGridUtils.cellToWorld(
      this.config.defenderCell.col,
      this.config.defenderCell.row
    );
    if (defenderWorldPos) {
      const defenderHeight = this.defender.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
      this.defender.setPosition(new Vector3(defenderWorldPos.x, defenderHeight / 2, defenderWorldPos.z));

      // ドリブラー方向を向く
      this.defender.lookAt(this.dribbler.getPosition());
    }

    // ボールをドリブラーに持たせる
    this.ball.setHolder(this.dribbler);

    // チーム設定
    this.dribbler.team = this.config.targetGoal === 'goal1' ? 'ally' : 'enemy';
    this.defender.team = this.config.targetGoal === 'goal1' ? 'enemy' : 'ally';

    // 状態を設定
    this.dribbler.setState(CharacterState.ON_BALL_PLAYER);
    this.defender.setState(CharacterState.ON_BALL_DEFENDER);

    // AIの目標位置を再設定
    if (this.dribblerAI) {
      this.dribblerAI.setTargetPositionOverride(this.targetPosition);
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
   * 試合モードと同じロジックを使用（サークル接触時はAI更新をスキップ）
   */
  public update(deltaTime: number): void {
    if (this.state !== 'running') return;

    // 経過時間を更新
    this.trialElapsedTime = (Date.now() - this.trialStartTime) / 1000;

    // AIを更新（試合モードと同じスキップ処理）
    // 1on1接触中はオンボールプレイヤー/ディフェンダーのAI更新をスキップ
    const circlesInContact = this.isCirclesInContact();

    if (this.dribblerAI) {
      if (circlesInContact) {
        const state = this.dribbler.getState();
        if (state !== CharacterState.ON_BALL_PLAYER) {
          this.dribblerAI.update(deltaTime);
        }
        // ON_BALL_PLAYERの場合はスキップ（OneOnOneBattleControllerが制御）
      } else {
        this.dribblerAI.update(deltaTime);
      }
    }

    if (this.defenderAI) {
      if (circlesInContact) {
        const state = this.defender.getState();
        if (state !== CharacterState.ON_BALL_DEFENDER) {
          this.defenderAI.update(deltaTime);
        }
        // ON_BALL_DEFENDERの場合はスキップ（OneOnOneBattleControllerが制御）
      } else {
        this.defenderAI.update(deltaTime);
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

    const dribblerPos = this.dribbler.getPosition();

    // 目標到達チェック
    const distanceToTarget = Vector3.Distance(
      new Vector3(dribblerPos.x, 0, dribblerPos.z),
      this.targetPosition
    );

    if (distanceToTarget <= DRIBBLE_CHECK_DISTANCE.TARGET_REACH_DISTANCE) {
      // 目標に到達
      this.completeTrial({
        trialNumber: this.currentTrialNumber,
        success: true,
        timeToReach: this.trialElapsedTime,
        stealOccurred: false,
        reason: 'reached',
      });
      return;
    }

    // スティールチェック
    // ボールがドリブラーから離れて、飛行中でもなく、ディフェンダーが持っている場合
    const holder = this.ball.getHolder();
    if (holder !== this.dribbler && !this.ball.isInFlight()) {
      // ボールを失った（スティールまたは落とした）
      this.completeTrial({
        trialNumber: this.currentTrialNumber,
        success: false,
        timeToReach: null,
        stealOccurred: true,
        reason: 'steal',
      });
      return;
    }

    // タイムアウトチェック
    if (this.trialElapsedTime >= this.config.timeoutSeconds) {
      this.completeTrial({
        trialNumber: this.currentTrialNumber,
        success: false,
        timeToReach: null,
        stealOccurred: false,
        reason: 'timeout',
      });
      return;
    }

    // 境界外チェック
    if (
      Math.abs(dribblerPos.x) > DRIBBLE_CHECK_DISTANCE.FIELD_HALF_WIDTH + DRIBBLE_CHECK_DISTANCE.OUT_OF_BOUNDS_MARGIN ||
      Math.abs(dribblerPos.z) > DRIBBLE_CHECK_DISTANCE.FIELD_HALF_LENGTH + DRIBBLE_CHECK_DISTANCE.OUT_OF_BOUNDS_MARGIN
    ) {
      this.completeTrial({
        trialNumber: this.currentTrialNumber,
        success: false,
        timeToReach: null,
        stealOccurred: false,
        reason: 'out_of_bounds',
      });
      return;
    }
  }

  /**
   * 試行を完了
   */
  private completeTrial(result: DribbleCheckResult): void {
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

    // 少し遅延を入れて次の試行へ（キャラクターのリセット時間を確保）
    setTimeout(() => {
      if (this.state === 'running') {
        this.startNextTrial();
      }
    }, DRIBBLE_CHECK_TIMING.TRIAL_INTERVAL_DELAY_MS);
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
      });
    }
  }

  /**
   * 進捗コールバックを設定
   */
  public setOnProgressCallback(callback: (progress: DribbleCheckProgress) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * 試行完了コールバックを設定
   */
  public setOnTrialCompleteCallback(callback: (result: DribbleCheckResult) => void): void {
    this.onTrialCompleteCallback = callback;
  }

  /**
   * 完了コールバックを設定
   */
  public setOnCompleteCallback(callback: (results: DribbleCheckResult[]) => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * 現在の状態を取得
   */
  public getState(): DribbleCheckState {
    return this.state;
  }

  /**
   * 結果を取得
   */
  public getResults(): DribbleCheckResult[] {
    return [...this.results];
  }

  /**
   * 統計情報を取得
   */
  public getStatistics(): {
    totalTrials: number;
    successCount: number;
    successRate: number;
    averageTime: number | null;
    stealCount: number;
    timeoutCount: number;
  } {
    const successResults = this.results.filter(r => r.success);
    const successCount = successResults.length;
    const stealCount = this.results.filter(r => r.reason === 'steal').length;
    const timeoutCount = this.results.filter(r => r.reason === 'timeout').length;

    const averageTime = successCount > 0
      ? successResults.reduce((sum, r) => sum + (r.timeToReach ?? 0), 0) / successCount
      : null;

    return {
      totalTrials: this.results.length,
      successCount,
      successRate: this.results.length > 0 ? (successCount / this.results.length) * 100 : 0,
      averageTime,
      stealCount,
      timeoutCount,
    };
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.state = 'idle';
    this.dribblerAI = null;
    this.defenderAI = null;
    this.results = [];
  }
}
