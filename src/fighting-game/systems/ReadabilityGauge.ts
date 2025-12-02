/**
 * ReadabilityGauge - 読みゲージシステム
 *
 * 相手の行動を読む能力を管理するゲージ
 * - 相手が行動するたびに消費される
 * - 同じ行動を続けると消費しにくくなる（読みやすくなる）
 * - 何も行動しないと回復していく
 */
export class ReadabilityGauge {
  private gauge: number = 100; // 0-100
  private maxGauge: number = 100;
  private recentActions: string[] = []; // 直近の行動履歴（最大5件）
  private lastActionTime: number = 0;

  constructor() {
    this.gauge = this.maxGauge;
  }

  /**
   * ゲージ消費（行動するたびに呼ぶ）
   * @param action 行動の種類（例: 'attack-mid', 'jump-large', 'dash-forward'）
   */
  consumeGauge(action: string): void {
    // 同じ行動の連続チェック
    const sameActionCount = this.countRecentSameActions(action);

    // 基礎消費量: 10
    // 同じ行動を続けるほど消費が減る（0.7の累乗）
    // 例: 1回目=10, 2回目=7, 3回目=4.9, 4回目=3.4
    const baseCost = 10;
    const cost = baseCost * Math.pow(0.7, sameActionCount);

    this.gauge = Math.max(0, this.gauge - cost);
    this.lastActionTime = Date.now();

    // 行動履歴に追加（最大5件まで保持）
    this.recentActions.push(action);
    if (this.recentActions.length > 5) {
      this.recentActions.shift();
    }
  }

  /**
   * ゲージ回復（何もしないフレームで呼ぶ）
   * @param deltaTime 前フレームからの経過時間（ミリ秒）
   */
  recover(deltaTime: number): void {
    const recoveryRate = 5; // 1秒あたり5回復
    this.gauge = Math.min(this.maxGauge, this.gauge + recoveryRate * deltaTime / 1000);
  }

  /**
   * 表示レベルを取得
   * @returns 'full' = 大項目+小項目表示, 'major-only' = 大項目のみ, 'hidden' = 全て???
   */
  getDisplayLevel(): 'full' | 'major-only' | 'hidden' {
    if (this.gauge > 60) {
      return 'full'; // 大項目+小項目
    } else if (this.gauge > 30) {
      return 'major-only'; // 大項目のみ
    } else {
      return 'hidden'; // 全て???
    }
  }

  /**
   * 現在のゲージ量を取得
   */
  getGauge(): number {
    return this.gauge;
  }

  /**
   * ゲージの最大値を取得
   */
  getMaxGauge(): number {
    return this.maxGauge;
  }

  /**
   * 直近の同じ行動の連続回数を数える
   */
  private countRecentSameActions(action: string): number {
    let count = 0;
    // 最新から順に同じ行動が続いているか確認
    for (let i = this.recentActions.length - 1; i >= 0; i--) {
      if (this.recentActions[i] === action) {
        count++;
      } else {
        break; // 異なる行動が出たら終了
      }
    }
    return count;
  }

  /**
   * ゲージをリセット
   */
  reset(): void {
    this.gauge = this.maxGauge;
    this.recentActions = [];
    this.lastActionTime = 0;
  }
}
