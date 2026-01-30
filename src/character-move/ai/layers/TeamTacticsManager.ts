/**
 * Layer 3: TeamTacticsManager（チーム戦術）
 * チーム全体の戦術を管理する
 * 外部（戦術ボード等）から設定を受け取り、各キャラクターに指示を提供
 */

import { Character } from "../../entities/Character";
import {
  TeamDirective,
  FieldAnalysis,
  OffenseFormation,
  DefenseScheme,
  OffensePace,
  DEFAULT_TEAM_DIRECTIVE,
} from "../config/AILayerTypes";

/**
 * チーム戦術マネージャー
 * シングルトン的に使用（チームごとに1インスタンス）
 */
export class TeamTacticsManager {
  private team: 'ally' | 'enemy';

  // 現在の戦術設定
  private currentDirective: TeamDirective;

  // プレイコール履歴
  private playHistory: string[] = [];

  // 外部からの設定変更コールバック
  private onDirectiveChangedCallbacks: ((directive: TeamDirective) => void)[] = [];

  constructor(team: 'ally' | 'enemy') {
    this.team = team;
    this.currentDirective = { ...DEFAULT_TEAM_DIRECTIVE };
  }

  /**
   * 現在のチーム指示を取得
   */
  getDirective(): TeamDirective {
    return { ...this.currentDirective };
  }

  /**
   * チーム指示を更新（外部から呼び出し）
   */
  setDirective(directive: Partial<TeamDirective>): void {
    this.currentDirective = {
      ...this.currentDirective,
      ...directive,
    };

    // コールバック呼び出し
    for (const callback of this.onDirectiveChangedCallbacks) {
      callback(this.currentDirective);
    }
  }

  /**
   * オフェンスフォーメーションを設定
   */
  setOffenseFormation(formation: OffenseFormation): void {
    this.setDirective({ offenseFormation: formation });
  }

  /**
   * ディフェンススキームを設定
   */
  setDefenseScheme(scheme: DefenseScheme): void {
    this.setDirective({ defenseScheme: scheme });
  }

  /**
   * オフェンスペースを設定
   */
  setPace(pace: OffensePace): void {
    this.setDirective({ pace });
  }

  /**
   * プライマリオプションを設定（得点を狙う選手のポジション）
   */
  setPrimaryOption(position: string | null): void {
    this.setDirective({ primaryOption: position });
  }

  /**
   * ターゲットミスマッチを設定（狙うべきミスマッチ）
   */
  setTargetMismatch(player: Character | null): void {
    this.setDirective({ targetMismatch: player });
  }

  /**
   * プレイをコール
   */
  callPlay(playName: string): void {
    this.playHistory.push(playName);
    this.setDirective({ playName });
  }

  /**
   * プレイをクリア
   */
  clearPlay(): void {
    this.setDirective({ playName: null });
  }

  /**
   * フィールド分析に基づいて戦術を自動調整（オプション）
   * 外部から明示的に呼び出す場合に使用
   */
  autoAdjustFromFieldAnalysis(analysis: FieldAnalysis): void {
    // ミスマッチがあればターゲット設定
    if (analysis.mismatches.length > 0) {
      const bestMismatch = analysis.mismatches
        .filter(m => m.mismatch === 'offense_advantage')
        .sort((a, b) => b.mismatchScore - a.mismatchScore)[0];

      if (bestMismatch) {
        this.setTargetMismatch(bestMismatch.offensePlayer);
        // ミスマッチの選手をプライマリオプションに
        const position = bestMismatch.offensePlayer.playerData?.basic?.PositionMain;
        if (position) {
          this.setPrimaryOption(position);
        }
      }
    }

    // 速攻チャンスがあればペース変更
    if (analysis.fastBreakOpportunity) {
      this.setPace('fast_break');
    }

    // ペイントが混雑していればアイソレーションを検討
    if (analysis.paintCongestion > 0.7) {
      this.setOffenseFormation('isolation');
    }
  }

  /**
   * ショットクロック戦略を設定
   */
  setShotClockStrategy(strategy: 'normal' | 'attack' | 'hold'): void {
    this.setDirective({ shotClockStrategy: strategy });
  }

  /**
   * トランジション戦略を設定
   */
  setTransitionStrategy(strategy: 'push' | 'setup' | 'careful'): void {
    this.setDirective({ transitionStrategy: strategy });
  }

  /**
   * ヘルプディフェンスレベルを設定
   */
  setHelpDefenseLevel(level: number): void {
    this.setDirective({ helpDefenseLevel: Math.max(0, Math.min(1, level)) });
  }

  /**
   * プレッシャーレベルを設定
   */
  setPressureLevel(level: number): void {
    this.setDirective({ pressureLevel: Math.max(0, Math.min(1, level)) });
  }

  /**
   * 指示変更時のコールバックを登録
   */
  onDirectiveChanged(callback: (directive: TeamDirective) => void): void {
    this.onDirectiveChangedCallbacks.push(callback);
  }

  /**
   * コールバックを解除
   */
  offDirectiveChanged(callback: (directive: TeamDirective) => void): void {
    const index = this.onDirectiveChangedCallbacks.indexOf(callback);
    if (index !== -1) {
      this.onDirectiveChangedCallbacks.splice(index, 1);
    }
  }

  /**
   * プレイ履歴を取得
   */
  getPlayHistory(): string[] {
    return [...this.playHistory];
  }

  /**
   * リセット
   */
  reset(): void {
    this.currentDirective = { ...DEFAULT_TEAM_DIRECTIVE };
    this.playHistory = [];
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo(): {
    team: string;
    directive: TeamDirective;
    recentPlays: string[];
  } {
    return {
      team: this.team,
      directive: this.currentDirective,
      recentPlays: this.playHistory.slice(-5),
    };
  }
}

/**
 * チームごとのマネージャーインスタンスを管理
 */
export class TeamTacticsRegistry {
  private static instance: TeamTacticsRegistry;
  private managers: Map<'ally' | 'enemy', TeamTacticsManager> = new Map();

  private constructor() {
    this.managers.set('ally', new TeamTacticsManager('ally'));
    this.managers.set('enemy', new TeamTacticsManager('enemy'));
  }

  static getInstance(): TeamTacticsRegistry {
    if (!TeamTacticsRegistry.instance) {
      TeamTacticsRegistry.instance = new TeamTacticsRegistry();
    }
    return TeamTacticsRegistry.instance;
  }

  getManager(team: 'ally' | 'enemy'): TeamTacticsManager {
    return this.managers.get(team)!;
  }

  reset(): void {
    this.managers.get('ally')!.reset();
    this.managers.get('enemy')!.reset();
  }
}
