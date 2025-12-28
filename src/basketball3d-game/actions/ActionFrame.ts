/**
 * アクションのフレーム段階
 */
export enum ActionPhase {
  STARTUP = "STARTUP",       // 待機（発生前の硬直）
  WINDUP = "WINDUP",         // 構え（モーションの準備）
  ACTIVE = "ACTIVE",         // 発生（実際の効果が発動）
  RECOVERY = "RECOVERY",     // フォロースルー（硬直・後隙）
  COMPLETED = "COMPLETED",   // 完了
}

/**
 * アクションのフレームデータ
 */
export interface ActionFrameData {
  startup: number;   // 待機フレーム数
  windup: number;    // 構えフレーム数
  active: number;    // 発生フレーム数
  recovery: number;  // フォロースルーフレーム数
}

/**
 * アクションのフレーム状態を管理するクラス
 */
export class ActionFrameState {
  private currentPhase: ActionPhase;
  private currentFrame: number;
  private readonly frameData: ActionFrameData;
  private readonly totalFrames: number;

  constructor(frameData: ActionFrameData) {
    this.frameData = frameData;
    this.currentPhase = ActionPhase.STARTUP;
    this.currentFrame = 0;
    this.totalFrames = frameData.startup + frameData.windup + frameData.active + frameData.recovery;
  }

  /**
   * フレームを進める
   * @param deltaTime デルタタイム（秒）
   * @param fps フレームレート（デフォルト: 60fps）
   * @returns アクションが完了したか
   */
  advance(deltaTime: number, fps: number = 60): boolean {
    // デルタタイムをフレーム数に変換
    const framesToAdvance = deltaTime * fps;
    this.currentFrame += framesToAdvance;

    // 現在のフレーム数に基づいて段階を更新
    this.updatePhase();

    // アクションが完了したか
    return this.currentPhase === ActionPhase.COMPLETED;
  }

  /**
   * 現在のフレーム数に基づいて段階を更新
   */
  private updatePhase(): void {
    if (this.currentFrame >= this.totalFrames) {
      this.currentPhase = ActionPhase.COMPLETED;
      return;
    }

    let frameThreshold = 0;

    // STARTUP段階
    frameThreshold += this.frameData.startup;
    if (this.currentFrame < frameThreshold) {
      this.currentPhase = ActionPhase.STARTUP;
      return;
    }

    // WINDUP段階
    frameThreshold += this.frameData.windup;
    if (this.currentFrame < frameThreshold) {
      this.currentPhase = ActionPhase.WINDUP;
      return;
    }

    // ACTIVE段階
    frameThreshold += this.frameData.active;
    if (this.currentFrame < frameThreshold) {
      this.currentPhase = ActionPhase.ACTIVE;
      return;
    }

    // RECOVERY段階
    this.currentPhase = ActionPhase.RECOVERY;
  }

  /**
   * 現在の段階を取得
   */
  getCurrentPhase(): ActionPhase {
    return this.currentPhase;
  }

  /**
   * 現在のフレーム数を取得
   */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /**
   * 総フレーム数を取得
   */
  getTotalFrames(): number {
    return this.totalFrames;
  }

  /**
   * アクションが完了したか
   */
  isCompleted(): boolean {
    return this.currentPhase === ActionPhase.COMPLETED;
  }

  /**
   * 現在の段階が指定した段階か
   */
  isInPhase(phase: ActionPhase): boolean {
    return this.currentPhase === phase;
  }

  /**
   * ACTIVE段階（攻撃発生中）か
   */
  isActive(): boolean {
    return this.currentPhase === ActionPhase.ACTIVE;
  }

  /**
   * アクションを実行できる段階か（STARTUP終了後）
   */
  canTakeEffect(): boolean {
    return this.currentPhase === ActionPhase.WINDUP ||
           this.currentPhase === ActionPhase.ACTIVE ||
           this.currentPhase === ActionPhase.RECOVERY;
  }

  /**
   * 現在の段階における進行率（0.0 〜 1.0）
   */
  getPhaseProgress(): number {
    let phaseStartFrame = 0;
    let phaseDuration = 0;

    switch (this.currentPhase) {
      case ActionPhase.STARTUP:
        phaseStartFrame = 0;
        phaseDuration = this.frameData.startup;
        break;
      case ActionPhase.WINDUP:
        phaseStartFrame = this.frameData.startup;
        phaseDuration = this.frameData.windup;
        break;
      case ActionPhase.ACTIVE:
        phaseStartFrame = this.frameData.startup + this.frameData.windup;
        phaseDuration = this.frameData.active;
        break;
      case ActionPhase.RECOVERY:
        phaseStartFrame = this.frameData.startup + this.frameData.windup + this.frameData.active;
        phaseDuration = this.frameData.recovery;
        break;
      case ActionPhase.COMPLETED:
        return 1.0;
    }

    if (phaseDuration === 0) {
      return 1.0;
    }

    const frameInPhase = this.currentFrame - phaseStartFrame;
    return Math.min(1.0, frameInPhase / phaseDuration);
  }

  /**
   * 状態をリセット
   */
  reset(): void {
    this.currentPhase = ActionPhase.STARTUP;
    this.currentFrame = 0;
  }
}
