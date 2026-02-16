/**
 * チーム設定ローダー
 * Firestoreからチーム構成と選手割り当てを読み込む
 */

import { OffenseRole, DefenseRole, DefenseScheme } from "@/GamePlay/GameSystem/CharacterMove/State/PlayerStateTypes";
import { fetchDefaultTeamConfig } from "@/GamePlay/Management/Services/UserDataService";

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
   * チーム設定をFirestoreから読み込む
   * @param configKey 設定キー（デフォルト: 'teamConfig1on1'）
   */
  public static async loadTeamConfig(
    configKey: 'teamConfig1on1' | 'teamConfig5on5' = 'teamConfig1on1'
  ): Promise<GameTeamConfig> {
    try {
      const config = await fetchDefaultTeamConfig(configKey);

      if (!config) {
        throw new Error(`チーム設定が見つかりません: ${configKey}`);
      }

      return config;
    } catch (error) {
      console.error('[TeamConfigLoader] チーム設定の読み込みに失敗:', error);
      throw error;
    }
  }
}
