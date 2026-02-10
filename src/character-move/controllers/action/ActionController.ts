import { Vector3 } from "@babylonjs/core";
import {
  ActionType,
  ActionPhase,
  ActionState,
  ActionDefinition,
  ACTION_DEFINITIONS,
  ActionConfigUtils,
  HitboxConfig,
  ACTION_MOTIONS,
} from "../../config/action/ActionConfig";
import { Character } from "../../entities/Character";
import { BalanceController } from "../BalanceController";

/**
 * アクション実行結果
 */
export interface ActionResult {
  success: boolean;
  message: string;
  interrupted?: boolean;  // 他のアクションによって中断されたか
}

/**
 * アクションイベントコールバック
 */
export interface ActionCallbacks {
  onStartup?: (action: ActionType) => void;
  onActive?: (action: ActionType) => void;
  onComplete?: (action: ActionType) => void;
  onInterrupt?: (action: ActionType, interruptedBy: ActionType) => void;
}

/**
 * アクションコントローラー
 *
 * キャラクターのアクション状態を管理し、タイミング制御を行う
 *
 * ※ 硬直（recovery）とクールタイム（cooldown）は重心システムに置き換え済み
 *   - アクション終了時に重心に力が加わる
 *   - 重心が安定位置に戻るまで次のアクションは実行不可
 *   - 選手の体重・身長により自然な回復時間が決まる
 */
export class ActionController {
  private character: Character;
  private state: ActionState;
  private callbacks: ActionCallbacks;
  private balanceController: BalanceController | null = null;

  constructor(character: Character) {
    this.character = character;
    this.state = {
      currentAction: null,
      phase: 'idle',
      phaseStartTime: 0,
    };
    this.callbacks = {};
  }

  /**
   * BalanceControllerを設定
   */
  public setBalanceController(balanceController: BalanceController): void {
    this.balanceController = balanceController;
  }

