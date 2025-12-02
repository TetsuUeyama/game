/**
 * ActionIntent - 行動意図表示システム
 *
 * これから行う行動を表示し、相手の判断材料にする
 * 読みゲージの状態に応じて表示内容が変化する
 */

// 大項目（大まかな行動カテゴリ）
export type MajorAction = 'attack' | 'move' | 'dash' | 'jump' | 'guard' | 'idle';

// 小項目（詳細な行動内容）
export type MinorAction =
  // 攻撃
  | 'high-attack' | 'mid-attack' | 'low-attack'
  | 'special1' | 'special2' | 'super-special'
  | 'antiair-attack' | 'air-attack'
  // 移動
  | 'walk-forward' | 'walk-backward' | 'retreat'
  // ダッシュ
  | 'forward-dash' | 'backward-dash'
  // ジャンプ
  | 'small-jump' | 'medium-jump' | 'large-jump'
  | 'forward-jump' | 'back-jump' | 'vertical-jump'
  // ガード
  | 'high-guard' | 'mid-guard' | 'low-guard'
  | 'highmid-guard' | 'midlow-guard' | 'all-guard'
  // 待機
  | 'idle';

export interface ActionIntent {
  major: MajorAction;
  minor: MinorAction;
  timestamp: number;
}

export class ActionIntentDisplay {
  private currentIntent: ActionIntent | null = null;

  /**
   * 行動意図を設定
   * @param major 大項目（攻撃、移動、ダッシュ、ジャンプ、ガード、待機）
   * @param minor 小項目（具体的な行動内容）
   */
  setIntent(major: MajorAction, minor: MinorAction): void {
    this.currentIntent = {
      major,
      minor,
      timestamp: Date.now()
    };
  }

  /**
   * 現在の意図を取得
   */
  getCurrentIntent(): ActionIntent | null {
    return this.currentIntent;
  }

  /**
   * 表示用テキストを取得
   * @param opponentReadLevel 相手の読みレベル（'full', 'major-only', 'hidden'）
   * @returns 大項目と小項目のテキスト
   */
  getDisplayText(opponentReadLevel: 'full' | 'major-only' | 'hidden'): {
    major: string;
    minor: string;
  } {
    if (!this.currentIntent) {
      return { major: '---', minor: '---' };
    }

    // 読みゲージが完全に枯渇している場合、全て???
    if (opponentReadLevel === 'hidden') {
      return { major: '???', minor: '???' };
    }

    // 大項目は表示
    const majorText = this.getMajorText(this.currentIntent.major);

    // 小項目は読みレベルが'full'の場合のみ表示
    const minorText = opponentReadLevel === 'full'
      ? this.getMinorText(this.currentIntent.minor)
      : '???';

    return { major: majorText, minor: minorText };
  }

  /**
   * 大項目を日本語テキストに変換
   */
  private getMajorText(action: MajorAction): string {
    const map: Record<MajorAction, string> = {
      'attack': '攻撃',
      'move': '移動',
      'dash': 'ダッシュ',
      'jump': 'ジャンプ',
      'guard': 'ガード',
      'idle': '待機'
    };
    return map[action];
  }

  /**
   * 小項目を日本語テキストに変換
   */
  private getMinorText(action: MinorAction): string {
    const map: Record<MinorAction, string> = {
      // 攻撃
      'high-attack': '上段攻撃',
      'mid-attack': '中段攻撃',
      'low-attack': '下段攻撃',
      'special1': '必殺技1',
      'special2': '必殺技2',
      'super-special': '超必殺技',
      'antiair-attack': '対空攻撃',
      'air-attack': '空中攻撃',
      // 移動
      'walk-forward': '前進',
      'walk-backward': '後退',
      'retreat': '後退',
      // ダッシュ
      'forward-dash': '前ダッシュ',
      'backward-dash': '後ダッシュ',
      // ジャンプ
      'small-jump': '小ジャンプ',
      'medium-jump': '中ジャンプ',
      'large-jump': '大ジャンプ',
      'forward-jump': '前ジャンプ',
      'back-jump': '後ジャンプ',
      'vertical-jump': '垂直ジャンプ',
      // ガード
      'high-guard': '上段ガード',
      'mid-guard': '中段ガード',
      'low-guard': '下段ガード',
      'highmid-guard': '上中ガード',
      'midlow-guard': '中下ガード',
      'all-guard': '全面ガード',
      // 待機
      'idle': '待機'
    };
    return map[action];
  }

  /**
   * 意図をクリア
   */
  clear(): void {
    this.currentIntent = null;
  }
}
