/**
 * リーグ戦システムの型定義
 */

import { OffenseRole, DefenseRole, DefenseScheme } from '@/character-move/state/PlayerStateTypes';

/** リーグ内の選手定義 */
export interface LeaguePlayer {
  playerId: string;
  position: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
  offenseRole: OffenseRole;
  defenseRole: DefenseRole;
  shotPriority: number; // 1-5
}

/** リーグチーム定義 */
export interface LeagueTeam {
  id: number;       // 1-8
  name: string;     // チーム名（例: スターズ）
  abbr: string;     // 略称 3文字（例: STR）
  defenseScheme: DefenseScheme;
  players: LeaguePlayer[];
}

/** 試合結果 */
export interface MatchResult {
  homeScore: number;
  awayScore: number;
  winner: 'home' | 'away';
}

/** 1試合の定義 */
export interface LeagueMatch {
  matchId: number;     // 全試合通しID (0-27)
  round: number;       // 節番号 (0-6)
  homeTeamId: number;
  awayTeamId: number;
  result: MatchResult | null;
}

/** チーム成績 */
export interface TeamStanding {
  teamId: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

/** リーグ全体の状態 */
export interface LeagueState {
  teams: LeagueTeam[];
  matches: LeagueMatch[];
  currentRound: number; // 現在の節 (0-6)
  isComplete: boolean;
  playerTeamId: number; // プレイヤーが操作するチームのID
}

/** 試合開始時にlocalStorageに保存する設定 */
export interface MatchConfig {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
}

/** 試合終了時にlocalStorageに保存する結果 */
export interface MatchResultPayload {
  matchId: number;
  homeScore: number;
  awayScore: number;
  winner: 'home' | 'away';
}
