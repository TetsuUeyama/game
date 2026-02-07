/**
 * チーム設定ローダー
 * teamConfig.jsonからチーム構成と選手割り当てを読み込む
 */

import { OffenseRole, DefenseRole, DefenseScheme } from "../state/PlayerStateTypes";

export interface PlayerConfig {
  playerId: string;
  position: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
  x: number;
  z: number;
  /** AIで動くかどうか（省略時はtrue） */
  hasAI?: boolean;
  /** オフェンス時の役割（省略時はnull） */
  offenseRole?: OffenseRole;
  /** ディフェンス時の役割（省略時はnull） */
  defenseRole?: DefenseRole;
  /** シュート優先度（1=ファーストチョイス〜5=フィフスチョイス） */
  shotPriority?: number;
}

export interface TeamConfig {
  formation: string;
  players: PlayerConfig[];
  /** チーム守備スキーム（省略時はDROP） */
  defenseScheme?: DefenseScheme;
}

export interface GameTeamConfig {
  allyTeam: TeamConfig;
  enemyTeam: TeamConfig;
}

export class TeamConfigLoader {
  /**
   * チーム設定を読み込む
   * @param configPath 設定ファイルのパス（デフォルト: /data/teamConfig.json）
   */
  public static async loadTeamConfig(configPath: string = '/data/teamConfig.json'): Promise<GameTeamConfig> {
    try {
      const response = await fetch(configPath);

      if (!response.ok) {
        throw new Error(`チーム設定の読み込みに失敗しました: ${response.statusText}`);
      }

      const config: GameTeamConfig = await response.json();

      return config;
    } catch (error) {
      console.error('[TeamConfigLoader] チーム設定の読み込みに失敗:', error);
      throw error;
    }
  }
}