  /**
   * コールバックを設定
   */
  public setCallbacks(callbacks: ActionCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 現在のアクション状態を取得
   */
  public getState(): ActionState {
    return { ...this.state };
  }

  /**
   * 現在のアクションタイプを取得
   */
  public getCurrentAction(): ActionType | null {
    return this.state.currentAction;
  }

  /**
   * 現在のフェーズを取得
   */
  public getCurrentPhase(): ActionPhase {
    return this.state.phase;
  }

  /**
   * アクションを実行可能か判定
   *
   * 重心システムにより、重心が安定していなければ実行不可
   */
  public canPerformAction(type: ActionType): boolean {
    // 重心システムによるチェック
    if (this.balanceController) {
      if (!this.balanceController.canPerformAction(type)) {
        return false;
      }
    }

    // 現在のアクションがある場合
    if (this.state.currentAction !== null) {
      const currentDef = ACTION_DEFINITIONS[this.state.currentAction];
      const newDef = ACTION_DEFINITIONS[type];

      // startup中かつinterruptibleなら割り込み可能
      if (this.state.phase === 'startup' && currentDef.interruptible) {
        // 新アクションの優先度が高い場合のみ
        return newDef.priority > currentDef.priority;
      }

      // それ以外は実行不可
      return false;
    }

    return true;
  }

  /**
   * アクションを開始
   */
  public startAction(type: ActionType): ActionResult {
    const now = Date.now();

    // 実行可能かチェック
    if (!this.canPerformAction(type)) {
      // 重心が安定していない
      if (this.balanceController && !this.balanceController.canTransition()) {
        const recoveryTime = this.balanceController.getEstimatedRecoveryTime();
        return {
          success: false,
          message: `重心が安定していません（回復まで約${Math.round(recoveryTime * 1000)}ms）`,
        };
      }

      // ロック中（空中など）
      if (this.balanceController && this.balanceController.isLocked()) {
        return {
          success: false,
          message: '着地するまでアクションを実行できません',
        };
      }

      // 他のアクション中
      if (this.state.currentAction !== null) {
        return {
          success: false,
          message: `他のアクション(${this.state.currentAction})を実行中です`,
        };
      }

      return { success: false, message: 'アクションを実行できません' };
    }

    // 現在のアクションを中断
    if (this.state.currentAction !== null) {
      const interruptedAction = this.state.currentAction;
      this.callbacks.onInterrupt?.(interruptedAction, type);
    }

    // 新しいアクションを開始
    this.state.currentAction = type;
    this.state.phase = 'startup';
    this.state.phaseStartTime = now;

    // 重要: 新しいアクション開始時に古いコールバックをクリア
    this.callbacks = {};

    // モーションを再生
    this.playActionMotion(type);

    return { success: true, message: `${type}を開始しました` };
  }

  /**
   * アクションをキャンセル（startup中のみ）
   */
  public cancelAction(): ActionResult {
    if (this.state.currentAction === null) {
      return { success: false, message: 'キャンセルするアクションがありません' };
    }

    const def = ACTION_DEFINITIONS[this.state.currentAction];

    // startup中かつinterruptibleでなければキャンセル不可
    if (this.state.phase !== 'startup' || !def.interruptible) {
      return {
        success: false,
        message: `${this.state.currentAction}はキャンセルできません（phase: ${this.state.phase}, interruptible: ${def.interruptible}）`,
      };
    }

    const cancelledAction = this.state.currentAction;
    this.resetState();

    return { success: true, message: `${cancelledAction}をキャンセルしました` };
  }

  /**
   * 更新処理（毎フレーム呼び出し）
   */
  public update(_deltaTime: number): void {
    if (this.state.currentAction === null) {
      return;
    }

    const now = Date.now();
    const def = ACTION_DEFINITIONS[this.state.currentAction];
    const elapsed = now - this.state.phaseStartTime;

    switch (this.state.phase) {
      case 'startup':
        if (elapsed >= def.startupTime) {
          this.transitionToActive(now);
        }
        break;

      case 'active':
        // activeTimeが-1（無限）の場合は自動遷移しない
        if (def.activeTime !== -1 && elapsed >= def.activeTime) {
          this.completeAction();
        }
        break;
    }
  }

  /**
   * activeフェーズへ遷移
   */
  private transitionToActive(now: number): void {
    const action = this.state.currentAction!;
    this.state.phase = 'active';
    this.state.phaseStartTime = now;

    // 重心に力を適用（アクション開始時）
    if (this.balanceController) {
      if (action === 'jump_ball') {
        // jump_ball: 選手のjump値で物理力をスケール
        const jumpStat = this.character.playerData?.stats.jump ?? 70;
        const jumpScale = jumpStat / 70;
        this.balanceController.applyActionTypeForceWithScale(action, jumpScale);
      } else {
        this.balanceController.applyActionTypeForce(action);
      }
    }

    if (this.callbacks.onActive) {
      this.callbacks.onActive(action);
    }
  }

  /**
   * アクション完了
   */
  private completeAction(): void {
    const action = this.state.currentAction!;

    this.callbacks.onComplete?.(action);

    this.resetState();
  }

  /**
   * 状態をリセット
   */
  private resetState(): void {
    this.state.currentAction = null;
    this.state.phase = 'idle';
    this.state.phaseStartTime = 0;
  }

  /**
   * アクションを強制終了（activeフェーズの場合のみコールバックを呼ぶ）
   */
  public forceEndAction(): void {
    if (this.state.currentAction !== null && this.state.phase === 'active') {
      this.completeAction();
    }
  }

  /**
   * アクションを強制リセット（フェーズに関わらず即座に終了）
   * 状態遷移時など、アクションを完全にクリアしたい場合に使用
   */
  public forceResetAction(): void {
    // currentActionがなくてもphaseがidleでない場合は異常状態なのでリセット
    if (this.state.currentAction !== null || this.state.phase !== 'idle') {
      this.callbacks = {};  // コールバックもクリア（遅延発火を防止）
      this.resetState();
    }
  }

  /**
   * 重心が安定するまでの推定時間を取得（ミリ秒）
   */
  public getRecoveryRemaining(): number {
    if (!this.balanceController) {
      return 0;
    }
    return this.balanceController.getEstimatedRecoveryTime() * 1000;
  }

  /**
   * 重心が安定しているかどうか（次のアクション可能か）
   */
  public isBalanceStable(): boolean {
    if (!this.balanceController) {
      return true; // BalanceControllerがなければ常に安定
    }
    return this.balanceController.canTransition();
  }

  /**
   * 現在のフェーズの経過時間を取得（ミリ秒）
   */
  public getPhaseElapsedTime(): number {
    if (this.state.currentAction === null) {
      return 0;
    }
    return Date.now() - this.state.phaseStartTime;
  }

  /**
   * 現在のフェーズの進行率を取得（0.0 - 1.0）
   */
  public getPhaseProgress(): number {
    if (this.state.currentAction === null) {
      return 0;
    }

    const def = ACTION_DEFINITIONS[this.state.currentAction];
    const elapsed = this.getPhaseElapsedTime();

    switch (this.state.phase) {
      case 'startup':
        return Math.min(1, elapsed / def.startupTime);
      case 'active':
        if (def.activeTime === -1) return 0; // 無限の場合は0を返す
        return Math.min(1, elapsed / def.activeTime);
      default:
        return 0;
    }
  }

  /**
   * ヒットボックス情報を取得（activeフェーズ中のみ）
   */
  public getActiveHitbox(): { config: HitboxConfig; worldPosition: Vector3 } | null {
    if (this.state.currentAction === null || this.state.phase !== 'active') {
      return null;
    }

    const def = ACTION_DEFINITIONS[this.state.currentAction];
    if (!def.hitbox) {
      return null;
    }

    // キャラクターの位置と回転からワールド座標を計算
    const characterPos = this.character.getPosition();
    const rotation = this.character.getRotation();

    // オフセットを回転させてワールド座標に変換
    const offset = def.hitbox.offset;
    const rotatedOffsetX = offset.x * Math.cos(rotation) - offset.z * Math.sin(rotation);
    const rotatedOffsetZ = offset.x * Math.sin(rotation) + offset.z * Math.cos(rotation);

    const worldPosition = new Vector3(
      characterPos.x + rotatedOffsetX,
      characterPos.y + offset.y,
      characterPos.z + rotatedOffsetZ
    );

    return {
      config: def.hitbox,
      worldPosition,
    };
  }

  /**
   * アクションのモーションを再生
   */
  private playActionMotion(type: ActionType): void {
    const motionData = ACTION_MOTIONS[type];
    if (!motionData) {
      return;
    }

    const motionController = this.character.getMotionController();
    if (!motionController) {
      return;
    }

    // block_shot / jump_ball の場合、jumpパラメーターに基づいてスケールと速度を調整
    if (type === 'block_shot' || type === 'jump_ball') {
      const jumpStat = this.character.playerData?.stats.jump ?? 70;
      const baseJump = 70; // 基準値

      // ジャンプ高さスケール: jump / 70 （jump=70で1.0、jump=100で1.43、jump=50で0.71）
      const heightScale = jumpStat / baseJump;

      // モーション速度: ジャンプが高いほど速くなる（物理的に正しい）
      // sqrt(jump / 70) で計算（jump=70で1.0、jump=100で1.19、jump=50で0.85）
      const motionSpeed = Math.sqrt(jumpStat / baseJump);

      // スケール付きでモーション再生
      motionController.playWithScale(motionData, heightScale, motionSpeed, 0.1);
      return;
    }

    // 通常のモーション再生（ブレンド時間0.1秒）
    motionController.play(motionData, 1.0, 0.1);
  }

  /**
   * アクションがアクティブ（判定有効）かどうか
   */
  public isActionActive(type?: ActionType): boolean {
    if (this.state.phase !== 'active') {
      return false;
    }

    if (type !== undefined) {
      return this.state.currentAction === type;
    }

    return true;
  }

  /**
   * シュートアクション後に重心が不安定かどうか
   * （ボールに触れても保持できない状態を判定）
   */
  public isInShootRecovery(): boolean {
    // 現在シュートアクション実行中
    if (this.state.currentAction !== null &&
        ActionConfigUtils.isShootAction(this.state.currentAction)) {
      return true;
    }

    // シュート後で重心が安定していない
    if (!this.isBalanceStable()) {
      return true;
    }

    return false;
  }

  /**
   * シュートアクションがstartup中かどうか
   */
  public isShootInStartup(): boolean {
    if (this.state.currentAction === null || this.state.phase !== 'startup') {
      return false;
    }
    return ActionConfigUtils.isShootAction(this.state.currentAction);
  }

  /**
   * シュートアクションをブロックで中断
   */
  public interruptShootByBlock(): boolean {
    if (!this.isShootInStartup()) {
      return false;
    }

    const def = ACTION_DEFINITIONS[this.state.currentAction!];
    if (!def.interruptible) {
      return false;
    }

    const interruptedAction = this.state.currentAction!;
    this.callbacks.onInterrupt?.(interruptedAction, 'block_shot');
    this.resetState();

    return true;
  }

  /**
   * 現在実行中のアクション定義を取得
   */
  public getCurrentActionDefinition(): ActionDefinition | null {
    if (this.state.currentAction === null) {
      return null;
    }
    return ACTION_DEFINITIONS[this.state.currentAction];
  }

  /**
   * 重心の安定度を取得（0-1、1が完全に安定）
   */
  public getBalanceStability(): number {
    if (!this.balanceController) {
      return 1;
    }
    return this.balanceController.getStability();
  }

  /**
   * 推定回復時間を取得（秒）
   */
  public getEstimatedRecoveryTime(): number {
    if (!this.balanceController) {
      return 0;
    }
    return this.balanceController.getEstimatedRecoveryTime();
  }
}
