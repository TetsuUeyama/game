/**
 * ロギングユーティリティ
 *
 * IMPROVEMENT_PLAN.md: フェーズ2 - console.logの削除とロギングフレームワーク導入
 *
 * 目的:
 * - 本番環境でのログ出力を制御
 * - カテゴリ別のログ管理
 * - ログレベルによるフィルタリング
 *
 * 使用例:
 * // 変更前: console.log(`[CharacterAI] 状態遷移: ${oldState} -> ${newState}`);
 * // 変更後: Logger.debug('CharacterAI', `状態遷移: ${oldState} -> ${newState}`);
 */

/**
 * ログレベル
 */
export enum LogLevel {
  DEBUG = 0,   // 詳細なデバッグ情報
  INFO = 1,    // 一般的な情報
  WARN = 2,    // 警告
  ERROR = 3,   // エラー
  NONE = 4,    // ログ出力なし
}

/**
 * ロガーの設定
 */
interface LoggerConfig {
  level: LogLevel;
  enabledCategories: Set<string> | null; // nullの場合は全カテゴリ有効
  disabledCategories: Set<string>;
  showTimestamp: boolean;
  showCategory: boolean;
}

/**
 * ロガークラス
 */
class LoggerClass {
  private config: LoggerConfig = {
    level: LogLevel.WARN, // 本番はWARN以上のみ
    enabledCategories: null,
    disabledCategories: new Set(),
    showTimestamp: false,
    showCategory: true,
  };

  /**
   * ログレベルを設定
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 現在のログレベルを取得
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * 開発モードを有効化（DEBUG以上を出力）
   */
  enableDevMode(): void {
    this.config.level = LogLevel.DEBUG;
    this.config.showTimestamp = true;
  }

  /**
   * 本番モードを有効化（WARN以上のみ出力）
   */
  enableProdMode(): void {
    this.config.level = LogLevel.WARN;
    this.config.showTimestamp = false;
  }

  /**
   * 特定のカテゴリを有効化
   */
  enableCategory(category: string): void {
    if (this.config.enabledCategories === null) {
      this.config.enabledCategories = new Set();
    }
    this.config.enabledCategories.add(category);
    this.config.disabledCategories.delete(category);
  }

  /**
   * 特定のカテゴリを無効化
   */
  disableCategory(category: string): void {
    this.config.disabledCategories.add(category);
    if (this.config.enabledCategories) {
      this.config.enabledCategories.delete(category);
    }
  }

  /**
   * 全カテゴリを有効化
   */
  enableAllCategories(): void {
    this.config.enabledCategories = null;
    this.config.disabledCategories.clear();
  }

  /**
   * カテゴリが有効かどうかをチェック
   */
  private isCategoryEnabled(category: string): boolean {
    if (this.config.disabledCategories.has(category)) {
      return false;
    }
    if (this.config.enabledCategories === null) {
      return true;
    }
    return this.config.enabledCategories.has(category);
  }

  /**
   * ログメッセージをフォーマット
   */
  private formatMessage(category: string, message: string): string {
    const parts: string[] = [];

    if (this.config.showTimestamp) {
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
      parts.push(`[${timestamp}]`);
    }

    if (this.config.showCategory) {
      parts.push(`[${category}]`);
    }

    parts.push(message);

    return parts.join(' ');
  }

  /**
   * DEBUGレベルのログを出力
   */
  debug(category: string, message: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.DEBUG && this.isCategoryEnabled(category)) {
      console.log(this.formatMessage(category, message), ...args);
    }
  }

  /**
   * INFOレベルのログを出力
   */
  info(category: string, message: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.INFO && this.isCategoryEnabled(category)) {
      console.info(this.formatMessage(category, message), ...args);
    }
  }

  /**
   * WARNレベルのログを出力
   */
  warn(category: string, message: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.WARN && this.isCategoryEnabled(category)) {
      console.warn(this.formatMessage(category, message), ...args);
    }
  }

  /**
   * ERRORレベルのログを出力
   */
  error(category: string, message: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.ERROR && this.isCategoryEnabled(category)) {
      console.error(this.formatMessage(category, message), ...args);
    }
  }

  /**
   * グループ化されたログを開始
   */
  group(category: string, label: string): void {
    if (this.config.level <= LogLevel.DEBUG && this.isCategoryEnabled(category)) {
      console.group(this.formatMessage(category, label));
    }
  }

  /**
   * グループ化されたログを終了
   */
  groupEnd(): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.groupEnd();
    }
  }

  /**
   * テーブル形式でログを出力
   */
  table(category: string, data: unknown): void {
    if (this.config.level <= LogLevel.DEBUG && this.isCategoryEnabled(category)) {
      console.table(data);
    }
  }

  /**
   * 時間計測を開始
   */
  time(label: string): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.time(label);
    }
  }

  /**
   * 時間計測を終了
   */
  timeEnd(label: string): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.timeEnd(label);
    }
  }
}

/**
 * シングルトンインスタンス
 */
export const Logger = new LoggerClass();

/**
 * よく使用されるカテゴリ名の定数
 */
export const LogCategory = {
  BALL: 'Ball',
  CHARACTER: 'Character',
  CHARACTER_AI: 'CharacterAI',
  COLLISION: 'CollisionHandler',
  GAME_SCENE: 'GameScene',
  INPUT: 'InputController',
  MOTION: 'MotionController',
  PHYSICS: 'Physics',
  THROW_IN: 'ThrowIn',
  SHOOTING: 'Shooting',
  PASS: 'Pass',
  AI_DECISION: 'AIDecision',
  LOOSE_BALL: 'LooseBall',
} as const;
