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
} from "../config/ActionConfig";
import { Character } from "../entities/Character";

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
  onRecovery?: (action: ActionType) => void;
  onComplete?: (action: ActionType) => void;
  onInterrupt?: (action: ActionType, interruptedBy: ActionType) => void;
}

/**
 * アクションコントローラー
 * キャラクターのアクション状態を管理し、タイミング制御を行う
 */
export class ActionController {
  private character: Character;
  private state: ActionState;
  private callbacks: ActionCallbacks;

  constructor(character: Character) {
    this.character = character;
    this.state = {
      currentAction: null,
      phase: 'idle',
      phaseStartTime: 0,
      cooldowns: new Map(),
    };
    this.callbacks = {};
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
    return { ...this.state, cooldowns: new Map(this.state.cooldowns) };
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
   */
  public canPerformAction(type: ActionType): boolean {
    const now = Date.now();

    // クールダウン中かチェック
    const cooldownEnd = this.state.cooldowns.get(type) ?? 0;
    if (now < cooldownEnd) {
      return false;
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
      // クールダウン中かチェック
      const cooldownEnd = this.state.cooldowns.get(type) ?? 0;
      if (now < cooldownEnd) {
        const remaining = cooldownEnd - now;
        return {
          success: false,
          message: `クールダウン中です（残り${remaining}ms）`,
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
    // これにより、前のアクションのコールバックが誤って呼ばれることを防ぐ
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
          this.transitionToRecovery(now);
        }
        break;

      case 'recovery':
        if (elapsed >= def.recoveryTime) {
          this.completeAction(now, def);
        }
        break;
    }

    // クールダウンの期限切れをクリーンアップ
    this.cleanupCooldowns(now);
  }

  /**
   * activeフェーズへ遷移
   */
  private transitionToActive(now: number): void {
    const action = this.state.currentAction!;
    this.state.phase = 'active';
    this.state.phaseStartTime = now;
    if (this.callbacks.onActive) {
      this.callbacks.onActive(action);
    }
  }

  /**
   * recoveryフェーズへ遷移
   */
  private transitionToRecovery(now: number): void {
    const action = this.state.currentAction!;
    this.state.phase = 'recovery';
    this.state.phaseStartTime = now;
    this.callbacks.onRecovery?.(action);
  }

  /**
   * アクション完了
   */
  private completeAction(now: number, def: ActionDefinition): void {
    const action = this.state.currentAction!;

    // クールダウンを設定
    if (def.cooldownTime > 0) {
      this.state.cooldowns.set(action, now + def.cooldownTime);
    }

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
   * アクションを強制終了（recoveryに移行）
   */
  public forceEndAction(): void {
    if (this.state.currentAction !== null && this.state.phase === 'active') {
      this.transitionToRecovery(Date.now());
    }
  }

  /**
   * クールダウンの残り時間を取得（ミリ秒）
   */
  public getCooldownRemaining(type: ActionType): number {
    const now = Date.now();
    const cooldownEnd = this.state.cooldowns.get(type) ?? 0;
    return Math.max(0, cooldownEnd - now);
  }

  /**
   * クールダウン中かどうか
   */
  public isOnCooldown(type: ActionType): boolean {
    return this.getCooldownRemaining(type) > 0;
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
      case 'recovery':
        return Math.min(1, elapsed / def.recoveryTime);
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
   * 期限切れのクールダウンをクリーンアップ
   */
  private cleanupCooldowns(now: number): void {
    for (const [action, endTime] of this.state.cooldowns.entries()) {
      if (now >= endTime) {
        this.state.cooldowns.delete(action);
      }
    }
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

    // block_shotの場合、jumpパラメーターに基づいてスケールと速度を調整
    if (type === 'block_shot') {
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
   * シュートアクションの硬直中（recovery）かどうか
   */
  public isShootInRecovery(): boolean {
    if (this.state.currentAction === null || this.state.phase !== 'recovery') {
      return false;
    }
    return ActionConfigUtils.isShootAction(this.state.currentAction);
  }

  /**
   * シュートアクションのクールダウン中かどうか
   */
  public isShootOnCooldown(): boolean {
    const now = Date.now();
    // 全てのシュートアクションのクールダウンをチェック
    const shootActions: ActionType[] = ['shoot_3pt', 'shoot_midrange', 'shoot_layup'];
    for (const action of shootActions) {
      const cooldownEnd = this.state.cooldowns.get(action) ?? 0;
      if (now < cooldownEnd) {
        return true;
      }
    }
    return false;
  }

  /**
   * シュートアクションの硬直中またはクールダウン中かどうか
   * ボールに触れても保持できない状態を判定
   */
  public isInShootRecoveryOrCooldown(): boolean {
    return this.isShootInRecovery() || this.isShootOnCooldown();
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
}
