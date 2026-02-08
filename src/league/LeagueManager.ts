/**
 * リーグ状態管理（localStorage読み書き）
 */

import type {
  LeagueState,
  LeagueMatch,
  MatchConfig,
  MatchResultPayload,
  TeamStanding,
  LeagueTeam,
} from './types';
import { LEAGUE_TEAMS } from './leagueTeams';
import { generateRoundRobinSchedule } from './roundRobinScheduler';
import type { GameTeamConfig } from '@/character-move/loaders/TeamConfigLoader';

const STORAGE_KEY_LEAGUE = 'basketball_league_state';
const STORAGE_KEY_MATCH_CONFIG = 'basketball_match_config';
const STORAGE_KEY_MATCH_RESULT = 'basketball_match_result';

export class LeagueManager {
  // ---- localStorage 操作 ----

  /** リーグ状態を保存 */
  static saveLeagueState(state: LeagueState): void {
    localStorage.setItem(STORAGE_KEY_LEAGUE, JSON.stringify(state));
  }

  /** リーグ状態を読み込み（なければnull） */
  static loadLeagueState(): LeagueState | null {
    const raw = localStorage.getItem(STORAGE_KEY_LEAGUE);
    if (!raw) return null;
    return JSON.parse(raw) as LeagueState;
  }

  /** リーグ状態を削除 */
  static clearLeagueState(): void {
    localStorage.removeItem(STORAGE_KEY_LEAGUE);
    localStorage.removeItem(STORAGE_KEY_MATCH_CONFIG);
    localStorage.removeItem(STORAGE_KEY_MATCH_RESULT);
  }

  // ---- 試合設定 ----

  /** 試合開始用設定をlocalStorageに保存 */
  static saveMatchConfig(config: MatchConfig): void {
    localStorage.setItem(STORAGE_KEY_MATCH_CONFIG, JSON.stringify(config));
  }

  /** 試合開始用設定を読み込み */
  static loadMatchConfig(): MatchConfig | null {
    const raw = localStorage.getItem(STORAGE_KEY_MATCH_CONFIG);
    if (!raw) return null;
    return JSON.parse(raw) as MatchConfig;
  }

  /** 試合設定をクリア */
  static clearMatchConfig(): void {
    localStorage.removeItem(STORAGE_KEY_MATCH_CONFIG);
  }

  // ---- 試合結果 ----

  /** 試合結果をlocalStorageに保存 */
  static saveMatchResult(result: MatchResultPayload): void {
    localStorage.setItem(STORAGE_KEY_MATCH_RESULT, JSON.stringify(result));
  }

  /** 試合結果を読み込み（消費: 読んだら削除） */
  static consumeMatchResult(): MatchResultPayload | null {
    const raw = localStorage.getItem(STORAGE_KEY_MATCH_RESULT);
    if (!raw) return null;
    localStorage.removeItem(STORAGE_KEY_MATCH_RESULT);
    return JSON.parse(raw) as MatchResultPayload;
  }

  // ---- リーグ作成・進行 ----

  /** 新しいリーグを作成 */
  static createLeague(): LeagueState {
    const teamIds = LEAGUE_TEAMS.map(t => t.id);
    const matches = generateRoundRobinSchedule(teamIds);

    const state: LeagueState = {
      teams: LEAGUE_TEAMS,
      matches,
      currentRound: 0,
      isComplete: false,
    };

    this.saveLeagueState(state);
    return state;
  }

  /** 試合結果をリーグに反映 */
  static applyMatchResult(state: LeagueState, result: MatchResultPayload): LeagueState {
    const updated = { ...state, matches: [...state.matches] };

    const idx = updated.matches.findIndex(m => m.matchId === result.matchId);
    if (idx === -1) return state;

    updated.matches[idx] = {
      ...updated.matches[idx],
      result: {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winner: result.winner,
      },
    };

    // 現在の節の全試合が完了したか確認
    const currentRoundMatches = updated.matches.filter(m => m.round === updated.currentRound);
    const allComplete = currentRoundMatches.every(m => m.result !== null);

    if (allComplete) {
      if (updated.currentRound < 6) {
        updated.currentRound = updated.currentRound + 1;
      } else {
        updated.isComplete = true;
      }
    }

    this.saveLeagueState(updated);
    return updated;
  }

