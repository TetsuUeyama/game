import { Character } from "../entities/Character";
import { MotionConfig } from "../types/MotionTypes";

/**
 * モーション管理クラス
 * 複数のモーションを登録・管理し、適切な切り替えを行う
 */
export class MotionManager {
  private character: Character;
  private motions: Map<string, MotionConfig>; // モーション名 -> 設定
  private defaultMotionName: string | null = null;

  constructor(character: Character) {
    this.character = character;
    this.motions = new Map();
  }

  /**
   * モーションを登録
   */
  public registerMotion(config: MotionConfig): void {
    const name = config.motionData.name;
    this.motions.set(name, config);

    // デフォルトモーションとして設定されている場合
    if (config.isDefault) {
      this.defaultMotionName = name;
    }
  }

  /**
   * 複数のモーションを一括登録
   */
  public registerMotions(configs: MotionConfig[]): void {
    for (const config of configs) {
      this.registerMotion(config);
    }
  }

  /**
   * モーションを再生
   * @param motionName モーション名
   * @param force 強制的に再生するか（現在のモーションが中断不可でも上書き）
   */
  public play(motionName: string, force: boolean = false): boolean {
    const config = this.motions.get(motionName);
    if (!config) {
      console.warn(`[MotionManager] モーション "${motionName}" が見つかりません`);
      return false;
    }

    const currentMotion = this.character.getCurrentMotionName();

    // 既に同じモーションが再生中の場合は何もしない
    if (currentMotion === motionName) {
      return true;
    }

    // モーションが再生中の場合のみ中断不可チェックを行う
    // 再生終了している場合は、interruptibleに関わらず切り替え可能
    const isCurrentlyPlaying = this.character.isPlayingMotion();

    if (!force && currentMotion && isCurrentlyPlaying) {
      // 現在のモーションが中断不可で、forceがfalseの場合は切り替えない
      const currentConfig = this.motions.get(currentMotion);
      if (currentConfig && currentConfig.interruptible === false) {
        return false;
      }
    }

    // ブレンド時間を取得（デフォルト: 0.3秒）
    const blendDuration = config.blendDuration ?? 0.3;

    // モーションを再生
    this.character.playMotion(config.motionData, 1.0, blendDuration);
    return true;
  }

  /**
   * デフォルトモーションに戻る
   */
  public playDefault(): boolean {
    if (!this.defaultMotionName) {
      console.warn("[MotionManager] デフォルトモーションが設定されていません");
      return false;
    }

    return this.play(this.defaultMotionName);
  }

  /**
   * 位置オフセットをスケールしてモーションを再生
   * @param motionName モーション名
   * @param positionScale 位置オフセットのスケール（1.0が標準）
   */
  public playWithPositionScale(motionName: string, positionScale: number): boolean {
    const config = this.motions.get(motionName);
    if (!config) {
      console.warn(`[MotionManager] モーション "${motionName}" が見つかりません`);
      return false;
    }

    const currentMotion = this.character.getCurrentMotionName();

    // 既に同じモーションが再生中の場合は何もしない
    if (currentMotion === motionName) {
      return true;
    }

    // モーションが再生中の場合のみ中断不可チェックを行う
    const isCurrentlyPlaying = this.character.isPlayingMotion();

    if (currentMotion && isCurrentlyPlaying) {
      const currentConfig = this.motions.get(currentMotion);
      if (currentConfig && currentConfig.interruptible === false) {
        return false;
      }
    }

    // ブレンド時間を取得
    const blendDuration = config.blendDuration ?? 0.3;

    // モーションを再生（スケール付き）
    this.character.playMotionWithScale(config.motionData, positionScale, 1.0, blendDuration);
    return true;
  }

  /**
   * 現在のモーション名を取得
   */
  public getCurrentMotionName(): string | null {
    return this.character.getCurrentMotionName();
  }

  /**
   * デフォルトモーション名を取得
   */
  public getDefaultMotionName(): string | null {
    return this.defaultMotionName;
  }

  /**
   * 更新処理
   * loop: falseのモーションが終了したら自動的にデフォルトモーションに戻る
   */
  public update(): void {
    // アクション実行中はデフォルトモーションへの復帰をスキップ
    const actionController = this.character.getActionController();
    if (actionController && actionController.getCurrentAction() !== null) {
      return;
    }

    // モーションが終了していて、デフォルトモーションが設定されている場合
    if (!this.character.isPlayingMotion()) {
      const currentMotionName = this.getCurrentMotionName();
      // デフォルトモーション以外が終了した場合、デフォルトモーションに戻る
      if (currentMotionName !== this.defaultMotionName && this.defaultMotionName) {
        this.playDefault();
      }
    }
  }

  /**
   * モーションが登録されているかチェック
   */
  public hasMotion(motionName: string): boolean {
    return this.motions.has(motionName);
  }

  /**
   * 登録されているすべてのモーション名を取得
   */
  public getMotionNames(): string[] {
    return Array.from(this.motions.keys());
  }

  /**
   * モーション設定を取得
   */
  public getMotionConfig(motionName: string): MotionConfig | undefined {
    return this.motions.get(motionName);
  }
}
