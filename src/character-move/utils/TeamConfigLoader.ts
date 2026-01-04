/**
 * チーム設定ローダー
 * teamConfig.jsonからチーム構成と選手割り当てを読み込む
 */

export interface PlayerConfig {
  playerId: string;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  x: number;
  z: number;
}

export interface TeamConfig {
  formation: string;
  players: PlayerConfig[];
}

export interface GameTeamConfig {
  allyTeam: TeamConfig;
  enemyTeam: TeamConfig;
}

export class TeamConfigLoader {
  /**
   * チーム設定を読み込む
   */
  public static async loadTeamConfig(): Promise<GameTeamConfig> {
    console.log('[TeamConfigLoader] チーム設定を読み込み中...');

    try {
      const response = await fetch('/data/teamConfig.json');

      if (!response.ok) {
        throw new Error(`チーム設定の読み込みに失敗しました: ${response.statusText}`);
      }

      const config: GameTeamConfig = await response.json();

      console.log('[TeamConfigLoader] チーム設定を読み込みました');
      console.log('[TeamConfigLoader] 味方チーム:', config.allyTeam.formation, `(${config.allyTeam.players.length}人)`);
      console.log('[TeamConfigLoader] 敵チーム:', config.enemyTeam.formation, `(${config.enemyTeam.players.length}人)`);

      return config;
    } catch (error) {
      console.error('[TeamConfigLoader] チーム設定の読み込みに失敗:', error);
      throw error;
    }
  }
}