  // ---- 順位表 ----

  /** チーム成績を計算 */
  static calcStandings(state: LeagueState): TeamStanding[] {
    const map = new Map<number, TeamStanding>();
    for (const team of state.teams) {
      map.set(team.id, {
        teamId: team.id,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      });
    }

    for (const match of state.matches) {
      if (!match.result) continue;
      const home = map.get(match.homeTeamId)!;
      const away = map.get(match.awayTeamId)!;

      home.pointsFor += match.result.homeScore;
      home.pointsAgainst += match.result.awayScore;
      away.pointsFor += match.result.awayScore;
      away.pointsAgainst += match.result.homeScore;

      if (match.result.winner === 'home') {
        home.wins++;
        away.losses++;
      } else {
        away.wins++;
        home.losses++;
      }
    }

    // 得失点差を計算
    for (const s of map.values()) {
      s.pointDiff = s.pointsFor - s.pointsAgainst;
    }

    // ソート: 勝数降順 → 得失点差降順
    return [...map.values()].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointDiff - a.pointDiff;
    });
  }

  // ---- 星取表用 ----

  /** 星取表データ: team[i] vs team[j] の結果を取得 */
  static getHeadToHead(
    state: LeagueState,
    teamAId: number,
    teamBId: number,
  ): { result: 'win' | 'loss' | null; score?: string } {
    const match = state.matches.find(
      m =>
        (m.homeTeamId === teamAId && m.awayTeamId === teamBId) ||
        (m.homeTeamId === teamBId && m.awayTeamId === teamAId),
    );

    if (!match?.result) return { result: null };

    const isHome = match.homeTeamId === teamAId;
    const won = isHome
      ? match.result.winner === 'home'
      : match.result.winner === 'away';

    const myScore = isHome ? match.result.homeScore : match.result.awayScore;
    const oppScore = isHome ? match.result.awayScore : match.result.homeScore;

    return {
      result: won ? 'win' : 'loss',
      score: `${myScore}-${oppScore}`,
    };
  }

  // ---- チーム設定生成 ----

  /** LeagueTeam → GameTeamConfig に変換（既存の teamConfig5on5.json と同じ形式） */
  static buildTeamConfig(homeTeam: LeagueTeam, awayTeam: LeagueTeam): GameTeamConfig {
    // 5on5のデフォルト初期位置
    const homePositions = [
      { x: 0, z: -5 },   // PG
      { x: -5, z: -3 },  // SG
      { x: 5, z: -3 },   // SF
      { x: -3, z: 5 },   // PF
      { x: 0, z: 10 },   // C
    ];
    const awayPositions = [
      { x: 0, z: 5 },    // PG
      { x: -5, z: 3 },   // SG
      { x: 5, z: 3 },    // SF
      { x: 3, z: -5 },   // PF
      { x: 0, z: -10 },  // C
    ];

    return {
      allyTeam: {
        formation: '5on5',
        defenseScheme: homeTeam.defenseScheme,
        players: homeTeam.players.map((p, i) => ({
          playerId: p.playerId,
          position: p.position,
          x: homePositions[i].x,
          z: homePositions[i].z,
          hasAI: true,
          offenseRole: p.offenseRole,
          defenseRole: p.defenseRole,
          shotPriority: p.shotPriority,
        })),
      },
      enemyTeam: {
        formation: '5on5',
        defenseScheme: awayTeam.defenseScheme,
        players: awayTeam.players.map((p, i) => ({
          playerId: p.playerId,
          position: p.position,
          x: awayPositions[i].x,
          z: awayPositions[i].z,
          hasAI: true,
          offenseRole: p.offenseRole,
          defenseRole: p.defenseRole,
          shotPriority: p.shotPriority,
        })),
      },
    };
  }

  // ---- ユーティリティ ----

  /** チームIDからチーム情報を取得 */
  static getTeam(teamId: number): LeagueTeam | undefined {
    return LEAGUE_TEAMS.find(t => t.id === teamId);
  }

  /** 指定節の試合一覧を取得 */
  static getRoundMatches(state: LeagueState, round: number): LeagueMatch[] {
    return state.matches.filter(m => m.round === round);
  }
}
